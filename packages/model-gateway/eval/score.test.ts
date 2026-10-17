import type { ContractTruth, TruthRecord } from '@tp/synth';
import { describe, expect, it } from 'vitest';

import { verifyContractTerms, type ContractTermsOutput } from '../src/functions/contract-terms';
import { BASELINE_FORMAT, type Baseline, type ContractBaseline, contractBaselineFor, gate, parseBaseline, recordBaseline } from './baseline';
import type { ContractReport, EvaluationReport } from './harness';
import { referenceContractOutput } from './reference';
import { below, checkNarrative, emptyFieldCounts, missingFacts, precision, ratioText, recall, scoreContract, total } from './score';

/**
 * The harness's scoring and its gate, on small SYNTHETIC documents built here (the full sets run in
 * gate.golden.test.ts): what counts as right, wrong and missed, field by field, how a fraction is
 * compared, which baseline a report is held to, and when a baseline may be recorded.
 */

const PAGES = [
  'SYNTHETIC agreement. This Agreement is effective January 1, 2026 and remains in effect through December 31, 2026.',
  'Payer pays the lesser of the billed charge and the fixed amount per unit stated below. Amounts are rounded half up to the nearest cent.',
  '97110 GP 11 $43.10 per unit\n97140 $39.90 per unit\n97161 120% of the 2025 Medicare fee schedule',
];

const at = (page: number, quote: string) => ({ page, quote });
const FROM = at(1, 'This Agreement is effective January 1, 2026 and remains in effect through December 31, 2026.');
const METHOD = at(2, 'Payer pays the lesser of the billed charge and the fixed amount per unit stated below.');

function record(label: string, fields: TruthRecord['fields']): TruthRecord {
  return {
    label,
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
  format: 'tp-eval-contract/1',
  synthetic: true,
  id: 'C99',
  layout: 'table',
  drawnAs: null,
  kind: 'contract',
  document: 'document.pdf',
  contentType: 'application/pdf',
  scan: null,
  pages: 3,
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

function score(output: ContractTermsOutput) {
  return scoreContract(TRUTH, output, verifyContractTerms(INPUT, output).proposal);
}

const reference = () => referenceContractOutput(TRUTH);

describe('contract scoring, field by field', () => {
  it('counts every field of the reference answer right', () => {
    const scored = score(reference());
    expect(total(scored.fields)).toEqual({ tp: 16, fp: 0, fn: 0 });
    expect(scored.quotesOffPage).toBe(0);
  });

  it('counts a field left out as missed, and a field the verifier rejects as both wrong and missed', () => {
    const output = reference();
    const [first, second] = output.candidates;
    if (first === undefined || second === undefined) {
      throw new Error('two candidates');
    }
    const scored = score({ candidates: [{ ...first, places_of_service: null }, { ...second, amount: { written: '$39.99', page: 3, quote: '97140 $39.90 per unit' } }] });
    expect(scored.fields.places_of_service).toEqual({ tp: 0, fp: 0, fn: 1 });
    expect(scored.fields.amount).toEqual({ tp: 1, fp: 1, fn: 1 });
  });

  it('counts a misquote as wrong and missed, and as a quote off its page', () => {
    const output = reference();
    const [first] = output.candidates;
    if (first === undefined) {
      throw new Error('a candidate');
    }
    const scored = score({ candidates: [{ ...first, codes: { written: ['97110'], page: 3, quote: '97110 GP 12 $43.10 per unit' } }, ...output.candidates.slice(1)] });
    expect(scored.fields.codes).toEqual({ tp: 1, fp: 1, fn: 1 });
    expect(scored.quotesOffPage).toBe(1);
  });

  it('counts a candidate no record has as wrong whole, and a record no candidate has as missed whole', () => {
    const output = reference();
    const [first] = output.candidates;
    if (first === undefined) {
      throw new Error('a candidate');
    }
    const extra = { ...first, label: 'invented', codes: { written: ['97161'], page: 3, quote: '97161 120% of the 2025 Medicare fee schedule' }, modifiers: null, places_of_service: null, amount: null, lesser_of_schedule: null, rounding: null, effective_from: null, effective_to: null, method: { value: 'PERCENT_OF_MEDICARE' as const, page: 3, quote: '97161 120% of the 2025 Medicare fee schedule' }, percentage: { written: '120%', page: 3, quote: '97161 120% of the 2025 Medicare fee schedule' } };
    const scored = score({ candidates: [first, extra] });
    expect(scored.fields.percentage).toEqual({ tp: 0, fp: 1, fn: 0 });
    expect(scored.fields.amount).toEqual({ tp: 1, fp: 0, fn: 1 });
    expect(total(scored.fields)).toEqual({ tp: 9, fp: 3, fn: 7 });
  });

  it('reads values as code reads them: a different flag or schedule is wrong, an amount written another way is right', () => {
    const output = reference();
    const [first, second] = output.candidates;
    if (first === undefined || second === undefined) {
      throw new Error('two candidates');
    }
    const scored = score({
      candidates: [
        { ...first, lesser_of_schedule: 'PERCENT_OF_MEDICARE', amount: { written: '43.10', page: 3, quote: '97110 GP 11 $43.10 per unit' } },
        { ...second, rounding: { value: 'TRUNCATE', page: 2, quote: 'Amounts are rounded half up to the nearest cent.' } },
      ],
    });
    expect(scored.fields.lesser_of_schedule).toEqual({ tp: 1, fp: 1, fn: 1 });
    expect(scored.fields.amount).toEqual({ tp: 2, fp: 0, fn: 0 });
    expect(scored.fields.rounding).toEqual({ tp: 1, fp: 1, fn: 1 });
  });

  it('misses every field of a document that got no answer', () => {
    expect(total(scoreContract(TRUTH, null, null).fields)).toEqual({ tp: 0, fp: 0, fn: 16 });
  });
});

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

describe('the baseline', () => {
  const counts = (tp: number, fp: number, fn: number) => ({ tp, fp, fn });
  const fields = (tp: number) => ({ ...emptyFieldCounts(), amount: counts(tp, 0, 10 - tp) });
  const entry = (overrides: Partial<ContractBaseline>): ContractBaseline => ({
    purpose: 'proposeContractTerms',
    prompt_version: 'propose-contract-terms/1',
    prompt_sha256: 'd'.repeat(64),
    provider: 'bedrock',
    model_id: 'model-a',
    set_sha256: 'b'.repeat(64),
    cases: 40,
    fields: fields(8),
    total: counts(8, 0, 2),
    recorded_on: '2026-10-16',
    ...overrides,
  });
  const baseline: Baseline = parseBaseline({
    format: BASELINE_FORMAT,
    synthetic: true,
    note: 'SYNTHETIC',
    entries: [
      entry({}),
      entry({ prompt_version: 'propose-contract-terms/2', prompt_sha256: 'e'.repeat(64), model_id: 'model-b' }),
      { purpose: 'draftPacketNarrative', prompt_version: 'draft-packet-narrative/1', prompt_sha256: 'f'.repeat(64), provider: 'bedrock', model_id: 'model-a', set_sha256: 'c'.repeat(64), cases: 300, failures: 0, recorded_on: '2026-10-16' },
    ],
  });
  const contracts = (tp: number, overrides: Partial<ContractReport> = {}): ContractReport => ({
    purpose: 'proposeContractTerms',
    promptVersion: 'propose-contract-terms/1',
    promptSha256: 'd'.repeat(64),
    variant: 'default',
    modelId: 'model-a',
    setSha256: 'b'.repeat(64),
    cases: 40,
    fields: fields(tp),
    total: counts(tp, 0, 10 - tp),
    byLayout: { table: counts(tp, 0, 0), prose: counts(0, 0, 0), scanned: counts(0, 0, 0) },
    quotesOffPage: 0,
    results: [],
    ...overrides,
  });
  const report = (part: ContractReport | null, failures = 0): EvaluationReport => ({
    format: 'tp-model-eval-report/1',
    synthetic: true,
    provider: 'bedrock',
    contracts: part,
    narratives: { purpose: 'draftPacketNarrative', promptVersion: 'draft-packet-narrative/1', promptSha256: 'f'.repeat(64), modelId: 'model-a', setSha256: 'c'.repeat(64), cases: 300, passed: 300 - failures, failures: Array.from({ length: failures }, (_, index) => ({ id: `N00${String(index)}`, problems: ['verifier_failed' as const], mismatches: [], missing: [], detail: null })) },
  });

  it('holds a report to its own prompt and model, a new prompt to the same model’s, and a new model to the provider’s latest', () => {
    expect(contractBaselineFor(baseline, { provider: 'bedrock', promptVersion: 'propose-contract-terms/1', modelId: 'model-a' })?.model_id).toBe('model-a');
    expect(contractBaselineFor(baseline, { provider: 'bedrock', promptVersion: 'propose-contract-terms/3', modelId: 'model-a' })?.prompt_version).toBe('propose-contract-terms/1');
    expect(contractBaselineFor(baseline, { provider: 'bedrock', promptVersion: 'propose-contract-terms/3', modelId: 'model-c' })?.model_id).toBe('model-b');
    expect(contractBaselineFor(baseline, { provider: 'anthropic', promptVersion: 'propose-contract-terms/1', modelId: 'model-a' })).toBeNull();
  });

  it('passes no change, passes an improvement, fails a regression, a quote off its page and any narrative failure', () => {
    expect(gate(report(contracts(8)), baseline).passed).toBe(true);
    expect(gate(report(contracts(9)), baseline).passed).toBe(true);
    expect(gate(report(contracts(7)), baseline).problems).toEqual([
      { code: 'recall_regressed', field: 'all' },
      { code: 'recall_regressed', field: 'amount' },
    ]);
    expect(gate(report(contracts(8, { quotesOffPage: 2 })), baseline).problems).toEqual([{ code: 'quotes_off_page', count: 2 }]);
    expect(gate(report(null, 1), baseline).problems).toEqual([{ code: 'narrative_failures', count: 1, cases: ['N000'] }]);
  });

  it('fails a report on a prompt version whose content no longer has the hash the baseline recorded for it: a released version edited in place', () => {
    expect(gate(report(contracts(8, { promptSha256: '0'.repeat(64) })), baseline).problems).toEqual([{ code: 'prompt_changed', purpose: 'proposeContractTerms', promptVersion: 'propose-contract-terms/1' }]);
    const narrativeEdited: EvaluationReport = { ...report(null), narratives: { ...(report(null).narratives as NonNullable<EvaluationReport['narratives']>), promptSha256: '0'.repeat(64) } };
    expect(gate(narrativeEdited, baseline).problems).toEqual([{ code: 'prompt_changed', purpose: 'draftPacketNarrative', promptVersion: 'draft-packet-narrative/1' }]);
    expect(() => recordBaseline(baseline, report(contracts(9, { promptSha256: '0'.repeat(64) })), '2026-10-17')).toThrow('prompt_changed');
    // Another provider's entries say nothing about this one's.
    expect(gate({ ...report(contracts(8, { promptSha256: '0'.repeat(64) })), provider: 'anthropic' }, baseline).problems.map((problem) => problem.code)).toEqual(['no_baseline']);
  });

  it('records a passing run (replacing the entry it supersedes) and refuses one that regresses', () => {
    const recorded = recordBaseline(baseline, report(contracts(9)), '2026-10-17');
    expect(recorded.entries.filter((item) => item.purpose === 'proposeContractTerms' && item.model_id === 'model-a')).toEqual([expect.objectContaining({ total: counts(9, 0, 1), recorded_on: '2026-10-17' })]);
    expect(recorded.entries).toHaveLength(3);
    expect(() => recordBaseline(baseline, report(contracts(7)), '2026-10-17')).toThrow('nothing is recorded');
    expect(() => recordBaseline(baseline, report(null, 1), '2026-10-17')).toThrow('narrative_failures');
    const first = recordBaseline({ ...baseline, entries: [] }, { ...report(contracts(5)), provider: 'anthropic' }, '2026-10-17');
    expect(first.entries.map((item) => `${item.purpose}:${item.provider}`)).toEqual(['proposeContractTerms:anthropic', 'draftPacketNarrative:anthropic']);
  });
});
