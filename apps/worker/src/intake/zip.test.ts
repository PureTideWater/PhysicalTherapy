import { readFileSync } from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';
import { ZipFile } from 'yazl';

import { collect } from '../storage/documents';
import { buildZip, type TestEntry } from './test-support/zip-writer';
import { sealedReader } from './test-support/memory-bytes';
import { type ZipLimits, ZIP_LIMITS, ZipEntryError, inspectZip, unsafeEntry, zipEntries } from './zip';

const FIXTURES = path.resolve(import.meta.dirname, '../../../../fixtures/synthetic');
const MIB = 1024 * 1024;

const text = (value: string) => Buffer.from(value, 'utf8');

/** Inspects and expands a zip held sealed in memory: each file entry's hold, or its bytes. */
async function expand(zip: Buffer, limits: ZipLimits = ZIP_LIMITS) {
  const { reader } = await sealedReader(zip);
  const inspection = await inspectZip(reader, limits);
  if (inspection.kind === 'refused') {
    return { inspection, entries: [] };
  }
  const entries: { index: number; hold?: string; bytes?: Buffer; error?: string }[] = [];
  for await (const entry of zipEntries(reader, inspection.inventory)) {
    if (entry.hold !== undefined) {
      entries.push({ index: entry.index, hold: entry.hold });
      continue;
    }
    try {
      entries.push({ index: entry.index, bytes: await collect(entry.open()) });
    } catch (error) {
      entries.push({ index: entry.index, error: (error as Error).message });
    }
  }
  return { inspection, entries };
}

describe('zip expansion', () => {
  it('yields every file entry in order, stored or deflated, and skips directories', async () => {
    const zip = buildZip([
      { name: 'remits/', data: Buffer.alloc(0), method: 0 },
      { name: 'remits/a.835', data: text('ISA*first') },
      { name: 'remits/b.835', data: text('ISA*second'), method: 0 },
    ]);
    const { inspection, entries } = await expand(zip);
    expect(inspection).toMatchObject({ kind: 'zip', inventory: { fileEntries: 2, spreadsheet: false } });
    expect(entries).toEqual([
      { index: 1, bytes: text('ISA*first') },
      { index: 2, bytes: text('ISA*second') },
    ]);
  });

  it('reads zips another writer made (yazl), stored, deflated and in Zip64 form, as the 2 GiB uploads will be', async () => {
    const written = async (zip64: boolean): Promise<Buffer> => {
      const zip = new ZipFile();
      zip.addEmptyDirectory('remits/');
      zip.addBuffer(text('ISA*deflated*'.repeat(400)), 'remits/a.835', { compress: true, forceZip64Format: zip64 });
      zip.addBuffer(text('ISA*stored'), 'remits/b.835', { compress: false, forceZip64Format: zip64 });
      zip.end({ forceZip64Format: zip64, comment: '' });
      const parts: Buffer[] = [];
      for await (const part of zip.outputStream) {
        parts.push(Buffer.from(part));
      }
      return Buffer.concat(parts);
    };
    for (const zip64 of [false, true]) {
      const bytes = await written(zip64);
      // The Zip64 end of central directory record, there only when asked for.
      expect(bytes.includes(Buffer.from([0x50, 0x4b, 0x06, 0x06]))).toBe(zip64);
      const { inspection, entries } = await expand(bytes);
      expect(inspection, `zip64 ${String(zip64)}`).toMatchObject({ kind: 'zip', inventory: { fileEntries: 2, spreadsheet: false, holds: new Map() } });
      expect(entries).toEqual([
        { index: 1, bytes: text('ISA*deflated*'.repeat(400)) },
        { index: 2, bytes: text('ISA*stored') },
      ]);
    }
  });

  it('reads the five hundred entries of PAR-27 one at a time, the cut-off one included (the parser holds it)', async () => {
    const zip = readFileSync(path.join(FIXTURES, 'PAR-27/batch.zip'));
    const { inspection, entries } = await expand(zip);
    expect(inspection).toMatchObject({ kind: 'zip', inventory: { fileEntries: 500 } });
    expect(entries).toHaveLength(500);
    expect(entries.every((entry) => entry.bytes?.subarray(0, 3).toString('latin1') === 'ISA')).toBe(true);
  });

  it('reads both entries of PAR-28, whose first is an executable under an 835’s name (intake quarantines it)', async () => {
    const zip = readFileSync(path.join(FIXTURES, 'PAR-28/upload.zip'));
    const { entries } = await expand(zip);
    expect(entries.map((entry) => entry.bytes?.subarray(0, 4).toString('latin1'))).toEqual(['\u007fELF', 'ISA*']);
  });

  it('holds entries with unsafe paths or links, and reads the others', async () => {
    const unicodePath = (name: string) => {
      const data = Buffer.concat([Buffer.from([1, 0, 0, 0, 0]), text(name)]);
      const header = Buffer.alloc(4);
      header.writeUInt16LE(0x7075, 0);
      header.writeUInt16LE(data.length, 2);
      return Buffer.concat([header, data]);
    };
    const entries: TestEntry[] = [
      { name: '../outside.835', data: text('a') },
      { name: '/etc/absolute.835', data: text('b') },
      { name: 'C:/drive.835', data: text('c') },
      { name: 'back\\slash.835', data: text('d') },
      { name: 'deep/../../up.835', data: text('e') },
      { name: Buffer.from('nul\u0000.835', 'latin1'), data: text('f') },
      { name: 'link.835', data: text('/etc/passwd'), externalAttributes: 0o120777 << 16 },
      { name: 'innocent.835', data: text('g'), extra: unicodePath('../hidden.835') },
      { name: 'fine.835', data: text('ISA*fine') },
    ];
    const { entries: expanded } = await expand(buildZip(entries));
    expect(expanded.map((entry) => entry.hold ?? 'read')).toEqual([...Array.from({ length: 8 }, () => 'unsafe_entry'), 'read']);
    expect(expanded.at(-1)?.bytes).toEqual(text('ISA*fine'));
    expect(unsafeEntry({ fileName: text('') as never, extraFields: [], externalFileAttributes: 0 })).toBe(true);
  });

  it('holds encrypted entries, unknown compression methods and stored entries whose sizes disagree', async () => {
    const { entries } = await expand(
      buildZip([
        { name: 'locked.835', data: text('secret'), flags: 0x01 },
        { name: 'bzip2.835', data: text('x'), recordedMethod: 12 },
        { name: 'stored.835', data: text('stored'), method: 0, uncompressedSize: 9 },
        { name: 'fine.835', data: text('ok') },
      ]),
    );
    expect(entries.map((entry) => entry.hold ?? 'read')).toEqual(['encrypted', 'unreadable', 'unreadable', 'read']);
  });

  it('holds an entry larger than the limit, and the entries past the zip’s total, and reads the rest', async () => {
    const limits: ZipLimits = { ...ZIP_LIMITS, maxEntryBytes: 1000, maxTotalBytes: 2500 };
    const { entries } = await expand(
      buildZip([
        { name: 'a.835', data: Buffer.alloc(900, 0x41) },
        { name: 'big.835', data: Buffer.alloc(1001, 0x42) },
        { name: 'b.835', data: Buffer.alloc(900, 0x43) },
        { name: 'c.835', data: Buffer.alloc(900, 0x44) },
        { name: 'd.835', data: Buffer.alloc(600, 0x45) },
      ]),
      limits,
    );
    expect(entries.map((entry) => entry.hold ?? entry.bytes?.length)).toEqual([900, 'too_large', 900, 'too_large', 600]);
  });

  it('holds an entry compressed beyond the ratio limit (a zip bomb), but not a small one', async () => {
    const { entries } = await expand(
      buildZip([
        { name: 'bomb.835', data: Buffer.alloc(4 * MIB) },
        { name: 'spaces.835', data: Buffer.alloc(64 * 1024, 0x20) },
      ]),
    );
    expect(entries.map((entry) => entry.hold ?? entry.bytes?.length)).toEqual(['too_compressed', 64 * 1024]);
    // A ratio limit of 10 holds a 2 MiB entry that compresses 1000 to 1.
    const strict = await expand(buildZip([{ name: 'zeros.835', data: Buffer.alloc(2 * MIB) }]), { ...ZIP_LIMITS, maxRatio: 10 });
    expect(strict.entries).toEqual([{ index: 0, hold: 'too_compressed' }]);
    const empty = await expand(buildZip([{ name: 'empty.835', data: Buffer.alloc(2 * MIB), compressedSize: 0 }]));
    expect(empty.entries).toEqual([{ index: 0, hold: 'too_compressed' }]);
  });

  it('refuses a zip of many small, highly compressible entries: the archive as a whole is held to the ratio limit', async () => {
    // Each entry is exactly the floor (1 MiB of zeros), so none is held for its own ratio; together they
    // would expand to hundreds of times the zip's size.
    const zeros = Buffer.alloc(MIB);
    const bomb = buildZip(Array.from({ length: 300 }, (_, at) => ({ name: `zeros-${String(at)}.835`, data: zeros })));
    expect(300 * MIB).toBeGreaterThan(bomb.length * ZIP_LIMITS.maxRatio);
    expect((await expand(bomb)).inspection).toEqual({ kind: 'refused', reason: 'too_compressed' });
    // The same entries under a ratio the archive keeps are read.
    const { inspection } = await expand(buildZip(Array.from({ length: 3 }, (_, at) => ({ name: `zeros-${String(at)}.835`, data: zeros }))), { ...ZIP_LIMITS, maxRatio: 10_000 });
    expect(inspection).toMatchObject({ kind: 'zip', inventory: { fileEntries: 3, holds: new Map() } });
    // Held entries are never read, so they do not count against the archive.
    const held = buildZip([{ name: 'bomb.835', data: Buffer.alloc(4 * MIB) }, { name: 'fine.835', data: text('ISA*fine') }]);
    expect((await expand(held)).inspection).toMatchObject({ kind: 'zip' });
  });

  it('refuses a zip with more file entries than the limit, before reading any of them', async () => {
    const files = (count: number): TestEntry[] => Array.from({ length: count }, (_, at) => ({ name: `f${String(at)}.835`, data: text('x') }));
    const limits = { ...ZIP_LIMITS, maxEntries: 3 };
    expect((await expand(buildZip(files(4)), limits)).inspection).toEqual({ kind: 'refused', reason: 'too_many_entries' });
    expect((await expand(buildZip(files(7)), limits)).inspection).toEqual({ kind: 'refused', reason: 'too_many_entries' });
    expect((await expand(buildZip([{ name: 'dir/', data: Buffer.alloc(0), method: 0 }, ...files(3)]), limits)).inspection.kind).toBe('zip');
  });

  it('refuses a zip whose entries overlap or claim more compressed bytes than it holds', async () => {
    const overlap = buildZip([
      { name: 'a.835', data: Buffer.alloc(5000, 0x61) },
      { name: 'b.835', data: Buffer.alloc(5000, 0x61), sameDataAs: 0 },
    ]);
    expect((await expand(overlap)).inspection).toEqual({ kind: 'refused', reason: 'too_compressed' });
    const claims = buildZip([{ name: 'a.835', data: text('abc'), compressedSize: 10_000_000 }]);
    expect((await expand(claims)).inspection).toEqual({ kind: 'refused', reason: 'too_compressed' });
  });

  it('refuses what is not a readable zip', async () => {
    expect((await expand(Buffer.from('PK\u0003\u0004 and nothing else', 'latin1'))).inspection).toEqual({ kind: 'refused', reason: 'unreadable' });
    const whole = buildZip([{ name: 'a.835', data: text('abc') }]);
    expect((await expand(whole.subarray(0, whole.length - 10))).inspection).toEqual({ kind: 'refused', reason: 'unreadable' });
    // A central directory record yauzl cannot read (strong encryption) leaves the zip unreadable.
    expect((await expand(buildZip([{ name: 'a.835', data: text('abc'), flags: 0x41 }]))).inspection).toEqual({ kind: 'refused', reason: 'unreadable' });
  });

  it('tells a workbook (xlsx) from a zip of files', async () => {
    const workbook = buildZip([
      { name: '[Content_Types].xml', data: text('<Types/>') },
      { name: 'xl/workbook.xml', data: text('<workbook/>') },
    ]);
    expect((await expand(workbook)).inspection).toMatchObject({ kind: 'zip', inventory: { spreadsheet: true } });
  });

  it('fails an entry whose data is damaged, lies about its size or CRC-32, or whose local header is gone; the next one still reads', async () => {
    const good = text('ISA*good');
    const damaged = buildZip([{ name: 'damaged.835', data: Buffer.alloc(10_000, 0x61) }, { name: 'good.835', data: good }]);
    // Corrupt the deflate stream of the first entry (it starts after its 30-byte header and name).
    damaged.fill(0xff, 30 + 'damaged.835'.length, 30 + 'damaged.835'.length + 8);
    const lies = buildZip([
      { name: 'crc.835', data: text('abc'), crc32: 1234 },
      { name: 'short.835', data: text('abcdef'), uncompressedSize: 3 },
      { name: 'long.835', data: text('abc'), uncompressedSize: 30 },
      { name: 'good.835', data: good },
    ]);
    const headerless = buildZip([{ name: 'gone.835', data: text('abc') }, { name: 'good.835', data: good }]);
    headerless.writeUInt32LE(0, 0);
    expect((await expand(damaged)).entries).toEqual([
      { index: 0, error: 'the entry’s data is damaged' },
      { index: 1, bytes: good },
    ]);
    expect((await expand(lies)).entries).toEqual([
      { index: 0, error: 'the entry’s CRC-32 does not match its bytes' },
      { index: 1, error: 'the entry inflates past its declared size' },
      { index: 2, error: 'the entry ends before its declared size' },
      { index: 3, bytes: good },
    ]);
    expect((await expand(headerless)).entries).toEqual([
      { index: 0, error: 'the entry’s local header is damaged' },
      { index: 1, bytes: good },
    ]);
  });

  it('never reads a held entry, and reads an entry once', async () => {
    const { reader } = await sealedReader(buildZip([{ name: 'locked.835', data: text('x'), flags: 1 }, { name: 'a.835', data: text('a') }]));
    const inspection = await inspectZip(reader);
    if (inspection.kind !== 'zip') {
      throw new Error('expected a zip');
    }
    for await (const entry of zipEntries(reader, inspection.inventory)) {
      if (entry.hold === undefined) {
        await collect(entry.open());
      }
      await expect(collect(entry.open())).rejects.toThrow(ZipEntryError);
    }
  });

  it('holds stored entries too large for their ratio only above the floor', async () => {
    const deflated = deflateRawSync(Buffer.alloc(100));
    expect(deflated.length).toBeLessThan(100);
    const { entries } = await expand(buildZip([{ name: 'small.835', data: Buffer.alloc(100) }]), { ...ZIP_LIMITS, maxRatio: 2 });
    expect(entries).toEqual([{ index: 0, bytes: Buffer.alloc(100) }]);
  });
});
