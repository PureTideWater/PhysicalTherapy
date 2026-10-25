import { centsOfDollars } from '@tp/stryker-canary';
import { describe, expect, it } from 'vitest';

// Case 3: the package by its name, through tools/node_modules, never by a relative path.
describe('the mutation canary > a workspace package imported by name', () => {
  it('counts a dollar as a hundred cents', () => {
    expect(centsOfDollars(3n)).toBe(300n);
  });
});
