import { chromium } from 'playwright-core';

import { reportStyles } from '../brand';

/**
 * For the tests: how a printed document lays out on its inside pages. Chromium shrinks the whole PDF to fit
 * when anything is wider than the page's content box (preferCSSPageSize; report/pdf.ts), the Paper cover
 * included, so one wide table prints every page smaller than the brand allows (docs/brand/BRAND.md, sections
 * 2 and 7). The inside pages' width comes from the report stylesheet's own @page rule (letter, less its left
 * and right margins), so a change to the margins moves the check with it.
 */

/** CSS pixels per inch. */
const PX_PER_INCH = 96;
/** US Letter's width (BRAND.md section 7's reports print on Letter; report/pdf.ts). */
const LETTER_WIDTH_INCHES = 8.5;

/** The inside pages' content width in CSS pixels, read from the report stylesheet's `@page` margins. */
export function insidePageWidthPx(): number {
  const rule = /@page\s*\{[^}]*\bsize:\s*letter;[^}]*\bmargin:\s*([\d.]+)in\s+([\d.]+)in\s+([\d.]+)in\s+([\d.]+)in;/.exec(reportStyles());
  if (rule === null) {
    throw new Error('the report stylesheet sets a letter @page with four margins in inches');
  }
  const [, , right = '', , left = ''] = rule;
  return Math.round((LETTER_WIDTH_INCHES - Number(right) - Number(left)) * PX_PER_INCH);
}

export interface InsideLayout {
  /** The inside pages' content width the document was laid out at. */
  readonly widthPx: number;
  /** documentElement.scrollWidth at that width: more than widthPx means Chromium would shrink the PDF. */
  readonly scrollWidthPx: number;
  /** What reaches past the page: each table laid out wider than it, by caption, and each box its content overruns. */
  readonly wide: readonly string[];
  /** Every dollar amount or date in a table's cells that the layout split across lines (none may be). */
  readonly brokenFigures: readonly string[];
}

const MEASURE = `((limit) => {
  const wide = [];
  const label = (element) => (element.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
  // A table laid out wider than the page (its cells' shortest lines do not fit), by its caption.
  for (const table of document.body.querySelectorAll('table:not(.pages)')) {
    const width = table.getBoundingClientRect().width;
    if (width > limit + 0.5) {
      const caption = table.querySelector(':scope > caption');
      wide.push('table ' + String(Math.round(width)) + 'px wide: ' + (caption === null ? label(table) : label(caption)));
    }
  }
  // Anything whose content runs past its own box (a word or figure that cannot break).
  for (const element of document.body.querySelectorAll('*')) {
    if (element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0 && element.getBoundingClientRect().right > limit + 0.5) {
      wide.push(element.tagName.toLowerCase() + ' overflows to ' + String(Math.round(element.getBoundingClientRect().left + element.scrollWidth)) + 'px: ' + label(element));
    }
  }
  // Every amount ($1,234.56, -$12.00) and date (2026-03-01) in a table's cells on one line: a table that fits
  // by breaking a figure has not fit.
  const brokenFigures = [];
  const figure = /-?\\$\\d[\\d,]*\\.\\d{2}|\\d{4}-\\d{2}-\\d{2}/g;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.parentElement === null || node.parentElement.closest('table:not(.pages) td, table:not(.pages) th') === null) continue;
    for (const match of (node.textContent || '').matchAll(figure)) {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const lines = new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top)));
      if (lines.size > 1) brokenFigures.push(match[0] + ' on ' + String(lines.size) + ' lines in <' + node.parentElement.tagName.toLowerCase() + '>');
    }
  }
  return { scrollWidthPx: document.documentElement.scrollWidth, wide: wide.slice(0, 20), brokenFigures: brokenFigures.slice(0, 20) };
})`;

/**
 * Lays the document out under print media at the inside pages' content width, as Chromium does before it
 * prints (nothing fetched, scripts off in the document), and reports what is wider than the page and any
 * figure the layout broke to make it fit.
 */
export async function insideLayout(html: string): Promise<InsideLayout> {
  const widthPx = insidePageWidthPx();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ offline: true, viewport: { width: widthPx, height: 1056 } });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.emulateMedia({ media: 'print' });
    await page.setContent(html, { waitUntil: 'load' });
    const measured = await page.evaluate<{ scrollWidthPx: number; wide: string[]; brokenFigures: string[] }>(`${MEASURE}(${String(widthPx)})`);
    return { widthPx, ...measured };
  } finally {
    await browser.close();
  }
}
