import type { DocumentKind, DocumentStatus } from '@tp/db/runtime';

import type { Sniffed } from './sniff';

/**
 * What intake does with a clean document, from its declared kind and what its bytes are (PRD 5, J4:
 * "held with a reason ... not an 835, unreadable"; PRD 6: content sniffing). A clean 835 is scanned
 * and queued for parse; a document of another kind whose bytes are what that kind holds is stored for
 * its own workflow (the specialist queue, reconciliation); a zip is expanded (or, inside a zip, held
 * as nested); anything else is held with its reason. An executable, a script or the EICAR test file
 * is quarantined, whatever the malware scan said (PAR-28).
 */

/** What the bytes are, for the purpose of matching them to a kind. */
export type ContentClass = 'x12' | 'pdf' | 'spreadsheet' | 'csv' | 'unknown';

/** The contents each declared kind may hold. */
export const ACCEPTED_CONTENT: Readonly<Record<DocumentKind, ReadonlySet<ContentClass>>> = {
  x12_835: new Set(['x12']),
  contract: new Set(['pdf']),
  payer_letter: new Set(['pdf']),
  exhibit: new Set(['pdf', 'spreadsheet', 'csv']),
  posting_export: new Set(['csv', 'spreadsheet']),
  eft_export: new Set(['csv', 'spreadsheet']),
  other: new Set(['x12', 'pdf', 'spreadsheet', 'csv', 'unknown']),
};

export type Disposition =
  /** A clean 835: status scanned, and its parse_835 job is queued. */
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
      content = 'spreadsheet';
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
  return kind === 'x12_835' ? { action: 'parse', status: 'scanned' } : { action: 'store', status: 'stored' };
}
