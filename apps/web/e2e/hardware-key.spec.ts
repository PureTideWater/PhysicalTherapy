import { expect, test } from '@playwright/test';

import { SYNTHETIC_PRACTICES, personaEmail } from '../scripts/synthetic-personas';
import { practiceId, registerKeyAndSignIn, signInWithTotp, withDatabase } from './helpers';

/**
 * Internal roles and support access (PRD 3; PRD 5, J15; test matrix SEC-05): an internal role signs
 * in with a hardware key only (a virtual WebAuthn authenticator stands in for it), the platform
 * administrator creates a break-glass grant from a ticket in the console, ends it when the ticket
 * closes, and reads no practice without one; and a support grant ends at four hours.
 */

test('makes an internal role use a hardware key, and lets the platform administrator open a break-glass grant from a ticket', async ({ page, browser }) => {
  await registerKeyAndSignIn(page, 'platform-admin');
  await expect(page).toHaveURL(/\/console\/organizations$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Organizations and practices' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'SYNTHETIC THERAPY GROUP' })).toBeVisible();
  // No admin screen reads PHI without a support grant: the practice's workspace is not there.
  const north = await practiceId('north');
  await page.goto(`/p/${north}`);
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();

  await page.goto('/console/support');
  await page.getByLabel('Practice').selectOption({ label: SYNTHETIC_PRACTICES.north });
  await page.getByLabel('Support engineer').selectOption({ label: `${personaEmail('support')} (Support engineer)` });
  await page.getByLabel('Ticket').fill('SYN-E2E-1');
  await page.getByLabel('Reason').fill('SYNTHETIC E2E REASON');
  await page.getByRole('button', { name: 'Create support grant' }).click();
  const row = page.locator('tr[data-ticket="SYN-E2E-1"]');
  await expect(row).toContainText('Open');
  await expect(row).toContainText(personaEmail('support'));

  // The support engineer reaches the practice under the grant, with their own hardware key.
  const engineer = await browser.newPage();
  await registerKeyAndSignIn(engineer, 'support');
  await expect(engineer).toHaveURL(new RegExp(`/p/${north}$`));
  await expect(engineer.getByText('a support grant (break-glass, four hours)')).toBeVisible();

  // The ticket closes early: the platform administrator ends the grant, and the engineer's next request finds nothing.
  await row.getByRole('button', { name: 'End now' }).click();
  await expect(page.locator('tr[data-ticket="SYN-E2E-1"]')).toContainText('Ended');
  const after = await engineer.goto(`/p/${north}`);
  expect(after?.status()).toBe(404);
  await expect(engineer.getByText(SYNTHETIC_PRACTICES.north)).toHaveCount(0);
  await engineer.close();

  // Password and TOTP alone open nothing for an internal role that has a key.
  const other = await browser.newPage();
  await signInWithTotp(other, 'platform-admin', true);
  await expect(other).toHaveURL(/\/sign-in\/hardware-key\?reason=hardware_key_required$/);
  await other.goto('/console/organizations');
  await expect(other).toHaveURL(/\/sign-in$/);
  await other.close();
});

test('shows an internal role without the permission the permission state', async ({ page }) => {
  await registerKeyAndSignIn(page, 'contract-specialist');
  // A contract specialist starts at the specialist queue, which reaches no practice without a grant.
  await expect(page.getByRole('heading', { level: 1, name: 'Specialist queue' })).toBeVisible();
  await page.goto('/console/support');
  await expect(page.getByText('Not available to your role')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create support grant' })).toHaveCount(0);
});

test('ends support access at four hours (SEC-05)', async ({ page }) => {
  const north = await practiceId('north');
  await registerKeyAndSignIn(page, 'support-expiry');
  await expect(page.getByText('No practice to open')).toBeVisible();
  // A grant whose four hours end a few seconds from now; the database's clock decides.
  await withDatabase((client) =>
    client.query(
      `INSERT INTO support_grant (practice_id, user_id, ticket, reason, created_at, expires_at)
       SELECT $1, u.id, 'SYN-E2E-2', 'SYNTHETIC E2E', now() - interval '4 hours' + interval '12 seconds', now() + interval '12 seconds'
         FROM "user" u WHERE u.email = $2`,
      [north, personaEmail('support-expiry')],
    ),
  );
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`/p/${north}$`));
  await expect(page.getByRole('heading', { level: 1, name: SYNTHETIC_PRACTICES.north })).toBeVisible();
  await expect
    .poll(
      async () => {
        await page.goto(`/p/${north}`);
        return page.getByRole('heading', { name: 'Not found' }).isVisible();
      },
      { timeout: 30_000, intervals: [2_000] },
    )
    .toBe(true);
  await expect(page.getByText(SYNTHETIC_PRACTICES.north)).toHaveCount(0);
});
