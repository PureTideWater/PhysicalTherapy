import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { type KeyProvider, auditReportKey, loadPracticeCipher } from '@tp/db/runtime';

import type { JobHandler } from '../jobs/handlers';
import { practiceLedgerSettings } from '../reconcile/ledger';
import type { DocumentStore, WrittenDocument } from '../storage/documents';
import { type TriageJobContext, todayUtc, triageInScope } from '../triage/execute';
import { gatherReport } from './content';
import { auditHtml, auditReconciliation } from './html';
import type { PdfRenderer } from './pdf';

/**
 * The audit report job (PRD 4, Audit v0; PRD 5, J12; PRD 6, Reports and exports; docs/adr/0038), in
 * the report's one practice: in one transaction it triages the report's pricing run on today's date
 * (UTC), reads the report's numbers, writes the line CSV, prints the numbers to PDF with Chromium, stores both
 * sealed with the practice's key (written once, under keys of their own for this attempt) and records
 * the report ready with its numbers, the files' keys and their SHA-256. A failed attempt leaves the
 * report queued and the next starts over; the third failure marks it failed. A report already
 * generated is left as it is (JOB-01). The run must still be the run in effect for its period (a
 * re-run accepted since the request replaces it, docs/adr/0037): otherwise the report is marked failed,
 * run_not_in_effect, at once, since no attempt can change that, and a new report is requested of the
 * run in effect. The database refuses a request, and a ready report, of any other run. Its rule release
 * must not have been withdrawn since the request (audit item #4: a withdrawal records that the release's
 * content was wrong): otherwise the report is marked failed, release_withdrawn, at once and without a retry,
 * and a new report is requested once the period is priced again under the release in force and that re-run
 * accepted. The database refuses a request, a ready report, an attestation and a release on a withdrawn
 * release too.
 */

export interface ReportServices {
  readonly documents: DocumentStore;
  readonly keys: KeyProvider;
  readonly pdf: PdfRenderer;
}

export type ReportOutcome =
  | { readonly outcome: 'ready'; readonly pdfSha256: string; readonly csvSha256: string }
  | { readonly outcome: 'already_finished'; readonly status: string }
  | { readonly outcome: 'not_complete' }
  /** The run is no longer the run in effect for its period: the report is failed, run_not_in_effect. */
  | { readonly outcome: 'not_in_effect' }
  /** The run's rule release was withdrawn since the request: the report is failed, release_withdrawn. */
  | { readonly outcome: 'release_withdrawn' }
  | { readonly outcome: 'missing' };

export interface ReportOptions {
  /** The triage date; today in UTC unless a test names an earlier one. */
  readonly asOf?: string;
}

export async function generateAuditReport(context: TriageJobContext, services: ReportServices, practiceId: string, auditReportId: string, options: ReportOptions = {}): Promise<ReportOutcome> {
  const asOf = options.asOf ?? todayUtc();
  return context.transaction(async (scope) => {
    const { rows } = await scope.client.query<{ status: string; pricing_run_id: string }>('SELECT status, pricing_run_id FROM audit_report WHERE id = $1 AND practice_id = $2 FOR UPDATE', [
      auditReportId,
      practiceId,
    ]);
    const report = rows[0];
    if (report === undefined) {
      return { outcome: 'missing' };
    }
    if (report.status !== 'queued') {
      return { outcome: 'already_finished', status: report.status };
    }
    const { rows: withdrawn } = await scope.client.query<{ withdrawn: boolean }>('SELECT pricing_run_release_withdrawn($1) AS withdrawn', [report.pricing_run_id]);
    if (withdrawn[0]?.withdrawn === true) {
      await scope.client.query("UPDATE audit_report SET status = 'failed', failure_code = 'release_withdrawn' WHERE id = $1 AND practice_id = $2 AND status = 'queued'", [auditReportId, practiceId]);
      return { outcome: 'release_withdrawn' };
    }
    const triaged = await triageInScope(scope, practiceId, report.pricing_run_id, context.jobId, asOf);
    if (triaged.outcome === 'not_in_effect') {
      await scope.client.query("UPDATE audit_report SET status = 'failed', failure_code = 'run_not_in_effect' WHERE id = $1 AND practice_id = $2 AND status = 'queued'", [auditReportId, practiceId]);
      return { outcome: 'not_in_effect' };
    }
    if (triaged.outcome !== 'triaged') {
      return { outcome: triaged.outcome === 'missing' ? 'missing' : 'not_complete' };
    }
    const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
    const { content, arena } = await gatherReport(scope, { practiceId, auditReportId, pricingRunId: report.pricing_run_id, asOf, requestId: context.jobId, cipher });
    const pdfKey = auditReportKey(practiceId, auditReportId, randomUUID(), 'pdf');
    const csvKey = auditReportKey(practiceId, auditReportId, randomUUID(), 'csv');
    // The line CSV is streamed from its arena and the arena released before Chromium prints (SUITE-CAP-1a D14, D17;
    // docs/adr/0083), so the report never holds its lines while the PDF prints.
    let writtenCsv: WrittenDocument;
    try {
      writtenCsv = await services.documents.write(cipher, csvKey, arena.rows());
    } finally {
      arena.release();
    }
    // The Verified gate (docs/adr/0057), under the practice's proof level: the seal prints only from the ledger's answer.
    const reconciliation = auditReconciliation(content, (await practiceLedgerSettings(scope, practiceId)).proofLevel);
    const pdf = await services.pdf.render(auditHtml(content, reconciliation));
    const writtenPdf = await services.documents.write(cipher, pdfKey, Readable.from([pdf]));
    await scope.client.query(
      `UPDATE audit_report SET status = 'ready', as_of = $3, content = $4, pdf_key = $5, pdf_sha256 = $6, csv_key = $7, csv_sha256 = $8
        WHERE id = $1 AND practice_id = $2`,
      [auditReportId, practiceId, asOf, JSON.stringify(content), pdfKey, writtenPdf.sha256, csvKey, writtenCsv.sha256],
    );
    return { outcome: 'ready', pdfSha256: writtenPdf.sha256, csvSha256: writtenCsv.sha256 };
  });
}

/** Marks a queued report failed with a fixed code; a report already generated is left as it is. */
async function failReport(context: TriageJobContext, practiceId: string, auditReportId: string): Promise<void> {
  await context.transaction((scope) =>
    scope.client.query("UPDATE audit_report SET status = 'failed', failure_code = 'generation_failed' WHERE id = $1 AND practice_id = $2 AND status = 'queued'", [auditReportId, practiceId]),
  );
}

/** The error code a report not generated is logged with, by outcome. */
const REPORT_REFUSALS = {
  missing: 'AUDIT_REPORT_NOT_FOUND',
  not_complete: 'AUDIT_REPORT_RUN_NOT_COMPLETE',
  not_in_effect: 'AUDIT_REPORT_RUN_NOT_IN_EFFECT',
  release_withdrawn: 'AUDIT_REPORT_RELEASE_WITHDRAWN',
} as const;

export function auditReportHandler(services: ReportServices, options: ReportOptions = {}): JobHandler<'audit_report'> {
  return async (payload, context) => {
    try {
      const outcome = await generateAuditReport(context, services, payload.practice_id, payload.audit_report_id, options);
      if (outcome.outcome === 'missing' || outcome.outcome === 'not_complete' || outcome.outcome === 'not_in_effect' || outcome.outcome === 'release_withdrawn') {
        context.logger.warn('audit report not generated', { audit_report_id: payload.audit_report_id, error_code: REPORT_REFUSALS[outcome.outcome] });
      }
    } catch (error) {
      if (context.lastAttempt) {
        try {
          await failReport(context, payload.practice_id, payload.audit_report_id);
        } catch {
          context.logger.warn('audit report not marked failed', { audit_report_id: payload.audit_report_id, error_code: 'AUDIT_REPORT_NOT_MARKED' });
        }
      }
      throw error;
    }
  };
}
