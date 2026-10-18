import { decimal, formatCents, parseCents } from '@tp/money';
import type { ExportedPacket } from '@tp/packets';

import { type CsvCell, csvDocument } from '../report/csv';

/**
 * A packet's CSV schedule (PRD 12: "Export produces a PDF and a CSV schedule, hashed and stored"): one
 * row per schedule line with the identifiers inserted at export, its amounts in dollars and its trace
 * reference, and the line's interest where a state rule applies (its own column, never added to
 * expected). Line-level PHI: stored sealed with the practice's key, downloaded only by roles that export
 * PHI. Fields go through the one CSV encoder (formula prefixes refused).
 *
 * A tp-packet/2 line also carries its window's last day and its status (D17), and its calculation summary
 * as its trace recorded it: the method, the unrounded and rounded amounts, the patient share (reported,
 * never subtracted) and the trace's SHA-256. They follow the /1 columns, which keep their places.
 */

export const PACKET_CSV_COLUMNS = [
  'row',
  'payer_claim_control_number',
  'patient_control_number',
  'patient_name',
  'member_id',
  'service_date',
  'procedure_code',
  'modifiers',
  'units',
  'expected',
  'observed',
  'variance',
  'paid',
  'paid_on',
  'received_on',
  'interest',
  'trace_ref',
  'window_ends_on',
  'deadline_status',
  'deadline_source',
  'calculation_method',
  'unrounded',
  'rounded',
  'patient_share',
  'trace_sha256',
] as const;

const text = (value: string): CsvCell => ({ text: value });
const dollars = (value: string | null): CsvCell => ({ number: value === null ? '' : formatCents(parseCents(value)) });
/** Cents as decimal text in dollars, an unrounded amount with its fraction of a cent. */
const exactDollars = (value: string | null | undefined): CsvCell =>
  value === null || value === undefined ? { number: '' } : /^-?\d+$/.test(value) ? dollars(value) : { number: decimal(value).dividedBy(decimal(100n)).toString() };

export function packetCsv(exported: ExportedPacket): string {
  const interest = new Map((exported.content.interest?.lines ?? []).map((line) => [line.row, line.interest_cents]));
  return csvDocument(
    PACKET_CSV_COLUMNS,
    exported.lines.map((line) => [
      { number: String(line.row) },
      text(line.claim_control_number),
      text(line.patient_control_number),
      text(line.patient_name),
      text(line.member_id),
      text(line.service_date),
      text(line.procedure_code),
      text(line.modifiers.join(' ')),
      { number: line.units },
      dollars(line.expected_cents),
      dollars(line.observed_cents),
      dollars(line.variance_cents),
      dollars(line.paid_cents),
      text(line.paid_on),
      text(line.received_on ?? ''),
      dollars(interest.get(line.row) ?? null),
      text(line.trace_ref),
      text(line.deadline?.ends_on ?? line.window_ends_on ?? ''),
      text(line.deadline?.status ?? ''),
      text(line.deadline?.source ?? ''),
      text(line.calculation?.method ?? ''),
      exactDollars(line.calculation?.rounding?.unrounded_cents),
      exactDollars(line.calculation?.rounding?.rounded_cents),
      exactDollars(line.calculation?.patient_share_cents),
      text(line.calculation?.trace_sha256 ?? ''),
    ]),
  );
}
