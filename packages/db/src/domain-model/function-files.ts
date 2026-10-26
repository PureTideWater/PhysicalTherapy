import { execFileSync } from 'node:child_process';
import { closeSync, constants, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';

import { FUNCTIONS_README, cOrder } from './functions';
import { DomainModelError } from './sources';

/**
 * The function files' directory (packages/db/functions; docs/adr/0068) against the files the generator produces:
 * what `--check` reports and what `--out` writes. The generator owns only the `*.sql` files in it. The hand-written
 * README.md is allowed and never touched; any other entry git would commit (a stray file, a directory, a symlink)
 * fails the check, since it would sit in the pull request beside the generated files looking like one of them. A
 * path git ignores (an editor's or Finder's leftovers, such as .DS_Store) is not an entry: it never reaches a
 * commit. A symlink is never followed, by the check or by the writer, whatever its name.
 */
export interface DirectoryDifference {
  /** Files the generator produces that the directory lacks. */
  readonly missing: readonly string[];
  /** `*.sql` files in the directory that no function produces, and any other entry git would commit but the README. */
  readonly extra: readonly string[];
  /** Files whose content differs, each with its first differing line (1-based; "(end of file)" past the end). */
  readonly differing: readonly { readonly file: string; readonly line: number; readonly existing: string; readonly generated: string }[];
  /** Symlinks and directories, refused whatever their name. */
  readonly refused: readonly string[];
}

/** No difference at all. */
export const sameDirectory = (d: DirectoryDifference): boolean => d.missing.length + d.extra.length + d.differing.length + d.refused.length === 0;

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

/** The directory's entries git would commit: name and kind, the README included; [] when the directory does not exist. */
function entries(directory: string): { readonly name: string; readonly kind: 'file' | 'symlink' | 'directory' | 'other' }[] {
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const ignored = ignoredBy(directory, names);
  return names
    .filter((name) => !ignored.has(name))
    .sort(cOrder)
    .map((name) => {
      const stat = lstatSync(path.join(directory, name));
      return { name, kind: stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other' };
    });
}

/** Refuses a directory that is itself a symlink: the writer and the check never follow one. */
function refuseLinkedDirectory(directory: string): void {
  try {
    if (lstatSync(directory).isSymbolicLink()) throw new DomainModelError(`${directory} is a symlink; the function files are written only to a real directory`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** The directory against `expected` (file name to content); see the module comment. */
export function compareFunctionDirectory(directory: string, expected: ReadonlyMap<string, string>): DirectoryDifference {
  refuseLinkedDirectory(directory);
  const found = entries(directory);
  const present = new Map(found.map((e) => [e.name, e.kind]));
  const missing = [...expected.keys()].filter((name) => !present.has(name)).sort(cOrder);
  const refused = found.filter((e) => e.kind === 'symlink' || e.kind === 'directory').map((e) => e.name);
  const extra = found.filter((e) => (e.kind === 'file' || e.kind === 'other') && !expected.has(e.name) && e.name !== FUNCTIONS_README).map((e) => e.name);
  const differing = found.flatMap((e) => {
    const generated = expected.get(e.name);
    if (generated === undefined || e.kind !== 'file') return [];
    const difference = firstDifferingLine(readFileSync(path.join(directory, e.name), 'utf8'), generated);
    return difference === null ? [] : [{ file: e.name, ...difference }];
  });
  return { missing, extra, differing, refused };
}

/** The difference as lines for --check and the drift case: each file, and its first differing line. */
export function describeDifference(directory: string, d: DirectoryDifference): string[] {
  return [
    ...d.missing.map((f) => `missing: ${path.join(directory, f)}`),
    ...d.extra.map((f) => `extra: ${path.join(directory, f)} (no function produces it; only the generated *.sql files and ${FUNCTIONS_README} belong here)`),
    ...d.refused.map((f) => `refused: ${path.join(directory, f)} is a symlink or a directory; only regular files belong here`),
    ...d.differing.map((f) => `differs: ${path.join(directory, f.file)}, first at line ${String(f.line)}:\n    - ${f.existing}\n    + ${f.generated}`),
  ];
}

/**
 * Writes `expected` into the directory: each file whose content differs, created or replaced through a descriptor
 * opened with O_NOFOLLOW, and each `*.sql` regular file no function produces removed. The README and every other
 * entry are left alone. A symlink or directory where a file is to be written or removed is refused before anything
 * changes. Returns the names written and removed.
 */
export function writeFunctionDirectory(directory: string, expected: ReadonlyMap<string, string>): { readonly written: readonly string[]; readonly removed: readonly string[] } {
  refuseLinkedDirectory(directory);
  mkdirSync(directory, { recursive: true });
  const found = entries(directory);
  const blocked = found.filter((e) => e.kind !== 'file' && (expected.has(e.name) || e.name.endsWith('.sql'))).map((e) => e.name);
  if (blocked.length) throw new DomainModelError(`${directory}: ${blocked.join(', ')} ${blocked.length === 1 ? 'is' : 'are'} not a regular file; remove ${blocked.length === 1 ? 'it' : 'them'} and regenerate`);
  const stale = found.filter((e) => e.kind === 'file' && e.name.endsWith('.sql') && !expected.has(e.name)).map((e) => e.name);
  const written: string[] = [];
  for (const [name, content] of [...expected].sort(([a], [b]) => cOrder(a, b))) {
    const file = path.join(directory, name);
    let existing: string | null = null;
    try {
      existing = readFileSync(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (existing === content) continue;
    const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o644);
    try {
      writeSync(fd, content);
    } finally {
      closeSync(fd);
    }
    written.push(name);
  }
  for (const name of stale) unlinkSync(path.join(directory, name));
  return { written, removed: stale };
}

/** The `*.sql` regular files in the directory, name to content, as the working tree holds them ([] when absent). */
export function readFunctionDirectory(directory: string): Map<string, string> {
  return new Map(
    entries(directory)
      .filter((e) => e.kind === 'file' && e.name.endsWith('.sql'))
      .map((e) => [e.name, readFileSync(path.join(directory, e.name), 'utf8')]),
  );
}
