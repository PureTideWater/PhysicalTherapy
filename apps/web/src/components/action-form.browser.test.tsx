import type { Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { RefusalState } from './form-issues';
import { type Harness, chromiumInstalled, startHarness } from './test-support/browser';

/**
 * A refused form in a real browser (test matrix FRM-01, FRM-03, FRM-04, FRM-05 and FRM-07; docs/adr/0077), through the
 * in-repo harness (test-support/browser.ts): the real ActionForm and fields (useGuardedSubmit, RefusalSummary,
 * FormIssues, PendingStatus) and the real stylesheet, with in-memory actions the test scripts and a stand-in router
 * that counts refreshes. Synthetic values only.
 */

type Step = { readonly refuse: RefusalState } | { readonly hold: RefusalState } | { readonly drop: true } | { readonly fail: string };

interface Control {
  steps: Step[];
  calls: { readonly entries: readonly (readonly [string, string])[]; readonly passwordType: string | null }[];
  release: (() => void) | null;
  allow: boolean;
  refreshes: number;
}

/** #50's hand-off, as the harness page exposes it: what an explanation, or the note after a list, would take. */
interface Takeover {
  focus: (keys: readonly string[]) => boolean;
  orphaned: (prefix: string) => readonly string[] | null;
}

let harness: Harness;

/** Scripts the action's next answers. */
async function script(page: Page, ...steps: readonly Step[]): Promise<void> {
  await page.evaluate((next) => {
    (window as unknown as { harness: Control }).harness.steps.push(...next);
  }, steps);
}

/** What the action received, call by call. */
function calls(page: Page): Promise<Control['calls']> {
  return page.evaluate(() => (window as unknown as { harness: Control }).harness.calls);
}

/** How many responses the page's forms have shown (the harness counts each summary inserted, on body[data-shown]). */
async function shown(page: Page): Promise<number> {
  return Number((await page.locator('body').getAttribute('data-shown')) ?? '0');
}

/** Waits until the page's forms have shown `count` responses. */
async function shownCount(page: Page, count: number): Promise<void> {
  await page.waitForSelector(`body[data-shown="${String(count)}"]`, { state: 'attached' });
}

/** The stand-in router's refresh() calls. */
function refreshes(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { harness: Control }).harness.refreshes);
}

/** Presses the button with these words and waits for the form to show the response. */
async function send(page: Page, words = 'Save'): Promise<void> {
  const before = await shown(page);
  await page.getByRole('button', { name: words, exact: true }).click();
  await shownCount(page, before + 1);
}

/** Refuses the next press with `state`, presses, and waits for the refusal. */
async function refusedWith(page: Page, state: RefusalState, words = 'Save'): Promise<void> {
  await script(page, { refuse: state });
  await send(page, words);
}

function invalid(...issues: readonly (readonly [string, string])[]): RefusalState {
  return { error: 'Fix the fields listed here, then try again.', invalid: true, issues: issues.map(([field, message]) => ({ field, message })) };
}

const SUMMARY = '[data-slot="refusal-summary"]';
/** A page out of date, in the server's words (next.ts), which end in a reload: a form that reads the page again writes its own. */
const STALE: RefusalState = { error: 'This page was out of date, so nothing was saved. Reload the page and try again.', stale: true };
/** A synthetic password the tests type, joined from words so no scanner reads it as a stored secret. */
const TYPED_PASSWORD = ['Synthetic', 'typed', 'words', '2026'].join('-');
const ZIP = ['zip', 'five digits, or ZIP+4 such as 27601-1234'] as const;

/** The id of the focused element, or its tag when it has none. */
function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    return active === null ? '' : active.id === '' ? (active.getAttribute('data-slot') ?? active.tagName) : active.id;
  });
}

describe.skipIf(!chromiumInstalled())('a refused form in the browser', { timeout: 30_000 }, () => {
  beforeAll(async () => {
    harness = await startHarness();
  }, 60_000);

  afterAll(async () => {
    expect(harness.errors()).toEqual([]);
    await harness.close();
  });

  it('FRM-01: keeps every kind of control, empties every secret, and says so under each', async () => {
    const page = await harness.open('keep');
    await page.fill('#field-zip', '0001');
    await page.selectOption('#field-reason', 'other');
    await page.fill('#field-why', 'SYNTHETIC reason');
    await page.check('#field-confirm');
    await page.check('#group-components-1');
    await page.check('input[name="response"][value="partial"]');
    await page.fill('#field-serviceDate', '2026-09-30');
    await page.fill('#field-month', '2026-09');
    await page.getByRole('button', { name: 'Show password', exact: true }).click();
    await page.fill('#field-password', TYPED_PASSWORD);
    await page.fill('#field-code', '123 456');
    await page.fill('#raw-pin', '9999');
    await page.fill('#raw-note', 'SYNTHETIC note');
    await refusedWith(page, invalid(ZIP, ['why', 'fill this in']));

    // The refused ZIP stays as typed, never back at its default 27601.
    expect(await page.inputValue('#field-zip')).toBe('0001');
    expect(await page.inputValue('#field-reason')).toBe('other');
    expect(await page.inputValue('#field-why')).toBe('SYNTHETIC reason');
    expect(await page.isChecked('#field-confirm')).toBe(true);
    expect(await page.isChecked('#group-components-0')).toBe(false);
    expect(await page.isChecked('#group-components-1')).toBe(true);
    expect(await page.isChecked('input[name="response"][value="partial"]')).toBe(true);
    expect(await page.inputValue('#field-serviceDate')).toBe('2026-09-30');
    expect(await page.inputValue('#field-month')).toBe('2026-09');
    expect(await page.inputValue('#raw-note')).toBe('SYNTHETIC note');
    // The secrets: the password (shown when sent), the code and a hand-written password are emptied.
    expect(await page.inputValue('#field-password')).toBe('');
    expect(await page.inputValue('#field-code')).toBe('');
    expect(await page.inputValue('#raw-pin')).toBe('');
    expect(await page.textContent('#field-password-emptied')).toBe('Emptied for your security: type it again.');
    expect(await page.textContent('#field-code-emptied')).toBe('Emptied for your security.');
    expect(await page.getAttribute('#field-password', 'aria-describedby')).toBe('field-password-emptied');
    expect(await page.getAttribute('#field-code', 'aria-describedby')).toBe('field-code-emptied field-code-hint');
    // The values reached the action once, and the summary repeats none of them.
    const [call] = await calls(page);
    expect(call?.entries).toEqual(
      expect.arrayContaining([
        ['zip', '0001'],
        ['reason', 'other'],
        ['components[]', 'pricing'],
        ['response', 'partial'],
        ['code', '123 456'],
      ]),
    );
    const text = (await page.textContent(SUMMARY)) ?? '';
    for (const typed of ['0001', 'SYNTHETIC', TYPED_PASSWORD, '123 456', '9999']) {
      expect(text).not.toContain(typed);
    }
    await page.close();
  });

  it('FRM-01: sends the submitter’s name and value, and the requestKey the page holds', async () => {
    const page = await harness.open('submitters');
    await page.fill('#field-title', 'SYNTHETIC title');
    await script(page, { refuse: { error: 'Not available to your role: harness.' } });
    await page.getByRole('button', { name: 'Save as draft', exact: true }).click();
    await shownCount(page, 1);
    const [call] = await calls(page);
    expect(call?.entries).toEqual([
      ['title', 'SYNTHETIC title'],
      ['intent', 'draft'],
    ]);
    await page.close();
  });

  it('FRM-01: a dropped connection keeps everything, says the save is not confirmed, and the next press is sent', async () => {
    const page = await harness.open('keep');
    await page.fill('#field-zip', '27514');
    await script(page, { drop: true });
    await send(page);
    expect(await page.getAttribute(SUMMARY, 'data-state')).toBe('unconfirmed');
    expect(await page.textContent(`${SUMMARY} [data-slot="alert-title"]`)).toBe('Not confirmed');
    expect(await page.textContent(`${SUMMARY} [data-slot="alert-description"]`)).toBe(
      'The connection to PaidWhole dropped before an answer came back. What you typed is still here: check your connection, then press “Save” again.',
    );
    expect(await focused(page)).toBe('refusal-summary');
    expect(await page.inputValue('#field-zip')).toBe('27514');
    await refusedWith(page, invalid(ZIP));
    expect(await calls(page)).toHaveLength(2);
    expect(await page.textContent(`${SUMMARY} [data-slot="alert-title"]`)).toBe('Not done');
    await page.close();
  });

  it('FRM-01: a server failure still reaches the error boundary, with its reference', async () => {
    const page = await harness.open('keep');
    await script(page, { fail: 'synthetic-digest-1' });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForSelector('[data-boundary="synthetic-digest-1"]');
    await page.close();
  });

  it('FRM-01: a page out of date is read again once, keeps the values and the summary, and invites the person’s own press again', async () => {
    const page = await harness.open('keep');
    await page.fill('#field-zip', '27514');
    await refusedWith(page, STALE);
    await page.waitForFunction(() => (window as unknown as { harness: Control }).harness.refreshes > 0);
    expect(await page.textContent(`${SUMMARY} [data-slot="alert-description"]`)).toBe('This page was out of date, so nothing was saved. It is up to date now: press “Save” again.');
    expect(await page.inputValue('#field-zip')).toBe('27514');
    expect(await focused(page)).toBe('refusal-summary');
    // Once for the state, though strict mode mounts the refresh twice; the next refusal of another kind reads nothing again.
    await refusedWith(page, invalid(ZIP));
    expect(await refreshes(page)).toBe(1);
    expect(await page.inputValue('#field-zip')).toBe('27514');
    await page.close();
  });

  it('FRM-01: the version form reads a page out of date again, keeps its choice, and invites the person’s own press again', async () => {
    const page = await harness.open('version');
    await page.selectOption('#prompt-pay-state', 'NC');
    await refusedWith(page, STALE, 'Save as a new version');
    await page.waitForFunction(() => (window as unknown as { harness: Control }).harness.refreshes > 0);
    expect(await page.textContent(`${SUMMARY} [data-slot="alert-description"]`)).toBe(
      'This page was out of date, so nothing was saved. It is up to date now: press “Save as a new version” again.',
    );
    expect(await page.inputValue('#prompt-pay-state')).toBe('NC');
    // A refusal of another kind reads nothing again, and names the select by its label.
    await refusedWith(page, invalid(['promptPayState', 'choose one of the listed states']), 'Save as a new version');
    expect(await page.locator(`${SUMMARY} li`).allTextContents()).toEqual(['Prompt-pay state: choose one of the listed states']);
    expect(await refreshes(page)).toBe(1);
    expect(await page.inputValue('#prompt-pay-state')).toBe('NC');
    await page.close();
  });

  it('FRM-01: the export form reads a page out of date again and invites the person’s own press again, in the summary’s words', async () => {
    const page = await harness.open('export');
    const description = '[data-state="error"] [data-slot="alert-description"]';
    await script(page, { refuse: STALE });
    await page.getByRole('button', { name: 'Export PDF and CSV', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as { harness: Control }).harness.refreshes > 0);
    expect(await page.textContent(description)).toBe('This page was out of date, so nothing was saved. It is up to date now: press “Export PDF and CSV” again.');
    await script(page, { refuse: { error: 'Not available to your role: harness.' } });
    await page.getByRole('button', { name: 'Export PDF and CSV', exact: true }).click();
    await page.waitForFunction((selector) => document.querySelector(selector)?.textContent === 'Not available to your role: harness.', description);
    expect(await refreshes(page)).toBe(1);
    await page.close();
  });

  it('FRM-03: one request per press sequence; the button keeps focus, aria-disabled and its words; a status says Working…', async () => {
    const page = await harness.open('keep');
    await script(page, { hold: invalid(ZIP) });
    const button = page.getByRole('button', { name: 'Save', exact: true });
    await button.focus();
    // Two presses in one frame.
    await page.evaluate(() => {
      const save = [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].find((element) => element.textContent === 'Save');
      save?.click();
      save?.click();
    });
    await page.waitForFunction(() => (window as unknown as { harness: Control }).harness.release !== null);
    expect(await page.textContent('[data-slot="pending-status"]')).toBe('Working…');
    expect(await button.getAttribute('aria-disabled')).toBe('true');
    expect(await button.evaluate((element) => element.hasAttribute('disabled'))).toBe(false);
    expect(await button.textContent()).toBe('Save');
    expect(await button.evaluate((element) => element === document.activeElement)).toBe(true);
    // Space on the focused button, and Enter in a field, while pending: nothing more is sent.
    await page.keyboard.press('Space');
    await page.focus('#field-zip');
    await page.keyboard.press('Enter');
    expect(await calls(page)).toHaveLength(1);
    // The status sits beside the button, inside its wrapper, never a child of the form.
    expect(await page.evaluate(() => document.querySelector('[data-slot="pending-status"]')?.parentElement?.querySelector('button[type="submit"]') !== null)).toBe(true);
    expect(await page.locator('form > [data-slot="pending-status"]').count()).toBe(0);
    await page.evaluate(() => {
      (window as unknown as { harness: Control }).harness.release?.();
    });
    await shownCount(page, 1);
    expect(await page.textContent('[data-slot="pending-status"]')).toBe('');
    expect(await button.getAttribute('aria-disabled')).toBeNull();
    expect(await calls(page)).toHaveLength(1);
    await page.close();
  });

  it('FRM-04: the summary is first, on a line of its own: a grid keeps its columns and a row wraps', async () => {
    const grid = await harness.open('grid');
    const columns = () =>
      grid.evaluate(() => ['tag', 'value', 'tagNote'].map((name) => (document.getElementById(`field-${name}`)?.getBoundingClientRect().x ?? 0) - (document.querySelector('form')?.getBoundingClientRect().x ?? 0)));
    const before = await columns();
    await refusedWith(grid, invalid(['value', 'fill this in']), 'Add tag');
    expect(await columns()).toEqual(before);
    expect(await grid.evaluate((selector) => document.querySelector('form > :not(input[type="hidden"])')?.matches(selector), SUMMARY)).toBe(true);
    const widths = await grid.evaluate((selector) => [document.querySelector('form')?.clientWidth, document.querySelector(selector)?.getBoundingClientRect().width], SUMMARY);
    expect(widths[1]).toBe(widths[0]);
    await grid.close();

    const row = await harness.open('row');
    await refusedWith(row, invalid(['rowNote', 'fill this in']), 'Set');
    expect(await row.evaluate(() => getComputedStyle(document.querySelector('form') as HTMLFormElement).flexWrap)).toBe('wrap');
    const [summaryBottom, selectTop] = await row.evaluate((selector) => [document.querySelector(selector)?.getBoundingClientRect().bottom ?? 0, document.getElementById('field-status')?.getBoundingClientRect().top ?? 0], SUMMARY);
    expect(selectTop).toBeGreaterThanOrEqual(summaryBottom ?? 0);
    await row.close();
  });

  it('FRM-04: the lead counts the fields the page places; each item names its field by the label the person sees, never by its key', async () => {
    const page = await harness.open('keep');
    const lead = () => page.evaluate((selector) => document.querySelector(`${selector} [data-slot="alert-description"] > p`)?.textContent ?? null, SUMMARY);
    const items = () => page.locator(`${SUMMARY} li`).allTextContents();

    await refusedWith(page, invalid(ZIP));
    expect(await lead()).toBe('Fix the field listed here, then try again.');
    expect(await items()).toEqual(['Billing ZIP: five digits, or ZIP+4 such as 27601-1234']);

    await refusedWith(page, invalid(ZIP, ['confirm', 'tick the box first'], ['components', 'choose at least one component']));
    expect(await lead()).toBe('Fix the fields listed here, then try again.');
    expect(await items()).toEqual(['Billing ZIP: five digits, or ZIP+4 such as 27601-1234', 'Confirmation: tick the box first', 'Components affected: choose at least one component']);
    const text = (await page.textContent(SUMMARY)) ?? '';
    for (const key of ['zip', 'confirm', 'components']) {
      expect(text).not.toContain(key);
    }

    // An issue no field carries: the message alone, capitalised, no link and no lead.
    for (const key of ['pattern', 'refused', 'requestKey']) {
      await refusedWith(page, invalid([key, 'the case is below the materiality you set']));
      expect(await lead()).toBeNull();
      expect(await items()).toEqual(['The case is below the materiality you set']);
      expect(await page.locator(`${SUMMARY} li a`).count()).toBe(0);
    }
    await page.close();

    const adjustments = await harness.open('adjustments');
    await refusedWith(
      adjustments,
      invalid(['applyNcci', 'a commercial contract leaves it off'], ['kept.1', 'that item is no longer on the checklist'], ['recovered', 'enter dollars and cents']),
      'Save version',
    );
    expect(await adjustments.locator(`${SUMMARY} li`).allTextContents()).toEqual([
      // One box of a fieldset of independent booleans is named by its own label, not the legend.
      'NCCI edits: a commercial contract leaves it off',
      'Keep the items that apply: that item is no longer on the checklist',
      // "Recovered" keeps the parenthetical that says posted.
      'Recovered principal, net (posted): enter dollars and cents',
    ]);
    await adjustments.close();
  });

  it('FRM-04: each refused field shows Error: and its message, is marked with the danger border, and the next state clears every mark', async () => {
    const page = await harness.open('keep');
    await refusedWith(page, invalid(ZIP, ['note', 'fill this in']));
    expect(await page.textContent('#field-zip-error')).toBe(ZIP[1]);
    expect(await page.locator('[data-field-error]').filter({ has: page.locator('#field-zip-error') }).textContent()).toBe(`Error:${ZIP[1]}`);
    expect(await page.getAttribute('#field-zip', 'aria-invalid')).toBe('true');
    expect(await page.getAttribute('#field-zip', 'aria-describedby')).toBe('field-zip-error field-zip-hint');
    const mark = await page.evaluate(() => {
      const style = getComputedStyle(document.getElementById('field-zip') as HTMLElement);
      const probe = document.createElement('span');
      probe.style.color = 'var(--destructive)';
      document.body.append(probe);
      const danger = getComputedStyle(probe).color;
      probe.remove();
      return { width: style.borderTopWidth, color: style.borderTopColor, danger };
    });
    expect(mark.width).toBe('2px');
    expect(mark.color).toBe(mark.danger);
    // A hand-written control: marked by the fallback, described by its summary item first.
    const item = await page.locator(`${SUMMARY} li`).nth(1).getAttribute('id');
    expect(await page.getAttribute('#raw-note', 'aria-invalid')).toBe('true');
    expect(await page.getAttribute('#raw-note', 'aria-describedby')).toBe(`${item ?? ''} raw-note-hint`);

    await refusedWith(page, { error: 'Not available to your role: harness.' });
    expect(await page.getAttribute('#field-zip', 'aria-invalid')).toBeNull();
    expect(await page.getAttribute('#field-zip', 'aria-describedby')).toBe('field-zip-hint');
    expect(await page.getAttribute('#raw-note', 'aria-invalid')).toBeNull();
    expect(await page.getAttribute('#raw-note', 'aria-describedby')).toBe('raw-note-hint');
    expect(await page.locator('[data-field-error]').count()).toBe(0);
    await page.close();
  });

  it('FRM-04: the same refusal twice inserts the alert twice, so it is announced twice', async () => {
    const page = await harness.open('keep');
    await page.evaluate(() => {
      const counter = { inserted: 0 };
      Object.assign(window, { counter });
      new MutationObserver((records) => {
        for (const record of records) {
          counter.inserted += [...record.addedNodes].filter((node) => node instanceof HTMLElement && node.matches('[role="alert"]')).length;
        }
      }).observe(document.querySelector('form') as HTMLFormElement, { childList: true });
    });
    await refusedWith(page, invalid(ZIP));
    await refusedWith(page, invalid(ZIP));
    expect(await page.evaluate(() => (window as unknown as { counter: { inserted: number } }).counter.inserted)).toBe(2);
    await page.close();
  });

  it('FRM-05: one issue on a field focuses it; several, or one with no field, focus the summary; a link focuses its field', async () => {
    const page = await harness.open('keep');
    await refusedWith(page, invalid(ZIP));
    expect(await focused(page)).toBe('field-zip');
    await refusedWith(page, invalid(ZIP, ['why', 'fill this in']));
    expect(await focused(page)).toBe('refusal-summary');
    await refusedWith(page, invalid(['pattern', 'the case is below the materiality you set']));
    expect(await focused(page)).toBe('refusal-summary');
    await refusedWith(page, { error: 'Too many attempts in a short time. Wait 15 minutes and try again.' });
    expect(await focused(page)).toBe('refusal-summary');

    await refusedWith(page, invalid(ZIP, ['why', 'fill this in']));
    await page.locator(`${SUMMARY} a`, { hasText: 'Why:' }).click();
    expect(await focused(page)).toBe('field-why');
    expect(await page.evaluate(() => window.location.hash)).toBe('');
    await page.close();
  });

  it('FRM-05: a field focused near the top ends below the sticky header', async () => {
    const page = await harness.open('header');
    // First day sits under the 56 px header, still in the viewport; Last day is where the person presses Enter.
    await page.evaluate(() => {
      const top = document.getElementById('field-firstDay')?.getBoundingClientRect().top ?? 0;
      window.scrollBy(0, top - 20);
    });
    expect(await page.evaluate(() => document.getElementById('field-firstDay')?.getBoundingClientRect().top)).toBeLessThan(56);
    await script(page, { refuse: invalid(['firstDay', 'enter a date']) });
    await page.focus('#field-lastDay');
    await page.keyboard.press('Enter');
    await shownCount(page, 1);
    expect(await focused(page)).toBe('field-firstDay');
    const [top, header] = await page.evaluate(() => [
      document.getElementById('field-firstDay')?.getBoundingClientRect().top ?? 0,
      document.querySelector('[data-slot="app-header"]')?.getBoundingClientRect().bottom ?? 0,
    ]);
    expect(top).toBeGreaterThanOrEqual(header ?? 0);
    await page.close();
  });

  it('FRM-04, FRM-05: a refused checkbox group shows its message inside the fieldset, is marked, and its first box takes the focus', async () => {
    const page = await harness.open('keep');
    await refusedWith(page, invalid(['components', 'choose at least one component']));
    const group = page.getByRole('group', { name: 'Components affected' });
    expect(await group.getAttribute('data-invalid')).toBe('');
    expect(await group.getAttribute('aria-describedby')).toBe('group-components-error');
    expect(await group.locator('legend + [data-field-error]').textContent()).toBe('Error:choose at least one component');
    expect(await focused(page)).toBe('group-components-0');
    expect(await page.getAttribute('#group-components-0', 'aria-invalid')).toBeNull();
    await page.close();
  });

  it('FRM-04, FRM-05: a list confirmed item by item takes a box’s own refusal into its group, names it by the legend, and focuses that box', async () => {
    const page = await harness.open('adjustments');
    await refusedWith(page, invalid(['confirm_gaps', 'confirm this item']), 'Save version');
    expect(await page.locator(`${SUMMARY} li`).allTextContents()).toEqual(['Confirm each item before you attest: confirm this item']);
    const group = page.getByRole('group', { name: 'Confirm each item before you attest' });
    expect(await group.getAttribute('data-invalid')).toBe('');
    expect(await group.getAttribute('aria-describedby')).toBe('group-confirm-error');
    expect(await group.locator('legend + [data-field-error]').textContent()).toBe('Error:confirm this item');
    expect(await focused(page)).toBe('group-confirm-1');
    await page.close();
  });

  it('a beforeSubmit that answers false sends nothing (the split form)', async () => {
    const page = await harness.open('split');
    await page.evaluate(() => {
      (window as unknown as { harness: Control }).harness.allow = false;
    });
    await page.getByRole('button', { name: 'Approve this split', exact: true }).click();
    expect(await calls(page)).toHaveLength(0);
    await page.evaluate(() => {
      (window as unknown as { harness: Control }).harness.allow = true;
    });
    // A server issue on the hidden settings is placed on the field that declares it.
    await refusedWith(page, invalid(['settings', 'list at least one place of service']), 'Approve this split');
    expect(await calls(page)).toHaveLength(1);
    expect(await page.locator(`${SUMMARY} li`).allTextContents()).toEqual(['Facility places of service: list at least one place of service']);
    expect(await focused(page)).toBe('field-facility');
    await page.close();
  });

  it('FRM-07: Show reveals and hides the password, with no spelling service, and a submit hides it before the data is read', async () => {
    const page = await harness.open('keep');
    const show = page.getByRole('button', { name: 'Show password', exact: true });
    expect(await show.isVisible()).toBe(true);
    for (const pressed of ['false', 'true']) {
      expect(await show.getAttribute('aria-pressed')).toBe(pressed);
      expect(await page.getAttribute('#field-password', 'type')).toBe(pressed === 'true' ? 'text' : 'password');
      expect(await page.getAttribute('#field-password', 'spellcheck')).toBe('false');
      expect(await page.getAttribute('#field-password', 'autocorrect')).toBe('off');
      expect(await page.getAttribute('#field-password', 'autocapitalize')).toBe('none');
      if (pressed === 'false') {
        await show.click();
      }
    }
    await page.fill('#field-password', TYPED_PASSWORD);
    await refusedWith(page, invalid(['password', 'it still needs a symbol']));
    const [call] = await calls(page);
    expect(call?.passwordType).toBe('password');
    expect(call?.entries).toContainEqual(['password', TYPED_PASSWORD]);
    expect(await show.getAttribute('aria-pressed')).toBe('false');
    expect(await page.getAttribute('#field-password', 'type')).toBe('password');
    expect(await page.inputValue('#field-password')).toBe('');
    expect(await focused(page)).toBe('field-password');
    await page.close();
  });

  it('FRM-08: below the md breakpoint controls are at least 16 px; at 1280 px an input keeps its 14 px', async () => {
    const sizes = (page: Page) =>
      page.evaluate(() => ['#field-zip', '#field-reason', '#field-why', '#raw-note'].map((selector) => Number.parseFloat(getComputedStyle(document.querySelector(selector) as HTMLElement).fontSize)));
    const phone = await harness.open('keep', { width: 390 });
    for (const size of await sizes(phone)) {
      expect(size).toBeGreaterThanOrEqual(16);
    }
    await phone.close();
    const desk = await harness.open('keep');
    expect((await sizes(desk))[0]).toBe(14);
    await desk.close();
  });

  it('FRM-04: an issue on a hidden field reads after the name the field gives itself, with no lead and no link, and the summary takes the focus (#50)', async () => {
    const page = await harness.open('rerun');
    await page.fill('#field-note', 'SYNTHETIC note');
    await refusedWith(page, invalid(['runId', 'is not the run in effect for its service dates.']), 'Re-run under release 900001');
    expect(await page.locator(`${SUMMARY} li`).allTextContents()).toEqual(['This run: is not the run in effect for its service dates.']);
    expect(await page.locator(`${SUMMARY} li a`).count()).toBe(0);
    expect(await page.locator(`${SUMMARY} [data-slot="alert-description"] > p`).count()).toBe(0);
    expect(await focused(page)).toBe('refusal-summary');
    expect(await page.inputValue('#field-note')).toBe('SYNTHETIC note');
    // A hidden field marks nothing, and a field the form places still leads: one placed, the singular.
    await refusedWith(page, invalid(['releaseNo', 'is not the release in force; reload the page.'], ['note', 'fill this in']), 'Re-run under release 900001');
    expect(await page.locator(`${SUMMARY} li`).allTextContents()).toEqual(['Rule release: is not the release in force; reload the page.', 'Note: fill this in']);
    expect(await page.locator(`${SUMMARY} [data-slot="alert-description"] > p`).textContent()).toBe('Fix the field listed here, then try again.');
    expect(await page.locator('input[type="hidden"][aria-invalid]').count()).toBe(0);
    await page.close();
  });

  it('FRM-01: a form with refreshOnError notes its refusal, as the summary names it, then reads the page again (#50); a page out of date notes none', async () => {
    const page = await harness.open('rerun');
    const takeover = {
      focus: (keys: readonly string[]) => page.evaluate((given) => (window as unknown as { takeover: Takeover }).takeover.focus(given), keys),
      orphaned: (prefix: string) => page.evaluate((given) => (window as unknown as { takeover: Takeover }).takeover.orphaned(given), prefix),
    };
    await refusedWith(page, invalid(['runId', 'is not the run in effect for its service dates.']), 'Re-run under release 900001');
    await page.waitForFunction(() => (window as unknown as { harness: Control }).harness.refreshes > 0);
    // Its row left the list on the refresh: the note after the list takes the refusal as the person read it, once.
    expect(await takeover.orphaned('rerun:')).toEqual(['This run: is not the run in effect for its service dates.']);
    expect(await takeover.orphaned('rerun:')).toBeNull();
    expect(await refreshes(page)).toBe(1);

    await refusedWith(page, STALE, 'Re-run under release 900001');
    await page.waitForFunction(() => (window as unknown as { harness: Control }).harness.refreshes > 1);
    expect(await takeover.focus(['rerun:run-1'])).toBe(false);
    expect(await refreshes(page)).toBe(2);
    await page.close();
  });

  it('FRM-03: a long button label wraps, the button is never disabled, and after the response the next press is sent', async () => {
    const page = await harness.open('rerun', { width: 320 });
    const button = page.getByRole('button', { name: 'Re-run under release 900001', exact: true });
    expect(await button.getAttribute('class')).toContain('whitespace-normal');
    await script(page, { hold: { error: 'Not available to your role: harness.' } });
    await button.press('Enter');
    await page.waitForFunction(() => (window as unknown as { harness: Control }).harness.release !== null);
    expect(await button.getAttribute('aria-disabled')).toBe('true');
    expect(await button.evaluate((element) => element.hasAttribute('disabled'))).toBe(false);
    await page.evaluate(() => {
      (window as unknown as { harness: Control }).harness.release?.();
    });
    await shownCount(page, 1);
    expect(await button.getAttribute('aria-disabled')).toBeNull();
    await refusedWith(page, { error: 'Not available to your role: harness.' }, 'Re-run under release 900001');
    expect(await calls(page)).toHaveLength(2);
    await page.close();
  });

  it('FRM-04: two forms on one page never mark each other’s fields: each has its own refusal', async () => {
    const page = await harness.open('two');
    await page.fill('#first-title', 'SYNTHETIC first');
    await page.fill('#second-title', 'SYNTHETIC second');
    await refusedWith(page, invalid(['title', 'fill this in']), 'Save second');
    expect(await page.getAttribute('#second-title', 'aria-invalid')).toBe('true');
    expect(await page.getAttribute('#first-title', 'aria-invalid')).toBeNull();
    expect(await page.locator('#first-title-error').count()).toBe(0);
    expect(await page.locator(SUMMARY).count()).toBe(1);
    expect(await page.evaluate((selector) => document.querySelector(selector)?.closest('form')?.contains(document.getElementById('second-title')), SUMMARY)).toBe(true);
    expect(await focused(page)).toBe('second-title');
    expect([await page.inputValue('#first-title'), await page.inputValue('#second-title')]).toEqual(['SYNTHETIC first', 'SYNTHETIC second']);
    await page.close();
  });

  it('the split form shows its own problems and sends nothing while it has any, then sends the built split; a server issue on it names its field', async () => {
    const page = await harness.open('screening');
    const press = () => page.getByRole('button', { name: 'Approve this split', exact: true }).click();
    // Both lists empty: the press shows what is missing, focuses the facility list, and sends nothing.
    await press();
    expect(await page.locator('#split-problems li').allTextContents()).toEqual(['List at least one place of service.']);
    expect(await focused(page)).toBe('split-facility');
    expect(await page.getAttribute('#split-facility', 'aria-invalid')).toBe('true');
    await page.fill('#split-facility', '11 22');
    await page.fill('#split-non-facility', '11');
    await press();
    expect(await page.locator('#split-problems li').allTextContents()).toEqual(['Place of service 11 is listed as both facility and non-facility.']);
    expect(await calls(page)).toHaveLength(0);

    await page.fill('#split-non-facility', '02');
    await script(page, { refuse: invalid(['settings', 'list at least one place of service']) });
    await press();
    await shownCount(page, 1);
    const [call] = await calls(page);
    expect(call?.entries).toContainEqual(['settings', JSON.stringify({ '02': 'non_facility', '11': 'facility', '22': 'facility' })]);
    expect(await page.locator(`${SUMMARY} li`).allTextContents()).toEqual(['Facility places of service: list at least one place of service']);
    expect(await focused(page)).toBe('split-facility');
    expect([await page.inputValue('#split-facility'), await page.inputValue('#split-non-facility')]).toEqual(['11 22', '02']);
    await page.close();
  });
});
