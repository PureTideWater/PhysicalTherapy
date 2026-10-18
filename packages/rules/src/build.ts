import { RuleImportError } from './parsers/delimited';
import type { ParsedRow, RuleFileParser } from './parsers/types';
import { findOverlaps, recordLabel } from './records';
import { type RuleRecord, parseRuleRecord } from './schema';

/** Where parsed records come from: the stored copy of a public file. */
export interface ParsedSource {
  readonly title: string;
  readonly url: string | null;
  /** Repository-relative path of the stored file. */
  readonly path: string;
  readonly retrieved: string;
  readonly sha256: string;
  readonly synthetic: boolean;
}

export interface BuildRequest {
  readonly parser: RuleFileParser;
  readonly rows: readonly ParsedRow[];
  readonly source: ParsedSource;
  /** Who script-checked the records (L1) and when. */
  readonly checkedBy: string;
  readonly checkedOn: string;
}

const SHOWN_PROBLEMS = 20;

/**
 * Turns a parser's rows into rule records at verification L1, each quoting its source row, and
 * validates every record against the schema (ranges included) and the set against overlapping
 * windows. Any problem refuses the whole file: a partial import would look complete.
 */
export function buildParsedRecords(request: BuildRequest): RuleRecord[] {
  const { parser, source } = request;
  const records: RuleRecord[] = [];
  const problems: string[] = [];
  for (const row of request.rows) {
    const result = parseRuleRecord({
      record_type: parser.type,
      key: row.key,
      value: row.value,
      effective_from: row.effective_from,
      effective_to: row.effective_to,
      source: {
        title: source.title,
        url: source.url,
        path: source.path,
        retrieved: source.retrieved,
        sha256: source.sha256,
        method: 'parser',
        parser: parser.parser,
        locator: row.locator,
        synthetic: source.synthetic,
      },
      verification: { level: 'L1', by: request.checkedBy, on: request.checkedOn, questions: [] },
      quotes: [row.quote],
      notes: row.note ?? '',
    });
    if (result.ok) {
      records.push(result.value);
    } else {
      problems.push(`${row.locator}: ${result.issues.join('; ')}`);
    }
  }
  const overlaps = findOverlaps(records.map((record) => ({ record, where: record.source.locator ?? '' })));
  for (const { first, second } of overlaps) {
    problems.push(`${second.where}: ${recordLabel(second.record)} overlaps the window of ${first.where}`);
  }
  if (problems.length > 0) {
    const shown = problems.slice(0, SHOWN_PROBLEMS).map((problem) => `  ${problem}`);
    const more = problems.length > SHOWN_PROBLEMS ? [`  ...and ${String(problems.length - SHOWN_PROBLEMS)} more`] : [];
    throw new RuleImportError([`${String(problems.length)} row(s) do not make valid ${parser.type} records:`, ...shown, ...more].join('\n'));
  }
  return records;
}
