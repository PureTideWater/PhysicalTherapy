/**
 * Posting and EFT exports are read as CSV only (docs/adr/0059): a workbook is refused before the upload
 * request, by the uploader, and the request itself names the file a CSV-only kind does not accept. The
 * worker still holds any workbook that arrives (under another name or type) as wrong_type. Plain data
 * and text, with no import, so the browser's uploader and the server's route share it.
 */

/** The kinds whose files are read as CSV text with the practice's template. */
export const CSV_ONLY_KINDS: ReadonlySet<string> = new Set(['posting_export', 'eft_export']);

/** A spreadsheet by its name: Excel's workbooks, templates and macro-enabled kinds, OpenDocument and Numbers. */
const SPREADSHEET_NAME = /\.(?:xlsx|xlsm|xlsb|xltx|xltm|xls|ods|fods|numbers)$/i;
/**
 * A spreadsheet by the type the browser declares. Not application/vnd.ms-excel: Windows browsers declare a
 * .csv so where Excel is installed, and that file is read by its name.
 */
const SPREADSHEET_TYPES: ReadonlySet<string> = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/vnd.ms-excel.sheet.binary.macroenabled.12',
  'application/vnd.oasis.opendocument.spreadsheet',
]);

const ACTION = 'posting and EFT exports are read as CSV only. Save it as CSV (comma-separated) and upload it again.';

/**
 * Why the uploader refuses file `number` of a batch before asking for an upload URL: a spreadsheet chosen as
 * a posting or EFT export. Null otherwise. The message names the file by its place in the batch, never by its
 * name.
 */
export function spreadsheetExportProblem(kind: string, file: { readonly name: string; readonly type: string }, number: number): string | null {
  if (!CSV_ONLY_KINDS.has(kind) || !(SPREADSHEET_NAME.test(file.name) || SPREADSHEET_TYPES.has(file.type.trim().toLowerCase()))) {
    return null;
  }
  return `File ${String(number)} is a spreadsheet: ${ACTION}`;
}

/** What the upload request says of file `number` when its kind does not accept its declared type. */
export function declaredTypeProblem(kind: string, number: number): string {
  return CSV_ONLY_KINDS.has(kind) ? `File ${String(number)} is not a CSV: ${ACTION}` : 'not a type of file this kind of document accepts';
}
