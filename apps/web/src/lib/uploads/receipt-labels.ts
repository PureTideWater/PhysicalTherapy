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

/** The parser's codes for what it held a transaction set or document for (PRD 10, Errors). */
export type ParseErrorCode = 'EDI_SYNTAX' | 'EDI_CONTROL_MISMATCH' | 'EDI_UNBALANCED' | 'EDI_UNKNOWN_CODE' | 'EDI_DUPLICATE' | 'EDI_NOT_835';

/** One error of the parse report: a code and its position, never a field's value. */
export interface ParsedError {
  readonly code: ParseErrorCode;
  readonly reason?: string;
  readonly scope?: string;
  readonly list?: string;
  readonly segmentIndex: number;
  readonly segmentId: string;
  readonly elementPosition: number;
  readonly componentPosition?: number;
  readonly differenceCents?: string;
  readonly transaction?: { readonly interchange: number; readonly group: number; readonly transaction: number; readonly st02: string };
}

/** What became of one transaction set of the document. */
export interface ParsedTransaction {
  readonly interchange: number;
  readonly group: number;
  readonly transaction: number;
  readonly segmentIndex: number;
  readonly st02: string;
  readonly outcome: 'loaded' | 'loaded_for_review' | 'duplicate_remittance' | 'held';
  readonly remittanceId: string | null;
  readonly linkedRemittanceId: string | null;
  readonly linkedDocumentId: string | null;
  readonly claims: number;
  readonly lines: number;
  readonly reasons: readonly ParseErrorCode[];
}

/** The parse report (parse_report), as the receipt carries it: counts, outcomes and positions. */
export interface ParseSummary {
  readonly outcome: 'loaded' | 'held' | 'partially_held' | 'duplicate';
  readonly transactions: number;
  readonly claims: number;
  readonly lines: number;
  readonly reversals: number;
  readonly held: number;
  readonly plbTotalCents: string;
  readonly loaded: { readonly transactions: number; readonly claims: number; readonly lines: number };
  readonly duplicates: number;
  readonly unknownCodes: readonly string[];
  readonly errors: readonly ParsedError[];
  readonly transactionOutcomes: readonly ParsedTransaction[];
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
  /** For a parsed 835: its parse report. */
  readonly parse: ParseSummary | null;
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

const ERROR_TEXT: Readonly<Record<ParseErrorCode, string>> = {
  EDI_SYNTAX: 'Unreadable',
  EDI_CONTROL_MISMATCH: 'A control number or count does not match',
  EDI_UNBALANCED: 'Does not balance',
  EDI_UNKNOWN_CODE: 'An unknown code',
  EDI_DUPLICATE: 'A duplicate',
  EDI_NOT_835: 'Not an 835',
};

/** Cents as dollars with two places, without a float: "-1.00". */
export function centsText(cents: string): string {
  const negative = cents.startsWith('-');
  const digits = (negative ? cents.slice(1) : cents).padStart(3, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -2).replace(/^0+(?=\d)/, '')}.${digits.slice(-2)}`;
}

/** Where an error is, in words: its segment index and ID and its element (PRD 10: "segment and position"). */
export function errorPosition(error: ParsedError): string {
  const element = error.elementPosition === 0 ? '' : `, element ${String(error.elementPosition)}${error.componentPosition === undefined ? '' : `-${String(error.componentPosition)}`}`;
  return `segment ${String(error.segmentIndex)}${error.segmentId === '' ? '' : ` (${error.segmentId})`}${element}`;
}

/** One error as a sentence: what, where, and by how much for a balance. */
export function errorText(error: ParsedError): string {
  const what = error.code === 'EDI_SYNTAX' && error.reason === 'truncated' ? 'Cut short' : ERROR_TEXT[error.code];
  const difference = error.differenceCents === undefined ? '' : ` by $${centsText(error.differenceCents)}`;
  return `${what}${difference} at ${errorPosition(error)}`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** What a parsed document loaded, in words. */
function loadedText(parse: ParseSummary): string {
  const parts = [`${plural(parse.loaded.transactions, 'remittance')}, ${plural(parse.loaded.claims, 'claim')} and ${plural(parse.loaded.lines, 'line')}`];
  if (parse.reversals > 0) {
    parts.push(`${plural(parse.reversals, 'reversal')} linked to its original where loaded`);
  }
  if (parse.plbTotalCents !== '0') {
    parts.push(`provider adjustments of $${centsText(parse.plbTotalCents)}`);
  }
  if (parse.duplicates > 0) {
    parts.push(`${plural(parse.duplicates, 'remittance')} already loaded from another file`);
  }
  if (parse.transactionOutcomes.some((item) => item.outcome === 'loaded_for_review')) {
    parts.push('a trace number the payer used before, flagged for review');
  }
  if (parse.unknownCodes.length > 0) {
    parts.push(`unknown codes loaded with a flag: ${parse.unknownCodes.join(', ')}`);
  }
  return `Loaded ${parts.join('; ')}.`;
}

/** Why a parsed document is held, with the first error's segment and position. */
function heldText(parse: ParseSummary): string {
  const first = parse.errors.find((error) => error.code !== 'EDI_UNKNOWN_CODE');
  const where = first === undefined ? '' : ` ${errorText(first)}.`;
  const lead =
    parse.outcome === 'partially_held'
      ? `Partly held: ${String(parse.transactions - parse.held)} of ${plural(parse.transactions, 'transaction set')} loaded or already loaded, ${String(parse.held)} held.`
      : 'Held: nothing in it loaded.';
  return `${lead}${where} The error report lists every position.`;
}

function entrySummary(entries: EntryCounts): string {
  const count = (statuses: readonly DocumentStatus[]) => statuses.reduce((sum, status) => sum + (entries.byStatus[status] ?? 0), 0);
  const loadedCount = count(['loaded']);
  const queued = count(['scanned', 'parse_queued', 'parsed', 'balanced']);
  const stored = count(['stored']);
  const waiting = count(['received']);
  const heldCount = entries.total - loadedCount - queued - stored - waiting;
  const parts = [`${String(entries.total)} ${entries.total === 1 ? 'file' : 'files'}`];
  if (loadedCount > 0) {
    parts.push(`${String(loadedCount)} loaded`);
  }
  if (queued > 0 || loadedCount === 0) {
    parts.push(`${String(queued)} queued for parse`);
  }
  if (stored > 0) {
    parts.push(`${String(stored)} stored`);
  }
  if (waiting > 0) {
    parts.push(`${String(waiting)} in progress`);
  }
  parts.push(`${String(heldCount)} held`);
  return parts.join(', ');
}

/** A duplicate's reason: the same bytes as an earlier file (PAR-06), or remittances already loaded (PAR-07). */
function duplicateText(receipt: Receipt): string {
  if (receipt.duplicateOf !== null) {
    return `Duplicate of file ${shortId(receipt.duplicateOf.documentId)} (received ${receipt.duplicateOf.receivedAt.slice(0, 10)}); nothing loads from it.`;
  }
  const linked = [...new Set((receipt.parse?.transactionOutcomes ?? []).flatMap((item) => (item.linkedDocumentId === null ? [] : [shortId(item.linkedDocumentId)])))];
  if (linked.length > 0) {
    return `Duplicate remittance: already loaded from file ${linked.join(', ')}; nothing loads from it, and it is linked to the original.`;
  }
  return 'Duplicate of an earlier file with the same bytes; nothing loads from it.';
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
      return { stage: 'scanned', label: 'Scanned', detail: 'The malware scan is clean; queued for parse.', held: false, settled: false, retry: null };
    case 'stored':
      return { stage: 'stored', label: 'Stored', detail: `The malware scan is clean; the ${KIND_NAMES[receipt.kind]} is kept for its review.`, held: false, settled: true, retry: null };
    case 'expanded': {
      const entries = receipt.entries ?? { total: 0, byStatus: {} };
      // Settled once no file in it is still waiting to be parsed, so the batch receipt follows its files.
      const waiting = (['received', 'scanned', 'parse_queued', 'parsed', 'balanced'] as const).some((status) => (entries.byStatus[status] ?? 0) > 0);
      return { stage: 'expanded', label: 'Expanded', detail: `Each file in the zip has its own receipt: ${entrySummary(entries)}.`, held: false, settled: !waiting, retry: null };
    }
    case 'parsed':
      return { stage: 'parsed', label: 'Parsed', detail: 'Parsed; balancing next.', held: false, settled: false, retry: null };
    case 'balanced':
      return { stage: 'balanced', label: 'Balanced', detail: 'Every transaction balances; loading next.', held: false, settled: false, retry: null };
    case 'loaded':
      return { stage: 'loaded', label: 'Loaded', detail: receipt.parse === null ? 'Loaded.' : loadedText(receipt.parse), held: false, settled: true, retry: null };
    case 'held':
      return held(receipt.parse === null ? 'The parser held it: download the error report for the segment and position.' : heldText(receipt.parse));
    case 'duplicate':
      return held(duplicateText(receipt));
    case 'quarantined':
      return held(
        receipt.entries === null
          ? 'Quarantined: it is malware, an executable or a script. Nothing in it is parsed.'
          : 'Quarantined: a file in the zip is malware, an executable or a script. Nothing in the zip is parsed.',
      );
    case 'not_835':
      return held('Not an 835: the file does not start with an ISA header. Check you chose the right file.');
    case 'wrong_type':
      // A posting or EFT export is read as CSV only (docs/adr/0059): a workbook is held as wrong_type.
      return held(
        receipt.kind === 'posting_export' || receipt.kind === 'eft_export'
          ? `Not a CSV: ${receipt.kind === 'posting_export' ? 'posting' : 'EFT'} exports are read as CSV only. Save it as CSV (comma-separated) and upload it again.`
          : `Not a ${KIND_NAMES[receipt.kind]}: the file is another type of document.`,
      );
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
      return { stage: 'failed', label: 'Failed', detail: 'Processing failed three times and the operator has been alerted. Retry when ready.', held: true, settled: true, retry: 'intake' };
  }
}
