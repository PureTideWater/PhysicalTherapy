import { NO_PRICING_RUNS, type PricingRunSource, impactLines, releaseDirectory, releaseRecords } from './impact';

/**
 * `pnpm release:dry-run <n>` (the load-release skill, step 3): what release n changes against the
 * release before it, and which pricing runs would price differently under it. Reads the release from
 * content/releases/<n> or, before it is published, content/outgoing/<n>.
 */
export function dryRun(root: string, release: number, runs: PricingRunSource = NO_PRICING_RUNS): string[] {
  const records = releaseRecords(releaseDirectory(root, release));
  return [`release:dry-run ${String(release)}: ${String(records.length)} records.`, ...impactLines(root, release, records, runs)];
}
