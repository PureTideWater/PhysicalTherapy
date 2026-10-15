import { type Row, RuleImportError, cell, findColumn, findHeader, isBlankRow, normalizeLabel, parseDelimited } from './delimited';
import type { ParseOutcome, ParsedRow, RuleFileParser } from './types';

/**
 * The CMS therapy MPPR rate file: the codes subject to the multiple procedure payment reduction
 * for "always therapy" services. The parser reads the code column (headed HCPCS or CPT) and, when
 * the file has them, a modifier column and a practice-expense reduction share column (headed with
 * REDUCTION, PERCENT or %). Other columns, such as reduced amounts per locality, are not read: the
 * engine computes the reduction from the RVU and GPCI records and the reduction percentage.
 *
 * A file with one row per code and locality repeats each code; repeats are folded into one record
 * per code and modifier, and must agree on the share.
 */
const CODE = /\bHCPCS\b|\bCPT\b/;
const MODIFIER = /^MOD/;
const REDUCTION = /REDUC|PERCENT|%/;

function reductionShare(row: Row, column: number): string | null {
  if (column === -1) {
    return null;
  }
  const value = cell(row, column).replace(/%$/, '').trim();
  if (value === '') {
    return null;
  }
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    throw new RuleImportError(`line ${String(row.line)}: reduction share ${JSON.stringify(value)} is not a percentage`);
  }
  return value;
}

function parse(text: string, window: { effectiveFrom: string; effectiveTo: string | null }): ParseOutcome {
  const rows = parseDelimited(text, ',');
  const at = findHeader(rows, (row) => row.cells.some((label) => CODE.test(normalizeLabel(label))), 'a heading row with an HCPCS or CPT column');
  const header = rows[at] as Row;
  const labels = header.cells.map(normalizeLabel);
  const columns = {
    code: findColumn(labels, CODE),
    modifier: findColumn(labels, MODIFIER),
    reduction: findColumn(labels, REDUCTION),
  };
  const byCode = new Map<string, ParsedRow>();
  let repeats = 0;
  for (const row of rows.slice(at + 1)) {
    if (isBlankRow(row)) {
      continue;
    }
    const hcpcs = cell(row, columns.code).toUpperCase();
    if (!/^[0-9A-Z]{5}$/.test(hcpcs)) {
      throw new RuleImportError(`line ${String(row.line)}: ${JSON.stringify(hcpcs)} is not an HCPCS code`);
    }
    const modifier = columns.modifier === -1 ? '' : cell(row, columns.modifier).toUpperCase();
    if (!/^(?:[0-9A-Z]{2})?$/.test(modifier)) {
      throw new RuleImportError(`line ${String(row.line)}: modifier ${JSON.stringify(modifier)} is not a modifier`);
    }
    const share = reductionShare(row, columns.reduction);
    const identity = `${hcpcs}-${modifier}`;
    const earlier = byCode.get(identity);
    if (earlier) {
      if (earlier.value.pe_reduction_percent !== share) {
        throw new RuleImportError(`line ${String(row.line)}: ${hcpcs} has a reduction share that differs from its ${earlier.locator}`);
      }
      repeats += 1;
      continue;
    }
    byCode.set(identity, {
      key: { hcpcs, modifier },
      value: { pe_reduction_percent: share },
      effective_from: window.effectiveFrom,
      effective_to: window.effectiveTo,
      quote: row.raw,
      locator: `line ${String(row.line)}`,
    });
  }
  if (byCode.size === 0) {
    throw new RuleImportError('the file has a heading row but no codes');
  }
  return {
    rows: [...byCode.values()],
    notes: repeats === 0 ? [] : [`${String(repeats)} row(s) repeated a code already read (for example one row per locality) and were folded into its record`],
  };
}

export const mpprParser: RuleFileParser = {
  type: 'mppr_rate',
  parser: 'cms_therapy_mppr',
  title: 'CMS therapy multiple procedure payment reduction (MPPR) rate file',
  reviewQuestions: [
    "Which columns does the real file carry? The parser read the code, and a modifier and a reduction-share column only when present; confirm nothing it skipped changes a code's reduction.",
    'Does the code list match the always-therapy codes on the CMS therapy services page, including 97026 (added to the file February 24, 2026)?',
  ],
  parse,
};
