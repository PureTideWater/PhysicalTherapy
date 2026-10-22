// @ts-check
/**
 * The mutation canary, run before every mutation run (.github/workflows/mutation.yml): Stryker with the money paths'
 * runner and coverage analysis (stryker.config.mjs) over tools/stryker/canary/canary.ts alone, whose every mutant its
 * tests kill. A score under 100 means the runner did not run a covered mutant's tests (as @stryker-mutator/vitest-runner
 * 10.0.0 did under Vitest 5 before patches/@stryker-mutator__vitest-runner@10.0.0.patch), so the job stops there
 * rather than report a mutation score the tests did not earn. `pnpm stryker run tools/stryker/canary/stryker.config.mjs`.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: { configFile: 'tools/stryker/canary/vitest.config.ts' },
  mutate: ['tools/stryker/canary/canary.ts'],
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress'],
  thresholds: { high: 100, low: 100, break: 100 },
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
};
