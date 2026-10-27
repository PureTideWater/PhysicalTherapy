import { randomUUID } from 'node:crypto';

import {
  DOCUMENT_KINDS,
  type DocumentKind,
  type DocumentStatus,
  ERA_FORMAT_IDS,
  type EraFormatId,
  type PracticeScope,
  type ScopeClient,
  loadPracticeCipher,
  recordAuditEvent,
  rolesPermit,
} from '@tp/db/runtime';
import { practiceRunRefusalFor } from '@tp/worker/billing';
import { ERA_EXPORT_FORMATS, isUnconfirmed } from '@tp/worker/era-formats';
import { z } from 'zod';

import { practiceRoute } from '../http/invoke';
import { type Download, InputError, NotFoundError } from '../http/route';
import { declaredTypeProblem } from '../uploads/csv-exports';
import { CONTENT_TYPES, MAX_FILES_PER_BATCH, MAX_UPLOAD_BYTES, allowedContentType } from '../uploads/limits';
import type { Receipt } from '../uploads/receipt-labels';
import { type ReceiptPage, listReceipts, receiptOf, receiptReport } from '../uploads/receipts';
import { UPLOAD_TOKEN } from '../uploads/token';
import { type UploadTarget, UploadSizeError } from '../uploads/targets';
import { opaqueId } from './schemas';

/**
 * The Uploads screen and its API (PRD 5, J1 and J4; PRD 6, Agreements and Intake and documents; PRD 7,
 * Uploads; PRD 10, Pipeline step 1; PRD 16, Upload safety; docs/adr/0026). Every route is a practice
 * route: reading receipts needs the workspace (practice.open); asking for upload URLs, sending bytes
 * to the local receiver, completing and retrying an upload need file.upload, which the billing
 * manager, the analysts and the firm principal hold and the viewer does not (PRD 3).
 *
 * 1. request: the agreement chain (the practice's BAA, J1) and the limits (kind and declared type,
 *    size, files per batch) are checked; one source_document per file is recorded (kind, size,
 *    declared type, uploader; an opaque key; retention class records) awaiting its bytes; each gets a
 *    URL the browser PUTs it to. An ERA export names the system it came from (its vendor format,
 *    docs/adr/0060), which is recorded with it and never changed; no other kind names one.
 * 2. content (local only): the bytes, sealed with the practice's data key as they arrive.
 * 3. complete: once the bytes have arrived the document is received and the intake job is queued; the
 *    worker hashes, deduplicates, scans, sniffs and expands it, and queues parse_835 per clean 835.
 * 4. retry: a new URL for bytes that never arrived, or intake again for an upload that failed.
 *
 * No route ever sees a file's name; URLs and job payloads carry opaque IDs only (SEC-08).
 */

const documentRow = `SELECT id, kind, size_bytes::text AS size_bytes, content_type, status FROM source_document WHERE id = $1 AND practice_id = $2 AND parent_document_id IS NULL`;

interface DocumentRow {
  readonly id: string;
  readonly kind: DocumentKind;
  readonly size_bytes: string;
  readonly content_type: string;
  readonly status: DocumentStatus;
}

async function uploadedDocument(scope: PracticeScope<ScopeClient>, practiceId: string, documentId: string): Promise<DocumentRow> {
  const [row] = (await scope.client.query<DocumentRow>(documentRow, [documentId, practiceId])).rows;
  if (row === undefined) {
    throw new NotFoundError();
  }
  return row;
}

/** Whether the practice's BAA is on file (PRD 6: "no upload without a BAA"), asked of the database. */
export async function baaOnFile(scope: PracticeScope<ScopeClient>, practiceId: string): Promise<boolean> {
  const { rows } = await scope.client.query<{ open: boolean }>('SELECT practice_baa_on_file($1) AS open', [practiceId]);
  return rows[0]?.open === true;
}

export const NO_BAA = 'Uploads open once the practice’s business associate agreement is on file. A platform administrator records it when it is signed.';

export interface UploadGate {
  readonly open: boolean;
  readonly reason: string | null;
}

/** A vendor ERA export format a person may choose for an upload, and whether its layout is still a placeholder. */
export interface EraExportChoice {
  readonly id: EraFormatId;
  readonly vendorName: string;
  readonly unconfirmed: boolean;
}

export interface UploadsPageData {
  readonly practiceId: string;
  /** Whether the actor's role may upload (PRD 3). */
  readonly canUpload: boolean;
  readonly roles: readonly string[];
  /** Uploads are disabled, with the reason, until the agreement chain exists (J1). */
  readonly gate: UploadGate;
  readonly limits: { readonly maxFiles: number; readonly maxBytes: number; readonly contentTypes: readonly string[] };
  /** An ERA export's declared types and the formats it may be (docs/adr/0060). */
  readonly eraExport: { readonly contentTypes: readonly string[]; readonly formats: readonly EraExportChoice[] };
}

/** The ERA export formats, in the registry's order. */
export const ERA_EXPORT_CHOICES: readonly EraExportChoice[] = ERA_EXPORT_FORMATS.map((format) => ({ id: format.id, vendorName: format.vendorName, unconfirmed: isUnconfirmed(format) }));

export const uploadsPage = practiceRoute({
  id: 'practice.uploads',
  kind: 'page',
  path: '/p/[practiceId]/uploads',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId }),
  handle: async ({ scope, practiceId, access }): Promise<UploadsPageData> => {
    const open = await baaOnFile(scope, practiceId);
    // While new work is held, uploads pause with the database's reason (docs/adr/0050, 0080): the owner's hold, or a
    // grantee's when only its grants let this person upload. What is on file stays readable.
    const suspension = await practiceRunRefusalFor(scope.client, practiceId, 'file.upload');
    return {
      practiceId,
      canUpload: rolesPermit(access.roles, 'file.upload'),
      roles: access.roles,
      gate: { open: open && suspension === null, reason: !open ? NO_BAA : suspension === null ? null : `Uploads are paused: ${suspension}.` },
      limits: { maxFiles: MAX_FILES_PER_BATCH, maxBytes: MAX_UPLOAD_BYTES, contentTypes: CONTENT_TYPES.x12_835 },
      eraExport: { contentTypes: CONTENT_TYPES.era_export, formats: ERA_EXPORT_CHOICES },
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

export interface UploadDocumentData {
  readonly practiceId: string;
  readonly receipt: Receipt;
  readonly canUpload: boolean;
}

export const uploadDocumentPage = practiceRoute({
  id: 'practice.uploads.document',
  kind: 'page',
  path: '/p/[practiceId]/uploads/[documentId]',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, documentId: opaqueId }),
  handle: async ({ scope, practiceId, params, access, request }): Promise<UploadDocumentData> => {
    const receipt = await receiptOf(scope, practiceId, params.documentId, request.requestId);
    if (receipt === undefined) {
      throw new NotFoundError();
    }
    return { practiceId, receipt, canUpload: rolesPermit(access.roles, 'file.upload') };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, documentId: refs.documentId }) },
});

const page = z.coerce.number().int().min(1).max(100_000).default(1);
const documentIds = z
  .string()
  .transform((value) => value.split(',').filter((part) => part !== ''))
  .pipe(z.array(opaqueId).min(1).max(MAX_FILES_PER_BATCH))
  .optional();

export const uploadReceipts = practiceRoute({
  id: 'practice.uploads.receipts',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/uploads/receipts',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, parent_id: opaqueId.optional(), document_ids: documentIds, page }),
  handle: ({ scope, practiceId, params, request }): Promise<ReceiptPage> =>
    listReceipts(scope, {
      practiceId,
      page: params.page,
      requestId: request.requestId,
      ...(params.parent_id === undefined ? {} : { parentId: params.parent_id }),
      ...(params.document_ids === undefined ? {} : { documentIds: params.document_ids }),
    }),
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

const fileSchema = z.strictObject({
  kind: z.enum(DOCUMENT_KINDS),
  contentType: z.string().trim().toLowerCase().max(200),
  sizeBytes: z
    .number()
    .int()
    .min(1, 'an empty file')
    .max(MAX_UPLOAD_BYTES, `larger than ${String(MAX_UPLOAD_BYTES / 1024 ** 3)} GiB; split it or zip it`),
  /** The system an ERA export came from: required for an ERA export, and for no other kind (docs/adr/0060). */
  formatId: z.enum(ERA_FORMAT_IDS).optional(),
});

/** The request's message when an ERA export names no format, or another kind names one. */
export function formatProblem(kind: DocumentKind, formatId: EraFormatId | undefined, position: number): string | null {
  if (kind === 'era_export' && formatId === undefined) {
    return `File ${String(position)} is an ERA export: choose which system's export it is.`;
  }
  if (kind !== 'era_export' && formatId !== undefined) {
    return `File ${String(position)} has an export format but is not an ERA export.`;
  }
  return null;
}

/**
 * The batch, each file's declared type checked against its kind. A posting or EFT export the request does
 * not accept (a workbook among them, which the uploader declares generically) is named by its place in the
 * batch, with what to do: save it as CSV (docs/adr/0059). An ERA export names its format, and no other file
 * names one, each named by its place in the batch.
 */
const filesSchema = z
  .array(fileSchema)
  .min(1, 'choose at least one file')
  .max(MAX_FILES_PER_BATCH, `at most ${String(MAX_FILES_PER_BATCH)} files at once; zip the rest`)
  .superRefine((files, context) => {
    files.forEach((file, index) => {
      if (!allowedContentType(file.kind, file.contentType)) {
        context.addIssue({ code: 'custom', message: declaredTypeProblem(file.kind, index + 1), path: [index, 'contentType'] });
      }
      const format = formatProblem(file.kind, file.formatId, index + 1);
      if (format !== null) {
        context.addIssue({ code: 'custom', message: format, path: [index, 'formatId'] });
      }
    });
  });

export interface RequestedUpload {
  readonly documentId: string;
  readonly upload: UploadTarget;
}

export const requestUploads = practiceRoute({
  id: 'practice.uploads.request',
  kind: 'handler',
  method: 'POST',
  path: '/p/[practiceId]/uploads/request',
  rateLimit: 'upload',
  phi: true,
  permission: 'file.upload',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ files: filesSchema }),
  audit: { action: 'upload_batch_requested', objectType: 'source_document' },
  handle: async ({ scope, practiceId, input, actor, services, request }): Promise<{ readonly documents: readonly RequestedUpload[] }> => {
    if (!(await baaOnFile(scope, practiceId))) {
      throw new InputError([{ field: 'files', message: NO_BAA }]);
    }
    const now = services.now();
    const documents: RequestedUpload[] = [];
    for (const file of input.files) {
      const documentId = randomUUID();
      await scope.client.query('INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by, format_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
        documentId,
        practiceId,
        file.kind,
        file.sizeBytes,
        file.contentType,
        actor.userId,
        file.formatId ?? null,
      ]);
      await recordAuditEvent(scope, { action: 'upload_requested', objectType: 'source_document', objectId: documentId, practiceId, requestId: request.requestId });
      documents.push({ documentId, upload: await services.uploads.target({ practiceId, documentId, sizeBytes: file.sizeBytes, contentType: file.contentType }, now) });
    }
    return { documents };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    input: () => ({ files: [{ kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: 1200 }] }),
  },
});

export const uploadContent = practiceRoute({
  id: 'practice.uploads.content',
  kind: 'handler',
  method: 'PUT',
  path: '/p/[practiceId]/uploads/[documentId]/content',
  rateLimit: 'upload',
  phi: true,
  permission: 'file.upload',
  params: z.object({ practiceId: opaqueId, documentId: opaqueId }),
  input: z.object({ token: z.string().regex(UPLOAD_TOKEN, 'the upload link is not valid; request a new one') }),
  audit: { action: 'upload_stored', objectType: 'source_document' },
  handle: async ({ scope, practiceId, params, input, request, services }) => {
    const receiver = services.uploads.receiver;
    if (receiver === undefined) {
      // Uploads go to S3 here; this server receives none.
      throw new NotFoundError();
    }
    const row = await uploadedDocument(scope, practiceId, params.documentId);
    const subject = { practiceId, documentId: row.id, sizeBytes: Number(row.size_bytes), contentType: row.content_type };
    if (!receiver.authorizes(subject, input.token, services.now())) {
      throw new InputError([{ field: 'token', message: 'the upload link has expired or is not for this file; request a new one' }]);
    }
    const upload = request.upload;
    if (upload === undefined || upload.contentType?.toLowerCase() !== row.content_type || (upload.contentLength !== null && upload.contentLength !== subject.sizeBytes)) {
      throw new InputError([{ field: 'upload', message: 'the upload is not the type and size it was declared as' }]);
    }
    if (row.status !== 'awaiting_upload') {
      return { objectId: row.id, stored: 'already' as const };
    }
    const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
    try {
      return { objectId: row.id, stored: await receiver.receive(cipher, subject, upload.body) };
    } catch (error) {
      if (error instanceof UploadSizeError) {
        throw new InputError([{ field: 'upload', message: 'the upload is not the size it was declared as' }]);
      }
      throw error;
    }
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId, documentId: refs.documentId }),
    input: (refs) => ({ token: refs.uploadToken }),
    upload: () => ({ contentType: 'application/octet-stream', body: Buffer.alloc(1200, 0x20) }),
  },
});

export interface UploadProgress {
  readonly objectId: string;
  readonly receipt: Receipt;
  /** A new URL, when the bytes still have to be sent. */
  readonly upload?: UploadTarget;
}

async function progress(scope: PracticeScope<ScopeClient>, practiceId: string, documentId: string, requestId: string, upload?: UploadTarget): Promise<UploadProgress> {
  const receipt = await receiptOf(scope, practiceId, documentId, requestId);
  if (receipt === undefined) {
    throw new NotFoundError();
  }
  return { objectId: documentId, receipt, ...(upload === undefined ? {} : { upload }) };
}

export const completeUpload = practiceRoute({
  id: 'practice.uploads.complete',
  kind: 'handler',
  method: 'POST',
  path: '/p/[practiceId]/uploads/complete',
  rateLimit: 'upload',
  phi: true,
  permission: 'file.upload',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ documentId: opaqueId }),
  audit: { action: 'upload_completed', objectType: 'source_document' },
  handle: async ({ scope, practiceId, input, services, request }) => {
    const row = await uploadedDocument(scope, practiceId, input.documentId);
    if (row.status === 'awaiting_upload' && (await services.uploads.arrived(practiceId, row.id))) {
      await scope.client.query("UPDATE source_document SET status = 'received' WHERE id = $1", [row.id]);
      await services.queue.enqueue('intake', { practice_id: practiceId, document_id: row.id });
    }
    return progress(scope, practiceId, row.id, request.requestId);
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ documentId: refs.documentId }) },
});

export const retryUpload = practiceRoute({
  id: 'practice.uploads.retry',
  kind: 'handler',
  method: 'POST',
  path: '/p/[practiceId]/uploads/retry',
  rateLimit: 'upload',
  phi: true,
  permission: 'file.upload',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ documentId: opaqueId }),
  audit: { action: 'upload_retried', objectType: 'source_document' },
  handle: async ({ scope, practiceId, input, services, request }) => {
    const row = await uploadedDocument(scope, practiceId, input.documentId);
    if (row.status === 'awaiting_upload') {
      const target = await services.uploads.target({ practiceId, documentId: row.id, sizeBytes: Number(row.size_bytes), contentType: row.content_type }, services.now());
      return progress(scope, practiceId, row.id, request.requestId, target);
    }
    if (row.status === 'received' || row.status === 'failed') {
      await services.queue.enqueue('intake', { practice_id: practiceId, document_id: row.id });
    }
    return progress(scope, practiceId, row.id, request.requestId);
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ documentId: refs.documentId }) },
});

export const uploadReport = practiceRoute({
  id: 'practice.uploads.report',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/uploads/[documentId]/report',
  rateLimit: 'export',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, documentId: opaqueId }),
  handle: async ({ scope, practiceId, params, request }): Promise<Download> => {
    const body = await receiptReport(scope, practiceId, params.documentId, request.requestId);
    if (body === undefined) {
      throw new NotFoundError();
    }
    // The file's name is the document's opaque ID, never the uploaded file's name.
    return { download: { filename: `receipt-${params.documentId}.csv`, contentType: 'text/csv; charset=utf-8', body } };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, documentId: refs.documentId }) },
});

export const UPLOAD_ROUTES = [uploadsPage, uploadDocumentPage, uploadReceipts, requestUploads, uploadContent, completeUpload, retryUpload, uploadReport] as const;
