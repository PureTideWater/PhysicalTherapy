/**
 * The marker column of a vendor fixture: a file under fixtures/synthetic/emr/<format_id>/ carries
 * SYNTHSENDER in the payee or sender ID column the vendor format registry names for that format
 * (formats/vendors/registry.ts, markerColumn; docs/adr/0059). Any other tabular fixture carries it in a
 * column whose header says ID.
 */
import { VENDOR_FORMATS } from '../formats/vendors/registry';

const MARKER_COLUMNS: ReadonlyMap<string, string> = new Map(VENDOR_FORMATS.map((format) => [format.id, format.markerColumn]));

/** The vendor format a label's file belongs to, from its emr/<format_id>/ directory. */
export function vendorFormatOf(label: string): string | undefined {
  return /(?:^|\/)emr\/([a-z][a-z0-9_]{0,63})\/[^!]+/.exec(label.split('!')[0] ?? '')?.[1];
}

/** The column that must hold the marker in the file `label` names; undefined for any identifier column. */
export function vendorMarkerColumn(label: string, columns: ReadonlyMap<string, string> = MARKER_COLUMNS): string | undefined {
  const format = vendorFormatOf(label);
  return format === undefined ? undefined : columns.get(format);
}
