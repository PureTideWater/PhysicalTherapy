import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
  FIRST_SYNTHETIC_RELEASE,
  MANIFEST_FILE,
  type RuleRecord,
  type RuleRecordType,
  canonicalJson,
  compareManifest,
  decodeSourceText,
  describeIssues,
  diffTranscriptions,
  findOverlaps,
  isSecondPassFile,
  isSyntheticReleaseNumber,
  manifestSchema,
  quoteIndex,
  recordLabel,
  secondPassPathFor,
  sha256,
  syntheticMarkers,
  unquotedValues,
  zipFileQuarter,
} from '@tp/rules';
import {
  type ContentFile,
  fixtureFileHashes,
  isRecordFile,
  listContentFiles,
  previousReleaseNumber,
  readRecordFile,
  readSecondPassFile,
  releaseDirOf,
} from '@tp/rules/content';

// The release content checks' helpers (docs/adr/0071), which @tp/rules's entry point does not re-export yet.
import {
  COVERAGE_FILE,
  COVERAGE_WITHDRAWN_FILE,
  type ContentId,
  type ContentSummary,
  type CoverageLoss,
  type CoverageMap,
  type ReleaseCoverage,
  contentGaps,
  contentOf,
  contentSummaries,
  coverageMap,
  coverageRegression,
  coverageWithdrawnNoteSchema,
  lookBackCutoff,
  readJsonBlock,
  releaseCoverageSchema,
} from '../../packages/rules/src/records';
import { QUARTERLY_RECORD_TYPES, UNDATED_RECORD_TYPES, insideOneYear, quarterLabel, windowQuarter } from '../../packages/rules/src/schema';

/**
 * `pnpm verify-content`: the content checker (PRD section 9). For each content set (the drafts,
 * every prepared and published release, or a directory named on the command line, such as a
 * fixture release) it refuses when:
 *
 * - a record fails the schema, including the range of any numeric field;
 * - a record lacks a source, its stored source file is missing, or the file's SHA-256 differs;
 * - a quote does not appear verbatim in the stored source text;
 * - two records with the same record type and key have overlapping effective windows;
 * - a hand-typed record has no second transcription, or the two transcriptions differ; at L2 or
 *   above, the second pass must be by someone other than the first transcriber;
 * - a hand-typed money, percentage or day value does not appear in any of its record's quotes;
 * - a release's files do not match its MANIFEST.json, or any release outside fixtures/ (prepared,
 *   published or named on the command line) holds a record below L2, or a release number is in the
 *   wrong range (real releases below 900000, SYNTHETIC fixture releases from 900000);
 * - a record cites the plan's own rules reference (content/sources/plan/) at L2 or above;
 * - synthetic data appears in content (a synthetic record, a stored source with the bytes of a
 *   fixture file, or a reserved SYNTHETIC identifier), or real data in a fixture;
 * - in content (never in a fixture), whatever the record's method: a quarterly record's window
 *   leaves one CMS quarter, a ZIP record's quoted lines state another quarter, a per-code MPPR
 *   window is open or leaves its calendar year, a quarterly or per-code MPPR record is hand-typed,
 *   or records of one source file carry different windows (audit #30);
 * - a content has no record in force on dates inside the ones it is loaded for (a gap;
 *   locality_map_plus_four, sparse by design, excepted);
 * - a numbered release has no COVERAGE.md, or one whose release, previous release, dates, contents
 *   or coverage losses do not match its records and its previous release's: it may stop covering
 *   what the previous release covered only before the six-year look-back, where the source's own
 *   dates close it, or where a note signed by two people withdraws it; the previous release must be
 *   readable;
 * - content/drafts/COVERAGE-WITHDRAWN.md is malformed, or names a release other than the newest.
 */

export type ContentSetKind = 'drafts' | 'release';

export interface ContentSet {
  /** Repository-relative directory, with forward slashes. */
  readonly dir: string;
  readonly kind: ContentSetKind;
  /** A release (it holds a MANIFEST.json) outside fixtures/: every record must be at L2 or L3. */
  readonly published: boolean;
  /** content/outgoing/<n> or content/releases/<n>: the manifest must name the directory's number. */
  readonly numbered: boolean;
  /** Under fixtures/: every record must be synthetic. Anywhere else: none may be. */
  readonly synthetic: boolean;
}

export interface CheckResult {
  readonly ok: boolean;
  readonly message: string;
  readonly problems: readonly string[];
}

const RELEASE_PARENTS = ['content/outgoing', 'content/releases'];
const RELEASE_NUMBER = /^[1-9]\d*$/;

function toPosix(relative: string): string {
  return relative.split(path.sep).join('/');
}

/** The content set at `dir` (relative to `root` or absolute): a release when it holds a MANIFEST.json. */
export function contentSetAt(root: string, dir: string): ContentSet {
  const relative = toPosix(path.relative(root, path.resolve(root, dir)));
  const kind = existsSync(path.join(root, relative, MANIFEST_FILE)) ? 'release' : 'drafts';
  const synthetic = relative === 'fixtures' || relative.startsWith('fixtures/');
  return {
    dir: relative,
    kind,
    published: kind === 'release' && !synthetic,
    numbered: RELEASE_PARENTS.some((parent) => relative.startsWith(`${parent}/`)),
    synthetic,
  };
}

/** The drafts, then every numbered directory under content/outgoing and content/releases. */
export function defaultContentSets(root: string): { sets: ContentSet[]; problems: string[] } {
  const sets: ContentSet[] = [{ dir: 'content/drafts', kind: 'drafts', published: false, numbered: false, synthetic: false }];
  const problems: string[] = [];
  for (const parent of RELEASE_PARENTS) {
    let entries;
    try {
      // The content checkout is read at run time; the web server's bundler must not trace it.
      entries = readdirSync(path.join(/*turbopackIgnore: true*/ root, parent), { withFileTypes: true });
    } catch {
      continue;
    }
    const numbered = entries
      .filter((entry) => entry.name !== 'README.md')
      .filter((entry) => {
        if (entry.isDirectory() && RELEASE_NUMBER.test(entry.name)) {
          return true;
        }
        problems.push(`${parent}/${entry.name}: only numbered release directories belong in ${parent}`);
        return false;
      })
      .map((entry) => entry.name)
      .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
    for (const name of numbered) {
      sets.push({ dir: `${parent}/${name}`, kind: 'release', published: true, numbered: true, synthetic: false });
    }
  }
  return { sets, problems };
}

interface StoredSource {
  readonly problem?: string;
  readonly sha256?: string;
  readonly has?: (quote: string) => boolean;
  /** The fixture file with the same bytes, when the stored source is a copy of one. */
  readonly fixtureCopyOf?: string;
}

/** Where the plan's own rules reference is stored: a secondary source, never enough for L2. */
export const PLAN_SOURCES = 'content/sources/plan/';

/** Reads each cited source once: its hash, a quote lookup over its text, and whether it copies a fixture. */
function sourceReader(root: string): (sourcePath: string) => StoredSource {
  const cache = new Map<string, StoredSource>();
  let fixtures: Map<string, string> | undefined;
  return (sourcePath) => {
    const cached = cache.get(sourcePath);
    if (cached) {
      return cached;
    }
    const absolute = path.join(root, sourcePath);
    let stored: StoredSource;
    try {
      if (!lstatSync(absolute).isFile()) {
        throw new Error('not a regular file');
      }
      const bytes = readFileSync(absolute);
      const hash = sha256(bytes);
      fixtures ??= fixtureFileHashes(root);
      const copyOf = sourcePath.startsWith('fixtures/') ? undefined : fixtures.get(hash);
      stored = { sha256: hash, has: quoteIndex(decodeSourceText(bytes)), ...(copyOf === undefined ? {} : { fixtureCopyOf: copyOf }) };
    } catch {
      stored = { problem: `the stored source ${sourcePath} is missing (or is not a regular file)` };
    }
    cache.set(sourcePath, stored);
    return stored;
  };
}

function isQuarterly(type: RuleRecordType): boolean {
  return QUARTERLY_RECORD_TYPES.some((quarterly) => quarterly === type);
}

function windowText(record: RuleRecord): string {
  return `${record.effective_from} to ${record.effective_to ?? 'open'}`;
}

/**
 * Audit #30 R2 on a real record, whatever its method (review M2): a file with no dates of its own is imported for the
 * window it states, so no record can widen its content's span (what #7's run refusal reads) beyond that quarter or year.
 * The hand-typed general practice-expense reduction (mppr_general) stays open and is not read here.
 */
function statedWindowProblems(record: RuleRecord): string[] {
  const problems: string[] = [];
  const { record_type: type, effective_from: from, effective_to: to } = record;
  const content = contentOf(record);
  if (isQuarterly(type)) {
    const quarter = windowQuarter(from, to);
    if (quarter === null) {
      problems.push(`${type} is imported for one CMS quarter: its window must lie inside one quarter, usually all of it (it is ${windowText(record)})`);
    } else if (type === 'locality_map' || type === 'locality_map_plus_four') {
      const stated = `${String(quarter.year)}${String(quarter.quarter)}`;
      record.quotes.forEach((quote, index) => {
        const field = zipFileQuarter(quote);
        if (field !== stated) {
          problems.push(`quotes.${String(index)} states year and quarter ${field ?? 'none'} at 76-80, but the record's window is ${quarterLabel(quarter)}`);
        }
      });
    }
  }
  if (content === 'mppr_code' && !insideOneYear(from, to)) {
    problems.push(`${type} is read from a calendar year's file with no dates of its own: its window must end inside ${from.slice(0, 4)} (it is ${windowText(record)})`);
  }
  if (record.source.method === 'hand_typed' && (isQuarterly(type) || content === 'mppr_code')) {
    problems.push(
      `${type} comes from a CMS file and is imported with pnpm rules:import, never typed by hand: a hand-typed record would carry a window no file states (content/sources/README.md)`,
    );
  }
  return problems;
}

function checkRecord(record: RuleRecord, set: ContentSet, readSource: (sourcePath: string) => StoredSource): string[] {
  const problems: string[] = [];
  const { source } = record;
  const sourceHome = set.synthetic ? 'fixtures/' : 'content/sources/';
  if (!source.path.startsWith(sourceHome)) {
    problems.push(`source.path ${source.path} must be under ${sourceHome}`);
  }
  if (set.synthetic && !source.synthetic) {
    problems.push('a fixture record must be marked synthetic (source.synthetic true, SYNTHETIC in its title)');
  }
  if (!set.synthetic && source.synthetic) {
    problems.push('synthetic reference data never enters content; it lives under fixtures/');
  }
  if (set.published && record.verification.level === 'L1') {
    problems.push('a release holds only records verified to L2 or L3');
  }
  if (!set.synthetic) {
    problems.push(...syntheticMarkers(record.key, record.value).map((marker) => `${marker}; synthetic reference data never enters content`));
    if (source.path.startsWith(PLAN_SOURCES) && record.verification.level !== 'L1') {
      problems.push(
        `cites ${source.path}, the plan's own rules reference: a secondary source stays at L1; store the primary document under content/sources/${record.record_type}/ and re-cite the record to it before raising it to L2`,
      );
    }
    problems.push(...statedWindowProblems(record));
  }
  problems.push(...unquotedValues(record));
  const stored = readSource(source.path);
  if (stored.problem !== undefined) {
    problems.push(stored.problem);
    return problems;
  }
  if (!set.synthetic && stored.fixtureCopyOf !== undefined) {
    problems.push(`the stored source ${source.path} has the same bytes as ${stored.fixtureCopyOf}: synthetic fixtures never enter content`);
  }
  if (stored.sha256 !== source.sha256) {
    problems.push(`source.sha256 does not match the stored file ${source.path} (it is ${stored.sha256 ?? ''})`);
  }
  record.quotes.forEach((quote, index) => {
    if (stored.has?.(quote) !== true) {
      problems.push(`quotes.${String(index)} does not appear in ${source.path}: ${JSON.stringify(quote.length > 120 ? `${quote.slice(0, 117)}...` : quote)}`);
    }
  });
  return problems;
}

/** The record file's place in a content set: <type>/<year>/<name>.json, holding only that type. */
function checkPlacement(file: string, records: readonly RuleRecord[]): string[] {
  const segments = file.split('/');
  if (segments.length !== 3 || !/^\d{4}$/.test(segments[1] ?? '')) {
    return [`${file}: record files live at <record_type>/<year>/<name>.json`];
  }
  const misplaced = records.filter((record) => record.record_type !== segments[0]);
  return misplaced.length === 0 ? [] : [`${file}: holds ${misplaced[0]?.record_type ?? ''} records in the ${segments[0] ?? ''} directory`];
}

function checkManifestOf(root: string, set: ContentSet, files: readonly ContentFile[]): string[] {
  const absolute = path.join(root, set.dir);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path.join(absolute, MANIFEST_FILE), 'utf8')) as unknown;
  } catch {
    return [`${MANIFEST_FILE} is not valid JSON`];
  }
  const manifest = manifestSchema.safeParse(data);
  if (!manifest.success) {
    return describeIssues(manifest.error).map((issue) => `${MANIFEST_FILE}: ${issue}`);
  }
  const problems: string[] = [];
  const name = path.posix.basename(set.dir);
  if (set.numbered && String(manifest.data.release) !== name) {
    problems.push(`${MANIFEST_FILE} names release ${String(manifest.data.release)} but the directory is ${name}`);
  }
  if (set.synthetic && !isSyntheticReleaseNumber(manifest.data.release)) {
    problems.push(`${MANIFEST_FILE} names release ${String(manifest.data.release)}: SYNTHETIC fixture releases are numbered from ${String(FIRST_SYNTHETIC_RELEASE)}, so they never take a real release's number`);
  }
  if (!set.synthetic && isSyntheticReleaseNumber(manifest.data.release)) {
    problems.push(`${MANIFEST_FILE} names release ${String(manifest.data.release)}: numbers from ${String(FIRST_SYNTHETIC_RELEASE)} are reserved for SYNTHETIC fixture releases`);
  }
  const present = new Map(
    files.filter((file) => file.path !== MANIFEST_FILE && !file.symlink).map((file) => [file.path, sha256(readFileSync(path.join(absolute, file.path)))]),
  );
  problems.push(...compareManifest(manifest.data, present));
  return problems;
}

/** At most this many problems of one kind are listed, then how many more (as the assembler lists its refusals). */
const LISTED = 20;

function listedAtMost(problems: readonly string[]): string[] {
  return problems.length <= LISTED ? [...problems] : [...problems.slice(0, LISTED), `and ${String(problems.length - LISTED)} more of the same kind`];
}

/** The contents read from files with no dates of their own (C16); the general MPPR rate is hand-typed and excepted. */
const UNDATED_CONTENTS: ReadonlySet<ContentId> = new Set(UNDATED_RECORD_TYPES.map((type): ContentId => (type === 'mppr_rate' ? 'mppr_code' : type)));

/** Records of one file share its window (C16): each quarterly and per-code MPPR span is a union of whole-file windows. */
function fileWindowProblems(records: readonly RuleRecord[]): string[] {
  const firstWindow = new Map<string, { readonly window: string; reported: boolean }>();
  const problems: string[] = [];
  for (const record of records) {
    const content = contentOf(record);
    if (!UNDATED_CONTENTS.has(content)) {
      continue;
    }
    const file = `${content} ${record.source.sha256}`;
    const window = windowText(record);
    const first = firstWindow.get(file);
    if (first === undefined) {
      firstWindow.set(file, { window, reported: false });
    } else if (first.window !== window && !first.reported) {
      first.reported = true;
      problems.push(
        `${content} records from one file (${record.source.path}) carry different windows (${first.window} and ${window}): a file is imported for one window, so import it again rather than editing a record's dates`,
      );
    }
  }
  return problems;
}

/** The first difference per content between COVERAGE.md's contents and the release's records (C10). */
function contentsDifferences(listed: ReleaseCoverage['contents'], computed: readonly ContentSummary[]): string[] {
  if (canonicalJson(listed) === canonicalJson(computed)) {
    return [];
  }
  const differences: string[] = [];
  const fields = ['records', 'windows', 'newest_from', 'newest_retrieved'] as const;
  const contents = [...new Set([...computed.map((entry) => entry.content), ...listed.map((entry) => entry.content)])];
  for (const content of contents) {
    const entries = listed.filter((entry) => entry.content === content);
    const actual = computed.find((entry) => entry.content === content);
    const entry = entries[0];
    if (entry === undefined) {
      differences.push(`${content}: not listed, but the release holds ${String(actual?.records ?? 0)} record(s) of it`);
    } else if (actual === undefined) {
      differences.push(`${content}: listed, but the release holds no record of it`);
    } else if (entries.length > 1) {
      differences.push(`${content}: listed ${String(entries.length)} times`);
    } else {
      const field = fields.find((name) => canonicalJson(entry[name]) !== canonicalJson(actual[name]));
      if (field !== undefined) {
        differences.push(`${content}: ${field} is ${canonicalJson(entry[field])}, but the records give ${canonicalJson(actual[field])}`);
      }
    }
  }
  if (differences.length === 0) {
    // Every content agrees, so only the order differs: name the first one out of place.
    const index = listed.findIndex((entry, at) => entry.content !== computed[at]?.content);
    differences.push(`${listed[index]?.content ?? ''}: listed out of order`);
  }
  return differences.map((what) => `COVERAGE.md's contents do not match the release's records (${what})`);
}

function lossText(loss: CoverageLoss): string {
  return `${loss.record_type} ${canonicalJson(loss.key)} ${loss.from} to ${loss.to ?? 'open'}`;
}

function lossIdentity(loss: CoverageLoss): string {
  return canonicalJson({ record_type: loss.record_type, key: loss.key, from: loss.from, to: loss.to });
}

/** The entries of `listed` that `computed` lacks, and of `computed` that `listed` lacks, each counted as often as it appears. */
function unmatched(listed: readonly CoverageLoss[], computed: readonly CoverageLoss[]): { readonly extra: CoverageLoss[]; readonly missing: CoverageLoss[] } {
  const left = new Map<string, number>();
  for (const loss of computed) {
    left.set(lossIdentity(loss), (left.get(lossIdentity(loss)) ?? 0) + 1);
  }
  const extra = listed.filter((loss) => {
    const count = left.get(lossIdentity(loss)) ?? 0;
    left.set(lossIdentity(loss), count - 1);
    return count === 0;
  });
  const missing = computed.filter((loss) => {
    const count = left.get(lossIdentity(loss)) ?? 0;
    left.set(lossIdentity(loss), count - 1);
    return count > 0;
  });
  return { extra, missing };
}

/** A release's coverage, as the next release compares against it: its map (never its records) and its prepared date. */
interface Baseline {
  readonly map: CoverageMap;
  readonly preparedOn: string | null;
}

type BaselineRead = Baseline | { readonly problem: string };

/** The coverage maps of one checkContent run, by directory: at most two (the set checked and the one before it, R5). */
export interface CoverageCache {
  read(dir: string): BaselineRead;
  remember(dir: string, baseline: Baseline): void;
}

/** The prepared date a release's COVERAGE.md records, or null when it has none that can be read (that set reports it). */
function preparedOnOf(dir: string): string | null {
  try {
    const block = readJsonBlock(readFileSync(path.join(dir, COVERAGE_FILE), 'utf8'));
    const parsed = releaseCoverageSchema.safeParse(block.value);
    return block.problems.length === 0 && parsed.success ? parsed.data.prepared_on : null;
  } catch {
    return null;
  }
}

/** Reads a release's records file by file into its coverage map, holding none of them; the first problem fails it. */
function readBaseline(root: string, dir: string): BaselineRead {
  const where = toPosix(path.relative(root, dir));
  let files: ContentFile[];
  try {
    if (!lstatSync(dir).isDirectory()) {
      return { problem: `${where} is not a directory` };
    }
    readdirSync(dir);
    files = listContentFiles(dir).filter((file) => !file.symlink && isRecordFile(file.path));
  } catch {
    return { problem: `${where} cannot be listed` };
  }
  if (files.length === 0) {
    return { problem: `${where} holds no record file` };
  }
  const problems: string[] = [];
  function* records(): Generator<RuleRecord> {
    for (const file of files) {
      let contents;
      try {
        contents = readRecordFile(path.join(dir, file.path), `${where}/${file.path}`);
      } catch {
        problems.push(`${where}/${file.path} cannot be read`);
        return;
      }
      problems.push(...contents.problems);
      for (const entry of contents.records) {
        yield entry.record;
      }
    }
  }
  const map = coverageMap(records());
  const problem = problems[0];
  return problem === undefined ? { map, preparedOn: preparedOnOf(dir) } : { problem };
}

export function coverageCache(root: string): CoverageCache {
  const maps = new Map<string, BaselineRead>();
  const keep = (dir: string, baseline: BaselineRead) => {
    maps.delete(dir);
    maps.set(dir, baseline);
    for (const oldest of maps.keys()) {
      if (maps.size <= 2) {
        break;
      }
      maps.delete(oldest);
    }
  };
  return {
    read(dir) {
      const cached = maps.get(dir);
      if (cached !== undefined) {
        return cached;
      }
      const baseline = readBaseline(root, dir);
      keep(dir, baseline);
      return baseline;
    },
    remember: keep,
  };
}

/**
 * Audit #30 R3 on a numbered release (C5 to C14): its COVERAGE.md must hold exactly what the assembler computes from
 * its records and its previous release's, and it may stop covering what that release covered only as the three
 * allowances say. Unprefixed problems.
 */
function coverageProblems(root: string, set: ContentSet, records: readonly RuleRecord[], whole: boolean, today: string, cache: CoverageCache): string[] {
  const name = path.posix.basename(set.dir);
  if (!RELEASE_NUMBER.test(name)) {
    // The manifest check already says the directory is not a release number.
    return [];
  }
  const n = Number.parseInt(name, 10);
  const absolute = path.join(root, set.dir);
  const next = coverageMap(records);
  const file = path.join(absolute, COVERAGE_FILE);
  if (!existsSync(file)) {
    return ['COVERAGE.md is missing: a prepared release records its coverage (pnpm release:assemble writes it)'];
  }
  const block = readJsonBlock(readFileSync(file, 'utf8'));
  if (block.problems.length > 0) {
    return block.problems.map((problem) => `COVERAGE.md: ${problem}`);
  }
  const parsed = releaseCoverageSchema.safeParse(block.value);
  if (!parsed.success) {
    return describeIssues(parsed.error).map((issue) => `COVERAGE.md: ${issue}`);
  }
  const coverage = parsed.data;
  const prepared = coverage.prepared_on;
  if (whole) {
    // Only a set whose records all parse serves as the next release's baseline.
    cache.remember(absolute, { map: next, preparedOn: prepared });
  }
  const problems: string[] = [];
  if (coverage.release !== n) {
    problems.push(`COVERAGE.md names release ${String(coverage.release)}, but the directory is ${String(n)}`);
  }
  let previous: number | null;
  try {
    previous = previousReleaseNumber(root, n);
  } catch {
    problems.push(`the previous release of ${String(n)} cannot be read (content/releases or content/outgoing cannot be listed), so this release's coverage cannot be compared`);
    return problems;
  }
  if (coverage.previous_release !== previous) {
    problems.push(`COVERAGE.md names previous release ${coverage.previous_release === null ? 'none' : String(coverage.previous_release)}, but the release before ${String(n)} is ${previous === null ? 'none' : String(previous)}`);
  }
  if (prepared > today) {
    problems.push(`COVERAGE.md is prepared on ${prepared}, after today (${today})`);
  }
  let baseline: BaselineRead = { map: new Map(), preparedOn: null };
  if (previous !== null) {
    const dir = releaseDirOf(root, previous);
    baseline = dir === null ? { problem: 'no such directory' } : cache.read(dir);
  }
  if ('problem' in baseline) {
    problems.push(`the previous release ${String(previous)} cannot be read (${baseline.problem}), so this release's coverage cannot be compared`);
  } else if (baseline.preparedOn !== null && prepared < baseline.preparedOn) {
    problems.push(`COVERAGE.md is prepared on ${prepared}, before release ${String(previous)} (${baseline.preparedOn})`);
  }
  const cutoff = lookBackCutoff(prepared);
  if (coverage.cutoff !== cutoff) {
    problems.push(`COVERAGE.md's cutoff is ${coverage.cutoff}; six years before ${prepared} it is ${cutoff}`);
  }
  problems.push(...contentsDifferences(coverage.contents, contentSummaries(records)));
  if (!('problem' in baseline)) {
    const regression = coverageRegression(baseline.map, next, records, cutoff);
    const withdrawn = unmatched(coverage.withdrawn, regression.unexplained);
    problems.push(
      ...listedAtMost(
        withdrawn.missing.map(
          (loss) =>
            `release ${String(n)} stops covering ${loss.record_type} ${canonicalJson(loss.key)} from ${loss.from} to ${loss.to ?? 'open'}, which release ${String(previous)} covered: keep those records, or withdraw that coverage with a signed note (content/sources/README.md, "Coverage")`,
        ),
      ),
    );
    const listing: string[] = [];
    for (const [list, listed, computed] of [
      ['before_cutoff', coverage.before_cutoff, regression.beforeCutoff],
      ['closed_by_source', coverage.closed_by_source, regression.closedBySource],
    ] as const) {
      const { extra, missing } = unmatched(listed, computed);
      listing.push(...missing.map((loss) => `COVERAGE.md does not list ${list} ${lossText(loss)}`));
      listing.push(...extra.map((loss) => `COVERAGE.md lists ${list} ${lossText(loss)}, which is not a coverage loss of that kind`));
    }
    listing.push(...withdrawn.extra.map((loss) => `COVERAGE.md lists withdrawn ${lossText(loss)}, which is not a coverage loss of that kind`));
    problems.push(...listedAtMost(listing));
  }
  coverage.withdrawn.forEach((entry, index) => {
    if (entry.withdrawn_on > prepared) {
      problems.push(`COVERAGE.md withdrawn ${String(index)}: withdrawn_on ${entry.withdrawn_on} is after the release was prepared (${prepared})`);
    }
  });
  return problems;
}

/** content/drafts/COVERAGE-WITHDRAWN.md, when present (D1, D2): readable, and written for the release assembled next. Unprefixed problems. */
function withdrawnNoteProblems(root: string, absolute: string): string[] {
  const file = path.join(absolute, COVERAGE_WITHDRAWN_FILE);
  if (!existsSync(file) || !lstatSync(file).isFile()) {
    // Absent; a link is refused as one by the file loop.
    return [];
  }
  const block = readJsonBlock(readFileSync(file, 'utf8'));
  if (block.problems.length > 0) {
    return block.problems;
  }
  const parsed = coverageWithdrawnNoteSchema.safeParse(block.value);
  if (!parsed.success) {
    return describeIssues(parsed.error);
  }
  const named = String(parsed.data.previous_release);
  let newest: number | null;
  try {
    newest = previousReleaseNumber(root, Number.MAX_SAFE_INTEGER);
  } catch {
    return [`names previous release ${named}, but content/releases or content/outgoing cannot be listed to find the newest release`];
  }
  return parsed.data.previous_release === newest
    ? []
    : [`names previous release ${named}, but the newest release is ${newest === null ? 'none' : String(newest)}: it belongs to a release already assembled, so remove it`];
}

export interface CheckOptions {
  /** The day the check runs, YYYY-MM-DD; a release's COVERAGE.md may not be prepared after it. Default: today in UTC. */
  readonly today?: string;
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Every problem in one content set, each prefixed with where it is. */
export function checkContentSet(
  root: string,
  set: ContentSet,
  readSource = sourceReader(root),
  options: CheckOptions = {},
  coverage: CoverageCache = coverageCache(root),
): { problems: string[]; records: number } {
  const absolute = path.join(root, set.dir);
  const problems: string[] = [];
  const at = (relative: string, message: string) => problems.push(`${set.dir}/${relative}: ${message}`);
  if (!existsSync(absolute)) {
    return { problems: set.kind === 'drafts' && set.dir === 'content/drafts' ? [] : [`${set.dir}: no such directory`], records: 0 };
  }
  const files = listContentFiles(absolute);
  if (set.kind === 'release') {
    problems.push(...checkManifestOf(root, set, files).map((problem) => `${set.dir}: ${problem}`));
  }

  const located: { record: RuleRecord; where: string }[] = [];
  const recordFiles = new Map<string, RuleRecord[]>();
  /** Record files refused by the schema: their second passes are not compared until they parse. */
  const unreadable = new Set<string>();
  const secondPasses: string[] = [];
  for (const file of files) {
    if (file.symlink) {
      at(file.path, 'is a symbolic link');
    } else if (file.path === MANIFEST_FILE && set.kind === 'release') {
      continue;
    } else if (file.path.endsWith('.md')) {
      continue;
    } else if (isSecondPassFile(file.path)) {
      secondPasses.push(file.path);
    } else if (isRecordFile(file.path)) {
      const contents = readRecordFile(path.join(absolute, file.path), `${set.dir}/${file.path}`);
      problems.push(...contents.problems);
      if (contents.problems.length > 0) {
        unreadable.add(file.path);
      }
      const records = contents.records.map((entry) => entry.record);
      recordFiles.set(file.path, records);
      problems.push(...checkPlacement(file.path, records).map((problem) => `${set.dir}/${problem}`));
      for (const entry of contents.records) {
        located.push(entry);
        for (const problem of checkRecord(entry.record, set, readSource)) {
          problems.push(`${entry.where} (${recordLabel(entry.record)}): ${problem}`);
        }
      }
    } else {
      at(file.path, 'is not a record file (.json), a second pass (.second-pass.json) or notes (.md)');
    }
  }

  // Transcribe twice and diff: every hand-typed record needs an identical second transcription.
  for (const [file, records] of recordFiles) {
    if (unreadable.has(file)) {
      continue;
    }
    const handTyped = records.filter((record) => record.source.method === 'hand_typed');
    const secondPath = secondPassPathFor(file);
    const hasSecond = secondPasses.includes(secondPath);
    if (handTyped.length === 0) {
      if (hasSecond) {
        at(secondPath, `${path.posix.basename(file)} has no hand-typed records to compare`);
      }
      continue;
    }
    if (!hasSecond) {
      at(file, `${String(handTyped.length)} hand-typed record(s) need a second, independent transcription in ${path.posix.basename(secondPath)}`);
      continue;
    }
    const second = readSecondPassFile(path.join(absolute, secondPath), `${set.dir}/${secondPath}`);
    problems.push(...second.problems);
    if (second.secondPass !== undefined) {
      for (const difference of diffTranscriptions(handTyped, second.secondPass.records)) {
        at(secondPath, `the transcriptions differ: ${difference}`);
      }
      const secondBy = second.secondPass.transcribed_by;
      const notIndependent = handTyped.filter(
        (record) => record.verification.level !== 'L1' && record.source.method === 'hand_typed' && record.source.transcribed_by === secondBy,
      );
      if (notIndependent.length > 0) {
        at(
          secondPath,
          `was transcribed by ${JSON.stringify(secondBy)}, who also typed the first pass of ${String(notIndependent.length)} record(s) at L2 or above; the second pass must be independent (another person)`,
        );
      }
    }
  }
  for (const secondPath of secondPasses) {
    const primary = `${secondPath.slice(0, -'.second-pass.json'.length)}.json`;
    if (!recordFiles.has(primary)) {
      at(secondPath, `is a second pass with no ${path.posix.basename(primary)} beside it`);
    }
  }

  for (const { first, second } of findOverlaps(located)) {
    problems.push(`${second.where} (${recordLabel(second.record)}): its effective window overlaps ${first.where} (${recordLabel(first.record)})`);
  }

  // Audit #30 (docs/adr/0071): each file's one window, no gap inside a content, and a numbered release's coverage.
  const records = located.map((entry) => entry.record);
  const inSet = (problem: string) => `${set.dir}: ${problem}`;
  if (!set.synthetic) {
    problems.push(...fileWindowProblems(records).map(inSet));
  }
  problems.push(
    ...listedAtMost(
      contentGaps(records).map(
        (gap) =>
          `${gap.content} has no record in force from ${gap.from} to ${gap.to}, inside the dates it is loaded for: import that content for those dates (a content may have no gap inside it)`,
      ),
    ).map(inSet),
  );
  if (set.numbered) {
    problems.push(...coverageProblems(root, set, records, unreadable.size === 0, options.today ?? utcToday(), coverage).map(inSet));
  }
  if (set.dir === 'content/drafts') {
    problems.push(...withdrawnNoteProblems(root, absolute).map((problem) => `${set.dir}/${COVERAGE_WITHDRAWN_FILE}: ${problem}`));
  }
  return { problems, records: located.length };
}

/**
 * Checks the default content sets, or the directories given (relative to `root` or absolute).
 * Passes only when every set is free of problems.
 */
export function checkContent(root: string, dirs: readonly string[] = [], options: CheckOptions = {}): CheckResult {
  const { sets, problems } = dirs.length === 0 ? defaultContentSets(root) : { sets: dirs.map((dir) => contentSetAt(root, dir)), problems: [] };
  const readSource = sourceReader(root);
  const coverage = coverageCache(root);
  const summary: string[] = [];
  for (const set of sets) {
    const result = checkContentSet(root, set, readSource, options, coverage);
    problems.push(...result.problems);
    summary.push(`  ${set.dir}: ${String(result.records)} record(s), ${result.problems.length === 0 ? 'no problems' : `${String(result.problems.length)} problem(s)`}`);
  }
  const ok = problems.length === 0;
  const message = [
    ok ? 'verify-content: every content set passes.' : `verify-content: refused, ${String(problems.length)} problem(s).`,
    ...summary,
    ...problems.map((problem) => `- ${problem}`),
  ].join('\n');
  return { ok, message, problems };
}
