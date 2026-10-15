import { parseRateTerms } from '@tp/contracts';
import { describe, expect, it } from 'vitest';

import { modifierSets, termsFromForm } from './terms-form';

describe('a rate record from the specialist’s form', () => {
  it('reads a fixed schedule in dollars as integer cents, flags off unless ticked, rounding silent unless chosen', () => {
    const result = termsFromForm({ method: 'FIXED_SCHEDULE', codes: '97110, 97140', modifierSets: 'GP; gp 59; none', placesOfService: '11 22', amount: '$1,032.50' });
    expect(result).toEqual({
      ok: true,
      terms: {
        scope: { codes: ['97110', '97140'], modifier_sets: [['GP'], ['GP', '59'], []], places_of_service: ['11', '22'] },
        method: 'FIXED_SCHEDULE',
        parameters: { amount_cents: '103250' },
        flags: { apply_mppr: false, apply_assistant_reduction: false, apply_sequestration: false, apply_ncci: false, timed_units_rule: 'UNKNOWN' },
        rounding: null,
      },
    });
    expect(result.ok && parseRateTerms(result.terms, true).method).toBe('FIXED_SCHEDULE');
  });

  it('reads percent of Medicare with its year, locality and conversion factor, and the flags the contract incorporates', () => {
    const result = termsFromForm({
      method: 'PERCENT_OF_MEDICARE',
      codes: '97110',
      percentage: '110%',
      yearBasis: 'LOCKED',
      lockedYear: '2025',
      localityBasis: 'NAMED',
      carrier: '11502',
      locality: '00',
      conversionFactor: 'qualifying_apm',
      applyMppr: 'on',
      applyAssistantReduction: 'on',
      applySequestration: 'true',
      applyNcci: 'on',
      timedUnitsRule: 'MEDICARE_POOLED',
      rounding: 'HALF_EVEN_CENT',
      scopeFrom: '2026-01-01',
      scopeLastDay: '2026-12-31',
    });
    expect(result.ok && result.terms).toEqual({
      scope: { codes: ['97110'], effective_from: '2026-01-01', effective_to: '2027-01-01' },
      method: 'PERCENT_OF_MEDICARE',
      parameters: { percentage: '110', year_basis: 'LOCKED:2025', locality_basis: { kind: 'NAMED', carrier: '11502', locality: '00' }, conversion_factor: 'qualifying_apm' },
      flags: { apply_mppr: true, apply_assistant_reduction: true, apply_sequestration: true, apply_ncci: true, timed_units_rule: 'MEDICARE_POOLED' },
      rounding: 'HALF_EVEN_CENT',
    });
    expect(result.ok && parseRateTerms(result.terms, true).method).toBe('PERCENT_OF_MEDICARE');
  });

  it('reads the lesser-of schedule as an amount or a percentage, a per-visit amount, and an unsupported method', () => {
    const fixed = termsFromForm({ method: 'LESSER_OF', codes: '97110', amount: '40' });
    expect(fixed.ok && fixed.terms.parameters).toEqual({ schedule: { method: 'FIXED_SCHEDULE', amount_cents: '4000' }, charge_basis: 'LINE_CHARGE' });
    const percent = termsFromForm({ method: 'LESSER_OF', codes: '97110', scheduleMethod: 'PERCENT_OF_MEDICARE', percentage: '120' });
    expect(percent.ok && percent.terms.parameters).toEqual({
      schedule: { method: 'PERCENT_OF_MEDICARE', percentage: '120', year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' },
      charge_basis: 'LINE_CHARGE',
    });
    const perVisit = termsFromForm({ method: 'PER_VISIT', codes: '97110 97140', amount: '95.00' });
    expect(perVisit.ok && perVisit.terms.parameters).toEqual({ amount_cents: '9500' });
    const unsupported = termsFromForm({ method: 'UNSUPPORTED', codes: '97110' });
    expect(unsupported.ok && unsupported.terms.parameters).toEqual({});
    for (const result of [fixed, percent, perVisit, unsupported]) {
      expect(result.ok && parseRateTerms(result.terms, true).scope.codes[0]).toBe('97110');
    }
  });

  it('names the field of every problem: an amount with three places or below zero, a date, an unknown method', () => {
    expect(termsFromForm({ method: 'FIXED_SCHEDULE', codes: '97110', amount: '32.005' })).toEqual({ ok: false, issues: [{ field: 'amount', message: 'dollars and cents, such as 32.00' }] });
    expect(termsFromForm({ method: 'PER_VISIT', codes: '97110', amount: '-1.00' })).toEqual({ ok: false, issues: [{ field: 'amount', message: 'an amount of zero or more' }] });
    expect(termsFromForm({ method: 'LESSER_OF', codes: '97110', amount: 'x' })).toEqual({ ok: false, issues: [{ field: 'amount', message: 'dollars and cents, such as 32.00' }] });
    expect(termsFromForm({ method: 'UNSUPPORTED', codes: '97110', scopeFrom: '2026-1-1', scopeLastDay: 'soon' })).toEqual({
      ok: false,
      issues: [
        { field: 'scopeFrom', message: 'a date (YYYY-MM-DD)' },
        { field: 'scopeLastDay', message: 'a date (YYYY-MM-DD)' },
      ],
    });
    expect(termsFromForm({ method: 'CAPITATION', codes: '97110' })).toEqual({ ok: false, issues: [{ field: 'method', message: 'one of the rate methods' }] });
  });

  it('reads no modifier sets as any modifiers', () => {
    expect(modifierSets(undefined)).toBeUndefined();
    expect(modifierSets(' ; ')).toBeUndefined();
  });
});
