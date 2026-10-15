/**
 * @tp/pricing: the expected-payment engine (milestones 5 and 7). Pure functions over line facts,
 * the agreement, signed-off rate records, a rule release and practice settings. No database,
 * network or clock inside.
 */

/** The closed list of unpriced reasons (PRD section 11). A line is priced or carries one of these. */
export const UNPRICED_REASONS = [
  'NO_AGREEMENT',
  'NO_MAPPING',
  'AMBIGUOUS_RATE',
  'NO_RATE_FOR_CODE',
  'NO_PFS_VALUE',
  'UNSUPPORTED_METHOD',
  'SECONDARY_PAYER',
  'MUE_EXCEEDED',
  'UNITS_RULE_UNKNOWN',
  'DATE_OUTSIDE_VERSIONS',
  'REVERSED_CLAIM',
  'ENGINE_ERROR',
] as const;
export type UnpricedReason = (typeof UNPRICED_REASONS)[number];
