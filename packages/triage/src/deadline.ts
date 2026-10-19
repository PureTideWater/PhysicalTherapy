import type { TraceWindow } from '@tp/pricing';
import { VERIFICATION_LEVELS, type VerificationLevel } from '@tp/rules';

/**
 * Whether a line's dispute deadline is verified (Change Order 001, CO-05 and CO-06; reconciliation-001 D17 (a),
 * approved 2026-10-17; docs/adr/0061). A deadline is verified only from a source a person signed off:
 *
 * - a release window (Medicare redetermination for a Medicare Advantage non-contracted line): the rule record the
 *   trace names (its release and SHA-256) is Medicare's, of a release not withdrawn, and at the minimum level or
 *   higher, L2 for actionability and the export, L3 for the E3 gate (PR 9), and the contract specialist has
 *   confirmed that the route applies to a Medicare Advantage payment dispute at all (golden QUESTIONS Q34; best-option
 *   audit #5): until then (MA_DISPUTE_ROUTE_CONFIRMED false, and ma_dispute_route_confirmed() in the database) no
 *   release window is verified, so no Medicare Advantage packet exports. The release's commercial_default, the
 *   window a silent contract falls back to, is never verified, whatever its level;
 * - a contract window: the version the trace names is signed off, its dispute window cited with a document, a
 *   page, a quote and a hash (contract_version.dispute_window_evidence) and the rule the quote states (its unit and
 *   what it is counted from), that rule the one the engine computes (COMPUTED_CONTRACT_WINDOW: calendar days after
 *   the remittance date), verified by a contract specialist, and its days are the trace's length, in days from the
 *   remittance date. A window counted another way (business days, months, or from the date of service) stays
 *   unverified until PR 6c computes it, so a verified date is never later than the contract's.
 *
 * Derived from the stored trace (steps.window and agreement.contract_version_id) and the facts the worker reads
 * beside it (apps/worker/src/triage/deadline.ts): the release record's level, whether its release was withdrawn,
 * and the version's window. The engine
 * is untouched and nothing here is a price: DEADLINE_UNVERIFIED is a reason a validated line is not actionable
 * (actionable.ts), never an unpriced reason. Pure: no database, clock or network. The database holds the same
 * rule in priced_line_deadline_status(), case_next_window_deadline_status() and packet_version_deadline_status()
 * (migration 20261103090000), and a database test runs both on the same lines.
 */

export const DEADLINE_STATUSES = ['verified', 'unverified', 'not_applicable'] as const;
export type DeadlineStatus = (typeof DEADLINE_STATUSES)[number];

/** Why a deadline is unverified, one cause each (the first that holds, in this order). */
export const DEADLINE_UNVERIFIED_CAUSES = [
  /** A release's commercial_default window: never verified. */
  'COMMERCIAL_DEFAULT',
  /** The release the trace names holds no dispute-window record of the trace's SHA-256. */
  'RECORD_NOT_IN_RELEASE',
  /** The release the record belongs to was withdrawn (rule_release_withdrawal): its content was wrong, so no one stands behind the record. */
  'RELEASE_WITHDRAWN',
  /** The record is below the minimum level (L2, or L3 for E3). */
  'RECORD_BELOW_LEVEL',
  /** The contract specialist has not confirmed which dispute route applies to a Medicare Advantage non-contracted line (golden QUESTIONS Q34). */
  'MA_ROUTE_UNCONFIRMED',
  /** The contract version's window carries no complete citation (document, page, quote and hash). */
  'CONTRACT_WINDOW_UNCITED',
  /** Cited with a rule (unit and start) the engine does not compute yet (PR 6c): the date shown counts calendar days from the remittance date. */
  'CONTRACT_WINDOW_RULE_NOT_COMPUTED',
  /** Cited, but no contract specialist has verified it. */
  'CONTRACT_WINDOW_UNVERIFIED',
  /** The version that priced the line is no longer signed off (superseded since the run). */
  'CONTRACT_VERSION_NOT_SIGNED_OFF',
  /** The version's verified window is not the window the line was priced with. */
  'CONTRACT_WINDOW_DIFFERS',
  /** The next dispute level's window comes from a contract's appeal levels, which carry no evidence. */
  'NEXT_LEVEL_UNCITED',
  /** The reconsideration record in force now does not give the next level's stored end from the denial: it is not the record the date came from. */
  'NEXT_LEVEL_DIFFERS',
] as const;
export type DeadlineUnverifiedCause = (typeof DEADLINE_UNVERIFIED_CAUSES)[number];

/** L2 for actionability and the PR 5 export; L3 for the E3 gate (the SQL's minimum_level). */
export type DeadlineMinimumLevel = 'L2' | 'L3';
export const DEFAULT_DEADLINE_LEVEL: DeadlineMinimumLevel = 'L2';

/**
 * Whether the contract specialist has confirmed which dispute route applies to a Medicare Advantage non-contracted
 * line (golden QUESTIONS Q34: a payment dispute under the plan's own policy, or Original Medicare's
 * redetermination). False until the specialist answers; the database's ma_dispute_route_confirmed() holds the same
 * value, a later migration replaces both, and a database test holds them together. While false, no release window
 * is verified (MA_ROUTE_UNCONFIRMED), so no Medicare Advantage packet exports and its actionable totals drop.
 */
export const MA_DISPUTE_ROUTE_CONFIRMED: boolean = false;

/**
 * The one contract window rule the engine computes (packages/pricing/src/windows.ts): the version's days counted as
 * calendar days after the remittance date (BPR16). @tp/contracts holds the same literal (COMPUTED_CONTRACT_WINDOW_RULE)
 * and the database the same test (contract_window_rule_computed()); triage depends on neither, and a database test
 * holds the three together. PR 6c widens all three.
 */
export const COMPUTED_CONTRACT_WINDOW: { readonly unit: string; readonly measuredFrom: string } = Object.freeze({ unit: 'calendar_days', measuredFrom: 'remittance_date' });

/**
 * Where the contract states its window: contract_version.dispute_window_evidence, as a rate record cites its terms,
 * with the rule the quote states (contract_version.dispute_window_unit and dispute_window_measured_from, which exist
 * exactly with a citation).
 */
export interface ContractWindowEvidence {
  readonly documentId: string;
  readonly page: number;
  readonly quote: string;
  readonly hash: string;
  /** calendar_days, business_days or months, as the quote counts the days. */
  readonly unit: string;
  /** date_of_service, remittance_date, payment_date or receipt_date, as the quote names its start. */
  readonly measuredFrom: string;
}

/** Whether a cited rule is the one the engine computes (contract_window_rule_computed()). */
export function contractWindowRuleComputed(rule: { readonly unit: string; readonly measuredFrom: string }): boolean {
  return rule.unit === COMPUTED_CONTRACT_WINDOW.unit && rule.measuredFrom === COMPUTED_CONTRACT_WINDOW.measuredFrom;
}

/** The contract version the trace names, as it stands now. */
export interface ContractWindowFacts {
  readonly contractVersionId: string;
  readonly status: string;
  readonly disputeWindowDays: number | null;
  readonly evidence: ContractWindowEvidence | null;
  /** The contract specialist who verified the window, and when (ISO timestamp); both null until verified. */
  readonly verifiedBy: string | null;
  readonly verifiedAt: string | null;
}

/**
 * What the rule reads of a trace: its window step and the contract version its agreement names. A stored trace
 * (a PricingTrace, or Pick<PricingTrace, 'agreement' | 'steps'>) is one.
 */
export interface DeadlineTrace {
  readonly agreement: { readonly contract_version_id: string | null } | null;
  readonly steps: { readonly window: TraceWindow | null };
}

export interface DeadlineInput {
  readonly trace: DeadlineTrace;
  /** The level of the rule record named by the trace's release number and steps.window.record.sha256; null when the release holds none. */
  readonly recordLevel: VerificationLevel | null;
  /** Whether the release the trace names was withdrawn (a rule_release_withdrawal row): its records verify nothing. */
  readonly releaseWithdrawn: boolean;
  /** The version named by agreement.contract_version_id; null when there is none or it cannot be read. */
  readonly contractWindow: ContractWindowFacts | null;
  readonly minimumLevel?: DeadlineMinimumLevel;
}

export interface DeadlineVerification {
  readonly status: DeadlineStatus;
  /** The window's source as the trace has it: the contract, the release, or none. */
  readonly source: 'contract' | 'release' | null;
  /** The last day a dispute can be filed, as the trace computed it; null without a window. */
  readonly endsOn: string | null;
  /** The release record's level, for a release window; null otherwise. */
  readonly level: VerificationLevel | null;
  /** Null unless unverified. */
  readonly cause: DeadlineUnverifiedCause | null;
}

/** Whether a level is at the minimum or above (L1 < L2 < L3). */
export function levelAtLeast(level: VerificationLevel | null, minimum: DeadlineMinimumLevel): boolean {
  return level !== null && VERIFICATION_LEVELS.indexOf(level) >= VERIFICATION_LEVELS.indexOf(minimum);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;

/**
 * Whether evidence names a document, a page, a quote and a hash, as rate_record_evidence_complete() reads it: a
 * lower-case UUID, a page from 1 to 999999, a quote that is not only spaces (PostgreSQL's btrim) and a SHA-256.
 */
export function windowEvidenceComplete(evidence: ContractWindowEvidence): boolean {
  return (
    UUID.test(evidence.documentId) &&
    Number.isInteger(evidence.page) &&
    evidence.page >= 1 &&
    evidence.page <= 999_999 &&
    evidence.quote.replace(/^ +| +$/g, '') !== '' &&
    SHA256.test(evidence.hash)
  );
}

const NOT_APPLICABLE: DeadlineVerification = { status: 'not_applicable', source: null, endsOn: null, level: null, cause: null };

/** A line's deadline: exactly one of not_applicable (no window), verified (cause null) or unverified with its cause. */
export function deadlineVerification(input: DeadlineInput): DeadlineVerification {
  const minimum = input.minimumLevel ?? DEFAULT_DEADLINE_LEVEL;
  const window = input.trace.steps.window;
  if (window === null || window.source === null) {
    return NOT_APPLICABLE;
  }
  const endsOn = window.ends_on;
  if (window.source === 'release') {
    const level = input.recordLevel;
    const unverified = (cause: DeadlineUnverifiedCause): DeadlineVerification => ({ status: 'unverified', source: 'release', endsOn, level, cause });
    const program = window.record?.key.program ?? null;
    if (program === 'commercial_default') {
      return unverified('COMMERCIAL_DEFAULT');
    }
    if (program !== 'medicare' || level === null) {
      return unverified('RECORD_NOT_IN_RELEASE');
    }
    if (input.releaseWithdrawn) {
      return unverified('RELEASE_WITHDRAWN');
    }
    if (!levelAtLeast(level, minimum)) {
      return unverified('RECORD_BELOW_LEVEL');
    }
    if (!MA_DISPUTE_ROUTE_CONFIRMED) {
      return unverified('MA_ROUTE_UNCONFIRMED');
    }
    return { status: 'verified', source: 'release', endsOn, level, cause: null };
  }
  const unverified = (cause: DeadlineUnverifiedCause): DeadlineVerification => ({ status: 'unverified', source: 'contract', endsOn, level: null, cause });
  const facts = input.contractWindow;
  const versionId = input.trace.agreement?.contract_version_id ?? null;
  if (facts === null || versionId === null || facts.contractVersionId !== versionId || facts.evidence === null || !windowEvidenceComplete(facts.evidence)) {
    return unverified('CONTRACT_WINDOW_UNCITED');
  }
  if (!contractWindowRuleComputed(facts.evidence)) {
    return unverified('CONTRACT_WINDOW_RULE_NOT_COMPUTED');
  }
  if (facts.verifiedBy === null || facts.verifiedAt === null) {
    return unverified('CONTRACT_WINDOW_UNVERIFIED');
  }
  if (facts.status !== 'signed_off') {
    return unverified('CONTRACT_VERSION_NOT_SIGNED_OFF');
  }
  if (window.unit !== 'days' || window.measured_from !== 'remittance_date' || facts.disputeWindowDays === null || facts.disputeWindowDays !== window.length) {
    return unverified('CONTRACT_WINDOW_DIFFERS');
  }
  return { status: 'verified', source: 'contract', endsOn, level: null, cause: null };
}

export interface NextLevelDeadlineInput {
  /** contract: the version's appeal levels; regulation: the Medicare reconsideration window (Medicare Advantage non-contracted). */
  readonly basis: 'contract' | 'regulation';
  /** The level of the reconsideration record in force now (the release in force, on the day the reopening denial was received); null when none is. */
  readonly recordLevel: VerificationLevel | null;
  /**
   * The end that record gives from the reopening denial (case_next_dispute_window() read now); null when it gives none.
   * The deadline is verified only when it is the stored end: otherwise the date came from another record.
   */
  readonly recordEndsOn: string | null;
  /** The next level's window end (payer_response.next_window_ends_on). */
  readonly endsOn: string | null;
  readonly minimumLevel?: DeadlineMinimumLevel;
}

/**
 * The deadline of a dispute's next level, after a denial reopened the case (dispute level 2 and above): a contract's
 * appeal levels carry no page, quote or hash, so they are never verified; the regulation's reconsideration window is
 * verified as a release window is, from the record that gives the stored end: one that gives another end (a later
 * release's, say) is not the record the date came from (NEXT_LEVEL_DIFFERS), and only once the specialist has
 * confirmed the Medicare Advantage route (MA_ROUTE_UNCONFIRMED until then, Q34).
 */
export function nextLevelDeadlineVerification(input: NextLevelDeadlineInput): DeadlineVerification {
  if (input.basis === 'contract') {
    return { status: 'unverified', source: 'contract', endsOn: input.endsOn, level: null, cause: 'NEXT_LEVEL_UNCITED' };
  }
  const level = input.recordLevel;
  if (level === null) {
    return { status: 'unverified', source: 'release', endsOn: input.endsOn, level, cause: 'RECORD_NOT_IN_RELEASE' };
  }
  if (input.endsOn === null || input.recordEndsOn !== input.endsOn) {
    return { status: 'unverified', source: 'release', endsOn: input.endsOn, level, cause: 'NEXT_LEVEL_DIFFERS' };
  }
  if (!levelAtLeast(level, input.minimumLevel ?? DEFAULT_DEADLINE_LEVEL)) {
    return { status: 'unverified', source: 'release', endsOn: input.endsOn, level, cause: 'RECORD_BELOW_LEVEL' };
  }
  if (!MA_DISPUTE_ROUTE_CONFIRMED) {
    return { status: 'unverified', source: 'release', endsOn: input.endsOn, level, cause: 'MA_ROUTE_UNCONFIRMED' };
  }
  return { status: 'verified', source: 'release', endsOn: input.endsOn, level, cause: null };
}

/** A packet's deadline over its lines: not_applicable with no line, verified when every line's is, unverified otherwise. */
export function packetDeadlineStatus(lines: readonly Pick<DeadlineVerification, 'status'>[]): DeadlineStatus {
  if (lines.length === 0) {
    return 'not_applicable';
  }
  return lines.every((line) => line.status === 'verified') ? 'verified' : 'unverified';
}
