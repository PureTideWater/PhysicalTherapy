/**
 * Shared reading of the public tabular files: a delimited-text tokenizer (CSV with RFC 4180
 * quoting, or tab-separated) that keeps each row's raw text, so every parsed record can quote the
 * exact row it came from, and the helpers the parsers share.
 */

export interface Row {
  readonly cells: readonly string[];
  /** The row exactly as it appears in the file, without its line terminator. */
  readonly raw: string;
  /** 1-based line number where the row starts. */
  readonly line: number;
}

/** A file the parser cannot read as the documented layout. The message names the line and column. */
export class RuleImportError extends Error {
  override readonly name = 'RuleImportError';
}

/**
 * Splits delimited text into rows. Quoted fields may hold the delimiter, doubled quotes and line
 * breaks. Both LF and CRLF end a row. A final empty line is not a row.
 */
export function parseDelimited(text: string, delimiter: ',' | '\t'): Row[] {
  const rows: Row[] = [];
  let cells: string[] = [];
  let field = '';
  let inQuotes = false;
  let atFieldStart = true;
  let rowStart = 0;
  let line = 1;
  let rowLine = 1;

  const endRow = (end: number) => {
    cells.push(field);
    const rawEnd = end > rowStart && text[end - 1] === '\r' ? end - 1 : end;
    const raw = text.slice(rowStart, rawEnd);
    const last = cells.length - 1;
    cells[last] = (cells[last] ?? '').replace(/\r$/, '');
    rows.push({ cells, raw, line: rowLine });
    cells = [];
    field = '';
    atFieldStart = true;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === '\n') {
          line += 1;
        }
        field += char;
      }
      continue;
    }
    if (char === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
    } else if (char === delimiter) {
      cells.push(field);
      field = '';
      atFieldStart = true;
    } else if (char === '\n') {
      endRow(index);
      line += 1;
      rowStart = index + 1;
      rowLine = line;
    } else {
      field += char;
      atFieldStart = false;
    }
  }
  if (inQuotes) {
    throw new RuleImportError(`line ${String(rowLine)}: a quoted field is never closed`);
  }
  if (rowStart < text.length) {
    endRow(text.length);
  }
  return rows;
}

/** Text lines with their 1-based numbers, for fixed-width files. A final empty line is dropped. */
export function textLines(text: string): Row[] {
  const lines = text.split('\n').map((raw, index) => {
    const clean = raw.replace(/\r$/, '');
    return { cells: [clean], raw: clean, line: index + 1 };
  });
  if (lines.length > 0 && lines[lines.length - 1]?.raw === '') {
    lines.pop();
  }
  return lines;
}

export function isBlankRow(row: Row): boolean {
  return row.cells.every((cell) => cell.trim() === '');
}

/** Upper case with runs of whitespace collapsed: header labels compare in this form. */
export function normalizeLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim().toUpperCase();
}

export function cell(row: Row, column: number): string {
  return (row.cells[column] ?? '').trim();
}

/** Index of the first row matching `isHeader`, or a RuleImportError naming what was expected. */
export function findHeader(rows: readonly Row[], isHeader: (row: Row) => boolean, expected: string): number {
  const index = rows.findIndex(isHeader);
  if (index === -1) {
    throw new RuleImportError(`no header row found: expected ${expected}`);
  }
  return index;
}

/** The column whose normalized label matches `pattern`, or -1. */
export function findColumn(labels: readonly string[], pattern: RegExp): number {
  return labels.findIndex((label) => pattern.test(label));
}

export function requireColumn(labels: readonly string[], pattern: RegExp, name: string, line: number): number {
  const column = findColumn(labels, pattern);
  if (column === -1) {
    throw new RuleImportError(`line ${String(line)}: no ${name} column among the headers ${JSON.stringify(labels)}`);
  }
  return column;
}

/** Decimal text as the files write it ("0.45", ".45", "1.000"), with a bare leading point completed. */
export function decimalCell(row: Row, column: number, name: string): string {
  const value = cell(row, column);
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) {
    throw new RuleImportError(`line ${String(row.line)}: ${name} ${JSON.stringify(value)} is not a decimal`);
  }
  const completed = value.startsWith('.') ? `0${value}` : value;
  return completed.endsWith('.') ? completed.slice(0, -1) : completed;
}

/** An ISO date from YYYYMMDD, MM/DD/YYYY or YYYY-MM-DD text; empty text is null. */
export function dateCell(row: Row, column: number, name: string): string | null {
  const value = cell(row, column);
  if (value === '') {
    return null;
  }
  let match = /^(\d{4})(\d{2})(\d{2})$/.exec(value) ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    return `${match[1] ?? ''}-${match[2] ?? ''}-${match[3] ?? ''}`;
  }
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (match) {
    return `${match[3] ?? ''}-${(match[1] ?? '').padStart(2, '0')}-${(match[2] ?? '').padStart(2, '0')}`;
  }
  throw new RuleImportError(`line ${String(row.line)}: ${name} ${JSON.stringify(value)} is not a date`);
}

/** The day before an ISO date (an exclusive end date made inclusive). */
export function dayBefore(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
