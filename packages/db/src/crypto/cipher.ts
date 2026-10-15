import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

import { DATA_KEY_BYTES, DataKeyError, requirePractice } from './key-provider';

/**
 * Field encryption with a practice's data key (Data dictionary: "Columns marked (enc) are encrypted at
 * the application layer with the practice's data key before storage").
 *
 * - encrypt/decrypt: AES-256-GCM with a fresh 96-bit nonce per value. The additional data binds each
 *   ciphertext to its practice and column, so a value copied into another practice's row, or into
 *   another column, does not decrypt.
 * - lookupHash: a deterministic keyed hash (HMAC-SHA-256) for the one indexed lookup the data
 *   dictionary names, claim (practice_id, payer_claim_control_number). Equal values hash equally within
 *   a practice and column, and differently across practices, so the index never reveals a value or
 *   links practices.
 *
 * - encryptObject/decryptObject: the bytes of a practice's stored objects (documents, packets,
 *   exports in S3), AES-256-GCM under a third derived key, bound to the practice and the object's key,
 *   so an object copied to another key or another practice's cipher does not decrypt
 *   (docs/adr/0018: S3 keeps its own SSE-KMS layer beneath this one).
 *
 * - sealObjectStream/openObjectStream/openObjectChunk: the same object key, for objects too large to
 *   hold in memory (uploaded documents and zip entries, up to the 2 GiB upload limit; docs/adr/0026).
 *   The TPO2 format seals fixed-size chunks, each with its own nonce and tag, so an object is sealed
 *   and opened as a stream, and any byte range of it is opened by decrypting only the chunks it
 *   touches (the zip reader's random access). Truncation, reordering and a changed header are detected.
 *
 * All three keys are derived from the data key with HKDF, so destroying the data key destroys them too.
 */

/** Every column the data dictionary marks (enc). */
export const ENCRYPTED_COLUMNS = [
  'claim.patient_control_number',
  'claim.payer_claim_control_number',
  'patient_ref.last_name',
  'patient_ref.first_name',
  'patient_ref.dob',
  'patient_ref.member_id',
  'patient_ref.group_number',
  'posting_row.claim_reference',
] as const;
export type EncryptedColumn = (typeof ENCRYPTED_COLUMNS)[number];

/** The encrypted columns with an indexed lookup on their deterministic hash. */
export const LOOKUP_COLUMNS = ['claim.payer_claim_control_number'] as const;
export type LookupColumn = (typeof LOOKUP_COLUMNS)[number];

const PREFIX = 'enc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** The first bytes of every sealed object: format and version. */
const OBJECT_MAGIC = Buffer.from('TPO1', 'ascii');

/** The first bytes of a sealed object stream (TPO2). */
const STREAM_MAGIC = Buffer.from('TPO2', 'ascii');
const NONCE_PREFIX_BYTES = 8;
/** Magic, the chunk size (32-bit, big-endian) and the object's random nonce prefix. */
export const SEALED_STREAM_HEADER_BYTES = STREAM_MAGIC.length + 4 + NONCE_PREFIX_BYTES;
/** The plaintext bytes in every chunk of a sealed stream but the last. */
export const SEALED_STREAM_CHUNK_BYTES = 65_536;
/** Each chunk's GCM tag. */
export const SEALED_STREAM_TAG_BYTES = TAG_BYTES;

/**
 * Where a sealed stream's chunks lie, from its header and its total size: what random access needs
 * to open a byte range without reading the rest.
 */
export class SealedStreamLayout {
  /** The sealed bytes of one full chunk: its plaintext and its tag. */
  readonly sealedChunkBytes: number;
  readonly chunkCount: number;
  readonly plainBytes: number;

  constructor(
    readonly header: Buffer,
    readonly sealedBytes: number,
  ) {
    if (header.length !== SEALED_STREAM_HEADER_BYTES || !header.subarray(0, STREAM_MAGIC.length).equals(STREAM_MAGIC)) {
      throw new CiphertextError('the object is not a sealed TPO2 stream');
    }
    const chunkBytes = header.readUInt32BE(STREAM_MAGIC.length);
    if (chunkBytes !== SEALED_STREAM_CHUNK_BYTES) {
      throw new CiphertextError('the sealed stream names an unsupported chunk size');
    }
    this.sealedChunkBytes = chunkBytes + TAG_BYTES;
    const body = sealedBytes - SEALED_STREAM_HEADER_BYTES;
    const count = Math.ceil(body / this.sealedChunkBytes);
    const last = body - (count - 1) * this.sealedChunkBytes;
    if (!Number.isSafeInteger(sealedBytes) || body < TAG_BYTES || last < TAG_BYTES) {
      throw new CiphertextError('the sealed stream is truncated');
    }
    this.chunkCount = count;
    this.plainBytes = body - count * TAG_BYTES;
  }

  /** The plaintext bytes per chunk. */
  get chunkBytes(): number {
    return this.sealedChunkBytes - TAG_BYTES;
  }

  /** The sealed byte range [start, end) holding chunks first to last, inclusive. */
  sealedRange(first: number, last: number): { readonly start: number; readonly end: number } {
    return {
      start: SEALED_STREAM_HEADER_BYTES + first * this.sealedChunkBytes,
      end: Math.min(this.sealedBytes, SEALED_STREAM_HEADER_BYTES + (last + 1) * this.sealedChunkBytes),
    };
  }
}

/** The size of a sealed stream whose plaintext has `plainBytes` bytes. */
export function sealedStreamBytes(plainBytes: number): number {
  const chunks = Math.max(1, Math.ceil(plainBytes / SEALED_STREAM_CHUNK_BYTES));
  return SEALED_STREAM_HEADER_BYTES + plainBytes + chunks * TAG_BYTES;
}

/** Collects buffers and hands back exactly the bytes asked for, without quadratic copying. */
class ByteQueue {
  private readonly parts: Buffer[] = [];
  length = 0;

  push(part: Uint8Array): void {
    if (part.length > 0) {
      this.parts.push(Buffer.from(part.buffer, part.byteOffset, part.length));
      this.length += part.length;
    }
  }

  take(bytes: number): Buffer {
    const taken = Buffer.allocUnsafe(bytes);
    let filled = 0;
    while (filled < bytes) {
      const head = this.parts[0] as Buffer;
      const used = Math.min(head.length, bytes - filled);
      head.copy(taken, filled, 0, used);
      filled += used;
      if (used === head.length) {
        this.parts.shift();
      } else {
        this.parts[0] = head.subarray(used);
      }
    }
    this.length -= bytes;
    return taken;
  }
}

/** A value did not decrypt: tampered, from another practice or column, or not a ciphertext at all. */
export class CiphertextError extends Error {
  override readonly name = 'CiphertextError';
}

function derive(dataKey: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', dataKey, Buffer.alloc(0), info, DATA_KEY_BYTES));
}

export class PracticeCipher {
  private readonly encryptionKey: Buffer;
  private readonly lookupKey: Buffer;
  private readonly objectKey: Buffer;

  constructor(
    readonly practiceId: string,
    dataKey: Uint8Array,
  ) {
    requirePractice(practiceId);
    if (dataKey.length !== DATA_KEY_BYTES) {
      throw new DataKeyError('a data key is 32 bytes');
    }
    const key = Buffer.from(dataKey);
    this.encryptionKey = derive(key, 'tp field encryption v1');
    this.lookupKey = derive(key, 'tp lookup hash v1');
    this.objectKey = derive(key, 'tp object encryption v1');
  }

  private aad(column: EncryptedColumn): Buffer {
    return Buffer.from(`${this.practiceId}:${column}`);
  }

  encrypt(column: EncryptedColumn, plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    cipher.setAAD(this.aad(column));
    const sealed = Buffer.concat([iv, cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
    return `${PREFIX}${sealed.toString('base64url')}`;
  }

  decrypt(column: EncryptedColumn, ciphertext: string): string {
    if (!ciphertext.startsWith(PREFIX)) {
      throw new CiphertextError('the value is not an enc:v1 ciphertext');
    }
    const sealed = Buffer.from(ciphertext.slice(PREFIX.length), 'base64url');
    if (sealed.length < IV_BYTES + TAG_BYTES) {
      throw new CiphertextError('the ciphertext is truncated');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, sealed.subarray(0, IV_BYTES));
    decipher.setAAD(this.aad(column));
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
    try {
      return Buffer.concat([decipher.update(sealed.subarray(IV_BYTES, sealed.length - TAG_BYTES)), decipher.final()]).toString('utf8');
    } catch {
      throw new CiphertextError('the ciphertext does not decrypt under this practice’s key for this column');
    }
  }

  private objectAad(objectKey: string): Buffer {
    if (objectKey === '') {
      throw new CiphertextError('an object is sealed under its key');
    }
    return Buffer.from(`${this.practiceId}:object:${objectKey}`, 'utf8');
  }

  /** Seals an object's bytes for storage under `objectKey`: magic, nonce, ciphertext, tag. */
  encryptObject(objectKey: string, body: Uint8Array): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.objectKey, iv);
    cipher.setAAD(this.objectAad(objectKey));
    return Buffer.concat([OBJECT_MAGIC, iv, cipher.update(body), cipher.final(), cipher.getAuthTag()]);
  }

  /** Opens what encryptObject sealed under the same key for this practice; anything else is refused. */
  decryptObject(objectKey: string, sealed: Uint8Array): Buffer {
    const bytes = Buffer.from(sealed);
    if (bytes.length < OBJECT_MAGIC.length + IV_BYTES + TAG_BYTES || !bytes.subarray(0, OBJECT_MAGIC.length).equals(OBJECT_MAGIC)) {
      throw new CiphertextError('the object is not a sealed TPO1 object');
    }
    const iv = bytes.subarray(OBJECT_MAGIC.length, OBJECT_MAGIC.length + IV_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.objectKey, iv);
    decipher.setAAD(this.objectAad(objectKey));
    decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
    try {
      return Buffer.concat([decipher.update(bytes.subarray(OBJECT_MAGIC.length + IV_BYTES, bytes.length - TAG_BYTES)), decipher.final()]);
    } catch {
      throw new CiphertextError('the object does not decrypt under this practice’s key for this object key');
    }
  }

  /** A chunk's additional data: the object binding, the header, the chunk's index and whether it is the last. */
  private chunkAad(objectKey: string, header: Buffer, index: number, final: boolean): Buffer {
    const position = Buffer.alloc(5);
    position.writeUInt32BE(index, 0);
    position.writeUInt8(final ? 1 : 0, 4);
    return Buffer.concat([this.objectAad(objectKey), Buffer.from([0]), header, position]);
  }

  private static chunkNonce(header: Buffer, index: number): Buffer {
    const nonce = Buffer.alloc(IV_BYTES);
    header.copy(nonce, 0, STREAM_MAGIC.length + 4, SEALED_STREAM_HEADER_BYTES);
    nonce.writeUInt32BE(index, NONCE_PREFIX_BYTES);
    return nonce;
  }

  private sealChunk(objectKey: string, header: Buffer, index: number, final: boolean, plain: Buffer): Buffer {
    if (index > 0xffff_ffff) {
      throw new CiphertextError('the object is too large to seal as one stream');
    }
    const cipher = createCipheriv('aes-256-gcm', this.objectKey, PracticeCipher.chunkNonce(header, index));
    cipher.setAAD(this.chunkAad(objectKey, header, index, final));
    return Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  }

  /**
   * Seals a stream of bytes for storage under `objectKey` (TPO2): a header, then chunks of
   * SEALED_STREAM_CHUNK_BYTES plaintext bytes each (the last one shorter, or empty for an empty
   * object), each with its tag. Memory use is one chunk, whatever the object's size.
   */
  async *sealObjectStream(objectKey: string, source: AsyncIterable<Uint8Array>): AsyncGenerator<Buffer> {
    this.objectAad(objectKey);
    const header = Buffer.concat([STREAM_MAGIC, Buffer.alloc(4), randomBytes(NONCE_PREFIX_BYTES)]);
    header.writeUInt32BE(SEALED_STREAM_CHUNK_BYTES, STREAM_MAGIC.length);
    yield header;
    const pending = new ByteQueue();
    let index = 0;
    for await (const part of source) {
      pending.push(part);
      // A full chunk is sealed as not the last only once a byte after it has arrived.
      while (pending.length > SEALED_STREAM_CHUNK_BYTES) {
        yield this.sealChunk(objectKey, header, index, false, pending.take(SEALED_STREAM_CHUNK_BYTES));
        index += 1;
      }
    }
    yield this.sealChunk(objectKey, header, index, true, pending.take(pending.length));
  }

  /** Opens one chunk of a sealed stream: chunk `index` of `layout`, as read from storage. */
  openObjectChunk(objectKey: string, layout: SealedStreamLayout, index: number, sealedChunk: Uint8Array): Buffer {
    const chunk = Buffer.from(sealedChunk);
    const final = index === layout.chunkCount - 1;
    const expected = final ? layout.sealedBytes - layout.sealedRange(index, index).start : layout.sealedChunkBytes;
    if (index < 0 || index >= layout.chunkCount || chunk.length !== expected) {
      throw new CiphertextError('a chunk of the sealed stream is out of place');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.objectKey, PracticeCipher.chunkNonce(layout.header, index));
    decipher.setAAD(this.chunkAad(objectKey, layout.header, index, final));
    decipher.setAuthTag(chunk.subarray(chunk.length - TAG_BYTES));
    try {
      return Buffer.concat([decipher.update(chunk.subarray(0, chunk.length - TAG_BYTES)), decipher.final()]);
    } catch {
      throw new CiphertextError('the object does not decrypt under this practice’s key for this object key');
    }
  }

  /**
   * Opens what sealObjectStream sealed under the same key for this practice, as a stream. A stream cut
   * short, reordered, from another key or another practice fails before its last bytes are yielded.
   */
  async *openObjectStream(objectKey: string, source: AsyncIterable<Uint8Array>): AsyncGenerator<Buffer> {
    this.objectAad(objectKey);
    const pending = new ByteQueue();
    let header: Buffer | undefined;
    let index = 0;
    const open = (chunk: Buffer, final: boolean): Buffer => {
      const decipher = createDecipheriv('aes-256-gcm', this.objectKey, PracticeCipher.chunkNonce(header as Buffer, index));
      decipher.setAAD(this.chunkAad(objectKey, header as Buffer, index, final));
      decipher.setAuthTag(chunk.subarray(chunk.length - TAG_BYTES));
      try {
        return Buffer.concat([decipher.update(chunk.subarray(0, chunk.length - TAG_BYTES)), decipher.final()]);
      } catch {
        throw new CiphertextError('the object does not decrypt under this practice’s key for this object key');
      } finally {
        index += 1;
      }
    };
    const sealedChunk = SEALED_STREAM_CHUNK_BYTES + TAG_BYTES;
    for await (const part of source) {
      pending.push(part);
      if (header === undefined && pending.length >= SEALED_STREAM_HEADER_BYTES) {
        header = pending.take(SEALED_STREAM_HEADER_BYTES);
        // Validates the magic and the chunk size.
        new SealedStreamLayout(header, SEALED_STREAM_HEADER_BYTES + TAG_BYTES);
      }
      while (header !== undefined && pending.length > sealedChunk) {
        yield open(pending.take(sealedChunk), false);
      }
    }
    if (header === undefined || pending.length < TAG_BYTES) {
      throw new CiphertextError('the sealed stream is truncated');
    }
    yield open(pending.take(pending.length), true);
  }

  /** The deterministic keyed hash stored beside the ciphertext for an indexed lookup. Hex, 64 characters. */
  lookupHash(column: LookupColumn, value: string): string {
    return createHmac('sha256', this.lookupKey).update(`${column}\u0000${value}`, 'utf8').digest('hex');
  }
}
