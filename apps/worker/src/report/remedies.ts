import type { UnpricedReason } from '@tp/pricing';

/**
 * The remedy of each unpriced reason, as the audit report's evidence gaps state it: the words of the
 * Rules reference's table "Unpriced reasons and their remedies" (docs/product/unpriced-reasons.md),
 * copied exactly; remedies.test.ts compares them with the table, so a change there fails here until
 * both agree.
 */
export const UNPRICED_REMEDIES: Readonly<Record<UnpricedReason, { readonly meaning: string; readonly remedy: string }>> = {
  NO_MAPPING: { meaning: 'The payer and plan have no mapping on the service date', remedy: 'Map the plan' },
  NO_AGREEMENT: { meaning: 'Mapped as out of network or no agreement', remedy: 'None; anomaly screening only' },
  AMBIGUOUS_RATE: { meaning: 'More than one rate record matches', remedy: 'Specialist resolves scope' },
  NO_RATE_FOR_CODE: { meaning: 'The agreement has no term for the code', remedy: 'Obtain the exhibit page or confirm exclusion' },
  NO_PFS_VALUE: { meaning: 'No RVU for the code in the basis year', remedy: 'Check the code and year; some codes are carrier-priced' },
  UNSUPPORTED_METHOD: { meaning: 'Capitation or undefined case rate', remedy: 'None; reported' },
  SECONDARY_PAYER: { meaning: 'Claim status 2 or 3', remedy: 'Deferred release' },
  MUE_EXCEEDED: { meaning: 'Units above the MUE with NCCI on', remedy: 'Review the claim' },
  UNITS_RULE_UNKNOWN: { meaning: 'Timed-units rule unknown for the payer', remedy: 'Confirm with the contract or import minutes' },
  DATE_OUTSIDE_VERSIONS: { meaning: 'No signed-off version covers the service date', remedy: 'Obtain the amendment or confirm the window' },
  REVERSED_CLAIM: { meaning: 'The claim was reversed and not corrected', remedy: 'None' },
  ENGINE_ERROR: { meaning: 'Unexpected input', remedy: 'Operator alert' },
};
