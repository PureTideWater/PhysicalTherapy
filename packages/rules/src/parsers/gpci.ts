import { type Row, RuleImportError, cell, decimalCell, findHeader, isBlankRow, normalizeLabel, parseDelimited, requireColumn } from './delimited';
import type { ParseOutcome, ParsedRow, RuleFileParser } from './types';

/**
 * The CMS geographic practice cost index file (GPCI, CSV), one row per payment locality:
 * Medicare Administrative Contractor (MAC), state, locality number, locality name, and the work
 * (PW), practice-expense (PE) and malpractice (MP) GPCIs for the year. Columns are found by their
 * headings, which carry the year ("2026 PW GPCI (with 1.0 Floor)"). Title lines before the heading
 * row are skipped; footnote lines after the last locality end the table.
 */
const MAC = /CONTRACTOR|\bMAC\b|CARRIER/;
const STATE = /^STATE$/;
const LOCALITY_NUMBER = /^LOCALITY$|LOCALITY (?:NUMBER|NO\b|#|CODE)/;
const LOCALITY_NAME = /LOCALITY NAME/;
const WORK = /(?:\bPW\b|WORK).*GPCI|GPCI.*(?:\bPW\b|WORK)/;
const PE = /\bPE\b.*GPCI|GPCI.*\bPE\b/;
const MP = /\bMP\b.*GPCI|GPCI.*\bMP\b|MALPRACTICE/;

function parse(text: string, window: { effectiveFrom: string; effectiveTo: string | null }): ParseOutcome {
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
    work: requireColumn(labels, WORK, 'work (PW) GPCI', header.line),
    pe: requireColumn(labels, PE, 'practice-expense GPCI', header.line),
    mp: requireColumn(labels, MP, 'malpractice GPCI', header.line),
  };
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
    });
  }
  if (parsed.length === 0) {
    throw new RuleImportError('the file has a heading row but no localities');
  }
  return { rows: parsed, notes: tableEndedAt === undefined ? [] : [`notes after the table (from line ${String(tableEndedAt)}) were not read as localities`] };
}

export const gpciParser: RuleFileParser = {
  type: 'pfs_gpci',
  parser: 'cms_gpci',
  title: 'CMS geographic practice cost index file (GPCI)',
  reviewQuestions: [
    'Do the MAC, locality and three GPCI columns the parser chose match the headings for this year (the work GPCI with the floor the year applies)?',
    'Do the localities of every practice in scope appear, with indices matching the stored file?',
  ],
  parse,
};
