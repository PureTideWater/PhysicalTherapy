import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { configDefaults, defineConfig } from 'vitest/config';

import { MUTATION_PACKAGES, type MutationPackage, PACKAGE_VARIABLE } from './stryker/base.mjs';

/**
 * The tests a mutation run runs against a package's mutants (stryker/<package>.config.mjs; docs/adr/0066, Part 4).
 * Stryker copies the checkout into a sandbox (.stryker-tmp/sandbox-*), mutates the package's files there and runs this
 * configuration from the sandbox, for the package stryker/base.mjs names in TP_MUTATION_PACKAGE:
 *
 * - **The package's tests** (TEST_SETS), less the exclusions (EXCLUDED), each with its reason.
 * - **Every workspace package's exports aliased to the sandbox's files** (workspaceAliases). pnpm links each package
 *   into node_modules, and Stryker links node_modules into the sandbox, so without them a test that imports a package
 *   by name (`@tp/pricing`) reaches the original, unmutated files and can kill nothing there.
 * - **fast-check seeded** (tools/stryker/seed.ts), so a property's kill does not change from run to run.
 *
 * `TP_MUTATION_PACKAGE=<package> pnpm exec vitest run --config vitest.mutation.config.ts` runs one package's set
 * outside Stryker, as its dry run does.
 */

/** This configuration's directory: the repository's root, and under Stryker the sandbox, which holds the mutants. */
const ROOT = path.dirname(fileURLToPath(import.meta.url));

/**
 * Each package's tests. Pricing adds the golden engine tests (tools/golden-worksheet/engine*.test.ts), the pricing
 * oracle, which price every golden claim through `@tp/pricing`; the aliases bring them to the mutants.
 */
export const TEST_SETS: Readonly<Record<MutationPackage, readonly string[]>> = {
  money: ['packages/money/src/**/*.test.ts'],
  pricing: ['packages/pricing/src/**/*.test.ts', 'tools/golden-worksheet/engine*.test.ts'],
  ledger: ['packages/ledger/src/**/*.test.ts'],
  packets: ['packages/packets/src/**/*.test.ts'],
};

/** The tests no mutation run runs, each with why. */
export const EXCLUDED: readonly { readonly glob: string; readonly reason: string }[] = [
  {
    glob: '**/*.db.test.ts',
    reason: 'needs a database: the money paths are pure, and their unit tests are what a mutant must fail',
  },
  {
    glob: 'packages/pricing/src/performance.test.ts',
    reason: 'asserts only counts and time: it prices 100,000 lines, so it covers every engine mutant and kills none by an amount',
  },
  {
    glob: 'packages/pricing/src/purity.test.ts',
    reason: "reads the engine's source text, which Stryker's instrumentation rewrites, so it fails on every run",
  },
  {
    glob: 'tools/engine-freeze/differential.test.ts',
    reason: 'compares the engine with the base commit, so it kills every engine mutant by construction',
  },
];

/** fast-check's seed for mutation runs. */
export const SEED_SETUP_FILE = 'tools/stryker/seed.ts';

export interface WorkspaceAlias {
  readonly find: RegExp;
  readonly replacement: string;
}

type ExportTarget = string | null | { readonly [condition: string]: ExportTarget } | readonly ExportTarget[];

/** The package directories pnpm-workspace.yaml lists, as `dir` and `dir/*` patterns. */
export function workspaceDirectories(root: string): string[] {
  const text = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
  const block = /^packages:\r?\n((?:[ \t]+-[^\n]*(?:\n|$))+)/m.exec(text)?.[1];
  if (block === undefined) throw new Error('pnpm-workspace.yaml lists no packages');
  const patterns = block
    .split('\n')
    .map((line) => line.replace(/\s#.*$/, '').replace(/^\s*-\s*/, '').trim().replace(/^(['"])(.*)\1$/, '$2'))
    .filter((pattern) => pattern !== '');
  return patterns
    .flatMap((pattern) => {
      if (/^[^*?!{}[\]]+\/\*$/.test(pattern)) {
        const parent = pattern.slice(0, -2);
        return readdirSync(path.join(root, parent), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => `${parent}/${entry.name}`)
          .sort();
      }
      if (/[*?!{}[\]]/.test(pattern)) throw new Error(`pnpm-workspace.yaml: the mutation aliases read "dir" and "dir/*" patterns only, not "${pattern}"`);
      return [pattern];
    })
    .filter((directory) => existsSync(path.join(root, directory, 'package.json')));
}

/** The file an export resolves to on import (Node's "import", "node" and "default" conditions), if any. */
function importTarget(target: ExportTarget): string | undefined {
  if (target === null) return undefined;
  if (typeof target === 'string') return target;
  if (Array.isArray(target)) return (target as readonly ExportTarget[]).map(importTarget).find((found) => found !== undefined);
  const conditions = target as { readonly [condition: string]: ExportTarget };
  for (const condition of ['import', 'node', 'default']) {
    const found = condition in conditions ? importTarget(conditions[condition] ?? null) : undefined;
    if (found !== undefined) return found;
  }
  return undefined;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Every workspace package's exports, each an exact-match alias to its file under `root`: the specifier, and a subpath
 * pattern (`./assets/*`) with what its `*` stands for. Generated from each package.json, so a new package or export
 * needs no edit here.
 */
export function workspaceAliases(root: string = ROOT): WorkspaceAlias[] {
  const aliases: WorkspaceAlias[] = [];
  for (const directory of workspaceDirectories(root)) {
    const manifest = JSON.parse(readFileSync(path.join(root, directory, 'package.json'), 'utf8')) as { name?: string; exports?: ExportTarget };
    if (manifest.name === undefined || manifest.exports === undefined || manifest.exports === null) continue;
    const exports: { readonly [subpath: string]: ExportTarget } =
      typeof manifest.exports === 'string' || Array.isArray(manifest.exports) || !Object.keys(manifest.exports).every((key) => key.startsWith('.'))
        ? { '.': manifest.exports }
        : (manifest.exports as { readonly [subpath: string]: ExportTarget });
    for (const [subpath, target] of Object.entries(exports)) {
      const file = importTarget(target);
      if (file === undefined) continue;
      const specifier = subpath === '.' ? manifest.name : `${manifest.name}/${subpath.replace(/^\.\//, '')}`;
      const replacement = path.join(root, directory, file);
      if (specifier.includes('*')) {
        const [before, after] = specifier.split('*') as [string, string];
        aliases.push({ find: new RegExp(`^${escapeRegExp(before)}(.+)${escapeRegExp(after)}$`), replacement: replacement.replace('*', '$1') });
      } else {
        aliases.push({ find: new RegExp(`^${escapeRegExp(specifier)}$`), replacement });
      }
    }
  }
  return aliases;
}

/** The package TP_MUTATION_PACKAGE names; a run without one, or with another, stops here. */
export function mutationPackage(value: string | undefined = process.env[PACKAGE_VARIABLE]): MutationPackage {
  const found = MUTATION_PACKAGES.find((name) => name === value);
  if (found === undefined) {
    throw new Error(`${PACKAGE_VARIABLE} is ${value === undefined ? 'unset' : `"${value}"`}: it names the package a mutation run tests, one of ${MUTATION_PACKAGES.join(', ')} (stryker/<package>.config.mjs sets it)`);
  }
  return found;
}

export default defineConfig(() => {
  const tested = mutationPackage();
  return {
    root: ROOT,
    resolve: { alias: workspaceAliases(ROOT) },
    test: {
      include: [...TEST_SETS[tested]],
      exclude: [...configDefaults.exclude, '**/.stryker-tmp/**', ...EXCLUDED.map((excluded) => excluded.glob)],
      setupFiles: [path.join(ROOT, SEED_SETUP_FILE)],
    },
  };
});
