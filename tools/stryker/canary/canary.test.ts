import { describe, expect, it } from 'vitest';

import { lineCents } from './canary';

// Nested describes on purpose: Vitest names these tests "the mutation canary > a line's cents > ...", the names the
// runner must select each covered mutant's tests by (tools/stryker/runner.test.ts).
describe('the mutation canary', () => {
  describe("a line's cents", () => {
    it('is the unit price for one unit', () => {
      expect(lineCents(250n, 1)).toBe(250n);
    });

    it('is the unit price times the units', () => {
      expect(lineCents(250n, 3)).toBe(750n);
    });

    it('refuses a line of no units', () => {
      expect(() => lineCents(250n, 0)).toThrow(new RangeError('a line has at least one unit'));
    });
  });
});
