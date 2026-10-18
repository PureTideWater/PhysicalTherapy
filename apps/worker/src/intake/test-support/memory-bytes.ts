import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';

import { PracticeCipher } from '@tp/db';

import { DocumentStore, type DocumentReader, type SealedBytes } from '../../storage/documents';
import { ObjectConflictError } from '../../storage/object-store';

/** Sealed bytes in memory, written once per key, for tests; it records the largest piece it was handed. */
export class MemorySealedBytes implements SealedBytes {
  readonly objects = new Map<string, Buffer>();
  largestWrite = 0;

  async putNew(key: string, source: AsyncIterable<Uint8Array>): Promise<void> {
    if (this.objects.has(key)) {
      throw new ObjectConflictError('exists');
    }
    const parts: Buffer[] = [];
    for await (const part of source) {
      this.largestWrite = Math.max(this.largestWrite, part.length);
      parts.push(Buffer.from(part));
    }
    if (this.objects.has(key)) {
      throw new ObjectConflictError('exists');
    }
    this.objects.set(key, Buffer.concat(parts));
  }

  size(key: string): Promise<number | null> {
    return Promise.resolve(this.objects.get(key)?.length ?? null);
  }

  get(key: string, range?: { readonly start: number; readonly end: number }): AsyncIterable<Uint8Array> {
    const bytes = this.objects.get(key);
    if (bytes === undefined) {
      throw new Error('no such object');
    }
    const slice = range === undefined ? bytes : bytes.subarray(range.start, range.end);
    const parts: Buffer[] = [];
    for (let at = 0; at < slice.length; at += 50_000) {
      parts.push(slice.subarray(at, at + 50_000));
    }
    return Readable.from(parts);
  }
}

export const TEST_PRACTICE = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
export const TEST_DOCUMENT = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';
export const TEST_KEY = `practices/${TEST_PRACTICE}/documents/${TEST_DOCUMENT}`;

export function testCipher(practiceId: string = TEST_PRACTICE): PracticeCipher {
  return new PracticeCipher(practiceId, randomBytes(32));
}

function once(bytes: Buffer): AsyncIterable<Buffer> {
  return Readable.from([bytes]);
}

/** Stores `bytes` sealed in a fresh memory store and opens them for random access. */
export async function sealedReader(bytes: Buffer, cipher: PracticeCipher = testCipher()): Promise<{ reader: DocumentReader; store: DocumentStore; bytes: MemorySealedBytes; cipher: PracticeCipher }> {
  const memory = new MemorySealedBytes();
  const store = new DocumentStore(memory);
  await store.write(cipher, TEST_KEY, once(bytes));
  return { reader: await store.open(cipher, TEST_KEY), store, bytes: memory, cipher };
}
