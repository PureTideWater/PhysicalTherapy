import { TRUTH_FIELDS, type ContractTruth, type ContractTruthRecord, type TruthField } from '@tp/synth';
import { describe, expect, it } from 'vitest';

import { verifyContractTerms, type ContractTermsOutput, type ContractTermsProposal } from '../src/functions/contract-terms';
import { type FieldTally, ZERO_TALLY, asCounts } from '../src/tally';
import { BASELINE_FORMAT, type Baseline, type ContractBaseline, type GateProblem, blockingProblems, contractBaselineFor, entriesFromReport, gate, parseBaseline, recordBaseline, reportSha256, reportText } from './baseline';
import { parseFloors } from './floors';
import { type ContractCaseResult, type ContractReport, type EvaluationReport, contractReportFrom, spliceReport } from './harness';
import { referenceContractOutput } from './reference';
import { below, checkNarrative, conflictsFor, emptyFieldTallies, holdsPhrase, missingFacts, precision, proposedKeys, ratioText, recall, scoreContract, total, truthKey, twinSha256, wrongVerifiedByField } from './score';

/**
 * The harness's scoring and its gate, on small SYNTHETIC documents built here (the full sets run in
 * gate.golden.test.ts; test matrix MOD-07, MOD-08 and MOD-10): what counts as right, wrong, rejected,
 * missed and extra, field by field; that the old tp/fp/fn are derived unchanged; the worked example of
 * docs/adr/0070 (a rejection and a wrong-but-verified value score the same under the old counts and fail
 * differently under the gate); conflicts and twin keys; how a fraction is compared; which baseline a
 * report is held to; and when a baseline may be recorded.
 */

const PAGES = [
  'SYNTHETIC agreement. This Agreement is effective January 1, 2026 and remains in effect through December 31, 2026.',
  'Payer pays the lesser of the billed charge and the fixed amount per unit stated below. Amounts are rounded half up to the nearest cent.\nSection 2.3. Adjustments: the multiple procedure payment reduction applies; the assistant reduction does not apply; sequestration applies; NCCI edits apply; timed units are counted for each code on its own.',
  '97110 GP 11 $43.10 per unit\n97140 $39.90 per unit\n97161 120% of the 2025 Medicare fee schedule',
];

const at = (page: number, quote: string) => ({ page, quote });
const FROM = at(1, 'This Agreement is effective January 1, 2026 and remains in effect through December 31, 2026.');
const METHOD = at(2, 'Payer pays the lesser of the billed charge and the fixed amount per unit stated below.');
const FLAGS = at(2, 'Section 2.3. Adjustments: the multiple procedure payment reduction applies; the assistant reduction does not apply; sequestration applies; NCCI edits apply; timed units are counted for each code on its own.');
const FLAG_VALUES = { apply_mppr: true, apply_assistant_reduction: false, apply_sequestration: true, apply_ncci: true, timed_units_rule: 'PER_CODE' as const };

function record(label: string, fields: ContractTruthRecord['fields'], role: ContractTruthRecord['role'] = 'term'): ContractTruthRecord {
  return {
    label,
    role,
    fields: {
      method: { value: 'LESSER_OF', written: null, ...METHOD },
      lesser_of_schedule: { value: 'FIXED_SCHEDULE', written: null, ...METHOD },
      rounding: { value: 'HALF_UP_CENT', written: null, ...at(2, 'Amounts are rounded half up to the nearest cent.') },
      effective_from: { value: '2026-01-01', written: 'January 1, 2026', ...FROM },
      effective_to: { value: '2026-12-31', written: 'December 31, 2026', ...FROM },
      ...fields,
    },
  };
}

const TRUTH: ContractTruth = {
  format: 'tp-eval-contract/2',
  synthetic: true,
  id: 'C99',
  layout: 'table',
  drawnAs: null,
  kind: 'contract',
  document: 'document.pdf',
  contentType: 'application/pdf',
  scan: null,
  pages: 3,
  tier: 'small',
  pageText: 'faithful',
  unfaithfulBecause: null,
  pairOf: null,
  twinOf: null,
  conflicts: [],
  records: [
    record('97110', {
      codes: { value: ['97110'], written: ['97110'], ...at(3, '97110 GP 11 $43.10 per unit') },
      modifiers: { value: ['GP'], written: ['GP'], ...at(3, '97110 GP 11 $43.10 per unit') },
      places_of_service: { value: ['11'], written: ['11'], ...at(3, '97110 GP 11 $43.10 per unit') },
      amount: { value: '4310', written: '$43.10', ...at(3, '97110 GP 11 $43.10 per unit') },
    }),
    record('97140', {
      codes: { value: ['97140'], written: ['97140'], ...at(3, '97140 $39.90 per unit') },
      amount: { value: '3990', written: '$39.90', ...at(3, '97140 $39.90 per unit') },
    }),
  ],
};

const INPUT = { documentId: '00000000-0000-4000-8000-0000000000d1', documentSha256: 'a'.repeat(64), kind: 'contract' as const, pages: PAGES };

const verify = (output: ContractTermsOutput, input = INPUT) => verifyContractTerms(input, output).proposal;

function score(output: ContractTermsOutput, truth: ContractTruth = TRUTH) {
  return scoreContract(truth, output, verify(output));
}

const reference = (truth: ContractTruth = TRUTH) => referenceContractOutput(truth);

function candidatesOf(output: ContractTermsOutput) {
  const [first, second] = output.candidates;
  if (first === undefined || second === undefined) {
    throw new Error('two candidates');
  }
  return [first, second] as const;
}

/**
 * The scorer as it counted at 6ddd587 (eval/score.ts scoreContract, format /1), copied here only to hold
 * the tally's derived counts equal to it, answer by answer. Nothing else uses it.
 */
function scoredAt6ddd587(truth: ContractTruth, output: ContractTermsOutput | null, proposal: ContractTermsProposal | null): Record<TruthField, { tp: number; fp: number; fn: number }> {
  const counts = Object.fromEntries(TRUTH_FIELDS.map((field) => [field, { tp: 0, fp: 0, fn: 0 }])) as Record<TruthField, { tp: number; fp: number; fn: number }>;
  const bump = (field: TruthField, key: 'tp' | 'fp' | 'fn') => {
    counts[field] = { ...counts[field], [key]: counts[field][key] + 1 };
  };
  const stated = (output?.candidates ?? []).map((candidate, index) => {
    const verified = new Set<TruthField>(['lesser_of_schedule']);
    for (const field of proposal?.candidates[index]?.fields ?? []) {
      if (field.verified) {
        verified.add(field.field);
      }
    }
    return { keys: proposedKeys(candidate), verified };
  });
  type S = (typeof stated)[number];
  const right = (s: S, field: TruthField, value: string) => s.verified.has(field) && s.keys[field] === value;
  const unmatched = new Set(stated.keys());
  for (const truthRecord of truth.records) {
    let best: number | null = null;
    let bestAgreement = 0;
    for (const index of unmatched) {
      const agreed = TRUTH_FIELDS.filter((field) => {
        const value = truthRecord.fields[field];
        return value !== undefined && right(stated[index] as S, field, truthKey(field, value));
      }).length;
      if (agreed > bestAgreement) {
        best = index;
        bestAgreement = agreed;
      }
    }
    const pair = best === null ? undefined : stated[best];
    if (best !== null) {
      unmatched.delete(best);
    }
    for (const field of TRUTH_FIELDS) {
      const value = truthRecord.fields[field];
      const says = pair !== undefined && field in pair.keys;
      if (value === undefined) {
        if (says) {
          bump(field, 'fp');
        }
      } else if (pair !== undefined && right(pair, field, truthKey(field, value))) {
        bump(field, 'tp');
      } else {
        bump(field, 'fn');
        if (says) {
          bump(field, 'fp');
        }
      }
    }
  }
  for (const index of unmatched) {
    for (const field of Object.keys((stated[index] as S).keys) as TruthField[]) {
      bump(field, 'fp');
    }
  }
  return counts;
}

/** Holds an answer's derived counts equal to the 6ddd587 scorer's, field by field. */
function expectDerivedUnchanged(output: ContractTermsOutput | null, truth: ContractTruth = TRUTH) {
  const proposal = output === null ? null : verify(output);
  const scored = scoreContract(truth, output, proposal);
  const derived = Object.fromEntries(TRUTH_FIELDS.map((field) => [field, asCounts(scored.fields[field])]));
  expect(derived).toEqual(scoredAt6ddd587(truth, output, proposal));
}

const tally = (counts: Partial<FieldTally>): FieldTally => ({ ...ZERO_TALLY, ...counts });

describe('contract scoring, field by field', () => {
  it('counts every field of the reference answer right', () => {
    const scored = score(reference());
    expect(total(scored.fields)).toEqual(tally({ tp: 16 }));
    expect(scored.quotesOffPage).toBe(0);
    expect(scored.pairs).toEqual([0, 1]);
    expectDerivedUnchanged(reference());
  });

  it('counts a field left out as missed, and a field the verifier rejects as rejected, apart from a wrong one', () => {
    const [first, second] = candidatesOf(reference());
    const output = { candidates: [{ ...first, places_of_service: null }, { ...second, amount: { written: '$39.99', page: 3, quote: '97140 $39.90 per unit' } }] };
    const scored = score(output);
    expect(scored.fields.places_of_service).toEqual(tally({ missed: 1 }));
    expect(scored.fields.amount).toEqual(tally({ tp: 1, rejected: 1 }));
    expect(asCounts(scored.fields.amount)).toEqual({ tp: 1, fp: 1, fn: 1 });
    expectDerivedUnchanged(output);
  });

  it('counts a right value the verifier rejected as rejected_right too', () => {
    const [first, second] = candidatesOf(reference());
    // The value is the truth's, but its quote is not on the page.
    const output = { candidates: [first, { ...second, amount: { written: '$39.90', page: 3, quote: '97140 $39.90 per visit' } }] };
    expect(score(output).fields.amount).toEqual(tally({ tp: 1, rejected: 1, rejected_right: 1 }));
    expectDerivedUnchanged(output);
  });

  it('counts a misquote as rejected and as a quote off its page', () => {
    const output = reference();
    const [first] = candidatesOf(output);
    const misquoted = { candidates: [{ ...first, codes: { written: ['97110'], page: 3, quote: '97110 GP 12 $43.10 per unit' } }, ...output.candidates.slice(1)] };
    const scored = score(misquoted);
    expect(scored.fields.codes).toEqual(tally({ tp: 1, rejected: 1, rejected_right: 1 }));
    expect(scored.quotesOffPage).toBe(1);
    expectDerivedUnchanged(misquoted);
  });

  it('counts an unpaired candidate’s verified fields as extra and its rejected ones as rejected_extra, and a record no candidate has as missed whole', () => {
    const [first] = candidatesOf(reference());
    const line = '97161 120% of the 2025 Medicare fee schedule';
    const invented = {
      ...first,
      label: 'invented',
      codes: { written: ['97161'], page: 3, quote: line },
      modifiers: null,
      places_of_service: null,
      amount: null,
      lesser_of_schedule: null,
      rounding: null,
      effective_from: null,
      effective_to: null,
      method: { value: 'PERCENT_OF_MEDICARE' as const, page: 3, quote: line },
      percentage: { written: '120%', page: 3, quote: line },
      fee_schedule_year: { written: '2024', page: 3, quote: line },
    };
    const output = { candidates: [first, invented] };
    const scored = score(output);
    expect(scored.pairs).toEqual([0, null]);
    expect(scored.fields.percentage).toEqual(tally({ extra: 1 }));
    expect(scored.fields.fee_schedule_year).toEqual(tally({ rejected_extra: 1 }));
    expect(scored.fields.amount).toEqual(tally({ tp: 1, missed: 1 }));
    expect(asCounts(total(scored.fields))).toEqual({ tp: 9, fp: 4, fn: 7 });
    expectDerivedUnchanged(output);
  });

  it('reads values as code reads them: a wrong flag, rounding or lesser-of schedule that verifies is wrong, an amount written another way is right', () => {
    const [first, second] = candidatesOf(reference());
    const output = {
      candidates: [
        { ...first, lesser_of_schedule: 'PERCENT_OF_MEDICARE' as const, amount: { written: '43.10', page: 3, quote: '97110 GP 11 $43.10 per unit' } },
        { ...second, rounding: { value: 'TRUNCATE' as const, page: 2, quote: 'Amounts are rounded half up to the nearest cent.' } },
      ],
    };
    const scored = score(output);
    // The lesser-of schedule is never cited, so a wrong one is wrong but verified, which is what it is.
    expect(scored.fields.lesser_of_schedule).toEqual(tally({ tp: 1, wrong: 1 }));
    expect(scored.fields.amount).toEqual(tally({ tp: 2 }));
    expect(scored.fields.rounding).toEqual(tally({ tp: 1, wrong: 1 }));
    expect(wrongVerifiedByField(scored.fields)).toMatchObject({ lesser_of_schedule: 1, rounding: 1, amount: 0 });
    expectDerivedUnchanged(output);
  });

  it('misses every field of a document that got no answer', () => {
    expect(total(scoreContract(TRUTH, null, null).fields)).toEqual(tally({ missed: 16 }));
    expectDerivedUnchanged(null);
  });
});

// ---------------------------------------------------------------------------------------------------
// The worked example (docs/adr/0070, Part 1; design section 3.2)

const WORKED: ContractTruth = {
  ...TRUTH,
  records: [
    record('97110', {
      method: { value: 'FIXED_SCHEDULE', written: null, ...at(3, '97110 GP 11 $43.10 per unit') },
      lesser_of_schedule: undefined,
      codes: { value: ['97110'], written: ['97110'], ...at(3, '97110 GP 11 $43.10 per unit') },
      amount: { value: '4310', written: '$43.10', ...at(3, '97110 GP 11 $43.10 per unit') },
      flags: { value: FLAG_VALUES, written: null, ...FLAGS },
    }),
  ],
};

/** One case's result as the harness builds it, from a scored answer. */
function result(truth: ContractTruth, output: ContractTermsOutput | null, overrides: Partial<ContractCaseResult> = {}): ContractCaseResult {
  const proposal = output === null ? null : verify(output);
  const scored = scoreContract(truth, output, proposal);
  return {
    id: truth.id,
    layout: truth.layout,
    tier: truth.tier,
    pageText: truth.pageText,
    twinOf: truth.twinOf,
    pairOf: truth.pairOf,
    fields: scored.fields,
    wrongVerified: wrongVerifiedByField(scored.fields),
    quotesOffPage: scored.quotesOffPage,
    conflicts: scored.conflicts,
    twinSha256: twinSha256(output, proposal),
    canary: false,
    pairTermExtra: [],
    problem: output === null ? 'invalid_output' : null,
    ...overrides,
  };
}

const META = { promptVersion: 'propose-contract-terms/1', promptSha256: 'd'.repeat(64), variant: 'default' as const, modelId: 'model-a', setSha256: 'b'.repeat(64) };

function reportOf(results: readonly ContractCaseResult[], provider: EvaluationReport['provider'] = 'local', meta: Partial<typeof META> = {}): EvaluationReport {
  return { format: 'tp-model-eval-report/2', synthetic: true, provider, spliced: false, contracts: contractReportFrom({ ...META, ...meta }, results), narratives: null };
}

const baselineOf = (...reports: EvaluationReport[]): Baseline =>
  parseBaseline({ format: BASELINE_FORMAT, synthetic: true, note: 'SYNTHETIC', entries: reports.flatMap((report) => entriesFromReport(report, reportSha256(reportText(report)), '2026-10-26')) });

const codes = (problems: readonly GateProblem[]) =>
  problems.map((problem) => ('case' in problem && 'field' in problem ? `${problem.code}:${problem.case}:${problem.field}` : 'field' in problem ? `${problem.code}:${problem.field}` : problem.code));

describe('the worked example: a rejection and a wrong value that verifies (docs/adr/0070)', () => {
  const truthful = referenceContractOutput(WORKED);
  const [candidate] = truthful.candidates;
  if (candidate === undefined || candidate.flags === null) {
    throw new Error('a candidate with flags');
  }
  // Answer 1: the flags quote has a digit changed, so the verifier rejects the flags (quote_not_on_page).
  const answer1 = { candidates: [{ ...candidate, flags: { ...candidate.flags, quote: candidate.flags.quote.replace('2.3', '3.3') } }] };
  // Answer 2: the real flags sentence, apply_mppr flipped; the verifier passes it.
  const answer2 = { candidates: [{ ...candidate, flags: { ...candidate.flags, apply_mppr: false } }] };
  const options = { caseIds: { contracts: ['C99'] } };

  it('scores the two the same under the old counts, and apart under the tally', () => {
    const one = score(answer1, WORKED).fields.flags;
    const two = score(answer2, WORKED).fields.flags;
    expect(asCounts(one)).toEqual({ tp: 0, fp: 1, fn: 1 });
    expect(asCounts(two)).toEqual(asCounts(one));
    // The flags' values were right; only the quote was not on its page.
    expect(one).toEqual(tally({ rejected: 1, rejected_right: 1 }));
    expect(two).toEqual(tally({ wrong: 1 }));
    expectDerivedUnchanged(answer1, WORKED);
    expectDerivedUnchanged(answer2, WORKED);
  });

  it('fails answer 2 against a baseline held on answer 1 twice, where the fractions alone would pass it', () => {
    const held = baselineOf(reportOf([result(WORKED, answer1)]));
    const problems = gate(reportOf([result(WORKED, answer2)]), held, options).problems;
    expect(codes(problems)).toEqual(['wrong_verified_rose:all', 'wrong_verified_rose:flags', 'wrong_verified_on_faithful:flags']);
    expect(problems.filter((problem) => problem.code === 'precision_regressed' || problem.code === 'recall_regressed')).toEqual([]);
    // Answer 1 still fails the old way against a clean baseline.
    expect(codes(gate(reportOf([result(WORKED, answer1)]), baselineOf(reportOf([result(WORKED, truthful)])), options).problems)).toEqual([
      'precision_regressed:all',
      'recall_regressed:all',
      'precision_regressed:flags',
      'recall_regressed:flags',
      'quotes_off_page',
    ]);
  });
});

// ---------------------------------------------------------------------------------------------------
// Conflicts and twins

describe('conflicts and twin keys', () => {
  const amended: ContractTruth = {
    ...TRUTH,
    conflicts: [[0, 2]],
    records: [
      ...TRUTH.records,
      record(
        'Amendment 1: 97110',
        {
          codes: { value: ['97110'], written: ['97110'], ...at(3, '97110 GP 11 $43.10 per unit') },
          modifiers: { value: ['GP'], written: ['GP'], ...at(3, '97110 GP 11 $43.10 per unit') },
          places_of_service: { value: ['11'], written: ['11'], ...at(3, '97110 GP 11 $43.10 per unit') },
          amount: { value: '4310', written: '$43.10', ...at(3, '97110 GP 11 $43.10 per unit') },
        },
        'amendment',
      ),
    ],
  };

  it('flags an expected pair only when both records are proposed and each candidate lists the other (pairwise, review m6)', () => {
    const output = reference(amended);
    const proposal = verify(output);
    expect(conflictsFor(amended, [0, 1, 2], proposal)).toEqual({ expected: 1, flagged: 1 });
    expect(conflictsFor(amended, [0, 1, null], proposal)).toEqual({ expected: 1, flagged: 0 });
    // Paired the wrong way round: candidate 1 (97140) does not overlap candidate 2.
    expect(conflictsFor(amended, [1, 0, 2], proposal)).toEqual({ expected: 1, flagged: 0 });
    expect(score(output, amended).conflicts).toEqual({ expected: 1, flagged: 1 });
  });

  it('keys an answer by everything it and the verifier said but its labels, in any candidate order', () => {
    const output = reference();
    const key = twinSha256(output, verify(output));
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    const relabelled = { candidates: output.candidates.map((candidate) => ({ ...candidate, label: `${candidate.label} renamed` })) };
    expect(twinSha256(relabelled, verify(relabelled))).toBe(key);
    const reordered = { candidates: [...output.candidates].reverse() };
    expect(twinSha256(reordered, verify(reordered))).toBe(key);
    const [first, second] = candidatesOf(output);
    const requoted = { candidates: [{ ...first, method: { ...first.method, quote: 'SYNTHETIC agreement.', page: 1 } }, second] };
    expect(twinSha256(requoted, verify(requoted))).not.toBe(key);
    expect(twinSha256(null, null)).toBeNull();
  });

  it('finds a phrase in any string of an answer: a label, a quote or a written value', () => {
    const output = reference();
    expect(holdsPhrase(output, 'SYNTHETIC-CANARY-MOD10')).toBe(false);
    const [first, second] = candidatesOf(output);
    expect(holdsPhrase({ candidates: [{ ...first, label: 'note SYNTHETIC-CANARY-MOD10' }, second] }, 'SYNTHETIC-CANARY-MOD10')).toBe(true);
    expect(holdsPhrase({ candidates: [first, { ...second, method: { ...second.method, quote: 'x SYNTHETIC-CANARY-MOD10' } }] }, 'SYNTHETIC-CANARY-MOD10')).toBe(true);
    expect(holdsPhrase(null, 'SYNTHETIC-CANARY-MOD10')).toBe(false);
  });

  it('reports twins that differ, twins either of whose calls failed, and the canary, recomputed from the cases', () => {
    const clean = result({ ...TRUTH, id: 'V10' }, reference());
    const [first, second] = candidatesOf(reference());
    const obeyed = { candidates: [{ ...first, method: { ...first.method, page: 1, quote: 'SYNTHETIC agreement.' } }, second] };
    const twin = result({ ...TRUTH, id: 'V11', twinOf: 'V10' }, obeyed, { canary: true });
    const report = contractReportFrom(META, [clean, twin]);
    expect(report.twins).toEqual({ pairs: 1, differing: ['V11'], incomplete: [], canary: ['V11'] });
    const equal = contractReportFrom(META, [clean, result({ ...TRUTH, id: 'V11', twinOf: 'V10' }, reference())]);
    expect(equal.twins).toEqual({ pairs: 1, differing: [], incomplete: [], canary: [] });
    const failed = contractReportFrom(META, [clean, result({ ...TRUTH, id: 'V11', twinOf: 'V10' }, null, { problem: 'call_failed:rejected' })]);
    expect(failed.twins).toEqual({ pairs: 1, differing: [], incomplete: ['V11'], canary: [] });
    const cleanFailed = contractReportFrom(META, [result({ ...TRUTH, id: 'V10' }, null, { problem: 'refused:input_refused' }), result({ ...TRUTH, id: 'V11', twinOf: 'V10' }, reference())]);
    expect(cleanFailed.twins.incomplete).toEqual(['V11']);
  });
});

// ---------------------------------------------------------------------------------------------------
// Fractions and narratives

describe('fractions', () => {
  it('compares precision and recall exactly and prints them by integer division', () => {
    expect(precision({ tp: 0, fp: 0, fn: 3 })).toEqual([1, 1]);
    expect(recall({ tp: 0, fp: 2, fn: 0 })).toEqual([1, 1]);
    expect(below([2, 3], [3, 4])).toBe(true);
    expect(below([3, 4], [6, 8])).toBe(false);
    expect(ratioText([2, 3])).toBe('0.666667');
    expect(ratioText([1, 1])).toBe('1.000000');
  });
});

describe('narrative checks', () => {
  const required = [
    { kind: 'amount' as const, value: '9000', what: 'shortfall' as const },
    { kind: 'percent' as const, value: '112.5', what: 'contract_percentage' as const },
    { kind: 'number' as const, value: '3', what: 'lines' as const },
    { kind: 'marker' as const, value: '3', what: 'line_schedule' as const },
  ];
  const report = (passed: boolean) => ({ format: 'tp-packet-verifier/2' as const, passed, narrative_sha256: 'a'.repeat(64), sentences: 1, checked: 1, mismatches: passed ? [] : [{ code: 'figure_not_in_input' as const, kind: 'amount' as const, sentence: 0, start: 0, end: 1 }] });

  it('finds each required fact as the verifier’s scanner reads it', () => {
    expect(missingFacts('The contract pays 112.5% and 3 lines fell short by $90.00 [3].', required)).toEqual([]);
    expect(missingFacts('The contract pays 112.5% and three lines fell short by $90.00 [1].', required).map((fact) => fact.what)).toEqual(['line_schedule']);
    expect(missingFacts('Nothing here [3].', required).map((fact) => fact.what)).toEqual(['shortfall', 'contract_percentage', 'lines']);
  });

  it('fails a call that failed, an answer off the schema, a verifier failure and a missing fact', () => {
    expect(checkNarrative(required, null, 'call_failed').problems).toEqual(['call_failed']);
    expect(checkNarrative(required, null, null).problems).toEqual(['invalid_output']);
    expect(checkNarrative(required, { narrative: 'The 3 lines fell short by $90.00 at 112.5% [3].', report: report(false), roles: [] }, null)).toEqual({ problems: ['verifier_failed'], mismatches: ['figure_not_in_input'], missing: [] });
    expect(checkNarrative(required, { narrative: 'The lines fell short [3].', report: report(true), roles: [] }, null).problems).toEqual(['fact_missing']);
    // A figure in the wrong role fails it though the packets verifier passed it.
    const swapped = { code: 'figure_in_wrong_role' as const, role: 'lines' as const, kind: 'number' as const, sentence: 0, start: 4, end: 5 };
    expect(checkNarrative(required, { narrative: 'The 3 lines fell short by $90.00 at 112.5% [3].', report: report(true), roles: [swapped] }, null)).toEqual({ problems: ['verifier_failed'], mismatches: ['figure_in_wrong_role'], missing: [] });
  });
});

// ---------------------------------------------------------------------------------------------------
// The baseline and the gate

describe('the baseline', () => {
  const fields = (tp: number, extra: Partial<FieldTally> = {}) => ({ ...emptyFieldTallies(), amount: tally({ tp, missed: 10 - tp, ...extra }) });
  /** A case result with the given amount tally (the cases' other fields zero). */
  const amountCase = (id: string, tp: number, extra: Partial<FieldTally> = {}, overrides: Partial<ContractCaseResult> = {}): ContractCaseResult => {
    const tallies = fields(tp, extra);
    return {
      id,
      layout: 'table',
      tier: 'small',
      pageText: 'faithful',
      twinOf: null,
      pairOf: null,
      fields: tallies,
      wrongVerified: wrongVerifiedByField(tallies),
      quotesOffPage: 0,
      conflicts: { expected: 0, flagged: 0 },
      twinSha256: null,
      canary: false,
      pairTermExtra: [],
      problem: null,
      ...overrides,
    };
  };
  const contracts = (tp: number, overrides: Partial<ContractReport> = {}, extra: Partial<FieldTally> = {}): ContractReport => ({ ...contractReportFrom(META, [amountCase('C01', tp, extra)]), ...overrides });
  const narratives = (failures = 0) => ({
    purpose: 'draftPacketNarrative' as const,
    promptVersion: 'draft-packet-narrative/1',
    promptSha256: 'f'.repeat(64),
    modelId: 'model-a',
    setSha256: 'c'.repeat(64),
    cases: 3,
    caseIds: ['N000', 'N001', 'N002'],
    passed: 3 - failures,
    failures: Array.from({ length: failures }, (_, index) => ({ id: `N00${String(index)}`, problems: ['verifier_failed' as const], mismatches: [], missing: [], detail: null })),
  });
  const report = (part: ContractReport | null, failures = 0, provider: EvaluationReport['provider'] = 'bedrock'): EvaluationReport => ({
    format: 'tp-model-eval-report/2',
    synthetic: true,
    provider,
    spliced: false,
    contracts: part,
    narratives: narratives(failures),
  });
  const caseIds = { contracts: ['C01'], narratives: ['N000', 'N001', 'N002'] };
  /** Every floor set to 0, so a real provider's report is held to nothing but the comparisons (a test's floors). */
  const zeroFloors = parseFloors({
    format: 'tp-model-eval-floors/1',
    note: 'SYNTHETIC test floors',
    proposeContractTerms: { recall: Object.fromEntries(TRUTH_FIELDS.map((field) => [field, '0'])), precision: Object.fromEntries(TRUTH_FIELDS.map((field) => [field, '0'])) },
  });
  const options = { caseIds, floors: zeroFloors };
  const held = (overrides: Partial<ContractBaseline> = {}) => {
    const [entry] = entriesFromReport(report(contracts(8)), 'a'.repeat(64), '2026-10-16');
    return { ...(entry as ContractBaseline), ...overrides };
  };
  const narrativeEntry = entriesFromReport(report(null), 'a'.repeat(64), '2026-10-16');
  const baseline: Baseline = parseBaseline({
    format: BASELINE_FORMAT,
    synthetic: true,
    note: 'SYNTHETIC',
    entries: [held(), held({ prompt_version: 'propose-contract-terms/2', prompt_sha256: 'e'.repeat(64), model_id: 'model-b' }), ...narrativeEntry],
  });

  it('holds a report to its own prompt and model, a new prompt to the same model’s, a new model to the variant’s latest, and never to another variant', () => {
    const held1 = (promptVersion: string, modelId: string, variant: 'default' | 'ambiguous' = 'default', provider: 'bedrock' | 'anthropic' = 'bedrock') => contractBaselineFor(baseline, { provider, variant, promptVersion, modelId });
    expect(held1('propose-contract-terms/1', 'model-a')?.model_id).toBe('model-a');
    expect(held1('propose-contract-terms/3', 'model-a')?.prompt_version).toBe('propose-contract-terms/1');
    expect(held1('propose-contract-terms/3', 'model-c')?.model_id).toBe('model-b');
    expect(held1('propose-contract-terms/1', 'model-a', 'ambiguous')).toBeNull();
    expect(held1('propose-contract-terms/1', 'model-a', 'default', 'anthropic')).toBeNull();
    expect(codes(gate(report(contracts(8, { variant: 'ambiguous' })), baseline, options).problems)).toEqual(['no_baseline']);
  });

  it('passes no change and an improvement; fails a regression, a rise in wrong but verified, a quote off its page and any narrative failure', () => {
    expect(gate(report(contracts(8)), baseline, options)).toMatchObject({ passed: true, problems: [] });
    expect(gate(report(contracts(9)), baseline, options).passed).toBe(true);
    expect(codes(gate(report(contracts(7)), baseline, options).problems)).toEqual(['recall_regressed:all', 'recall_regressed:amount']);
    // One more wrong value, one fewer missed: recall unchanged, precision down, and the rise reported with its counts.
    const rose = gate(report(contracts(8, {}, { wrong: 1, missed: 1 })), baseline, options).problems;
    expect(rose).toEqual([
      { code: 'precision_regressed', field: 'all' },
      { code: 'precision_regressed', field: 'amount' },
      { code: 'wrong_verified_rose', field: 'all', was: 0, now: 1 },
      { code: 'wrong_verified_rose', field: 'amount', was: 0, now: 1 },
      { code: 'wrong_verified_on_faithful', field: 'amount', count: 1 },
    ]);
    expect(gate(report(contracts(8, { quotesOffPage: 2 })), baseline, options).problems).toEqual([{ code: 'quotes_off_page', count: 2 }]);
    expect(gate(report(null, 1), baseline, options).problems).toEqual([{ code: 'narrative_failures', count: 1, cases: ['N000'] }]);
  });

  it('fails a report on a prompt version whose content no longer has the hash the baseline recorded for it: a released version edited in place', () => {
    expect(codes(gate(report(contracts(8, { promptSha256: '0'.repeat(64) })), baseline, options).problems)).toEqual(['prompt_changed']);
    const narrativeEdited: EvaluationReport = { ...report(null), narratives: { ...narratives(), promptSha256: '0'.repeat(64) } };
    expect(gate(narrativeEdited, baseline, options).problems).toEqual([{ code: 'prompt_changed', purpose: 'draftPacketNarrative', promptVersion: 'draft-packet-narrative/1' }]);
    expect(() => recordBaseline(baseline, report(contracts(9, { promptSha256: '0'.repeat(64) })), '2026-10-17', options)).toThrow('prompt_changed');
    // Another provider's entries say nothing about this one's.
    expect(codes(gate({ ...report(contracts(8, { promptSha256: '0'.repeat(64) })), provider: 'anthropic' }, baseline, options).problems)).toEqual(['no_baseline']);
  });

  it('computes nothing else for a report that does not cover its set (incomplete_report, review M2)', () => {
    const subset = gate(report(contracts(2)), baseline, { ...options, caseIds: { ...caseIds, contracts: ['C01', 'C02'] } });
    expect(subset).toEqual({ passed: false, problems: [{ code: 'incomplete_report', purpose: 'proposeContractTerms', missing: ['C02'], unexpected: [] }], heldTo: null });
    // A report whose own list of cases is not its results is refused the same way.
    const lying = gate(report(contracts(8, { caseIds: ['C01', 'C02'] })), baseline, { ...options, caseIds: { ...caseIds, contracts: ['C01', 'C02'] } });
    expect(codes(lying.problems)).toEqual(['incomplete_report']);
    const narrativeSubset = { ...report(contracts(8)), narratives: { ...narratives(), cases: 2, caseIds: ['N000', 'N001'], passed: 2 } };
    expect(gate(narrativeSubset, baseline, options).problems).toEqual([{ code: 'incomplete_report', purpose: 'draftPacketNarrative', missing: ['N002'], unexpected: [] }]);
  });

  it('refuses comparison on a changed set, and records it only with --new-set on the held prompt, model and variant (review B2)', () => {
    const moved = report(contracts(3, { setSha256: '9'.repeat(64) }));
    // Far worse, but on another set: no regression is computed.
    expect(codes(gate(moved, baseline, options).problems)).toEqual(['set_changed']);
    expect(() => recordBaseline(baseline, moved, '2026-10-17', options)).toThrow('set_changed');
    const recorded = recordBaseline(baseline, moved, '2026-10-17', { ...options, newSet: true }).baseline;
    expect(recorded.entries.filter((entry) => entry.purpose === 'proposeContractTerms' && entry.model_id === 'model-a')).toEqual([expect.objectContaining({ set_sha256: '9'.repeat(64), total: expect.objectContaining({ tp: 3 }) as unknown })]);
    // A changed set and a changed model in one record: refused, always.
    const both = report(contracts(9, { setSha256: '9'.repeat(64), modelId: 'model-c' }));
    expect(gate(both, baseline, { ...options, newSet: true }).problems).toEqual([
      { code: 'set_changed', purpose: 'proposeContractTerms' },
      { code: 'new_set_with_change', purpose: 'proposeContractTerms', changed: ['prompt_version', 'prompt_sha256', 'model_id'] },
    ]);
    expect(() => recordBaseline(baseline, both, '2026-10-17', { ...options, newSet: true })).toThrow('new_set_with_change');
    const variantToo = report(contracts(9, { setSha256: '9'.repeat(64), variant: 'ambiguous' }));
    expect(() => recordBaseline(baseline, variantToo, '2026-10-17', { ...options, newSet: true })).not.toThrow();
  });

  it('records a passing run (replacing the entry it supersedes, of the same variant only) with its report, and refuses one that regresses or is spliced', () => {
    const run = report(contracts(9));
    const { baseline: recorded, report: file } = recordBaseline(baseline, run, '2026-10-17', options);
    expect(file.text).toBe(reportText(run));
    expect(file.sha256).toBe(reportSha256(file.text));
    expect(recorded.entries.filter((item) => item.purpose === 'proposeContractTerms' && item.model_id === 'model-a')).toEqual([expect.objectContaining({ total: tally({ tp: 9, missed: 1 }), recorded_on: '2026-10-17', report_sha256: file.sha256 })]);
    expect(recorded.entries).toHaveLength(3);
    // Recording the ambiguous variant keeps the default entry (review m1).
    const ambiguous = recordBaseline(baseline, report(contracts(9, { variant: 'ambiguous' })), '2026-10-17', options).baseline;
    expect(ambiguous.entries.filter((item) => item.purpose === 'proposeContractTerms' && item.model_id === 'model-a').map((item) => (item.purpose === 'proposeContractTerms' ? item.variant : null))).toEqual(['default', 'ambiguous']);
    expect(() => recordBaseline(baseline, report(contracts(7)), '2026-10-17', options)).toThrow('nothing is recorded');
    expect(() => recordBaseline(baseline, report(null, 1), '2026-10-17', options)).toThrow('narrative_failures');
    const spliced = spliceReport(run, { ...run, contracts: contractReportFrom(META, [amountCase('C01', 9)]), narratives: null });
    expect(spliced.spliced).toBe(true);
    expect(codes(gate(spliced, baseline, options).problems)).toEqual(['spliced_report']);
    expect(() => recordBaseline(baseline, spliced, '2026-10-17', options)).toThrow('spliced_report');
    const first = recordBaseline({ ...baseline, entries: [] }, { ...report(contracts(5)), provider: 'anthropic' }, '2026-10-17', options).baseline;
    expect(first.entries.map((item) => `${item.purpose}:${item.provider}`)).toEqual(['proposeContractTerms:anthropic', 'draftPacketNarrative:anthropic']);
  });

  it('holds a real provider to the floors, which ship unset: every unset floor is a problem, failing closed', () => {
    const unset = gate(report(contracts(8)), baseline, { caseIds }).problems;
    expect(unset).toHaveLength(2 * TRUTH_FIELDS.length);
    expect(unset[0]).toEqual({ code: 'floor_unset', field: 'method', kind: 'recall' });
    expect(() => recordBaseline(baseline, report(contracts(9)), '2026-10-17', { caseIds })).toThrow('floor_unset');
    // The local provider (the reference answers) is never held to floors.
    expect(codes(gate(report(contracts(8), 0, 'local'), baseline, { caseIds }).problems)).toEqual(['no_baseline']);
    const amountFloor = (kind: 'recall' | 'precision') => parseFloors({ ...zeroFloors, proposeContractTerms: { ...zeroFloors.proposeContractTerms, [kind]: { ...zeroFloors.proposeContractTerms[kind], amount: '0.9' } } });
    expect(codes(gate(report(contracts(8)), baseline, { caseIds, floors: amountFloor('recall') }).problems)).toEqual(['recall_below_floor:amount']);
    expect(codes(gate(report(contracts(9)), baseline, { caseIds, floors: amountFloor('recall') }).problems)).toEqual([]);
    expect(codes(gate(report(contracts(8, {}, { extra: 1 })), baseline, { caseIds, floors: amountFloor('precision') }).problems)).toEqual(
      expect.arrayContaining(['precision_below_floor:amount']),
    );
  });

  it('holds every unfaithful case to the local reference’s wrong but verified, and fails closed without the reference', () => {
    const unfaithful = (wrong: number) => contractReportFrom(META, [amountCase('C01', 8 - wrong, { wrong }, { pageText: 'unfaithful' })]);
    const run = report(unfaithful(2), 0, 'local');
    const local = baselineOf({ ...run, narratives: null });
    expect(codes(gate(run, local, { caseIds }).problems)).toEqual(['reference_missing']);
    expect(gate(run, local, { caseIds, reference: unfaithful(2) }).problems).toEqual([]);
    expect(gate(report(unfaithful(1), 0, 'local'), local, { caseIds, reference: unfaithful(2) }).problems).toEqual([]);
    const above = gate(report(unfaithful(3), 0, 'local'), local, { caseIds, reference: unfaithful(2) }).problems;
    expect(above).toEqual(expect.arrayContaining([{ code: 'wrong_verified_above_reference', case: 'C01', field: 'amount', was: 2, now: 3 }]));
    expect(above.some((problem) => problem.code === 'wrong_verified_on_faithful')).toBe(false);
    // A reference on another set is no reference.
    expect(codes(gate(run, local, { caseIds, reference: { ...unfaithful(2), setSha256: '9'.repeat(64) } }).problems)).toEqual(['reference_missing']);
  });

  it('fails an unflagged conflict, a twin that differs, is incomplete or quotes the canary, and an exhibit stating its contract’s terms', () => {
    const problemsOf = (results: readonly ContractCaseResult[]) => codes(gate(report(contractReportFrom(META, results)), baseline, { ...options, caseIds: { ...caseIds, contracts: results.map((item) => item.id) } }).problems);
    expect(problemsOf([amountCase('C01', 8, {}, { conflicts: { expected: 2, flagged: 1 } })])).toEqual(['conflict_unflagged']);
    const clean = amountCase('C01', 8, {}, { twinSha256: 'a'.repeat(64) });
    expect(problemsOf([clean, amountCase('C02', 8, {}, { twinOf: 'C01', twinSha256: 'b'.repeat(64) })])).toEqual(expect.arrayContaining(['twin_differs']));
    expect(problemsOf([clean, amountCase('C02', 8, {}, { twinOf: 'C01', problem: 'call_failed:rejected' })])).toEqual(expect.arrayContaining(['twin_incomplete']));
    expect(problemsOf([clean, amountCase('C02', 8, {}, { twinOf: 'C01', twinSha256: 'a'.repeat(64), canary: true })])).toEqual(expect.arrayContaining(['twin_canary']));
    const extra = gate(report(contractReportFrom(META, [amountCase('C01', 8, {}, { pairTermExtra: ['flags'] })])), baseline, options).problems;
    expect(extra).toEqual([{ code: 'pair_term_extra', case: 'C01', field: 'flags', faithful: true }]);
    expect(blockingProblems(extra, false)).toHaveLength(1);
    expect(blockingProblems([{ code: 'pair_term_extra', case: 'C01', field: 'flags', faithful: false }], false)).toEqual([]);
  });

  it('builds an entry only from a report the gate could record: the dangerous counts are literals', () => {
    const wrongOnFaithful = report(contracts(8, {}, { wrong: 1, missed: -1 }));
    expect(() => entriesFromReport(wrongOnFaithful, 'a'.repeat(64), '2026-10-17')).toThrow('never recorded');
    expect(() => entriesFromReport(report(null, 1), 'a'.repeat(64), '2026-10-17')).toThrow('never recorded');
    expect(() => parseBaseline({ format: BASELINE_FORMAT, synthetic: true, note: '', entries: [{ ...held(), faithful_wrong_verified: 1 }] })).toThrow();
  });
});
