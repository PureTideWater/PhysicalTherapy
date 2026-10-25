/**
 * The mutation canary's case 5 (tools/stryker/canary/expected.json): two tests whose names share a prefix, only the
 * shorter covering the mutant (stryker-js #6246). `add` keeps a running total that only the second test reads, and that
 * test calls nothing here but `runningTotal`. The mutant `total -= cents` is covered by the first test alone, which it
 * passes, so it must be reported Survived: a runner that selects every test whose name starts with the covering test's
 * also runs the second, which then fails, and reports a kill no covering test made.
 */
let total = 0n;

export function add(cents: bigint): bigint {
  total += cents;
  return cents;
}

export function runningTotal(): bigint {
  return total;
}
