import { defineConfig } from 'vitest/config';

import { mutationTestConfig } from '../../../vitest.mutation.config';

/**
 * The mutation canary's tests (tools/stryker/canary/stryker.config.mjs): its five cases' test files, run with the very
 * configuration a package's mutation run has (vitest.mutation.config.ts's mutationTestConfig: the workspace aliases and
 * the seeded fast-check), so cases 3 and 4 prove those two as the packages' runs use them.
 */
export const CANARY_TESTS = [
  'tools/stryker/canary/named.test.ts',
  'tools/stryker/canary/load.test.ts',
  'tools/stryker/canary/linked.test.ts',
  'tools/stryker/canary/seeded.test.ts',
  'tools/stryker/canary/prefix.test.ts',
] as const;

export default defineConfig(() => mutationTestConfig(CANARY_TESTS));
