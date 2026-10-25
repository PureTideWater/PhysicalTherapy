/**
 * The mutation canary's case 1 (tools/stryker/canary/expected.json): runtime mutants, selected by their tests' names.
 * Every mutant here is inside a function, the kind Stryker activates only for the tests that cover it, which the runner
 * selects by name (Vitest 5 joins a test's describe names and its own with " > "). A runner that selects no test for a
 * covered mutant reports each one Survived, as @stryker-mutator/vitest-runner 10.0.0 did under Vitest 5 (docs/adr/0064),
 * and the canary stops the shard before it scores.
 */
export function lineCents(unitCents: bigint, units: number): bigint {
  if (units < 1) {
    throw new RangeError('a line has at least one unit');
  }
  return unitCents * BigInt(units);
}
