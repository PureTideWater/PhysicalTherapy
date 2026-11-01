import { type Browser, type Locator, type Page, expect, test } from '@playwright/test';
import { assertNoPhi } from '@tp/observability';

import { personaEmail, personaPassword, personaTotpCode } from '../scripts/synthetic-personas';
import { totpCode } from '../src/lib/auth/totp';
import { atPhoneWidth, expectAccessible } from './a11y';
import { addVirtualKey, enterPassword, withDatabase } from './helpers';

/**
 * Each sign-in step's time limit (docs/adr/0081; test matrix SGN-01 to SGN-04): the code step states its limit, warns
 * once, closes and starts again with the email kept; one step closes in real time, by the server's own clock, with no
 * fake clock anywhere; an invited viewer's two steps are numbered, Start again during the warning keeps the email, and
 * a closed enrolment says which password now works; and an invited support engineer's three steps end with key
 * registration's 15 minutes. Each test is its own synthetic persona's (a step counts toward the ten-failure lock and
 * the mfa bucket, and specs run in parallel). The browser's clock is Playwright's where a test moves it: TOTP codes
 * are computed here from Node's real clock and checked by the server's, which nothing moves, and a step the server
 * should find closed is closed by deleting `tp_sign_in`, as the browser itself does at the cookie's Max-Age. Synthetic
 * data only.
 */

const RESTART_HREF = '/sign-in?reason=restarted';
const KEEPS = 'If you need more time, start again: your email is kept, and you type your password again.';
const CLOSED = 'Start again: your email is kept, and you type your password again.';

/** The status below a step's form, which speaks at the warning and when the step has closed. */
function regionOf(page: Page): Locator {
  return page.locator('[data-slot="step-timer"]');
}

/** The limit sentence's phrase on screen: the other two share its cell, hidden. */
function phraseOf(page: Page): Locator {
  return page.locator('[data-slot="step-limit"] > span:not([aria-hidden="true"])');
}

/** The code field of the code and enrolment steps. */
function codeOf(page: Page): Locator {
  return page.getByLabel('Six-digit code', { exact: true });
}

/**
 * Every request the page makes, so a test can show at its end that the email is in none of them: not as typed, not
 * encoded, not its local part. The navigations and the page's own address go through the PHI guard too (the app's
 * assets and the RSC fetches have paths and query names the guard's route words do not cover, by design).
 */
function watchRequests(page: Page): (email: string) => void {
  const all: string[] = [];
  const navigations: string[] = [];
  page.on('request', (request) => {
    all.push(request.url());
    if (request.isNavigationRequest()) {
      navigations.push(request.url());
    }
  });
  return (email) => {
    const local = email.slice(0, email.indexOf('@'));
    for (const url of [...navigations, page.url()]) {
      assertNoPhi('url', url, { known: [email] });
    }
    for (const url of [...all, page.url()]) {
      for (const form of [email, encodeURIComponent(email), local]) {
        expect(url, 'no request carries the email').not.toContain(form);
      }
    }
  };
}

/** At 390 by 500 px (a phone's visual viewport with the on-screen keyboard up), the field focused: the sentence's phrase is in view. */
async function expectCueInView(page: Page, field: Locator, what: string): Promise<void> {
  const before = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 500 });
  try {
    await field.focus();
    const box = await phraseOf(page).evaluate((phrase) => {
      const rect = phrase.getBoundingClientRect();
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: window.innerHeight };
    });
    expect(box.top >= 0 && box.bottom <= box.height, `${what}: the limit sentence's phrase in view at 390 by 500 px with the field focused (${JSON.stringify(box)})`).toBe(true);
  } finally {
    if (before !== null) {
      await page.setViewportSize(before);
    }
  }
}

/** The step page's status, empty and polite, once the timer has counted: before the clock moves, so its anchor is taken first. */
async function expectOpen(page: Page): Promise<void> {
  const region = regionOf(page);
  await expect(region).toHaveAttribute('data-phase', 'open');
  await expect(region).toHaveAttribute('role', 'status');
  await expect(region).toHaveAttribute('aria-atomic', 'true');
  await expect(region).toHaveText('');
}

/** Whether `first` comes before `second` in the document. */
async function precedes(first: Locator, second: Locator): Promise<boolean> {
  const other = await second.elementHandle();
  return first.evaluate((element, next) => next !== null && (element.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0, other);
}

/** The step's code, typed in and pressed: on enrolment the setup key's, elsewhere the persona's. */
async function pressCode(page: Page, code: string, submit: 'Sign in' | 'Verify and continue'): Promise<void> {
  await codeOf(page).fill(code);
  await page.getByRole('button', { name: submit }).click();
}

/** Back on the sign-in page after a step: the email kept, the password empty, the notice focused. */
async function expectKept(page: Page, reason: 'step_expired' | 'restarted', email: string, words: readonly string[]): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`/sign-in\\?reason=${reason}$`));
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  const notice = page.locator('[data-slot="arrival-focus"]');
  await expect(notice).toBeFocused();
  for (const said of words) {
    await expect(notice).toContainText(said);
  }
  // The notice says the email is filled in; it never prints it.
  await expect(notice).not.toContainText(email);
}

/** The sign-in cookies left in the browser, by name. */
async function cookieNames(page: Page): Promise<string[]> {
  return (await page.context().cookies()).map((cookie) => cookie.name);
}

/** An invited person's new password: the policy's, synthetic. */
const CHOSEN = 'Chosen-Synthetic-Time-Pass-2026!';

async function choosePassword(page: Page): Promise<void> {
  await page.getByLabel('New password', { exact: true }).fill(CHOSEN);
  await page.getByLabel('New password again', { exact: true }).fill(CHOSEN);
  await page.getByRole('button', { name: 'Save password' }).click();
}

/** The setup key enrolment shows, as the authenticator app would read it. */
async function setupKeyOf(page: Page): Promise<string> {
  const secret = (await page.locator('[data-slot="totp-secret"]').getAttribute('data-secret')) ?? '';
  expect(secret).toMatch(/^[A-Z2-7]+$/);
  return secret;
}

/** A browser context without JavaScript, closed after `run` (its step is abandoned). */
async function withoutJavaScript(browser: Browser, run: (page: Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await run(await context.newPage());
  } finally {
    await context.close();
  }
}

test('the code step states its limit, warns once, closes, and starts again with the email kept (SGN-01, SGN-02, SGN-03, SGN-04)', async ({ page }) => {
  const key = 'time-mfa';
  const email = personaEmail(key);
  const noAddress = watchRequests(page);
  await page.clock.install();
  await enterPassword(page, key);
  await expect(page).toHaveURL(/\/sign-in\/mfa$/);
  const region = regionOf(page);
  const code = codeOf(page);

  await test.step('the limit is stated before the form, the step is not numbered, and the status is present and empty', async () => {
    await expect(phraseOf(page)).toHaveText('This step stays open for 3 minutes.');
    expect(await precedes(page.locator('[data-slot="step-limit"]'), page.locator('form'))).toBe(true);
    await expect(page.locator('[data-slot="step-marker"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Verification code', exact: true })).toBeVisible();
    await expectOpen(page);
  });

  await test.step('at one minute left the status warns, politely, and the focus and what was typed stay', async () => {
    await code.focus();
    await code.pressSequentially('123');
    await page.clock.fastForward('02:00');
    await expect(region).toHaveAttribute('data-phase', 'warning');
    await expect(region).toContainText('This step closes within a minute');
    await expect(region).toContainText(KEEPS);
    await expect(region.getByRole('link', { name: 'Start again', exact: true })).toHaveAttribute('href', RESTART_HREF);
    await expect(region.locator('[role="alert"], [aria-live="assertive"], [data-slot="alert"]')).toHaveCount(0);
    await expect(code).toBeFocused();
    await expect(code).toHaveValue('123');
    await expect(phraseOf(page)).toHaveText('This step closes within a minute.');
    await expectAccessible(page, 'Code step, warning shown');
    await atPhoneWidth(page, 'Code step, warning shown');
    await expectCueInView(page, code, 'Code step, warning shown');
  });

  await test.step('at zero the same status says the step has closed, once, and the form stays usable', async () => {
    await page.clock.fastForward('01:00');
    await expect(region).toHaveAttribute('data-phase', 'closed');
    await expect(region).toContainText('This step has closed');
    await expect(region).toContainText(CLOSED);
    await expect(region.getByRole('link', { name: 'Start again', exact: true })).toHaveAttribute('href', RESTART_HREF);
    await expect(phraseOf(page)).toHaveText('This step has closed.');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    await expect(page).toHaveURL(/\/sign-in\/mfa$/);
    await expectAccessible(page, 'Code step, closed');
  });

  await test.step('a valid code pressed on a closed step starts again, with the email filled and the notice focused', async () => {
    // The browser drops the step at its Max-Age; the page's fake clock cannot move the cookie store's.
    await page.context().clearCookies({ name: 'tp_sign_in' });
    await pressCode(page, personaTotpCode(key), 'Sign in');
    await expectKept(page, 'step_expired', email, ['Sign-in step closed', 'That sign-in step closed. Your email is filled in: type your password to start again.']);
    await expectAccessible(page, 'Sign in, email kept');
  });

  await test.step('the kept email is a sealed, HttpOnly, SameSite=Lax cookie that ends within 18 minutes', async () => {
    const kept = (await page.context().cookies()).find((cookie) => cookie.name === 'tp_sign_in_email');
    expect(kept).toBeDefined();
    expect(kept).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    const local = email.slice(0, email.indexOf('@'));
    for (const form of [email, local, Buffer.from(email).toString('base64url')]) {
      expect(kept?.value).not.toContain(form);
    }
    const left = (kept?.expires ?? 0) * 1000 - Date.now();
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(18 * 60_000);
  });

  await test.step('the password and a code sign in: the code pressed on the closed step never reached the provider', async () => {
    await page.getByLabel('Password', { exact: true }).fill(personaPassword(key));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/sign-in\/mfa$/);
    await pressCode(page, personaTotpCode(key), 'Sign in');
    await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
    const names = await cookieNames(page);
    expect(names).not.toContain('tp_sign_in');
    expect(names).not.toContain('tp_sign_in_email');
  });

  noAddress(email);
});

test('a real expiry: the server closes the code step at 3 minutes by its own clock, and counts no failure (SGN-01, SGN-03)', async ({ page, browser }) => {
  // Three minutes of real time, waited for by the page's own events, never a sleep.
  test.setTimeout(300_000);
  const key = 'time-real';
  const email = personaEmail(key);
  const began = new Date();

  await test.step('without JavaScript the password posts and the code step states its limit, its status empty and never counting', async () => {
    await withoutJavaScript(browser, async (plain) => {
      const noAddress = watchRequests(plain);
      await plain.goto('/sign-in');
      await plain.getByLabel('Email', { exact: true }).fill(email);
      await plain.getByLabel('Password', { exact: true }).fill(personaPassword(key));
      await plain.getByRole('button', { name: 'Continue' }).click();
      await expect(plain).toHaveURL(/\/sign-in\/mfa$/);
      await expect(phraseOf(plain)).toHaveText('This step stays open for 3 minutes.');
      await expect(regionOf(plain)).toHaveText('');
      await expect(regionOf(plain)).not.toHaveAttribute('data-phase');
      noAddress(email);
    });
  });

  const noAddress = watchRequests(page);
  await enterPassword(page, key);
  await expect(page).toHaveURL(/\/sign-in\/mfa$/);
  const arrived = Date.now();
  const region = regionOf(page);

  await test.step('the warning comes at one minute left and the step closes at three, on real clocks', async () => {
    await expectOpen(page);
    await expect(region).toHaveAttribute('data-phase', 'warning', { timeout: 140_000 });
    expect(Date.now() - arrived).toBeGreaterThanOrEqual(115_000);
    await expect(region).toHaveAttribute('data-phase', 'closed', { timeout: 80_000 });
    expect(Date.now() - arrived).toBeGreaterThanOrEqual(175_000);
  });

  await test.step('the step cookie is still there: the server’s limit closes the step, not the cookie', async () => {
    expect(await cookieNames(page)).toContain('tp_sign_in');
    await pressCode(page, personaTotpCode(key), 'Sign in');
    await expect(page).toHaveURL(/\/sign-in\?reason=step_expired$/);
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  });

  await test.step('the closed step counted no failure', async () => {
    const counted = await withDatabase(async (client) => ({
      failed: (
        await client.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM audit_event e JOIN "user" u ON u.id = e.object_id
            WHERE e.object_type = 'user' AND e.action = 'sign_in_failed' AND u.email = $1 AND e.at >= $2`,
          [email, began],
        )
      ).rows[0]?.count,
      failures: (await client.query<{ failed_sign_ins: number }>('SELECT failed_sign_ins FROM "user" WHERE email = $1', [email])).rows[0]?.failed_sign_ins,
    }));
    expect(counted).toEqual({ failed: 0, failures: 0 });
  });

  await test.step('the password and a code then sign in', async () => {
    await page.getByLabel('Password', { exact: true }).fill(personaPassword(key));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/sign-in\/mfa$/);
    await pressCode(page, personaTotpCode(key), 'Sign in');
    await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
  });

  noAddress(email);
});

test('an invited viewer’s steps are numbered, Start again during the warning keeps the email, and a closed enrolment says its key is new and which password works (SGN-02, SGN-03, SGN-04)', async ({ page }) => {
  const key = 'time-invited';
  const email = personaEmail(key);
  const noAddress = watchRequests(page);
  await page.clock.install();
  await enterPassword(page, key);
  await expect(page).toHaveURL(/\/sign-in\/new-password$/);
  const region = regionOf(page);

  await test.step('choosing a password is step 1 of 2, its limit stated', async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'Step 1 of 2: Choose a password', exact: true })).toBeVisible();
    await expect(page.locator('[data-slot="step-marker"]')).toHaveText(/^Step 1 of 2:?\s*$/);
    await expect(phraseOf(page)).toHaveText('This step stays open for 3 minutes.');
    await expectOpen(page);
  });

  await test.step('Start again during the warning lands on the sign-in page with the email filled, told to use the temporary password', async () => {
    await page.clock.fastForward('02:00');
    await expect(region).toHaveAttribute('data-phase', 'warning');
    await expect(region).toContainText(KEEPS);
    await region.getByRole('link', { name: 'Start again', exact: true }).click();
    await expectKept(page, 'restarted', email, ['Start again', 'Your email is filled in: type your password to start again.', 'Use the temporary password from your invitation.']);
  });

  await test.step('the temporary password, typed beside the kept email, opens a fresh step', async () => {
    await page.getByLabel('Password', { exact: true }).fill(personaPassword(key));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/sign-in\/new-password$/);
    await expectOpen(page);
  });

  let first = '';
  await test.step('enrolment is step 2 of 2, its limit stated above the setup key', async () => {
    await choosePassword(page);
    await expect(page).toHaveURL(/\/sign-in\/enroll$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Step 2 of 2: Set up two-step verification', exact: true })).toBeVisible();
    expect(await precedes(page.locator('[data-slot="step-limit"]'), page.locator('[data-slot="totp-secret"]'))).toBe(true);
    first = await setupKeyOf(page);
    await expectOpen(page);
  });

  await test.step('enrolment’s warning says starting again gives a new setup key', async () => {
    await page.clock.fastForward('02:00');
    await expect(region).toHaveAttribute('data-phase', 'warning');
    await expect(region).toContainText('This step closes within a minute');
    await expect(region).toContainText('Starting again gives you a new setup key: replace this one in your authenticator app.');
    await expectAccessible(page, 'Enrolment, warning shown');
    await atPhoneWidth(page, 'Enrolment, warning shown');
    await expectCueInView(page, codeOf(page), 'Enrolment, warning shown');
  });

  await test.step('closed, enrolment says the setup key no longer works', async () => {
    await page.clock.fastForward('01:00');
    await expect(region).toHaveAttribute('data-phase', 'closed');
    await expect(region).toContainText('This setup key no longer works: starting again gives you a new one.');
    await expectAccessible(page, 'Enrolment, closed');
  });

  await test.step('reloaded once the step is gone, the sign-in page keeps the email and says to use the chosen password', async () => {
    await page.context().clearCookies({ name: 'tp_sign_in' });
    await page.reload();
    await expectKept(page, 'step_expired', email, ['Sign-in step closed', 'That sign-in step closed. Your email is filled in: type your password to start again.', 'Use the password you chose: the temporary one no longer works.']);
  });

  await test.step('the chosen password leads to enrolment with one step left, unnumbered, and a new setup key whose code signs in', async () => {
    await page.getByLabel('Password', { exact: true }).fill(CHOSEN);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/sign-in\/enroll$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Set up two-step verification', exact: true })).toBeVisible();
    await expect(page.locator('[data-slot="step-marker"]')).toHaveCount(0);
    const second = await setupKeyOf(page);
    expect(second).not.toBe(first);
    await pressCode(page, totpCode(second, new Date()), 'Verify and continue');
    await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
  });

  noAddress(email);
});

test('an invited support engineer’s three steps are numbered, and key registration stays open for 15 minutes with its warning at two (SGN-01, SGN-02, SGN-04)', async ({ page }) => {
  const key = 'time-staff';
  const email = personaEmail(key);
  const noAddress = watchRequests(page);
  await addVirtualKey(page);
  await page.clock.install();
  await enterPassword(page, key);
  await expect(page).toHaveURL(/\/sign-in\/new-password$/);

  await test.step('choosing a password is step 1 of 3, and enrolment step 2 of 3', async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'Step 1 of 3: Choose a password', exact: true })).toBeVisible();
    await choosePassword(page);
    await expect(page).toHaveURL(/\/sign-in\/enroll$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Step 2 of 3: Set up two-step verification', exact: true })).toBeVisible();
    await pressCode(page, totpCode(await setupKeyOf(page), new Date()), 'Verify and continue');
  });

  const region = regionOf(page);
  await test.step('key registration is step 3 of 3 and states 15 minutes', async () => {
    await expect(page).toHaveURL(/\/sign-in\/register-key$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Step 3 of 3: Register a hardware key', exact: true })).toBeVisible();
    await expect(phraseOf(page)).toHaveText('This step stays open for 15 minutes.');
    await expectOpen(page);
  });

  await test.step('at two minutes left the status warns', async () => {
    await page.clock.fastForward('13:00');
    await expect(region).toHaveAttribute('data-phase', 'warning');
    await expect(region).toContainText('This step closes within 2 minutes');
    await expect(region).toContainText(KEEPS);
    await expect(phraseOf(page)).toHaveText('This step closes within 2 minutes.');
    await expectAccessible(page, 'Key registration, warning shown');
  });

  await test.step('the key registers, and signing in with it is not a numbered step', async () => {
    await page.getByRole('button', { name: 'Register hardware key' }).click();
    await expect(page).toHaveURL(/\/sign-in\/hardware-key\?reason=key_registered$/);
    await expect(page.locator('[data-slot="step-marker"]')).toHaveCount(0);
  });

  noAddress(email);
});

