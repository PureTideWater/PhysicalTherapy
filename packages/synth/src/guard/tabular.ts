/**
 * The marker rule for a tabular fixture (docs/adr/0059, D14 option a): the file's header row names an
 * identifier column, and that column holds exactly SYNTHSENDER in every data row. One reading for the
 * writer, the hook and the repository check (packages/synth/src/write.ts assertSyntheticFixture).
 *
 * A CSV is comma-separated and a TSV tab-separated, both read as RFC 4180 has it: a field in double
 * quotes may hold the separator, a quote (doubled) or a line break; CRLF or LF ends a row; the text is
 * UTF-8, a byte-order mark ignored. A row whose cells are all empty is blank and skipped, as the
 * ledger's reader skips it, so the header is the first row that is not blank.
 *
 * What a problem says names the rule, never a cell's value: a refused file may be a real export.
 */
import { SYNTH_SENDER_ID } from '../identity';

export type Separator = ',' | '\t';

export class TableReadError extends Error {
  override readonly name = 'TableReadError';
}

/** The rows of a CSV or TSV text, blank rows included. Throws TableReadError on a quote never closed or text after a closing quote. */
export function readTable(text: string, separator: Separator): string[][] {
  const source = text.startsWith('\uFEFF') ? text.slice(1) : text;
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
    rows.push(row);
    row = [];
  };
  for (let index = 0; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (source.charAt(index + 1) === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = false;
        closed = true;
      }
      continue;
    }
    if (char === separator) {
      endField();
    } else if (char === '\n' || char === '\r') {
      endRow();
      if (char === '\r' && source.charAt(index + 1) === '\n') {
        index += 1;
      }
    } else if (closed) {
      throw new TableReadError('text follows a closing quote');
    } else if (char === '"' && field === '') {
      quoted = true;
    } else {
      field += char;
    }
  }
  if (quoted) {
    throw new TableReadError('a quoted field is never closed');
  }
  if (row.length > 0 || closed || field !== '') {
    endRow();
  }
  return rows;
}

/** The words of a header: camelCase and PascalCase split, lower-cased, on any run of other characters. */
function headerWords(header: string): string[] {
  return header
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '');
}

/**
 * An identifier column: its header has the word "ID" or "identifier" in it (Payee ID, payee_id, SenderId,
 * Originator ID, Payer ID). "Paid" or "Idaho" is not one.
 */
export function isIdentifierHeader(header: string): boolean {
  return headerWords(header).some((word) => word === 'id' || word === 'identifier');
}

const isBlank = (row: readonly string[]) => row.every((cell) => cell.trim() === '');

export interface MarkerOptions {
  /**
   * The column the vendor format registry names for the marker (its payee or sender ID column), matched
   * as the ledger matches a template's header: trimmed and in any case. Absent, any identifier column.
   */
  readonly markerColumn?: string;
}

/**
 * Null when the table carries the marker; otherwise the rule it breaks. Rows are a sheet's or a file's,
 * blank rows included.
 */
export function markerProblem(table: readonly (readonly string[])[], options: MarkerOptions = {}): string | null {
  const rows = table.filter((row) => !isBlank(row));
  const [header, ...data] = rows;
  if (header === undefined) {
    return 'it has no header row';
  }
  if (data.length === 0) {
    return 'it has a header and no data row';
  }
  const carries = (column: number) => data.every((row) => row[column] === SYNTH_SENDER_ID);
  if (options.markerColumn !== undefined) {
    const wanted = options.markerColumn.trim().toLowerCase();
    const column = header.findIndex((name) => name.trim().toLowerCase() === wanted);
    if (column < 0) {
      return `its header has no "${options.markerColumn}" column, the one its vendor format names for the marker`;
    }
    return carries(column) ? null : `its "${options.markerColumn}" column does not hold ${SYNTH_SENDER_ID} in every data row`;
  }
  const identifiers = header.flatMap((name, column) => (name.trim() !== '' && isIdentifierHeader(name) ? [column] : []));
  if (identifiers.length === 0) {
    return 'no column of its header is an identifier column';
  }
  return identifiers.some(carries) ? null : `no identifier column holds ${SYNTH_SENDER_ID} in every data row`;
}
