import { type Cents } from '@tp/money';

import type { DeadlineStatus } from './deadline';

/**
 * From validated to actionable (PRD 12; PRD 8, The status machine; PRD 6, Triage and cases: "A line
 * past its window cannot be actionable"; test matrix PRC-14, PRC-15, CAS-05). A priced line with
 * positive variance is validated. It becomes actionable when all of these hold on the day of triage:
 *
 * 1. its variance is at or above the per-line materiality (default $5): else BELOW_LINE_MATERIALITY;
 * 2. its dispute window is open on the triage date: else WINDOW_PASSED (or NO_WINDOW when the line has
 *    no known window: a window that cannot be shown open is not open), except that a contract window its version
 *    cites in a rule the engine does not compute yet (business days, months, or another start than the payment
 *    date: CONTRACT_WINDOW_RULE_NOT_COMPUTED) has no end the product can judge, so neither is said of it (the
 *    engine's date counts calendar days and may be earlier or later than the contract's); and its deadline is verified from a
 *    source a person signed off (deadline.ts, D17 a: a release record at L2 or higher, never the release's
 *    commercial_default, or a signed-off contract window with its page, quote and hash): else
 *    DEADLINE_UNVERIFIED (CO-06: "an unverified deadline blocks actionability"). It is a reason a validated
 *    line waits, never an unpriced reason: the line keeps its price;
 * 3. its claim is neither reversed nor superseded (a later remittance may reverse or correct it after
 *    the run): else CLAIM_REVERSED or CLAIM_SUPERSEDED;
 * 4. the plan mapping it priced under is still the plan's mapping in force on its service date (a correction
 *    since may map the plan to another contract, to Medicare Advantage non-contracted or to no agreement,
 *    MAP-03): else MAPPING_NOT_IN_FORCE, for every line; the contract version that priced it is signed off (a
 *    Medicare Advantage non-contracted line has no version: it priced from the public fee schedule): else
 *    VERSION_NOT_SIGNED_OFF, a version
 *    superseded by its correction since the run; and it still covers the line's service date (the
 *    resolver's rule, effective_from <= date < effective_to): else VERSION_NOT_IN_FORCE, a version an
 *    amendment closed before that date since the run (audit item #4: a back-dated amendment);
 * 5. its run's rule release has not been withdrawn since it was priced (a withdrawal records that the
 *    release's content was wrong): else RELEASE_WITHDRAWN, so a withdrawal drops the line out of the
 *    actionable totals at once, though the case keeps its line until PR 11 refreshes it. Steps 4 and 5
 *    are the database's priced_line_pricing_check() for a line on its pricing in effect (a database test
 *    runs both); and it was not priced without the Medicare limits its terms turn on: its trace read the per-code
 *    MPPR, the general MPPR or the MUE on a date its release's spans do not cover (audit #7; docs/adr/0071): else
 *    CONTENT_NOT_LOADED, held until a release that loads that content prices it again. A run of such lines is
 *    refused today, so this holds a line priced before the refusal existed, or under a release whose span a
 *    correction later narrowed;
 * 6. it is not a per-visit line (PER_VISIT_REVIEW) and carries no NCCI procedure-to-procedure review
 *    flag (NCCI_REVIEW): until the specialist answers QUESTIONS Q44 (whether a visit's variance is
 *    judged per visit) and Q41 (whether a standing edit keeps a line from becoming actionable), such a
 *    line stays validated for a person's review and joins no case (docs/adr/0040);
 * 7. it has no open write-off: else WRITTEN_OFF.
 *
 * A line with zero or negative variance is never validated: an overpayment is recorded on its priced
 * line and shown, and never becomes a case (PRC-15). A per-visit line is judged with its visit (PRD 11
 * step 2: the first included line carries the visit's amount and the rest expect zero): it validates at
 * most the visit's net shortfall (the sum of its lines' variance), and nothing when the visit as a whole
 * was paid in full, as when a payer spreads the visit's payment over its lines (the database's
 * priced_line_shortfall_cents() holds the same rule; a database test runs both). Every reason that
 * holds is returned, in this order.
 */

export const NOT_ACTIONABLE_REASONS = [
  'BELOW_LINE_MATERIALITY',
  'WINDOW_PASSED',
  'NO_WINDOW',
  'DEADLINE_UNVERIFIED',
  'CLAIM_REVERSED',
  'CLAIM_SUPERSEDED',
  'MAPPING_NOT_IN_FORCE',
  'VERSION_NOT_SIGNED_OFF',
  'VERSION_NOT_IN_FORCE',
  'RELEASE_WITHDRAWN',
  'CONTENT_NOT_LOADED',
  'PER_VISIT_REVIEW',
  'NCCI_REVIEW',
  'WRITTEN_OFF',
] as const;
export type NotActionableReason = (typeof NOT_ACTIONABLE_REASONS)[number];

/** What triage knows about a priced line on the triage date. */
export interface TriageFacts {
  /** Expected allowed less observed allowed; null for an unpriced line. */
  readonly varianceCents: Cents | null;
  /** The last day a dispute can be filed (YYYY-MM-DD); null when no window is known. */
  readonly windowEndsOn: string | null;
  /** Whether that deadline is verified (deadlineVerification(), D17 a); not_applicable without a window. */
  readonly deadlineStatus: DeadlineStatus;
  /**
   * Whether the window's end is one the product computes by the rule the line's agreement states: false for a contract
   * window cited in a rule the engine does not compute yet (deadlineVerification()'s CONTRACT_WINDOW_RULE_NOT_COMPUTED),
   * whose engine date is not the contract's, so no WINDOW_PASSED or NO_WINDOW is judged from it.
   */
  readonly windowRuleComputed: boolean;
  readonly claimReversed: boolean;
  readonly claimSuperseded: boolean;
  /** The mapping kind the line priced under: contract or ma_noncontracted. */
  readonly mappingKind: string | null;
  /**
   * Whether the mapping the line priced under is still the plan's mapping in force on its service date
   * (payer_plan_mapping_in_force(), @tp/contracts mappingInForce()): false once a correction covering that date supersedes it.
   */
  readonly mappingInForce: boolean;
  /** The status now of the contract version that priced it; null without one. */
  readonly contractVersionStatus: string | null;
  /**
   * Whether the contract version that priced it still covers its service date now (effective_from <= date <
   * effective_to); true when it names no version.
   */
  readonly contractVersionCoversService: boolean;
  /** Whether its run's rule release has been withdrawn since (a rule_release_withdrawal row of that release). */
  readonly releaseWithdrawn: boolean;
  /**
   * Whether the line's trace read the per-code MPPR, the general MPPR or the MUE on a date its release's spans do not
   * cover: it was priced without those limits. Absent is false, for callers that judge lines no release priced.
   */
  readonly contentNotLoaded?: boolean;
  readonly writtenOff: boolean;
  /**
   * For a line of a per-visit visit, the visit's net variance (the sum of the variance of the visit's
   * lines in the line's run); null for a line priced by any other method.
   */
  readonly visitVarianceCents: Cents | null;
  /** The review flags the line was priced with (its trace's outcome.review_flags, NCCI_PTP). */
  readonly reviewFlags: readonly string[];
}

export interface Judgement {
  readonly validated: boolean;
  readonly actionable: boolean;
  readonly reasons: readonly NotActionableReason[];
  /** The shortfall the line validates (its variance, at most its visit's net shortfall); null when not validated. */
  readonly validatedCents: Cents | null;
}

/**
 * The shortfall a priced line validates: its variance when positive; for a line of a per-visit visit,
 * at most the visit's net shortfall, and nothing when the visit was paid in full or more. Null when
 * the line validates nothing.
 */
export function shortfallOf(varianceCents: Cents | null, visitVarianceCents: Cents | null): Cents | null {
  if (varianceCents === null || varianceCents <= 0n) {
    return null;
  }
  if (visitVarianceCents === null) {
    return varianceCents;
  }
  if (visitVarianceCents <= 0n) {
    return null;
  }
  return visitVarianceCents < varianceCents ? visitVarianceCents : varianceCents;
}

/** Whether a window is open on a date: it ends on or after it (YYYY-MM-DD compares as text). */
export function windowOpen(windowEndsOn: string | null, asOf: string): boolean {
  return windowEndsOn !== null && windowEndsOn >= asOf;
}

export function judgeLine(facts: TriageFacts, lineMaterialityCents: Cents, asOf: string): Judgement {
  const shortfall = shortfallOf(facts.varianceCents, facts.visitVarianceCents);
  if (shortfall === null) {
    return { validated: false, actionable: false, reasons: [], validatedCents: null };
  }
  const reasons: NotActionableReason[] = [];
  if (shortfall < lineMaterialityCents) {
    reasons.push('BELOW_LINE_MATERIALITY');
  }
  if (!facts.windowRuleComputed) {
    // The engine's end is not the contract's (CONTRACT_WINDOW_RULE_NOT_COMPUTED): nothing is judged from it; DEADLINE_UNVERIFIED holds.
  } else if (facts.windowEndsOn === null) {
    reasons.push('NO_WINDOW');
  } else if (!windowOpen(facts.windowEndsOn, asOf)) {
    reasons.push('WINDOW_PASSED');
  }
  if (facts.deadlineStatus === 'unverified') {
    reasons.push('DEADLINE_UNVERIFIED');
  }
  if (facts.claimReversed) {
    reasons.push('CLAIM_REVERSED');
  }
  if (facts.claimSuperseded) {
    reasons.push('CLAIM_SUPERSEDED');
  }
  if (!facts.mappingInForce) {
    reasons.push('MAPPING_NOT_IN_FORCE');
  }
  if (facts.mappingKind !== 'ma_noncontracted' && facts.contractVersionStatus !== 'signed_off') {
    reasons.push('VERSION_NOT_SIGNED_OFF');
  }
  if (facts.mappingKind !== 'ma_noncontracted' && !facts.contractVersionCoversService) {
    reasons.push('VERSION_NOT_IN_FORCE');
  }
  if (facts.releaseWithdrawn) {
    reasons.push('RELEASE_WITHDRAWN');
  }
  if (facts.contentNotLoaded === true) {
    reasons.push('CONTENT_NOT_LOADED');
  }
  if (facts.visitVarianceCents !== null) {
    reasons.push('PER_VISIT_REVIEW');
  }
  if (facts.reviewFlags.length > 0) {
    reasons.push('NCCI_REVIEW');
  }
  if (facts.writtenOff) {
    reasons.push('WRITTEN_OFF');
  }
  return { validated: true, actionable: reasons.length === 0, reasons: NOT_ACTIONABLE_REASONS.filter((reason) => reasons.includes(reason)), validatedCents: shortfall };
}
