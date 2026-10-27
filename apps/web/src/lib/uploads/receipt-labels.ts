import type { DocumentKind, DocumentStatus, ScanStatus } from '@tp/db/runtime';
import { centsToString, formatUsd, negateCents, parseCents } from '@tp/money';

/**
 * A document's receipt (PRD 5, J4: "a receipt per file: received, scanned, parsed, balanced, loaded,
 * or held with a reason (does not balance, duplicate of file X, not an 835, unreadable)"), as the
 * Uploads screen and the error report show it. Plain data and fixed text: no PHI, no file names (the
 * product never stores a file's name; the browser shows its own while it uploads), and never a cell's
 * value from an ERA export: a hold names the column by the format's header and the row by its number.
 * Safe to import in the browser.
 */

export interface EntryCounts {
  readonly total: number;
  readonly byStatus: Readonly<Partial<Record<DocumentStatus, number>>>;
}

/** What a remittance was loaded from (remittance.provenance, D12): a payer's 835, or a system's ERA export. */
export type Provenance = 'x12_835' | 'era_export';

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

/**
 * Why a remittance was loaded for review, or (an 835's payment already loaded from an ERA export, D13) held
 * for it.
 */
export type ReviewReason = 'trace_reused_another_date' | 'trace_reused_same_date' | 'payment_loaded_from_export';

/** What became of one transaction set of an 835. */
export interface ParsedTransaction {
  readonly interchange: number;
  readonly group: number;
  readonly transaction: number;
  readonly segmentIndex: number;
  readonly st02: string;
  /** held_for_review: the payment was loaded earlier from an ERA export, so nothing of it loads (D13). */
  readonly outcome: 'loaded' | 'loaded_for_review' | 'duplicate_remittance' | 'held' | 'held_for_review';
  readonly remittanceId: string | null;
  readonly linkedRemittanceId: string | null;
  readonly linkedDocumentId: string | null;
  /** What the linked remittance was loaded from; absent from reports written before ERA exports. */
  readonly linkedProvenance?: Provenance | null;
  readonly reviewReason?: ReviewReason | null;
  readonly claims: number;
  readonly lines: number;
  readonly reasons: readonly ParseErrorCode[];
}

/**
 * The ERA export normalizer's held reasons, a closed list (ERA_EXPORT_HELD_REASONS of the worker's
 * apps/worker/src/parse/era/normalize.ts; a test holds the two equal). The first five, and a blank or
 * unreadable cell of a payment's key, hold the whole document; the rest hold one payment.
 */
export const EXPORT_HELD_REASONS = [
  'export_unreadable',
  'export_empty',
  'export_too_large',
  'export_column_missing',
  'export_column_repeated',
  'export_value_missing',
  'export_value_unreadable',
  'export_payment_inconsistent',
  'export_claim_inconsistent',
  'export_line_unbalanced',
  'export_payment_unbalanced',
  'export_adjustment_unattributed',
  'export_payment_other_payer',
] as const;
export type ExportHeldReason = (typeof EXPORT_HELD_REASONS)[number];

/**
 * One hold of an ERA export: its reason, the column by its header in the format's layout, the data row by
 * its number (the header row is not counted) and the payment by its place in the file. Never a cell's value.
 */
export interface ExportError {
  readonly code: 'EXPORT_HELD';
  readonly reason: ExportHeldReason;
  readonly column: string | null;
  readonly row: number | null;
  readonly payment: number | null;
}

/** What became of one payment of an ERA export (its rows share payee, trace, payment date and amount). */
export interface ExportPayment {
  /** Its place among the file's payments, from 1. */
  readonly payment: number;
  /** Its first data row, and how many rows it has. */
  readonly firstRow: number;
  readonly rows: number;
  readonly outcome: 'loaded' | 'loaded_for_review' | 'duplicate_remittance' | 'held';
  readonly remittanceId: string | null;
  readonly linkedRemittanceId: string | null;
  readonly linkedDocumentId: string | null;
  readonly linkedProvenance: Provenance | null;
  readonly reviewReason: 'trace_reused_another_date' | 'trace_reused_same_date' | null;
  readonly claims: number;
  readonly lines: number;
  readonly reasons: readonly ExportHeldReason[];
}

/** The counts of a parse report (parse_report), whichever kind of document it read. */
interface ParseCounts {
  readonly outcome: 'loaded' | 'held' | 'partially_held' | 'duplicate';
  /** Transaction sets of an 835; payments of an ERA export. */
  readonly transactions: number;
  readonly claims: number;
  readonly lines: number;
  readonly reversals: number;
  readonly held: number;
  readonly plbTotalCents: string;
  readonly loaded: { readonly transactions: number; readonly claims: number; readonly lines: number };
  readonly duplicates: number;
  readonly unknownCodes: readonly string[];
}

/** An 835's parse report: what each transaction set became, and each error with its segment and position. */
export interface X12ParseSummary extends ParseCounts {
  readonly source: 'x12_835';
  readonly errors: readonly ParsedError[];
  readonly transactionOutcomes: readonly ParsedTransaction[];
}

/** An ERA export's parse report: what each payment became, and each hold with its column and row. */
export interface ExportParseSummary extends ParseCounts {
  readonly source: 'era_export';
  readonly errors: readonly ExportError[];
  readonly transactionOutcomes: readonly ExportPayment[];
}

/** The parse report (parse_report), as the receipt carries it: counts, outcomes and positions, by the kind of document. */
export type ParseSummary = X12ParseSummary | ExportParseSummary;

/** The format of an ERA export, as the receipt names it: "WebPT Billing ERA export". */
export interface ReceiptFormat {
  readonly id: string;
  readonly name: string;
  /** FORMAT_UNCONFIRMED in the registry: its layout is a placeholder no format description has confirmed. */
  readonly unconfirmed: boolean;
}

export interface Receipt {
  readonly documentId: string;
  readonly parentDocumentId: string | null;
  readonly kind: DocumentKind;
  /** For an ERA export: the system's format the person chose (source_document.format_id). */
  readonly format: ReceiptFormat | null;
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
  /** For a parsed 835 or ERA export: its parse report. */
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
  era_export: 'ERA export',
  contract: 'contract',
  exhibit: 'exhibit',
  posting_export: 'posting export',
  eft_export: 'EFT export',
  payer_letter: 'payer letter',
  other: 'document',
};

/** What the receipt calls the document: its kind, or for an ERA export its format ("WebPT Billing ERA export"). */
export function documentName(receipt: Pick<Receipt, 'kind' | 'format'>): string {
  return receipt.format === null ? KIND_NAMES[receipt.kind] : receipt.format.name;
}

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

/**
 * The pages other than a receipt's own that link its error report, as the link's ?from= names them (docs/adr/0079): the
 * Uploads screen's receipts. A refused report comes back to the page named; without one (the receipt's page, or a zip's
 * list of its files), to the file's own receipt, which links its zip.
 */
export const REPORT_FROM = ['uploads'] as const;

export type ReportFrom = (typeof REPORT_FROM)[number];

/** A receipt's error report link, naming the page it is on when that is not the receipt's own (ReportFrom). */
export function reportHref(practiceId: string, documentId: string, from?: ReportFrom): string {
  const path = `/p/${practiceId}/uploads/${documentId}/report`;
  return from === undefined ? path : `${path}?from=${from}`;
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

/** Cents, as canonical integer text, as US dollars in a sentence, without a float: "-$1.00", as <Money> shows them. */
const usd = (cents: string) => formatUsd(parseCents(cents));

/**
 * The provider adjustments' total (PLB) as which way it moved the payment, and by how much: the 835 subtracts it, so
 * a positive total was withheld from the payment and a negative one (interest, say) added to it (edi835's balance:
 * payment = claims paid − PLB). Null when there are none. The magnitude is canonical cents text, for <Money>.
 */
export function providerAdjustments(plbTotalCents: string): { readonly direction: 'withheld' | 'added'; readonly magnitudeCents: string } | null {
  const total = parseCents(plbTotalCents);
  if (total === 0n) {
    return null;
  }
  return total > 0n ? { direction: 'withheld', magnitudeCents: centsToString(total) } : { direction: 'added', magnitudeCents: centsToString(negateCents(total)) };
}

/**
 * Which way a balance is off, by its scope, from the sign of the parser's difference (edi835's balance): for a payment,
 * claims paid less PLB less the payment; for a claim or a line, its charge less its adjustments less its payment; for
 * a claim's lines, their charges less the claim's.
 */
const BALANCE_DIRECTION: Readonly<Record<string, { readonly over: string; readonly under: string }>> = {
  transaction: { over: 'the payment is less than the claims paid less provider adjustments', under: 'the payment is more than the claims paid less provider adjustments' },
  claim: { over: 'the claim’s payment and adjustments come to less than its charge', under: 'the claim’s payment and adjustments come to more than its charge' },
  claim_lines: { over: 'its lines’ charges come to more than the claim’s charge', under: 'its lines’ charges come to less than the claim’s charge' },
  line: { over: 'the line’s payment and adjustments come to less than its charge', under: 'the line’s payment and adjustments come to more than its charge' },
};

/** Where an error is, in words: its segment index and ID and its element (PRD 10: "segment and position"). */
export function errorPosition(error: ParsedError): string {
  const element = error.elementPosition === 0 ? '' : `, element ${String(error.elementPosition)}${error.componentPosition === undefined ? '' : `-${String(error.componentPosition)}`}`;
  return `segment ${String(error.segmentIndex)}${error.segmentId === '' ? '' : ` (${error.segmentId})`}${element}`;
}

/** One error as a sentence: what, where, and for a balance by how much and which way. */
export function errorText(error: ParsedError): string {
  const what = error.code === 'EDI_SYNTAX' && error.reason === 'truncated' ? 'Cut short' : ERROR_TEXT[error.code];
  if (error.differenceCents === undefined) {
    return `${what} at ${errorPosition(error)}`;
  }
  const difference = parseCents(error.differenceCents);
  const way = difference === 0n || error.scope === undefined ? undefined : BALANCE_DIRECTION[error.scope]?.[difference > 0n ? 'over' : 'under'];
  return `${what} by ${formatUsd(difference < 0n ? negateCents(difference) : difference)} at ${errorPosition(error)}${way === undefined ? '' : `: ${way}`}`;
}

// ---------------------------------------------------------------------------------------------------
// ERA exports: where a hold is, what it is, and what to do
// ---------------------------------------------------------------------------------------------------

/** The most one ERA export may be (ERA_EXPORT_MAX_BYTES in the worker's normalizer), in MiB. */
export const EXPORT_MAX_MIB = 4;

/** The column, by the format's header, in quotes. */
function quoted(column: string | null): string {
  return column === null ? 'a column' : `“${column}”`;
}

/** Where an export's hold is, in words: its row below the header, its payment and its column, or the file. */
export function exportErrorPosition(error: ExportError): string {
  const parts: string[] = [];
  if (error.row !== null) {
    parts.push(`row ${String(error.row)} below the header`);
  }
  if (error.payment !== null) {
    parts.push(`payment ${String(error.payment)}`);
  }
  if (error.column !== null) {
    parts.push(`column ${quoted(error.column)}`);
  }
  return parts.length === 0 ? 'the file' : parts.join(', ');
}

/** A row's or a payment's place, as the sentence opens: "Row 4 below the header, payment 3". */
function placeOf(error: ExportError): string {
  const place = [error.row === null ? null : `row ${String(error.row)} below the header`, error.payment === null ? null : `payment ${String(error.payment)}`].filter((part) => part !== null).join(', ');
  return (place === '' ? 'the file' : place).replace(/^./, (first) => first.toUpperCase());
}

const CORRECT_THE_PAYMENT = 'Correct the payment in the system the export came from and export it again, or upload the payer’s 835 for that payment instead.';
const CHECK = (what: string) => `Check the ${what} in the system the export came from; if the export is right, upload the payer’s 835 for that payment instead.`;

/** What to do about a hold of each reason: plain steps a billing manager can take, never a cell's value. */
export const EXPORT_REMEDIES: Readonly<Record<ExportHeldReason, string>> = {
  export_unreadable: 'Export it again from the system as CSV (comma-separated, UTF-8) and upload that file.',
  export_empty: 'Check the export’s date range, export it again and upload that file.',
  export_too_large: 'Export a shorter date range at a time and upload each file.',
  export_column_missing: 'Export it again with every column of the layout, or check you chose the system the export came from.',
  export_column_repeated: 'Export it again without the extra column, or check you chose the system the export came from.',
  export_value_missing: CORRECT_THE_PAYMENT,
  export_value_unreadable: CORRECT_THE_PAYMENT,
  export_payment_inconsistent: CHECK('payment'),
  export_claim_inconsistent: CHECK('claim'),
  export_line_unbalanced: CHECK('line'),
  export_payment_unbalanced: CHECK('payment'),
  export_adjustment_unattributed: CHECK('line’s adjustment codes'),
  export_payment_other_payer: CHECK('payment and its payer'),
};

/** One hold of an ERA export as a sentence: what, and where (the file, a column, or a row and its payment). */
export function exportErrorText(error: ExportError): string {
  const column = quoted(error.column);
  const at = placeOf(error);
  switch (error.reason) {
    case 'export_unreadable':
      return 'The file cannot be read as CSV text: it may be a spreadsheet, damaged, or saved in an encoding other than UTF-8.';
    case 'export_empty':
      return 'The file holds no payment rows.';
    case 'export_too_large':
      return `The file is larger than ${String(EXPORT_MAX_MIB)} MiB, the most one ERA export may be.`;
    case 'export_column_missing':
      return `The column ${column} is missing.`;
    case 'export_column_repeated':
      return `The column ${column} appears more than once, so which one to read is unclear.`;
    case 'export_value_missing':
      return `${at}: ${column} is blank.`;
    case 'export_value_unreadable':
      return `${at}: ${column} cannot be read: a date, amount, code or count is not written the way this format writes it.`;
    case 'export_payment_inconsistent':
      return `${at}: the rows of one payment disagree on ${column}, so they cannot be one payment.`;
    case 'export_claim_inconsistent':
      return `${at}: ${column} changes inside one claim.`;
    case 'export_line_unbalanced':
      return `${at}: the charge is not the paid amount plus the adjustments, so the line does not balance.`;
    case 'export_payment_unbalanced':
      return `${at}: the claims’ paid amounts do not add up to the payment amount, so the payment does not balance.`;
    case 'export_adjustment_unattributed':
      return `${at}: an adjustment total has no adjustment code of its group in ${column}, or the other adjustment codes mix groups.`;
    case 'export_payment_other_payer':
      return `${at}: a payment already loaded has the same payee, check or EFT number, amount and date but names another payer and none of the same claims, so this one is held rather than taken as a repeat of it.`;
  }
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

const PROVENANCE_NAMES: Readonly<Record<Provenance, { readonly one: string; readonly many: string }>> = {
  x12_835: { one: '835 file', many: '835 files' },
  era_export: { one: 'ERA export file', many: 'ERA export files' },
};

/** The files a document's payments were already loaded from: "835 file 1a2b3c4d and ERA export file 5e6f7a8b". */
function sourcesText(items: readonly { readonly linkedDocumentId: string | null; readonly linkedProvenance?: Provenance | null }[], fallback: Provenance): string {
  const by = new Map<Provenance, string[]>();
  for (const item of items) {
    if (item.linkedDocumentId === null) {
      continue;
    }
    const provenance = item.linkedProvenance ?? fallback;
    const ids = by.get(provenance) ?? [];
    if (!ids.includes(shortId(item.linkedDocumentId))) {
      ids.push(shortId(item.linkedDocumentId));
    }
    by.set(provenance, ids);
  }
  return (['x12_835', 'era_export'] as const)
    .flatMap((provenance) => {
      const ids = by.get(provenance);
      return ids === undefined ? [] : [`${ids.length === 1 ? PROVENANCE_NAMES[provenance].one : PROVENANCE_NAMES[provenance].many} ${ids.join(', ')}`];
    })
    .join(' and ');
}

/** What a parsed document loaded, in words. */
function loadedText(parse: ParseSummary): string {
  const parts = [`${plural(parse.loaded.transactions, 'remittance')}, ${plural(parse.loaded.claims, 'claim')} and ${plural(parse.loaded.lines, 'line')}`];
  if (parse.reversals > 0) {
    parts.push(`${plural(parse.reversals, 'reversal')} linked to its original where loaded`);
  }
  const adjustments = providerAdjustments(parse.plbTotalCents);
  if (adjustments !== null) {
    parts.push(`provider adjustments ${adjustments.direction} ${usd(adjustments.magnitudeCents)} ${adjustments.direction === 'withheld' ? 'from' : 'to'} the payment`);
  }
  if (parse.duplicates > 0) {
    if (parse.source === 'era_export') {
      const from = sourcesText(
        parse.transactionOutcomes.filter((item) => item.outcome === 'duplicate_remittance'),
        'x12_835',
      );
      parts.push(`${plural(parse.duplicates, 'payment')} already loaded from ${from === '' ? 'another file' : from}, so nothing of ${parse.duplicates === 1 ? 'it' : 'them'} loads again`);
    } else {
      parts.push(`${plural(parse.duplicates, 'remittance')} already loaded from another file`);
    }
  }
  if (parse.transactionOutcomes.some((item) => item.outcome === 'loaded_for_review')) {
    parts.push('a trace number the payer used before, flagged for review');
  }
  if (parse.unknownCodes.length > 0) {
    parts.push(`unknown codes loaded with a flag: ${parse.unknownCodes.join(', ')}`);
  }
  return `Loaded ${parts.join('; ')}.`;
}

/**
 * Why an 835's payments are held for review (D13): each was loaded earlier from an ERA export, and lines already
 * loaded and priced are never replaced, so nothing of it loads beside them.
 */
export function reviewText(items: readonly Pick<ParsedTransaction, 'linkedDocumentId' | 'linkedProvenance'>[]): string {
  const from = sourcesText(items, 'era_export');
  const one = items.length === 1;
  return (
    `Held for review: ${one ? 'a payment in it was' : `${String(items.length)} payments in it were`} already loaded from ${from === '' ? 'an ERA export' : from}. ` +
    `The 835 is the payer’s own record, but lines already loaded are never replaced, so nothing of ${one ? 'that payment' : 'those payments'} loads beside them. ` +
    'Compare the 835 with the remittance loaded from the export; if they differ, open a support ticket.'
  );
}

/** Why a parsed document is held, with the first error's position (an 835's segment, an export's row and column). */
function heldText(parse: ParseSummary): string {
  const unit = parse.source === 'era_export' ? 'payment' : 'transaction set';
  const lead =
    parse.outcome === 'partially_held'
      ? `Partly held: ${String(parse.transactions - parse.held)} of ${plural(parse.transactions, unit)} loaded or already loaded, ${String(parse.held)} held.`
      : 'Held: nothing in it loaded.';
  if (parse.source === 'era_export') {
    const [first] = parse.errors;
    const where = first === undefined ? '' : ` ${exportErrorText(first)} ${EXPORT_REMEDIES[first.reason]}`;
    return `${lead}${where} The error report lists every row and column.`;
  }
  const reviewed = parse.transactionOutcomes.filter((item) => item.outcome === 'held_for_review');
  const review = reviewed.length === 0 ? '' : ` ${reviewText(reviewed)}`;
  const first = parse.errors.find((error) => error.code !== 'EDI_UNKNOWN_CODE');
  const where = first === undefined ? '' : ` ${errorText(first)}.`;
  return `${lead}${review}${where} The error report lists every position.`;
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

/**
 * A duplicate's reason: the same bytes as an earlier file (PAR-06), or remittances already loaded (PAR-07); for an
 * ERA export, payments already loaded from an 835 or another export (D13), named by what they were loaded from.
 */
function duplicateText(receipt: Receipt): string {
  if (receipt.duplicateOf !== null) {
    return `Duplicate of file ${shortId(receipt.duplicateOf.documentId)} (received ${receipt.duplicateOf.receivedAt.slice(0, 10)}); nothing loads from it.`;
  }
  const parse = receipt.parse;
  if (parse?.source === 'era_export') {
    const from = sourcesText(parse.transactionOutcomes, 'x12_835');
    const one = parse.transactionOutcomes.length === 1;
    if (from === '') {
      return 'Already loaded: every payment in it was loaded before from another file, so nothing loads from it.';
    }
    return (
      `Already loaded: ${one ? 'its payment was' : `all ${String(parse.transactionOutcomes.length)} of its payments were`} loaded before from ${from}, so nothing loads from it. ` +
      `${one ? 'The payment is linked to the remittance it repeats' : 'Each payment is linked to the remittance it repeats'}; the receipt lists ${one ? 'it' : 'them'}.`
    );
  }
  const linked = [...new Set((parse?.transactionOutcomes ?? []).flatMap((item) => (item.linkedDocumentId === null ? [] : [shortId(item.linkedDocumentId)])))];
  if (linked.length > 0) {
    return `Duplicate remittance: already loaded from file ${linked.join(', ')}; nothing loads from it, and it is linked to the original.`;
  }
  return 'Duplicate of an earlier file with the same bytes; nothing loads from it.';
}

/** The kinds read as CSV text only (docs/adr/0059), as the wrong-type receipt names them. */
const CSV_KIND_WORDS: Readonly<Partial<Record<string, string>>> = { posting_export: 'posting', eft_export: 'EFT', era_export: 'ERA' };

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
    case 'wrong_type': {
      // An export is read as CSV only (docs/adr/0059): a workbook is held as wrong_type, and so is any other
      // file that is not CSV text (an 835, a PDF). The receipt does not know which, so it says both.
      const words = CSV_KIND_WORDS[receipt.kind];
      return held(
        words === undefined
          ? `Not a ${KIND_NAMES[receipt.kind]}: the file is another type of document.`
          : `Not a CSV file: ${words} exports are read as CSV only. If it is a spreadsheet, save it as CSV (comma-separated) and upload it again; otherwise check you chose the right file and kind.`,
      );
    }
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
