import { DOCUMENT_KINDS, type DocumentKind } from '@tp/db/runtime';

/**
 * What an upload request may ask for (PRD 6, Intake and documents: "size and count limits"; PRD 16,
 * Upload safety: "pre-signed URLs with content-type and size limits"). The declared type is a
 * declaration only: the worker sniffs the bytes, and the presigned PUT (or the local receiver) holds
 * the browser to the declared type and size exactly.
 */

const GIB = 1024 * 1024 * 1024;

/** The largest single upload: a 2 GiB zip of 835s (PRD 6), within S3's 5 GiB limit for one PUT. */
export const MAX_UPLOAD_BYTES = 2 * GIB;

/** Files in one request; a larger set goes up as a zip. */
export const MAX_FILES_PER_BATCH = 100;

/** How long an upload URL works. */
export const UPLOAD_URL_SECONDS = 15 * 60;

export const ZIP_TYPES = ['application/zip', 'application/x-zip-compressed'] as const;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/**
 * The legacy .xls type, which Windows browsers also declare a .csv as where Excel is installed. A
 * posting, EFT or ERA export may be declared so; its bytes must still be CSV (the worker holds a workbook as
 * wrong_type).
 */
const XLS_TYPE = 'application/vnd.ms-excel';
const SPREADSHEET_TYPES = [XLSX_TYPE, XLS_TYPE] as const;

/**
 * The content types each kind of document may be declared as; a zip of any kind is allowed. A
 * fee-schedule exhibit is a PDF, an .xlsx workbook or a CSV: the kinds its pages can be cited from
 * (docs/adr/0033). The legacy binary .xls is not one of them; it is saved as .xlsx or CSV first. A
 * posting or EFT export is CSV only (docs/adr/0059): an .xlsx is refused here, and a workbook declared
 * as something else is held at intake, saved as CSV first. So is an ERA export (docs/adr/0060).
 */
export const CONTENT_TYPES: Readonly<Record<DocumentKind, readonly string[]>> = {
  x12_835: ['application/edi-x12', 'text/plain', 'application/octet-stream', ...ZIP_TYPES],
  era_export: ['text/csv', 'text/plain', XLS_TYPE, ...ZIP_TYPES],
  contract: ['application/pdf', ...ZIP_TYPES],
  payer_letter: ['application/pdf', ...ZIP_TYPES],
  exhibit: ['application/pdf', 'text/csv', XLSX_TYPE, ...ZIP_TYPES],
  posting_export: ['text/csv', 'text/plain', XLS_TYPE, ...ZIP_TYPES],
  eft_export: ['text/csv', 'text/plain', XLS_TYPE, ...ZIP_TYPES],
  other: ['application/octet-stream', 'application/pdf', 'text/plain', 'text/csv', ...SPREADSHEET_TYPES, ...ZIP_TYPES],
};

export function allowedContentType(kind: DocumentKind, contentType: string): boolean {
  return CONTENT_TYPES[kind].includes(contentType);
}

export { DOCUMENT_KINDS };
