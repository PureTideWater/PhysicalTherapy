import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { COVERAGE_FILE, ContentSummaryBuilder, type ContentId, type DateRange, type RuleRecord, describeIssues, mergeRanges, readJsonBlock, releaseCoverageSchema } from '@tp/rules';
import type { ContentState, ContentStates, DueSources } from '@tp/rules/calendar';
import { type RecordFileContents, isRecordFile, listContentFiles, readRecordFile } from '@tp/rules/content';

/**
 * The content the content calendar judges (audit #59; docs/adr/0071; docs/runbooks/content-updates.md), read from a
 * checkout: the newest published release's COVERAGE.md (content/releases/<n>) as the state in force, and every prepared
 * release's COVERAGE.md (content/outgoing/<n>) with the drafts as the pending state. Shared by the content-calendar
 * CLI and the console's Content due (`@tp/tools/content-calendar`). Every input that cannot be read is a problem, never
 * an empty state: an unreadable input never reads as "nothing due". The drafts are summarised a file at a time, so no
 * two files' records are held at once (the PTP drafts alone reach about 2 million records).
 */

const RELEASE_NUMBER = /^[1-9]\d*$/;

/** What a content summary (COVERAGE.md's, or the drafts') says the calendar needs. */
interface Summary {
  readonly content: ContentId;
  readonly windows: readonly DateRange[];
  readonly newest_from: string;
  readonly newest_retrieved: string;
}

export interface CalendarSources {
  readonly sources: DueSources;
  /** Problems reading the inputs; any one fails the calendar closed. */
  readonly problems: readonly string[];
}

/** Seams for the tests: the record-file reader and the summary builder the drafts go through. */
export interface SourceReaders {
  readonly readRecordFile?: (file: string, where: string) => RecordFileContents;
  readonly newBuilder?: () => { add(record: RuleRecord): void; summaries(): Summary[] };
}

/** The numbered directories under `parent`, ascending. A parent that does not exist yet holds none; any other failure throws. */
function releaseNumbers(root: string, parent: string): number[] {
  let names: string[];
  try {
    // The content checkout is read at run time; the web server's bundler must not trace it.
    names = readdirSync(path.join(/*turbopackIgnore: true*/ root, parent));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  return names
    .filter((name) => RELEASE_NUMBER.test(name))
    .map((name) => Number.parseInt(name, 10))
    .sort((a, b) => a - b);
}

/** A release's COVERAGE.md contents, or the problems that keep it from being read. */
function readCoverage(root: string, parent: string, release: number, problems: string[]): Summary[] {
  const where = `${parent}/${String(release)}/${COVERAGE_FILE}`;
  let text: string;
  try {
    text = readFileSync(path.join(/*turbopackIgnore: true*/ root, parent, String(release), COVERAGE_FILE), 'utf8');
  } catch {
    problems.push(`${where} cannot be read`);
    return [];
  }
  const block = readJsonBlock(text);
  if (block.problems.length > 0) {
    problems.push(...block.problems.map((problem) => `${where}: ${problem}`));
    return [];
  }
  const parsed = releaseCoverageSchema.safeParse(block.value);
  if (!parsed.success) {
    problems.push(...describeIssues(parsed.error).map((issue) => `${where}: ${issue}`));
    return [];
  }
  if (parsed.data.release !== release) {
    problems.push(`${where}: names release ${String(parsed.data.release)}, not ${String(release)}`);
    return [];
  }
  return parsed.data.contents;
}

/** Per content, the summaries merged: their windows joined, the newest start and the newest retrieval. */
export function contentStates(summaries: Iterable<Summary>): ContentStates {
  const states = new Map<ContentId, { windows: DateRange[]; newestFrom: string; newestRetrieved: string }>();
  for (const summary of summaries) {
    const state = states.get(summary.content);
    if (state === undefined) {
      states.set(summary.content, { windows: [...summary.windows], newestFrom: summary.newest_from, newestRetrieved: summary.newest_retrieved });
      continue;
    }
    state.windows.push(...summary.windows);
    state.newestFrom = summary.newest_from > state.newestFrom ? summary.newest_from : state.newestFrom;
    state.newestRetrieved = summary.newest_retrieved > state.newestRetrieved ? summary.newest_retrieved : state.newestRetrieved;
  }
  const result: Partial<Record<ContentId, ContentState>> = {};
  for (const [content, state] of states) {
    result[content] = { windows: mergeRanges(state.windows), newestFrom: state.newestFrom, newestRetrieved: state.newestRetrieved };
  }
  return result;
}

/** The drafts summarised file by file: each file's records go into one builder and are dropped before the next is read. */
function draftSummaries(root: string, problems: string[], readers: SourceReaders): Summary[] {
  const read = readers.readRecordFile ?? readRecordFile;
  const builder = readers.newBuilder?.() ?? new ContentSummaryBuilder();
  const drafts = path.join(/*turbopackIgnore: true*/ root, 'content', 'drafts');
  for (const file of listContentFiles(drafts)) {
    if (file.symlink || !isRecordFile(file.path)) {
      continue;
    }
    const contents = read(path.join(drafts, file.path), `content/drafts/${file.path}`);
    problems.push(...contents.problems);
    for (const located of contents.records) {
      builder.add(located.record);
    }
  }
  return builder.summaries();
}

/** The pending state alone: the prepared releases' COVERAGE.md contents and the drafts, merged per content. */
export function readPendingStates(root: string, readers: SourceReaders = {}): { readonly pending: ContentStates; readonly problems: readonly string[] } {
  const problems: string[] = [];
  const prepared = releaseNumbers(root, 'content/outgoing').flatMap((release) => readCoverage(root, 'content/outgoing', release, problems));
  const pending = contentStates([...prepared, ...draftSummaries(root, problems, readers)]);
  return { pending, problems };
}

/**
 * The sources contentDue() judges: the newest published release (null when none is) and its COVERAGE.md contents as
 * the state in force, the prepared releases and the drafts as pending, and the number the next assembly takes. The
 * newest published release in the repository may not yet be the release production has loaded; the console's Content
 * due reads the release in force from the database instead.
 */
export function readCalendarSources(root: string, readers: SourceReaders = {}): CalendarSources {
  const problems: string[] = [];
  const published = releaseNumbers(root, 'content/releases');
  const prepared = releaseNumbers(root, 'content/outgoing');
  const releaseNo = published.at(-1) ?? null;
  const inForce = releaseNo === null ? {} : contentStates(readCoverage(root, 'content/releases', releaseNo, problems));
  const pending = readPendingStates(root, readers);
  problems.push(...pending.problems);
  const nextReleaseNo = Math.max(0, ...published, ...prepared) + 1;
  return { sources: { releaseNo, inForce, pending: pending.pending, nextReleaseNo }, problems };
}
