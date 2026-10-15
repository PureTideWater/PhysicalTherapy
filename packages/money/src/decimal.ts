import { Decimal as DecimalJs } from 'decimal.js';

import { type Cents, MoneyError } from './cents';

/**
 * Decimal arithmetic for rates and unrounded amounts. Precision is far above anything numeric(18,6)
 * can hold, so intermediate products never lose a digit; values are only ever built from strings
 * or bigints, never from JavaScript numbers.
 */
export const Decimal = DecimalJs.clone({
  precision: 40,
  rounding: DecimalJs.ROUND_HALF_UP,
  toExpNeg: -40,
  toExpPos: 40,
});
export type Decimal = InstanceType<typeof Decimal>;
export type RoundingMode = DecimalJs.Rounding;

/** A rate column is numeric(14,6): up to eight integer digits and six decimal places. */
const RATE_PATTERN = /^-?\d{1,8}(?:\.\d{1,6})?$/;

/** Parses a rate ("1.10", "0.85", "33.2875") as stored in a numeric(14,6) column. */
export function rate(text: string): Decimal {
  if (!RATE_PATTERN.test(text)) {
    throw new MoneyError('rate is not a numeric(14,6) decimal');
  }
  return new Decimal(text);
}

/** The exact decimal value of an amount in cents, for use in rate arithmetic. */
export function centsToDecimal(cents: Cents): Decimal {
  return new Decimal(cents.toString());
}

/** Multiplies an amount by a rate, keeping the full unrounded result in cents. */
export function multiplyCents(cents: Cents, factor: Decimal): Decimal {
  return centsToDecimal(cents).times(factor);
}
