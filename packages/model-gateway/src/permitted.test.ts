import { describe, expect, it } from 'vitest';

import type { CandidateReview, CitedField, FieldReview } from './functions/contract-terms';
import {
  CORRECTION_FORMAT,
  CORRECTION_FORMAT_V1,
  type Correction,
  type FinalRecord,
  PERMITTED_FIELDS,
  PERMITTED_REPORT_FORMAT_V1,
  type PermittedField,
  type PermittedReport,
  type PermittedResult,
  correctionSchema,
  earlierPermittedReportSchema,
  finalKeys,
  isLegacyCorrection,
  permittedRegressions,
  permittedOutcome,
  permittedReport,
  permittedReportProblems,
  permittedReportSchema,
  permittedResult,
  scorePermitted,
  scoredFinals,
  statedKeys,
} from './permitted';
import { PROMPTS } from './prompts';
import { type FieldTally, ZERO_TALLY, asCounts } from './tally';

// Synthetic terms only: no contract's text, a made-up document ID.
const DOCUMENT = '00000000-0000-4000-8000-0000000000d1';

function field(name: CitedField, written: FieldReview['written'], verified = true): FieldReview {
  return { field: name, page: 1, quote: 'synthetic quote', written, verified, problems: verified ? [] : ['not_in_quote'] };
}

function candidate(method: string, fields: readonly FieldReview[], rateRecord: CandidateReview['rateRecord'] = null): CandidateReview {
  return { index: 0, label: 'synthetic', method, fields, conflictsWith: [], defaults: [], rateRecord, problems: [] };
}

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

// Another made-up document of the same contract version (an exhibit beside the contract).
const EXHIBIT = '00000000-0000-4000-8000-0000000000e2';
const VERSION = '00000000-0000-4000-8000-0000000000f3';

/** A /1 correction: every final is scored, its citations naming no document. */
const correction = (records: readonly FinalRecord[]): Correction => ({ format: CORRECTION_FORMAT_V1, document_id: DOCUMENT, records: [...records] });

/** A /2 correction of the document, as contract proposals' review writes it: each final with the document it is cited from (null: entered with no citation). */
const correctionV2 = (finals: readonly { readonly final: FinalRecord; readonly from: string | null }[], uncited = 0): Correction => ({
  format: CORRECTION_FORMAT,
  document_id: DOCUMENT,
  contract_version_id: VERSION,
  decision: 'accepted_with_changes',
  changed_fields: ['candidates[0].amount'],
  uncited_finals: uncited,
  records: finals.map(({ final, from }) => ({
    scope: final.scope,
    method: final.method,
    parameters: final.parameters,
    citation: from === null ? null : { document_id: from, page: 1, quote: 'synthetic quote', hash: '0'.repeat(64) },
  })),
});

/** A field's counts as the scorer kept them at 6ddd587 (tp, fp, fn), derived from its tally. */
const only = (counts: Readonly<Record<PermittedField, FieldTally>>, fieldName: PermittedField) => asCounts(counts[fieldName]);

const tally = (counts: Partial<FieldTally>): FieldTally => ({ ...ZERO_TALLY, ...counts });
const ZERO_COUNTS = Object.fromEntries(PERMITTED_FIELDS.map((name) => [name, ZERO_TALLY])) as Record<PermittedField, FieldTally>;

/** A result with no correction's finer points: neither legacy nor with uncited finals; the default variant's unless named. */
const result = (exampleId: string, counts: Readonly<Record<PermittedField, FieldTally>>, problem: string | null = null, variant: PermittedResult['variant'] = 'default'): PermittedResult => ({
  exampleId,
  counts,
  problem,
  legacy: false,
  uncitedFinals: 0,
  variant,
});

/** A synthetic run outside production, as the unit tests make one. */
const RUN = { runId: '00000000-0000-4000-8000-0000000000c1', production: false };
const localReport = (practices: number, results: readonly PermittedResult[]) => permittedReport('local', practices, results, RUN);

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
    expect(statedKeys(candidate('LESSER_OF', []))).toEqual({ keys: { method: 'LESSER_OF' }, verified: new Set(), rateRecord: false });
    expect(statedKeys(candidate('FIXED_SCHEDULE', [], record({ method: 'FIXED_SCHEDULE' }))).keys).not.toHaveProperty('lesser_of_schedule');
  });
});

describe('scorePermitted', () => {
  it('counts every field of an exact, verified proposal right', () => {
    const counts = scorePermitted(correction([fixed]), { documentId: DOCUMENT, candidates: [fixedRight] });
    for (const name of PERMITTED_FIELDS) {
      expect(counts[name]).toEqual(name in finalKeys(fixed) ? tally({ tp: 1 }) : ZERO_TALLY);
    }
  });

  it('tells a wrong value the verifier passed from a right value it rejected, and from a left-out field', () => {
    const wrong = candidate('FIXED_SCHEDULE', [
      field('method', null),
      field('codes', ['97110', '97112']),
      field('amount', '$42.05'),
      field('places_of_service', ['11'], false),
      field('effective_from', '2026-01-01'),
      field('effective_to', '2026-12-31'),
    ]);
    const counts = scorePermitted(correction([fixed]), { documentId: DOCUMENT, candidates: [wrong] });
    expect(counts.amount).toEqual(tally({ wrong: 1 }));
    expect(counts.places_of_service).toEqual(tally({ rejected: 1, rejected_right: 1 }));
    expect(counts.modifiers).toEqual(tally({ missed: 1 }));
    expect(counts.codes).toEqual(tally({ tp: 1 }));
    // The counts kept until 6ddd587, derived: the wrong value and the rejected one are the same there.
    expect(only(counts, 'amount')).toEqual({ tp: 0, fp: 1, fn: 1 });
    expect(only(counts, 'places_of_service')).toEqual({ tp: 0, fp: 1, fn: 1 });
    expect(only(counts, 'modifiers')).toEqual({ tp: 0, fp: 0, fn: 1 });
    expect(only(counts, 'codes')).toEqual({ tp: 1, fp: 0, fn: 0 });
  });

  it('counts a scope field a rate record leaves out as widened, wrong but verified, inside the boundary as on the synthetic set (review M2)', () => {
    const record: CandidateReview['rateRecord'] = {
      scope: { codes: ['97110', '97112'], places_of_service: ['11'], effective_from: '2026-01-01', effective_to: '2027-01-01' },
      method: 'FIXED_SCHEDULE',
      parameters: { amount_cents: '4250' },
      flags: {},
      rounding: null,
      evidence: { document_id: DOCUMENT, page: 1, quote: 'synthetic quote', hash: '0'.repeat(64) },
      proposed_by: 'model',
    };
    const noModifier = fixedRight.fields.filter((entry) => entry.field !== 'modifiers');
    const widened = scorePermitted(correction([fixed]), { documentId: DOCUMENT, candidates: [candidate('FIXED_SCHEDULE', noModifier, record)] });
    expect(widened.modifiers).toEqual(tally({ widened: 1 }));
    expect(widened.codes).toEqual(tally({ tp: 1 }));
    // Held (no rate record), the same omission widens nothing: it is missed, as before.
    const held = scorePermitted(correction([fixed]), { documentId: DOCUMENT, candidates: [candidate('FIXED_SCHEDULE', noModifier)] });
    expect(held.modifiers).toEqual(tally({ missed: 1 }));
    // The counts kept until 6ddd587 read both alike, a miss.
    expect(only(widened, 'modifiers')).toEqual({ tp: 0, fp: 0, fn: 1 });
    expect(statedKeys(candidate('FIXED_SCHEDULE', noModifier, record)).rateRecord).toBe(true);
  });

  it('counts a verified field the final record does not hold as extra', () => {
    const extra = candidate('PERCENT_OF_MEDICARE', [field('method', null), field('codes', ['97140']), field('percentage', '110%'), field('fee_schedule_year', '2025'), field('amount', '$10.00')]);
    const counts = scorePermitted(correction([percent]), { documentId: DOCUMENT, candidates: [extra] });
    expect(counts.amount).toEqual(tally({ extra: 1 }));
    expect(only(counts, 'amount')).toEqual({ tp: 0, fp: 1, fn: 0 });
    expect(only(counts, 'percentage')).toEqual({ tp: 1, fp: 0, fn: 0 });
    expect(only(counts, 'fee_schedule_year')).toEqual({ tp: 1, fp: 0, fn: 0 });
  });

  it('pairs each final record with the candidate that gets most of it right, and counts an unpaired candidate extra whole', () => {
    const percentRight = candidate('PERCENT_OF_MEDICARE', [field('method', null), field('codes', ['97140']), field('percentage', '110%'), field('fee_schedule_year', '2025')]);
    const stray = candidate('PER_VISIT', [field('method', null), field('amount', '$99.00', false)]);
    const counts = scorePermitted(correction([percent, fixed]), { documentId: DOCUMENT, candidates: [stray, fixedRight, percentRight] });
    expect(only(counts, 'percentage')).toEqual({ tp: 1, fp: 0, fn: 0 });
    expect(only(counts, 'amount')).toEqual({ tp: 1, fp: 1, fn: 0 });
    expect(only(counts, 'method')).toEqual({ tp: 2, fp: 1, fn: 0 });
    expect(counts.method).toEqual(tally({ tp: 2, extra: 1 }));
    expect(counts.amount).toEqual(tally({ tp: 1, rejected_extra: 1 }));
  });

  it('misses a record no candidate gets any field of right, whole', () => {
    const counts = scorePermitted(correction([percent]), { documentId: DOCUMENT, candidates: [candidate('FIXED_SCHEDULE', [field('codes', ['97530'])])] });
    expect(only(counts, 'method')).toEqual({ tp: 0, fp: 1, fn: 1 });
    expect(only(counts, 'codes')).toEqual({ tp: 0, fp: 1, fn: 1 });
    expect(only(counts, 'percentage')).toEqual({ tp: 0, fp: 0, fn: 1 });
    // The unpaired candidate cites no method, so its method is stated but not verified.
    expect(counts.method).toEqual(tally({ missed: 1, rejected_extra: 1 }));
  });

  it('counts every final field missed when the call proposed nothing', () => {
    const counts = scorePermitted(correction([fixed, percent]), null);
    expect(counts.method).toEqual(tally({ missed: 2 }));
    expect(counts.codes).toEqual(tally({ missed: 2 }));
    expect(counts.lesser_of_schedule).toEqual(ZERO_TALLY);
  });
});

describe('the correction formats', () => {
  it('scores a /2 example against its own document’s cited finals only', () => {
    const version = correctionV2([
      { final: fixed, from: DOCUMENT },
      { final: percent, from: EXHIBIT },
    ]);
    expect(scoredFinals(version).map((final) => final.method)).toEqual(['FIXED_SCHEDULE']);
    expect(isLegacyCorrection(version)).toBe(false);
    // The exhibit's record is not this contract's expectation: not missed.
    const counts = scorePermitted(version, { documentId: DOCUMENT, candidates: [fixedRight] });
    expect(counts.percentage).toEqual(ZERO_TALLY);
    expect(counts.method).toEqual(tally({ tp: 1 }));
  });

  it('leaves out of a /2 example a final entered with no citation, and counts it', () => {
    const version = correctionV2([{ final: fixed, from: DOCUMENT }, { final: percent, from: null }], 1);
    expect(scoredFinals(version)).toHaveLength(1);
    expect(permittedResult('e1', version, { proposal: { documentId: DOCUMENT, candidates: [fixedRight] }, problem: null }, 'default')).toMatchObject({ legacy: false, uncitedFinals: 1 });
  });

  it('scores a /1 example against every final, unfiltered, and marks it legacy', () => {
    const legacy = correction([fixed, percent]);
    expect(scoredFinals(legacy)).toHaveLength(2);
    expect(isLegacyCorrection(legacy)).toBe(true);
    const outcome = permittedResult('e1', legacy, { proposal: { documentId: DOCUMENT, candidates: [fixedRight] }, problem: null }, 'default');
    expect(outcome.legacy).toBe(true);
    expect(outcome.counts.percentage).toEqual(tally({ missed: 1 }));
    expect(localReport(1, [outcome]).legacyUnfiltered).toBe(1);
  });

  it('reads a /1 correction as contract proposals’ review wrote it, its extra keys left aside', () => {
    const written = { format: CORRECTION_FORMAT_V1, document_id: DOCUMENT, contract_version_id: DOCUMENT, changed_fields: ['candidates[0].amount'], records: [{ ...fixed, flags: {}, rounding: null, citation: null }] };
    expect(correctionSchema.parse(written).records[0]?.method).toBe('FIXED_SCHEDULE');
    expect(correctionSchema.safeParse({ ...written, format: 'tp-eval-correction/0' }).success).toBe(false);
  });

  it('reads a /2 correction only with its decision, its uncited count and each citation’s document', () => {
    const written = JSON.parse(JSON.stringify(correctionV2([{ final: fixed, from: DOCUMENT }]))) as Record<string, unknown>;
    expect(correctionSchema.parse(written).format).toBe(CORRECTION_FORMAT);
    for (const key of ['decision', 'uncited_finals', 'contract_version_id']) {
      expect(correctionSchema.safeParse({ ...written, [key]: undefined }).success).toBe(false);
    }
    expect(correctionSchema.safeParse({ ...written, decision: 'approved' }).success).toBe(false);
    const records = written.records as Record<string, unknown>[];
    expect(correctionSchema.safeParse({ ...written, records: [{ ...records[0], citation: { page: 1, quote: 'synthetic quote', hash: '0'.repeat(64) } }] }).success).toBe(false);
  });
});

describe('the permitted report and its gate', () => {
  const right = scorePermitted(correction([fixed]), { documentId: DOCUMENT, candidates: [fixedRight] });
  const missed = scorePermitted(correction([fixed]), null);

  it('totals the examples’ tallies for the current prompt version and the provider’s pinned models', () => {
    const report = localReport(2, [result('e2', missed, 'call_failed:timeout'), result('e1', right)]);
    const prompt = PROMPTS.proposeContractTerms;
    expect(report).toMatchObject({ promptVersion: prompt.id, promptSha256: prompt.sha256, provider: 'local', practices: 2, examples: 2, exampleIds: ['e1', 'e2'], refused: 0, problems: [{ exampleId: 'e2', problem: 'call_failed:timeout' }] });
    expect(report).toMatchObject({ runId: RUN.runId, production: false, measured: 1 });
    // Each variant apart: its own pinned model and its own examples (the PR review's M3).
    expect(report.variants.default).toMatchObject({ modelId: prompt.models.local.default, examples: 2, exampleIds: ['e1', 'e2'], measured: 1, refused: 0, total: tally({ tp: 7, missed: 7 }) });
    expect(report.variants.ambiguous).toEqual({ modelId: prompt.models.local.ambiguous ?? null, examples: 0, exampleIds: [], measured: 0, fields: report.variants.ambiguous.fields, total: ZERO_TALLY, refused: 0 });
    expect(permittedReportProblems(report)).toEqual([]);
    expect(report.fields.amount).toEqual(tally({ tp: 1, missed: 1 }));
    expect(report.total).toEqual(tally({ tp: 7, missed: 7 }));
    expect(asCounts(report.total)).toEqual({ tp: 7, fp: 0, fn: 7 });
    expect(permittedReportSchema.parse(JSON.parse(JSON.stringify(report)))).toEqual(report);
  });

  it('holds no text: the report’s strings are codes, IDs and versions only', () => {
    const report = localReport(1, [result('e1', missed, 'invalid_output')]);
    expect(JSON.stringify(report)).not.toContain('synthetic quote');
  });

  it('counts a refused call apart from the tally, never as a miss', () => {
    const refused = permittedResult('e1', correction([fixed]), { proposal: null, problem: 'refused:document_kind' }, 'default');
    expect(refused.counts.method).toEqual(ZERO_TALLY);
    // A result built by hand with misses for a refusal is still left out of the tally.
    const report = localReport(1, [refused, result('e2', missed, 'refused:names_patient'), result('e3', right)]);
    expect(report).toMatchObject({ examples: 3, refused: 2 });
    expect(report.total).toEqual(tally({ tp: 7 }));
    expect(report.problems.map((problem) => problem.problem)).toEqual(['refused:document_kind', 'refused:names_patient']);
  });

  it('finds no regression on the same counts, and a regression when precision or recall falls or a refusal is added', () => {
    const before = localReport(1, [result('e1', right)]);
    expect(permittedRegressions(before, before)).toEqual([]);
    const failed = localReport(1, [result('e1', missed, 'call_failed:timeout')]);
    expect(permittedRegressions(failed, before)).toEqual(expect.arrayContaining(['recall_regressed:default:all', 'recall_regressed:default:amount']));
    expect(permittedRegressions(failed, before)).not.toContain('precision_regressed:default:all');
    const refused = localReport(1, [permittedResult('e1', correction([fixed]), { proposal: null, problem: 'refused:document_kind' }, 'default')]);
    expect(permittedRegressions(refused, before)).toEqual(['refused_rose:default']);
    const wrong = scorePermitted(correction([fixed]), { documentId: DOCUMENT, candidates: [candidate('FIXED_SCHEDULE', [field('method', null), field('amount', '$1.00')])] });
    const worse = localReport(1, [result('e1', wrong)]);
    expect(permittedRegressions(worse, before)).toEqual(expect.arrayContaining(['precision_regressed:default:all', 'precision_regressed:default:amount', 'recall_regressed:default:codes', 'wrong_verified_rose:default:amount', 'wrong_verified_rose:default:all']));
    expect(permittedRegressions(before, worse)).toEqual([]);
  });

  it('refuses a rise in wrong but verified values that precision and recall alone would pass', () => {
    // Earlier: the amount rejected by the verifier. Now: the same wrong amount, passed by it. tp, fp and fn are equal.
    const rejectedAmount = scorePermitted(correction([fixed]), { documentId: DOCUMENT, candidates: [candidate('FIXED_SCHEDULE', [...fixedRight.fields.filter((f) => f.field !== 'amount'), field('amount', '$42.05', false)])] });
    const wrongAmount = scorePermitted(correction([fixed]), { documentId: DOCUMENT, candidates: [candidate('FIXED_SCHEDULE', [...fixedRight.fields.filter((f) => f.field !== 'amount'), field('amount', '$42.05')])] });
    expect(only(rejectedAmount, 'amount')).toEqual(only(wrongAmount, 'amount'));
    const earlier = localReport(1, [result('e1', rejectedAmount)]);
    const now = localReport(1, [result('e1', wrongAmount)]);
    expect(permittedRegressions(now, earlier)).toEqual(['wrong_verified_rose:default:all', 'wrong_verified_rose:default:amount']);
  });

  it('refuses a comparison over other examples, of the same number or not', () => {
    const one = localReport(1, [result('e1', right)]);
    const two = localReport(1, [result('e1', right), result('e2', right)]);
    expect(permittedRegressions(two, one)).toEqual(['examples_changed', 'examples_changed:default']);
    const other = localReport(1, [result('e9', right)]);
    expect(permittedRegressions(other, one)).toEqual(['examples_changed', 'examples_changed:default']);
    // The same examples, one moved to the other variant (its proposal marked ambiguous since): not the same run of either model.
    const moved = localReport(1, [result('e1', right), result('e2', right, null, 'ambiguous')]);
    expect(permittedRegressions(moved, two)).toEqual(['examples_changed:default', 'examples_changed:ambiguous']);
    const reordered = localReport(1, [result('e2', right), result('e1', right)]);
    expect(permittedRegressions(reordered, two)).toEqual([]);
  });

  it('refuses an earlier /1 report whole: its counts cannot tell a rejection from a wrong value', () => {
    const current = localReport(1, [result('e1', right)]);
    const earlier = earlierPermittedReportSchema.parse({ format: PERMITTED_REPORT_FORMAT_V1, examples: 1, total: { tp: 7, fp: 0, fn: 0 } });
    expect(permittedRegressions(current, earlier)).toEqual(['earlier_report_format']);
    expect(permittedReportSchema.safeParse({ ...current, format: PERMITTED_REPORT_FORMAT_V1 }).success).toBe(false);
    expect(earlierPermittedReportSchema.parse(JSON.parse(JSON.stringify(current)))).toEqual(current);
  });
});

describe('the permitted run, variant by variant, and what it measured (the PR review’s M3, S1 and N3)', () => {
  const right = scorePermitted(correction([fixed]), { documentId: DOCUMENT, candidates: [fixedRight] });
  const wrongAmount = scorePermitted(correction([fixed]), { documentId: DOCUMENT, candidates: [candidate('FIXED_SCHEDULE', [...fixedRight.fields.filter((f) => f.field !== 'amount'), field('amount', '$42.05')])] });

  it('compares each variant on its own: one model’s gain never hides the other’s regression', () => {
    const earlier = localReport(1, [result('e1', wrongAmount), result('e2', right, null, 'ambiguous')]);
    const now = localReport(1, [result('e1', right), result('e2', wrongAmount, null, 'ambiguous')]);
    // Summed, the two runs are the same; apart, the ambiguous model regressed.
    expect([now.total, now.fields]).toEqual([earlier.total, earlier.fields]);
    expect(permittedRegressions(now, earlier)).toEqual(expect.arrayContaining(['wrong_verified_rose:ambiguous:all', 'wrong_verified_rose:ambiguous:amount', 'precision_regressed:ambiguous:amount']));
    expect(permittedRegressions(now, earlier).filter((code) => code.includes(':default'))).toEqual([]);
    // Comparing only the default variant leaves the ambiguous one out, as record-permitted does for a variant it neither records nor served.
    expect(permittedRegressions(now, earlier, ['default'])).toEqual([]);
  });

  it('refuses an earlier run that did not measure a variant’s model as a run to compare it with', () => {
    const earlier = localReport(1, [result('e1', right), result('e2', ZERO_COUNTS, 'refused:not_evaluated', 'ambiguous')]);
    const now = localReport(1, [result('e1', right), result('e2', right, null, 'ambiguous')]);
    expect(permittedRegressions(now, earlier)).toEqual(['earlier_unmeasured:ambiguous']);
  });

  it('keeps only outcomes on its list as measured or outside the model; any other code is unmeasured (S1)', () => {
    expect([null, 'invalid_output'].map(permittedOutcome)).toEqual(['measured', 'measured']);
    expect(['document_unavailable', 'expected_invalid', 'refused:document_kind', 'refused:no_text', 'refused:too_many_pages', 'refused:names_patient'].map(permittedOutcome)).toEqual(Array(6).fill('outside_model'));
    for (const code of ['call_failed:timeout', 'refused:phi_boundary', 'refused:kill_switch', 'refused:feature_off', 'refused:not_evaluated', 'refused:screen_unavailable', 'refused:screen_failed', 'refused:input_invalid', 'budget_exceeded', 'busy', 'already_called', 'serving_invalid', 'refused:', 'anything_else']) {
      expect(permittedOutcome(code), code).toBe('unmeasured');
    }
  });

  it('finds a report whose counts do not add up (N3), and none in what a run writes', () => {
    const good = localReport(1, [result('e1', right), result('e2', right, 'invalid_output', 'ambiguous'), result('e3', ZERO_COUNTS, 'refused:document_kind')]);
    expect(permittedReportProblems(good)).toEqual([]);
    expect(permittedReportProblems(permittedReportSchema.parse(JSON.parse(JSON.stringify(good))))).toEqual([]);
    for (const bad of [
      { ...good, examples: 2 },
      { ...good, exampleIds: ['e1', 'e2', 'e4'] },
      { ...good, measured: 1 },
      { ...good, refused: 2 },
      { ...good, problems: [] },
      { ...good, total: tally({ tp: 1 }) },
      { ...good, variants: { ...good.variants, ambiguous: { ...good.variants.ambiguous, refused: 1 } } },
      { ...good, variants: { ...good.variants, default: { ...good.variants.default, examples: 1 } } },
    ]) {
      expect(permittedReportProblems(bad), JSON.stringify(bad).slice(0, 60)).toEqual(['report_inconsistent']);
    }
  });
});

describe('the report as an example of what a run records', () => {
  it('names each field the gate scores', () => {
    const report: PermittedReport = localReport(0, []);
    expect(Object.keys(report.fields)).toEqual([...PERMITTED_FIELDS]);
    expect(report.total).toEqual(ZERO_TALLY);
  });
});
