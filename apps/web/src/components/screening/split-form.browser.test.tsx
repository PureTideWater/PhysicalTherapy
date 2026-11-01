import type { Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type Harness, chromiumInstalled, startHarness } from '../test-support/browser';

/**
 * The screening split form's status line in a real browser (docs/adr/0077; WCAG 4.1.3), through the in-repo harness
 * (test-support/browser.ts, its `screening` form): the problems list changes with each key and is not live; the status
 * line says the problems once the lists rest for a second, at once when a list is left, and on every press, and never
 * while the person types; and the lists start again when the page shows another person signed in (test matrix FRM-01).
 * Synthetic codes only.
 */

let harness: Harness;

const LINE = '[data-slot="split-status"]';
const BOTH = 'Place of service 11 is listed as both facility and non-facility.';

/** One change of the status line: its words then (empty when it went quiet). */
interface Saying {
  readonly text: string;
  /** Milliseconds since the last key the person typed into a list. */
  readonly rest: number;
}

/** Records every change of the status line from now on, with how long the lists had rested when it came. */
async function listen(page: Page): Promise<void> {
  await page.evaluate((selector) => {
    const line = document.querySelector(selector);
    if (line === null) {
      throw new Error('no status line');
    }
    let typed = performance.now();
    document.addEventListener('input', () => {
      typed = performance.now();
    });
    const sayings: Saying[] = [];
    new MutationObserver(() => {
      sayings.push({ text: line.textContent ?? '', rest: performance.now() - typed });
    }).observe(line, { childList: true, subtree: true, characterData: true });
    Object.assign(window, { sayings });
  }, LINE);
}

/** What the status line has said since `listen`, its silences left out. */
async function said(page: Page): Promise<readonly Saying[]> {
  return (await page.evaluate(() => (window as unknown as { sayings: Saying[] }).sayings)).filter((saying) => saying.text !== '');
}

/** What the status line holds now. */
function line(page: Page): Promise<string> {
  return page.evaluate((selector) => document.querySelector(selector)?.textContent ?? 'no status line', LINE);
}

/** Types into a list key by key, as a person does. */
async function typeInto(page: Page, id: string, text: string): Promise<void> {
  await page.click(`#${id}`);
  await page.keyboard.type(text, { delay: 40 });
}

function focused(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.id ?? '');
}

describe.skipIf(!chromiumInstalled())('the split form’s status line in the browser', { timeout: 30_000 }, () => {
  beforeAll(async () => {
    harness = await startHarness();
  }, 60_000);

  afterAll(async () => {
    expect(harness.errors()).toEqual([]);
    await harness.close();
  });

  it('says nothing while the person types, and the settled problem once the lists rest', async () => {
    const page = await harness.open('screening');
    await listen(page);
    // Each leading 0 is a code from 01 to 99 only once its second digit comes: the list shows it, the line never says it.
    await typeInto(page, 'split-facility', '02 06 11');
    await typeInto(page, 'split-non-facility', '11');
    expect(await page.locator('#split-problems li').allTextContents()).toEqual([BOTH]);
    expect(await page.getAttribute('#split-problems', 'role')).toBeNull();
    await page.waitForFunction(([selector, words]) => document.querySelector(selector)?.textContent === words, [LINE, BOTH] as const, { timeout: 5_000 });
    const sayings = await said(page);
    expect(sayings.map((saying) => saying.text)).toEqual([BOTH]);
    expect(sayings[0]?.rest).toBeGreaterThanOrEqual(990);
    await page.close();
  });

  it('says the problem at once when a list is left, and goes quiet when the problem clears', async () => {
    const page = await harness.open('screening');
    await listen(page);
    await typeInto(page, 'split-facility', '11');
    await typeInto(page, 'split-non-facility', '11');
    // Well inside the second's pause: only leaving the list can have said it.
    await page.keyboard.press('Tab');
    expect(await line(page)).toBe(BOTH);
    // Leaving the other list with the same problem says nothing new.
    await page.click('#split-facility');
    await page.keyboard.press('Tab');
    expect((await said(page)).map((saying) => saying.text)).toEqual([BOTH]);
    // Fixed: the line empties, which says nothing, and stays quiet.
    await page.fill('#split-non-facility', '12');
    await page.waitForFunction((selector) => document.querySelector(selector)?.textContent === '', LINE, { timeout: 5_000 });
    expect(await page.locator('#split-problems li').count()).toBe(0);
    expect((await said(page)).map((saying) => saying.text)).toEqual([BOTH]);
    await page.close();
  });

  it('says the problems on every press, as a new saying, also when Enter in the field at fault moves no focus, and sends nothing', async () => {
    const page = await harness.open('screening');
    await listen(page);
    // Both lists empty: the press says what is missing and focuses the facility list.
    await page.getByRole('button', { name: 'Approve this split', exact: true }).click();
    expect(await line(page)).toBe('List at least one place of service.');
    expect(await focused(page)).toBe('split-facility');
    await page.keyboard.type('11', { delay: 40 });
    await typeInto(page, 'split-non-facility', '11');
    await page.click('#split-facility');
    const before = await page.evaluate((selector) => {
      const node = document.querySelector(selector)?.firstElementChild ?? null;
      Object.assign(window, { saidNode: node });
      return node?.textContent ?? '';
    }, LINE);
    expect(before).toBe(BOTH);
    // Enter in the facility list, the field at fault: the focus stays, so the line says the same words again, as a new node.
    await page.keyboard.press('Enter');
    expect(await focused(page)).toBe('split-facility');
    expect(await line(page)).toBe(BOTH);
    expect(await page.evaluate((selector) => document.querySelector(selector)?.firstElementChild !== (window as unknown as { saidNode: Element | null }).saidNode, LINE)).toBe(true);
    await page.keyboard.press('Enter');
    expect((await said(page)).map((saying) => saying.text)).toEqual(['List at least one place of service.', BOTH, BOTH, BOTH]);
    expect(await page.evaluate(() => (window as unknown as { harness: { calls: unknown[] } }).harness.calls.length)).toBe(0);
    await page.close();
  });

  it('FRM-01: starts the lists again from the page when it shows another person signed in, so nothing typed is sent as them', async () => {
    const page = await harness.open('screening');
    await typeInto(page, 'split-facility', '11');
    await typeInto(page, 'split-non-facility', '11');
    // A refresh in place renders the page for someone else (docs/adr/0077, D10): the lists are held outside the fields
    // ActionForm mounts afresh, so the split form starts them again itself.
    await page.evaluate(() => {
      (window as unknown as { harness: { render: (next: { person: string }) => void } }).harness.render({ person: 'synthetic-person-b' });
    });
    await page.waitForSelector('[data-slot="refusal-summary"][data-state="cleared"]');
    expect([await page.inputValue('#split-facility'), await page.inputValue('#split-non-facility')]).toEqual(['', '']);
    expect(await page.locator('#split-problems li').count()).toBe(0);
    expect(await line(page)).toBe('');
    await page.close();
  });
});
