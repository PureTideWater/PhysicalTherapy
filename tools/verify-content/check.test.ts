import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type RuleRecord, type RuleRecordOf, buildManifest, serializeManifest, serializeRecords, sha256 } from '@tp/rules';
import { previousReleaseNumber } from '@tp/rules/content';
import { exampleRecord } from '@tp/rules/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type ReleaseCoverage, contentSummaries, lookBackCutoff, renderCoverageFile } from '../../packages/rules/src/records';

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

/** Overrides for `exampleRecord`: one record type's key and value, checked as that type's, then the other fields. */
function withBody<T extends RuleRecord['record_type']>(_type: T, body: Pick<RuleRecordOf<T>, 'key' | 'value'>, ...rest: readonly Partial<RuleRecord>[]): Partial<RuleRecord> {
  return Object.assign({}, body, ...rest) as Partial<RuleRecord>;
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
      expect.stringContaining('locality_map is imported for one CMS quarter: its window must lie inside one quarter'),
      expect.stringContaining('locality_map comes from a CMS file and is imported with pnpm rules:import, never typed by hand'),
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

describe('checkContent on files with no dates of their own (audit #30)', () => {
  /** An 80-character ZIP5 line stating `yearQuarter` at 76-80. */
  const zipLine = (zip: string, yearQuarter: string) => `CA${zip}0111205`.padEnd(75, ' ') + yearQuarter;
  const MUE_QUOTE = 'HCPCS 97110 has an MUE of 7 units, adjudication 3';
  const MPPR_QUOTE = 'HCPCS 97110 is on the multiple procedure list';
  const GENERAL_QUOTE = 'practice expense is reduced 40% for later units';
  const CMS_TEXT = [MUE_QUOTE, MPPR_QUOTE, GENERAL_QUOTE, zipLine('12345', '20264'), zipLine('12346', '20263'), ''].join('\n');
  const CMS_PATH = 'content/sources/cms/files.txt';
  const TYPED_PATH = 'content/sources/cms/typed.txt';
  const TYPED_TEXT = `${CMS_TEXT}typed copy\n`;
  const Q4 = { effective_from: '2026-10-01', effective_to: '2026-12-31' };

  beforeEach(() => {
    write(CMS_PATH, CMS_TEXT);
    write(TYPED_PATH, TYPED_TEXT);
  });

  /** A real record parsed from the CMS file above (no second pass), or hand-typed from its copy. */
  function cms(type: RuleRecord['record_type'], overrides: Partial<RuleRecord> = {}, method: 'parser' | 'hand_typed' = 'parser'): RuleRecord {
    const common = { title: 'CMS file', url: null, retrieved: '2026-10-15', locator: 'line 1', synthetic: false };
    return exampleRecord(type, {
      source:
        method === 'parser'
          ? { ...common, path: CMS_PATH, sha256: sha256(CMS_TEXT), method, parser: 'cms_file' }
          : { ...common, path: TYPED_PATH, sha256: sha256(TYPED_TEXT), method, transcribed_by: 'first', transcribed_on: '2026-10-15' },
      ...overrides,
    });
  }

  const mue = (overrides: Partial<RuleRecord> = {}, method: 'parser' | 'hand_typed' = 'parser') => cms('ncci_mue', { quotes: [MUE_QUOTE], ...Q4, ...overrides }, method);
  const perCode = (overrides: Partial<RuleRecord> = {}, method: 'parser' | 'hand_typed' = 'parser') =>
    cms('mppr_rate', withBody('mppr_rate', { key: { hcpcs: '97110', modifier: '' }, value: { pe_reduction_percent: null } }, { quotes: [MPPR_QUOTE] }, overrides), method);
  const zip = (zipCode: string, quote: string, overrides: Partial<RuleRecord> = {}) =>
    cms(
      'locality_map',
      withBody(
        'locality_map',
        { key: { zip: zipCode }, value: { state: 'CA', carrier: '01112', locality: '05', rural_indicator: null, plus_four_required: null } },
        { quotes: [quote], ...Q4 },
        overrides,
      ),
    );

  /** Writes parsed records with no second pass. */
  function parsed(records: readonly RuleRecord[], file: string): void {
    drafts(records, null, file);
  }

  it('passes a quarterly record windowed to its quarter, or to a correction’s part of one', () => {
    parsed([mue()], 'ncci_mue/2026/q4');
    expect(problems()).toEqual([]);
    parsed([mue({ effective_from: '2026-11-15' })], 'ncci_mue/2026/q4');
    expect(problems()).toEqual([]);
  });

  it('refuses a quarterly window that leaves one CMS quarter or is open (C1)', () => {
    for (const [from, to] of [
      ['2026-01-01', '2026-12-31'],
      ['2026-09-30', '2026-12-31'],
      ['2026-10-01', null],
    ] as const) {
      parsed([mue({ effective_from: from, effective_to: to })], 'ncci_mue/2026/records');
      expect(problems()).toEqual([
        `content/drafts/ncci_mue/2026/records.json record 1 (ncci_mue {"hcpcs":"97110"} from ${from}): ncci_mue is imported for one CMS quarter: its window must lie inside one quarter, usually all of it (it is ${from} to ${to ?? 'open'})`,
      ]);
    }
  });

  it('refuses a per-code MPPR window that is open or leaves its calendar year (C2)', () => {
    parsed([perCode({ effective_from: '2026-01-01', effective_to: '2026-12-31' })], 'mppr_rate/2026/records');
    expect(problems()).toEqual([]);
    for (const to of [null, '2027-01-31'] as const) {
      parsed([perCode({ effective_from: '2026-01-01', effective_to: to })], 'mppr_rate/2026/records');
      expect(problems()).toEqual([
        `content/drafts/mppr_rate/2026/records.json record 1 (mppr_rate {"hcpcs":"97110","modifier":""} from 2026-01-01): mppr_rate is read from a calendar year's file with no dates of its own: its window must end inside 2026 (it is 2026-01-01 to ${to ?? 'open'})`,
      ]);
    }
  });

  it("refuses a ZIP record whose quoted line states another quarter than its window's (C3)", () => {
    parsed([zip('12345', zipLine('12345', '20264'))], 'locality_map/2026/records');
    expect(problems()).toEqual([]);
    parsed([zip('12346', zipLine('12346', '20263'))], 'locality_map/2026/records');
    expect(problems()).toEqual([
      'content/drafts/locality_map/2026/records.json record 1 (locality_map {"zip":"12346"} from 2026-10-01): quotes.0 states year and quarter 20263 at 76-80, but the record\'s window is 2026-Q4',
    ]);
    parsed([zip('12345', MUE_QUOTE)], 'locality_map/2026/records');
    expect(problems()).toEqual([expect.stringContaining('quotes.0 states year and quarter none at 76-80')]);
  });

  it('refuses the bypass of review M2: hand-typed quarterly or per-code MPPR records, and a parsed record whose window was edited (C1, C2, C15, C16)', () => {
    parsed([mue(), mue({ key: { hcpcs: '97140' } })], 'ncci_mue/2026/q4');
    const typedYear = mue({ key: { hcpcs: '97150' }, effective_from: '2026-01-01', effective_to: '2026-12-31' }, 'hand_typed');
    drafts([typedYear], [typedYear], 'ncci_mue/2026/typed');
    const where = 'content/drafts/ncci_mue/2026/typed.json record 1 (ncci_mue {"hcpcs":"97150"} from 2026-01-01)';
    expect(problems()).toEqual([
      `${where}: ncci_mue is imported for one CMS quarter: its window must lie inside one quarter, usually all of it (it is 2026-01-01 to 2026-12-31)`,
      `${where}: ncci_mue comes from a CMS file and is imported with pnpm rules:import, never typed by hand: a hand-typed record would carry a window no file states (content/sources/README.md)`,
    ]);

    rmSync(path.join(root, 'content/drafts/ncci_mue/2026/typed.json'));
    rmSync(path.join(root, 'content/drafts/ncci_mue/2026/typed.second-pass.json'));
    const typedOpen = perCode({ effective_from: '2026-01-01', effective_to: null }, 'hand_typed');
    drafts([typedOpen], [typedOpen], 'mppr_rate/2026/records');
    const at = 'content/drafts/mppr_rate/2026/records.json record 1 (mppr_rate {"hcpcs":"97110","modifier":""} from 2026-01-01)';
    expect(problems()).toEqual([
      `${at}: mppr_rate is read from a calendar year's file with no dates of its own: its window must end inside 2026 (it is 2026-01-01 to open)`,
      `${at}: mppr_rate comes from a CMS file and is imported with pnpm rules:import, never typed by hand: a hand-typed record would carry a window no file states (content/sources/README.md)`,
    ]);

    rmSync(path.join(root, 'content/drafts/mppr_rate'), { recursive: true });
    parsed([mue(), mue({ key: { hcpcs: '97140' }, effective_to: '2026-11-30' })], 'ncci_mue/2026/q4');
    expect(problems()).toEqual([
      "content/drafts: ncci_mue records from one file (content/sources/cms/files.txt) carry different windows (2026-10-01 to 2026-12-31 and 2026-10-01 to 2026-11-30): a file is imported for one window, so import it again rather than editing a record's dates",
    ]);
  });

  it('passes the hand-typed general MPPR rate with an open window, as the real drafts hold it', () => {
    const general = cms('mppr_rate', { quotes: [GENERAL_QUOTE], effective_from: '2026-01-01', effective_to: null }, 'hand_typed');
    drafts([general], [general], 'mppr_rate/2026/records');
    expect(problems()).toEqual([]);
  });

  it('exempts fixtures: a synthetic set keeps its whole-year windows', () => {
    write('fixtures/synthetic/cms/mue.md', `${MUE_QUOTE}\n`);
    const synthetic = exampleRecord('ncci_mue', {
      source: { ...handTyped().source, path: 'fixtures/synthetic/cms/mue.md', sha256: sha256(`${MUE_QUOTE}\n`), synthetic: true, title: 'SYNTHETIC rules' },
      quotes: [MUE_QUOTE],
    });
    write('fixtures/synthetic/set/ncci_mue/2026/records.json', serializeRecords([synthetic]));
    write('fixtures/synthetic/set/ncci_mue/2026/records.second-pass.json', secondPass([synthetic]));
    expect(problems(['fixtures/synthetic/set'])).toEqual([]);
  });
});

describe('checkContent on gaps inside a content (audit #30 R4)', () => {
  it('refuses a content with no record in force on dates inside the ones it is loaded for (C4), in every set', () => {
    drafts([handTyped({ effective_to: '2026-06-30' }), handTyped({ key: { discipline: 'OT' }, effective_from: '2026-08-01', effective_to: null })]);
    expect(problems()).toEqual([
      'content/drafts: therapy_threshold has no record in force from 2026-07-01 to 2026-07-31, inside the dates it is loaded for: import that content for those dates (a content may have no gap inside it)',
    ]);
  });

  it("never refuses a hole in one key's dates that another key of the content covers", () => {
    drafts([
      handTyped({ effective_to: '2026-06-30' }),
      handTyped({ effective_from: '2026-08-01', effective_to: null }),
      handTyped({ key: { discipline: 'OT' }, effective_to: null }),
    ]);
    expect(problems()).toEqual([]);
  });

  it('lists at most 20 gaps, then how many more', () => {
    const records = Array.from({ length: 27 }, (_, index) => {
      const year = String(2000 + index);
      return handTyped({ effective_from: `${year}-01-01`, effective_to: `${year}-06-30` });
    });
    drafts(records);
    const found = problems();
    expect(found).toHaveLength(21);
    expect(found[20]).toBe('content/drafts: and 6 more of the same kind');
  });
});

describe('checkContent on releases', () => {
  /**
   * Writes a release directory with its manifest, from the given files. A numbered one (content/outgoing/<n>,
   * content/releases/<n>) also gets the COVERAGE.md the assembler would write for a release losing nothing, with
   * `coverage`'s fields in place of the computed ones, or `coverage` itself as the file's text; null writes none.
   */
  function release(dir: string, files: Record<string, string>, number: number, coverage: Partial<ReleaseCoverage> | string | null = {}): void {
    const name = path.posix.basename(dir);
    const all = { ...files };
    if (coverage !== null && /^content\/(outgoing|releases)\/[1-9]\d*$/.test(dir)) {
      all['COVERAGE.md'] = typeof coverage === 'string' ? coverage : coverageFile(Number.parseInt(name, 10), files, coverage);
    }
    for (const [file, text] of Object.entries(all)) {
      write(`${dir}/${file}`, text);
    }
    const hashes = new Map(Object.entries(all).map(([file, text]) => [file, sha256(text)]));
    write(`${dir}/MANIFEST.json`, serializeManifest(buildManifest(number, hashes)));
  }

  /** COVERAGE.md for release `n` from its record files, prepared 2026-10-20 against the release before it, losing nothing. */
  function coverageFile(n: number, files: Record<string, string>, overrides: Partial<ReleaseCoverage> = {}): string {
    const records = Object.entries(files)
      .filter(([file]) => file.endsWith('.json') && !file.endsWith('.second-pass.json'))
      .flatMap(([, text]) => JSON.parse(text) as RuleRecord[]);
    const prepared = overrides.prepared_on ?? '2026-10-20';
    return renderCoverageFile({
      format: 'tp-release-coverage/1',
      release: n,
      previous_release: previousReleaseNumber(root, n),
      prepared_on: prepared,
      look_back_years: 6,
      cutoff: lookBackCutoff(prepared),
      contents: contentSummaries(records).map((summary) => ({ ...summary, windows: [...summary.windows] })),
      before_cutoff: [],
      closed_by_source: [],
      withdrawn: [],
      ...overrides,
    });
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

  describe('coverage against the previous release (COVERAGE.md)', () => {
    const OT = { key: { discipline: 'OT' as const } };

    /** A release of verified therapy thresholds, its COVERAGE.md computed (and overridden) as `release` does. */
    function thresholds(dir: string, records: readonly RuleRecord[], coverage: Partial<ReleaseCoverage> | string | null = {}): void {
      release(dir, releaseFiles(records), Number.parseInt(path.posix.basename(dir), 10), coverage);
    }

    it('passes a first release and a second that covers everything the first did', () => {
      thresholds('content/releases/1', [verified(), verified(OT)]);
      thresholds('content/outgoing/2', [verified(), verified({ ...OT, effective_to: null })]);
      expect(problems()).toEqual([]);
    });

    it('refuses a numbered release without COVERAGE.md, or one that cannot be read', () => {
      thresholds('content/outgoing/1', [verified()], null);
      expect(problems()).toEqual(['content/outgoing/1: COVERAGE.md is missing: a prepared release records its coverage (pnpm release:assemble writes it)']);
      thresholds('content/outgoing/1', [verified()], '# Coverage\n\nno block\n');
      expect(problems()).toEqual(['content/outgoing/1: COVERAGE.md: holds 0 ```json blocks: it must hold exactly one']);
      thresholds('content/outgoing/1', [verified()], '```json\n{"format": "tp-release-coverage/1"}\n```\n');
      expect(problems()).toEqual(expect.arrayContaining([expect.stringMatching(/^content\/outgoing\/1: COVERAGE\.md: release: /)]));
    });

    it('refuses a COVERAGE.md naming another release, previous release or cutoff', () => {
      thresholds('content/releases/1', [verified()]);
      thresholds('content/outgoing/2', [verified()], { release: 3, previous_release: null, cutoff: '2021-01-01' });
      expect(problems()).toEqual([
        'content/outgoing/2: COVERAGE.md names release 3, but the directory is 2',
        'content/outgoing/2: COVERAGE.md names previous release none, but the release before 2 is 1',
        "content/outgoing/2: COVERAGE.md's cutoff is 2021-01-01; six years before 2026-10-20 it is 2020-01-01",
      ]);
    });

    it('refuses a COVERAGE.md prepared after today, or before its previous release', () => {
      thresholds('content/releases/1', [verified()]);
      expect(checkContent(root, [], { today: '2026-10-19' }).problems).toEqual(['content/releases/1: COVERAGE.md is prepared on 2026-10-20, after today (2026-10-19)']);
      thresholds('content/outgoing/2', [verified()], { prepared_on: '2026-10-01' });
      expect(problems()).toEqual(['content/outgoing/2: COVERAGE.md is prepared on 2026-10-01, before release 1 (2026-10-20)']);
    });

    it("refuses contents that are not exactly the release's records, naming the first difference per content", () => {
      const files = releaseFiles([verified(), verified(OT)]);
      const [summary] = contentSummaries([verified(), verified(OT)]);
      if (summary === undefined) {
        throw new Error('no summary');
      }
      thresholds('content/outgoing/1', [verified(), verified(OT)], { contents: [{ ...summary, windows: [...summary.windows], records: 1 }] });
      expect(problems()).toEqual([
        'content/outgoing/1: COVERAGE.md\'s contents do not match the release\'s records (therapy_threshold: records is 1, but the records give 2)',
      ]);
      release('content/outgoing/1', files, 1, {
        contents: [
          { ...summary, windows: [...summary.windows] },
          { content: 'carc', records: 1, windows: [{ from: '2026-01-01', to: null }], newest_from: '2026-01-01', newest_retrieved: '2026-10-15' },
        ],
      });
      expect(problems()).toEqual(["content/outgoing/1: COVERAGE.md's contents do not match the release's records (carc: listed, but the release holds no record of it)"]);
      release('content/outgoing/1', files, 1, { contents: [] });
      expect(problems()).toEqual([
        "content/outgoing/1: COVERAGE.md's contents do not match the release's records (therapy_threshold: not listed, but the release holds 2 record(s) of it)",
      ]);
    });

    it('refuses a release that stops covering what the previous one covered, unless a signed withdrawal lists it', () => {
      thresholds('content/releases/1', [verified(), verified(OT)]);
      thresholds('content/outgoing/2', [verified()]);
      expect(problems()).toEqual([
        'content/outgoing/2: release 2 stops covering therapy_threshold {"discipline":"OT"} from 2026-01-01 to 2026-12-31, which release 1 covered: keep those records, or withdraw that coverage with a signed note (content/sources/README.md, "Coverage")',
      ]);
      const entry = {
        record_type: 'therapy_threshold' as const,
        key: { discipline: 'OT' },
        from: '2026-01-01',
        to: '2026-12-31',
        reason: 'OT thresholds are no longer priced by this release',
        withdrawn_by: 'First Person',
        confirmed_by: 'Second Person',
        withdrawn_on: '2026-10-19',
      };
      thresholds('content/outgoing/2', [verified()], { withdrawn: [entry] });
      expect(problems()).toEqual([]);
      thresholds('content/outgoing/2', [verified()], { withdrawn: [{ ...entry, withdrawn_on: '2026-10-21' }] });
      expect(problems()).toEqual(['content/outgoing/2: COVERAGE.md withdrawn 0: withdrawn_on 2026-10-21 is after the release was prepared (2026-10-20)']);
      thresholds('content/outgoing/2', [verified(), verified(OT)], { withdrawn: [entry] });
      expect(problems()).toEqual([
        'content/outgoing/2: COVERAGE.md lists withdrawn therapy_threshold {"discipline":"OT"} 2026-01-01 to 2026-12-31, which is not a coverage loss of that kind',
      ]);
    });

    it('lists the losses before the look-back and those the source closed, and nothing else', () => {
      const old = verified({ effective_from: '2019-01-01', effective_to: '2025-12-31' });
      const typedCarc = (overrides: Partial<RuleRecord>) =>
        exampleRecord(
          'carc',
          withBody(
            'carc',
            { key: { code: '45' }, value: { description: 'Charge exceeds the fee schedule', start_date: '2001-01-01', last_modified: null, stop_date: null, notes: '' } },
            {
              source: { ...handTyped().source, url: 'https://example.invalid/rules' },
              verification: { level: 'L2', by: 'reviewer', on: '2026-10-20', questions: [] },
              quotes: [QUOTE],
              effective_from: '2001-01-01',
              effective_to: null,
            },
            overrides,
          ),
        );
      const filesOf = (thresholdRecords: readonly RuleRecord[], carc: RuleRecord) => ({
        ...releaseFiles(thresholdRecords),
        'carc/2026/records.json': serializeRecords([carc]),
        'carc/2026/records.second-pass.json': secondPass([carc]),
      });
      release('content/releases/1', filesOf([old, verified({ effective_from: '2026-01-01' })], typedCarc({})), 1);
      const closed = typedCarc({ effective_to: '2026-06-30' });
      const before = { record_type: 'therapy_threshold' as const, key: { discipline: 'PT_SLP' }, from: '2019-01-01', to: '2019-12-31' };
      const byClose = { record_type: 'carc' as const, key: { code: '45' }, from: '2026-07-01', to: null };
      release('content/outgoing/2', filesOf([verified()], closed), 2, { before_cutoff: [before], closed_by_source: [byClose] });
      expect(problems()).toEqual([
        'content/outgoing/2: release 2 stops covering therapy_threshold {"discipline":"PT_SLP"} from 2020-01-01 to 2025-12-31, which release 1 covered: keep those records, or withdraw that coverage with a signed note (content/sources/README.md, "Coverage")',
      ]);
      const kept = verified({ effective_from: '2020-01-01', effective_to: '2025-12-31' });
      release('content/outgoing/2', filesOf([kept, verified()], closed), 2, { before_cutoff: [before], closed_by_source: [byClose] });
      expect(problems()).toEqual([]);
      release('content/outgoing/2', filesOf([kept, verified()], closed), 2, { before_cutoff: [], closed_by_source: [byClose, byClose] });
      expect(problems()).toEqual([
        'content/outgoing/2: COVERAGE.md does not list before_cutoff therapy_threshold {"discipline":"PT_SLP"} 2019-01-01 to 2019-12-31',
        'content/outgoing/2: COVERAGE.md lists closed_by_source carc {"code":"45"} 2026-07-01 to open, which is not a coverage loss of that kind',
      ]);
    });

    it('fails closed when the previous release cannot be read', () => {
      thresholds('content/releases/1', [verified()]);
      write('content/releases/1/therapy_threshold/2026/records.json', '[');
      thresholds('content/outgoing/2', [verified()]);
      expect(problems()).toContain(
        'content/outgoing/2: the previous release 1 cannot be read (content/releases/1/therapy_threshold/2026/records.json: is not valid JSON), so this release\'s coverage cannot be compared',
      );
    });

    it('keeps at most two coverage maps while checking releases in order', () => {
      thresholds('content/releases/1', [verified()]);
      thresholds('content/releases/2', [verified()]);
      thresholds('content/releases/3', [verified(), verified(OT)]);
      thresholds('content/releases/4', [verified()]);
      expect(problems()).toEqual([expect.stringContaining('content/releases/4: release 4 stops covering therapy_threshold {"discipline":"OT"}')]);
    });
  });

  describe('the drafts note (COVERAGE-WITHDRAWN.md)', () => {
    const note = (fields: Record<string, unknown>) =>
      `# Withdrawn\n\nOne entry.\n\n\`\`\`json\n${JSON.stringify({
        format: 'tp-coverage-withdrawn/1',
        previous_release: 1,
        withdrawn: [
          {
            record_type: 'therapy_threshold',
            key: { discipline: 'OT' },
            from: '2026-01-01',
            to: '2026-12-31',
            reason: 'OT thresholds are no longer priced',
            withdrawn_by: 'First Person',
            confirmed_by: 'Second Person',
            withdrawn_on: '2026-10-19',
            ...fields,
          },
        ],
      })}\n\`\`\`\n`;

    it('passes a note for the release assembled next, signed by two people', () => {
      release('content/releases/1', releaseFiles([verified()]), 1);
      write('content/drafts/COVERAGE-WITHDRAWN.md', note({}));
      expect(problems()).toEqual([]);
    });

    it('refuses a note that is malformed or signed twice by one person', () => {
      release('content/releases/1', releaseFiles([verified()]), 1);
      write('content/drafts/COVERAGE-WITHDRAWN.md', '# Withdrawn\n');
      expect(problems()).toEqual(['content/drafts/COVERAGE-WITHDRAWN.md: holds 0 ```json blocks: it must hold exactly one']);
      write('content/drafts/COVERAGE-WITHDRAWN.md', note({ confirmed_by: 'first person' }));
      expect(problems()).toEqual(['content/drafts/COVERAGE-WITHDRAWN.md: withdrawn.0.confirmed_by: confirmed_by must be a person other than withdrawn_by']);
    });

    it('refuses a stale note, written against a release that is not the newest', () => {
      write('content/drafts/COVERAGE-WITHDRAWN.md', note({}));
      expect(problems()).toEqual([
        'content/drafts/COVERAGE-WITHDRAWN.md: names previous release 1, but the newest release is none: it belongs to a release already assembled, so remove it',
      ]);
      release('content/releases/1', releaseFiles([verified()]), 1);
      release('content/outgoing/2', releaseFiles([verified()]), 2);
      expect(problems()).toEqual([
        'content/drafts/COVERAGE-WITHDRAWN.md: names previous release 1, but the newest release is 2: it belongs to a release already assembled, so remove it',
      ]);
    });
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

  it('passes every synthetic fixture release (the quarter rules exempt fixtures; none has a gap)', () => {
    const releases = readdirSync(path.join(repositoryRoot, 'fixtures/synthetic/rules')).filter((name) => name.startsWith('release-synth-'));
    expect(releases.length).toBeGreaterThanOrEqual(6);
    for (const name of releases) {
      expect(checkContent(repositoryRoot, [`fixtures/synthetic/rules/${name}`]).problems, name).toEqual([]);
    }
  });
});
