export {
  APPROVAL_PREFIX,
  APPROVERS_LIST,
  type ApprovalCheck,
  EARLIEST_APPROVAL_DATE,
  PROVENANCE_LINE_INDEX,
  PROVENANCE_PREFIX,
  approvalFields,
  approvalLineOf,
  approvalProblems,
  awaitingApprovalLine,
  comparableText,
  documentApprovalProblems,
  documentSha256,
  documentToWrite,
  firstDifference,
  notAName,
  provenanceLine,
  provenanceProblems,
} from './approval';
export { type GenerateOptions, type GeneratedDomainModel, generateDomainModel } from './generate';
export { APPROVERS_FILE, DEFAULT_SOURCES, DOMAIN_MODEL_DOCUMENT, DomainModelError, type DomainModelSources, REPO_ROOT, readApprovers } from './sources';
export { type DocumentAtRef, documentAtRef } from './history';
export {
  type DocumentChange,
  type DocumentFact,
  type DocumentReading,
  SUMMARY_CATEGORIES,
  type SummaryCategory,
  type SummaryInput,
  changeLine,
  contrast,
  documentChanges,
  readDocument,
  readingChanges,
  renderSummary,
} from './summary';
