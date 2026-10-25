import { describe, expect, it } from 'vitest';

import { add, runningTotal } from './prefix';

// Case 5: the second test's name starts with the first's, and it reads what the first left (the tests of a file run in
// order).
describe('the mutation canary > names that share a prefix', () => {
  it('adds', () => {
    expect(add(2n)).toBe(2n);
  });

  it('adds, and keeps the running total', () => {
    expect(runningTotal()).toBe(2n);
  });
});
