/**
 * @tp/triage: anomaly cohorts, line status transitions and case grouping by payer pattern
 * (milestone 6).
 */

/** The five line stages, in their monotonic order (PRD section 8). Reopen is an explicit action. */
export const LINE_STAGES = ['flagged', 'validated', 'actionable', 'payer_approved', 'recovered'] as const;
export type LineStage = (typeof LINE_STAGES)[number];

/** Case states, derived from lines and submissions except for write-off (PRD section 8). */
export const CASE_STATES = [
  'open',
  'submitted',
  'awaiting_response',
  'partially_resolved',
  'resolved',
  'closed_written_off',
] as const;
export type CaseState = (typeof CASE_STATES)[number];
