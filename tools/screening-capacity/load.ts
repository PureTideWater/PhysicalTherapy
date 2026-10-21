import path from 'node:path';

import { databaseClient } from '@tp/db';
import { SCALE_RELEASE_NUMBER } from '@tp/synth';
import { loadRelease } from '@tp/rules/loader';

/**
 * Loads the scale release into the capacity test's scratch database (audit #53 part 1; docs/adr/0062): the release
 * loader itself, with its synthetic test option, which only the scratch databases of tests and this harness pass, as
 * the owner. Run as a child process so the loader's copy of 2.2 million records is never held during a measurement.
 * It prints the result's counts and the manifest's SHA-256 only.
 *
 *   tsx tools/screening-capacity/load.ts <owner database URL> <release directory>
 */

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [url, dir] = process.argv.slice(2);
  if (url === undefined || dir === undefined) {
    process.stderr.write('usage: tsx tools/screening-capacity/load.ts <owner database URL> <release directory>\n');
    process.exit(2);
  }
  const client = databaseClient(url);
  await client.connect();
  try {
    const started = performance.now();
    const result = await loadRelease(client, dir, { release: SCALE_RELEASE_NUMBER, allowSyntheticFixtureForTests: true });
    process.stdout.write(`${JSON.stringify({ ...result, seconds: Math.round((performance.now() - started) / 100) / 10 })}\n`);
  } finally {
    await client.end();
  }
}
