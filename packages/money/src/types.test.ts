import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  type Cents,
  type Decimal,
  type UnroundedCents,
  addCents,
  cents,
  decimal,
  formatCents,
  multiplyCents,
  rate,
  roundToCents,
  unroundedCents,
} from './index';

/**
 * Float misuse is a compile error. Every `@ts-expect-error` below must stay an error: `pnpm
 * typecheck` fails if any of these lines starts to compile. The runtime assertions only keep the
 * lines reachable.
 */
describe('the types refuse floats and unchecked values', () => {
  it('brands amounts, so a number or a plain bigint is not cents', () => {
    expectTypeOf(cents(1n)).toEqualTypeOf<Cents>();
    expectTypeOf<bigint>().not.toExtend<Cents>();
    expectTypeOf<number>().not.toExtend<Cents>();
    // @ts-expect-error a JavaScript number is never an amount
    expect(() => formatCents(12)).toThrow();
    // @ts-expect-error a plain bigint has not been through cents() or a parser
    expect(formatCents(12n)).toBe('0.12');
    // @ts-expect-error cents are built from a bigint, not a number
    expect(() => cents(12)).toThrow();
  });

  it('keeps arithmetic on cents branded only through the helpers', () => {
    const a = cents(1n);
    expectTypeOf(addCents(a, a)).toEqualTypeOf<Cents>();
    expectTypeOf(a + a).toEqualTypeOf<bigint>();
    expect(() => {
      // @ts-expect-error bigint and number do not mix, so cents times a float cannot be written
      const product: unknown = a * 2;
      return product;
    }).toThrow(TypeError);
  });

  it('builds decimals from text or bigints only', () => {
    expectTypeOf(decimal('0.85')).toEqualTypeOf<Decimal>();
    // @ts-expect-error a float has already lost digits
    expect(() => decimal(1)).toThrow();
    // @ts-expect-error rates are text, as numeric(14,6) columns arrive
    expect(() => rate(1)).toThrow();
  });

  it('takes only decimals as operands and offers no way back to a number', () => {
    const value = decimal('1.5');
    // @ts-expect-error operands are decimals, never numbers
    expect(() => value.times(2)).toThrow(/takes decimals only, never a number/);
    // @ts-expect-error operands are decimals, never strings
    expect(() => value.plus('1')).toThrow(/takes decimals only/);
    // @ts-expect-error there is no toNumber
    const toNumber: unknown = value.toNumber;
    // @ts-expect-error there is no rounding outside roundToCents
    const toDecimalPlaces: unknown = value.toDecimalPlaces;
    expect([typeof toNumber, typeof toDecimalPlaces]).toEqual(['undefined', 'undefined']);
  });

  it('rounds unrounded amounts once, and refuses to round cents or bare decimals', () => {
    const unrounded = multiplyCents(cents(3333n), rate('0.85'));
    expectTypeOf(unrounded).toEqualTypeOf<UnroundedCents>();
    expectTypeOf(roundToCents(unrounded, 'HALF_UP_CENT')).toEqualTypeOf<Cents>();
    // @ts-expect-error cents are already rounded; rounding again is refused
    expect(() => roundToCents(cents(5n), 'HALF_UP_CENT')).toThrow();
    // @ts-expect-error a bare decimal must be marked as unrounded cents first
    expect(roundToCents(decimal('2.5'), 'HALF_UP_CENT')).toBe(3n);
    expect(roundToCents(unroundedCents(decimal('2.5')), 'HALF_UP_CENT')).toBe(3n);
    // @ts-expect-error only the three contract rules exist
    expect(() => roundToCents(unrounded, 'ROUND_UP')).toThrow();
  });
});
