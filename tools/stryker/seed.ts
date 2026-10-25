import fc from 'fast-check';

/**
 * fast-check's seed in mutation runs (vitest.mutation.config.ts's setup file; mutation runs only, so unit runs keep
 * their random seeds and go on finding new counterexamples). Unseeded, a mutant that only a property kills is killed
 * in one run and survives the next (the scout found ledger allocation.ts:50 so), and a score could move with no change
 * to the code or the tests. With the seed, every run tries the same inputs. A property-only kill is still pinned by a
 * fixed example of the counterexample, so that no kill rests on this constant.
 */
export const MUTATION_SEED = 20261025;

fc.configureGlobal({ seed: MUTATION_SEED });
