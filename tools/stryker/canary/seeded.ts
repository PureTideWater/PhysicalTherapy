import { SEEDED_INPUT } from './seeded-input';

/**
 * The mutation canary's case 4 (tools/stryker/canary/expected.json): a mutant only a seeded fast-check property kills.
 * `isSeededInput` marks one input, SEEDED_INPUT, which no example test names, so the mutant that drops the mark
 * (`false`) is killed only by the property in seeded.test.ts, and only when that property runs from the mutation runs'
 * seed (tools/stryker/seed-setup.ts). Unseeded, it survives: the kill would rest on the run, and so would the score.
 */
export function isSeededInput(value: bigint): boolean {
  return value === SEEDED_INPUT;
}
