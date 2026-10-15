import { Decimal as DecimalJs } from 'decimal.js';

import { type Cents, MoneyError } from './cents';

/** Significant digits kept on a quotient that does not terminate (the only inexact operation). */
export const QUOTIENT_DIGITS = 40;

/**
 * Two decimal.js engines. Sums, differences and products are exact: the `Exact` engine keeps up to
 * a billion significant digits (decimal.js's maximum), so plus, minus and times never round, however
 * many digits their operands carry. Division is the only operation that can need infinitely many
 * digits, so a quotient that does not terminate is computed by the `Quotient` engine and stops at
 * 40 significant digits, far below a cent at any amount numeric(18,6) can hold; a quotient that
 * terminates (dividing by 100 for a percentage) is exact. Exponent notation is never written.
 */
const PLAIN_TEXT = { toExpNeg: -9_000_000_000_000_000, toExpPos: 9_000_000_000_000_000 } as const;
const Exact = DecimalJs.clone({ precision: 1_000_000_000, rounding: DecimalJs.ROUND_HALF_UP, ...PLAIN_TEXT });
const Quotient = DecimalJs.clone({ precision: QUOTIENT_DIGITS, rounding: DecimalJs.ROUND_HALF_UP, ...PLAIN_TEXT });
type EngineDecimal = InstanceType<typeof Exact>;

declare const DECIMAL: unique symbol;

/**
 * An exact decimal for rates, relative values, indices and unrounded amounts. The interface is
 * deliberately narrower than decimal.js: operands are other decimals only (never a JavaScript
 * number), there is no `toNumber`, and nothing here rounds an amount. The one rounding step is
 * `roundToCents` in rounding.ts.
 */
export interface Decimal {
  readonly [DECIMAL]: true;
  /** Exact. */
  plus(other: Decimal): Decimal;
  /** Exact. */
  minus(other: Decimal): Decimal;
  /** Exact. */
  times(other: Decimal): Decimal;
  /** Exact for terminating quotients; otherwise correct to 40 significant digits (QUOTIENT_DIGITS). */
  dividedBy(other: Decimal): Decimal;
  negated(): Decimal;
  abs(): Decimal;
  comparedTo(other: Decimal): number;
  equals(other: Decimal): boolean;
  lessThan(other: Decimal): boolean;
  lessThanOrEqualTo(other: Decimal): boolean;
  greaterThan(other: Decimal): boolean;
  greaterThanOrEqualTo(other: Decimal): boolean;
  isZero(): boolean;
  isInteger(): boolean;
  /** How many digits follow the decimal point (a count, not an amount). */
  decimalPlaces(): number;
  /** How many significant digits the value has (a count, not an amount). */
  significantDigits(): number;
  /** Plain decimal text with every digit ("2833.05"); never exponent notation. */
  toString(): string;
  toJSON(): string;
}

/**
 * The implementation behind `Decimal`: a decimal.js value of the `Exact` engine, which callers
 * never see (the interface has no way to reach it). Operands that are not decimals are refused at
 * runtime as well as at compile time.
 */
class ExactDecimal {
  readonly value: EngineDecimal;

  constructor(value: EngineDecimal) {
    this.value = value;
  }

  plus(other: Decimal): Decimal {
    return wrap(Exact.add(this.value, unwrap(other)));
  }

  minus(other: Decimal): Decimal {
    return wrap(Exact.sub(this.value, unwrap(other)));
  }

  times(other: Decimal): Decimal {
    return wrap(Exact.mul(this.value, unwrap(other)));
  }

  dividedBy(other: Decimal): Decimal {
    return wrap(new Exact(Quotient.div(this.value, unwrap(other))));
  }

  negated(): Decimal {
    return wrap(this.value.negated());
  }

  abs(): Decimal {
    return wrap(this.value.abs());
  }

  comparedTo(other: Decimal): number {
    return this.value.comparedTo(unwrap(other));
  }

  equals(other: Decimal): boolean {
    return this.value.equals(unwrap(other));
  }

  lessThan(other: Decimal): boolean {
    return this.value.lessThan(unwrap(other));
  }

  lessThanOrEqualTo(other: Decimal): boolean {
    return this.value.lessThanOrEqualTo(unwrap(other));
  }

  greaterThan(other: Decimal): boolean {
    return this.value.greaterThan(unwrap(other));
  }

  greaterThanOrEqualTo(other: Decimal): boolean {
    return this.value.greaterThanOrEqualTo(unwrap(other));
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isInteger(): boolean {
    return this.value.isInteger();
  }

  decimalPlaces(): number {
    return this.value.decimalPlaces();
  }

  significantDigits(): number {
    return this.value.precision();
  }

  toString(): string {
    return this.value.toFixed();
  }

  toJSON(): string {
    return this.toString();
  }
}

function wrap(value: EngineDecimal): Decimal {
  return new ExactDecimal(value) as unknown as Decimal;
}

function unwrap(value: Decimal): EngineDecimal {
  if (!(value instanceof ExactDecimal)) {
    throw new MoneyError('decimal arithmetic takes decimals only, never a number');
  }
  return value.value;
}

/** Plain decimal text: digits with an optional fraction and sign. No exponent, no NaN, no Infinity. */
const DECIMAL_TEXT = /^-?\d+(?:\.\d+)?$/;

/** The decimal.js rounding modes behind the three contract rules (rounding.ts). */
export const ENGINE_MODES = {
  halfUp: DecimalJs.ROUND_HALF_UP,
  halfEven: DecimalJs.ROUND_HALF_EVEN,
  towardZero: DecimalJs.ROUND_DOWN,
} as const;
export type EngineMode = keyof typeof ENGINE_MODES;

/** Rounds to a whole number under one mode. Internal to this package: callers use `roundToCents`. */
export function roundToInteger(value: Decimal, mode: EngineMode): bigint {
  return BigInt(unwrap(value).toDecimalPlaces(0, ENGINE_MODES[mode]).toFixed(0));
}

export function isDecimal(value: unknown): value is Decimal {
  return value instanceof ExactDecimal;
}

/**
 * Builds a decimal from plain decimal text ("0.85", "-12", "33.2875"), a bigint, or another decimal.
 * A JavaScript number is refused at compile time and at runtime: a float has already lost digits.
 */
export function decimal(value: string | bigint | Decimal): Decimal {
  if (typeof value === 'bigint') {
    return wrap(new Exact(value.toString()));
  }
  if (typeof value === 'string') {
    if (!DECIMAL_TEXT.test(value)) {
      throw new MoneyError('decimal text must be plain digits with an optional fraction');
    }
    return wrap(new Exact(value));
  }
  if (isDecimal(value)) {
    return value;
  }
  throw new MoneyError('decimals are built from text, a bigint or another decimal, never a number');
}

/** A rate column is numeric(14,6): up to eight integer digits and six decimal places. */
const RATE_PATTERN = /^-?\d{1,8}(?:\.\d{1,6})?$/;

/** Parses a rate ("1.10", "0.85", "33.2875") as stored in a numeric(14,6) column. */
export function rate(text: string): Decimal {
  if (!RATE_PATTERN.test(text)) {
    throw new MoneyError('rate is not a numeric(14,6) decimal');
  }
  return decimal(text);
}

/** The exact decimal value of an amount in cents. */
export function centsToDecimal(amount: Cents): Decimal {
  return decimal(amount);
}
