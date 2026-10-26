import { UNPRICED_MEANING, UNPRICED_REMEDY } from '@tp/packets/explain';
import type { UnpricedReason } from '@tp/pricing';

/**
 * The closed list of unpriced reasons with the meaning and remedy the Coverage screen shows for each
 * (Rules reference, "Unpriced reasons and their remedies"; docs/product/unpriced-reasons.md), and the
 * screen each remedy is taken on (PRD 7, Coverage: "links each reason to its remedy screen"). The
 * words are the rules reference's, copied exactly once, into @tp/packets/explain, which a line's
 * calculation in words quotes too (docs/adr/0072), so a screen and the words never say a reason two
 * ways; remedies.test.ts still compares them with the table, so a change there fails here until both
 * agree. A reason whose remedy is "None" links nowhere. Plain data: safe to import in the browser.
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

/** The screen each reason's remedy is taken on, in the rules reference's order. */
const SCREENS: Readonly<Record<UnpricedReason, RemedyScreen | null>> = {
  NO_MAPPING: 'mapping',
  NO_AGREEMENT: null,
  AMBIGUOUS_RATE: 'contracts',
  NO_RATE_FOR_CODE: 'contracts',
  NO_PFS_VALUE: 'claims',
  UNSUPPORTED_METHOD: null,
  SECONDARY_PAYER: null,
  MUE_EXCEEDED: 'claims',
  UNITS_RULE_UNKNOWN: 'contracts',
  DATE_OUTSIDE_VERSIONS: 'contracts',
  REVERSED_CLAIM: null,
  ENGINE_ERROR: null,
};

/** In the rules reference's order. */
export const UNPRICED_REASON_TEXT: readonly UnpricedReasonText[] = (Object.entries(SCREENS) as [UnpricedReason, RemedyScreen | null][]).map(([reason, screen]) => ({
  reason,
  meaning: UNPRICED_MEANING[reason],
  remedy: UNPRICED_REMEDY[reason],
  screen,
}));

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
