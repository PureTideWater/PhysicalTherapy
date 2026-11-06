import fc from 'fast-check';

import { MUTATION_SEED } from './seed';

/**
 * vitest.mutation.config.ts's setup file: every fast-check property of a mutation run, and of the canary's, runs from
 * MUTATION_SEED (tools/stryker/seed.ts). The canary's case 4 fails when this file is not run.
 *
 * A property that fails stops at its first counterexample and is not shrunk (`endOnFailure`): a mutation run needs only
 * that a test fails, never the smallest input that makes it fail, so a mutant a property kills is killed exactly as
 * before, without the shrinking runs (the role reader's properties each build and read whole narratives, and shrank on
 * every mutant they killed). A unit run keeps fast-check's shrinking, so a counterexample it finds is still reported at
 * its smallest.
 */
fc.configureGlobal({ seed: MUTATION_SEED, endOnFailure: true });
