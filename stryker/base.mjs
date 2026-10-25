// @ts-check
import { readFileSync } from 'node:fs';
import os from 'node:os';

/**
 * Mutation testing on the money paths (PRD section 18; docs/adr/0066, Part 4): the options every run shares, each
 * package's mutants, and how a package's run is built (stryker/{money,pricing,ledger,packets}.config.mjs, one each).
 *
 * - **The runner.** Stryker's vitest runner (10.1.1 or later: it names a test as Vitest 5 does and reports a mutant
 *   that breaks a test file's load as a RuntimeError, not a survivor), with perTest coverage, so a mutant runs the
 *   tests that reach it and the report names the test that killed or covered it.
 * - **The tests.** vitest.mutation.config.ts, for the package this run mutates: the run names it in
 *   TP_MUTATION_PACKAGE, which the test runner's processes inherit. That file aliases every workspace package to this
 *   checkout's files, so a test that imports a package by name reaches the copy Stryker mutated, and seeds fast-check.
 * - **No threshold here.** `thresholds.break` is null: the mutation gate (tools/stryker/gate.ts) judges every package's
 *   report, so a run reports and never decides.
 * - **Shards.** With TP_MUTATION_SHARD set to a shard of stryker/shards.json, a run mutates only that shard's files
 *   of its package, and writes its report under the shard's name.
 * - **Reports.** reports/mutation/<package>.json and .html for a package's run (a narrow `--mutate` run included, which
 *   replaces the package's last report), reports/mutation/<shard>/<package>.json and .html for a shard's.
 */

/** The packages a mutation run measures. */
export const MUTATION_PACKAGES = /** @type {const} */ (['money', 'pricing', 'ledger', 'packets']);

/** @typedef {(typeof MUTATION_PACKAGES)[number]} MutationPackage */

/** Names the package a run mutates, for vitest.mutation.config.ts in the test runner's processes. */
export const PACKAGE_VARIABLE = 'TP_MUTATION_PACKAGE';

/** Names the shard of stryker/shards.json a run takes its files from; unset, a run mutates its whole package. */
export const SHARD_VARIABLE = 'TP_MUTATION_SHARD';

/** Where the reports go, relative to the repository's root. */
export const REPORT_DIRECTORY = 'reports/mutation';

/**
 * Each package's mutants: its source files, never its tests. The test helpers are left out, since no amount is
 * computed in them: pricing's testing.ts (`@tp/pricing/testing`, the synthetic releases and the builders of lines other
 * packages' tests price) and packets' test-support.ts (the synthetic inputs of the packet tests).
 *
 * @type {Readonly<Record<MutationPackage, readonly string[]>>}
 */
export const MUTATE = {
  money: ['packages/money/src/**/*.ts', '!packages/money/src/**/*.test.ts'],
  pricing: ['packages/pricing/src/**/*.ts', '!packages/pricing/src/**/*.test.ts', '!packages/pricing/src/testing.ts'],
  ledger: ['packages/ledger/src/**/*.ts', '!packages/ledger/src/**/*.test.ts'],
  packets: [
    // The packet verifier: its check, and the reading of a narrative it rests on (what the text shows, the figures it
    // holds, the payer and plan as the payer's copy names them, the placeholders).
    'packages/packets/src/verifier/**/*.ts',
    'packages/packets/src/readable.ts',
    'packages/packets/src/scan.ts',
    'packages/packets/src/facts.ts',
    'packages/packets/src/payer.ts',
    'packages/packets/src/placeholders.ts',
    // The packet's arithmetic: prompt-pay interest, each line's calculation, the calendar dates and windows its
    // deadlines are counted in, and the assembly that totals them.
    'packages/packets/src/interest.ts',
    'packages/packets/src/calculation.ts',
    'packages/packets/src/dates.ts',
    'packages/packets/src/windows.ts',
    'packages/packets/src/assemble.ts',
    '!packages/packets/src/**/*.test.ts',
    '!packages/packets/src/test-support.ts',
  ],
};

/**
 * The options every mutation run shares, the canary's included (tools/stryker/canary/stryker.config.mjs).
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export const BASE_OPTIONS = {
  testRunner: 'vitest',
  // pnpm keeps plugins out of @stryker-mutator/core's own node_modules, so name the runner explicitly.
  plugins: ['@stryker-mutator/vitest-runner'],
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'json', 'html'],
  // The survivors and the score table, without the list of every test the dry run found.
  clearTextReporter: { reportTests: false },
  concurrency: os.availableParallelism(),
  // A mutant's clock is 1.5 x its tests' net time + timeoutMS + the dry run's overhead. A static mutant reruns every
  // related test file, its imports and describe bodies included (the golden engine tests price every claim there),
  // while every runner shares the CPUs, so at Stryker's 5 s a loaded machine timed out mutants that a quieter one
  // reports Survived or RuntimeError (pricing windows.ts:40 and :45, Timeout at load 8 to 11): a status the load
  // decides, and a Timeout counts as detected. A mutant that loops in instrumented code still stops at the hit limit
  // (100 times the dry run's hits) whatever the clock.
  timeoutMS: 30_000,
  thresholds: { high: 90, low: 85, break: null },
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
};

/**
 * @typedef {object} Shard
 * @property {string} name the shard's name: its CI job's and its reports' directory
 * @property {Partial<Record<MutationPackage, readonly string[]>>} mutate the files it mutates, by package
 */

/** @returns {readonly Shard[]} the shards of stryker/shards.json, in the file's order */
export function readShards() {
  const parsed = /** @type {{ shards: readonly Shard[] }} */ (JSON.parse(readFileSync(new URL('./shards.json', import.meta.url), 'utf8')));
  return parsed.shards;
}

/**
 * @param {MutationPackage} pkg
 * @param {string | undefined} shard
 * @returns {string} the JSON report's path, relative to the repository's root
 */
export function reportFile(pkg, shard) {
  return shard === undefined ? `${REPORT_DIRECTORY}/${pkg}.json` : `${REPORT_DIRECTORY}/${shard}/${pkg}.json`;
}

/**
 * A package's Stryker options: the base, its mutants (or its shard's, under TP_MUTATION_SHARD) and its reports. It
 * names the package in TP_MUTATION_PACKAGE, which the test runner's processes inherit.
 *
 * @param {MutationPackage} pkg
 * @returns {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export function packageOptions(pkg) {
  const shardName = process.env[SHARD_VARIABLE] || undefined;
  let mutate = MUTATE[pkg];
  if (shardName !== undefined) {
    const shard = readShards().find((candidate) => candidate.name === shardName);
    if (shard === undefined) throw new Error(`${SHARD_VARIABLE}=${shardName}: stryker/shards.json has no shard of that name`);
    const files = shard.mutate[pkg];
    if (files === undefined) throw new Error(`${SHARD_VARIABLE}=${shardName}: that shard mutates no file of ${pkg}`);
    mutate = files;
  }
  process.env[PACKAGE_VARIABLE] = pkg;
  const json = reportFile(pkg, shardName);
  return {
    ...BASE_OPTIONS,
    vitest: { configFile: 'vitest.mutation.config.ts' },
    mutate: [...mutate],
    jsonReporter: { fileName: json },
    htmlReporter: { fileName: json.replace(/\.json$/, '.html') },
  };
}
