// @ts-check
import { BASE_OPTIONS } from '../../../stryker/base.mjs';

/**
 * The mutation canary, run before every mutation run (.github/workflows/mutation.yml): Stryker with the money paths'
 * runner and coverage analysis (stryker/base.mjs) over tools/stryker/canary/canary.ts alone, whose every mutant its
 * tests kill. Each is a runtime mutant, run only by the tests that cover it, which the runner selects by name; a score
 * under 100 means the runner ran no test for a covered mutant (as @stryker-mutator/vitest-runner 10.0.0 did under
 * Vitest 5, docs/adr/0064), so the job stops there rather than report a mutation score the tests did not earn.
 * `pnpm stryker run tools/stryker/canary/stryker.config.mjs`.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  ...BASE_OPTIONS,
  vitest: { configFile: 'tools/stryker/canary/vitest.config.ts' },
  mutate: ['tools/stryker/canary/canary.ts'],
  reporters: ['clear-text', 'progress'],
  thresholds: { high: 100, low: 100, break: 100 },
};
