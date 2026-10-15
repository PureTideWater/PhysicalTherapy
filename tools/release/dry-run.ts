import path from 'node:path';

import { type PricingRunSource, recordChangeLines, releaseContents, releaseDirectory, runImpactLines } from './impact';

/**
 * `pnpm release:dry-run <n>` (the load-release skill, step 3; PRD 9, The release pipeline step 4):
 * what release n changes against the release before it, and, for every complete pricing run in the
 * database DATABASE_URL names (the staging snapshot in production use), how many of the run's lines
 * release n would price differently, worked out in memory (database-runs.ts): the impact list the
 * pull request carries. Reads the release from content/releases/<n> or, before it is published,
 * content/outgoing/<n> (or the directory given). Nothing is written.
 */
export interface DryRunRequest {
  readonly root: string;
  readonly release: number;
  readonly runs: PricingRunSource;
  /** The release's directory, when it is neither content/releases/<n> nor content/outgoing/<n> (tests). */
  readonly dir?: string;
}

export async function dryRun(request: DryRunRequest): Promise<string[]> {
  const dir = request.dir === undefined ? releaseDirectory(request.root, request.release) : path.resolve(request.dir);
  const release = releaseContents(dir, request.release);
  const impact = await request.runs.affectedRuns(release);
  return [
    `release:dry-run ${String(request.release)}: ${String(release.records.length)} records.`,
    ...recordChangeLines(request.root, request.release, release.records),
    '',
    ...runImpactLines(request.runs, impact),
  ];
}
