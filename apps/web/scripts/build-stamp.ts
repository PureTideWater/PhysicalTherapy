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
 * Paths are apps/web's own, wherever this runs from.
 */

export const STAMP = path.resolve(import.meta.dirname, '../.next/BUILD_COMMIT');

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

/** The command line: `--expect <commit>` checks the stamp, `--write <commit>` writes it; what it did, or a BuildStampError. */
export function run(argv: readonly string[], stamp: string = STAMP): string {
  const [flag, commit, ...rest] = argv;
  if ((flag !== '--expect' && flag !== '--write') || commit === undefined || rest.length > 0) {
    throw new BuildStampError('usage: tsx scripts/build-stamp.ts --expect <commit> | --write <commit>');
  }
  if (flag === '--write') {
    writeStamp(commit, stamp);
    return `stamped ${commit.trim()}`;
  }
  return `the build is ${checkStamp(commit, stamp)}'s`;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    process.stdout.write(`build-stamp: ${run(process.argv.slice(2))}\n`);
  } catch (error) {
    process.stderr.write(`build-stamp: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
