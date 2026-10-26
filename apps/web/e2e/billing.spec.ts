import { expect, test } from '@playwright/test';

import { SYNTHETIC_PRACTICES } from '../scripts/synthetic-personas';
import { expectAccessible } from './a11y';
import { signInWithTotp, withDatabase } from './helpers';

/**
 * Billing in the browser (PRD 5, J18; PRD 6, Billing acceptance: "A test ACH payment completes"; PRD 7,
 * Settings: billing; docs/adr/0050, 0073), on the local Stripe test-mode simulator the e2e server runs with:
 * the group's practice administrator opens Settings, Billing, reads that a bank account is preferred and that a
 * plan waits for a payment method, adds the simulator's test bank account, chooses the monthly plan, settles the
 * test ACH debit and sees the invoice paid. Stripe's events reach the application through the same verification
 * and processing the webhook route uses; the webhook route itself refuses a body without Stripe's signature.
 * Nothing here suspends an organization (the other journeys share the group); billing-routes.db.test.ts covers
 * suspension. Synthetic data only.
 */

async function seededGroup(): Promise<{ readonly id: string; readonly name: string }> {
  return withDatabase(async (client) => {
    const { rows } = await client.query<{ id: string; name: string }>('SELECT o.id, o.name FROM practice p JOIN organization o ON o.id = p.organization_id WHERE p.name = $1', [SYNTHETIC_PRACTICES.north]);
    const [row] = rows;
    if (row === undefined) {
      throw new Error('the seeded group is missing');
    }
    return row;
  });
}

test('an organization administrator pays by test ACH: the bank account, the monthly plan, the settled debit and the paid invoice (J18)', async ({ page, baseURL }) => {
  const group = await seededGroup();
  // In test mode nothing loads from Stripe (Stripe.js loads only when Stripe's own form starts).
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(baseURL ?? '') && !url.startsWith('data:')) {
      foreign.push(url);
    }
  });
  await signInWithTotp(page, 'practice-admin');
  await page.getByRole('navigation', { name: 'Account' }).getByRole('link', { name: 'Billing' }).click();
  await expect(page).toHaveURL(/\/settings\/billing$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Billing' })).toBeVisible();
  await expectAccessible(page, 'Settings, billing');

  await page.getByRole('link', { name: group.name }).click();
  await expect(page).toHaveURL(new RegExp(`/settings/billing/${group.id}$`));
  await expect(page.locator('[data-payment-method]')).toHaveAttribute('data-payment-method', 'none');
  await expect(page.getByLabel('Test mode')).toBeVisible();
  await expectAccessible(page, 'Organization billing');
  // The bank account is the preferred method (BIL-03; docs/adr/0073), said before any method is on file.
  await expect(page.locator('[data-notice="ach-preferred"]')).toBeVisible();
  await expect(page.locator('[data-notice="ach-preferred"]')).toHaveText('A bank account (ACH) is preferred for annual plans and audits.');
  // A plan needs a method on file, so with none the Plan card shows the prices and asks for one first, with no form.
  await expect(page.locator('[data-plan="needs-method"]')).toContainText('Add a payment method above, then choose a plan here.');
  await expect(page.getByRole('button', { name: 'Choose plan' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Add test bank account (ACH)' }).click();
  await expect(page.locator('[data-payment-method]')).toHaveAttribute('data-payment-method', 'us_bank_account');
  await expect(page.locator('[data-payment-method]')).toHaveText('On file: bank account (ACH) ending in 6789, Simulator test bank');
  // With the bank account on file, only that a new method replaces it (BIL-03).
  await expect(page.locator('[data-notice="ach-preferred"]')).toHaveCount(0);
  await expect(page.locator('[data-notice="replaces"]')).toHaveText('A new payment method replaces the one on file.');
  await expect(page.locator('[data-plan="needs-method"]')).toHaveCount(0);

  await page.getByLabel('Plan').selectOption('monthly');
  await page.getByRole('button', { name: 'Choose plan' }).click();
  await expect(page.locator('[data-plan="monthly"]')).toBeVisible();
  // The debit has started; the bank has not settled it.
  await expect(page.locator('[data-invoice-status="open"]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Settle pending test ACH payments' }).click();
  await expect(page.locator('[data-invoice-status="paid"]')).toHaveCount(1);
  await expect(page.locator('[data-invoice-status="paid"]')).toContainText('Bank account (ACH)');
  await expectAccessible(page, 'Organization billing, paid');

  const recorded = await withDatabase(async (client) => ({
    invoices: (
      await client.query<{ status: string; paid: boolean; method: string | null; remaining: string }>(
        'SELECT status, paid_at IS NOT NULL AS paid, payment_method_kind AS method, amount_remaining_cents::text AS remaining FROM invoice WHERE organization_id = $1',
        [group.id],
      )
    ).rows,
    subscription: (await client.query<{ plan: string; status: string }>('SELECT plan, status FROM subscription WHERE organization_id = $1', [group.id])).rows,
  }));
  expect(recorded).toEqual({ invoices: [{ status: 'paid', paid: true, method: 'us_bank_account', remaining: '0' }], subscription: [{ plan: 'monthly', status: 'active' }] });
  expect(foreign).toEqual([]);
});

test('the webhook route refuses a body without Stripe’s signature, and records nothing', async ({ request }) => {
  const response = await request.post('/api/billing/webhook', {
    headers: { 'content-type': 'application/json' },
    data: '{"id":"evt_unsigned_e2e","object":"event","type":"invoice.paid","created":1,"data":{"object":{}}}',
  });
  expect(response.status()).toBe(400);
  expect(response.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
  const recorded = await withDatabase(async (client) => (await client.query("SELECT 1 FROM billing_event WHERE stripe_event_id = 'evt_unsigned_e2e'")).rowCount);
  expect(recorded).toBe(0);
});
