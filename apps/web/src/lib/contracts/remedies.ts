import type { UnpricedReason } from '@tp/pricing';

/**
 * The closed list of unpriced reasons with the meaning and remedy the Coverage screen shows for each
 * (Rules reference, "Unpriced reasons and their remedies"; docs/product/unpriced-reasons.md), and the
 * screen each remedy is taken on (PRD 7, Coverage: "links each reason to its remedy screen"). The
 * words are the rules reference's, copied exactly; remedies.test.ts compares them with the table, so a
 * change there fails here until both agree. A reason whose remedy is "None" links nowhere. Plain data:
 * safe to import in the browser.
 */

/** The screens a remedy is taken on, in the practice's workspace. */
export type RemedyScreen = 'mapping' | 'contracts' | 'claims';

export interface UnpricedReasonText {
  readonly reason: UnpricedReason;
  readonly meaning: string;
  readonly remedy: string;
  /** Where the customer takes the remedy, or null when there is nothing to do. */
  readonly screen: RemedyScreen | null;
}

/** In the rules reference's order. */
export const UNPRICED_REASON_TEXT: readonly UnpricedReasonText[] = [
  { reason: 'NO_MAPPING', meaning: 'The payer and plan have no mapping on the service date', remedy: 'Map the plan', screen: 'mapping' },
  { reason: 'NO_AGREEMENT', meaning: 'Mapped as out of network or no agreement', remedy: 'None; anomaly screening only', screen: null },
  { reason: 'AMBIGUOUS_RATE', meaning: 'More than one rate record matches', remedy: 'Specialist resolves scope', screen: 'contracts' },
  { reason: 'NO_RATE_FOR_CODE', meaning: 'The agreement has no term for the code', remedy: 'Obtain the exhibit page or confirm exclusion', screen: 'contracts' },
  { reason: 'NO_PFS_VALUE', meaning: 'No RVU for the code in the basis year', remedy: 'Check the code and year; some codes are carrier-priced', screen: 'claims' },
  { reason: 'UNSUPPORTED_METHOD', meaning: 'Capitation or undefined case rate', remedy: 'None; reported', screen: null },
  { reason: 'SECONDARY_PAYER', meaning: 'Claim status 2 or 3', remedy: 'Deferred release', screen: null },
  { reason: 'MUE_EXCEEDED', meaning: 'Units above the MUE with NCCI on', remedy: 'Review the claim', screen: 'claims' },
  { reason: 'UNITS_RULE_UNKNOWN', meaning: 'Timed-units rule unknown for the payer', remedy: 'Confirm with the contract or import minutes', screen: 'contracts' },
  { reason: 'DATE_OUTSIDE_VERSIONS', meaning: 'No signed-off version covers the service date', remedy: 'Obtain the amendment or confirm the window', screen: 'contracts' },
  { reason: 'REVERSED_CLAIM', meaning: 'The claim was reversed and not corrected', remedy: 'None', screen: null },
  { reason: 'ENGINE_ERROR', meaning: 'Unexpected input', remedy: 'Operator alert', screen: null },
];

const BY_REASON = new Map(UNPRICED_REASON_TEXT.map((entry) => [entry.reason, entry]));

/** The meaning and remedy of one reason. */
export function unpricedReasonText(reason: UnpricedReason): UnpricedReasonText {
  return BY_REASON.get(reason) as UnpricedReasonText;
}

/** The names of the remedy screens, as the navigation shows them. */
export const REMEDY_SCREEN_NAMES: Readonly<Record<RemedyScreen, string>> = {
  mapping: 'Payer and plan mapping',
  contracts: 'Contracts',
  claims: 'Claims and lines',
};

/** The remedy screen's path in a practice's workspace. */
export function remedyPath(practiceId: string, screen: RemedyScreen): string {
  return `/p/${practiceId}/${screen}`;
}
