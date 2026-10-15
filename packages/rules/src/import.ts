import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { buildParsedRecords } from './build';
import { PARSERS, RuleImportError, compareConversionFactorPasses } from './parsers';
import type { ImportWindow, ImportableType, ParseOutcome, RuleFileParser } from './parsers/types';
import { REVIEW_SUFFIX, decodeSourceText, serializeRecords, sha256 } from './records';
import { isIsoDate } from './schema';

/**
 * `pnpm rules:import --type <type> --year <year> --file <path>`: loads a public tabular file into
 * draft rule records by parser (PRD section 9; the new-rule-record skill). It stores the file under
 * content/sources/<type>/ with its SHA-256, and writes the drafts at verification L1 under
 * content/drafts/<type>/<year>/<file stem>.json, with the L2 questions beside them in
 * <file stem>.review.md. Nothing is written unless every row makes a valid record.
 */
export interface ImportRequest {
  /** The repository root. */
  readonly root: string;
  readonly type: ImportableType;
  readonly year: number;
  /** The downloaded file, anywhere on disk. */
  readonly file: string;
  /** The second, independent preparation of a hand-made file (required for conversion_factor). */
  readonly secondPass?: string;
  readonly url?: string | null;
  readonly title?: string;
  /** When the file was downloaded (YYYY-MM-DD). */
  readonly retrieved: string;
  /** The window for files that carry no dates; defaults to the calendar year. */
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string | null;
  /** Today's date, recorded as the L1 check date. */
  readonly today: string;
}

export interface ImportResult {
  readonly source: string;
  readonly sha256: string;
  readonly secondPassSource: string | null;
  readonly draft: string;
  readonly review: string;
  readonly records: number;
  readonly notes: readonly string[];
  readonly questions: readonly string[];
}

/** Stored source names: plain letters, digits, dots, dashes and underscores (they become repository paths). */
const SOURCE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function window(request: ImportRequest): ImportWindow {
  if (!Number.isInteger(request.year) || request.year < 1990 || request.year > 2100) {
    throw new RuleImportError('--year must be a four-digit year');
  }
  const effectiveFrom = request.effectiveFrom ?? `${String(request.year)}-01-01`;
  const effectiveTo = request.effectiveTo === undefined ? `${String(request.year)}-12-31` : request.effectiveTo;
  for (const date of [request.retrieved, request.today, effectiveFrom, effectiveTo]) {
    if (date !== null && !isIsoDate(date)) {
      throw new RuleImportError(`${JSON.stringify(date)} is not a date written YYYY-MM-DD`);
    }
  }
  if (effectiveTo !== null && effectiveTo < effectiveFrom) {
    throw new RuleImportError('--effective-to is before --effective-from');
  }
  return { year: request.year, effectiveFrom, effectiveTo };
}

interface ReadFile {
  readonly name: string;
  readonly bytes: Buffer;
  readonly sha256: string;
  readonly outcome: ParseOutcome;
}

function readAndParse(file: string, parser: RuleFileParser, importWindow: ImportWindow): ReadFile {
  const name = path.basename(file);
  if (!SOURCE_NAME.test(name)) {
    throw new RuleImportError(`rename ${JSON.stringify(name)} to letters, digits, dots, dashes and underscores before importing; it becomes a repository path`);
  }
  const bytes = readFileSync(file);
  const text = decodeSourceText(bytes);
  if (/SYNTHETIC/.test(text.split('\n', 1)[0] ?? '')) {
    throw new RuleImportError(`${name} says SYNTHETIC on its first line: synthetic fixtures are never imported as content`);
  }
  return { name, bytes, sha256: sha256(bytes), outcome: parser.parse(text, importWindow) };
}

/** Copies a source into content/sources/<type>/ with a <name>.sha256 beside it; never replaces a different file. */
function storeSource(root: string, type: ImportableType, file: ReadFile): string {
  const relative = path.posix.join('content', 'sources', type, file.name);
  const target = path.join(root, relative);
  if (existsSync(target)) {
    if (sha256(readFileSync(target)) !== file.sha256) {
      throw new RuleImportError(
        `${relative} already holds a different file; stored sources back published records and are never replaced, so give the new file a new name`,
      );
    }
  } else {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, file.bytes);
  }
  writeFileSync(`${target}.sha256`, `${file.sha256}  ${file.name}\n`);
  return relative;
}

function reviewText(parser: RuleFileParser, details: { draft: string; records: number; source: string; sha256: string; retrieved: string; url: string | null; notes: readonly string[] }): string {
  const lines = [
    `# Review: ${parser.title}`,
    '',
    `- Draft: \`${details.draft}\` (${String(details.records)} records, verification L1)`,
    `- Source: \`${details.source}\`, SHA-256 \`${details.sha256}\`, retrieved ${details.retrieved}${details.url === null ? '' : ` from ${details.url}`}`,
    '',
  ];
  if (details.notes.length > 0) {
    lines.push('Import notes:', '', ...details.notes.map((note) => `- ${note}`), '');
  }
  lines.push(
    'To raise these records to L2, a person reads the stored source and answers:',
    '',
    ...parser.reviewQuestions.map((question, index) => `${String(index + 1)}. ${question}`),
    '',
    'Then set `verification` on every record of the draft to level L2 with the reviewer and the date (content/sources/README.md shows how).',
    '',
  );
  return lines.join('\n');
}

export function importRuleFile(request: ImportRequest): ImportResult {
  const parser = PARSERS[request.type];
  const importWindow = window(request);
  if (request.type === 'conversion_factor' && request.secondPass === undefined) {
    throw new RuleImportError('conversion factors are typed by a person: prepare the CSV twice and pass the second with --second-pass');
  }
  if (request.type !== 'conversion_factor' && request.secondPass !== undefined) {
    throw new RuleImportError(`--second-pass applies only to conversion_factor; ${request.type} is loaded from the published file`);
  }

  const first = readAndParse(request.file, parser, importWindow);
  const second = request.secondPass === undefined ? undefined : readAndParse(request.secondPass, parser, importWindow);
  if (second !== undefined) {
    const differences = compareConversionFactorPasses(first.outcome.rows, second.outcome.rows);
    if (differences.length > 0) {
      throw new RuleImportError(['the two preparations differ; resolve against the final rule and import again:', ...differences.map((line) => `  ${line}`)].join('\n'));
    }
  }

  const sourcePath = path.posix.join('content', 'sources', request.type, first.name);
  const url = request.url ?? null;
  const records = buildParsedRecords({
    parser,
    rows: first.outcome.rows,
    source: { title: request.title ?? parser.title, url, path: sourcePath, retrieved: request.retrieved, sha256: first.sha256, synthetic: false },
    checkedBy: 'pnpm rules:import',
    checkedOn: request.today,
  });

  const source = storeSource(request.root, request.type, first);
  const secondPassSource = second === undefined ? null : storeSource(request.root, request.type, second);
  const stem = first.name.replace(/\.[^.]*$/, '');
  const draft = path.posix.join('content', 'drafts', request.type, String(request.year), `${stem}.json`);
  const review = path.posix.join('content', 'drafts', request.type, String(request.year), `${stem}${REVIEW_SUFFIX}`);
  mkdirSync(path.dirname(path.join(request.root, draft)), { recursive: true });
  writeFileSync(path.join(request.root, draft), serializeRecords(records));
  writeFileSync(
    path.join(request.root, review),
    reviewText(parser, { draft, records: records.length, source, sha256: first.sha256, retrieved: request.retrieved, url, notes: first.outcome.notes }),
  );
  return { source, sha256: first.sha256, secondPassSource, draft, review, records: records.length, notes: first.outcome.notes, questions: parser.reviewQuestions };
}
