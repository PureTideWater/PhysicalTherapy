import { Readable } from 'node:stream';
import { crc32 } from 'node:zlib';

import yauzl from 'yauzl';

import type { DocumentReader } from '../storage/documents';

/**
 * Zip expansion with limits (PRD 6, Intake and documents: "a 2 GB zip of 835s uploads and queues per
 * file"; PRD 10, Pipeline step 2: "zips are expanded one entry at a time with path and size limits and
 * each entry becomes its own document"; PRD 16, Upload safety: zip limits, a zip bomb fixture; test
 * matrix PAR-27, PAR-28).
 *
 * The zip is read from its sealed document by random access (yauzl over DocumentReader): the central
 * directory first, in small cached reads, then each entry's bytes as one stream, inflated as they pass.
 * Nothing holds more than one entry's current chunk, whatever the zip's size (docs/adr/0026 has the
 * arithmetic for 2 GiB). Two passes over the central directory:
 *
 * 1. inspectZip: the entry count, overlapping entries, the sum of compressed sizes and the archive's
 *    own ratio (the uncompressed bytes it would expand to against its size: many small, highly
 *    compressible entries are a zip bomb too), each of which refuses the whole zip, whether it is
 *    really a workbook (xlsx), and each entry's
 *    hold under the limits: an unsafe name (absolute, a drive, a .. segment, a backslash, a NUL) or a
 *    link, encryption, a compression method other than stored or deflate, a stored entry whose sizes
 *    disagree, an entry larger than maxEntryBytes, a ratio beyond maxRatio, or the running total past
 *    maxTotalBytes. A held entry is never read.
 * 2. zipEntries: every file entry in central-directory order, with its hold, and for the others a
 *    stream of its bytes that fails (ZipEntryError) if the entry inflates to more or fewer bytes than
 *    it declared or its CRC-32 differs. A bad entry fails alone; the next one is read as usual.
 *
 * Entry names are checked, never used: entries are stored under opaque keys (SEC-08).
 */

export interface ZipLimits {
  /** File entries a zip may hold; one more and the zip is not expanded at all. */
  readonly maxEntries: number;
  /** An entry's uncompressed size. */
  readonly maxEntryBytes: number;
  /** The sum of the entries' uncompressed sizes; entries past it are held. */
  readonly maxTotalBytes: number;
  /** Uncompressed bytes per compressed byte: for entries above ratioFloorBytes, and for the zip as a whole. */
  readonly maxRatio: number;
  /** Entries this small are not held for their ratio (a short run of spaces compresses well). */
  readonly ratioFloorBytes: number;
}

const MIB = 1024 * 1024;

/** The production limits: room for a 2 GiB zip of 835s compressed 30 to 1, nothing like a zip bomb. */
export const ZIP_LIMITS: ZipLimits = {
  maxEntries: 50_000,
  maxEntryBytes: 256 * MIB,
  maxTotalBytes: 64 * 1024 * MIB,
  maxRatio: 100,
  ratioFloorBytes: MIB,
};

/** Why an entry is held without being read. */
export type EntryHold = 'unsafe_entry' | 'encrypted' | 'too_large' | 'too_compressed' | 'unreadable';

/** Why a whole zip is not expanded. */
export type ZipRefusal = 'too_many_entries' | 'too_compressed' | 'unreadable';

export interface ZipInventory {
  /** File entries (directories are not documents). */
  readonly fileEntries: number;
  /** A workbook (xlsx and its kin) is a zip too; it is a document of its own, never expanded. */
  readonly spreadsheet: boolean;
  /** Holds by central-directory index. */
  readonly holds: ReadonlyMap<number, EntryHold>;
}

export type Inspection = { readonly kind: 'zip'; readonly inventory: ZipInventory } | { readonly kind: 'refused'; readonly reason: ZipRefusal };

export interface ZipEntry {
  /** The entry's position in the central directory: with the zip's ID, it names the entry's document. */
  readonly index: number;
  readonly uncompressedBytes: number;
  readonly hold: EntryHold | undefined;
  /** The entry's bytes, checked against its declared size and CRC-32 as they pass. */
  open(): AsyncIterable<Buffer>;
}

/** An entry's bytes could not be read as it declared them (corrupt data, a lying header). */
export class ZipEntryError extends Error {
  override readonly name = 'ZipEntryError';
}

/** The zip's central directory could not be read: the zip is unreadable. */
export class ZipReadError extends Error {
  override readonly name = 'ZipReadError';
}

/** yauzl's random access, served by the sealed document: small reads from its cache, ranges as streams. */
class DocumentRandomAccess extends yauzl.RandomAccessReader {
  constructor(private readonly document: DocumentReader) {
    super();
  }

  override _readStreamForRange(start: number, end: number): Readable {
    return Readable.from(this.document.stream(start, end), { objectMode: false });
  }

  override read(buffer: Buffer, offset: number, length: number, position: number, callback: (error: Error | null, bytesRead?: number) => void): void {
    this.document.read(position, position + length).then(
      (bytes) => {
        bytes.copy(buffer, offset);
        callback(null, bytes.length);
      },
      (error: unknown) => {
        callback(error instanceof Error ? error : new ZipReadError('the zip could not be read'));
      },
    );
  }
}

const OPTIONS: yauzl.Options = { lazyEntries: true, decodeStrings: false, validateEntrySizes: false, strictFileNames: false, autoClose: false };

async function openZip(document: DocumentReader): Promise<yauzl.ZipFile> {
  try {
    return await yauzl.fromRandomAccessReaderPromise(new DocumentRandomAccess(document), document.sizeBytes, OPTIONS);
  } catch {
    throw new ZipReadError('the zip has no readable central directory');
  }
}

/** Every central-directory record, in order; a record yauzl cannot read makes the whole zip unreadable. */
async function* records(zip: yauzl.ZipFile): AsyncGenerator<yauzl.Entry> {
  try {
    for await (const entry of zip.eachEntry()) {
      yield entry;
    }
  } catch (error) {
    if (error instanceof ZipReadError) {
      throw error;
    }
    throw new ZipReadError('the zip’s central directory is damaged');
  }
}

function rawName(entry: yauzl.Entry): Buffer {
  return entry.fileName as unknown as Buffer;
}

function isDirectory(entry: yauzl.Entry): boolean {
  const name = rawName(entry);
  return name.length > 0 && (name[name.length - 1] === 0x2f || name[name.length - 1] === 0x5c);
}

/** The names a zip tool might write the entry to: the raw name and an Info-ZIP Unicode path. */
function names(entry: yauzl.Entry): string[] {
  const found = [rawName(entry).toString('latin1')];
  for (const field of entry.extraFields) {
    if (field.id === 0x7075 && field.data.length > 5) {
      found.push(field.data.subarray(5).toString('utf8'));
    }
  }
  return found;
}

/** An entry a careless extractor could write outside its folder, or a link. */
export function unsafeEntry(entry: Pick<yauzl.Entry, 'fileName' | 'extraFields' | 'externalFileAttributes'>): boolean {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0o170000;
  if (unixMode === 0o120000) {
    return true;
  }
  return names(entry as yauzl.Entry).some(
    (name) => name === '' || name.includes('\u0000') || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.split('/').includes('..'),
  );
}

function holdFor(entry: yauzl.Entry, limits: ZipLimits, total: number): EntryHold | undefined {
  if (unsafeEntry(entry)) {
    return 'unsafe_entry';
  }
  if (entry.isEncrypted()) {
    return 'encrypted';
  }
  if ((entry.compressionMethod !== 0 && entry.compressionMethod !== 8) || (entry.compressionMethod === 0 && entry.compressedSize !== entry.uncompressedSize)) {
    return 'unreadable';
  }
  if (entry.uncompressedSize > limits.maxEntryBytes || total + entry.uncompressedSize > limits.maxTotalBytes) {
    return 'too_large';
  }
  if (entry.uncompressedSize > limits.ratioFloorBytes && entry.uncompressedSize > entry.compressedSize * limits.maxRatio) {
    return 'too_compressed';
  }
  return undefined;
}

/** The first pass: whether to expand the zip at all, and what each entry's hold is. */
export async function inspectZip(document: DocumentReader, limits: ZipLimits = ZIP_LIMITS): Promise<Inspection> {
  let zip: yauzl.ZipFile;
  try {
    zip = await openZip(document);
  } catch {
    return { kind: 'refused', reason: 'unreadable' };
  }
  try {
    if (zip.entryCount > limits.maxEntries * 2) {
      // Far beyond the limit even counting a directory record per file: not worth reading.
      return { kind: 'refused', reason: 'too_many_entries' };
    }
    const holds = new Map<number, EntryHold>();
    const extents: { start: number; end: number }[] = [];
    let fileEntries = 0;
    let compressed = 0;
    let total = 0;
    let workbook = 0;
    let index = 0;
    for await (const entry of records(zip)) {
      const position = index;
      index += 1;
      const name = rawName(entry).toString('latin1');
      if (name === '[Content_Types].xml' || name === 'xl/workbook.xml') {
        workbook += 1;
      }
      extents.push({ start: entry.relativeOffsetOfLocalHeader, end: entry.relativeOffsetOfLocalHeader + 30 + entry.fileNameLength + entry.compressedSize });
      compressed += entry.compressedSize;
      if (isDirectory(entry)) {
        continue;
      }
      fileEntries += 1;
      if (fileEntries > limits.maxEntries) {
        return { kind: 'refused', reason: 'too_many_entries' };
      }
      const hold = holdFor(entry, limits, total);
      if (hold === undefined) {
        total += entry.uncompressedSize;
      } else {
        holds.set(position, hold);
      }
    }
    // Entries that share or overlap their bytes, or more compressed bytes than the zip holds: a zip
    // bomb built from overlapping files. Refused whole. So is a zip whose readable entries expand to
    // more than maxRatio times its own size, however small each entry is (a zip bomb of many entries
    // under ratioFloorBytes).
    extents.sort((a, b) => a.start - b.start);
    const overlapping = extents.some((extent, at) => at > 0 && extent.start < (extents[at - 1] as { end: number }).end);
    if (overlapping || compressed > document.sizeBytes || total > document.sizeBytes * limits.maxRatio) {
      return { kind: 'refused', reason: 'too_compressed' };
    }
    return { kind: 'zip', inventory: { fileEntries, spreadsheet: workbook === 2, holds } };
  } catch {
    return { kind: 'refused', reason: 'unreadable' };
  } finally {
    zip.close();
  }
}

/** Counts an entry's inflated bytes and its CRC-32 against what it declared. */
async function* checked(source: AsyncIterable<Buffer>, entry: yauzl.Entry): AsyncGenerator<Buffer> {
  let bytes = 0;
  let crc = 0;
  try {
    for await (const part of source) {
      bytes += part.length;
      if (bytes > entry.uncompressedSize) {
        throw new ZipEntryError('the entry inflates past its declared size');
      }
      crc = crc32(part, crc);
      yield part;
    }
  } catch (error) {
    if (error instanceof ZipEntryError) {
      throw error;
    }
    throw new ZipEntryError('the entry’s data is damaged');
  }
  if (bytes !== entry.uncompressedSize) {
    throw new ZipEntryError('the entry ends before its declared size');
  }
  if (crc >>> 0 !== entry.crc32 >>> 0) {
    throw new ZipEntryError('the entry’s CRC-32 does not match its bytes');
  }
}

/** The second pass: each file entry, in central-directory order, one at a time. */
export async function* zipEntries(document: DocumentReader, inventory: ZipInventory): AsyncGenerator<ZipEntry> {
  const zip = await openZip(document);
  try {
    let index = 0;
    for await (const entry of records(zip)) {
      const position = index;
      index += 1;
      if (isDirectory(entry)) {
        continue;
      }
      const hold = inventory.holds.get(position);
      let opened = false;
      const open = async function* (): AsyncGenerator<Buffer> {
        if (hold !== undefined || opened) {
          throw new ZipEntryError('a held entry is never read, and an entry is read once');
        }
        opened = true;
        let stream: Readable;
        try {
          stream = await zip.openReadStreamPromise(entry);
        } catch {
          throw new ZipEntryError('the entry’s local header is damaged');
        }
        try {
          yield* checked(stream as AsyncIterable<Buffer>, entry);
        } finally {
          stream.destroy();
        }
      };
      yield { index: position, uncompressedBytes: entry.uncompressedSize, hold, open };
    }
  } finally {
    zip.close();
  }
}
