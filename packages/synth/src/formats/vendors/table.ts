/**
 * The CSV text of the vendor formats (registry.ts), and a strict reader for packages/synth's own
 * exports. Writing follows RFC 4180: a cell holding a comma, a quote or a line break is quoted, a quote
 * inside one doubled; each format's own line ending, and a byte-order mark where it writes one. Dates
 * are written in the format's date format and money as plain decimals from integer cents.
 */
import { formatCents, parseCents } from '@tp/money';

import { type VendorDateFormat, type VendorFormat } from './registry';

export class VendorFormatError extends Error {
  override readonly name = 'VendorFormatError';
}

function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** The bytes of one export: its header row, then `rows` (cells in the format's column order). */
export function vendorCsv(format: Pick<VendorFormat, 'columns' | 'lineEnding' | 'bom'>, rows: readonly (readonly string[])[]): Uint8Array {
  const end = format.lineEnding === 'CRLF' ? '\r\n' : '\n';
  for (const row of rows) {
    if (row.length !== format.columns.length) {
      throw new VendorFormatError(`a row has ${String(row.length)} cells for ${String(format.columns.length)} columns`);
    }
  }
  const text = [format.columns.map((column) => column.header), ...rows].map((row) => row.map(cell).join(',')).join(end);
  return new Uint8Array(Buffer.from(`${format.bom ? '﻿' : ''}${text}${end}`, 'utf8'));
}

/** A calendar date (YYYY-MM-DD) as the format writes it. */
export function writeDate(iso: string, format: VendorDateFormat): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) {
    throw new VendorFormatError('a date to write is not YYYY-MM-DD');
  }
  return format === 'YYYY-MM-DD' ? iso : `${match[2] as string}/${match[3] as string}/${match[1] as string}`;
}

/** Integer cents as text ("-1234") as a plain decimal ("-12.34"). */
export function writeMoney(centsText: string): string {
  return formatCents(parseCents(centsText));
}

/**
 * The rows of a CSV packages/synth wrote (RFC 4180, CRLF or LF, a byte-order mark ignored, blank lines
 * skipped). A quote never closed, or text after a closing quote, refuses the text.
 */
export function readTable(text: string): string[][] {
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  const endRow = () => {
    row.push(field);
    if (row.length > 1 || row[0] !== '') {
      rows.push(row);
    }
    row = [];
    field = '';
    closed = false;
  };
  for (let index = 0; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (quoted) {
      if (char === '"' && source.charAt(index + 1) === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else {
        field += char;
      }
    } else if (char === ',') {
      row.push(field);
      field = '';
      closed = false;
    } else if (char === '\r' || char === '\n') {
      endRow();
      if (char === '\r' && source.charAt(index + 1) === '\n') {
        index += 1;
      }
    } else if (closed) {
      throw new VendorFormatError('a table has text after a closing quote');
    } else if (char === '"' && field === '') {
      quoted = true;
    } else {
      field += char;
    }
  }
  if (quoted) {
    throw new VendorFormatError('a table ends inside a quoted cell');
  }
  if (field !== '' || closed || row.length > 0) {
    endRow();
  }
  return rows;
}
