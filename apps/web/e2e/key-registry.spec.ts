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
    await expect(memberRow(requester.page, REQUESTER).getByRole('button', { name: 'Request key removal' })).toHaveCount(0);

    // Refused: an administrator not yet seven days in the role. Nothing is requested.
    await memberRow(requester.page, MEMBER).getByRole('button', { name: 'Request key removal' }).click();
    await expect(refusal(requester.page).filter({ hasText: 'only a platform administrator who has held the role for seven days' })).toBeVisible();
    await expect(memberRow(requester.page, MEMBER).getByText('key removal requested')).toHaveCount(0);

    await sevenDaysInTheRole();
    // The second administrator's page, read before any request stands.
    await confirmer.page.goto(consoleUrl);
    await expect(memberRow(confirmer.page, MEMBER).getByRole('button', { name: 'Request key removal' })).toBeVisible();

    // One requests. The requester is told another confirms, and is offered no confirmation.
    await requester.page.reload();
    await memberRow(requester.page, MEMBER).getByRole('button', { name: 'Request key removal' }).click();
    await expect(memberRow(requester.page, MEMBER).getByText('key removal requested')).toBeVisible();
    await expect(memberRow(requester.page, MEMBER)).toContainText('You asked to remove this account’s hardware keys');
    await expect(memberRow(requester.page, MEMBER)).toContainText('You cannot confirm your own request.');
    await expect(memberRow(requester.page, MEMBER).getByRole('button', { name: 'Confirm key removal' })).toHaveCount(0);
    await expect(memberRow(requester.page, MEMBER).getByRole('button', { name: 'Cancel request' })).toBeVisible();

    // Refused: a second request for the same account, from the page the other administrator read earlier.
    await memberRow(confirmer.page, MEMBER).getByRole('button', { name: 'Request key removal' }).click();
    await expect(refusal(confirmer.page).filter({ hasText: 'a removal is already requested for this account; confirm or cancel that one' })).toBeVisible();

    // A request changes nothing by itself: the member is still signed in.
    await member.page.reload();
    await expect(member.page.getByText('No practice to open')).toBeVisible();

    // Another confirms. The keys are removed and the member's session ends at once.
    await confirmer.page.reload();
    await expect(memberRow(confirmer.page, MEMBER)).toContainText(`${personaEmail(REQUESTER)} asked to remove this account’s hardware keys`);
    await memberRow(confirmer.page, MEMBER).getByRole('button', { name: 'Confirm key removal' }).click();
    await expect(memberRow(confirmer.page, MEMBER).getByText('keys removed', { exact: true })).toBeVisible();
    await expect(memberRow(confirmer.page, MEMBER).getByRole('button', { name: 'Open registration' })).toBeVisible();
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
    await expect(memberRow(stale, MEMBER).getByRole('button', { name: 'Open registration' })).toBeVisible();
    await memberRow(confirmer.page, MEMBER).getByRole('button', { name: 'Open registration' }).click();
    const panel = confirmer.page.getByRole('group', { name: `Registration code for ${personaEmail(MEMBER)}` });
    await expect(panel).toBeFocused();
    await expect(panel).toContainText(`Registration is open for ${personaEmail(MEMBER)} until`);
    const shown = (await panel.locator('span.font-mono').innerText()).trim();
    expect(shown).toMatch(/^[0-9A-Z]{4} [0-9A-Z]{4}$/);
    const code = shown.replace(' ', '');
    expect(confirmer.page.url()).toBe(consoleUrl);
    expect(await confirmer.page.title()).not.toContain(code);
    expect(await confirmer.page.title()).not.toContain(shown);
    expect(JSON.stringify(await confirmer.context.cookies())).not.toContain(code);
    expect(await confirmer.page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]))).not.toContain(code);

    // Refused: a second opening while one stands, from a page read before it.
    await memberRow(stale, MEMBER).getByRole('button', { name: 'Open registration' }).click();
    await expect(refusal(stale).filter({ hasText: 'registration is already open for this account; it can be opened again once that hour has passed' })).toBeVisible();
    await stale.close();

    // A reload keeps the opening and never the code; the other administrator sees the same.
    await confirmer.page.reload();
    await expect(memberRow(confirmer.page, MEMBER).getByText('registration open', { exact: true })).toBeVisible();
    await expect(memberRow(confirmer.page, MEMBER)).toContainText('The code was shown once to the administrator who opened it.');
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
    await expect(memberRow(confirmer.page, MEMBER).getByRole('button', { name: 'Request key removal' })).toBeVisible();
    await expect(memberRow(confirmer.page, MEMBER).getByText('registration open', { exact: true })).toHaveCount(0);
    await expect(memberRow(confirmer.page, MEMBER).getByText('keys removed', { exact: true })).toHaveCount(0);

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
