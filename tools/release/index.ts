import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { OWNER_ROLE, readDatabaseUrl } from '@tp/db';
import { ReleaseLoadError, loadRelease } from '@tp/rules/loader';
import pg from 'pg';

import { repositoryRoot } from '../content-files';
import { assembleRelease } from './assemble';
import { RELEASE_COMMANDS, ReleaseToolError, isReleaseCommand, parseReleaseNumber } from './commands';
import { dryRun } from './dry-run';

/**
 * pnpm release:assemble <n>                  content/drafts -> content/outgoing/<n> (verified drafts only)
 * pnpm release:dry-run <n>                   what release n changes, and which runs it would change
 * pnpm release:load <n> [--dir <directory>]  load content/releases/<n> (or a directory) into DATABASE_URL
 */
const USAGE = `usage: pnpm release:<${RELEASE_COMMANDS.join('|')}> <release-number>   (release:load also takes --dir <directory>)`;

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

const [command, ...rest] = process.argv.slice(2);
let parsed: { positionals: string[]; values: { dir?: string } };
try {
  parsed = parseArgs({ args: rest, options: { dir: { type: 'string' } }, allowPositionals: true, strict: true });
} catch {
  fail(USAGE, 2);
}
const release = parseReleaseNumber(parsed.positionals[0]);
if (!isReleaseCommand(command) || release === undefined || parsed.positionals.length !== 1 || (command !== 'load' && parsed.values.dir !== undefined)) {
  fail(USAGE, 2);
}

async function load(releaseNo: number, dirOption: string | undefined): Promise<void> {
  const dir =
    dirOption === undefined ? path.join(repositoryRoot, 'content', 'releases', String(releaseNo)) : path.resolve(process.env.INIT_CWD ?? process.cwd(), dirOption);
  if (!existsSync(dir)) {
    fail(`release:load: ${dir} does not exist; only published releases (content/releases/<n>) load unless --dir names another`);
  }
  const client = new pg.Client({ connectionString: readDatabaseUrl() });
  await client.connect();
  try {
    await client.query(`SET ROLE ${OWNER_ROLE}`);
    const result = await loadRelease(client, dir);
    if (result.releaseNo !== releaseNo) {
      fail(`release:load: ${dir} holds release ${String(result.releaseNo)}, not ${String(releaseNo)}`);
    }
    process.stdout.write(
      `release:load: release ${String(result.releaseNo)} ${result.status === 'loaded' ? 'loaded' : 'was already loaded'} (${String(result.records)} records, manifest ${result.manifestSha256}).\n`,
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
        `Next: pnpm verify-content, pnpm release:dry-run ${String(release)}, then a pull request titled "content: release ${String(release)}".`,
        '',
      ].join('\n'),
    );
  } else if (command === 'dry-run') {
    process.stdout.write(`${dryRun(repositoryRoot, release).join('\n')}\n`);
  } else {
    await load(release, parsed.values.dir);
  }
} catch (error) {
  if (error instanceof ReleaseToolError || error instanceof ReleaseLoadError) {
    fail(`release:${command}: ${error.message}`);
  }
  throw error;
}
