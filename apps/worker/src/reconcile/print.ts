import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { type KeyProvider, loadPracticeCipher, roiStatementKey } from '@tp/db/runtime';
import { type StoredStatement, entriesById, recomputeStatement } from '@tp/ledger';
import { parseCents } from '@tp/money';

import type { JobContext, JobHandler } from '../jobs/handlers';
import type { PdfRenderer } from '../report/pdf';
import type { DocumentStore } from '../storage/documents';
import { type Scope, ledgerEntries } from './ledger';
import { statementHtml } from './statement-html';

/**
 * The ROI statement job (PRD 13, ROI statement; PRD 5, J12; PRD 15, Documents; docs/adr/0043): one
 * practice per job, three attempts with the operator's alert on the third. In one transaction it reads
 * the statement (locked), recomputes its entry-backed figures from the entries it links, prints the
 * statement with its entries to PDF through the audit report's Chromium pipeline, stores it sealed with
 * the practice's key (under a key of its own for this attempt) and records the key and the PDF's
 * SHA-256 on the statement, which the database lets the job do once. A statement already printed is
 * left as it is (JOB-01). A statement whose figures its entries no longer give is never printed: that
 * cannot happen while the ledger is append-only, so it is an error for the operator.
 */

export interface StatementPrintServices {
  readonly documents: DocumentStore;
  readonly keys: KeyProvider;
  readonly pdf: PdfRenderer;
}

export type PrintOutcome =
  | { readonly outcome: 'printed'; readonly pdfSha256: string }
  | { readonly outcome: 'already_printed' }
  | { readonly outcome: 'missing' };

export class StatementMismatchError extends Error {
  override readonly name = 'StatementMismatchError';
  constructor() {
    super('the statement’s figures are not what its linked entries give');
  }
}

interface StatementRow {
  readonly id: string;
  readonly period_from: string;
  readonly period_to: string;
  readonly proof_level: 'posted' | 'deposited';
  readonly fees_cents: string;
  readonly recovered_cents: string;
  readonly interest_cents: string;
  readonly approved_unposted_cents: string;
  readonly actionable_open_cents: string;
  readonly pursuit_hours: string;
  readonly links: { readonly recovered: string[]; readonly interest: string[]; readonly approved_unposted: string[]; readonly actionable_open: string[] };
  readonly document_key: string | null;
  readonly generated_by_email: string | null;
  readonly generated_by: string | null;
  readonly generated_at: Date;
  readonly practice_name: string;
}

/** A statement row as @tp/ledger reads it. */
export function storedStatement(row: Pick<StatementRow, Exclude<keyof StatementRow, 'id' | 'document_key' | 'generated_by_email' | 'generated_by' | 'generated_at' | 'practice_name'>>): StoredStatement {
  return {
    periodFrom: row.period_from,
    periodTo: row.period_to,
    proofLevel: row.proof_level,
    feesCents: parseCents(row.fees_cents),
    recoveredCents: parseCents(row.recovered_cents),
    interestCents: parseCents(row.interest_cents),
    approvedUnpostedCents: parseCents(row.approved_unposted_cents),
    actionableOpenCents: parseCents(row.actionable_open_cents),
    pursuitHours: row.pursuit_hours,
    links: { recovered: row.links.recovered, interest: row.links.interest, approvedUnposted: row.links.approved_unposted, actionableOpen: row.links.actionable_open },
  };
}

export const STATEMENT_COLUMNS = `s.id, s.period_from::text AS period_from, s.period_to::text AS period_to, s.proof_level, s.fees_cents::text AS fees_cents, s.recovered_cents::text AS recovered_cents,
  s.interest_cents::text AS interest_cents, s.approved_unposted_cents::text AS approved_unposted_cents, s.actionable_open_cents::text AS actionable_open_cents,
  s.pursuit_hours::text AS pursuit_hours, s.links, s.document_key, s.generated_by, s.generated_at`;

export async function printRoiStatement(context: JobContext, services: StatementPrintServices, practiceId: string, statementId: string): Promise<PrintOutcome> {
  return context.transaction(async (scope: Scope) => {
    const { rows } = await scope.client.query<StatementRow>(
      `SELECT ${STATEMENT_COLUMNS}, u.email AS generated_by_email, p.name AS practice_name
         FROM roi_statement s JOIN practice p ON p.id = s.practice_id LEFT JOIN "user" u ON u.id = s.generated_by
        WHERE s.id = $1 AND s.practice_id = $2 FOR UPDATE OF s`,
      [statementId, practiceId],
    );
    const row = rows[0];
    if (row === undefined) {
      return { outcome: 'missing' };
    }
    if (row.document_key !== null) {
      return { outcome: 'already_printed' };
    }
    const statement = storedStatement(row);
    const check = recomputeStatement(statement, entriesById(await ledgerEntries(scope, practiceId)));
    if (!check.matches) {
      throw new StatementMismatchError();
    }
    const html = statementHtml({
      statementId: row.id,
      practiceName: row.practice_name,
      statement,
      check,
      // A person's email where the job's scope may read it (the user directory's policies); else "a member of the practice".
      generatedBy: row.generated_by === null ? null : (row.generated_by_email ?? 'a member of the practice'),
      generatedAt: row.generated_at.toISOString().slice(0, 19).replace('T', ' '),
    });
    const pdf = await services.pdf.render(html);
    const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
    const key = roiStatementKey(practiceId, row.id, randomUUID());
    const written = await services.documents.write(cipher, key, Readable.from([pdf]));
    await scope.client.query('UPDATE roi_statement SET document_key = $3, pdf_sha256 = $4 WHERE id = $1 AND practice_id = $2', [row.id, practiceId, key, written.sha256]);
    return { outcome: 'printed', pdfSha256: written.sha256 };
  });
}

export function roiStatementHandler(services: StatementPrintServices): JobHandler<'roi_statement'> {
  return async (payload, context) => {
    const outcome = await printRoiStatement(context, services, payload.practice_id, payload.roi_statement_id);
    if (outcome.outcome === 'missing') {
      context.logger.warn('ROI statement not printed', { roi_statement_id: payload.roi_statement_id, error_code: 'ROI_STATEMENT_NOT_FOUND' });
    } else {
      context.logger.info('ROI statement printed', { roi_statement_id: payload.roi_statement_id });
    }
  };
}

/** Queues the print of each of the practice's statements not printed yet (the daily reconcile's catch-up); returns how many were queued. */
export async function queueUnprinted(context: JobContext, practiceId: string): Promise<number> {
  const unprinted = await context.transaction(
    async (scope) => (await scope.client.query<{ id: string }>('SELECT id FROM roi_statement WHERE practice_id = $1 AND document_key IS NULL ORDER BY generated_at, id', [practiceId])).rows,
  );
  let queued = 0;
  for (const statement of unprinted) {
    if ((await context.enqueue('roi_statement', { practice_id: practiceId, roi_statement_id: statement.id })) !== null) {
      queued += 1;
    }
  }
  return queued;
}
