import type { ElementHandle, Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { RefusalState } from './form-issues';
import { type Harness, chromiumInstalled, startHarness } from './test-support/browser';

/**
 * A sign-in step's time limit in a real browser (test matrix SGN-02, and SGN-03's arrival focus; docs/adr/0081),
 * through the forms harness (test-support/browser.ts): the real StepTimer around a real ActionForm, as the code step
 * renders it, on Playwright's fake clock installed before the page loads, which the test moves (runFor fires every
 * timer on the way; fastForward moves the wall and monotonic clocks together, as a machine that slept; setSystemTime
 * moves the wall clock only). Each test waits for the open phase before it moves the clock, so the count is anchored
 * first, and moves it with two seconds' margin. Synthetic values only.
 */

/** What the server renders into a page's keys: here, the step's time (the harness's own keys, test-support/forms-harness.tsx). */
interface PageKeys {
  readonly requestKey: string;
  readonly person: string | null;
  readonly closesIn?: number;
  readonly closesAt?: number;
}

type Step = { readonly refuse: RefusalState } | { readonly hold: RefusalState };

interface Control {
  steps: Step[];
  release: (() => void) | null;
  render: (next: Partial<PageKeys>) => void;
}

let harness: Harness;

/** When each page's fake clock starts: a fixed synthetic time. */
const START = Date.parse('2026-11-01T12:00:00Z');
/** The harness's code step: its deadline (the server's, only a key), and the status region. */
const CLOSES_AT = 1_800_000_000_000;
const REGION = '[data-slot="step-timer"]';
const VISIBLE_PHRASE = '[data-slot="step-limit"] > span:not(.invisible)';
/** The step's own form's button, apart from Start again's. */
const SUBMIT = 'form:has(#field-code) button[type="submit"]';

const WARNING =
  'This step closes within a minuteIf you need more time, start again: your email is kept, and you type your password again.Start again';
const CLOSED = 'This step has closedStart again: your email is kept, and you type your password again.Start again';

/** Opens the harness's code step on a fake clock and waits until its count is anchored (the open phase). */
async function openStep(options: { readonly width?: number } = {}): Promise<Page> {
  const page = await harness.open('stepTimer', { ...options, clock: START });
  await reached(page, 'open');
  await record(page);
  return page;
}

/** Waits until the region shows the phase. */
async function reached(page: Page, phase: 'open' | 'warning' | 'closed'): Promise<void> {
  await page.locator(`${REGION}[data-phase="${phase}"]`).waitFor({ state: 'attached', timeout: 5_000 });
}

/** Records each distinct text the region shows from now on, on window.said. */
async function record(page: Page): Promise<void> {
  await page.evaluate((selector) => {
    const region = document.querySelector(selector);
    if (region === null) {
      throw new Error('no step timer');
    }
    const said = [region.textContent];
    new MutationObserver(() => {
      if (said.at(-1) !== region.textContent) {
        said.push(region.textContent);
      }
    }).observe(region, { childList: true, subtree: true, characterData: true });
    Object.assign(window, { said });
  }, REGION);
}

/** The region's texts so far, after React has had a moment to write anything a timer set. */
async function said(page: Page): Promise<readonly string[]> {
  await page.waitForTimeout(300);
  return page.evaluate(() => (window as unknown as { said: string[] }).said);
}

/** Sets document.visibilityState, as switching tabs or locking a phone does, and tells the page. */
async function visibility(page: Page, state: 'visible' | 'hidden'): Promise<void> {
  await page.evaluate((next) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => next });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

/** The id of the focused element, or its tag when it has none. */
function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    return active === null ? '' : active.id === '' ? (active.getAttribute('data-slot') ?? active.tagName) : active.id;
  });
}

/** The boxes of what sits above the region: the sentence, the field and the button. */
function boxes(page: Page) {
  return Promise.all(['[data-slot="step-limit"]', '#field-code', SUBMIT].map((selector) => page.locator(selector).boundingBox()));
}

/** Whether the sentence's visible phrase lies inside the viewport. */
function phraseInView(page: Page): Promise<boolean> {
  return page.locator(VISIBLE_PHRASE).evaluate((phrase) => {
    const box = phrase.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= window.innerHeight && box.height > 0;
  });
}

/** Scripts the action's next answers. */
async function script(page: Page, ...steps: readonly Step[]): Promise<void> {
  await page.evaluate((next) => {
    (window as unknown as { harness: Control }).harness.steps.push(...next);
  }, steps);
}

/** Renders the page again with these keys, as Next renders a server page in place. */
async function rerender(page: Page, next: Partial<PageKeys>): Promise<void> {
  await page.evaluate((given) => {
    (window as unknown as { harness: Control }).harness.render(given);
  }, next);
}

/**
 * Waits until the page's forms have shown at least `count` responses (the harness counts each summary on body[data-shown]).
 * At least, never exactly: the count can move past `count` between two of Playwright's polls, and an exact wait would then
 * never end. A test that needs exactly `count` asserts it once the page has settled.
 */
async function shownCount(page: Page, count: number): Promise<void> {
  await page.waitForFunction((n) => Number(document.body.dataset.shown ?? '0') >= n, count, { timeout: 10_000 });
}

describe.skipIf(!chromiumInstalled())('a sign-in step’s time limit in the browser', { timeout: 30_000 }, () => {
  beforeAll(async () => {
    harness = await startHarness();
  }, 60_000);

  afterAll(async () => {
    expect(harness.errors()).toEqual([]);
    await harness.close();
  });

  it('SGN-02: says the warning once and the closed state once, never each second, each with Start again', async () => {
    const page = await openStep();
    await page.clock.runFor('01:58');
    expect(await said(page)).toEqual(['']);
    await page.clock.runFor('00:04');
    await reached(page, 'warning');
    expect(await said(page)).toEqual(['', WARNING]);
    // Start again is a POST (the page's action ends the step), never a link a prefetch or another site could follow.
    expect(await page.locator(`${REGION} a`).count()).toBe(0);
    const restart = page.locator(`${REGION} form button[type="submit"]`);
    expect(await restart.textContent()).toBe('Start again');
    expect(await page.locator(`${REGION} form`).evaluate((form) => form.outerHTML)).not.toContain('@');
    expect(await page.locator(VISIBLE_PHRASE).textContent()).toBe('This step closes within a minute.');
    await page.clock.runFor('00:56');
    expect(await said(page)).toEqual(['', WARNING]);
    await page.clock.runFor('00:04');
    await reached(page, 'closed');
    expect(await said(page)).toEqual(['', WARNING, CLOSED]);
    expect(await page.locator(VISIBLE_PHRASE).textContent()).toBe('This step has closed.');
    // Polite and atomic all the while, never an alert.
    expect(await page.locator(REGION).getAttribute('role')).toBe('status');
    expect(await page.locator(REGION).getAttribute('aria-atomic')).toBe('true');
    expect(await page.locator(`${REGION} [role="alert"], ${REGION} [data-slot="alert"]`).count()).toBe(0);
    // Pressed twice in one frame, Start again runs the page's action once, says Working… beside it, outside the region,
    // and holds the second press with aria-disabled on the same button (review UXC-03).
    await restart.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await page.waitForFunction(() => (window as unknown as { harnessRestarts?: number }).harnessRestarts === 1);
    await page.locator('[data-slot="restart-pending"] [data-slot="pending-status"]', { hasText: 'Working…' }).waitFor({ state: 'attached' });
    expect(await restart.getAttribute('aria-disabled')).toBe('true');
    await restart.click({ force: true });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as unknown as { harnessRestarts?: number }).harnessRestarts)).toBe(1);
    expect(await said(page)).toEqual(['', WARNING, CLOSED]);
    await page.close();
  });

  it('SGN-02: the focus and what was typed stay, and the page does not scroll', async () => {
    const page = await openStep();
    await page.locator('#field-code').fill('123');
    await page.locator('#field-code').focus();
    const scrolled = await page.evaluate(() => window.scrollY);
    await page.clock.runFor('02:02');
    await reached(page, 'warning');
    expect(await focused(page)).toBe('field-code');
    expect(await page.inputValue('#field-code')).toBe('123');
    await page.clock.runFor('01:00');
    await reached(page, 'closed');
    expect(await focused(page)).toBe('field-code');
    expect(await page.inputValue('#field-code')).toBe('123');
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
    await page.close();
  });

  it('SGN-02: Start again comes right after the button, and the person who tabbed to it still holds it once the step has closed', async () => {
    const page = await openStep();
    await page.clock.runFor('02:02');
    await reached(page, 'warning');
    await page.locator(SUBMIT).focus();
    await page.keyboard.press('Tab');
    const button = (await page.locator(`${REGION} form button`).elementHandle()) as ElementHandle<HTMLButtonElement>;
    expect(await page.evaluate((held) => document.activeElement === held, button)).toBe(true);
    await page.clock.runFor('01:00');
    await reached(page, 'closed');
    // The same node, not a new button in its place: React kept it and changed only the words before it.
    expect(await page.evaluate((held) => document.activeElement === held && held.isConnected, button)).toBe(true);
    expect(await button.textContent()).toBe('Start again');
    await page.close();
  });

  for (const width of [1280, 390]) {
    it(`SGN-02: nothing above the region moves at ${String(width)} px, and while open the region takes no space and draws no box, yet is in the accessibility tree`, async () => {
      const page = await openStep({ width });
      const region = page.locator(REGION);
      const open = await region.evaluate((element) => {
        const style = getComputedStyle(element);
        return { height: element.getBoundingClientRect().height, border: style.borderTopWidth, margin: style.marginTop };
      });
      expect(open).toEqual({ height: 0, border: '0px', margin: '0px' });
      expect(await page.getByRole('status').and(region).count()).toBe(1);
      const before = await boxes(page);
      await page.clock.runFor('02:02');
      await reached(page, 'warning');
      expect(await boxes(page)).toEqual(before);
      // Speaking, it takes the Alert's box and its margin.
      expect(await region.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe('1px');
      expect(await region.evaluate((element) => getComputedStyle(element).marginTop)).toBe('16px');
      await page.clock.runFor('01:00');
      await reached(page, 'closed');
      expect(await boxes(page)).toEqual(before);
      expect(await page.getByRole('status').and(region).count()).toBe(1);
      await page.close();
    });
  }

  it('SGN-02: a machine that slept past zero goes straight to closed, with no warning', async () => {
    const page = await openStep();
    await page.clock.fastForward('05:00');
    await reached(page, 'closed');
    expect(await said(page)).toEqual(['', CLOSED]);
    await page.close();
  });

  it('SGN-02: a hidden tab says nothing, and says the state once it is visible again', async () => {
    const page = await openStep();
    await visibility(page, 'hidden');
    await page.clock.runFor('02:02');
    expect(await said(page)).toEqual(['']);
    expect(await page.locator(REGION).getAttribute('data-phase')).toBe('open');
    await visibility(page, 'visible');
    await reached(page, 'warning');
    expect(await said(page)).toEqual(['', WARNING]);
    await page.close();

    // Hidden past zero: only that it closed.
    const later = await openStep();
    await visibility(later, 'hidden');
    await later.clock.runFor('03:02');
    expect(await said(later)).toEqual(['']);
    await visibility(later, 'visible');
    await reached(later, 'closed');
    expect(await said(later)).toEqual(['', CLOSED]);
    await later.close();
  });

  it('SGN-02: a wall clock set back is counted by the monotonic clock; one set forward closes the step early, on purpose', async () => {
    const page = await openStep();
    const now = await page.evaluate(() => Date.now());
    await page.clock.setSystemTime(now - 10 * 60_000);
    await page.clock.runFor('01:50');
    expect(await page.locator(REGION).getAttribute('data-phase')).toBe('open');
    await page.clock.runFor('00:12');
    await reached(page, 'warning');
    expect(await said(page)).toEqual(['', WARNING]);
    await page.close();

    const forward = await openStep();
    const then = await forward.evaluate(() => Date.now());
    await forward.clock.setSystemTime(then + 150_000);
    await forward.clock.runFor('00:01');
    await reached(forward, 'warning');
    await forward.close();
  });

  it('SGN-01, SGN-02: a page rendered after its step began states the time left, then flips nothing and says nothing until the warning', async () => {
    const page = await openStep();
    // A reload a minute and a half in: the server's 90 s left, a new mount for this deadline.
    await rerender(page, { closesAt: CLOSES_AT + 50_000, closesIn: 90_000 });
    await page.waitForFunction((selector) => document.querySelector(selector)?.textContent === 'This step closes within 2 minutes.', VISIBLE_PHRASE);
    await page.clock.runFor('00:28');
    expect(await page.locator(VISIBLE_PHRASE).textContent()).toBe('This step closes within 2 minutes.');
    expect(await page.locator(REGION).getAttribute('data-phase')).toBe('open');
    expect(await said(page)).toEqual(['']);
    await page.clock.runFor('00:04');
    await reached(page, 'warning');
    expect(await said(page)).toEqual(['', WARNING]);
    await page.close();
  });

  it('SGN-02: a render in place with the same deadline keeps the count and changes nothing; a new deadline starts a new count', async () => {
    const page = await openStep();
    // The same step, rendered again in place a minute in (a refused new password's cookie rewrite): the sentence keeps
    // the step's first words and the region says nothing (review UXC-01).
    await rerender(page, { closesAt: CLOSES_AT, closesIn: 120_000 });
    await page.waitForTimeout(100);
    expect(await page.locator(VISIBLE_PHRASE).textContent()).toBe('This step stays open for 3 minutes.');
    expect(await said(page)).toEqual(['']);
    // The same step, rendered again with a staler page's 60 s more: the warning still comes at two minutes.
    await rerender(page, { closesAt: CLOSES_AT, closesIn: 240_000 });
    expect(await said(page)).toEqual(['']);
    await page.clock.runFor('02:02');
    await reached(page, 'warning');
    expect(await said(page)).toEqual(['', WARNING]);
    // A new step: open again, its warning two minutes from now.
    await rerender(page, { closesAt: CLOSES_AT + 100_000, closesIn: 180_000 });
    await reached(page, 'open');
    expect(await page.locator(REGION).textContent()).toBe('');
    await page.clock.runFor('01:50');
    expect(await page.locator(REGION).getAttribute('data-phase')).toBe('open');
    await page.clock.runFor('00:12');
    await reached(page, 'warning');
    await page.close();
  });

  it('SGN-02: with ActionForm, a refusal’s summary and focus stay its own, and Working… and the closed words are separate statuses', async () => {
    // A refusal during the warning: the summary is focused, and the region says nothing again.
    const page = await openStep();
    await page.clock.runFor('02:02');
    await reached(page, 'warning');
    await page.locator('#field-code').fill('000000');
    await script(page, { refuse: { error: 'That code did not match. Try again.' } });
    await page.locator(SUBMIT).click();
    await shownCount(page, 1);
    expect(await focused(page)).toBe('refusal-summary');
    expect(await said(page)).toEqual(['', WARNING]);
    // Settled: one refusal, one summary shown.
    expect(await page.locator('body').getAttribute('data-shown')).toBe('1');
    await page.close();

    // A refusal before the warning: the field it focused keeps the focus when the warning comes.
    const before = await openStep();
    await before.locator('#field-code').fill('12');
    await script(before, { refuse: { error: 'Fix the fields listed here, then try again.', invalid: true, issues: [{ field: 'code', message: 'six digits' }] } });
    await before.locator(SUBMIT).click();
    await shownCount(before, 1);
    expect(await focused(before)).toBe('field-code');
    expect(await before.locator('body').getAttribute('data-shown')).toBe('1');
    await before.clock.runFor('02:02');
    await reached(before, 'warning');
    expect(await focused(before)).toBe('field-code');
    await before.close();

    // A press held across zero: Working… in the form's status, the closed words in the region's.
    const held = await openStep();
    await held.locator('#field-code').fill('123456');
    await script(held, { hold: { error: 'That sign-in step closed.' } });
    await held.locator(SUBMIT).click();
    await held.locator('form:has(#field-code) [data-slot="pending-status"]', { hasText: 'Working…' }).waitFor({ state: 'attached' });
    await held.clock.runFor('03:02');
    await reached(held, 'closed');
    expect(await held.locator('form:has(#field-code) [data-slot="pending-status"]').textContent()).toBe('Working…');
    expect(await held.locator(REGION).textContent()).toBe(CLOSED);
    await held.evaluate(() => {
      (window as unknown as { harness: Control }).harness.release?.();
    });
    await held.close();
  });

  it('SGN-02: nothing animates, with reduced motion asked for or not, and in forced colours the speaking region keeps its border', async () => {
    for (const reducedMotion of ['reduce', 'no-preference'] as const) {
      const page = await openStep();
      await page.emulateMedia({ reducedMotion });
      await page.clock.runFor('02:02');
      await reached(page, 'warning');
      const moving = await page.locator(REGION).evaluate((region) =>
        [region, ...region.querySelectorAll('*')].map((element) => getComputedStyle(element)).filter((style) => style.animationName !== 'none' || style.transitionDuration.split(', ').some((duration) => duration !== '0s')).length,
      );
      expect(moving).toBe(0);
      await page.close();
    }
    const page = await openStep();
    await page.emulateMedia({ forcedColors: 'active' });
    await page.clock.runFor('02:02');
    await reached(page, 'warning');
    expect(await page.locator(REGION).evaluate((region) => ({ style: getComputedStyle(region).borderTopStyle, width: getComputedStyle(region).borderTopWidth }))).toEqual({ style: 'solid', width: '1px' });
    await page.close();
  });

  it('SGN-02: at 390 px the warning fits with no sideways scroll; at 390 by 500 px, the code field focused, the sentence’s phrase stays in view and the page does not scroll', async () => {
    const page = await openStep({ width: 390 });
    await page.setViewportSize({ width: 390, height: 500 });
    await page.locator('#field-code').focus();
    const scrolled = await page.evaluate(() => window.scrollY);
    await page.clock.runFor('02:02');
    await reached(page, 'warning');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await phraseInView(page)).toBe(true);
    expect(await page.locator(VISIBLE_PHRASE).textContent()).toBe('This step closes within a minute.');
    await page.clock.runFor('01:00');
    await reached(page, 'closed');
    expect(await phraseInView(page)).toBe(true);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
    await page.close();
  });

  it('SGN-03: the notice a person arrives at takes the focus once when nothing holds it, and never from a field they are in', async () => {
    const page = await harness.open('arrival');
    await page.locator('[data-slot="arrival-focus"]').waitFor({ state: 'attached' });
    expect(await focused(page)).toBe('arrival-focus');
    // A new arrival while the person is in the Email field: the field keeps the focus.
    await page.locator('#field-email').focus();
    await rerender(page, { closesAt: 1 });
    await page.waitForTimeout(100);
    expect(await focused(page)).toBe('field-email');
    // With the focus on the page itself, a new arrival takes it.
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await rerender(page, { closesAt: 2 });
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-slot') === 'arrival-focus');
    await page.close();
  });
});
