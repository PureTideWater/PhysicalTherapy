import { execFileSync } from 'node:child_process';
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
 * node_modules/playwright-core/browsers.json (`docker run --rm --entrypoint cat`) and the headless shell's tree,
 * hashed inside the image by the command above (`docker run --rm --entrypoint sh`). The worker prints customers' PDFs
 * with that headless shell.
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
  /** Entries under the build's directory that are neither regular files nor directories (a symbolic link, say). */
  readonly others: readonly string[];
  /** What `<binary> --version` printed, or why it did not run. */
  readonly version: string;
  /** Where the build was looked for (a folder, or an image's). */
  readonly where: string;
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

/** One build as installed under a browsers root: its folder's directory (the recorded one, else the only one there). */
export function installedBuild(root: string, name: BuildName, pins: { revision: string; browserVersion: string }, recorded: RecordedBuild, env: NodeJS.ProcessEnv): FoundBuild {
  const revisionDir = path.join(root, `${BUILDS[name].folder}-${pins.revision}`);
  const base = { ...pins, where: revisionDir };
  const directories = existsSync(revisionDir) ? readdirSync(revisionDir).filter((entry) => !MARKERS.has(entry) && lstatSync(path.join(revisionDir, entry)).isDirectory()) : [];
  const dir = directories.includes(recorded.dir) ? recorded.dir : directories.length === 1 ? (directories[0] ?? null) : null;
  if (dir === null) return { ...base, dir: null, lines: [], others: [], version: 'not run: no build there' };
  const { lines, others } = treeLines(revisionDir, dir);
  const binary = path.join(revisionDir, dir, recorded.path.slice(recorded.dir.length + 1));
  let version = 'not run: no binary at the recorded path';
  if (existsSync(binary)) {
    try {
      version = execFileSync(binary, ['--version'], { env, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch (error) {
      version = `--version failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
    }
  }
  return { ...base, dir, lines, others, version };
}

/**
 * The script the --image mode runs inside the image, as `sh -c <script> sh <revision> <dir> <binary under dir>`: the
 * build's directory, every other entry, every regular file's line in the shell form's order, and the binary's version.
 */
export const IMAGE_SCRIPT = [
  'set -eu',
  'revision=$1 dir=$2 binary=$3',
  'cd "${PLAYWRIGHT_BROWSERS_PATH:?}/chromium_headless_shell-$revision" 2>/dev/null || { echo missing; exit 0; }',
  'if [ ! -d "$dir" ]; then set -- */; if [ "$#" -eq 1 ] && [ -d "$1" ]; then dir=${1%/}; else echo missing; exit 0; fi; fi',
  'echo "dir $dir"',
  'find "$dir" ! -type f ! -type d -exec printf \'other %s\\n\' {} \\;',
  'find "$dir" -type f -print0 | LC_ALL=C sort -z | xargs -0r sha256sum | sed \'s/^/file /\'',
  'if [ -x "$dir/$binary" ]; then printf \'version %s\\n\' "$("$dir/$binary" --version 2>&1 | head -n 1 || true)"; fi',
].join('\n');

/** The headless shell as a built image holds it, read with `docker run` (the image's own browsers.json, its tree). */
export function imageBuild(ref: string, recorded: RecordedBuild, env: NodeJS.ProcessEnv): FoundBuild {
  const docker = (args: string[]) => execFileSync('docker', args, { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
  const pins = pinned(docker(['run', '--rm', '--entrypoint', 'cat', ref, 'node_modules/playwright-core/browsers.json']), 'chromium-headless-shell');
  const output = docker(['run', '--rm', '--entrypoint', 'sh', ref, '-c', IMAGE_SCRIPT, 'sh', pins.revision, recorded.dir, recorded.path.slice(recorded.dir.length + 1)]);
  const where = `${ref}: $PLAYWRIGHT_BROWSERS_PATH/chromium_headless_shell-${pins.revision}`;
  const rows = output.split('\n').filter((row) => row !== '');
  const dir = rows.find((row) => row.startsWith('dir '))?.slice(4) ?? null;
  const lines = rows.filter((row) => row.startsWith('file ')).map((row) => row.slice(5));
  const odd = lines.filter((line) => !/^[0-9a-f]{64} {2}\S/.test(line));
  return {
    ...pins,
    where,
    dir,
    lines: lines.filter((line) => !odd.includes(line)),
    others: [...rows.filter((row) => row.startsWith('other ')).map((row) => row.slice(6)), ...odd],
    version: rows.find((row) => row.startsWith('version '))?.slice(8) ?? 'not run: no binary at the recorded path',
  };
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
  const tree = found.dir === null ? `absent (no build under ${found.where})` : treeSha256(found.lines);
  const binaryPath = found.dir === null ? null : `${found.dir}/${recorded.path.slice(recorded.dir.length + 1)}`;
  const binary = found.lines.find((line) => line.slice(66) === binaryPath)?.slice(0, 64) ?? 'absent';
  const report = [`${title}: ${found.version}`, `${title}: revision ${found.revision}, ${found.browserVersion}, ${String(found.lines.length)} files under ${found.where}, tree SHA-256 ${tree}, binary SHA-256 ${binary}`];
  const problems: string[] = [];
  const listed = recordedLines(recordFile, recorded);
  if (listed.problem !== null) problems.push(`browser.json's record of ${title.toLowerCase()} is inconsistent: ${listed.problem}.`);
  const equal = found.revision === record.revision && found.browserVersion === record.browserVersion && found.dir === recorded.dir && tree === recorded.treeSha256 && binary === recorded.sha256;
  if (!equal) {
    let message =
      `${title} is ${found.browserVersion} (revision ${found.revision}, tree SHA-256 ${tree}, binary SHA-256 ${binary}), ` +
      `and browser.json records ${record.browserVersion} (revision ${record.revision}, tree SHA-256 ${recorded.treeSha256}, binary SHA-256 ${recorded.sha256}). ${PROCEDURE}`;
    if (found.revision === record.revision && found.dir === recorded.dir && tree !== recorded.treeSha256 && listed.lines !== null) {
      const paths = differingPaths(listed.lines, found.lines);
      message += ` ${String(paths.length)} files differ from ${path.relative(ROOT, listFile(recordFile, recorded))}: ${paths.join(', ')}.`;
    }
    problems.push(message);
  }
  if (found.others.length > 0) {
    problems.push(`${title}'s build holds ${String(found.others.length)} entries that are neither regular files nor directories, which no tree SHA-256 covers: ${found.others.join(', ')}.`);
  }
  if (problems.length === 0) report.push(`${title}: equal to browser.json in every file`);
  return { report, problems, listFiles: found.dir !== null && problems.length > 0 };
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
      for (const name of Object.keys(BUILDS) as BuildName[]) builds.push([name, installedBuild(root, name, pinned(browsersJson, name), record.builds[name], options.env)]);
    } else {
      builds.push(['chromium-headless-shell', imageBuild(image, record.builds['chromium-headless-shell'], options.env)]);
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
