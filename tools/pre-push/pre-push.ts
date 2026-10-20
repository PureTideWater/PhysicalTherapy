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
 * The commits checked are those reachable from what each ref update sends and from none of the remote's refs this
 * repository knows (`--remotes=<remote>`) or the commit each update replaces: a new branch, a push of a bare commit
 * (`git push origin <sha>:refs/heads/salvage/x`, a `git commit-tree` object no branch holds) and an update of a
 * branch alike. A deletion sends nothing and checks nothing. gitleaks reads each merge by its remerge diff (what the
 * merge holds beyond git's own automatic merge of its parents: an evil merge or a conflict's resolution), since
 * `git log -p` shows no diff for a merge at all.
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
  'Install gitleaks 8.19 or later (a release from https://github.com/gitleaks/gitleaks/releases, or `brew install gitleaks`) so it is on PATH, or set GITLEAKS to the path of a gitleaks binary, and push again.';

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

/** What the revision arguments need to know about the repository. */
export interface RevisionContext {
  /** The remote git names in $1: a configured remote's name, or the URL itself when the push names a URL. */
  readonly remote: string;
  /** True when `remote` is a configured remote (`git remote`), whose remote-tracking refs hold what it already has. */
  readonly namedRemote: boolean;
  /** True when this repository holds the object (a remote's old commit it has fetched). */
  readonly has: (object: string) => boolean;
}

/**
 * The `git rev-list` arguments for the commits the push adds to the remote: every object an update sends, and
 * `--not` the remote's known refs and every commit an update replaces that this repository holds. Null when the
 * push sends nothing (only deletions).
 */
export function revisionsToCheck(updates: readonly PushUpdate[], context: RevisionContext): string[] | null {
  const sent = [...new Set(updates.map((update) => update.localObject).filter((object) => !NULL_OBJECT.test(object)))];
  if (sent.length === 0) {
    return null;
  }
  const replaced = [...new Set(updates.map((update) => update.remoteObject).filter((object) => !NULL_OBJECT.test(object) && context.has(object)))];
  const known = context.namedRemote && REMOTE_NAME.test(context.remote) ? [`--remotes=${context.remote}`] : [];
  return [...sent, '--not', ...known, ...replaced];
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

/** The gitleaks binary: GITLEAKS when set (it must be executable), otherwise the first `gitleaks` on PATH. */
export function findGitleaks(env: NodeJS.ProcessEnv): string {
  const named = env.GITLEAKS;
  if (named !== undefined && named !== '') {
    if (!path.isAbsolute(named) || !executable(named)) {
      throw new PrePushError(`GITLEAKS is set but does not name an executable file by its absolute path, so this push is refused. ${GITLEAKS_INSTALL}`);
    }
    return named;
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
      'error',
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
      ['--diff-merges=remerge', ...options.revisions].join(' '),
      options.root,
    ];
    const result = run(options.gitleaks, args, options.root, options.env);
    if (result.status === 0) {
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
    const remotes = new Set(git(options.root, ['remote'], options.env).split('\n'));
    const revisions = revisionsToCheck(updates, {
      remote: options.remote,
      namedRemote: remotes.has(options.remote),
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
    const gitleaks = findGitleaks(options.env);
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
