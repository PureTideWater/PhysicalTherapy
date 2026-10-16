/**
 * The audit report as other apps read it (@tp/worker/reports): the web app's Reports screen and the
 * reviewer's checklist show a ready report's stored numbers (tp-audit-report/1). Generating a report is
 * the worker's (the audit_report job); nothing here computes a figure. The v1 reports' documents
 * (docs/adr/0045): the formats a coverage report and a monthly summary are stored in, and their CSV,
 * computed from the stored figures.
 */
export { type AuditReportContent, type EvidenceGap, REPORT_FORMAT, type ReportAnomaly, type ReportCase, type ReportLine, type ReportPattern } from './content';
export { CSV_COLUMNS, type CsvCell, csvDocument, csvText } from './csv';
export {
  type ApprovedAloneRow,
  COVERAGE_CSV_COLUMNS,
  COVERAGE_REPORT_FORMAT,
  type CoverageReportContent,
  MONTHLY_CSV_COLUMNS,
  MONTHLY_SUMMARY_FORMAT,
  type MonthlySummaryContent,
  type MonthlySummaryRow,
  type ReportDocumentContent,
  type ReportDocumentKind,
  SUMMARY_BUCKET_CODES,
  SUMMARY_BUCKET_LABELS,
  SUMMARY_DOLLAR_BUCKETS,
  type SummaryBucketCode,
  coverageReportCsv,
  monthlySummaryCsv,
  parseReportDocument,
  reportDocumentCsv,
  shareText,
} from './documents';
export { reasonText } from './html';
