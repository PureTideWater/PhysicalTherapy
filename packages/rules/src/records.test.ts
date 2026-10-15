import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
  compareText,
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
import type { RuleRecord } from './schema';
import { exampleRecord } from './testing';

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
