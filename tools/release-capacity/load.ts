import path from 'node:path';

import { databaseClient } from '@tp/db';
import { loadRelease } from '@tp/rules/loader';

/**
 * Loads a SYNTHETIC scale release into the weekly real-size test's scratch database (audit #31; docs/adr/0071): the
 * release loader itself, with its synthetic test option, as the owner, in a child process so the loader's copy of 4.2
 * million records is never held beside the measurement. The release number is the one the harness built (900110, or
 * 900100), which tools/screening-capacity/load.ts fixes at 900100. It prints the result's counts and the manifest's
 * SHA-256 only.
 *
 *   tsx tools/release-capacity/load.ts <owner database URL> <release directory> <release number>
 */

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [url, dir, number] = process.argv.slice(2);
  const release = Number.parseInt(number ?? '', 10);
  if (url === undefined || dir === undefined || !Number.isInteger(release)) {
    process.stderr.write('usage: tsx tools/release-capacity/load.ts <owner database URL> <release directory> <release number>\n');
    process.exit(2);
  }
  const client = databaseClient(url);
  await client.connect();
  try {
    const started = performance.now();
    const result = await loadRelease(client, dir, { release, allowSyntheticFixtureForTests: true });
    process.stdout.write(`${JSON.stringify({ ...result, seconds: Math.round((performance.now() - started) / 100) / 10 })}\n`);
  } finally {
    await client.end();
  }
}
