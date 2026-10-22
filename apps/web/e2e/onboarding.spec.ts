import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { type Page, expect, test } from '@playwright/test';

import { personaEmail } from '../scripts/synthetic-personas';
import { LocalESignature } from '../src/lib/agreements/esign';
import { totpCode } from '../src/lib/auth/totp';
import { atPhoneWidth, expectAccessible } from './a11y';
import { E2E_DEV_AUTH_DIR, E2E_ESIGN_DIR, E2E_ESIGN_SECRET } from './env';
import { refusal, registerKeyAndSignIn, signInWithTotp, withDatabase } from './helpers';
import { chainFrom, queue, until } from './journeys';
import { PREPARED_SPLIT } from './split';
import { LOCATION_PRACTICE_PREFIX, startLocalWorker } from './worker';

/**
 * Customer onboarding end to end on the local providers (PRD 5, J1 and J2; milestone 11's done-check: "A new
 * customer signs up, enrolls MFA, pays by test ACH and reaches the dashboard"; docs/adr/0053): the public audit
 * request; the platform administrator turns it into a practice group, adds its practice, records the agreement
 * chain (one uploaded, three through the e-signature stand-in's signed webhook) and invites the practice
 * administrator; the invitee sets a password from the emailed temporary one, enrolls MFA, accepts the terms of
 * use, confirms the agreement chain, invites a billing manager and a viewer, pays by test ACH on the billing
 * simulator, and reaches the dashboard. Then the CSRF refusals and a rate-limited sign-in. And a practice created with no
 * seeded settings reaches a priced month from its billing ZIP alone, while a practice whose ZIP needs its ZIP+4 waits
 * for it (audit #33; PR 6b; docs/adr/0064). Synthetic only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');

/** Fails if the page scrolls sideways at this width (the screens work at 390 px). */
async function noSidewaysScroll(page: Page, width: number, what: string): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scroll, `${what} at ${String(width)} px scrolls sideways`).toBeLessThanOrEqual(inner);
  await page.setViewportSize({ width: 1280, height: 900 });
}

const PDF = Buffer.from('%PDF-1.4\n% SYNTHETIC SIGNED AGREEMENT FOR E2E\n%%EOF\n');

/** The temporary password the local identity provider "emailed" (its outbox, one JSON file per invitation). */
function temporaryPassword(email: string): string {
  const outbox = path.join(E2E_DEV_AUTH_DIR, 'outbox');
  const sent = readdirSync(outbox)
    .sort()
    .map((file) => JSON.parse(readFileSync(path.join(outbox, file), 'utf8')) as { email: string; temporaryPassword: string })
    .filter((message) => message.email === email);
  const last = sent.at(-1);
  if (last === undefined) {
    throw new Error('no invitation reached the outbox');
  }
  return last.temporaryPassword;
}

/** Collects the browser's Content Security Policy reports: a page that breaks the policy shows here. */
function watchCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to (load|execute|apply)/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  return violations;
}

test('a new customer is invited, signs up, enrolls MFA, accepts the terms, pays by test ACH and reaches the dashboard (J1, J2)', async ({ page, browser, request }) => {
  test.setTimeout(180_000);
  const run = randomUUID().slice(0, 8);
  const clinic = `SYNTHETIC ONBOARDING CLINIC ${run.toUpperCase()}`;
  const adminEmail = `onboarding-admin-${run}@synthetic.test`;
  const violations = watchCsp(page);

  await test.step('the public audit request, with no patient information', async () => {
    const response = await page.goto('/request-audit');
    // The security headers on a public page: the per-request policy with its nonce, and the fixed set.
    const headers = response?.headers() ?? {};
    expect(headers['content-security-policy']).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['strict-transport-security']).toMatch(/max-age=\d+/);
    await expectAccessible(page, 'Request an audit');
    await page.getByLabel('Your name').fill('Synthetic Contact');
    await page.getByLabel('Work email').fill(`contact-${run}@synthetic.test`);
    await page.getByLabel('Organization').fill(clinic);
    await page.getByLabel('Locations').fill('2');
    await page.getByLabel('Payers you bill').fill('Synthetic Payer One\nSynthetic Payer Two');
    await page.getByLabel('How you bill').selectOption('in_house');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText('Request received')).toBeVisible();
  });

  let organizationId = '';
  let practiceId = '';
  await test.step('the platform administrator creates the group, invites its administrator, creates the practice and records the agreements', async () => {
    await registerKeyAndSignIn(page, 'onboarding-admin');
    await page.goto('/console/prospects');
    await expect(page.getByRole('heading', { level: 1, name: 'Audit requests' })).toBeVisible();
    await expectAccessible(page, 'Audit requests');
    const row = page.getByRole('row').filter({ hasText: clinic });
    await row.getByRole('button', { name: 'Create practice group' }).click();
    await page.waitForURL(/\/console\/organizations\/[0-9a-f-]{36}$/);
    organizationId = page.url().split('/').at(-1) ?? '';
    await expect(page.getByRole('heading', { level: 1, name: clinic })).toBeVisible();
    // The practice administrator first: a practice always has one (the database refuses a practice otherwise).
    await page.locator('#field-email').fill(adminEmail);
    await page.locator('#field-role').selectOption('practice_admin');
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByRole('table', { name: 'Invitations' })).toContainText(adminEmail);
    await expectAccessible(page, 'Organization with invitations');
    await page.getByLabel('Practice name').fill(`${clinic} NORTH`);
    // The billing ZIP is required: a practice is created with its pricing location (audit #33, PR 6b).
    await page.getByLabel('Billing ZIP (ZIP+4 if Medicare needs one)').fill('00011');
    await page.getByRole('button', { name: 'Create practice' }).click();
    await expect(page.getByRole('link', { name: `${clinic} NORTH` }).or(page.getByText(`${clinic} NORTH`)).first()).toBeVisible();
    practiceId = await withDatabase(async (client) => (await client.query<{ id: string }>('SELECT id FROM practice WHERE organization_id = $1', [organizationId])).rows[0]?.id ?? '');
    expect(practiceId).toMatch(/^[0-9a-f-]{36}$/);

    // The BAA, uploaded as its signed PDF: the server hashes it.
    await page.locator('#upload-kind').selectOption('baa');
    await page.locator('#upload-practice').selectOption(practiceId);
    await page.locator('#upload-version').fill('1');
    await page.locator('#upload-signer').fill('SYNTHETIC SIGNER');
    await page.locator('#upload-signed-on').fill('2026-10-01');
    await page.locator('#upload-document').setInputFiles({ name: 'baa.pdf', mimeType: 'application/pdf', buffer: PDF });
    await page.getByRole('button', { name: 'Upload agreement' }).click();
    await expect(page.getByRole('table', { name: 'Agreements' })).toContainText('Business associate agreement');

    // The engagement letter, terms and data-rights addendum, through the e-signature vendor's signed webhook.
    const vendor = new LocalESignature({ secret: E2E_ESIGN_SECRET, directory: E2E_ESIGN_DIR });
    for (const kind of ['engagement', 'terms', 'data_rights'] as const) {
      const event = await vendor.complete({ organizationId, practiceId, kind, version: '1', signer: 'SYNTHETIC SIGNER', document: PDF, completedAt: new Date() });
      const response = await request.post('/api/agreements/webhook', { headers: { 'content-type': 'application/json', 'x-esign-signature': event.signature }, data: event.payload });
      expect(response.status(), kind).toBe(200);
      expect(await response.json()).toEqual({ received: true, outcome: 'recorded' });
    }
    // A forged event is refused before it is read.
    const forged = await request.post('/api/agreements/webhook', { headers: { 'content-type': 'application/json', 'x-esign-signature': `t=${String(Math.floor(Date.now() / 1000))},v1=${'0'.repeat(64)}` }, data: '{}' });
    expect(forged.status()).toBe(400);
    await page.reload();
    await expect(page.getByRole('table', { name: 'Agreements' }).getByRole('row')).toHaveCount(5);

  });

  await test.step('the evidence checklist shows every control, and its export is the compliance platform’s format', async () => {
    await page.goto('/console/compliance');
    await expect(page.getByRole('heading', { level: 1, name: 'SOC 2 Type I evidence' })).toBeVisible();
    await expect(page.locator('[data-control]')).toHaveCount(17);
    // Nothing a person must do is shown as done: the policies are drafts until the security official approves them.
    await expect(page.locator('[data-policy-status="awaiting_approval"]')).toHaveCount(6);
    await expectAccessible(page, 'SOC 2 evidence');
    const exported = await page.request.get('/console/compliance/export');
    expect(exported.status()).toBe(200);
    expect(exported.headers()['content-disposition']).toMatch(/attachment; filename="tp-compliance-evidence-\d{14}-[0-9a-f]{12}\.json"/);
    const evidence = (await exported.json()) as { format: string; controls: unknown[] };
    expect(evidence.format).toBe('tp-compliance-evidence/1');
    expect(evidence.controls).toHaveLength(17);
  });

  const context = await browser.newContext();
  const admin = await context.newPage();
  const adminViolations = watchCsp(admin);
  try {
    await test.step('the invited administrator sets a password and enrolls MFA', async () => {
      await admin.goto('/sign-in');
      await admin.getByLabel('Email').fill(adminEmail);
      await admin.getByLabel('Password').fill(temporaryPassword(adminEmail));
      await admin.getByRole('button', { name: 'Continue' }).click();
      await expect(admin).toHaveURL(/\/sign-in\/new-password$/);
      await admin.getByLabel('New password', { exact: true }).fill('Chosen-Onboarding-Pass-2026!');
      await admin.getByLabel('New password again').fill('Chosen-Onboarding-Pass-2026!');
      await admin.getByRole('button', { name: 'Save password' }).click();
      await expect(admin).toHaveURL(/\/sign-in\/enroll$/);
      const secret = (await admin.locator('[data-slot="totp-secret"]').getAttribute('data-secret')) ?? '';
      expect(secret).toMatch(/^[A-Z2-7]+$/);
      await admin.getByLabel('Six-digit code').fill(totpCode(secret, new Date()));
      await admin.getByRole('button', { name: 'Verify and continue' }).click();
    });

    await test.step('is asked to accept the terms of use first, and accepts them', async () => {
      await expect(admin).toHaveURL(/\/terms$/);
      await expect(admin.getByRole('heading', { level: 1, name: 'Terms of use' })).toBeVisible();
      await expectAccessible(admin, 'Terms of use');
      // Every screen sends them here until they accept.
      await admin.goto(`/p/${practiceId}`);
      await expect(admin).toHaveURL(/\/terms$/);
      await admin.getByRole('button', { name: 'I accept these terms' }).click();
      await expect(admin).toHaveURL(new RegExp(`/p/${practiceId}$`));
      const accepted = await withDatabase(async (client) =>
        (
          await client.query<{ version: string }>('SELECT t.version FROM terms_acceptance a JOIN terms_version t ON t.id = a.terms_version_id JOIN "user" u ON u.id = a.user_id WHERE u.email = $1', [
            adminEmail,
          ])
        ).rows,
      );
      expect(accepted).toEqual([{ version: 'synthetic-2026-10' }]);
    });

    await test.step('confirms the agreement chain', async () => {
      await admin.goto(`/p/${practiceId}/settings/agreements`);
      await expect(admin.locator('[data-on-file="yes"]')).toHaveCount(4);
      await expectAccessible(admin, 'Grants and agreements');
      await admin.getByLabel(/I have read these agreements/).check();
      await admin.getByRole('button', { name: 'Confirm the agreement chain' }).click();
      await expect(admin.getByText('Agreement chain confirmed')).toBeVisible();
    });

    await test.step('invites a billing manager and a viewer', async () => {
      await admin.goto(`/settings/organizations/${organizationId}/users`);
      await expectAccessible(admin, 'Users and roles');
      for (const [role, email] of [
        ['billing_manager', `onboarding-manager-${run}@synthetic.test`],
        ['viewer', `onboarding-viewer-${run}@synthetic.test`],
      ] as const) {
        await admin.getByLabel('Email').fill(email);
        await admin.locator('#invite-role').selectOption(role);
        await admin.getByRole('button', { name: 'Send invitation' }).click();
        await expect(admin.getByText('Invitation sent. It lasts seven days.')).toBeVisible();
        await expect(admin.getByRole('table', { name: 'Invitations' })).toContainText(email);
        expect(temporaryPassword(email)).not.toBe('');
      }
    });

    await test.step('pays by test ACH on the billing simulator', async () => {
      await admin.goto(`/settings/billing/${organizationId}`);
      await expect(admin.getByLabel('Test mode')).toBeVisible();
      await admin.getByRole('button', { name: 'Add test bank account (ACH)' }).click();
      await expect(admin.locator('[data-payment-method]')).toHaveAttribute('data-payment-method', 'us_bank_account');
      await admin.getByLabel('Plan').selectOption('monthly');
      await admin.getByRole('button', { name: 'Choose plan' }).click();
      await expect(admin.locator('[data-invoice-status="open"]')).toHaveCount(1);
      await admin.getByRole('button', { name: 'Settle pending test ACH payments' }).click();
      await expect(admin.locator('[data-invoice-status="paid"]')).toHaveCount(1);
    });

    await test.step('reaches the dashboard, with onboarding done but the first upload', async () => {
      await admin.goto(`/p/${practiceId}/settings`);
      for (const step of ['mfa', 'terms', 'agreements', 'team', 'billing']) {
        await expect(admin.locator(`[data-step="${step}"]`)).toHaveAttribute('data-done', 'yes');
      }
      await expect(admin.locator('[data-step="upload"]')).toHaveAttribute('data-done', 'no');
      await expectAccessible(admin, 'Settings');
      await admin.getByRole('navigation', { name: 'Practice' }).getByRole('link', { name: 'Practice home' }).click();
      await expect(admin).toHaveURL(new RegExp(`/p/${practiceId}$`));
      await expect(admin.getByRole('heading', { level: 1 })).toContainText(`${clinic} NORTH`);
      // Help on the screen, with support one link away.
      await admin.getByText('Help with this screen').click();
      await expect(admin.getByRole('link', { name: 'Ask support about this screen' })).toBeVisible();
    });
  } finally {
    await context.close();
  }
  expect([...violations, ...adminViolations]).toEqual([]);
});

test('refuses a mutation without the session’s CSRF token, with another session’s, or from another origin', async ({ page }) => {
  await signInWithTotp(page, 'viewer');
  const group = await withDatabase(async (client) => (await client.query<{ id: string }>("SELECT o.id FROM organization o WHERE o.name = 'SYNTHETIC THERAPY GROUP'")).rows[0]?.id ?? '');
  const target = `/api/billing/${group}/setup-intent`;
  const missing = await page.request.post(target, { headers: { 'content-type': 'application/json' }, data: { requestKey: randomUUID() } });
  expect(missing.status()).toBe(403);
  expect(await missing.json()).toMatchObject({ status: 'csrf_refused' });
  const wrong = await page.request.post(target, { headers: { 'content-type': 'application/json', 'x-csrf-token': 'not-this-sessions-token' }, data: { requestKey: randomUUID() } });
  expect(wrong.status()).toBe(403);
  const foreign = await page.request.post(target, { headers: { 'content-type': 'application/json', origin: 'https://elsewhere.example', 'sec-fetch-site': 'cross-site' }, data: { requestKey: randomUUID() } });
  expect(foreign.status()).toBe(403);
  // A sign-in step posted from another site is refused too (login CSRF).
  const login = await page.request.post('/api/sign-in/hardware-key/options', { headers: { 'content-type': 'application/json', origin: 'https://elsewhere.example' }, data: { email: personaEmail('viewer') } });
  expect(login.status()).toBe(403);
});

test('limits sign-in attempts on one account, and says how long to wait', async ({ page, request }) => {
  // An account no persona uses: twenty attempts in fifteen minutes, then a wait (docs/adr/0053).
  const email = `burst-${randomUUID().slice(0, 8)}@synthetic.test`;
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 21; attempt += 1) {
    const response = await request.post('/api/sign-in/hardware-key/options', { headers: { 'content-type': 'application/json' }, data: { email } });
    statuses.push(response.status());
    if (response.status() === 429) {
      expect(Number(response.headers()['retry-after'])).toBeGreaterThan(0);
      expect(await response.json()).toMatchObject({ status: 'rate_limited' });
    }
  }
  expect(statuses.slice(0, 20).every((status) => status !== 429)).toBe(true);
  expect(statuses.at(-1)).toBe(429);
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Any-Synthetic-Pass-2026!');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(refusal(page)).toContainText('Too many attempts');
  // Another account is not held back.
  await page.getByLabel('Email').fill(`calm-${randomUUID().slice(0, 8)}@synthetic.test`);
  await page.getByLabel('Password').fill('Any-Synthetic-Pass-2026!');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(refusal(page)).toBeVisible();
  await expect(refusal(page)).not.toContainText('Too many attempts');
});

test('shows the status page and the support form, and opens a ticket from a screen', async ({ page }) => {
  await page.goto('/status');
  await expect(page.getByRole('heading', { level: 1, name: 'Service status' })).toBeVisible();
  await expect(page.locator('[data-component]')).toHaveCount(7);
  await expectAccessible(page, 'Status page');
  await signInWithTotp(page, 'remittances-viewer');
  await page.goto('/support?from=remittances');
  await expectAccessible(page, 'Support');
  await page.getByLabel('Subject').fill('Where is the receipt?');
  await page.getByLabel('What happened, and what you expected').fill('I uploaded a file and want its receipt.');
  await page.getByRole('button', { name: 'Open ticket' }).click();
  await expect(page.getByText(/Ticket \d+ opened/)).toBeVisible();
  await expect(page.getByRole('table', { name: 'Tickets' })).toContainText('Where is the receipt?');
  const screen = await withDatabase(async (client) => (await client.query<{ screen: string }>("SELECT screen FROM support_ticket WHERE subject = 'Where is the receipt?'")).rows);
  expect(screen).toEqual([{ screen: 'remittances' }]);
});

/** The monitor job the daily schedule queues for a practice today, done (its singleton key, as the queue keys it). */
async function dailyPlanDone(practiceId: string, day: string): Promise<boolean> {
  return withDatabase(async (client) => {
    const { rows } = await client.query<{ done: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pgboss.job WHERE name = 'monitor' AND data ->> 'practice_id' = $1 AND data ->> 'day' = $2 AND state = 'completed') AS done",
      [practiceId, day],
    );
    return rows[0]?.done === true;
  });
}

test('a practice created with no seeded settings reaches a priced month from its billing ZIP; one whose ZIP needs its ZIP+4 waits for it (audit #33, PRC-23, PRC-24)', async ({ page, browser }) => {
  test.setTimeout(360_000);
  const run = randomUUID().slice(0, 8).toUpperCase();
  const group = `SYNTHETIC LOCATION GROUP ${run}`;
  const names = { ready: `${LOCATION_PRACTICE_PREFIX}${run} READY`, split: `${LOCATION_PRACTICE_PREFIX}${run} SPLIT ZIP` } as const;
  const practices = { ready: '', split: '' };
  const violations = watchCsp(page);

  await test.step('the platform administrator creates the group and its practices, each with its billing ZIP alone, and sees each location’s status', async () => {
    await registerKeyAndSignIn(page, 'location-admin');
    await page.goto('/console/organizations');
    await page.getByLabel('Kind').selectOption('group');
    await page.getByLabel('Name').fill(group);
    await page.getByRole('button', { name: 'Create organization' }).click();
    await page.waitForURL(/\/console\/organizations\/[0-9a-f-]{36}$/);
    const organizationId = page.url().split('/').at(-1) ?? '';
    // Its practice administrator and billing manager: two people of the other group the console adds.
    for (const [key, role] of [
      ['location-practice-admin', 'practice_admin'],
      ['location-manager', 'billing_manager'],
    ] as const) {
      await page.locator('#field-email').fill(personaEmail(key));
      await page.locator('#field-role').selectOption(role);
      await page.getByRole('button', { name: 'Send invitation' }).click();
      await expect(page.getByRole('table', { name: 'Members' })).toContainText(personaEmail(key));
    }
    // The billing ZIP is required; nothing else is set for either practice.
    const zip = page.getByLabel('Billing ZIP (ZIP+4 if Medicare needs one)');
    await expect(zip).toHaveAttribute('required', '');
    for (const [which, code, status, text] of [
      ['ready', '00011', 'ready', 'Created. Medicare prices this location in locality 99999-01 under rule release 900001.'],
      // A ZIP that needs its ZIP+4 is accepted, and flagged, never refused.
      ['split', '00012', 'zip_plus_four_needed', 'Created. Medicare splits ZIP 00012 between payment localities. Add its ZIP+4.'],
    ] as const) {
      const before = page.url();
      await page.getByLabel('Practice name').fill(names[which]);
      await zip.fill(code);
      await page.getByRole('button', { name: 'Create practice' }).click();
      await page.waitForURL((url) => url.href !== before && url.searchParams.has('created'));
      practices[which] = new URL(page.url()).searchParams.get('created') ?? '';
      const created = page.locator(`[data-practice="${practices[which]}"] [data-created-location]`);
      await expect(created).toHaveAttribute('data-created-location', status);
      await expect(created).toHaveText(text);
    }
    await expectAccessible(page, 'Organization with its new practices');
    const stored = await withDatabase(
      async (client) =>
        (
          await client.query<{ name: string; zip: string; zip_plus_four: string | null; settings: unknown; legacy_zip: string | null }>(
            'SELECT p.name, s.zip, s.zip_plus_four, p.settings, p.zip AS legacy_zip FROM practice p JOIN practice_site s ON s.practice_id = p.id WHERE p.organization_id = $1 ORDER BY s.zip',
            [organizationId],
          )
        ).rows,
    );
    // No seeded settings, and practice.zip never written: the location is the pricing location's (practice_site).
    expect(stored).toEqual([
      { name: names.ready, zip: '00011', zip_plus_four: null, settings: {}, legacy_zip: null },
      { name: names.split, zip: '00012', zip_plus_four: null, settings: {}, legacy_zip: null },
    ]);
    // Each practice's BAA, so its uploads open (J1).
    for (const which of ['ready', 'split'] as const) {
      await page.locator('#upload-kind').selectOption('baa');
      await page.locator('#upload-practice').selectOption(practices[which]);
      await page.locator('#upload-version').fill('1');
      await page.locator('#upload-signer').fill('SYNTHETIC SIGNER');
      await page.locator('#upload-signed-on').fill('2026-10-01');
      await page.locator('#upload-document').setInputFiles({ name: 'baa.pdf', mimeType: 'application/pdf', buffer: PDF });
      await page.getByRole('button', { name: 'Upload agreement' }).click();
      await expect(page.getByRole('table', { name: 'Agreements' }).getByRole('row')).toHaveCount(which === 'ready' ? 2 : 3);
    }
  });

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  const local = await startLocalWorker();
  try {
    await test.step('the practice administrator sees "Confirm your billing ZIP" in Getting started, and confirms it in Pricing settings', async () => {
      await signInWithTotp(admin, 'location-practice-admin');
      await admin.goto(`/p/${practices.ready}/settings`);
      const step = admin.locator('[data-step="billing_zip"]');
      await expect(step).toHaveAttribute('data-done', 'no');
      await step.getByRole('link', { name: 'Confirm your billing ZIP' }).click();
      await expect(admin).toHaveURL(new RegExp(`/p/${practices.ready}/settings/pricing$`));
      await expect(admin.getByRole('heading', { level: 1, name: 'Pricing settings' })).toBeVisible();
      await expect(admin.locator('[data-location-zip]')).toHaveText('00011');
      await expect(admin.locator('[data-location-status="ready"]')).toHaveText('Medicare prices this location in locality 99999-01 under rule release 900001.');
      await expect(admin.locator('[data-location-note]')).toHaveText('This location prices every month, earlier months too when they are re-run. If the practice moved, tell us before changing it. Contact support');
      // "tell us" names its channel: the support form.
      await expect(admin.locator('[data-location-note]').getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', '/support?from=settings');
      await expectAccessible(admin, 'Pricing settings');
      await noSidewaysScroll(admin, 390, 'Pricing settings');
      // The platform changes the location after this page loaded (as the console would): the confirmation sent from it
      // confirms nothing, and the page is read again, showing the location as it stands (verification of PR 6b-2,
      // finding 1).
      const moveTo = (zip: string, plusFour: string | null) =>
        withDatabase((client) => client.query('UPDATE practice_site SET zip = $2, zip_plus_four = $3 WHERE practice_id = $1', [practices.ready, zip, plusFour]));
      await moveTo('00012', '5000');
      await admin.getByRole('button', { name: 'Confirm the billing ZIP' }).click();
      await expect(admin.locator('[data-notice="changed"]')).toHaveText('The billing ZIP changed since this page loaded. Review it, then confirm.');
      await expect(admin).toHaveURL(new RegExp(`/p/${practices.ready}/settings/pricing\\?notice=changed$`));
      await expect(admin.locator('[data-location-zip]')).toHaveText('00012-5000');
      await expect(admin.getByRole('button', { name: 'Confirm the billing ZIP' })).toBeVisible();
      await expectAccessible(admin, 'Pricing settings after the location changed');
      await moveTo('00011', null);
      await admin.goto(`/p/${practices.ready}/settings/pricing`);
      await expect(admin.locator('[data-location-zip]')).toHaveText('00011');
      await admin.getByRole('button', { name: 'Confirm the billing ZIP' }).click();
      await expect(admin.locator('[data-notice="confirmed"]')).toBeVisible();
      await admin.goto(`/p/${practices.ready}/settings`);
      await expect(step).toHaveAttribute('data-done', 'yes');
    });

    await test.step('a month of Medicare Advantage lines, mapped without a contract, is priced at the location by the monitoring chain', async () => {
      await signInWithTotp(manager, 'location-manager');
      for (const which of ['ready', 'split'] as const) {
        const practiceId = practices[which];
        await manager.goto(`/p/${practiceId}/uploads`);
        await manager.getByLabel('Choose files to upload').setInputFiles([{ name: 'remit.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'CAS-08/remit.835')) }]);
        await expect(manager.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'remit.835' })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
        // Mapped as Medicare Advantage non-contracted, so every line reads the locality (the mapping journey's step).
        await manager.goto(`/p/${practiceId}/mapping`);
        const row = manager.getByRole('table', { name: 'Payers and plans' }).getByRole('row').filter({ hasText: 'SYNPLAN-FIX-ONE' });
        await row.getByRole('link', { name: 'CE:SYNPLAN-FIX-ONE' }).click();
        await manager.getByLabel('Agreement', { exact: true }).selectOption({ label: 'Medicare Advantage, non-contracted' });
        await manager.getByLabel('Effective from', { exact: true }).fill('2026-01-01');
        await manager.getByRole('button', { name: 'Save the mapping' }).click();
        await expect(manager.locator('[data-notice="mapped"]')).toBeVisible();
        const documentId = await withDatabase(
          async (client) => (await client.query<{ id: string }>("SELECT id FROM source_document WHERE practice_id = $1 AND kind = 'x12_835' ORDER BY created_at DESC LIMIT 1", [practiceId])).rows[0]?.id ?? '',
        );
        await chainFrom(practiceId, documentId);
      }
      await manager.goto(`/p/${practices.ready}/coverage`);
      await expect(manager.getByRole('region', { name: 'Priced share' })).toContainText('Priced: 3 of 3 lines (100.0%)');
      await expect(manager.getByRole('region', { name: 'Months waiting on your billing ZIP' })).toHaveCount(0);
      // The places of service come from the split prepare.ts approved: the practice set none, and no line waits on one.
      const pinned = await withDatabase(
        async (client) =>
          (
            await client.query<{ status: string; settings: unknown; unpriced: number }>(
              `SELECT r.status, s.settings, (SELECT count(*)::int FROM priced_line l WHERE l.pricing_run_id = r.id AND l.unpriced_reason IS NOT NULL) AS unpriced
                 FROM pricing_run r JOIN place_of_service_split s ON s.id = r.place_of_service_split_id WHERE r.practice_id = $1`,
              [practices.ready],
            )
          ).rows,
      );
      // (The screening journey may approve the same settings again meanwhile, so the run's split is read by its settings.)
      expect(pinned).toEqual([{ status: 'complete', settings: PREPARED_SPLIT, unpriced: 0 }]);
    });

    await test.step('the month of the practice whose ZIP needs its ZIP+4 waits with no line kept, is named with its dollars, and is not planned again each day', async () => {
      const runs = () =>
        withDatabase(
          async (client) =>
            (
              await client.query<{ status: string; failure_code: string | null; lines: number }>(
                'SELECT r.status, r.failure_code, (SELECT count(*)::int FROM priced_line l WHERE l.pricing_run_id = r.id) AS lines FROM pricing_run r WHERE r.practice_id = $1 ORDER BY r.created_at',
                [practices.split],
              )
            ).rows,
        );
      expect(await runs()).toEqual([{ status: 'failed', failure_code: 'location_not_ready', lines: 0 }]);
      await manager.goto(`/p/${practices.split}/coverage`);
      const waiting = manager.getByRole('region', { name: 'Months waiting on your billing ZIP' });
      await expect(waiting).toContainText('Months waiting on your billing ZIP: $450.00 billed');
      await expect(waiting.locator('[data-waiting-month="2026-03"]')).toContainText('Medicare splits ZIP 00012 between payment localities. Add its ZIP+4.');
      await expect(waiting.getByRole('link', { name: 'Pricing settings' })).toHaveAttribute('href', `/p/${practices.split}/settings/pricing`);
      await expectAccessible(manager, 'Coverage with a month waiting on the billing ZIP');
      // At a phone's width the waiting months' table scrolls inside a region the keyboard reaches.
      await atPhoneWidth(manager, 'Coverage with a waiting month');
      // The run's own failure, in words.
      await manager.goto(`/p/${practices.split}/pricing-runs`);
      await expect(manager.getByRole('list', { name: 'Pricing runs' })).toContainText('A line of the period needs the practice’s billing ZIP or ZIP+4: fix it in Pricing settings.');
      // The daily plan finds the month waiting on the location and creates no run.
      const day = new Date().toISOString().slice(0, 10);
      await queue('monitor', { practice_id: practices.split, day });
      await until(() => dailyPlanDone(practices.split, day), 'the daily plan');
      expect(await runs()).toEqual([{ status: 'failed', failure_code: 'location_not_ready', lines: 0 }]);
    });

    await test.step('a ZIP+4 under a release with no ZIP+4 list reads as content not yet loaded, never as wrong digits', async () => {
      // Getting started asks for what the location still needs, never for a confirmation it cannot take.
      await admin.goto(`/p/${practices.split}/settings`);
      const step = admin.locator('[data-step="billing_zip"]');
      await expect(step).toHaveAttribute('data-done', 'no');
      await expect(step.getByRole('link', { name: 'Add your billing ZIP+4' })).toBeVisible();
      await expect(step).toContainText('Medicare splits ZIP 00012 between payment localities. Add its ZIP+4.');
      await admin.goto(`/p/${practices.split}/settings/pricing`);
      await expect(admin.locator('[data-location-status="zip_plus_four_needed"]')).toHaveText('Medicare splits ZIP 00012 between payment localities. Add its ZIP+4.');
      await expect(admin.getByRole('button', { name: 'Confirm the billing ZIP' })).toHaveCount(0);
      await expect(admin.getByRole('table', { name: 'Months waiting on the billing ZIP' })).toContainText('2026-03');
      await atPhoneWidth(admin, 'Pricing settings with a waiting month');
      // A save that leaves the ZIP+4 still needed says the months still wait.
      await admin.getByLabel('Billing ZIP (ZIP+4 if Medicare needs one)').fill('00012');
      await admin.getByRole('button', { name: 'Save the billing ZIP' }).click();
      await expect(admin.locator('[data-notice="saved"]')).toContainText('Months that need the location still wait: see the status below.');
      await admin.getByLabel('Billing ZIP (ZIP+4 if Medicare needs one)').fill('00012-0001');
      await admin.getByRole('button', { name: 'Save the billing ZIP' }).click();
      await expect(admin.locator('[data-notice="saved"][data-settled="yes"]')).toContainText('Months waiting on the billing ZIP are being priced.');
      await expect(admin.locator('[data-location-zip]')).toHaveText('00012-0001');
      await expect(admin.locator('[data-location-status="locality_not_loaded"]')).toHaveText('PaidWhole has not loaded Medicare’s ZIP+4 list for ZIP 00012 yet. There is nothing for you to change.');
      await expect(admin.locator('main')).not.toContainText('Check the four digits');
      // A field it cannot read is named by its label, marked invalid and focused, and announced.
      const zipField = admin.getByLabel('Billing ZIP (ZIP+4 if Medicare needs one)');
      await zipField.fill('0001');
      await admin.getByRole('button', { name: 'Save the billing ZIP' }).click();
      await expect(admin.getByRole('alert').filter({ hasText: 'Billing ZIP: five digits, or ZIP+4 such as 27601-1234' })).toBeVisible();
      await expect(zipField).toHaveAttribute('aria-invalid', 'true');
      await expect(zipField).toBeFocused();
      await expectAccessible(admin, 'Pricing settings with a refused ZIP');
    });
  } finally {
    await local.close();
    await adminContext.close();
    await managerContext.close();
  }
  expect(violations).toEqual([]);
});
