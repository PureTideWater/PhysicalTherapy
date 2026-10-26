import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CONTENT_IDS,
  ContentSummaryBuilder,
  canonicalJson,
  compareText,
  contentOf,
  contentSummaries,
  coverageWithdrawnNoteSchema,
  dayAfter,
  dayBefore,
  decodeSourceText,
  diffTranscriptions,
  findOverlaps,
  isSecondPassFile,
  quoteIndex,
  recordIdentity,
  recordLabel,
  recordSha256,
  secondPassPathFor,
  serializeRecords,
  sha256,
  transcription,
  windowsOverlap,
} from './records';
import { RULE_RECORD_TYPES, type RuleRecord } from './schema';
import { EXAMPLE_SOURCE, exampleRecord, exampleRecords } from './testing';

describe('canonicalJson', () => {
  it('sorts keys at every level and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: true, y: null }], c: 'x' } })).toBe('{"a":{"c":"x","d":[3,{"y":null,"z":true}]},"b":1}');
  });

  it('drops undefined members like JSON does', () => {
    expect(canonicalJson({ a: undefined, b: 'x' })).toBe('{"b":"x"}');
  });

  it('refuses values JSON cannot hold', () => {
    expect(() => canonicalJson(1n)).toThrow(/bigint/);
    expect(() => canonicalJson(Number.NaN)).toThrow(/non-finite/);
    expect(() => canonicalJson(() => 1)).toThrow(/function/);
  });

  it('is the same for any key order (property)', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null))), (object) => {
        const reversed = Object.fromEntries(Object.entries(object).reverse());
        expect(canonicalJson(reversed)).toBe(canonicalJson(object));
        expect(JSON.parse(canonicalJson(object))).toEqual(object);
      }),
    );
  });
});

describe('record identity and hashes', () => {
  const record = exampleRecord('pfs_rvu');

  it('identifies a rule by its type and key, and labels it with its start', () => {
    expect(recordIdentity(record)).toBe('pfs_rvu {"hcpcs":"97110","modifier":""}');
    expect(recordLabel(record)).toBe('pfs_rvu {"hcpcs":"97110","modifier":""} from 2026-01-01');
  });

  it('hashes the canonical JSON, so field order does not matter but content does', () => {
    const reordered = Object.fromEntries(Object.entries(record).reverse()) as RuleRecord;
    expect(recordSha256(reordered)).toBe(recordSha256(record));
    expect(recordSha256(record)).toBe(sha256(canonicalJson(record)));
    expect(recordSha256({ ...record, notes: 'changed' })).not.toBe(recordSha256(record));
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('orders text by code unit', () => {
    expect(['2026-02-01', '2025-12-31', '2026-01-15'].sort(compareText)).toEqual(['2025-12-31', '2026-01-15', '2026-02-01']);
    expect(compareText('a', 'a')).toBe(0);
  });
});

describe('effective windows', () => {
  const window = (from: string, to: string | null) => ({ effective_from: from, effective_to: to });

  it.each([
    [window('2026-01-01', '2026-03-31'), window('2026-04-01', null), false],
    [window('2026-01-01', '2026-04-01'), window('2026-04-01', null), true],
    [window('2026-01-01', null), window('2027-01-01', '2027-12-31'), true],
    [window('2026-05-01', '2026-05-31'), window('2026-01-01', '2026-12-31'), true],
    [window('2027-01-01', null), window('2026-01-01', '2026-12-31'), false],
  ])('%j and %j overlap: %s', (a, b, expected) => {
    expect(windowsOverlap(a, b)).toBe(expected);
    expect(windowsOverlap(b, a)).toBe(expected);
  });

  const at = (from: string, to: string | null, where: string, hcpcs = '97110') => ({
    record: exampleRecord('pfs_rvu', { key: { hcpcs, modifier: '' }, effective_from: from, effective_to: to }),
    where,
  });

  it('finds no overlap between consecutive quarters or different keys', () => {
    expect(findOverlaps([at('2026-01-01', '2026-03-31', 'a'), at('2026-04-01', null, 'b'), at('2026-01-01', null, 'c', '97112')])).toEqual([]);
  });

  it('pairs an overlapping record with the earlier one that reaches furthest', () => {
    const overlaps = findOverlaps([at('2026-01-01', '2026-12-31', 'year'), at('2026-02-01', '2026-02-28', 'feb'), at('2026-06-01', null, 'june')]);
    expect(overlaps.map(({ first, second }) => [first.where, second.where])).toEqual([
      ['year', 'feb'],
      ['year', 'june'],
    ]);
  });

  it('finds every record that overlaps an earlier one (property, against brute force)', () => {
    const day = fc.integer({ min: 0, max: 60 }).map((offset) => new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10));
    const span = fc.tuple(day, fc.option(day)).map(([a, b]) => (b === null ? { from: a, to: null } : a <= b ? { from: a, to: b } : { from: b, to: a }));
    fc.assert(
      fc.property(fc.array(fc.tuple(span, fc.constantFrom('97110', '97112')), { maxLength: 8 }), (spans) => {
        const located = spans.map(([{ from, to }, hcpcs], index) => at(from, to, String(index), hcpcs));
        const reported = new Set(findOverlaps(located).map(({ second }) => second.where));
        const sorted = [...located].sort((a, b) => compareText(a.record.effective_from, b.record.effective_from));
        // A record is reported when it overlaps any record of its key that sorts before it.
        const expected = new Set(
          sorted
            .filter((current, index) =>
              sorted.slice(0, index).some((earlier) => recordIdentity(earlier.record) === recordIdentity(current.record) && windowsOverlap(earlier.record, current.record)),
            )
            .map((current) => current.where),
        );
        expect(reported).toEqual(expected);
      }),
    );
  });
});

describe('serializeRecords', () => {
  it('writes one record per line in a JSON array', () => {
    const records = [exampleRecord('carc'), exampleRecord('rarc')];
    const text = serializeRecords(records);
    expect(text.split('\n')).toHaveLength(5);
    expect(text.startsWith('[\n{"record_type":"carc"')).toBe(true);
    expect(JSON.parse(text)).toEqual(records);
    expect(serializeRecords([])).toBe('[]\n');
  });
});

describe('second-pass file names', () => {
  it('sit beside the record file', () => {
    expect(secondPassPathFor('therapy_threshold/2026/records.json')).toBe('therapy_threshold/2026/records.second-pass.json');
    expect(isSecondPassFile('a/records.second-pass.json')).toBe(true);
    expect(isSecondPassFile('a/records.json')).toBe(false);
  });
});

describe('diffTranscriptions', () => {
  const first = [exampleRecord('therapy_threshold'), exampleRecord('therapy_threshold', { key: { discipline: 'OT' } })];
  const pass = (records: readonly RuleRecord[]) => records.map((record) => ({ record_type: record.record_type, ...transcription(record) })) as never[];

  it('is empty when the two passes agree exactly', () => {
    expect(diffTranscriptions(first, pass(first))).toEqual([]);
    expect(diffTranscriptions(first, pass([...first].reverse()))).toEqual([]);
  });

  it('names every field that differs, with both values', () => {
    const typo = exampleRecord('therapy_threshold', { value: { kx_threshold_cents: '111000', medical_review_threshold_cents: '133300' } });
    expect(diffTranscriptions(first, pass([typo, first[1] as RuleRecord]))).toEqual([
      'therapy_threshold {"discipline":"PT_SLP"} from 2026-01-01: value differs: first pass {"kx_threshold_cents":"111100","medical_review_threshold_cents":"133300"}, second pass {"kx_threshold_cents":"111000","medical_review_threshold_cents":"133300"}',
    ]);
    const quote = exampleRecord('therapy_threshold', { quotes: ['SYNTHETIC.'] });
    const end = exampleRecord('therapy_threshold', { effective_to: '2026-12-30' });
    expect(diffTranscriptions([first[0] as RuleRecord], pass([quote]))).toEqual([expect.stringContaining('quotes differs')]);
    expect(diffTranscriptions([first[0] as RuleRecord], pass([end]))).toEqual([expect.stringContaining('effective_to differs')]);
  });

  it('reports records missing from either pass, and records transcribed twice', () => {
    expect(diffTranscriptions(first, pass([first[0] as RuleRecord]))).toEqual([expect.stringContaining('"OT"} from 2026-01-01: missing from the second pass')]);
    const extra = exampleRecord('therapy_threshold', { effective_from: '2027-01-01', effective_to: null });
    expect(diffTranscriptions(first, pass([...first, extra]))).toEqual([expect.stringContaining('from 2027-01-01: in the second pass but not among the hand-typed records')]);
    expect(diffTranscriptions(first, pass([...first, first[0] as RuleRecord]))).toEqual([expect.stringContaining('transcribed twice in the second pass')]);
  });
});

describe('source text', () => {
  it('decodes UTF-8, falls back to Windows-1252, and drops a byte-order mark', () => {
    expect(decodeSourceText(new TextEncoder().encode('café ≤ 2'))).toBe('café ≤ 2');
    expect(decodeSourceText(Uint8Array.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x96]))).toBe('café –');
    expect(decodeSourceText(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41]))).toBe('A');
  });

  it('finds quotes that are whole lines or any substring', () => {
    const has = quoteIndex('first line\r\nsecond, line\nthird');
    expect(has('second, line')).toBe(true);
    expect(has('line\r\nsecond')).toBe(true);
    expect(has('nd, li')).toBe(true);
    expect(has('fourth')).toBe(false);
  });
});

describe('days', () => {
  it('steps one calendar day in UTC across months, years and leap days', () => {
    expect(dayAfter('2026-12-31')).toBe('2027-01-01');
    expect(dayAfter('2028-02-28')).toBe('2028-02-29');
    expect(dayAfter('2026-02-28')).toBe('2026-03-01');
    expect(dayBefore('2026-01-01')).toBe('2025-12-31');
    expect(dayBefore('2028-03-01')).toBe('2028-02-29');
    expect(dayBefore(dayAfter('2026-10-26'))).toBe('2026-10-26');
  });
});

describe('contents', () => {
  it('are the record types in their order, mppr_rate split in place into its two contents', () => {
    expect([...CONTENT_IDS]).toEqual(RULE_RECORD_TYPES.flatMap((type) => (type === 'mppr_rate' ? ['mppr_code', 'mppr_general'] : [type])));
  });

  it('split mppr_rate by its key, as rule_release_content_span() does, and refuse a key with neither', () => {
    expect(contentOf(exampleRecord('mppr_rate'))).toBe('mppr_general');
    expect(contentOf({ record_type: 'mppr_rate', key: { hcpcs: '97110', modifier: '' } })).toBe('mppr_code');
    expect(contentOf(exampleRecord('ncci_mue'))).toBe('ncci_mue');
    expect(() => contentOf({ record_type: 'mppr_rate', key: { code: '97110' } })).toThrow('an mppr_rate key names neither hcpcs nor component: {"code":"97110"}');
  });

  it('summarise each content present, in content order, with merged windows and the newest start and retrieval', () => {
    const records = [
      exampleRecord('ncci_mue', { effective_from: '2026-04-01', effective_to: '2026-06-30', source: { ...EXAMPLE_SOURCE, retrieved: '2026-03-20' } }),
      exampleRecord('ncci_mue', { effective_from: '2026-01-01', effective_to: '2026-03-31', source: { ...EXAMPLE_SOURCE, retrieved: '2025-12-20' } }),
      exampleRecord('ncci_mue', { key: { hcpcs: '97112' }, effective_from: '2026-07-01', effective_to: '2026-09-30' }),
      exampleRecord('mppr_rate', { effective_to: null }),
      { ...exampleRecord('mppr_rate'), key: { hcpcs: '97110', modifier: '' }, value: { pe_reduction_percent: null } } as RuleRecord,
    ];
    expect(contentSummaries(records)).toEqual([
      { content: 'mppr_code', records: 1, windows: [{ from: '2026-01-01', to: '2026-12-31' }], newest_from: '2026-01-01', newest_retrieved: '2026-10-15' },
      { content: 'mppr_general', records: 1, windows: [{ from: '2026-01-01', to: null }], newest_from: '2026-01-01', newest_retrieved: '2026-10-15' },
      { content: 'ncci_mue', records: 3, windows: [{ from: '2026-01-01', to: '2026-09-30' }], newest_from: '2026-07-01', newest_retrieved: '2026-10-15' },
    ]);
    expect(contentSummaries([])).toEqual([]);
  });

  it('are summarised the same a record at a time, through compaction, holding no record', () => {
    const builder = new ContentSummaryBuilder();
    const quarters = ['01-01', '04-01', '07-01', '10-01'];
    const ends = ['03-31', '06-30', '09-30', '12-31'];
    const many: RuleRecord[] = [];
    for (let index = 0; index < 10_000; index += 1) {
      const year = 2020 + (index % 7);
      const quarter = index % 4;
      many.push(exampleRecord('ncci_ptp', { effective_from: `${String(year)}-${quarters[quarter] ?? ''}`, effective_to: `${String(year)}-${ends[quarter] ?? ''}` }));
    }
    many.push(...exampleRecords());
    for (const record of many) {
      builder.add(record);
    }
    expect(builder.summaries()).toEqual(contentSummaries(many));
    expect(builder.summaries().find((summary) => summary.content === 'ncci_ptp')).toEqual({
      content: 'ncci_ptp',
      records: 10_001,
      windows: [{ from: '2020-01-01', to: '2026-12-31' }],
      newest_from: '2026-10-01',
      newest_retrieved: '2026-10-15',
    });
    expect(JSON.stringify(builder)).toBe('{}');
  });
});

describe('the drafts\' coverage-withdrawn note', () => {
  const entry = {
    record_type: 'ncci_ptp',
    key: { column1: '97140', column2: '97530' },
    from: '2026-10-01',
    to: null,
    reason: 'SYNTHETIC pair withdrawn by CMS in error',
    withdrawn_by: 'Pat Example',
    confirmed_by: 'Sam Example',
    withdrawn_on: '2026-10-20',
  };
  const note = (changes: Record<string, unknown>) => coverageWithdrawnNoteSchema.safeParse({ format: 'tp-coverage-withdrawn/1', previous_release: 3, withdrawn: [{ ...entry, ...changes }] });

  it('takes an entry signed by two different named people, with a one-line reason', () => {
    expect(note({}).success).toBe(true);
    expect(note({ key: { group_code: null, carc: '45', rarc: null }, record_type: 'denial_category' }).success).toBe(true);
  });

  it('refuses one person twice, compared trimmed and case-folded, and a name or reason that is not one printable line', () => {
    const issues = (changes: Record<string, unknown>) => note(changes).error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    expect(issues({ confirmed_by: 'pat example' })).toEqual(['withdrawn.0.confirmed_by: confirmed_by must be a person other than withdrawn_by']);
    expect(issues({ confirmed_by: ' Pat Example' })).toEqual(['withdrawn.0.confirmed_by: must not start or end with a space', 'withdrawn.0.confirmed_by: confirmed_by must be a person other than withdrawn_by']);
    expect(note({ withdrawn_by: 'P' }).success).toBe(false);
    expect(note({ withdrawn_by: 'Pat\nExample' }).success).toBe(false);
    expect(note({ reason: 'short' }).success).toBe(false);
    expect(note({ reason: 'two lines\nof reason' }).success).toBe(false);
    expect(note({ withdrawn_on: '2026-02-30' }).success).toBe(false);
    expect(note({ sha256: 'a'.repeat(64) }).success).toBe(false);
    expect(coverageWithdrawnNoteSchema.safeParse({ format: 'tp-coverage-withdrawn/1', previous_release: 3, withdrawn: [] }).success).toBe(false);
  });
});
