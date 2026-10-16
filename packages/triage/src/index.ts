/**
 * @tp/triage: turning priced lines into work a person can finish (PRD 12; milestone 6). Pure functions
 * over the facts a pricing run and the case records hold: anomaly cohorts with their minimum size and
 * investigatory label, the five-stage line status with monotonic moves and explicit reopens, the
 * judgement from validated to actionable on a triage date, the adjustment behavior detected from a
 * trace, case grouping by payer pattern with case materiality, case totals and deadlines, pursuit-cost
 * estimates, write-off reasons and the three-number headline. No database, clock or network inside.
 */
export { type Judgement, NOT_ACTIONABLE_REASONS, type NotActionableReason, type TriageFacts, judgeLine, shortfallOf, windowOpen } from './actionable';
export {
  ANOMALY_STATS_FORMAT,
  type AnomalyCohort,
  type AnomalyStats,
  type CohortKey,
  INVESTIGATORY,
  SCREENED_REASONS,
  type ScreenedLine,
  type ScreeningSettings,
  cohortId,
  quarterOf,
  screenAnomalies,
} from './anomaly';
export { ADJUSTMENT_BEHAVIORS, type AdjustmentBehavior, BEHAVIOR_TEXT, BEHAVIOR_TOLERANCE_CENTS, type BehaviorReferences, detectBehavior, releaseReferences } from './behavior';
export {
  type CaseLineState,
  type CaseTotals,
  type DeadlineState,
  WRITE_OFF_REASONS,
  WRITE_OFF_TEXT,
  type WriteOff,
  type WriteOffReason,
  caseTotals,
  daysBetween,
  deadlineState,
  netExpectedValue,
  pursuitCost,
  windowsClosed,
  writeOffSchema,
} from './cases';
export { type Headline, type HeadlineFigure, type HeadlineInput, STAGE_LABELS, headline } from './headline';
export { type CandidateLine, type CasePlan, type GroupingSettings, type HeldPattern, type PatternKey, type PlannedCase, type PlannedLine, patternId, planCases } from './patterns';
export { DEFAULT_TRIAGE_SETTINGS, type PursuitSettings, type TriageSettings, TriageSettingsError, triageSettings } from './settings';
export {
  CASE_STATES,
  type CaseDispute,
  type CaseState,
  type CaseStateLine,
  DISPUTE_RESPONSES,
  type DisputeResponse,
  LEDGER_STAGES,
  LINE_STAGES,
  type LineStage,
  type StageEvent,
  StageTransitionError,
  advanceTo,
  checkStageEvent,
  deriveCaseState,
  isLineStage,
  stageRank,
} from './stages';
