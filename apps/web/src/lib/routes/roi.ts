import { rolesPermit } from '@tp/db/runtime';
import { previousQuarter, quarterPeriod } from '@tp/ledger';
import { generateRoiStatement } from '@tp/worker/ledger';
import { z } from 'zod';

import { practiceRoute } from '../http/invoke';
import { type ListPage, pageParam } from '../http/paging';
import { type Download, InputError, type MutationResult, NotFoundError } from '../http/route';
import { type StatementDetail, type StatementSummary, listStatements, statementCsv, statementOf, statementPdf } from '../reconciliation/queries';
import { opaqueId } from './schemas';

/**
 * The ROI statement report (PRD 13, ROI statement: "quarterly and on demand per practice ... Every
 * figure links to its entries"; PRD 5, J12; PRD 7, Reports; test matrix LED-11; docs/adr/0042 and 0043).
 * The quarterly statement is the daily reconcile's; a person who reconciles postings generates one on
 * demand for any period, in their own name (the database checks the figures against the entries it
 * links), and the statement job prints its PDF through the audit report's Playwright pipeline. Reading
 * statements, the PDF and the CSV is report.read: the CSV holds the figures and the entries each sums,
 * by opaque ID, stage, amount and the date the money moved, no line-level PHI. Every download is
 * audited.
 */

const day = z.iso.date('a calendar date, YYYY-MM-DD');

export interface RoiPageData {
  readonly practiceId: string;
  readonly statements: ListPage<StatementSummary>;
  readonly canGenerate: boolean;
  /** The period the generate form offers first: the quarter before today's. */
  readonly suggested: { readonly from: string; readonly to: string };
}

export const roiStatementsPage = practiceRoute({
  id: 'practice.reports.roi',
  kind: 'page',
  path: '/p/[practiceId]/reports/roi',
  phi: true,
  permission: 'report.read',
  params: z.object({ practiceId: opaqueId, page: pageParam }),
  handle: async ({ scope, practiceId, params, access, request, services }): Promise<RoiPageData> => ({
    practiceId,
    statements: await listStatements(scope, practiceId, params.page, request.requestId),
    canGenerate: rolesPermit(access.roles, 'posting.reconcile'),
    suggested: quarterPeriod(previousQuarter(services.now().toISOString().slice(0, 10))),
  }),
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

/** Generates a statement for the period from the ledger's entries, in the person's name, and queues its print. */
export const generateRoiAction = practiceRoute({
  id: 'practice.reports.roi.generate',
  kind: 'action',
  path: '/p/[practiceId]/reports/roi/generate',
  phi: true,
  permission: 'posting.reconcile',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ periodFrom: day, periodTo: day }),
  audit: { action: 'roi_statement_requested', objectType: 'roi_statement' },
  handle: async ({ scope, practiceId, input, services, request }): Promise<MutationResult> => {
    if (input.periodFrom > input.periodTo) {
      throw new InputError([{ field: 'periodTo', message: 'the period ends on or after its first day' }]);
    }
    const generated = await generateRoiStatement(scope, { practiceId, periodFrom: input.periodFrom, periodTo: input.periodTo, requestId: request.requestId });
    if (generated === null) {
      // A statement in a person's name is never the quarterly one, so it is always written.
      throw new InputError([{ field: 'periodFrom', message: 'the statement could not be written; generate it again' }]);
    }
    // Queued in the request: a failure to queue undoes the statement, so none waits on a print never sent.
    await services.queue.enqueue('roi_statement', { practice_id: practiceId, roi_statement_id: generated.statementId });
    return { objectId: generated.statementId, redirect: `/p/${practiceId}/reports/roi/${generated.statementId}` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: () => ({ periodFrom: '2026-04-01', periodTo: '2026-06-30' }) },
});

export interface RoiStatementPageData {
  readonly practiceId: string;
  readonly detail: StatementDetail;
}

export const roiStatementPage = practiceRoute({
  id: 'practice.reports.roi.statement',
  kind: 'page',
  path: '/p/[practiceId]/reports/roi/[statementId]',
  phi: true,
  permission: 'report.read',
  params: z.object({ practiceId: opaqueId, statementId: opaqueId }),
  handle: async ({ scope, practiceId, params, request }): Promise<RoiStatementPageData> => {
    const detail = await statementOf(scope, practiceId, params.statementId, request.requestId);
    if (detail === undefined) {
      throw new NotFoundError();
    }
    return { practiceId, detail };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, statementId: refs.roiStatementId }) },
});

/** The statement's PDF, checked against its SHA-256; the download is audited. */
export const roiStatementPdf = practiceRoute({
  id: 'practice.reports.roi.pdf',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/reports/roi/[statementId]/pdf',
  phi: true,
  permission: 'report.read',
  params: z.object({ practiceId: opaqueId, statementId: opaqueId }),
  handle: async ({ scope, practiceId, params, request, services }): Promise<Download<Uint8Array<ArrayBuffer>>> => {
    const body = await statementPdf(scope, services, practiceId, params.statementId, request.requestId);
    if (body === undefined) {
      throw new NotFoundError();
    }
    // The file's name is the statement's opaque ID, never the practice's name.
    return { download: { filename: `roi-statement-${params.statementId}.pdf`, contentType: 'application/pdf', body } };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, statementId: refs.roiStatementId }) },
});

/** The statement's CSV: each figure and the entries it sums; the download is audited. */
export const roiStatementCsv = practiceRoute({
  id: 'practice.reports.roi.csv',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/reports/roi/[statementId]/csv',
  phi: true,
  permission: 'report.read',
  params: z.object({ practiceId: opaqueId, statementId: opaqueId }),
  handle: async ({ scope, practiceId, params, request }): Promise<Download> => {
    const body = await statementCsv(scope, practiceId, params.statementId, request.requestId);
    if (body === undefined) {
      throw new NotFoundError();
    }
    return { download: { filename: `roi-statement-${params.statementId}.csv`, contentType: 'text/csv; charset=utf-8', body } };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, statementId: refs.roiStatementId }) },
});

export const ROI_ROUTES = [roiStatementsPage, generateRoiAction, roiStatementPage, roiStatementPdf, roiStatementCsv] as const;
