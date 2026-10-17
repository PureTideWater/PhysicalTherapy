/**
 * A bounded zip reader for the fixture guard: the central directory, stored and deflated entries, and
 * caps on the entry count and on what is inflated, checked before and while inflating, so a crafted
 * archive cannot make the guard exhaust memory. Anything it does not read (zip64, several disks,
 * encryption, another method, sizes that disagree) is an ArchiveReadError, and the guard refuses the
 * file: it fails closed. formats/zip.ts stays the writer's own deterministic, stored-only reader.
 */
import { inflateRawSync } from 'node:zlib';

export class ArchiveReadError extends Error {
  override readonly name = 'ArchiveReadError';
}

export interface ArchiveLimits {
  readonly maxEntries: number;
  /** The most one entry may inflate to. */
  readonly maxEntryBytes: number;
  /** The most all the entries read from one archive may inflate to together. */
  readonly maxTotalBytes: number;
}

export const ARCHIVE_LIMITS: ArchiveLimits = { maxEntries: 10_000, maxEntryBytes: 64 * 1024 * 1024, maxTotalBytes: 256 * 1024 * 1024 };

interface CentralEntry {
  readonly name: string;
  readonly flags: number;
  readonly method: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly localOffset: number;
}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const END_LENGTH = 22;

/** True when the bytes begin with a zip's local file header. */
export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && Buffer.from(bytes.buffer, bytes.byteOffset, 4).readUInt32LE(0) === LOCAL;
}

function endOfCentralDirectory(buffer: Buffer): number {
  const earliest = Math.max(0, buffer.length - END_LENGTH - 0xffff);
  for (let offset = buffer.length - END_LENGTH; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END) {
      return offset;
    }
  }
  throw new ArchiveReadError('the archive has no end of central directory');
}

/** An archive's entries by name, read lazily and within the limits. */
export class Archive {
  private readonly buffer: Buffer;
  private readonly entries: readonly CentralEntry[];
  private inflated = 0;

  constructor(
    bytes: Uint8Array,
    private readonly limits: ArchiveLimits = ARCHIVE_LIMITS,
  ) {
    this.buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.entries = this.readCentralDirectory();
  }

  private readCentralDirectory(): CentralEntry[] {
    const buffer = this.buffer;
    if (buffer.length < END_LENGTH) {
      throw new ArchiveReadError('the archive is truncated');
    }
    const end = endOfCentralDirectory(buffer);
    const disk = buffer.readUInt16LE(end + 4);
    const centralDisk = buffer.readUInt16LE(end + 6);
    const count = buffer.readUInt16LE(end + 10);
    const offset = buffer.readUInt32LE(end + 16);
    if (disk !== 0 || centralDisk !== 0) {
      throw new ArchiveReadError('the archive spans several disks');
    }
    if (count === 0xffff || offset === 0xffffffff) {
      throw new ArchiveReadError('the archive is a zip64 archive');
    }
    if (count > this.limits.maxEntries) {
      throw new ArchiveReadError(`the archive has more than ${String(this.limits.maxEntries)} entries`);
    }
    const entries: CentralEntry[] = [];
    let position = offset;
    for (let index = 0; index < count; index += 1) {
      if (position + 46 > end || buffer.readUInt32LE(position) !== CENTRAL) {
        throw new ArchiveReadError('the central directory is malformed');
      }
      const flags = buffer.readUInt16LE(position + 8);
      const nameLength = buffer.readUInt16LE(position + 28);
      const extraLength = buffer.readUInt16LE(position + 30);
      const commentLength = buffer.readUInt16LE(position + 32);
      if (position + 46 + nameLength > end) {
        throw new ArchiveReadError('the central directory is malformed');
      }
      entries.push({
        name: buffer.toString((flags & 0x800) === 0 ? 'latin1' : 'utf8', position + 46, position + 46 + nameLength),
        flags,
        method: buffer.readUInt16LE(position + 10),
        compressedSize: buffer.readUInt32LE(position + 20),
        size: buffer.readUInt32LE(position + 24),
        localOffset: buffer.readUInt32LE(position + 42),
      });
      position += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  /** The entries' names, directories left out, in the archive's order. */
  names(): string[] {
    return this.entries.filter((entry) => !entry.name.endsWith('/')).map((entry) => entry.name);
  }

  /** One entry's bytes, inflated within the limits; undefined when the archive has no such entry. */
  read(name: string): Uint8Array | undefined {
    const entry = this.entries.find((candidate) => candidate.name === name);
    if (entry === undefined) {
      return undefined;
    }
    if ((entry.flags & 0x1) !== 0) {
      throw new ArchiveReadError('an entry is encrypted');
    }
    if (entry.size > this.limits.maxEntryBytes || this.inflated + entry.size > this.limits.maxTotalBytes) {
      throw new ArchiveReadError('an entry inflates past the guard’s limit');
    }
    const buffer = this.buffer;
    const local = entry.localOffset;
    if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== LOCAL) {
      throw new ArchiveReadError('an entry’s local header is missing');
    }
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    if (start + entry.compressedSize > buffer.length) {
      throw new ArchiveReadError('an entry is truncated');
    }
    const data = buffer.subarray(start, start + entry.compressedSize);
    let out: Buffer;
    if (entry.method === 0) {
      out = data;
    } else if (entry.method === 8) {
      try {
        out = inflateRawSync(data, { maxOutputLength: Math.max(1, entry.size) });
      } catch {
        throw new ArchiveReadError('an entry does not inflate to its stated size');
      }
    } else {
      throw new ArchiveReadError('an entry is compressed with a method other than stored or deflate');
    }
    if (out.length !== entry.size) {
      throw new ArchiveReadError('an entry does not inflate to its stated size');
    }
    this.inflated += out.length;
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  }
}
