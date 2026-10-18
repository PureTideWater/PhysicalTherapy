/**
 * The vendor posting exports (registry.ts, kind posting_export), generated from the case registry's
 * own synthetic posting exports: the LED-04 check-level row, the two rows of LED-08's later export,
 * LED-09's row with line detail, and LED-06's take-back (a negative amount). Each source export (formats/csv.ts, the SYNTHETIC template) is
 * read back into canonical rows, the fields the ledger stores in posting_row with the amount in integer
 * cents, and each vendor format writes the same rows in its own columns, dates and line endings, with
 * SYNTHSENDER in its payee ID column. Nothing is invented: a vendor row is a source row written again.
 */
import { centsToString, parseAmount } from '@tp/money';

import { findCase } from '../../cases/registry';
import { POSTING_EXPORT_HEADER } from '../csv';
import { FORMAT_MARKER, type PostingFormat, type VendorPostingField } from './registry';
import { VendorFormatError, readTable, vendorCsv, writeDate, writeMoney } from './table';

/** One posting row as the ledger reads it (packages/ledger PostingExportRow), the amount in integer cents as text. */
export interface CanonicalPostingRow {
  readonly postedOn: string;
  readonly checkOrTrace: string;
  readonly amountCents: string;
  readonly payerName: string | null;
  readonly claimReference: string | null;
  readonly procedureCode: string | null;
  readonly serviceDate: string | null;
  readonly batch: string | null;
}

/** A source export: a file of a test-matrix case, relative to its directory. */
export interface PostingSource {
  readonly caseId: string;
  readonly file: string;
}

export const POSTING_SOURCES: readonly PostingSource[] = [
  { caseId: 'LED-04', file: 'posting-export.csv' },
  { caseId: 'LED-08', file: 'posting-export-again.csv' },
  { caseId: 'LED-09', file: 'lines-posting-export.csv' },
  { caseId: 'LED-06', file: 'recoupment-posting-export.csv' },
];

const US_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function isoOf(text: string, label: string): string {
  const match = US_DATE.exec(text);
  if (match === null) {
    throw new VendorFormatError(`${label}: a date is not MM/DD/YYYY`);
  }
  return `${match[3] as string}-${match[1] as string}-${match[2] as string}`;
}

const optional = (text: string): string | null => (text === '' ? null : text);

/**
 * Reads packages/synth's own posting export (formats/csv.ts) back into canonical rows. Any other file
 * is refused: its header must be the synthetic one and every row must carry SYNTHSENDER.
 */
export function readSyntheticPostingExport(bytes: Uint8Array, label: string): CanonicalPostingRow[] {
  const [header, ...rows] = readTable(Buffer.from(bytes).toString('utf8'));
  if (header?.join(',') !== POSTING_EXPORT_HEADER.join(',')) {
    throw new VendorFormatError(`${label}: not packages/synth's posting export`);
  }
  return rows.map((cells) => {
    const [postedOn, checkOrTrace, payerName, claimReference, procedureCode, serviceDate, amount, batch, payee] = cells;
    if (cells.length !== POSTING_EXPORT_HEADER.length || payee !== FORMAT_MARKER || checkOrTrace === undefined || checkOrTrace === '' || amount === undefined) {
      throw new VendorFormatError(`${label}: a row is not a synthetic posting row`);
    }
    return {
      postedOn: isoOf(postedOn ?? '', label),
      checkOrTrace,
      amountCents: centsToString(parseAmount(amount)),
      payerName: optional(payerName ?? ''),
      claimReference: optional(claimReference ?? ''),
      procedureCode: optional(procedureCode ?? ''),
      serviceDate: serviceDate === undefined || serviceDate === '' ? null : isoOf(serviceDate, label),
      batch: optional(batch ?? ''),
    };
  });
}

export interface PostingSourceRows {
  readonly source: PostingSource;
  readonly rows: readonly CanonicalPostingRow[];
}

/** Each source export's rows, generated afresh from the case registry. */
export function postingSourceRows(sources: readonly PostingSource[] = POSTING_SOURCES): PostingSourceRows[] {
  return sources.map((source) => {
    const generated = findCase(source.caseId)?.generate();
    const file = generated?.files.find((item) => item.path === `${generated.dir}/${source.file}`);
    if (file === undefined) {
      throw new VendorFormatError(`${source.caseId} generates no ${source.file}`);
    }
    return { source, rows: readSyntheticPostingExport(file.bytes, `${source.caseId}/${source.file}`) };
  });
}

function postingCell(format: PostingFormat, field: VendorPostingField, row: CanonicalPostingRow): string {
  switch (field) {
    case 'posted_on':
      return writeDate(row.postedOn, format.dateFormat);
    case 'check_or_trace':
      return row.checkOrTrace;
    case 'amount':
      return writeMoney(row.amountCents);
    case 'payer':
      return row.payerName ?? '';
    case 'claim_reference':
      return row.claimReference ?? '';
    case 'procedure_code':
      return row.procedureCode ?? '';
    case 'service_date':
      return row.serviceDate === null ? '' : writeDate(row.serviceDate, format.dateFormat);
    case 'batch':
      return row.batch ?? '';
    case 'payee_id':
      return FORMAT_MARKER;
  }
}

/** The rows written as `format` writes a posting export. */
export function vendorPostingExport(format: PostingFormat, rows: readonly CanonicalPostingRow[]): Uint8Array {
  return vendorCsv(
    format,
    rows.map((row) => format.columns.map((column) => postingCell(format, column.field, row))),
  );
}
