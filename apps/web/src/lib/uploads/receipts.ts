import { type DocumentKind, type DocumentStatus, type PracticeScope, type ScanStatus, type ScopeClient, readWithAudit } from '@tp/db/runtime';

import { type EntryCounts, type Receipt, receiptState } from './receipt-labels';

/**
 * Receipts from source_document, read under the practice's policies and through readWithAudit (every
 * returned document is an audited read), paginated server-side (PRD 6, Cross-cutting: every list
 * paginated). A zip's receipt carries its entries' counts by status (aggregates, not rows); a
 * duplicate's names the practice's first document with the same bytes (PAR-06: "duplicate of file X").
 */

export const RECEIPTS_PER_PAGE = 25;

interface Row {
  readonly id: string;
  readonly practice_id: string;
  readonly parent_document_id: string | null;
  readonly kind: DocumentKind;
  readonly size_bytes: string;
  readonly created_at: Date;
  readonly status: DocumentStatus;
  readonly scan_status: ScanStatus;
  readonly sha256: string | null;
  readonly duplicate_of: string | null;
  readonly duplicate_of_at: Date | null;
}

const COLUMNS = `d.id, d.practice_id, d.parent_document_id, d.kind, d.size_bytes::text AS size_bytes, d.created_at, d.status, d.scan_status, d.sha256,
  first.id AS duplicate_of, first.created_at AS duplicate_of_at`;

const FIRST_OF_BYTES = `LEFT JOIN LATERAL (
    SELECT f.id, f.created_at FROM source_document f
     WHERE d.status = 'duplicate' AND f.practice_id = d.practice_id AND f.sha256 = d.sha256 AND f.status <> 'duplicate'
     ORDER BY f.created_at, f.id LIMIT 1
  ) first ON true`;

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

function receipt(row: Row, counts: Map<string, EntryCounts>): Receipt {
  return {
    documentId: row.id,
    parentDocumentId: row.parent_document_id,
    kind: row.kind,
    sizeBytes: row.size_bytes,
    receivedAt: row.created_at.toISOString(),
    status: row.status,
    scanStatus: row.scan_status,
    sha256: row.sha256,
    duplicateOf: row.duplicate_of === null || row.duplicate_of_at === null ? null : { documentId: row.duplicate_of, receivedAt: row.duplicate_of_at.toISOString() },
    entries: counts.get(row.id) ?? null,
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

const CSV_HEADER = ['document_id', 'parent_document_id', 'kind', 'stage', 'status', 'reason', 'size_bytes', 'sha256', 'received_at', 'duplicate_of'];

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * The receipt as CSV: the document, and for a zip one line per entry in its order in the zip (the batch
 * receipt, PAR-27). Codes, opaque IDs, hashes and fixed reasons only. Undefined when no such document.
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
  const lines = receipts.map((item) => {
    const state = receiptState(item);
    return [item.documentId, item.parentDocumentId ?? '', item.kind, state.stage, item.status, state.detail, item.sizeBytes, item.sha256 ?? '', item.receivedAt, item.duplicateOf?.documentId ?? '']
      .map(csvField)
      .join(',');
  });
  return `${[CSV_HEADER.join(','), ...lines].join('\r\n')}\r\n`;
}
