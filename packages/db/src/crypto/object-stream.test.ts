import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { CiphertextError, PracticeCipher, SEALED_STREAM_CHUNK_BYTES, SEALED_STREAM_HEADER_BYTES, SealedStreamLayout, sealedStreamBytes } from './cipher';

const PRACTICE_A = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01';
const PRACTICE_B = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c02';
const KEY = 'practices/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01/documents/5b0c6d1e-2f3a-4b4c-8d5e-6f7a8b9c0d01';
const CHUNK = SEALED_STREAM_CHUNK_BYTES;

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of stream) {
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts);
}

/** The bytes as a stream cut at the given points. */
function pieces(bytes: Buffer, cuts: readonly number[] = []): AsyncIterable<Buffer> {
  const parts: Buffer[] = [];
  let from = 0;
  for (const cut of [...new Set(cuts)].filter((at) => at > 0 && at < bytes.length).sort((a, b) => a - b)) {
    parts.push(bytes.subarray(from, cut));
    from = cut;
  }
  parts.push(bytes.subarray(from));
  return Readable.from(parts);
}

const cipher = new PracticeCipher(PRACTICE_A, randomBytes(32));

async function seal(plain: Buffer, cuts?: readonly number[], key = KEY, using = cipher): Promise<Buffer> {
  return collect(using.sealObjectStream(key, pieces(plain, cuts)));
}

describe('sealed object streams (TPO2)', () => {
  it.each([0, 1, CHUNK - 1, CHUNK, CHUNK + 1, 3 * CHUNK, 3 * CHUNK + 17])('round-trips %i bytes, at the size the layout predicts', async (size) => {
    const plain = randomBytes(size);
    const sealed = await seal(plain);
    expect(sealed.subarray(0, 4).toString('ascii')).toBe('TPO2');
    expect(sealed.length).toBe(sealedStreamBytes(size));
    expect(new SealedStreamLayout(sealed.subarray(0, SEALED_STREAM_HEADER_BYTES), sealed.length).plainBytes).toBe(size);
    expect((await collect(cipher.openObjectStream(KEY, pieces(sealed)))).equals(plain)).toBe(true);
  });

  it('round-trips any bytes however the stream is cut, sealed and opened (property)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 3 * CHUNK + 5 }), fc.array(fc.nat(), { maxLength: 6 }), fc.array(fc.nat(), { maxLength: 6 }), async (size, sealCuts, openCuts) => {
        const plain = randomBytes(size);
        const sealed = await seal(plain, sealCuts.map((cut) => cut % (size + 1)));
        const opened = await collect(cipher.openObjectStream(KEY, pieces(sealed, openCuts.map((cut) => cut % sealed.length))));
        expect(opened.equals(plain)).toBe(true);
      }),
      { numRuns: 40 },
    );
  });

  it('never stores the plaintext, and two seals of the same bytes differ', async () => {
    const plain = Buffer.from('ISA*00*SYNTHETIC PATIENT NAME*'.repeat(5000));
    const [one, two] = await Promise.all([seal(plain), seal(plain)]);
    expect(one.includes(Buffer.from('SYNTHETIC PATIENT NAME'))).toBe(false);
    expect(one.equals(two)).toBe(false);
  });

  it('opens nothing for another practice, another key or another object key', async () => {
    const sealed = await seal(randomBytes(CHUNK + 10));
    await expect(collect(new PracticeCipher(PRACTICE_B, randomBytes(32)).openObjectStream(KEY, pieces(sealed)))).rejects.toThrow(CiphertextError);
    await expect(collect(new PracticeCipher(PRACTICE_A, randomBytes(32)).openObjectStream(KEY, pieces(sealed)))).rejects.toThrow(CiphertextError);
    await expect(collect(cipher.openObjectStream(`${KEY}x`, pieces(sealed)))).rejects.toThrow(CiphertextError);
    await expect(collect(cipher.openObjectStream('', pieces(sealed)))).rejects.toThrow(/sealed under its key/);
  });

  it('detects a stream cut short, at a chunk boundary or inside a chunk, and a reordered or altered one', async () => {
    const plain = randomBytes(3 * CHUNK + 100);
    const sealed = await seal(plain);
    const sealedChunk = CHUNK + 16;
    // Without its last chunk: the chunk before it was sealed as not the last.
    await expect(collect(cipher.openObjectStream(KEY, pieces(sealed.subarray(0, SEALED_STREAM_HEADER_BYTES + 3 * sealedChunk))))).rejects.toThrow(CiphertextError);
    await expect(collect(cipher.openObjectStream(KEY, pieces(sealed.subarray(0, sealed.length - 1))))).rejects.toThrow(CiphertextError);
    await expect(collect(cipher.openObjectStream(KEY, pieces(sealed.subarray(0, SEALED_STREAM_HEADER_BYTES + 5))))).rejects.toThrow(/truncated/);
    await expect(collect(cipher.openObjectStream(KEY, pieces(sealed.subarray(0, 10))))).rejects.toThrow(/truncated/);
    const swapped = Buffer.concat([
      sealed.subarray(0, SEALED_STREAM_HEADER_BYTES),
      sealed.subarray(SEALED_STREAM_HEADER_BYTES + sealedChunk, SEALED_STREAM_HEADER_BYTES + 2 * sealedChunk),
      sealed.subarray(SEALED_STREAM_HEADER_BYTES, SEALED_STREAM_HEADER_BYTES + sealedChunk),
      sealed.subarray(SEALED_STREAM_HEADER_BYTES + 2 * sealedChunk),
    ]);
    await expect(collect(cipher.openObjectStream(KEY, pieces(swapped)))).rejects.toThrow(CiphertextError);
    const flipped = Buffer.from(sealed);
    flipped[SEALED_STREAM_HEADER_BYTES + 10] = (flipped[SEALED_STREAM_HEADER_BYTES + 10] ?? 0) ^ 1;
    await expect(collect(cipher.openObjectStream(KEY, pieces(flipped)))).rejects.toThrow(CiphertextError);
    const renamed = Buffer.from(sealed);
    renamed.write('TPO3', 0, 'ascii');
    await expect(collect(cipher.openObjectStream(KEY, pieces(renamed)))).rejects.toThrow(/not a sealed TPO2 stream/);
    const resized = Buffer.from(sealed);
    resized.writeUInt32BE(CHUNK / 2, 4);
    await expect(collect(cipher.openObjectStream(KEY, pieces(resized)))).rejects.toThrow(/unsupported chunk size/);
  });

  it('opens any byte range by decrypting only the chunks it touches (random access)', async () => {
    const plain = randomBytes(4 * CHUNK + 333);
    const sealed = await seal(plain);
    const layout = new SealedStreamLayout(sealed.subarray(0, SEALED_STREAM_HEADER_BYTES), sealed.length);
    expect(layout.chunkCount).toBe(5);
    expect(layout.chunkBytes).toBe(CHUNK);
    const read = (start: number, end: number): Buffer => {
      const first = Math.floor(start / CHUNK);
      const last = Math.floor((end - 1) / CHUNK);
      const parts: Buffer[] = [];
      for (let index = first; index <= last; index += 1) {
        const range = layout.sealedRange(index, index);
        parts.push(cipher.openObjectChunk(KEY, layout, index, sealed.subarray(range.start, range.end)));
      }
      return Buffer.concat(parts).subarray(start - first * CHUNK, end - first * CHUNK);
    };
    for (const [start, end] of [
      [0, 1],
      [CHUNK - 3, CHUNK + 3],
      [2 * CHUNK, 4 * CHUNK + 333],
      [4 * CHUNK + 300, 4 * CHUNK + 333],
    ] as const) {
      expect(read(start, end).equals(plain.subarray(start, end)), `${String(start)}-${String(end)}`).toBe(true);
    }
    const range = layout.sealedRange(1, 1);
    // A chunk opened at the wrong index, or cut, or past the end, is refused.
    expect(() => cipher.openObjectChunk(KEY, layout, 2, sealed.subarray(range.start, range.end))).toThrow(CiphertextError);
    expect(() => cipher.openObjectChunk(KEY, layout, 1, sealed.subarray(range.start, range.end - 1))).toThrow(/out of place/);
    expect(() => cipher.openObjectChunk(KEY, layout, 5, sealed.subarray(range.start, range.end))).toThrow(/out of place/);
    expect(() => cipher.openObjectChunk(KEY, layout, -1, sealed.subarray(range.start, range.end))).toThrow(/out of place/);
  });

  it('refuses a layout for anything but a whole TPO2 stream', async () => {
    const sealed = await seal(randomBytes(10));
    const header = sealed.subarray(0, SEALED_STREAM_HEADER_BYTES);
    expect(() => new SealedStreamLayout(header.subarray(0, 8), sealed.length)).toThrow(/not a sealed TPO2 stream/);
    expect(() => new SealedStreamLayout(header, SEALED_STREAM_HEADER_BYTES + 15)).toThrow(/truncated/);
    expect(() => new SealedStreamLayout(header, SEALED_STREAM_HEADER_BYTES + CHUNK + 16 + 3)).toThrow(/truncated/);
    expect(() => new SealedStreamLayout(header, Number.NaN)).toThrow(/truncated/);
  });
});
