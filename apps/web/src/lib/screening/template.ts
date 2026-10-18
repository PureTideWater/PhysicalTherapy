import { SCREENING_COLUMNS, SCREENING_MIN_CLAIM_LINES } from '@tp/worker/screening-format';

/**
 * The screening upload's template, built in the browser (no CSV is committed: the fixture rules refuse a table that
 * is not synthetic, and this one is only a header). One header line of the eight columns, in the order the page
 * describes them; the person fills one row per code, modifier set, units, place of service, payer product and
 * quarter. The file is the header alone, since any other line would be read as a row of totals, so its rules (each
 * row at least 11 claim lines; denied lines left out of every total) are stated in plain words beside every place the
 * page offers it and in its column guide. Pure.
 */

/** The template's file name: words only, no identifier. */
export const TEMPLATE_FILE_NAME = 'paidwhole-screening-template.csv';

/** The template's text: the header line, CRLF-terminated, as a spreadsheet writes CSV. */
export function screeningTemplateCsv(): string {
  return `${SCREENING_COLUMNS.join(',')}\r\n`;
}

/** The floor, as the template's rules say it. */
const FLOOR = String(SCREENING_MIN_CLAIM_LINES);

/**
 * The template's rules, in plain words, as the page states them beside the template (the founder's rulings of
 * 2026-10-18 on the best-option audit's items 6 and 1): every row sums at least 11 claim lines, the CMS small-cell
 * standard, because a smaller row can describe one patient's care and is left out before anything is sent; and denied
 * lines are left out of every total, because a denial is not a rate variance.
 */
export const TEMPLATE_RULES: readonly { readonly id: 'claim-floor' | 'denied-lines'; readonly text: string }[] = [
  {
    id: 'claim-floor',
    text: `Each row sums at least ${FLOOR} claim lines. A row of fewer could describe one patient’s care, so this page leaves it out before anything is sent and tells you how many rows, claim lines and dollars it left out.`,
  },
  {
    id: 'denied-lines',
    text: 'Leave denied lines out of every total: a line the payer paid nothing on because it was denied, for a missing authorization, a visit limit, a duplicate, timely filing or a service not covered. A denial is not a rate variance, and a screening compares rates.',
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
