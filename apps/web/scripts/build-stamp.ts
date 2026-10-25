import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The commit a production build was made from (test matrix CI-06; docs/adr/0066). CI builds the web app once, in its
 * build job, stamps the build with the commit (apps/web/.next/BUILD_COMMIT) and hands it to every e2e shard; each shard
 * runs it with E2E_PREBUILT=1, and playwright.config.ts starts it only after
 *
 *   tsx scripts/build-stamp.ts --expect "$(git rev-parse HEAD)"
 *
 * passes, so a journey never runs a build of another commit, or a build nobody stamped. `--write <commit>` stamps one.
 * A stamp names a commit, so it vouches only for a build of that commit's tree: both refuse a working tree with
 * uncommitted changes (CI's checkouts are clean; the local flow in docs/runbooks/ci.md builds and stamps a clean tree).
 * The verdict, a pass included, goes to stderr, which the e2e web server keeps in the run's log. Paths are apps/web's
 * own, wherever this runs from.
 */

export const STAMP = path.resolve(import.meta.dirname, '../.next/BUILD_COMMIT');

/** apps/web, in the working tree the stamp vouches for. */
const APP = path.resolve(import.meta.dirname, '..');

/** A full commit name: SHA-1's 40 hexadecimal digits, or SHA-256's 64. */
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export class BuildStampError extends Error {
  override readonly name = 'BuildStampError';
}

function commitOf(value: string, what: string): string {
  const commit = value.trim();
  if (!COMMIT.test(commit)) {
    throw new BuildStampError(`${what} is not a full commit name: ${JSON.stringify(commit.slice(0, 80))}`);
  }
  return commit;
}

/**
 * The working tree's uncommitted changes, as `git status --porcelain` lists them: every change to a tracked file, staged
 * or not, and every file git does not ignore. Read without the index's optional lock, so a run beside other git work
 * takes none.
 */
export function treeChanges(cwd: string = APP): string[] {
  let status: string;
  try {
    status = execFileSync('git', ['--no-optional-locks', 'status', '--porcelain=v1', '--untracked-files=normal'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    throw new BuildStampError(`cannot read the working tree at ${cwd} with git status (${error instanceof Error ? error.message.split('\n')[0] : String(error)}), so no stamp can vouch for it`);
  }
  return status.split('\n').filter((line) => line !== '');
}

/** Refuses a tree with uncommitted changes, naming the first five; `doing` is what is refused. */
function checkClean(changes: readonly string[], doing: string): void {
  if (changes.length === 0) return;
  const named = changes.slice(0, 5).map((change) => change.trim());
  const listed = changes.length > 5 ? `${named.join(', ')} and ${String(changes.length - 5)} more` : named.join(', ');
  throw new BuildStampError(`the working tree has uncommitted changes (${listed}): a stamp names a commit, so it vouches only for a build of a clean tree; refusing to ${doing}`);
}

/** Writes the stamp: the build at `stamp` was made from `commit`. */
export function writeStamp(commit: string, stamp: string = STAMP): void {
  writeFileSync(stamp, `${commitOf(commit, 'the commit to stamp')}\n`);
}

/** Returns the stamped commit when it is `expected`; throws when the stamp is missing, malformed or another commit's. */
export function checkStamp(expected: string, stamp: string = STAMP): string {
  const want = commitOf(expected, 'the expected commit');
  let text: string;
  try {
    text = readFileSync(stamp, 'utf8');
  } catch {
    throw new BuildStampError(`no build stamp at ${stamp}: E2E_PREBUILT=1 runs only a build stamped with its commit (unset it to build here)`);
  }
  const built = commitOf(text, `the build stamp at ${stamp}`);
  if (built !== want) {
    throw new BuildStampError(`the build at ${path.dirname(stamp)} was made from ${built}, not ${want}: refusing to run a build of another commit`);
  }
  return built;
}

/**
 * The command line: `--expect <commit>` checks the stamp, `--write <commit>` writes it, each on a clean working tree
 * (`changes` reads it); what it did, or a BuildStampError.
 */
export function run(argv: readonly string[], stamp: string = STAMP, changes: () => readonly string[] = treeChanges): string {
  const [flag, commit, ...rest] = argv;
  if ((flag !== '--expect' && flag !== '--write') || commit === undefined || rest.length > 0) {
    throw new BuildStampError('usage: tsx scripts/build-stamp.ts --expect <commit> | --write <commit>');
  }
  if (flag === '--write') {
    checkClean(changes(), 'stamp this one');
    writeStamp(commit, stamp);
    return `stamped ${commit.trim()}`;
  }
  const built = checkStamp(commit, stamp);
  checkClean(changes(), 'run this one');
  return `the build is ${built}'s`;
}

// The verdict goes to stderr either way: the e2e web server keeps only its stderr, as [WebServer] lines in the run's
// log (playwright.config.ts), so the log shows the build every shard ran as well as every refusal.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    process.stderr.write(`build-stamp: ${run(process.argv.slice(2))}\n`);
  } catch (error) {
    process.stderr.write(`build-stamp: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
