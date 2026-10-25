/**
 * The mutation canary's case 2 (tools/stryker/canary/expected.json): mutants reached at import, which break the test
 * file's load. ONE_UNIT is built when the module loads, as the money package's ZERO_CENTS = cents(0n) is, so a mutant
 * that makes `units()` refuse 1 throws before any test runs: the test file fails to load and Vitest collects no test.
 * Such a mutant is detected (Killed) or excluded from the score (RuntimeError, Stryker 10.1 on, #6269), never Survived,
 * which is what @stryker-mutator/vitest-runner 10.0.0 reported for it (2.9 points of the money package's score).
 */
export function units(count: number): number {
  if (count < 1) {
    throw new RangeError('a line has at least one unit');
  }
  return count;
}

/** One unit, checked as the module loads. */
export const ONE_UNIT = units(1);
