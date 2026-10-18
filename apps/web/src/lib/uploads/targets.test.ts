import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { type HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PracticeCipher, documentObjectKey } from '@tp/db';
import { assertNoPhi, s3KeyPhiFindings } from '@tp/observability';
import { DocumentStore, LocalSealedBytes, collect } from '@tp/worker/documents';
import { afterEach, describe, expect, it } from 'vitest';

import { Sealer } from '../auth/seal';
import { LocalUploadTargets, S3UploadTargets, UploadSizeError, presigningClient } from './targets';

const PRACTICE = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
const DOCUMENT = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';
const subject = { practiceId: PRACTICE, documentId: DOCUMENT, sizeBytes: 1200, contentType: 'application/octet-stream' };
const now = new Date('2026-10-16T12:00:00Z');

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('S3UploadTargets', () => {
  // Synthetic credentials: presigning is local arithmetic, nothing is sent.
  const client = new S3Client({
    region: 'us-east-1',
    credentials: { accessKeyId: 'AKIASYNTHETICEXAMPLE', secretAccessKey: 'synthetic-secret-access-key-for-tests' },
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  const targets = new S3UploadTargets({ client, bucket: 'tp-staging-documents', kmsKeyId: 'arn:aws:kms:us-east-1:111122223333:key/synthetic' });

  it('presigns a PUT to the intake key with the type, length, If-None-Match and SSE-KMS signed, for fifteen minutes', async () => {
    const target = await targets.target(subject, now);
    const url = new URL(target.url);
    expect(url.hostname).toBe('tp-staging-documents.s3.us-east-1.amazonaws.com');
    expect(url.pathname).toBe(`/intake/${PRACTICE}/${DOCUMENT}`);
    expect(s3KeyPhiFindings(url.pathname.slice(1))).toEqual([]);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-Date')).toBe('20261016T120000Z');
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual(
      expect.arrayContaining(['content-length', 'content-type', 'host', 'if-none-match', 'x-amz-server-side-encryption', 'x-amz-server-side-encryption-aws-kms-key-id']),
    );
    // The SSE headers stay headers: the browser must send them, and S3 checks them.
    expect(url.searchParams.has('x-amz-server-side-encryption')).toBe(false);
    // Only the signature's own parameters ride in the query string: no checksum of an empty body.
    expect(presigningClient('us-east-1')).toBeInstanceOf(S3Client);
    expect(await presigningClient('us-east-1').config.requestChecksumCalculation()).toBe('WHEN_REQUIRED');
    expect([...url.searchParams.keys()].filter((key) => !key.startsWith('X-Amz-') && key !== 'x-id')).toEqual([]);
    expect(target).toMatchObject({
      method: 'PUT',
      headers: {
        'content-type': 'application/octet-stream',
        'if-none-match': '*',
        'x-amz-server-side-encryption': 'aws:kms',
        'x-amz-server-side-encryption-aws-kms-key-id': 'arn:aws:kms:us-east-1:111122223333:key/synthetic',
      },
      expiresAt: new Date('2026-10-16T12:15:00Z'),
    });
  });

  it('knows the upload arrived when the intake object or the sealed document exists', async () => {
    const answers = (found: (key: string) => boolean | 'error') => {
      const sent: string[] = [];
      return {
        sent,
        targets: new S3UploadTargets({
          client: {
            send: (command: HeadObjectCommand) => {
              const key = command.input.Key ?? '';
              sent.push(key);
              const result = found(key);
              if (result === 'error') {
                return Promise.reject(Object.assign(new Error('Forbidden'), { $metadata: { httpStatusCode: 403 } }));
              }
              return result ? Promise.resolve({}) : Promise.reject(Object.assign(new Error('NotFound'), { $metadata: { httpStatusCode: 404 } }));
            },
          } as never,
          bucket: 'b',
          kmsKeyId: 'k',
        }),
      };
    };
    const intake = answers((key) => key.startsWith('intake/'));
    expect(await intake.targets.arrived(PRACTICE, DOCUMENT)).toBe(true);
    expect(intake.sent).toEqual([`intake/${PRACTICE}/${DOCUMENT}`]);
    const sealed = answers((key) => key.startsWith('practices/'));
    expect(await sealed.targets.arrived(PRACTICE, DOCUMENT)).toBe(true);
    expect(sealed.sent).toEqual([`intake/${PRACTICE}/${DOCUMENT}`, documentObjectKey(PRACTICE, DOCUMENT)]);
    expect(await answers(() => false).targets.arrived(PRACTICE, DOCUMENT)).toBe(false);
    await expect(answers(() => 'error').targets.arrived(PRACTICE, DOCUMENT)).rejects.toThrow('Forbidden');
  });
});

describe('LocalUploadTargets', () => {
  function local() {
    const root = mkdtempSync(path.join(tmpdir(), 'tp-local-uploads-'));
    dirs.push(root);
    const documents = new DocumentStore(new LocalSealedBytes(root));
    return { root, documents, targets: new LocalUploadTargets('http://localhost:3000', documents, new Sealer(randomBytes(32))) };
  }

  function body(...parts: string[]): AsyncIterable<Uint8Array> {
    return Readable.from(parts.map((part) => Buffer.from(part)));
  }

  it('points the browser at the local receiver with a short-lived token and a request key, opaque IDs only', async () => {
    const { targets } = local();
    const target = await targets.target(subject, now);
    const url = new URL(target.url);
    expect(url.pathname).toBe(`/p/${PRACTICE}/uploads/${DOCUMENT}/content`);
    expect(url.searchParams.get('token')).toMatch(/^[a-p]{72}$/);
    expect(url.searchParams.get('request_key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(() => {
      assertNoPhi('url', target.url);
    }).not.toThrow();
    expect(target).toMatchObject({ method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, expiresAt: new Date('2026-10-16T12:15:00Z') });
    expect(targets.receiver.authorizes(subject, url.searchParams.get('token') ?? '', now)).toBe(true);
    expect(targets.receiver.authorizes({ ...subject, sizeBytes: 5 }, url.searchParams.get('token') ?? '', now)).toBe(false);
  });

  it('seals the bytes under the document’s key as they arrive, once, and only at their declared size', async () => {
    const { root, documents, targets } = local();
    const cipher = new PracticeCipher(PRACTICE, randomBytes(32));
    const small = { ...subject, sizeBytes: 7 };
    expect(await targets.arrived(PRACTICE, DOCUMENT)).toBe(false);
    await expect(targets.receiver.receive(cipher, small, body('ISA*', '00*X'))).rejects.toThrow(UploadSizeError);
    await expect(targets.receiver.receive(cipher, small, body('ISA*'))).rejects.toThrow(UploadSizeError);
    expect(await targets.arrived(PRACTICE, DOCUMENT)).toBe(false);
    expect(await targets.receiver.receive(cipher, small, body('ISA*', '00*'))).toBe('stored');
    expect(await targets.arrived(PRACTICE, DOCUMENT)).toBe(true);
    const sealed = readFileSync(path.join(root, documentObjectKey(PRACTICE, DOCUMENT)));
    expect(sealed.subarray(0, 4).toString('ascii')).toBe('TPO2');
    expect(sealed.includes(Buffer.from('ISA*'))).toBe(false);
    expect((await collect(documents.read(cipher, documentObjectKey(PRACTICE, DOCUMENT)))).toString()).toBe('ISA*00*');
    // A second PUT changes nothing: the original stays.
    expect(await targets.receiver.receive(cipher, small, body('OTHER**'))).toBe('already');
    expect((await collect(documents.read(cipher, documentObjectKey(PRACTICE, DOCUMENT)))).toString()).toBe('ISA*00*');
  });

  it('keeps the first of two PUTs that race, and stores nothing of a failed one', async () => {
    const { documents, targets } = local();
    const cipher = new PracticeCipher(PRACTICE, randomBytes(32));
    const small = { ...subject, sizeBytes: 4 };
    const results = await Promise.all([targets.receiver.receive(cipher, small, body('AAAA')), targets.receiver.receive(cipher, small, body('BBBB'))]);
    expect(results.sort()).toEqual(['already', 'stored']);
    expect(['AAAA', 'BBBB']).toContain((await collect(documents.read(cipher, documentObjectKey(PRACTICE, DOCUMENT)))).toString());
    async function* failing(): AsyncGenerator<Uint8Array> {
      yield Buffer.from('AB');
      await Promise.resolve();
      throw new Error('synthetic disconnect');
    }
    const other = { ...small, documentId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c04' };
    await expect(targets.receiver.receive(cipher, other, failing())).rejects.toThrow('synthetic disconnect');
    expect(await targets.arrived(PRACTICE, other.documentId)).toBe(false);
  });
});
