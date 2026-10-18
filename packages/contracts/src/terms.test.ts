import { centsToString, decimal } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  COMMERCIAL_DEFAULT_FLAGS,
  MA_NONCONTRACTED_FLAGS,
  MA_NONCONTRACTED_TERMS,
  RATE_RECORD_FIELDS,
  appealLevelsSchema,
  citationSchema,
  evidenceSchema,
  parseRateTerms,
  rateTermsToJson,
} from './terms';

const SCOPE = { codes: ['97110', '97140'] };
const HASH = 'a'.repeat(64);
const DOC = '00000000-0000-4000-8000-000000000001';

describe('rate record terms', () => {
  it('defaults a commercial record’s Medicare flags to off and its timed-units rule to UNKNOWN (PRD 20)', () => {
    const terms = parseRateTerms({ scope: SCOPE, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '3200' } }, true);
    expect(terms.flags).toEqual(COMMERCIAL_DEFAULT_FLAGS);
    expect(terms.rounding).toBeNull();
    const partly = parseRateTerms({ scope: SCOPE, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '3200' }, flags: { apply_mppr: true }, rounding: 'TRUNCATE' }, true);
    expect(partly.flags).toEqual({ ...COMMERCIAL_DEFAULT_FLAGS, apply_mppr: true });
    expect(partly.rounding).toBe('TRUNCATE');
  });

  it('turns every Medicare adjustment on for Medicare Advantage non-contracted lines, as Original Medicare would price them', () => {
    expect(MA_NONCONTRACTED_FLAGS).toEqual({ apply_mppr: true, apply_assistant_reduction: true, apply_sequestration: true, apply_ncci: true, timed_units_rule: 'MEDICARE_POOLED' });
    expect(MA_NONCONTRACTED_TERMS.method).toBe('PERCENT_OF_MEDICARE');
    expect(MA_NONCONTRACTED_TERMS.parameters.percentage.equals(decimal(100n))).toBe(true);
    expect(MA_NONCONTRACTED_TERMS.parameters).toMatchObject({ year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' });
    expect(Object.isFrozen(MA_NONCONTRACTED_TERMS)).toBe(true);
  });

  it('takes a scope that names no codes as a general term for every code, and writes it back without codes', () => {
    const general = parseRateTerms({ scope: { places_of_service: ['11'] }, method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '110', year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' } }, true);
    expect(general.scope).toEqual({ places_of_service: ['11'] });
    expect(rateTermsToJson(general).scope).toEqual({ places_of_service: ['11'] });
    expect(parseRateTerms({ scope: {}, method: 'UNSUPPORTED', parameters: {} }, true).scope).toEqual({});
  });

  it('requires stored terms to carry every flag', () => {
    expect(() => parseRateTerms({ scope: SCOPE, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '1' }, flags: { apply_mppr: false }, rounding: null })).toThrow();
    expect(parseRateTerms({ scope: SCOPE, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '1' }, flags: COMMERCIAL_DEFAULT_FLAGS, rounding: null }).flags).toEqual(COMMERCIAL_DEFAULT_FLAGS);
  });

  it('types each method’s parameters: cents as Cents, percentages as Decimal', () => {
    const fixed = parseRateTerms({ scope: SCOPE, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '3200' } }, true);
    expect(fixed.method === 'FIXED_SCHEDULE' && fixed.parameters.amount_cents).toBe(3200n);
    const percent = parseRateTerms(
      {
        scope: SCOPE,
        method: 'PERCENT_OF_MEDICARE',
        parameters: { percentage: '110', year_basis: 'LOCKED:2025', locality_basis: { kind: 'NAMED', carrier: '11502', locality: '01' }, conversion_factor: 'qualifying_apm' },
      },
      true,
    );
    expect(percent.method === 'PERCENT_OF_MEDICARE' && percent.parameters.percentage.toString()).toBe('110');
    const lesser = parseRateTerms(
      { scope: SCOPE, method: 'LESSER_OF', parameters: { schedule: { method: 'FIXED_SCHEDULE', amount_cents: '4000' }, charge_basis: 'LINE_CHARGE' } },
      true,
    );
    expect(lesser.method === 'LESSER_OF' && lesser.parameters.schedule.method).toBe('FIXED_SCHEDULE');
    const visit = parseRateTerms({ scope: SCOPE, method: 'PER_VISIT', parameters: { amount_cents: '9500' } }, true);
    expect(visit.method === 'PER_VISIT' && visit.parameters.amount_cents).toBe(9500n);
    expect(parseRateTerms({ scope: SCOPE, method: 'UNSUPPORTED', parameters: {} }, true).parameters).toEqual({});
  });

  it.each([
    ['an unknown method', { scope: SCOPE, method: 'CAPITATION', parameters: {} }],
    ['dollars instead of cents', { scope: SCOPE, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '32.00' } }],
    ['a float', { scope: SCOPE, method: 'FIXED_SCHEDULE', parameters: { amount_cents: 32 } }],
    ['a negative amount', { scope: SCOPE, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '-1' } }],
    ['a zero percentage', { scope: SCOPE, method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '0', year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' } }],
    ['a percentage above 1000', { scope: SCOPE, method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '1000.5', year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' } }],
    ['an unknown year basis', { scope: SCOPE, method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '100', year_basis: 'LAST_YEAR', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' } }],
    ['a parameter of another method', { scope: SCOPE, method: 'UNSUPPORTED', parameters: { amount_cents: '1' } }],
    ['no codes', { scope: { codes: [] }, method: 'UNSUPPORTED', parameters: {} }],
    ['a lower-case code', { scope: { codes: ['g0283x'] }, method: 'UNSUPPORTED', parameters: {} }],
    ['a code twice', { scope: { codes: ['97110', '97110'] }, method: 'UNSUPPORTED', parameters: {} }],
    ['a modifier set twice', { scope: { codes: ['97110'], modifier_sets: [['GP', 'KX'], ['KX', 'GP']] }, method: 'UNSUPPORTED', parameters: {} }],
    ['a modifier twice in a set', { scope: { codes: ['97110'], modifier_sets: [['GP', 'GP']] }, method: 'UNSUPPORTED', parameters: {} }],
    ['a place of service twice', { scope: { codes: ['97110'], places_of_service: ['11', '11'] }, method: 'UNSUPPORTED', parameters: {} }],
    ['a window that ends before it starts', { scope: { codes: ['97110'], effective_from: '2026-02-01', effective_to: '2026-02-01' }, method: 'UNSUPPORTED', parameters: {} }],
    ['an impossible date', { scope: { codes: ['97110'], effective_from: '2026-02-30' }, method: 'UNSUPPORTED', parameters: {} }],
    ['an unknown scope key', { scope: { codes: ['97110'], network: 'in' }, method: 'UNSUPPORTED', parameters: {} }],
    ['an unknown rounding rule', { scope: SCOPE, method: 'UNSUPPORTED', parameters: {}, rounding: 'HALF_DOWN' }],
    ['an unknown flag', { scope: SCOPE, method: 'UNSUPPORTED', parameters: {}, flags: { apply_kx: true } }],
  ])('refuses %s', (_label, value) => {
    expect(() => parseRateTerms(value, true)).toThrow();
  });

  it('writes typed terms back as the stored JSON, which parses to the same terms (property)', () => {
    const terms = fc.oneof(
      fc.record({ method: fc.constant('FIXED_SCHEDULE'), parameters: fc.record({ amount_cents: fc.bigInt({ min: 0n, max: 999_999_999_999n }).map((value) => value.toString()) }) }),
      fc.record({
        method: fc.constant('PERCENT_OF_MEDICARE'),
        parameters: fc.record({
          percentage: fc.tuple(fc.integer({ min: 1, max: 999 }), fc.integer({ min: 0, max: 999_999 })).map(([whole, fraction]) => `${String(whole)}.${String(fraction).padStart(6, '0')}`),
          year_basis: fc.constantFrom('CURRENT', 'LOCKED:2024', 'LOCKED:2025'),
          locality_basis: fc.constantFrom({ kind: 'PRACTICE' }, { kind: 'NAMED', carrier: '11502', locality: '01' }),
          conversion_factor: fc.constantFrom('non_qualifying_apm', 'qualifying_apm'),
        }),
      }),
      fc.record({ method: fc.constant('PER_VISIT'), parameters: fc.record({ amount_cents: fc.bigInt({ min: 0n, max: 99_999n }).map((value) => value.toString()) }) }),
      fc.record({
        method: fc.constant('LESSER_OF'),
        parameters: fc.record({ schedule: fc.record({ method: fc.constant('FIXED_SCHEDULE'), amount_cents: fc.constant('100') }), charge_basis: fc.constant('LINE_CHARGE') }),
      }),
      fc.record({ method: fc.constant('UNSUPPORTED'), parameters: fc.constant({}) }),
    );
    fc.assert(
      fc.property(terms, fc.boolean(), fc.constantFrom(null, 'HALF_UP_CENT', 'HALF_EVEN_CENT', 'TRUNCATE'), (body, mppr, rounding) => {
        const parsed = parseRateTerms({ scope: { codes: ['97110'], modifier_sets: [['GP']], places_of_service: ['11'], effective_from: '2026-01-01' }, ...body, flags: { apply_mppr: mppr }, rounding }, true);
        const json = rateTermsToJson(parsed);
        const again = parseRateTerms(JSON.parse(JSON.stringify(json)));
        expect(rateTermsToJson(again)).toEqual(json);
        expect(json.flags.apply_mppr).toBe(mppr);
      }),
    );
  });

  it('takes an optional contract-specific adjustment, a percentage or a cap, and keeps records without one valid (PRD 11 step 4)', () => {
    const before = { scope: SCOPE, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '3200' }, flags: COMMERCIAL_DEFAULT_FLAGS, rounding: null };
    const old = parseRateTerms(before);
    expect(old.method === 'FIXED_SCHEDULE' && old.parameters.contract_adjustment).toBeUndefined();
    expect(rateTermsToJson(old).parameters).toEqual({ amount_cents: '3200' });
    const percent = parseRateTerms({ ...before, method: 'PER_VISIT', parameters: { amount_cents: '8800', contract_adjustment: { kind: 'PERCENT', percent: '92.5' } } });
    expect(percent.method === 'PER_VISIT' && percent.parameters.contract_adjustment?.kind === 'PERCENT' && percent.parameters.contract_adjustment.percent.toString()).toBe('92.5');
    expect(rateTermsToJson(percent).parameters).toEqual({ amount_cents: '8800', contract_adjustment: { kind: 'PERCENT', percent: '92.5' } });
    const capped = parseRateTerms({
      ...before,
      method: 'LESSER_OF',
      parameters: { schedule: { method: 'FIXED_SCHEDULE', amount_cents: '3400' }, charge_basis: 'LINE_CHARGE', contract_adjustment: { kind: 'CAP', cap_cents: '6000' } },
    });
    expect(capped.method === 'LESSER_OF' && capped.parameters.contract_adjustment).toEqual({ kind: 'CAP', cap_cents: 6000n });
    expect(rateTermsToJson(capped).parameters).toEqual({ schedule: { method: 'FIXED_SCHEDULE', amount_cents: '3400' }, charge_basis: 'LINE_CHARGE', contract_adjustment: { kind: 'CAP', cap_cents: '6000' } });
    const medicare = { percentage: '120', year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'qualifying_apm' };
    expect(rateTermsToJson(parseRateTerms({ ...before, method: 'PERCENT_OF_MEDICARE', parameters: { ...medicare, contract_adjustment: { kind: 'CAP', cap_cents: '0' } } })).parameters).toEqual({
      ...medicare,
      contract_adjustment: { kind: 'CAP', cap_cents: '0' },
    });
    for (const adjustment of [{ kind: 'DISCOUNT', percent: '5' }, { kind: 'PERCENT', percent: '0' }, { kind: 'PERCENT', percent: '1000.5' }, { kind: 'CAP', cap_cents: '-1' }, { kind: 'CAP', cap_cents: 60 }, { kind: 'CAP', percent: '5' }]) {
      expect(() => parseRateTerms({ ...before, parameters: { amount_cents: '3200', contract_adjustment: adjustment } }), JSON.stringify(adjustment)).toThrow();
    }
    // The adjustment belongs to the record, not to a lesser-of term's schedule, and an unsupported method takes none.
    expect(() =>
      parseRateTerms({ ...before, method: 'LESSER_OF', parameters: { schedule: { method: 'FIXED_SCHEDULE', amount_cents: '1', contract_adjustment: { kind: 'CAP', cap_cents: '1' } }, charge_basis: 'LINE_CHARGE' } }),
    ).toThrow();
    expect(() => parseRateTerms({ ...before, method: 'UNSUPPORTED', parameters: { contract_adjustment: { kind: 'CAP', cap_cents: '1' } } })).toThrow();
  });

  it('writes cents as integer text and percentages as decimal text, never through a float', () => {
    const json = rateTermsToJson(parseRateTerms({ scope: SCOPE, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '999999999999' } }, true));
    expect(json.parameters).toEqual({ amount_cents: '999999999999' });
    const percent = rateTermsToJson(
      parseRateTerms(
        { scope: { codes: ['97110'], provider_types: ['PT'], effective_to: '2027-01-01' }, method: 'LESSER_OF', parameters: { schedule: { method: 'PERCENT_OF_MEDICARE', percentage: '110.125', year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' }, charge_basis: 'LINE_CHARGE' } },
        true,
      ),
    );
    expect(percent.parameters).toEqual({ schedule: { method: 'PERCENT_OF_MEDICARE', percentage: '110.125', year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' }, charge_basis: 'LINE_CHARGE' });
    expect(percent.scope).toEqual({ codes: ['97110'], provider_types: ['PT'], effective_to: '2027-01-01' });
    expect(centsToString(3200n as never)).toBe('3200');
  });
});

describe('evidence', () => {
  it('is empty while a record is being abstracted, or a full citation: document, page, quote and hash (CON-04)', () => {
    expect(evidenceSchema.parse({})).toEqual({ citation: null, approvals: {} });
    expect(evidenceSchema.parse({ document_id: DOC, page: 3, quote: 'SYNTHETIC 97110 $32.00', hash: HASH })).toEqual({ citation: { document_id: DOC, page: 3, quote: 'SYNTHETIC 97110 $32.00', hash: HASH }, approvals: {} });
    for (const missing of ['document_id', 'page', 'quote', 'hash']) {
      const partial: Record<string, unknown> = { document_id: DOC, page: 3, quote: 'SYNTHETIC', hash: HASH };
      delete partial[missing];
      expect(() => evidenceSchema.parse(partial), missing).toThrow();
    }
    expect(() => citationSchema.parse({ document_id: DOC, page: 0, quote: 'x', hash: HASH })).toThrow();
    expect(() => citationSchema.parse({ document_id: DOC, page: 1, quote: '   ', hash: HASH })).toThrow();
  });

  it('carries the specialist’s approval of each field', () => {
    const approvals = { scope: { by: DOC, at: '2026-10-15T12:00:00+00:00' } };
    expect(evidenceSchema.parse({ approved_fields: approvals }).approvals).toEqual(approvals);
    expect(() => evidenceSchema.parse({ approved_fields: { network: { by: DOC, at: 'x' } } })).toThrow();
    expect(RATE_RECORD_FIELDS).toEqual(['scope', 'method', 'parameters', 'flags', 'rounding']);
  });

  it('numbers appeal levels 1, 2, 3 in order', () => {
    expect(appealLevelsSchema.parse([{ level: 1, days: 90 }, { level: 2, days: 60 }])).toHaveLength(2);
    expect(() => appealLevelsSchema.parse([{ level: 2, days: 90 }])).toThrow();
  });
});
