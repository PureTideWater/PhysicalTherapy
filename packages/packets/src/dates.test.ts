import { describe, expect, it } from 'vitest';

import { addDays, daysFrom, isIsoDate } from './dates';

/**
 * Calendar-date arithmetic on ISO dates (./dates.ts), which every packet deadline and every prompt-pay due date is
 * counted in: a date is exactly YYYY-MM-DD and a day of the calendar, and anything else is refused by name, so a
 * malformed date never becomes a due date. Each refusal is held to its class and its message.
 */

const NOT_WRITTEN = 'a calendar date is written YYYY-MM-DD';
const NO_SUCH_DATE = 'no such calendar date';

/** The error `run` throws, so its class, name and message can each be held. */
function thrown(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error('threw something that is not an Error', { cause: error });
  }
  throw new Error('did not throw');
}

describe('a calendar date', () => {
  it('is exactly YYYY-MM-DD: anything before or after it, or a part not written in full, is refused as not written so', () => {
    for (const text of ['x2026-03-01', '12026-03-01', ' 2026-03-01', '2026-03-01x', '2026-03-011', '2026-03-01 ', '2026-03-01T00:00:00Z', '2026-3-1', '2026-03-1', '26-03-01', '']) {
      const error = thrown(() => addDays(text, 1));
      expect(error, text).toBeInstanceOf(RangeError);
      expect(error.message, text).toBe(NOT_WRITTEN);
      expect(thrown(() => daysFrom(text, '2026-03-01')).message, text).toBe(NOT_WRITTEN);
      expect(thrown(() => daysFrom('2026-03-01', text)).message, text).toBe(NOT_WRITTEN);
      expect(isIsoDate(text), text).toBe(false);
    }
  });

  it('is a day of the calendar: a month or day the calendar does not have is refused as no such date', () => {
    for (const text of ['2026-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00', '2026-01-32', '2026-99-99']) {
      const error = thrown(() => addDays(text, 0));
      expect(error, text).toBeInstanceOf(RangeError);
      expect(error.name, text).toBe('RangeError');
      expect(error.message, text).toBe(NO_SUCH_DATE);
      expect(isIsoDate(text), text).toBe(false);
    }
    // A leap day is a day in a leap year.
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(addDays('2028-02-29', 0)).toBe('2028-02-29');
  });

  it('counts calendar days in UTC across months, years and leap days, either way', () => {
    expect(addDays('2026-03-01', 0)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-02', 33)).toBe('2026-04-04');
    expect(addDays('2026-10-01', 3650)).toBe('2036-09-28');
    expect(daysFrom('2026-03-01', '2026-03-01')).toBe(0);
    expect(daysFrom('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysFrom('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysFrom('2026-02-28', '2026-03-01')).toBe(1);
    expect(daysFrom('2027-01-01', '2026-01-01')).toBe(-365);
    // Daylight saving never moves a calendar day: the dates are UTC days.
    expect(daysFrom('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysFrom('2026-10-31', '2026-11-02')).toBe(2);
  });
});
