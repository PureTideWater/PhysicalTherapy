import { type DocumentKind, type DocumentStatus, type PracticeScope, type ScanStatus, type ScopeClient, readWithAudit } from '@tp/db/runtime';

import { eraFormatName, findEraExportFormat, isUnconfirmed } from '@tp/worker/era-formats';

import {
  type EntryCounts,
  type ExportError,
  type ExportPayment,
  type ParseSummary,
  type ParsedError,
  type ParsedTransaction,
  type Receipt,
  type ReceiptFormat,
  errorPosition,
  exportErrorPosition,
  receiptState,
} from './receipt-labels';

/**
 * Receipts from source_document, read under the practice's policies and through readWithAudit (every
 * returned document is an audited read), paginated server-side (PRD 6, Cross-cutting: every list
 * paginated). A zip's receipt carries its entries' counts by status (aggregates, not rows); a
 * duplicate's names the practice's first document with the same bytes (PAR-06: "duplicate of file X").
 * The parse report is decoded by the document's kind: an 835's transaction sets and segment positions, or
 * an ERA export's payments and holds by column and row (docs/adr/0060); an export's receipt names its format.
 */

export const RECEIPTS_PER_PAGE = 25;

interface Row {
  readonly id: string;
  readonly practice_id: string;
  readonly parent_document_id: string | null;
  readonly kind: DocumentKind;
  readonly format_id: string | null;
  readonly size_bytes: string;
  readonly created_at: Date;
  readonly status: DocumentStatus;
  readonly scan_status: ScanStatus;
  readonly sha256: string | null;
  readonly duplicate_of: string | null;
  readonly duplicate_of_at: Date | null;
  readonly parse_outcome: ParseSummary['outcome'] | null;
  readonly parse_transactions: number | null;
  readonly parse_claims: number | null;
  readonly parse_lines: number | null;
  readonly parse_reversals: number | null;
  readonly parse_held: number | null;
  readonly parse_plb_total_cents: string | null;
  readonly parse_loaded_transactions: number | null;
  readonly parse_loaded_claims: number | null;
  readonly parse_loaded_lines: number | null;
  readonly parse_duplicates: number | null;
  readonly parse_unknown_codes: string[] | null;
  readonly parse_errors: (ParsedError | ExportError)[] | null;
  readonly parse_transaction_outcomes: (ParsedTransaction | ExportPayment)[] | null;
}

const COLUMNS = `d.id, d.practice_id, d.parent_document_id, d.kind, d.format_id, d.size_bytes::text AS size_bytes, d.created_at, d.status, d.scan_status, d.sha256,
  first.id AS duplicate_of, first.created_at AS duplicate_of_at,
  pr.outcome AS parse_outcome, pr.transactions AS parse_transactions, pr.claims AS parse_claims, pr.lines AS parse_lines, pr.reversals AS parse_reversals,
  pr.held AS parse_held, pr.plb_total_cents::text AS parse_plb_total_cents, pr.loaded_transactions AS parse_loaded_transactions,
  pr.loaded_claims AS parse_loaded_claims, pr.loaded_lines AS parse_loaded_lines, pr.duplicate_transactions AS parse_duplicates,
  pr.unknown_codes AS parse_unknown_codes, pr.errors AS parse_errors, pr.transaction_outcomes AS parse_transaction_outcomes`;

const FIRST_OF_BYTES = `LEFT JOIN LATERAL (
    SELECT f.id, f.created_at FROM source_document f
     WHERE d.status = 'duplicate' AND f.practice_id = d.practice_id AND f.sha256 = d.sha256 AND f.status <> 'duplicate'
     ORDER BY f.created_at, f.id LIMIT 1
  ) first ON true
  LEFT JOIN parse_report pr ON pr.source_document_id = d.id`;

async function entryCounts(scope: PracticeScope<ScopeClient>, ids: readonly string[]): Promise<Map<string, EntryCounts>> {
  const counts = new Map<string, EntryCounts>();
  if (ids.length === 0) {
    return counts;
  }
  const { rows } = await scope.client.query<{ parent: string; status: DocumentStatus; n: number }>(
    'SELECT parent_document_id AS parent, status, count(*)::int AS n FROM source_document WHERE parent_document_id = ANY ($1::uuid[]) GROUP BY 1, 2',
    [ids],
  );
  for (const row of rows) {
    const known = counts.get(row.parent) ?? { total: 0, byStatus: {} };
    counts.set(row.parent, { total: known.total + row.n, byStatus: { ...known.byStatus, [row.status]: row.n } });
  }
  return counts;
}

function parseOf(row: Row): ParseSummary | null {
  if (row.parse_outcome === null) {
    return null;
  }
  const counts = {
    outcome: row.parse_outcome,
    transactions: row.parse_transactions ?? 0,
    claims: row.parse_claims ?? 0,
    lines: row.parse_lines ?? 0,
    reversals: row.parse_reversals ?? 0,
    held: row.parse_held ?? 0,
    plbTotalCents: row.parse_plb_total_cents ?? '0',
    loaded: { transactions: row.parse_loaded_transactions ?? 0, claims: row.parse_loaded_claims ?? 0, lines: row.parse_loaded_lines ?? 0 },
    duplicates: row.parse_duplicates ?? 0,
    unknownCodes: row.parse_unknown_codes ?? [],
  };
  // The report's shape is the document kind's: the export normalizer writes payments and holds by column and
  // row, the 835 parser transaction sets and segment positions (apps/worker/src/parse/era/report.ts and report.ts).
  return row.kind === 'era_export'
    ? { ...counts, source: 'era_export', errors: (row.parse_errors ?? []) as ExportError[], transactionOutcomes: (row.parse_transaction_outcomes ?? []) as ExportPayment[] }
    : { ...counts, source: 'x12_835', errors: (row.parse_errors ?? []) as ParsedError[], transactionOutcomes: (row.parse_transaction_outcomes ?? []) as ParsedTransaction[] };
}

/** An ERA export's format as the receipt names it, from the worker's format registry. */
export function receiptFormat(formatId: string | null): ReceiptFormat | null {
  if (formatId === null) {
    return null;
  }
  const format = findEraExportFormat(formatId);
  // A format the registry no longer lists (never expected: the format_id CHECK is the registry's) is named plainly and flagged.
  return format === undefined ? { id: formatId, name: 'ERA export', unconfirmed: true } : { id: format.id, name: eraFormatName(format), unconfirmed: isUnconfirmed(format) };
}

function receipt(row: Row, counts: Map<string, EntryCounts>): Receipt {
  return {
    documentId: row.id,
    parentDocumentId: row.parent_document_id,
    kind: row.kind,
    format: receiptFormat(row.format_id),
    sizeBytes: row.size_bytes,
    receivedAt: row.created_at.toISOString(),
    status: row.status,
    scanStatus: row.scan_status,
    sha256: row.sha256,
    duplicateOf: row.duplicate_of === null || row.duplicate_of_at === null ? null : { documentId: row.duplicate_of, receivedAt: row.duplicate_of_at.toISOString() },
    entries: counts.get(row.id) ?? null,
    parse: parseOf(row),
  };
}

async function audited(scope: PracticeScope<ScopeClient>, requestId: string, purpose: string, sql: string, values: unknown[]): Promise<Receipt[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'source_document', purpose, requestId },
    async (client) => (await client.query<Row>(sql, values)).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  const counts = await entryCounts(
    scope,
    rows.filter((row) => row.parent_document_id === null).map((row) => row.id),
  );
  return rows.map((row) => receipt(row, counts));
}

export interface ReceiptQuery {
  readonly practiceId: string;
  /** A zip's entries, or (when absent) the practice's top-level uploads. */
  readonly parentId?: string;
  /** Only these documents (the browser's current batch). */
  readonly documentIds?: readonly string[];
  readonly page: number;
  readonly requestId: string;
}

export interface ReceiptPage {
  readonly receipts: readonly Receipt[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
}

/** A page of receipts, newest first (a zip's entries in their order in the zip). */
export async function listReceipts(scope: PracticeScope<ScopeClient>, query: ReceiptQuery): Promise<ReceiptPage> {
  const values: unknown[] = [query.practiceId];
  const filters = ['d.practice_id = $1'];
  if (query.parentId === undefined) {
    filters.push('d.parent_document_id IS NULL');
  } else {
    values.push(query.parentId);
    filters.push(`d.parent_document_id = $${String(values.length)}`);
  }
  if (query.documentIds !== undefined) {
    values.push(query.documentIds);
    filters.push(`d.id = ANY ($${String(values.length)}::uuid[])`);
  }
  const where = filters.join(' AND ');
  const order = query.parentId === undefined ? 'd.created_at DESC, d.id DESC' : 'd.created_at, d.id';
  const { rows } = await scope.client.query<{ n: number }>(`SELECT count(*)::int AS n FROM source_document d WHERE ${where}`, values);
  const total = rows[0]?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / RECEIPTS_PER_PAGE));
  const page = Math.min(query.page, pages);
  const receipts = await audited(
    scope,
    query.requestId,
    'uploads',
    `SELECT ${COLUMNS} FROM source_document d ${FIRST_OF_BYTES} WHERE ${where} ORDER BY ${order} LIMIT ${String(RECEIPTS_PER_PAGE)} OFFSET ${String((page - 1) * RECEIPTS_PER_PAGE)}`,
    values,
  );
  return { receipts, page, pages, total };
}

/** One document's receipt. */
export async function receiptOf(scope: PracticeScope<ScopeClient>, practiceId: string, documentId: string, requestId: string): Promise<Receipt | undefined> {
  const [found] = await audited(scope, requestId, 'uploads', `SELECT ${COLUMNS} FROM source_document d ${FIRST_OF_BYTES} WHERE d.practice_id = $1 AND d.id = $2`, [practiceId, documentId]);
  return found;
}

const CSV_HEADER = [
  'record',
  'document_id',
  'parent_document_id',
  'kind',
  'stage',
  'status',
  'reason',
  'size_bytes',
  'sha256',
  'received_at',
  'duplicate_of',
  'transactions',
  'claims',
  'lines',
  'reversals',
  'plb_total_cents',
  'held_transactions',
  'loaded_transactions',
  'loaded_claims',
  'loaded_lines',
  'unknown_codes',
  'st02',
  'outcome',
  'remittance_id',
  'linked_remittance_id',
  'linked_document_id',
  'error_code',
  'error_reason',
  'segment_index',
  'segment_id',
  'element_position',
  'component_position',
  'difference_cents',
  'position',
  // An ERA export's columns (docs/adr/0060), after the 835's so a reader of the earlier columns reads them unchanged.
  'format_id',
  'payment',
  'first_row',
  'rows',
  'column',
  'row',
  'linked_provenance',
  'review_reason',
] as const;

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

type CsvRow = Partial<Record<(typeof CSV_HEADER)[number], string | number | null | undefined>>;

function csvLine(row: CsvRow): string {
  return CSV_HEADER.map((column) => csvField(String(row[column] ?? ''))).join(',');
}

/** A document's lines of the report: the document, each transaction set, each error with its position. */
function reportLines(item: Receipt): string[] {
  const state = receiptState(item);
  const parse = item.parse;
  const document = csvLine({
    record: 'document',
    document_id: item.documentId,
    parent_document_id: item.parentDocumentId,
    kind: item.kind,
    format_id: item.format?.id,
    stage: state.stage,
    status: item.status,
    reason: state.detail,
    size_bytes: item.sizeBytes,
    sha256: item.sha256,
    received_at: item.receivedAt,
    duplicate_of: item.duplicateOf?.documentId,
    transactions: parse?.transactions,
    claims: parse?.claims,
    lines: parse?.lines,
    reversals: parse?.reversals,
    plb_total_cents: parse?.plbTotalCents,
    held_transactions: parse?.held,
    loaded_transactions: parse?.loaded.transactions,
    loaded_claims: parse?.loaded.claims,
    loaded_lines: parse?.loaded.lines,
    unknown_codes: parse?.unknownCodes.join(' '),
  });
  if (parse === null) {
    return [document];
  }
  if (parse.source === 'era_export') {
    const payments = parse.transactionOutcomes.map((outcome) =>
      csvLine({
        record: 'payment',
        document_id: item.documentId,
        format_id: item.format?.id,
        payment: outcome.payment,
        first_row: outcome.firstRow,
        rows: outcome.rows,
        outcome: outcome.outcome,
        remittance_id: outcome.remittanceId,
        linked_remittance_id: outcome.linkedRemittanceId,
        linked_document_id: outcome.linkedDocumentId,
        linked_provenance: outcome.linkedProvenance,
        review_reason: outcome.reviewReason,
        claims: outcome.claims,
        lines: outcome.lines,
        error_code: outcome.reasons.join(' '),
      }),
    );
    // A hold names its column by the format's header and its row by number, never a cell's value.
    const holds = parse.errors.map((error) =>
      csvLine({
        record: 'error',
        document_id: item.documentId,
        format_id: item.format?.id,
        error_code: error.code,
        error_reason: error.reason,
        payment: error.payment,
        column: error.column,
        row: error.row,
        position: exportErrorPosition(error),
      }),
    );
    return [document, ...payments, ...holds];
  }
  const transactions = parse.transactionOutcomes.map((outcome) =>
    csvLine({
      record: 'transaction',
      document_id: item.documentId,
      st02: outcome.st02,
      outcome: outcome.outcome,
      remittance_id: outcome.remittanceId,
      linked_remittance_id: outcome.linkedRemittanceId,
      linked_document_id: outcome.linkedDocumentId,
      linked_provenance: outcome.linkedProvenance,
      review_reason: outcome.reviewReason,
      claims: outcome.claims,
      lines: outcome.lines,
      error_code: outcome.reasons.join(' '),
      segment_index: outcome.segmentIndex,
      segment_id: 'ST',
    }),
  );
  const errors = parse.errors.map((error) =>
    csvLine({
      record: 'error',
      document_id: item.documentId,
      st02: error.transaction?.st02,
      error_code: error.code,
      error_reason: error.reason ?? error.scope ?? error.list,
      segment_index: error.segmentIndex,
      segment_id: error.segmentId,
      element_position: error.elementPosition,
      component_position: error.componentPosition,
      difference_cents: error.differenceCents,
      position: errorPosition(error),
    }),
  );
  return [document, ...transactions, ...errors];
}

/**
 * The receipt as CSV, the parser's error report (PRD 5, J4; PRD 10, step 10): the document, and for a
 * zip one block per entry in its order in the zip (the batch receipt, PAR-27). Each document's block
 * is its line, a line per transaction set (what it loaded or why it is held, and the remittance it
 * loaded or duplicates) and a line per error with its segment index, segment ID and element position; an
 * ERA export's block has a line per payment (its first row and row count, what it loaded or the remittance
 * it repeats, and what that was loaded from) and a line per hold with its column header and row number.
 * Codes, counts, opaque IDs, hashes, column headers and fixed reasons only. Undefined when no such document.
 */
export async function receiptReport(scope: PracticeScope<ScopeClient>, practiceId: string, documentId: string, requestId: string): Promise<string | undefined> {
  const receipts = await audited(
    scope,
    requestId,
    'error_report',
    `SELECT ${COLUMNS} FROM source_document d ${FIRST_OF_BYTES}
      WHERE d.practice_id = $1 AND (d.id = $2 OR d.parent_document_id = $2)
      ORDER BY (d.id = $2) DESC, d.created_at, d.id`,
    [practiceId, documentId],
  );
  if (receipts[0]?.documentId !== documentId) {
    return undefined;
  }
  return `${[CSV_HEADER.join(','), ...receipts.flatMap(reportLines)].join('\r\n')}\r\n`;
}
