import { Decimal as DecimalJs } from 'decimal.js';

import { type Cents, MoneyError } from './cents';

/**
 * The arithmetic engine: decimal.js at 40 significant digits, far above anything numeric(18,6) can
 * hold, so intermediate products never lose a digit. Exponent notation is switched off, so text
 * output is always plain digits.
 */
const Engine = DecimalJs.clone({
  precision: 40,
  rounding: DecimalJs.ROUND_HALF_UP,
  toExpNeg: -9_000_000_000_000_000,
  toExpPos: 9_000_000_000_000_000,
});
type EngineDecimal = InstanceType<typeof Engine>;

declare const DECIMAL: unique symbol;

/**
 * An exact decimal for rates, relative values, indices and unrounded amounts. The interface is
 * deliberately narrower than decimal.js: operands are other decimals only (never a JavaScript
 * number), there is no `toNumber`, and nothing here rounds. The one rounding step is
 * `roundToCents` in rounding.ts.
 */
export interface Decimal {
  readonly [DECIMAL]: true;
  plus(other: Decimal): Decimal;
  minus(other: Decimal): Decimal;
  times(other: Decimal): Decimal;
  /** Exact for terminating quotients; otherwise correct to 40 significant digits. */
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
  /** Plain decimal text with every digit ("2833.05"); never exponent notation. */
  toString(): string;
  toJSON(): string;
}

/** Plain decimal text: digits with an optional fraction and sign. No exponent, no NaN, no Infinity. */
const DECIMAL_TEXT = /^-?\d+(?:\.\d+)?$/;

function fromEngine(value: EngineDecimal): Decimal {
  return value as unknown as Decimal;
}

function toEngine(value: Decimal): EngineDecimal {
  return value as unknown as EngineDecimal;
}

/** The decimal.js rounding modes behind the three contract rules (rounding.ts). */
export const ENGINE_MODES = {
  halfUp: DecimalJs.ROUND_HALF_UP,
  halfEven: DecimalJs.ROUND_HALF_EVEN,
  towardZero: DecimalJs.ROUND_DOWN,
} as const;
export type EngineMode = keyof typeof ENGINE_MODES;

/** Rounds to a whole number under one mode. Internal to this package: callers use `roundToCents`. */
export function roundToInteger(value: Decimal, mode: EngineMode): bigint {
  return BigInt(toEngine(value).toDecimalPlaces(0, ENGINE_MODES[mode]).toFixed(0));
}

export function isDecimal(value: unknown): value is Decimal {
  return value instanceof Engine;
}

/**
 * Builds a decimal from plain decimal text ("0.85", "-12", "33.2875"), a bigint, or another decimal.
 * A JavaScript number is refused at compile time and at runtime: a float has already lost digits.
 */
export function decimal(value: string | bigint | Decimal): Decimal {
  if (typeof value === 'bigint') {
    return fromEngine(new Engine(value.toString()));
  }
  if (typeof value === 'string') {
    if (!DECIMAL_TEXT.test(value)) {
      throw new MoneyError('decimal text must be plain digits with an optional fraction');
    }
    return fromEngine(new Engine(value));
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
