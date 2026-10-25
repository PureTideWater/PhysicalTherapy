import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { addDays, addMonths, inclusiveCovers, isIsoDate, yearOf } from './dates';

/** The same date arithmetic through the platform's UTC calendar, as an independent check. */
function utcAddDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map((part) => Number.parseInt(part, 10)) as [number, number, number];
  const moved = new Date(0);
  moved.setUTCFullYear(year, month - 1, day + days);
  return moved.toISOString().slice(0, 10);
}

const dates = fc.date({ min: new Date('1901-01-01T00:00:00Z'), max: new Date('2199-12-31T00:00:00Z'), noInvalidDate: true }).map((date) => date.toISOString().slice(0, 10));

describe('calendar dates', () => {
  it('accepts real calendar dates only', () => {
    for (const date of ['2026-01-01', '2024-02-29', '2000-02-29', '2026-12-31']) {
      expect(isIsoDate(date), date).toBe(true);
    }
    for (const date of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00', '2026-1-01', 20260101, null]) {
      expect(isIsoDate(date), String(date)).toBe(false);
    }
  });

  it('adds days across months, years and leap days, as the UTC calendar does', () => {
    expect(addDays('2026-04-01', 111)).toBe('2026-07-21');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    fc.assert(
      fc.property(dates, fc.integer({ min: -4000, max: 4000 }), (date, days) => {
        expect(addDays(date, days)).toBe(utcAddDays(date, days));
      }),
    );
  });

  it('adds months, falling back to the last day of a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-10', 11)).toBe('2027-02-10');
    expect(addMonths('2026-03-10', -3)).toBe('2025-12-10');
    expect(addMonths('2026-08-31', 1)).toBe('2026-09-30');
  });

  it('gives the year and inclusive coverage, and refuses a malformed date', () => {
    expect(yearOf('2025-07-04')).toBe(2025);
    expect(inclusiveCovers('2026-01-01', '2026-03-31', '2026-03-31')).toBe(true);
    expect(inclusiveCovers('2026-01-01', '2026-03-31', '2026-04-01')).toBe(false);
    expect(inclusiveCovers('2026-01-01', null, '2099-01-01')).toBe(true);
    expect(inclusiveCovers('2026-01-01', null, '2025-12-31')).toBe(false);
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => yearOf('soon')).toThrow(RangeError);
  });

  it('reads the whole text as one date, and only text', () => {
    // Anything before or after the date, and the 31st of a 30-day month.
    for (const date of ['x2026-01-01', '12026-01-01', '2026-01-01x', '2026-01-011', '2026-04-31', '2026-06-31', '2026-09-31', '2026-11-31']) {
      expect(isIsoDate(date), date).toBe(false);
    }
    for (const date of ['2026-04-30', '2026-06-30', '2026-09-30', '2026-11-30', '2026-05-31', '2026-12-31']) {
      expect(isIsoDate(date), date).toBe(true);
    }
    // A value that is not text, though it reads as a date once made text.
    for (const value of [['2026-01-01'], { toString: () => '2026-01-01' }, Object('2026-01-01') as unknown]) {
      expect(isIsoDate(value), String(value)).toBe(false);
    }
  });

  it('names the refusal, writes a year before 1000 in four digits, and crosses the century days of a 400-year cycle', () => {
    for (const refused of [() => addDays('2026-02-30', 1), () => addMonths('2026-1-01', 1), () => yearOf('soon')]) {
      expect(refused).toThrow(new RangeError('not a calendar date (YYYY-MM-DD)'));
      expect(refused).toThrow(/^not a calendar date \(YYYY-MM-DD\)$/);
    }
    expect(addDays('0099-03-01', -1)).toBe('0099-02-28');
    expect(addDays('0999-12-31', 1)).toBe('1000-01-01');
    expect(addMonths('0099-12-15', 1)).toBe('0100-01-15');
    // 2000-02-29 is day 146,096 of its 400-year era, the one day the civil-from-days formula's last term counts.
    for (const [date, days, expected] of [
      ['2000-02-28', 1, '2000-02-29'],
      ['2000-03-01', -1, '2000-02-29'],
      ['2000-02-29', 1, '2000-03-01'],
      ['1600-02-28', 1, '1600-02-29'],
      ['2400-02-28', 1, '2400-02-29'],
      ['0400-02-28', 1, '0400-02-29'],
      // A century into an era (2100-03-01 is its day 36,524), where the formula's 100-year term first counts.
      ['2100-02-28', 1, '2100-03-01'],
      ['2101-02-28', 1, '2101-03-01'],
      ['2200-02-28', 1, '2200-03-01'],
    ] as const) {
      expect(addDays(date, days), `${date} ${String(days)}`).toBe(expected);
      expect(utcAddDays(date, days), `${date} ${String(days)}`).toBe(expected);
    }
  });
});
