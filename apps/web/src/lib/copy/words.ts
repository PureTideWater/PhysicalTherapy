/**
 * Words the screens build around a number or a code (the screen tour's C1): a count with its noun, singular for
 * one ("its 1 linked entry", never "its 1 linked entries"), a code shown as a label in sentence case, its
 * initialisms in capitals ("NCCI PTP", never "Ncci ptp"), and a list in words ("a, b and c", never "a, b, c").
 * Pure: no database.
 */

/** A count and its noun: the singular for one, the plural (the singular and an s, unless given) for any other count. */
export function counted(count: number, one: string, many = `${one}s`): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** A list in words: commas between the items and "and" before the last ("a digit and a symbol"); empty for none. */
export function listed(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

/**
 * The initialisms a code may hold, which a label keeps in capitals: the CMS edits and tables (NCCI, PTP, MUE,
 * MPPR, PFS, RVU, GPCI), the code sets and identifiers (CPT, HCPCS, NPI, ID), the 835's segments and money
 * (CAS, PLB, EFT, ERA, ACH), Medicare Advantage (MA), the place of service (POS), and the files and times
 * (CSV, PDF, SHA, UTC, ROI, EMR).
 */
export const INITIALISMS: ReadonlySet<string> = new Set([
  'ach', 'cas', 'cpt', 'csv', 'eft', 'emr', 'era', 'gpci', 'hcpcs', 'id', 'ma', 'mppr', 'mue', 'ncci', 'npi', 'pdf', 'pfs', 'plb', 'pos', 'ptp', 'roi', 'rvu', 'sha', 'utc',
]);

/**
 * A code (snake_case, as a trace or a stored record names a part) as a label: its words in sentence case, the first
 * capitalized, each initialism in capitals ("ncci_ptp" is "NCCI PTP", "per_visit" is "Per visit", "mue_values" is
 * "MUE values").
 */
export function labelOf(code: string): string {
  return code
    .split('_')
    .filter((word) => word !== '')
    .map((word, index) => {
      if (INITIALISMS.has(word.toLowerCase())) {
        return word.toUpperCase();
      }
      return index === 0 ? word.replace(/^./, (first) => first.toUpperCase()) : word;
    })
    .join(' ');
}
