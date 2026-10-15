import { formatCents, parseCents } from '@tp/money';

import type { ReportLine } from './content';

/**
 * The audit report's line CSV (PRD 4, Audit v0: "the audit report (PDF plus CSV)"; J12: "line-level
 * exports are available only to roles with PHI access and are logged"): one row per line of the run,
 * in the report's order, with its amounts in dollars, its stage now, what the report counts it as and
 * why, its pattern's behavior, and the case or anomaly it belongs to (opaque IDs). It names the payer's
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
  'unpriced_reason',
  'window_ends_on',
  'stage',
  'counted_as',
  'reasons',
  'behavior',
  'case_ref',
  'anomaly_ref',
  'line_ref',
] as const;

/** A field as CSV: quoted when it holds a quote, comma or line break; text a spreadsheet would run as a formula is prefixed. */
export function csvField(value: string): string {
  const safe = /^[=+@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

const dollars = (value: string | null) => (value === null ? '' : formatCents(parseCents(value)));

export function csvRow(line: ReportLine): string[] {
  return [
    line.payer,
    line.plan,
    line.payer_claim_control_number,
    String(line.line_no),
    line.service_date,
    line.procedure_code,
    line.modifiers.join(' '),
    line.units,
    dollars(line.charge_cents),
    dollars(line.observed_allowed_cents),
    dollars(line.expected_allowed_cents),
    dollars(line.variance_cents),
    line.unpriced_reason ?? '',
    line.window_ends_on ?? '',
    line.stage,
    line.status,
    line.reasons.join(' '),
    line.behavior ?? '',
    line.case_id ?? '',
    line.anomaly_id ?? '',
    line.priced_line_id,
  ];
}

/** The whole CSV: a header row and one row per line, CRLF line ends (RFC 4180). */
export function auditCsv(lines: readonly ReportLine[]): string {
  return [CSV_COLUMNS.join(','), ...lines.map((line) => csvRow(line).map(csvField).join(','))].join('\r\n') + '\r\n';
}
