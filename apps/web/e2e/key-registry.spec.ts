import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test';

import { personaEmail } from '../scripts/synthetic-personas';
import { addVirtualKey, refusal, registerKeyAndSignIn, signInWithTotp, withDatabase } from './helpers';

/**
 * Removing a member's hardware keys, and registering again (docs/adr/0095; Queues item 37; test matrix SGN-20 to
 * SGN-27): two platform administrators, neither of them the account, remove a support engineer's keys in the console;
 * the account then opens nothing until an administrator opens registration and reads the member a one-time code; the
 * member enters it after password and authenticator code, registers a new key and signs in with it. On the way, the
 * refusals a person can meet: an administrator under seven days in the role, a second request for the same account,
 * the removed key, a code before any opening, a code of the wrong shape, a wrong code, and a second opening.
 * A virtual WebAuthn authenticator stands in for each hardware key. SYNTHETIC accounts only.
 */

const REQUESTER = 'key-removal-requester';
const CONFIRMER = 'key-removal-confirmer';
const MEMBER = 'key-removal-member';
const INTERNAL_ORGANIZATION = 'SYNTHETIC COMPANY (INTERNAL)';
const CODE_REFUSED = 'That code did not open registration. Check the code PaidWhole gave you and try again.';
/** The code's alphabet has no look-alikes, so these are never in a code: a well-shaped code that cannot be the right one. */
const WRONG_CODE = 'ABCD EFGH';

/** A person's own browser: its own cookies and its own hardware key. */
async function person(browser: Browser): Promise<{ readonly context: BrowserContext; readonly page: Page }> {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

/** The Members row of an account on the internal organization's console page. */
function memberRow(page: Page, key: string) {
  return page.locator(`tr[data-member="${personaEmail(key)}"]`);
}

/** A row's button by its exact accessible name: the visible words, then the account (WCAG 2.4.6; UX review U2). */
function keyButton(page: Page, words: string, key: string) {
  return page.getByRole('button', { name: `${words} ${personaEmail(key)}`, exact: true });
}

/** The key-state badge in the row's Account cell (the copy a phone shows above the buttons is `narrowAccount`). */
function keyBadge(page: Page, key: string, words: string) {
  return memberRow(page, key).locator('td[data-cell="account"]').getByText(words, { exact: true });
}

/** The row's key-state words, which take the focus after a request, a cancellation, a confirmation or a refusal (U3, U7). */
function keyState(page: Page, key: string) {
  return memberRow(page, key).locator('[data-key-state]');
}

/** The account's email and key-state badge at the top of the Actions cell, shown below the `sm` breakpoint only (U1). */
function narrowAccount(page: Page, key: string) {
  return memberRow(page, key).locator('[data-narrow-account]');
}

/**
 * Seven days in the role, which the test cannot wait for: as the database's owner, with the triggers off for this one
 * transaction (as the other journeys move a clock), the two administrators' memberships and the role escalation the
 * seed recorded for each are dated eight days back. Nothing else of the rule is moved: each still holds a key
 * registered through the app and a key session of the last 15 minutes.
 */
async function sevenDaysInTheRole(): Promise<void> {
  await withDatabase(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL session_replication_role = replica');
      const memberships = await client.query<{ id: string }>(
        `UPDATE membership m SET created_at = now() - interval '8 days'
           FROM "user" u
          WHERE u.id = m.user_id AND u.email = ANY($1::text[]) AND m.role = 'platform_admin'
        RETURNING m.id`,
        [[personaEmail(REQUESTER), personaEmail(CONFIRMER)]],
      );
      expect(memberships.rowCount).toBe(2);
      await client.query(
        `UPDATE audit_event SET at = at - interval '8 days'
          WHERE object_type = 'membership' AND object_id = ANY($1::uuid[]) AND action = 'security_event' AND purpose = 'role_escalation'`,
        [memberships.rows.map((row) => row.id)],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

/** Password and authenticator code of the member whose registration is closed: the step that asks for the code. */
async function memberReachesTheCodeStep(page: Page): Promise<void> {
  await signInWithTotp(page, MEMBER, true);
  await expect(page).toHaveURL(/\/sign-in\/register-key$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Register a hardware key' })).toBeVisible();
  await expect(page.getByLabel('Code from PaidWhole')).toBeVisible();
  // A code is set in the mono face, as the console shows it (U11).
  expect(await page.getByLabel('Code from PaidWhole').evaluate((input) => getComputedStyle(input).fontFamily)).toMatch(/mono/i);
  // The code comes first: no key is registered by a password and an authenticator code alone.
  await expect(page.getByRole('button', { name: 'Register hardware key' })).toHaveCount(0);
}

async function enterCode(page: Page, code: string): Promise<void> {
  await page.getByLabel('Code from PaidWhole').fill(code);
  await page.getByRole('button', { name: 'Continue' }).click();
}

/** The one refusal of a code: its words shown, the step kept, the field emptied, and still no key to register. */
async function expectCodeRefused(page: Page): Promise<void> {
  await expect(refusal(page).filter({ hasText: CODE_REFUSED })).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in\/register-key$/);
  await expect(page.getByLabel('Code from PaidWhole')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Register hardware key' })).toHaveCount(0);
}

test('two administrators remove a member’s hardware keys, registration stays closed until one opens it with a one-time code, and the member registers again', async ({ browser }) => {
  test.slow();
  const requester = await person(browser);
  const confirmer = await person(browser);
  const member = await person(browser);
  const returning = await person(browser);
  try {
    // Each signs in with a key registered through the app (a key from before the registry has no row).
    await registerKeyAndSignIn(member.page, MEMBER);
    await expect(member.page.getByText('No practice to open')).toBeVisible();
    await registerKeyAndSignIn(requester.page, REQUESTER);
    await registerKeyAndSignIn(confirmer.page, CONFIRMER);

    await requester.page.getByRole('link', { name: INTERNAL_ORGANIZATION }).click();
    await expect(requester.page).toHaveURL(/\/console\/organizations\/[0-9a-f-]{36}$/);
    const consoleUrl = requester.page.url();
    await expect(requester.page.getByText('Removing an account’s hardware keys takes two platform administrators, neither of them the account')).toBeVisible();
    // No one is offered their own keys.
    await expect(keyButton(requester.page, 'Request key removal for', REQUESTER)).toHaveCount(0);
    // Every row's buttons name their account, and the email is the row's header (U2).
    await expect(requester.page.getByRole('rowheader', { name: personaEmail(MEMBER), exact: true })).toBeVisible();
    await expect(keyButton(requester.page, 'Request key removal for', MEMBER)).toHaveCount(1);
    await expect(keyButton(requester.page, 'End membership of', MEMBER)).toHaveCount(1);
    await expect(requester.page.getByRole('button', { name: 'Request key removal', exact: true })).toHaveCount(0);
    await expect(requester.page.getByRole('button', { name: 'End membership', exact: true })).toHaveCount(0);
    // At a desktop's width the Email column names the row: the phone's copy above the buttons is not shown.
    await expect(narrowAccount(requester.page, MEMBER)).toBeHidden();

    // Refused: an administrator not yet seven days in the role. Nothing is requested.
    await keyButton(requester.page, 'Request key removal for', MEMBER).click();
    await expect(refusal(requester.page).filter({ hasText: 'only a platform administrator who has held the role for seven days' })).toBeVisible();
    await expect(refusal(requester.page).filter({ hasText: 'If you have held the role for less than seven days, ask another platform administrator.' })).toBeVisible();
    await expect(keyBadge(requester.page, MEMBER, 'key removal requested')).toHaveCount(0);

    await sevenDaysInTheRole();
    // The second administrator's page, read before any request stands.
    await confirmer.page.goto(consoleUrl);
    await expect(keyButton(confirmer.page, 'Request key removal for', MEMBER)).toBeVisible();

    // One requests. The requester is told another confirms, and is offered no confirmation.
    await requester.page.reload();
    await keyButton(requester.page, 'Request key removal for', MEMBER).click();
    await expect(keyBadge(requester.page, MEMBER, 'key removal requested')).toBeVisible();
    // The focus lands on the row's new state, which is what a screen reader then reads (U3).
    await expect(keyState(requester.page, MEMBER)).toBeFocused();
    await expect(keyState(requester.page, MEMBER)).toContainText('You asked to remove this account’s hardware keys');
    // The requester cancels: the focus lands on the row's state again, and nothing stands. Then asks again.
    await keyButton(requester.page, 'Cancel removal request for', MEMBER).click();
    await expect(keyState(requester.page, MEMBER)).toContainText('No key removal stands');
    await expect(keyState(requester.page, MEMBER)).toBeFocused();
    await expect(keyBadge(requester.page, MEMBER, 'key removal requested')).toHaveCount(0);
    await keyButton(requester.page, 'Request key removal for', MEMBER).click();
    await expect(keyBadge(requester.page, MEMBER, 'key removal requested')).toBeVisible();
    await expect(keyState(requester.page, MEMBER)).toBeFocused();
    await expect(memberRow(requester.page, MEMBER)).toContainText('You asked to remove this account’s hardware keys');
    await expect(memberRow(requester.page, MEMBER)).toContainText('You cannot confirm your own request.');
    await expect(keyButton(requester.page, 'Confirm key removal for', MEMBER)).toHaveCount(0);
    await expect(keyButton(requester.page, 'Cancel removal request for', MEMBER)).toBeVisible();
    // A second page of the requester's, read while the request stands: its Cancel is pressed after the confirmation.
    const late = await requester.context.newPage();
    await late.goto(consoleUrl);
    await expect(keyButton(late, 'Cancel removal request for', MEMBER)).toBeVisible();

    // Refused: a second request for the same account, from the page the other administrator read earlier.
    await keyButton(confirmer.page, 'Request key removal for', MEMBER).click();
    await expect(refusal(confirmer.page).filter({ hasText: 'a removal is already requested for this account; confirm or cancel that one' })).toBeVisible();

    // A request changes nothing by itself: the member is still signed in.
    await member.page.reload();
    await expect(member.page.getByText('No practice to open')).toBeVisible();

    // Another confirms. The keys are removed and the member's session ends at once.
    await confirmer.page.reload();
    await expect(memberRow(confirmer.page, MEMBER)).toContainText(`${personaEmail(REQUESTER)} asked to remove this account’s hardware keys`);
    await expect(memberRow(confirmer.page, MEMBER)).toContainText('the removed keys cannot be restored');
    // At a phone's width (390 px) the row's account is on screen with its buttons: the email and the key-state badge
    // stand above them in the Actions cell, inside the table's own sideways-scrolling region (U1, the small form).
    await confirmer.page.setViewportSize({ width: 390, height: 844 });
    const confirm = keyButton(confirmer.page, 'Confirm key removal for', MEMBER);
    await confirm.scrollIntoViewIfNeeded();
    await expect(confirm).toBeInViewport({ ratio: 1 });
    const account = narrowAccount(confirmer.page, MEMBER);
    await expect(account).toBeVisible();
    await expect(account).toContainText(personaEmail(MEMBER));
    await expect(account).toContainText('key removal requested');
    // Both inside the viewport and inside the table's scrolling region (to a pixel: the region's edge falls on a fraction).
    const email = account.getByText(personaEmail(MEMBER), { exact: true });
    await expect(email).toBeInViewport({ ratio: 0.99 });
    const region = await account.locator('xpath=ancestor::*[@role="region"][1]').boundingBox();
    expect(region).not.toBeNull();
    for (const box of [await confirm.boundingBox(), await email.boundingBox()]) {
      expect(box).not.toBeNull();
      if (box === null || region === null) {
        continue;
      }
      expect(box.x).toBeGreaterThanOrEqual(Math.max(0, region.x - 1));
      expect(box.x + box.width).toBeLessThanOrEqual(Math.min(390, region.x + region.width + 1));
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
    }
    await confirmer.page.setViewportSize({ width: 1280, height: 720 });
    await expect(account).toBeHidden();
    // The pending request's badge is a state, not a failure: no danger ground (U10).
    await expect(keyBadge(confirmer.page, MEMBER, 'key removal requested')).not.toHaveClass(/bg-danger-bg/);
    await confirm.click();
    await expect(keyBadge(confirmer.page, MEMBER, 'keys removed')).toBeVisible();
    await expect(keyState(confirmer.page, MEMBER)).toBeFocused();
    await expect(keyState(confirmer.page, MEMBER)).toContainText('Keys removed at');
    await expect(keyButton(confirmer.page, 'Open key registration for', MEMBER)).toBeVisible();
    // Refused: a cancellation after the confirmation, from the page read before it. The refusal says where to look,
    // the row reads itself again with no reload, and the focus lands on what now stands (U7).
    await keyButton(late, 'Cancel removal request for', MEMBER).click();
    await expect(keyBadge(late, MEMBER, 'keys removed')).toBeVisible();
    await expect(keyState(late, MEMBER)).toContainText('Keys removed at');
    await expect(keyState(late, MEMBER)).toBeFocused();
    await expect(keyButton(late, 'Cancel removal request for', MEMBER)).toHaveCount(0);
    await late.close();
    await member.page.goto('/');
    await expect(member.page).toHaveURL(/\/sign-in(?:\?|$)/);

    // Refused: the removed key signs in nowhere.
    await member.page.goto('/sign-in/hardware-key');
    await member.page.getByLabel('Email').fill(personaEmail(MEMBER));
    await member.page.getByRole('button', { name: 'Sign in with hardware key' }).click();
    await expect(refusal(member.page).filter({ hasText: 'That did not match' })).toBeVisible();
    await expect(member.page).toHaveURL(/\/sign-in\/hardware-key/);

    // The member comes back with a new key, in a browser that never held the old one. Registration is closed: password
    // and authenticator code reach the step that asks for a code, and before any opening no code opens it.
    await addVirtualKey(returning.page);
    await memberReachesTheCodeStep(returning.page);
    await enterCode(returning.page, WRONG_CODE);
    await expectCodeRefused(returning.page);
    // Refused in the form: not the shape of a code.
    await enterCode(returning.page, 'ABC');
    await expect(returning.page.getByText('enter the eight letters and digits of the code PaidWhole gave you').first()).toBeVisible();
    await expect(returning.page).toHaveURL(/\/sign-in\/register-key$/);
    // Closed means closed: the console is not there for the step's cookie.
    const closed = await person(browser);
    try {
      await closed.context.addCookies(await returning.context.cookies());
      await closed.page.goto('/console/organizations');
      await expect(closed.page).toHaveURL(/\/sign-in/);
    } finally {
      await closed.context.close();
    }

    // An administrator opens registration: the code is shown once, in the page only.
    const stale = await confirmer.context.newPage();
    await stale.goto(consoleUrl);
    await expect(keyButton(stale, 'Open key registration for', MEMBER)).toBeVisible();
    await expect(memberRow(confirmer.page, MEMBER).getByText('Open registration only when')).toBeVisible();
    await keyButton(confirmer.page, 'Open key registration for', MEMBER).click();
    const panel = confirmer.page.getByRole('group', { name: `Registration code for ${personaEmail(MEMBER)}` });
    await expect(panel).toBeFocused();
    await expect(panel).toContainText(`Registration is open for ${personaEmail(MEMBER)} until`);
    // The panel has a heading to find it by, its lead-in is gone, and the lost-code words agree with the database (U5, U13).
    await expect(panel.getByRole('heading', { name: `Registration code for ${personaEmail(MEMBER)}`, exact: true })).toBeVisible();
    await expect(panel).toContainText('registration cannot be opened again until');
    await expect(memberRow(confirmer.page, MEMBER).getByText('Open registration only when')).toHaveCount(0);
    const shown = (await panel.locator('span.font-mono').innerText()).trim();
    expect(shown).toMatch(/^[0-9A-Z]{4} [0-9A-Z]{4}$/);
    const code = shown.replace(' ', '');
    expect(confirmer.page.url()).toBe(consoleUrl);
    expect(await confirmer.page.title()).not.toContain(code);
    expect(await confirmer.page.title()).not.toContain(shown);
    expect(JSON.stringify(await confirmer.context.cookies())).not.toContain(code);
    expect(await confirmer.page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]))).not.toContain(code);

    // Refused: a second opening while one stands, from a page read before it.
    await keyButton(stale, 'Open key registration for', MEMBER).click();
    await expect(refusal(stale).filter({ hasText: 'registration is already open for this account; it can be opened again once that hour has passed' })).toBeVisible();
    await stale.close();

    // The keyboard finds the panel's one control, which ends the display on purpose; the focus then lands on what stands.
    await confirmer.page.keyboard.press('Tab');
    await expect(confirmer.page.getByRole('button', { name: 'Hide the code', exact: true })).toBeFocused();
    await confirmer.page.keyboard.press('Enter');
    await expect(confirmer.page.getByText(shown)).toHaveCount(0);
    await expect(keyState(confirmer.page, MEMBER)).toBeFocused();
    await expect(keyState(confirmer.page, MEMBER)).toContainText('open registration again after');
    expect(await confirmer.page.content()).not.toContain(code);

    // A reload keeps the opening and never the code; the other administrator sees the same.
    await confirmer.page.reload();
    await expect(keyBadge(confirmer.page, MEMBER, 'registration open')).toBeVisible();
    await expect(memberRow(confirmer.page, MEMBER)).toContainText('The code was shown once to the administrator who opened it.');
    await expect(memberRow(confirmer.page, MEMBER)).toContainText('If it was lost, open registration again after');
    await expect(confirmer.page.getByText(shown)).toHaveCount(0);
    expect(await confirmer.page.content()).not.toContain(code);
    await requester.page.reload();
    await expect(memberRow(requester.page, MEMBER)).toContainText('The code was shown once to the administrator who opened it.');
    expect(await requester.page.content()).not.toContain(code);

    // Refused: a wrong code against the opening. The step stays and still offers no key.
    await enterCode(returning.page, WRONG_CODE);
    await expectCodeRefused(returning.page);
    // A refresh keeps the step and asks for the code again.
    await returning.page.reload();
    await expect(returning.page.getByLabel('Code from PaidWhole')).toHaveValue('');

    // The code as a person types what they heard: lower case, a hyphen. Then the key, and a sign-in with it.
    await enterCode(returning.page, `${code.slice(0, 4).toLowerCase()}-${code.slice(4).toLowerCase()}`);
    await expect(returning.page.getByRole('button', { name: 'Register hardware key' })).toBeVisible();
    await expect(returning.page.getByLabel('Code from PaidWhole')).toHaveCount(0);
    // The screen says the code was taken, and the focus is on its heading (U4).
    await expect(returning.page.getByText('Code accepted.')).toBeVisible();
    await expect(returning.page.getByRole('heading', { level: 1 })).toBeFocused();
    expect(returning.page.url()).not.toContain(code);
    // A refresh after the right code shows the key step, not the code again.
    await returning.page.reload();
    await expect(returning.page.getByLabel('Code from PaidWhole')).toHaveCount(0);
    await returning.page.getByRole('button', { name: 'Register hardware key' }).click();
    await expect(returning.page).toHaveURL(/\/sign-in\/hardware-key\?reason=key_registered$/);
    await returning.page.getByLabel('Email').fill(personaEmail(MEMBER));
    await returning.page.getByRole('button', { name: 'Sign in with hardware key' }).click();
    await returning.page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
    await expect(returning.page.getByText('No practice to open')).toBeVisible();

    // The opening is spent and the account is as any other's: the console offers a request again, and no badge.
    await confirmer.page.reload();
    await expect(keyButton(confirmer.page, 'Request key removal for', MEMBER)).toBeVisible();
    await expect(keyBadge(confirmer.page, MEMBER, 'registration open')).toHaveCount(0);
    await expect(keyBadge(confirmer.page, MEMBER, 'keys removed')).toHaveCount(0);

    // The registry's own record: one removal confirmed by another than its requester, and one live key registered after it.
    const record = await withDatabase(async (client) => {
      const { rows } = await client.query<{ removals: string; two_people: boolean; keys_after: string }>(
        `SELECT count(*) AS removals,
                bool_and(r.requested_by <> r.decided_by AND r.requested_by <> r.user_id AND r.decided_by <> r.user_id) AS two_people,
                (SELECT count(*) FROM hardware_key k WHERE k.user_id = u.id AND k.registered_at > max(r.decided_at)) AS keys_after
           FROM "user" u JOIN hardware_key_removal r ON r.user_id = u.id AND r.state = 'confirmed'
          WHERE u.email = $1
          GROUP BY u.id`,
        [personaEmail(MEMBER)],
      );
      return rows[0];
    });
    expect(record).toEqual({ removals: '1', two_people: true, keys_after: '1' });
  } finally {
    await Promise.all([requester, confirmer, member, returning].map((one) => one.context.close()));
  }
});
