import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { buildParsedRecords } from './build';
import { fixtureFileHashes } from './content';
import { syntheticMarkers } from './guards';
import { PARSERS, RuleImportError, compareConversionFactorPasses, zipFileQuarter } from './parsers';
import type { ImportWindow, ImportableType, ParseOptions, ParseOutcome, RuleFileParser } from './parsers/types';
import { REVIEW_SUFFIX, decodeSourceText, serializeRecords, sha256 } from './records';
import {
  type CmsQuarter,
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

// ---------------------------------------------------------------------------------------------
// The quarter a quarterly file states (audit #30, docs/adr/0071)

/** What a quarterly file states (R2): its quarter, and the day it takes effect when it states one. */
export interface StatedQuarter {
  readonly quarter: CmsQuarter;
  readonly effective: string | null;
}

const QUARTER_MONTHS: Readonly<Record<string, CmsQuarter['quarter']>> = { jan: 1, apr: 2, jul: 3, oct: 4, january: 1, april: 2, july: 3, october: 4 };

interface QuarterPattern {
  readonly pattern: RegExp;
  /** Read in the first 5 lines of the text only, never in a file name. */
  readonly titleOnly: boolean;
  readonly read: (match: RegExpExecArray) => CmsQuarter | { readonly date: readonly [month: string, day: string, year: string] };
}

/**
 * The patterns a quarter is read by (case-insensitive), each giving the quarter or, for an effective date, the date.
 * They are the contract until the first real download shows what CMS writes: a later parser pull request may add
 * patterns, and never removes the refusal.
 */
const QUARTER_PATTERNS: readonly QuarterPattern[] = [
  { pattern: /\bRVU(\d{2})([A-D])\b/gi, titleOnly: false, read: (m) => ({ year: 2000 + Number.parseInt(m[1] ?? '', 10), quarter: ('ABCD'.indexOf((m[2] ?? '').toUpperCase()) + 1) as CmsQuarter['quarter'] }) },
  { pattern: /(?:PPRRVU|GPCI)(\d{2})_(JAN|APR|JUL|OCT)/gi, titleOnly: false, read: (m) => ({ year: 2000 + Number.parseInt(m[1] ?? '', 10), quarter: QUARTER_MONTHS[(m[2] ?? '').toLowerCase()] ?? 1 }) },
  { pattern: /(20\d{2})[ _-]?Q([1-4])\b/gi, titleOnly: false, read: (m) => ({ year: Number.parseInt(m[1] ?? '', 10), quarter: Number.parseInt(m[2] ?? '', 10) as CmsQuarter['quarter'] }) },
  { pattern: /\b(JAN|APR|JUL|OCT)[ _-]?(20\d{2})\b/gi, titleOnly: false, read: (m) => ({ year: Number.parseInt(m[2] ?? '', 10), quarter: QUARTER_MONTHS[(m[1] ?? '').toLowerCase()] ?? 1 }) },
  { pattern: /\b(January|April|July|October)\s+(20\d{2})\b/gi, titleOnly: true, read: (m) => ({ year: Number.parseInt(m[2] ?? '', 10), quarter: QUARTER_MONTHS[(m[1] ?? '').toLowerCase()] ?? 1 }) },
  { pattern: /\bEff(?:ective)?\.?:?\s+(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/gi, titleOnly: false, read: (m) => ({ date: [m[1] ?? '', m[2] ?? '', m[3] ?? ''] }) },
];

/** The last path segment of a URL, percent-decoded, with its query and fragment dropped. */
function urlFileName(url: string): string {
  const segment = url.replace(/[?#].*$/s, '').split('/').at(-1) ?? '';
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * The quarter a quarterly file states (R2). ZIP5 and ZIP9: the year and quarter (YYYYQ) at 76-80 of the first line
 * that is not blank; the parsers check every other line. PPRRVU, GPCI and MUE: every match of the patterns above in
 * the first 5 lines of the text, the file's base name, and the last path segment of `--url` (the address the file was
 * downloaded from: for a file taken out of a zip, the zip's, whose name carries CMS's token). Null when the file
 * states no quarter; throws RuleImportError when it states two, two effective days, or an effective day that is no
 * date.
 */
export function statedQuarter(type: QuarterlyRecordType, source: { readonly fileName: string; readonly url: string; readonly text: string }): StatedQuarter | null {
  const name = path.basename(source.fileName);
  if (type === 'locality_map' || type === 'locality_map_plus_four') {
    const first = source.text.split(/\r?\n/).find((line) => line.trim() !== '');
    const field = first === undefined ? null : zipFileQuarter(first);
    return field === null ? null : { quarter: { year: Number.parseInt(field.slice(0, 4), 10), quarter: Number.parseInt(field.slice(4), 10) as CmsQuarter['quarter'] }, effective: null };
  }
  const titles = source.text.split(/\r?\n/, 5).join('\n');
  const quarters = new Map<string, CmsQuarter>();
  const effectives = new Set<string>();
  const notDates: string[] = [];
  for (const [text, isTitle] of [[titles, true], [name, false], [urlFileName(source.url), false]] as const) {
    for (const { pattern, titleOnly, read } of QUARTER_PATTERNS) {
      if (titleOnly && !isTitle) {
        continue;
      }
      for (const match of text.matchAll(pattern)) {
        const stated = read(match);
        if ('date' in stated) {
          const [month, day, year] = stated.date;
          const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          if (!isIsoDate(iso)) {
            notDates.push(JSON.stringify(match[0]));
            continue;
          }
          effectives.add(iso);
          const quarter = cmsQuarterOfDate(iso);
          quarters.set(quarterLabel(quarter), quarter);
        } else {
          quarters.set(quarterLabel(stated), stated);
        }
      }
    }
  }
  const labels = [...quarters.keys()];
  if (notDates.length > 0) {
    // An effective date that is no date states a quarter of none, so it never agrees with anything.
    throw new RuleImportError(`${name} states two quarters (${notDates[0] ?? ''}, which is no date, and ${labels[0] ?? notDates[1] ?? 'none'}); import each quarter's file on its own`);
  }
  if (labels.length > 1) {
    throw new RuleImportError(`${name} states two quarters (${labels[0] ?? ''} and ${labels[1] ?? ''}); import each quarter's file on its own`);
  }
  const days = [...effectives].sort();
  if (days.length > 1) {
    throw new RuleImportError(`${name} states two quarters (effective ${days[0] ?? ''} and effective ${days[1] ?? ''}); import each quarter's file on its own`);
  }
  const [quarter] = quarters.values();
  return quarter === undefined ? null : { quarter, effective: days[0] ?? null };
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
