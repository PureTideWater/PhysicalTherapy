import fc from 'fast-check';

import { MUTATION_SEED } from '../seed';

/**
 * The mutation canary's case 4 (tools/stryker/canary/expected.json): the input only a property run from the mutation
 * runs' seed reaches. The property in seeded.test.ts draws from SEEDED_ARBITRARY; run from MUTATION_SEED it draws the
 * same values this run does, so SEEDED_INPUT, the first of them away from the range's ends (where fast-check's bias puts
 * its small and boundary values), is among them. A run from another seed draws it about once in 2^53 values.
 *
 * Derived here, not written down, so that a fast-check release that draws other values moves it with them. This module
 * is not mutated, and reading MUTATION_SEED seeds nothing (tools/stryker/seed.ts).
 */
export const SEEDED_ARBITRARY = fc.bigInt({ min: 0n, max: 2n ** 53n });

/** How many values the property draws: fast-check's default, which the seeded run's draw must fall within. */
export const SEEDED_RUNS = 100;

const MARGIN = 2n ** 40n;

function seededInput(): bigint {
  const drawn: bigint[] = [];
  fc.check(
    fc.property(SEEDED_ARBITRARY, (value) => {
      drawn.push(value);
      return true;
    }),
    { seed: MUTATION_SEED, numRuns: SEEDED_RUNS },
  );
  const found = drawn.find((value) => value > MARGIN && value < 2n ** 53n - MARGIN);
  if (found === undefined) throw new Error(`fast-check drew no value away from the range's ends from seed ${String(MUTATION_SEED)}`);
  return found;
}

/** The input the seeded property reaches and an unseeded one almost never does. */
export const SEEDED_INPUT = seededInput();
