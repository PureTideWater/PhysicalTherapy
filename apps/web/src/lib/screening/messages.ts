import { formatUsd } from '@tp/money';
import { PHI_KIND_LABELS, SCREENING_MAX_REASONS, SCREENING_MAX_ROWS, SCREENING_MIN_CLAIM_LINES, type ScreeningColumn, type ScreeningLeftOut, type ScreeningRejection } from '@tp/worker/screening-format';

/**
 * What the screening page says about an upload it refuses (Change Order 001, CO-04: "reject any upload containing
 * them", naming the column). One sentence per reason, at most 20, each naming a column by its position (any position
 * in the browser) and, in the browser alone, by the header text the person typed; a row by its number under the
 * header. Patient information comes first, so its column is named however many other problems the file has. A
 * message never holds a cell's value, and the header text never leaves the browser: the server's own messages name
 * the position and the kind only. And what the browser says of the rows of fewer than 11 claim lines it leaves out:
 * how many, their claim lines and their allowed total, never which. Plain data, safe to import in the browser.
 */

/**
 * Why a row of fewer claim lines is left out, in plain words: the risk the floor answers, never a promise that a row
 * of 11 or more cannot describe one patient (a plan of care can give one patient 11 lines in a quarter; counsel
 * confirms whether the floor counts lines or patients, ADR 0062).
 */
export const CLAIM_FLOOR_REASON = `a screening takes a row of at least ${String(SCREENING_MIN_CLAIM_LINES)} claim lines, because a row of fewer can describe one patient’s care`;

/** The most messages a refusal shows: the format keeps at most 20 reasons. */
export const MAX_MESSAGES = SCREENING_MAX_REASONS;

/** Each column as a sentence names it. */
export const FIELD_LABELS: Readonly<Record<ScreeningColumn, string>> = {
  procedure_code: 'procedure code',
  modifiers: 'modifiers',
  units: 'units',
  place_of_service: 'place of service',
  payer_product: 'payer product',
  service_band: 'service band',
  allowed_total: 'allowed total',
  claim_count: 'claim count',
};

/** What each column holds, for a value it refuses. */
export const FIELD_RULES: Readonly<Record<ScreeningColumn, string>> = {
  procedure_code: 'a CPT or HCPCS code of five characters, such as 97110 or G0283',
  modifiers: 'up to four different two-character modifiers, such as GP or GP 59, or nothing',
  units: 'a whole number of units from 1 to 999',
  place_of_service: 'a place-of-service code from 01 to 99',
  payer_product: 'one of medicare_ffs, ma_noncontracted, ma_contracted, commercial, medicaid or other',
  service_band: 'a calendar quarter, such as 2026-Q1; a month is not taken, so use its quarter',
  allowed_total: 'dollars with at most two decimals, such as 1234.56, from 0 to 999,999,999.99 and at most $25,000.00 a claim line',
  claim_count: `a whole number of claim lines from 1 to 100,000 (a row of fewer than ${String(SCREENING_MIN_CLAIM_LINES)} is left out, never sent)`,
};

/** A column as a message names it: its position, and in the browser the header text typed there. */
function columnName(column: number | undefined, header: string | undefined): string {
  const position = column === undefined ? 'A column' : `Column ${String(column)}`;
  const typed = header?.trim() ?? '';
  return typed === '' ? position : `${position} (“${typed.slice(0, 60)}”)`;
}

function rowName(row: number | undefined): string {
  return row === undefined ? 'A row' : `Row ${row.toLocaleString('en-US')}`;
}

function fieldName(field: ScreeningColumn | undefined): string {
  return field === undefined ? 'a column' : FIELD_LABELS[field];
}

/**
 * One reason as a sentence. `headers` are the file's header cells, given in the browser only, so a message there
 * names the column the person sees; the server passes none.
 */
export function reasonMessage(reason: ScreeningRejection, headers?: readonly string[]): string {
  const header = reason.column === undefined ? undefined : headers?.[reason.column - 1];
  switch (reason.code) {
    case 'phi_column':
      return `${columnName(reason.column, header)} holds ${reason.phi === undefined ? 'patient information' : PHI_KIND_LABELS[reason.phi]}; remove it and upload again. A screening takes totals only, never patient information.`;
    case 'unknown_column':
      return `${columnName(reason.column, header)} is not one of the eight screening columns; remove it.`;
    case 'duplicate_column':
      return `${columnName(reason.column, header)} is a second ${fieldName(reason.field)} column; keep one.`;
    case 'missing_column':
      return `The file has no ${fieldName(reason.field)} column; add it.`;
    case 'row_shape':
      return `${rowName(reason.row)} does not have one cell for each column of the header.`;
    case 'invalid_value':
      return `${rowName(reason.row)}, ${fieldName(reason.field)}: it must be ${reason.field === undefined ? 'in the column’s format' : FIELD_RULES[reason.field]}.`;
    case 'band_holds_date':
      return `${rowName(reason.row)}: ${reason.column === undefined ? 'the service band column' : columnName(reason.column, header).replace(/^Column/, 'column')} holds dates of service. A screening takes a calendar quarter only, such as 2026-Q1; remove the dates and upload again.`;
    case 'band_in_future':
      return `${rowName(reason.row)}, service band: that quarter has not started yet.`;
    case 'duplicate_row':
      return `${rowName(reason.row)} repeats row ${reason.first_row === undefined ? 'above' : reason.first_row.toLocaleString('en-US')}: the same code, modifiers, units, place of service, payer product and quarter. Add the two into one row.`;
    case 'no_rows':
      return 'The file has no rows under its header.';
    case 'too_many_rows':
      return `The file has more than ${SCREENING_MAX_ROWS.toLocaleString('en-US')} rows. Combine rows that share a code, modifiers, units, place of service, payer product and quarter, or screen the rest separately.`;
    case 'row_count_mismatch':
      return 'The rows sent do not add up to the file’s row count. Choose the file again.';
    case 'too_few_claim_lines':
      return reason.row === undefined
        ? // The left-out line that follows it gives the reason, once.
          `Every row sums fewer than ${String(SCREENING_MIN_CLAIM_LINES)} claim lines, so nothing is left to screen.`
        : `${rowName(reason.row)} sums fewer than ${String(SCREENING_MIN_CLAIM_LINES)} claim lines: ${CLAIM_FLOOR_REASON}. Leave the row out.`;
  }
}

/** A count and its noun, the count grouped by thousands. */
function many(count: number, one: string): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? one : `${one}s`}`;
}

/**
 * What the browser says of the rows it left out because each sums fewer than 11 claim lines: how many, their claim
 * lines and their allowed total, never which rows; null when it left none out.
 */
export function leftOutMessage(leftOut: ScreeningLeftOut): string | null {
  if (leftOut.rows === 0) {
    return null;
  }
  const one = leftOut.rows === 1;
  const rows = one ? `1 row of fewer than ${String(SCREENING_MIN_CLAIM_LINES)} claim lines` : `${many(leftOut.rows, 'row')} of fewer than ${String(SCREENING_MIN_CLAIM_LINES)} claim lines each`;
  return `Left out: ${rows}, ${many(leftOut.claimLines, 'claim line')} and ${formatUsd(leftOut.allowedCents)} allowed in your file. ${one ? 'It is not sent, and no figure includes it' : 'They are not sent, and no figure includes them'}: ${CLAIM_FLOOR_REASON}.`;
}

/**
 * The messages a refusal shows: at most 20. `total` is how many reasons there were (the format keeps 20, patient
 * information first); when there were more than are shown, the last message says how many more.
 */
export function reasonMessages(reasons: readonly ScreeningRejection[], headers?: readonly string[], total: number = reasons.length): string[] {
  const shown = reasons.slice(0, MAX_MESSAGES).map((reason) => reasonMessage(reason, headers));
  const all = Math.max(total, reasons.length);
  if (all <= shown.length) {
    return shown;
  }
  const kept = shown.slice(0, MAX_MESSAGES - 1);
  return [...kept, `And ${(all - kept.length).toLocaleString('en-US')} more ${all - kept.length === 1 ? 'problem' : 'problems'} like these.`];
}

/** The browser's refusals of the file itself, before any row is read. */
export const FILE_MESSAGES = {
  empty: 'The file is empty. Choose the CSV you saved.',
  tooLarge: 'The file is larger than 25 MiB. A screening takes at most 50,000 rows of totals; combine rows and choose it again.',
  spreadsheet: 'The file is a spreadsheet. Save it as CSV (comma-separated) or tab-separated text and choose it again.',
  notText: 'The file is not UTF-8 text. Save it as CSV (comma-separated, UTF-8) and choose it again.',
  unclosedQuote: 'The file ends inside a quoted cell: a quote is never closed. Save it again as CSV and choose it again.',
  textAfterQuote: 'A cell has text after its closing quote. Save it again as CSV and choose it again.',
  noFile: 'Choose the file to screen.',
} as const;
