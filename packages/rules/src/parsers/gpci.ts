import { type Row, RuleImportError, cell, decimalCell, findHeader, isBlankRow, matchingColumns, normalizeLabel, parseDelimited, requireColumn } from './delimited';
import type { ImportWindow, ParseOptions, ParseOutcome, ParsedRow, RuleFileParser } from './types';

/**
 * The CMS geographic practice cost index file (GPCI, CSV), one row per payment locality:
 * Medicare Administrative Contractor (MAC), state, locality number, locality name, and the work
 * (PW), practice-expense (PE) and malpractice (MP) GPCIs for the year. Columns are found by their
 * headings, which carry the year ("2026 PW GPCI (with 1.0 Floor)"). Title lines before the heading
 * row are skipped; footnote lines after the last locality end the table.
 *
 * A heading that matches more than one column is refused, never resolved by taking the first. In
 * years when the file carries the work GPCI both with and without the 1.0 floor, the person
 * importing it says which applies (`--gpci-floor with|without`), and every record names the
 * heading its work GPCI was read from.
 */
const MAC = /CONTRACTOR|\bMAC\b|CARRIER/;
const STATE = /^STATE$/;
const LOCALITY_NUMBER = /^LOCALITY$|LOCALITY (?:NUMBER|NO\b|#|CODE)/;
const LOCALITY_NAME = /LOCALITY NAME/;
const WORK = /(?:\bPW\b|WORK).*GPCI|GPCI.*(?:\bPW\b|WORK)/;
const PE = /\bPE\b.*GPCI|GPCI.*\bPE\b/;
const MP = /\bMP\b.*GPCI|GPCI.*\bMP\b|MALPRACTICE/;
const WITHOUT_FLOOR = /WITHOUT.*FLOOR|NO.*FLOOR/;
const WITH_FLOOR = /WITH\b.*FLOOR/;

function floorOf(label: string): 'with' | 'without' | undefined {
  if (WITHOUT_FLOOR.test(label)) {
    return 'without';
  }
  return WITH_FLOOR.test(label) ? 'with' : undefined;
}

/** The work GPCI column: the only one, or the one with the floor the person chose. */
function workColumn(labels: readonly string[], line: number, floor: ParseOptions['gpciWorkFloor']): number {
  const candidates = matchingColumns(labels, WORK);
  const named = candidates.map((column) => JSON.stringify(labels[column] ?? '')).join(', ');
  if (candidates.length > 1) {
    if (floor === undefined) {
      throw new RuleImportError(
        `line ${String(line)}: the file has more than one work GPCI column (${named}); say which applies with --gpci-floor with or --gpci-floor without`,
      );
    }
    const chosen = candidates.filter((column) => floorOf(labels[column] ?? '') === floor);
    if (chosen.length !== 1) {
      throw new RuleImportError(`line ${String(line)}: no single work GPCI column is ${floor} the 1.0 floor among ${named}`);
    }
    return chosen[0] ?? -1;
  }
  const column = requireColumn(labels, WORK, 'work (PW) GPCI', line);
  const stated = floorOf(labels[column] ?? '');
  if (floor !== undefined && stated !== undefined && stated !== floor) {
    throw new RuleImportError(`line ${String(line)}: --gpci-floor ${floor} was given, but the only work GPCI column is headed ${named}`);
  }
  return column;
}

function parse(text: string, window: ImportWindow, options: ParseOptions = {}): ParseOutcome {
  const rows = parseDelimited(text, ',');
  const labelsOf = (row: Row) => row.cells.map(normalizeLabel);
  const at = findHeader(
    rows,
    (row) => labelsOf(row).some((label) => /LOCALITY/.test(label)) && labelsOf(row).some((label) => /GPCI/.test(label)),
    'a heading row naming the locality and the GPCI columns',
  );
  const header = rows[at] as Row;
  const labels = labelsOf(header);
  const columns = {
    mac: requireColumn(labels, MAC, 'MAC (contractor)', header.line),
    state: requireColumn(labels, STATE, 'state', header.line),
    locality: requireColumn(labels, LOCALITY_NUMBER, 'locality number', header.line),
    name: requireColumn(labels, LOCALITY_NAME, 'locality name', header.line),
    work: workColumn(labels, header.line, options.gpciWorkFloor),
    pe: requireColumn(labels, PE, 'practice-expense GPCI', header.line),
    mp: requireColumn(labels, MP, 'malpractice GPCI', header.line),
  };
  const workHeading = (header.cells[columns.work] ?? '').trim();
  const workNote = `work GPCI read from the column headed ${JSON.stringify(workHeading)}`;
  const indexCells = [columns.work, columns.pe, columns.mp];
  const seen = new Set<string>();
  const parsed: ParsedRow[] = [];
  let tableEndedAt: number | undefined;
  for (const row of rows.slice(at + 1)) {
    if (isBlankRow(row)) {
      continue;
    }
    const hasIndices = indexCells.some((column) => cell(row, column) !== '');
    const mac = cell(row, columns.mac);
    if (!/^\d{5}$/.test(mac)) {
      if (hasIndices) {
        throw new RuleImportError(`line ${String(row.line)}: MAC ${JSON.stringify(mac)} is not a five-digit contractor number`);
      }
      tableEndedAt ??= row.line;
      continue;
    }
    if (tableEndedAt !== undefined) {
      throw new RuleImportError(`line ${String(row.line)}: a locality row after the notes that began on line ${String(tableEndedAt)}`);
    }
    const localityNumber = cell(row, columns.locality);
    if (!/^\d{1,2}$/.test(localityNumber)) {
      throw new RuleImportError(`line ${String(row.line)}: locality ${JSON.stringify(localityNumber)} is not a locality number`);
    }
    const locality = localityNumber.padStart(2, '0');
    if (seen.has(`${mac}-${locality}`)) {
      throw new RuleImportError(`line ${String(row.line)}: MAC ${mac} locality ${locality} appears twice`);
    }
    seen.add(`${mac}-${locality}`);
    parsed.push({
      key: { carrier: mac, locality },
      value: {
        state: cell(row, columns.state),
        locality_name: cell(row, columns.name),
        work_gpci: decimalCell(row, columns.work, 'work GPCI'),
        pe_gpci: decimalCell(row, columns.pe, 'PE GPCI'),
        mp_gpci: decimalCell(row, columns.mp, 'MP GPCI'),
      },
      effective_from: window.effectiveFrom,
      effective_to: window.effectiveTo,
      quote: row.raw,
      locator: `line ${String(row.line)}`,
      note: workNote,
    });
  }
  if (parsed.length === 0) {
    throw new RuleImportError('the file has a heading row but no localities');
  }
  return {
    rows: parsed,
    notes: [workNote, ...(tableEndedAt === undefined ? [] : [`notes after the table (from line ${String(tableEndedAt)}) were not read as localities`])],
  };
}

export const gpciParser: RuleFileParser = {
  type: 'pfs_gpci',
  parser: 'cms_gpci',
  title: 'CMS geographic practice cost index file (GPCI)',
  reviewQuestions: [
    'Do the MAC, locality and three GPCI columns the parser chose match the headings for this year? Each record names the heading its work GPCI came from: is that the work GPCI (with or without the 1.0 floor) that Medicare applies in this year?',
    'Do the localities of every practice in scope appear, with indices matching the stored file?',
  ],
  parse,
};
