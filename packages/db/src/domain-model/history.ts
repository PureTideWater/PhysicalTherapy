import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
    execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
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

/** git with the repository's root, its stdout as a Buffer (stdin `input` when given). */
function gitBytes(root: string, args: readonly string[], input?: string): Buffer {
  return execFileSync('git', ['-C', root, ...args], { input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
}

/**
 * The function files (`*.sql` directly under packages/db/functions, regular files only) as `commit` holds them,
 * file name to content, for `--summary-since`; null when the commit has no such directory (the base of the pull
 * request that first adds them). Read in two git calls, ls-tree and one cat-file --batch, however many files.
 */
export function functionFilesAtCommit(commit: string, options: { readonly repoRoot?: string; readonly directory?: string } = {}): Map<string, string> | null {
  const root = options.repoRoot ?? REPO_ROOT;
  const directory = path.relative(root, options.directory ?? FUNCTIONS_DIRECTORY).split(path.sep).join('/');
  if (!/^[0-9a-f]{7,64}$/.test(commit)) throw new DomainModelError(`${JSON.stringify(commit)} is not a commit object name`);
  const listing = gitBytes(root, ['ls-tree', '-z', commit, '--', `${directory}/`]).toString('utf8');
  const blobs = listing
    .split('\0')
    .filter((entry) => entry !== '')
    .map((entry) => /^(\d{6}) (\w+) ([0-9a-f]+)\t(.*)$/s.exec(entry))
    .filter((m): m is RegExpExecArray => m !== null);
  if (blobs.length === 0) return null;
  const files = blobs.filter((m) => (m[1] === '100644' || m[1] === '100755') && m[2] === 'blob' && (m[4] ?? '').endsWith('.sql'));
  const out = new Map<string, string>();
  if (files.length === 0) return out;
  const batch = gitBytes(root, ['cat-file', '--batch'], `${files.map((m) => m[3] ?? '').join('\n')}\n`);
  let at = 0;
  for (const m of files) {
    const newline = batch.indexOf(0x0a, at);
    const header = batch.subarray(at, newline).toString('utf8');
    const size = Number(/^[0-9a-f]+ blob (\d+)$/.exec(header)?.[1] ?? Number.NaN);
    if (!Number.isInteger(size)) throw new Error(`git cat-file answered ${JSON.stringify(header)} for ${m[4] ?? ''}`);
    out.set(path.posix.basename(m[4] ?? ''), batch.subarray(newline + 1, newline + 1 + size).toString('utf8'));
    at = newline + 1 + size + 1;
  }
  return out;
}

/**
 * The unified diff of each file that differs between two sets (file name to content; a file in one set only is
 * added or removed), file name to diff text, by git's own `git diff --no-index` over two temporary directories
 * holding only the differing files. The paths in each diff's header read `a/<label>/<file>` and `b/<label>/<file>`,
 * the label being the directory as the repository names it (packages/db/functions).
 */
export function unifiedDiffs(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>, label: string): Map<string, string> {
  const names = [...new Set([...before.keys(), ...after.keys()])].filter((name) => before.get(name) !== after.get(name));
  const out = new Map<string, string>();
  if (names.length === 0) return out;
  const scratch = mkdtempSync(path.join(tmpdir(), 'function-diffs-'));
  try {
    const sides = { a: path.join(scratch, 'a'), b: path.join(scratch, 'b') };
    mkdirSync(sides.a);
    mkdirSync(sides.b);
    for (const name of names) {
      if (path.basename(name) !== name || name.startsWith('.')) throw new DomainModelError(`${JSON.stringify(name)} cannot name a function file`);
      const was = before.get(name);
      const is = after.get(name);
      if (was !== undefined) writeFileSync(path.join(sides.a, name), was);
      if (is !== undefined) writeFileSync(path.join(sides.b, name), is);
    }
    let text: string;
    try {
      text = execFileSync('git', ['-c', 'core.quotepath=off', 'diff', '--no-index', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--src-prefix=', '--dst-prefix=', '--', 'a', 'b'], {
        cwd: scratch,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 256 * 1024 * 1024,
      });
    } catch (error) {
      // git diff exits 1 when the sides differ, which they do: its stdout is the diff.
      const { status, stdout } = error as { status?: number; stdout?: unknown };
      if (status !== 1 || typeof stdout !== 'string') throw error;
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
