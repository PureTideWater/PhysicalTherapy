import type { RateRecordTerms } from '@tp/contracts';
import { type Cents, ROUNDING_RULES, decimal } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { addDays } from './dates';
import { price } from './engine';
import { PHASE_ONE_REASONS } from './reasons';
import { recompute } from './recompute';
import {
  SYNTHETIC_RELEASES,
  contractAgreement,
  lineFacts,
  maAgreement,
  mappingRecord,
  percentTerms,
  practiceSettings,
  pricingInput,
  readRuleRelease,
  releaseVariant,
  syntheticRelease,
  versionRecord,
} from './testing';
import type { AgreementInput, LineFacts, LinePricing, PricedLine, PricingInput } from './types';

/**
 * The properties PRD 11 names ("Properties the tests assert"), over generated claims priced under the
 * SYNTHETIC release 900002 (2025 and 2026 fee schedules): expected allowed is non-negative and finite;
 * doubling units doubles the base (PRC-17, percent of Medicare; fixed schedules arrive in milestone 7);
 * turning a flag off never lowers the amount (PRC-18); the one rounding moves the amount by less than
 * a cent; the trace recomputes; the engine is deterministic; every phase-one reason comes from at
 * least one fixture; and the dispute deadline is never before the date it is measured from, while
 * passing it never changes the amount.
 */
const release = syntheticRelease(900002);
const CODES = ['97110', '97112', '97116', '97140', '97530', '97161', '97026', '97035', 'G0283', '97750'] as const;
const FLAGS = ['apply_mppr', 'apply_assistant_reduction', 'apply_sequestration'] as const;

/** Decimal text with up to four places from an integer count of ten-thousandths (1 is 0.0001). */
const percentText = (tenThousandths: number) => `${String(Math.floor(tenThousandths / 10000))}.${String(tenThousandths % 10000).padStart(4, '0')}`;

const generatedLine = fc.record({
  procedureCode: fc.constantFrom(...CODES),
  units: fc.integer({ min: 1, max: 4 }),
  modifiers: fc.subarray(['GP', 'CQ', 'CO', '59'] as const),
  placeOfService: fc.constantFrom('11', '22'),
  share: fc.bigInt({ min: 0n, max: 15000n }),
  day: fc.integer({ min: 0, max: 2 }),
});

const generatedTerms = fc.record({
  percentage: fc.integer({ min: 1, max: 3_000_000 }).map(percentText),
  yearBasis: fc.constantFrom('CURRENT' as const, 'LOCKED:2025' as const),
  conversionFactor: fc.constantFrom('non_qualifying_apm' as const, 'qualifying_apm' as const),
  flags: fc.record({
    apply_mppr: fc.boolean(),
    apply_assistant_reduction: fc.boolean(),
    apply_sequestration: fc.boolean(),
    apply_ncci: fc.boolean(),
    timed_units_rule: fc.constantFrom('MEDICARE_POOLED' as const, 'PER_CODE' as const, 'UNKNOWN' as const),
  }),
  rounding: fc.constantFrom(null, ...ROUNDING_RULES),
});

type GeneratedLine = typeof generatedLine extends fc.Arbitrary<infer T> ? T : never;
type GeneratedTerms = typeof generatedTerms extends fc.Arbitrary<infer T> ? T : never;

const generatedClaim = fc.record({
  lines: fc.array(generatedLine, { minLength: 1, maxLength: 6 }),
  /** Null prices the claim as Medicare Advantage non-contracted. */
  terms: fc.option(generatedTerms, { nil: null }),
  defaultRounding: fc.constantFrom(null, ...ROUNDING_RULES),
});

type GeneratedClaim = typeof generatedClaim extends fc.Arbitrary<infer T> ? T : never;

function termsOf(terms: GeneratedTerms): RateRecordTerms {
  return percentTerms({ percentage: terms.percentage, yearBasis: terms.yearBasis, conversionFactor: terms.conversionFactor, flags: terms.flags, rounding: terms.rounding, codes: [...CODES] });
}

function factsOf(line: GeneratedLine, index: number, agreement: AgreementInput, units = line.units): LineFacts {
  return lineFacts({
    lineNo: index + 1,
    procedureCode: line.procedureCode,
    units: String(units),
    modifiers: [...line.modifiers],
    placeOfService: line.placeOfService,
    serviceDate: addDays('2026-03-10', line.day),
    patientShareAdjustments: line.share === 0n ? [] : [{ groupCode: 'PR', reasonCode: '2', amountCents: line.share as Cents }],
    agreement,
  });
}

function inputOf(claim: GeneratedClaim, options: { readonly terms?: RateRecordTerms; readonly unitsTimes?: number } = {}): PricingInput {
  const terms = options.terms ?? (claim.terms === null ? null : termsOf(claim.terms));
  const agreement = terms === null ? maAgreement() : contractAgreement({ terms });
  const lines = claim.lines.map((line, index) => factsOf(line, index, agreement, line.units * (options.unitsTimes ?? 1)));
  return pricingInput(release, lines, { settings: practiceSettings({ defaultRounding: claim.defaultRounding }) });
}

const priced = (results: readonly LinePricing[]) => results.filter((result): result is PricedLine => result.outcome === 'priced');
const json = (value: unknown) => JSON.stringify(value, (_key, item: unknown) => (typeof item === 'bigint' ? `${item.toString()}n` : item));

describe('properties of the engine (PRD 11)', () => {
  it('expected allowed is non-negative and finite, and the one rounding moves it by less than a cent', () => {
    let count = 0;
    fc.assert(
      fc.property(generatedClaim, (claim) => {
        for (const line of priced(price(inputOf(claim)))) {
          count += 1;
          expect(line.expectedAllowedCents >= 0n).toBe(true);
          expect(line.expectedUnroundedCents.greaterThanOrEqualTo(decimal(0n))).toBe(true);
          expect(line.expectedUnroundedCents.toString()).toMatch(/^\d+(?:\.\d+)?$/);
          expect(decimal(line.expectedAllowedCents).minus(line.expectedUnroundedCents).abs().lessThan(decimal(1n))).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
    // The generated claims price most of their lines; a generator that priced none would prove nothing.
    expect(count).toBeGreaterThan(300);
  });

  it('doubling the units doubles the base, line by line (PRC-17)', () => {
    fc.assert(
      fc.property(generatedClaim, (claim) => {
        const once = price(inputOf(claim));
        const twice = price(inputOf(claim, { unitsTimes: 2 }));
        expect(twice.map((line) => line.outcome)).toEqual(once.map((line) => line.outcome));
        once.forEach((line, index) => {
          const doubled = twice[index];
          if (line.outcome === 'priced' && doubled?.outcome === 'priced') {
            expect(doubled.baseCents.equals(line.baseCents.times(decimal(2n)))).toBe(true);
          }
        });
      }),
      { numRuns: 200 },
    );
  });

  it('turning an adjustment flag off never lowers the amount (PRC-18)', () => {
    fc.assert(
      fc.property(generatedClaim, generatedTerms, fc.constantFrom(...FLAGS), (claim, terms, flag) => {
        const on = termsOf({ ...terms, flags: { ...terms.flags, [flag]: true } });
        const off = termsOf({ ...terms, flags: { ...terms.flags, [flag]: false } });
        const withFlag = price(inputOf(claim, { terms: on }));
        const without = price(inputOf(claim, { terms: off }));
        withFlag.forEach((line, index) => {
          const other = without[index];
          expect(other?.outcome).toBe(line.outcome);
          if (line.outcome === 'priced' && other?.outcome === 'priced') {
            expect(other.expectedUnroundedCents.greaterThanOrEqualTo(line.expectedUnroundedCents), `${flag} line ${String(line.lineNo)}`).toBe(true);
            expect(other.expectedAllowedCents >= line.expectedAllowedCents).toBe(true);
          }
        });
      }),
      { numRuns: 300 },
    );
  });

  it('every trace recomputes to its line’s result (PRC-16)', () => {
    fc.assert(
      fc.property(generatedClaim, (claim) => {
        for (const line of price(inputOf(claim))) {
          const again = recompute(JSON.parse(JSON.stringify(line.trace)));
          expect(again.differences).toEqual([]);
          expect(again.outcome).toBe(line.outcome);
          if (again.outcome === 'priced' && line.outcome === 'priced') {
            expect(again.expectedAllowedCents).toBe(line.expectedAllowedCents);
            expect(again.expectedUnroundedCents.equals(line.expectedUnroundedCents)).toBe(true);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('is deterministic: the same input gives the same results and traces, run after run', () => {
    fc.assert(
      fc.property(generatedClaim, (claim) => {
        expect(json(price(inputOf(claim)))).toBe(json(price(inputOf(claim))));
      }),
      { numRuns: 100 },
    );
  });
});

describe('properties of the dispute window (PRD 11 step 8)', () => {
  const releases = { 900001: syntheticRelease(900001), 900003: syntheticRelease(900003) } as const;
  const generatedWindowClaim = fc.record({
    release: fc.constantFrom(900001 as const, 900003 as const),
    /** Null: Medicare Advantage non-contracted; else a contract, with its own dispute days or silent. */
    contract: fc.option(fc.record({ disputeDays: fc.option(fc.integer({ min: 1, max: 3650 }), { nil: null }) }), { nil: null }),
    serviceDay: fc.integer({ min: 0, max: 360 }),
    remittanceAfter: fc.option(fc.integer({ min: 0, max: 400 }), { nil: null }),
    asOfAfter: fc.integer({ min: -30, max: 4000 }),
    laterAsOf: fc.integer({ min: 1, max: 4000 }),
  });

  function windowInput(claim: typeof generatedWindowClaim extends fc.Arbitrary<infer T> ? T : never, asOfShift = 0): PricingInput {
    const serviceDate = addDays('2026-01-01', claim.serviceDay);
    const agreement =
      claim.contract === null
        ? maAgreement()
        : contractAgreement({ terms: percentTerms({ percentage: '110', codes: ['97110'] }), windows: { timely_filing_days: null, dispute_window_days: claim.contract.disputeDays, appeal_levels: [] } });
    const remittanceDate = claim.remittanceAfter === null ? null : addDays(serviceDate, claim.remittanceAfter);
    return pricingInput(releases[claim.release], [lineFacts({ serviceDate, agreement })], {
      claim: { remittanceDate },
      asOf: addDays(remittanceDate ?? serviceDate, claim.asOfAfter + asOfShift),
    });
  }

  it('ends no earlier than the date it is measured from, and is WINDOW_PASSED exactly when the triage date is after it', () => {
    let windows = 0;
    fc.assert(
      fc.property(generatedWindowClaim, (claim) => {
        const input = windowInput(claim);
        for (const line of priced(price(input))) {
          const window = line.trace.steps.window;
          expect(window).not.toBeNull();
          if (line.window.endsOn === null) {
            expect(line.window.status).toBe('NO_WINDOW');
            continue;
          }
          windows += 1;
          const from = window?.measured_from === 'date_of_service' ? input.claim.lines[0]?.serviceDate : input.claim.remittanceDate;
          expect(window?.from_date).toBe(from);
          expect(line.window.endsOn >= (from ?? '9999-12-31')).toBe(true);
          expect(line.window.status).toBe(input.asOf > line.window.endsOn ? 'WINDOW_PASSED' : 'OPEN');
        }
      }),
      { numRuns: 300 },
    );
    expect(windows).toBeGreaterThan(100);
  });

  it('never changes the amount when the window passes: the same claim judged later prices the same', () => {
    fc.assert(
      fc.property(generatedWindowClaim, (claim) => {
        const now = price(windowInput(claim));
        const later = price(windowInput(claim, claim.laterAsOf));
        expect(later.map((line) => line.outcome)).toEqual(now.map((line) => line.outcome));
        now.forEach((line, index) => {
          const other = later[index];
          if (line.outcome === 'priced' && other?.outcome === 'priced') {
            expect([other.expectedAllowedCents, other.expectedUnroundedCents.toString(), other.varianceCents, json(other.adjustments)]).toEqual([
              line.expectedAllowedCents,
              line.expectedUnroundedCents.toString(),
              line.varianceCents,
              json(line.adjustments),
            ]);
            expect(other.window.endsOn).toBe(line.window.endsOn);
          }
        });
      }),
      { numRuns: 200 },
    );
  });
});

describe('the reasons phase one produces', () => {
  const base = readRuleRelease(SYNTHETIC_RELEASES[900001]);
  const noLocality = releaseVariant(base, (records) => records.filter((record) => record.record_type !== 'locality_map'));
  const contract = mappingRecord({ kind: 'contract', contractVersionId: 'cv-synth-1' });
  const fixtures: readonly (readonly [string, PricingInput])[] = [
    ['NO_MAPPING', pricingInput(release, [lineFacts({ agreement: { outcome: 'NO_MAPPING' } })])],
    ['NO_AGREEMENT', pricingInput(release, [lineFacts({ agreement: { outcome: 'NO_AGREEMENT', mapping: mappingRecord({ kind: 'no_agreement' }) } })])],
    ['AMBIGUOUS_RATE', pricingInput(release, [lineFacts({ agreement: { outcome: 'AMBIGUOUS_RATE', mapping: contract, version: versionRecord(), rateRecordIds: ['rr-a', 'rr-b'] } })])],
    ['NO_RATE_FOR_CODE', pricingInput(release, [lineFacts({ agreement: { outcome: 'NO_RATE_FOR_CODE', mapping: contract, version: versionRecord() } })])],
    ['DATE_OUTSIDE_VERSIONS', pricingInput(release, [lineFacts({ agreement: { outcome: 'DATE_OUTSIDE_VERSIONS', mapping: contract } })])],
    ['NO_PFS_VALUE', pricingInput(release, [lineFacts({ procedureCode: '97750' })])],
    ['UNSUPPORTED_METHOD', pricingInput(release, [lineFacts({ agreement: contractAgreement({ terms: { ...percentTerms(), method: 'UNSUPPORTED', parameters: {} } }) })])],
    ['UNITS_RULE_UNKNOWN', pricingInput(release, [lineFacts({ agreement: contractAgreement({ terms: percentTerms({ flags: { timed_units_rule: 'UNKNOWN' } }) }) })])],
    ['SECONDARY_PAYER', pricingInput(release, [lineFacts()], { claim: { claimStatusCode: '2' } })],
    ['REVERSED_CLAIM', pricingInput(release, [lineFacts()], { claim: { claimStatusCode: '22' } })],
    ['ENGINE_ERROR', pricingInput(noLocality, [lineFacts()])],
  ];

  it('gives each phase-one reason for at least one fixture, and no reason of milestone 7', () => {
    const produced = fixtures.map(([expected, input]) => {
      const [result] = price(input);
      expect(result?.outcome === 'unpriced' && result.reason, expected).toBe(expected);
      return expected;
    });
    expect([...produced].sort()).toEqual([...PHASE_ONE_REASONS].sort());
  });
});
