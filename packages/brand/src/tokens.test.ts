import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { assetPath, assets } from './index';
import { brandName } from './name';
import { badgeText, descriptor, independenceClaim, sealLabel, sealText, tagline, verifiedDefinition } from './tokens';

/**
 * The product's words (Change Order 001, CO-11) as the brand package holds them, and the outlined seal and
 * badge art checked against them: the art is glyphs, not text, so the test reads each glyph's outline and
 * requires the same letter wherever the words repeat one, and a different glyph wherever they differ.
 */

/** The parameters of each path command, as x, y or neither (an arc's radii and flags). */
const PARAMETERS: Readonly<Record<string, string>> = { M: 'xy', L: 'xy', T: 'xy', H: 'x', V: 'y', C: 'xyxyxy', S: 'xyxy', Q: 'xyxy', A: 'nnnnnxy', Z: '' };

/** A glyph's outline relative to its first point, so the same letter drawn at two places compares equal. */
function outline(d: string): (string | number)[] {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  const out: (string | number)[] = [];
  let command = '';
  let origin: { x?: number; y?: number } = {};
  for (let index = 0; index < tokens.length; ) {
    const token = tokens[index] ?? '';
    if (/[A-Za-z]/.test(token)) {
      command = token.toUpperCase();
      out.push(command);
      index += 1;
      continue;
    }
    for (const kind of PARAMETERS[command] ?? '') {
      const value = Number(tokens[index]);
      index += 1;
      if (kind === 'x') {
        origin = { ...origin, x: origin.x ?? value };
        out.push(value - (origin.x ?? 0));
      } else if (kind === 'y') {
        origin = { ...origin, y: origin.y ?? value };
        out.push(value - (origin.y ?? 0));
      } else {
        out.push(value);
      }
    }
    // Coordinates after a move's first pair are lines.
    command = command === 'M' ? 'L' : command;
  }
  return out;
}

/** Two outlines are the same glyph when their commands match and their points agree to the art's rounding. */
function sameGlyph(a: readonly (string | number)[], b: readonly (string | number)[]): boolean {
  return a.length === b.length && a.every((value, index) => (typeof value === 'string' ? value === b[index] : Math.abs(value - Number(b[index])) <= 0.05));
}

/** Each item's first index among the distinct ones: the shape of a sequence's repeats. */
function repeats<T>(items: readonly T[], same: (a: T, b: T) => boolean): number[] {
  const seen: T[] = [];
  return items.map((item) => {
    const found = seen.findIndex((other) => same(item, other));
    if (found >= 0) {
      return found;
    }
    seen.push(item);
    return seen.length - 1;
  });
}

function svg(name: string): string {
  return readFileSync(assetPath(name), 'utf8');
}

/** The glyph outlines of a piece of art: the paths that are letters, in the order they are drawn. */
function glyphs(art: string, letters: (path: string) => boolean): (string | number)[][] {
  return [...art.matchAll(/<path\b([^>]*)\/>/g)].map((match) => match[1] ?? '').filter(letters).map((path) => outline(/\bd="([^"]*)"/.exec(path)?.[1] ?? ''));
}

describe('the product words (CO-11)', () => {
  it('holds the tagline, the descriptor, the independence claim, the seal and badge text and the definition', () => {
    expect(tagline).toBe("Know what you're owed. Verify what you're paid.");
    expect(descriptor).toBe('Contract-verified payment for therapy groups');
    expect(independenceClaim).toBe('independent of the EMR and the payer');
    expect(sealText).toEqual(['VERIFIED BY PAIDWHOLE', 'RECONCILED TO CASH']);
    expect(badgeText).toBe('Verified by PaidWhole');
    expect(sealLabel).toBe('Verified by PaidWhole. Reconciled to cash.');
    expect(verifiedDefinition).toBe('Verified: recovered amounts reconcile to posted or deposited remittance; expected amounts trace to signed-off contract versions.');
  });

  it('names the product as the wordmark does, and the badge is the seal’s first line', () => {
    expect(badgeText).toBe(`Verified by ${brandName}`);
    expect(badgeText.toUpperCase()).toBe(sealText[0]);
    expect(independenceClaim).not.toMatch(/verification platform/i);
  });

  it('draws the seal in its two lines: 35 glyphs whose repeats are the letters of the words, in each color', () => {
    const letters = sealText.join('').replace(/\s+/g, '').split('');
    for (const name of [assets.seal, assets.sealReversed, assets.sealMono]) {
      // The letters are set on the ring, each turned to its angle; the ring's circles and the mark are not.
      const outlines = glyphs(svg(name), (path) => path.includes('rotate('));
      expect(outlines).toHaveLength(letters.length);
      expect(repeats(outlines, sameGlyph)).toEqual(repeats(letters, (a, b) => a === b));
    }
  });

  it('draws the badge as the mark then "Verified by PaidWhole", with the fi set as one ligature', () => {
    const letters = badgeText.replace(/\s+/g, '').replace('fi', '\u{FB01}').split('');
    for (const name of [assets.badge, assets.badgeReversed]) {
      // The first two paths are the mark's ring and keystone.
      const outlines = glyphs(svg(name), () => true).slice(2);
      expect(outlines).toHaveLength(letters.length);
      expect(repeats(outlines, sameGlyph)).toEqual(repeats(letters, (a, b) => a === b));
    }
  });

  it('tells a changed word from the art: the pattern of another line does not match', () => {
    const outlines = glyphs(svg(assets.seal), (path) => path.includes('rotate('));
    const other = 'VERIFIED BY PAIDWHOLE'.concat('RECONCILED TO BANK').replace(/\s+/g, '').split('');
    expect(repeats(outlines, sameGlyph)).not.toEqual(repeats(other, (a, b) => a === b));
  });
});
