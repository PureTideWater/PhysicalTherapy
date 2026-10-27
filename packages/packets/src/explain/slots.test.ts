import { describe, expect, it } from 'vitest';

import { SLOTS, pathMatchesSlot } from './slots';

/**
 * The slot table's paths (finding m5): pathMatchesSlot() is how the figure checks of the tests (test-support.ts,
 * figureSourceProblems) hold each printed figure to its slot, so it must refuse every path but the slot's own.
 */
describe('pathMatchesSlot', () => {
  it('accepts the slot’s own path, each # an array index in its place', () => {
    expect(pathMatchesSlot('summary.rounded', 'trace', ['steps', 'rounding', 'rounded_cents'])).toBe(true);
    expect(pathMatchesSlot('summary.after', 'trace', ['steps', 'adjustments', 0, 'after_cents'])).toBe(true);
    expect(pathMatchesSlot('summary.after', 'trace', ['steps', 'adjustments', 12, 'after_cents'])).toBe(true);
    expect(pathMatchesSlot('summary.page', 'citation', ['page'])).toBe(true);
  });

  it('refuses a slot that is not in the table, an inherited name included', () => {
    expect(pathMatchesSlot('summary.nothing', 'trace', ['steps', 'rounding', 'rounded_cents'])).toBe(false);
    expect(pathMatchesSlot('toString', 'trace', [])).toBe(false);
    expect(pathMatchesSlot('constructor', 'trace', [])).toBe(false);
  });

  it('refuses the slot’s path read in the other place', () => {
    expect(pathMatchesSlot('summary.page', 'trace', ['page'])).toBe(false);
    expect(pathMatchesSlot('summary.rounded', 'citation', ['steps', 'rounding', 'rounded_cents'])).toBe(false);
  });

  it('refuses a path longer or shorter than the slot’s, even one that begins with it', () => {
    expect(pathMatchesSlot('summary.rounded', 'trace', ['steps', 'rounding', 'rounded_cents', 'x'])).toBe(false);
    expect(pathMatchesSlot('summary.rounded', 'trace', ['steps', 'rounding'])).toBe(false);
    expect(pathMatchesSlot('summary.after', 'trace', ['steps', 'adjustments', 0])).toBe(false);
  });

  it('refuses a path that differs from the slot’s in any one part', () => {
    expect(pathMatchesSlot('summary.rounded', 'trace', ['steps', 'rounding', 'unrounded_cents'])).toBe(false);
    expect(pathMatchesSlot('summary.rounded', 'trace', ['lines', 'rounding', 'rounded_cents'])).toBe(false);
    expect(pathMatchesSlot('summary.after', 'trace', ['steps', 'adjustments', 0, 'before_cents'])).toBe(false);
  });

  it('takes for # only a non-negative safe integer, never its text, a negative, a fraction or a key', () => {
    for (const index of ['0', -1, 3 / 2, Number.NaN, 2 ** 60, 'after_cents', '#']) {
      expect(pathMatchesSlot('summary.after', 'trace', ['steps', 'adjustments', index as number, 'after_cents']), String(index)).toBe(false);
    }
  });

  it('holds every slot of the table to its own path', () => {
    for (const [slot, entry] of Object.entries(SLOTS)) {
      const path = entry.path.map((part) => (part === '#' ? 0 : part));
      expect(pathMatchesSlot(slot, entry.from, path), slot).toBe(true);
      expect(pathMatchesSlot(slot, entry.from === 'trace' ? 'citation' : 'trace', path), slot).toBe(false);
    }
  });
});
