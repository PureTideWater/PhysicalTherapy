import { decimal, formatCents, parseCents } from '@tp/money';
import { type ExportedPacket, lineInterestStated } from '@tp/packets';

import { type CsvCell, csvDocument } from '../report/csv';
import { METHOD_TEXT, wordsOf } from './words';

/**
 * A packet's CSV schedule (PRD 12: "Export produces a PDF and a CSV schedule, hashed and stored"), the payer's as the
 * PDF is (audit item #37 part 1, D3; the founder's rulings of 2026-10-20; docs/adr/0061): the practice sends both
 * files, and the reviewer attests both. One row per schedule line with the identifiers inserted at export (the claim
 * control number, the patient and the member ID; the patient control number is not printed, Q2 (a)), its amounts in
 * dollars, what the payer paid and when, the line's interest only where code computed it above zero (its own column,
 * never added to expected; empty otherwise, Q4 (a)), the line's window's last day (at the first level only), and its calculation
 * as its trace recorded it:
 * the method in the PDF's words, the unrounded and rounded amounts and the patient share (reported, never
 * subtracted). No trace reference, deadline status or source, or SHA-256: those stay on the reviewer's review page.
 * Line-level PHI: stored sealed with the practice's key, downloaded only by roles that export PHI. Fields go through
 * the one CSV encoder (formula prefixes refused).
 */

export const PACKET_CSV_COLUMNS = [
  'row',
  'payer_claim_control_number',
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
  'window_ends_on',
  'calculation_method',
  'unrounded',
  'rounded',
  'patient_share',
] as const;

const text = (value: string): CsvCell => ({ text: value });
const dollars = (value: string | null): CsvCell => ({ number: value === null ? '' : formatCents(parseCents(value)) });
/** Cents as decimal text in dollars, an unrounded amount with its fraction of a cent. */
const exactDollars = (value: string | null | undefined): CsvCell =>
  value === null || value === undefined ? { number: '' } : /^-?\d+$/.test(value) ? dollars(value) : { number: decimal(value).dividedBy(decimal(100n)).toString() };

/**
 * A line's window's last day as the CSV states it: a tp-packet/2 line's own deadline (never the engine's window behind
 * it, which may be one not verified), and nothing above the first level, where the dispute's window is the level's own
 * (the PDF states it) and the line's first-level window is not this level's deadline. A tp-packet/1 version states no
 * deadline, so its line's window is the engine's, as it always printed.
 */
function windowEndsOn(exported: ExportedPacket, line: ExportedPacket['lines'][number]): string {
  if (exported.content.format !== 'tp-packet/2') {
    return line.window_ends_on ?? '';
  }
  return exported.content.deadline.basis === 'next_level_window' ? '' : (line.deadline?.ends_on ?? '');
}

export function packetCsv(exported: ExportedPacket): string {
  // Only stated interest (computed, above zero; Q4 (a)): a line whose interest code did not compute, or computed as
  // $0.00, has an empty cell, as the PDF lists neither.
  const interest = new Map((exported.content.interest?.lines ?? []).filter((line) => lineInterestStated(line)).map((line) => [line.row, line.interest_cents]));
  return csvDocument(
    PACKET_CSV_COLUMNS,
    exported.lines.map((line) => [
      { number: String(line.row) },
      text(line.claim_control_number),
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
      text(windowEndsOn(exported, line)),
      text(line.calculation === undefined ? '' : wordsOf(METHOD_TEXT, line.calculation.method, 'calculation method')),
      exactDollars(line.calculation?.rounding?.unrounded_cents),
      exactDollars(line.calculation?.rounding?.rounded_cents),
      exactDollars(line.calculation?.patient_share_cents),
    ]),
  );
}
