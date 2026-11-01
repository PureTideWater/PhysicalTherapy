import { describe, expect, it } from 'vitest';

import { actionableLinesWords, lineName, outOfFigureWords } from './display';

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

/**
 * The lines an actionable figure leaves out, by cause (test matrix HOM-02; docs/adr/0082): each cause counted with
 * counted() and named only when it counts a line, so the tile, the case page and the packet builder read alike.
 */
describe('the lines out of the actionable figure', () => {
  it('names each cause only when it counts a line, singular for one', () => {
    expect(outOfFigureWords(0, 0)).toBe('');
    expect(outOfFigureWords(0, 1)).toBe('out of the figure: 1 line whose pricing is no longer current');
    expect(outOfFigureWords(0, 2)).toBe('out of the figure: 2 lines whose pricing is no longer current');
    expect(outOfFigureWords(1, 0)).toBe('out of the figure: 1 line moved on past actionable');
    expect(outOfFigureWords(2, 0)).toBe('out of the figure: 2 lines moved on past actionable');
    expect(outOfFigureWords(2, 1)).toBe('out of the figure: 1 line whose pricing is no longer current, 2 lines moved on past actionable');
  });

  it('pairs a case’s figure with its lines: all of them, or how many of those not written off and why the rest are out', () => {
    expect(actionableLinesWords({ actionableNowLines: 3, openLines: 3, actionableNowMovedOn: 0, actionableNowStale: 0 })).toBe('3 lines');
    expect(actionableLinesWords({ actionableNowLines: 1, openLines: 1, actionableNowMovedOn: 0, actionableNowStale: 0 })).toBe('1 line');
    expect(actionableLinesWords({ actionableNowLines: 0, openLines: 0, actionableNowMovedOn: 0, actionableNowStale: 0 })).toBe('0 lines');
    expect(actionableLinesWords({ actionableNowLines: 0, openLines: 3, actionableNowMovedOn: 0, actionableNowStale: 3 })).toBe(
      '0 of the 3 lines not written off; out of the figure: 3 lines whose pricing is no longer current',
    );
    expect(actionableLinesWords({ actionableNowLines: 1, openLines: 3, actionableNowMovedOn: 1, actionableNowStale: 1 })).toBe(
      '1 of the 3 lines not written off; out of the figure: 1 line whose pricing is no longer current, 1 line moved on past actionable',
    );
    expect(actionableLinesWords({ actionableNowLines: 0, openLines: 1, actionableNowMovedOn: 1, actionableNowStale: 0 })).toBe(
      '0 of the 1 line not written off; out of the figure: 1 line moved on past actionable',
    );
  });
});
