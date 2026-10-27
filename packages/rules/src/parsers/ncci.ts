import {
  type Row,
  RuleImportError,
  cell,
  dateCell,
  dayBefore,
  findHeader,
  isBlankRow,
  normalizeLabel,
  parseDelimited,
  requireColumn,
} from './delimited';
import type { ImportWindow, ParseOutcome, ParsedRow, RuleFileParser } from './types';

const HCPCS = /^[0-9A-Z]{5}$/;

function code(row: Row, column: number, name: string): string {
  const value = cell(row, column).toUpperCase();
  if (!HCPCS.test(value)) {
    throw new RuleImportError(`line ${String(row.line)}: ${name} ${JSON.stringify(value)} is not an HCPCS code`);
  }
  return value;
}

/**
 * The CMS NCCI practitioner procedure-to-procedure (PTP) edit table, one quarterly file of several
 * (tab-separated text, or CSV), read by the positions of its layout: column 1 code, column 2 code,
 * the prior-to-1996 flag (*), effective date (YYYYMMDD), deletion date (YYYYMMDD, or * for none),
 * the modifier indicator (0 not allowed, 1 allowed, 9 not applicable) and the PTP edit rationale.
 * Copyright lines before the heading row are skipped. An edit's window runs from its effective date
 * to the day before its deletion date; an edit deleted on or before its effective date never applied
 * and is skipped (the import summary counts them).
 */
const PTP_HEADINGS: readonly [column: number, pattern: RegExp, meaning: string][] = [
  [3, /EFFECTIVE/, 'the effective date'],
  [4, /DELETION/, 'the deletion date'],
  [5, /MODIFIER/, 'the modifier indicator'],
];

function parsePtp(text: string): ParseOutcome {
  const rows = parseDelimited(text, text.includes('\t') ? '\t' : ',');
  const at = findHeader(
    rows,
    (row) => /^COLUMN ?1/.test(normalizeLabel(row.cells[0] ?? '')) && /^COLUMN ?2/.test(normalizeLabel(row.cells[1] ?? '')),
    'a heading row starting Column 1, Column 2',
  );
  let dataStart = at + 1;
  while (rows[dataStart] !== undefined && cell(rows[dataStart] as Row, 0) === '' && !isBlankRow(rows[dataStart] as Row)) {
    dataStart += 1;
  }
  const block = rows.slice(at, dataStart);
  for (const [column, pattern, meaning] of PTP_HEADINGS) {
    const label = normalizeLabel(block.map((row) => row.cells[column] ?? '').join(' '));
    if (!pattern.test(label)) {
      throw new RuleImportError(`column ${String(column + 1)} is headed ${JSON.stringify(label)}, not ${meaning}; the PTP layout may have changed`);
    }
  }
  const parsed: ParsedRow[] = [];
  let neverEffective = 0;
  for (const row of rows.slice(dataStart)) {
    if (isBlankRow(row)) {
      continue;
    }
    const where = `line ${String(row.line)}`;
    const column1 = code(row, 0, 'column 1 code');
    const column2 = code(row, 1, 'column 2 code');
    const prior = cell(row, 2);
    if (prior !== '*' && prior !== '') {
      throw new RuleImportError(`${where}: the prior-to-1996 flag ${JSON.stringify(prior)} is neither * nor blank`);
    }
    const effective = dateCell(row, 3, 'effective date');
    if (effective === null) {
      throw new RuleImportError(`${where}: the effective date is required`);
    }
    const deletionText = cell(row, 4);
    const deletion = deletionText === '*' ? null : dateCell(row, 4, 'deletion date');
    const indicator = cell(row, 5);
    if (indicator !== '0' && indicator !== '1' && indicator !== '9') {
      throw new RuleImportError(`${where}: modifier indicator ${JSON.stringify(indicator)} is not 0, 1 or 9`);
    }
    if (deletion !== null && deletion <= effective) {
      neverEffective += 1;
      continue;
    }
    parsed.push({
      key: { column1, column2 },
      value: { modifier_indicator: indicator, rationale: cell(row, 6), in_existence_prior_to_1996: prior === '*' },
      effective_from: effective,
      effective_to: deletion === null ? null : dayBefore(deletion),
      quote: row.raw,
      locator: where,
    });
  }
  if (parsed.length === 0) {
    throw new RuleImportError('the file has a heading row but no edits in effect');
  }
  return {
    rows: parsed,
    notes: neverEffective === 0 ? [] : [`${String(neverEffective)} edit(s) deleted on or before the effective date never applied and were skipped`],
  };
}

export const ncciPtpParser: RuleFileParser = {
  type: 'ncci_ptp',
  parser: 'cms_ncci_ptp_practitioner',
  title: 'CMS NCCI procedure-to-procedure edits, practitioner services',
  reviewQuestions: [
    'Do the columns match the practitioner PTP layout (column 1, column 2, prior-to-1996 flag, effective date, deletion date, modifier indicator, rationale)?',
    "Is this the practitioner table (not the hospital outpatient one), and is every file of the quarter imported, with the previous quarter's drafts removed?",
    'Does the pair 97140 and 97530 carry modifier indicator 1 (a 59 or X modifier allows it), as the rules reference states?',
  ],
  parse: (text) => parsePtp(text),
};

/**
 * The CMS NCCI practitioner services medically unlikely edit (MUE) table (CSV): HCPCS/CPT code,
 * practitioner services MUE value, MUE adjudication indicator ("2 Date of Service Edit: Policy")
 * and MUE rationale, after copyright lines. The quarter's window comes from the import.
 */
function parseMue(text: string, window: ImportWindow): ParseOutcome {
  const rows = parseDelimited(text, text.includes('\t') ? '\t' : ',');
  const at = findHeader(
    rows,
    (row) => /HCPCS|CPT/.test(normalizeLabel(row.cells[0] ?? '')) && row.cells.some((label) => /MUE/.test(normalizeLabel(label))),
    'a heading row starting HCPCS/CPT Code with an MUE column',
  );
  const header = rows[at] as Row;
  const labels = header.cells.map(normalizeLabel);
  const columns = {
    value: requireColumn(labels, /MUE VALUE/, 'MUE value', header.line),
    indicator: requireColumn(labels, /ADJUDICATION/, 'MUE adjudication indicator', header.line),
    rationale: requireColumn(labels, /RATIONALE/, 'MUE rationale', header.line),
  };
  const seen = new Set<string>();
  const parsed: ParsedRow[] = [];
  for (const row of rows.slice(at + 1)) {
    if (isBlankRow(row)) {
      continue;
    }
    const where = `line ${String(row.line)}`;
    const hcpcs = code(row, 0, 'code');
    if (seen.has(hcpcs)) {
      throw new RuleImportError(`${where}: ${hcpcs} appears twice`);
    }
    seen.add(hcpcs);
    const mue = cell(row, columns.value);
    if (!/^\d{1,4}$/.test(mue)) {
      throw new RuleImportError(`${where}: MUE value ${JSON.stringify(mue)} is not a whole number of units`);
    }
    const indicator = /^([123])\b/.exec(cell(row, columns.indicator))?.[1];
    if (indicator === undefined) {
      throw new RuleImportError(`${where}: the adjudication indicator does not start with 1, 2 or 3`);
    }
    parsed.push({
      key: { hcpcs },
      value: { mue: Number.parseInt(mue, 10), adjudication_indicator: indicator, rationale: cell(row, columns.rationale) },
      effective_from: window.effectiveFrom,
      effective_to: window.effectiveTo,
      quote: row.raw,
      locator: where,
    });
  }
  if (parsed.length === 0) {
    throw new RuleImportError('the file has a heading row but no codes');
  }
  return { rows: parsed, notes: [] };
}

export const ncciMueParser: RuleFileParser = {
  type: 'ncci_mue',
  parser: 'cms_ncci_mue_practitioner',
  title: 'CMS NCCI medically unlikely edits, practitioner services',
  reviewQuestions: [
    "Is this the practitioner services MUE table of the quarter the file states, imported for exactly that quarter, with every earlier quarter's MUE draft kept?",
    'Spot-check the MUE values and adjudication indicators of the therapy codes against the stored file.',
  ],
  parse: parseMue,
};
