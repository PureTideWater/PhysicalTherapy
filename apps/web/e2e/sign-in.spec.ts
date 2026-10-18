import { expect, test } from '@playwright/test';

import { SYNTHETIC_PRACTICES, personaEmail, personaPassword } from '../scripts/synthetic-personas';
import { enterPassword, practiceId, refusal, signInWithTotp, withDatabase } from './helpers';

/**
 * Sign-in and sessions in the browser (PRD 6 and 7; docs/product/sessions.md; test matrix SEC-15):
 * TOTP sign-in into the practice workspace, a user without MFA refused on a PHI route, the
 * ten-failure lockout, the 30-minute idle expiry and device revocation. Each test signs in as its own
 * synthetic persona (a TOTP code is accepted once).
 */

test('signs in with a password and a TOTP code, into a private, no-store practice workspace listing only the reachable practices', async ({ page }) => {
  await signInWithTotp(page, 'practice-admin');
  const north = await practiceId('north');
  await expect(page).toHaveURL(new RegExp(`/p/${north}$`));
  await expect(page.getByRole('heading', { level: 1, name: SYNTHETIC_PRACTICES.north })).toBeVisible();
  await page.getByLabel('Practice switcher').click();
  const switcher = page.getByRole('list', { name: 'Practices' });
  await expect(switcher.getByRole('link')).toHaveText([SYNTHETIC_PRACTICES.north, SYNTHETIC_PRACTICES.south]);
  await expect(page.getByText(SYNTHETIC_PRACTICES.other)).toHaveCount(0);
  const response = await page.goto(`/p/${north}`);
  expect(response?.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
  // Another group's practice is not there for this user, and the response says so: a 404, not a 200.
  const other = await practiceId('other');
  const notFound = await page.goto(`/p/${other}`);
  expect(notFound?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await expect(page.getByText(SYNTHETIC_PRACTICES.other)).toHaveCount(0);
  // The sign-in is in the audit log.
  const events = await withDatabase(async (client) =>
    (await client.query<{ action: string }>('SELECT e.action FROM audit_event e JOIN "user" u ON u.id = e.actor_id WHERE u.email = $1 ORDER BY e.at', [personaEmail('practice-admin')])).rows.map((row) => row.action),
  );
  expect(events).toContain('sign_in');
});

test('refuses a user without MFA on a PHI route, before and after they choose a password', async ({ page }) => {
  const north = await practiceId('north');
  await enterPassword(page, 'invited');
  await expect(page).toHaveURL(/\/sign-in\/new-password$/);
  await page.goto(`/p/${north}`);
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByText(SYNTHETIC_PRACTICES.north)).toHaveCount(0);
  await enterPassword(page, 'invited');
  await page.getByLabel('New password', { exact: true }).fill('Chosen-Synthetic-Pass-2026!');
  await page.getByLabel('New password again').fill('Chosen-Synthetic-Pass-2026!');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page).toHaveURL(/\/sign-in\/enroll$/);
  await expect(page.getByRole('heading', { name: 'Set up two-step verification' })).toBeVisible();
  await page.goto(`/p/${north}`);
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('locks the account after ten failed sign-ins, even against the right password', async ({ page }) => {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    await enterPassword(page, 'lockout', 'Wrong-Synthetic-Pass-2026!');
    await expect(refusal(page)).toContainText(attempt < 10 ? 'did not match' : 'locked after ten failed attempts');
  }
  await enterPassword(page, 'lockout', personaPassword('lockout'));
  await expect(refusal(page)).toContainText('Account locked');
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('expires a session idle for more than 30 minutes on a PHI screen (SEC-15)', async ({ page }) => {
  await signInWithTotp(page, 'idle');
  const north = await practiceId('north');
  await expect(page).toHaveURL(new RegExp(`/p/${north}$`));
  // The database decides idleness from last_seen_at; move it 31 minutes back rather than wait.
  await withDatabase((client) =>
    client.query(
      "UPDATE user_session SET last_seen_at = now() - interval '31 minutes' WHERE ended_at IS NULL AND user_id = (SELECT id FROM \"user\" WHERE email = $1)",
      [personaEmail('idle')],
    ),
  );
  const reloaded = await page.reload();
  await expect(page).toHaveURL(/\/sign-in\?reason=idle$/);
  await expect(page.getByText('You were signed out after 30 minutes without activity')).toBeVisible();
  // Refused at the HTTP layer too: a redirect status, not a page streamed with 200 (sessions.md: "the
  // next request is refused").
  expect((await reloaded?.request().redirectedFrom()?.response())?.status()).toBe(307);
  // The session stays ended: the next request is refused too.
  const again = await page.request.get(`/p/${north}`, { maxRedirects: 0 });
  expect([again.status(), again.headers().location]).toEqual([307, expect.stringMatching(/\/sign-in\?reason=ended$/)]);
});

test('refuses a request without a session with a redirect status before any page is sent', async ({ request }) => {
  const north = await practiceId('north');
  const response = await request.get(`/p/${north}`, { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toMatch(/\/sign-in$/);
  expect(await response.text()).not.toContain(SYNTHETIC_PRACTICES.north);
});

test('lists the devices signed in from and revokes one, ending its session', async ({ page }) => {
  await signInWithTotp(page, 'devices');
  await page.goto('/account/devices');
  await expect(page.getByRole('heading', { level: 1, name: 'Devices' })).toBeVisible();
  const device = page.getByRole('list', { name: 'Devices' }).getByRole('listitem');
  await expect(device).toHaveCount(1);
  await expect(device).toContainText('This device');
  await page.getByRole('button', { name: 'Revoke this device and sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in\?reason=device_revoked$/);
  await expect(page.getByText('This device was revoked')).toBeVisible();
  await page.goto('/account/devices');
  await expect(page).toHaveURL(/\/sign-in$/);
});
