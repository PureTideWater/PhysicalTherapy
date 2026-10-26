import { execFileSync } from 'node:child_process';
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';

import { FUNCTION_FILE_BANNER, FUNCTIONS_README, cOrder, functionFileNameProblem } from './functions';
import { DomainModelError } from './sources';

/**
 * The function files' directory (packages/db/functions; docs/adr/0068) against the files the generator produces:
 * what `--check` reports and what `--out` writes. The generator owns only the `*.sql` files in it that carry its
 * banner. The hand-written README.md is allowed and never touched; any other entry git would commit (a stray file, a
 * directory, a symlink) fails the check, since it would sit in the pull request beside the generated files looking
 * like one of them. Every file is a regular file of mode 100644: an executable bit fails the check (git would commit
 * mode 100755). A path git ignores (an editor's or Finder's leftovers, such as .DS_Store) is not an entry: it never
 * reaches a commit; but a generated file git ignores is reported, since it would never be committed. A symlink is
 * never followed, by the check, the writer or the reader, whatever its name, and nor is a directory that is one.
 */
export interface DirectoryDifference {
  /** The directory does not exist at all: one line, not one per function. */
  readonly absent: boolean;
  /** Files the generator produces that the directory lacks (empty when the directory is absent). */
  readonly missing: readonly string[];
  /** Files the generator produces that the directory holds but git ignores, so they would never be committed. */
  readonly ignored: readonly string[];
  /** `*.sql` files in the directory that no function produces, and any other entry git would commit but the README. */
  readonly extra: readonly string[];
  /** Files whose content differs, each with its first differing line (1-based; "(end of file)" past the end). */
  readonly differing: readonly { readonly file: string; readonly line: number; readonly existing: string; readonly generated: string }[];
  /** Symlinks and directories, refused whatever their name. */
  readonly refused: readonly string[];
  /** Regular files with an executable bit: git would commit them as mode 100755. */
  readonly executable: readonly string[];
}

/** No difference at all. */
export const sameDirectory = (d: DirectoryDifference): boolean =>
  !d.absent && d.missing.length + d.ignored.length + d.extra.length + d.differing.length + d.refused.length + d.executable.length === 0;

/** The first line where two files differ, or null when they are the same text. */
export function firstDifferingLine(existing: string, generated: string): { readonly line: number; readonly existing: string; readonly generated: string } | null {
  if (existing === generated) return null;
  const a = existing.split('\n');
  const b = generated.split('\n');
  let i = 0;
  while (i < Math.max(a.length, b.length) && a[i] === b[i]) i++;
  // Equal line lists of unequal texts cannot happen (split is lossless), but say so rather than report line 0.
  return { line: i + 1, existing: a[i] ?? '(end of file)', generated: b[i] ?? '(end of file)' };
}

/** The names among `names` that git ignores in `directory` (none when the directory is not in a git work tree). */
function ignoredBy(directory: string, names: readonly string[]): Set<string> {
  if (names.length === 0) return new Set();
  try {
    const out = execFileSync('git', ['-C', directory, 'check-ignore', '-z', '--stdin'], { input: names.join('\0'), encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return new Set(out.split('\0').filter((name) => name !== ''));
  } catch (error) {
    // check-ignore exits 1 when it ignores none of them, 128 outside a work tree: neither ignores anything.
    const stdout = (error as { stdout?: unknown }).stdout;
    return new Set(typeof stdout === 'string' ? stdout.split('\0').filter((name) => name !== '') : []);
  }
}

type EntryKind = 'file' | 'symlink' | 'directory' | 'other';
interface Entry {
  readonly name: string;
  readonly kind: EntryKind;
  /** A regular file with any executable bit. */
  readonly executable: boolean;
}

/**
 * The directory's entries, the README included, in C order: those git would commit, and apart those git ignores;
 * null when the directory does not exist. Never follows a symlink, the directory's own included.
 */
function entries(directory: string): { readonly kept: readonly Entry[]; readonly ignored: readonly Entry[] } | null {
  refuseLinkedDirectory(directory);
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    if ((error as NodeJS.ErrnoException).code === 'ENOTDIR') throw new DomainModelError(`${directory} is not a directory`);
    throw error;
  }
  const ignored = ignoredBy(directory, names);
  const all = [...names].sort(cOrder).map((name): Entry => {
    const stat = lstatSync(path.join(directory, name));
    const kind: EntryKind = stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other';
    return { name, kind, executable: kind === 'file' && (stat.mode & 0o111) !== 0 };
  });
  return { kept: all.filter((e) => !ignored.has(e.name)), ignored: all.filter((e) => ignored.has(e.name)) };
}

/** Refuses a directory that is itself a symlink: the writer, the check and the reader never follow one. */
function refuseLinkedDirectory(directory: string): void {
  let linked = false;
  try {
    linked = lstatSync(directory).isSymbolicLink();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (linked) throw new DomainModelError(`${directory} is a symlink; the function files are read and written only in a real directory`);
}

/** The directory against `expected` (file name to content); see the module comment. */
export function compareFunctionDirectory(directory: string, expected: ReadonlyMap<string, string>): DirectoryDifference {
  const found = entries(directory);
  if (found === null) return { absent: true, missing: [], ignored: [], extra: [], differing: [], refused: [], executable: [] };
  const present = new Set(found.kept.map((e) => e.name));
  const ignored = found.ignored.filter((e) => expected.has(e.name)).map((e) => e.name);
  const missing = [...expected.keys()].filter((name) => !present.has(name) && !ignored.includes(name)).sort(cOrder);
  const refused = found.kept.filter((e) => e.kind === 'symlink' || e.kind === 'directory').map((e) => e.name);
  const extra = found.kept.filter((e) => (e.kind === 'file' || e.kind === 'other') && !expected.has(e.name) && e.name !== FUNCTIONS_README).map((e) => e.name);
  const executable = found.kept.filter((e) => e.executable).map((e) => e.name);
  const differing = found.kept.flatMap((e) => {
    const generated = expected.get(e.name);
    if (generated === undefined || e.kind !== 'file') return [];
    const difference = firstDifferingLine(readFileSync(path.join(directory, e.name), 'utf8'), generated);
    return difference === null ? [] : [{ file: e.name, ...difference }];
  });
  return { absent: false, missing, ignored, extra, differing, refused, executable };
}

/** The difference as lines for --check and the drift case: each file, and its first differing line. */
export function describeDifference(directory: string, d: DirectoryDifference): string[] {
  if (d.absent) return [`${directory} does not exist; regenerate it (pnpm db:domain-model --out on a freshly migrated database)`];
  return [
    ...d.missing.map((f) => `missing: ${path.join(directory, f)}`),
    ...d.ignored.map((f) => `ignored by git: ${path.join(directory, f)}; it would never be committed (remove the ignore rule that matches it)`),
    ...d.extra.map((f) => `extra: ${path.join(directory, f)} (no function produces it; only the generated *.sql files and ${FUNCTIONS_README} belong here)`),
    ...d.refused.map((f) => `refused: ${path.join(directory, f)} is a symlink or a directory; only regular files belong here`),
    ...d.executable.map((f) => `executable: ${path.join(directory, f)} has an executable bit; the files are mode 100644 (chmod 644, or regenerate)`),
    ...d.differing.map((f) => `differs: ${path.join(directory, f.file)}, first at line ${String(f.line)}:\n    - ${f.existing}\n    + ${f.generated}`),
  ];
}

/** Whether a regular file's first line is the generator's banner, read through a descriptor that never follows a symlink. */
function carriesBanner(file: string): boolean {
  const banner = Buffer.from(`${FUNCTION_FILE_BANNER[0]}\n`, 'utf8');
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const head = Buffer.alloc(banner.length);
    const read = readSync(fd, head, 0, head.length, 0);
    return read === banner.length && head.equals(banner);
  } finally {
    closeSync(fd);
  }
}

/** What writeFunctionDirectory will do: the stale generated files it removes. */
export interface DirectoryPlan {
  readonly stale: readonly string[];
}

/**
 * Checks, changing nothing, that `--out` may write `expected` into the directory, and returns what it would remove;
 * the CLI runs it before writing the document, so a refusal leaves both as they were. Refused (DomainModelError):
 * the directory a symlink or not a directory; a symlink, directory or other non-regular entry where a file is to be
 * written or under a `*.sql` name; and a `*.sql` file no function produces that is not the generator's (its first
 * line not the banner, or its name not a function file's), which the writer would otherwise delete: a `--functions`
 * slip such as the migrations directory, or a hand-made file; and any other entry git would commit but the README (a
 * stray file, a directory, a symlink), which the check would report.
 */
export function planFunctionDirectory(directory: string, expected: ReadonlyMap<string, string>): DirectoryPlan {
  const found = entries(directory);
  if (found === null) return { stale: [] };
  // An entry git ignores is never removed or refused for its name alone, but nothing is written through one.
  const all = [...found.kept, ...found.ignored].sort((a, b) => cOrder(a.name, b.name));
  const kept = new Set(found.kept.map((e) => e.name));
  const blocked = all.filter((e) => e.kind !== 'file' && (expected.has(e.name) || (kept.has(e.name) && e.name.endsWith('.sql')))).map((e) => e.name);
  if (blocked.length) throw new DomainModelError(`${directory}: ${blocked.join(', ')} ${blocked.length === 1 ? 'is' : 'are'} not a regular file; remove ${blocked.length === 1 ? 'it' : 'them'} and regenerate`);
  // Any other entry git would commit (a stray file, a directory, a symlink) is refused too, as --check reports it.
  const strays = found.kept
    .filter((e) => !(e.name === FUNCTIONS_README && e.kind === 'file') && !expected.has(e.name) && !(e.kind === 'file' && e.name.endsWith('.sql')) && !blocked.includes(e.name))
    .map((e) => e.name);
  if (strays.length) {
    throw new DomainModelError(
      `${directory}: ${strays.join(', ')} ${strays.length === 1 ? 'is' : 'are'} neither a generated function file nor ${FUNCTIONS_README}; move ${strays.length === 1 ? 'it' : 'them'} away, or check --functions, and regenerate`,
    );
  }
  const candidates = found.kept.filter((e) => e.kind === 'file' && e.name.endsWith('.sql') && !expected.has(e.name)).map((e) => e.name);
  const foreign = candidates.filter((name) => functionFileNameProblem(name) !== null || !carriesBanner(path.join(directory, name)));
  if (foreign.length) {
    throw new DomainModelError(
      `${directory}: ${foreign.join(', ')} ${foreign.length === 1 ? 'is' : 'are'} not a generated function file (no banner on the first line, or not a function's name); the writer removes only its own stale files: move ${foreign.length === 1 ? 'it' : 'them'} away, or check --functions, and regenerate`,
    );
  }
  return { stale: candidates };
}

/**
 * Writes `expected` into the directory: each file whose content differs, or that has an executable bit, created or
 * replaced through a descriptor opened with O_NOFOLLOW and set to mode 644, and each stale generated `*.sql` file
 * removed. The README is left alone. Everything planFunctionDirectory refuses is refused
 * before anything changes. Returns the names written and removed.
 */
export function writeFunctionDirectory(directory: string, expected: ReadonlyMap<string, string>): { readonly written: readonly string[]; readonly removed: readonly string[] } {
  const { stale } = planFunctionDirectory(directory, expected);
  mkdirSync(directory, { recursive: true });
  const written: string[] = [];
  for (const [name, content] of [...expected].sort(([a], [b]) => cOrder(a, b))) {
    const file = path.join(directory, name);
    let existing: string | null = null;
    let executable = false;
    try {
      existing = readFileSync(file, 'utf8');
      executable = (lstatSync(file).mode & 0o111) !== 0;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (existing === content && !executable) continue;
    const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o644);
    try {
      if ((fstatSync(fd).mode & 0o7777) !== 0o644) fchmodSync(fd, 0o644);
      writeSync(fd, content);
    } finally {
      closeSync(fd);
    }
    written.push(name);
  }
  for (const name of stale) unlinkSync(path.join(directory, name));
  return { written, removed: [...stale] };
}

/**
 * The `*.sql` files in the directory, name to content, as the working tree holds them (an empty map when the
 * directory does not exist), for `--summary-since` alone. Refused (DomainModelError), never read or diffed: the
 * directory a symlink, and a `*.sql` entry that is not a regular file or whose name is not a function file's.
 */
export function readFunctionDirectory(directory: string): Map<string, string> {
  const found = entries(directory);
  if (found === null) return new Map();
  const sql = found.kept.filter((e) => e.name.endsWith('.sql'));
  const refused = sql.flatMap((e) => {
    const problem = functionFileNameProblem(e.name);
    if (problem !== null) return [`${JSON.stringify(e.name)} ${problem}`];
    return e.kind === 'file' ? [] : [`${e.name} is a ${e.kind}, not a regular file`];
  });
  if (refused.length) throw new DomainModelError(`${directory}: refused, never read: ${refused.join('; ')}`);
  return new Map(sql.map((e) => [e.name, readFileSync(path.join(directory, e.name), 'utf8')]));
}
