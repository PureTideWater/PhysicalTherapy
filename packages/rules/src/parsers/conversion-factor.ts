import { containsNumber } from '../records';
import { RuleImportError, cell, dateCell, decimalCell, findHeader, isBlankRow, normalizeLabel, parseDelimited } from './delimited';
import type { ImportWindow, ParseOutcome, ParsedRow, RuleFileParser } from './types';

/**
 * The conversion factors, from a small CSV a reviewer prepares from the year's final rule (the
 * final rule is prose in the Federal Register, not a table). Its layout is fixed here:
 *
 *   applicability,conversion_factor,effective_from,effective_to,citation,quote
 *   non_qualifying_apm,<factor>,<YYYY-MM-DD>,<YYYY-MM-DD or blank>,<FR volume and page>,<the sentence>
 *
 * `applicability` is qualifying_apm or non_qualifying_apm; `quote` is the final rule's sentence
 * stating the factor, which must contain the factor exactly as typed. Because a person types this
 * file, it is prepared twice independently and imported with --second-pass; the two must agree.
 */
export const CONVERSION_FACTOR_HEADINGS = ['APPLICABILITY', 'CONVERSION_FACTOR', 'EFFECTIVE_FROM', 'EFFECTIVE_TO', 'CITATION', 'QUOTE'];

function parse(text: string, window: ImportWindow): ParseOutcome {
  const rows = parseDelimited(text, ',');
  const at = findHeader(rows, (row) => normalizeLabel(row.cells[0] ?? '') === 'APPLICABILITY', 'applicability,conversion_factor,...');
  const header = rows[at];
  const labels = (header?.cells ?? []).map(normalizeLabel);
  if (labels.join(',') !== CONVERSION_FACTOR_HEADINGS.join(',')) {
    throw new RuleImportError(`line ${String(header?.line ?? 0)}: the headings must be exactly ${CONVERSION_FACTOR_HEADINGS.join(',').toLowerCase()}`);
  }
  const parsed: ParsedRow[] = [];
  for (const row of rows.slice(at + 1)) {
    if (isBlankRow(row)) {
      continue;
    }
    const where = `line ${String(row.line)}`;
    const applicability = cell(row, 0);
    if (applicability !== 'qualifying_apm' && applicability !== 'non_qualifying_apm') {
      throw new RuleImportError(`${where}: applicability ${JSON.stringify(applicability)} is not qualifying_apm or non_qualifying_apm`);
    }
    const factor = decimalCell(row, 1, 'conversion factor');
    const effectiveFrom = dateCell(row, 2, 'effective_from');
    if (effectiveFrom === null) {
      throw new RuleImportError(`${where}: effective_from is required`);
    }
    if (!effectiveFrom.startsWith(`${String(window.year)}-`)) {
      throw new RuleImportError(`${where}: effective_from ${effectiveFrom} is not in ${String(window.year)}`);
    }
    const citation = cell(row, 4);
    const quote = cell(row, 5);
    if (citation === '' || quote === '') {
      throw new RuleImportError(`${where}: the citation and the final rule's quote are required`);
    }
    if (!containsNumber(quote, factor)) {
      throw new RuleImportError(`${where}: the quote does not contain the factor ${factor} as typed, as a number of its own`);
    }
    parsed.push({
      key: { applicability },
      value: { conversion_factor: factor, citation },
      effective_from: effectiveFrom,
      effective_to: dateCell(row, 3, 'effective_to'),
      quote: row.raw,
      locator: where,
      note: `Final rule (${citation}): "${quote}"`,
    });
  }
  if (parsed.length === 0) {
    throw new RuleImportError('the file has a heading row but no conversion factors');
  }
  return { rows: parsed, notes: [] };
}

/** Differences between two independent preparations of the conversion-factor CSV (empty when they agree). */
export function compareConversionFactorPasses(first: readonly ParsedRow[], second: readonly ParsedRow[]): string[] {
  const describe = (row: ParsedRow) =>
    `${String(row.key.applicability)} ${String(row.value.conversion_factor)} from ${row.effective_from} to ${row.effective_to ?? 'open'}`;
  const a = first.map(describe).sort();
  const b = second.map(describe).sort();
  const differences = [
    ...a.filter((line) => !b.includes(line)).map((line) => `only in the first pass: ${line}`),
    ...b.filter((line) => !a.includes(line)).map((line) => `only in the second pass: ${line}`),
  ];
  return differences;
}

export const conversionFactorParser: RuleFileParser = {
  type: 'conversion_factor',
  parser: 'final_rule_conversion_factor_csv',
  title: 'Physician fee schedule conversion factors, prepared from the final rule',
  reviewQuestions: [
    'Does each quote appear on the cited Federal Register page of the final rule, stating the same factor?',
    'Do the effective dates match the final rule, and has any correction notice changed a factor since?',
    'Were the two CSVs prepared independently, by two people or in two sittings without looking at the first?',
  ],
  parse,
};
