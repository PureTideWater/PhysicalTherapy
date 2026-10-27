import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

/**
 * The browser build check (docs/adr/0058; test matrix CI-18; docs/runbooks/ci.md, "Upgrading the browser"): the
 * Chromium builds Playwright installed are the ones apps/web/e2e/browser.json records, every file of them, so the
 * brand baselines are compared, and the worker's PDFs printed, by the browser that made them.
 *
 *   node tools/ci/browser-build.ts [--list]
 *   node tools/ci/browser-build.ts --image <ref> [--list]
 *
 * It reads browser.json and the browsers.json of the playwright-core the web tests run (found through
 * apps/web's @playwright/test → playwright → playwright-core, since pnpm hoists none of them), requires their
 * revision and Chrome for Testing version to agree, finds both builds (the headless shell, which renders the
 * baselines, and full Chromium, which playwright.config.ts probes for) under PLAYWRIGHT_BROWSERS_PATH or
 * ~/.cache/ms-playwright, and computes each build's tree SHA-256 and its binary's SHA-256. The tree SHA-256 is the
 * SHA-256 of the lines "<sha256>  <path>\n" of every regular file under the build's directory, sorted by path bytes:
 *
 *   cd <revision dir> && find <dir> -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum
 *
 * and those lines are committed beside browser.json as browser-builds/<dir>.sha256, whose own SHA-256 is the recorded
 * tree SHA-256, so a build that differs is named down to its files. Playwright verifies no download and the CI
 * cache restores browsers by key alone, so every file counts: the software GL that draws the pictures, the ICU data
 * and the resources as much as the binary. Any difference fails, with what was found and what is recorded, and prints
 * every file's line of the build found, as --list does; on a tree difference at the recorded revision it also names
 * every path whose line differs from the committed list. So one run gives all a new record needs (a Playwright
 * upgrade's, or a mirror's other bytes).
 *
 * With --image it checks a built worker image instead and needs no node_modules: the image's own
 * node_modules/playwright-core/browsers.json and the headless shell's tree, hashed inside the image by the command
 * above, each read with `docker run --rm --pull never --user 0:0 --network none --entrypoint <cat|sh>`: only the local
 * tag (a tag missing here fails, never pulled and checked in place of the image just built), as root, so the image's
 * runtime user cannot hide a file from the hash (Chrome for Testing's deb.deps and rpm.deps are mode 0600), and offline.
 * The worker prints customers' PDFs with that headless shell.
 *
 * The hashes cover a build's bytes, not its files' modes nor what the system provides (shared libraries, fonts), so a
 * build equal to the record in every file can still fail to start: a library missing from the runner or the image, or
 * a binary its user may not run. So once every file of a build equals the record, and only then (a binary is never run
 * before its bytes are proven), the check runs `<binary> --version` and fails unless it exits 0 printing exactly
 * "Google Chrome for Testing <browserVersion>", naming what it printed. On the runner it runs as the job's user; with
 * --image it runs in a container of the image as the image's own user (`docker run --rm --pull never --network none`,
 * no --user), the user the worker prints PDFs as, so the check also proves that user can start the shell, while the
 * hashes stay root's.
 *
 * Run by Node 24 directly, with no install: Node's own modules and erasable TypeScript only (browser-build.test.ts
 * holds that). --list prints every file's line of each build found; a build that fails the check has them printed anyway.
 */

const ROOT = path.resolve(import.meta.dirname, '../..');
/** The record of the browser build: what every install must equal. */
export const RECORD = path.join(ROOT, 'apps/web/e2e/browser.json');
/** The manifest the e2e tests' @playwright/test is resolved from. */
export const WEB_MANIFEST = path.join(ROOT, 'apps/web/package.json');
const PROCEDURE = "A Playwright upgrade needs ADR 0058's baseline procedure: docs/runbooks/ci.md, 'Upgrading the browser'.";
/** Playwright's markers, written beside the build's directory, never under it. */
const MARKERS = new Set(['INSTALLATION_COMPLETE', 'DEPENDENCIES_VALIDATED']);
const HEX64 = /^[0-9a-f]{64}$/;

export type BuildName = 'chromium-headless-shell' | 'chromium';

/** How each build is named in the messages, and the folder Playwright installs it in (<folder>-<revision>). */
export const BUILDS: Readonly<Record<BuildName, { readonly title: string; readonly folder: string }>> = {
  'chromium-headless-shell': { title: 'The headless shell', folder: 'chromium_headless_shell' },
  chromium: { title: 'Chromium', folder: 'chromium' },
};

export interface RecordedBuild {
  /** The build's directory, under the revision's folder (chrome-headless-shell-linux64). */
  readonly dir: string;
  /** The binary, under the revision's folder (chrome-headless-shell-linux64/chrome-headless-shell). */
  readonly path: string;
  /** The SHA-256 of every regular file's "<sha256>  <path>" line, sorted by path bytes: what the check holds. */
  readonly treeSha256: string;
  /** The binary's SHA-256: named in the message. */
  readonly sha256: string;
  /** Google's Chrome for Testing zip of the build, and its SHA-256: the local layout's pin. */
  readonly zip: string;
  readonly zipSha256: string;
}

export interface BrowserRecord {
  readonly revision: string;
  readonly browserVersion: string;
  readonly builds: Readonly<Record<BuildName, RecordedBuild>>;
}

/** What was found of one build: by revision and version from browsers.json, by hashes from the files. */
export interface FoundBuild {
  readonly revision: string;
  readonly browserVersion: string;
  /** The build's directory under the revision's folder, or null when no build is there. */
  readonly dir: string | null;
  /** Each regular file's "<sha256>  <path>" line, sorted by path bytes. */
  readonly lines: readonly string[];
  /** Entries under the build's directory no tree SHA-256 covers: neither a regular file nor a directory (a symbolic link,
   * say), or a file the check cannot read (marked "(unreadable)"). */
  readonly others: readonly string[];
  /** What kept a file from being hashed (a tool that failed, a file found but given no line): each fails the check as a
   * problem of its own, never as a file the build lacks, since the file is there and only its bytes are unknown. */
  readonly faults: readonly string[];
  /** `<binary> --version`, run only once every file of the build equals the record: what it did, or why it was not run. */
  readonly version: VersionRun;
  /** Where the build was looked for (a folder, or an image's). */
  readonly where: string;
}

/** `<binary> --version` as run (by whom, its first line of output, how it ended), or why it was not run. */
export type VersionRun =
  | { readonly ran: true; readonly by: string; readonly line: string; readonly status: number | null; readonly signal: string | null; readonly error: string | null }
  | { readonly ran: false; readonly why: string };

/** What every recorded build's binary prints for --version: Chrome for Testing's name and the recorded version. */
export function expectedVersion(record: BrowserRecord): string {
  return `Google Chrome for Testing ${record.browserVersion}`;
}

/** The record, read and checked for shape: a malformed record is a failure of its own, never a pass. */
export function readRecord(file: string): BrowserRecord {
  const value = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  const problems: string[] = [];
  const record = value as Partial<BrowserRecord> | null;
  if (typeof record?.revision !== 'string' || !/^\d+$/.test(record.revision)) problems.push('revision is not a string of digits');
  if (typeof record?.browserVersion !== 'string' || !/^\d+(?:\.\d+){3}$/.test(record.browserVersion)) problems.push('browserVersion is not a four-part version');
  for (const name of Object.keys(BUILDS) as BuildName[]) {
    const build = record?.builds?.[name];
    if (build === undefined) {
      problems.push(`builds.${name} is missing`);
      continue;
    }
    if (typeof build.dir !== 'string' || !/^[\w.-]+$/.test(build.dir)) problems.push(`builds.${name}.dir is not one plain directory name`);
    if (typeof build.path !== 'string' || !build.path.startsWith(`${build.dir}/`) || build.path.split('/').includes('..')) problems.push(`builds.${name}.path is not under its dir`);
    for (const key of ['treeSha256', 'sha256', 'zipSha256'] as const) {
      if (typeof build[key] !== 'string' || !HEX64.test(build[key])) problems.push(`builds.${name}.${key} is not a SHA-256`);
    }
    if (typeof build.zip !== 'string' || !build.zip.endsWith('.zip')) problems.push(`builds.${name}.zip is not a zip's name`);
  }
  if (problems.length > 0) throw new Error(`${file}: ${problems.join('; ')}`);
  return value as BrowserRecord;
}

/** The committed file list a build's tree SHA-256 is the hash of: browser-builds/<dir>.sha256 beside the record. */
export function listFile(recordFile: string, build: RecordedBuild): string {
  return path.join(path.dirname(recordFile), 'browser-builds', `${build.dir}.sha256`);
}

export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** The tree SHA-256 of a list of lines: what `… | sha256sum` prints for them. */
export function treeSha256(lines: readonly string[]): string {
  return sha256(lines.map((line) => `${line}\n`).join(''));
}

const byPathBytes = (left: string, right: string) => Buffer.compare(Buffer.from(left.slice(66)), Buffer.from(right.slice(66)));

/**
 * The lines of every regular file under <revisionDir>/<dir>, as the shell form prints them, and every other entry
 * (anything but a file or a directory, or a name sha256sum would print escaped), which fails the check.
 */
export function treeLines(revisionDir: string, dir: string): { lines: string[]; others: string[] } {
  const lines: string[] = [];
  const others: string[] = [];
  const walk = (relative: string) => {
    for (const name of readdirSync(path.join(revisionDir, relative))) {
      const child = `${relative}/${name}`;
      const stat = lstatSync(path.join(revisionDir, child));
      if (stat.isDirectory()) walk(child);
      else if (stat.isFile() && !/[\\\n]/.test(child)) lines.push(`${sha256(readFileSync(path.join(revisionDir, child)))}  ${child}`);
      else others.push(child);
    }
  };
  walk(dir);
  return { lines: lines.sort(byPathBytes), others: others.sort() };
}

/** The installed playwright-core's directory, through @playwright/test → playwright → playwright-core from a manifest. */
export function playwrightCore(fromManifest: string): string {
  let manifest = fromManifest;
  for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
    manifest = createRequire(manifest).resolve(`${name}/package.json`);
  }
  return path.dirname(manifest);
}

/** A build's revision and version as a playwright-core's browsers.json pins them. */
export function pinned(browsersJson: string, name: BuildName): { revision: string; browserVersion: string } {
  const browsers = (JSON.parse(browsersJson) as { browsers?: { name: string; revision: string; browserVersion?: string }[] }).browsers ?? [];
  const entry = browsers.find((browser) => browser.name === name);
  if (entry === undefined) throw new Error(`browsers.json pins no ${name}`);
  return { revision: entry.revision, browserVersion: entry.browserVersion ?? 'unknown' };
}

/** Where Playwright keeps its browsers: PLAYWRIGHT_BROWSERS_PATH (0: inside playwright-core), else its user cache. */
export function browsersRoot(env: NodeJS.ProcessEnv, core: string): string {
  const configured = env.PLAYWRIGHT_BROWSERS_PATH;
  if (configured === '0') return path.join(core, '.local-browsers');
  if (configured !== undefined && configured !== '') return path.resolve(configured);
  const home = env.HOME ?? os.homedir();
  return process.platform === 'darwin' ? path.join(home, 'Library/Caches/ms-playwright') : path.join(home, '.cache/ms-playwright');
}

/** Why a build's binary is not run: it is run only once every file of the build equals the record (sameFiles). */
const NOT_PROVEN: VersionRun = { ran: false, why: "its files are not proven to be browser.json's" };

/** Whether every file of a found build equals the record, with nothing beside them: the condition for running its binary. */
export function sameFiles(found: FoundBuild, recorded: RecordedBuild): boolean {
  return found.dir === recorded.dir && found.others.length === 0 && found.faults.length === 0 && treeSha256(found.lines) === recorded.treeSha256;
}

/** One build as installed under a browsers root: its folder's directory (the recorded one, else the only one there). */
export function installedBuild(root: string, name: BuildName, pins: { revision: string; browserVersion: string }, recorded: RecordedBuild): FoundBuild {
  const revisionDir = path.join(root, `${BUILDS[name].folder}-${pins.revision}`);
  const base = { ...pins, where: revisionDir };
  const directories = existsSync(revisionDir) ? readdirSync(revisionDir).filter((entry) => !MARKERS.has(entry) && lstatSync(path.join(revisionDir, entry)).isDirectory()) : [];
  const dir = directories.includes(recorded.dir) ? recorded.dir : directories.length === 1 ? (directories[0] ?? null) : null;
  if (dir === null) return { ...base, dir: null, lines: [], others: [], faults: [], version: { ran: false, why: 'no build there' } };
  // A file this process cannot read throws out of treeLines, naming it: the check fails as "could not be checked".
  const { lines, others } = treeLines(revisionDir, dir);
  return { ...base, dir, lines, others, faults: [], version: NOT_PROVEN };
}

/** The first non-empty line of a process's output (stdout, else stderr). */
function firstLine(...texts: (string | null | undefined)[]): string {
  for (const text of texts) {
    const line = (text ?? '').split('\n').map((each) => each.trim()).find((each) => each !== '');
    if (line !== undefined) return line;
  }
  return '';
}

/** A finished `--version` run, by whom it ran: its first line, exit status, signal, and why it could not start. */
function versionRun(by: string, result: SpawnSyncReturns<string>): VersionRun {
  return { ran: true, by, line: firstLine(result.stdout, result.stderr), status: result.status, signal: result.signal, error: result.error === undefined ? null : result.error.message.split('\n')[0] ?? '' };
}

/** `<binary> --version` of an installed build whose files equal the record, run as this process's user. */
export function installedVersion(found: FoundBuild, recorded: RecordedBuild, env: NodeJS.ProcessEnv): VersionRun {
  if (found.dir === null) return { ran: false, why: 'no build there' };
  const binary = path.join(found.where, found.dir, recorded.path.slice(recorded.dir.length + 1));
  return versionRun("this process's user", spawnSync(binary, ['--version'], { env, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] }));
}

/**
 * The script the --image mode runs inside the image as root, as `sh -c <script> sh <revision> <dir>`, one row per
 * fact: the build's directory (`dir`), every other entry (`other`), every file find cannot read (`unreadable`), every
 * regular file found (`listed`, its name escaped as sha256sum escapes one), every regular file's line in the shell
 * form's order (`file`), and any tool that failed (`error <tool> <status>`: sh has no pipefail, so each stage writes a
 * file and reports its own status rather than hiding behind the next). It runs no binary of the build.
 */
export const IMAGE_SCRIPT = [
  'set -eu',
  'revision=$1 dir=$2',
  'cd "${PLAYWRIGHT_BROWSERS_PATH:?}/chromium_headless_shell-$revision" 2>/dev/null || { echo missing; exit 0; }',
  'if [ ! -d "$dir" ]; then set -- */; if [ "$#" -eq 1 ] && [ -d "$1" ]; then dir=${1%/}; else echo missing; exit 0; fi; fi',
  'echo "dir $dir"',
  'find "$dir" ! -type f ! -type d -exec printf \'other %s\\n\' {} \\; || echo "error find $?"',
  'find "$dir" -type f ! -readable -exec printf \'unreadable %s\\n\' {} \\; || echo "error find $?"',
  'work=$(mktemp -d)',
  'trap \'rm -rf "$work"\' EXIT',
  'find "$dir" -type f -print0 > "$work/found" || echo "error find $?"',
  'LC_ALL=C sort -z "$work/found" > "$work/sorted" || echo "error sort $?"',
  'sed -z \'s/\\\\/\\\\\\\\/g; s/\\n/\\\\n/g; s/^/listed /\' "$work/sorted" | tr \'\\0\' \'\\n\'',
  'xargs -0r sha256sum < "$work/sorted" > "$work/sums" || echo "error sha256sum $?"',
  'sed \'s/^/file /\' "$work/sums"',
].join('\n');

/**
 * The script the --image mode runs as the image's own user, as `sh -c <script> sh <revision> <dir> <binary under dir>`,
 * once the hashes equal the record: the binary's --version, its exit status the container's.
 */
export const VERSION_SCRIPT = ['set -eu', 'cd "${PLAYWRIGHT_BROWSERS_PATH:?}/chromium_headless_shell-$1/$2"', 'exec "./$3" --version'].join('\n');

/**
 * How the --image mode starts a container: from the local tag only (`--pull never`: a tag missing here fails, rather
 * than a registry's image of that name being pulled and checked in place of the one just built), as root, so the
 * image's runtime user (the worker's is `node`) cannot hide a file from the hash (Chrome for Testing's zips carry
 * `deb.deps` and `rpm.deps` as mode 0600, and the image installs the build as root), and with no network, since the
 * check only reads the image.
 */
export const IMAGE_RUN = ['run', '--rm', '--pull', 'never', '--user', '0:0', '--network', 'none', '--entrypoint'] as const;

/**
 * How the --image mode starts the version run: as IMAGE_RUN, local tag only and offline, but with no --user, so the
 * image's own user (the worker's `node`, which prints customers' PDFs) is the one that must start the shell.
 */
export const IMAGE_VERSION_RUN = ['run', '--rm', '--pull', 'never', '--network', 'none', '--entrypoint'] as const;

/** The headless shell as a built image holds it, read with `docker run` (the image's own browsers.json, its tree). */
export function imageBuild(ref: string, recorded: RecordedBuild, env: NodeJS.ProcessEnv): FoundBuild {
  const docker = (args: string[]) => execFileSync('docker', args, { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
  const pins = pinned(docker([...IMAGE_RUN, 'cat', ref, 'node_modules/playwright-core/browsers.json']), 'chromium-headless-shell');
  const output = docker([...IMAGE_RUN, 'sh', ref, '-c', IMAGE_SCRIPT, 'sh', pins.revision, recorded.dir]);
  const where = `${ref}: $PLAYWRIGHT_BROWSERS_PATH/chromium_headless_shell-${pins.revision}`;
  const rows = output.split('\n').filter((row) => row !== '');
  const dir = rows.find((row) => row.startsWith('dir '))?.slice(4) ?? null;
  const all = rows.filter((row) => row.startsWith('file ')).map((row) => row.slice(5));
  const odd = all.filter((line) => !/^[0-9a-f]{64} {2}\S/.test(line));
  const lines = all.filter((line) => !odd.includes(line));
  const hashed = new Set(lines.map((line) => line.slice(66)));
  const listed = rows.filter((row) => row.startsWith('listed ')).map((row) => row.slice(7));
  const unhashed = listed.filter((name) => !hashed.has(name));
  return {
    ...pins,
    where,
    dir,
    lines,
    others: [
      ...rows.filter((row) => row.startsWith('other ')).map((row) => row.slice(6)),
      ...rows.filter((row) => row.startsWith('unreadable ')).map((row) => `${row.slice(11)} (unreadable)`),
      ...odd,
    ],
    faults: [
      ...rows.filter((row) => row.startsWith('error ')).map((row) => row.slice(6).replace(' ', ' exited ')),
      ...(unhashed.length === 0 ? [] : [`${String(unhashed.length)} of ${String(listed.length)} files found ${unhashed.length === 1 ? 'was' : 'were'} not hashed: ${unhashed.join(', ')}`]),
    ],
    version: dir === null ? { ran: false, why: 'no build there' } : NOT_PROVEN,
  };
}

/** `<binary> --version` of an image's headless shell whose files equal the record, run as the image's own user. */
export function imageVersion(ref: string, found: FoundBuild, recorded: RecordedBuild, env: NodeJS.ProcessEnv): VersionRun {
  if (found.dir === null) return { ran: false, why: 'no build there' };
  const args = [...IMAGE_VERSION_RUN, 'sh', ref, '-c', VERSION_SCRIPT, 'sh', found.revision, found.dir, recorded.path.slice(recorded.dir.length + 1)];
  return versionRun("the image's own user", spawnSync('docker', args, { env, encoding: 'utf8', timeout: 300_000, stdio: ['ignore', 'pipe', 'pipe'] }));
}

/** The recorded lines of a build, or why they cannot be trusted (the committed list must hash to the tree SHA-256). */
function recordedLines(recordFile: string, build: RecordedBuild): { lines: string[] | null; problem: string | null } {
  const file = listFile(recordFile, build);
  if (!existsSync(file)) return { lines: null, problem: `${path.relative(ROOT, file)} is missing: browser.json's treeSha256 is the SHA-256 of that list` };
  const text = readFileSync(file, 'utf8');
  if (sha256(text) !== build.treeSha256) return { lines: null, problem: `${path.relative(ROOT, file)} hashes to ${sha256(text)}, not browser.json's treeSha256 ${build.treeSha256}` };
  return { lines: text.split('\n').filter((line) => line !== ''), problem: null };
}

/** Every path whose line differs between the recorded list and the found one, each with how, by path bytes. */
export function differingPaths(recorded: readonly string[], found: readonly string[]): string[] {
  const index = (lines: readonly string[]) => new Map(lines.map((line) => [line.slice(66), line.slice(0, 64)]));
  const before = index(recorded);
  const after = index(found);
  const names = [...new Set([...before.keys(), ...after.keys()])].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  return names.flatMap((name) => {
    const was = before.get(name);
    const is = after.get(name);
    if (was === is) return [];
    return [`${name} (${was === undefined ? 'added' : is === undefined ? 'removed' : 'changed'})`];
  });
}

/**
 * Compares one found build with the record: the lines to print, the failures, and whether the found build's every file
 * line is to be printed (on any failure, where a build was found).
 */
export function compare(name: BuildName, record: BrowserRecord, recordFile: string, found: FoundBuild): { report: string[]; problems: string[]; listFiles: boolean } {
  const recorded = record.builds[name];
  const { title } = BUILDS[name];
  // A build some of whose files could not be hashed has no tree SHA-256 to compare: its missing lines are files whose
  // bytes are unknown, not files the build lacks, so they are never named as removed.
  const faulted = found.faults.length > 0;
  const tree = found.dir === null ? `absent (no build under ${found.where})` : faulted ? 'not computed (the hash run failed)' : treeSha256(found.lines);
  const binaryPath = found.dir === null ? null : `${found.dir}/${recorded.path.slice(recorded.dir.length + 1)}`;
  const binary = found.lines.find((line) => line.slice(66) === binaryPath)?.slice(0, 64) ?? (faulted ? 'not computed' : 'absent');
  const report = [`${title}: ${versionText(found.version)}`, `${title}: revision ${found.revision}, ${found.browserVersion}, ${String(found.lines.length)} files under ${found.where}, tree SHA-256 ${tree}, binary SHA-256 ${binary}`];
  const problems: string[] = [];
  const listed = recordedLines(recordFile, recorded);
  if (listed.problem !== null) problems.push(`browser.json's record of ${title.toLowerCase()} is inconsistent: ${listed.problem}.`);
  const sameBuild = found.revision === record.revision && found.browserVersion === record.browserVersion && found.dir === recorded.dir;
  const equal = sameBuild && tree === recorded.treeSha256 && binary === recorded.sha256;
  // At the recorded build, a failed hash run is the problem (below), not a difference from the record.
  if (!equal && !(sameBuild && faulted)) {
    let message =
      `${title} is ${found.browserVersion} (revision ${found.revision}, tree SHA-256 ${tree}, binary SHA-256 ${binary}), ` +
      `and browser.json records ${record.browserVersion} (revision ${record.revision}, tree SHA-256 ${recorded.treeSha256}, binary SHA-256 ${recorded.sha256}). ${PROCEDURE}`;
    if (found.revision === record.revision && found.dir === recorded.dir && !faulted && tree !== recorded.treeSha256 && listed.lines !== null) {
      const paths = differingPaths(listed.lines, found.lines);
      message += ` ${String(paths.length)} files differ from ${path.relative(ROOT, listFile(recordFile, recorded))}: ${paths.join(', ')}.`;
    }
    problems.push(message);
  }
  if (found.others.length > 0) {
    problems.push(`${title}'s build holds ${String(found.others.length)} entries that no tree SHA-256 covers (neither a regular file nor a directory, or a file the check cannot read): ${found.others.join(', ')}.`);
  }
  if (faulted) {
    problems.push(`${title} could not be hashed whole under ${found.where}: ${found.faults.join('; ')}. Its tree SHA-256 is not compared until every file is hashed; the tool’s own message is in the log above.`);
  }
  const expected = expectedVersion(record);
  const { version } = found;
  if (version.ran && (!started(version) || version.line !== expected)) {
    const why = started(version)
      ? "The build's every file equals the record, so browser.json's browserVersion does not name its build."
      : "The build's every file equals the record, and the hashes cover neither modes nor what the system provides, so what stops it is outside them: a shared library the system lacks, or a mode or user that cannot run it.";
    problems.push(`${title} does not run as browser.json's build: \`${found.where}/${String(binaryPath)} --version\`, run as ${version.by}, ${ending(version)}, where browser.json's build prints "${expected}". ${why}`);
  } else if (!version.ran && problems.length === 0) {
    // Never reached while sameFiles and this comparison agree; if they ever drift, an unproven start fails, not passes.
    problems.push(`${title}'s --version was not run (${version.why}), so whether it starts is unproven.`);
  }
  if (problems.length === 0) report.push(`${title}: equal to browser.json in every file`);
  return { report, problems, listFiles: found.dir !== null && problems.length > 0 };
}

type Ran = Extract<VersionRun, { ran: true }>;

/** Whether a version run started and exited 0. */
function started(version: Ran): boolean {
  return version.status === 0 && version.error === null && version.signal === null;
}

/** How a version run ended: what it printed, or how it failed and what it printed. */
function ending(version: Ran): string {
  if (version.error !== null && version.signal === null) return `could not be started (${version.error})`;
  const printing = version.line === '' ? 'printing nothing' : `printing "${version.line}"`;
  if (version.signal !== null) return `was stopped by ${version.signal}, ${printing}`;
  if (version.status === 0) return `printed "${version.line}"`;
  return `exited ${String(version.status)}, ${printing}`;
}

/** How a version run reads in the report: what it printed, how it failed, or why it was not run. */
function versionText(version: VersionRun): string {
  if (!version.ran) return `--version not run: ${version.why}`;
  return started(version) ? version.line : `--version ${ending(version)}`;
}

export interface RunOptions {
  readonly argv: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  /** The record and the manifest @playwright/test is resolved from; the repository's unless a test names others. */
  readonly record?: string;
  readonly from?: string;
}

const USAGE = 'usage: node tools/ci/browser-build.ts [--image <ref>] [--list]';

/** The check: 0 when every build equals the record, 1 on any difference, 2 on a usage error. */
export function run(options: RunOptions): number {
  const argv = [...options.argv];
  let image: string | null = null;
  let list = false;
  while (argv.length > 0) {
    const argument = argv.shift();
    if (argument === '--list') list = true;
    else if (argument === '--image' && argv[0] !== undefined && !argv[0].startsWith('-')) image = argv.shift() ?? null;
    else {
      options.err(USAGE);
      return 2;
    }
  }
  const recordFile = options.record ?? RECORD;
  let failures = 0;
  try {
    const record = readRecord(recordFile);
    const builds: [BuildName, FoundBuild][] = [];
    if (image === null) {
      const core = playwrightCore(options.from ?? WEB_MANIFEST);
      const browsersJson = readFileSync(path.join(core, 'browsers.json'), 'utf8');
      const root = browsersRoot(options.env, core);
      options.out(`playwright-core ${(JSON.parse(readFileSync(path.join(core, 'package.json'), 'utf8')) as { version: string }).version} at ${core}; browsers under ${root}`);
      for (const name of Object.keys(BUILDS) as BuildName[]) {
        const recorded = record.builds[name];
        const found = installedBuild(root, name, pinned(browsersJson, name), recorded);
        builds.push([name, sameFiles(found, recorded) ? { ...found, version: installedVersion(found, recorded, options.env) } : found]);
      }
    } else {
      const recorded = record.builds['chromium-headless-shell'];
      const found = imageBuild(image, recorded, options.env);
      builds.push(['chromium-headless-shell', sameFiles(found, recorded) ? { ...found, version: imageVersion(image, found, recorded, options.env) } : found]);
    }
    for (const [name, found] of builds) {
      const { report, problems, listFiles } = compare(name, record, recordFile, found);
      for (const line of report) options.out(line);
      if (list || listFiles) for (const line of found.lines) options.out(`  ${line}`);
      for (const problem of problems) options.err(problem);
      failures += problems.length;
    }
  } catch (error) {
    options.err(`The browser build could not be checked: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  return failures === 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exitCode = run({
    argv: process.argv.slice(2),
    env: process.env,
    out: (line) => {
      process.stdout.write(`${line}\n`);
    },
    err: (line) => {
      process.stderr.write(`${line}\n`);
    },
  });
}
