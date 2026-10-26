/**
 * The recovery ledger as other apps use it (@tp/worker/ledger; docs/adr/0042): the reconciliation work a
 * person does in a request scope (the unmatched items with their evidence and candidates, a match by
 * hand, its reversal, an adjustment, the ledger settings and the posting template, an ROI statement on
 * demand) and the practice's totals, its approval shortfalls, and the payer's corrections read in payment
 * terms (billable to the patient, shown and never counted; docs/adr/0067). Every write is in the person's
 * own name, needs posting.reconcile (the proof level, the practice administrator), and is audited; the
 * reconcile job does the rest, and the roi_statement job prints the statements.
 */
export { type Scope, practiceLedgerSettings } from './ledger';
export { type ManualContext, ReconciliationError, type ReconciliationRefusal, adjustEntry, matchClaimByHand, matchDepositByHand, matchPostingByHand, reverseMatch } from './manual';
export { LedgerSettingsRefused, setLedgerSettings, setPostingTemplate } from './settings';
export { approvalShortfalls } from './shortfalls';
export { type CorrectionKind, type LineCorrection, type MatchCorrection, type MatchReading, casePatientBalance, lineCorrections } from './patient-share';
export { STATEMENT_COLUMNS, storedStatement } from './print';
export {
  DEFAULT_STATEMENT_SOURCES,
  type FeeSource,
  type GeneratedStatement,
  NO_BILLING,
  NO_TIME_LOG,
  type PursuitHoursSource,
  type StatementSources,
  generateRoiStatement,
  practiceLedgerTotals,
} from './statements';
export { type CaseLineCandidate, type RemittanceCandidate, type UnmatchedAdjustedPayment, type UnmatchedDeposit, type UnmatchedItems, type UnmatchedPosting, unmatchedItems } from './unmatched';
