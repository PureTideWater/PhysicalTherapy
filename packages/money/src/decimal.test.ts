import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { MoneyError, cents } from './cents';
import { type Decimal, QUOTIENT_DIGITS, centsToDecimal, decimal, isDecimal, rate } from './decimal';
import { roundToCents, unroundedCents } from './rounding';

describe('decimal', () => {
  it.each(['0', '-0', '1', '-12', '0.85', '33.2875', '0.000000000000000000000000000001', '123456789012345678901234567890'])(
    'reads %s exactly',
    (text) => {
      expect(decimal(text).equals(decimal(text))).toBe(true);
      expect(decimal(text).toString()).toBe(text.replace(/^-0$/, '0'));
    },
  );

  it('reads bigints and passes decimals through', () => {
    expect(decimal(12345678901234567890n).toString()).toBe('12345678901234567890');
    const value = decimal('1.5');
    expect(decimal(value)).toBe(value);
  });

  it.each(['', '.5', '5.', '1e3', '1E-2', ' 1', '1 ', '+1', '1,5', 'NaN', 'Infinity', '-Infinity', '0x10', '--1'])(
    'refuses %j',
    (text) => {
      expect(() => decimal(text)).toThrow(MoneyError);
    },
  );

  it('refuses a number that reached it through a cast', () => {
    expect(() => decimal((1 / 2) as unknown as string)).toThrow(/never a number/);
    expect(() => decimal(null as unknown as string)).toThrow(MoneyError);
  });

  it('never writes exponent notation', () => {
    expect(decimal('1').dividedBy(decimal(10n ** 30n)).toString()).toBe('0.000000000000000000000000000001');
    expect(decimal(10n ** 45n).toString()).toBe(`1${'0'.repeat(45)}`);
    expect(JSON.stringify({ rate: decimal('0.85') })).toBe('{"rate":"0.85"}');
  });

  it('does the arithmetic the engine needs, exactly', () => {
    const a = decimal('0.1');
    const b = decimal('0.2');
    expect(a.plus(b).toString()).toBe('0.3');
    expect(b.minus(a).toString()).toBe('0.1');
    expect(a.times(b).toString()).toBe('0.02');
    expect(decimal('85').dividedBy(decimal('100')).toString()).toBe('0.85');
    expect(a.negated().toString()).toBe('-0.1');
    expect(a.negated().abs().toString()).toBe('0.1');
    expect(a.comparedTo(b)).toBe(-1);
    expect(a.lessThan(b) && a.lessThanOrEqualTo(a) && b.greaterThan(a) && b.greaterThanOrEqualTo(b)).toBe(true);
    expect(decimal('0.00').isZero() && decimal('-0').isZero()).toBe(true);
    expect(decimal('2.000').isInteger() && !decimal('2.5').isInteger()).toBe(true);
    expect(decimal('33.2875').decimalPlaces()).toBe(4);
  });

  it('keeps forty significant digits on a quotient that does not terminate', () => {
    expect(QUOTIENT_DIGITS).toBe(40);
    expect(decimal('1').dividedBy(decimal('3')).toString()).toBe(`0.${'3'.repeat(40)}`);
    expect(decimal('2').dividedBy(decimal('3')).significantDigits()).toBe(40);
  });

  it('never rounds a sum, a difference or a product, however many digits it needs', () => {
    const tiny = decimal(`0.${'0'.repeat(40)}1`);
    expect(decimal('0.5').minus(tiny).toString()).toBe(`0.4${'9'.repeat(40)}`);
    expect(decimal('1000000000000000000000000000000').plus(decimal('0.00000000001')).toString()).toBe('1000000000000000000000000000000.00000000001');
    let product = decimal('1');
    for (let factor = 0; factor < 8; factor += 1) {
      product = product.times(decimal('99.999999'));
    }
    expect(product.significantDigits()).toBeGreaterThan(40);
    expect(product.toString()).toBe(
      '9999999200000027.999999440000006999999944000000279999999200000001',
    );
  });

  it('rounds a half that sits just below a half, after a sub-precision term, down (no double rounding)', () => {
    const justBelowHalf = unroundedCents(decimal('0.5').minus(decimal(`0.${'0'.repeat(40)}1`)));
    expect(roundToCents(justBelowHalf, 'HALF_UP_CENT')).toBe(0n);
    expect(roundToCents(justBelowHalf, 'HALF_EVEN_CENT')).toBe(0n);
    expect(roundToCents(unroundedCents(decimal('0.5')), 'HALF_UP_CENT')).toBe(1n);
  });

  it('refuses operands that are not decimals, at runtime too', () => {
    expect(() => decimal('1').plus(1 as unknown as Decimal)).toThrow(MoneyError);
    expect(() => decimal('1').comparedTo({} as unknown as Decimal)).toThrow(/takes decimals only/);
  });

  it('recognizes its own values', () => {
    expect(isDecimal(decimal('1'))).toBe(true);
    expect(isDecimal('1')).toBe(false);
    expect(isDecimal(1n)).toBe(false);
  });

  it('adds associatively on amounts with up to six places (property)', () => {
    const value = fc
      .tuple(fc.bigInt({ min: -(10n ** 18n), max: 10n ** 18n }), fc.integer({ min: 0, max: 6 }))
      .map(([digits, scale]) => decimal(digits).dividedBy(decimal(10n ** BigInt(scale))));
    fc.assert(
      fc.property(value, value, value, (a, b, c) => {
        expect(a.plus(b).plus(c).equals(a.plus(b.plus(c)))).toBe(true);
        expect(a.times(b).times(c).equals(a.times(b.times(c)))).toBe(true);
      }),
    );
  });
});

describe('rate', () => {
  it.each(['1.10', '0.85', '33.2875', '12345678.123456', '99999999.999999', '-0.02', '2', '0.000001'])('accepts %s', (text) => {
    expect(rate(text).toString()).toBe(decimal(text).toString());
  });

  it.each(['', '1.1234567', '0.0000001', '123456789', '100000000', '1e2', '.5', 'NaN', 'Infinity', '1,1', '1.'])(
    'refuses %j',
    (text) => {
      expect(() => rate(text)).toThrow(MoneyError);
    },
  );
});

describe('each refusal is a MoneyError with its own message', () => {
  it.each([
    ['decimal text', () => decimal('5.'), 'decimal text must be plain digits with an optional fraction'],
    ['a number for a decimal', () => decimal((1 / 2) as unknown as string), 'decimals are built from text, a bigint or another decimal, never a number'],
    ['a number as an operand', () => decimal('1').times(2 as unknown as Decimal), 'decimal arithmetic takes decimals only, never a number'],
    ['a rate', () => rate('1.1234567'), 'rate is not a numeric(14,6) decimal'],
  ])('%s', (_name, run, message) => {
    let thrown: unknown;
    try {
      run();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MoneyError);
    expect((thrown as MoneyError).name).toBe('MoneyError');
    expect((thrown as MoneyError).message).toBe(message);
  });
});

describe('centsToDecimal', () => {
  it('is the exact value of the cents', () => {
    expect(centsToDecimal(cents(-12345n)).toString()).toBe('-12345');
    expect(centsToDecimal(cents(900719925474099399n)).toString()).toBe('900719925474099399');
  });
});
