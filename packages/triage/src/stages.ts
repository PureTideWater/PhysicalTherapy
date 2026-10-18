/**
 * The five line stages and the case states (PRD 8, The status machine; docs/product/diagrams/
 * status-machine.svg). A line moves forward through five stages and only the last one is money:
 *
 * - flagged: an anomaly cohort or a priced variance exists; shown as a count, never as a dollar claim;
 * - validated: priced under a signed-off version with a trace, expected allowed above observed allowed;
 * - actionable: validated, inside its dispute window, above the line materiality, attached to a case;
 * - payer_approved: a payer response or an adjusted remittance accepts the amount;
 * - recovered: cash posted (and deposited where available), net of recoupments and reversals.
 *
 * Stages are monotonic forward. A reopen is the one way a line's stage is set again without moving
 * forward: an explicit action with a reason (and an audit event), recorded with the stage it was
 * reopened from; it keeps the stage (reopening a written-off line) or moves it back (a recoupment
 * reopens a recovered line, milestone 9). The line_status table holds the same rule in SQL
 * (migrations/20261019160000_triage_cases_and_audit_reports.sql); a database test runs both.
 */

export const LINE_STAGES = ['flagged', 'validated', 'actionable', 'payer_approved', 'recovered'] as const;
export type LineStage = (typeof LINE_STAGES)[number];

/** The stage's place in the order, 0 for flagged. */
export function stageRank(stage: LineStage): number {
  return LINE_STAGES.indexOf(stage);
}

export function isLineStage(value: unknown): value is LineStage {
  return typeof value === 'string' && (LINE_STAGES as readonly string[]).includes(value);
}

/**
 * The stages only the recovery ledger sets (milestone 9): a line is payer approved on a payer response
 * or an adjusted remittance, and recovered only on a ledger entry at stage posted or deposited
 * (CLAUDE.md: never count anything as recovered without one). Until the ledger exists nothing sets them.
 */
export const LEDGER_STAGES: readonly LineStage[] = ['payer_approved', 'recovered'];

export class StageTransitionError extends Error {
  override readonly name = 'StageTransitionError';
}

/** One stage event of a line: the stage it is set to, and for a reopen the stage it was reopened from and why. */
export interface StageEvent {
  readonly stage: LineStage;
  readonly reopenedFrom: LineStage | null;
  readonly reason: string | null;
}

/**
 * Checks an event against the line's current stage (null before its first event); throws
 * StageTransitionError with the rule's words otherwise. A forward event moves to a later stage; a
 * reopen names the current stage as the one it reopens from, keeps or lowers the stage, and says why.
 */
export function checkStageEvent(current: LineStage | null, event: StageEvent): void {
  if (LEDGER_STAGES.includes(event.stage)) {
    throw new StageTransitionError('a line reaches payer approved or recovered (posted or deposited) only from the recovery ledger (milestone 9)');
  }
  if (event.reopenedFrom === null) {
    if (current !== null && stageRank(event.stage) <= stageRank(current)) {
      throw new StageTransitionError('line stages move forward only; setting a stage again or an earlier one is an explicit reopen with a reason');
    }
    return;
  }
  if (current === null || event.reopenedFrom !== current) {
    throw new StageTransitionError('a reopen names the stage the line is at');
  }
  if (stageRank(event.stage) > stageRank(current)) {
    throw new StageTransitionError('a reopen keeps the line at its stage or moves it back; moving forward is not a reopen');
  }
  if (event.reason === null || event.reason.trim() === '') {
    throw new StageTransitionError('a reopen says why');
  }
}

/** The forward event that brings a line to `target`, or null when it is there or further already. */
export function advanceTo(current: LineStage | null, target: LineStage): StageEvent | null {
  if (current !== null && stageRank(current) >= stageRank(target)) {
    return null;
  }
  return { stage: target, reopenedFrom: null, reason: null };
}

/** Case states (PRD 8): derived from the case's lines and submissions, never set by hand except write-off. */
export const CASE_STATES = ['open', 'submitted', 'awaiting_response', 'partially_resolved', 'resolved', 'closed_written_off'] as const;
export type CaseState = (typeof CASE_STATES)[number];

/** The kinds of payer response a submission can receive (Data dictionary, payer_response.kind). */
export const DISPUTE_RESPONSES = ['accepted', 'partial', 'denied', 'info_requested', 'reprocessed_no_change'] as const;
export type DisputeResponse = (typeof DISPUTE_RESPONSES)[number];

/** Where a case's dispute stands: its latest submission's latest response, if any. */
export interface CaseDispute {
  readonly response: DisputeResponse | null;
  /** Whether that response is a denial that reopened the case for the next dispute level. */
  readonly reopened: boolean;
}

export interface CaseStateLine {
  readonly writtenOff: boolean;
  /** The line's current stage; payer approved and recovered resolve it (the ledger sets them). */
  readonly stage?: LineStage | null;
  /**
   * The line was moved back from payer approved or recovered to an earlier stage: by the recovery ledger
   * when the payer took the money back (a recoupment, PRD 13: "reopens the case"), or by a person's
   * explicit reopen (docs/adr/0042).
   */
  readonly reopenedFromApproval?: boolean;
}

/**
 * A case's state from its lines and submissions (PRD 8: "derived from its lines and its submissions,
 * never set by hand except for write-off"; docs/adr/0041), in this order:
 *
 * - closed_written_off: every line is written off (the only state a person sets, by writing lines off);
 * - resolved: every line not written off is payer approved or recovered;
 * - partially_resolved: some of them are;
 * - awaiting_response: a line was moved back from payer approved or recovered (the recovery ledger's
 *   recoupment, or a person's reopen), whatever the payer answered before: the case is reopened and
 *   waits on the payer again;
 * - open: no submission has been logged;
 * - submitted: the latest submission has no response yet;
 * - awaiting_response: the payer asked for more information, or denied the dispute and the case was
 *   reopened for the next level, which the practice's next submission answers;
 * - partially_resolved: the payer accepted part of it;
 * - resolved: the payer accepted it, denied it (and the case was not reopened) or reprocessed it with
 *   no change.
 *
 * The case table derives the same in SQL (case_rules); a database test runs both.
 */
export function deriveCaseState(lines: readonly CaseStateLine[], dispute: CaseDispute | null = null): CaseState {
  if (lines.length > 0 && lines.every((line) => line.writtenOff)) {
    return 'closed_written_off';
  }
  const open = lines.filter((line) => !line.writtenOff);
  const resolved = open.filter((line) => line.stage !== undefined && line.stage !== null && LEDGER_STAGES.includes(line.stage)).length;
  if (open.length > 0 && resolved === open.length) {
    return 'resolved';
  }
  if (resolved > 0) {
    return 'partially_resolved';
  }
  if (open.some((line) => line.reopenedFromApproval === true)) {
    return 'awaiting_response';
  }
  if (dispute === null) {
    return 'open';
  }
  switch (dispute.response) {
    case null:
      return 'submitted';
    case 'info_requested':
      return 'awaiting_response';
    case 'denied':
      return dispute.reopened ? 'awaiting_response' : 'resolved';
    case 'partial':
      return 'partially_resolved';
    case 'accepted':
    case 'reprocessed_no_change':
      return 'resolved';
  }
}
