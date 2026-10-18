import { crc32, deflateRawSync } from 'node:zlib';

/**
 * A small zip writer for the intake tests: well-formed zips, and zips with exactly the defects the
 * expansion must survive (unsafe names, links, encryption flags, unknown methods, lying sizes and
 * CRCs, overlapping entries), which a real zip tool refuses to write. Synthetic data only.
 */

export interface TestEntry {
  readonly name: string | Buffer;
  readonly data: Buffer;
  /** 0 stored, 8 deflate (the default). */
  readonly method?: 0 | 8;
  /** The method recorded in the headers, when it should differ from how the data was written. */
  readonly recordedMethod?: number;
  readonly flags?: number;
  readonly externalAttributes?: number;
  /** Values the central directory claims, when they should differ from the truth. */
  readonly crc32?: number;
  readonly uncompressedSize?: number;
  readonly compressedSize?: number;
  /** Point the central directory at another entry's local header (an overlap). */
  readonly sameDataAs?: number;
  readonly extra?: Buffer;
}

function localHeader(name: Buffer, method: number, flags: number, crc: number, compressed: number, uncompressed: number, extra: Buffer): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(flags, 6);
  header.writeUInt16LE(method, 8);
  header.writeUInt32LE(0, 10);
  header.writeUInt32LE(crc >>> 0, 14);
  header.writeUInt32LE(compressed, 18);
  header.writeUInt32LE(uncompressed, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(extra.length, 28);
  return Buffer.concat([header, name, extra]);
}

function centralHeader(name: Buffer, method: number, flags: number, crc: number, compressed: number, uncompressed: number, offset: number, attributes: number, extra: Buffer): Buffer {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE((3 << 8) | 20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(flags, 8);
  header.writeUInt16LE(method, 10);
  header.writeUInt32LE(0, 12);
  header.writeUInt32LE(crc >>> 0, 16);
  header.writeUInt32LE(compressed, 20);
  header.writeUInt32LE(uncompressed, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(extra.length, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(attributes >>> 0, 38);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, name, extra]);
}

function endOfDirectory(entries: number, size: number, offset: number): Buffer {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries, 8);
  end.writeUInt16LE(entries, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return end;
}

/** A whole zip in memory, from entries that may lie about themselves. */
export function buildZip(entries: readonly TestEntry[]): Buffer {
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  const offsets: number[] = [];
  let cursor = 0;
  for (const entry of entries) {
    const name = typeof entry.name === 'string' ? Buffer.from(entry.name, 'utf8') : entry.name;
    const method = entry.method ?? 8;
    const body = method === 8 ? deflateRawSync(entry.data) : entry.data;
    const crc = entry.crc32 ?? crc32(entry.data);
    const recorded = entry.recordedMethod ?? method;
    const flags = entry.flags ?? 0;
    const extra = entry.extra ?? Buffer.alloc(0);
    const local = localHeader(name, recorded, flags, crc, body.length, entry.data.length, extra);
    offsets.push(cursor);
    const offset = entry.sameDataAs === undefined ? cursor : (offsets[entry.sameDataAs] ?? 0);
    if (entry.sameDataAs === undefined) {
      parts.push(local, body);
      cursor += local.length + body.length;
    }
    directory.push(centralHeader(name, recorded, flags, crc, entry.compressedSize ?? body.length, entry.uncompressedSize ?? entry.data.length, offset, entry.externalAttributes ?? 0o100644 << 16, extra));
  }
  const central = Buffer.concat(directory);
  return Buffer.concat([...parts, central, endOfDirectory(entries.length, central.length, cursor)]);
}

export interface StreamedEntry {
  readonly name: string;
  /** The entry's bytes, generated on demand. */
  readonly chunks: () => Iterable<Buffer> | AsyncIterable<Buffer>;
}

/**
 * A zip of stored entries written as a stream, entry by entry, without holding any entry: each entry's
 * sizes and CRC-32 follow its data in a data descriptor, as streaming zip tools write them.
 */
export async function* streamZip(entries: Iterable<StreamedEntry> | AsyncIterable<StreamedEntry>): AsyncGenerator<Buffer> {
  const directory: Buffer[] = [];
  let cursor = 0;
  let count = 0;
  for await (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const local = localHeader(name, 0, 0x08, 0, 0, 0, Buffer.alloc(0));
    const offset = cursor;
    yield local;
    cursor += local.length;
    let crc = 0;
    let size = 0;
    for await (const chunk of entry.chunks()) {
      crc = crc32(chunk, crc);
      size += chunk.length;
      yield chunk;
    }
    cursor += size;
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc >>> 0, 4);
    descriptor.writeUInt32LE(size, 8);
    descriptor.writeUInt32LE(size, 12);
    yield descriptor;
    cursor += descriptor.length;
    directory.push(centralHeader(name, 0, 0x08, crc, size, size, offset, 0o100644 << 16, Buffer.alloc(0)));
    count += 1;
  }
  const central = Buffer.concat(directory);
  yield central;
  yield endOfDirectory(count, central.length, cursor);
}
