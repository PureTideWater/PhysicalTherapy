import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { type RuleRecord, canonicalJson, compareText, recordLabel } from '@tp/rules';
import type { RuleRelease } from '@tp/pricing';
import { readRelease } from '@tp/rules/content';

import { ReleaseToolError } from './commands';

/**
 * What a release changes against the one before it, and which pricing runs that touches (PRD
 * section 9, step 4: "a re-run of any earlier run under the new release produces a diff of changed
 * lines before anyone accepts it"; the load-release skill, step 3).
 */

export interface TypeChanges {
  readonly recordType: string;
  readonly added: number;
  readonly removed: number;
  /** Same rule and start date, different value or end date. */
  readonly changed: number;
}

/** A complete pricing run that would price some of its lines differently under the new release. */
export interface AffectedRun {
  readonly runId: string;
  readonly practiceId: string;
  /** The release the run is pinned to. */
  readonly releaseNo: number;
  /** The run's lines priced in memory, and how many of them the new release prices differently. */
  readonly lines: number;
  readonly changedLines: number;
}

/** What a run source found: how many complete runs it priced in memory, and the ones that would change. */
export interface RunsImpact {
  readonly runsChecked: number;
  readonly affected: readonly AffectedRun[];
}

/**
 * Where the pricing runs a dry run checks come from: the database it names (dry-run.ts), or none when
 * a release is assembled (RELEASE.md cannot depend on a database; the dry run's list goes in the pull
 * request).
 */
export interface PricingRunSource {
  readonly description: string;
  affectedRuns(release: RuleRelease): Promise<RunsImpact>;
}

/** Record changes by type between two releases (`previous` null for the first release). */
export function diffRecords(previous: readonly RuleRecord[] | null, next: readonly RuleRecord[]): TypeChanges[] {
  const index = (records: readonly RuleRecord[]) => new Map(records.map((record) => [recordLabel(record), record]));
  const before = index(previous ?? []);
  const after = index(next);
  const counts = new Map<string, { added: number; removed: number; changed: number }>();
  const count = (type: string, field: 'added' | 'removed' | 'changed') => {
    const entry = counts.get(type) ?? { added: 0, removed: 0, changed: 0 };
    entry[field] += 1;
    counts.set(type, entry);
  };
  for (const [label, record] of after) {
    const earlier = before.get(label);
    if (earlier === undefined) {
      count(record.record_type, 'added');
    } else if (canonicalJson([earlier.value, earlier.effective_to]) !== canonicalJson([record.value, record.effective_to])) {
      count(record.record_type, 'changed');
    }
  }
  for (const [label, record] of before) {
    if (!after.has(label)) {
      count(record.record_type, 'removed');
    }
  }
  return [...counts.entries()].sort(([a], [b]) => compareText(a, b)).map(([recordType, entry]) => ({ recordType, ...entry }));
}

/** The highest release number below `release` that exists in content/releases or content/outgoing. */
export function previousReleaseNumber(root: string, release: number): number | null {
  const numbers = ['content/releases', 'content/outgoing'].flatMap((parent) => {
    try {
      return readdirSync(path.join(root, parent)).filter((name) => /^[1-9]\d*$/.test(name)).map((name) => Number.parseInt(name, 10));
    } catch {
      return [];
    }
  });
  const earlier = numbers.filter((number) => number < release);
  return earlier.length === 0 ? null : Math.max(...earlier);
}

/** The directory of release `n`: published (content/releases) first, then prepared (content/outgoing). */
export function releaseDirectory(root: string, release: number): string {
  for (const parent of ['content/releases', 'content/outgoing']) {
    // The content checkout is read at run time; the web server's bundler must not trace it.
    const dir = path.join(/*turbopackIgnore: true*/ root, parent, String(release));
    if (existsSync(dir)) {
      return dir;
    }
  }
  throw new ReleaseToolError(`release ${String(release)} is neither in content/releases nor in content/outgoing`);
}

/** The records of a release directory, refusing one that does not verify. */
export function releaseRecords(dir: string): RuleRecord[] {
  const contents = readRelease(dir);
  if (contents.problems.length > 0) {
    throw new ReleaseToolError([`${dir} does not verify:`, ...contents.problems.slice(0, 20).map((problem) => `  ${problem}`)].join('\n'));
  }
  return contents.records.map((located) => located.record);
}

/** The records of a release directory with its manifest's SHA-256, refusing one that does not verify. */
export function releaseContents(dir: string, release: number): RuleRelease {
  const contents = readRelease(dir);
  if (contents.problems.length > 0) {
    throw new ReleaseToolError([`${dir} does not verify:`, ...contents.problems.slice(0, 20).map((problem) => `  ${problem}`)].join('\n'));
  }
  return { releaseNo: release, manifestSha256: contents.manifestSha256, records: contents.records.map((located) => located.record) };
}

/** What `next` as release `release` changes against the release before it, by record type. */
export function recordChangeLines(root: string, release: number, next: readonly RuleRecord[]): string[] {
  const previous = previousReleaseNumber(root, release);
  const changes = diffRecords(previous === null ? null : releaseRecords(releaseDirectory(root, previous)), next);
  const lines = [
    previous === null
      ? `Release ${String(release)} is the first release: every record is new.`
      : `Against release ${String(previous)}:`,
    ...changes.map(
      (change) => `- ${change.recordType}: ${String(change.added)} added, ${String(change.removed)} removed, ${String(change.changed)} changed`,
    ),
  ];
  if (previous !== null && changes.length === 0) {
    lines.push('- no record changes');
  }
  return lines;
}

/** The impact RELEASE.md records: the record changes, and where the runs whose lines would change are listed. */
export function impactLines(root: string, release: number, next: readonly RuleRecord[]): string[] {
  return [
    ...recordChangeLines(root, release, next),
    '',
    `The pricing runs whose lines would change are listed by \`pnpm release:dry-run ${String(release)}\` against the staging snapshot, in the pull request (the load-release skill).`,
  ];
}

/** The dry run's list of runs: each run whose lines would change, with how many of its lines. */
export function runImpactLines(source: PricingRunSource, impact: RunsImpact): string[] {
  if (impact.affected.length === 0) {
    return [`${source.description}: ${String(impact.runsChecked)} complete run(s) priced in memory, and no run's lines would change.`];
  }
  return [
    `${source.description}: ${String(impact.runsChecked)} complete run(s) priced in memory. Runs whose lines would change:`,
    ...impact.affected.map(
      (run) => `- run ${run.runId} (practice ${run.practiceId}, release ${String(run.releaseNo)}): ${String(run.changedLines)} of ${String(run.lines)} line(s)`,
    ),
  ];
}
