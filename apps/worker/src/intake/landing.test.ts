import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import { CompleteMultipartUploadCommand, CreateMultipartUploadCommand, GetObjectCommand, HeadObjectCommand, UploadPartCommand } from '@aws-sdk/client-s3';
import { assertNoPhi } from '@tp/observability';
import { describe, expect, it } from 'vitest';

import { DocumentStore, collect } from '../storage/documents';
import { LocalLanding, S3Landing, intakeKey } from './landing';
import { MemorySealedBytes, TEST_DOCUMENT, TEST_KEY, TEST_PRACTICE, testCipher } from './test-support/memory-bytes';

const document = { practiceId: TEST_PRACTICE, documentId: TEST_DOCUMENT, key: TEST_KEY };
const BYTES = Buffer.from('ISA*00*          *00*          *ZZ*SYNTHSENDER    *');
const sha = createHash('sha256').update(BYTES).digest('hex');

function once(bytes: Buffer): AsyncIterable<Buffer> {
  return Readable.from([bytes]);
}

describe('intakeKey', () => {
  it('is opaque and inside the intake prefix (SEC-08)', () => {
    const key = intakeKey(TEST_PRACTICE, TEST_DOCUMENT);
    expect(key).toBe(`intake/${TEST_PRACTICE}/${TEST_DOCUMENT}`);
    expect(() => {
      assertNoPhi('s3_key', key);
    }).not.toThrow();
  });
});

describe('LocalLanding', () => {
  it('finds the bytes the local receiver sealed, lets the scanner read their head, and hashes them', async () => {
    const cipher = testCipher();
    const documents = new DocumentStore(new MemorySealedBytes());
    const landing = new LocalLanding(documents);
    expect(await landing.arrived(document)).toBe(false);
    await documents.write(cipher, TEST_KEY, once(BYTES));
    expect(await landing.arrived(document)).toBe(true);
    const subject = landing.scanSubject(cipher, document);
    expect(subject.landingKey).toBe(TEST_KEY);
    expect((await subject.head(4)).toString()).toBe('ISA*');
    expect((await subject.head(10_000)).equals(BYTES)).toBe(true);
    expect(await landing.settle(cipher, document)).toEqual({ sha256: sha, sizeBytes: BYTES.length });
  });
});

describe('S3Landing (mocked client)', () => {
  function bucket(options: { intake: boolean }) {
    const sent: unknown[] = [];
    const intake = options.intake;
    const client = {
      send: (command: unknown) => {
        sent.push(command);
        if (command instanceof HeadObjectCommand) {
          return intake ? Promise.resolve({}) : Promise.reject(Object.assign(new Error('NotFound'), { $metadata: { httpStatusCode: 404 } }));
        }
        if (command instanceof GetObjectCommand) {
          const range = command.input.Range;
          return Promise.resolve({ Body: Readable.from([range === undefined ? BYTES : BYTES.subarray(0, 4)]) });
        }
        return Promise.resolve({});
      },
    };
    return { sent, client: client as never };
  }

  it('seals the scanned upload into the document’s key, hashing it on the way, and never deletes anything', async () => {
    const cipher = testCipher();
    const memory = new MemorySealedBytes();
    const documents = new DocumentStore(memory);
    const s3 = bucket({ intake: true });
    const landing = new S3Landing(documents, { client: s3.client, bucket: 'tp-documents' });
    expect(await landing.arrived(document)).toBe(true);
    const subject = landing.scanSubject(cipher, document);
    expect(subject.landingKey).toBe(intakeKey(TEST_PRACTICE, TEST_DOCUMENT));
    expect((await subject.head(4)).toString()).toBe('ISA*');
    expect((s3.sent.at(-1) as GetObjectCommand).input).toEqual({ Bucket: 'tp-documents', Key: intakeKey(TEST_PRACTICE, TEST_DOCUMENT), Range: 'bytes=0-3' });
    expect(await landing.settle(cipher, document)).toEqual({ sha256: sha, sizeBytes: BYTES.length });
    expect((await collect(documents.read(cipher, TEST_KEY))).equals(BYTES)).toBe(true);
    // The intake copy expires by the bucket's lifecycle rule; the application role deletes nothing.
    expect(s3.sent.every((command) => command instanceof HeadObjectCommand || command instanceof GetObjectCommand)).toBe(true);
    // A retry after the copy finds the sealed document and hashes it again.
    expect(await landing.arrived(document)).toBe(true);
    expect(await landing.settle(cipher, document)).toEqual({ sha256: sha, sizeBytes: BYTES.length });
  });

  it('has nothing to take in before the browser’s PUT, and refuses an upload without a body', async () => {
    const documents = new DocumentStore(new MemorySealedBytes());
    const landing = new S3Landing(documents, { client: bucket({ intake: false }).client, bucket: 'b' });
    expect(await landing.arrived(document)).toBe(false);
    const empty = new S3Landing(documents, { client: { send: () => Promise.resolve({}) } as never, bucket: 'b' });
    await expect(empty.settle(testCipher(), document)).rejects.toThrow('the upload has no body');
    const denied = new S3Landing(documents, { client: { send: () => Promise.reject(Object.assign(new Error('Forbidden'), { $metadata: { httpStatusCode: 403 } })) } as never, bucket: 'b' });
    await expect(denied.arrived(document)).rejects.toThrow('Forbidden');
  });

  it('writes the sealed copy through the documents bucket with If-None-Match when the store is S3', async () => {
    const { S3SealedBytes } = await import('../storage/documents');
    const sent: unknown[] = [];
    const client = {
      send: (command: unknown) => {
        sent.push(command);
        if (command instanceof HeadObjectCommand) {
          return command.input.Key?.startsWith('intake/') ? Promise.resolve({}) : Promise.reject(Object.assign(new Error('NotFound'), { $metadata: { httpStatusCode: 404 } }));
        }
        if (command instanceof GetObjectCommand) {
          return Promise.resolve({ Body: Readable.from([BYTES]) });
        }
        if (command instanceof CreateMultipartUploadCommand) {
          return Promise.resolve({ UploadId: 'u' });
        }
        if (command instanceof UploadPartCommand) {
          return Promise.resolve({ ETag: 'e' });
        }
        return Promise.resolve({});
      },
    } as never;
    const landing = new S3Landing(new DocumentStore(new S3SealedBytes({ client, bucket: 'b' })), { client, bucket: 'b' });
    expect(await landing.settle(testCipher(), document)).toEqual({ sha256: sha, sizeBytes: BYTES.length });
    const complete = sent.find((command) => command instanceof CompleteMultipartUploadCommand) as CompleteMultipartUploadCommand;
    expect(complete.input).toMatchObject({ Bucket: 'b', Key: TEST_KEY, IfNoneMatch: '*' });
  });

  it('keeps the first sealed copy when another attempt wrote it meanwhile', async () => {
    const cipher = testCipher();
    const memory = new MemorySealedBytes();
    const documents = new DocumentStore(memory);
    // The sealed copy appears after the existence check: the write is refused and the copy is hashed.
    const racing = Object.assign(Object.create(Object.getPrototypeOf(documents) as object) as DocumentStore, documents, {
      exists: async () => {
        await documents.write(cipher, TEST_KEY, once(BYTES));
        return false;
      },
    });
    const landing = new S3Landing(racing, { client: bucket({ intake: true }).client, bucket: 'b' });
    expect(await landing.settle(cipher, document)).toEqual({ sha256: sha, sizeBytes: BYTES.length });
    expect(memory.objects.size).toBe(1);
  });
});
