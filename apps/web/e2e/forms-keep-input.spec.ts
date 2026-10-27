import { type Locator, type Page, expect, test } from '@playwright/test';

import { personaEmail, personaPassword, personaTotpCode } from '../scripts/synthetic-personas';
import { atPhoneWidth, expectAccessible } from './a11y';
import { enterPassword, practiceId, registerKeyAndSignIn, signInWithTotp } from './helpers';

/**
 * Forms keep what the person typed, and name the refused field (docs/adr/0077; test matrix FRM-01 to FRM-08): the public
 * audit request refused with and without JavaScript, measured and scanned at a phone's width and a desktop's; the sign-in
 * steps refused for a wrong password, a wrong code and a weak or mismatched new password; a practice's ROI form refused
 * while its post is held, so the pending button and its status can be read, then saved on another page; the support
 * form through a dropped connection, a page out of date, a refusal and a save to the same page, then a save whose answer
 * is lost and a page read again after someone else signs in from another tab; and the console's
 * incident form refused for its checkbox group, then saved to the same address (and resolved again, so the public status
 * page reads as before), and that page at a phone's width with a component's row refused. Each signed-in test is its
 * own synthetic persona's (refusals count toward the ten-failure lock, and specs run in parallel), and nothing a refusal
 * sends is written. Synthetic data only.
 */

/** The refusal summary of a form: the first thing in it, before its fields (docs/adr/0077, D3). */
function summaryOf(form: Locator): Locator {
  return form.locator('[data-slot="refusal-summary"]');
}

/** The form whose submit button reads `submit`. */
function formWith(page: Page, submit: string): Locator {
  return page.locator('form').filter({ has: page.getByRole('button', { name: submit, exact: true }) });
}

/** A control's computed font size, in pixels. */
function fontSize(control: Locator): Promise<number> {
  return control.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
}

/** Two animation frames: long enough for a press to have sent its request, if it sent one. */
async function frames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

/** Counts the server-action posts the page sends (the ones carrying Next's `next-action` header). */
function countActionPosts(page: Page): { readonly count: () => number; readonly reset: () => void } {
  let posts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.headers()['next-action'] !== undefined) {
      posts += 1;
    }
  });
  return {
    count: () => posts,
    reset: () => {
      posts = 0;
    },
  };
}

/**
 * Holds the next server-action post to `pathname` until `release` is called, so a test can read the form while it is
 * working (a refusal comes back in tens of milliseconds on a local server).
 */
async function holdNextPost(page: Page, pathname: string): Promise<{ readonly release: () => void; readonly done: () => Promise<void> }> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const matches = (url: URL) => url.pathname === pathname;
  await page.route(matches, async (route) => {
    if (route.request().method() === 'POST') {
      await released;
    }
    await route.continue();
  });
  return { release: () => release(), done: () => page.unroute(matches) };
}

/** A six-digit code the persona's authenticator shows at none of the steps around now. */
function wrongCode(key: string): string {
  const now = Date.now();
  const valid = new Set([-60_000, -30_000, 0, 30_000, 60_000].map((offset) => personaTotpCode(key, new Date(now + offset))));
  for (let candidate = 0; ; candidate += 1) {
    const code = String(candidate).padStart(6, '0');
    if (!valid.has(code)) {
      return code;
    }
  }
}

/** The danger token's color, as the browser computes it, and a control's top border. */
function borderAndDanger(control: Locator): Promise<{ readonly width: string; readonly color: string; readonly danger: string }> {
  return control.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--destructive)';
    document.body.append(probe);
    const danger = getComputedStyle(probe).color;
    probe.remove();
    const style = getComputedStyle(element);
    return { width: style.borderTopWidth, color: style.borderTopColor, danger };
  });
}

const ORGANIZATION_REFUSED =
  'this form takes no patient information: remove anything that looks like an identifier, a date or a phone number, then send it again';

/** The audit request's fields, filled with synthetic values; Organization holds a date's shape, which the form refuses. */
async function fillAuditRequest(page: Page, organization: string): Promise<void> {
  await page.getByLabel('Your name', { exact: true }).fill('Synthetic Contact');
  await page.getByLabel('Work email', { exact: true }).fill('forms-contact@synthetic.test');
  await page.getByLabel('Organization', { exact: true }).fill(organization);
  await page.getByLabel('Locations', { exact: true }).fill('3');
  await page.getByLabel('Payers you bill', { exact: true }).fill('Synthetic Payer One\nSynthetic Payer Two');
  await page.getByLabel('How you bill', { exact: true }).selectOption('billing_firm');
  await page.getByLabel('How did you hear about us?', { exact: true }).selectOption('colleague');
  await page.getByLabel('Referring billing firm', { exact: true }).fill('SYNTHETIC BILLING FIRM');
}

test('a refused audit request keeps what was typed, names the field by its label, and reads well at a phone’s width; without JavaScript it still posts once and shows each message (FRM-01, FRM-04, FRM-05, FRM-06, FRM-08)', async ({ page, browser }) => {
  const form = formWith(page, 'Send request');

  await test.step('refused, every field keeps its value and Organization is named, marked and focused (FRM-01, FRM-04, FRM-05)', async () => {
    await page.goto('/request-audit');
    await fillAuditRequest(page, 'SYNTHETIC CLINIC 2026-01-01');
    await page.getByRole('button', { name: 'Send request' }).click();
    const summary = summaryOf(form);
    await expect(summary).toContainText('Not done');
    await expect(summary).toContainText('Fix the field listed here, then try again.');
    await expect(summary).toContainText(`Organization: ${ORGANIZATION_REFUSED}`);
    // The summary comes first in the form, before its fields (the framework's own hidden inputs aside).
    await expect(form.locator(':scope > :not(input[type="hidden"])').first()).toHaveAttribute('data-slot', 'refusal-summary');
    await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Synthetic Contact');
    await expect(page.getByLabel('Work email', { exact: true })).toHaveValue('forms-contact@synthetic.test');
    await expect(page.getByLabel('Organization', { exact: true })).toHaveValue('SYNTHETIC CLINIC 2026-01-01');
    await expect(page.getByLabel('Locations', { exact: true })).toHaveValue('3');
    await expect(page.getByLabel('Payers you bill', { exact: true })).toHaveValue('Synthetic Payer One\nSynthetic Payer Two');
    await expect(page.getByLabel('How you bill', { exact: true })).toHaveValue('billing_firm');
    await expect(page.getByLabel('How did you hear about us?', { exact: true })).toHaveValue('colleague');
    await expect(page.getByLabel('Referring billing firm', { exact: true })).toHaveValue('SYNTHETIC BILLING FIRM');
    // No route key reaches the words a person reads (the name= attributes are in the markup, so the text is read).
    const text = await page.locator('main').innerText();
    for (const key of ['contactName', 'contactEmail', 'organizationName', 'billingArrangement', 'heardFrom', 'referringFirm']) {
      expect(text, key).not.toContain(key);
    }
    // One issue on a field: that field is focused, invalid, and its own line says "Error:" beside the message alone.
    const organization = page.getByLabel('Organization', { exact: true });
    await expect(organization).toBeFocused();
    await expect(organization).toHaveAttribute('aria-invalid', 'true');
    const id = (await organization.getAttribute('id')) ?? '';
    await expect(page.locator(`[id="${id}-error"]`)).toHaveText(ORGANIZATION_REFUSED);
    await expect(page.locator('[data-field-error]').filter({ has: page.locator(`[id="${id}-error"]`) })).toContainText('Error:');
    // The summary's item is a link to its field, which leaves the address as it is.
    await page.getByLabel('Your name', { exact: true }).focus();
    const before = page.url();
    await summary.getByRole('link', { name: /^Organization:/ }).click();
    await expect(organization).toBeFocused();
    expect(page.url()).toBe(before);
  });

  await test.step('the refused form passes axe at a desktop’s width and a phone’s, and its controls are 16 px below md and 14 px above (FRM-08)', async () => {
    await expectAccessible(page, 'Request an audit, refused');
    await atPhoneWidth(page, 'Request an audit, refused');
    const controls = [page.getByLabel('Organization', { exact: true }), page.getByLabel('How you bill', { exact: true }), page.getByLabel('Payers you bill', { exact: true })];
    await page.setViewportSize({ width: 390, height: 844 });
    for (const control of controls) {
      expect(await fontSize(control)).toBeGreaterThanOrEqual(16);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    for (const control of controls) {
      expect(await fontSize(control)).toBe(14);
    }
  });

  await test.step('without JavaScript the post reaches the action once, each refused field shows its message, no key shows, and a success shows its notice (FRM-06)', async () => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const plain = await context.newPage();
      let posts = 0;
      plain.on('request', (request) => {
        if (request.method() === 'POST') {
          posts += 1;
        }
      });
      await plain.goto('/request-audit');
      await fillAuditRequest(plain, 'SYNTHETIC CLINIC 2026-01-01');
      await plain.getByRole('button', { name: 'Send request' }).click();
      const plainForm = formWith(plain, 'Send request');
      const summary = summaryOf(plainForm);
      await expect(summary).toContainText('Not done');
      await expect(summary).toContainText(/this form takes no patient information/i);
      await expect(summary).not.toContainText('organizationName');
      const organization = plain.getByLabel('Organization', { exact: true });
      const id = (await organization.getAttribute('id')) ?? '';
      await expect(plain.locator(`[id="${id}-error"]`)).toHaveText(ORGANIZATION_REFUSED);
      expect(posts).toBe(1);
      // Accepted (docs/adr/0077, Not covered): with nothing echoed from the server, the fields come back empty.
      await expect(organization).toHaveValue('');
      // A name with no digits, which the screen always accepts: digits from a clock or a random tag can take an
      // identifier's or a date's shape (textPhiFindings), and the success would never come. Nothing reads it back.
      await fillAuditRequest(plain, 'SYNTHETIC FORMS CLINIC');
      await plain.getByRole('button', { name: 'Send request' }).click();
      await expect(plain.getByText('Request received')).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test('sign-in refusals keep the email, empty and say so for the password and the code, name the code, and take a code written with a space (FRM-01, FRM-05, FRM-07)', async ({ page }) => {
  const key = 'forms-signin';
  const form = formWith(page, 'Continue');

  await test.step('a wrong password keeps the email, empties the password, marks no field and focuses the summary', async () => {
    await enterPassword(page, key, 'Wrong-Synthetic-Pass-2026!');
    const summary = summaryOf(form);
    await expect(summary).toContainText('That did not match. Check the email, the password or the code, and try again.');
    await expect(summary).toBeFocused();
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(personaEmail(key));
    const password = page.getByLabel('Password', { exact: true });
    await expect(password).toHaveValue('');
    await expect(password).toHaveAccessibleDescription(/Emptied for your security: type it again\./);
    await expect(form.locator('[aria-invalid="true"]')).toHaveCount(0);
  });

  await test.step('a wrong code is emptied, marked and focused under "That did not match."', async () => {
    await page.getByLabel('Password', { exact: true }).fill(personaPassword(key));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/sign-in\/mfa$/);
    const code = page.getByLabel('Six-digit code', { exact: true });
    await code.fill(wrongCode(key));
    await page.getByRole('button', { name: 'Sign in' }).click();
    const summary = summaryOf(formWith(page, 'Sign in'));
    await expect(summary).toContainText('That did not match.');
    await expect(summary).toContainText('Six-digit code: enter the code your authenticator app shows now');
    await expect(code).toHaveValue('');
    await expect(code).toHaveAttribute('aria-invalid', 'true');
    await expect(code).toBeFocused();
    await expect(code).toHaveAccessibleDescription(/Emptied for your security\./);
  });

  await test.step('the right code, written "123 456" as an authenticator app copies it, signs in', async () => {
    const right = personaTotpCode(key);
    await page.getByLabel('Six-digit code', { exact: true }).fill(`${right.slice(0, 3)} ${right.slice(3)}`);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
  });
});

test('choosing a password: the policy is the field’s hint, Show reveals and hides it and looks pressed while it shows, and a weak or mismatched password is refused on its own field (FRM-07)', async ({ page }) => {
  const key = 'forms-invited';
  await enterPassword(page, key);
  await expect(page).toHaveURL(/\/sign-in\/new-password$/);
  const fresh = page.getByLabel('New password', { exact: true });
  const again = page.getByLabel('New password again', { exact: true });
  const summary = summaryOf(formWith(page, 'Save password'));

  await test.step('the policy describes the field, and Show reveals and hides it, named by its words, with no spelling service', async () => {
    await expect(fresh).toHaveAccessibleDescription('At least 12 characters, with a lowercase letter, an uppercase letter, a digit and a symbol.');
    // Exact: "Show new password" is also the start of "Show new password again".
    const show = page.getByRole('button', { name: 'Show new password', exact: true });
    // Pressed, the toggle looks pressed, with the same words: an Ink rule (the text's color) in place of the quiet one.
    const rule = () => show.evaluate((button) => getComputedStyle(button).borderTopColor);
    const ink = await page.evaluate(() => getComputedStyle(document.body).color);
    const quiet = await rule();
    expect(quiet).not.toBe(ink);
    await expect(show).toHaveAttribute('aria-pressed', 'false');
    await expect(fresh).toHaveAttribute('type', 'password');
    await show.click();
    await expect(show).toHaveAttribute('aria-pressed', 'true');
    await expect(fresh).toHaveAttribute('type', 'text');
    await expect.poll(rule).toBe(ink);
    for (const [attribute, value] of [
      ['spellcheck', 'false'],
      ['autocorrect', 'off'],
      ['autocapitalize', 'none'],
    ] as const) {
      await expect(fresh, attribute).toHaveAttribute(attribute, value);
    }
    await show.click();
    await expect(show).toHaveAttribute('aria-pressed', 'false');
    await expect(fresh).toHaveAttribute('type', 'password');
    await expect.poll(rule).toBe(quiet);
  });

  await test.step('a weak password, sent while shown, is hidden again, emptied, and refused on New password', async () => {
    const show = page.getByRole('button', { name: 'Show new password', exact: true });
    await show.click();
    await fresh.fill('syntheticpassword');
    await again.fill('syntheticpassword');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(summary).toContainText('Choose a stronger password.');
    await expect(summary).toContainText('New password: it still needs an uppercase letter, a digit and a symbol');
    await expect(show).toHaveAttribute('aria-pressed', 'false');
    await expect(fresh).toHaveAttribute('type', 'password');
    await expect(fresh).toHaveValue('');
    await expect(again).toHaveValue('');
    await expect(fresh).toHaveAttribute('aria-invalid', 'true');
    await expect(fresh).toBeFocused();
  });

  await test.step('two strong passwords that differ are refused on New password again', async () => {
    await fresh.fill('Synthetic-Forms-Pass-2026!');
    await again.fill('Synthetic-Forms-Pass-2027!');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(summary).toContainText('New password again: the two passwords do not match: type the same password in both fields');
    await expect(again).toHaveAttribute('aria-invalid', 'true');
    await expect(again).toBeFocused();
    await expect(page).toHaveURL(/\/sign-in\/new-password$/);
  });
});

test('a practice’s ROI form keeps the typed period, keeps its button focused and says it is working while its post is held, sends one request per press, and starts fresh after a save that moved to another page (FRM-01, FRM-02, FRM-03, FRM-04, FRM-08)', async ({ page }) => {
  await signInWithTotp(page, 'forms-manager');
  const practice = await practiceId('other');
  const pathname = `/p/${practice}/reports/roi`;
  await page.goto(pathname);
  const form = formWith(page, 'Generate the statement');
  const firstDay = form.getByLabel('First day', { exact: true });
  const lastDay = form.getByLabel('Last day', { exact: true });
  const generate = form.getByRole('button', { name: 'Generate the statement' });
  const status = form.locator('[data-slot="pending-status"]');
  const posts = countActionPosts(page);
  // The period the page suggests, which the form shows before anything is typed.
  const suggested = { from: await firstDay.inputValue(), to: await lastDay.inputValue() };

  await test.step('pressed with Space while its post is held, the button keeps focus and its words, is aria-disabled, and a second Space sends nothing (FRM-03)', async () => {
    await firstDay.fill('2026-09-30');
    await lastDay.fill('2026-04-01');
    await expect(status).toHaveText('');
    const held = await holdNextPost(page, pathname);
    try {
      await generate.focus();
      await page.keyboard.press('Space');
      await expect(status).toHaveText('Working…');
      await expect(generate).toBeFocused();
      await expect(generate).toHaveAttribute('aria-disabled', 'true');
      await expect(generate).toHaveText('Generate the statement');
      await page.keyboard.press('Space');
      await frames(page);
      expect(posts.count()).toBe(1);
      held.release();
      await expect(summaryOf(form)).toContainText('Last day: the period ends on or after its first day');
      await expect(status).toHaveText('');
      expect(posts.count()).toBe(1);
    } finally {
      await held.done();
    }
  });

  await test.step('refused, both dates are the ones typed, not the suggested quarter; Last day is marked with the danger color’s 2 px border and focused (FRM-01, FRM-04)', async () => {
    await expect(firstDay).toHaveValue('2026-09-30');
    await expect(lastDay).toHaveValue('2026-04-01');
    await expect(lastDay).toHaveAttribute('aria-invalid', 'true');
    await expect(lastDay).toBeFocused();
    const mark = await borderAndDanger(lastDay);
    expect(mark.width).toBe('2px');
    expect(mark.color).toBe(mark.danger);
  });

  await test.step('at 390 px, Enter twice in First day while the post is held sends one request, and the field focused after the refusal is below the sticky header (FRM-03, FRM-05)', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    posts.reset();
    const held = await holdNextPost(page, pathname);
    try {
      await firstDay.focus();
      await page.keyboard.press('Enter');
      await expect(status).toHaveText('Working…');
      await page.keyboard.press('Enter');
      await frames(page);
      expect(posts.count()).toBe(1);
      held.release();
      await expect(lastDay).toBeFocused();
      await expect(status).toHaveText('');
      expect(posts.count()).toBe(1);
    } finally {
      await held.done();
    }
    const header = await page.locator('[data-slot="app-header"]').boundingBox();
    const field = await lastDay.boundingBox();
    expect(header).not.toBeNull();
    expect(field).not.toBeNull();
    expect(field?.y ?? 0).toBeGreaterThanOrEqual((header?.y ?? 0) + (header?.height ?? 0));
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  await test.step('the refused practice form passes axe at both widths (FRM-08)', async () => {
    await expectAccessible(page, 'ROI statements, refused');
    await atPhoneWidth(page, 'ROI statements, refused');
  });

  await test.step('corrected, the statement is generated on another page; back on the list, the form shows its suggested period, no refusal and a new request key (FRM-02)', async () => {
    await firstDay.fill(suggested.from);
    await lastDay.fill(suggested.to);
    const keyBefore = await form.locator('input[name="requestKey"]').inputValue();
    await generate.click();
    await expect(page).toHaveURL(new RegExp(`${pathname}/[0-9a-f-]{36}$`));
    await page.getByRole('link', { name: 'ROI statements', exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`${pathname}$`));
    await expect(summaryOf(form)).toHaveCount(0);
    await expect(firstDay).toHaveValue(suggested.from);
    await expect(lastDay).toHaveValue(suggested.to);
    await expect(firstDay).not.toHaveAttribute('aria-invalid', 'true');
    await expect(lastDay).not.toHaveAttribute('aria-invalid', 'true');
    await expect(form.locator('input[name="requestKey"]')).not.toHaveValue(keyBefore);
  });
});

test('the support form keeps what was typed through a dropped connection, a page out of date and a refusal, and starts fresh once the ticket is saved; a press whose answer was lost is never saved twice, and a page read again under another person clears the form (FRM-01, FRM-02, FRM-05)', async ({ page }) => {
  await signInWithTotp(page, 'forms-manager');
  await page.goto('/support?from=remittances');
  const form = formWith(page, 'Open ticket');
  const category = form.getByLabel('What is it about', { exact: true });
  const subject = form.getByLabel('Subject', { exact: true });
  const message = form.getByLabel('What happened, and what you expected', { exact: true });
  const summary = summaryOf(form);
  const kept = async (expected: string) => {
    await expect(category).toHaveValue('question');
    await expect(subject).toHaveValue(expected);
    await expect(message).toHaveValue('SYNTHETIC CHECK the statement page');
  };
  await category.selectOption('question');
  await subject.fill('SYNTHETIC a question about the statement');
  await message.fill('SYNTHETIC CHECK the statement page');

  await test.step('a dropped connection shows no error page, keeps every value, and says the save is not confirmed (FRM-01, FRM-05)', async () => {
    const support = (url: URL) => url.pathname === '/support';
    await page.route(support, async (route) => {
      if (route.request().method() === 'POST') {
        await route.abort('internetdisconnected');
      } else {
        await route.continue();
      }
    });
    try {
      await page.getByRole('button', { name: 'Open ticket' }).click();
      await expect(summary).toContainText('Not confirmed');
      await expect(summary).toContainText(
        'The connection to PaidWhole dropped before an answer came back. What you typed is still here: check your connection, then press “Open ticket” again.',
      );
      await expect(summary).toBeFocused();
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      await kept('SYNTHETIC a question about the statement');
    } finally {
      await page.unroute(support);
    }
  });

  await test.step('a page whose CSRF token is out of date is read again in place, and the values stay (FRM-01, FRM-05)', async () => {
    const token = form.locator('input[name="csrfToken"]');
    const written = 'SYNTHETIC-STALE-TOKEN';
    await token.evaluate((input, value) => {
      (input as HTMLInputElement).value = value;
    }, written);
    await page.getByRole('button', { name: 'Open ticket' }).click();
    await expect(summary).toContainText('This page was out of date, so nothing was saved. It is up to date now: press “Open ticket” again.');
    await expect(summary).toBeFocused();
    // Read again: the server rendered the session's token in place of the one written here.
    await expect.poll(() => token.inputValue()).not.toBe(written);
    await kept('SYNTHETIC a question about the statement');
  });

  await test.step('a subject naming a date of birth is refused, and every value stays (FRM-01)', async () => {
    await subject.fill('A question about the date of birth column');
    await page.getByRole('button', { name: 'Open ticket' }).click();
    await expect(summary).toContainText('Subject: a ticket takes no patient information');
    await expect(subject).toBeFocused();
    await kept('A question about the date of birth column');
  });

  await test.step('corrected, the ticket opens, and the form starts fresh with a new request key (FRM-02)', async () => {
    await subject.fill('SYNTHETIC a question about the statement column');
    const keyBefore = await form.locator('input[name="requestKey"]').inputValue();
    await page.getByRole('button', { name: 'Open ticket' }).click();
    await expect(page).toHaveURL(/\/support\?sent=\d+$/);
    await expect(page.getByText(/^Ticket \d+ opened$/)).toBeVisible();
    await expect(page.getByRole('table', { name: 'Tickets' })).toContainText('SYNTHETIC a question about the statement column');
    await expect(summary).toHaveCount(0);
    await expect(subject).toHaveValue('');
    await expect(message).toHaveValue('');
    await expect(form.locator('input[name="requestKey"]')).not.toHaveValue(keyBefore);
  });

  await test.step('a press saved by the server whose answer is lost, sent again after the page is read again, carries the same request key: "Already sent", and one ticket (FRM-01, FRM-05)', async () => {
    const asked = 'SYNTHETIC a question about the export column';
    await category.selectOption('question');
    await subject.fill(asked);
    await message.fill('SYNTHETIC CHECK the statement page');
    const support = (url: URL) => url.pathname === '/support';
    let reached = 0;
    await page.route(support, async (route) => {
      if (route.request().method() === 'POST') {
        // The post reaches the server, which saves the ticket; only its answer is lost on the way back.
        await route.fetch();
        reached += 1;
        await route.abort('internetdisconnected');
      } else {
        await route.continue();
      }
    });
    try {
      await page.getByRole('button', { name: 'Open ticket' }).click();
      await expect(summary).toContainText('Not confirmed');
    } finally {
      await page.unroute(support);
    }
    expect(reached).toBe(1);
    // Read again in place: the page renders a new request key, and the next press still sends the one the server saved.
    const key = form.locator('input[name="requestKey"]');
    const sent = await key.inputValue();
    await form.locator('input[name="csrfToken"]').evaluate((input) => {
      (input as HTMLInputElement).value = 'SYNTHETIC-STALE-TOKEN';
    });
    await page.getByRole('button', { name: 'Open ticket' }).click();
    await expect(summary).toContainText('It is up to date now: press “Open ticket” again.');
    await expect(key).not.toHaveValue(sent);
    await page.getByRole('button', { name: 'Open ticket' }).click();
    await expect(summary).toHaveAttribute('data-state', 'duplicate');
    await expect(summary).toContainText('Already sent');
    await expect(summary).toContainText('This form was already sent, so nothing new was saved. Reload the page to see the result.');
    await expect(summary).toBeFocused();
    await kept(asked);
    await page.reload();
    await expect(page.getByRole('table', { name: 'Tickets' }).getByRole('row').filter({ hasText: asked })).toHaveCount(1);
  });

  await test.step('a page read again after someone else signs in from another tab clears the form and invites no press, and nothing is sent as them (FRM-01, FRM-05)', async () => {
    const typed = 'SYNTHETIC a question typed before another sign-in';
    await category.selectOption('question');
    await subject.fill(typed);
    await message.fill('SYNTHETIC CHECK the statement page');
    const mark = form.locator('[data-form-actor]');
    const before = await mark.getAttribute('data-form-actor');
    expect(before).toBeTruthy();
    // The other person's sign-in replaces this browser's session, so this page's token is now another session's.
    const other = await page.context().newPage();
    await signInWithTotp(other, 'forms-second');
    await page.getByRole('button', { name: 'Open ticket' }).click();
    await expect(summary).toHaveAttribute('data-state', 'cleared');
    await expect(summary).toContainText('Form cleared');
    await expect(summary).toContainText('This page was out of date, so nothing was saved. The person signed in on this browser changed, so this form was cleared.');
    await expect(summary).not.toContainText('press');
    await expect(summary).toBeFocused();
    await expect(subject).toHaveValue('');
    await expect(message).toHaveValue('');
    await expect(mark).not.toHaveAttribute('data-form-actor', before ?? '');
    await other.goto('/support');
    await expect(other.getByRole('button', { name: 'Open ticket' })).toBeVisible();
    await expect(other.getByText(typed)).toHaveCount(0);
    await other.close();
  });
});

test('the console’s incident form refused for its checkbox group keeps its text, marks the group and focuses its first box, and starts fresh after a save that returns to the same address; the page fits a phone’s width, a refused component row too (FRM-02, FRM-04, FRM-05, FRM-08)', async ({ page }) => {
  await registerKeyAndSignIn(page, 'forms-admin');
  await page.goto('/console/status');
  const form = formWith(page, 'Open incident');
  const title = form.getByLabel('Title', { exact: true });
  const update = form.getByLabel('First update', { exact: true });
  await title.fill('SYNTHETIC forms check');
  await update.fill('SYNTHETIC nothing is wrong');
  await form.getByRole('button', { name: 'Open incident' }).click();
  await expect(summaryOf(form)).toContainText('Components affected: choose at least one component');
  await expect(title).toHaveValue('SYNTHETIC forms check');
  await expect(update).toHaveValue('SYNTHETIC nothing is wrong');
  const group = form.getByRole('group', { name: 'Components affected' });
  await expect(group).toHaveAttribute('data-invalid');
  await expect(group.locator('[data-field-error]')).toContainText('choose at least one component');
  await expect(group.getByRole('checkbox').first()).toBeFocused();
  await expect(page).toHaveURL(/\/console\/status$/);

  await test.step('with a component ticked the incident opens, the page returns to the same address, and the form shows its defaults, no refusal and a new request key (FRM-02)', async () => {
    const keyBefore = await form.locator('input[name="requestKey"]').inputValue();
    await group.getByRole('checkbox').first().check();
    await form.getByRole('button', { name: 'Open incident' }).click();
    const opened = page.locator('[data-incident-status]:not([data-incident-status="resolved"])').filter({ hasText: 'SYNTHETIC forms check' }).first();
    await expect(opened).toBeVisible();
    await expect(page).toHaveURL(/\/console\/status$/);
    await expect(summaryOf(form)).toHaveCount(0);
    await expect(title).toHaveValue('');
    await expect(update).toHaveValue('');
    await expect(group.getByRole('checkbox', { checked: true })).toHaveCount(0);
    await expect(group).not.toHaveAttribute('data-invalid');
    await expect(form.locator('input[name="requestKey"]')).not.toHaveValue(keyBefore);
    // Resolved again, so the public status page reads as it did for the specs that run beside this one.
    await opened.getByLabel('Status', { exact: true }).selectOption('resolved');
    await opened.getByLabel('Update', { exact: true }).fill('SYNTHETIC resolved by the forms check');
    await opened.getByRole('button', { name: 'Post update' }).click();
    await expect(page.locator('[data-incident-status="resolved"]').filter({ hasText: 'SYNTHETIC forms check' }).first()).toBeVisible();
  });

  await test.step('at 390 px the page does not scroll sideways, nor once a component’s row is refused for an out-of-date page, its summary on a line of its own in the row (FRM-08)', async () => {
    await atPhoneWidth(page, 'Console status');
    const row = page.getByRole('table', { name: 'Components' }).locator('form').first();
    await row.locator('input[name="csrfToken"]').evaluate((input, value) => {
      (input as HTMLInputElement).value = value;
    }, 'SYNTHETIC-STALE-TOKEN');
    await row.getByRole('button', { name: 'Set', exact: true }).click();
    await expect(summaryOf(row)).toContainText('This page was out of date, so nothing was saved.');
    const [summaryBottom, selectTop] = await row.evaluate((form) => [form.querySelector('[data-slot="refusal-summary"]')?.getBoundingClientRect().bottom ?? 0, form.querySelector('select')?.getBoundingClientRect().top ?? 0]);
    expect(selectTop).toBeGreaterThanOrEqual(summaryBottom ?? 0);
    await atPhoneWidth(page, 'Console status, a component’s row refused');
  });
});
