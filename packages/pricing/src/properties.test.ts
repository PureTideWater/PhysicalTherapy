import type { RateRecordTerms } from '@tp/contracts';
import { type Cents, ROUNDING_RULES, decimal } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { addDays } from './dates';
import { price } from './engine';
import { UNPRICED_REASONS } from './reasons';
import { recompute } from './recompute';
import { indexRelease } from './release';
import {
  type AdjustmentOption,
  SYNTHETIC_RELEASES,
  contractAgreement,
  fixedTerms,
  lesserOfTerms,
  lineFacts,
  maAgreement,
  mappingRecord,
  perVisitTerms,
  percentTerms,
  practiceSettings,
  pricingInput,
  readRuleRelease,
  releaseVariant,
  ruleRecordLike,
  syntheticRelease,
  versionRecord,
} from './testing';
import type { AgreementInput, LineFacts, LinePricing, PricedLine, PricingInput } from './types';

/**
 * The properties PRD 11 names ("Properties the tests assert"), over generated claims priced under the
 * SYNTHETIC release 900002 (2025 and 2026 fee schedules), with Medicare Advantage terms or contract terms of
 * every method that prices, every flag on or off, and a contract adjustment or none: expected allowed is
 * non-negative and finite; doubling units doubles the base for fixed and percent methods (PRC-17); turning a
 * flag off never lowers the amount (PRC-18); a per-visit claim's total does not depend on the order or the
 * numbers of its lines; a lesser-of base never exceeds the schedule or the charge; the one rounding moves the
 * amount by less than a cent; the trace recomputes; the engine is deterministic; every reason comes from at
 * least one fixture; and the dispute deadline is never before the date it is measured from, while passing it
 * never changes the amount.
 */
const release = syntheticRelease(900002);
const CODES = ['97110', '97112', '97116', '97140', '97530', '97161', '97026', '97035', 'G0283', '97750'] as const;
const FLAGS = ['apply_mppr', 'apply_assistant_reduction', 'apply_sequestration', 'apply_ncci'] as const;
const METHODS = ['PERCENT_OF_MEDICARE', 'FIXED_SCHEDULE', 'LESSER_OF_FIXED', 'LESSER_OF_PERCENT', 'PER_VISIT'] as const;
type GeneratedMethod = (typeof METHODS)[number];

/** Decimal text with up to four places from an integer count of ten-thousandths (1 is 0.0001). */
const percentText = (tenThousandths: number) => `${String(Math.floor(tenThousandths / 10000))}.${String(tenThousandths % 10000).padStart(4, '0')}`;

const generatedLine = fc.record({
  procedureCode: fc.constantFrom(...CODES),
  units: fc.integer({ min: 1, max: 4 }),
  modifiers: fc.subarray(['GP', 'CQ', 'CO', '59', 'XS'] as const),
  placeOfService: fc.constantFrom('11', '22'),
  share: fc.bigInt({ min: 0n, max: 15000n }),
  charge: fc.bigInt({ min: 0n, max: 30000n }),
  day: fc.integer({ min: 0, max: 2 }),
});

const generatedAdjustment: fc.Arbitrary<AdjustmentOption | undefined> = fc.option(
  fc.oneof(
    fc.record({ kind: fc.constant('PERCENT' as const), percent: fc.integer({ min: 1, max: 2_000_000 }).map(percentText) }),
    fc.record({ kind: fc.constant('CAP' as const), capCents: fc.bigInt({ min: 0n, max: 20000n }) }),
  ),
  { nil: undefined },
);

const generatedTerms = fc.record({
  method: fc.constantFrom(...METHODS),
  amount: fc.bigInt({ min: 0n, max: 20000n }),
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
  adjustment: generatedAdjustment,
});

type GeneratedLine = typeof generatedLine extends fc.Arbitrary<infer T> ? T : never;
type GeneratedTerms = typeof generatedTerms extends fc.Arbitrary<infer T> ? T : never;

const claimOf = (terms: fc.Arbitrary<GeneratedTerms | null>) =>
  fc.record({
    lines: fc.array(generatedLine, { minLength: 1, maxLength: 6 }),
    /** Null prices the claim as Medicare Advantage non-contracted. */
    terms,
    defaultRounding: fc.constantFrom(null, ...ROUNDING_RULES),
  });
const generatedClaim = claimOf(fc.option(generatedTerms, { nil: null }));

type GeneratedClaim = typeof generatedClaim extends fc.Arbitrary<infer T> ? T : never;

/** Generated terms of one method. */
const termsWith = (...methods: GeneratedMethod[]) => generatedTerms.chain((terms) => fc.constantFrom(...methods).map((method) => ({ ...terms, method })));

/** The rate-record terms the generated terms describe; the reduction only where a fee schedule has a practice-expense part. */
function termsOf(terms: GeneratedTerms): RateRecordTerms {
  const percent = { percentage: terms.percentage, yearBasis: terms.yearBasis, conversionFactor: terms.conversionFactor };
  const options = { flags: { ...terms.flags, apply_mppr: terms.flags.apply_mppr && terms.method === 'PERCENT_OF_MEDICARE' }, rounding: terms.rounding, codes: [...CODES], adjustment: terms.adjustment };
  switch (terms.method) {
    case 'PERCENT_OF_MEDICARE':
      return percentTerms({ ...percent, ...options });
    case 'FIXED_SCHEDULE':
      return fixedTerms(terms.amount, options);
    case 'LESSER_OF_FIXED':
      return lesserOfTerms({ fixedCents: terms.amount }, options);
    case 'LESSER_OF_PERCENT':
      return lesserOfTerms(percent, options);
    case 'PER_VISIT':
      return perVisitTerms(terms.amount, options);
  }
}

function factsOf(line: GeneratedLine, index: number, agreement: AgreementInput, units = line.units, lineNo = index + 1): LineFacts {
  return lineFacts({
    lineNo,
    procedureCode: line.procedureCode,
    units: String(units),
    modifiers: [...line.modifiers],
    placeOfService: line.placeOfService,
    serviceDate: addDays('2026-03-10', line.day),
    chargeCents: line.charge as Cents,
    patientShareAdjustments: line.share === 0n ? [] : [{ groupCode: 'PR', reasonCode: '2', amountCents: line.share as Cents }],
    agreement,
  });
}

interface InputOptions {
  readonly terms?: RateRecordTerms;
  readonly unitsTimes?: number;
  /** The line numbers to give the lines, in their order (a permutation of 1..n). */
  readonly lineNos?: readonly number[];
}

function inputOf(claim: GeneratedClaim, options: InputOptions = {}): PricingInput {
  const terms = options.terms ?? (claim.terms === null ? null : termsOf(claim.terms));
  const agreement = terms === null ? maAgreement() : contractAgreement({ terms });
  const lines = claim.lines.map((line, index) => factsOf(line, index, agreement, line.units * (options.unitsTimes ?? 1), options.lineNos?.[index] ?? index + 1));
  return pricingInput(release, lines, { settings: practiceSettings({ defaultRounding: claim.defaultRounding }) });
}

const priced = (results: readonly LinePricing[]) => results.filter((result): result is PricedLine => result.outcome === 'priced');
/** The lines that carry a per-visit amount (a visit's carrier), by line number. */
const visitCarriers = (results: readonly LinePricing[]) => priced(results).flatMap((line) => (line.trace.steps.per_visit?.carrier_line_no === line.lineNo ? [line.lineNo] : []));
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

  it('doubling the units doubles the base, line by line, for fixed and percent methods (PRC-17)', () => {
    let doubled = 0;
    fc.assert(
      fc.property(claimOf(fc.option(termsWith('PERCENT_OF_MEDICARE', 'FIXED_SCHEDULE'), { nil: null })), (claim) => {
        const once = price(inputOf(claim));
        const twice = price(inputOf(claim, { unitsTimes: 2 }));
        once.forEach((line, index) => {
          const other = twice[index];
          if (line.outcome === 'priced' && other?.outcome === 'priced') {
            doubled += 1;
            expect(other.baseCents.equals(line.baseCents.times(decimal(2n)))).toBe(true);
          } else if (line.outcome !== other?.outcome) {
            // Doubling can only push a line over its medically unlikely edit.
            expect(line.outcome === 'priced' && other?.outcome === 'unpriced' && other.reason).toBe('MUE_EXCEEDED');
          }
        });
      }),
      { numRuns: 200 },
    );
    expect(doubled).toBeGreaterThan(100);
  });

  it('turning a flag off never lowers the amount, line by line for the Medicare adjustments and claim-wide for every flag, nor unprices a line (PRC-18), but where NCCI moves a visit (Q44)', () => {
    let visitClaimsHeld = 0;
    let carriersMoved = 0;
    fc.assert(
      fc.property(generatedClaim, generatedTerms, fc.constantFrom(...FLAGS), (claim, terms, flag) => {
        const on = termsOf({ ...terms, flags: { ...terms.flags, [flag]: true } });
        const off = termsOf({ ...terms, flags: { ...terms.flags, [flag]: false } });
        const withFlag = price(inputOf(claim, { terms: on }));
        const without = price(inputOf(claim, { terms: off }));
        let totalOn = decimal(0n);
        let totalOff = decimal(0n);
        withFlag.forEach((line, index) => {
          const other = without[index];
          if (line.outcome === 'priced') {
            expect(other?.outcome, `${flag} line ${String(line.lineNo)}`).toBe('priced');
            totalOn = totalOn.plus(line.expectedUnroundedCents);
          } else if (other?.outcome !== 'unpriced' || other.reason !== line.reason) {
            // Only the medically unlikely edit, which NCCI turns on, gives a line a reason it would not have with the flag off.
            expect([flag, line.reason]).toEqual(['apply_ncci', 'MUE_EXCEEDED']);
          }
          if (other?.outcome === 'priced') {
            totalOff = totalOff.plus(other.expectedUnroundedCents);
          }
          // Line by line for the Medicare adjustments. NCCI changes no amount but can stop a line, which then holds
          // neither the day's whole unit nor the visit (QUESTIONS Q42, Q44): for it the claim's total is compared.
          if (flag !== 'apply_ncci' && line.outcome === 'priced' && other?.outcome === 'priced') {
            expect(other.expectedUnroundedCents.greaterThanOrEqualTo(line.expectedUnroundedCents), `${flag} line ${String(line.lineNo)}`).toBe(true);
            expect(other.expectedAllowedCents >= line.expectedAllowedCents).toBe(true);
          }
        });
        // The claim-wide total holds for every method and flag, with one exception the specialist rules on
        // (QUESTIONS Q44, G146): turning NCCI on can stop the line carrying a per-visit amount for its MUE, and
        // the visit passes to the next line, under that line's own patient share and modifiers. Exactly then
        // (the visits' carriers differ) the total is not compared; nothing else is left out.
        if (json(visitCarriers(withFlag)) === json(visitCarriers(without))) {
          expect(totalOff.greaterThanOrEqualTo(totalOn), `${flag} ${on.method}`).toBe(true);
          if (on.method === 'PER_VISIT' && flag === 'apply_ncci') {
            visitClaimsHeld += 1;
          }
        } else {
          // Only the medically unlikely edit, which NCCI turns on, can move a visit.
          expect([flag, on.method]).toEqual(['apply_ncci', 'PER_VISIT']);
          carriersMoved += 1;
        }
      }),
      { numRuns: 400 },
    );
    // The per-visit claims under NCCI are compared too, apart from the moved visits.
    expect(visitClaimsHeld).toBeGreaterThan(0);
    expect(carriersMoved).toBeLessThan(400);
  });

  it('the one known departure from PRC-18, pending the specialist (QUESTIONS Q44): NCCI stops the visit carrier, and the next line carries the visit under its own patient share', () => {
    // A per-visit claim of one date: 97161 x2 (its SYNTHETIC MUE allows 1) with no patient share, then 97110 x1
    // with a one-cent patient share; a visit of one cent with sequestration on.
    const visit = (ncci: boolean) =>
      perVisitTerms(1n, { codes: [...CODES], flags: { apply_mppr: false, apply_assistant_reduction: false, apply_sequestration: true, apply_ncci: ncci, timed_units_rule: 'MEDICARE_POOLED' } });
    const lines = (terms: RateRecordTerms) => [
      lineFacts({ lineNo: 1, procedureCode: '97161', units: '2', modifiers: [], placeOfService: '11', serviceDate: '2026-03-10', agreement: contractAgreement({ terms }) }),
      lineFacts({
        lineNo: 2,
        procedureCode: '97110',
        units: '1',
        modifiers: [],
        placeOfService: '11',
        serviceDate: '2026-03-10',
        patientShareAdjustments: [{ groupCode: 'PR', reasonCode: '2', amountCents: 1n as Cents }],
        agreement: contractAgreement({ terms }),
      }),
    ];
    const total = (results: readonly LinePricing[]) => priced(results).reduce((sum, line) => sum.plus(line.expectedUnroundedCents), decimal(0n));
    const on = price(pricingInput(release, lines(visit(true))));
    const off = price(pricingInput(release, lines(visit(false))));
    expect(on.map((line) => (line.outcome === 'priced' ? line.trace.steps.per_visit?.carrier_line_no : line.reason))).toEqual(['MUE_EXCEEDED', 2]);
    expect(off.map((line) => (line.outcome === 'priced' ? line.trace.steps.per_visit?.carrier_line_no : line.reason))).toEqual([1, 1]);
    // With NCCI on, the carrier's patient share leaves nothing to sequester; off, the first line has none and pays sequestration.
    expect(total(on).greaterThan(total(off))).toBe(true);
    expect([total(on).toString(), total(off).toString()]).toEqual(['1', '0.97']);
  });

  it('a per-visit claim’s total does not depend on the order of its lines or their numbers, one amount per date', () => {
    const visitClaim = claimOf(termsWith('PER_VISIT').map((terms) => ({ ...terms, flags: { ...terms.flags, apply_assistant_reduction: false, apply_sequestration: false } })));
    fc.assert(
      fc.property(
        visitClaim.chain((claim) => fc.tuple(fc.constant(claim), fc.shuffledSubarray(claim.lines.map((_, index) => index + 1), { minLength: claim.lines.length, maxLength: claim.lines.length }))),
        ([claim, lineNos]) => {
          const total = (results: readonly LinePricing[]) => priced(results).reduce((sum, line) => sum.plus(line.expectedUnroundedCents), decimal(0n)).toString();
          const listed = price(inputOf(claim));
          const reversed = price({ ...inputOf(claim), claim: { ...inputOf(claim).claim, lines: [...inputOf(claim).claim.lines].reverse() } });
          expect(json(reversed)).toBe(json(listed));
          expect(total(price(inputOf(claim, { lineNos })))).toBe(total(listed));
          // At most one line of each date carries a visit.
          const dates = priced(listed).filter((line) => !line.baseCents.isZero()).map((line) => line.trace.line.service_date);
          expect(new Set(dates).size).toBe(dates.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('a lesser-of base never exceeds the schedule for the units or the line charge, and is one of them', () => {
    let lines = 0;
    fc.assert(
      fc.property(claimOf(termsWith('LESSER_OF_FIXED', 'LESSER_OF_PERCENT')), (claim) => {
        for (const line of priced(price(inputOf(claim)))) {
          lines += 1;
          const units = line.trace.steps.units;
          const schedule = decimal(units?.schedule_cents ?? 'x');
          const charge = decimal(units?.charge_cents ?? 'x');
          expect(line.baseCents.lessThanOrEqualTo(schedule) && line.baseCents.lessThanOrEqualTo(charge)).toBe(true);
          expect(line.baseCents.equals(schedule) || line.baseCents.equals(charge)).toBe(true);
          expect(charge.equals(decimal(line.trace.line.charge_cents))).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
    expect(lines).toBeGreaterThan(100);
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

describe('properties of the ZIP+4 (PRC-21; docs/adr/0064)', () => {
  const plusFourBase = readRuleRelease('fixtures/synthetic/rules/release-synth-900006');
  const releases = { 900002: release, 900006: indexRelease(plusFourBase) } as const;
  /** 900006 with 00011 placed in locality 02: what 00012 with a ZIP+4 of 5000-8999 must price as. */
  const inLocality02 = releaseVariant(plusFourBase, (records) =>
    records.map((record) => (record.record_type === 'locality_map' && record.key.zip === '00011' ? ruleRecordLike(record, { value: { ...record.value, locality: '02' } }) : record)),
  );
  const code = fc.integer({ min: 0, max: 9999 }).map((value) => String(value).padStart(4, '0'));
  const settingsOf = (claim: GeneratedClaim, zip: string, zipPlusFour?: string) =>
    practiceSettings({ zip, defaultRounding: claim.defaultRounding, ...(zipPlusFour === undefined ? {} : { zipPlusFour }) });
  const outcomes = (results: readonly LinePricing[]) =>
    json(results.map((line) => (line.outcome === 'priced' ? [line.expectedAllowedCents, line.expectedUnroundedCents.toString(), line.adjustments, line.reviewFlags] : [line.reason, line.detail])));

  it('prices a ZIP that does not need its ZIP+4 the same with no ZIP+4 and with any four digits; the traces differ only by the settings’ ZIP+4', () => {
    fc.assert(
      fc.property(generatedClaim, fc.constantFrom(900002 as const, 900006 as const), fc.constantFrom('00011', '00099'), code, (claim, number, zip, plusFour) => {
        const input = inputOf(claim);
        const without = price({ ...input, release: releases[number], settings: settingsOf(claim, zip) });
        const given = price({ ...input, release: releases[number], settings: settingsOf(claim, zip, plusFour) });
        expect(outcomes(given)).toBe(outcomes(without));
        given.forEach((line, index) => {
          const other = without[index];
          expect(line.trace.settings.zip_plus_four).toBe(plusFour);
          expect(json({ ...line.trace, settings: other?.trace.settings })).toBe(json(other?.trace));
          expect('zip_plus_four' in (other?.trace.settings ?? {})).toBe(false);
        });
      }),
      { numRuns: 200 },
    );
  });

  it('prices 00012 with a ZIP+4 at the locality of the range holding it, and stops a code no range holds, never a neighbour’s locality', () => {
    let listed = 0;
    let unlisted = 0;
    fc.assert(
      fc.property(generatedClaim, code, (claim, plusFour) => {
        const input = { ...inputOf(claim), release: releases[900006] };
        const split = price({ ...input, settings: settingsOf(claim, '00012', plusFour) });
        if (plusFour >= '9000') {
          unlisted += 1;
          // Every line that reads the fee schedule stops there; the others price as for any ZIP.
          const whole = price({ ...input, settings: settingsOf(claim, '00011') });
          split.forEach((line, index) => {
            const other = whole[index] as LinePricing;
            if ((other.trace.steps.fee_schedule?.locality ?? null) !== null) {
              expect(line.outcome === 'unpriced' && `${line.reason} ${String(line.detail)}`).toBe('ENGINE_ERROR zip_plus_four_not_in_locality_map');
            } else {
              expect(outcomes([line])).toBe(outcomes([other]));
            }
          });
          return;
        }
        listed += 1;
        const expected = price({ ...input, release: plusFour < '5000' ? releases[900006] : inLocality02, settings: settingsOf(claim, '00011') });
        expect(outcomes(split)).toBe(outcomes(expected));
        for (const line of split) {
          expect(recompute(JSON.parse(JSON.stringify(line.trace))).differences).toEqual([]);
        }
      }),
      { numRuns: 300 },
    );
    expect(listed).toBeGreaterThan(100);
    expect(unlisted).toBeGreaterThan(0);
  });

  it('keeps every five-digit input on phase-two/1’s path: no ZIP+4 key in the settings and no ZIP+4 step, and 00012 stops as before', () => {
    fc.assert(
      fc.property(generatedClaim, fc.constantFrom('00011', '00012', '00099'), (claim, zip) => {
        for (const line of price({ ...inputOf(claim), release: releases[900006], settings: settingsOf(claim, zip) })) {
          expect(Object.keys(line.trace.settings)).toEqual(['zip', 'default_rounding', 'place_of_service_settings']);
          const locality = line.trace.steps.fee_schedule?.locality ?? null;
          if (locality !== null) {
            expect(Object.keys(locality)).toEqual(['record', 'carrier', 'locality', 'plus_four_required']);
          }
          if (zip === '00012' && locality !== null) {
            expect(line.outcome === 'unpriced' && line.detail).toBe('locality_needs_zip_plus_four');
          }
        }
      }),
      { numRuns: 150 },
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

describe('the reasons the engine produces', () => {
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
    ['MUE_EXCEEDED', pricingInput(release, [lineFacts({ units: '8' })])],
    ['SECONDARY_PAYER', pricingInput(release, [lineFacts()], { claim: { claimStatusCode: '2' } })],
    ['REVERSED_CLAIM', pricingInput(release, [lineFacts()], { claim: { claimStatusCode: '22' } })],
    ['ENGINE_ERROR', pricingInput(noLocality, [lineFacts()])],
  ];

  it('gives every reason of the closed list for at least one fixture', () => {
    const produced = fixtures.map(([expected, input]) => {
      const [result] = price(input);
      expect(result?.outcome === 'unpriced' && result.reason, expected).toBe(expected);
      return expected;
    });
    expect([...produced].sort()).toEqual([...UNPRICED_REASONS].sort());
  });
});
