const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text as HTML: the five characters that could open markup or close an attribute, escaped. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

/** A dollar amount as formatUsd writes it: $1,234.56, or -$12.00. */
const AMOUNT = /-?\$\d[\d,]*\.\d{2}/g;

/**
 * Text as HTML with every dollar amount in it set in the mono face with tabular numerals (docs/brand/BRAND.md,
 * section 5: every dollar figure in IBM Plex Mono): escaped, then each amount wrapped in the report
 * stylesheet's figure-amount span. For running text and headings; a table's amount columns are styled by
 * column instead.
 */
export function escapeWithFigures(value: string): string {
  return escapeHtml(value).replace(AMOUNT, (amount) => `<span class="figure-amount">${amount}</span>`);
}
