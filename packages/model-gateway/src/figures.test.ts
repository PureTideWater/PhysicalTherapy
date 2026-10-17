import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { figureInQuote, inQuote, readAmount, readDate, readPercent, readYear, standsAlone, tokenInQuote, wholeInQuote } from './figures';
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
    expect(tokenInQuote('gp', 'modifier GP applies', 'modifiers')).toBe(true);
    expect(tokenInQuote('9711', 'CPT 97110')).toBe(false);
    expect(tokenInQuote('', 'CPT 97110')).toBe(false);
  });

  it('never find a token that a slash, a dollar sign, a decimal point, a thousands comma or a hyphen joins to a longer figure (MOD-02)', () => {
    expect(tokenInQuote('11', 'effective 11/1/2026', 'places_of_service')).toBe(false);
    expect(tokenInQuote('59', 'pays $59.00 per visit', 'modifiers')).toBe(false);
    expect(tokenInQuote('11', 'rate 1.11 per unit', 'places_of_service')).toBe(false);
    expect(tokenInQuote('11', 'rate 11.5 per unit', 'places_of_service')).toBe(false);
    expect(tokenInQuote('22', 'at 22% of charges', 'places_of_service')).toBe(false);
    expect(tokenInQuote('97110', 'reference 971105', 'codes')).toBe(false);
    expect(tokenInQuote('97112', 'codes 97110-97112 at $40.00', 'codes')).toBe(false);
    expect(tokenInQuote('97110', 'codes 97110-97112 at $40.00', 'codes')).toBe(false);
    expect(tokenInQuote('59', 'section 58-59', 'modifiers')).toBe(false);
    expect(tokenInQuote('59', 'POS-59', 'places_of_service')).toBe(false);
    // A list, a sentence's end and a code with its modifiers attached are whole tokens.
    expect(tokenInQuote('97140', '97110, 97140, 97530 at $40.00', 'codes')).toBe(true);
    expect(tokenInQuote('97140', '97110,97140 at $40.00', 'codes')).toBe(true);
    expect(tokenInQuote('11', 'places 11, 12 and 19.', 'places_of_service')).toBe(true);
    expect(tokenInQuote('19', 'places 11, 12 and 19.', 'places_of_service')).toBe(true);
    expect(tokenInQuote('97110', '97110-GP-59 at $32.50', 'codes')).toBe(true);
    expect(tokenInQuote('GP', '97110-GP-59 at $32.50', 'modifiers')).toBe(true);
    expect(tokenInQuote('59', '97110-GP-59 at $32.50', 'modifiers')).toBe(true);
    expect(tokenInQuote('GP', '97110-GP-59 at $32.50', 'places_of_service')).toBe(false);
  });

  it('stand a token alone only where nothing joins it to the text beside it', () => {
    expect(standsAlone('a 123 b', 2, 5)).toBe(true);
    expect(standsAlone('1,234', 2, 5)).toBe(false);
    expect(standsAlone('1,234', 0, 1)).toBe(false);
    expect(standsAlone('12,3456', 0, 2)).toBe(true);
    expect(standsAlone('97110-GP', 0, 5)).toBe(false);
    expect(standsAlone('97110-GP', 0, 5, { hyphenated: 'code' })).toBe(true);
    expect(standsAlone('97110-GP', 6, 8, { hyphenated: 'modifier' })).toBe(true);
    expect(standsAlone('9711-GP', 5, 7, { hyphenated: 'modifier' })).toBe(false);
  });

  it('find a written reference as a whole word', () => {
    expect(wholeInQuote('REF-SYN-77', 'Reference REF-SYN-77 applies.')).toBe(true);
    expect(wholeInQuote('REF-SYN-7', 'Reference REF-SYN-77 applies.')).toBe(false);
    expect(wholeInQuote('[CLAIM_1]', 'Claim [CLAIM_1] was denied.')).toBe(true);
    expect(wholeInQuote('  ', 'anything')).toBe(false);
  });
});

describe('figureInQuote (MOD-02)', () => {
  const quote = 'CPT 97110 is paid $32.50 per unit, effective 11/1/2026 through 12/1/2026, at 110% of the 2025 Medicare fee schedule; renewal January 1, 2027.';

  it('finds a whole figure whose value is what code reads from the written text', () => {
    expect(figureInQuote('amount', '$32.50', quote)).toBe(true);
    expect(figureInQuote('amount', '32.50', quote)).toBe(true);
    expect(figureInQuote('date', '11/1/2026', quote)).toBe(true);
    expect(figureInQuote('date', 'January 1, 2027', quote)).toBe(true);
    expect(figureInQuote('percentage', '110%', quote)).toBe(true);
    expect(figureInQuote('percentage', '110', quote)).toBe(true);
    expect(figureInQuote('year', '2025', quote)).toBe(true);
  });

  it.each([
    ['amount', '$3'],
    ['amount', '$32'],
    ['amount', '2.50'],
    ['percentage', '10%'],
    ['date', '1/1/2026'],
    ['date', '2/1/2026'],
    ['year', '2026'],
    ['year', '2027'],
    ['amount', 'about $32.50'],
  ] as const)('refuses %s %s, a fragment of a longer figure or not one at all', (kind, written) => {
    expect(figureInQuote(kind, written, quote)).toBe(false);
  });
});
