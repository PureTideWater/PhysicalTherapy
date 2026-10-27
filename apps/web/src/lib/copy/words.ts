/**
 * Words the screens build around a number or a code (the screen tour's C1): a count with its noun, singular for
 * one ("its 1 linked entry", never "its 1 linked entries"), and a code shown as a label in sentence case, its
 * initialisms in capitals ("NCCI PTP", never "Ncci ptp"). Pure: no database.
 */

/** A count and its noun: the singular for one, the plural (the singular and an s, unless given) for any other count. */
export function counted(count: number, one: string, many = `${one}s`): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/**
 * The initialisms a code may hold, which a label keeps in capitals: the Centers for Medicare & Medicaid Services
 * (CMS) and its edits and tables (NCCI, PTP, MUE, MPPR, PFS, RVU, GPCI), the alternative payment model (APM), the
 * code sets and identifiers (CPT, HCPCS, NPI, ID), the 835's segments and money (CAS, PLB, EFT, ERA, ACH), Medicare
 * Advantage (MA), the place of service (POS), and the files and times (CSV, PDF, SHA, UTC, ROI, EMR). CMS and APM
 * are codes of the calculation's words too (@tp/packets/explain CODES), so a label and the words agree.
 */
export const INITIALISMS: ReadonlySet<string> = new Set([
  'ach', 'apm', 'cas', 'cms', 'cpt', 'csv', 'eft', 'emr', 'era', 'gpci', 'hcpcs', 'id', 'ma', 'mppr', 'mue', 'ncci', 'npi', 'pdf', 'pfs', 'plb', 'pos', 'ptp', 'roi', 'rvu', 'sha', 'utc',
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
