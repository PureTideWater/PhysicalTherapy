import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isRecordFile, listContentFiles, readRecordFile, readRelease, readSecondPassFile } from './content';
import { buildManifest, compareManifest, manifestSchema, serializeManifest } from './manifest';
import { serializeRecords, sha256 } from './records';
import { exampleRecord } from './testing';

let dir = '';

function write(file: string, text: string): void {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), text);
}

/** Writes a release directory with a matching manifest. */
function release(files: Record<string, string>, number = 3): void {
  for (const [file, text] of Object.entries(files)) {
    write(file, text);
  }
  const hashes = new Map(Object.entries(files).map(([file, text]) => [file, sha256(text)]));
  write('MANIFEST.json', serializeManifest(buildManifest(number, hashes)));
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'rules-content-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('manifests', () => {
  it('lists files in sorted order and compares them with what is present', () => {
    const manifest = buildManifest(1, new Map([['b.json', 'b'.repeat(64)], ['RELEASE.md', 'a'.repeat(64)]]));
    expect(Object.keys(manifest.files)).toEqual(['RELEASE.md', 'b.json']);
    expect(serializeManifest(manifest)).toMatch(/^\{\n {2}"release": 1,/);
    expect(compareManifest(manifest, new Map([['RELEASE.md', 'a'.repeat(64)], ['b.json', 'b'.repeat(64)]]))).toEqual([]);
    expect(
      compareManifest(
        manifest,
        new Map([
          ['b.json', 'c'.repeat(64)],
          ['extra.json', 'd'.repeat(64)],
        ]),
      ),
    ).toEqual(['RELEASE.md is listed in MANIFEST.json but missing', 'b.json does not match its SHA-256 in MANIFEST.json', 'extra.json is not listed in MANIFEST.json']);
  });

  it('refuses a manifest without files, with a bad number, or listing itself or an escaping path', () => {
    const hash = 'a'.repeat(64);
    expect(manifestSchema.safeParse({ release: 1, files: { 'a.json': hash } }).success).toBe(true);
    expect(manifestSchema.safeParse({ release: 1, files: {} }).success).toBe(false);
    expect(manifestSchema.safeParse({ release: 0, files: { 'a.json': hash } }).success).toBe(false);
    expect(manifestSchema.safeParse({ release: 1, files: { 'MANIFEST.json': hash } }).success).toBe(false);
    expect(manifestSchema.safeParse({ release: 1, files: { '../a.json': hash } }).success).toBe(false);
    expect(manifestSchema.safeParse({ release: 1, files: { 'a.json': 'nope' } }).success).toBe(false);
  });
});

describe('listContentFiles', () => {
  it('lists files recursively with forward slashes, marks links, and tolerates a missing directory', () => {
    write('b/c.json', '[]');
    write('a.md', '#');
    symlinkSync('/etc/hostname', path.join(dir, 'link.json'));
    expect(listContentFiles(dir)).toEqual([
      { path: 'a.md', symlink: false },
      { path: 'b/c.json', symlink: false },
      { path: 'link.json', symlink: true },
    ]);
    expect(listContentFiles(path.join(dir, 'missing'))).toEqual([]);
  });

  it('tells record files from second passes and manifests', () => {
    expect(isRecordFile('carc/2026/CARC.json')).toBe(true);
    expect(isRecordFile('carc/2026/records.second-pass.json')).toBe(false);
    expect(isRecordFile('MANIFEST.json')).toBe(false);
    expect(isRecordFile('carc/2026/CARC.review.md')).toBe(false);
  });
});

describe('readRecordFile', () => {
  it('reads valid records with where they live', () => {
    write('r.json', serializeRecords([exampleRecord('carc'), exampleRecord('rarc')]));
    const contents = readRecordFile(path.join(dir, 'r.json'), 'r.json');
    expect(contents.problems).toEqual([]);
    expect(contents.records.map((located) => located.where)).toEqual(['r.json record 1', 'r.json record 2']);
  });

  it.each([
    ['not JSON', '[', ['r.json: is not valid JSON']],
    ['not an array', '{}', ['r.json: must be a JSON array of rule records']],
    ['empty', '[]', ['r.json: holds no records']],
    ['an invalid record', JSON.stringify([{ ...exampleRecord('carc'), notes: 1 }]), ['r.json record 1: notes: Invalid input: expected string, received number']],
  ])('reports a file that is %s', (_name, text, problems) => {
    write('r.json', text);
    expect(readRecordFile(path.join(dir, 'r.json'), 'r.json').problems).toEqual(problems);
  });
});

describe('readSecondPassFile', () => {
  it('reads a valid second pass and reports an invalid one', () => {
    const record = exampleRecord('therapy_threshold');
    const transcribed = { record_type: record.record_type, key: record.key, value: record.value, effective_from: record.effective_from, effective_to: record.effective_to, quotes: record.quotes };
    write('ok.json', JSON.stringify({ transcribed_by: 'second', transcribed_on: '2026-10-15', records: [transcribed] }));
    write('bad.json', JSON.stringify({ transcribed_by: 'second', records: [transcribed] }));
    write('broken.json', '{');
    expect(readSecondPassFile(path.join(dir, 'ok.json'), 'ok.json').secondPass?.transcribed_by).toBe('second');
    expect(readSecondPassFile(path.join(dir, 'bad.json'), 'bad.json').problems).toEqual([expect.stringContaining('bad.json: transcribed_on')]);
    expect(readSecondPassFile(path.join(dir, 'broken.json'), 'broken.json').problems).toEqual(['broken.json: is not valid JSON']);
  });
});

describe('readRelease', () => {
  it('reads a release whose files match its manifest', () => {
    release({ 'RELEASE.md': '# 3\n', 'carc/2026/CARC.json': serializeRecords([exampleRecord('carc')]) });
    const contents = readRelease(dir);
    expect(contents.problems).toEqual([]);
    expect(contents.manifest.release).toBe(3);
    expect(contents.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(contents.records.map((located) => located.where)).toEqual(['carc/2026/CARC.json record 1']);
  });

  it('reports a changed, an extra and a linked file, and invalid records', () => {
    release({ 'RELEASE.md': '# 3\n', 'carc/2026/CARC.json': serializeRecords([exampleRecord('carc')]) });
    write('carc/2026/CARC.json', JSON.stringify([{ ...exampleRecord('carc'), quotes: [] }]));
    write('stray.md', 'x');
    symlinkSync('/etc/hostname', path.join(dir, 'link.json'));
    expect(readRelease(dir).problems).toEqual([
      'link.json is a symbolic link',
      'carc/2026/CARC.json does not match its SHA-256 in MANIFEST.json',
      'stray.md is not listed in MANIFEST.json',
      'carc/2026/CARC.json record 1: quotes: must quote the source at least once',
    ]);
  });

  it('reports a missing or invalid manifest', () => {
    expect(readRelease(dir).problems).toEqual(['MANIFEST.json is missing']);
    write('MANIFEST.json', JSON.stringify({ release: 'one', files: {} }));
    expect(readRelease(dir).problems).toEqual([expect.stringContaining('MANIFEST.json: release'), expect.stringContaining('MANIFEST.json: files')]);
    write('MANIFEST.json', 'not json');
    expect(readRelease(dir).problems[0]).toBe('MANIFEST.json: is not valid JSON');
  });
});
