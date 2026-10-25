// @ts-check
import { BASE_OPTIONS } from '../../../stryker/base.mjs';

/**
 * The mutation canary (docs/adr/0066, Part 4): the first step of every shard of .github/workflows/mutation.yml, before
 * any of its mutants. Stryker with the money paths' own options (stryker/base.mjs) and test configuration
 * (vitest.mutation.config.ts, through tools/stryker/canary/vitest.config.ts) over five small cases, each of which holds
 * one thing a score relies on to an expected status per mutant (tools/stryker/canary/expected.json):
 *
 * 1. named.ts: runtime mutants, selected by their tests' names;
 * 2. load.ts: mutants reached at import that break the test file's load: RuntimeError or Killed, never Survived;
 * 3. lib/index.ts (`@tp/stryker-canary`): mutants only a `tools` test that imports the package by name kills (the
 *    workspace aliases);
 * 4. seeded.ts: a mutant only a seeded fast-check property kills (the seed);
 * 5. prefix.ts: a mutant covered by one of two tests whose names share a prefix, which must survive (stryker-js issue 6246).
 *
 * `pnpm stryker run tools/stryker/canary/stryker.config.mjs` writes reports/canary/report.json, which
 * `pnpm -s exec tsx tools/stryker/canary/verdict.ts` judges case by case (the shard's step runs both; any case not as
 * expected stops the shard). No threshold here: case 5 expects a survivor, and the verdict decides.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  ...BASE_OPTIONS,
  vitest: { configFile: 'tools/stryker/canary/vitest.config.ts' },
  mutate: [
    'tools/stryker/canary/named.ts',
    'tools/stryker/canary/load.ts',
    'tools/stryker/canary/lib/index.ts',
    'tools/stryker/canary/seeded.ts',
    'tools/stryker/canary/prefix.ts',
  ],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'reports/canary/report.json' },
  thresholds: { high: 100, low: 100, break: null },
};
