import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { isSeededInput } from './seeded';
import { SEEDED_ARBITRARY, SEEDED_INPUT, SEEDED_RUNS } from './seeded-input';

// Case 4: the examples never name SEEDED_INPUT; only the property can reach it.
describe('the mutation canary > a seeded property', () => {
  it('marks no small input', () => {
    expect(isSeededInput(0n)).toBe(false);
    expect(isSeededInput(7n)).toBe(false);
  });

  it('marks exactly the seeded input (property)', () => {
    fc.assert(
      fc.property(SEEDED_ARBITRARY, (value) => isSeededInput(value) === (value === SEEDED_INPUT)),
      { numRuns: SEEDED_RUNS },
    );
  });
});
