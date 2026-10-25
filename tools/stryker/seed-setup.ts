import fc from 'fast-check';

import { MUTATION_SEED } from './seed';

/**
 * vitest.mutation.config.ts's setup file: every fast-check property of a mutation run, and of the canary's, runs from
 * MUTATION_SEED (tools/stryker/seed.ts). The canary's case 4 fails when this file is not run.
 */
fc.configureGlobal({ seed: MUTATION_SEED });
