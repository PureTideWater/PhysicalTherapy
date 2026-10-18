import { rolesPermit } from '@tp/db/runtime';
import { z } from 'zod';

import { practiceRoute } from '../http/invoke';
import { type Download, InputError, type MutationResult, NotFoundError } from '../http/route';
import { type ReportDocumentDetail, generateReportDocument, reportDocumentCsvFile, reportDocumentOf, reportDocumentPdf } from '../reports/documents';
import { opaqueId, optionalText } from './schemas';

/**
 * The coverage report and the monthly summary's printed documents (PRD 5, J12; PRD 6, Reports and
 * exports: "coverage report ... CSV and PDF"; PRD 7, Reports: "generate, download, share within the
 * organization ... every total links to its stage"; docs/adr/0040 and 0045). Generating one is
 * case.work, as generating an audit report is (the database checks the role again and that it is the
 * person's own); reading a document, its PDF and its CSV is report.read: counts, totals, codes and payer
 * and plan names, no line-level PHI. Every download is audited and listed in the export history.
 */

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'a month, YYYY-MM');

export const generateReportDocumentAction = practiceRoute({
  id: 'practice.reports.documents.generate',
  kind: 'action',
  path: '/p/[practiceId]/reports/documents/generate',
  phi: true,
  permission: 'case.work',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ kind: z.enum(['coverage', 'monthly_summary']), month: optionalText(month) }),
  audit: { action: 'report_document_requested', objectType: 'report_document' },
  handle: async ({ scope, practiceId, input, services, request }): Promise<MutationResult> => {
    if (input.kind === 'monthly_summary' && input.month === undefined) {
      throw new InputError([{ field: 'month', message: 'the month of service the summary covers' }]);
    }
    const id = await generateReportDocument(scope, services, practiceId, input.kind === 'coverage' ? { kind: 'coverage' } : { kind: 'monthly_summary', month: input.month ?? '' }, request.requestId);
    return { objectId: id, redirect: `/p/${practiceId}/reports/documents/${id}` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: () => ({ kind: 'coverage' }) },
});

export interface ReportDocumentPageData {
  readonly practiceId: string;
  readonly document: ReportDocumentDetail;
  /** The server's origin, for the link shared within the organization. */
  readonly origin: string;
  readonly canGenerate: boolean;
}

export const reportDocumentPage = practiceRoute({
  id: 'practice.reports.documents.document',
  kind: 'page',
  path: '/p/[practiceId]/reports/documents/[documentId]',
  phi: true,
  permission: 'report.read',
  params: z.object({ practiceId: opaqueId, documentId: opaqueId }),
  handle: async ({ scope, practiceId, params, request, services, access }): Promise<ReportDocumentPageData> => {
    const document = await reportDocumentOf(scope, practiceId, params.documentId, request.requestId);
    if (document === undefined) {
      throw new NotFoundError();
    }
    return { practiceId, document, origin: services.origin, canGenerate: rolesPermit(access.roles, 'case.work') };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, documentId: refs.reportDocumentId }) },
});

/** The document's PDF, checked against its SHA-256; the download is audited. */
export const reportDocumentPdfRoute = practiceRoute({
  id: 'practice.reports.documents.pdf',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/reports/documents/[documentId]/pdf',
  rateLimit: 'export',
  phi: true,
  permission: 'report.read',
  params: z.object({ practiceId: opaqueId, documentId: opaqueId }),
  handle: async ({ scope, practiceId, params, request, services }): Promise<Download<Uint8Array<ArrayBuffer>>> => {
    const body = await reportDocumentPdf(scope, services, practiceId, params.documentId, request.requestId);
    if (body === undefined) {
      throw new NotFoundError();
    }
    // The file's name is the document's opaque ID, never the practice's or a payer's name.
    return { download: { filename: `report-${params.documentId}.pdf`, contentType: 'application/pdf', body } };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, documentId: refs.reportDocumentId }) },
});

/** The document's CSV, from its stored figures; the download is audited. */
export const reportDocumentCsvRoute = practiceRoute({
  id: 'practice.reports.documents.csv',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/reports/documents/[documentId]/csv',
  rateLimit: 'export',
  phi: true,
  permission: 'report.read',
  params: z.object({ practiceId: opaqueId, documentId: opaqueId }),
  handle: async ({ scope, practiceId, params, request }): Promise<Download> => {
    const file = await reportDocumentCsvFile(scope, practiceId, params.documentId, request.requestId);
    if (file === undefined) {
      throw new NotFoundError();
    }
    return { download: { filename: `report-${params.documentId}.csv`, contentType: 'text/csv; charset=utf-8', body: file.body } };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, documentId: refs.reportDocumentId }) },
});

export const REPORT_DOCUMENT_ROUTES = [generateReportDocumentAction, reportDocumentPage, reportDocumentPdfRoute, reportDocumentCsvRoute] as const;
