import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { contrastRatio } from './contrast';
import { assetPath, assets } from './index';
import { brandName } from './name';
import { badgeText, contrastOnWhite, descriptor, independenceClaim, palette, radius, sealLabel, sealText, space, status, statusDark, tagline, verifiedDefinition } from './tokens';

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

/**
 * The token pairs, read from tokens.css itself (the single source), so this file holds no color of its own: the light
 * block (`:root`), and the dark block (`:root[data-theme="dark"], .dark`) laid over it, each `var(--pw-*)` resolved
 * within the theme it is read in.
 */
const TOKENS_CSS = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

function declarations(block: string): Map<string, string> {
  return new Map([...block.matchAll(/(--pw-[a-z0-9-]+):\s*([^;]+);/g)].map((match) => [match[1] ?? '', (match[2] ?? '').trim()]));
}

function blockAfter(selector: string): string {
  const start = TOKENS_CSS.indexOf(selector);
  if (start < 0) {
    throw new Error(`tokens.css has no ${selector} block`);
  }
  const open = TOKENS_CSS.indexOf('{', start);
  return TOKENS_CSS.slice(open + 1, TOKENS_CSS.indexOf('}', open));
}

const LIGHT = declarations(blockAfter(':root {'));
const DARK = new Map([...LIGHT, ...declarations(blockAfter(':root[data-theme="dark"],'))]);
const THEMES = { light: LIGHT, dark: DARK } as const;

/** A token's color in a theme, following var() references to the hex. */
function token(theme: ReadonlyMap<string, string>, name: string, seen: readonly string[] = []): string {
  const value = theme.get(name);
  if (value === undefined || seen.includes(name)) {
    throw new Error(`tokens.css: ${name} is not defined${seen.length > 0 ? ` (from ${seen.join(' via ')})` : ''}`);
  }
  const reference = /^var\((--pw-[a-z-]+)\)$/.exec(value);
  return reference === null ? value : token(theme, reference[1] ?? '', [...seen, name]);
}

function ratio(theme: ReadonlyMap<string, string>, a: string, b: string): number {
  return contrastRatio(token(theme, a), token(theme, b));
}

describe('the status colors on their tints (WCAG 1.4.3 and 1.4.11; BRAND.md section 4; docs/adr/0056)', () => {
  it('reads both themes from tokens.css, each status color and tint a color', () => {
    for (const theme of Object.values(THEMES)) {
      for (const tone of ['whole', 'short', 'unpriced']) {
        expect(token(theme, `--pw-${tone}`)).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(token(theme, `--pw-${tone}-bg`)).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
    expect(token(DARK, '--pw-unpriced')).not.toBe(token(LIGHT, '--pw-unpriced'));
  });

  for (const [name, theme] of Object.entries(THEMES)) {
    it(`${name}: each status color is text on its own tint, 4.5:1 or more`, () => {
      for (const tone of ['whole', 'short', 'unpriced']) {
        expect(ratio(theme, `--pw-${tone}`, `--pw-${tone}-bg`), `${name} --pw-${tone} on --pw-${tone}-bg`).toBeGreaterThanOrEqual(4.5);
      }
    });

    // Unpriced is small chip text on a tint, so it keeps a margin above 4.5:1 that anti-aliasing and display
    // variance cannot eat: 4.8:1 or more on its tint (the brand owner's F3 value; docs/adr/0056, ruling 3).
    it(`${name}: unpriced text keeps its margin on its tint, 4.8:1 or more`, () => {
      expect(ratio(theme, '--pw-unpriced', '--pw-unpriced-bg'), `${name} --pw-unpriced on --pw-unpriced-bg`).toBeGreaterThanOrEqual(4.8);
    });

    it(`${name}: unpriced is text on the page grounds too (the report's .unpriced), 4.5:1 or more`, () => {
      for (const ground of ['--pw-bg', '--pw-bg-raised']) {
        expect(ratio(theme, '--pw-unpriced', ground), `${name} --pw-unpriced on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${name}: the unpriced chip's border (the same token) stands 3:1 on its tint, on the page and against the neutral chip's border`, () => {
      for (const other of ['--pw-unpriced-bg', '--pw-bg', '--pw-border']) {
        expect(ratio(theme, '--pw-unpriced', other), `${name} --pw-unpriced against ${other}`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('tokens.ts mirrors tokens.css: the palette, the status colors in both themes', () => {
    for (const [name, value] of Object.entries(palette)) {
      expect(value, `palette.${name}`).toBe(token(LIGHT, `--pw-${name}`));
    }
    for (const [name, value] of Object.entries(status)) {
      expect(value, `status.${name}`).toBe(token(LIGHT, `--pw-${name}`));
    }
    for (const [name, value] of Object.entries(statusDark)) {
      expect(value, `statusDark.${name}`).toBe(token(DARK, `--pw-${name}`));
    }
  });

  it('tokens.ts mirrors tokens.css: every corner radius and every step of the space scale, in px', () => {
    expect(Object.keys(radius)).toEqual([...LIGHT.keys()].filter((name) => name.startsWith('--pw-radius-')).map((name) => name.slice('--pw-radius-'.length)));
    for (const [name, value] of Object.entries(radius)) {
      expect(`${String(value)}px`, `radius.${name}`).toBe(token(LIGHT, `--pw-radius-${name}`));
    }
    expect(Object.keys(space)).toEqual([...LIGHT.keys()].filter((name) => name.startsWith('--pw-space-')).map((name) => name.slice('--pw-space-'.length)));
    for (const [step, value] of Object.entries(space)) {
      expect(`${String(value)}px`, `space[${step}]`).toBe(token(LIGHT, `--pw-space-${step}`));
    }
  });

  it('states each ratio on white to one place, and never overstates a text color', () => {
    const white = token(LIGHT, '--pw-white');
    const colors: Readonly<Record<string, string>> = { ...palette, ...status };
    for (const [name, stated] of Object.entries(contrastOnWhite)) {
      const actual = contrastRatio(colors[name] ?? '', white);
      expect(Math.abs(stated - actual), `contrastOnWhite.${name} ${stated} against ${actual.toFixed(3)}`).toBeLessThan(0.1);
      if (name !== 'brass') {
        // Brass is graphic only, never text on white; a text color's stated ratio is the measured one truncated.
        expect(stated, `contrastOnWhite.${name}`).toBeLessThanOrEqual(actual);
      }
    }
    expect(Object.keys(contrastOnWhite)).toEqual(expect.arrayContaining(Object.keys(status)));
  });
});
