import { describe, expect, it } from 'vitest';

import { lineName } from './display';

/**
 * How a case's lines and a cohort's flagged lines are named on the page (WCAG 2.4.4, link purpose; the
 * fix review of the screen tour's P1): SYNTHETIC CAS-08 has three claims with one line each, so every
 * line is line 1 of its own claim, and a viewer, who sees no service date, could not tell the three
 * links apart by that number.
 */
describe('a line’s name', () => {
  it('is its place in the list, unique on the page for a role without PHI, though each is line 1 of its claim', () => {
    const names = [1, 2, 3].map((position) => lineName(position, 3));
    expect(names).toEqual(['Line 1 of 3', 'Line 2 of 3', 'Line 3 of 3']);
    expect(new Set(names).size).toBe(3);
  });

  it('carries the service date after it for the roles that read PHI', () => {
    expect(lineName(2, 3, '2026-03-06')).toBe('Line 2 of 3, 2026-03-06');
  });
});
