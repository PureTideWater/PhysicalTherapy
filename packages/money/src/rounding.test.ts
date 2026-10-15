import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { MoneyError } from './cents';
import { Decimal, centsToDecimal, multiplyCents, rate } from './decimal';
import { DEFAULT_ROUNDING, ROUNDING_RULES, roundToCents } from './rounding';

/** An arbitrary unrounded amount in cents with up to six decimal places, built from integers. */
const unroundedCents = fc
  .tuple(fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }), fc.integer({ min: 0, max: 6 }))
  .map(([digits, scale]) => new Decimal(digits.toString()).dividedBy(new Decimal(10).pow(scale)));

describe('roundToCents', () => {
  it('names the three contract rules and defaults to half-up', () => {
    expect(ROUNDING_RULES).toEqual(['HALF_UP_CENT', 'HALF_EVEN_CENT', 'TRUNCATE']);
    expect(DEFAULT_ROUNDING).toBe('HALF_UP_CENT');
  });

  it.each([
    ['2.5', 3n, 2n, 2n],
    ['3.5', 4n, 4n, 3n],
    ['-2.5', -3n, -2n, -2n],
    ['2.4999', 2n, 2n, 2n],
    ['2.5001', 3n, 3n, 2n],
    ['-2.9', -3n, -3n, -2n],
    ['7', 7n, 7n, 7n],
  ])('rounds %s cents to half-up %s, half-even %s, truncate %s', (text, halfUp, halfEven, truncate) => {
    const value = new Decimal(text);
    expect(roundToCents(value, 'HALF_UP_CENT')).toBe(halfUp);
    expect(roundToCents(value, 'HALF_EVEN_CENT')).toBe(halfEven);
    expect(roundToCents(value, 'TRUNCATE')).toBe(truncate);
  });

  it('changes an amount by less than one cent under every rule (property)', () => {
    fc.assert(
      fc.property(unroundedCents, fc.constantFrom(...ROUNDING_RULES), (value, rule) => {
        const rounded = centsToDecimal(roundToCents(value, rule));
        expect(rounded.minus(value).abs().lessThan(1)).toBe(true);
      }),
    );
  });

  it('never moves a truncated amount away from zero (property)', () => {
    fc.assert(
      fc.property(unroundedCents, (value) => {
        const rounded = centsToDecimal(roundToCents(value, 'TRUNCATE'));
        expect(rounded.abs().lessThanOrEqualTo(value.abs())).toBe(true);
      }),
    );
  });

  it('agrees across rules except on exact halves (property)', () => {
    fc.assert(
      fc.property(unroundedCents, (value) => {
        const isHalf = value.minus(value.truncated()).abs().equals(new Decimal('0.5'));
        const halfUp = roundToCents(value, 'HALF_UP_CENT');
        const halfEven = roundToCents(value, 'HALF_EVEN_CENT');
        expect(halfUp === halfEven || isHalf).toBe(true);
      }),
    );
  });
});

describe('rate', () => {
  it.each(['1.10', '0.85', '33.2875', '12345678.123456', '-0.02', '2'])('accepts %s', (text) => {
    expect(rate(text).toString()).toBe(new Decimal(text).toString());
  });

  it.each(['', '1.1234567', '123456789', '1e2', '.5', 'NaN', 'Infinity', '1,1'])('refuses %j', (text) => {
    expect(() => rate(text)).toThrow(MoneyError);
  });
});

describe('multiplyCents', () => {
  it('keeps the full unrounded product', () => {
    expect(multiplyCents(1000n, rate('1.10')).toString()).toBe('1100');
    expect(multiplyCents(3333n, rate('0.85')).toString()).toBe('2833.05');
  });

  it('doubles exactly when the amount doubles (property)', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 12n }), fc.bigInt({ min: 0n, max: 10n ** 8n }), (cents, raw) => {
        const factor = new Decimal(raw.toString()).dividedBy(new Decimal(10).pow(6));
        expect(multiplyCents(cents * 2n, factor).equals(multiplyCents(cents, factor).times(2))).toBe(true);
      }),
    );
  });
});
