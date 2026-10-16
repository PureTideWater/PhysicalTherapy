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
    throw new StageTransitionError('a line is payer approved or recovered only from the recovery ledger (milestone 9)');
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

/**
 * A case's state from its lines. Submissions and payer responses arrive with the workbench
 * (milestone 8) and add submitted, awaiting_response, partially_resolved and resolved; until then a
 * case is open, or closed_written_off once every one of its lines is written off (the only state a
 * person sets, by writing the lines off). The case table derives the same in SQL.
 */
export function deriveCaseState(lines: readonly { readonly writtenOff: boolean }[]): CaseState {
  return lines.length > 0 && lines.every((line) => line.writtenOff) ? 'closed_written_off' : 'open';
}
