import { type Row, RuleImportError, cell, decimalCell, isBlankRow, normalizeLabel, parseDelimited } from './delimited';
import { cmsQuarterOf } from '../schema';
import type { ImportWindow, ParseOutcome, ParsedRow, RuleFileParser } from './types';

/**
 * The CMS physician fee schedule relative value file (PPRRVU, CSV version), read by the column
 * positions of its documented record layout (RVUPUF): HCPCS, MOD, DESCRIPTION, STATUS CODE, NOT
 * USED FOR MEDICARE PAYMENT, WORK RVU, NON-FAC PE RVU, NON-FAC NA INDICATOR, FACILITY PE RVU,
 * FACILITY NA INDICATOR, MP RVU, NON-FACILITY TOTAL, FACILITY TOTAL, PCTC IND, GLOB DAYS, PRE OP,
 * INTRA OP, POST OP, MULT PROC, and further columns this record does not need.
 *
 * The file opens with title and copyright lines and its column headings may be split over several
 * rows; the heading row is the one that starts with HCPCS. Every column used is checked against its
 * heading, so a changed layout stops the import instead of shifting values into the wrong field.
 * Descriptions are not copied into records (the stored source keeps them).
 */
const COLUMNS = {
  hcpcs: 0,
  modifier: 1,
  status: 3,
  work: 5,
  peNonFacility: 6,
  nonFacilityNa: 7,
  peFacility: 8,
  facilityNa: 9,
  mp: 10,
  pctc: 13,
  globalDays: 14,
  multipleProcedure: 18,
} as const;

const HEADINGS: readonly [column: number, pattern: RegExp, meaning: string][] = [
  [COLUMNS.hcpcs, /^HCPCS/, 'the HCPCS code'],
  [COLUMNS.modifier, /^MOD/, 'the modifier'],
  [COLUMNS.status, /STATUS|CODE/, 'the status code'],
  [COLUMNS.work, /WORK/, 'the work RVU'],
  [COLUMNS.peNonFacility, /NON.?FAC.*PE|PE.*NON.?FAC/, 'the non-facility practice-expense RVU'],
  [COLUMNS.nonFacilityNa, /NON.?FAC.*\bNA\b|\bNA\b.*NON.?FAC/, 'the non-facility NA indicator'],
  [COLUMNS.peFacility, /^(?!.*NON).*FAC.*PE|^(?!.*NON).*PE.*FAC/, 'the facility practice-expense RVU'],
  [COLUMNS.facilityNa, /^(?!.*NON).*\bNA\b/, 'the facility NA indicator'],
  [COLUMNS.mp, /\bMP\b|MALPRACTICE/, 'the malpractice RVU'],
  [COLUMNS.pctc, /PCTC/, 'the PC/TC indicator'],
  [COLUMNS.globalDays, /GLOB/, 'the global days'],
  [COLUMNS.multipleProcedure, /MULT/, 'the multiple-procedure indicator'],
];

const MAX_HEADING_ROWS = 3;

/** The heading block: the HCPCS row plus the adjacent rows that continue its headings. */
function headingBlock(rows: readonly Row[]): { labels: string[]; dataStart: number } {
  const at = rows.findIndex((row) => normalizeLabel(row.cells[0] ?? '') === 'HCPCS');
  if (at === -1) {
    throw new RuleImportError('no heading row starting with HCPCS; is this the PPRRVU file?');
  }
  const continues = (row: Row | undefined) => row !== undefined && cell(row, 0) === '' && !isBlankRow(row);
  let first = at;
  while (first > 0 && at - first < MAX_HEADING_ROWS && continues(rows[first - 1])) {
    first -= 1;
  }
  let last = at;
  while (last - at < MAX_HEADING_ROWS && continues(rows[last + 1])) {
    last += 1;
  }
  const block = rows.slice(first, last + 1);
  const width = Math.max(...block.map((row) => row.cells.length));
  const labels = Array.from({ length: width }, (_, column) =>
    normalizeLabel(block.map((row) => row.cells[column] ?? '').join(' ')),
  );
  return { labels, dataStart: last + 1 };
}

function naIndicator(row: Row, column: number, name: string): boolean {
  const value = cell(row, column).toUpperCase();
  if (value === 'NA') {
    return true;
  }
  if (value === '') {
    return false;
  }
  throw new RuleImportError(`line ${String(row.line)}: ${name} ${JSON.stringify(value)} is neither NA nor blank`);
}

function matching(row: Row, column: number, pattern: RegExp, name: string): string {
  const value = cell(row, column).toUpperCase();
  if (!pattern.test(value)) {
    throw new RuleImportError(`line ${String(row.line)}: ${name} ${JSON.stringify(value)} does not fit the layout`);
  }
  return value;
}

function parse(text: string, window: ImportWindow): ParseOutcome {
  const rows = parseDelimited(text, ',');
  const { labels, dataStart } = headingBlock(rows);
  // The file's quarterly release follows from its window: RVU26A is effective January 1 (quarter
  // A), RVU26B April 1 (B), and so on. A window that does not start in the file's year is refused.
  if (!window.effectiveFrom.startsWith(`${String(window.year)}-`)) {
    throw new RuleImportError(`--effective-from ${window.effectiveFrom} is not in ${String(window.year)}, the fee schedule year of this file`);
  }
  const quarter = cmsQuarterOf(window.effectiveFrom);
  for (const [column, pattern, meaning] of HEADINGS) {
    if (!pattern.test(labels[column] ?? '')) {
      throw new RuleImportError(
        `column ${String(column + 1)} is headed ${JSON.stringify(labels[column] ?? '')}, not ${meaning}; the PPRRVU layout may have changed (check the RVUPUF record layout)`,
      );
    }
  }
  const seen = new Set<string>();
  const parsed: ParsedRow[] = [];
  for (const row of rows.slice(dataStart)) {
    if (isBlankRow(row)) {
      continue;
    }
    const hcpcs = matching(row, COLUMNS.hcpcs, /^[0-9A-Z]{5}$/, 'HCPCS');
    const modifier = matching(row, COLUMNS.modifier, /^(?:[0-9A-Z]{2})?$/, 'modifier');
    const identity = `${hcpcs}-${modifier}`;
    if (seen.has(identity)) {
      throw new RuleImportError(`line ${String(row.line)}: HCPCS ${hcpcs} with modifier ${JSON.stringify(modifier)} appears twice`);
    }
    seen.add(identity);
    parsed.push({
      key: { hcpcs, modifier },
      value: {
        status: matching(row, COLUMNS.status, /^[A-Z]$/, 'status code'),
        work_rvu: decimalCell(row, COLUMNS.work, 'work RVU'),
        pe_rvu_non_facility: decimalCell(row, COLUMNS.peNonFacility, 'non-facility PE RVU'),
        pe_rvu_facility: decimalCell(row, COLUMNS.peFacility, 'facility PE RVU'),
        mp_rvu: decimalCell(row, COLUMNS.mp, 'MP RVU'),
        non_facility_pe_na: naIndicator(row, COLUMNS.nonFacilityNa, 'non-facility NA indicator'),
        facility_pe_na: naIndicator(row, COLUMNS.facilityNa, 'facility NA indicator'),
        pctc_indicator: matching(row, COLUMNS.pctc, /^\d?$/, 'PC/TC indicator'),
        global_days: matching(row, COLUMNS.globalDays, /^(?:\d{3}|[A-Z]{3})?$/, 'global days'),
        multiple_procedure_indicator: matching(row, COLUMNS.multipleProcedure, /^\d?$/, 'multiple-procedure indicator'),
        year: window.year,
        quarter,
      },
      effective_from: window.effectiveFrom,
      effective_to: window.effectiveTo,
      quote: row.raw,
      locator: `line ${String(row.line)}`,
    });
  }
  if (parsed.length === 0) {
    throw new RuleImportError('the file has a heading row but no codes');
  }
  return { rows: parsed, notes: [`fee schedule year ${String(window.year)}, quarter ${quarter} (from the window starting ${window.effectiveFrom})`] };
}

export const pprrvuParser: RuleFileParser = {
  type: 'pfs_rvu',
  parser: 'cms_pprrvu',
  title: 'CMS physician fee schedule relative value file (PPRRVU)',
  reviewQuestions: [
    'Do the columns the parser checked (HCPCS, MOD, status, work RVU, non-facility and facility PE RVU with their NA indicators, MP RVU, PC/TC, global days, multiple procedure) match the RVUPUF record layout shipped with this file?',
    'Spot-check at least five codes, including 97110, 97140 and 97530, against the stored file and the CMS physician fee schedule look-up.',
    "Is the effective window the quarter of this file's release (January, April, July or October), or, for a correction CMS made inside the quarter, the part of that quarter the file is in force for, so the year and quarter (A to D) on every record match the file's name (RVU26A, RVU26B, ...), with every earlier quarter's draft kept as it is?",
  ],
  parse,
};
