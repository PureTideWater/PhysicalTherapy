import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { CiphertextError, PracticeCipher } from '@tp/db';
import { afterEach, describe, expect, it } from 'vitest';

import { ObjectConflictError, ObjectKeyError } from './object-store';
import { LocalByteStore, PracticeObjectStore, S3ByteStore, SEALED_CONTENT_TYPE } from './practice-objects';

const PRACTICE_A = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
const PRACTICE_B = '1e4b8f8a-2c1d-4f7e-8b3a-5d6c7e8f9a02';
const BODY = Buffer.from('ISA*00*          *00*          *ZZ*SYNTHSENDER    *ZZ*SYNTHRECEIVER  ~GS*HP*SYNTH~', 'utf8');

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function localStore(): { root: string; store: PracticeObjectStore } {
  const root = mkdtempSync(path.join(tmpdir(), 'practice-objects-'));
  dirs.push(root);
  return { root, store: new PracticeObjectStore(new LocalByteStore(root)) };
}

describe('PracticeObjectStore (local)', () => {
  const cipher = new PracticeCipher(PRACTICE_A, randomBytes(32));

  it('stores only sealed bytes and opens them with the practice’s cipher', async () => {
    const { root, store } = localStore();
    await store.put(cipher, 'documents/0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03', BODY);
    const stored = readFileSync(path.join(root, 'documents/0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03'));
    expect(stored.includes(Buffer.from('SYNTHSENDER'))).toBe(false);
    expect(stored.subarray(0, 4).toString('ascii')).toBe('TPO1');
    expect((await store.get(cipher, 'documents/0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03')).equals(BODY)).toBe(true);
  });

  it('opens nothing for another practice’s cipher, and never overwrites a key', async () => {
    const { store } = localStore();
    await store.put(cipher, 'documents/1', BODY);
    await expect(store.get(new PracticeCipher(PRACTICE_B, randomBytes(32)), 'documents/1')).rejects.toThrow(CiphertextError);
    await expect(store.put(cipher, 'documents/1', Buffer.from('replacement'))).rejects.toThrow(ObjectConflictError);
    expect((await store.get(cipher, 'documents/1')).equals(BODY)).toBe(true);
  });

  it('refuses keys that could carry PHI or leave the store', async () => {
    const { store } = localStore();
    await expect(store.put(cipher, '../outside', BODY)).rejects.toThrow(ObjectKeyError);
    await expect(store.put(cipher, '/absolute', BODY)).rejects.toThrow(ObjectKeyError);
    await expect(store.put(cipher, 'documents/123-45-6789.835', BODY)).rejects.toThrow(ObjectKeyError);
    await expect(store.get(cipher, 'documents/missing')).rejects.toThrow();
  });
});

describe('S3ByteStore (mocked client)', () => {
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
            return Promise.reject(error instanceof Error ? error : new Error('failed'));
          }
        },
      } as never,
    };
  }

  it('writes sealed bytes once with If-None-Match and reads them back', async () => {
    const cipher = new PracticeCipher(PRACTICE_A, randomBytes(32));
    let stored: Uint8Array = new Uint8Array();
    const fake = s3((command) => {
      if (command instanceof PutObjectCommand) {
        stored = command.input.Body as Uint8Array;
        return {};
      }
      return { Body: { transformToByteArray: () => Promise.resolve(stored) } };
    });
    const store = new PracticeObjectStore(new S3ByteStore({ client: fake.client, bucket: 'documents' }));
    await store.put(cipher, 'documents/0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03', BODY);
    expect((fake.sent[0] as PutObjectCommand).input).toMatchObject({ Bucket: 'documents', Key: 'documents/0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03', ContentType: SEALED_CONTENT_TYPE, IfNoneMatch: '*' });
    expect(Buffer.from(stored).includes(Buffer.from('SYNTHSENDER'))).toBe(false);
    expect((await store.get(cipher, 'documents/0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03')).equals(BODY)).toBe(true);
    expect((fake.sent[1] as GetObjectCommand).input).toEqual({ Bucket: 'documents', Key: 'documents/0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03' });
  });

  it('turns S3’s 412 into a refused overwrite, and passes other failures through', async () => {
    const conflict = Object.assign(new Error('PreconditionFailed'), { $metadata: { httpStatusCode: 412 } });
    const precondition = new S3ByteStore({ client: s3(() => { throw conflict; }).client, bucket: 'b' });
    await expect(precondition.putNew('documents/1', BODY)).rejects.toThrow(ObjectConflictError);
    const denied = new S3ByteStore({ client: s3(() => { throw new Error('AccessDenied'); }).client, bucket: 'b' });
    await expect(denied.putNew('documents/1', BODY)).rejects.toThrow('AccessDenied');
    const empty = new S3ByteStore({ client: s3(() => ({})).client, bucket: 'b' });
    await expect(empty.get('documents/1')).rejects.toThrow(/no body/);
  });
});
