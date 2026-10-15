import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { OWNER_ROLE, openPool, readDatabaseUrl } from '@tp/db';
import { FIRST_SYNTHETIC_RELEASE } from '@tp/rules';
import { ReleaseLoadError, loadRelease } from '@tp/rules/loader';
import pg from 'pg';

import { repositoryRoot } from '../content-files';
import { assembleRelease } from './assemble';
import { RELEASE_COMMANDS, ReleaseToolError, isReleaseCommand, parseReleaseNumber } from './commands';
import { dryRun } from './dry-run';
import { loadDirectoryRefusal } from './load-directory';
import { rollbackRelease } from './rollback';

/**
 * pnpm release:assemble <n>                  content/drafts at L2+ -> content/outgoing/<n> (L1 drafts listed, left out)
 * pnpm release:dry-run <n>                   what release n changes, and how many lines of each complete run in DATABASE_URL it would change
 * pnpm release:load <n> [--dir <directory>]  load content/releases/<n> (or a directory) into DATABASE_URL
 * pnpm release:rollback <n> --reason <text>  withdraw release n in DATABASE_URL, loading the published release before it if needed
 */
const USAGE = [
  `usage: pnpm release:<${RELEASE_COMMANDS.join('|')}> <release-number>   (release:load also takes --dir <directory>; release:rollback needs --reason <text>)`,
  `Release numbers run from 1 to ${String(FIRST_SYNTHETIC_RELEASE - 1)}; ${String(FIRST_SYNTHETIC_RELEASE)} and above are reserved for SYNTHETIC fixture releases.`,
].join('\n');

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

const [command, ...rest] = process.argv.slice(2);
let parsed: { positionals: string[]; values: { dir?: string; reason?: string } };
try {
  parsed = parseArgs({ args: rest, options: { dir: { type: 'string' }, reason: { type: 'string' } }, allowPositionals: true, strict: true });
} catch {
  fail(USAGE, 2);
}
const release = parseReleaseNumber(parsed.positionals[0]);
if (
  !isReleaseCommand(command) ||
  release === undefined ||
  parsed.positionals.length !== 1 ||
  (command !== 'load' && parsed.values.dir !== undefined) ||
  (command === 'rollback') !== (parsed.values.reason !== undefined)
) {
  fail(USAGE, 2);
}

async function load(releaseNo: number, dirOption: string | undefined): Promise<void> {
  const dir =
    dirOption === undefined ? path.join(repositoryRoot, 'content', 'releases', String(releaseNo)) : path.resolve(process.env.INIT_CWD ?? process.cwd(), dirOption);
  const refusal = loadDirectoryRefusal(repositoryRoot, dir);
  if (refusal !== undefined) {
    fail(`release:load: ${refusal}`);
  }
  if (!existsSync(dir)) {
    fail(`release:load: ${dir} does not exist; only published releases (content/releases/<n>) load unless --dir names another`);
  }
  const client = new pg.Client({ connectionString: readDatabaseUrl() });
  await client.connect();
  try {
    await client.query(`SET ROLE ${OWNER_ROLE}`);
    // The loader checks the manifest's number, the verification levels and the synthetic marks
    // before it opens a transaction, so a refused release leaves nothing behind.
    const result = await loadRelease(client, dir, { release: releaseNo });
    process.stdout.write(
      `release:load: release ${String(result.releaseNo)} ${result.status === 'loaded' ? 'loaded' : 'was already loaded'} (${String(result.records)} records, manifest ${result.manifestSha256}).\n`,
    );
  } finally {
    await client.end();
  }
}

async function rollback(releaseNo: number, reason: string): Promise<void> {
  const client = new pg.Client({ connectionString: readDatabaseUrl() });
  await client.connect();
  try {
    await client.query(`SET ROLE ${OWNER_ROLE}`);
    const result = await rollbackRelease(client, { root: repositoryRoot, release: releaseNo, reason });
    process.stdout.write(
      [
        ...(result.loaded === null ? [] : [`release:rollback: release ${String(result.loaded)} loaded from content/releases.`]),
        `release:rollback: release ${String(result.releaseNo)} withdrawn; release ${String(result.reinstatedReleaseNo)} is in force again.`,
        `Runs pinned to release ${String(result.releaseNo)} keep every line and are flagged; the Pricing runs screen offers to price them again under release ${String(result.reinstatedReleaseNo)}.`,
        '',
      ].join('\n'),
    );
  } finally {
    await client.end();
  }
}

try {
  if (command === 'assemble') {
    const result = assembleRelease({ root: repositoryRoot, release, today: new Date().toISOString().slice(0, 10) });
    process.stdout.write(
      [
        `release:assemble: ${result.dir} holds ${String(result.records)} records in ${String(result.files.length)} files (MANIFEST.json sha256 ${result.manifestSha256}).`,
        ...(result.excluded === 0 ? [] : [`${String(result.excluded)} draft record(s) below L2 stay in content/drafts; RELEASE.md lists them under "Drafts not in this release".`]),
        `Next: pnpm verify-content, pnpm release:dry-run ${String(release)}, then a pull request titled "content: release ${String(release)}".`,
        '',
      ].join('\n'),
    );
  } else if (command === 'dry-run') {
    // The worker's pricing modules load only for the dry run, so the other commands start quickly.
    const { databaseRuns } = await import('./database-runs');
    const pool = openPool(readDatabaseUrl(), 2);
    try {
      process.stdout.write(`${(await dryRun({ root: repositoryRoot, release, runs: databaseRuns(pool) })).join('\n')}\n`);
    } finally {
      await pool.end();
    }
  } else if (command === 'rollback') {
    await rollback(release, parsed.values.reason ?? '');
  } else {
    await load(release, parsed.values.dir);
  }
} catch (error) {
  if (error instanceof ReleaseToolError || error instanceof ReleaseLoadError) {
    fail(`release:${command}: ${error.message}`);
  }
  throw error;
}
