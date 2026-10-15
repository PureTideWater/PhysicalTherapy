import { type Row, RuleImportError, cell, dateCell, findColumn, findHeader, isBlankRow, normalizeLabel, parseDelimited, requireColumn } from './delimited';
import type { ImportWindow, ParseOutcome, ParsedRow, RuleFileParser } from './types';

/**
 * An X12 external code list export (claim adjustment reason codes, remittance advice remark codes
 * or claim status codes) as CSV: a heading row with Code and Description, and where the export has
 * them, Start, Last Modified, Stop (or Deactivation) and Notes. Dates may be MM/DD/YYYY, YYYYMMDD or
 * YYYY-MM-DD. A code's window runs from its start date (or the import's start when the export
 * gives none) to its stop date, when it has one.
 */
function parse(text: string, window: ImportWindow): ParseOutcome {
  const rows = parseDelimited(text, ',');
  const at = findHeader(rows, (row) => row.cells.some((label) => normalizeLabel(label) === 'CODE'), 'a heading row with a Code column');
  const header = rows[at] as Row;
  const labels = header.cells.map(normalizeLabel);
  const columns = {
    code: requireColumn(labels, /^CODE$/, 'code', header.line),
    description: requireColumn(labels, /DESCRIPTION/, 'description', header.line),
    start: findColumn(labels, /START/),
    modified: findColumn(labels, /MODIFIED/),
    stop: findColumn(labels, /STOP|DEACTIVAT/),
    notes: findColumn(labels, /NOTE/),
  };
  const optionalDate = (row: Row, column: number, name: string) => (column === -1 ? null : dateCell(row, column, name));
  const seen = new Set<string>();
  const parsed: ParsedRow[] = [];
  for (const row of rows.slice(at + 1)) {
    if (isBlankRow(row)) {
      continue;
    }
    const where = `line ${String(row.line)}`;
    const code = cell(row, columns.code).toUpperCase();
    if (!/^[0-9A-Z]{1,6}$/.test(code)) {
      throw new RuleImportError(`${where}: ${JSON.stringify(code)} is not a code`);
    }
    if (seen.has(code)) {
      throw new RuleImportError(`${where}: code ${code} appears twice`);
    }
    seen.add(code);
    const description = cell(row, columns.description);
    if (description === '') {
      throw new RuleImportError(`${where}: code ${code} has no description`);
    }
    const start = optionalDate(row, columns.start, 'start date');
    const stop = optionalDate(row, columns.stop, 'stop date');
    parsed.push({
      key: { code },
      value: {
        description,
        start_date: start,
        last_modified: optionalDate(row, columns.modified, 'last modified date'),
        stop_date: stop,
        notes: columns.notes === -1 ? '' : cell(row, columns.notes),
      },
      effective_from: start ?? window.effectiveFrom,
      effective_to: stop,
      quote: row.raw,
      locator: where,
    });
  }
  if (parsed.length === 0) {
    throw new RuleImportError('the export has a heading row but no codes');
  }
  return { rows: parsed, notes: [] };
}

const REVIEW_QUESTIONS = [
  'Is the export the complete list as of the retrieved date, including deactivated codes with their stop dates, and was the previous export\'s draft removed?',
  'Do the columns the parser read (code, description, start, last modified, stop, notes) match the export\'s headings, and is a code still usable on its stop date?',
];

export const carcParser: RuleFileParser = {
  type: 'carc',
  parser: 'x12_code_list',
  title: 'X12 claim adjustment reason codes (CARC)',
  reviewQuestions: REVIEW_QUESTIONS,
  parse,
};

export const rarcParser: RuleFileParser = {
  type: 'rarc',
  parser: 'x12_code_list',
  title: 'X12 remittance advice remark codes (RARC)',
  reviewQuestions: REVIEW_QUESTIONS,
  parse,
};

export const claimStatusCodeParser: RuleFileParser = {
  type: 'claim_status_code',
  parser: 'x12_code_list',
  title: 'X12 claim status codes',
  reviewQuestions: REVIEW_QUESTIONS,
  parse,
};
