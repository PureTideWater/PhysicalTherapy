import type { Cents } from './cents';
import { Decimal, type RoundingMode } from './decimal';

/** The contract rounding rules a rate record can name (PRD section 9, `flags.rounding`). */
export const ROUNDING_RULES = ['HALF_UP_CENT', 'HALF_EVEN_CENT', 'TRUNCATE'] as const;
export type RoundingRule = (typeof ROUNDING_RULES)[number];

/** Used when a contract is silent (PRD section 11, step 6). */
export const DEFAULT_ROUNDING: RoundingRule = 'HALF_UP_CENT';

const MODES: Record<RoundingRule, RoundingMode> = {
  // Halves move away from zero.
  HALF_UP_CENT: Decimal.ROUND_HALF_UP,
  // Halves move to the even cent.
  HALF_EVEN_CENT: Decimal.ROUND_HALF_EVEN,
  // Fractions of a cent are dropped toward zero.
  TRUNCATE: Decimal.ROUND_DOWN,
};

/**
 * Rounds an unrounded amount, expressed in cents, to whole cents under a contract rule. This is
 * the one rounding step a priced line takes; callers keep the unrounded value beside the result.
 */
export function roundToCents(unroundedCents: Decimal, rule: RoundingRule): Cents {
  return BigInt(unroundedCents.toDecimalPlaces(0, MODES[rule]).toFixed(0));
}
