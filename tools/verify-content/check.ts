import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
  FIRST_SYNTHETIC_RELEASE,
  MANIFEST_FILE,
  type RuleRecord,
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
} from '@tp/rules';
import { type ContentFile, fixtureFileHashes, isRecordFile, listContentFiles, readRecordFile, readSecondPassFile } from '@tp/rules/content';

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
 *   fixture file, or a reserved SYNTHETIC identifier), or real data in a fixture.
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
      entries = readdirSync(path.join(root, parent), { withFileTypes: true });
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

/** Every problem in one content set, each prefixed with where it is. */
export function checkContentSet(root: string, set: ContentSet, readSource = sourceReader(root)): { problems: string[]; records: number } {
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
  return { problems, records: located.length };
}

/**
 * Checks the default content sets, or the directories given (relative to `root` or absolute).
 * Passes only when every set is free of problems.
 */
export function checkContent(root: string, dirs: readonly string[] = []): CheckResult {
  const { sets, problems } = dirs.length === 0 ? defaultContentSets(root) : { sets: dirs.map((dir) => contentSetAt(root, dir)), problems: [] };
  const readSource = sourceReader(root);
  const summary: string[] = [];
  for (const set of sets) {
    const result = checkContentSet(root, set, readSource);
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
