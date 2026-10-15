import { type Cents } from '@tp/money';

/**
 * From validated to actionable (PRD 12; PRD 8, The status machine; PRD 6, Triage and cases: "A line
 * past its window cannot be actionable"; test matrix PRC-14, PRC-15, CAS-05). A priced line with
 * positive variance is validated. It becomes actionable when all of these hold on the day of triage:
 *
 * 1. its variance is at or above the per-line materiality (default $5): else BELOW_LINE_MATERIALITY;
 * 2. its dispute window is open on the triage date: else WINDOW_PASSED (or NO_WINDOW when the line has
 *    no known window: a window that cannot be shown open is not open);
 * 3. its claim is neither reversed nor superseded (a later remittance may reverse or correct it after
 *    the run): else CLAIM_REVERSED or CLAIM_SUPERSEDED;
 * 4. the contract version that priced it is signed off (a Medicare Advantage non-contracted line has
 *    no version: it priced from the public fee schedule): else VERSION_NOT_SIGNED_OFF, a version
 *    superseded by its correction since the run;
 * 5. it has no open write-off: else WRITTEN_OFF.
 *
 * A line with zero or negative variance is never validated: an overpayment is recorded on its priced
 * line and shown, and never becomes a case (PRC-15). Every reason that holds is returned, in this order.
 */

export const NOT_ACTIONABLE_REASONS = ['BELOW_LINE_MATERIALITY', 'WINDOW_PASSED', 'NO_WINDOW', 'CLAIM_REVERSED', 'CLAIM_SUPERSEDED', 'VERSION_NOT_SIGNED_OFF', 'WRITTEN_OFF'] as const;
export type NotActionableReason = (typeof NOT_ACTIONABLE_REASONS)[number];

/** What triage knows about a priced line on the triage date. */
export interface TriageFacts {
  /** Expected allowed less observed allowed; null for an unpriced line. */
  readonly varianceCents: Cents | null;
  /** The last day a dispute can be filed (YYYY-MM-DD); null when no window is known. */
  readonly windowEndsOn: string | null;
  readonly claimReversed: boolean;
  readonly claimSuperseded: boolean;
  /** The mapping kind the line priced under: contract or ma_noncontracted. */
  readonly mappingKind: string | null;
  /** The status now of the contract version that priced it; null without one. */
  readonly contractVersionStatus: string | null;
  readonly writtenOff: boolean;
}

export interface Judgement {
  readonly validated: boolean;
  readonly actionable: boolean;
  readonly reasons: readonly NotActionableReason[];
}

/** Whether a window is open on a date: it ends on or after it (YYYY-MM-DD compares as text). */
export function windowOpen(windowEndsOn: string | null, asOf: string): boolean {
  return windowEndsOn !== null && windowEndsOn >= asOf;
}

export function judgeLine(facts: TriageFacts, lineMaterialityCents: Cents, asOf: string): Judgement {
  if (facts.varianceCents === null || facts.varianceCents <= 0n) {
    return { validated: false, actionable: false, reasons: [] };
  }
  const reasons: NotActionableReason[] = [];
  if (facts.varianceCents < lineMaterialityCents) {
    reasons.push('BELOW_LINE_MATERIALITY');
  }
  if (facts.windowEndsOn === null) {
    reasons.push('NO_WINDOW');
  } else if (!windowOpen(facts.windowEndsOn, asOf)) {
    reasons.push('WINDOW_PASSED');
  }
  if (facts.claimReversed) {
    reasons.push('CLAIM_REVERSED');
  }
  if (facts.claimSuperseded) {
    reasons.push('CLAIM_SUPERSEDED');
  }
  if (facts.mappingKind !== 'ma_noncontracted' && facts.contractVersionStatus !== 'signed_off') {
    reasons.push('VERSION_NOT_SIGNED_OFF');
  }
  if (facts.writtenOff) {
    reasons.push('WRITTEN_OFF');
  }
  return { validated: true, actionable: reasons.length === 0, reasons: NOT_ACTIONABLE_REASONS.filter((reason) => reasons.includes(reason)) };
}
