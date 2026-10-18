import type { DocumentKind, DocumentStatus } from '@tp/db/runtime';

import type { Sniffed } from './sniff';

/**
 * What intake does with a clean document, from its declared kind and what its bytes are (PRD 5, J4:
 * "held with a reason ... not an 835, unreadable"; PRD 6: content sniffing). A clean 835, or a clean ERA
 * export (CSV text, docs/adr/0060), is scanned and queued for parse, the export read there with the vendor
 * format the person named at upload; a document of another kind whose bytes are what that kind holds is stored for
 * its own workflow (the specialist queue, reconciliation); a zip is expanded (or, inside a zip, held
 * as nested); anything else is held with its reason. An executable, a script or the EICAR test file
 * is quarantined, whatever the malware scan said (PAR-28).
 */

/**
 * What the bytes are, for the purpose of matching them to a kind. A workbook is an .xlsx zip
 * (`spreadsheet`) or a legacy binary .xls (`legacy_spreadsheet`), which no exhibit may be: its pages
 * cannot be cited (docs/adr/0033).
 */
export type ContentClass = 'x12' | 'pdf' | 'spreadsheet' | 'legacy_spreadsheet' | 'csv' | 'unknown';

/**
 * The contents each declared kind may hold. A posting or EFT export is CSV only (docs/adr/0059): the
 * reconcile step reads an export as text with the practice's template (reconcile/exports.ts), and the
 * one workbook reader in the repository (packages/contracts' evidence reader) keeps a sheet's text but
 * not its cells' columns, so a workbook would be stored and then never read into a row. It is held as
 * wrong_type at intake instead, and the receipt says to save it as CSV. An ERA export is CSV only for the
 * same reason (docs/adr/0060): the parse job reads it with its vendor format's columns.
 */
export const ACCEPTED_CONTENT: Readonly<Record<DocumentKind, ReadonlySet<ContentClass>>> = {
  x12_835: new Set(['x12']),
  era_export: new Set(['csv']),
  contract: new Set(['pdf']),
  payer_letter: new Set(['pdf']),
  exhibit: new Set(['pdf', 'spreadsheet', 'csv']),
  posting_export: new Set(['csv']),
  eft_export: new Set(['csv']),
  other: new Set(['x12', 'pdf', 'spreadsheet', 'legacy_spreadsheet', 'csv', 'unknown']),
};

/**
 * The kinds the parse_835 job loads into remittances: an 835, and an ERA export read with its vendor format
 * (docs/adr/0060). Every other kind is stored for its own workflow.
 */
export const PARSED_KINDS: ReadonlySet<DocumentKind> = new Set(['x12_835', 'era_export']);

export type Disposition =
  /** A clean 835 or ERA export: status scanned, and its parse_835 job is queued. */
  | { readonly action: 'parse'; readonly status: 'scanned' }
  /** A clean document of another kind, kept for its own workflow. */
  | { readonly action: 'store'; readonly status: 'stored' }
  /** A zip to expand into one document per entry. */
  | { readonly action: 'expand' }
  | { readonly action: 'hold'; readonly status: Extract<DocumentStatus, 'quarantined' | 'not_835' | 'wrong_type' | 'unreadable' | 'nested_zip'> };

/** The disposition of a document of `kind` whose first bytes sniffed as `sniffed`. */
export function dispose(kind: DocumentKind, sniffed: Sniffed, options: { readonly entry: boolean; readonly spreadsheetZip?: boolean }): Disposition {
  const mismatch: Disposition = { action: 'hold', status: kind === 'x12_835' ? 'not_835' : 'wrong_type' };
  let content: ContentClass;
  switch (sniffed.type) {
    case 'signature':
      return { action: 'hold', status: 'quarantined' };
    case 'empty':
      return { action: 'hold', status: 'unreadable' };
    case 'x12_malformed':
      return kind === 'x12_835' ? { action: 'hold', status: 'unreadable' } : mismatch;
    case 'zip':
      if (options.spreadsheetZip === true) {
        content = 'spreadsheet';
        break;
      }
      return options.entry ? { action: 'hold', status: 'nested_zip' } : { action: 'expand' };
    case 'ole2':
      content = 'legacy_spreadsheet';
      break;
    case 'x12':
    case 'pdf':
    case 'csv':
    case 'unknown':
      content = sniffed.type;
      break;
  }
  if (!ACCEPTED_CONTENT[kind].has(content)) {
    return mismatch;
  }
  return PARSED_KINDS.has(kind) ? { action: 'parse', status: 'scanned' } : { action: 'store', status: 'stored' };
}
