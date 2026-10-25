import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

import { parse } from 'yaml';

import { MUTATE, MUTATION_PACKAGES, type MutationPackage, type Shard, readShards } from '../../stryker/base.mjs';
import { EXCLUDED, TEST_SETS, workspaceDirectories } from '../../vitest.mutation.config';
import { repositoryRoot } from '../content-files';
import { importClosure } from '../screening-capacity/watched';
import { shardsOf } from './shards';

/**
 * What a change affects, for the mutation workflow's changes job (docs/adr/0066, Part 4; test matrix CI-17). A pull
 * request measures exactly the packages whose closure it changes, each in all of its shards; a push, the weekly run and a
 * dispatched run measure every package.
 *
 * A package's closure is everything its mutation run reads:
 *
 * - its mutate files and its test set (stryker/base.mjs MUTATE; vitest.mutation.config.ts TEST_SETS, less EXCLUDED),
 *   and their import closure, tests included (tools/screening-capacity/watched.ts importClosure, includeTests): relative
 *   imports and every workspace package's exports, type-only imports too, which only widens it;
 * - the package.json and tsconfig.json of every workspace package a closure file lies in;
 * - the data files its tests and code read (DATA_FILES), held complete by a test that scans the closure for path
 *   literals under fixtures/, content/ and docs/ and fails on one the list does not cover;
 * - the third-party packages its files import by bare name, with their transitive dependencies from the lockfile's
 *   snapshots, and the test tooling (TEST_TOOLING): a lockfile change affects the package only when it moves a resolved
 *   version among those.
 *
 * And GLOBAL_INPUTS (the mutation configurations, the canary, the gate, this file and what they import, the root
 * manifest, the workspace list, the workflow) affect all four.
 *
 * `pnpm -s exec tsx tools/stryker/affected.ts --event <event> [--base <sha>] [--github-output <file>] [--summary <file>]`
 * prints, and writes to the job's outputs: `packages` and `shards` (JSON arrays) and `any`. A pull_request event diffs
 * HEAD against its merge base with --base; any other event measures every package.
 */

/** A data file glob a package's run reads, and why. */
export interface DataEntry {
  readonly glob: string;
  readonly why: string;
}

/**
 * The data files each package's mutation run reads (its tests' and its code's), by glob. `pnpm exec vitest run
 * tools/stryker/affected.test.ts` fails on a path literal in a closure that no entry covers.
 */
export const DATA_FILES: Readonly<Record<MutationPackage, readonly DataEntry[]>> = {
  money: [],
  pricing: [
    { glob: 'fixtures/golden/**', why: 'the golden claims and their worksheet, which the golden engine tests and testing.test.ts price' },
    { glob: 'fixtures/synthetic/rules/release-synth-*/**', why: 'the SYNTHETIC rule releases the engine tests, testing.ts and the golden claims load' },
    { glob: 'docs/product/unpriced-reasons.md', why: "unpriced-reasons.test.ts holds the engine's reasons to the closed list" },
    { glob: 'docs/product/rules-reference.md', why: 'unpriced-reasons.test.ts reads the rules reference beside the closed list' },
  ],
  ledger: [{ glob: 'fixtures/synthetic/**', why: "templates.test.ts reads packages/synth's posting and bank exports by case" }],
  packets: [
    { glob: 'fixtures/synthetic/CAS-08/**', why: "verifier.test.ts reads CAS-08's narrative draft and expected verdict" },
    { glob: 'fixtures/synthetic/rules/release-synth-*/**', why: "@tp/pricing/testing's SYNTHETIC releases, which the packets tests price under" },
  ],
};

/** The test tooling every mutation run loads, by name pattern: a move in any of them, or below them, affects all four. */
export const TEST_TOOLING = ['vitest', '@vitest/*', '@stryker-mutator/*', 'fast-check'] as const;

/** What affects every package, by glob, besides the import closure of GLOBAL_ENTRY_POINTS. */
export const GLOBAL_INPUTS = [
  'stryker/**',
  'tools/stryker/**',
  'vitest.mutation.config.ts',
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'tsconfig.base.json',
  '.github/workflows/mutation.yml',
] as const;

/** The mutation tooling's own entry points: whatever they import decides what runs and how it is judged. */
export const GLOBAL_ENTRY_POINTS = ['tools/stryker/affected.ts', 'tools/stryker/gate.ts', 'tools/stryker/shards.ts', 'tools/stryker/canary/verdict.ts', 'vitest.mutation.config.ts'] as const;

/** Where in a closure a path literal is looked for: data under these directories must be in DATA_FILES. */
export const DATA_ROOTS = ['fixtures', 'content', 'docs'] as const;

/**
 * A directory a closure file names, and what it reads there. The scan requires a directory literal to be covered by
 * `<dir>/**` (what is read under it is decided at run time), unless an entry here says exactly what the file reads
 * there: the files it joins to the directory, each named in the file and covered by DATA_FILES; or nothing a mutation
 * run calls, with the one function that reads it, which no other closure file may name.
 */
export interface DirectoryRead {
  readonly file: string;
  readonly directory: string;
  /** The files read under the directory; empty when no function a mutation run calls reads it. */
  readonly reads: readonly string[];
  /** When `reads` is empty: the function that reads the directory, which no other closure file names. */
  readonly onlyIn?: string;
  readonly why: string;
}

export const DIRECTORY_READS: readonly DirectoryRead[] = [
  {
    file: 'packages/pricing/src/unpriced-reasons.test.ts',
    directory: 'docs/product',
    reads: ['docs/product/unpriced-reasons.md', 'docs/product/rules-reference.md'],
    why: 'it joins these two names to the directory, and reads nothing else there',
  },
  {
    file: 'packages/rules/src/content.ts',
    directory: 'fixtures',
    reads: [],
    onlyIn: 'fixtureFileHashes',
    why: 'fixtureFileHashes hashes every fixture for the rules importer (packages/rules/src/import.ts), which no mutation closure reaches',
  },
];

export interface AffectedConfig {
  readonly mutate: Readonly<Record<MutationPackage, readonly string[]>>;
  readonly tests: Readonly<Record<MutationPackage, readonly string[]>>;
  readonly excluded: readonly string[];
  readonly data: Readonly<Record<MutationPackage, readonly DataEntry[]>>;
  readonly directoryReads: readonly DirectoryRead[];
  readonly global: readonly string[];
  readonly globalEntryPoints: readonly string[];
  readonly tooling: readonly string[];
}

export const REPOSITORY_CONFIG: AffectedConfig = {
  mutate: MUTATE,
  tests: TEST_SETS,
  excluded: EXCLUDED.map((excluded) => excluded.glob),
  data: DATA_FILES,
  directoryReads: DIRECTORY_READS,
  global: GLOBAL_INPUTS,
  globalEntryPoints: GLOBAL_ENTRY_POINTS,
  tooling: TEST_TOOLING,
};

/** A glob as a regular expression over repository paths: `**` any depth, `*` and `?` within one segment. */
export function globToRegExp(glob: string): RegExp {
  let pattern = '';
  for (let at = 0; at < glob.length; at += 1) {
    const char = glob[at] as string;
    if (char === '*' && glob[at + 1] === '*') {
      const slash = glob[at + 2] === '/';
      pattern += slash ? '(?:[^/]+/)*' : '.*';
      at += slash ? 2 : 1;
    } else if (char === '*') pattern += '[^/]*';
    else if (char === '?') pattern += '[^/]';
    else pattern += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${pattern}$`);
}

/** The files of `files` a glob list selects: any positive glob, less any `!` glob. */
export function selectFiles(files: readonly string[], globs: readonly string[]): string[] {
  const include = globs.filter((glob) => !glob.startsWith('!')).map(globToRegExp);
  const exclude = globs.filter((glob) => glob.startsWith('!')).map((glob) => globToRegExp(glob.slice(1)));
  return files.filter((file) => include.some((glob) => glob.test(file)) && !exclude.some((glob) => glob.test(file)));
}

const matchesAny = (file: string, globs: readonly string[]) => globs.some((glob) => globToRegExp(glob).test(file));

/** A bare import's package name (`@scope/name` or `name`), or undefined for a relative path, a URL or a Node built-in. */
export function packageName(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('/') || /^[a-z]+:/.test(specifier)) return undefined;
  const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : (specifier.split('/')[0] ?? specifier);
  return builtinModules.includes(name) ? undefined : name;
}

/** Every module specifier a source text imports or re-exports, statically or dynamically (watched.ts's own reading). */
export function specifiers(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const specifier = match[1] ?? match[2];
    if (specifier !== undefined) found.push(specifier);
  }
  return found;
}

/**
 * Every path literal under DATA_ROOTS in a source text: a string that starts with `<root>/`, after any ./ or ../, up to
 * its end or an interpolation; and a bare root (`'fixtures'`) passed to join() or resolve(), as path.join(root,
 * 'fixtures') is. A bare word elsewhere (a column named content) is not a path.
 */
export function dataLiterals(source: string): string[] {
  const roots = DATA_ROOTS.join('|');
  const found = new Set<string>();
  for (const match of source.matchAll(new RegExp(String.raw`['"\`](?:\.\.?\/)*((?:${roots})\/[^'"\`$\s]*)(?=['"\`]|\$\{)`, 'g'))) {
    const literal = (match[1] ?? '').replace(/\/+$/, '');
    if (literal !== '') found.add(literal);
  }
  for (const call of source.matchAll(/\b(?:join|resolve)\(([^()]*)\)/g)) {
    for (const match of (call[1] ?? '').matchAll(new RegExp(String.raw`['"\`](?:\.\.?\/)*(${roots})['"\`]`, 'g'))) if (match[1] !== undefined) found.add(match[1]);
  }
  return [...found].sort();
}

/** The directories a path is in, nearest first, and the path itself first of all. */
function selfAndAncestors(file: string): string[] {
  const parts = file.split('/');
  return parts.map((_, index) => parts.slice(0, parts.length - index).join('/'));
}

/**
 * Whether a data entry covers a path literal. A file is covered by a glob that matches it; a directory (a literal that
 * names no file: the code joins the rest at run time) only by a `<glob>/**` entry whose glob matches it or a directory
 * above it, since what it reads there is decided at run time.
 */
export function covers(entries: readonly DataEntry[], literal: string, isFile: (file: string) => boolean): boolean {
  if (isFile(literal)) return entries.some((entry) => globToRegExp(entry.glob).test(literal));
  return entries.some((entry) => {
    if (!entry.glob.endsWith('/**')) return false;
    const base = globToRegExp(entry.glob.slice(0, -3));
    return selfAndAncestors(literal).some((directory) => base.test(directory));
  });
}

export interface Closure {
  readonly pkg: MutationPackage;
  /** The repository files its run reads as code: mutate files, tests and every file they import, sorted. */
  readonly files: readonly string[];
  /** The package.json and tsconfig.json of every workspace package a closure file lies in. */
  readonly manifests: readonly string[];
  readonly data: readonly DataEntry[];
  /** The third-party packages the closure's files import by name, by the workspace package whose file imports them. */
  readonly imports: ReadonlyMap<string, ReadonlySet<string>>;
  /** Path literals under DATA_ROOTS in the closure's files that no data entry covers, with the file holding each. */
  readonly uncovered: readonly string[];
}

/** The workspace package directory (relative, `.` for the root) a file lies in. */
function ownerOf(file: string, directories: readonly string[]): string {
  return directories.filter((directory) => file.startsWith(`${directory}/`)).sort((a, b) => b.length - a.length)[0] ?? '.';
}

/** A package's closure over the repository at `root`, whose files are `files`. */
export function closureOf(pkg: MutationPackage, root: string, files: readonly string[], config: AffectedConfig = REPOSITORY_CONFIG): Closure {
  const seeds = [...selectFiles(files, config.mutate[pkg]), ...selectFiles(files, [...config.tests[pkg], ...config.excluded.map((glob) => `!${glob}`)])];
  const closure = importClosure(seeds, root, { includeTests: true });
  const directories = workspaceDirectories(root);
  const manifests = new Set<string>();
  const imports = new Map<string, Set<string>>();
  const uncovered: string[] = [];
  const isFile = (file: string) => files.includes(file);
  for (const file of closure) {
    const owner = ownerOf(file, directories);
    for (const manifest of ['package.json', 'tsconfig.json']) {
      const candidate = owner === '.' ? manifest : `${owner}/${manifest}`;
      if (isFile(candidate)) manifests.add(candidate);
    }
    const source = readFileSync(path.join(root, file), 'utf8');
    for (const specifier of specifiers(source)) {
      const name = packageName(specifier);
      if (name === undefined) continue;
      const names = imports.get(owner) ?? new Set<string>();
      names.add(name);
      imports.set(owner, names);
    }
    for (const literal of dataLiterals(source)) {
      const read = config.directoryReads.find((entry) => entry.file === file && entry.directory === literal);
      if (read === undefined) {
        if (!covers(config.data[pkg], literal, isFile)) uncovered.push(`${file}: ${literal}`);
        continue;
      }
      for (const target of read.reads) {
        const named = source.includes(`'${path.posix.basename(target)}'`) || source.includes(`"${path.posix.basename(target)}"`);
        if (!isFile(target) || !named || !covers(config.data[pkg], target, isFile)) uncovered.push(`${file}: ${literal} (reads ${target}${named ? '' : ', which the file does not name'})`);
      }
      if (read.reads.length === 0) {
        const others = closure.filter((other) => other !== file && read.onlyIn !== undefined && readFileSync(path.join(root, other), 'utf8').includes(read.onlyIn));
        if (read.onlyIn === undefined || !source.includes(read.onlyIn) || others.length > 0) uncovered.push(`${file}: ${literal} (${read.onlyIn ?? 'no function'} is named in ${others.join(', ') || 'no closure file but its own'})`);
      }
    }
  }
  return { pkg, files: closure, manifests: [...manifests].sort(), data: config.data[pkg], imports, uncovered };
}

/** The parts of pnpm-lock.yaml (v9) the closure reads. */
export interface Lockfile {
  readonly importers?: Readonly<Record<string, Readonly<Record<'dependencies' | 'devDependencies' | 'optionalDependencies', Readonly<Record<string, { readonly version: string }>> | undefined>>>>;
  readonly snapshots?: Readonly<Record<string, { readonly dependencies?: Readonly<Record<string, string>>; readonly optionalDependencies?: Readonly<Record<string, string>> } | null>>;
}

export function parseLockfile(text: string): Lockfile {
  return (parse(text) ?? {}) as Lockfile;
}

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;

/** A dependency's snapshot key: `name@version`, or the aliased package's own key for an `npm:` alias. */
function snapshotKey(name: string, version: string): string | undefined {
  if (version.startsWith('link:') || version.startsWith('file:')) return undefined;
  if (version.startsWith('npm:')) return version.slice(4);
  return `${name}@${version}`;
}

/**
 * The resolved third-party packages a closure loads under a lockfile: each name it imports, as the importing workspace
 * package's entry resolves it (the root's when that package declares none), the test tooling as the root and those
 * packages declare it, and every snapshot below them. Sorted snapshot keys (`name@version(peers)`), so two lockfiles'
 * sets compare directly; names that resolve nowhere are listed too, as `?name`.
 */
export function lockedPackages(lock: Lockfile, imports: ReadonlyMap<string, ReadonlySet<string>>, tooling: readonly string[]): string[] {
  const importers = lock.importers ?? {};
  const snapshots = lock.snapshots ?? {};
  const found = new Set<string>();
  const stack: string[] = [];
  const declared = (importer: string, name: string) => {
    for (const field of DEPENDENCY_FIELDS) {
      const entry = importers[importer]?.[field]?.[name];
      if (entry !== undefined) return entry.version;
    }
    return undefined;
  };
  for (const [importer, names] of imports) {
    for (const name of names) {
      const version = declared(importer, name) ?? declared('.', name);
      if (version === undefined) {
        found.add(`?${name}`);
        continue;
      }
      const key = snapshotKey(name, version);
      if (key !== undefined) stack.push(key);
    }
  }
  const toolingPatterns = tooling.map(globToRegExp);
  for (const importer of new Set(['.', ...imports.keys()])) {
    for (const field of DEPENDENCY_FIELDS) {
      for (const [name, entry] of Object.entries(importers[importer]?.[field] ?? {})) {
        if (!toolingPatterns.some((pattern) => pattern.test(name))) continue;
        const key = snapshotKey(name, entry.version);
        if (key !== undefined) stack.push(key);
      }
    }
  }
  for (let key = stack.pop(); key !== undefined; key = stack.pop()) {
    if (found.has(key)) continue;
    found.add(key);
    const snapshot = snapshots[key];
    for (const dependencies of [snapshot?.dependencies, snapshot?.optionalDependencies]) {
      for (const [name, version] of Object.entries(dependencies ?? {})) {
        const next = snapshotKey(name, version);
        if (next !== undefined && !found.has(next)) stack.push(next);
      }
    }
  }
  return [...found].sort();
}

export interface Change {
  /** Every changed path, old and new names of a move both listed. */
  readonly files: readonly string[];
  /** The lockfile before and after the change, when it changed (undefined text: no lockfile on that side). */
  readonly lockfile?: { readonly before: string | undefined; readonly after: string | undefined };
}

export interface Affected {
  readonly packages: readonly MutationPackage[];
  /** Why each package is affected: the first changed paths (or the lockfile's moved packages) that reach it. */
  readonly reasons: Readonly<Partial<Record<MutationPackage, readonly string[]>>>;
}

/** The global inputs: the fixed globs and every file the mutation tooling's own entry points import. */
export function globalFiles(root: string, files: readonly string[], config: AffectedConfig = REPOSITORY_CONFIG): { readonly globs: readonly string[]; readonly files: ReadonlySet<string> } {
  const entries = config.globalEntryPoints.filter((entry) => files.includes(entry) || existsSync(path.join(root, entry)));
  return { globs: config.global, files: new Set(importClosure(entries, root)) };
}

/** The packages a change affects, given each package's closure. */
export function affected(change: Change, closures: readonly Closure[], global: ReturnType<typeof globalFiles>, tooling: readonly string[] = TEST_TOOLING): Affected {
  const reasons: Partial<Record<MutationPackage, string[]>> = {};
  const note = (pkg: MutationPackage, why: string) => {
    const list = reasons[pkg] ?? [];
    if (list.length < 5) list.push(why);
    reasons[pkg] = list;
  };
  const lockfile = 'pnpm-lock.yaml';
  for (const file of change.files) {
    if (file === lockfile) continue;
    const isGlobal = global.files.has(file) || matchesAny(file, global.globs);
    for (const closure of closures) {
      if (isGlobal) note(closure.pkg, `${file} (mutation tooling, every package)`);
      else if (closure.files.includes(file)) note(closure.pkg, `${file} (imported)`);
      else if (closure.manifests.includes(file)) note(closure.pkg, `${file} (a manifest of its closure)`);
      else if (matchesAny(file, closure.data.map((entry) => entry.glob))) note(closure.pkg, `${file} (data its run reads)`);
    }
  }
  if (change.files.includes(lockfile)) {
    const before = change.lockfile?.before === undefined ? undefined : parseLockfile(change.lockfile.before);
    const after = change.lockfile?.after === undefined ? undefined : parseLockfile(change.lockfile.after);
    for (const closure of closures) {
      if (before === undefined || after === undefined) {
        note(closure.pkg, `${lockfile} (added or removed)`);
        continue;
      }
      const was = new Set(lockedPackages(before, closure.imports, tooling));
      const now = new Set(lockedPackages(after, closure.imports, tooling));
      const moved = [...new Set([...was, ...now])].filter((key) => was.has(key) !== now.has(key)).sort();
      if (moved.length > 0) note(closure.pkg, `${lockfile} moves ${moved.slice(0, 3).join(', ')}${moved.length > 3 ? ` and ${String(moved.length - 3)} more` : ''}`);
    }
  }
  return { packages: MUTATION_PACKAGES.filter((pkg) => reasons[pkg] !== undefined), reasons };
}

/** Every shard of each affected package, in the file's order. */
export function shardsFor(packages: readonly MutationPackage[], shards: readonly Shard[] = readShards()): string[] {
  const selected = new Set(packages.flatMap((pkg) => shardsOf(pkg, shards).map((shard) => shard.name)));
  return shards.filter((shard) => selected.has(shard.name)).map((shard) => shard.name);
}

/** The repository's tracked files. */
export function trackedFiles(root: string = repositoryRoot): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter((file) => file !== '');
}

/** Every package's closure over the repository. */
export function repositoryClosures(root: string = repositoryRoot, files: readonly string[] = trackedFiles(root)): Closure[] {
  return MUTATION_PACKAGES.map((pkg) => closureOf(pkg, root, files));
}

/** The change from `base` to HEAD in the repository: the paths (both names of a move) and the lockfile on each side. */
export function changeSince(base: string, root: string = repositoryRoot): Change {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const files = git('diff', '--name-only', '--no-renames', '-z', base, 'HEAD')
    .split('\0')
    .filter((file) => file !== '');
  const show = (revision: string) => {
    try {
      return git('show', `${revision}:pnpm-lock.yaml`);
    } catch {
      return undefined;
    }
  };
  return { files, lockfile: files.includes('pnpm-lock.yaml') ? { before: show(base), after: show('HEAD') } : undefined };
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : (args[at + 1] ?? '');
  };
  const event = option('--event') ?? 'pull_request';
  const output = option('--github-output');
  const summary = option('--summary');
  let result: Affected;
  if (event === 'pull_request') {
    const base = option('--base');
    if (base === undefined || base === '') throw new Error('a pull request needs --base <sha>: its base branch commit');
    const mergeBase = execFileSync('git', ['merge-base', base, 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
    const files = trackedFiles();
    const closures = repositoryClosures(repositoryRoot, files);
    const problems = closures.flatMap((closure) => closure.uncovered.map((literal) => `${closure.pkg}: ${literal}`));
    if (problems.length > 0) throw new Error(`data a closure reads that DATA_FILES does not list (tools/stryker/affected.ts):\n${problems.join('\n')}`);
    result = affected(changeSince(mergeBase), closures, globalFiles(repositoryRoot, files));
    process.stdout.write(`diffed from ${mergeBase} (the merge base of ${base} and HEAD)\n`);
  } else {
    result = { packages: [...MUTATION_PACKAGES], reasons: Object.fromEntries(MUTATION_PACKAGES.map((pkg) => [pkg, [`a ${event} run measures every package`]])) };
  }
  const shards = shardsFor(result.packages);
  const lines = MUTATION_PACKAGES.map((pkg) => `${pkg}: ${result.reasons[pkg] === undefined ? 'not affected' : `affected by ${(result.reasons[pkg] ?? []).join('; ')}`}`);
  lines.push(`shards: ${shards.length === 0 ? 'none (no money path changed)' : shards.join(', ')}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  if (output !== undefined && output !== '') {
    appendFileSync(output, `any=${String(result.packages.length > 0)}\npackages=${JSON.stringify(result.packages)}\nshards=${JSON.stringify(shards)}\n`);
  }
  if (summary !== undefined && summary !== '') {
    appendFileSync(summary, ['## What the change affects (mutation)', '', ...lines.map((line) => `- ${line}`), ''].join('\n'));
  }
}
