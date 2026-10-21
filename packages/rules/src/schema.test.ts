import { describe, expect, it } from 'vitest';

import {
  DENIAL_CATEGORIES,
  MIN_QUOTE_LENGTH,
  RULE_RECORD_TYPES,
  VERIFICATION_LEVELS,
  cmsQuarterOf,
  isIsoDate,
  isRepositoryPath,
  isRuleRecordType,
  parseRuleRecord,
  secondPassSchema,
} from './schema';
import { EXAMPLE_SOURCE, exampleRecord, exampleRecords } from './testing';

function issuesOf(input: unknown): readonly string[] {
  const result = parseRuleRecord(input);
  return result.ok ? [] : result.issues;
}

function withValue(type: Parameters<typeof exampleRecord>[0], value: Record<string, unknown>) {
  const record = exampleRecord(type);
  return { ...record, value: { ...record.value, ...value } };
}

describe('record types', () => {
  it('has the fifteen data-dictionary types plus the denial-category lookup and the ZIP+4 ranges (PR 6b Q3 (a))', () => {
    expect(RULE_RECORD_TYPES).toEqual([
      'pfs_rvu',
      'pfs_gpci',
      'conversion_factor',
      'mppr_rate',
      'therapy_threshold',
      'assistant_modifier',
      'sequestration',
      'ncci_ptp',
      'ncci_mue',
      'carc',
      'rarc',
      'claim_status_code',
      'state_prompt_pay',
      'dispute_window',
      'locality_map',
      'locality_map_plus_four',
      'denial_category',
    ]);
    expect(isRuleRecordType('carc') && !isRuleRecordType('fee')).toBe(true);
    expect(VERIFICATION_LEVELS).toEqual(['L1', 'L2', 'L3']);
    expect(DENIAL_CATEGORIES).toEqual(['authorization', 'visit_limit', 'modifier', 'medical_necessity', 'timely_filing', 'bundling', 'other']);
  });

  it('accepts a valid record of every type', () => {
    for (const record of exampleRecords()) {
      expect(issuesOf(record), record.record_type).toEqual([]);
    }
  });

  it('accepts the other mppr_rate shape: one code from the rate file', () => {
    expect(issuesOf(exampleRecord('mppr_rate', { key: { hcpcs: '97110', modifier: '' }, value: { pe_reduction_percent: null } }))).toEqual([]);
    expect(issuesOf(exampleRecord('mppr_rate', { key: { hcpcs: '97110', modifier: '' }, value: { reduction_percent: '40', applies_to: 'x' } } as never)).length).toBeGreaterThan(0);
  });
});

describe('the envelope', () => {
  it('requires a source', () => {
    const { source: _source, ...withoutSource } = exampleRecord('carc');
    expect(issuesOf(withoutSource)).toEqual([expect.stringContaining('source')]);
  });

  it.each([
    ['a short hash', { sha256: 'abc' }, 'source.sha256'],
    ['an upper-case hash', { sha256: 'A'.repeat(64) }, 'source.sha256'],
    ['an absolute path', { path: '/etc/passwd' }, 'source.path'],
    ['a path that leaves the repository', { path: 'content/../../x' }, 'source.path'],
    ['a retrieved date that is not a date', { retrieved: '2026-02-30' }, 'source.retrieved'],
    ['a URL that is not http', { url: 'ftp://example.invalid/x' }, 'source.url'],
    ['a synthetic source not titled SYNTHETIC', { title: 'Example' }, 'source.title'],
  ])('refuses %s', (_name, change, path) => {
    expect(issuesOf(exampleRecord('carc', { source: { ...EXAMPLE_SOURCE, ...change } as never }))).toEqual([expect.stringContaining(path)]);
  });

  it('requires a parser name for parsed sources and a transcriber for hand-typed ones', () => {
    const { transcribed_by: _by, transcribed_on: _on, ...base } = EXAMPLE_SOURCE as Extract<typeof EXAMPLE_SOURCE, { method: 'hand_typed' }>;
    expect(issuesOf(exampleRecord('carc', { source: { ...base, method: 'parser', parser: 'x12_code_list' } }))).toEqual([]);
    expect(issuesOf(exampleRecord('carc', { source: { ...base, method: 'parser' } as never })).length).toBeGreaterThan(0);
    expect(issuesOf(exampleRecord('carc', { source: { ...base, method: 'hand_typed' } as never })).length).toBeGreaterThan(0);
  });

  it('requires at least one quote, a verification level and a calendar date', () => {
    expect(issuesOf(exampleRecord('carc', { quotes: [] }))).toEqual(['quotes: must quote the source at least once']);
    expect(issuesOf(exampleRecord('carc', { quotes: [''] }))).toEqual([
      'quotes.0: must quote at least 8 characters of the source',
      'quotes.0: must quote words or numbers, not only spaces and punctuation',
    ]);
    expect(issuesOf(exampleRecord('carc', { verification: { level: 'L4', by: 'x', on: '2026-10-15', questions: [] } as never }))).toEqual([
      expect.stringContaining('verification.level'),
    ]);
    expect(issuesOf(exampleRecord('carc', { effective_from: '2026-13-01' }))).toEqual([expect.stringContaining('effective_from')]);
  });

  it('refuses a quote that is blank, punctuation or shorter than eight characters, ignoring surrounding spaces', () => {
    expect(issuesOf(exampleRecord('carc', { quotes: ['    abc    '] }))).toEqual(['quotes.0: must quote at least 8 characters of the source']);
    expect(issuesOf(exampleRecord('carc', { quotes: ['--------'] }))).toEqual(['quotes.0: must quote words or numbers, not only spaces and punctuation']);
    expect(issuesOf(exampleRecord('carc', { quotes: ['  $2,480 for PT  '] }))).toEqual([]);
    expect(MIN_QUOTE_LENGTH).toBe(8);
  });

  it('requires the source URL on a real record at L2 or above, and on no other', () => {
    const real = { ...EXAMPLE_SOURCE, synthetic: false, title: 'A public page', path: 'content/sources/carc/x.csv' };
    const l2 = { level: 'L2' as const, by: 'A. Reviewer', on: '2026-10-20', questions: [] };
    expect(issuesOf(exampleRecord('carc', { source: real, verification: l2 }))).toEqual([expect.stringContaining('source.url: must name where the source was downloaded from')]);
    expect(issuesOf(exampleRecord('carc', { source: { ...real, url: 'https://example.invalid/x.csv' }, verification: l2 }))).toEqual([]);
    expect(issuesOf(exampleRecord('carc', { source: real }))).toEqual([]);
    expect(issuesOf(exampleRecord('carc', { verification: l2 }))).toEqual([]);
  });

  it('refuses an effective window that ends before it starts', () => {
    expect(issuesOf(exampleRecord('carc', { effective_from: '2026-02-01', effective_to: '2026-01-31' }))).toEqual([
      'effective_to: must not be before effective_from',
    ]);
    expect(issuesOf(exampleRecord('carc', { effective_from: '2026-02-01', effective_to: '2026-02-01' }))).toEqual([]);
    expect(issuesOf(exampleRecord('carc', { effective_to: null }))).toEqual([]);
  });

  it('refuses unknown fields anywhere', () => {
    expect(issuesOf({ ...exampleRecord('carc'), extra: 1 })).toEqual([expect.stringContaining('extra')]);
    expect(issuesOf(withValue('carc', { colour: 'red' }))).toEqual([expect.stringContaining('colour')]);
  });

  it('refuses an unknown record type', () => {
    expect(issuesOf({ ...exampleRecord('carc'), record_type: 'fee' })).toEqual([expect.stringContaining('record_type')]);
  });
});

describe('ranges on numeric fields', () => {
  it.each([
    ['pfs_rvu', { work_rvu: '10000' }, 'value.work_rvu: is out of range'],
    ['pfs_rvu', { work_rvu: '0.12345' }, 'value.work_rvu: must have at most 4 decimal places'],
    ['pfs_rvu', { mp_rvu: '-0.01' }, 'value.mp_rvu: must be a decimal string'],
    ['pfs_rvu', { pe_rvu_facility: 0 }, 'value.pe_rvu_facility'],
    ['pfs_gpci', { work_gpci: '0' }, 'value.work_gpci: is out of range'],
    ['pfs_gpci', { pe_gpci: '5.0001' }, 'value.pe_gpci: is out of range'],
    ['conversion_factor', { conversion_factor: '0' }, 'value.conversion_factor: is out of range'],
    ['conversion_factor', { conversion_factor: '1000.0001' }, 'value.conversion_factor: is out of range'],
    ['mppr_rate', { reduction_percent: '0' }, 'value.reduction_percent'],
    ['mppr_rate', { reduction_percent: '100.5' }, 'value.reduction_percent'],
    ['therapy_threshold', { kx_threshold_cents: '0' }, 'value.kx_threshold_cents: is out of range'],
    ['therapy_threshold', { kx_threshold_cents: '10000001' }, 'value.kx_threshold_cents: is out of range'],
    ['therapy_threshold', { kx_threshold_cents: '2480.00' }, 'value.kx_threshold_cents: must be integer cents'],
    ['therapy_threshold', { medical_review_threshold_cents: 300000 }, 'value.medical_review_threshold_cents'],
    ['assistant_modifier', { payment_percent: '0' }, 'value.payment_percent: is out of range'],
    ['assistant_modifier', { payment_percent: '101' }, 'value.payment_percent: is out of range'],
    ['sequestration', { reduction_percent: '100.0001' }, 'value.reduction_percent: is out of range'],
    ['ncci_mue', { mue: 10000 }, 'value.mue: is out of range'],
    ['ncci_mue', { mue: 3 / 2 }, 'value.mue: must be a whole number'],
    ['ncci_mue', { mue: -1 }, 'value.mue: is out of range'],
    ['state_prompt_pay', { days_to_pay: 0 }, 'value.days_to_pay: is out of range'],
    ['state_prompt_pay', { days_to_pay: 366 }, 'value.days_to_pay: is out of range'],
    ['dispute_window', { length: 0 }, 'value.length: is out of range'],
    ['dispute_window', { length: 3651 }, 'value.length: is out of range'],
    ['dispute_window', { length: 121, unit: 'months' }, 'value.length: is out of range: a window in months must be at most 120'],
  ] as const)('%s refuses %j', (type, value, message) => {
    expect(issuesOf(withValue(type, value))).toEqual([expect.stringContaining(message)]);
  });

  it('accepts the boundaries themselves', () => {
    expect(issuesOf(withValue('pfs_rvu', { work_rvu: '9999', mp_rvu: '0' }))).toEqual([]);
    expect(issuesOf(withValue('pfs_gpci', { work_gpci: '0.0001', pe_gpci: '5' }))).toEqual([]);
    expect(issuesOf(withValue('therapy_threshold', { kx_threshold_cents: '1', medical_review_threshold_cents: '10000000' }))).toEqual([]);
    expect(issuesOf(withValue('assistant_modifier', { payment_percent: '100' }))).toEqual([]);
    expect(issuesOf(withValue('sequestration', { reduction_percent: '0', suspended: true }))).toEqual([]);
    expect(issuesOf(withValue('sequestration', { reduction_percent: '0.0001' }))).toEqual([]);
    expect(issuesOf(withValue('ncci_mue', { mue: 0 }))).toEqual([]);
    expect(issuesOf(withValue('dispute_window', { length: 120, unit: 'months' }))).toEqual([]);
    expect(issuesOf(withValue('dispute_window', { length: 3650, unit: 'days' }))).toEqual([]);
  });

  it('checks codes and keys', () => {
    expect(issuesOf(exampleRecord('pfs_rvu', { key: { hcpcs: '9711', modifier: '' } }))).toEqual([expect.stringContaining('key.hcpcs')]);
    expect(issuesOf(exampleRecord('pfs_rvu', { key: { hcpcs: '97110', modifier: 'G' } }))).toEqual([expect.stringContaining('key.modifier')]);
    expect(issuesOf(exampleRecord('locality_map', { key: { zip: '123' } }))).toEqual([expect.stringContaining('key.zip')]);
    expect(issuesOf(exampleRecord('assistant_modifier', { key: { modifier: 'GP' } as never }))).toEqual([expect.stringContaining('key.modifier')]);
  });
});

describe('the ZIP+4 ranges of a ZIP (locality_map_plus_four)', () => {
  type Range = { from: unknown; to: unknown; carrier?: unknown; locality?: unknown; rural_indicator?: unknown };
  const ranges = (...items: Range[]) => withValue('locality_map_plus_four', { ranges: items.map((item) => ({ carrier: '99999', locality: '01', rural_indicator: 'R', ...item })) });

  it('takes inclusive four-digit ranges, sorted by their start and never overlapping, one code or the whole ZIP', () => {
    expect(issuesOf(ranges({ from: '0000', to: '4999' }, { from: '5000', to: '8999', locality: '02' }))).toEqual([]);
    expect(issuesOf(ranges({ from: '1234', to: '1234' }))).toEqual([]);
    expect(issuesOf(ranges({ from: '0000', to: '9999', rural_indicator: null }))).toEqual([]);
    expect(issuesOf(ranges({ from: '0000', to: '0001' }, { from: '0003', to: '0003' }))).toEqual([]);
  });

  it.each([
    ['a range that ends before it starts', [{ from: '5000', to: '4999' }], 'value.ranges.0.to: is out of range: a range ends at 4999, before its start 5000'],
    ['ranges out of order', [{ from: '5000', to: '8999' }, { from: '0000', to: '4999' }], 'value.ranges.1.from: must start after the range before it ends (8999)'],
    ['overlapping ranges', [{ from: '0000', to: '5000' }, { from: '5000', to: '8999' }], 'value.ranges.1.from: must start after the range before it ends (5000)'],
    ['a range inside the one before', [{ from: '0000', to: '8999' }, { from: '1000', to: '2000' }], 'value.ranges.1.from: must start after the range before it ends (8999)'],
    ['a three-digit bound', [{ from: '000', to: '4999' }], 'value.ranges.0.from: must be the four digits of a ZIP+4'],
    ['a five-digit bound', [{ from: '0000', to: '49999' }], 'value.ranges.0.to: must be the four digits of a ZIP+4'],
    ['a bound with a letter', [{ from: '00A0', to: '4999' }], 'value.ranges.0.from: must be the four digits of a ZIP+4'],
    ['a carrier of four digits', [{ from: '0000', to: '4999', carrier: '9999' }], 'value.ranges.0.carrier'],
    ['a one-digit locality', [{ from: '0000', to: '4999', locality: '1' }], 'value.ranges.0.locality'],
    ['a rural indicator other than blank, R or B', [{ from: '0000', to: '4999', rural_indicator: 'X' }], 'value.ranges.0.rural_indicator'],
  ] as const)('refuses %s', (_name, items, message) => {
    expect(issuesOf(ranges(...items))).toEqual([expect.stringContaining(message)]);
  });

  it('compares only the bounds the pattern accepts, so a malformed bound is reported once', () => {
    expect(issuesOf(ranges({ from: '0000', to: '4999' }, { from: 'x', to: '5999' }, { from: '5000', to: '8999' }))).toEqual([expect.stringContaining('value.ranges.1.from: must be the four digits of a ZIP+4')]);
  });

  it('refuses a ZIP with no range, an extra field, and a key that is not a five-digit ZIP', () => {
    expect(issuesOf(withValue('locality_map_plus_four', { ranges: [] }))).toEqual([expect.stringContaining('value.ranges: must hold at least one range')]);
    expect(issuesOf(ranges({ from: '0000', to: '4999', plus_four_required: true } as Range))).toEqual([expect.stringContaining('value.ranges.0')]);
    expect(issuesOf(exampleRecord('locality_map_plus_four', { key: { zip: '0001' } }))).toEqual([expect.stringContaining('key.zip: must be a five-digit ZIP code')]);
    expect(issuesOf(withValue('locality_map_plus_four', { state: 'Z' }))).toEqual([expect.stringContaining('value.state')]);
  });

  it('holds at most one range per four-digit code', () => {
    const every = Array.from({ length: 10_000 }, (_, code) => ({ from: String(code).padStart(4, '0'), to: String(code).padStart(4, '0') }));
    expect(issuesOf(ranges(...every))).toEqual([]);
    expect(issuesOf(ranges(...every, { from: '9999', to: '9999' }))).toEqual([expect.stringContaining('value.ranges: must hold at most 10000 ranges')]);
  });
});

describe('sequestration suspensions', () => {
  it('reduce by exactly 0, while a reduction in force is above 0', () => {
    expect(issuesOf(withValue('sequestration', { reduction_percent: '0', suspended: false }))).toEqual([expect.stringContaining('a suspension reduces by 0')]);
    expect(issuesOf(withValue('sequestration', { reduction_percent: '2', suspended: true }))).toEqual([expect.stringContaining('a suspension reduces by 0')]);
    expect(issuesOf(withValue('sequestration', { reduction_percent: '0.00', suspended: true }))).toEqual([]);
  });
});

describe('the fee schedule year and quarter of an RVU record', () => {
  it('match the start of its window', () => {
    expect(cmsQuarterOf('2026-01-01')).toBe('A');
    expect(cmsQuarterOf('2026-04-01')).toBe('B');
    expect(cmsQuarterOf('2026-09-30')).toBe('C');
    expect(cmsQuarterOf('2026-10-01')).toBe('D');
    expect(issuesOf(exampleRecord('pfs_rvu', { effective_from: '2026-04-01', effective_to: null }))).toEqual([
      'value.quarter: must match effective_from 2026-04-01 (year 2026, quarter B)',
    ]);
    expect(issuesOf(withValue('pfs_rvu', { year: 2025 }))).toEqual(['value.quarter: must match effective_from 2026-01-01 (year 2026, quarter A)']);
    expect(issuesOf(withValue('pfs_rvu', { quarter: 'E' }))).toEqual([expect.stringContaining('value.quarter')]);
    expect(issuesOf({ ...exampleRecord('pfs_rvu', { effective_from: '2026-07-01', effective_to: null }), value: { ...exampleRecord('pfs_rvu').value, quarter: 'C' } })).toEqual([]);
  });
});

describe('isIsoDate', () => {
  it.each(['2026-01-01', '2024-02-29', '1996-01-01', '2026-12-31'])('accepts %s', (text) => {
    expect(isIsoDate(text)).toBe(true);
  });

  it.each(['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '2026-1-1', '20260101', '1899-12-31', '', '2026-01-01T00:00:00Z'])('refuses %j', (text) => {
    expect(isIsoDate(text)).toBe(false);
  });
});

describe('isRepositoryPath', () => {
  it.each(['content/sources/plan/rules-reference.md', 'a', 'fixtures/synthetic/cms/x.csv'])('accepts %s', (text) => {
    expect(isRepositoryPath(text)).toBe(true);
  });

  it.each(['', '/abs', 'a/../b', '..', './a', 'a//b', 'a\\b', 'a/', `a${String.fromCharCode(0)}b`])('refuses %j', (text) => {
    expect(isRepositoryPath(text)).toBe(false);
  });
});

describe('secondPassSchema', () => {
  const record = exampleRecord('therapy_threshold');
  const transcribed = {
    record_type: record.record_type,
    key: record.key,
    value: record.value,
    effective_from: record.effective_from,
    effective_to: record.effective_to,
    quotes: record.quotes,
  };

  it('accepts a second transcription', () => {
    expect(secondPassSchema.safeParse({ transcribed_by: 'second', transcribed_on: '2026-10-15', records: [transcribed] }).success).toBe(true);
  });

  it('refuses one without a transcriber, without records, or with fields that are not transcribed', () => {
    expect(secondPassSchema.safeParse({ transcribed_on: '2026-10-15', records: [transcribed] }).success).toBe(false);
    expect(secondPassSchema.safeParse({ transcribed_by: 'x', transcribed_on: '2026-10-15', records: [] }).success).toBe(false);
    expect(secondPassSchema.safeParse({ transcribed_by: 'x', transcribed_on: '2026-10-15', records: [{ ...transcribed, notes: '' }] }).success).toBe(false);
  });
});
