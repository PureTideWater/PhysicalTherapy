import { describe, expect, it } from 'vitest';

import type { CandidateReview, CitedField, FieldReview } from './functions/contract-terms';
import {
  CORRECTION_FORMAT,
  type Correction,
  PERMITTED_FIELDS,
  type PermittedField,
  type PermittedReport,
  correctionSchema,
  finalKeys,
  permittedRegressions,
  permittedReport,
  permittedReportSchema,
  scorePermitted,
  statedKeys,
} from './permitted';
import { PROMPTS } from './prompts';

// Synthetic terms only: no contract's text, a made-up document ID.
const DOCUMENT = '00000000-0000-4000-8000-0000000000d1';

function field(name: CitedField, written: FieldReview['written'], verified = true): FieldReview {
  return { field: name, page: 1, quote: 'synthetic quote', written, verified, problems: verified ? [] : ['not_in_quote'] };
}

function candidate(method: string, fields: readonly FieldReview[], rateRecord: CandidateReview['rateRecord'] = null): CandidateReview {
  return { index: 0, label: 'synthetic', method, fields, conflictsWith: [], defaults: [], rateRecord, problems: [] };
}

type FinalRecord = Correction['records'][number];

const fixed: FinalRecord = {
  scope: { codes: ['97110', '97112'], modifier_sets: [['GP']], places_of_service: ['11'], effective_from: '2026-01-01', effective_to: '2027-01-01' },
  method: 'FIXED_SCHEDULE',
  parameters: { amount_cents: '4250' },
};

const percent: FinalRecord = {
  scope: { codes: ['97140'] },
  method: 'PERCENT_OF_MEDICARE',
  parameters: { percentage: '110.000000', year_basis: 'LOCKED:2025', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' },
};

/** The candidate that states the fixed record exactly, every field verified. */
const fixedRight = candidate('FIXED_SCHEDULE', [
  field('method', null),
  field('codes', ['97112', ' 97110 ']),
  field('modifiers', ['gp']),
  field('places_of_service', ['11']),
  field('amount', '$42.50'),
  field('flags', null),
  field('rounding', null),
  field('effective_from', 'January 1, 2026'),
  field('effective_to', '12/31/2026'),
]);

const correction = (records: readonly FinalRecord[]): Correction => ({ format: CORRECTION_FORMAT, document_id: DOCUMENT, records: [...records] });

const only = (counts: Record<PermittedField, { tp: number; fp: number; fn: number }>, fieldName: PermittedField) => counts[fieldName];

describe('finalKeys', () => {
  it('reads a fixed record as the contract writes it: sets, cents, and the last day covered', () => {
    expect(finalKeys(fixed)).toEqual({
      method: 'FIXED_SCHEDULE',
      codes: '97110 97112',
      modifiers: 'GP',
      places_of_service: '11',
      amount: '4250',
      effective_from: '2026-01-01',
      effective_to: '2026-12-31',
    });
  });

  it('reads a percentage as a plain decimal and a locked year; a current year is no stated year', () => {
    expect(finalKeys(percent)).toEqual({ method: 'PERCENT_OF_MEDICARE', codes: '97140', percentage: '110', fee_schedule_year: '2025' });
    expect(finalKeys({ ...percent, parameters: { ...percent.parameters, year_basis: 'CURRENT' } })).not.toHaveProperty('fee_schedule_year');
  });

  it('reads a lesser-of record’s schedule, its amount or percentage and year', () => {
    expect(finalKeys({ scope: {}, method: 'LESSER_OF', parameters: { schedule: { method: 'FIXED_SCHEDULE', amount_cents: '5000' }, charge_basis: 'LINE_CHARGE' } })).toEqual({
      method: 'LESSER_OF',
      lesser_of_schedule: 'FIXED_SCHEDULE',
      amount: '5000',
    });
    expect(finalKeys({ scope: {}, method: 'LESSER_OF', parameters: { schedule: { method: 'PERCENT_OF_MEDICARE', percentage: '95.5', year_basis: 'LOCKED:2024' } } })).toEqual({
      method: 'LESSER_OF',
      lesser_of_schedule: 'PERCENT_OF_MEDICARE',
      percentage: '95.5',
      fee_schedule_year: '2024',
    });
  });

  it('leaves out what a record does not hold as text', () => {
    expect(finalKeys({ scope: { codes: [1, 2], modifier_sets: 'GP' }, method: 'LESSER_OF', parameters: { schedule: { method: 7 } } })).toEqual({ method: 'LESSER_OF' });
    expect(finalKeys({ scope: { modifier_sets: [] }, method: 'PER_VISIT', parameters: {} })).toEqual({ method: 'PER_VISIT' });
  });
});

describe('statedKeys', () => {
  it('reads each written value as code does, and skips flags and rounding', () => {
    const stated = statedKeys(fixedRight);
    expect(stated.keys).toEqual(finalKeys(fixed));
    expect([...stated.verified].sort()).toEqual(['amount', 'codes', 'effective_from', 'effective_to', 'method', 'modifiers', 'places_of_service']);
  });

  it('keeps an unverified field’s value but not its verification, and an unreadable one as null', () => {
    const stated = statedKeys(candidate('PERCENT_OF_MEDICARE', [field('percentage', '110 percent', false), field('fee_schedule_year', '2025 fee schedule'), field('amount', 'forty dollars')]));
    expect(stated.keys).toEqual({ method: 'PERCENT_OF_MEDICARE', percentage: '110', fee_schedule_year: '2025', amount: null });
    expect([...stated.verified].sort()).toEqual(['amount', 'fee_schedule_year']);
    expect(statedKeys(candidate('PERCENT_OF_MEDICARE', [field('percentage', 'most'), field('fee_schedule_year', '2024 or 2025')])).keys).toEqual({
      method: 'PERCENT_OF_MEDICARE',
      percentage: null,
      fee_schedule_year: null,
    });
  });

  it('states a lesser-of schedule only when the candidate became a rate record', () => {
    const record = (schedule: unknown): CandidateReview['rateRecord'] => ({
      scope: {},
      method: 'LESSER_OF',
      parameters: { schedule },
      flags: {},
      rounding: null,
      evidence: { document_id: DOCUMENT, page: 1, quote: 'synthetic quote', hash: '0'.repeat(64) },
      proposed_by: 'model',
    });
    expect(statedKeys(candidate('LESSER_OF', [], record({ method: 'FIXED_SCHEDULE' }))).keys.lesser_of_schedule).toBe('FIXED_SCHEDULE');
    expect(statedKeys(candidate('LESSER_OF', [], record(null))).keys).not.toHaveProperty('lesser_of_schedule');
    expect(statedKeys(candidate('LESSER_OF', []))).toEqual({ keys: { method: 'LESSER_OF' }, verified: new Set() });
    expect(statedKeys(candidate('FIXED_SCHEDULE', [], record({ method: 'FIXED_SCHEDULE' }))).keys).not.toHaveProperty('lesser_of_schedule');
  });
});

describe('scorePermitted', () => {
  it('counts every field of an exact, verified proposal right', () => {
    const counts = scorePermitted(correction([fixed]), { documentId: DOCUMENT, candidates: [fixedRight] });
    for (const name of PERMITTED_FIELDS) {
      const expected = name in finalKeys(fixed) ? { tp: 1, fp: 0, fn: 0 } : { tp: 0, fp: 0, fn: 0 };
      expect(only(counts, name)).toEqual(expected);
    }
  });

  it('counts a wrong value, an unverified right value and a left-out field', () => {
    const wrong = candidate('FIXED_SCHEDULE', [
      field('method', null),
      field('codes', ['97110', '97112']),
      field('amount', '$42.05'),
      field('places_of_service', ['11'], false),
      field('effective_from', '2026-01-01'),
      field('effective_to', '2026-12-31'),
    ]);
    const counts = scorePermitted(correction([fixed]), { documentId: DOCUMENT, candidates: [wrong] });
    expect(only(counts, 'amount')).toEqual({ tp: 0, fp: 1, fn: 1 });
    expect(only(counts, 'places_of_service')).toEqual({ tp: 0, fp: 1, fn: 1 });
    expect(only(counts, 'modifiers')).toEqual({ tp: 0, fp: 0, fn: 1 });
    expect(only(counts, 'codes')).toEqual({ tp: 1, fp: 0, fn: 0 });
  });

  it('counts a field the final record does not hold as wrong', () => {
    const extra = candidate('PERCENT_OF_MEDICARE', [field('method', null), field('codes', ['97140']), field('percentage', '110%'), field('fee_schedule_year', '2025'), field('amount', '$10.00')]);
    const counts = scorePermitted(correction([percent]), { documentId: DOCUMENT, candidates: [extra] });
    expect(only(counts, 'amount')).toEqual({ tp: 0, fp: 1, fn: 0 });
    expect(only(counts, 'percentage')).toEqual({ tp: 1, fp: 0, fn: 0 });
    expect(only(counts, 'fee_schedule_year')).toEqual({ tp: 1, fp: 0, fn: 0 });
  });

  it('pairs each final record with the candidate that gets most of it right, and counts an unpaired candidate wrong whole', () => {
    const percentRight = candidate('PERCENT_OF_MEDICARE', [field('method', null), field('codes', ['97140']), field('percentage', '110%'), field('fee_schedule_year', '2025')]);
    const stray = candidate('PER_VISIT', [field('method', null), field('amount', '$99.00')]);
    const counts = scorePermitted(correction([percent, fixed]), { documentId: DOCUMENT, candidates: [stray, fixedRight, percentRight] });
    expect(only(counts, 'percentage')).toEqual({ tp: 1, fp: 0, fn: 0 });
    expect(only(counts, 'amount')).toEqual({ tp: 1, fp: 1, fn: 0 });
    expect(only(counts, 'method')).toEqual({ tp: 2, fp: 1, fn: 0 });
  });

  it('misses a record no candidate gets any field of right, whole', () => {
    const counts = scorePermitted(correction([percent]), { documentId: DOCUMENT, candidates: [candidate('FIXED_SCHEDULE', [field('codes', ['97530'])])] });
    expect(only(counts, 'method')).toEqual({ tp: 0, fp: 1, fn: 1 });
    expect(only(counts, 'codes')).toEqual({ tp: 0, fp: 1, fn: 1 });
    expect(only(counts, 'percentage')).toEqual({ tp: 0, fp: 0, fn: 1 });
  });

  it('counts every final field missed when the call proposed nothing', () => {
    const counts = scorePermitted(correction([fixed, percent]), null);
    expect(only(counts, 'method')).toEqual({ tp: 0, fp: 0, fn: 2 });
    expect(only(counts, 'codes')).toEqual({ tp: 0, fp: 0, fn: 2 });
    expect(only(counts, 'lesser_of_schedule')).toEqual({ tp: 0, fp: 0, fn: 0 });
  });
});

describe('the permitted report and its gate', () => {
  const right = scorePermitted(correction([fixed]), { documentId: DOCUMENT, candidates: [fixedRight] });
  const missed = scorePermitted(correction([fixed]), null);

  it('totals the examples’ counts for the current prompt version and the provider’s pinned models', () => {
    const report = permittedReport('local', 2, [
      { exampleId: 'e1', counts: right, problem: null },
      { exampleId: 'e2', counts: missed, problem: 'call_failed:timeout' },
    ]);
    const prompt = PROMPTS.proposeContractTerms;
    expect(report).toMatchObject({ promptVersion: prompt.id, promptSha256: prompt.sha256, provider: 'local', practices: 2, examples: 2, problems: [{ exampleId: 'e2', problem: 'call_failed:timeout' }] });
    expect(report.modelIds).toEqual([...new Set(Object.values(prompt.models.local))].sort());
    expect(report.fields.amount).toEqual({ tp: 1, fp: 0, fn: 1 });
    expect(report.total).toEqual({ tp: 7, fp: 0, fn: 7 });
    expect(permittedReportSchema.parse(JSON.parse(JSON.stringify(report)))).toEqual(report);
  });

  it('holds no text: the report’s strings are codes, IDs and versions only', () => {
    const report = permittedReport('local', 1, [{ exampleId: 'e1', counts: missed, problem: 'invalid_output' }]);
    expect(JSON.stringify(report)).not.toContain('synthetic quote');
  });

  it('finds no regression on the same counts, and a regression when precision or recall falls', () => {
    const before = permittedReport('local', 1, [{ exampleId: 'e1', counts: right, problem: null }]);
    expect(permittedRegressions(before, before)).toEqual([]);
    const after = permittedReport('local', 1, [{ exampleId: 'e1', counts: missed, problem: 'refused:document_kind' }]);
    expect(permittedRegressions(after, before)).toEqual(expect.arrayContaining(['recall_regressed:all', 'recall_regressed:amount']));
    expect(permittedRegressions(after, before)).not.toContain('precision_regressed:all');
    const wrong = scorePermitted(correction([fixed]), { documentId: DOCUMENT, candidates: [candidate('FIXED_SCHEDULE', [field('method', null), field('amount', '$1.00')])] });
    const worse = permittedReport('local', 1, [{ exampleId: 'e1', counts: wrong, problem: null }]);
    expect(permittedRegressions(worse, before)).toEqual(expect.arrayContaining(['precision_regressed:all', 'precision_regressed:amount', 'recall_regressed:codes']));
    expect(permittedRegressions(before, worse)).toEqual([]);
  });

  it('refuses a comparison over a different set of examples', () => {
    const one = permittedReport('local', 1, [{ exampleId: 'e1', counts: right, problem: null }]);
    const two = permittedReport('local', 1, [
      { exampleId: 'e1', counts: right, problem: null },
      { exampleId: 'e2', counts: right, problem: null },
    ]);
    expect(permittedRegressions(two, one)).toEqual(['examples_changed']);
  });

  it('reads a correction as contract proposals’ review writes it, its extra keys left aside', () => {
    const written = { format: CORRECTION_FORMAT, document_id: DOCUMENT, contract_version_id: DOCUMENT, changed_fields: ['candidates[0].amount'], records: [{ ...fixed, flags: {}, rounding: null, citation: null }] };
    expect(correctionSchema.parse(written).records[0]?.method).toBe('FIXED_SCHEDULE');
    expect(correctionSchema.safeParse({ ...written, format: 'tp-eval-correction/0' }).success).toBe(false);
  });
});

describe('the report as an example of what a run records', () => {
  it('names each field the gate scores', () => {
    const report: PermittedReport = permittedReport('local', 0, []);
    expect(Object.keys(report.fields)).toEqual([...PERMITTED_FIELDS]);
    expect(report.total).toEqual({ tp: 0, fp: 0, fn: 0 });
  });
});
