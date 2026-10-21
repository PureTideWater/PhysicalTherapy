import path from 'node:path';

import { databaseClient } from '@tp/db';
import { legacyOutcomes, outcomesSha256, storedOutcomes } from '@tp/worker/screening-oracle';

/**
 * The capacity test's equality check at production shape (audit #53 part 1, step 9; docs/adr/0062): for each run
 * named, the SHA-256 of its stored rows' outcomes and of what the old read path and adapter (frozen at 3c1b289 in
 * apps/worker/src/screening/test-support) give for the same run, each a canonical line per Medicare row. It runs in a
 * child process, unlimited, after the browsers close, so the old path's whole-release copy is never held during a
 * measurement. It prints counts and hashes only.
 *
 *   tsx tools/screening-capacity/oracle.ts <owner database URL> <run id>...
 */

export interface OracleResult {
  readonly runId: string;
  readonly rows: number;
  readonly storedSha256: string;
  readonly oracleSha256: string;
}

export async function compareRuns(ownerUrl: string, runIds: readonly string[]): Promise<OracleResult[]> {
  const client = databaseClient(ownerUrl);
  await client.connect();
  try {
    const results: OracleResult[] = [];
    for (const runId of runIds) {
      const stored = await storedOutcomes(client, runId);
      const oracle = await legacyOutcomes(client, runId);
      results.push({ runId, rows: stored.size, storedSha256: outcomesSha256(stored), oracleSha256: outcomesSha256(oracle) });
    }
    return results;
  } finally {
    await client.end();
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [url, ...runs] = process.argv.slice(2);
  if (url === undefined || runs.length === 0) {
    process.stderr.write('usage: tsx tools/screening-capacity/oracle.ts <owner database URL> <run id>...\n');
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify(await compareRuns(url, runs))}\n`);
}
