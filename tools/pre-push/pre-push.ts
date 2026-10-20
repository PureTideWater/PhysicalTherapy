import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { checkCommits } from '../fixture-check/commits';

/**
 * The repository's pre-push hook (`.githooks/pre-push`; docs/adr/0063, audit item #20 (e)): before git sends
 * anything, the commits the push would add to the remote go through the fixture check (tools/fixture-check/
 * commits.ts, the writer's guard over every file they write) and through gitleaks with the repository's own
 * `.gitleaks.toml` and `.gitleaksignore`, the configuration CI's gitleaks step reads. A real file copied into the
 * tree, or a key pasted into one, is then refused on the contributor's machine instead of reaching GitHub before
 * CI looks. It fails closed: without gitleaks, with a gitleaks or git too old for the scan, or on any error, a push
 * that sends a commit the remote lacks is refused and the message says why (a push that sends none, such as a
 * deletion, has nothing to scan and goes ahead).
 *
 * The commits checked are those reachable from what each ref update sends and from nothing the remote already has:
 * its remote-tracking refs (`--remotes=<remote>`) when this repository has fetched it, otherwise every commit
 * `git ls-remote` says it holds (a remote just added, or a push to a URL), and the commit each update replaces: a
 * new branch, a push of a bare commit (`git push origin <sha>:refs/heads/salvage/x`, a `git commit-tree` object no
 * branch holds) and an update of a branch alike. A deletion sends nothing and checks nothing. gitleaks reads each
 * merge by its remerge diff (what the merge holds beyond git's own automatic merge of its parents: an evil merge or
 * a conflict's resolution), since `git log -p` shows no diff for a merge at all.
 *
 * gitleaks reads the commits through `git log -p`, which a git setting can change into text it cannot parse (color,
 * an external diff or a textconv driver): it then reads nothing and reports no leak. So the log options turn those
 * off, the environment overrides the settings files' color and prefix settings, and the hook counts the commits that
 * add a line; when gitleaks says it read fewer, the push is refused.
 */

/** One line git hands a pre-push hook on its standard input. */
export interface PushUpdate {
  readonly localRef: string;
  readonly localObject: string;
  readonly remoteRef: string;
  readonly remoteObject: string;
}

/** The oldest gitleaks with the `git` command (8.19.0) and the oldest git with `--diff-merges=remerge` (2.36.0). */
export const MINIMUM_GITLEAKS: readonly [number, number, number] = [8, 19, 0];
export const MINIMUM_GIT: readonly [number, number, number] = [2, 36, 0];

const OBJECT_NAME = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const NULL_OBJECT = /^0+$/;
/** A remote name git accepts and a rev-list glob cannot widen. */
const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/** Where to get gitleaks, for every message that refuses a push for want of it. */
export const GITLEAKS_INSTALL =
  'Run tools/gitleaks/install.sh (pnpm gitleaks:install), which installs the pinned gitleaks after checking its SHA-256; or install gitleaks 8.19 or later so it is on PATH, or set GITLEAKS to the path of a gitleaks binary; and push again.';

/**
 * Where tools/gitleaks/install.sh keeps the pinned gitleaks: `<cache>/paidwhole/gitleaks/<version>/gitleaks`, the
 * cache being XDG_CACHE_HOME or ~/.cache. Null when the release file names no version or the environment no cache.
 */
export function pinnedGitleaks(checkout: string, env: NodeJS.ProcessEnv): string | null {
  let release: string;
  try {
    release = readFileSync(path.join(checkout, 'tools/gitleaks/release.txt'), 'utf8');
  } catch {
    return null;
  }
  const version = /^version (\d+\.\d+\.\d+)$/m.exec(release)?.[1];
  const cache = env.XDG_CACHE_HOME !== undefined && env.XDG_CACHE_HOME !== '' ? env.XDG_CACHE_HOME : env.HOME !== undefined && env.HOME !== '' ? path.join(env.HOME, '.cache') : null;
  return version === undefined || cache === null || !path.isAbsolute(cache) ? null : path.join(cache, 'paidwhole', 'gitleaks', version, 'gitleaks');
}

export class PrePushError extends Error {
  override readonly name = 'PrePushError';
}

/** Parses the hook's standard input: `<local ref> <local object> <remote ref> <remote object>` per line. */
export function parsePushUpdates(text: string): PushUpdate[] {
  const updates: PushUpdate[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const fields = line.split(' ');
    const [localRef, localObject, remoteRef, remoteObject] = fields;
    if (fields.length !== 4 || localRef === undefined || remoteRef === undefined || localObject === undefined || remoteObject === undefined || !OBJECT_NAME.test(localObject) || !OBJECT_NAME.test(remoteObject)) {
      throw new PrePushError('git handed the hook a line it cannot read; nothing was checked');
    }
    updates.push({ localRef, localObject, remoteRef, remoteObject });
  }
  return updates;
}

/** What the revision arguments need to know about the repository and the remote. */
export interface RevisionContext {
  /** What the remote already has, after `--not`: `--remotes=<remote>`, or the commits `git ls-remote` named. */
  readonly known: readonly string[];
  /** True when this repository holds the object (a remote's old commit it has fetched). */
  readonly has: (object: string) => boolean;
}

/**
 * The `git rev-list` arguments for the commits the push adds to the remote: every object an update sends, and
 * `--not` what the remote already has and every commit an update replaces that this repository holds. Null when the
 * push sends nothing (only deletions).
 */
export function revisionsToCheck(updates: readonly PushUpdate[], context: RevisionContext): string[] | null {
  const sent = [...new Set(updates.map((update) => update.localObject).filter((object) => !NULL_OBJECT.test(object)))];
  if (sent.length === 0) {
    return null;
  }
  const replaced = [...new Set(updates.map((update) => update.remoteObject).filter((object) => !NULL_OBJECT.test(object) && context.has(object)))];
  return [...sent, '--not', ...context.known, ...replaced.filter((object) => !context.known.includes(object))];
}

/** The object names `git ls-remote` prints, each once: a ref's object, and a tag's peeled commit. */
export function advertisedObjects(output: string): string[] {
  const objects = new Set<string>();
  for (const line of output.split('\n')) {
    const object = line.split('\t')[0] ?? '';
    if (OBJECT_NAME.test(object)) {
      objects.add(object);
    }
  }
  return [...objects];
}

/**
 * What the remote already has, for `--not`. A configured remote this repository has fetched: its remote-tracking refs.
 * A remote with none (added and not yet fetched) or a URL: the commits `git ls-remote` says it holds that this
 * repository has too, read now, since otherwise every commit the push reaches would be checked again, findings
 * already published included. When the remote cannot be listed, the push is refused rather than checked whole.
 */
export function knownToRemote(root: string, remote: string, env: NodeJS.ProcessEnv): string[] {
  const configured = new Set(git(root, ['remote'], env).split('\n'));
  if (configured.has(remote) && REMOTE_NAME.test(remote) && git(root, ['for-each-ref', '--count=1', '--format=%(objectname)', `refs/remotes/${remote}/`], env).trim() !== '') {
    return [`--remotes=${remote}`];
  }
  const listed = remote.startsWith('-') ? null : run('git', ['ls-remote', remote], root, env);
  if (listed === null || listed.status !== 0) {
    const reason = listed === null ? 'a remote whose name starts with "-"' : listed.stderr.trim().split('\n').slice(-1)[0] ?? `exit ${String(listed.status)}`;
    throw new PrePushError(
      `the hook could not list what ${remote} already has (${reason}), so this push is refused rather than checked from the first commit: add it as a remote and run git fetch for it, then push again.`,
    );
  }
  const advertised = advertisedObjects(listed.stdout);
  if (advertised.length === 0) {
    return [];
  }
  const checked = git(root, ['cat-file', '--batch-check=%(objectname) %(objecttype)'], env, `${advertised.map((object) => `${object}^{commit}`).join('\n')}\n`);
  const held = new Set<string>();
  for (const line of checked.split('\n')) {
    const [object, type] = line.split(' ');
    if (object !== undefined && type === 'commit' && OBJECT_NAME.test(object)) {
      held.add(object);
    }
  }
  return [...held];
}

/** The first `major.minor.patch` in a tool's version output, or null. */
export function parseVersion(output: string): [number, number, number] | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(output);
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function atLeast(version: readonly [number, number, number], minimum: readonly [number, number, number]): boolean {
  for (let index = 0; index < 3; index += 1) {
    const [have, need] = [version[index] ?? 0, minimum[index] ?? 0];
    if (have !== need) {
      return have > need;
    }
  }
  return true;
}

function executable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The gitleaks binary: GITLEAKS when set (it must be executable), otherwise the pinned one tools/gitleaks/install.sh
 * installed (the one CI runs), otherwise the first `gitleaks` on PATH.
 */
export function findGitleaks(env: NodeJS.ProcessEnv, checkout?: string): string {
  const named = env.GITLEAKS;
  if (named !== undefined && named !== '') {
    if (!path.isAbsolute(named) || !executable(named)) {
      throw new PrePushError(`GITLEAKS is set but does not name an executable file by its absolute path, so this push is refused. ${GITLEAKS_INSTALL}`);
    }
    return named;
  }
  const pinned = checkout === undefined ? null : pinnedGitleaks(checkout, env);
  if (pinned !== null && executable(pinned)) {
    return pinned;
  }
  for (const directory of (env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(directory === '' ? '.' : directory, 'gitleaks');
    if (directory !== '' && path.isAbsolute(candidate) && executable(candidate)) {
      return candidate;
    }
  }
  throw new PrePushError(`gitleaks was not found, so this push is refused: the hook scans every commit it sends for secrets. ${GITLEAKS_INSTALL}`);
}

interface Ran {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function run(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv, input?: string): Ran {
  const result = spawnSync(command, args, { cwd, env, input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error !== undefined) {
    throw new PrePushError(`${path.basename(command)} could not be run (${result.error.message}), so this push is refused.`);
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function git(root: string, args: readonly string[], env: NodeJS.ProcessEnv, input?: string): string {
  const result = run('git', args, root, env, input);
  if (result.status !== 0) {
    throw new PrePushError(`git ${args[0] ?? ''} failed (${result.stderr.trim() || `exit ${String(result.status)}`}), so this push is refused.`);
  }
  return result.stdout;
}

/** The commits the revisions name, newest first. */
export function commitsToPush(root: string, revisions: readonly string[], env: NodeJS.ProcessEnv): string[] {
  return git(root, ['rev-list', ...revisions], env)
    .split('\n')
    .filter((line) => line !== '');
}

/** One gitleaks finding as the hook prints it: where, and which rule, never the secret (the report is redacted too). */
interface Finding {
  readonly RuleID?: string;
  readonly File?: string;
  readonly StartLine?: number;
  readonly Commit?: string;
}

/** Exit status gitleaks is told to use for findings, so a finding is told apart from an error (exit 1). */
const LEAKS_FOUND = 3;

/**
 * `git log` options that keep the patch gitleaks reads as git prints it by default, whatever the user's settings:
 * no color codes, no external diff program and no textconv driver (each of which leaves gitleaks a text it reads no
 * commit from).
 */
export const PLAIN_PATCH = ['--no-color', '--no-ext-diff', '--no-textconv'] as const;

/**
 * Settings that change how a patch is printed, overridden for gitleaks and the hook's own count through
 * GIT_CONFIG_COUNT, which outranks every settings file (a `git -c` on the push's command line still outranks it,
 * and the count below catches what that leaves).
 */
const PLAIN_SETTINGS: readonly (readonly [string, string])[] = [
  ['color.ui', 'never'],
  ['color.diff', 'never'],
  ['diff.noprefix', 'false'],
  ['diff.mnemonicPrefix', 'false'],
  ['log.showSignature', 'false'],
];

/** The environment with PLAIN_SETTINGS added after any GIT_CONFIG_COUNT entries it already holds. */
export function plainPatchEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const given = Number.parseInt(env.GIT_CONFIG_COUNT ?? '0', 10);
  const start = Number.isSafeInteger(given) && given > 0 ? given : 0;
  const result: NodeJS.ProcessEnv = { ...env, GIT_CONFIG_COUNT: String(start + PLAIN_SETTINGS.length) };
  PLAIN_SETTINGS.forEach(([key, value], index) => {
    result[`GIT_CONFIG_KEY_${String(start + index)}`] = key;
    result[`GIT_CONFIG_VALUE_${String(start + index)}`] = value;
  });
  return result;
}

/**
 * How many of the commits the revisions name add at least one line of text (`git log --numstat`, merges by their
 * remerge diff). gitleaks counts every commit whose patch holds a file it reads, so it can never honestly report
 * fewer than this: a commit with no diff (an empty commit, a clean merge), or one that only deletes files or changes
 * binary ones, it may skip.
 */
export function commitsAddingLines(root: string, revisions: readonly string[], env: NodeJS.ProcessEnv): number {
  const output = git(root, ['log', ...PLAIN_PATCH, '--diff-merges=remerge', '--numstat', '--format=tp-commit %H', ...revisions], plainPatchEnvironment(env));
  let count = 0;
  let counted = true;
  for (const line of output.split('\n')) {
    if (line.startsWith('tp-commit ')) {
      counted = false;
    } else if (!counted && /^[1-9]\d*\t/.test(line)) {
      counted = true;
      count += 1;
    }
  }
  return count;
}

/** The commit count gitleaks prints at log level info ("5 commits scanned."; a color code around it changes nothing), or null. */
export function scannedCount(stderr: string): number | null {
  const match = /(\d+) commits? scanned/.exec(stderr);
  return match === null ? null : Number(match[1]);
}

/** Runs gitleaks over exactly the commits the revisions name, with the repository's configuration. */
export function scanSecrets(options: { readonly root: string; readonly checkout: string; readonly gitleaks: string; readonly revisions: readonly string[]; readonly env: NodeJS.ProcessEnv }): string[] {
  const version = parseVersion(run(options.gitleaks, ['version'], options.root, options.env).stdout);
  if (version === null || !atLeast(version, MINIMUM_GITLEAKS)) {
    throw new PrePushError(`${options.gitleaks} is gitleaks ${version === null ? 'of an unknown version' : version.join('.')}; the hook needs 8.19 or later for its git scan, so this push is refused. ${GITLEAKS_INSTALL}`);
  }
  const config = path.join(options.checkout, '.gitleaks.toml');
  if (!existsSync(config)) {
    throw new PrePushError(`${config} is missing, so this push is refused: the hook scans with the repository's own gitleaks configuration.`);
  }
  const ignore = path.join(options.checkout, '.gitleaksignore');
  const reportDirectory = mkdtempSync(path.join(tmpdir(), 'tp-pre-push-'));
  try {
    const report = path.join(reportDirectory, 'gitleaks.json');
    const args = [
      'git',
      '--no-banner',
      '--no-color',
      '--log-level',
      'info',
      '--redact',
      '--exit-code',
      String(LEAKS_FOUND),
      '--config',
      config,
      ...(existsSync(ignore) ? ['--gitleaks-ignore-path', ignore] : []),
      '--report-format',
      'json',
      '--report-path',
      report,
      '--log-opts',
      [...PLAIN_PATCH, '--diff-merges=remerge', ...options.revisions].join(' '),
      options.root,
    ];
    const result = run(options.gitleaks, args, options.root, plainPatchEnvironment(options.env));
    if (result.status === 0) {
      // No finding is only an answer when gitleaks read the commits: a patch it cannot parse also gives none.
      const scanned = scannedCount(result.stderr);
      const adding = commitsAddingLines(options.root, options.revisions, options.env);
      if (scanned === null || scanned < adding) {
        throw new PrePushError(
          `gitleaks read ${scanned === null ? 'an unknown number' : String(scanned)} of the ${String(adding)} commit${adding === 1 ? '' : 's'} that add a line, so this push is refused: a git setting changes the patch it reads (color, an external diff, a textconv driver or a diff prefix, perhaps from git -c). Push without that setting.`,
        );
      }
      return [];
    }
    if (result.status !== LEAKS_FOUND || !existsSync(report)) {
      throw new PrePushError(`gitleaks could not scan the commits (exit ${String(result.status)}: ${result.stderr.trim().split('\n').slice(-3).join(' ')}), so this push is refused.`);
    }
    const findings = JSON.parse(readFileSync(report, 'utf8')) as Finding[];
    return findings.map((finding) => `${finding.File ?? '?'}:${String(finding.StartLine ?? '?')} in commit ${(finding.Commit ?? '?').slice(0, 12)}: gitleaks rule ${finding.RuleID ?? '?'}`);
  } finally {
    rmSync(reportDirectory, { recursive: true, force: true });
  }
}

export interface PrePushOptions {
  /** The repository the push runs in (git runs the hook at its working tree's top). */
  readonly root: string;
  /** The checkout the hook and its tools come from, whose `.gitleaks.toml` and `.gitleaksignore` it uses. */
  readonly checkout: string;
  /** The hook's first argument: the remote's name, or its URL when the push names a URL. */
  readonly remote: string;
  /** The hook's standard input. */
  readonly input: string;
  readonly env: NodeJS.ProcessEnv;
}

export interface PrePushResult {
  readonly allowed: boolean;
  /** What the hook prints: one line when it allows the push, every refusal when it does not. */
  readonly lines: readonly string[];
}

/** The hook: checks what the push sends and says whether git may send it. */
export function prePush(options: PrePushOptions): PrePushResult {
  try {
    const updates = parsePushUpdates(options.input);
    if (updates.every((update) => NULL_OBJECT.test(update.localObject))) {
      return { allowed: true, lines: ['pre-push: the push only deletes refs; nothing to check.'] };
    }
    const revisions = revisionsToCheck(updates, {
      known: knownToRemote(options.root, options.remote, options.env),
      has: (object) => run('git', ['cat-file', '-e', `${object}^{commit}`], options.root, options.env).status === 0,
    });
    if (revisions === null) {
      return { allowed: true, lines: ['pre-push: the push only deletes refs; nothing to check.'] };
    }
    const commits = commitsToPush(options.root, revisions, options.env);
    if (commits.length === 0) {
      return { allowed: true, lines: ['pre-push: every commit this push sends is already on the remote; nothing to check.'] };
    }
    // From here the push sends commits the remote lacks: without a git that reads merges or without gitleaks, it is refused.
    const gitVersion = parseVersion(git(options.root, ['version'], options.env));
    if (gitVersion === null || !atLeast(gitVersion, MINIMUM_GIT)) {
      throw new PrePushError(`git ${gitVersion?.join('.') ?? 'of an unknown version'} is older than 2.36, which the hook needs to read merges, so this push is refused: upgrade git and push again.`);
    }
    const gitleaks = findGitleaks(options.env, options.checkout);
    const fixtures = checkCommits(options.root, commits);
    const leaks = scanSecrets({ root: options.root, checkout: options.checkout, gitleaks, revisions, env: options.env });
    const refusals = [...fixtures.problems.map((problem) => `fixture check: ${problem.message}`), ...leaks.map((leak) => `secret scan: ${leak}`)];
    const counted = `${String(commits.length)} commit${commits.length === 1 ? '' : 's'}`;
    if (refusals.length > 0) {
      return {
        allowed: false,
        lines: [
          ...refusals.map((refusal) => `pre-push: ${refusal}`),
          `pre-push: this push is refused (${counted} checked). Fixtures are synthetic (pnpm synth; .claude/rules/fixtures.md) and secrets never enter the repository: rewrite the commits without the file or the secret, and push again.`,
        ],
      };
    }
    return { allowed: true, lines: [`pre-push: ${counted} checked: ${String(fixtures.checked)} file(s) read by the fixture guard, and gitleaks found no secret.`] };
  } catch (error) {
    if (error instanceof PrePushError) {
      return { allowed: false, lines: [`pre-push: ${error.message}`] };
    }
    const reason = error instanceof Error ? error.message : String(error);
    return { allowed: false, lines: [`pre-push: the checks failed (${reason}), so this push is refused.`] };
  }
}
