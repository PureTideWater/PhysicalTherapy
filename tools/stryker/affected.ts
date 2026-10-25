import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { builtinModules } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { parse } from 'yaml';

import { MUTATE, MUTATION_PACKAGES, type MutationPackage, type Shard, readShards } from '../../stryker/base.mjs';
import { EXCLUDED, TEST_SETS } from '../../vitest.mutation.config';
import { repositoryRoot } from '../content-files';
import { importGraph } from '../screening-capacity/watched';
import { shardsOf } from './shards';
import { workspaceDirectories } from './workspace';

/**
 * What a change affects, for the mutation workflow's changes job (docs/adr/0066, Part 4; test matrix CI-17). A pull
 * request measures exactly the packages whose closure it changes, each in all of its shards; a push, the weekly run and a
 * dispatched run measure every package.
 *
 * A package's closure is everything its mutation run reads:
 *
 * - its mutate files and its test set (stryker/base.mjs MUTATE; vitest.mutation.config.ts TEST_SETS, less EXCLUDED),
 *   and their import closure, tests included (tools/screening-capacity/watched.ts importGraph, includeTests): relative
 *   imports and every workspace package's exports as vitest.mutation.config.ts aliases them (tools/stryker/workspace.ts),
 *   type-only imports too, which only widens it;
 * - the package.json and tsconfig.json of every workspace package a closure file lies in;
 * - the data files its tests and code read (DATA_FILES), held complete by a scan of the closure for path literals under
 *   fixtures/, content/ and docs/, and by requiring every closure file that reads the file system to be a listed reader;
 * - the third-party packages its files import by bare name, with their transitive dependencies from the lockfile's
 *   snapshots, the test tooling (TEST_TOOLING) and what the mutation tooling itself imports: a lockfile change affects
 *   the package only when it moves a resolved version among those.
 *
 * A pull request's closures are taken on both sides of the change, its head and its merge base, so a test, helper,
 * manifest or data file it deletes or moves out of a package's sets still affects that package; and any changed path
 * its mutate or test set selects affects it, whether or not the file still exists.
 *
 * And GLOBAL_INPUTS (the mutation configurations, the canary, the gate, this file and what they import, the root
 * manifest, the workspace list, the workflow) affect all four.
 *
 * `pnpm -s exec tsx tools/stryker/affected.ts --event <event> [--base <sha>] [--github-output <file>] [--summary <file>]`
 * prints, and writes to the job's outputs: `packages` and `shards` (JSON arrays) and `any`. A pull_request event diffs
 * HEAD against its merge base with --base; any other event measures every package. It stops, writing no output, when a
 * closure reads data DATA_FILES does not list, reads the file system unlisted, or imports what resolves to no file.
 */

/** A data file glob a package's run reads, why, and the closure files that read it through the file system. */
export interface DataEntry {
  readonly glob: string;
  readonly why: string;
  /**
   * The closure files that read these files with node:fs: the test or helper itself, or the reader it passes the path
   * to (packages/rules/src/content.ts for a release). Every closure file that imports node:fs must be one, or be named
   * by DIRECTORY_READS or UNCALLED_READS.
   */
  readonly readers?: readonly string[];
}

const LEDGER_TEMPLATES_TEST = 'packages/ledger/src/templates.test.ts';
const RULES_CONTENT = 'packages/rules/src/content.ts';

/** The posting and bank exports templates.test.ts reads under fixtures/synthetic, by name (DIRECTORY_READS holds the list complete). */
const LEDGER_EXPORTS = [
  'fixtures/synthetic/LED-04/posting-export.csv',
  'fixtures/synthetic/LED-05/eft-export.csv',
  'fixtures/synthetic/LED-06/recoupment-posting-export.csv',
  'fixtures/synthetic/LED-08/posting-export-again.csv',
  'fixtures/synthetic/LED-08/posting-export.csv',
  'fixtures/synthetic/LED-09/lines-posting-export.csv',
  'fixtures/synthetic/emr/*/manifest.json',
  'fixtures/synthetic/emr/*/posting-export.csv',
] as const;

/**
 * The data files each package's mutation run reads (its tests' and its code's), by glob. `pnpm exec vitest run
 * tools/stryker/affected.test.ts` and the changes job fail on a path literal in a closure that no entry covers, and on
 * a closure file that reads the file system without being a listed reader.
 */
export const DATA_FILES: Readonly<Record<MutationPackage, readonly DataEntry[]>> = {
  money: [],
  pricing: [
    {
      glob: 'fixtures/golden/**',
      why: 'the golden claims and their worksheet, which the golden engine tests and testing.test.ts price',
      readers: ['tools/golden-worksheet/engine.ts', 'tools/golden-worksheet/engine.golden.test.ts'],
    },
    {
      glob: 'fixtures/synthetic/rules/release-synth-*/**',
      why: 'the SYNTHETIC rule releases the engine tests and testing.ts load, and the golden claims name in their inputs',
      readers: [RULES_CONTENT],
    },
    { glob: 'docs/product/unpriced-reasons.md', why: "unpriced-reasons.test.ts holds the engine's reasons to the closed list", readers: ['packages/pricing/src/unpriced-reasons.test.ts'] },
    { glob: 'docs/product/rules-reference.md', why: 'unpriced-reasons.test.ts reads the rules reference beside the closed list', readers: ['packages/pricing/src/unpriced-reasons.test.ts'] },
  ],
  ledger: LEDGER_EXPORTS.map((glob) => ({ glob, why: "templates.test.ts reads packages/synth's posting and bank exports by name", readers: [LEDGER_TEMPLATES_TEST] })),
  packets: [
    { glob: 'fixtures/synthetic/CAS-08/**', why: "verifier.test.ts reads CAS-08's narrative draft and expected verdict", readers: ['packages/packets/src/verifier.test.ts'] },
    { glob: 'fixtures/synthetic/rules/release-synth-*/**', why: "@tp/pricing/testing's SYNTHETIC releases, which the packets tests price under", readers: [RULES_CONTENT] },
  ],
};

/**
 * The tooling every mutation run loads or is decided by, by name pattern: the test runner and Stryker, the property
 * library, and tsx, which runs the changes job, the shard runner, the canary's verdict and the gate. A move in any of
 * them, or below them, affects all four, and so does a move of what the mutation tooling's own files import
 * (GLOBAL_ENTRY_POINTS' closure: yaml, which reads the lockfile here, and vitest/config).
 */
export const TEST_TOOLING = ['vitest', '@vitest/*', '@stryker-mutator/*', 'fast-check', 'tsx'] as const;

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

/** The modules a closure file reads the file system through: a file that imports one must be a listed reader. */
export const FILE_SYSTEM_MODULES = ['node:fs', 'fs', 'node:fs/promises', 'fs/promises'] as const;

/**
 * A directory a closure file names, and what it reads there. The scan requires a directory literal to be covered by
 * `<dir>/**` (what is read under it is decided at run time), unless an entry here says exactly what the file reads
 * there: the files it joins to the directory, each named in the file, every file it names there listed, and each
 * covered by DATA_FILES; or nothing a mutation run calls, with the one function that reads it, which no other closure
 * file may name.
 */
export interface DirectoryRead {
  readonly file: string;
  readonly directory: string;
  /**
   * The files read under the directory, each a path or a pattern whose `*` stands for what the file interpolates
   * (`emr/${id}/manifest.json` names `<directory>/emr/*\/manifest.json`); empty when no function a mutation run calls
   * reads it.
   */
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
    file: RULES_CONTENT,
    directory: 'fixtures',
    reads: [],
    onlyIn: 'fixtureFileHashes',
    why: 'fixtureFileHashes hashes every fixture for the rules importer (packages/rules/src/import.ts), which no mutation closure reaches',
  },
  {
    file: LEDGER_TEMPLATES_TEST,
    directory: 'fixtures/synthetic',
    reads: LEDGER_EXPORTS,
    why: 'fixture() joins each of these names to the directory, the vendor templates by their id, and the test names no other file there',
  },
];

/** A closure file that reads the file system only in functions no mutation run calls: each named in no other closure file. */
export interface UncalledRead {
  readonly file: string;
  readonly onlyIn: readonly string[];
  readonly why: string;
}

export const UNCALLED_READS: readonly UncalledRead[] = [
  {
    file: 'tools/content-files.ts',
    onlyIn: ['listFiles', 'isX12Interchange'],
    why: 'the golden tests import it for repositoryRoot; its two readers list and sniff files for the repository checks, which no mutation closure reaches',
  },
];

export interface AffectedConfig {
  readonly mutate: Readonly<Record<MutationPackage, readonly string[]>>;
  readonly tests: Readonly<Record<MutationPackage, readonly string[]>>;
  readonly excluded: readonly string[];
  readonly data: Readonly<Record<MutationPackage, readonly DataEntry[]>>;
  readonly directoryReads: readonly DirectoryRead[];
  readonly uncalledReads?: readonly UncalledRead[];
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
  uncalledReads: UNCALLED_READS,
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

/** The end (exclusive) of the string literal that opens at `start`: its closing quote, or a template's, past its interpolations. */
function stringEnd(source: string, start: number): number {
  const quote = source[start];
  for (let at = start + 1; at < source.length; at += 1) {
    const char = source[at];
    if (char === '\\') at += 1;
    else if (char === quote) return at + 1;
    else if (quote !== '`' && char === '\n') return at;
    else if (quote === '`' && char === '$' && source[at + 1] === '{') at = closing(source, at + 1, '{', '}') - 1;
  }
  return source.length;
}

/** The position after the bracket that closes the one at `open`, strings skipped. */
function closing(source: string, open: number, opener: string, closer: string): number {
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    const char = source[at];
    if (char === '"' || char === "'" || char === '`') at = stringEnd(source, at) - 1;
    else if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) return at + 1;
    }
  }
  return source.length;
}

/** The argument ranges of every path call in a source text: join(), resolve() and new URL(), nested calls inside them included. */
function pathCallRanges(source: string): (readonly [number, number])[] {
  return [...source.matchAll(/\b(?:join|resolve)\s*\(|\bnew\s+URL\s*\(/g)].map((call) => {
    const open = call.index + call[0].length - 1;
    return [open + 1, closing(source, open, '(', ')') - 1] as const;
  });
}

/**
 * Every path literal under DATA_ROOTS in a source text, up to the literal's end or an interpolation:
 *
 * - a root that starts a string, after any ./ or ../ (`'../../fixtures/synthetic'`), or that follows an interpolation
 *   (`${root}/fixtures/...`), with a subpath or bare;
 * - a bare root (`'fixtures'`) that is an argument of join(), resolve() or new URL(), nested calls in them included,
 *   as path.join(repositoryRoot(), 'fixtures', 'golden') holds it: the whole directory, since what is joined to it is
 *   read at run time. A bare word elsewhere (a column named content) is not a path.
 *
 * What a variable holds is not followed: every closure file that reads the file system is a listed reader instead.
 */
export function dataLiterals(source: string): string[] {
  const roots = DATA_ROOTS.join('|');
  const found = new Set<string>();
  const calls = pathCallRanges(source);
  for (const match of source.matchAll(new RegExp(String.raw`(['"\`]|\}\/?)((?:\.\.?\/)*)(${roots})((?:\/[^'"\`$\s]*)?)(?=['"\`]|\$\{)`, 'g'))) {
    const [, opener = '', dots = '', root = '', rest = ''] = match;
    const literal = `${root}${rest}`.replace(/\/+$/, '');
    const bare = rest === '' && dots === '' && !opener.startsWith('}');
    if (!bare || calls.some(([start, end]) => match.index >= start && match.index < end)) found.add(literal);
  }
  return [...found].sort();
}

/** Every string literal of a source text, an interpolation in a template standing as `*`. */
export function stringLiterals(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const text = match[1] ?? match[2] ?? (match[3] ?? '').replace(/\$\{[^}]*\}/g, '*');
    found.push(text);
  }
  return found;
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

/** Whether a directory read's file or pattern is covered: a file as `covers` decides, a pattern by an entry of that pattern or a `/**` entry above it. */
function coversRead(entries: readonly DataEntry[], read: string, isFile: (file: string) => boolean): boolean {
  if (!read.includes('*')) return covers(entries, read, isFile);
  const fixed = read.slice(0, read.indexOf('*')).replace(/\/[^/]*$/, '');
  return entries.some((entry) => entry.glob === read) || covers(entries, fixed, () => false);
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
  /** The globs of its mutate set and of its test set less the exclusions: a changed path they select affects it, whether or not it exists. */
  readonly sets: readonly (readonly string[])[];
  /** File-system reads no entry accounts for: a reader no DATA_FILES, DIRECTORY_READS or UNCALLED_READS entry names, or a name a directory read leaves out. */
  readonly unaccounted: readonly string[];
  /** Imports that should reach a repository file and do not (a relative path; a workspace package's name or scope), as `<file>: <specifier>`. */
  readonly unresolved: readonly string[];
  /** Its files and manifests that only the merge base's closure holds (unionClosures). */
  readonly atBase?: ReadonlySet<string>;
}

/** The workspace package directory (relative, `.` for the root) a file lies in. */
function ownerOf(file: string, directories: readonly string[]): string {
  return directories.filter((directory) => file.startsWith(`${directory}/`)).sort((a, b) => b.length - a.length)[0] ?? '.';
}

/** The third-party packages files import by bare name, by the workspace package whose file imports them. */
function importsOf(root: string, files: readonly string[], directories: readonly string[], sourceOf: (file: string) => string = (file) => readFileSync(path.join(root, file), 'utf8')): Map<string, Set<string>> {
  const imports = new Map<string, Set<string>>();
  for (const file of files) {
    const owner = ownerOf(file, directories);
    for (const specifier of specifiers(sourceOf(file))) {
      const name = packageName(specifier);
      if (name === undefined) continue;
      const names = imports.get(owner) ?? new Set<string>();
      names.add(name);
      imports.set(owner, names);
    }
  }
  return imports;
}

const named = (source: string, name: string) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(source);

/** A package's closure over the repository at `root`, whose files are `files`. */
export function closureOf(pkg: MutationPackage, root: string, files: readonly string[], config: AffectedConfig = REPOSITORY_CONFIG): Closure {
  const sets = [config.mutate[pkg], [...config.tests[pkg], ...config.excluded.map((glob) => `!${glob}`)]];
  const seeds = sets.flatMap((globs) => selectFiles(files, globs));
  const graph = importGraph(seeds, root, { includeTests: true });
  const closure = graph.files;
  const directories = workspaceDirectories(root);
  const manifests = new Set<string>();
  const uncovered: string[] = [];
  const unaccounted: string[] = [];
  const tracked = new Set(files);
  const isFile = (file: string) => tracked.has(file);
  const sourceOf = new Map(closure.map((file) => [file, readFileSync(path.join(root, file), 'utf8')]));
  const elsewhere = (file: string, name: string) => closure.filter((other) => other !== file && named(sourceOf.get(other) ?? '', name));
  for (const file of closure) {
    const owner = ownerOf(file, directories);
    for (const manifest of ['package.json', 'tsconfig.json']) {
      const candidate = owner === '.' ? manifest : `${owner}/${manifest}`;
      if (isFile(candidate)) manifests.add(candidate);
    }
    const source = sourceOf.get(file) ?? '';
    for (const literal of dataLiterals(source)) {
      const read = config.directoryReads.find((entry) => entry.file === file && entry.directory === literal);
      if (read === undefined) {
        if (!covers(config.data[pkg], literal, isFile)) uncovered.push(`${file}: ${literal}`);
        continue;
      }
      const names = new Set(stringLiterals(source));
      for (const target of read.reads) {
        const relative = target.startsWith(`${read.directory}/`) ? target.slice(read.directory.length + 1) : undefined;
        const isNamed = relative !== undefined && names.has(relative);
        const exists = target.includes('*') ? files.some((candidate) => globToRegExp(target).test(candidate)) : isFile(target);
        if (!exists || !isNamed || !coversRead(config.data[pkg], target, isFile)) uncovered.push(`${file}: ${literal} (reads ${target}${isNamed ? '' : ', which the file does not name'})`);
      }
      if (read.reads.length === 0) {
        const others = read.onlyIn === undefined ? [] : closure.filter((other) => other !== file && (sourceOf.get(other) ?? '').includes(read.onlyIn ?? ''));
        if (read.onlyIn === undefined || !source.includes(read.onlyIn) || others.length > 0) uncovered.push(`${file}: ${literal} (${read.onlyIn ?? 'no function'} is named in ${others.join(', ') || 'no closure file but its own'})`);
        continue;
      }
      // Every file the reader names under the directory is one it reads, so the list cannot fall behind the file.
      for (const name of new Set(stringLiterals(source))) {
        const candidate = path.posix.normalize(`${read.directory}/${name}`);
        // A name of only interpolations and separators names nothing in particular.
        if (!/[^*./]/.test(name) || !candidate.startsWith(`${read.directory}/`) || !files.some((other) => globToRegExp(candidate).test(other))) continue;
        const listed = read.reads.some((target) => target === candidate || (!candidate.includes('*') && globToRegExp(target).test(candidate)));
        if (!listed) unaccounted.push(`${file}: names ${candidate} under ${read.directory}, which its DIRECTORY_READS entry does not list among its reads`);
      }
    }
    if (specifiers(source).some((specifier) => (FILE_SYSTEM_MODULES as readonly string[]).includes(specifier))) {
      const uncalled = (config.uncalledReads ?? []).find((entry) => entry.file === file);
      const listed = config.data[pkg].some((entry) => entry.readers?.includes(file) === true) || config.directoryReads.some((entry) => entry.file === file) || uncalled !== undefined;
      if (!listed) unaccounted.push(`${file}: reads the file system (node:fs), but no DATA_FILES entry of ${pkg} names it among its readers, and neither DIRECTORY_READS nor UNCALLED_READS lists it`);
      for (const name of uncalled?.onlyIn ?? []) {
        const others = elsewhere(file, name);
        if (!named(source, name)) unaccounted.push(`${file}: UNCALLED_READS says it reads only in ${name}, which it does not name`);
        else if (others.length > 0) unaccounted.push(`${file}: UNCALLED_READS says it reads only in ${name}, which other closure files name too (${others.join(', ')})`);
      }
    }
  }
  return {
    pkg,
    files: closure,
    manifests: [...manifests].sort(),
    data: config.data[pkg],
    imports: importsOf(root, closure, directories, (file) => sourceOf.get(file) ?? ''),
    uncovered,
    sets,
    unaccounted,
    unresolved: graph.unresolved.map((item) => `${item.file}: ${item.specifier}`),
  };
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

/** Two import maps as one: every name either imports, by its importer. */
function mergeImports(...maps: (ReadonlyMap<string, ReadonlySet<string>> | undefined)[]): Map<string, Set<string>> {
  const merged = new Map<string, Set<string>>();
  for (const map of maps) {
    for (const [owner, names] of map ?? []) {
      const set = merged.get(owner) ?? new Set<string>();
      for (const name of names) set.add(name);
      merged.set(owner, set);
    }
  }
  return merged;
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

/** The global inputs: the fixed globs, every file the mutation tooling's own entry points import, and what those files import by name. */
export interface GlobalInputs {
  readonly globs: readonly string[];
  readonly files: ReadonlySet<string>;
  readonly imports: ReadonlyMap<string, ReadonlySet<string>>;
}

/** The global inputs of the repository at `root`, whose files are `files`. */
export function globalFiles(root: string, files: readonly string[], config: AffectedConfig = REPOSITORY_CONFIG): GlobalInputs {
  const entries = config.globalEntryPoints.filter((entry) => files.includes(entry) || existsSync(path.join(root, entry)));
  const closure = importGraph(entries, root).files;
  return { globs: config.global, files: new Set(closure), imports: importsOf(root, closure, workspaceDirectories(root)) };
}

/** Each package's closure at the head, widened by its closure at the merge base: what either side's run reads. */
export function unionClosures(head: readonly Closure[], base: readonly Closure[]): Closure[] {
  return head.map((closure) => {
    const other = base.find((candidate) => candidate.pkg === closure.pkg);
    if (other === undefined) return closure;
    const ours = new Set([...closure.files, ...closure.manifests]);
    const atBase = new Set([...other.files, ...other.manifests].filter((file) => !ours.has(file)));
    return {
      ...closure,
      files: [...new Set([...closure.files, ...other.files])].sort(),
      manifests: [...new Set([...closure.manifests, ...other.manifests])].sort(),
      imports: mergeImports(closure.imports, other.imports),
      atBase,
    };
  });
}

/** The global inputs of both sides. */
export function unionGlobal(head: GlobalInputs, base: GlobalInputs): GlobalInputs {
  return { globs: head.globs, files: new Set([...head.files, ...base.files]), imports: mergeImports(head.imports, base.imports) };
}

/** The packages a change affects, given each package's closure. */
export function affected(change: Change, closures: readonly Closure[], global: GlobalInputs, tooling: readonly string[] = TEST_TOOLING): Affected {
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
      const atBase = closure.atBase?.has(file) === true;
      if (isGlobal) note(closure.pkg, `${file} (mutation tooling, every package)`);
      else if (closure.files.includes(file)) note(closure.pkg, `${file} (${atBase ? 'in its closure at the merge base' : 'imported'})`);
      else if (closure.manifests.includes(file)) note(closure.pkg, `${file} (a manifest of its closure${atBase ? ' at the merge base' : ''})`);
      else if (matchesAny(file, closure.data.map((entry) => entry.glob))) note(closure.pkg, `${file} (data its run reads)`);
      else if (closure.sets.some((globs) => selectFiles([file], globs).length > 0)) note(closure.pkg, `${file} (its mutate or test set)`);
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
      const imports = mergeImports(closure.imports, global.imports);
      const was = new Set(lockedPackages(before, imports, tooling));
      const now = new Set(lockedPackages(after, imports, tooling));
      const moved = [...new Set([...was, ...now])].filter((key) => was.has(key) !== now.has(key)).sort();
      if (moved.length > 0) note(closure.pkg, `${lockfile} moves ${moved.slice(0, 3).join(', ')}${moved.length > 3 ? ` and ${String(moved.length - 3)} more` : ''}`);
    }
  }
  return { packages: MUTATION_PACKAGES.filter((pkg) => reasons[pkg] !== undefined), reasons };
}

/**
 * What stops the changes job before anything is decided, each naming its package and file: data a closure names that
 * DATA_FILES does not list, a file-system read no entry accounts for, an import that resolves to no file, and a
 * third-party package the lockfile resolves for no importer.
 */
export function closureProblems(closures: readonly Closure[], global: GlobalInputs, lock: Lockfile | undefined, tooling: readonly string[] = TEST_TOOLING): string[] {
  return closures.flatMap((closure) => [
    ...closure.uncovered.map((literal) => `${closure.pkg}: ${literal}`),
    ...closure.unaccounted.map((read) => `${closure.pkg}: ${read}`),
    ...closure.unresolved.map((item) => `${closure.pkg}: ${item} (an import that resolves to no file)`),
    ...(lock === undefined
      ? []
      : lockedPackages(lock, mergeImports(closure.imports, global.imports), tooling)
          .filter((key) => key.startsWith('?'))
          .map((key) => `${closure.pkg}: imports ${key.slice(1)}, which the lockfile resolves for no importer`)),
  ]);
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
export function repositoryClosures(root: string = repositoryRoot, files: readonly string[] = trackedFiles(root), config: AffectedConfig = REPOSITORY_CONFIG): Closure[] {
  return MUTATION_PACKAGES.map((pkg) => closureOf(pkg, root, files, config));
}

/**
 * Calls `use` with a revision's tree as git holds it, written to a temporary directory through a temporary index (the
 * repository's own index, working tree and worktrees untouched), and the tree's files; removes it after.
 */
export function treeAt<T>(revision: string, use: (root: string, files: readonly string[]) => T, root: string = repositoryRoot): T {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tp-affected-tree-'));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: path.join(dir, 'index') };
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    git('read-tree', revision);
    const tree = path.join(dir, 'tree');
    git('checkout-index', '--all', '--force', `--prefix=${tree}/`);
    const files = git('ls-files', '-z')
      .split('\0')
      .filter((file) => file !== '');
    return use(tree, files);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

/**
 * What a pull request affects: HEAD diffed from its merge base with `base`, each package's closure taken at HEAD and at
 * the merge base. It throws, naming each, on what HEAD's closures cannot account for (closureProblems).
 */
export function affectedSince(base: string, root: string = repositoryRoot, config: AffectedConfig = REPOSITORY_CONFIG): { readonly mergeBase: string; readonly result: Affected } {
  const mergeBase = execFileSync('git', ['merge-base', base, 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const files = trackedFiles(root);
  const head = repositoryClosures(root, files, config);
  const headGlobal = globalFiles(root, files, config);
  const lockPath = path.join(root, 'pnpm-lock.yaml');
  const problems = closureProblems(head, headGlobal, existsSync(lockPath) ? parseLockfile(readFileSync(lockPath, 'utf8')) : undefined, config.tooling);
  if (problems.length > 0) throw new Error(`what a closure reads that tools/stryker/affected.ts cannot account for:\n${problems.join('\n')}`);
  const atBase = treeAt(mergeBase, (baseRoot, baseFiles) => ({ closures: repositoryClosures(baseRoot, baseFiles, config), global: globalFiles(baseRoot, baseFiles, config) }), root);
  return { mergeBase, result: affected(changeSince(mergeBase, root), unionClosures(head, atBase.closures), unionGlobal(headGlobal, atBase.global), config.tooling) };
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
  if (output === '') throw new Error('--github-output is empty: the job would read no verdict (the workflow passes "$GITHUB_OUTPUT")');
  let result: Affected;
  if (event === 'pull_request') {
    const base = option('--base');
    if (base === undefined || base === '') throw new Error('a pull request needs --base <sha>: its base branch commit');
    const run = affectedSince(base);
    result = run.result;
    process.stdout.write(`diffed from ${run.mergeBase} (the merge base of ${base} and HEAD), each closure taken at HEAD and at the merge base\n`);
  } else {
    result = { packages: [...MUTATION_PACKAGES], reasons: Object.fromEntries(MUTATION_PACKAGES.map((pkg) => [pkg, [`a ${event} run measures every package`]])) };
  }
  const shards = shardsFor(result.packages);
  const lines = MUTATION_PACKAGES.map((pkg) => `${pkg}: ${result.reasons[pkg] === undefined ? 'not affected' : `affected by ${(result.reasons[pkg] ?? []).join('; ')}`}`);
  lines.push(`shards: ${shards.length === 0 ? 'none (no money path changed)' : shards.join(', ')}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  if (output !== undefined) {
    appendFileSync(output, `any=${String(result.packages.length > 0)}\npackages=${JSON.stringify(result.packages)}\nshards=${JSON.stringify(shards)}\n`);
  }
  if (summary !== undefined && summary !== '') {
    appendFileSync(summary, ['## What the change affects (mutation)', '', ...lines.map((line) => `- ${line}`), ''].join('\n'));
  }
}
