import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type RuleRecord, buildManifest, serializeManifest, serializeRecords, sha256 } from '@tp/rules';
import { exampleRecord } from '@tp/rules/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { checkContent, checkContentSet, contentSetAt, defaultContentSets } from './check';

let root = '';

const SOURCE_TEXT = 'The KX threshold is $1,111 for PT and SLP combined, with review at $1,333.\nSecond line.\n';
const SOURCE_PATH = 'content/sources/therapy_threshold/rules.md';
const QUOTE = '$1,111 for PT and SLP combined, with review at $1,333';

function write(file: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

/** A hand-typed record citing the source above, as a draft would hold it. */
function handTyped(overrides: Partial<RuleRecord> = {}): RuleRecord {
  return exampleRecord('therapy_threshold', {
    source: {
      title: 'Plan rules reference',
      url: null,
      path: SOURCE_PATH,
      retrieved: '2026-10-15',
      sha256: sha256(SOURCE_TEXT),
      method: 'hand_typed',
      transcribed_by: 'first',
      transcribed_on: '2026-10-15',
      locator: 'line 1',
      synthetic: false,
    },
    quotes: [QUOTE],
    ...overrides,
  });
}

/** The hand-typed source of `handTyped()`, typed as such so a test can change its transcriber. */
function handSource(): Extract<RuleRecord['source'], { method: 'hand_typed' }> {
  return handTyped().source as Extract<RuleRecord['source'], { method: 'hand_typed' }>;
}

function secondPass(records: readonly RuleRecord[], transcribedBy = 'second'): string {
  return JSON.stringify({
    transcribed_by: transcribedBy,
    transcribed_on: '2026-10-15',
    records: records.map(({ record_type, key, value, effective_from, effective_to, quotes }) => ({ record_type, key, value, effective_from, effective_to, quotes })),
  });
}

function drafts(records: readonly RuleRecord[], second: readonly RuleRecord[] | null = records, file = 'therapy_threshold/2026/records'): void {
  write(`content/drafts/${file}.json`, serializeRecords(records));
  if (second !== null) {
    write(`content/drafts/${file}.second-pass.json`, secondPass(second));
  }
}

function problems(dirs: readonly string[] = []): readonly string[] {
  return checkContent(root, dirs).problems;
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'verify-content-'));
  write(SOURCE_PATH, SOURCE_TEXT);
  write('content/drafts/README.md', '# drafts\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('checkContent on drafts', () => {
  it('passes with nothing to check', () => {
    expect(checkContent(root)).toMatchObject({ ok: true, problems: [] });
  });

  it('passes hand-typed records whose two transcriptions agree', () => {
    drafts([handTyped(), handTyped({ key: { discipline: 'OT' } })]);
    const result = checkContent(root);
    expect(result.problems).toEqual([]);
    expect(result.message).toContain('content/drafts: 2 record(s), no problems');
  });

  it('refuses a record that fails the schema, including a numeric range', () => {
    drafts([handTyped({ value: { kx_threshold_cents: '0', medical_review_threshold_cents: '133300' } })]);
    expect(problems()).toEqual([
      'content/drafts/therapy_threshold/2026/records.json record 1: value.kx_threshold_cents: is out of range: must be between 1 and 10000000 cents',
    ]);
  });

  it('refuses a record without a source', () => {
    const { source: _source, ...withoutSource } = handTyped();
    write('content/drafts/therapy_threshold/2026/records.json', JSON.stringify([withoutSource]));
    expect(problems()).toEqual([expect.stringContaining('record 1: source: Invalid input')]);
  });

  it('refuses a source that is missing, or whose hash does not match the stored file', () => {
    drafts([handTyped({ source: { ...handTyped().source, path: 'content/sources/therapy_threshold/missing.md' } })]);
    expect(problems()).toEqual([expect.stringContaining('the stored source content/sources/therapy_threshold/missing.md is missing')]);
    write(SOURCE_PATH, `${SOURCE_TEXT}changed\n`);
    drafts([handTyped()]);
    expect(problems()).toEqual([expect.stringContaining(`source.sha256 does not match the stored file ${SOURCE_PATH}`)]);
  });

  it('refuses a quote that is not in the stored source', () => {
    drafts([handTyped({ quotes: [QUOTE.replace('$1,111', '$1,112')] })]);
    expect(problems()).toEqual(
      expect.arrayContaining([expect.stringContaining('quotes.0 does not appear in content/sources/therapy_threshold/rules.md: "$1,112 for PT and SLP combined')]),
    );
  });

  it('refuses a hand-typed value that its quotes do not state', () => {
    drafts([handTyped({ value: { kx_threshold_cents: '999900', medical_review_threshold_cents: '133300' } })]);
    expect(problems()).toEqual([
      expect.stringContaining('value.kx_threshold_cents does not appear in any quote (as "$9,999" or "$9999" or "$9,999.00" or "$9999.00")'),
    ]);
    drafts([handTyped({ quotes: ['$1,111 for PT and SLP combined'] })]);
    expect(problems()).toEqual(
      expect.arrayContaining([expect.stringContaining('value.medical_review_threshold_cents does not appear in any quote (as "$1,333"')]),
    );
  });

  it('refuses a quote that is blank, punctuation or too short', () => {
    for (const quote of [' ', '        ', '$', '........', 'review']) {
      drafts([handTyped({ quotes: [QUOTE, quote] })]);
      expect(problems(), JSON.stringify(quote)).toEqual(expect.arrayContaining([expect.stringMatching(/quotes\.1: must quote/)]));
    }
  });

  it('refuses overlapping effective windows for the same record type and key', () => {
    const second = handTyped({ effective_from: '2026-07-01', effective_to: null });
    drafts([handTyped(), second]);
    expect(problems()).toEqual([
      'content/drafts/therapy_threshold/2026/records.json record 2 (therapy_threshold {"discipline":"PT_SLP"} from 2026-07-01): its effective window overlaps content/drafts/therapy_threshold/2026/records.json record 1 (therapy_threshold {"discipline":"PT_SLP"} from 2026-01-01)',
    ]);
  });

  it('refuses overlaps across files too, and accepts adjacent windows', () => {
    drafts([handTyped()]);
    drafts([handTyped({ effective_from: '2026-12-31', effective_to: null })], undefined, 'therapy_threshold/2027/records');
    expect(problems()).toEqual([expect.stringContaining('its effective window overlaps')]);
    drafts([handTyped({ effective_from: '2027-01-01', effective_to: null })], undefined, 'therapy_threshold/2027/records');
    expect(problems()).toEqual([]);
  });

  describe('transcribe twice and diff', () => {
    it('refuses hand-typed records without a second transcription', () => {
      drafts([handTyped()], null);
      expect(problems()).toEqual([
        'content/drafts/therapy_threshold/2026/records.json: 1 hand-typed record(s) need a second, independent transcription in records.second-pass.json',
      ]);
    });

    it('refuses transcriptions that differ, naming the field and both values', () => {
      drafts([handTyped()], [handTyped({ value: { kx_threshold_cents: '111000', medical_review_threshold_cents: '133300' } })]);
      expect(problems()).toEqual([
        'content/drafts/therapy_threshold/2026/records.second-pass.json: the transcriptions differ: therapy_threshold {"discipline":"PT_SLP"} from 2026-01-01: value differs: first pass {"kx_threshold_cents":"111100","medical_review_threshold_cents":"133300"}, second pass {"kx_threshold_cents":"111000","medical_review_threshold_cents":"133300"}',
      ]);
    });

    it('refuses, at L2 or above, a second pass by the person who typed the first', () => {
      const atL2 = handTyped({
        source: { ...handSource(), url: 'https://example.invalid/rules', transcribed_by: 'one person' },
        verification: { level: 'L2', by: 'reviewer', on: '2026-10-20', questions: [] },
      });
      write('content/drafts/therapy_threshold/2026/records.json', serializeRecords([atL2]));
      write('content/drafts/therapy_threshold/2026/records.second-pass.json', secondPass([atL2], 'one person'));
      expect(problems()).toEqual([
        'content/drafts/therapy_threshold/2026/records.second-pass.json: was transcribed by "one person", who also typed the first pass of 1 record(s) at L2 or above; the second pass must be independent (another person)',
      ]);
      write('content/drafts/therapy_threshold/2026/records.second-pass.json', secondPass([atL2], 'another person'));
      expect(problems()).toEqual([]);
      const atL1 = handTyped({ source: { ...handSource(), transcribed_by: 'one person' } });
      write('content/drafts/therapy_threshold/2026/records.json', serializeRecords([atL1]));
      write('content/drafts/therapy_threshold/2026/records.second-pass.json', secondPass([atL1], 'one person'));
      expect(problems()).toEqual([]);
    });

    it('refuses a second pass that is invalid, orphaned, or beside parsed records only', () => {
      drafts([handTyped()]);
      write('content/drafts/therapy_threshold/2026/records.second-pass.json', '{"records": []}');
      expect(problems()).toEqual(expect.arrayContaining([expect.stringContaining('records.second-pass.json: transcribed_by')]));

      rmSync(path.join(root, 'content/drafts/therapy_threshold'), { recursive: true });
      write('content/drafts/therapy_threshold/2026/other.second-pass.json', secondPass([handTyped()]));
      expect(problems()).toEqual(['content/drafts/therapy_threshold/2026/other.second-pass.json: is a second pass with no other.json beside it']);

      const { transcribed_by: _by, transcribed_on: _on, ...common } = handTyped().source as Extract<RuleRecord['source'], { method: 'hand_typed' }>;
      const parsed = handTyped({ source: { ...common, method: 'parser', parser: 'x12_code_list' } });
      drafts([parsed], [parsed], 'therapy_threshold/2026/other');
      expect(problems()).toEqual(['content/drafts/therapy_threshold/2026/other.second-pass.json: other.json has no hand-typed records to compare']);
    });
  });

  it('keeps synthetic data out of content and every source under content/sources', () => {
    drafts([handTyped({ source: { ...handTyped().source, synthetic: true, title: 'SYNTHETIC x' } })]);
    expect(problems()).toEqual([expect.stringContaining('synthetic reference data never enters content')]);
    write('fixtures/x.md', SOURCE_TEXT);
    drafts([handTyped({ source: { ...handTyped().source, path: 'fixtures/x.md' } })]);
    expect(problems()).toEqual([expect.stringContaining('source.path fixtures/x.md must be under content/sources/')]);
  });

  it('refuses a stored source with the bytes of a fixture file, whatever its name', () => {
    write('fixtures/synthetic/cms/rules-copy.md', SOURCE_TEXT);
    drafts([handTyped()]);
    expect(problems()).toEqual([
      expect.stringContaining(`the stored source ${SOURCE_PATH} has the same bytes as fixtures/synthetic/cms/rules-copy.md: synthetic fixtures never enter content`),
    ]);
  });

  it('refuses the reserved SYNTHETIC carrier, state and ZIP codes in content', () => {
    const marked = exampleRecord('locality_map', { source: handTyped().source, quotes: [QUOTE] });
    write('content/drafts/locality_map/2026/records.json', serializeRecords([marked]));
    write('content/drafts/locality_map/2026/records.second-pass.json', secondPass([marked]));
    expect(problems()).toEqual([
      expect.stringContaining('key.zip 00011 is a reserved SYNTHETIC ZIP code (00000 to 00099); synthetic reference data never enters content'),
      expect.stringContaining('value.state ZZ is the reserved SYNTHETIC state'),
      expect.stringContaining('value.carrier 99999 is the reserved SYNTHETIC carrier'),
    ]);
  });

  it("keeps a record citing the plan's own rules reference at L1", () => {
    write('content/sources/plan/rules-reference.md', SOURCE_TEXT);
    const planSource = { ...handTyped().source, path: 'content/sources/plan/rules-reference.md' };
    drafts([handTyped({ source: planSource })]);
    expect(problems()).toEqual([]);
    const raised = handTyped({
      source: { ...planSource, url: 'https://example.invalid/plan' },
      verification: { level: 'L2', by: 'reviewer', on: '2026-10-20', questions: [] },
    });
    drafts([raised]);
    expect(problems()).toEqual([expect.stringContaining("cites content/sources/plan/rules-reference.md, the plan's own rules reference: a secondary source stays at L1")]);
  });

  it('refuses a record at L2 or above that names no source URL', () => {
    drafts([handTyped({ verification: { level: 'L2', by: 'reviewer', on: '2026-10-20', questions: [] } })]);
    expect(problems()).toEqual([expect.stringContaining('source.url: must name where the source was downloaded from')]);
  });

  it('refuses files that are not records, second passes or notes, links, and misplaced records', () => {
    drafts([handTyped()]);
    write('content/drafts/therapy_threshold/2026/source.csv', 'a,b\n');
    write('content/drafts/therapy_threshold/2026/review.md', '# notes are fine\n');
    symlinkSync(path.join(root, SOURCE_PATH), path.join(root, 'content/drafts/link.json'));
    write('content/drafts/carc/2026/records.json', serializeRecords([exampleRecord('rarc', { source: handTyped().source, quotes: ['Second line.'] })]));
    write('content/drafts/carc/2026/records.second-pass.json', secondPass([exampleRecord('rarc', { quotes: ['Second line.'] })]));
    write('content/drafts/loose.json', serializeRecords([handTyped()]));
    expect(problems()).toEqual(
      expect.arrayContaining([
        'content/drafts/therapy_threshold/2026/source.csv: is not a record file (.json), a second pass (.second-pass.json) or notes (.md)',
        'content/drafts/link.json: is a symbolic link',
        'content/drafts/carc/2026/records.json: holds rarc records in the carc directory',
        'content/drafts/loose.json: record files live at <record_type>/<year>/<name>.json',
      ]),
    );
  });
});

describe('checkContent on releases', () => {
  /** Writes a release directory with its manifest, from the given files. */
  function release(dir: string, files: Record<string, string>, number: number): void {
    for (const [file, text] of Object.entries(files)) {
      write(`${dir}/${file}`, text);
    }
    const hashes = new Map(Object.entries(files).map(([file, text]) => [file, sha256(text)]));
    write(`${dir}/MANIFEST.json`, serializeManifest(buildManifest(number, hashes)));
  }

  const verified = (overrides: Partial<RuleRecord> = {}) =>
    handTyped({
      source: { ...handTyped().source, url: 'https://example.invalid/rules' },
      verification: { level: 'L2', by: 'reviewer', on: '2026-10-20', questions: [] },
      ...overrides,
    });

  function releaseFiles(records: readonly RuleRecord[]): Record<string, string> {
    return {
      'RELEASE.md': '# Release\n',
      'therapy_threshold/2026/records.json': serializeRecords(records),
      'therapy_threshold/2026/records.second-pass.json': secondPass(records),
    };
  }

  it('passes a prepared release whose records are verified and whose manifest matches', () => {
    release('content/outgoing/1', releaseFiles([verified()]), 1);
    expect(problems()).toEqual([]);
    expect(checkContent(root).message).toContain('content/outgoing/1: 1 record(s), no problems');
  });

  it('refuses L1 records in a prepared or published release', () => {
    release('content/releases/1', releaseFiles([handTyped()]), 1);
    expect(problems()).toEqual([expect.stringContaining('a release holds only records verified to L2 or L3')]);
  });

  it('applies the L2 rule to any release directory outside fixtures/, wherever it is', () => {
    release('elsewhere/2', releaseFiles([handTyped()]), 2);
    expect(problems(['elsewhere/2'])).toEqual([expect.stringContaining('a release holds only records verified to L2 or L3')]);
    expect(contentSetAt(root, 'elsewhere/2')).toMatchObject({ kind: 'release', published: true, numbered: false, synthetic: false });
  });

  it('keeps real and SYNTHETIC release numbers apart', () => {
    release('content/outgoing/900001', releaseFiles([verified()]), 900001);
    expect(problems()).toEqual(['content/outgoing/900001: MANIFEST.json names release 900001: numbers from 900000 are reserved for SYNTHETIC fixture releases']);
  });

  it('refuses a release whose files do not match its manifest, or that names another number', () => {
    release('content/outgoing/2', releaseFiles([verified()]), 3);
    write('content/outgoing/2/RELEASE.md', '# changed\n');
    expect(problems()).toEqual([
      'content/outgoing/2: MANIFEST.json names release 3 but the directory is 2',
      'content/outgoing/2: RELEASE.md does not match its SHA-256 in MANIFEST.json',
    ]);
    write('content/outgoing/2/MANIFEST.json', '{');
    expect(problems()).toEqual(['content/outgoing/2: MANIFEST.json is not valid JSON']);
    write('content/outgoing/2/MANIFEST.json', '{"release": 2}');
    expect(problems()).toEqual([expect.stringContaining('content/outgoing/2: MANIFEST.json: files')]);
  });

  it('refuses anything but numbered release directories under content/outgoing and content/releases', () => {
    write('content/outgoing/README.md', '# outgoing\n');
    write('content/outgoing/draft/x.json', '[]');
    write('content/releases/notes.txt', 'x');
    expect(defaultContentSets(root).problems).toEqual([
      'content/outgoing/draft: only numbered release directories belong in content/outgoing',
      'content/releases/notes.txt: only numbered release directories belong in content/releases',
    ]);
  });

  it('checks releases in numeric order after the drafts', () => {
    release('content/releases/10', releaseFiles([verified()]), 10);
    release('content/releases/9', releaseFiles([verified()]), 9);
    expect(defaultContentSets(root).sets.map((set) => set.dir)).toEqual(['content/drafts', 'content/releases/9', 'content/releases/10']);
  });

  it('checks a fixture release when pointed at it: synthetic, any level, sources under fixtures/', () => {
    write('fixtures/synthetic/cms/rules.md', SOURCE_TEXT);
    const synthetic = handTyped({ source: { ...handTyped().source, path: 'fixtures/synthetic/cms/rules.md', synthetic: true, title: 'SYNTHETIC rules' } });
    release('fixtures/synthetic/rules/release-a', releaseFiles([synthetic]), 900001);
    expect(problems(['fixtures/synthetic/rules/release-a'])).toEqual([]);
    release('fixtures/synthetic/rules/release-b', releaseFiles([handTyped()]), 900002);
    expect(problems([path.join(root, 'fixtures/synthetic/rules/release-b')])).toEqual([
      expect.stringContaining(`source.path ${SOURCE_PATH} must be under fixtures/`),
      expect.stringContaining('a fixture record must be marked synthetic'),
    ]);
    release('fixtures/synthetic/rules/release-c', releaseFiles([synthetic]), 1);
    expect(problems(['fixtures/synthetic/rules/release-c'])).toEqual([
      'fixtures/synthetic/rules/release-c: MANIFEST.json names release 1: SYNTHETIC fixture releases are numbered from 900000, so they never take a real release\'s number',
    ]);
    expect(problems(['fixtures/synthetic/rules/missing'])).toEqual(['fixtures/synthetic/rules/missing: no such directory']);
  });

  it('describes a directory given on the command line', () => {
    write('content/outgoing/4/MANIFEST.json', '{}');
    expect(contentSetAt(root, 'content/outgoing/4')).toEqual({ dir: 'content/outgoing/4', kind: 'release', published: true, numbered: true, synthetic: false });
    expect(contentSetAt(root, path.join(root, 'fixtures/x'))).toEqual({ dir: 'fixtures/x', kind: 'drafts', published: false, numbered: false, synthetic: true });
    expect(checkContentSet(root, contentSetAt(root, 'content/drafts')).problems).toEqual([]);
  });
});

describe('this repository', () => {
  it('passes the drafts and every release', () => {
    const result = checkContent(repositoryRoot);
    expect(result.problems).toEqual([]);
  });

  it('passes the synthetic fixture release', () => {
    expect(checkContent(repositoryRoot, ['fixtures/synthetic/rules/release-synth-900001']).problems).toEqual([]);
  });
});
