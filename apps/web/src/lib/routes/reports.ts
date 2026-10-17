import { randomUUID } from 'node:crypto';

import { type PracticeScope, type ScopeClient, rolesPermit } from '@tp/db/runtime';
import { z } from 'zod';

import { practiceRoute } from '../http/invoke';
import { type Download, InputError, type MutationResult, NotFoundError } from '../http/route';
import type { Services } from '../server/services';
import { type ExportRecord, type ReportDocumentSummary, exportHistory, listReportDocuments } from '../reports/documents';
import { type Attestation, type DownloadRecord, type ReportDetail, type ReportSummary, downloads, listReports, reportFile, reportOf } from '../reports/queries';
import { RUN_NOT_IN_EFFECT, type RunChoice, isRunInEffect, runsInEffect } from '../triage/queries';
import { type ListPage, pageParam } from '../http/paging';
import { lastMonth } from '../monitoring/queries';
import { opaqueId } from './schemas';

/**
 * The Reports screen, the audit report and the independent reviewer's checklist (PRD 7, Reports:
 * "Audit report ... export history; generate, download ... every total links to its stage; line-level
 * export logged"; PRD 4, Audit v0: "a human-reviewed audit report"; PRD 2, Reimbursement reviewer:
 * "independently validates audit findings against contracts before an audit report is released ...
 * read-only with a signed attestation"; docs/adr/0038).
 *
 * Reading reports and the PDF is report.read; the line CSV is line-level PHI, so phi.export (never
 * a viewer's), and the reviewer reads it from the checklist (audit_finding.validate); every download is
 * recorded and audited. Generating and releasing a report are
 * case.work. The checklist and its attestation are the reimbursement reviewer's
 * (audit_finding.validate), reached under a support grant: the reviewer signs over the SHA-256 of the
 * files the checklist showed, once, and edits nothing else; a report is released only once signed.
 */

/** What the reviewer confirms, item by item, before signing (the attestation names each one). */
export const CHECKLIST = [
  { id: 'coverage', text: 'Coverage matches the run: the lines and billed dollars priced, and every unpriced reason with its count and remedy.' },
  { id: 'anomalies', text: 'Every anomaly is labelled investigatory, shown as a count and a range, and in no total.' },
  { id: 'validated', text: 'Each validated discrepancy was checked against the cited contract term and the rule release it was priced under.' },
  { id: 'actionable', text: 'Each case total is the sum of its actionable lines; a line past its window is struck through and excluded.' },
  { id: 'gaps', text: 'The pursuit cost and the evidence gaps are shown, and nothing is presented as payer approved or recovered (posted or deposited).' },
  { id: 'independent', text: 'I had no part in preparing these findings, and I reviewed them against the practice’s contracts myself.' },
] as const;

export type ChecklistItem = (typeof CHECKLIST)[number]['id'];

/**
 * The sentence an attestation stands for, shown beside it. The attestation itself holds no words a
 * person typed (the database refuses any): the checklist's item codes and the two files' SHA-256.
 */
export const ATTESTATION_TEXT = 'I attest that I reviewed this report, its PDF and its line CSV against the checklist above.';

const confirmed = z.literal('on', 'confirm this item');
const sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'a SHA-256');

export interface ReportsPageData {
  readonly practiceId: string;
  /**
   * A page of the audit reports, newest first, a page of the coverage reports and monthly summaries
   * generated (documents), and a page of the export history: every download of a report's file and
   * every line-level export (each pages on its own).
   */
  readonly reports: ListPage<ReportSummary>;
  readonly documents: ListPage<ReportDocumentSummary>;
  readonly history: ListPage<ExportRecord>;
  readonly runs: readonly RunChoice[];
  readonly canGenerate: boolean;
  readonly canExport: boolean;
  readonly canReview: boolean;
  /** The month the monthly summary offers first: the month before today's. */
  readonly lastMonth: string;
  /** The server's origin, for the links shared within the organization. */
  readonly origin: string;
  /** The person's roles on the practice (the permission state names them). */
  readonly roles: readonly string[];
}

export const reportsPage = practiceRoute({
  id: 'practice.reports',
  kind: 'page',
  path: '/p/[practiceId]/reports',
  phi: true,
  permission: 'report.read',
  params: z.object({ practiceId: opaqueId, page: pageParam, documents: pageParam, history: pageParam }),
  handle: async ({ scope, practiceId, params, request, access, services }): Promise<ReportsPageData> => {
    const canGenerate = rolesPermit(access.roles, 'case.work');
    return {
      practiceId,
      reports: await listReports(scope, practiceId, request.requestId, params.page),
      documents: await listReportDocuments(scope, practiceId, params.documents, request.requestId),
      history: await exportHistory(scope, practiceId, params.history, request.requestId),
      runs: canGenerate ? await runsInEffect(scope, practiceId) : [],
      canGenerate,
      canExport: rolesPermit(access.roles, 'phi.export'),
      canReview: rolesPermit(access.roles, 'audit_finding.validate'),
      lastMonth: lastMonth(services.now()),
      origin: services.origin,
      roles: access.roles,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

/**
 * Requests an audit report of the run in effect for its period (never a re-run nobody has accepted, nor a
 * run since replaced; the database refuses them too): recorded queued in the requester's name, and the
 * report job queued.
 */
export const generateReportAction = practiceRoute({
  id: 'practice.reports.generate',
  kind: 'action',
  path: '/p/[practiceId]/reports/generate',
  phi: true,
  permission: 'case.work',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ runId: opaqueId }),
  audit: { action: 'audit_report_requested', objectType: 'audit_report' },
  handle: async ({ scope, practiceId, input, services }): Promise<MutationResult> => {
    if (!(await isRunInEffect(scope, practiceId, input.runId))) {
      throw new InputError([{ field: 'runId', message: RUN_NOT_IN_EFFECT }]);
    }
    const id = randomUUID();
    await scope.client.query('INSERT INTO audit_report (id, practice_id, pricing_run_id, requested_by) VALUES ($1, $2, $3, app_actor_id())', [id, practiceId, input.runId]);
    // Queued in the request: a failure to queue undoes the request, so no report waits on a job never sent.
    await services.queue.enqueue('audit_report', { practice_id: practiceId, audit_report_id: id });
    return { objectId: id, redirect: `/p/${practiceId}/reports/${id}` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ runId: refs.pricingRunId }) },
});

export interface ReportPageData {
  readonly practiceId: string;
  readonly report: ReportDetail;
  readonly history: ListPage<DownloadRecord>;
  readonly canExport: boolean;
  readonly canRelease: boolean;
  readonly canReview: boolean;
  /** The server's origin, for the link shared within the organization. */
  readonly origin: string;
}

async function report(scope: PracticeScope<ScopeClient>, practiceId: string, reportId: string, requestId: string): Promise<ReportDetail> {
  const found = await reportOf(scope, practiceId, reportId, requestId);
  if (found === undefined) {
    throw new NotFoundError();
  }
  return found;
}

export const reportPage = practiceRoute({
  id: 'practice.reports.report',
  kind: 'page',
  path: '/p/[practiceId]/reports/[reportId]',
  phi: true,
  permission: 'report.read',
  params: z.object({ practiceId: opaqueId, reportId: opaqueId, history: pageParam }),
  handle: async ({ scope, practiceId, params, request, access, services }): Promise<ReportPageData> => ({
    practiceId,
    report: await report(scope, practiceId, params.reportId, request.requestId),
    history: await downloads(scope, practiceId, params.reportId, request.requestId, params.history),
    canExport: rolesPermit(access.roles, 'phi.export'),
    canRelease: rolesPermit(access.roles, 'case.work'),
    canReview: rolesPermit(access.roles, 'audit_finding.validate'),
    origin: services.origin,
  }),
  sample: { params: (refs) => ({ practiceId: refs.practiceId, reportId: refs.auditReportId }) },
});

export interface ReviewPageData {
  readonly practiceId: string;
  readonly report: ReportDetail;
  readonly checklist: typeof CHECKLIST;
}

/** The independent reviewer's checklist for one report: its numbers, its files' SHA-256, and the items to confirm. */
export const reviewChecklistPage = practiceRoute({
  id: 'practice.reports.review',
  kind: 'page',
  path: '/p/[practiceId]/reports/[reportId]/review',
  phi: true,
  permission: 'audit_finding.validate',
  params: z.object({ practiceId: opaqueId, reportId: opaqueId }),
  handle: async ({ scope, practiceId, params, request }): Promise<ReviewPageData> => ({ practiceId, report: await report(scope, practiceId, params.reportId, request.requestId), checklist: CHECKLIST }),
  sample: { params: (refs) => ({ practiceId: refs.practiceId, reportId: refs.auditReportId }) },
});

async function lockedReport(scope: PracticeScope<ScopeClient>, practiceId: string, reportId: string) {
  const { rows } = await scope.client.query<{ status: string; pdf_sha256: string | null; csv_sha256: string | null; attested_by: string | null; released_by: string | null }>(
    'SELECT status, pdf_sha256, csv_sha256, attested_by, released_by FROM audit_report WHERE id = $1 AND practice_id = $2 FOR UPDATE',
    [reportId, practiceId],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new NotFoundError();
  }
  return row;
}

/**
 * The reviewer signs the attestation (once; a report already signed is left as it is): every item
 * confirmed and the SHA-256 of the PDF and the CSV the checklist showed, which must be the report's
 * own. No free text: an attestation holds no words a person typed (docs/adr/0040).
 */
export const attestReportAction = practiceRoute({
  id: 'practice.reports.attest',
  kind: 'action',
  path: '/p/[practiceId]/reports/attest',
  phi: true,
  permission: 'audit_finding.validate',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({
    reportId: opaqueId,
    pdfSha256: sha256,
    csvSha256: sha256,
    confirm_coverage: confirmed,
    confirm_anomalies: confirmed,
    confirm_validated: confirmed,
    confirm_actionable: confirmed,
    confirm_gaps: confirmed,
    confirm_independent: confirmed,
  }),
  audit: { action: 'audit_report_attested', objectType: 'audit_report' },
  handle: async ({ scope, practiceId, input }): Promise<MutationResult> => {
    const found = await lockedReport(scope, practiceId, input.reportId);
    if (found.attested_by === null) {
      if (found.status !== 'ready') {
        throw new InputError([{ field: 'reportId', message: 'only a generated report is attested' }]);
      }
      if (found.pdf_sha256 !== input.pdfSha256 || found.csv_sha256 !== input.csvSha256) {
        throw new InputError([{ field: 'pdfSha256', message: 'the files the checklist showed are not this report’s; reload the checklist' }]);
      }
      const attestation: Attestation = {
        format: 'tp-attestation/1',
        checklist: CHECKLIST.map((item) => item.id),
        pdf_sha256: input.pdfSha256,
        csv_sha256: input.csvSha256,
      };
      await scope.client.query('UPDATE audit_report SET attested_by = app_actor_id(), attestation = $3 WHERE id = $1 AND practice_id = $2', [input.reportId, practiceId, JSON.stringify(attestation)]);
    }
    return { objectId: input.reportId, redirect: `/p/${practiceId}/reports/${input.reportId}` };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    input: (refs) => ({
      reportId: refs.auditReportId,
      pdfSha256: refs.auditReportPdfSha256,
      csvSha256: refs.auditReportCsvSha256,
      ...Object.fromEntries(CHECKLIST.map((item) => [`confirm_${item.id}`, 'on'])),
    }),
  },
});

/** Releases a signed report (once; a report already released is left as it is). Unsigned, it is refused. */
export const releaseReportAction = practiceRoute({
  id: 'practice.reports.release',
  kind: 'action',
  path: '/p/[practiceId]/reports/release',
  phi: true,
  permission: 'case.work',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ reportId: opaqueId }),
  audit: { action: 'audit_report_released', objectType: 'audit_report' },
  handle: async ({ scope, practiceId, input }): Promise<MutationResult> => {
    const found = await lockedReport(scope, practiceId, input.reportId);
    if (found.released_by === null) {
      if (found.attested_by === null) {
        throw new InputError([{ field: 'reportId', message: 'a report is released only after a reimbursement reviewer signs its attestation' }]);
      }
      await scope.client.query('UPDATE audit_report SET released_by = app_actor_id() WHERE id = $1 AND practice_id = $2', [input.reportId, practiceId]);
    }
    return { objectId: input.reportId, redirect: `/p/${practiceId}/reports/${input.reportId}` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ reportId: refs.attestedReportId }) },
});

async function file(scope: PracticeScope<ScopeClient>, services: Services, practiceId: string, reportId: string, kind: 'pdf' | 'csv', requestId: string): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = await reportFile(scope, services, practiceId, reportId, kind, requestId);
  if (bytes === undefined) {
    throw new NotFoundError();
  }
  return bytes;
}

/** The report's PDF (its numbers by stage, no line-level PHI), checked against its SHA-256; the download is recorded. */
export const reportPdf = practiceRoute({
  id: 'practice.reports.pdf',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/reports/[reportId]/pdf',
  rateLimit: 'export',
  phi: true,
  permission: 'report.read',
  params: z.object({ practiceId: opaqueId, reportId: opaqueId }),
  handle: async ({ scope, practiceId, params, request, services }): Promise<Download<Uint8Array<ArrayBuffer>>> => ({
    // The file's name is the report's opaque ID, never the practice's or a payer's name.
    download: { filename: `audit-report-${params.reportId}.pdf`, contentType: 'application/pdf', body: await file(scope, services, practiceId, params.reportId, 'pdf', request.requestId) },
  }),
  sample: { params: (refs) => ({ practiceId: refs.practiceId, reportId: refs.auditReportId }) },
});

/** The report's line CSV (line-level PHI: claim control numbers), for the roles that export PHI; the download is recorded. */
export const reportCsv = practiceRoute({
  id: 'practice.reports.csv',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/reports/[reportId]/csv',
  rateLimit: 'export',
  phi: true,
  permission: 'phi.export',
  params: z.object({ practiceId: opaqueId, reportId: opaqueId }),
  handle: async ({ scope, practiceId, params, request, services }): Promise<Download<Uint8Array<ArrayBuffer>>> => ({
    download: { filename: `audit-report-lines-${params.reportId}.csv`, contentType: 'text/csv; charset=utf-8', body: await file(scope, services, practiceId, params.reportId, 'csv', request.requestId) },
  }),
  sample: { params: (refs) => ({ practiceId: refs.practiceId, reportId: refs.auditReportId }) },
});

/**
 * The line CSV for the reimbursement reviewer the checklist names it to (audit_finding.validate, under a
 * support grant; PRD 2: the reviewer "independently validates audit findings"): the reviewer signs over
 * the CSV's SHA-256, so the checklist links to the file itself, read-only. The download is recorded and
 * audited like every other (a line-level export).
 */
export const reviewCsv = practiceRoute({
  id: 'practice.reports.review_csv',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/reports/[reportId]/review/csv',
  rateLimit: 'export',
  phi: true,
  permission: 'audit_finding.validate',
  params: z.object({ practiceId: opaqueId, reportId: opaqueId }),
  handle: async ({ scope, practiceId, params, request, services }): Promise<Download<Uint8Array<ArrayBuffer>>> => ({
    download: { filename: `audit-report-lines-${params.reportId}.csv`, contentType: 'text/csv; charset=utf-8', body: await file(scope, services, practiceId, params.reportId, 'csv', request.requestId) },
  }),
  sample: { params: (refs) => ({ practiceId: refs.practiceId, reportId: refs.auditReportId }) },
});

export const REPORT_ROUTES = [reportsPage, generateReportAction, reportPage, reviewChecklistPage, attestReportAction, releaseReportAction, reportPdf, reportCsv, reviewCsv] as const;
