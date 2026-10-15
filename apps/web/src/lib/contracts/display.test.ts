import { MA_NONCONTRACTED_FLAGS, parseRateTerms } from '@tp/contracts';
import { describe, expect, it } from 'vitest';

import { EVIDENCE_PROBLEM_TEXT, describeTerms, exclusiveEnd, windowText } from './display';

describe('contract words', () => {
  it('shows a half-open window with its last day, and stores a last day as the next day', () => {
    expect(windowText('2026-01-01', '2027-01-01')).toBe('2026-01-01 through 2026-12-31');
    expect(windowText('2026-01-01', null)).toBe('from 2026-01-01, open-ended');
    expect(exclusiveEnd('2026-12-31')).toBe('2027-01-01');
    expect(exclusiveEnd('2028-02-28')).toBe('2028-02-29');
    expect(exclusiveEnd(undefined)).toBeNull();
  });

  it('describes each field of a fixed schedule, from cents without a float', () => {
    const terms = parseRateTerms({ scope: { codes: ['97110', '97140'], modifier_sets: [['GP'], []], places_of_service: ['11'] }, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '3250' } }, true);
    expect(describeTerms(terms)).toEqual({
      scope: 'Codes 97110, 97140; modifiers GP or none; places of service 11',
      method: 'Fixed schedule',
      parameters: '$32.50 per unit',
      flags: 'MPPR off, assistant reduction off, sequestration off, NCCI off; timed units unknown until the contract says or minutes are imported',
      rounding: 'The contract is silent: the practice’s default rounding applies',
    });
  });

  it('describes percent of Medicare, lesser-of, per-visit and unsupported terms', () => {
    const percent = parseRateTerms(
      {
        scope: { codes: ['97110'], provider_types: ['PT'], effective_from: '2026-01-01', effective_to: '2026-07-01' },
        method: 'PERCENT_OF_MEDICARE',
        parameters: { percentage: '112.5', year_basis: 'LOCKED:2025', locality_basis: { kind: 'NAMED', carrier: '11502', locality: '00' }, conversion_factor: 'qualifying_apm' },
        flags: MA_NONCONTRACTED_FLAGS,
        rounding: 'TRUNCATE',
      },
      true,
    );
    expect(describeTerms(percent)).toMatchObject({
      scope: 'Codes 97110; any modifiers; any place of service; provider types PT; service dates 2026-01-01 through 2026-06-30',
      parameters: '112.5% of Medicare: the 2025 fee schedule, carrier 11502, locality 00, the qualifying APM conversion factor',
      flags: 'MPPR on, assistant reduction on, sequestration on, NCCI on; timed units pooled as Medicare counts them',
      rounding: 'Truncated to the cent',
    });
    const lesser = parseRateTerms(
      { scope: { codes: ['97110'], effective_to: '2027-01-01' }, method: 'LESSER_OF', parameters: { schedule: { method: 'FIXED_SCHEDULE', amount_cents: '4000' }, charge_basis: 'LINE_CHARGE' }, rounding: 'HALF_UP_CENT' },
      true,
    );
    expect(describeTerms(lesser)).toMatchObject({ scope: 'Codes 97110; any modifiers; any place of service; service dates the version’s start through 2026-12-31', parameters: 'The lesser of the line’s billed charge and $40.00 per unit', rounding: 'Half up to the cent' });
    const lesserPercent = parseRateTerms(
      {
        scope: { codes: ['97110'] },
        method: 'LESSER_OF',
        parameters: { schedule: { method: 'PERCENT_OF_MEDICARE', percentage: '100', year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' }, charge_basis: 'LINE_CHARGE' },
        rounding: 'HALF_EVEN_CENT',
        flags: { timed_units_rule: 'PER_CODE' },
      },
      true,
    );
    expect(describeTerms(lesserPercent)).toMatchObject({
      parameters: 'The lesser of the line’s billed charge and 100% of Medicare: the fee schedule in effect on the date of service, the practice’s locality, the non-qualifying conversion factor',
      flags: 'MPPR off, assistant reduction off, sequestration off, NCCI off; timed units counted per code',
      rounding: 'Half even to the cent',
    });
    expect(describeTerms(parseRateTerms({ scope: { codes: ['97110'] }, method: 'PER_VISIT', parameters: { amount_cents: '9500' } }, true)).parameters).toBe('$95.00 once per claim and date');
    expect(describeTerms(parseRateTerms({ scope: { codes: ['97110'] }, method: 'UNSUPPORTED', parameters: {} }, true))).toMatchObject({ method: 'Unsupported (capitation or undefined case rate)', parameters: 'None' });
  });

  it('words every evidence problem', () => {
    expect(Object.keys(EVIDENCE_PROBLEM_TEXT)).toHaveLength(8);
  });
});
