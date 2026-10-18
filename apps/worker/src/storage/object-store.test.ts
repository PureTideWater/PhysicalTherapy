import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalObjectStore } from './local-object-store';
import { ObjectConflictError, ObjectKeyError, requireOpaqueKey, sha256Hex } from './object-store';
import { S3ObjectLockStore } from './s3-object-lock-store';

const KEY = 'audit-events/v1/2026/10/14.jsonl';
const BODY = Buffer.from('{"id":"x"}\n');
const RETAIN = new Date('2033-10-15T00:00:00.000Z');
const request = (body: Uint8Array = BODY, key = KEY) => ({ key, body, contentType: 'application/x-ndjson', retainUntil: RETAIN });

describe('requireOpaqueKey', () => {
  it('accepts opaque keys and refuses keys that could carry PHI, without quoting them', () => {
    expect(requireOpaqueKey(KEY)).toBe(KEY);
    expect(() => requireOpaqueKey('uploads/SMITH_JOHN.835')).toThrow(ObjectKeyError);
    expect(() => requireOpaqueKey('uploads/SMITH_JOHN.835')).not.toThrow(/SMITH/);
    expect(() => requireOpaqueKey('/absolute/key')).toThrow(ObjectKeyError);
    expect(() => requireOpaqueKey('')).toThrow(ObjectKeyError);
  });
});

describe('LocalObjectStore', () => {
  let root = '';
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'object-store-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('writes an object once, read-only, with its retention date, and reports the same bytes as unchanged', async () => {
    const store = new LocalObjectStore(root);
    expect(await store.head(KEY)).toBeNull();
    expect(await store.putImmutable(request())).toBe('written');
    const file = path.join(root, KEY);
    expect(readFileSync(file)).toEqual(BODY);
    expect(statSync(file).mode & 0o222).toBe(0);
    expect(await store.head(KEY)).toEqual({ sha256: sha256Hex(BODY), retainUntil: RETAIN });
    expect(await store.putImmutable(request())).toBe('unchanged');
  });

  it('refuses different bytes under an existing key', async () => {
    const store = new LocalObjectStore(root);
    await store.putImmutable(request());
    await expect(store.putImmutable(request(Buffer.from('tampered\n')))).rejects.toThrow(ObjectConflictError);
    expect(readFileSync(path.join(root, KEY))).toEqual(BODY);
  });

  it('settles a race with another writer by comparing bytes', async () => {
    const store = new LocalObjectStore(root);
    const [first, second] = await Promise.allSettled([store.putImmutable(request()), store.putImmutable(request())]);
    expect([first.status, second.status]).toEqual(['fulfilled', 'fulfilled']);
    const outcomes = [first, second].map((result) => (result.status === 'fulfilled' ? result.value : 'failed')).sort();
    expect(outcomes).toEqual(['unchanged', 'written']);
  });

  it('reads an object whose retention sidecar is missing or unreadable as unlocked', async () => {
    const store = new LocalObjectStore(root);
    await store.putImmutable(request());
    rmSync(path.join(root, `${KEY}.retention.json`), { force: true });
    expect(await store.head(KEY)).toEqual({ sha256: sha256Hex(BODY), retainUntil: null });
    writeFileSync(path.join(root, `${KEY}.retention.json`), '{"retainUntil": 7}');
    expect((await store.head(KEY))?.retainUntil).toBeNull();
  });

  it('refuses keys that are not opaque or that leave the store', async () => {
    const store = new LocalObjectStore(root);
    await expect(store.putImmutable(request(BODY, 'patients/SYNTHETIC-TWIN.json'))).rejects.toThrow(ObjectKeyError);
    await expect(store.head('../outside')).rejects.toThrow(ObjectKeyError);
  });

  it('passes on file-system errors other than a missing file', async () => {
    const store = new LocalObjectStore(root);
    // A directory where the object should be cannot be read as one.
    mkdirSync(path.join(root, 'audit-events/v1/2026/10/16.jsonl'), { recursive: true });
    await expect(store.head('audit-events/v1/2026/10/16.jsonl')).rejects.toMatchObject({ code: 'EISDIR' });
  });
});

describe('S3ObjectLockStore (mocked client)', () => {
  function client(answers: { head?: (command: HeadObjectCommand) => unknown; put?: (command: PutObjectCommand) => unknown }) {
    const sent: unknown[] = [];
    return {
      sent,
      client: {
        send: (command: unknown) => {
          sent.push(command);
          try {
            const answer = command instanceof HeadObjectCommand ? answers.head?.(command) : answers.put?.(command as PutObjectCommand);
            return Promise.resolve(answer ?? {});
          } catch (error) {
            return Promise.reject(error instanceof Error ? error : new Error('failed'));
          }
        },
      } as never,
    };
  }

  const notFound = () => {
    throw Object.assign(new Error('NotFound'), { $metadata: { httpStatusCode: 404 } });
  };

  it('puts a new object once, with its checksum, Object Lock retention and no replacement', async () => {
    const s3 = client({ head: notFound });
    const store = new S3ObjectLockStore({ client: s3.client, bucket: 'audit-copies', lockMode: 'COMPLIANCE' });
    expect(await store.putImmutable(request())).toBe('written');
    const put = s3.sent[1] as PutObjectCommand;
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect(put.input).toEqual({
      Bucket: 'audit-copies',
      Key: KEY,
      Body: BODY,
      ContentType: 'application/x-ndjson',
      ChecksumSHA256: Buffer.from(sha256Hex(BODY), 'hex').toString('base64'),
      Metadata: { sha256: sha256Hex(BODY) },
      IfNoneMatch: '*',
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: RETAIN,
    });
    expect((s3.sent[0] as HeadObjectCommand).input).toEqual({ Bucket: 'audit-copies', Key: KEY, ChecksumMode: 'ENABLED' });
  });

  it('names a customer-managed key only when one is given, and the governance mode for synthetic environments', async () => {
    const s3 = client({ head: notFound });
    await new S3ObjectLockStore({ client: s3.client, bucket: 'b', lockMode: 'GOVERNANCE', kmsKeyId: 'alias/tp-staging' }).putImmutable(request());
    expect((s3.sent[1] as PutObjectCommand).input).toMatchObject({ ObjectLockMode: 'GOVERNANCE', ServerSideEncryption: 'aws:kms', SSEKMSKeyId: 'alias/tp-staging' });
  });

  it('reports the same bytes as unchanged and refuses different bytes, from metadata or the checksum', async () => {
    const sha = sha256Hex(BODY);
    const byMetadata = client({ head: () => ({ Metadata: { sha256: sha }, ObjectLockRetainUntilDate: RETAIN }) });
    const store = new S3ObjectLockStore({ client: byMetadata.client, bucket: 'b', lockMode: 'COMPLIANCE' });
    expect(await store.putImmutable(request())).toBe('unchanged');
    expect(await store.head(KEY)).toEqual({ sha256: sha, retainUntil: RETAIN });
    await expect(store.putImmutable(request(Buffer.from('other')))).rejects.toThrow(ObjectConflictError);
    const byChecksum = client({ head: () => ({ ChecksumSHA256: Buffer.from(sha, 'hex').toString('base64') }) });
    expect(await new S3ObjectLockStore({ client: byChecksum.client, bucket: 'b', lockMode: 'COMPLIANCE' }).head(KEY)).toEqual({ sha256: sha, retainUntil: null });
    const bare = client({ head: () => ({}) });
    expect(await new S3ObjectLockStore({ client: bare.client, bucket: 'b', lockMode: 'COMPLIANCE' }).head(KEY)).toEqual({ sha256: '', retainUntil: null });
  });

  it('compares after losing a race (412), and passes on any other error', async () => {
    let heads = 0;
    const sha = sha256Hex(BODY);
    const raced = client({
      head: () => {
        heads += 1;
        return heads === 1 ? notFound() : { Metadata: { sha256: sha } };
      },
      put: () => {
        throw Object.assign(new Error('PreconditionFailed'), { $metadata: { httpStatusCode: 412 } });
      },
    });
    expect(await new S3ObjectLockStore({ client: raced.client, bucket: 'b', lockMode: 'COMPLIANCE' }).putImmutable(request())).toBe('unchanged');
    const gone = client({
      head: notFound,
      put: () => {
        throw Object.assign(new Error('PreconditionFailed'), { $metadata: { httpStatusCode: 412 } });
      },
    });
    await expect(new S3ObjectLockStore({ client: gone.client, bucket: 'b', lockMode: 'COMPLIANCE' }).putImmutable(request())).rejects.toThrow(ObjectConflictError);
    const denied = client({
      head: () => {
        throw Object.assign(new Error('AccessDenied'), { $metadata: { httpStatusCode: 403 } });
      },
    });
    await expect(new S3ObjectLockStore({ client: denied.client, bucket: 'b', lockMode: 'COMPLIANCE' }).head(KEY)).rejects.toThrow('AccessDenied');
    const broken = client({
      head: notFound,
      put: () => {
        throw new Error('network');
      },
    });
    await expect(new S3ObjectLockStore({ client: broken.client, bucket: 'b', lockMode: 'COMPLIANCE' }).putImmutable(request())).rejects.toThrow('network');
    const odd = client({
      head: () => {
        throw 'not an error object' as unknown as Error;
      },
    });
    await expect(new S3ObjectLockStore({ client: odd.client, bucket: 'b', lockMode: 'COMPLIANCE' }).head(KEY)).rejects.toThrow();
  });
});
