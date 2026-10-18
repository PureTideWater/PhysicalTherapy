import { LedgerError } from './stages';

/**
 * A strict CSV reader for the practice's exports (RFC 4180: comma-separated fields, double quotes
 * around a field that holds a comma, a quote or a line break, a doubled quote inside one; CRLF or LF
 * line endings; a byte-order mark ignored). Blank lines are skipped. A quote that is never closed, or
 * text after a closing quote, refuses the file: an export is never half-read.
 */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  let index = 0;
  const endField = () => {
    row.push(field);
    field = '';
    closed = false;
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0] !== '') {
      rows.push(row);
    }
    row = [];
  };
  while (index < source.length) {
    const char = source[index] as string;
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        closed = true;
      } else {
        field += char;
      }
      index += 1;
      continue;
    }
    if (char === ',') {
      endField();
    } else if (char === '\n' || char === '\r') {
      endRow();
      if (char === '\r' && source[index + 1] === '\n') {
        index += 1;
      }
    } else if (closed) {
      throw new LedgerError(`the export has text after a closing quote at character ${String(index)}`);
    } else if (char === '"' && field === '') {
      quoted = true;
    } else {
      field += char;
    }
    index += 1;
  }
  if (quoted) {
    throw new LedgerError('the export ends inside a quoted field');
  }
  if (field !== '' || closed || row.length > 0) {
    endRow();
  }
  return rows;
}
