import type { Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { RefusalState } from './form-issues';
import { type Harness, chromiumInstalled, startHarness } from './test-support/browser';

/**
 * A refused form in a real browser (test matrix FRM-01, FRM-03, FRM-04, FRM-05 and FRM-07; docs/adr/0077), through the
 * in-repo harness (test-support/browser.ts): the real fields, the real form core (useGuardedSubmit, RefusalSummary,
 * FormIssues, PendingStatus) and the real stylesheet, with in-memory actions the test scripts. Synthetic values only.
 *
 * The harness's form is ActionForm's body as the ADR gives it; the cases that need ActionForm itself (its refresh of
 * an out-of-date page, its props) are the todos at the end, filled once the form core lands on #50's ActionForm.
 */

type Step = { readonly refuse: RefusalState } | { readonly hold: RefusalState } | { readonly drop: true } | { readonly fail: string };

interface Control {
  steps: Step[];
  calls: { readonly entries: readonly (readonly [string, string])[]; readonly passwordType: string | null }[];
  release: (() => void) | null;
  allow: boolean;
  refreshes: number;
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

/** The form's shown response number (the harness writes it as data-seq). */
async function seq(page: Page): Promise<number> {
  return Number(await page.locator('form').getAttribute('data-seq'));
}

/** Presses the button with these words and waits for the form to show the response. */
async function send(page: Page, words = 'Save'): Promise<void> {
  const before = await seq(page);
  await page.getByRole('button', { name: words, exact: true }).click();
  await page.waitForSelector(`form[data-seq="${String(before + 1)}"]`);
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
    await page.waitForSelector('form[data-seq="1"]');
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

  it('FRM-01: a page out of date after the person’s own press invites the same press again, keeping the values', async () => {
    const page = await harness.open('keep');
    await page.fill('#field-zip', '27514');
    await refusedWith(page, { error: 'This page was out of date, so nothing was saved.', stale: true });
    expect(await page.textContent(`${SUMMARY} [data-slot="alert-description"]`)).toBe('This page was out of date, so nothing was saved. It is up to date now: press “Save” again.');
    expect(await page.inputValue('#field-zip')).toBe('27514');
    expect(await focused(page)).toBe('refusal-summary');
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
    await page.waitForSelector('form[data-seq="1"]');
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
    await page.waitForSelector('form[data-seq="1"]');
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

  it.todo('FRM-01 on ActionForm itself (after #50): every case above passes with the harness form replaced by ActionForm');
  it.todo('FRM-01 (after #50): a stale state calls the router’s refresh() once (RefreshAfterRefusal), keeps every value and the summary, and its lead ends “press “Save” again.”');
  it.todo('FRM-01 (after #50): a refusal of a form with refreshOnError still notes its takeover and refreshes, as #50 does');
  it.todo('FRM-03 (after #50): ActionForm’s button is aria-disabled, never disabled, keeps its words, and PendingStatus is inside its wrapper div');
  it.todo('FRM-04 (after #50): two ActionForms on one page never mark each other’s fields (one FormIssues provider per form)');
  it.todo('(after #50) ActionForm’s beforeSubmit prop answering false sends nothing, and the split form shows its problems');
});
