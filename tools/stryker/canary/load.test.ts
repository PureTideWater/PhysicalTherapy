import { describe, expect, it } from 'vitest';

import { ONE_UNIT, units } from './load';

// Case 2: this file imports load.ts, whose ONE_UNIT is built at import.
describe('the mutation canary > units checked at import', () => {
  it('holds one unit', () => {
    expect(ONE_UNIT).toBe(1);
  });

  it('passes a count of units through', () => {
    expect(units(3)).toBe(3);
  });

  it('refuses a line of no units', () => {
    expect(() => units(0)).toThrow(new RangeError('a line has at least one unit'));
  });
});
