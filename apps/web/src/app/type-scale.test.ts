import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The brand's type on every screen (docs/brand/BRAND.md, section 5; docs/adr/0056: one type scale, a page's
 * title 32 px/700 in the display face; every money figure, code, unit count and rate in the mono face with
 * tabular numerals). Read from the source, so a page added or merged without the brand's restyle fails here
 * rather than waiting for a reviewer's grep.
 */

const SOURCE = path.resolve(import.meta.dirname, '..');

/** global-error.tsx replaces the root layout, and the stylesheet with it, when the workspace cannot load. */
const WITHOUT_THE_STYLESHEET = new Set(['app/global-error.tsx']);

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test-support' ? [] : sources(child);
    }
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [child] : [];
  });
}

const FILES = sources(SOURCE).map((file) => ({ file: path.relative(SOURCE, file).split(path.sep).join('/'), text: readFileSync(file, 'utf8') }));

describe('the brand’s type scale and figures in the web app', () => {
  it('sets every page title at the title scale: 32 px, 700, the display leading and tracking', () => {
    const titles = FILES.filter(({ file }) => !WITHOUT_THE_STYLESHEET.has(file)).flatMap(({ file, text }) => [...text.matchAll(/<h1\b[^>]*>/g)].map((match) => ({ file, tag: match[0] })));
    expect(titles.length).toBeGreaterThan(70);
    const off = titles.filter(({ tag }) => !['text-[2rem]', 'font-bold', 'leading-display', 'tracking-display'].every((token) => new RegExp(`className="[^"]*(?<![\\w-])${token.replace(/[[\]]/g, '\\$&')}(?![\\w-])`).test(tag)));
    expect(off).toEqual([]);
  });

  it('sets tabular numerals only with the mono face: a figure is never tabular in Plex Sans', () => {
    const classes = FILES.flatMap(({ file, text }) => [...text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)].map((match) => ({ file, value: match[1] ?? match[2] ?? match[3] ?? '' })));
    expect(classes.filter(({ value }) => /(?<![\w-])tabular-nums(?![\w-])/.test(value) && !/(?<![\w-])font-mono(?![\w-])/.test(value))).toEqual([]);
  });
});
