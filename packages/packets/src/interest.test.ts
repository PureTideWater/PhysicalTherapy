import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { addDays, daysFrom, isIsoDate } from './dates';
import { promptPayInterest } from './interest';
import { promptPayRecord } from './test-support';

/**
 * Prompt-pay interest from a SYNTHETIC state record (state ZZ: 33 calendar days, 9% a year; release
 * 900001), test matrix CAS-15: a claim received 2026-03-02 and paid 2026-05-01 was paid 27 days late.
 */

const CAS15 = { row: 1, paid_cents: '5600', variance_cents: '3000', paid_on: '2026-05-01', received_on: '2026-03-02' };

describe('promptPayInterest', () => {
  it('computes the late payment and the unpaid shortfall at the record’s rate, rounded once per line (CAS-15)', () => {
    const { section, gaps } = promptPayInterest('ZZ', 900001, promptPayRecord(), [CAS15], '2026-05-01');
    expect(gaps).toEqual([]);
    expect(section).toMatchObject({ state: 'ZZ', computed: true, days_to_pay: 33, annual_rate_percent: '9', total_cents: '57' });
    // 5600 x 9% x 27/365 = 37.28 and 3000 x 9% x 27/365 = 19.97: 57.25 cents, 57 once rounded.
    expect(section.lines).toEqual([{ row: 1, received_on: '2026-03-02', due_on: '2026-04-04', paid_on: '2026-05-01', days_late: 27, days_unpaid: 27, interest_cents: '57' }]);
    // Later, the unpaid shortfall keeps accruing: 3000 x 9% x 195/365 = 144.25, with the 37.28.
    expect(promptPayInterest('ZZ', 900001, promptPayRecord(), [CAS15], '2026-10-16').section.total_cents).toBe('182');
  });

  it('owes nothing for a claim paid on time with nothing unpaid by the version’s date', () => {
    const onTime = { ...CAS15, paid_on: '2026-03-20' };
    expect(promptPayInterest('ZZ', 900001, promptPayRecord(), [onTime], '2026-04-01').section.lines[0]).toMatchObject({ days_late: 0, days_unpaid: 0, interest_cents: '0' });
  });

  it('says why it cannot be computed, and lists the evidence gap', () => {
    const cases = [
      [null, 'prompt_pay_rule_missing'],
      [promptPayRecord({ annual_rate_percent: null }), 'interest_rate_unknown'],
      [promptPayRecord({ day_basis: 'business' }), 'interest_business_days'],
    ] as const;
    for (const [record, code] of cases) {
      const { section, gaps } = promptPayInterest('ZZ', 900001, record, [CAS15], '2026-05-01');
      expect(section).toMatchObject({ computed: false, reasons: [code], total_cents: null });
      expect(section.lines[0]?.interest_cents).toBeNull();
      expect(gaps).toEqual([{ code, row: null }]);
    }
  });

  it('leaves out a line whose received date is unknown or outside the record, and sums the rest', () => {
    const lines = [CAS15, { ...CAS15, row: 2, received_on: null }, { ...CAS15, row: 3, received_on: '2025-12-30' }];
    const { section, gaps } = promptPayInterest('ZZ', 900001, promptPayRecord(), lines, '2026-05-01');
    expect(section.lines.map((item) => item.interest_cents)).toEqual(['57', null, null]);
    expect(section).toMatchObject({ computed: false, reasons: ['claim_received_date_unknown', 'prompt_pay_rule_not_in_effect'], total_cents: '57' });
    expect(gaps).toEqual([
      { code: 'claim_received_date_unknown', row: 2 },
      { code: 'prompt_pay_rule_not_in_effect', row: 3 },
    ]);
    expect(promptPayInterest('ZZ', 900001, promptPayRecord({ effective_to: '2026-01-31' }), [CAS15], '2026-05-01').gaps).toEqual([{ code: 'prompt_pay_rule_not_in_effect', row: 1 }]);
  });

  it('never decreases as the version’s date moves later, and is zero before the due date', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 0, max: 400 }), fc.bigInt({ min: 0n, max: 1_000_000n }), (first, more, variance) => {
        const line = { ...CAS15, variance_cents: variance.toString() };
        const earlier = promptPayInterest('ZZ', 900001, promptPayRecord(), [line], addDays('2026-05-01', first)).section.total_cents ?? '0';
        const later = promptPayInterest('ZZ', 900001, promptPayRecord(), [line], addDays('2026-05-01', first + more)).section.total_cents ?? '0';
        expect(BigInt(later) >= BigInt(earlier)).toBe(true);
      }),
    );
    const early = promptPayInterest('ZZ', 900001, promptPayRecord(), [{ ...CAS15, paid_on: '2026-03-10' }], '2026-03-10').section;
    expect(early.total_cents).toBe('0');
  });
});

describe('calendar dates', () => {
  it('adds and counts days and refuses what is not a date', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysFrom('2026-04-04', '2026-05-01')).toBe(27);
    expect(daysFrom('2026-05-01', '2026-04-04')).toBe(-27);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-3-1')).toBe(false);
    expect(isIsoDate('2026-03-01')).toBe(true);
    expect(() => addDays('2026-13-01', 1)).toThrow(RangeError);
  });
});
