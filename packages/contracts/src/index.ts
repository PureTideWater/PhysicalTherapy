/**
 * @tp/contracts: contracts, versions, rate records with evidence, and the specialist workflow
 * (milestone 4). Rate records live in the database under the practice's policy.
 */

/** Rate methods a rate record can carry (PRD section 9). */
export const RATE_METHODS = [
  'FIXED_SCHEDULE',
  'PERCENT_OF_MEDICARE',
  'LESSER_OF',
  'PER_VISIT',
  'UNSUPPORTED',
] as const;
export type RateMethod = (typeof RATE_METHODS)[number];

/** Contract version states; only `signed_off` versions price lines (PRD section 9). */
export const CONTRACT_VERSION_STATES = ['draft', 'proposed', 'approved', 'signed_off', 'superseded'] as const;
export type ContractVersionState = (typeof CONTRACT_VERSION_STATES)[number];

/** Medicare adjustment flags; each defaults to off on a commercial contract (PRD section 9). */
export const ADJUSTMENT_FLAGS = [
  'apply_mppr',
  'apply_assistant_reduction',
  'apply_sequestration',
  'apply_ncci',
] as const;
export type AdjustmentFlag = (typeof ADJUSTMENT_FLAGS)[number];

/** How a contract counts timed units (PRD section 9, `timed_units_rule`). */
export const TIMED_UNITS_RULES = ['MEDICARE_POOLED', 'PER_CODE', 'UNKNOWN'] as const;
export type TimedUnitsRule = (typeof TIMED_UNITS_RULES)[number];
