import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { addDays, daysFrom, isIsoDate } from './dates';
import { INTEREST_EXCLUSION_TEXT, interestExclusionText, promptPayInterest } from './interest';
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

describe('promptPayInterest, field by field', () => {
  const SHA = 'a'.repeat(64);
  const recordFields = { record_sha256: SHA, statute: 'SYNTHETIC statute ZZ 1-2-3', days_to_pay: 33, day_basis: 'calendar', annual_rate_percent: '9', exclusions: ['self_funded_plans'] };
  const notComputed = (line: typeof CAS15) => ({ row: line.row, received_on: line.received_on, due_on: null, paid_on: line.paid_on, days_late: null, days_unpaid: null, interest_cents: null });

  it('states the record it used, every line’s dates and days, and the total (CAS-15)', () => {
    const second = { row: 2, paid_cents: '12345', variance_cents: '6789', paid_on: '2026-04-10', received_on: '2026-03-01' };
    const result = promptPayInterest('ZZ', 900002, promptPayRecord(), [CAS15, second], '2026-06-30');
    expect(result.gaps).toEqual([]);
    // Row 1: due 2026-04-04, paid 27 days late, 87 days unpaid by 2026-06-30: 5600 x 9% x 27/365 = 37.28 and
    // 3000 x 9% x 87/365 = 64.36, 101.64 rounded once to 102. Row 2: due 2026-04-03, paid 7 days late, 88 days
    // unpaid: 12345 x 9% x 7/365 = 21.31 and 6789 x 9% x 88/365 = 147.31, 168.62 rounded once to 169.
    expect(result.section).toStrictEqual({
      state: 'ZZ',
      release_no: 900002,
      ...recordFields,
      computed: true,
      reasons: [],
      lines: [
        { row: 1, received_on: '2026-03-02', due_on: '2026-04-04', paid_on: '2026-05-01', days_late: 27, days_unpaid: 87, interest_cents: '102' },
        { row: 2, received_on: '2026-03-01', due_on: '2026-04-03', paid_on: '2026-04-10', days_late: 7, days_unpaid: 88, interest_cents: '169' },
      ],
      total_cents: '271',
    });
  });

  it('states no record’s fields and no exclusion when the release has no record for the state', () => {
    const { section, gaps } = promptPayInterest('QQ', 900003, null, [CAS15], '2026-05-01');
    expect(section).toStrictEqual({
      state: 'QQ',
      release_no: 900003,
      record_sha256: null,
      statute: null,
      days_to_pay: null,
      day_basis: null,
      annual_rate_percent: null,
      exclusions: [],
      computed: false,
      reasons: ['prompt_pay_rule_missing'],
      lines: [notComputed(CAS15)],
      total_cents: null,
    });
    expect(gaps).toStrictEqual([{ code: 'prompt_pay_rule_missing', row: null }]);
  });

  it('states the record’s own fields when it cannot use it, and computes no line', () => {
    const business = promptPayInterest('ZZ', 900001, promptPayRecord({ day_basis: 'business', exclusions: [] }), [CAS15], '2026-05-01').section;
    expect(business).toStrictEqual({
      state: 'ZZ',
      release_no: 900001,
      ...recordFields,
      day_basis: 'business',
      exclusions: [],
      computed: false,
      reasons: ['interest_business_days'],
      lines: [notComputed(CAS15)],
      total_cents: null,
    });
    const unknownRate = promptPayInterest('ZZ', 900001, promptPayRecord({ annual_rate_percent: null, exclusions: ['self_funded_erisa_plans', 'self_funded_plans'] }), [CAS15], '2026-05-01').section;
    expect(unknownRate).toStrictEqual({
      state: 'ZZ',
      release_no: 900001,
      ...recordFields,
      annual_rate_percent: null,
      exclusions: ['self_funded_erisa_plans', 'self_funded_plans'],
      computed: false,
      reasons: ['interest_rate_unknown'],
      lines: [notComputed(CAS15)],
      total_cents: null,
    });
  });

  it('applies the record from its first day to its last, both included, and not a day outside', () => {
    const record = promptPayRecord({ effective_from: '2026-03-02', effective_to: '2026-03-31' });
    const on = (received_on: string) => promptPayInterest('ZZ', 900001, record, [{ ...CAS15, received_on }], '2026-05-01');
    for (const day of ['2026-03-02', '2026-03-15', '2026-03-31']) {
      expect(on(day).gaps, day).toEqual([]);
      expect(on(day).section.computed, day).toBe(true);
      expect(on(day).section.lines[0]?.interest_cents, day).not.toBeNull();
    }
    // Received on the first day: due 2026-04-04 and 27 days late, 57 cents (CAS-15). On the last: due 2026-05-03, on time.
    expect(on('2026-03-02').section.total_cents).toBe('57');
    expect(on('2026-03-31').section.lines[0]).toStrictEqual({ row: 1, received_on: '2026-03-31', due_on: '2026-05-03', paid_on: '2026-05-01', days_late: 0, days_unpaid: 0, interest_cents: '0' });
    for (const day of ['2026-03-01', '2026-04-01']) {
      expect(on(day).gaps, day).toStrictEqual([{ code: 'prompt_pay_rule_not_in_effect', row: 1 }]);
      expect(on(day).section).toMatchObject({ computed: false, reasons: ['prompt_pay_rule_not_in_effect'], total_cents: null, lines: [notComputed({ ...CAS15, received_on: day })] });
    }
  });

  it('lists the reasons sorted, whatever the order the lines raised them in', () => {
    const lines = [
      { ...CAS15, row: 1, received_on: '2025-12-30' },
      { ...CAS15, row: 2, received_on: null },
    ];
    const { section, gaps } = promptPayInterest('ZZ', 900001, promptPayRecord(), lines, '2026-05-01');
    expect(section.reasons).toStrictEqual(['claim_received_date_unknown', 'prompt_pay_rule_not_in_effect']);
    // The gaps stay in the schedule's order, one per line.
    expect(gaps).toStrictEqual([
      { code: 'prompt_pay_rule_not_in_effect', row: 1 },
      { code: 'claim_received_date_unknown', row: 2 },
    ]);
    expect(section.total_cents).toBeNull();
  });

  it('accrues nothing on a line with nothing unpaid, and never takes interest off for a line paid above its expected amount', () => {
    // Paid 27 days late: 5600 x 9% x 27/365 = 37.28 cents, 37 once rounded, whatever the version's date.
    for (const variance of ['0', '-3000', '-1']) {
      const later = promptPayInterest('ZZ', 900001, promptPayRecord(), [{ ...CAS15, variance_cents: variance }], '2026-10-16').section;
      expect(later.lines[0], variance).toStrictEqual({ row: 1, received_on: '2026-03-02', due_on: '2026-04-04', paid_on: '2026-05-01', days_late: 27, days_unpaid: 195, interest_cents: '37' });
      expect(later.total_cents, variance).toBe('37');
    }
    // Five cents unpaid accrue: 5 x 9% x 195/365 = 0.24 with the 37.28, 37.52, 38 once rounded.
    expect(promptPayInterest('ZZ', 900001, promptPayRecord(), [{ ...CAS15, variance_cents: '5' }], '2026-10-16').section.total_cents).toBe('38');
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

describe('a prompt-pay rule’s exclusions in words', () => {
  it('reads each code the releases hold in words, and any other code with no underscore, never as a code', () => {
    expect(interestExclusionText('self_funded_erisa_plans')).toBe('self-funded ERISA plans');
    expect(interestExclusionText('self_funded_plans')).toBe('self-funded plans');
    expect(interestExclusionText('FEDERAL_EMPLOYEE_PLANS')).toBe('federal employee plans');
    for (const words of Object.values(INTEREST_EXCLUSION_TEXT)) {
      expect(words).not.toContain('_');
    }
  });
});
