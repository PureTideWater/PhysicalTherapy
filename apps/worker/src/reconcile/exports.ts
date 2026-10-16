import { type KeyProvider, type PracticeCipher, documentObjectKey } from '@tp/db/runtime';
import { type EftExportRow, type PostingExportRow, type PostingTemplate, readEftExport, readPostingExport } from '@tp/ledger';

import type { JobContext } from '../jobs/handlers';
import type { DocumentStore } from '../storage/documents';
import { type Scope, practiceLedgerSettings } from './ledger';

/**
 * Posting and EFT exports into rows (PRD 13, Matching steps 2 and 3; PRD 20, Posting-export
 * templates; test matrix LED-04, LED-05, LED-08). Intake stores a clean posting or EFT export and
 * queues the reconcile step for it; every reconcile also reads any export of the practice still waiting.
 * A posting export is read with the practice's template (mapped once, at onboarding) and waits, stored,
 * until one is mapped; a bank export with the bank layout. The export is read whole (small files: at
 * most MAX_EXPORT_BYTES), each row stored once by its fingerprint (the keyed hash of its values and its
 * occurrence in its export, so a row repeated in a later export, or the same export again, is never a
 * second row), the claim reference encrypted with the practice's key. A row with an unreadable field is
 * left out and counted; a file the template cannot read at all is unreadable. The document is then
 * loaded, and a replay reads nothing again.
 */

/** The largest export read (an export of a year of postings is far smaller). */
export const MAX_EXPORT_BYTES = 20 * 1024 * 1024;

export interface ExportServices {
  readonly documents: DocumentStore;
  readonly keys: KeyProvider;
}

export interface ExportLoad {
  readonly documentId: string;
  readonly kind: 'posting_export' | 'eft_export';
  readonly outcome: 'loaded' | 'unreadable' | 'waiting_for_template';
  /** Rows stored now; rows the practice already held (repeated); rows left out for an unreadable field. */
  readonly stored: number;
  readonly repeated: number;
  readonly problems: number;
}

interface WaitingRow {
  readonly id: string;
  readonly kind: 'posting_export' | 'eft_export';
}

/** The practice's clean exports waiting to be read (stored by intake, not yet loaded). */
export async function waitingExports(scope: Scope, practiceId: string, documentId?: string): Promise<WaitingRow[]> {
  const { rows } = await scope.client.query<WaitingRow>(
    `SELECT d.id, d.kind FROM source_document d
      WHERE d.practice_id = $1 AND d.kind IN ('posting_export', 'eft_export') AND d.status = 'stored' AND d.scan_status = 'clean' AND ($2::uuid IS NULL OR d.id = $2)
      ORDER BY d.created_at, d.id`,
    [practiceId, documentId ?? null],
  );
  return rows;
}

async function readText(services: ExportServices, cipher: PracticeCipher, practiceId: string, documentId: string): Promise<string | null> {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const part of services.documents.read(cipher, documentObjectKey(practiceId, documentId))) {
    size += part.length;
    if (size > MAX_EXPORT_BYTES) {
      return null;
    }
    parts.push(part);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(parts));
}

async function insertPostingRows(scope: Scope, cipher: PracticeCipher, practiceId: string, documentId: string, template: PostingTemplate, rows: readonly PostingExportRow[]): Promise<number> {
  let stored = 0;
  for (const row of rows) {
    const { rowCount } = await scope.client.query(
      `INSERT INTO posting_row (practice_id, source_document_id, row_no, check_or_trace, posted_on, amount_cents, claim_reference, procedure_code, service_date, payer_name, batch, raw, template, fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (practice_id, fingerprint) DO NOTHING`,
      [
        practiceId,
        documentId,
        row.rowNo,
        row.checkOrTrace,
        row.postedOn,
        row.amountCents.toString(),
        row.claimReference === null ? null : cipher.encrypt('posting_row.claim_reference', row.claimReference),
        row.procedureCode,
        row.serviceDate,
        row.payerName,
        row.batch,
        JSON.stringify(row.raw),
        template.id,
        cipher.lookupHash('posting_row.fingerprint', row.fingerprint),
      ],
    );
    stored += rowCount ?? 0;
  }
  return stored;
}

async function insertEftRows(scope: Scope, cipher: PracticeCipher, practiceId: string, documentId: string, rows: readonly EftExportRow[]): Promise<number> {
  let stored = 0;
  for (const row of rows) {
    const { rowCount } = await scope.client.query(
      `INSERT INTO eft_row (practice_id, source_document_id, row_no, trace, deposited_on, amount_cents, batch_reference, fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (practice_id, fingerprint) DO NOTHING`,
      [practiceId, documentId, row.rowNo, row.trace, row.depositedOn, row.amountCents.toString(), row.batchReference, cipher.lookupHash('eft_row.fingerprint', row.fingerprint)],
    );
    stored += rowCount ?? 0;
  }
  return stored;
}

async function setStatus(scope: Scope, documentId: string, status: 'loaded' | 'unreadable'): Promise<void> {
  await scope.client.query("UPDATE source_document SET status = $2 WHERE id = $1 AND status = 'stored'", [documentId, status]);
}

/** Reads one waiting export into rows, in its own transaction; the document is loaded (or unreadable) with them. */
async function loadExport(context: JobContext, services: ExportServices, cipher: PracticeCipher, practiceId: string, document: WaitingRow): Promise<ExportLoad> {
  const template = document.kind === 'posting_export' ? (await context.transaction((scope) => practiceLedgerSettings(scope, practiceId))).postingTemplate : null;
  if (document.kind === 'posting_export' && template === null) {
    context.logger.warn('posting export waits for the practice’s posting template', { document_id: document.id, error_code: 'POSTING_TEMPLATE_NOT_MAPPED' });
    return { documentId: document.id, kind: document.kind, outcome: 'waiting_for_template', stored: 0, repeated: 0, problems: 0 };
  }
  const text = await readText(services, cipher, practiceId, document.id);
  const read = text === null ? null : template === null ? readEftExport(text) : readPostingExport(text, template);
  return context.transaction(async (scope) => {
    if (read === null || read.kind === 'refused') {
      await setStatus(scope, document.id, 'unreadable');
      context.logger.warn('export could not be read', { document_id: document.id, error_code: read === null ? 'EXPORT_TOO_LARGE' : `EXPORT_${read.reason.toUpperCase()}` });
      return { documentId: document.id, kind: document.kind, outcome: 'unreadable', stored: 0, repeated: 0, problems: 0 };
    }
    const stored =
      template === null ? await insertEftRows(scope, cipher, practiceId, document.id, read.rows as readonly EftExportRow[]) : await insertPostingRows(scope, cipher, practiceId, document.id, template, read.rows as readonly PostingExportRow[]);
    await setStatus(scope, document.id, 'loaded');
    return { documentId: document.id, kind: document.kind, outcome: 'loaded', stored, repeated: read.rows.length - stored, problems: read.problems.length };
  });
}

/** Reads every waiting export of the practice (or the one named) into rows. */
export async function loadExports(context: JobContext, services: ExportServices, cipher: PracticeCipher, practiceId: string, documentId?: string): Promise<ExportLoad[]> {
  const waiting = await context.transaction((scope) => waitingExports(scope, practiceId, documentId));
  const loads: ExportLoad[] = [];
  for (const document of waiting) {
    loads.push(await loadExport(context, services, cipher, practiceId, document));
  }
  return loads;
}
