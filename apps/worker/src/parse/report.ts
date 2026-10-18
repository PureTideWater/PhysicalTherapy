import type { EdiError, ParseReport, TransactionOutcome, TransactionPosition } from '@tp/edi835';

import type { TransactionLoad, TransactionReview } from './loader';

/**
 * The parse report and receipt per document (PRD 10, step 10; PRD 5, J4; Data dictionary,
 * parse_report): counts of transaction sets, claims, lines, reversals, the PLB total, the held
 * transaction sets with their reasons and positions, unknown codes, and what each transaction set
 * became. Errors carry codes and positions only (segment index, segment ID, element and component
 * position, the balance difference), never a field's value; an unknown code is listed by value only
 * when it is a CARC or RARC shaped like a code. Pure: the parse job writes the row this builds.
 */

/** What became of one transaction set. */
export type TransactionResult =
  | { readonly outcome: 'loaded'; readonly remittanceId: string; readonly claims: number; readonly lines: number; readonly review: TransactionReview | null }
  | { readonly outcome: 'duplicate_remittance'; readonly remittanceId: string; readonly documentId: string }
  | { readonly outcome: 'held'; readonly reasons: readonly EdiError[] }
  /** The payment was loaded first from an ERA export (D13 a): the export's remittance and document. */
  | { readonly outcome: 'held_for_review'; readonly remittanceId: string; readonly documentId: string };

export interface ReportedError {
  readonly code: EdiError['code'];
  readonly reason?: string;
  readonly scope?: string;
  /** The code list of an unknown code. */
  readonly list?: string;
  readonly segmentIndex: number;
  readonly segmentId: string;
  readonly elementPosition: number;
  readonly componentPosition?: number;
  /** An imbalance, in cents. */
  readonly differenceCents?: string;
  /** The transaction set the error holds or flags, when it belongs to one. */
  readonly transaction?: TransactionPosition & { readonly st02: string };
}

export interface ReportedTransaction extends TransactionPosition {
  readonly segmentIndex: number;
  readonly st02: string;
  /** held_for_review: the payment was loaded first from an ERA export, so nothing of this set loads (D13 a). */
  readonly outcome: 'loaded' | 'loaded_for_review' | 'duplicate_remittance' | 'held' | 'held_for_review';
  /** The remittance it loaded, or the one it duplicates or is reviewed against. */
  readonly remittanceId: string | null;
  readonly linkedRemittanceId: string | null;
  /** The document that loaded the remittance it duplicates, or the export it is held for review against. */
  readonly linkedDocumentId: string | null;
  /** On a held_for_review set only: what the linked remittance was loaded from, and why it is held. */
  readonly linkedProvenance?: 'era_export';
  readonly reviewReason?: 'payment_loaded_from_export';
  readonly claims: number;
  readonly lines: number;
  readonly reasons: readonly EdiError['code'][];
}

/**
 * The parse_report row of a document. An 835's errors and outcomes are its transaction sets' (ReportedError,
 * ReportedTransaction); an ERA export's are its payments' (era/report.ts), in the same columns.
 */
export interface ParseReportRow<E extends object = ReportedError, T extends object = ReportedTransaction> {
  readonly outcome: 'loaded' | 'held' | 'partially_held' | 'duplicate';
  readonly transactions: number;
  readonly claims: number;
  readonly lines: number;
  readonly reversals: number;
  readonly held: number;
  readonly plbTotalCents: string;
  readonly loadedTransactions: number;
  readonly loadedClaims: number;
  readonly loadedLines: number;
  readonly duplicateTransactions: number;
  readonly unknownCodes: readonly string[];
  readonly errors: readonly E[];
  readonly transactionOutcomes: readonly T[];
  readonly codeListRelease: number | null;
}

/** The document status the outcome gives (source_document.status). */
export function documentStatus(outcome: ParseReportRow['outcome']): 'loaded' | 'held' | 'duplicate' {
  return outcome === 'partially_held' ? 'held' : outcome;
}

/** A CARC or RARC as its lists write one. */
const CODE = /^[A-Za-z0-9]{1,8}$/;
/** The external lists whose codes are shown by value; the parser flags no other list (it holds a value outside the structure's own sets). */
const SHOWN_LISTS: ReadonlySet<string> = new Set(['carc', 'rarc']);

/** An unknown code as the receipt shows it: the value only for a CARC or RARC shaped like one, else the list alone. */
export function maskedCode(entry: string): string {
  const at = entry.indexOf(':');
  const list = entry.slice(0, at);
  const code = entry.slice(at + 1);
  return `${list}:${SHOWN_LISTS.has(list) && CODE.test(code) ? code : '(not shown)'}`;
}

function reported(error: EdiError, transaction?: ReportedError['transaction']): ReportedError {
  return {
    code: error.code,
    ...(error.reason === undefined ? {} : { reason: error.reason }),
    ...(error.scope === undefined ? {} : { scope: error.scope }),
    segmentIndex: error.segmentIndex,
    segmentId: error.segmentId,
    elementPosition: error.elementPosition,
    ...(error.componentPosition === undefined ? {} : { componentPosition: error.componentPosition }),
    ...(error.differenceCents === undefined ? {} : { differenceCents: error.differenceCents.toString() }),
    ...(transaction === undefined ? {} : { transaction }),
  };
}

function errorKey(error: Pick<ReportedError, 'code' | 'segmentIndex' | 'elementPosition' | 'componentPosition' | 'scope'>): string {
  return [error.code, error.segmentIndex, error.elementPosition, error.componentPosition ?? '', error.scope ?? ''].join(':');
}

function positionKey(position: TransactionPosition): string {
  return `${String(position.interchange)}:${String(position.group)}:${String(position.transaction)}`;
}

/** The transaction-set result a load gives. */
export function resultOf(load: TransactionLoad): TransactionResult {
  switch (load.kind) {
    case 'loaded':
      return { outcome: 'loaded', remittanceId: load.remittanceId, claims: load.claims, lines: load.lines, review: load.review };
    case 'duplicate':
      return { outcome: 'duplicate_remittance', remittanceId: load.remittanceId, documentId: load.documentId };
    case 'held_for_review':
      return { outcome: 'held_for_review', remittanceId: load.remittanceId, documentId: load.documentId };
    case 'refused':
      return {
        outcome: 'held',
        reasons: [
          {
            code: 'EDI_SYNTAX',
            reason: 'invalid_decimal',
            ...load.at,
            message: `EDI_SYNTAX at segment ${String(load.at.segmentIndex)} (${load.at.segmentId}), element ${String(load.at.elementPosition)}: a quantity with more places than can be stored exactly`,
          },
        ],
      };
  }
}

/** Whether a result holds its transaction set or payment: held, or (an 835 of a payment an export loaded) held for review. */
export const isHeld = (result: { readonly outcome: string }): boolean => result.outcome === 'held' || result.outcome === 'held_for_review';

/** The document's outcome from what each transaction set or payment became, and whether the document itself is held. */
export function overall(results: readonly { readonly outcome: string }[], documentErrors: number): ParseReportRow['outcome'] {
  const held = results.filter(isHeld).length;
  if (documentErrors > 0 || (results.length > 0 && held === results.length)) {
    return 'held';
  }
  if (held > 0) {
    return 'partially_held';
  }
  return results.length > 0 && results.every((result) => result.outcome === 'duplicate_remittance') ? 'duplicate' : 'loaded';
}

/**
 * The report row for a document: the parser's report, and what loading made of each transaction set
 * (keyed by position; a transaction set without a result was held by the parser).
 */
export function parseReportRow(report: ParseReport, results: ReadonlyMap<string, TransactionResult>): ParseReportRow {
  const seen = new Set<string>();
  const errors: ReportedError[] = [];
  const add = (error: ReportedError) => {
    const key = errorKey(error);
    if (!seen.has(key)) {
      seen.add(key);
      errors.push(error);
    }
  };
  for (const error of [...report.documentErrors, ...report.envelopeErrors]) {
    add(reported(error));
  }
  const outcomes: ReportedTransaction[] = [];
  const all: TransactionResult[] = [];
  for (const transaction of report.transactions) {
    const result = results.get(positionKey(transaction.position)) ?? ({ outcome: 'held', reasons: transaction.heldReasons } as const);
    all.push(result);
    const where = { ...transaction.position, st02: transaction.st02 };
    if (result.outcome === 'held') {
      for (const reason of result.reasons) {
        add(reported(reason, where));
      }
    }
    for (const code of transaction.unknownCodes) {
      add({ code: 'EDI_UNKNOWN_CODE', list: code.list, segmentIndex: code.segmentIndex, segmentId: code.segmentId, elementPosition: code.elementPosition, ...(code.componentPosition === undefined ? {} : { componentPosition: code.componentPosition }), transaction: where });
    }
    outcomes.push(reportedTransaction(transaction, result));
  }
  const loaded = all.filter((result): result is Extract<TransactionResult, { outcome: 'loaded' }> => result.outcome === 'loaded');
  return {
    outcome: overall(all, report.documentErrors.length),
    transactions: report.receipt.transactions,
    claims: report.receipt.claims,
    lines: report.receipt.lines,
    reversals: report.receipt.reversals,
    held: all.filter(isHeld).length,
    plbTotalCents: report.receipt.plbTotalCents.toString(),
    loadedTransactions: loaded.length,
    loadedClaims: loaded.reduce((sum, result) => sum + result.claims, 0),
    loadedLines: loaded.reduce((sum, result) => sum + result.lines, 0),
    duplicateTransactions: all.filter((result) => result.outcome === 'duplicate_remittance').length,
    unknownCodes: [...new Set(report.receipt.unknownCodes.map(maskedCode))].sort(),
    errors,
    transactionOutcomes: outcomes,
    codeListRelease: report.codeListRelease,
  };
}

function reportedTransaction(transaction: TransactionOutcome, result: TransactionResult): ReportedTransaction {
  const base = { ...transaction.position, segmentIndex: transaction.segmentIndex, st02: transaction.st02 };
  switch (result.outcome) {
    case 'loaded':
      return {
        ...base,
        outcome: result.review === null ? 'loaded' : 'loaded_for_review',
        remittanceId: result.remittanceId,
        linkedRemittanceId: result.review?.remittanceId ?? null,
        linkedDocumentId: null,
        claims: result.claims,
        lines: result.lines,
        reasons: [],
      };
    case 'duplicate_remittance':
      return { ...base, outcome: 'duplicate_remittance', remittanceId: null, linkedRemittanceId: result.remittanceId, linkedDocumentId: result.documentId, claims: 0, lines: 0, reasons: ['EDI_DUPLICATE'] };
    case 'held':
      return { ...base, outcome: 'held', remittanceId: null, linkedRemittanceId: null, linkedDocumentId: null, claims: 0, lines: 0, reasons: [...new Set(result.reasons.map((reason) => reason.code))] };
    case 'held_for_review':
      return {
        ...base,
        outcome: 'held_for_review',
        remittanceId: null,
        linkedRemittanceId: result.remittanceId,
        linkedDocumentId: result.documentId,
        linkedProvenance: 'era_export',
        reviewReason: 'payment_loaded_from_export',
        claims: 0,
        lines: 0,
        reasons: [],
      };
  }
}

export { positionKey };
