import { randomUUID } from 'node:crypto';

import { type PracticeScope, type ScopeClient, rolesPermit } from '@tp/db/runtime';
import { z } from 'zod';

import { practiceRoute } from '../http/invoke';
import { type Download, InputError, type MutationResult, NotFoundError } from '../http/route';
import type { Services } from '../server/services';
import { type Attestation, type DownloadRecord, type ReportDetail, type ReportSummary, downloads, listReports, reportFile, reportOf } from '../reports/queries';
import { type RunChoice, completeRuns, isCompleteRun } from '../triage/queries';
import { opaqueId, optionalText } from './schemas';

/**
 * The Reports screen, the audit report and the independent reviewer's checklist (PRD 7, Reports:
 * "Audit report ... export history; generate, download ... every total links to its stage; line-level
 * export logged"; PRD 4, Audit v0: "a human-reviewed audit report"; PRD 2, Reimbursement reviewer:
 * "independently validates audit findings against contracts before an audit report is released ...
 * read-only with a signed attestation"; docs/adr/0038).
 *
 * Reading reports and the PDF is report.read; the line CSV is line-level PHI, so phi.export (never
 * a viewer's) and every download is recorded and audited. Generating and releasing a report are
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
  { id: 'gaps', text: 'The pursuit cost and the evidence gaps are shown, and nothing is presented as payer approved or recovered.' },
  { id: 'independent', text: 'I had no part in preparing these findings, and I reviewed them against the practice’s contracts myself.' },
] as const;

export type ChecklistItem = (typeof CHECKLIST)[number]['id'];

const confirmed = z.literal('on', 'confirm this item');
const sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'a SHA-256');

export interface ReportsPageData {
  readonly practiceId: string;
  readonly reports: readonly ReportSummary[];
  readonly history: readonly DownloadRecord[];
  readonly runs: readonly RunChoice[];
  readonly canGenerate: boolean;
  readonly canExport: boolean;
  readonly canReview: boolean;
}

export const reportsPage = practiceRoute({
  id: 'practice.reports',
  kind: 'page',
  path: '/p/[practiceId]/reports',
  phi: true,
  permission: 'report.read',
  params: z.object({ practiceId: opaqueId }),
  handle: async ({ scope, practiceId, request, access }): Promise<ReportsPageData> => {
    const canGenerate = rolesPermit(access.roles, 'case.work');
    return {
      practiceId,
      reports: await listReports(scope, practiceId, request.requestId),
      history: await downloads(scope, practiceId, null, request.requestId),
      runs: canGenerate ? await completeRuns(scope, practiceId) : [],
      canGenerate,
      canExport: rolesPermit(access.roles, 'phi.export'),
      canReview: rolesPermit(access.roles, 'audit_finding.validate'),
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

/** Requests an audit report of a complete run: recorded queued in the requester's name, and the report job queued. */
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
    if (!(await isCompleteRun(scope, practiceId, input.runId))) {
      throw new InputError([{ field: 'runId', message: 'a complete pricing run of this practice' }]);
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
  readonly history: readonly DownloadRecord[];
  readonly canExport: boolean;
  readonly canRelease: boolean;
  readonly canReview: boolean;
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
  params: z.object({ practiceId: opaqueId, reportId: opaqueId }),
  handle: async ({ scope, practiceId, params, request, access }): Promise<ReportPageData> => ({
    practiceId,
    report: await report(scope, practiceId, params.reportId, request.requestId),
    history: await downloads(scope, practiceId, params.reportId, request.requestId),
    canExport: rolesPermit(access.roles, 'phi.export'),
    canRelease: rolesPermit(access.roles, 'case.work'),
    canReview: rolesPermit(access.roles, 'audit_finding.validate'),
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
 * confirmed, an optional statement, and the SHA-256 of the PDF and the CSV the checklist showed, which
 * must be the report's own.
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
    statement: optionalText(z.string().max(1000)),
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
        statement: input.statement ?? 'I attest that I reviewed this report against the checklist above.',
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
      statement: '',
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
  phi: true,
  permission: 'phi.export',
  params: z.object({ practiceId: opaqueId, reportId: opaqueId }),
  handle: async ({ scope, practiceId, params, request, services }): Promise<Download<Uint8Array<ArrayBuffer>>> => ({
    download: { filename: `audit-report-lines-${params.reportId}.csv`, contentType: 'text/csv; charset=utf-8', body: await file(scope, services, practiceId, params.reportId, 'csv', request.requestId) },
  }),
  sample: { params: (refs) => ({ practiceId: refs.practiceId, reportId: refs.auditReportId }) },
});

export const REPORT_ROUTES = [reportsPage, generateReportAction, reportPage, reviewChecklistPage, attestReportAction, releaseReportAction, reportPdf, reportCsv] as const;
