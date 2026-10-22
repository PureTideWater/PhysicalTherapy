/**
 * The mutation canary (tools/stryker/canary/stryker.config.mjs): one function whose every mutant its tests kill, run
 * at the start of each mutation run. Its mutants are runtime mutants (inside a function), the kind Stryker activates
 * only for the tests that cover them, by name; when the runner selects no test for a mutant, each survives and the
 * canary's score falls below its threshold of 100, so a mutation run never reports a score its tests did not earn.
 */
export function lineCents(unitCents: bigint, units: number): bigint {
  if (units < 1) {
    throw new RangeError('a line has at least one unit');
  }
  return unitCents * BigInt(units);
}
