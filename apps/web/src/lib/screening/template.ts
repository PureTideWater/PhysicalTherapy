import { SCREENING_COLUMNS, SCREENING_MIN_CLAIM_LINES } from '@tp/worker/screening-format';

/**
 * The screening upload's template, built in the browser (no CSV is committed: the fixture rules refuse a table that
 * is not synthetic, and this one holds no row). Its rules first, each a note line above the header (a first cell
 * that begins with #, which the page's reader skips: parse.ts, isNoteRow), then one header line of the eight columns,
 * in the order the page describes them; the person fills one row per code, modifier set, units, place of service,
 * payer product and quarter. So the file a prospect fills in a spreadsheet says, in plain words, what the page says
 * beside it (the founder's rulings of 2026-10-18 on the best-option audit's items 6 and 1): each row sums at least 11
 * claim lines, and denied lines are left out of every total. Plain ASCII, so a spreadsheet that reads a CSV without a
 * byte-order mark as Windows-1252 shows every character as written. Pure.
 */

/** The template's file name: words only, no identifier. */
export const TEMPLATE_FILE_NAME = 'paidwhole-screening-template.csv';

/** The floor, as the template's rules say it. */
const FLOOR = String(SCREENING_MIN_CLAIM_LINES);

/**
 * The template's rules, in plain words, as its note lines and the page beside it state them (the founder's rulings
 * of 2026-10-18 on the best-option audit's items 6 and 1): every row sums at least 11 claim lines, the CMS small-cell
 * standard, because a smaller row can describe one patient's care and is left out before anything is sent; and denied
 * lines are left out of every total and claim count, because a denial is not a rate variance.
 */
export const TEMPLATE_RULES: readonly { readonly id: 'claim-floor' | 'denied-lines'; readonly text: string }[] = [
  {
    id: 'claim-floor',
    text: `Each row sums at least ${FLOOR} claim lines. A row of fewer could describe the care of one patient, so your browser leaves it out before anything is sent, and the page tells you how many rows, claim lines and dollars it left out.`,
  },
  {
    id: 'denied-lines',
    text: 'Leave denied lines out of every total and claim count: a line the payer paid nothing on because it was denied, for a missing authorization, a visit limit, a duplicate, timely filing or a service not covered. A denial is not a rate variance, and a screening compares rates.',
  },
];

/** What each column holds, in the template's order, as the page lists them beside an example row. */
export const TEMPLATE_COLUMNS: readonly { readonly name: (typeof SCREENING_COLUMNS)[number]; readonly holds: string; readonly example: string }[] = [
  { name: 'procedure_code', holds: 'The CPT or HCPCS code.', example: '97110' },
  { name: 'modifiers', holds: 'The modifier set, separated by spaces; empty for none.', example: 'GP' },
  { name: 'units', holds: 'Units on each claim line, a whole number.', example: '2' },
  { name: 'place_of_service', holds: 'The two-digit place of service.', example: '11' },
  { name: 'payer_product', holds: 'medicare_ffs, ma_noncontracted, ma_contracted, commercial, medicaid or other.', example: 'ma_noncontracted' },
  { name: 'service_band', holds: 'The calendar quarter of service, never a date.', example: '2026-Q1' },
  { name: 'allowed_total', holds: 'The allowed amount, in dollars, summed over the row’s claim lines, with denied lines left out.', example: '1234.56' },
  { name: 'claim_count', holds: `How many claim lines the row sums, with denied lines left out: at least ${FLOOR}, or the row is left out before sending.`, example: '24' },
];

/** The note lines above the template's header: how to read them, what a row is, then the rules. */
export const TEMPLATE_NOTES: readonly string[] = [
  '# Free screening template. The lines above the header that start with # are notes: keep them or delete them, since the screening page skips them.',
  '# One row per code, modifier set, units, place of service, payer product and quarter, with totals only: no names, dates of birth, member IDs, dates of service or claim numbers.',
  ...TEMPLATE_RULES.map((rule) => `# ${rule.text}`),
];

/** A cell as CSV writes it: quoted when it holds a comma, a quote or a line break. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** The template's text: the note lines, then the header line, each CRLF-terminated, as a spreadsheet writes CSV. */
export function screeningTemplateCsv(): string {
  return [...TEMPLATE_NOTES.map(csvCell), SCREENING_COLUMNS.join(',')].map((line) => `${line}\r\n`).join('');
}
