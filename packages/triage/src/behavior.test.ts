import { type Cents, decimal, roundToCents, unroundedCents } from '@tp/money';
import { type LineFacts, type LinePricing, type PricingTrace, price } from '@tp/pricing';
import { SYNTHETIC_RELEASES, contractAgreement, lineFacts, maAgreement, percentTerms, pricingInput, readRuleRelease, releaseVariant, syntheticRelease } from '@tp/pricing/testing';
import { indexRelease } from '@tp/pricing';
import type { RuleRecord } from '@tp/rules';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type BehaviorReferences, detectBehavior, releaseReferences } from './behavior';

/**
 * The behaviors are detected from traces the engine wrote (@tp/pricing under SYNTHETIC release
 * 900002, which holds 2025 and 2026). Each payer behavior is simulated by pricing the same claim the
 * way the payer would have (the reduction applied, or the prior year's conversion factor) and taking
 * that as the observed allowed; the contract's own pricing of the line then carries the trace.
 */

const RELEASE = syntheticRelease(900002);
const REFERENCES = releaseReferences(RELEASE);
const DATE = '2026-03-10';

const contract = (flags: { readonly apply_mppr?: boolean; readonly apply_sequestration?: boolean } = {}, percentage = '110') =>
  contractAgreement({ terms: percentTerms({ percentage, codes: ['97110', '97140', '97530', '97112'], flags }) });

const claimLines = (agreement = contract(), observed: readonly bigint[] = [1n, 1n, 1n]): LineFacts[] => [
  lineFacts({ lineNo: 1, procedureCode: '97110', units: '2', serviceDate: DATE, chargeCents: 12000n as Cents, observedAllowedCents: (observed[0] ?? 1n) as Cents, agreement }),
  lineFacts({ lineNo: 2, procedureCode: '97140', units: '1', serviceDate: DATE, chargeCents: 6000n as Cents, observedAllowedCents: (observed[1] ?? 1n) as Cents, agreement }),
  lineFacts({ lineNo: 3, procedureCode: '97530', units: '1', serviceDate: DATE, chargeCents: 7000n as Cents, observedAllowedCents: (observed[2] ?? 1n) as Cents, agreement }),
];

function amounts(results: readonly LinePricing[]): bigint[] {
  return results.map((result) => {
    if (result.outcome !== 'priced') {
      throw new Error(`line ${String(result.lineNo)} did not price: ${result.reason}`);
    }
    return result.expectedAllowedCents;
  });
}

function traces(results: readonly LinePricing[]): PricingTrace[] {
  return results.map((result) => result.trace);
}

/** The 2026 conversion factors replaced by 2025's: what a payer paying at the prior year's factor computes. */
function priorFactorRelease() {
  const release = readRuleRelease(SYNTHETIC_RELEASES[900002]);
  const factors = release.records.filter((record) => record.record_type === 'conversion_factor');
  return releaseVariant(release, (records) =>
    records.map((record): RuleRecord => {
      if (record.record_type !== 'conversion_factor' || record.effective_from < '2026-01-01') {
        return record;
      }
      const prior = factors.find((candidate) => candidate.record_type === 'conversion_factor' && candidate.effective_from < '2026-01-01' && candidate.key.applicability === record.key.applicability);
      return prior === undefined ? record : ({ ...record, value: { ...record.value, conversion_factor: prior.value.conversion_factor } });
    }),
  );
}

describe('adjustment behavior detected from the trace (PRD 12; CAS-03)', () => {
  it('reads the reduction percentages and conversion factors from the release', () => {
    // The SYNTHETIC rate file's share for 97110 (fixtures/synthetic/rules/release-synth-900002/mppr_rate).
    expect(REFERENCES.mpprReductionPercent('97110', DATE)?.toString()).toBe('40');
    expect(REFERENCES.mpprReductionPercent('99213', DATE)).toBeNull();
    expect(REFERENCES.conversionFactor('non_qualifying_apm', 2025)).not.toBeNull();
    expect(REFERENCES.conversionFactor('non_qualifying_apm', 1999)).toBeNull();
  });

  it('detects a reduction the contract does not allow (MPPR applied where the contract does not allow it)', () => {
    const payer = amounts(price(pricingInput(RELEASE, claimLines(contract({ apply_mppr: true })))));
    const expected = amounts(price(pricingInput(RELEASE, claimLines())));
    const results = price(pricingInput(RELEASE, claimLines(contract(), payer)));
    const behaviors = traces(results).map((trace) => detectBehavior(trace, REFERENCES));
    // The day's highest practice-expense unit keeps its amount; every other unit was cut.
    payer.forEach((amount, index) => {
      expect(behaviors[index]).toBe(amount < (expected[index] ?? 0n) ? 'MPPR_NOT_IN_CONTRACT' : 'BELOW_CONTRACT_RATE');
    });
    expect(behaviors.filter((behavior) => behavior === 'MPPR_NOT_IN_CONTRACT').length).toBeGreaterThanOrEqual(2);
  });

  it('detects payment at the prior year’s conversion factor, with sequestration on the contract', () => {
    const agreement = contract({ apply_sequestration: true });
    const payer = amounts(price(pricingInput(priorFactorRelease(), claimLines(agreement))));
    const expected = amounts(price(pricingInput(RELEASE, claimLines(agreement))));
    expect(payer.every((amount, index) => amount < (expected[index] ?? 0n))).toBe(true);
    const results = price(pricingInput(RELEASE, claimLines(agreement, payer)));
    expect(traces(results).map((trace) => detectBehavior(trace, REFERENCES))).toEqual(['PRIOR_YEAR_CONVERSION_FACTOR', 'PRIOR_YEAR_CONVERSION_FACTOR', 'PRIOR_YEAR_CONVERSION_FACTOR']);
  });

  it('detects the prior year’s factor on a Medicare Advantage non-contracted claim, whose reduction and sequestration are on', () => {
    const lines = (observed?: readonly bigint[]) => claimLines(maAgreement(), observed);
    const payer = amounts(price(pricingInput(priorFactorRelease(), lines())));
    const results = price(pricingInput(RELEASE, lines(payer)));
    expect(traces(results).map((trace) => detectBehavior(trace, REFERENCES))).toEqual(['PRIOR_YEAR_CONVERSION_FACTOR', 'PRIOR_YEAR_CONVERSION_FACTOR', 'PRIOR_YEAR_CONVERSION_FACTOR']);
  });

  it.each([
    ['a percentage the contract defines', { kind: 'PERCENT', percent: '92.5' }],
    ['a cap the contract defines', { kind: 'CAP', capCents: 900_000n }],
  ] as const)('detects the prior year’s factor through %s, applied last', (_label, adjustment) => {
    const agreement = contractAgreement({ terms: percentTerms({ percentage: '110', codes: ['97110', '97140', '97530'], adjustment }) });
    const payer = amounts(price(pricingInput(priorFactorRelease(), claimLines(agreement))));
    const results = price(pricingInput(RELEASE, claimLines(agreement, payer)));
    expect(traces(results).map((trace) => detectBehavior(trace, REFERENCES))).toEqual(['PRIOR_YEAR_CONVERSION_FACTOR', 'PRIOR_YEAR_CONVERSION_FACTOR', 'PRIOR_YEAR_CONVERSION_FACTOR']);
  });

  it('detects the prior year’s factor on an assistant’s line (CQ) of a Medicare Advantage claim', () => {
    const lines = (observed: readonly bigint[] = [1n, 1n, 1n]) => claimLines(maAgreement(), observed).map((item, index) => (index === 1 ? { ...item, modifiers: ['GP', 'CQ'] } : item));
    const payer = amounts(price(pricingInput(priorFactorRelease(), lines())));
    const results = price(pricingInput(RELEASE, lines(payer)));
    expect(results[1]?.trace.steps.adjustments.map((item) => item.name)).toContain('assistant_reduction');
    expect(traces(results).map((trace) => detectBehavior(trace, REFERENCES))).toEqual(['PRIOR_YEAR_CONVERSION_FACTOR', 'PRIOR_YEAR_CONVERSION_FACTOR', 'PRIOR_YEAR_CONVERSION_FACTOR']);
  });

  it('reads the general practice-expense reduction for a code whose own share is null', () => {
    const stub = {
      releaseNo: 1,
      manifestSha256: 'x',
      inForce: (_type: string, key: Readonly<Record<string, string>>) =>
        key.component === 'practice_expense' ? { value: { reduction_percent: '45' } } : key.hcpcs === '97112' ? { value: { pe_reduction_percent: null } } : key.hcpcs === '97110' ? { value: { pe_reduction_percent: '50' } } : null,
      latestInYear: () => null,
      ref: () => {
        throw new Error('not used');
      },
    } as unknown as Parameters<typeof releaseReferences>[0];
    const references = releaseReferences(stub);
    expect(references.mpprReductionPercent('97112', DATE)?.toString()).toBe('45');
    expect(references.mpprReductionPercent('97110', DATE)?.toString()).toBe('50');
    expect(references.mpprReductionPercent('97035', DATE)).toBeNull();
    const withoutGeneral = releaseReferences({ ...stub, inForce: (_type: string, key: Readonly<Record<string, string>>) => (key.hcpcs === '97112' ? { value: { pe_reduction_percent: null } } : null) } as unknown as typeof stub);
    expect(withoutGeneral.mpprReductionPercent('97112', DATE)).toBeNull();
    expect(references.conversionFactor('non_qualifying_apm', 2025)).toBeNull();
  });

  it('calls any other shortfall paid below the contract rate, and a line paid in full or unpriced the same', () => {
    const expected = amounts(price(pricingInput(RELEASE, claimLines())));
    const short = expected.map((amount) => amount - 777n);
    expect(traces(price(pricingInput(RELEASE, claimLines(contract(), short)))).map((trace) => detectBehavior(trace, REFERENCES))).toEqual([
      'BELOW_CONTRACT_RATE',
      'BELOW_CONTRACT_RATE',
      'BELOW_CONTRACT_RATE',
    ]);
    const full = traces(price(pricingInput(RELEASE, claimLines(contract(), expected))));
    expect(full.map((trace) => detectBehavior(trace, REFERENCES))).toEqual(['BELOW_CONTRACT_RATE', 'BELOW_CONTRACT_RATE', 'BELOW_CONTRACT_RATE']);
    const unpriced = price(pricingInput(RELEASE, [lineFacts({ procedureCode: '97150', agreement: contract() })]))[0];
    expect(unpriced?.outcome).toBe('unpriced');
    expect(detectBehavior((unpriced as LinePricing).trace, REFERENCES)).toBe('BELOW_CONTRACT_RATE');
  });

  it('needs the references a detector reads: without them every shortfall is below the contract rate', () => {
    const none: BehaviorReferences = { mpprReductionPercent: () => null, conversionFactor: () => null };
    const payer = amounts(price(pricingInput(RELEASE, claimLines(contract({ apply_mppr: true })))));
    const results = price(pricingInput(RELEASE, claimLines(contract(), payer)));
    expect(new Set(traces(results).map((trace) => detectBehavior(trace, none)))).toEqual(new Set(['BELOW_CONTRACT_RATE']));
    // A release whose prior factor equals this year's explains nothing.
    const same: BehaviorReferences = { ...REFERENCES, conversionFactor: (applicability) => REFERENCES.conversionFactor(applicability, 2026) };
    const prior = amounts(price(pricingInput(priorFactorRelease(), claimLines())));
    const atPrior = price(pricingInput(RELEASE, claimLines(contract(), prior)));
    expect(new Set(traces(atPrior).map((trace) => detectBehavior(trace, same)))).toEqual(new Set(['BELOW_CONTRACT_RATE']));
  });

  it('never calls a shortfall a behavior it does not reproduce within a cent (property)', () => {
    const expected = amounts(price(pricingInput(RELEASE, claimLines())));
    const payerPrior = amounts(price(pricingInput(priorFactorRelease(), claimLines())));
    const within = (a: bigint, b: bigint) => a - b <= 1n && b - a <= 1n;
    fc.assert(
      fc.property(fc.array(fc.bigInt({ min: 1n, max: 2000n }), { minLength: 3, maxLength: 3 }), (shortfalls) => {
        const observed = expected.map((amount, index) => amount - (shortfalls[index] ?? 1n));
        const lineTraces = traces(price(pricingInput(RELEASE, claimLines(contract(), observed))));
        lineTraces.forEach((trace, index) => {
          const behavior = detectBehavior(trace, REFERENCES);
          const amount = observed[index] ?? 0n;
          if (behavior === 'MPPR_NOT_IN_CONTRACT') {
            // Flags off: the what-if is the base less the reduction of every unit, or of all but one.
            const units = BigInt(trace.steps.units?.units ?? '0');
            const cut = decimal(trace.steps.fee_schedule?.unit_cents?.pe ?? '0').times(decimal('40')).dividedBy(decimal(100n));
            const base = decimal(trace.steps.units?.base_cents ?? '0');
            const candidates = [units - 1n, units].filter((reduced) => reduced > 0n).map((reduced) => roundToCents(unroundedCents(base.minus(cut.times(decimal(reduced)))), 'HALF_UP_CENT'));
            expect(candidates.some((candidate) => within(candidate, amount))).toBe(true);
          }
          if (behavior === 'PRIOR_YEAR_CONVERSION_FACTOR') {
            expect(within(amount, payerPrior[index] ?? 0n)).toBe(true);
          }
        });
      }),
      { numRuns: 200 },
    );
  });

  it('keeps the what-if amount from the trace alone: a release of other records gives the same answers', () => {
    const payer = amounts(price(pricingInput(RELEASE, claimLines(contract({ apply_mppr: true })))));
    const trace = traces(price(pricingInput(RELEASE, claimLines(contract(), payer))))[0] as PricingTrace;
    const sparse = releaseReferences(indexRelease({ releaseNo: 1, manifestSha256: 'x', records: [] }));
    expect(detectBehavior(trace, { ...sparse, mpprReductionPercent: () => decimal('40') })).toBe('MPPR_NOT_IN_CONTRACT');
    expect(detectBehavior(trace, REFERENCES)).toBe('MPPR_NOT_IN_CONTRACT');
  });
});
