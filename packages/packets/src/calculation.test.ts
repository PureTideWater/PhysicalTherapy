import { type PricingTrace, price, recompute } from '@tp/pricing';
import { contractAgreement, fixedTerms, lineFacts, percentTerms, pricingInput, syntheticRelease } from '@tp/pricing/testing';
import { type Cents, centsToString } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { CalculationError, lineCalculation, traceSha256 } from './calculation';
import { canonicalJson } from './hash';

/**
 * A line's calculation summary (tp-packet/2) is copied from its stored trace and never computed again
 * (CO-05; PRC-16): its rounded amount is the line's expected amount, and recompute(trace) gives that
 * amount with no difference from what the trace recorded. SYNTHETIC release 900001 and invented lines only.
 */

function priced(...lines: Parameters<typeof lineFacts>[0][]): { readonly trace: PricingTrace; readonly expected: Cents }[] {
  return price(pricingInput(syntheticRelease(), lines.map((overrides, index) => lineFacts({ lineNo: index + 1, ...overrides })))).map((result) => {
    if (result.outcome !== 'priced') {
      throw new Error('the SYNTHETIC line should price');
    }
    // The trace as the database stores and returns it.
    return { trace: JSON.parse(JSON.stringify(result.trace)) as PricingTrace, expected: result.expectedAllowedCents };
  });
}

describe('lineCalculation', () => {
  it('copies a fixed-schedule line’s steps and its one rounding from the trace, and recompute(trace) holds', () => {
    const [line] = priced({ units: '2', agreement: contractAgreement({ terms: fixedTerms(5000n) }) });
    if (line === undefined) {
      throw new Error('priced');
    }
    const summary = lineCalculation(line.trace);
    expect(summary).toMatchObject({ method: 'FIXED_SCHEDULE', release_no: 900001, observed_basis: 'amt_b6', patient_share_cents: '0' });
    expect(summary.steps.map((step) => step.step)).toEqual(['unit', 'schedule', 'base']);
    expect(summary.steps.find((step) => step.step === 'unit')?.amount_cents).toBe('5000');
    expect(summary.rounding?.rounded_cents).toBe(centsToString(line.expected));
    const recomputed = recompute(line.trace);
    expect(recomputed.outcome).toBe('priced');
    if (recomputed.outcome === 'priced') {
      expect(recomputed.differences).toEqual([]);
      expect(centsToString(recomputed.expectedAllowedCents)).toBe(summary.rounding?.rounded_cents);
      expect(recomputed.expectedUnroundedCents.toString()).toBe(summary.rounding?.unrounded_cents);
    }
  });

  it('lists every adjustment after its base, in the order the engine applied them (Medicare Advantage non-contracted)', () => {
    const lines = priced({ units: '2', procedureCode: '97110' }, { units: '1', procedureCode: '97140' });
    for (const line of lines) {
      const summary = lineCalculation(line.trace);
      expect(summary.method).toBe('MA_NONCONTRACTED');
      const names = summary.steps.map((step) => step.step);
      expect(names.slice(0, names.indexOf('base') + 1)).toEqual(['unit', 'schedule', 'base']);
      expect(names.slice(names.indexOf('base') + 1)).toEqual(line.trace.steps.adjustments.map((adjustment) => adjustment.name));
      expect(summary.steps.at(-1)?.amount_cents).toBe(line.trace.steps.adjustments.at(-1)?.after_cents ?? line.trace.steps.units?.base_cents);
      expect(summary.rounding?.rounded_cents).toBe(centsToString(line.expected));
      const recomputed = recompute(line.trace);
      expect(recomputed.outcome === 'priced' ? recomputed.differences : ['unpriced']).toEqual([]);
    }
  });

  it('holds a percent-of-Medicare term’s unrounded amount beside the rounded one', () => {
    const [line] = priced({ units: '3', agreement: contractAgreement({ terms: percentTerms() }) });
    if (line === undefined) {
      throw new Error('priced');
    }
    const summary = lineCalculation(line.trace);
    expect(summary.method).toBe('PERCENT_OF_MEDICARE');
    expect(summary.rounding).toEqual({ rule: line.trace.steps.rounding?.rule, unrounded_cents: line.trace.steps.rounding?.unrounded_cents, rounded_cents: centsToString(line.expected) });
  });

  it('names the trace by the SHA-256 of its canonical JSON, whatever the key order the database returns', () => {
    const [line] = priced({});
    if (line === undefined) {
      throw new Error('priced');
    }
    const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(line.trace).reverse()))) as PricingTrace;
    expect(traceSha256(reordered)).toBe(traceSha256(line.trace));
    expect(lineCalculation(line.trace).trace_sha256).toBe(traceSha256(line.trace));
    expect(canonicalJson(reordered)).toBe(canonicalJson(line.trace));
  });

  it('refuses a trace that priced nothing', () => {
    const [result] = price(pricingInput(syntheticRelease(), [lineFacts({ agreement: { outcome: 'RESOLUTION_FAILED' } })]));
    expect(result?.outcome).toBe('unpriced');
    expect(() => lineCalculation(result?.trace as PricingTrace)).toThrow(CalculationError);
  });
});
