import type { Cents } from '@tp/money';
import type { RuleRecord } from '@tp/rules';
import { describe, expect, it } from 'vitest';

import { price } from './engine';
import { TraceRecomputeError, recompute } from './recompute';
import {
  SYNTHETIC_RELEASES,
  contractAgreement,
  keyOf,
  lineFacts,
  percentTerms,
  pricingInput,
  readRuleRelease,
  releaseVariant,
  ruleRecordLike,
  syntheticRelease,
} from './testing';
import type { PricingTrace } from './trace';
import type { LineFacts, LinePricing, PricingInput } from './types';

/**
 * Test matrix PRC-16 on hand-built lines (the golden test runs it over every golden line): the trace
 * alone recomputes the stored amount, and a trace changed after the fact no longer does.
 */
const release = syntheticRelease(900001);
const base = readRuleRelease(SYNTHETIC_RELEASES[900001]);
const cents = (value: bigint) => value as Cents;
const all = contractAgreement({ terms: percentTerms({ percentage: '110', codes: ['97110', '97140', '97530'], flags: { apply_mppr: true, apply_assistant_reduction: true, apply_sequestration: true } }) });

/** The trace as stored and read back: plain JSON. */
function stored(result: LinePricing | undefined): PricingTrace {
  expect(result).toBeDefined();
  return JSON.parse(JSON.stringify(result?.trace)) as PricingTrace;
}

function priceLines(lines: LineFacts[], overrides: Parameters<typeof pricingInput>[2] = {}, using = release): LinePricing[] {
  return price(pricingInput(using, lines, overrides));
}

function expectReproduced(results: readonly LinePricing[]): void {
  for (const result of results) {
    const again = recompute(stored(result));
    expect(again.differences, `line ${String(result.lineNo)}`).toEqual([]);
    if (result.outcome === 'priced') {
      expect(again).toMatchObject({
        outcome: 'priced',
        expectedAllowedCents: result.expectedAllowedCents,
        rounding: result.rounding,
        patientShareCents: result.patientShareCents,
        varianceCents: result.varianceCents,
      });
      if (again.outcome === 'priced') {
        expect(again.expectedUnroundedCents.equals(result.expectedUnroundedCents)).toBe(true);
        expect(again.baseCents.equals(result.baseCents)).toBe(true);
        expect(again.adjustments.map((item) => [item.name, item.beforeCents.toString(), item.afterCents.toString()])).toEqual(
          result.adjustments.map((item) => [item.name, item.beforeCents.toString(), item.afterCents.toString()]),
        );
      }
    } else {
      expect(again).toEqual({ outcome: 'unpriced', reason: result.reason, differences: [] });
    }
  }
}

const day = (agreement = all) => [
  lineFacts({ lineNo: 1, procedureCode: '97110', units: '2', modifiers: ['GP', 'CQ'], agreement, patientShareAdjustments: [{ groupCode: 'PR', reasonCode: '2', amountCents: cents(840n) }] }),
  lineFacts({ lineNo: 2, procedureCode: '97140', agreement }),
  lineFacts({ lineNo: 3, procedureCode: '97530', agreement, patientShareAdjustments: [{ groupCode: 'PR', reasonCode: '1', amountCents: cents(9000n) }] }),
];

describe('recompute(trace)', () => {
  it('reproduces every priced amount, base and adjustment from the trace alone', () => {
    expectReproduced(priceLines(day()));
    expectReproduced(priceLines(day(undefined).map((line) => ({ ...line, agreement: lineFacts().agreement }))));
    expectReproduced(priceLines([lineFacts({ placeOfService: '22', procedureCode: '97530', units: '3' })], { settings: { zip: '00011', defaultRounding: null, placeOfServiceSettings: { '22': 'facility' } } }));
    expectReproduced(priceLines([lineFacts({ procedureCode: '97161' })]));
    expectReproduced(priceLines([lineFacts({ procedureCode: '97112', serviceDate: '2026-04-14', agreement: contractAgreement({ terms: percentTerms({ percentage: '105', yearBasis: 'LOCKED:2025', codes: ['97112'], rounding: 'TRUNCATE' }) }) })], {}, syntheticRelease(900002)));
  });

  it('derives every stop again from the facts the trace recorded', () => {
    const suspended = releaseVariant(base, (records) =>
      records.map((record) => (record.record_type === 'sequestration' ? ruleRecordLike(record, { value: { reduction_percent: '0', applies_to: 'SYNTHETIC suspension', suspended: true } }) : record)),
    );
    expectReproduced(priceLines([lineFacts()], {}, suspended));
    expectReproduced(priceLines([lineFacts({ agreement: { outcome: 'NO_MAPPING' } })]));
    expectReproduced(priceLines([lineFacts({ agreement: { outcome: 'RESOLUTION_FAILED' } })]));
    expectReproduced(priceLines([lineFacts({ agreement: contractAgreement({ version: { status: 'approved' } }) })]));
    expectReproduced(priceLines([lineFacts({ procedureCode: '97750' }), lineFacts({ lineNo: 2, procedureCode: 'G0283', placeOfService: '22' }), lineFacts({ lineNo: 3, placeOfService: '99' })]));
    expectReproduced(priceLines([lineFacts({ units: '0' }), lineFacts({ lineNo: 2, procedureCode: 'X' })]));
    for (const claim of [{ claimStatusCode: '2' }, { claimStatusCode: '22' }, { claimStatusCode: '19' }, { reversed: true }, { reversed: true, corrected: true }]) {
      expectReproduced(priceLines(day(), { claim }));
    }
    const unsupported = contractAgreement({ terms: { ...percentTerms(), method: 'UNSUPPORTED', parameters: {} } });
    expectReproduced(priceLines([lineFacts({ agreement: unsupported })]));
    // A line refused for its settings still has a trace that reads back.
    expectReproduced(priceLines([lineFacts()], { settings: { zip: '00011', defaultRounding: 'NEAREST' as never, placeOfServiceSettings: { '11': 'clinic' as never } } }));
  });

  it('keeps the recorded reason of a line that stopped with ENGINE_ERROR part way', () => {
    const noAssistant = releaseVariant(base, (records) => records.filter((record) => record.record_type !== 'assistant_modifier'));
    expectReproduced(priceLines(day(), {}, noAssistant));
    const noRate = releaseVariant(base, (records) =>
      records
        .filter((record) => !(record.record_type === 'mppr_rate' && keyOf(record).component === 'practice_expense'))
        .map((record) => (record.record_type === 'mppr_rate' && keyOf(record).hcpcs === '97530' ? ruleRecordLike(record, { value: { pe_reduction_percent: null } }) : record)),
    );
    expectReproduced(priceLines(day(), {}, noRate));
    const window = base.records.find((record) => record.record_type === 'dispute_window' && keyOf(record).window === 'redetermination') as RuleRecord;
    const twice = releaseVariant(base, (records) => [...records, ruleRecordLike(window, { effective_from: '2026-02-01' })]);
    expectReproduced(priceLines([lineFacts()], {}, twice));
  });

  it('finds a trace changed after the fact', () => {
    const [first] = priceLines(day());
    const trace = stored(first);
    const rvu = trace.steps.fee_schedule?.rvu;
    if (rvu) {
      rvu.work_rvu = '0.41';
    }
    const changed = recompute(trace);
    expect(changed.differences.some((item) => item.startsWith('unit work cents'))).toBe(true);
    expect(changed.differences.some((item) => item.startsWith('expected allowed cents'))).toBe(true);

    const ranked = stored(priceLines(day())[1]);
    const mppr = ranked.steps.adjustments[0];
    if (mppr?.name === 'mppr') {
      mppr.ranking = mppr.ranking.map((item) => (item.line_no === 2 ? { ...item, pe_cents: '9999' } : item));
    }
    expect(recompute(ranked).differences.some((item) => item.startsWith('ranked unit 1'))).toBe(true);

    const modifiers = stored(first);
    modifiers.line.modifiers = ['GP'];
    expect(recompute(modifiers).differences.some((item) => item.startsWith('assistant modifiers'))).toBe(true);

    const share = stored(first);
    share.line.patient_share_adjustments = [];
    expect(recompute(share).differences.some((item) => item.startsWith('sequestration patient share'))).toBe(true);

    const status = stored(first);
    status.claim.claim_status_code = '2';
    expect(recompute(status)).toMatchObject({ outcome: 'unpriced', reason: 'SECONDARY_PAYER', differences: ['outcome: the trace records priced, the recomputation gives SECONDARY_PAYER'] });

    const flags = stored(first);
    if (flags.terms) {
      flags.terms.flags.apply_mppr = false;
    }
    expect(recompute(flags).differences).toContain('adjustments recorded: the trace records 3, the recomputation gives 2');

    const rule = stored(first);
    if (rule.steps.rounding) {
      rule.steps.rounding.rule = 'TRUNCATE';
    }
    expect(recompute(rule).differences).toContain('rounding rule: the trace records TRUNCATE, the recomputation gives HALF_UP_CENT');

    const refused = stored(priceLines([lineFacts({ units: '0' })])[0]);
    refused.outcome = { result: 'priced', expected_allowed_cents: '1', expected_unrounded_cents: '1' };
    expect(() => recompute(refused)).toThrow('a priced trace is missing the fee schedule or the units');
    const input = stored(priceLines([lineFacts({ procedureCode: 'X' })])[0]);
    input.outcome = { result: 'priced', expected_allowed_cents: '1', expected_unrounded_cents: '1' };
    expect(recompute(input)).toEqual({ outcome: 'unpriced', reason: 'ENGINE_ERROR', differences: ['outcome: the trace records priced, the recomputation gives ENGINE_ERROR'] });
  });

  it('refuses a value that is not a trace, or a priced trace without the steps its amount needs', () => {
    expect(() => recompute({ format: 'something else' })).toThrow(TraceRecomputeError);
    const priced = () => stored(priceLines(day())[0]);

    const noSchedule = priced();
    noSchedule.steps.fee_schedule = null;
    expect(() => recompute(noSchedule)).toThrow('a priced trace is missing the fee schedule or the units');

    const noStep = priced();
    noStep.steps.adjustments = noStep.steps.adjustments.filter((item) => item.name !== 'sequestration');
    expect(() => recompute(noStep)).toThrow('a priced trace is missing the sequestration step');

    const noRounding = priced();
    noRounding.steps.rounding = null;
    expect(() => recompute(noRounding)).toThrow('a priced trace is missing the rounding and the variance');

    const units = priced();
    units.line.units = '1.5';
    expect(() => recompute(units)).toThrow('the trace records units the engine does not price');

    const rounding = priced();
    rounding.settings.default_rounding = 'NEAREST';
    expect(() => recompute(rounding)).toThrow('the trace records a default rounding the engine does not know');

    const percent = priced();
    const mppr = percent.steps.adjustments[0];
    if (mppr?.name === 'mppr') {
      mppr.reduction_percent = null;
    }
    expect(() => recompute(percent)).toThrow('an always-therapy line records no reduction percent');
  });
});

describe('the inputs recompute is given', () => {
  it('are only the trace: a recomputation needs neither the release nor the agreement', () => {
    const input: PricingInput = pricingInput(release, day());
    const traces = price(input).map(stored);
    const recomputed = traces.map((trace) => recompute(trace));
    expect(recomputed.map((item) => item.outcome === 'priced' && item.expectedAllowedCents)).toEqual(price(input).map((item) => item.outcome === 'priced' && item.expectedAllowedCents));
  });
});
