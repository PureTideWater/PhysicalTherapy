import { expect, test } from '@playwright/test';

import {
  SYNTHETIC_CONSOLE_SUSPENSION_FIRM,
  SYNTHETIC_FIRM_CLIENT_PRACTICE,
  SYNTHETIC_PRACTICES,
  SYNTHETIC_SUSPENDED_FIRM,
  SYNTHETIC_SUSPENDED_GROUP,
} from '../scripts/synthetic-personas';
import { atPhoneWidth, expectAccessible } from './a11y';
import { refusal, registerKeyAndSignIn, signInWithTotp, withDatabase } from './helpers';

/**
 * Billing in the browser (PRD 5, J18; PRD 6, Billing acceptance: "A test ACH payment completes"; PRD 7,
 * Settings: billing; docs/adr/0050, 0073), on the local Stripe test-mode simulator the e2e server runs with:
 * the group's practice administrator opens Settings, Billing, reads that a bank account is preferred and that a
 * plan waits for a payment method, adds the simulator's test bank account, chooses the monthly plan, settles the
 * test ACH debit and sees the invoice paid. Stripe's events reach the application through the same verification
 * and processing the webhook route uses; the webhook route itself refuses a body without Stripe's signature.
 * A suspended organization's page (BIL-06) is read on SYNTHETIC SUSPENDED GROUP, which the seed holds suspended by
 * PaidWhole and no other journey touches, so nothing here suspends or reinstates an organization another journey
 * shares; billing-routes.db.test.ts covers suspending and reinstating. A firm PaidWhole suspended (BIL-09; docs/adr/0080)
 * is read on SYNTHETIC SUSPENDED FIRM and SYNTHETIC FIRM CLIENT PRACTICE, which the seed holds and nothing reinstates;
 * the console's suspension is made and lifted on SYNTHETIC CONSOLE SUSPENSION FIRM, which no other journey reads.
 * Synthetic data only.
 */

/** A seeded organization's ID, by its name. */
async function organizationNamed(name: string): Promise<string> {
  return withDatabase(async (client) => {
    const { rows } = await client.query<{ id: string }>('SELECT id FROM organization WHERE name = $1', [name]);
    const [row] = rows;
    if (row === undefined) {
      throw new Error('the seeded organization is missing');
    }
    return row.id;
  });
}

/** SYNTHETIC FIRM CLIENT PRACTICE's ID. */
async function clientPractice(): Promise<string> {
  return withDatabase(async (client) => {
    const { rows } = await client.query<{ id: string }>('SELECT id FROM practice WHERE name = $1', [SYNTHETIC_FIRM_CLIENT_PRACTICE]);
    const [row] = rows;
    if (row === undefined) {
      throw new Error('the seeded client practice is missing');
    }
    return row.id;
  });
}

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

test('a group suspended by PaidWhole reads "Suspended by PaidWhole", never "In good standing", with the notice, the support ticket’s link and the note that payment does not reinstate it (BIL-06)', async ({ page }) => {
  const group = await withDatabase(async (client) => (await client.query<{ id: string; status: string }>('SELECT id, status FROM organization WHERE name = $1', [SYNTHETIC_SUSPENDED_GROUP])).rows);
  expect(group.map((row) => row.status)).toEqual(['suspended']);
  const organizationId = group[0]?.id ?? '';
  await signInWithTotp(page, 'suspended-admin');
  await page.goto(`/settings/billing/${organizationId}`);
  await expect(page.getByRole('heading', { level: 1, name: `Billing: ${SYNTHETIC_SUSPENDED_GROUP}` })).toBeVisible();

  await expect(page.locator('[data-standing]')).toHaveAttribute('data-standing', 'suspended_by_paidwhole');
  // The seed stores PaidWhole's reason (at the customer's request) and the trigger its time, so the label carries the
  // date and the notice and its step follow the reason (BIL-09, B1, B3, B7).
  await expect(page.locator('[data-standing]')).toContainText(/Standing: Suspended by PaidWhole since \d{4}-\d{2}-\d{2}/);
  await expect(page.getByText('In good standing')).toHaveCount(0);
  const notice = page.getByRole('alert').filter({ hasText: 'PaidWhole has suspended the organization' });
  await expect(notice).toContainText(
    'PaidWhole has suspended the organization at your request: new runs have stopped until PaidWhole reinstates it, and its data stays readable. Paying an invoice does not reinstate it.',
  );
  await expect(notice).toContainText('Open a support ticket when you want the organization reinstated.');
  const ticket = notice.getByRole('link', { name: 'Open a support ticket' });
  await expect(ticket).toHaveAttribute('href', '/support?from=billing');
  await expect(page.locator('[data-notice="forms"]')).toHaveText('Changing the plan or payment method does not reinstate an organization suspended by PaidWhole.');
  await expectAccessible(page, 'Organization billing, suspended by PaidWhole');

  // The link opens the support form on the Billing category, from the billing screen.
  await ticket.click();
  await expect(page).toHaveURL(/\/support\?from=billing$/);
  await expect(page.getByLabel('What is it about')).toHaveValue('billing');
});

test('a firm PaidWhole suspended: its principal reads why on the client practice’s home, and starts no upload or pricing run there through its grant (BIL-09)', async ({ page }) => {
  const practiceId = await clientPractice();
  const firmId = await organizationNamed(SYNTHETIC_SUSPENDED_FIRM);
  await signInWithTotp(page, 'suspended-firm-principal');
  await page.goto(`/p/${practiceId}`);
  const notice = page.locator('[data-notice="suspended"]');
  await expect(notice).toHaveAttribute('data-hold-source', 'grantee');
  await expect(notice).toContainText("Work through your organization's grant has stopped");
  await expect(notice).toContainText(
    new RegExp(
      `PaidWhole suspended ${SYNTHETIC_SUSPENDED_FIRM} on \\d{4}-\\d{2}-\\d{2}, while it looks into a security concern, so you start no new pricing runs, triage, reports, ROI statements, packet exports or uploads at this practice through its grant until PaidWhole reinstates ${SYNTHETIC_SUSPENDED_FIRM}\\. You can still read everything here, and the practice's own staff carry on\\.`,
    ),
  );
  // The principal holds the firm's billing (H8).
  await expect(notice.getByRole('link', { name: 'Settings, Billing' })).toHaveAttribute('href', `/settings/billing/${firmId}`);
  await expect(notice).toContainText('Settings, Billing shows why and what to do next.');
  await expectAccessible(page, 'Practice home, a firm held by PaidWhole');

  const paused =
    "Uploads are paused: PaidWhole has suspended your organization, so you start no new work here through its grant until PaidWhole reinstates your organization; you can still read this practice's records.";
  await page.goto(`/p/${practiceId}/uploads`);
  await expect(page.getByText(paused)).toBeVisible();
  await expectAccessible(page, 'Uploads, a firm held by PaidWhole');

  await page.goto(`/p/${practiceId}/pricing-runs`);
  await page.getByLabel('First month of service').fill('2026-09');
  await page.getByRole('button', { name: 'Create the run' }).click();
  await expect(refusal(page).filter({ hasText: 'Not started: ' })).toContainText(
    "Not started: PaidWhole has suspended your organization, so you start no new work here through its grant until PaidWhole reinstates your organization; you can still read this practice's records.",
  );
  await expectAccessible(page, 'Pricing runs, a run refused for a firm held by PaidWhole');
  const runs = await withDatabase(async (client) => (await client.query('SELECT 1 FROM pricing_run WHERE practice_id = $1', [practiceId])).rowCount);
  expect(runs).toBe(0);

  // The firm's own billing page says what its suspension stops (B1, B4, B7).
  await page.goto(`/settings/billing/${firmId}`);
  await expect(page.locator('[data-standing]')).toContainText(/Standing: Suspended by PaidWhole since \d{4}-\d{2}-\d{2}/);
  await expect(page.getByRole('alert').filter({ hasText: 'PaidWhole has suspended the organization' })).toContainText(
    "PaidWhole has suspended the organization while it looks into a security concern: your people start no new work through its grants at the practices you are granted until PaidWhole reinstates the organization. Every record stays readable, and the practices' own staff carry on.",
  );
  await expectAccessible(page, 'Organization billing, a firm suspended by PaidWhole');
});

test('the client practice’s own administrator sees no hold, and reads the held firm’s grant as on hold, never why (BIL-09, G1)', async ({ page }) => {
  const practiceId = await clientPractice();
  await signInWithTotp(page, 'firm-client-admin');
  await page.goto(`/p/${practiceId}`);
  await expect(page.getByRole('heading', { level: 1, name: SYNTHETIC_FIRM_CLIENT_PRACTICE })).toBeVisible();
  await expect(page.locator('[data-notice="suspended"]')).toHaveCount(0);
  await page.goto(`/p/${practiceId}/uploads`);
  await expect(page.getByText('Uploads are paused')).toHaveCount(0);
  await page.goto(`/p/${practiceId}/settings/agreements`);
  const state = page.locator('[data-grantee-status="suspended"]');
  await expect(state).toHaveText(
    `In force. The PaidWhole account of ${SYNTHETIC_SUSPENDED_FIRM} is on hold, so its people start no new work here through this grant; your own staff carry on.`,
  );
  await expectAccessible(page, 'Grants and agreements, a grantee on hold');
});

test('a platform administrator suspends a firm with a reason, a note and the tick, reads who and why on its card and in its history, and reinstates it in one click (BIL-09)', async ({ page }) => {
  test.setTimeout(120_000);
  const firmId = await organizationNamed(SYNTHETIC_CONSOLE_SUSPENSION_FIRM);
  await registerKeyAndSignIn(page, 'suspension-admin');
  await page.goto(`/console/organizations/${firmId}`);
  const card = page.locator('[data-suspension]');
  await expect(card).toHaveAttribute('data-suspension', 'active');
  await expectAccessible(page, 'Console organization, an active firm');
  // The card's forms at a phone's width (FRM-08, TBL-02; docs/adr/0077, 0078): no sideways scroll, controls at 16 px.
  await atPhoneWidth(page, 'Console organization, an active firm');
  await page.locator('#suspend-reason').selectOption('customer_request');
  await page.locator('#suspend-note').fill('SYNTHETIC NOTE: the customer asked by ticket SYN-1');
  // Refused for the tick the browser would ask for (its required attribute taken off, as a post without the browser's
  // check would arrive): the form keeps the reason and the note, names the box "Confirmation" by its label, marks it,
  // and focuses it, the one field refused (FRM-01, FRM-04, FRM-05; docs/adr/0077). Nothing is written.
  const confirm = page.locator('#suspend-confirm');
  await confirm.evaluate((box) => {
    box.removeAttribute('required');
  });
  await page.getByRole('button', { name: 'Suspend the organization' }).click();
  const suspendForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Suspend the organization', exact: true }) });
  await expect(suspendForm.locator('[data-slot="refusal-summary"]')).toContainText('Confirmation: tick to confirm what the suspension stops');
  await expect(confirm).toHaveAttribute('aria-invalid', 'true');
  await expect(confirm).toBeFocused();
  await expect(page.locator('#suspend-reason')).toHaveValue('customer_request');
  await expect(page.locator('#suspend-note')).toHaveValue('SYNTHETIC NOTE: the customer asked by ticket SYN-1');
  await expect(card).toHaveAttribute('data-suspension', 'active');
  await expectAccessible(page, 'Console organization, the suspension refused for its tick');
  await confirm.check();
  await page.getByRole('button', { name: 'Suspend the organization' }).click();
  await expect(card).toHaveAttribute('data-suspension', 'suspended');
  await expect(card.locator('[data-suspended-lines]')).toContainText(/Suspended by suspension-admin@synthetic\.test on \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\./);
  await expect(card.locator('[data-suspended-lines]')).toContainText("Reason: At the customer's request.");
  await expect(page.locator('tr[data-change="suspended"]')).toContainText('SYNTHETIC NOTE: the customer asked by ticket SYN-1');
  await expectAccessible(page, 'Console organization, a suspended firm with its history');
  await page.getByRole('button', { name: 'Reinstate: the cause is resolved' }).click();
  await expect(card).toHaveAttribute('data-suspension', 'active');
  await expect(page.locator('tr[data-change="reinstated"]')).toContainText('The cause is resolved');
  // The history at a phone's width scrolls sideways in its own region and says so (TBL-02, TBL-03; docs/adr/0078).
  await atPhoneWidth(page, 'Console organization, a reinstated firm with its history', { tables: ['History'] });
  const stored = await withDatabase(async (client) => (await client.query<{ status: string; status_reason: string | null }>('SELECT status, status_reason FROM organization WHERE id = $1', [firmId])).rows);
  expect(stored).toEqual([{ status: 'active', status_reason: null }]);
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
