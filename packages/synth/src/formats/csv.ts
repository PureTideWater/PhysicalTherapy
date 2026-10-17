/**
 * Synthetic payment-posting and bank (EFT) exports for the recovery ledger (PRD section 13; test
 * matrix LED cases). The posting export is laid out like a practice-management system's CSV (one
 * template, "SYNTHETIC PM EXPORT v1"); the bank export like a deposit report. Amounts are dollars with
 * two places, written from integer cents.
 *
 * Each export carries the synthetic marker in an identifier column of its own (docs/adr/0059, D14
 * option a): the last column, the posting export's "Payee ID" and the bank export's "Originator ID",
 * holds SYNTHSENDER on every row. The ledger's templates map no such column, so a row reads as before.
 */
import { type Cents, formatCents } from '@tp/money';

import { type CalendarDate, toUsDate } from '../core/dates';
import { SYNTH_SENDER_ID } from '../identity';

function cell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csv(rows: readonly (readonly string[])[]): string {
  return `${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

export interface PostingRow {
  readonly postedOn: CalendarDate;
  readonly checkOrTrace: string;
  readonly payerName: string;
  /** The patient control number the practice posted against; empty on a check-level row. */
  readonly claimReference?: string;
  readonly procedureCode?: string;
  readonly serviceDate?: CalendarDate;
  readonly amount: Cents;
  readonly batch: string;
}

export const POSTING_EXPORT_HEADER = ['Post Date', 'Check/EFT #', 'Payer', 'Claim Ref', 'CPT', 'DOS', 'Paid Amount', 'Batch', 'Payee ID'] as const;

/** The posting export: dates MM/DD/YYYY, CRLF line endings, a header row, SYNTHSENDER as every row's payee ID. */
export function postingExport(rows: readonly PostingRow[]): string {
  return csv([
    [...POSTING_EXPORT_HEADER],
    ...rows.map((row) => [
      toUsDate(row.postedOn),
      row.checkOrTrace,
      row.payerName,
      row.claimReference ?? '',
      row.procedureCode ?? '',
      row.serviceDate === undefined ? '' : toUsDate(row.serviceDate),
      formatCents(row.amount),
      row.batch,
      SYNTH_SENDER_ID,
    ]),
  ]);
}

export interface EftRow {
  readonly depositedOn: CalendarDate;
  readonly description: string;
  readonly trace: string;
  readonly amount: Cents;
  /** Set when the bank batches several EFTs into one deposit. */
  readonly batchReference?: string;
}

export const EFT_EXPORT_HEADER = ['Date', 'Description', 'Trace Number', 'Amount', 'Batch Reference', 'Originator ID'] as const;

/** The bank export: ISO dates, CRLF line endings, a header row, SYNTHSENDER as every row's originator ID. */
export function eftExport(rows: readonly EftRow[]): string {
  return csv([[...EFT_EXPORT_HEADER], ...rows.map((row) => [row.depositedOn, row.description, row.trace, formatCents(row.amount), row.batchReference ?? '', SYNTH_SENDER_ID])]);
}
