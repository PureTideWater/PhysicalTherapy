import { createHash } from 'node:crypto';

import { type PricingTrace, price, recompute } from '@tp/pricing';
import { contractAgreement, fixedTerms, lesserOfTerms, lineFacts, perVisitTerms, percentTerms, pricingInput, syntheticRelease } from '@tp/pricing/testing';
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

  it('states every field of a fixed-schedule line’s summary as the trace holds it', () => {
    const [line] = priced({ units: '2', agreement: contractAgreement({ terms: fixedTerms(5000n) }) });
    if (line === undefined) {
      throw new Error('priced');
    }
    const { trace } = line;
    expect(lineCalculation(trace)).toStrictEqual({
      method: 'FIXED_SCHEDULE',
      release_no: 900001,
      steps: [
        { step: 'unit', amount_cents: '5000' },
        { step: 'schedule', amount_cents: '10000' },
        { step: 'base', amount_cents: '10000' },
      ],
      rounding: { rule: trace.steps.rounding?.rule, unrounded_cents: '10000', rounded_cents: '10000' },
      observed_basis: 'amt_b6',
      patient_share_cents: '0',
      trace_sha256: createHash('sha256').update(canonicalJson(trace)).digest('hex'),
    });
    expect(trace.steps.rounding).not.toBeNull();
  });

  it('names a per-visit line’s amount a visit, with the base the per-visit step set', () => {
    const [line] = priced({ units: '3', agreement: contractAgreement({ terms: perVisitTerms(9000n) }) });
    if (line === undefined) {
      throw new Error('priced');
    }
    const { trace } = line;
    expect(trace.steps.per_visit).not.toBeNull();
    const summary = lineCalculation(trace);
    expect(summary.method).toBe('PER_VISIT');
    // A visit is paid once, whatever the units: no schedule for the units billed, no charge compared.
    expect(summary.steps).toStrictEqual([
      { step: 'visit', amount_cents: '9000' },
      { step: 'base', amount_cents: trace.steps.per_visit?.base_cents },
    ]);
    expect(summary.steps[1]?.amount_cents).toBe('9000');
    expect(summary.rounding?.rounded_cents).toBe(centsToString(line.expected));
  });

  it('lists the line charge a lesser-of term compares, between the schedule and the base', () => {
    const [line] = priced({ units: '2', chargeCents: 8000n as Cents, agreement: contractAgreement({ terms: lesserOfTerms({ fixedCents: 5000n }) }) });
    if (line === undefined) {
      throw new Error('priced');
    }
    const summary = lineCalculation(line.trace);
    expect(summary.method).toBe('LESSER_OF');
    // The schedule is 2 x 50.00 = 100.00; the charge, 80.00, is the lesser and the base.
    expect(summary.steps).toStrictEqual([
      { step: 'unit', amount_cents: '5000' },
      { step: 'schedule', amount_cents: '10000' },
      { step: 'charge', amount_cents: '8000' },
      { step: 'base', amount_cents: '8000' },
    ]);
    expect(summary.rounding?.rounded_cents).toBe('8000');
    expect(centsToString(line.expected)).toBe('8000');
  });

  it('copies what a stored trace holds and nothing it leaves out: no units step, no absent amount, a method with no agreement', () => {
    const [line] = priced({ units: '2', agreement: contractAgreement({ terms: fixedTerms(5000n) }) });
    if (line === undefined) {
      throw new Error('priced');
    }
    const { trace } = line;
    // A trace with no units step and no per-visit step has no amount per unit and no base: only its adjustments.
    const noUnits: PricingTrace = { ...trace, steps: { ...trace.steps, units: null, per_visit: null } };
    expect(lineCalculation(noUnits).steps).toStrictEqual([]);
    const adjusted: PricingTrace = { ...noUnits, steps: { ...noUnits.steps, adjustments: [{ name: 'contract_adjustment', before_cents: '10000', after_cents: '9500', kind: 'PERCENT', percent: '95', cap_cents: null }] } };
    expect(lineCalculation(adjusted).steps).toStrictEqual([{ step: 'contract_adjustment', amount_cents: '9500' }]);
    // A stored trace read back without an amount's key states no step for it.
    const { charge_cents: _charge, ...withoutCharge } = trace.steps.units ?? { charge_cents: null };
    const absent = { ...trace, steps: { ...trace.steps, units: withoutCharge } } as unknown as PricingTrace;
    expect(lineCalculation(absent).steps.map((step) => step.step)).toStrictEqual(['unit', 'schedule', 'base']);
    expect(lineCalculation(absent).steps.every((step) => typeof step.amount_cents === 'string')).toBe(true);
    // The method is the terms' when the trace records no agreement.
    expect(lineCalculation({ ...trace, agreement: null }).method).toBe('FIXED_SCHEDULE');
  });

  it('names the trace by the SHA-256 of its canonical JSON, read as UTF-8', () => {
    const [line] = priced({});
    if (line === undefined) {
      throw new Error('priced');
    }
    const expected = createHash('sha256').update(Buffer.from(canonicalJson(line.trace), 'utf8')).digest('hex');
    expect(traceSha256(line.trace)).toBe(expected);
    expect(traceSha256(line.trace)).toMatch(/^[0-9a-f]{64}$/);
    // Any value: the canonical JSON of {"a":"é","b":1}, written as UTF-8 bytes.
    expect(traceSha256({ b: 1, a: 'é' })).toBe(createHash('sha256').update(Buffer.from('{"a":"é","b":1}', 'utf8')).digest('hex'));
    expect(traceSha256({ b: 1, a: 'é' })).not.toBe(traceSha256({ b: 1, a: 'e' }));
  });

  it('refuses, by its class, name and message, a trace that priced nothing or has no terms or no rounding', () => {
    const [line] = priced({ units: '2', agreement: contractAgreement({ terms: fixedTerms(5000n) }) });
    if (line === undefined) {
      throw new Error('priced');
    }
    const { trace } = line;
    const unpriced: PricingTrace = { ...trace, outcome: { result: 'unpriced', reason: 'NO_AGREEMENT', detail: null, step: 'agreement' } };
    for (const [label, refused] of [
      ['an unpriced outcome, with its terms and rounding', unpriced],
      ['no terms', { ...trace, terms: null }],
      ['no rounding', { ...trace, steps: { ...trace.steps, rounding: null } }],
    ] as const) {
      let error: unknown = null;
      try {
        lineCalculation(refused);
      } catch (caught) {
        error = caught;
      }
      expect(error, label).toBeInstanceOf(CalculationError);
      expect(error, label).toBeInstanceOf(Error);
      expect((error as Error).name, label).toBe('CalculationError');
      expect((error as Error).message, label).toBe('only a priced line has a calculation to summarize');
    }
  });

  it('refuses a trace that priced nothing', () => {
    const [result] = price(pricingInput(syntheticRelease(), [lineFacts({ agreement: { outcome: 'RESOLUTION_FAILED' } })]));
    expect(result?.outcome).toBe('unpriced');
    expect(() => lineCalculation(result?.trace as PricingTrace)).toThrow(CalculationError);
  });
});
