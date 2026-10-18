/**
 * A deterministic zip writer: stored (uncompressed) entries with a fixed timestamp, so the archive's
 * bytes are the same on every machine and Node version (deflate output can differ between zlib
 * builds). Enough for the intake fixtures (test matrix PAR-27, PAR-28).
 */
import { crc32 } from 'node:zlib';

export interface ZipEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** 2026-01-01 00:00:00 in MS-DOS date and time. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

export function writeZip(entries: readonly ZipEntry[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(entry.name) || entry.name.split('/').includes('..')) {
      throw new Error('zip entry names are plain ASCII relative paths');
    }
    const name = Buffer.from(entry.name, 'ascii');
    const data = Buffer.from(entry.bytes);
    const checksum = crc32(data);
    const common = Buffer.concat([u16(10), u16(0), u16(0), u16(DOS_TIME), u16(DOS_DATE), u32(checksum), u32(data.length), u32(data.length), u16(name.length), u16(0)]);
    const local = Buffer.concat([u32(0x04034b50), common, name, data]);
    centrals.push(Buffer.concat([u32(0x02014b50), u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    locals.push(local);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(central.length), u32(offset), u16(0)]);
  return new Uint8Array(Buffer.concat([...locals, central, end]));
}

/** Reads back the entries of an archive this module wrote (stored entries only). */
export function readZip(archive: Uint8Array): ZipEntry[] {
  const buffer = Buffer.from(archive);
  const entries: ZipEntry[] = [];
  let offset = 0;
  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    if (method !== 0) {
      throw new Error('only stored entries are read');
    }
    const start = offset + 30 + nameLength + extraLength;
    entries.push({ name: buffer.toString('ascii', offset + 30, offset + 30 + nameLength), bytes: new Uint8Array(buffer.subarray(start, start + size)) });
    offset = start + size;
  }
  return entries;
}
