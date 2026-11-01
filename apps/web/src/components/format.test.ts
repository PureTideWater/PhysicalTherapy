import { describe, expect, it } from 'vitest';

import { quarter, utc, utcDate } from './format';

/**
 * Dates on screen (test matrix HOM-02): a quarter is written from `@tp/ledger`'s key and nothing else, beside the
 * calendar date and the moment the screens already write in UTC.
 */
describe('dates on screen', () => {
  it('write a quarter key as the quarter', () => {
    expect(quarter('2026-Q4')).toBe('2026-Q4');
    expect(quarter('2027-Q1')).toBe('2027-Q1');
  });

  it('refuse anything that is not a quarter key', () => {
    for (const key of ['2026-Q5', '2026-Q0', '2026-q4', '26-Q4', '2026-Q4 ', '2026-10-01', '']) {
      expect(() => quarter(key)).toThrow('Not a quarter key');
    }
  });

  it('write a calendar date and a moment in UTC', () => {
    expect(utcDate('2026-06-09')).toBe('2026-06-09');
    expect(utcDate('2026-06-09T23:59:00Z')).toBe('2026-06-09');
    expect(utc('2026-06-09T23:59:30Z')).toBe('2026-06-09 23:59 UTC');
    expect(utc(null)).toBe('—');
  });
});
