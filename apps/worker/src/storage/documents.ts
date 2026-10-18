import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, mkdir, open, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { CiphertextError, type PracticeCipher, SEALED_STREAM_HEADER_BYTES, SealedStreamLayout } from '@tp/db/runtime';

import { ObjectConflictError, ObjectKeyError, requireOpaqueKey } from './object-store';
import { SEALED_CONTENT_TYPE } from './practice-objects';

export { ObjectConflictError, ObjectKeyError } from './object-store';

/**
 * A practice's documents (uploaded originals and the entries of uploaded zips), sealed with the
 * practice's data key as TPO2 streams (PracticeCipher.sealObjectStream; docs/adr/0018 and 0026) under
 * their opaque keys, written once and never replaced (PRD 6: "original bytes kept immutable"). Every
 * read and write is a stream, so a 2 GiB upload passes through in bounded memory: a write holds one
 * chunk of the seal and one S3 part; a read holds one chunk; random access (the zip reader) decrypts
 * only the chunks a range touches and caches a few for the central directory's small reads.
 *
 * Two byte stores sit beneath it: a directory in development and tests (LocalSealedBytes, the layout
 * the web app's local upload receiver writes too) and an S3 bucket in staging and production
 * (S3SealedBytes: multipart uploads completed with If-None-Match: *, ranged GETs).
 */

/** Where sealed bytes live: written once per key, read whole or by range, as streams. */
export interface SealedBytes {
  /** Writes a new object; an existing key is refused with ObjectConflictError and nothing is written. */
  putNew(key: string, source: AsyncIterable<Uint8Array>): Promise<void>;
  /** The object's size in bytes, or null when no object exists under the key. */
  size(key: string): Promise<number | null>;
  /** The object's bytes [start, end), or all of them. */
  get(key: string, range?: { readonly start: number; readonly end: number }): AsyncIterable<Uint8Array>;
}

export interface WrittenDocument {
  /** SHA-256 of the plaintext, hex. */
  readonly sha256: string;
  readonly sizeBytes: number;
}

/** A document opened for random access to its plaintext. */
export interface DocumentReader {
  readonly sizeBytes: number;
  /** The plaintext bytes [start, end), as a stream. */
  stream(start: number, end: number): AsyncIterable<Buffer>;
  /** The plaintext bytes [start, end) at once: for small reads (headers, a zip's directory). */
  read(start: number, end: number): Promise<Buffer>;
}

/** The plaintext of `source`, hashed and counted as it passes. */
export class HashingTap {
  private readonly hash = createHash('sha256');
  sizeBytes = 0;

  async *pass(source: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
    for await (const part of source) {
      this.hash.update(part);
      this.sizeBytes += part.length;
      yield part;
    }
  }

  result(): WrittenDocument {
    return { sha256: this.hash.digest('hex'), sizeBytes: this.sizeBytes };
  }
}

/** Reads `source` whole: for small objects only. */
export async function collect(source: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of source) {
    parts.push(Buffer.from(part.buffer, part.byteOffset, part.length));
  }
  return Buffer.concat(parts);
}

/** How many sealed chunks one fetch reads ahead for small reads (1 MiB), and how many it keeps. */
const READ_AHEAD_CHUNKS = 16;
const CACHED_CHUNKS = 64;

export class DocumentStore {
  constructor(readonly bytes: SealedBytes) {}

  /** Seals `source` with the practice's cipher and writes it under `key`, once; returns the plaintext's hash and size. */
  async write(cipher: PracticeCipher, key: string, source: AsyncIterable<Uint8Array>): Promise<WrittenDocument> {
    const opaque = requireOpaqueKey(key);
    const tap = new HashingTap();
    await this.bytes.putNew(opaque, cipher.sealObjectStream(opaque, tap.pass(source)));
    return tap.result();
  }

  async exists(key: string): Promise<boolean> {
    return (await this.bytes.size(requireOpaqueKey(key))) !== null;
  }

  /** The document's plaintext, as a stream; another practice's cipher opens nothing. */
  read(cipher: PracticeCipher, key: string): AsyncIterable<Buffer> {
    const opaque = requireOpaqueKey(key);
    return cipher.openObjectStream(opaque, this.bytes.get(opaque));
  }

  /** Hashes a stored document's plaintext, reading it as a stream. */
  async digest(cipher: PracticeCipher, key: string): Promise<WrittenDocument> {
    const tap = new HashingTap();
    for await (const part of tap.pass(this.read(cipher, key))) {
      void part;
    }
    return tap.result();
  }

  /** Opens a stored document for random access to its plaintext. */
  async open(cipher: PracticeCipher, key: string): Promise<DocumentReader> {
    const opaque = requireOpaqueKey(key);
    const sealedBytes = await this.bytes.size(opaque);
    if (sealedBytes === null) {
      throw new ObjectKeyError('no document is stored under this key');
    }
    const header = await collect(this.bytes.get(opaque, { start: 0, end: Math.min(sealedBytes, SEALED_STREAM_HEADER_BYTES) }));
    const layout = new SealedStreamLayout(header, sealedBytes);
    return new SealedDocumentReader(cipher, opaque, layout, this.bytes);
  }
}

class SealedDocumentReader implements DocumentReader {
  private readonly cache = new Map<number, Buffer>();

  constructor(
    private readonly cipher: PracticeCipher,
    private readonly key: string,
    private readonly layout: SealedStreamLayout,
    private readonly bytes: SealedBytes,
  ) {}

  get sizeBytes(): number {
    return this.layout.plainBytes;
  }

  private bounds(start: number, end: number): void {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > this.layout.plainBytes) {
      throw new RangeError('a read lies outside the document');
    }
  }

  /** Opens chunks first to last from one sealed range, yielding each chunk's plaintext in order. */
  private async *chunks(first: number, last: number): AsyncGenerator<{ index: number; plain: Buffer }> {
    const range = this.layout.sealedRange(first, last);
    let index = first;
    let pending = Buffer.alloc(0);
    for await (const part of this.bytes.get(this.key, range)) {
      pending = pending.length === 0 ? Buffer.from(part) : Buffer.concat([pending, part]);
      while (pending.length >= this.layout.sealedChunkBytes && index < last) {
        yield { index, plain: this.cipher.openObjectChunk(this.key, this.layout, index, pending.subarray(0, this.layout.sealedChunkBytes)) };
        pending = pending.subarray(this.layout.sealedChunkBytes);
        index += 1;
      }
    }
    const expected = range.end - this.layout.sealedRange(last, last).start;
    if (index !== last || pending.length !== expected) {
      throw new CiphertextError('the sealed document ended early');
    }
    yield { index, plain: this.cipher.openObjectChunk(this.key, this.layout, index, pending) };
  }

  async *stream(start: number, end: number): AsyncGenerator<Buffer> {
    this.bounds(start, end);
    if (start === end) {
      return;
    }
    const size = this.layout.chunkBytes;
    const first = Math.floor(start / size);
    const last = Math.floor((end - 1) / size);
    for await (const { index, plain } of this.chunks(first, last)) {
      const from = index === first ? start - first * size : 0;
      const to = index === last ? end - last * size : plain.length;
      yield plain.subarray(from, to);
    }
  }

  async read(start: number, end: number): Promise<Buffer> {
    this.bounds(start, end);
    if (start === end) {
      return Buffer.alloc(0);
    }
    const size = this.layout.chunkBytes;
    const first = Math.floor(start / size);
    const last = Math.floor((end - 1) / size);
    const parts: Buffer[] = [];
    for (let index = first; index <= last; index += 1) {
      let plain = this.cache.get(index);
      if (plain === undefined) {
        // Read ahead: the central directory is read in many small steps, one after another.
        const until = Math.min(this.layout.chunkCount - 1, Math.max(last, index + READ_AHEAD_CHUNKS - 1));
        for await (const chunk of this.chunks(index, until)) {
          this.remember(chunk.index, chunk.plain);
        }
        plain = this.cache.get(index);
      }
      if (plain === undefined) {
        throw new CiphertextError('the sealed document ended early');
      }
      parts.push(plain);
    }
    return Buffer.concat(parts).subarray(start - first * size, end - first * size);
  }

  private remember(index: number, plain: Buffer): void {
    this.cache.delete(index);
    this.cache.set(index, plain);
    if (this.cache.size > CACHED_CHUNKS) {
      this.cache.delete(this.cache.keys().next().value as number);
    }
  }
}

/** Development and tests: one file per key under a root directory, created once (exclusive link), read-only. */
export class LocalSealedBytes implements SealedBytes {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private file(key: string): string {
    const file = path.resolve(this.root, requireOpaqueKey(key));
    if (!file.startsWith(`${this.root}${path.sep}`)) {
      throw new ObjectKeyError('object keys stay inside the store');
    }
    return file;
  }

  async putNew(key: string, source: AsyncIterable<Uint8Array>): Promise<void> {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.partial`;
    const handle = await open(temporary, 'wx', 0o600);
    try {
      try {
        for await (const part of source) {
          await handle.write(part);
        }
      } finally {
        await handle.close();
      }
      try {
        await link(temporary, file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new ObjectConflictError('an object already exists under this key; stored objects are never replaced');
        }
        throw error;
      }
    } finally {
      await unlink(temporary);
    }
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await stat(this.file(key))).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  get(key: string, range?: { readonly start: number; readonly end: number }): AsyncIterable<Uint8Array> {
    const file = this.file(key);
    if (range !== undefined && range.start === range.end) {
      return (async function* nothing() {})();
    }
    // createReadStream's end is inclusive.
    return createReadStream(file, range === undefined ? {} : { start: range.start, end: range.end - 1 }) as AsyncIterable<Uint8Array>;
  }
}

function status(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode : undefined;
}

/** The size of each part of a multipart upload but the last (S3's minimum is 5 MiB). */
export const S3_PART_BYTES = 8 * 1024 * 1024;

/**
 * Staging and production: the documents bucket. A write is a multipart upload of S3_PART_BYTES parts
 * (one part in memory at a time), completed with If-None-Match: *, which the bucket policy also
 * requires (infra/lib/constructs/storage.ts), so a key is never overwritten; a failed write aborts its
 * upload. The bucket's default SSE-KMS applies beneath the practice's sealing.
 */
export class S3SealedBytes implements SealedBytes {
  constructor(private readonly options: { readonly client: Pick<S3Client, 'send'>; readonly bucket: string; readonly partBytes?: number }) {}

  async putNew(key: string, source: AsyncIterable<Uint8Array>): Promise<void> {
    const { client, bucket } = this.options;
    const Key = requireOpaqueKey(key);
    const partBytes = this.options.partBytes ?? S3_PART_BYTES;
    const created = await client.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key, ContentType: SEALED_CONTENT_TYPE }));
    const UploadId = created.UploadId;
    if (UploadId === undefined) {
      throw new ObjectKeyError('S3 did not start the upload');
    }
    const parts: { ETag: string; PartNumber: number }[] = [];
    const send = async (body: Buffer) => {
      const PartNumber = parts.length + 1;
      const uploaded = await client.send(new UploadPartCommand({ Bucket: bucket, Key, UploadId, PartNumber, Body: body, ContentLength: body.length }));
      parts.push({ ETag: uploaded.ETag ?? '', PartNumber });
    };
    try {
      let pending: Buffer[] = [];
      let pendingBytes = 0;
      for await (const part of source) {
        pending.push(Buffer.from(part.buffer, part.byteOffset, part.length));
        pendingBytes += part.length;
        while (pendingBytes >= partBytes) {
          const joined = Buffer.concat(pending);
          await send(joined.subarray(0, partBytes));
          pending = [joined.subarray(partBytes)];
          pendingBytes -= partBytes;
        }
      }
      if (pendingBytes > 0 || parts.length === 0) {
        await send(Buffer.concat(pending));
      }
      await client.send(new CompleteMultipartUploadCommand({ Bucket: bucket, Key, UploadId, MultipartUpload: { Parts: parts }, IfNoneMatch: '*' }));
    } catch (error) {
      await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key, UploadId })).catch(() => undefined);
      if (status(error) === 412) {
        throw new ObjectConflictError('an object already exists under this key; stored objects are never replaced');
      }
      throw error;
    }
  }

  async size(key: string): Promise<number | null> {
    try {
      const head = await this.options.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: requireOpaqueKey(key) }));
      return head.ContentLength ?? 0;
    } catch (error) {
      if (status(error) === 404) {
        return null;
      }
      throw error;
    }
  }

  async *get(key: string, range?: { readonly start: number; readonly end: number }): AsyncGenerator<Uint8Array> {
    if (range !== undefined && range.start === range.end) {
      return;
    }
    const output = await this.options.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: requireOpaqueKey(key), ...(range === undefined ? {} : { Range: `bytes=${String(range.start)}-${String(range.end - 1)}` }) }),
    );
    if (output.Body === undefined) {
      throw new ObjectKeyError('the object has no body');
    }
    yield* output.Body as unknown as Readable;
  }
}
