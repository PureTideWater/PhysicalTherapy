import { SCREENING_MAX_FILE_BYTES, type ScreeningLeftOut, type ScreeningRejection, screenTable } from '@tp/worker/screening-format';

import { FILE_MESSAGES, leftOutMessage, reasonMessages } from './messages';

/**
 * The screening upload, read in the browser (Change Order 001, CO-04; reconciliation-001, D18 a: "the browser parses
 * the upload; the server checks the header names and the typed rows and stores no bytes"). The file never leaves the
 * browser. This module hashes its bytes (SHA-256, crypto.subtle), reads it as UTF-8 CSV or tab-separated text with
 * RFC 4180 quotes (skipping the note lines above the header, which is how the template states its rules), checks the
 * header and every row against the screening's format (@tp/worker/screening-format, the same rules the server applies
 * again, its quarters dated by the server's clock), and gives either the problems, at most 20, patient information first, each
 * naming its column by position and header text and its row by number, or what the form sends: the hash, the header's
 * canonical column names in the file's order (never the text typed), the row count and the rows of totals in their
 * canonical form. A row of fewer than 11 claim lines is left out and never sent (it can be one patient's service
 * line); the form sends only how many rows, claim lines and dollars were left out. A problem never quotes a cell's
 * value, and no header text leaves the browser.
 */

/** The most a file may be (25 MiB): 50,000 rows of totals fit in far less. */
export const MAX_FILE_BYTES = SCREENING_MAX_FILE_BYTES;

export type ScreeningParse =
  | {
      readonly ok: true;
      readonly fileSha256: string;
      /** The header as the form sends it: each column's canonical name in the file's order, never the text typed. */
      readonly headers: readonly string[];
      readonly rowCount: number;
      /** The rows in their canonical form (encodeScreeningRows): what the server decodes. */
      readonly rows: string;
      /** The rows of fewer than 11 claim lines left out, never sent: how many, their claim lines and their allowed total. */
      readonly leftOut: ScreeningLeftOut;
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

/** Where the line starting at `start` ends: its first line break outside quotes, or the end of the text. */
function lineEnd(text: string, start: number): number {
  let quoted = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && (char === '\n' || char === '\r')) {
      return index;
    }
  }
  return text.length;
}

/** A note line as typed: its first cell, quoted or not, begins with # (the template's rules above its header). */
const NOTE_LINE = /^[ \t]*"?[ \t]*#/;

/** A line of no cell: nothing but spaces, delimiters and quotes. */
const BLANK_LINE = /^[\s,"]*$/;

/**
 * The delimiter the header line uses: a tab when it holds a tab outside quotes and no comma, else a comma. The note
 * lines and blank lines above the header are passed over, so a note's own commas never choose it.
 */
export function delimiterOf(text: string): ',' | '\t' {
  let start = 0;
  let end = lineEnd(text, start);
  while (end < text.length && (NOTE_LINE.test(text.slice(start, end)) || BLANK_LINE.test(text.slice(start, end)))) {
    start = text[end] === '\r' && text[end + 1] === '\n' ? end + 2 : end + 1;
    end = lineEnd(text, start);
  }
  let quoted = false;
  let tabs = 0;
  let commas = 0;
  for (const char of text.slice(start, end)) {
    if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === '\t') {
      tabs += 1;
    } else if (!quoted && char === ',') {
      commas += 1;
    }
  }
  return tabs > 0 && commas === 0 ? '\t' : ',';
}

/**
 * A note row above the header: its first cell begins with # and every other cell is blank, as the template's rules
 * are written and as a spreadsheet saves them (padded with empty cells to the header's width). A header that begins
 * with a # column ("#", then the columns) has other cells, so it is never a note and is checked as a header.
 */
export function isNoteRow(row: readonly string[]): boolean {
  const [first = '', ...rest] = row;
  return first.trimStart().startsWith('#') && rest.every((cell) => cell.trim() === '');
}

/**
 * The text's rows of cells (RFC 4180: a quoted cell may hold the delimiter, a line break or a doubled quote; CRLF or
 * LF; a byte-order mark dropped). A blank line, or one whose cells are all blank, is skipped, and so is every note row
 * above the header (isNoteRow: the template's rules), so the first row is the header. A note row below the header is
 * read as a row and refused like any other. A quote never closed, or text after a closing quote, refuses the file: it
 * is never half-read.
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
  const header = rows.findIndex((cells) => !isNoteRow(cells));
  return { ok: true, delimiter, rows: header === -1 ? [] : rows.slice(header) };
}

function refused(message: string): ScreeningParse {
  return { ok: false, messages: [message], reasons: [] };
}

function refusedFor(reasons: readonly ScreeningRejection[], headers: readonly string[], total: number, leftOut?: ScreeningLeftOut): ScreeningParse {
  const left = leftOut === undefined ? null : leftOutMessage(leftOut);
  return { ok: false, messages: [...reasonMessages(reasons, headers, total), ...(left === null ? [] : [left])], reasons };
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
    return refusedFor(screened.reasons, screened.headers, screened.total, screened.leftOut);
  }
  return { ok: true, fileSha256: await sha256Hex(bytes), headers: screened.headers, rowCount: screened.rowCount, rows: screened.rows, leftOut: screened.leftOut };
}

/**
 * How far the server's clock is ahead of this browser's, in milliseconds, from the time the server gave when it built
 * the page (ISO 8601) and this browser's clock then; zero when the server's time cannot be read. The page screens a
 * file's quarters by the server's clock moved on by this offset, never by this computer's own: a computer whose clock
 * is wrong neither refuses a quarter the server takes nor sends one the server refuses, so the server never refuses a
 * row the page sent, whose number, once rows of fewer than 11 claim lines are left out, would not be the file's.
 */
export function clockOffset(serverTime: string, browserNow: number): number {
  const server = Date.parse(serverTime);
  return Number.isFinite(server) && Number.isFinite(browserNow) ? server - browserNow : 0;
}

/** Reads a chosen file in this browser and screens it; nothing is sent. `now` dates the current quarter. */
export async function parseScreeningFile(file: File, now: Date = new Date()): Promise<ScreeningParse> {
  const before = fileProblem(file);
  if (before !== null) {
    return refused(before);
  }
  return parseScreeningBytes(file, new Uint8Array(await file.arrayBuffer()), now);
}
