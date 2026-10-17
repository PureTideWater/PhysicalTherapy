import { chromium } from 'playwright-core';

/**
 * For the tests: every dollar amount a printed document shows that is not set in IBM Plex Mono
 * (docs/brand/BRAND.md, section 5: every dollar figure in the mono face). The document is laid out in
 * Chromium exactly as the PDF renderer lays it out (nothing fetched), and each text node holding an amount
 * ($1,234.56 or -$12.00) is checked by its element's computed font family. Empty when every amount is mono.
 */
const CHECK = `(() => {
  const amount = /-?\\$\\d[\\d,]*\\.\\d{2}/g;
  const found = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node.textContent || '';
    const amounts = text.match(amount);
    if (amounts === null) continue;
    const element = node.parentElement;
    const family = element === null ? '' : getComputedStyle(element).fontFamily;
    if (!family.includes('IBM Plex Mono')) {
      for (const value of amounts) found.push(value + ' in <' + (element === null ? '?' : element.tagName.toLowerCase()) + '>: ' + text.trim().slice(0, 80));
    }
  }
  return found;
})()`;

export async function amountsNotInMono(html: string): Promise<string[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ offline: true });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.emulateMedia({ media: 'print' });
    await page.setContent(html, { waitUntil: 'load' });
    return await page.evaluate<string[]>(CHECK);
  } finally {
    await browser.close();
  }
}
