import { formatCents, parseCents } from '@tp/money';

import type { ReportLine } from './content';

/**
 * The audit report's line CSV (PRD 4, Audit v0: "the audit report (PDF plus CSV)"; J12: "line-level
 * exports are available only to roles with PHI access and are logged"): one row per line of the run,
 * in the report's order, with its amounts in dollars (the shortfall it validates beside its variance,
 * and a per-visit line's visit's net), its stage now, what the report counts it as and why, its review
 * flags, its pattern's behavior, and the case or anomaly it belongs to (opaque IDs). The headline
 * reconciles to it: actionable is the variance of the lines counted as actionable, validated the sum of
 * the validated column, overpaid the overpaid lines' variance (a visit's net on its carrying line). It names the payer's
 * claim control number so a person can act on a line, which makes it line-level PHI: it is stored
 * sealed with the practice's key, and downloaded only by the roles that export PHI.
 */

export const CSV_COLUMNS = [
  'payer',
  'plan',
  'payer_claim_control_number',
  'line_no',
  'service_date',
  'procedure_code',
  'modifiers',
  'units',
  'billed',
  'observed_allowed',
  'expected_allowed',
  'variance',
  'validated',
  'visit_variance',
  'unpriced_reason',
  'window_ends_on',
  'stage',
  'counted_as',
  'reasons',
  'review_flags',
  'behavior',
  'case_ref',
  'anomaly_ref',
  'line_ref',
] as const;

/**
 * A text field as CSV (every export's: the audit report's line CSV, the monthly summary's): a value a
 * spreadsheet would run as a formula (one starting with =, +, -, @, a tab or a carriage return) is
 * prefixed with an apostrophe, and a value holding a quote, comma or line break is quoted. Payer and
 * plan names, claim control numbers, codes and modifiers come from the 835 a practice uploaded.
 */
export function csvText(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** A figure built from integer cents or a count: never quoted or prefixed, so a negative amount stays a number. */
export function csvNumber(value: string): string {
  if (!/^(-?\d+(\.\d+)?)?$/.test(value)) {
    throw new Error('a CSV number is digits, a sign and a decimal point only');
  }
  return value;
}

/** A field of a row: text unless it is a number column. */
export type CsvCell = { readonly text: string } | { readonly number: string };

export function csvCell(cell: CsvCell): string {
  return 'text' in cell ? csvText(cell.text) : csvNumber(cell.number);
}

/** Rows of cells as CSV: CRLF line ends (RFC 4180), the header row first. */
export function csvDocument(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return [header.map(csvText).join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\r\n') + '\r\n';
}

const dollars = (value: string | null): CsvCell => ({ number: value === null ? '' : formatCents(parseCents(value)) });
const text = (value: string): CsvCell => ({ text: value });

export function csvRow(line: ReportLine): CsvCell[] {
  return [
    text(line.payer),
    text(line.plan),
    text(line.payer_claim_control_number),
    { number: String(line.line_no) },
    text(line.service_date),
    text(line.procedure_code),
    text(line.modifiers.join(' ')),
    { number: line.units },
    dollars(line.charge_cents),
    dollars(line.observed_allowed_cents),
    dollars(line.expected_allowed_cents),
    dollars(line.variance_cents),
    dollars(line.validated_cents),
    dollars(line.visit_variance_cents),
    text(line.unpriced_reason ?? ''),
    text(line.window_ends_on ?? ''),
    text(line.stage),
    text(line.status),
    text(line.reasons.join(' ')),
    text(line.review_flags.map((flag) => `${flag.flag}:${String(flag.column1_line_no)}`).join(' ')),
    text(line.behavior ?? ''),
    text(line.case_id ?? ''),
    text(line.anomaly_id ?? ''),
    text(line.priced_line_id),
  ];
}

/** The whole CSV: a header row and one row per line, CRLF line ends (RFC 4180). */
export function auditCsv(lines: readonly ReportLine[]): string {
  return csvDocument(CSV_COLUMNS, lines.map(csvRow));
}
