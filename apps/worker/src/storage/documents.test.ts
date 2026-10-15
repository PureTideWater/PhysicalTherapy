import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, GetObjectCommand, HeadObjectCommand, UploadPartCommand } from '@aws-sdk/client-s3';
import { CiphertextError, PracticeCipher } from '@tp/db';
import { afterEach, describe, expect, it } from 'vitest';

import { MemorySealedBytes } from '../intake/test-support/memory-bytes';
import { DocumentStore, LocalSealedBytes, S3SealedBytes, collect } from './documents';
import { ObjectConflictError, ObjectKeyError } from './object-store';

const PRACTICE_A = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
const PRACTICE_B = '1e4b8f8a-2c1d-4f7e-8b3a-5d6c7e8f9a02';
const KEY = `practices/${PRACTICE_A}/documents/0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03`;
const OTHER_KEY = `practices/${PRACTICE_A}/documents/9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c04`;
const CHUNK = 65_536;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function localRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'tp-documents-'));
  dirs.push(root);
  return root;
}

function pieces(bytes: Buffer, size = 10_000): AsyncIterable<Buffer> {
  const parts: Buffer[] = [];
  for (let at = 0; at < bytes.length; at += size) {
    parts.push(bytes.subarray(at, at + size));
  }
  return Readable.from(parts);
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

describe('DocumentStore', () => {
  const cipher = new PracticeCipher(PRACTICE_A, randomBytes(32));

  it('seals a stream into a new object, returning the plaintext’s SHA-256 and size, and reads it back', async () => {
    const root = localRoot();
    const store = new DocumentStore(new LocalSealedBytes(root));
    const plain = Buffer.from('ISA*00*SYNTHETIC*'.repeat(20_000));
    expect(await store.write(cipher, KEY, pieces(plain))).toEqual({ sha256: sha256(plain), sizeBytes: plain.length });
    const stored = readFileSync(path.join(root, KEY));
    expect(stored.subarray(0, 4).toString('ascii')).toBe('TPO2');
    expect(stored.includes(Buffer.from('SYNTHETIC'))).toBe(false);
    expect((await collect(store.read(cipher, KEY))).equals(plain)).toBe(true);
    expect(await store.digest(cipher, KEY)).toEqual({ sha256: sha256(plain), sizeBytes: plain.length });
    expect(await store.exists(KEY)).toBe(true);
    expect(await store.exists(OTHER_KEY)).toBe(false);
    // No temporary file is left behind.
    expect(readdirSync(path.dirname(path.join(root, KEY)))).toEqual([path.basename(KEY)]);
  });

  it('never replaces an object, and opens nothing with another practice’s cipher', async () => {
    const store = new DocumentStore(new LocalSealedBytes(localRoot()));
    await store.write(cipher, KEY, pieces(Buffer.from('first')));
    await expect(store.write(cipher, KEY, pieces(Buffer.from('second')))).rejects.toThrow(ObjectConflictError);
    expect((await collect(store.read(cipher, KEY))).toString()).toBe('first');
    await expect(collect(store.read(new PracticeCipher(PRACTICE_B, randomBytes(32)), KEY))).rejects.toThrow(CiphertextError);
    await expect(store.open(cipher, OTHER_KEY)).rejects.toThrow(ObjectKeyError);
  });

  it('refuses keys that could carry PHI or leave the store', async () => {
    const store = new DocumentStore(new LocalSealedBytes(localRoot()));
    await expect(store.write(cipher, 'documents/123-45-6789.835', pieces(Buffer.from('x')))).rejects.toThrow(ObjectKeyError);
    await expect(store.write(cipher, '/absolute', pieces(Buffer.from('x')))).rejects.toThrow(ObjectKeyError);
    expect(() => store.read(cipher, '../outside')).toThrow(ObjectKeyError);
    await expect(new LocalSealedBytes(localRoot()).putNew('a/../../b', pieces(Buffer.from('x')))).rejects.toThrow(ObjectKeyError);
  });

  it('opens any range of a document by random access, from cached chunks for small reads', async () => {
    const memory = new MemorySealedBytes();
    const store = new DocumentStore(memory);
    const plain = randomBytes(40 * CHUNK + 777);
    await store.write(cipher, KEY, pieces(plain, 70_000));
    expect(memory.largestWrite).toBeLessThanOrEqual(CHUNK + 16);
    const reader = await store.open(cipher, KEY);
    expect(reader.sizeBytes).toBe(plain.length);
    for (const [start, end] of [
      [0, 0],
      [0, 10],
      [CHUNK - 5, CHUNK + 5],
      [3 * CHUNK, 30 * CHUNK],
      [plain.length - 22, plain.length],
    ] as const) {
      expect((await reader.read(start, end)).equals(plain.subarray(start, end)), `read ${String(start)}`).toBe(true);
      expect((await collect(reader.stream(start, end))).equals(plain.subarray(start, end)), `stream ${String(start)}`).toBe(true);
    }
    // A read past the cache's size still answers correctly.
    expect((await reader.read(0, plain.length)).equals(plain)).toBe(true);
    await expect(reader.read(-1, 3)).rejects.toThrow(RangeError);
    await expect(reader.read(5, 3)).rejects.toThrow(RangeError);
    await expect(reader.read(0, plain.length + 1)).rejects.toThrow(RangeError);
    await expect(collect(reader.stream(0, 1.5))).rejects.toThrow(RangeError);
  });

  it('notices a sealed document that is shorter than its layout says', async () => {
    const memory = new MemorySealedBytes();
    const store = new DocumentStore(memory);
    await store.write(cipher, KEY, pieces(randomBytes(3 * CHUNK)));
    const reader = await store.open(cipher, KEY);
    const sealed = memory.objects.get(KEY) as Buffer;
    memory.objects.set(KEY, sealed.subarray(0, sealed.length - 100));
    await expect(reader.read(2 * CHUNK, 3 * CHUNK)).rejects.toThrow(CiphertextError);
  });

  it('reads ranges and whole files from the local store, empty ranges included', async () => {
    const bytes = new LocalSealedBytes(localRoot());
    await bytes.putNew('a/b', pieces(Buffer.from('0123456789')));
    expect((await collect(bytes.get('a/b', { start: 2, end: 5 }))).toString()).toBe('234');
    expect((await collect(bytes.get('a/b', { start: 4, end: 4 }))).length).toBe(0);
    expect((await collect(bytes.get('a/b'))).toString()).toBe('0123456789');
    expect(await bytes.size('a/b')).toBe(10);
    expect(await bytes.size('a/c')).toBeNull();
  });

  it('removes a partly written object when its source fails', async () => {
    const root = localRoot();
    const bytes = new LocalSealedBytes(root);
    async function* failing(): AsyncGenerator<Buffer> {
      yield Buffer.from('partial');
      await Promise.resolve();
      throw new Error('synthetic source failure');
    }
    await expect(bytes.putNew('a/b', failing())).rejects.toThrow('synthetic source failure');
    expect(await bytes.size('a/b')).toBeNull();
    expect(readdirSync(path.join(root, 'a'))).toEqual([]);
  });
});

describe('S3SealedBytes (mocked client)', () => {
  function s3(answer: (command: unknown) => unknown) {
    const sent: unknown[] = [];
    return {
      sent,
      client: {
        send: (command: unknown) => {
          sent.push(command);
          try {
            return Promise.resolve(answer(command));
          } catch (error) {
            return Promise.reject(error instanceof Error ? error : new Error('refused'));
          }
        },
      } as never,
    };
  }

  const ok = (command: unknown) => {
    if (command instanceof CreateMultipartUploadCommand) {
      return { UploadId: 'upload-1' };
    }
    if (command instanceof UploadPartCommand) {
      return { ETag: `etag-${String(command.input.PartNumber)}` };
    }
    return {};
  };

  it('writes a stream as a multipart upload of fixed parts, completed only if the key is new', async () => {
    const mock = s3(ok);
    const bytes = new S3SealedBytes({ client: mock.client, bucket: 'tp-documents', partBytes: 1000 });
    await bytes.putNew(KEY, pieces(Buffer.alloc(2500, 1), 300));
    const parts = mock.sent.filter((command): command is UploadPartCommand => command instanceof UploadPartCommand);
    expect(parts.map((part) => [part.input.PartNumber, (part.input.Body as Buffer).length])).toEqual([
      [1, 1000],
      [2, 1000],
      [3, 500],
    ]);
    expect((mock.sent[0] as CreateMultipartUploadCommand).input).toEqual({ Bucket: 'tp-documents', Key: KEY, ContentType: 'application/octet-stream' });
    const complete = mock.sent.at(-1) as CompleteMultipartUploadCommand;
    expect(complete).toBeInstanceOf(CompleteMultipartUploadCommand);
    expect(complete.input).toMatchObject({ Bucket: 'tp-documents', Key: KEY, UploadId: 'upload-1', IfNoneMatch: '*', MultipartUpload: { Parts: [{ PartNumber: 1, ETag: 'etag-1' }, { PartNumber: 2, ETag: 'etag-2' }, { PartNumber: 3, ETag: 'etag-3' }] } });
  });

  it('writes a small object as one part, and refuses an existing key (412), aborting the upload', async () => {
    const small = s3(ok);
    await new S3SealedBytes({ client: small.client, bucket: 'b' }).putNew(KEY, pieces(Buffer.from('tiny')));
    expect(small.sent.filter((command) => command instanceof UploadPartCommand)).toHaveLength(1);
    const exists = s3((command) => {
      if (command instanceof CompleteMultipartUploadCommand) {
        throw Object.assign(new Error('PreconditionFailed'), { $metadata: { httpStatusCode: 412 } });
      }
      return ok(command);
    });
    await expect(new S3SealedBytes({ client: exists.client, bucket: 'b' }).putNew(KEY, pieces(Buffer.from('tiny')))).rejects.toThrow(ObjectConflictError);
    expect(exists.sent.at(-1)).toBeInstanceOf(AbortMultipartUploadCommand);
    const broken = s3((command) => {
      if (command instanceof UploadPartCommand) {
        throw Object.assign(new Error('InternalError'), { $metadata: { httpStatusCode: 500 } });
      }
      return ok(command);
    });
    await expect(new S3SealedBytes({ client: broken.client, bucket: 'b' }).putNew(KEY, pieces(Buffer.from('tiny')))).rejects.toThrow('InternalError');
    expect(broken.sent.at(-1)).toBeInstanceOf(AbortMultipartUploadCommand);
    await expect(new S3SealedBytes({ client: s3(() => ({})).client, bucket: 'b' }).putNew(KEY, pieces(Buffer.from('x')))).rejects.toThrow(ObjectKeyError);
  });

  it('reads ranges with ranged GETs and sizes with HEAD', async () => {
    const mock = s3((command) => {
      if (command instanceof HeadObjectCommand) {
        return { ContentLength: 10 };
      }
      if (command instanceof GetObjectCommand) {
        return { Body: Readable.from([Buffer.from('3456')]) };
      }
      return {};
    });
    const bytes = new S3SealedBytes({ client: mock.client, bucket: 'b' });
    expect(await bytes.size(KEY)).toBe(10);
    expect((await collect(bytes.get(KEY, { start: 3, end: 7 }))).toString()).toBe('3456');
    expect((mock.sent[1] as GetObjectCommand).input).toEqual({ Bucket: 'b', Key: KEY, Range: 'bytes=3-6' });
    expect((await collect(bytes.get(KEY, { start: 3, end: 3 }))).length).toBe(0);
    await collect(bytes.get(KEY));
    expect((mock.sent.at(-1) as GetObjectCommand).input).toEqual({ Bucket: 'b', Key: KEY });
    const missing = s3(() => {
      throw Object.assign(new Error('NotFound'), { $metadata: { httpStatusCode: 404 } });
    });
    expect(await new S3SealedBytes({ client: missing.client, bucket: 'b' }).size(KEY)).toBeNull();
    const denied = s3(() => {
      throw Object.assign(new Error('Forbidden'), { $metadata: { httpStatusCode: 403 } });
    });
    await expect(new S3SealedBytes({ client: denied.client, bucket: 'b' }).size(KEY)).rejects.toThrow('Forbidden');
    await expect(collect(new S3SealedBytes({ client: s3(() => ({})).client, bucket: 'b' }).get(KEY))).rejects.toThrow(ObjectKeyError);
    expect(await new S3SealedBytes({ client: s3(() => ({})).client, bucket: 'b' }).size(KEY)).toBe(0);
  });
});
