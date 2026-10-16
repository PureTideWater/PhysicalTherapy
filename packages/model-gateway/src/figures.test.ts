import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { inQuote, readAmount, readDate, readPercent, readYear, tokenInQuote } from './figures';
import { dateForms } from './redact';

/** Code reads what a model copied; a model never produces an amount or a date (CLAUDE.md, rule 1). */

describe('readAmount', () => {
  it.each([
    ['$32.50', 3250n],
    ['32.50', 3250n],
    ['$85', 8500n],
    ['$1,234.56', 123456n],
    ['$ 7.05', 705n],
  ])('reads %s', (written, cents) => {
    expect(readAmount(written)).toBe(cents);
  });

  it.each(['eighty-five dollars', '$32.5', '$32.505', '1,23.00', '-$5.00', '', '110%'])('refuses %s', (written) => {
    expect(readAmount(written)).toBeNull();
  });

  it('reads back every amount written as dollars and cents (property)', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 99_999_999_999n }), (cents) => {
        const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        const written = `$${whole}.${(cents % 100n).toString().padStart(2, '0')}`;
        return readAmount(written) === cents;
      }),
    );
  });
});

describe('readPercent and readYear', () => {
  it('reads a percentage as its decimal text', () => {
    expect(readPercent('110%')).toBe('110');
    expect(readPercent('112.5 percent')).toBe('112.5');
    expect(readPercent('95 per cent')).toBe('95');
    expect(readPercent('one hundred percent')).toBeNull();
  });

  it('reads the one year a text writes', () => {
    expect(readYear('2025')).toBe(2025);
    expect(readYear('the 2025 fee schedule')).toBe(2025);
    expect(readYear('2025 or 2026')).toBeNull();
    expect(readYear('20256')).toBeNull();
  });
});

describe('readDate', () => {
  it.each([
    ['2026-01-01', '2026-01-01'],
    ['1/1/2026', '2026-01-01'],
    ['12/31/2026', '2026-12-31'],
    ['January 1, 2026', '2026-01-01'],
    ['Jan. 1st, 2026', '2026-01-01'],
    ['Sept 30 2026', '2026-09-30'],
    ['1 January 2026', '2026-01-01'],
    ['May 30, 2026', '2026-05-30'],
  ])('reads %s', (written, iso) => {
    expect(readDate(written)).toBe(iso);
  });

  it.each(['February 30, 2026', '13/01/2026', 'the first of the year', '2026', 'Smarch 1, 2026'])('refuses %s', (written) => {
    expect(readDate(written)).toBeNull();
  });

  it('reads back every calendar date in each form a letter writes it (property)', () => {
    fc.assert(
      fc.property(fc.date({ min: new Date('1990-01-01T00:00:00Z'), max: new Date('2040-12-31T00:00:00Z'), noInvalidDate: true }), (date) => {
        const iso = date.toISOString().slice(0, 10);
        return dateForms(iso)
          .filter((form) => !/^\d{2}-\d{2}-\d{4}$/.test(form))
          .every((form) => readDate(form) === iso);
      }),
    );
  });
});

describe('inQuote and tokenInQuote', () => {
  it('compare as evidence compares: whitespace runs as one space, NFKC', () => {
    expect(inQuote('$32.50', 'pays  $32.50\nper unit')).toBe(true);
    expect(inQuote('32.50 per unit', 'pays $32.50   per unit')).toBe(true);
    expect(inQuote('$3250', 'pays $32.50')).toBe(false);
    expect(inQuote('  ', 'anything')).toBe(false);
  });

  it('find a code, modifier or place as a whole token', () => {
    expect(tokenInQuote('97110', 'CPT 97110 Therapeutic exercise')).toBe(true);
    expect(tokenInQuote('gp', 'modifier GP applies')).toBe(true);
    expect(tokenInQuote('9711', 'CPT 97110')).toBe(false);
    expect(tokenInQuote('', 'CPT 97110')).toBe(false);
  });
});
