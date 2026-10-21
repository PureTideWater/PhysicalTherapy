import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { addDays } from './dates';
import {
  COMPUTED_CONTRACT_WINDOW_RULE,
  DISPUTE_WINDOW_STARTS,
  DISPUTE_WINDOW_START_TEXT,
  DISPUTE_WINDOW_UNITS,
  DISPUTE_WINDOW_UNIT_TEXT,
  type DisputeWindowRule,
  type WindowStartDates,
  disputeWindowRuleSchema,
  sameWindowRule,
  windowRuleComputed,
  windowRuleEndsOn,
  windowRuleText,
} from './window-rule';

/**
 * A contract window's rule (best-option audit #5; docs/adr/0061): the fixed lists, the one rule the engine computes,
 * the rule in words, and the end each start and unit gives, over SYNTHETIC dates (calendar and business days across
 * weekends and month ends, months across short months and leap years). The expected ends were counted by hand and
 * checked against Python's datetime.
 */

const rules: DisputeWindowRule[] = DISPUTE_WINDOW_UNITS.flatMap((unit) => DISPUTE_WINDOW_STARTS.map((measuredFrom) => ({ unit, measuredFrom })));

/** One SYNTHETIC line's dates: served Monday 2026-03-02, remitted Tuesday 2026-03-31, paid 2026-04-02, received 2026-04-06. */
const LINE: WindowStartDates = { dateOfService: '2026-03-02', remittanceDate: '2026-03-31', paymentDate: '2026-04-02', receiptDate: '2026-04-06' };
const from = (date: string, start: keyof WindowStartDates = 'remittanceDate'): WindowStartDates => ({ dateOfService: null, remittanceDate: null, paymentDate: null, receiptDate: null, [start]: date });

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

describe('the lists', () => {
  it('names three units and four starts, in words, and reads nothing else', () => {
    expect(DISPUTE_WINDOW_UNITS).toEqual(['calendar_days', 'business_days', 'months']);
    expect(DISPUTE_WINDOW_STARTS).toEqual(['date_of_service', 'remittance_date', 'payment_date', 'receipt_date']);
    expect(DISPUTE_WINDOW_UNIT_TEXT).toEqual({ calendar_days: 'calendar days', business_days: 'business days', months: 'months' });
    expect(DISPUTE_WINDOW_START_TEXT).toEqual({
      date_of_service: 'the date of service',
      remittance_date: 'the remittance date',
      payment_date: 'the payment date',
      receipt_date: 'the day the practice received the remittance or payment',
    });
    for (const rule of rules) {
      expect(disputeWindowRuleSchema.parse(rule)).toEqual(rule);
    }
    for (const wrong of [{ unit: 'days', measuredFrom: 'remittance_date' }, { unit: 'calendar_days', measuredFrom: 'claim_date' }, { unit: 'calendar_days' }, { unit: 'calendar_days', measuredFrom: 'remittance_date', note: 'x' }, null]) {
      expect(disputeWindowRuleSchema.safeParse(wrong).success).toBe(false);
    }
  });
});

describe('the computed rule', () => {
  it('is calendar days after the payment date (BPR16, the engine’s start), and only that rule is computed', () => {
    expect(COMPUTED_CONTRACT_WINDOW_RULE).toEqual({ unit: 'calendar_days', measuredFrom: 'payment_date' });
    // The remittance advice's own date is another start, usually a day or more before the payment: never the computed one.
    expect(windowRuleComputed({ unit: 'calendar_days', measuredFrom: 'remittance_date' })).toBe(false);
    expect(Object.isFrozen(COMPUTED_CONTRACT_WINDOW_RULE)).toBe(true);
    expect(rules.filter(windowRuleComputed)).toEqual([COMPUTED_CONTRACT_WINDOW_RULE]);
    expect(windowRuleComputed(null)).toBe(false);
  });

  it('says the rule in words', () => {
    expect(windowRuleText(90, COMPUTED_CONTRACT_WINDOW_RULE)).toBe('ends 90 calendar days after the payment date');
    expect(windowRuleText(180, { unit: 'calendar_days', measuredFrom: 'date_of_service' })).toBe('ends 180 calendar days after the date of service');
    expect(windowRuleText(1, { unit: 'business_days', measuredFrom: 'payment_date' })).toBe('ends 1 business day after the payment date');
    expect(windowRuleText(6, { unit: 'months', measuredFrom: 'receipt_date' })).toBe('ends 6 months after the day the practice received the remittance or payment');
    expect(windowRuleText(1, { unit: 'months', measuredFrom: 'remittance_date' })).toBe('ends 1 month after the remittance date');
  });

  it('tells two rules apart', () => {
    expect(sameWindowRule(COMPUTED_CONTRACT_WINDOW_RULE, { unit: 'calendar_days', measuredFrom: 'payment_date' })).toBe(true);
    expect(sameWindowRule(COMPUTED_CONTRACT_WINDOW_RULE, { unit: 'calendar_days', measuredFrom: 'remittance_date' })).toBe(false);
    expect(sameWindowRule(COMPUTED_CONTRACT_WINDOW_RULE, { unit: 'calendar_days', measuredFrom: 'date_of_service' })).toBe(false);
    expect(sameWindowRule(COMPUTED_CONTRACT_WINDOW_RULE, { unit: 'business_days', measuredFrom: 'payment_date' })).toBe(false);
    expect(sameWindowRule(null, COMPUTED_CONTRACT_WINDOW_RULE)).toBe(false);
  });
});

describe('the end a rule gives', () => {
  it('counts from the start the rule names: "within 180 days of the date of service" ends 31 days before the payment-date window', () => {
    const ends = Object.fromEntries(DISPUTE_WINDOW_STARTS.map((measuredFrom) => [measuredFrom, windowRuleEndsOn(180, { unit: 'calendar_days', measuredFrom }, LINE)]));
    expect(ends).toEqual({ date_of_service: '2026-08-29', remittance_date: '2026-09-27', payment_date: '2026-09-29', receipt_date: '2026-10-03' });
    // The engine's own end for this window (180 calendar days after the payment date, BPR16) is later than the remittance advice's.
    expect(windowRuleEndsOn(180, COMPUTED_CONTRACT_WINDOW_RULE, LINE)).toBe(addDays(LINE.paymentDate ?? '', 180));
    expect((windowRuleEndsOn(180, COMPUTED_CONTRACT_WINDOW_RULE, LINE) ?? '') > (ends.remittance_date ?? '')).toBe(true);
    // A start the line does not carry gives no end.
    for (const rule of rules) {
      const end = windowRuleEndsOn(30, rule, from('2026-03-31', 'receiptDate'));
      expect(end === null, `${rule.unit} ${rule.measuredFrom}`).toBe(rule.measuredFrom !== 'receipt_date');
    }
    expect(windowRuleEndsOn(30, { unit: 'calendar_days', measuredFrom: 'receipt_date' }, from('2026-03-31', 'receiptDate'))).toBe('2026-04-30');
  });

  it('counts calendar days across month ends and a leap day', () => {
    const calendar = { unit: 'calendar_days', measuredFrom: 'remittance_date' } as const;
    expect(windowRuleEndsOn(30, calendar, from('2026-01-30'))).toBe('2026-03-01');
    expect(windowRuleEndsOn(30, calendar, from('2028-02-01'))).toBe('2028-03-02');
    expect(windowRuleEndsOn(90, calendar, from('2026-12-15'))).toBe('2027-03-15');
    // A Saturday end stays a Saturday: calendar days do not move to a business day.
    expect(windowRuleEndsOn(1, calendar, from('2026-01-30'))).toBe('2026-01-31');
  });

  it('counts business days Monday to Friday, never the start, across weekends, month ends and the year end', () => {
    const business = (date: string, days: number) => windowRuleEndsOn(days, { unit: 'business_days', measuredFrom: 'date_of_service' }, from(date, 'dateOfService'));
    // From Friday 2026-01-30.
    expect(business('2026-01-30', 1)).toBe('2026-02-02');
    expect(business('2026-01-30', 5)).toBe('2026-02-06');
    expect(business('2026-01-30', 10)).toBe('2026-02-13');
    // From a Saturday and a Sunday: the first business day is the Monday after.
    expect(business('2026-01-31', 1)).toBe('2026-02-02');
    expect(business('2026-02-01', 5)).toBe('2026-02-06');
    // From Wednesday 2026-02-25, over February's end and a weekend.
    expect(business('2026-02-25', 3)).toBe('2026-03-02');
    // Over the year end: Christmas Day and New Year's Day are counted (no holiday list is abstracted), so the end is never later than the contract's.
    expect(business('2026-12-24', 5)).toBe('2026-12-31');
    expect(business('2026-12-24', 6)).toBe('2027-01-01');
    // Six whole weeks from a Monday.
    expect(business('2026-03-02', 30)).toBe('2026-04-13');
    expect(business('2026-03-02', 180)).toBe('2026-11-09');
  });

  it('counts months to the same day, or the last day of a shorter month', () => {
    const months = (date: string, count: number) => windowRuleEndsOn(count, { unit: 'months', measuredFrom: 'payment_date' }, from(date, 'paymentDate'));
    expect(months('2026-01-31', 1)).toBe('2026-02-28');
    expect(months('2028-01-31', 1)).toBe('2028-02-29');
    expect(months('2026-03-31', 6)).toBe('2026-09-30');
    expect(months('2026-08-15', 4)).toBe('2026-12-15');
    expect(months('2026-11-30', 3)).toBe('2027-02-28');
    expect(months('2026-05-31', 12)).toBe('2027-05-31');
  });

  it('refuses a length that is not a whole number of units, and a start that is not a calendar date', () => {
    // A fraction of a unit (the square root of two) is not a window either.
    for (const length of [0, -1, Math.SQRT2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => windowRuleEndsOn(length, COMPUTED_CONTRACT_WINDOW_RULE, LINE)).toThrow(RangeError);
    }
    expect(() => windowRuleEndsOn(30, { unit: 'business_days', measuredFrom: 'remittance_date' }, from('2026-02-30'))).toThrow(RangeError);
    expect(() => windowRuleEndsOn(1, { unit: 'months', measuredFrom: 'remittance_date' }, from('2026-13-01'))).toThrow(RangeError);
  });

  it('holds over any date and length: calendar days add days, business days land on the N-th weekday after, months keep the day or the month’s last', () => {
    const date = fc.date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2099-12-31T00:00:00Z'), noInvalidDate: true }).map((value) => value.toISOString().slice(0, 10));
    fc.assert(
      fc.property(date, fc.integer({ min: 1, max: 400 }), (start, length) => {
        expect(windowRuleEndsOn(length, COMPUTED_CONTRACT_WINDOW_RULE, from(start, 'paymentDate'))).toBe(addDays(start, length));
        const business = windowRuleEndsOn(length, { unit: 'business_days', measuredFrom: 'remittance_date' }, from(start)) ?? '';
        expect([0, 6]).not.toContain(weekday(business));
        let counted = 0;
        for (let day = addDays(start, 1); day <= business; day = addDays(day, 1)) {
          counted += [0, 6].includes(weekday(day)) ? 0 : 1;
        }
        expect(counted).toBe(length);
        const months = windowRuleEndsOn(length, { unit: 'months', measuredFrom: 'remittance_date' }, from(start)) ?? '';
        const part = (date: string, from: number, to: number) => Number.parseInt(date.slice(from, to), 10);
        const startDay = part(start, 8, 10);
        const endDay = part(months, 8, 10);
        const monthsApart = (part(months, 0, 4) - part(start, 0, 4)) * 12 + part(months, 5, 7) - part(start, 5, 7);
        expect(monthsApart).toBe(length);
        // The same day, unless the target month is shorter: then its last day.
        expect(endDay === startDay || (endDay < startDay && addDays(months, 1).slice(8, 10) === '01')).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});
