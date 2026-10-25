/**
 * fast-check's seed in mutation runs: the constant alone, with no effect on import, so the canary's seeded case
 * (tools/stryker/canary/seeded-input.ts) can read it without seeding the run it is meant to check. The setup file that
 * applies it is tools/stryker/seed-setup.ts (vitest.mutation.config.ts's setupFiles; mutation runs only, so unit runs
 * keep their random seeds and go on finding new counterexamples).
 *
 * Unseeded, a mutant that only a property kills is killed in one run and survives the next (the scout found ledger
 * allocation.ts:50 so), and a score could move with no change to the code or the tests. With the seed, every run tries
 * the same inputs. A property-only kill is still pinned by a fixed example of the counterexample, so that no kill rests
 * on this constant.
 */
export const MUTATION_SEED = 20261025;
