import { SCREENING_COLUMNS } from '@tp/worker/screening-format';

/**
 * The screening upload's template, built in the browser (no CSV is committed: the fixture rules refuse a table that
 * is not synthetic, and this one is only a header). One header line of the eight columns, in the order the page
 * describes them; the person fills one row per code, modifier set, units, place of service, payer product and
 * quarter. Pure.
 */

/** The template's file name: words only, no identifier. */
export const TEMPLATE_FILE_NAME = 'paidwhole-screening-template.csv';

/** The template's text: the header line, CRLF-terminated, as a spreadsheet writes CSV. */
export function screeningTemplateCsv(): string {
  return `${SCREENING_COLUMNS.join(',')}\r\n`;
}

/** What each column holds, in the template's order, as the page lists them beside an example row. */
export const TEMPLATE_COLUMNS: readonly { readonly name: (typeof SCREENING_COLUMNS)[number]; readonly holds: string; readonly example: string }[] = [
  { name: 'procedure_code', holds: 'The CPT or HCPCS code.', example: '97110' },
  { name: 'modifiers', holds: 'The modifier set, separated by spaces; empty for none.', example: 'GP' },
  { name: 'units', holds: 'Units on each claim line, a whole number.', example: '2' },
  { name: 'place_of_service', holds: 'The two-digit place of service.', example: '11' },
  { name: 'payer_product', holds: 'medicare_ffs, ma_noncontracted, ma_contracted, commercial, medicaid or other.', example: 'ma_noncontracted' },
  { name: 'service_band', holds: 'The calendar quarter of service, never a date.', example: '2026-Q1' },
  { name: 'allowed_total', holds: 'The allowed amount, in dollars, summed over the row’s claim lines.', example: '1234.56' },
  { name: 'claim_count', holds: 'How many claim lines the row sums.', example: '24' },
];
