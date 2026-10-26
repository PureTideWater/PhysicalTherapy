import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { functionFileNameProblem } from './functions';
import { DOMAIN_MODEL_DOCUMENT, DomainModelError, FUNCTIONS_DIRECTORY, GENERATOR_INPUTS, REPO_ROOT } from './sources';

/** The domain model document as a git commit holds it: the ref asked for, the commit it names, and the text. */
export interface DocumentAtRef {
  readonly ref: string;
  readonly commit: string;
  readonly text: string;
}

/** A ref git takes as a revision, not an option: no leading "-", no spaces or control characters. */
const isRef = (ref: string): boolean => /^[^\s-]\S*$/.test(ref) && !/\p{Cc}/u.test(ref);

/**
 * The environment of every git call the summary makes: the caller's environment without the user's and the system's
 * git configuration (GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1) and without configuration passed through
 * the environment (GIT_CONFIG_COUNT/KEY_n/VALUE_n, GIT_CONFIG_PARAMETERS, GIT_CONFIG), an external diff or diff
 * options, so diff.context, diff.algorithm, diff.noprefix, a global attributes file marking *.sql binary and the like
 * cannot change what the summary prints: the build's local copy and CI's are the same text for the same files.
 */
export function isolatedGitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (/^GIT_CONFIG(?:_|$)/.test(key) || key === 'GIT_EXTERNAL_DIFF' || key === 'GIT_DIFF_OPTS' || key === 'GIT_ATTR_SOURCE') continue;
    out[key] = value;
  }
  return { ...out, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
}

/** Configuration given on every such call: no attributes file but the repository's own. */
const ISOLATED_CONFIG = ['-c', 'core.attributesFile=/dev/null'] as const;

/** git's stderr from a failed call, trimmed, or its message. */
function gitStderr(error: unknown): string {
  const stderr = (error as { stderr?: unknown }).stderr;
  const text = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : typeof stderr === 'string' ? stderr : '';
  return text.trim() || (error instanceof Error ? error.message : String(error));
}

/**
 * docs/product/domain-model.md at `ref` (a branch, a tag, `origin/main` or a commit), for
 * `--summary-since`: the last approved document is the one on the base branch, since no migration merges
 * without an approval (CLAUDE.md, Schema gate). Refuses (DomainModelError) a ref git cannot resolve to a
 * commit, and a commit without the document.
 */
export function documentAtRef(ref: string, options: { readonly repoRoot?: string; readonly document?: string } = {}): DocumentAtRef {
  const root = options.repoRoot ?? REPO_ROOT;
  const document = path.relative(root, options.document ?? DOMAIN_MODEL_DOCUMENT).split(path.sep).join('/');
  if (!isRef(ref)) throw new DomainModelError(`--summary-since ${JSON.stringify(ref)} is not a git ref`);
  const git = (args: readonly string[]): string =>
    execFileSync('git', ['-C', root, ...ISOLATED_CONFIG, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024, env: isolatedGitEnv() });
  let commit: string;
  try {
    commit = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    throw new DomainModelError(`--summary-since ${ref}: git knows no such commit (fetch the base branch first, e.g. git fetch origin)`);
  }
  try {
    return { ref, commit, text: git(['show', `${commit}:${document}`]) };
  } catch {
    throw new DomainModelError(`--summary-since ${ref}: commit ${commit.slice(0, 12)} has no ${document}`);
  }
}

/** git with the repository's root and the isolated configuration, its stdout as a Buffer (stdin `input` when given). */
function gitBytes(root: string, args: readonly string[], input?: string): Buffer {
  return execFileSync('git', ['-C', root, ...ISOLATED_CONFIG, ...args], { input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024, env: isolatedGitEnv() });
}

/** gitBytes for the function section: a failure is a DomainModelError (exit 2) carrying git's stderr. */
function gitOrRefuse(root: string, args: readonly string[], what: string, input?: string): Buffer {
  try {
    return gitBytes(root, args, input);
  } catch (error) {
    throw new DomainModelError(`${what}: git ${args[0] ?? ''} failed: ${gitStderr(error)}`);
  }
}

/**
 * The commit the function section reads the base's files at (design review T17): the merge base of `commit` and
 * HEAD when HEAD is a commit that has one, so that function changes merged into the base after this branch left it
 * do not show as reversals in this branch's summary; else `commit` itself. In CI, HEAD is the merge of the pull
 * request into the base, so the two are the same commit.
 */
export function functionBaseCommit(commit: string, options: { readonly repoRoot?: string } = {}): string {
  const root = options.repoRoot ?? REPO_ROOT;
  if (!/^[0-9a-f]{7,64}$/.test(commit)) throw new DomainModelError(`${JSON.stringify(commit)} is not a commit object name`);
  try {
    const base = gitBytes(root, ['merge-base', commit, 'HEAD']).toString('utf8').trim();
    return /^[0-9a-f]{7,64}$/.test(base) ? base : commit;
  } catch {
    // No HEAD (an unborn branch), or no common ancestor: the ref's own commit.
    return commit;
  }
}

/**
 * The function files (`*.sql` directly under packages/db/functions) as `commit` holds them, file name to content,
 * for `--summary-since`; null when the commit has none (the base of the pull request that first adds them, or one
 * holding only the README). Every `*.sql` entry must be a regular file of mode 100644 with a function file's name
 * (functionFileNameProblem): any other is refused (DomainModelError), never diffed, since --check refuses it too.
 * Read in two git calls, ls-tree and one cat-file --batch, however many files. A git failure, or a blob the clone
 * lacks (a shallow or partial clone), is a DomainModelError naming git's answer.
 */
export function functionFilesAtCommit(commit: string, options: { readonly repoRoot?: string; readonly directory?: string } = {}): Map<string, string> | null {
  const root = options.repoRoot ?? REPO_ROOT;
  const directory = path.relative(root, options.directory ?? FUNCTIONS_DIRECTORY).split(path.sep).join('/');
  if (!/^[0-9a-f]{7,64}$/.test(commit)) throw new DomainModelError(`${JSON.stringify(commit)} is not a commit object name`);
  const what = `--summary-since: the function files at commit ${commit.slice(0, 12)}`;
  const listing = gitOrRefuse(root, ['ls-tree', '-z', commit, '--', `${directory}/`], what).toString('utf8');
  const entries = listing
    .split('\0')
    .filter((entry) => entry !== '')
    .map((entry) => {
      const m = /^(\d{6}) (\w+) ([0-9a-f]+)\t(.*)$/s.exec(entry);
      if (m === null) throw new DomainModelError(`${what}: git ls-tree answered ${JSON.stringify(entry)}`);
      return { mode: m[1] ?? '', type: m[2] ?? '', oid: m[3] ?? '', name: path.posix.basename(m[4] ?? '') };
    })
    .filter((e) => e.name.endsWith('.sql'));
  const refused = entries.flatMap((e) => {
    const problem = functionFileNameProblem(e.name);
    if (problem !== null) return [`${JSON.stringify(e.name)} ${problem}`];
    if (e.type !== 'blob' || e.mode !== '100644') return [`${e.name} is ${e.type === 'blob' ? `mode ${e.mode}` : `a ${e.type}`}, not a regular file of mode 100644`];
    return [];
  });
  if (refused.length) throw new DomainModelError(`${what}: refused, never diffed: ${refused.join('; ')}`);
  if (entries.length === 0) return null;
  const batch = gitOrRefuse(root, ['cat-file', '--batch'], what, `${entries.map((e) => e.oid).join('\n')}\n`);
  const out = new Map<string, string>();
  let at = 0;
  for (const e of entries) {
    const newline = batch.indexOf(0x0a, at);
    const header = batch.subarray(at, newline < 0 ? batch.length : newline).toString('utf8');
    const size = Number(/^[0-9a-f]+ blob (\d+)$/.exec(header)?.[1] ?? Number.NaN);
    if (newline < 0 || !Number.isInteger(size)) {
      const hint = / missing$/.test(header) ? '; the clone lacks it: fetch the full history (actions/checkout fetch-depth: 0, or git fetch --unshallow)' : '';
      throw new DomainModelError(`${what}: git cat-file answered ${JSON.stringify(header)} for ${directory}/${e.name}${hint}`);
    }
    out.set(e.name, batch.subarray(newline + 1, newline + 1 + size).toString('utf8'));
    at = newline + 1 + size + 1;
  }
  return out;
}

/**
 * The options every function diff is made with, whatever git's defaults or the caller's configuration: text always
 * (never "Binary files differ"), three lines of context, the Myers algorithm without the indent heuristic, hunks
 * never merged across unchanged lines, and no rename detection, so the same files give the same diff on every machine.
 */
export const FUNCTION_DIFF_OPTIONS = ['--text', '-U3', '--diff-algorithm=myers', '--no-indent-heuristic', '--inter-hunk-context=0', '--no-renames'] as const;

/**
 * The unified diff of each file that differs between two sets (file name to content; a file in one set only is
 * added or removed), file name to diff text, by git's own `git diff --no-index` over two temporary directories
 * holding only the differing files, under the isolated configuration and FUNCTION_DIFF_OPTIONS. The paths in each
 * diff's header read `a/<label>/<file>` and `b/<label>/<file>`, the label being the directory as the repository
 * names it (packages/db/functions). Every name must be a function file's (functionFileNameProblem), so no name can
 * leave the temporary directory or be quoted or cut by git's headers; any other is refused (DomainModelError), as is
 * a git failure, with git's stderr.
 */
export function unifiedDiffs(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>, label: string): Map<string, string> {
  const names = [...new Set([...before.keys(), ...after.keys()])].filter((name) => before.get(name) !== after.get(name));
  const out = new Map<string, string>();
  if (names.length === 0) return out;
  const badNames = names.flatMap((name) => {
    const problem = functionFileNameProblem(name);
    return problem === null ? [] : [`${JSON.stringify(name)} ${problem}`];
  });
  if (badNames.length) throw new DomainModelError(`the function diffs: refused, never diffed: ${badNames.join('; ')}`);
  const scratch = mkdtempSync(path.join(tmpdir(), 'function-diffs-'));
  try {
    const sides = { a: path.join(scratch, 'a'), b: path.join(scratch, 'b') };
    mkdirSync(sides.a);
    mkdirSync(sides.b);
    for (const name of names) {
      const was = before.get(name);
      const is = after.get(name);
      if (was !== undefined) writeFileSync(path.join(sides.a, name), was);
      if (is !== undefined) writeFileSync(path.join(sides.b, name), is);
    }
    let text: string;
    try {
      text = execFileSync(
        'git',
        [...ISOLATED_CONFIG, '-c', 'core.quotepath=off', 'diff', '--no-index', '--no-color', '--no-ext-diff', '--no-textconv', ...FUNCTION_DIFF_OPTIONS, '--src-prefix=', '--dst-prefix=', '--', 'a', 'b'],
        {
          cwd: scratch,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 256 * 1024 * 1024,
          // Never a repository above the temporary directory: its configuration would apply too.
          env: { ...isolatedGitEnv(), GIT_CEILING_DIRECTORIES: path.dirname(scratch) },
        },
      );
    } catch (error) {
      // git diff exits 1 when the sides differ, which they do: its stdout is the diff.
      const { status, stdout } = error as { status?: number; stdout?: unknown };
      if (status !== 1 || typeof stdout !== 'string') throw new DomainModelError(`the function diffs: git diff --no-index failed: ${gitStderr(error)}`);
      text = stdout;
    }
    for (const chunk of text.split(/^(?=diff --git )/m).filter((part) => part.startsWith('diff --git '))) {
      const name = /^diff --git [ab]\/(\S+) /.exec(chunk)?.[1];
      if (name === undefined) continue;
      // With empty prefixes the headers name the two directories, a/<file> and b/<file> (an added file b/ on both sides
      // of the first line, a removed one a/): name the repository's path, a/ before and b/ after, as git would.
      const relabelled = chunk
        .replace(/^diff --git [ab]\/(\S+) [ab]\/(\S+)$/m, (_line, x: string, y: string) => `diff --git a/${label}/${path.posix.basename(x)} b/${label}/${path.posix.basename(y)}`)
        .replace(/^--- [ab]\/(.+)$/m, (_line, x: string) => `--- a/${label}/${path.posix.basename(x)}`)
        .replace(/^\+\+\+ [ab]\/(.+)$/m, (_line, y: string) => `+++ b/${label}/${path.posix.basename(y)}`);
      out.set(path.posix.basename(name), relabelled.replace(/\n$/, ''));
    }
    const lost = names.filter((name) => !out.has(name));
    if (lost.length) throw new DomainModelError(`the function diffs: git printed no diff for ${lost.join(', ')}`);
    return out;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Whether git reports uncommitted changes to the generator's inputs (GENERATOR_INPUTS: packages/db and the Data
 * dictionary, the function files excluded as an output), for the provenance line. False outside a work tree.
 */
export function hasUncommittedInputs(options: { readonly repoRoot?: string } = {}): boolean {
  try {
    return gitBytes(options.repoRoot ?? REPO_ROOT, ['status', '--porcelain', '--', ...GENERATOR_INPUTS]).toString('utf8').trim() !== '';
  } catch {
    return false;
  }
}
