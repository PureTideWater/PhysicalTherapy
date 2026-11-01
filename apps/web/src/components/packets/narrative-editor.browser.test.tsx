import type { Page } from '@playwright/test';
import { assemblePacket, draftNarrative } from '@tp/packets';
import { assemblyInput } from '@tp/packets/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type Harness, chromiumInstalled, startHarness } from '../test-support/browser';
import { ANNOUNCE_AFTER_MS } from './narrative-editor';

/**
 * The packet builder's narrative editor in a real browser (test matrix CAS-43), through the forms' harness
 * (test-support/browser.ts), over SYNTHETIC content from @tp/packets/testing: one reading of the narrative per keystroke
 * and the version's facts built once (the review of 2026-11-01, PE-9; the harness counts the editor's calls to
 * @tp/packets/check), a status line a screen reader hears once, when the typing pauses, rather than on each keystroke,
 * and a failing figure said with what it was read as and what the records hold it as, within a phone's width (the UX
 * review of 2026-10-28).
 */

const content = assemblePacket(assemblyInput());
const initial = draftNarrative(content);
const added = ' There were 3650 claims [3].';

let harness: Harness | null = null;

beforeAll(async () => {
  harness = chromiumInstalled() ? await startHarness() : null;
}, 120_000);

afterAll(async () => {
  await harness?.close();
});

/** The harness's counts of the editor's calls: the facts built and the readings of the narrative. */
function counts(page: Page): Promise<{ readonly facts: number; readonly readings: number }> {
  return page.evaluate(() => ({ ...(window as unknown as { checkCounts: { facts: number; readings: number } }).checkCounts }));
}

/** Records every text the status line takes from now on. */
async function recordAnnouncements(page: Page): Promise<void> {
  await page.evaluate(() => {
    const status = document.querySelector('[data-live-announced]');
    const said: string[] = [];
    Object.assign(window, { announced: said });
    if (status !== null) {
      new MutationObserver(() => {
        said.push(status.textContent);
      }).observe(status, { childList: true, characterData: true, subtree: true });
    }
  });
}

const announcements = (page: Page): Promise<string[]> => page.evaluate(() => [...(window as unknown as { announced: string[] }).announced]);

describe.skipIf(!chromiumInstalled())('the narrative editor in a browser', () => {
  it('reads the narrative once per keystroke and builds the facts once (PE-9)', async () => {
    const page = await (harness as Harness).open('narrative', { init: { content, initial } });
    const textarea = page.getByRole('textbox', { name: 'Narrative' });
    await expect.poll(async () => (await counts(page)).readings).toBeGreaterThan(0);
    const mounted = await counts(page);
    await textarea.press('End');
    await textarea.pressSequentially(' ');
    await expect.poll(async () => (await counts(page)).readings).toBeGreaterThan(mounted.readings);
    const first = await counts(page);
    // One render per keystroke, each reading once (development's StrictMode runs a memo twice per render).
    const perKeystroke = first.readings - mounted.readings;
    expect(perKeystroke).toBeGreaterThanOrEqual(1);
    expect(perKeystroke).toBeLessThanOrEqual(2);
    await textarea.pressSequentially('abcdefghi');
    await expect.poll(async () => (await counts(page)).readings).toBe(first.readings + 9 * perKeystroke);
    // The facts are the content's: never built again while typing.
    expect((await counts(page)).facts).toBe(mounted.facts);
    expect((harness as Harness).errors()).toEqual([]);
    await page.close();
  });

  it('announces the summary once the typing pauses, not on each keystroke, and says a failing figure in plain words', async () => {
    const page = await (harness as Harness).open('narrative', { init: { content, initial } });
    const textarea = page.getByRole('textbox', { name: 'Narrative' });
    const status = page.getByRole('status');
    expect(await status.textContent()).toBe('Live check passes.');
    // The textarea is described by the summary line, not by the whole list.
    expect(await textarea.getAttribute('aria-describedby')).toBe('narrative-check-summary');
    await recordAnnouncements(page);
    await textarea.press('End');
    await textarea.pressSequentially(added, { delay: 20 });
    // While the person types, the badge follows each keystroke and the status line stays as it was.
    expect(await page.locator('[data-live-check]').getAttribute('data-live-check')).toBe('fails');
    expect(await announcements(page)).toEqual([]);
    await expect.poll(() => status.textContent(), { timeout: ANNOUNCE_AFTER_MS + 4000 }).toBe('Live check: 1 mismatch.');
    expect(await announcements(page)).toEqual(['Live check: 1 mismatch.']);
    const items = await page.getByRole('list', { name: 'Live mismatches' }).getByRole('listitem').allTextContents();
    expect(items).toHaveLength(1);
    expect(items[0]).toContain('3650: read as a count of claims; the records hold it as the dispute window’s days');
    expect(items[0]).not.toContain('role its words');
    expect((harness as Harness).errors()).toEqual([]);
    await page.close();
  });

  it('keeps each item within a phone’s width (390 px)', async () => {
    const page = await (harness as Harness).open('narrative', { width: 390, init: { content, initial: `${initial}${added} The payer paid $100.00 for each line [1].` } });
    const items = page.getByRole('list', { name: 'Live mismatches' }).getByRole('listitem');
    const texts = await items.allTextContents();
    expect(texts).toHaveLength(2);
    expect(texts[1]).toContain('$100.00: read as what the payer paid; the records hold it as what the contract requires');
    const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(widths.page).toBeLessThanOrEqual(widths.viewport);
    for (const right of await items.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().right))) {
      expect(right).toBeLessThanOrEqual(390);
    }
    await page.close();
  });
});
