import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { type KeyProvider, loadPracticeCipher, reportDocumentKey } from '@tp/db/runtime';

import type { JobContext, JobHandler } from '../jobs/handlers';
import type { DocumentStore } from '../storage/documents';
import { type ReportDocumentKind, parseReportDocument, reportDocumentHtml } from './documents';
import type { PdfRenderer } from './pdf';

/**
 * The report document job (PRD 5, J12; PRD 6, Reports and exports; PRD 15, Documents: "Playwright and
 * Chromium for PDF export of reports and packets, in the worker only"; docs/adr/0045): one practice
 * per job, three attempts with the operator's alert on the third. In one transaction it reads the
 * document (locked), prints its stored figures to PDF through the audit report's Chromium pipeline,
 * stores the PDF sealed with the practice's key (under a key of its own for this attempt) and records
 * the key and the PDF's SHA-256, which the database lets the job do once. A document already printed
 * or failed is left as it is (JOB-01). Figures that no longer read as their format are never printed:
 * the third attempt marks the document failed with a fixed code, and a new one is generated.
 */

export interface DocumentPrintServices {
  readonly documents: DocumentStore;
  readonly keys: KeyProvider;
  readonly pdf: PdfRenderer;
}

export type DocumentPrintOutcome = { readonly outcome: 'printed'; readonly pdfSha256: string } | { readonly outcome: 'already_finished'; readonly status: string } | { readonly outcome: 'missing' };

interface DocumentRow {
  readonly id: string;
  readonly kind: ReportDocumentKind;
  readonly status: string;
  readonly content: unknown;
  readonly generated_at: Date;
  readonly requested_by_email: string | null;
  readonly practice_name: string;
}

export async function printReportDocument(context: JobContext, services: DocumentPrintServices, practiceId: string, reportDocumentId: string): Promise<DocumentPrintOutcome> {
  return context.transaction(async (scope) => {
    const { rows } = await scope.client.query<DocumentRow>(
      `SELECT d.id, d.kind, d.status, d.content, d.generated_at, u.email AS requested_by_email, p.name AS practice_name
         FROM report_document d JOIN practice p ON p.id = d.practice_id LEFT JOIN "user" u ON u.id = d.requested_by
        WHERE d.id = $1 AND d.practice_id = $2 FOR UPDATE OF d`,
      [reportDocumentId, practiceId],
    );
    const row = rows[0];
    if (row === undefined) {
      return { outcome: 'missing' };
    }
    if (row.status !== 'queued') {
      return { outcome: 'already_finished', status: row.status };
    }
    const content = parseReportDocument(row.kind, row.content);
    const html = reportDocumentHtml(content, {
      documentId: row.id,
      practiceName: row.practice_name,
      generatedBy: row.requested_by_email,
      generatedAt: row.generated_at.toISOString().slice(0, 19).replace('T', ' '),
    });
    const pdf = await services.pdf.render(html);
    const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
    const key = reportDocumentKey(practiceId, row.id, randomUUID());
    const written = await services.documents.write(cipher, key, Readable.from([pdf]));
    await scope.client.query("UPDATE report_document SET status = 'ready', pdf_key = $3, pdf_sha256 = $4 WHERE id = $1 AND practice_id = $2", [row.id, practiceId, key, written.sha256]);
    return { outcome: 'printed', pdfSha256: written.sha256 };
  });
}

/** Marks a queued document failed with a fixed code; a document already printed is left as it is. */
async function failDocument(context: JobContext, practiceId: string, reportDocumentId: string): Promise<void> {
  await context.transaction((scope) =>
    scope.client.query("UPDATE report_document SET status = 'failed', failure_code = 'print_failed' WHERE id = $1 AND practice_id = $2 AND status = 'queued'", [reportDocumentId, practiceId]),
  );
}

export function reportDocumentHandler(services: DocumentPrintServices): JobHandler<'report_document'> {
  return async (payload, context) => {
    try {
      const outcome = await printReportDocument(context, services, payload.practice_id, payload.report_document_id);
      if (outcome.outcome === 'missing') {
        context.logger.warn('report document not printed', { report_document_id: payload.report_document_id, error_code: 'REPORT_DOCUMENT_NOT_FOUND' });
      } else if (outcome.outcome === 'printed') {
        context.logger.info('report document printed', { report_document_id: payload.report_document_id });
      }
    } catch (error) {
      if (context.lastAttempt) {
        try {
          await failDocument(context, payload.practice_id, payload.report_document_id);
        } catch {
          context.logger.warn('report document not marked failed', { report_document_id: payload.report_document_id, error_code: 'REPORT_DOCUMENT_NOT_MARKED' });
        }
      }
      throw error;
    }
  };
}
