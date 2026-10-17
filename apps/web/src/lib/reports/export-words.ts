import type { ExportRecord } from './documents';

/**
 * An export history entry in words, as the Reports screen lists it (PRD 7, Reports: "export history"): the file,
 * then the record it is of, each record named with its own article ("PDF of an audit report", "CSV of a report",
 * "PDF of the monthly summary"; the screen tour's C1 found "PDF of a audit report"), and a packet's export with
 * the identifiers it carries. The article is written with its noun, never chosen by a letter at run time.
 */

/** Each kind of record a download is of, with its article. */
export const EXPORT_RECORD_WORDS: Readonly<Record<ExportRecord['kind'], string>> = {
  audit_report: 'an audit report',
  roi_statement: 'an ROI statement',
  report_document: 'a report',
  monthly_summary: 'the monthly summary',
  packet_export: 'a packet',
};

/** Each file a download is. */
export const EXPORT_FILE_WORDS: Readonly<Record<ExportRecord['file'], string>> = {
  pdf: 'PDF',
  csv: 'CSV',
  line_csv: 'line CSV',
  packet: 'PDF or CSV schedule',
};

/** What an export history entry downloaded: "PDF of an audit report", "PDF or CSV schedule of a packet, identifiers inserted". */
export function exportWhat(entry: Pick<ExportRecord, 'file' | 'kind'>): string {
  const what = `${EXPORT_FILE_WORDS[entry.file]} of ${EXPORT_RECORD_WORDS[entry.kind]}`;
  return entry.file === 'packet' ? `${what}, identifiers inserted` : what;
}
