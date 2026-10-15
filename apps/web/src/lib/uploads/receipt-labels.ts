import type { DocumentKind, DocumentStatus, ScanStatus } from '@tp/db/runtime';

/**
 * A document's receipt (PRD 5, J4: "a receipt per file: received, scanned, parsed, balanced, loaded,
 * or held with a reason (does not balance, duplicate of file X, not an 835, unreadable)"), as the
 * Uploads screen and the error report show it. Plain data and fixed text: no PHI, no file names (the
 * product never stores a file's name; the browser shows its own while it uploads). Safe to import in
 * the browser.
 */

export interface EntryCounts {
  readonly total: number;
  readonly byStatus: Readonly<Partial<Record<DocumentStatus, number>>>;
}

export interface Receipt {
  readonly documentId: string;
  readonly parentDocumentId: string | null;
  readonly kind: DocumentKind;
  readonly sizeBytes: string;
  /** When the upload was requested (UTC, ISO 8601). */
  readonly receivedAt: string;
  readonly status: DocumentStatus;
  readonly scanStatus: ScanStatus;
  readonly sha256: string | null;
  /** For a duplicate: the practice's first document with the same bytes. */
  readonly duplicateOf: { readonly documentId: string; readonly receivedAt: string } | null;
  /** For a zip: its entries, by status. */
  readonly entries: EntryCounts | null;
}

export type Stage = 'waiting' | 'received' | 'scanned' | 'stored' | 'expanded' | 'parsed' | 'balanced' | 'loaded' | 'held' | 'failed';

export interface ReceiptState {
  /** The receipt's stage, in the words of J4. */
  readonly stage: Stage;
  readonly label: string;
  /** What happened, or why it is held, and what to do next. Fixed text. */
  readonly detail: string;
  readonly held: boolean;
  /** Whether nothing more will happen to it without a person (or the parser, once it arrives). */
  readonly settled: boolean;
  /** What a retry does: upload the bytes again (the browser still has the file) or run intake again. */
  readonly retry: 'upload' | 'intake' | null;
}

export const KIND_NAMES: Readonly<Record<DocumentKind, string>> = {
  x12_835: '835 remittance',
  contract: 'contract',
  exhibit: 'exhibit',
  posting_export: 'posting export',
  eft_export: 'EFT export',
  payer_letter: 'payer letter',
  other: 'document',
};

/** A size for people: bytes up to a KiB, then KiB, MiB or GiB to one decimal. */
export function formatBytes(bytes: number): string {
  const units = ['bytes', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${String(bytes)} bytes` : `${value.toFixed(1)} ${units[unit] ?? ''}`;
}

/** A UTC timestamp to the minute (PRD 6, Cross-cutting: dates shown in UTC). */
export function utcMinute(iso: string): string {
  return `${iso.slice(0, 16).replace('T', ' ')} UTC`;
}

/** A short form of an opaque ID, for people to tell receipts apart; the full ID is in the report. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

function held(detail: string): ReceiptState {
  return { stage: 'held', label: 'Held', detail, held: true, settled: true, retry: null };
}

function entrySummary(entries: EntryCounts): string {
  const count = (statuses: readonly DocumentStatus[]) => statuses.reduce((sum, status) => sum + (entries.byStatus[status] ?? 0), 0);
  const queued = count(['scanned', 'parse_queued', 'parsed', 'balanced', 'loaded']);
  const stored = count(['stored']);
  const waiting = count(['received']);
  const heldCount = entries.total - queued - stored - waiting;
  const parts = [`${String(entries.total)} ${entries.total === 1 ? 'file' : 'files'}`, `${String(queued)} queued for parse`];
  if (stored > 0) {
    parts.push(`${String(stored)} stored`);
  }
  if (waiting > 0) {
    parts.push(`${String(waiting)} in progress`);
  }
  parts.push(`${String(heldCount)} held`);
  return parts.join(', ');
}

/** The receipt's state, label and reason. */
export function receiptState(receipt: Receipt): ReceiptState {
  switch (receipt.status) {
    case 'awaiting_upload':
      return { stage: 'waiting', label: 'Waiting for the upload', detail: 'The file has not arrived. Upload it again to retry.', held: false, settled: false, retry: 'upload' };
    case 'received':
      return { stage: 'received', label: 'Received', detail: 'Scanning for malware.', held: false, settled: false, retry: 'intake' };
    case 'scanned':
      return receipt.entries === null
        ? { stage: 'scanned', label: 'Scanned', detail: 'The malware scan is clean; queued for parse.', held: false, settled: false, retry: 'intake' }
        : { stage: 'scanned', label: 'Scanned', detail: `Expanding the zip: ${entrySummary(receipt.entries)} so far.`, held: false, settled: false, retry: 'intake' };
    case 'parse_queued':
      return { stage: 'scanned', label: 'Scanned', detail: 'The malware scan is clean; queued for parse.', held: false, settled: true, retry: null };
    case 'stored':
      return { stage: 'stored', label: 'Stored', detail: `The malware scan is clean; the ${KIND_NAMES[receipt.kind]} is kept for its review.`, held: false, settled: true, retry: null };
    case 'expanded':
      return { stage: 'expanded', label: 'Expanded', detail: `Each file in the zip has its own receipt: ${entrySummary(receipt.entries ?? { total: 0, byStatus: {} })}.`, held: false, settled: true, retry: null };
    case 'parsed':
      return { stage: 'parsed', label: 'Parsed', detail: 'Parsed; balancing next.', held: false, settled: false, retry: null };
    case 'balanced':
      return { stage: 'balanced', label: 'Balanced', detail: 'Every transaction balances; loading next.', held: false, settled: false, retry: null };
    case 'loaded':
      return { stage: 'loaded', label: 'Loaded', detail: 'Loaded.', held: false, settled: true, retry: null };
    case 'held':
      return held('The parser held it: download the error report for the segment and position.');
    case 'duplicate':
      return held(
        receipt.duplicateOf === null
          ? 'Duplicate of an earlier file with the same bytes; nothing loads from it.'
          : `Duplicate of file ${shortId(receipt.duplicateOf.documentId)} (received ${receipt.duplicateOf.receivedAt.slice(0, 10)}); nothing loads from it.`,
      );
    case 'quarantined':
      return held(
        receipt.entries === null
          ? 'Quarantined: it is malware, an executable or a script. Nothing in it is parsed.'
          : 'Quarantined: a file in the zip is malware, an executable or a script. Nothing in the zip is parsed.',
      );
    case 'not_835':
      return held('Not an 835: the file does not start with an ISA header. Check you chose the right file.');
    case 'wrong_type':
      return held(`Not a ${KIND_NAMES[receipt.kind]}: the file is another type of document.`);
    case 'unreadable':
      return held('Unreadable: the file is damaged, empty, or not the size it was sent as. Upload it again.');
    case 'too_large':
      return held('Larger than the limit for one file in a zip (256 MiB), or past the zip’s total (64 GiB). Upload it on its own or in a smaller zip.');
    case 'too_compressed':
      return held('Compressed far beyond what 835 files compress to (a possible zip bomb). It was not expanded.');
    case 'nested_zip':
      return held('A zip inside the zip. Unzip it and upload what it holds.');
    case 'unsafe_entry':
      return held('Its path inside the zip is unsafe (absolute, outside the zip, or a link). It was not read.');
    case 'encrypted':
      return held('Encrypted with a password. Upload it without one.');
    case 'too_many_entries':
      return held('More than 50,000 files in one zip. Split it into smaller zips.');
    case 'failed':
      return { stage: 'failed', label: 'Failed', detail: 'Intake failed three times and the operator has been alerted. Retry when ready.', held: true, settled: true, retry: 'intake' };
  }
}
