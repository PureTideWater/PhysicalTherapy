import { type Cents, MoneyError, cents } from './cents';
import { type Decimal, type EngineMode, centsToDecimal, decimal, roundToInteger } from './decimal';

declare const UNROUNDED: unique symbol;

/**
 * An amount in cents that has not been rounded yet ("2833.05" cents). Only `roundToCents` turns it
 * into `Cents`, and `Cents` cannot be passed back in, so a line's amount is rounded exactly once.
 */
export type UnroundedCents = Decimal & { readonly [UNROUNDED]: true };

/** Marks a decimal number of cents as the unrounded amount a rounding rule will be applied to. */
export function unroundedCents(valueInCents: Decimal): UnroundedCents {
  return decimal(valueInCents) as UnroundedCents;
}

const HUNDRED = decimal(100n);

/** An unrounded amount in cents from a decimal number of dollars (a fee-schedule amount). */
export function unroundedFromDollars(dollars: Decimal): UnroundedCents {
  return unroundedCents(dollars.times(HUNDRED));
}

/** Multiplies an amount by a rate, keeping the full unrounded product in cents. Nothing is rounded. */
export function multiplyCents(amount: Cents | UnroundedCents, factor: Decimal): UnroundedCents {
  const base = typeof amount === 'bigint' ? centsToDecimal(amount) : amount;
  return unroundedCents(base.times(factor));
}

export function addUnrounded(a: UnroundedCents, b: UnroundedCents): UnroundedCents {
  return unroundedCents(a.plus(b));
}

/** Sums unrounded amounts exactly (no rounding between terms). */
export function sumUnrounded(amounts: Iterable<UnroundedCents>): UnroundedCents {
  let total = decimal(0n);
  for (const amount of amounts) {
    total = total.plus(amount);
  }
  return unroundedCents(total);
}

/** The contract rounding rules a rate record can name (PRD section 9, `flags.rounding`). */
export const ROUNDING_RULES = ['HALF_UP_CENT', 'HALF_EVEN_CENT', 'TRUNCATE'] as const;
export type RoundingRule = (typeof ROUNDING_RULES)[number];

/** Used when a contract is silent (PRD section 11, step 6). */
export const DEFAULT_ROUNDING: RoundingRule = 'HALF_UP_CENT';

const MODES: Record<RoundingRule, EngineMode> = {
  // Halves move away from zero.
  HALF_UP_CENT: 'halfUp',
  // Halves move to the even cent.
  HALF_EVEN_CENT: 'halfEven',
  // Fractions of a cent are dropped toward zero.
  TRUNCATE: 'towardZero',
};

/**
 * Rounds an unrounded amount to whole cents under a contract rule. This is the one rounding step a
 * priced line takes; callers keep the unrounded value beside the result (see `roundOnce`).
 */
export function roundToCents(unrounded: UnroundedCents, rule: RoundingRule): Cents {
  if (!Object.hasOwn(MODES, rule)) {
    throw new MoneyError('rounding rule is not one of HALF_UP_CENT, HALF_EVEN_CENT or TRUNCATE');
  }
  return cents(roundToInteger(unrounded, MODES[rule]));
}

/** A rounded amount with the unrounded value and the rule kept beside it, as a priced line stores them. */
export interface RoundedAmount {
  readonly cents: Cents;
  readonly unrounded: UnroundedCents;
  readonly rule: RoundingRule;
}

/** Rounds once under `rule` (the contract's, or `HALF_UP_CENT` when it is silent) and keeps the unrounded value. */
export function roundOnce(unrounded: UnroundedCents, rule: RoundingRule = DEFAULT_ROUNDING): RoundedAmount {
  return { cents: roundToCents(unrounded, rule), unrounded, rule };
}
