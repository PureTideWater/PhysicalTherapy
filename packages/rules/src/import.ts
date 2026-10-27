import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { buildParsedRecords } from './build';
import { fixtureFileHashes } from './content';
import { syntheticMarkers } from './guards';
import { PARSERS, RuleImportError, compareConversionFactorPasses, statedQuarter } from './parsers';
import type { ImportWindow, ImportableType, ParseOptions, ParseOutcome, RuleFileParser } from './parsers/types';
import { REVIEW_SUFFIX, decodeSourceText, serializeRecords, sha256 } from './records';
import {
  QUARTERLY_RECORD_TYPES,
  type QuarterlyRecordType,
  UNDATED_RECORD_TYPES,
  cmsQuarterOfDate,
  cmsQuarterWindow,
  insideOneYear,
  isIsoDate,
  quarterLabel,
  quarterWindowProblem,
} from './schema';

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
  /** Where the file was downloaded from (required: content cites public documents by address). */
  readonly url: string;
  /** Column choices for a layout with more than one candidate (the GPCI work floor). */
  readonly parseOptions?: ParseOptions;
  readonly title?: string;
  /** When the file was downloaded (YYYY-MM-DD). */
  readonly retrieved: string;
  /**
   * The window for files that carry no dates; defaults to the calendar year for the MPPR list; a quarterly file takes
   * its stated quarter's window, which must be given.
   */
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

function isQuarterly(type: ImportableType): type is QuarterlyRecordType {
  return (QUARTERLY_RECORD_TYPES as readonly string[]).includes(type);
}

/**
 * The window refusals of a file with no dates of its own (audit #30, I1 to I8 of docs/adr/0071), in their fixed order,
 * before anything is stored or written. `importWindow` is the window with the calendar-year default applied.
 */
function refuseUndatedWindow(request: ImportRequest, importWindow: ImportWindow, file: SourceFile): void {
  const { type } = request;
  if ((UNDATED_RECORD_TYPES as readonly string[]).includes(type) && request.effectiveTo === null) {
    throw new RuleImportError(`${type} files carry no dates of their own, so their window needs an end: give --effective-to (an open window would hide the day the content runs out)`);
  }
  if (isQuarterly(type)) {
    const stated = statedQuarter(type, { fileName: file.name, url: request.url, text: file.text });
    if (stated === null) {
      throw new RuleImportError(
        `${type} is a quarterly file, and ${file.name} states no quarter that can be read: keep CMS's quarter token in the file name (such as RVU26D, PPRRVU26_OCT, 2026Q4 or OCT2026), or, if the file states its quarter another way, fix the parser in a pull request (content/sources/README.md)`,
      );
    }
    const label = quarterLabel(stated.quarter);
    const { from, to } = cmsQuarterWindow(stated.quarter);
    const problem = quarterWindowProblem(stated.quarter, stated.effective, request.effectiveFrom, request.effectiveTo);
    if (problem === 'missing') {
      throw new RuleImportError(`${type} is a quarterly file for ${label}: give its window inside that quarter, usually the whole quarter, --effective-from ${from} --effective-to ${to}`);
    }
    if (problem === 'outside') {
      throw new RuleImportError(
        `${type} is a quarterly file for ${label}, so its window lies inside ${from} to ${to} (the whole quarter, or a correction's part of it); the window given is ${importWindow.effectiveFrom} to ${importWindow.effectiveTo ?? 'open'}`,
      );
    }
    if (request.year !== stated.quarter.year) {
      throw new RuleImportError(`--year ${String(request.year)} is not the year of the quarter ${file.name} states (${label})`);
    }
    if (problem === 'not_effective_day') {
      throw new RuleImportError(`${file.name} takes effect on ${stated.effective ?? ''}, so its window starts that day: --effective-from ${stated.effective ?? ''} (the window given starts ${importWindow.effectiveFrom})`);
    }
  }
  if (type === 'mppr_rate' && !insideOneYear(importWindow.effectiveFrom, importWindow.effectiveTo)) {
    throw new RuleImportError(
      `the MPPR list is a calendar year's file, so its window ends inside ${importWindow.effectiveFrom.slice(0, 4)}: the window given is ${importWindow.effectiveFrom} to ${importWindow.effectiveTo ?? 'open'}`,
    );
  }
}

/**
 * A file with no dates of its own is imported for one window, and its draft is named after the file. A draft of the
 * same name holding another window is another quarter's (or year's), kept by "Keep every quarter": it is never replaced
 * (audit #30, INT-PIPE-1). The same window may be imported again, so a correction is re-imported over its own draft.
 */
function refuseOtherWindowsDraft(request: ImportRequest, draft: string, fileName: string, importWindow: ImportWindow): void {
  if (!(UNDATED_RECORD_TYPES as readonly string[]).includes(request.type)) {
    return;
  }
  const target = path.join(request.root, draft);
  if (!existsSync(target)) {
    return;
  }
  let held: unknown;
  try {
    held = JSON.parse(readFileSync(target, 'utf8')) as unknown;
  } catch {
    throw new RuleImportError(`${draft} already exists and is not valid JSON: remove it or give the file its own name before importing`);
  }
  const wanted = `${importWindow.effectiveFrom} to ${importWindow.effectiveTo ?? 'open'}`;
  const windows = new Set(
    (Array.isArray(held) ? held : [held]).map((record: unknown) => {
      const { effective_from: from, effective_to: to } = (typeof record === 'object' && record !== null ? record : {}) as { effective_from?: unknown; effective_to?: unknown };
      return `${heldDate(from)} to ${to === null ? 'open' : heldDate(to)}`;
    }),
  );
  const other = [...windows].find((window) => window !== wanted);
  if (other !== undefined) {
    throw new RuleImportError(
      `${draft} already holds the records of ${other}, imported from a file of the same name: give the file for ${wanted} its own name${quarterName(request.type, fileName, importWindow)}, so every quarter is kept (content/sources/README.md)`,
    );
  }
}

/** A date as a held draft stores it, shown as it is: a string itself, anything else as JSON ("missing" when absent). */
function heldDate(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined ? 'missing' : JSON.stringify(value);
}

/** ", such as GPCI2026_Q4.csv": a quarterly file's name with its quarter's token added, as content/sources/README.md row 2 renames it. */
function quarterName(type: ImportableType, fileName: string, importWindow: ImportWindow): string {
  if (!isQuarterly(type)) {
    return '';
  }
  const { year, quarter } = cmsQuarterOfDate(importWindow.effectiveFrom);
  const dot = fileName.lastIndexOf('.');
  const [stem, extension] = dot > 0 ? [fileName.slice(0, dot), fileName.slice(dot)] : [fileName, ''];
  return `, such as ${stem}${stem.endsWith(String(year)) ? '' : `_${String(year)}`}_Q${String(quarter)}${extension}`;
}

/** A file as read, before it is parsed. */
interface SourceFile {
  readonly name: string;
  readonly bytes: Buffer;
  readonly text: string;
  readonly sha256: string;
}

interface ReadFile extends SourceFile {
  readonly outcome: ParseOutcome;
}

interface ReadContext {
  readonly parser: RuleFileParser;
  readonly window: ImportWindow;
  readonly options: ParseOptions;
  /** SHA-256 to path of every file under fixtures/. */
  readonly fixtures: ReadonlyMap<string, string>;
}

/**
 * Reads one file, refusing a SYNTHETIC fixture by a banner on its first line or by the same bytes
 * as any file under fixtures/ (renamed or not); parseSource refuses a row carrying a reserved
 * SYNTHETIC identifier (carrier 99999, state ZZ, ZIP 000xx).
 */
function readSource(file: string, context: ReadContext): SourceFile {
  const name = path.basename(file);
  if (!SOURCE_NAME.test(name)) {
    throw new RuleImportError(`rename ${JSON.stringify(name)} to letters, digits, dots, dashes and underscores before importing; it becomes a repository path`);
  }
  const bytes = readFileSync(file);
  const text = decodeSourceText(bytes);
  if (/SYNTHETIC/.test(text.split('\n', 1)[0] ?? '')) {
    throw new RuleImportError(`${name} says SYNTHETIC on its first line: synthetic fixtures are never imported as content`);
  }
  const hash = sha256(bytes);
  const copyOf = context.fixtures.get(hash);
  if (copyOf !== undefined) {
    throw new RuleImportError(`${name} has the same bytes as ${copyOf}: synthetic fixtures are never imported as content`);
  }
  return { name, bytes, text, sha256: hash };
}

/** Parses a read file, refusing a row that carries a reserved SYNTHETIC identifier. */
function parseSource(file: SourceFile, context: ReadContext): ReadFile {
  const outcome = context.parser.parse(file.text, context.window, context.options);
  for (const row of outcome.rows) {
    const markers = syntheticMarkers(row.key, row.value);
    if (markers.length > 0) {
      throw new RuleImportError(`${file.name} ${row.locator}: ${markers.join('; ')}; synthetic fixtures are never imported as content`);
    }
  }
  return { ...file, outcome };
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

function reviewText(parser: RuleFileParser, details: { draft: string; records: number; source: string; sha256: string; retrieved: string; url: string; notes: readonly string[] }): string {
  const lines = [
    `# Review: ${parser.title}`,
    '',
    `- Draft: \`${details.draft}\` (${String(details.records)} records, verification L1)`,
    `- Source: \`${details.source}\`, SHA-256 \`${details.sha256}\`, retrieved ${details.retrieved} from ${details.url}`,
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

  if (!/^https?:\/\/\S+$/.test(request.url)) {
    throw new RuleImportError('--url must be the http(s) address the file was downloaded from');
  }
  const context: ReadContext = { parser, window: importWindow, options: request.parseOptions ?? {}, fixtures: fixtureFileHashes(request.root) };
  const firstSource = readSource(request.file, context);
  refuseUndatedWindow(request, importWindow, firstSource);
  const first = parseSource(firstSource, context);
  const second = request.secondPass === undefined ? undefined : parseSource(readSource(request.secondPass, context), context);
  if (second !== undefined) {
    const differences = compareConversionFactorPasses(first.outcome.rows, second.outcome.rows);
    if (differences.length > 0) {
      throw new RuleImportError(['the two preparations differ; resolve against the final rule and import again:', ...differences.map((line) => `  ${line}`)].join('\n'));
    }
  }

  const sourcePath = path.posix.join('content', 'sources', request.type, first.name);
  const { url } = request;
  const records = buildParsedRecords({
    parser,
    rows: first.outcome.rows,
    source: { title: request.title ?? parser.title, url, path: sourcePath, retrieved: request.retrieved, sha256: first.sha256, synthetic: false },
    checkedBy: 'pnpm rules:import',
    checkedOn: request.today,
  });

  const stem = first.name.replace(/\.[^.]*$/, '');
  const draft = path.posix.join('content', 'drafts', request.type, String(request.year), `${stem}.json`);
  const review = path.posix.join('content', 'drafts', request.type, String(request.year), `${stem}${REVIEW_SUFFIX}`);
  refuseOtherWindowsDraft(request, draft, first.name, importWindow);
  const source = storeSource(request.root, request.type, first);
  const secondPassSource = second === undefined ? null : storeSource(request.root, request.type, second);
  mkdirSync(path.dirname(path.join(request.root, draft)), { recursive: true });
  writeFileSync(path.join(request.root, draft), serializeRecords(records));
  writeFileSync(
    path.join(request.root, review),
    reviewText(parser, { draft, records: records.length, source, sha256: first.sha256, retrieved: request.retrieved, url, notes: first.outcome.notes }),
  );
  return { source, sha256: first.sha256, secondPassSource, draft, review, records: records.length, notes: first.outcome.notes, questions: parser.reviewQuestions };
}
