import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { NetExpectedState } from '../../lib/triage/queries';
import { type ActionableLines, ActionableLinesOn, NetExpected, OutOfFigure, actionableLinesWords, lineName, outOfFigureWords } from './display';

const text = (html: string) => html.replace(/<[^>]+>/g, '');

/** The digits of the markup outside a mono span: empty when every count is set in the mono face. */
const digitsOutsideMono = (html: string) =>
  html
    .replace(/<span class="font-mono tabular-nums">[^<]*<\/span>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\D/g, '');

/** A case's lines: every line not written off and in the figure, unless an override says otherwise. */
const lines = (overrides: Partial<ActionableLines> = {}): ActionableLines => ({ lines: 3, actionableNowLines: 3, openLines: 3, actionableNowMovedOn: 0, actionableNowStale: 0, ...overrides });

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
 * counted() and named only when it counts a line, the causes listed in words, so the tile, the case page and the
 * packet builder read alike; the components say the words' text exactly, every count in the mono face.
 */
describe('the lines out of the actionable figure', () => {
  it('names each cause only when it counts a line, singular for one, two causes listed in words', () => {
    expect(outOfFigureWords(0, 0)).toBe('');
    expect(outOfFigureWords(0, 1)).toBe('out of the figure: 1 line whose pricing is no longer current');
    expect(outOfFigureWords(0, 2)).toBe('out of the figure: 2 lines whose pricing is no longer current');
    expect(outOfFigureWords(1, 0)).toBe('out of the figure: 1 line moved on past actionable');
    expect(outOfFigureWords(2, 0)).toBe('out of the figure: 2 lines moved on past actionable');
    expect(outOfFigureWords(2, 1)).toBe('out of the figure: 1 line whose pricing is no longer current and 2 lines moved on past actionable');
  });

  it('pairs a case’s figure with its lines: all of them, how many of those not written off and why the rest are out, or none when every line is written off', () => {
    expect(actionableLinesWords(lines({ actionableNowLines: 3, openLines: 3 }))).toBe('3 lines');
    expect(actionableLinesWords(lines({ actionableNowLines: 1, openLines: 1 }))).toBe('1 line');
    expect(actionableLinesWords(lines({ actionableNowLines: 0, openLines: 0, lines: 3 }))).toBe('no line (all 3 lines written off)');
    expect(actionableLinesWords(lines({ actionableNowLines: 0, openLines: 0, lines: 1 }))).toBe('no line (all 1 line written off)');
    expect(actionableLinesWords(lines({ actionableNowLines: 0, openLines: 3, actionableNowStale: 3 }))).toBe('0 of the 3 lines not written off (out of the figure: 3 lines whose pricing is no longer current)');
    expect(actionableLinesWords(lines({ actionableNowLines: 1, openLines: 3, actionableNowMovedOn: 1, actionableNowStale: 1 }))).toBe(
      '1 of the 3 lines not written off (out of the figure: 1 line whose pricing is no longer current and 1 line moved on past actionable)',
    );
    expect(actionableLinesWords(lines({ actionableNowLines: 0, openLines: 1, actionableNowMovedOn: 1 }))).toBe('0 of the 1 line not written off (out of the figure: 1 line moved on past actionable)');
  });

  it('renders the words’ text exactly, every count in the mono face, as Cases sets the same counts', () => {
    const cases = [
      lines({ actionableNowLines: 3, openLines: 3 }),
      lines({ actionableNowLines: 0, openLines: 0, lines: 3 }),
      lines({ actionableNowLines: 0, openLines: 3, actionableNowStale: 3 }),
      lines({ actionableNowLines: 1, openLines: 3, actionableNowMovedOn: 1, actionableNowStale: 1 }),
      lines({ actionableNowLines: 1200, openLines: 1300, lines: 1400, actionableNowMovedOn: 100 }),
    ];
    for (const item of cases) {
      const html = renderToStaticMarkup(<ActionableLinesOn item={item} />);
      expect(text(html)).toBe(actionableLinesWords(item));
      expect(digitsOutsideMono(html)).toBe('');
    }
    for (const [movedOn, stale] of [
      [0, 0],
      [0, 1],
      [2, 0],
      [2, 1],
    ] as const) {
      const html = renderToStaticMarkup(<OutOfFigure movedOn={movedOn} stale={stale} />);
      expect(text(html)).toBe(outOfFigureWords(movedOn, stale));
      expect(digitsOutsideMono(html)).toBe('');
    }
  });
});

/**
 * A case's Net expected value with its reason (docs/adr/0082 Decision 5; the fix review's E3 and UX-R1-01): only a
 * case still being worked with a line in its figure and a pursuit estimate shows an amount, so a case that recovered
 * money never reads as a loss of the whole pursuit cost, and every dash says why.
 */
describe('a case’s net expected value', () => {
  const net = (state: NetExpectedState, overrides: Partial<ActionableLines> = {}, netExpectedCents: string | null = null) =>
    text(renderToStaticMarkup(<NetExpected item={{ ...lines(overrides), netExpectedState: state, netExpectedCents }} />));

  it('on a resolved or closed case: a dash, nothing left to pursue', () => {
    expect(net('closed', { actionableNowLines: 0, openLines: 0 })).toBe('— (the case is resolved or closed; nothing is left to pursue)');
  });

  it('without a pursuit estimate: a dash, not estimated', () => {
    expect(net('unestimated')).toBe('— (not estimated)');
  });

  it('on a worked case with no line in its figure: not computed, and why', () => {
    expect(net('no_line', { actionableNowLines: 0, openLines: 3, actionableNowMovedOn: 2, actionableNowStale: 1 })).toBe(
      'Not computed: no line is in the actionable figure now (out of the figure: 1 line whose pricing is no longer current and 2 lines moved on past actionable)',
    );
    expect(net('no_line', { actionableNowLines: 0, openLines: 1, actionableNowMovedOn: 1 })).toBe('Not computed: no line is in the actionable figure now (out of the figure: 1 line moved on past actionable)');
    expect(net('no_line', { actionableNowLines: 0, openLines: 0, lines: 2 })).toBe('Not computed: every line is written off');
  });

  it('otherwise the amount, negative when pursuit is not worth it', () => {
    expect(net('live', {}, '1500')).toBe('$15.00 (actionable less the pursuit cost)');
    expect(net('live', {}, '-2500')).toBe('-$25.00 (actionable less the pursuit cost)');
    expect(renderToStaticMarkup(<NetExpected item={{ ...lines(), netExpectedState: 'live', netExpectedCents: '1500' }} />)).toContain('data-figure="net-expected"');
  });
});
