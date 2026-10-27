/**
 * @tp/ledger: the recovery ledger's pure rules (milestone 9; PRD 13). Signed, append-only entries by
 * stage and the totals derived from them ("recovered" is never a typed number), the matching decisions
 * for remittances, posting exports and EFT exports, pro-rata allocation, the export templates, the
 * practice's ledger settings and the ROI statement. Nothing here reads a database, a clock or a model;
 * the worker's reconcile step (apps/worker/src/reconcile) reads and writes the rows.
 */
export { allocateByWeight, cumulativeShare, partialShare, takeInOrder } from './allocation';
export { parseCsv } from './csv';
export { type PairableLine, pairLines, pairedLine } from './pairing';
export {
  type CheckPosting,
  type ClaimCandidate,
  type ClaimMatchKey,
  type PostedClaim,
  type PostedClaimLine,
  type Reprocessing,
  batchMatches,
  checkPosting,
  depositMatches,
  linePosting,
  postsLine,
  preferredCandidates,
  reprocessing,
} from './matching';
export { type ClaimAdjustmentPart, type ClaimAllocation, type ClaimPaymentLine, type ClaimSplitLine, type LinePayment, type PaidLine, type PatientShare, type PatientShareChange, type PaymentBaselines, type PaymentChain, type PaymentEvent, type PaymentOutcome, type ReversalTakeBack, type ShareLine, claimAdjustmentParts, claimAllocations, claimLevelShares, claimLinePayments, keptClaimPart, originalBaselines, patientShareChange, paymentChain, paymentMatchOutcome, paymentOutcome, paymentStep, reversalTakeBack, unpaidPayment } from './payment';
export { type OpenCase, type RoiInput, type RoiStatement, approvedUnproved, previousQuarter, quarterOf, quarterPeriod, ratioText, roiStatement } from './roi';
export {
  RECONCILIATION_REASONS,
  type ReconciledToCash,
  type ReconciliationReason,
  type ReportReconciliation,
  type ReportReconciliationInput,
  reconciliationSource,
  reportReconciliation,
} from './reconciliation';
export { type FigureCheck, ROI_CSV_COLUMNS, type StatementCheck, type StoredStatement, csvField, recomputeStatement, roiStatementCsv } from './statement';
export { type LedgerSettings, LedgerSettingsError, POSTING_TEMPLATE_KEY, PROOF_LEVEL_KEY, ledgerSettings, postingTemplateOf, postingTemplateSetting } from './settings';
export {
  ALLOCATABLE_STAGES,
  CORRECTING_STAGES,
  COUNTED_STAGES,
  type CorrectingStage,
  type CountedStage,
  DEFAULT_PROOF_LEVEL,
  EVIDENCE_KINDS,
  type EvidenceKind,
  LEDGER_STAGES,
  LedgerError,
  type LedgerEntry,
  type LedgerStage,
  PROOF_LEVELS,
  type ProofLevel,
  STAGE_EVIDENCE,
  STAGE_SIGN,
  type StageSign,
  correctedEntry,
  countedStage,
  entryProblems,
  isCorrecting,
  isLedgerStage,
  isProofLevel,
  recoveredLabel,
} from './stages';
export {
  BUILT_IN_POSTING_TEMPLATES,
  DATE_FORMATS,
  type DateFormat,
  EFT_FIELDS,
  type EftExportRow,
  type EftField,
  type EftTemplate,
  type ExportRead,
  type ExportTemplate,
  POSTING_FIELDS,
  PROMPT_POSTING_V0,
  type PostingExportRow,
  type PostingField,
  type PostingTemplate,
  RAINTREE_POSTING_V0,
  REQUIRED_EFT_FIELDS,
  REQUIRED_POSTING_FIELDS,
  type RowProblem,
  SPRY_POSTING_V0,
  SYNTHETIC_BANK_EXPORT_V1,
  SYNTHETIC_PM_EXPORT_V1,
  TEMPLATE_STATUSES,
  type TemplateStatus,
  VENDOR_POSTING_TEMPLATES,
  WEBPT_BILLING_POSTING_V0,
  exportColumns,
  readDate,
  readEftExport,
  readPostingExport,
  procedureCodeOf,
  templateProblems,
} from './templates';
export {
  type ForwardBalance,
  type LedgerTotals,
  type LineFigures,
  approvedNotProved,
  type StageTotals,
  caseEntries,
  entriesById,
  ledgerTotals,
  lineEntries,
  lineFigures,
  lineLedgerStage,
  payerApproved,
  pendingForwardBalanceCents,
  periodEntries,
  recoveredCents,
} from './totals';
