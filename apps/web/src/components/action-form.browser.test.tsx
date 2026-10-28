import type { Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { RefusalState } from './form-issues';
import { type Harness, chromiumInstalled, startHarness } from './test-support/browser';

/**
 * A refused form in a real browser (test matrix FRM-01, FRM-03, FRM-04, FRM-05 and FRM-07; docs/adr/0077), through the
 * in-repo harness (test-support/browser.ts): the real ActionForm and fields (useGuardedSubmit, RefusalSummary,
 * FormIssues, PendingStatus) and the real stylesheet, with in-memory actions the test scripts and a stand-in router
 * that counts refreshes and renders the page's keys again as the test scripts them. Synthetic values only.
 */

type Step = { readonly refuse: RefusalState } | { readonly hold: RefusalState } | { readonly drop: true } | { readonly fail: string };

/** What the server renders into a form's keys (FormKeys): its request key and the opaque mark of the person signed in. */
interface PageKeys {
  readonly requestKey: string;
  readonly person: string | null;
}

interface Control {
  steps: Step[];
  calls: { readonly entries: readonly (readonly [string, string])[]; readonly passwordType: string | null }[];
  release: (() => void) | null;
  allow: boolean;
  refreshes: number;
  refreshRenders: Partial<PageKeys>[];
  render: (next: Partial<PageKeys>) => void;
}

/** #50's hand-off, as the harness page exposes it: what an explanation, or the note after a list, would take. */
interface Takeover {
  focus: (keys: readonly string[]) => boolean;
  orphaned: (prefix: string) => { readonly lines: readonly string[]; readonly kind: string } | null;
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

/** Has the next refresh render the page's keys as given (the server's answer to router.refresh). */
async function onRefresh(page: Page, next: Partial<PageKeys>): Promise<void> {
  await page.evaluate((given) => {
    (window as unknown as { harness: Control }).harness.refreshRenders.push(given);
  }, next);
}

/** Renders the page again with these keys now, as a refresh this form did not ask for does (the export status's). */
async function rerender(page: Page, next: Partial<PageKeys>): Promise<void> {
  await page.evaluate((given) => {
    (window as unknown as { harness: Control }).harness.render(given);
  }, next);
}

/** The request key each call sent, call by call. */
async function sentKeys(page: Page): Promise<readonly (string | undefined)[]> {
  return (await calls(page)).map((call) => call.entries.find(([name]) => name === 'requestKey')?.[1]);
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
/** The look of a refusal that did nothing (the destructive Alert), and of a press that saved before (the neutral one). */
const FAILURE = { role: 'alert', failure: true };
const NEUTRAL = { role: 'alert', failure: false };

/** An Alert's role, and whether it is drawn in the failure colour (the stylesheet's own classes, read as the app writes them). */
async function looks(page: Page, selector: string): Promise<{ readonly role: string | null; readonly failure: boolean }> {
  return page.locator(selector).evaluate((alert) => ({ role: alert.getAttribute('role'), failure: alert.classList.contains('text-destructive') }));
}
const TITLE = `${SUMMARY} [data-slot="alert-title"]`;
const DESCRIPTION = `${SUMMARY} [data-slot="alert-description"]`;
/** A page out of date, in the server's words (next.ts), which end in a reload: a form that reads the page again writes its own. */
const STALE: RefusalState = { error: 'This page was out of date, so nothing was saved. Reload the page and try again.', stale: true };
/** A request key used before, in the server's words (next.ts): an earlier press with it saved. */
const DUPLICATE: RefusalState = { error: 'This form was already sent, so nothing new was saved. Reload the page to see the result.', duplicate: true };
/** The page's keys as the harness first renders them, and as a refresh may render them again. */
const FIRST_KEY = 'synthetic-request-key';
const PERSON_B = 'synthetic-person-b';
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

  it('FRM-01: a dropped connection keeps everything but the secrets, says the save is not confirmed and which values to type again, and the next press is sent', async () => {
    const page = await harness.open('keep');
    await page.fill('#field-zip', '27514');
    await page.fill('#field-password', TYPED_PASSWORD);
    await page.fill('#field-code', '123 456');
    await page.fill('#raw-pin', '9999');
    await script(page, { drop: true });
    await send(page);
    expect(await page.getAttribute(SUMMARY, 'data-state')).toBe('unconfirmed');
    expect(await page.textContent(TITLE)).toBe('Not confirmed');
    // The form held a password and a code, which are emptied: the lead never says they are still here (S-A11Y-2, U-UX-3).
    expect(await page.textContent(DESCRIPTION)).toBe(
      'The connection to PaidWhole dropped before an answer came back. What you typed is still here, except passwords and codes: check your connection, type them again, then press “Save” again.',
    );
    expect(await focused(page)).toBe('refusal-summary');
    expect(await page.inputValue('#field-zip')).toBe('27514');
    for (const secret of ['#field-password', '#field-code', '#raw-pin']) {
      expect(await page.inputValue(secret)).toBe('');
    }
    await refusedWith(page, invalid(ZIP));
    expect(await calls(page)).toHaveLength(2);
    expect(await page.textContent(TITLE)).toBe('Not done');
    await page.close();

    // A form with no secret: everything is still here.
    const plain = await harness.open('submitters');
    await plain.fill('#field-title', 'SYNTHETIC title');
    await script(plain, { drop: true });
    await send(plain);
    expect(await plain.textContent(DESCRIPTION)).toBe(
      'The connection to PaidWhole dropped before an answer came back. What you typed is still here: check your connection, then press “Save” again.',
    );
    expect(await plain.inputValue('#field-title')).toBe('SYNTHETIC title');
    await plain.close();
  });

  it('FRM-01: after a dropped connection every press sends that press’s request key until one is saved, though a refresh renders a new one; before, a refresh’s key is sent (S-SEC-1)', async () => {
    const page = await harness.open('keep');
    await page.fill('#field-zip', '27514');
    // No press has dropped: a refusal, then a refresh in place, and the next press sends the key the page holds now.
    await refusedWith(page, invalid(ZIP));
    await rerender(page, { requestKey: 'synthetic-request-key-2' });
    await refusedWith(page, invalid(ZIP));
    // That press drops; the export status's refresh renders a new key; every later press still sends the dropped one.
    await script(page, { drop: true });
    await send(page);
    await rerender(page, { requestKey: 'synthetic-request-key-3' });
    expect(await page.inputValue('input[name="requestKey"]')).toBe('synthetic-request-key-3');
    // A refusal says nothing of the dropped press (the input is refused before the key is read): the key stays pinned.
    await refusedWith(page, invalid(ZIP));
    await refusedWith(page, DUPLICATE);
    await refusedWith(page, DUPLICATE);
    expect(await sentKeys(page)).toEqual([FIRST_KEY, 'synthetic-request-key-2', 'synthetic-request-key-2', 'synthetic-request-key-2', 'synthetic-request-key-2', 'synthetic-request-key-2']);
    expect(await page.inputValue('#field-zip')).toBe('27514');
    await page.close();
  });

  it('FRM-01: a request key used before is "Already sent", never "Not done", and reads nothing again, so no fresh key sits under the kept values (U-UX-4)', async () => {
    const page = await harness.open('keep');
    await page.fill('#field-zip', '27514');
    await refusedWith(page, DUPLICATE);
    expect(await page.getAttribute(SUMMARY, 'data-state')).toBe('duplicate');
    expect(await page.textContent(TITLE)).toBe('Already sent');
    expect(await page.textContent(DESCRIPTION)).toBe('This form was already sent, so nothing new was saved. Reload the page to see the result.');
    // An earlier press saved: the neutral notice, never the failure colour, still an alert that takes the focus.
    expect(await looks(page, SUMMARY)).toEqual(NEUTRAL);
    expect(await focused(page)).toBe('refusal-summary');
    expect(await refreshes(page)).toBe(0);
    // A refresh from elsewhere renders a new key: the next press still sends the used one, and is "Already sent" again.
    await rerender(page, { requestKey: 'synthetic-request-key-2' });
    await refusedWith(page, DUPLICATE);
    expect(await sentKeys(page)).toEqual([FIRST_KEY, FIRST_KEY]);
    // A refusal that did nothing is drawn as a failure again.
    await refusedWith(page, invalid(ZIP));
    expect(await looks(page, SUMMARY)).toEqual(FAILURE);
    await page.close();

    const exported = await harness.open('export');
    await script(exported, { refuse: DUPLICATE });
    await exported.getByRole('button', { name: 'Export PDF and CSV', exact: true }).click();
    await exported.waitForSelector('[data-state="duplicate"]');
    expect(await exported.textContent('[data-state="duplicate"] [data-slot="alert-title"]')).toBe('Already sent');
    expect(await looks(exported, '[data-state="duplicate"]')).toEqual(NEUTRAL);
    await exported.close();

    // The note a refused row leaves when the refresh removes it is titled and drawn as the form's summary was, and takes
    // the focus.
    const gone = await harness.open('fallback');
    const note = '[data-state="refused-row-gone"]';
    await gone.waitForSelector(note);
    expect(await gone.textContent(`${note} [data-slot="alert-title"]`)).toBe('Already sent');
    expect(await looks(gone, note)).toEqual(NEUTRAL);
    await gone.waitForFunction(() => document.activeElement?.hasAttribute('data-takes-over') === true);
    await gone.close();
  });

  it('FRM-01: the version form’s two buttons share one pinned key: a draft after a dropped save sends the save’s key (S-SEC-1)', async () => {
    const page = await harness.open('version');
    await script(page, { drop: true });
    await send(page, 'Save as a new version');
    await rerender(page, { requestKey: 'synthetic-request-key-2' });
    await refusedWith(page, DUPLICATE, 'Draft with the model');
    expect(await sentKeys(page)).toEqual([FIRST_KEY, FIRST_KEY]);
    expect(await page.textContent(TITLE)).toBe('Already sent');
    await page.close();
  });

  it('FRM-01: where no press can succeed (a locked account, an expired invitation) the password note asks for nothing; the code’s says only that it was emptied (S-A11Y-2, U-UX-3)', async () => {
    const page = await harness.open('keep');
    await page.fill('#field-password', TYPED_PASSWORD);
    await refusedWith(page, { error: 'This account is locked after ten failed attempts. A platform administrator can unlock it.', locked: true });
    expect(await page.textContent(TITLE)).toBe('Account locked');
    expect(await page.inputValue('#field-password')).toBe('');
    expect(await page.textContent('#field-password-emptied')).toBe('Emptied for your security.');
    expect(await page.textContent('#field-code-emptied')).toBe('Emptied for your security.');
    // Any other refusal asks for the password again.
    await refusedWith(page, { error: 'Too many attempts in a short time. Wait 15 minutes and try again.' });
    expect(await page.textContent('#field-password-emptied')).toBe('Emptied for your security: type it again.');
    // An expired invitation is refused before any password is checked, so it never asks for one: titled as any refusal.
    await page.fill('#field-password', TYPED_PASSWORD);
    await refusedWith(page, { error: 'This invitation has expired. Ask your organization’s administrator to send it again.', final: true });
    expect(await page.textContent(TITLE)).toBe('Not done');
    expect(await page.inputValue('#field-password')).toBe('');
    expect(await page.textContent('#field-password-emptied')).toBe('Emptied for your security.');
    expect(await page.getAttribute('#field-password', 'aria-describedby')).toContain('field-password-emptied');
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
    // The refresh renders a fresh key for the same person (signed in again in another tab, say).
    await onRefresh(page, { requestKey: 'synthetic-request-key-2' });
    await refusedWith(page, STALE);
    await page.waitForFunction(() => document.querySelector<HTMLInputElement>('input[name="requestKey"]')?.value === 'synthetic-request-key-2');
    expect(await page.textContent(DESCRIPTION)).toBe('This page was out of date, so nothing was saved. It is up to date now: press “Save” again.');
    expect(await page.inputValue('#field-zip')).toBe('27514');
    expect(await focused(page)).toBe('refusal-summary');
    // Once for the state, though strict mode mounts the refresh twice; the next refusal of another kind reads nothing again.
    await refusedWith(page, invalid(ZIP));
    expect(await refreshes(page)).toBe(1);
    expect(await page.inputValue('#field-zip')).toBe('27514');
    // Nothing dropped, so nothing is pinned: the press sends the fresh key.
    expect(await sentKeys(page)).toEqual([FIRST_KEY, 'synthetic-request-key-2']);
    await page.close();
  });

  it('FRM-01: a page out of date whose refresh shows another person clears the form, says so, and invites no press; the new person’s press sends their own key (S-SEC-2)', async () => {
    const page = await harness.open('keep');
    await page.fill('#field-zip', '27514');
    await page.fill('#field-why', 'SYNTHETIC reason');
    await page.selectOption('#field-reason', 'other');
    await page.fill('#field-password', TYPED_PASSWORD);
    await onRefresh(page, { requestKey: 'synthetic-request-key-2', person: PERSON_B });
    await refusedWith(page, STALE);
    await page.waitForSelector(`${SUMMARY}[data-state="cleared"]`);
    expect(await page.textContent(TITLE)).toBe('Form cleared');
    expect(await page.textContent(DESCRIPTION)).toBe('This page was out of date, so nothing was saved. The person signed in on this browser changed, so this form was cleared.');
    // Every field is back at what the page renders, and nothing marks or notes a field.
    expect(await page.inputValue('#field-zip')).toBe('27601');
    expect(await page.inputValue('#field-reason')).toBe('window_passed');
    expect(await page.inputValue('#field-why')).toBe('');
    expect(await page.inputValue('#field-password')).toBe('');
    expect(await page.locator('[data-slot="emptied-note"]').count()).toBe(0);
    expect(await focused(page)).toBe('refusal-summary');
    expect(await page.locator(SUMMARY).count()).toBe(1);
    await page.fill('#field-zip', '27514');
    await refusedWith(page, invalid(ZIP));
    expect(await page.textContent(TITLE)).toBe('Not done');
    expect(await sentKeys(page)).toEqual([FIRST_KEY, 'synthetic-request-key-2']);
    expect((await calls(page))[1]?.entries).not.toContainEqual(['why', 'SYNTHETIC reason']);
    await page.close();
  });

  it('FRM-01: any refresh that shows another person, or no one, clears a form that holds what was typed, and only that form; a dropped press’s key is let go (S-SEC-2)', async () => {
    const page = await harness.open('two');
    await page.fill('#first-title', 'SYNTHETIC first');
    // The export status's refresh, say: no refusal, and another person signed in.
    await rerender(page, { person: PERSON_B });
    await page.waitForSelector(`${SUMMARY}[data-state="cleared"]`);
    expect(await page.textContent(DESCRIPTION)).toBe('The person signed in on this browser changed, so this form was cleared.');
    expect(await page.inputValue('#first-title')).toBe('');
    // The untouched form shows nothing: one change is announced once.
    expect(await page.locator(SUMMARY).count()).toBe(1);
    expect(await page.evaluate((selector) => document.querySelector(selector)?.closest('form')?.contains(document.getElementById('first-title')), SUMMARY)).toBe(true);
    expect(await focused(page)).toBe('refusal-summary');
    // No one signed in now: the second form, typed in since, is cleared too.
    await page.fill('#second-title', 'SYNTHETIC second');
    await rerender(page, { person: null });
    await page.waitForFunction(() => document.querySelectorAll('[data-slot="refusal-summary"][data-state="cleared"]').length === 2);
    expect(await page.inputValue('#second-title')).toBe('');
    await page.close();

    // A dropped press, then another person: the save is not confirmed, the form is cleared, and the next press sends
    // the page's own key, not the dropped press's.
    const dropped = await harness.open('keep');
    await dropped.fill('#field-zip', '27514');
    await script(dropped, { drop: true });
    await send(dropped);
    await rerender(dropped, { requestKey: 'synthetic-request-key-2', person: PERSON_B });
    await dropped.waitForSelector(`${SUMMARY}[data-state="cleared"]`);
    expect(await dropped.textContent(DESCRIPTION)).toBe(
      'The connection to PaidWhole dropped before an answer came back, so the save is not confirmed. The person signed in on this browser changed, so this form was cleared.',
    );
    expect(await dropped.inputValue('#field-zip')).toBe('27601');
    await refusedWith(dropped, invalid(ZIP));
    expect(await sentKeys(dropped)).toEqual([FIRST_KEY, 'synthetic-request-key-2']);
    // The same person rendered again changes nothing.
    await dropped.fill('#field-zip', '27514');
    await rerender(dropped, { requestKey: 'synthetic-request-key-3' });
    expect(await dropped.inputValue('#field-zip')).toBe('27514');
    expect(await dropped.textContent(TITLE)).toBe('Not done');
    await dropped.close();
  });

  it('FRM-01: the version form clears its choices when a refresh shows another person, and the export form then invites no press (S-SEC-2)', async () => {
    const page = await harness.open('version');
    await page.selectOption('#prompt-pay-state', 'NC');
    await rerender(page, { person: PERSON_B });
    await page.waitForSelector(`${SUMMARY}[data-state="cleared"]`);
    expect(await page.inputValue('#prompt-pay-state')).toBe('');
    expect(await page.textContent(DESCRIPTION)).toBe('The person signed in on this browser changed, so this form was cleared.');
    await page.close();

    const exported = await harness.open('export');
    await onRefresh(exported, { person: PERSON_B });
    await script(exported, { refuse: STALE });
    await exported.getByRole('button', { name: 'Export PDF and CSV', exact: true }).click();
    const description = '[data-state="error"] [data-slot="alert-description"]';
    await exported.waitForFunction(
      (selector) => document.querySelector(selector)?.textContent === 'This page was out of date, so nothing was saved. Check the form, then send it again if you still mean to.',
      description,
    );
    await exported.close();
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

  it('FRM-01, FRM-03: while the version form’s other button works, the form keeps the answer it shows and the focus, never that button’s older answer; each answer is a new summary', async () => {
    const page = await harness.open('version');
    await refusedWith(page, { error: 'SYNTHETIC first refusal of the model’s draft.' }, 'Draft with the model');
    await refusedWith(page, { error: 'SYNTHETIC refusal of the save.' }, 'Save as a new version');
    expect(await page.textContent(DESCRIPTION)).toBe('SYNTHETIC refusal of the save.');
    await script(page, { hold: { error: 'SYNTHETIC second refusal of the model’s draft.' } });
    const model = page.getByRole('button', { name: 'Draft with the model', exact: true });
    await model.click();
    await page.waitForFunction(() => (window as unknown as { harness: Control }).harness.release !== null);
    expect(await page.textContent(DESCRIPTION)).toBe('SYNTHETIC refusal of the save.');
    expect(await model.evaluate((element) => element === document.activeElement)).toBe(true);
    expect(await page.locator('[data-slot="pending-status"]').allTextContents()).toEqual(['', 'Working…']);
    await page.evaluate(() => {
      (window as unknown as { harness: Control }).harness.release?.();
    });
    // The model's answer, though its action numbers it as the save's was, inserts a summary of its own.
    await shownCount(page, 3);
    expect(await page.textContent(DESCRIPTION)).toBe('SYNTHETIC second refusal of the model’s draft.');
    expect(await focused(page)).toBe('refusal-summary');
    expect(await page.locator(SUMMARY).count()).toBe(1);
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

  it('FRM-04: the summary is first, on a line of its own: a grid keeps its columns, a row wraps and a column never does', async () => {
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

    // A column form never wraps, refused or not: a wrapping column sizes its line to a select's longest option and
    // pushes a phone's page sideways (U-UX-1).
    const column = await harness.open('keep');
    await refusedWith(column, invalid(ZIP));
    expect(await column.evaluate(() => [document.querySelector('form')?.className, getComputedStyle(document.querySelector('form') as HTMLFormElement).flexWrap])).toEqual([
      'flex flex-col gap-4',
      'nowrap',
    ]);
    await column.close();
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

  it('FRM-07: in forced colours (a Windows contrast theme) a pressed Show takes the system’s highlight, so it still looks pressed (U-A11Y-3)', async () => {
    const page = await harness.open('keep');
    await page.emulateMedia({ forcedColors: 'active' });
    const show = page.getByRole('button', { name: 'Show password', exact: true });
    const look = () => show.evaluate((element) => [getComputedStyle(element).backgroundColor, getComputedStyle(element).color]);
    const highlight = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'Highlight';
      probe.style.color = 'HighlightText';
      document.body.append(probe);
      const colours = [getComputedStyle(probe).backgroundColor, getComputedStyle(probe).color];
      probe.remove();
      return colours;
    });
    const unpressed = await look();
    expect(unpressed).not.toEqual(highlight);
    await show.click();
    expect(await show.getAttribute('aria-pressed')).toBe('true');
    expect(await look()).toEqual(highlight);
    await show.click();
    expect(await look()).toEqual(unpressed);
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

  it('FRM-08: a select that cuts its choice shows it whole on a line under it, which follows a change and a reset button the person presses (U-UX-8)', async () => {
    const page = await harness.open('chosen');
    const line = '[data-slot="chosen-text"]';
    // "Q1" fits the narrow select: no line repeats it.
    expect(await page.locator(line).count()).toBe(0);
    await page.selectOption('#field-run', 'long');
    await page.waitForSelector(line);
    expect([await page.textContent(line), await page.getAttribute(line, 'aria-hidden')]).toEqual(['SYNTHETIC REMITTANCES OF THE FIRST QUARTER (release 3)', 'true']);
    // A reset button's press runs a microtask before the form's values go back, so the line is measured after them.
    await page.getByRole('button', { name: 'Start again', exact: true }).click();
    await page.waitForSelector(line, { state: 'detached' });
    expect(await page.inputValue('#field-run')).toBe('q1');
    await page.close();
  });

  it('FRM-08: the line under a select sets a SHA-256 its option gives as a mono run in Plex Mono, as the page does, and says the option’s words whole (the UX re-check’s polish)', async () => {
    const page = await harness.open('document');
    const line = '[data-slot="chosen-text"]';
    const words = 'SYNTHETIC payer letter, uploaded 2026-10-27 21:36 UTC, SHA-256 0123456789ab…';
    await page.waitForSelector(line);
    // The list holds the runs joined, and the line says the same words.
    expect(await page.locator('#field-documentId option:checked').textContent()).toBe(words);
    expect(await page.textContent(line)).toBe(words);
    const runs = await page.locator(`${line} span`).evaluateAll((spans): (readonly [string | null, string])[] => spans.map((span) => [span.textContent, span.className] as const));
    expect(runs).toEqual([['0123456789ab…', 'font-mono tabular-nums']]);
    // A choice that fits shows no line.
    await page.selectOption('#field-documentId', 'short');
    await page.waitForSelector(line, { state: 'detached' });
    await page.close();
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
    expect(await takeover.orphaned('rerun:')).toEqual({ lines: ['This run: is not the run in effect for its service dates.'], kind: 'error' });
    expect(await takeover.orphaned('rerun:')).toBeNull();
    expect(await refreshes(page)).toBe(1);

    await refusedWith(page, STALE, 'Re-run under release 900001');
    await page.waitForFunction(() => (window as unknown as { harness: Control }).harness.refreshes > 1);
    expect(await takeover.focus(['rerun:run-1'])).toBe(false);
    expect(await refreshes(page)).toBe(2);

    // A key used before reads the page again too; the note after the list titles it as the summary did.
    await refusedWith(page, DUPLICATE, 'Re-run under release 900001');
    await page.waitForFunction(() => (window as unknown as { harness: Control }).harness.refreshes > 2);
    expect(await takeover.orphaned('rerun:')).toEqual({ lines: [], kind: 'duplicate' });
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

  it('FRM-04, FRM-05: a refused hardware-key sign-in shows its problem first in the form, before the email, and focuses it (U-UX-10)', async () => {
    const page = await harness.open('hardwareKey');
    // The server's answer to the ceremony's first step: no key to ask, with the sign-in's own words.
    await page.route('**/api/sign-in/hardware-key/options', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ error: 'That did not match. Check the email, the password or the code, and try again.' }) }),
    );
    await page.fill('#key-email', 'forms-harness@synthetic.test');
    await page.getByRole('button', { name: 'Sign in with hardware key', exact: true }).click();
    await page.waitForSelector('form [role="alert"]');
    expect(await page.textContent('form [role="alert"] [data-slot="alert-title"]')).toBe('Not signed in');
    expect(await page.evaluate(() => [...document.querySelectorAll('form [role="alert"], form input, form button')].map((element) => element.getAttribute('role') ?? element.tagName))).toEqual([
      'alert',
      'INPUT',
      'BUTTON',
    ]);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role') ?? '')).toBe('alert');
    expect(await page.inputValue('#key-email')).toBe('forms-harness@synthetic.test');
    await page.close();
  });

  it('a hardware-key sign-in submitted natively, as a press before the page is live is, posts the email and never puts it in the address', async () => {
    const page = await harness.open('hardwareKey');
    await page.fill('#key-email', 'forms-harness@synthetic.test');
    await page.route(
      (url) => url.pathname.endsWith('/forms-harness.html'),
      (route) => route.abort(),
    );
    const native = page.waitForRequest((request) => request.isNavigationRequest());
    // The browser's own submission, with no submit event: what React never sees before it hydrates the form.
    await page.evaluate(() => {
      HTMLFormElement.prototype.submit.call(document.querySelector('form'));
    });
    const request = await native;
    expect([request.method(), new URL(request.url()).search, request.postData()]).toEqual(['POST', '?form=hardwareKey', 'email=forms-harness%40synthetic.test']);
    await page.close();
  });
});
