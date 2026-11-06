import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type ViteUserConfig, configDefaults, defineConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

import { MUTATION_PACKAGES, type MutationPackage, PACKAGE_VARIABLE } from './stryker/base.mjs';
import { workspacePackages } from './tools/stryker/workspace';

/**
 * The tests a mutation run runs against a package's mutants (stryker/<package>.config.mjs; docs/adr/0066, Part 4).
 * Stryker copies the checkout into a sandbox (.stryker-tmp/sandbox-*), mutates the package's files there and runs this
 * configuration from the sandbox, for the package stryker/base.mjs names in TP_MUTATION_PACKAGE:
 *
 * - **The package's tests** (TEST_SETS), less the exclusions (EXCLUDED), each with its reason.
 * - **Every workspace package's exports aliased to the sandbox's files** (workspaceAliases). pnpm links each package
 *   into node_modules, and Stryker links node_modules into the sandbox, so without them a test that imports a package
 *   by name (`@tp/pricing`) reaches the original, unmutated files and can kill nothing there.
 * - **fast-check seeded** (tools/stryker/seed-setup.ts), so a property's kill does not change from run to run.
 * - **The shortest test files first** (ShortestFirstSequencer), so a mutant meets the tests that kill it in
 *   milliseconds before the properties that take seconds.
 *
 * The canary (tools/stryker/canary/vitest.config.ts) builds its configuration with the same function,
 * mutationTestConfig, so its cases prove the aliases and the seed exactly as the packages' runs use them.
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
    glob: 'packages/packets/src/explain/purity.test.ts',
    reason: "reads the calculation words' source text for its imports and arithmetic, which Stryker's instrumentation rewrites, so it fails on every run",
  },
  {
    glob: 'packages/packets/src/render-purity.test.ts',
    reason: "reads the facts' catalog and renderer's source text for what they name and import, which Stryker's instrumentation rewrites, so it fails on every run",
  },
  {
    glob: 'packages/packets/src/explain/sentence-forms.test.ts',
    reason: "pins the SHA-256 of the calculation words' source text, which Stryker's instrumentation rewrites, so it fails on every run",
  },
  {
    glob: 'tools/engine-freeze/differential.test.ts',
    reason: 'compares the engine with the base commit, so it kills every engine mutant by construction',
  },
];

/** The setup file that seeds fast-check for mutation runs (tools/stryker/seed.ts holds the seed). */
export const SEED_SETUP_FILE = 'tools/stryker/seed-setup.ts';

export interface WorkspaceAlias {
  readonly find: RegExp;
  readonly replacement: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Every workspace package's exports (tools/stryker/workspace.ts: the packages pnpm-workspace.yaml lists, each export's
 * import condition), each an exact-match alias to its file under `root`: the specifier, and a subpath pattern
 * (`./assets/*`) with what its `*` stands for. Exact subpaths come first, then patterns by the length of their text
 * before `*`, so the first alias that matches is the export Node would pick. Generated from each package.json, so a new
 * package or export needs no edit here; importClosure (tools/screening-capacity/watched.ts) resolves the same way.
 */
export function workspaceAliases(root: string = ROOT): WorkspaceAlias[] {
  const exact: WorkspaceAlias[] = [];
  const patterns: { readonly alias: WorkspaceAlias; readonly prefix: number; readonly key: number }[] = [];
  for (const pkg of workspacePackages(root)) {
    for (const [subpath, file] of pkg.exports) {
      if (file === null) continue;
      const specifier = subpath === '.' ? pkg.name : `${pkg.name}/${subpath.replace(/^\.\//, '')}`;
      const replacement = path.join(root, pkg.dir, file);
      if (specifier.includes('*')) {
        const [before, after] = specifier.split('*') as [string, string];
        patterns.push({ alias: { find: new RegExp(`^${escapeRegExp(before)}(.+)${escapeRegExp(after)}$`), replacement: replacement.replaceAll('*', '$1') }, prefix: before.length, key: specifier.length });
      } else {
        exact.push({ find: new RegExp(`^${escapeRegExp(specifier)}$`), replacement });
      }
    }
  }
  return [...exact, ...patterns.sort((a, b) => b.prefix - a.prefix || b.key - a.key).map((pattern) => pattern.alias)];
}

/** The package TP_MUTATION_PACKAGE names; a run without one, or with another, stops here. */
export function mutationPackage(value: string | undefined = process.env[PACKAGE_VARIABLE]): MutationPackage {
  const found = MUTATION_PACKAGES.find((name) => name === value);
  if (found === undefined) {
    throw new Error(`${PACKAGE_VARIABLE} is ${value === undefined ? 'unset' : `"${value}"`}: it names the package a mutation run tests, one of ${MUTATION_PACKAGES.join(', ')} (stryker/<package>.config.mjs sets it)`);
  }
  return found;
}

/**
 * The order a mutant's test files run in: vitest's own (BaseSequencer: a file that failed in its last run first, then
 * by the duration the results cache holds for it), but the shortest first, not the longest. Stryker stops a mutant's run
 * at its first failing test (bail), and a file that failed last is the one that killed this runner's last mutant, which
 * is often the next one's neighbour in the source. Longest first, the role reader's properties (seconds each: they build
 * and read whole narratives) ran first for every mutant they cover, before the unit tests that kill most of them in
 * milliseconds; shortest first, a reader mutant takes about a third of the time (69 of roles.ts's, measured on
 * 2026-11-02: 2 min 30 s longest first, 43 s shortest), and each mutant's verdict is the same, since a mutant a test
 * kills is killed whatever the order, and a survivor runs every test that covers it.
 */
export class ShortestFirstSequencer extends BaseSequencer {
  override sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const result = (spec: TestSpecification) => this.ctx.cache.getTestSpecificationResult(spec);
    const failed = (spec: TestSpecification) => (result(spec)?.failed === true ? 0 : 1);
    const duration = (spec: TestSpecification) => result(spec)?.duration ?? 0;
    return Promise.resolve([...files].sort((a, b) => failed(a) - failed(b) || duration(a) - duration(b)));
  }
}

/**
 * A mutation run's vitest configuration for the given test files: rooted here (the sandbox, under Stryker), every
 * workspace package aliased to this checkout's files, the exclusions, fast-check seeded, and the shortest files first.
 */
export function mutationTestConfig(include: readonly string[]): ViteUserConfig {
  return {
    root: ROOT,
    resolve: { alias: workspaceAliases(ROOT) },
    test: {
      include: [...include],
      exclude: [...configDefaults.exclude, '**/.stryker-tmp/**', ...EXCLUDED.map((excluded) => excluded.glob)],
      setupFiles: [path.join(ROOT, SEED_SETUP_FILE)],
      sequence: { sequencer: ShortestFirstSequencer },
    },
  };
}

export default defineConfig(() => mutationTestConfig(TEST_SETS[mutationPackage()]));
