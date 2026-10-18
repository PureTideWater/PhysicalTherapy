import { SCREENING_MAX_FILE_BYTES, type ScreeningRejection, screenTable } from '@tp/worker/screening-format';

import { FILE_MESSAGES, reasonMessages } from './messages';

/**
 * The screening upload, read in the browser (Change Order 001, CO-04; reconciliation-001, D18 a: "the browser parses
 * the upload; the server checks the header names and the typed rows and stores no bytes"). The file never leaves the
 * browser. This module hashes its bytes (SHA-256, crypto.subtle), reads it as UTF-8 CSV or tab-separated text with
 * RFC 4180 quotes, checks the header and every row against the screening's format (@tp/worker/screening-format, the
 * same rules the server applies again), and gives either the problems, at most 20, each naming its column by
 * position and header text and its row by number, or what the form sends: the hash, the header cells, the row count
 * and the rows of totals in their canonical form. A problem never quotes a cell's value.
 */

/** The most a file may be (25 MiB): 50,000 rows of totals fit in far less. */
export const MAX_FILE_BYTES = SCREENING_MAX_FILE_BYTES;

export type ScreeningParse =
  | {
      readonly ok: true;
      readonly fileSha256: string;
      /** The header cells as the file has them (at most 64, each at most 200 characters, as the server takes them). */
      readonly headers: readonly string[];
      readonly rowCount: number;
      /** The rows in their canonical form (encodeScreeningRows): what the server decodes. */
      readonly rows: string;
    }
  | { readonly ok: false; readonly messages: readonly string[]; readonly reasons: readonly ScreeningRejection[] };

/** A spreadsheet by its name or its declared type: refused with "save as CSV". */
const SPREADSHEET_NAME = /\.(?:xlsx|xlsm|xlsb|xltx|xltm|xls|ods|fods|numbers)$/i;
const SPREADSHEET_TYPES: ReadonlySet<string> = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/vnd.ms-excel.sheet.binary.macroenabled.12',
  'application/vnd.oasis.opendocument.spreadsheet',
]);

/** What is wrong with the file before its bytes are read, or null. */
export function fileProblem(file: { readonly name: string; readonly type: string; readonly size: number }): string | null {
  if (SPREADSHEET_NAME.test(file.name) || SPREADSHEET_TYPES.has(file.type.trim().toLowerCase())) {
    return FILE_MESSAGES.spreadsheet;
  }
  if (file.size === 0) {
    return FILE_MESSAGES.empty;
  }
  if (file.size > MAX_FILE_BYTES) {
    return FILE_MESSAGES.tooLarge;
  }
  return null;
}

/** A workbook by its first bytes, whatever its name: a zip (xlsx, ods) or an OLE compound file (xls). */
export function looksLikeSpreadsheet(bytes: Uint8Array): boolean {
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((byte, index) => bytes[index] === byte);
  return zip || ole;
}

/** The bytes as UTF-8 text, or null when they are not (a byte-order mark is kept for the table reader to drop). */
export function utf8Text(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** The SHA-256 of the bytes, lowercase hex. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type TableProblem = 'unclosed_quote' | 'text_after_quote';

export type Table = { readonly ok: true; readonly delimiter: ',' | '\t'; readonly rows: readonly (readonly string[])[] } | { readonly ok: false; readonly problem: TableProblem };

const BOM = '﻿';

/** The delimiter the header line uses: a tab when it holds a tab outside quotes and no comma, else a comma. */
export function delimiterOf(text: string): ',' | '\t' {
  let quoted = false;
  let tabs = 0;
  let commas = 0;
  for (const char of text) {
    if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && (char === '\n' || char === '\r')) {
      break;
    } else if (!quoted && char === '\t') {
      tabs += 1;
    } else if (!quoted && char === ',') {
      commas += 1;
    }
  }
  return tabs > 0 && commas === 0 ? '\t' : ',';
}

/**
 * The text's rows of cells (RFC 4180: a quoted cell may hold the delimiter, a line break or a doubled quote; CRLF or
 * LF; a byte-order mark dropped). A blank line, or one whose cells are all blank, is skipped. A quote never closed,
 * or text after a closing quote, refuses the file: it is never half-read.
 */
export function readTable(input: string): Table {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const delimiter = delimiterOf(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  const endField = () => {
    row.push(field);
    field = '';
    closed = false;
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell.trim() !== '')) {
      rows.push(row);
    }
    row = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] as string;
    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (char === delimiter) {
      endField();
    } else if (char === '\n' || char === '\r') {
      endRow();
      if (char === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
    } else if (closed) {
      // Spaces after a closing quote are a writer's padding; anything else refuses the file.
      if (char !== ' ') {
        return { ok: false, problem: 'text_after_quote' };
      }
    } else if (char === '"' && field.trim() === '') {
      field = '';
      quoted = true;
    } else {
      field += char;
    }
  }
  if (quoted) {
    return { ok: false, problem: 'unclosed_quote' };
  }
  if (field !== '' || closed || row.length > 0) {
    endRow();
  }
  return { ok: true, delimiter, rows };
}

function refused(message: string): ScreeningParse {
  return { ok: false, messages: [message], reasons: [] };
}

function refusedFor(reasons: readonly ScreeningRejection[], headers: readonly string[]): ScreeningParse {
  return { ok: false, messages: reasonMessages(reasons, headers), reasons };
}

/** Reads and screens the bytes of a chosen file. */
export async function parseScreeningBytes(file: { readonly name: string; readonly type: string; readonly size: number }, bytes: Uint8Array, now: Date): Promise<ScreeningParse> {
  const before = fileProblem(file);
  if (before !== null) {
    return refused(before);
  }
  if (looksLikeSpreadsheet(bytes)) {
    return refused(FILE_MESSAGES.spreadsheet);
  }
  const text = utf8Text(bytes);
  if (text === null || text.includes('\u0000')) {
    return refused(FILE_MESSAGES.notText);
  }
  const table = readTable(text);
  if (!table.ok) {
    return refused(table.problem === 'unclosed_quote' ? FILE_MESSAGES.unclosedQuote : FILE_MESSAGES.textAfterQuote);
  }
  // The format's own screen, the server's rules: the header, then every row's shape, values, quarter and key.
  const screened = screenTable(table.rows, now);
  if (!screened.ok) {
    return refusedFor(screened.reasons, screened.headers);
  }
  return { ok: true, fileSha256: await sha256Hex(bytes), headers: screened.headers, rowCount: screened.rowCount, rows: screened.rows };
}

/** Reads a chosen file in this browser and screens it; nothing is sent. `now` dates the current quarter. */
export async function parseScreeningFile(file: File, now: Date = new Date()): Promise<ScreeningParse> {
  const before = fileProblem(file);
  if (before !== null) {
    return refused(before);
  }
  return parseScreeningBytes(file, new Uint8Array(await file.arrayBuffer()), now);
}
