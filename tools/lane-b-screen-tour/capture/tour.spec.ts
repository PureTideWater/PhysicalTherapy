import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test';

import { shownVersionId } from '/home/user/screens/apps/web/e2e/export-attempts';
import { registerKeyAndSignIn, signInWithTotp, withDatabase } from '/home/user/screens/apps/web/e2e/helpers';
import { outboxFor } from '/home/user/screens/apps/web/e2e/outbox';
import { CLEAN_ROWS, OUTSIDE_ROWS, SCREENING_ZIP, SMALL_ROWS, resultLinkIn, screeningCsv, startLocalScreeningConsumer } from '/home/user/screens/apps/web/e2e/screening';
import { personaEmail } from '/home/user/screens/apps/web/scripts/synthetic-personas';

/**
 * The screen tour: signs in as each role and saves full-page PNGs (device scale factor 1) of the pages the seed and the
 * repository's own journeys populated (synthetic data only). Each shot is independent: a screen that cannot be reached
 * is recorded with its reason and the tour goes on. Nothing here writes a record except what a person does on screen
 * (requesting a packet's approval, sending the free screening) and the PDF download of the payer's copy.
 */

const OUT = '/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/screens';
const PNG = `${OUT}/png`;
const PROBE = `${OUT}/probe`;
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

const PRACTICES = {
  layout: 'SYNTHETIC OTHER PRACTICE LAYOUT',
  packets: 'SYNTHETIC OTHER PRACTICE PACKETS',
  ledger: 'SYNTHETIC OTHER PRACTICE LEDGER',
  monitoring: 'SYNTHETIC OTHER PRACTICE MONITORING',
} as const;

interface Shot {
  readonly file: string;
  readonly path: string;
  readonly role: string;
  readonly width: number;
}
const shots: Shot[] = [];
const skipped: string[] = [];

/** One value from the e2e database (its superuser, as the journeys read IDs), or ''. */
async function one(sql: string, params: readonly unknown[] = []): Promise<string> {
  if (params.includes('')) {
    return '';
  }
  return withDatabase(async (client) => (await client.query<{ id: string }>(sql, [...params])).rows[0]?.id ?? '');
}

async function practice(name: string): Promise<string> {
  return one('SELECT id FROM practice WHERE name = $1', [name]);
}

/** Lets the page finish: its requests settle, no loading state remains, the fonts are in. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await page
    .locator('[data-slot="loading-state"]')
    .first()
    .waitFor({ state: 'detached', timeout: 20_000 })
    .catch(() => undefined);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(400);
}

async function save(page: Page, file: string, role: string, dir = PNG): Promise<void> {
  await settle(page);
  await page.screenshot({ path: `${dir}/${file}`, fullPage: true, animations: 'disabled' });
  const url = new URL(page.url());
  shots.push({ file: `${dir}/${file}`, path: `${url.pathname}${url.search}`, role, width: page.viewportSize()?.width ?? 0 });
}

/** Runs one shot; a failure is recorded as skipped with its reason, and the tour goes on. */
async function shot(name: string, run: () => Promise<void>): Promise<void> {
  await test.step(name, async () => {
    try {
      await run();
    } catch (error) {
      skipped.push(`${name}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    }
  });
}

const contexts = new Map<string, BrowserContext>();

/** A desktop context signed in as the persona (once per persona; an internal persona registers a virtual key). */
async function as(browser: Browser, persona: string, internal = false): Promise<Page> {
  let context = contexts.get(persona);
  if (context === undefined) {
    context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1 });
    const page = await context.newPage();
    if (internal) {
      await registerKeyAndSignIn(page, persona);
    } else {
      await signInWithTotp(page, persona);
    }
    await page.close();
    contexts.set(persona, context);
  }
  return context.newPage();
}

/** A phone-width page with the persona's session (or none, for a public page). */
async function phone(browser: Browser, persona: string | null): Promise<Page> {
  const signed = persona === null ? undefined : contexts.get(persona);
  const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 1, isMobile: true, hasTouch: true, ...(signed === undefined ? {} : { storageState: await signed.storageState() }) });
  return context.newPage();
}

test('the screen tour', async ({ browser }) => {
  test.setTimeout(25 * 60_000);
  const layout = await practice(PRACTICES.layout);
  const packets = await practice(PRACTICES.packets);
  const ledger = await practice(PRACTICES.ledger);
  const monitoring = await practice(PRACTICES.monitoring);
  const ids = {
    layoutCase: await one('SELECT case_id AS id FROM case_line WHERE practice_id = $1 LIMIT 1', [layout]),
    version: await one("SELECT id FROM contract_version WHERE practice_id = $1 AND status = 'signed_off' ORDER BY created_at LIMIT 1", [layout]),
    marchRun: await one("SELECT id FROM pricing_run WHERE practice_id = $1 AND period_from = '2026-03-01' AND status = 'complete' ORDER BY created_at LIMIT 1", [layout]),
    remittance: await one("SELECT r.id FROM remittance r WHERE r.practice_id = $1 AND r.trn02 = 'SYNEFTCAS08001' LIMIT 1", [layout]),
    packetsCase: await one('SELECT case_id AS id FROM case_line WHERE practice_id = $1 LIMIT 1', [packets]),
    roi: await one('SELECT id FROM roi_statement WHERE practice_id = $1 ORDER BY created_at DESC LIMIT 1', [ledger]),
    digest: await one('SELECT id FROM digest WHERE practice_id = $1 ORDER BY created_at DESC LIMIT 1', [monitoring]),
    group: await one("SELECT o.id FROM practice p JOIN organization o ON o.id = p.organization_id WHERE p.name = 'SYNTHETIC PHYSICAL THERAPY NORTH'"),
  };
  writeFileSync(`${OUT}/ids.json`, JSON.stringify({ layout, packets, ledger, monitoring, ...ids }, null, 2));

  // 01: sign-in, as anyone sees it.
  await shot('01 sign-in', async () => {
    const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto('/sign-in');
    await expect(page.getByLabel('Email')).toBeVisible();
    await save(page, '01-sign-in.png', 'public');
    await context.close();
  });

  // Practice homes, to choose the richest (probe), then the layout practice's screens.
  for (const [key, persona, id] of [
    ['monitoring', 'monitoring-manager', monitoring],
    ['packets', 'packet-approver', packets],
    ['ledger', 'ledger-manager', ledger],
    ['layout', 'pricing-manager', layout],
  ] as const) {
    await shot(`probe home ${key}`, async () => {
      const page = await as(browser, persona);
      await page.goto(`/p/${id}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await save(page, `home-${key}.png`, persona, PROBE);
      await page.close();
    });
  }

  const L = (screen: string) => `/p/${layout}${screen}`;
  for (const [file, path, check] of [
    ['03-uploads.png', L('/uploads'), 'Receipts'],
    ['04-remittances.png', L('/remittances'), 'Remittances'],
    ['05-remittance.png', L(`/remittances/${ids.remittance}`), 'Claims'],
    ['06-contracts.png', L('/contracts'), ''],
    ['07-contract-version.png', L(`/contracts/versions/${ids.version}`), ''],
    ['08-mapping.png', L('/mapping'), 'Payers and plans'],
    ['09-pricing-runs.png', L('/pricing-runs'), ''],
    ['10-pricing-run.png', L(`/pricing-runs/${ids.marchRun}`), 'Run lines'],
    ['12-anomalies.png', L('/anomalies'), ''],
    ['probe-claims.png', L('/claims'), 'Claims and lines'],
    ['probe-coverage.png', L('/coverage'), ''],
    ['probe-layout-cases.png', L('/cases'), ''],
  ] as const) {
    await shot(file, async () => {
      const page = await as(browser, 'pricing-manager');
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (check !== '') {
        await expect(page.getByRole('table', { name: check }).or(page.getByRole('region', { name: check })).first()).toBeVisible();
      }
      await save(page, file, 'billing manager (pricing-manager)', file.startsWith('probe') ? PROBE : PNG);
      await page.close();
    });
  }

  await shot('11 line trace', async () => {
    const page = await as(browser, 'pricing-manager');
    await page.goto(L(`/pricing-runs/${ids.marchRun}`));
    await page.getByRole('table', { name: 'Run lines' }).getByRole('link', { name: 'Line trace' }).first().click();
    await expect(page.getByRole('list', { name: 'Trace steps' })).toBeVisible();
    await save(page, '11-line-trace.png', 'billing manager (pricing-manager)');
    await page.close();
  });

  // The packet under review: its drafter asks for approval; a second billing manager sees the approve step.
  await shot('15 packet approve step', async () => {
    const casePath = L(`/cases/${ids.layoutCase}`);
    const drafter = await as(browser, 'pricing-manager');
    await drafter.goto(`${casePath}/packet`);
    await settle(drafter);
    const request = drafter.getByRole('region', { name: 'Approval' }).getByRole('button', { name: 'Request approval' });
    if ((await request.count()) > 0) {
      await request.click();
      await expect(drafter.locator('[data-notice="requested"]')).toBeVisible();
    }
    await save(drafter, 'packet-drafter-view.png', 'billing manager who drafted it (pricing-manager)', PROBE);
    await drafter.close();
    const approver = await as(browser, 'packet-approver');
    await approver.goto(`${casePath}/packet`);
    await expect(approver.getByRole('region', { name: 'Approval' }).locator('[data-approval="ready"]')).toBeVisible();
    await save(approver, '15-packet-approve.png', 'second billing manager (packet-approver)');
    await approver.close();
  });

  // The packets practice: its cases, the case, the exported packet and the payer's copy (its PDF's first page).
  const casePath = `/p/${packets}/cases/${ids.packetsCase}`;
  for (const [file, path] of [
    ['13-cases.png', `/p/${packets}/cases`],
    ['14-case.png', casePath],
    ['probe-packet-exported.png', `${casePath}/packet`],
    ['probe-submissions.png', `${casePath}/submissions`],
    ['probe-packets-reconciliation.png', `/p/${packets}/reconciliation`],
  ] as const) {
    await shot(file, async () => {
      const page = await as(browser, 'packet-approver');
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await save(page, file, 'billing manager (packet-approver)', file.startsWith('probe') ? PROBE : PNG);
      await page.close();
    });
  }
  await shot('16 payer copy', async () => {
    const page = await as(browser, 'packet-approver');
    await page.goto(`${casePath}/packet`);
    await settle(page);
    const versionId = await shownVersionId(page);
    expect(versionId).not.toBe('');
    const response = await page.request.get(`${casePath}/packet/${versionId}/pdf`);
    expect(response.status()).toBe(200);
    const pdf = `${PROBE}/payer-copy.pdf`;
    writeFileSync(pdf, await response.body());
    // The first page, at 150 dpi: 1275 px wide, about the width of the desktop shots.
    execFileSync('pdftoppm', ['-png', '-r', '150', '-f', '1', '-l', '1', '-singlefile', pdf, `${PNG}/16-payer-copy`]);
    shots.push({ file: `${PNG}/16-payer-copy.png`, path: `${casePath}/packet/${versionId}/pdf (page 1)`, role: 'billing manager (packet-approver)', width: 1275 });
    await page.close();
  });

  // Recovery: reconciliation and the ledger, and the ROI statement with its seal.
  await shot('17 reconciliation', async () => {
    const page = await as(browser, 'ledger-manager');
    await page.goto(`/p/${ledger}/reconciliation`);
    await expect(page.locator('[data-figure="recovered"]')).toBeVisible();
    await save(page, '17-reconciliation.png', 'billing manager (ledger-manager)');
    await page.close();
  });
  await shot('19 roi', async () => {
    const page = await as(browser, 'ledger-manager');
    await page.goto(`/p/${ledger}/reports/roi/${ids.roi}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ROI statement');
    await save(page, '19-roi-statement.png', 'billing manager (ledger-manager)');
    await page.close();
  });

  // Monitoring: the monthly digest the chain sent.
  await shot('18 monitoring digest', async () => {
    const page = await as(browser, 'monitoring-manager');
    await page.goto(`/p/${monitoring}/digests/${ids.digest}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Monitoring digest for');
    await save(page, '18-monitoring-digest.png', 'billing manager (monitoring-manager)');
    await page.close();
  });
  await shot('probe notifications', async () => {
    const page = await as(browser, 'monitoring-manager');
    await page.goto(`/p/${monitoring}/notifications`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await save(page, 'notifications-monitoring.png', 'billing manager (monitoring-manager)', PROBE);
    await page.close();
  });

  // The free screening: its public page, the form with a SYNTHETIC file of totals chosen, and the result.
  const contact = `screening-tour-${randomBytes(4).toString('hex')}@clinic-e2e.synthetic.test`;
  const consumer = await startLocalScreeningConsumer();
  try {
    const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await shot('20 screening', async () => {
      await page.goto('/screening');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('A free screening of your allowed amounts');
      await save(page, '20-screening.png', 'public');
    });
    await shot('21 screening form', async () => {
      await page.getByLabel('Practice name').fill('SYNTHETIC SCREENING CLINIC');
      await page.getByLabel('State').selectOption('MN');
      await page.getByLabel('ZIP code', { exact: true }).fill(SCREENING_ZIP);
      await page.getByLabel('Work email').fill(contact);
      await page.getByLabel('How did you hear about us?').selectOption('billing_firm');
      await page.getByLabel('Referring billing firm').fill('SYNTHETIC BILLING PARTNERS');
      await page.getByLabel('File to screen').setInputFiles({ name: 'totals.csv', mimeType: 'text/csv', buffer: screeningCsv([...CLEAN_ROWS, ...SMALL_ROWS, ...OUTSIDE_ROWS]) });
      await expect(page.locator('[data-state="file-ready"]')).toBeVisible();
      await save(page, '21-screening-form.png', 'public');
    });
    await shot('22 screening result', async () => {
      await page.getByRole('button', { name: 'Screen the file' }).click();
      await expect(page).toHaveURL(/\/screening\?sent=1/);
      await save(page, 'screening-sent.png', 'public', PROBE);
      await expect.poll(() => outboxFor(contact).length, { timeout: 120_000, intervals: [500] }).toBe(1);
      const [message] = outboxFor(contact);
      const link = new URL(resultLinkIn(message as NonNullable<typeof message>));
      await page.goto(link.pathname);
      await expect(page.getByRole('heading', { level: 1, name: 'Your free screening' })).toBeVisible();
      await save(page, '22-screening-result.png', 'public (the emailed link)');
    });
    await context.close();
  } finally {
    await consumer.close();
  }

  // The operator console: its home (organizations) and a practice's pricing location and settings.
  await shot('23 console home', async () => {
    const page = await as(browser, 'platform-admin', true);
    await page.goto('/');
    await expect(page).toHaveURL(/\/console\//);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await save(page, '23-console-home.png', 'platform administrator (hardware key)');
    await page.close();
  });
  for (const [file, path] of [
    ['24-console-practice.png', `/console/practices/${layout}`],
    ['probe-console-releases.png', '/console/rule-releases'],
    ['probe-console-status.png', '/console/status'],
    ['probe-console-prospects.png', '/console/prospects?filter=all'],
  ] as const) {
    await shot(file, async () => {
      const page = await as(browser, 'platform-admin', true);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await save(page, file, 'platform administrator (hardware key)', file.startsWith('probe') ? PROBE : PNG);
      await page.close();
    });
  }

  // Billing, as the group's administrator; the access log, as the other group's.
  await shot('25 billing', async () => {
    const page = await as(browser, 'practice-admin');
    await page.goto(`/settings/billing/${ids.group}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await save(page, '25-billing.png', 'organization administrator (practice-admin)');
    await page.close();
  });
  for (const [file, path] of [
    ['26-access-log.png', `/p/${packets}/settings/access-log`],
    ['probe-settings.png', `/p/${packets}/settings`],
  ] as const) {
    await shot(file, async () => {
      const page = await as(browser, 'other-admin');
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await save(page, file, 'practice administrator (other-admin)', file.startsWith('probe') ? PROBE : PNG);
      await page.close();
    });
  }

  // At a phone's width: practice homes (both candidates), a case, the screening page, the ROI statement.
  for (const [file, persona, path] of [
    ['phone-home-monitoring.png', 'monitoring-manager', `/p/${monitoring}`],
    ['phone-home-packets.png', 'packet-approver', `/p/${packets}`],
    ['phone-home-ledger.png', 'ledger-manager', `/p/${ledger}`],
    ['28-phone-case.png', 'packet-approver', casePath],
    ['29-phone-screening.png', null, '/screening'],
    ['30-phone-roi-statement.png', 'ledger-manager', `/p/${ledger}/reports/roi/${ids.roi}`],
  ] as const) {
    await shot(file, async () => {
      const page = await phone(browser, persona);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await save(page, file, persona ?? 'public', file.startsWith('phone-home') ? PROBE : PNG);
      await page.context().close();
    });
  }

  for (const context of contexts.values()) {
    await context.close();
  }
  writeFileSync(`${OUT}/shots.json`, JSON.stringify({ shots, skipped, emails: { screening: contact, monitoring: personaEmail('monitoring-manager') } }, null, 2));
});
