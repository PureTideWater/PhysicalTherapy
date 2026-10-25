import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type Cents, MoneyError, cents } from './cents';
import { type Decimal, centsToDecimal, decimal, rate } from './decimal';
import {
  DEFAULT_ROUNDING,
  ROUNDING_RULES,
  type RoundingRule,
  addUnrounded,
  multiplyCents,
  roundOnce,
  roundToCents,
  sumUnrounded,
  unroundedCents,
  unroundedFromDollars,
} from './rounding';

/** An arbitrary unrounded amount in cents with up to six decimal places, built from integers. */
const unrounded = fc
  .tuple(fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }), fc.integer({ min: 0, max: 6 }))
  .map(([digits, scale]) => unroundedCents(decimal(digits).dividedBy(decimal(10n ** BigInt(scale)))));

/** A rate with up to six places, as a numeric(14,6) column holds it, with its scaled integer value. */
const sixPlaceRate = fc.bigInt({ min: 0n, max: 10n ** 8n }).map((scaled) => ({
  scaled,
  value: decimal(scaled).dividedBy(decimal(10n ** 6n)),
}));

function fraction(value: Decimal): Decimal {
  const whole = roundToCents(unroundedCents(value), 'TRUNCATE');
  return value.minus(centsToDecimal(whole)).abs();
}

describe('roundToCents', () => {
  it('names the three contract rules and defaults to half-up', () => {
    expect(ROUNDING_RULES).toEqual(['HALF_UP_CENT', 'HALF_EVEN_CENT', 'TRUNCATE']);
    expect(DEFAULT_ROUNDING).toBe('HALF_UP_CENT');
  });

  it.each([
    ['2.5', 3n, 2n, 2n],
    ['3.5', 4n, 4n, 3n],
    ['-2.5', -3n, -2n, -2n],
    ['-3.5', -4n, -4n, -3n],
    ['0.5', 1n, 0n, 0n],
    ['-0.5', -1n, 0n, 0n],
    ['2.4999', 2n, 2n, 2n],
    ['2.5001', 3n, 3n, 2n],
    ['2.499999999999999999999999', 2n, 2n, 2n],
    ['2.500000000000000000000001', 3n, 3n, 2n],
    ['-2.9', -3n, -3n, -2n],
    ['0.000001', 0n, 0n, 0n],
    ['0.999999', 1n, 1n, 0n],
    ['7', 7n, 7n, 7n],
    ['0', 0n, 0n, 0n],
    ['900719925474099399.5', 900719925474099400n, 900719925474099400n, 900719925474099399n],
  ])('rounds %s cents to half-up %s, half-even %s, truncate %s', (text, halfUp, halfEven, truncate) => {
    const value = unroundedCents(decimal(text));
    expect(roundToCents(value, 'HALF_UP_CENT')).toBe(halfUp);
    expect(roundToCents(value, 'HALF_EVEN_CENT')).toBe(halfEven);
    expect(roundToCents(value, 'TRUNCATE')).toBe(truncate);
  });

  it('changes an amount by less than one cent under every rule (property)', () => {
    fc.assert(
      fc.property(unrounded, fc.constantFrom(...ROUNDING_RULES), (value, rule) => {
        const rounded = centsToDecimal(roundToCents(value, rule));
        expect(rounded.minus(value).abs().lessThan(decimal(1n))).toBe(true);
      }),
    );
  });

  it('leaves whole cents unchanged under every rule (property)', () => {
    fc.assert(
      fc.property(fc.bigInt(), fc.constantFrom(...ROUNDING_RULES), (whole, rule) => {
        expect(roundToCents(unroundedCents(decimal(whole)), rule)).toBe(whole);
      }),
    );
  });

  it('never moves a truncated amount away from zero (property)', () => {
    fc.assert(
      fc.property(unrounded, (value) => {
        const rounded = centsToDecimal(roundToCents(value, 'TRUNCATE'));
        expect(rounded.abs().lessThanOrEqualTo(value.abs())).toBe(true);
      }),
    );
  });

  it('agrees across rules except on exact halves (property)', () => {
    fc.assert(
      fc.property(unrounded, (value) => {
        const isHalf = fraction(value).equals(decimal('0.5'));
        expect(roundToCents(value, 'HALF_UP_CENT') === roundToCents(value, 'HALF_EVEN_CENT') || isHalf).toBe(true);
      }),
    );
  });

  it('is symmetric about zero for half-up and truncate (property)', () => {
    fc.assert(
      fc.property(unrounded, fc.constantFrom('HALF_UP_CENT' as const, 'TRUNCATE' as const), (value, rule) => {
        expect(roundToCents(unroundedCents(value.negated()), rule)).toBe(0n - roundToCents(value, rule));
      }),
    );
  });
});

describe('roundToCents refuses an unknown rule', () => {
  it('with a MoneyError naming the three rules', () => {
    let thrown: unknown;
    try {
      roundToCents(unroundedCents(decimal('2.5')), 'ROUND_UP' as RoundingRule);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MoneyError);
    expect((thrown as MoneyError).message).toBe('rounding rule is not one of HALF_UP_CENT, HALF_EVEN_CENT or TRUNCATE');
  });
});

describe('roundOnce', () => {
  it('keeps the unrounded amount and the rule beside the cents', () => {
    const value = multiplyCents(cents(3333n), rate('0.85'));
    expect(roundOnce(value)).toEqual({ cents: 2833n, unrounded: value, rule: 'HALF_UP_CENT' });
    expect(roundOnce(value, 'TRUNCATE').cents).toBe(2833n);
    expect(roundOnce(unroundedCents(decimal('10.5')), 'HALF_EVEN_CENT')).toMatchObject({ cents: 10n, rule: 'HALF_EVEN_CENT' });
  });
});

describe('multiplyCents', () => {
  it('keeps the full unrounded product', () => {
    expect(multiplyCents(cents(1000n), rate('1.10')).toString()).toBe('1100');
    expect(multiplyCents(cents(3333n), rate('0.85')).toString()).toBe('2833.05');
    expect(multiplyCents(cents(1n), rate('0.000001')).toString()).toBe('0.000001');
  });

  it('reads only a bigint as cents: a number cast past the type is never converted into an amount', () => {
    // Cents go through centsToDecimal; anything else is used as the decimal it must already be, and a number is not one.
    expect(() => multiplyCents(12 as unknown as Cents, rate('2'))).toThrow(TypeError);
    expect(() => multiplyCents(12 as unknown as Cents, rate('2'))).not.toThrow(MoneyError);
  });

  it('multiplies an unrounded amount again without rounding in between', () => {
    const once = multiplyCents(cents(3333n), rate('0.85'));
    expect(multiplyCents(once, rate('0.98')).toString()).toBe('2776.389');
  });

  it('is exact: the product equals integer arithmetic on the scaled rate (property)', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }), sixPlaceRate, (amount, factor) => {
        const exact = decimal(amount * factor.scaled).dividedBy(decimal(10n ** 6n));
        expect(multiplyCents(cents(amount), factor.value).equals(exact)).toBe(true);
      }),
    );
  });

  it('doubles exactly when the amount doubles (property)', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 12n }), sixPlaceRate, (amount, factor) => {
        const doubled = multiplyCents(cents(amount * 2n), factor.value);
        expect(doubled.equals(multiplyCents(cents(amount), factor.value).times(decimal(2n)))).toBe(true);
      }),
    );
  });
});

describe('unrounded sums and conversions', () => {
  it('converts dollars to cents exactly', () => {
    expect(unroundedFromDollars(decimal('97.123456')).toString()).toBe('9712.3456');
  });

  it('adds and sums without rounding', () => {
    const a = unroundedCents(decimal('0.004'));
    const b = unroundedCents(decimal('0.004'));
    expect(addUnrounded(a, b).toString()).toBe('0.008');
    expect(sumUnrounded([a, b, a]).toString()).toBe('0.012');
    expect(sumUnrounded([]).isZero()).toBe(true);
    // Rounding each term first would give 0; rounding the sum once gives 0 too, but at 0.5 it differs.
    expect(roundToCents(sumUnrounded([unroundedCents(decimal('0.25')), unroundedCents(decimal('0.25'))]), 'HALF_UP_CENT')).toBe(1n);
  });

  it('sums associatively (property)', () => {
    fc.assert(
      fc.property(unrounded, unrounded, unrounded, (a, b, c) => {
        expect(addUnrounded(addUnrounded(a, b), c).equals(addUnrounded(a, addUnrounded(b, c)))).toBe(true);
        expect(sumUnrounded([a, b, c]).equals(sumUnrounded([c, a, b]))).toBe(true);
      }),
    );
  });
});
