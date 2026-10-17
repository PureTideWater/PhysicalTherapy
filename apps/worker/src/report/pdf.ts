import { existsSync } from 'node:fs';

import { chromium } from 'playwright-core';

/**
 * Printing a report's HTML to PDF (PRD 15, Documents: "Playwright and Chromium for PDF export of
 * reports and packets, in the worker only"). The worker's image carries Chromium; development and the
 * tests use the Chromium Playwright installs (PLAYWRIGHT_BROWSERS_PATH). The page is set from the
 * report's own HTML with every network request refused, JavaScript off, so nothing outside the document
 * is fetched or run while it prints: the brand's fonts and marks are inside it (report/brand.ts). The page
 * size and margins are the document's own @page rules (a full-bleed cover, then margins for the inside
 * pages), so none are passed here.
 */
export interface PdfRenderer {
  render(html: string): Promise<Uint8Array>;
}

export class ChromiumPdfRenderer implements PdfRenderer {
  /** `executablePath`: a Chromium other than the one Playwright installed (the image's, say). */
  constructor(private readonly options: { readonly executablePath?: string } = {}) {}

  async render(html: string): Promise<Uint8Array> {
    const browser = await chromium.launch({ headless: true, ...(this.options.executablePath === undefined ? {} : { executablePath: this.options.executablePath }) });
    try {
      const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
      await context.route('**/*', (route) => route.abort());
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      return await page.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true });
    } finally {
      await browser.close();
    }
  }
}

/** Whether the Chromium playwright-core would launch is installed here (tests that print say why they skip otherwise). */
export function chromiumInstalled(): boolean {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}
