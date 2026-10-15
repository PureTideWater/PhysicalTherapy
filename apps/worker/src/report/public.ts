/**
 * The audit report as other apps read it (@tp/worker/reports): the web app's Reports screen and the
 * reviewer's checklist show a ready report's stored numbers (tp-audit-report/1). Generating a report is
 * the worker's (the audit_report job); nothing here computes a figure.
 */
export { type AuditReportContent, type EvidenceGap, REPORT_FORMAT, type ReportAnomaly, type ReportCase, type ReportLine, type ReportPattern } from './content';
export { CSV_COLUMNS } from './csv';
export { reasonText } from './html';
