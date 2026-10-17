import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { type Page, expect, test } from '@playwright/test';
import { type LedgerEntry, type ReportReconciliation, entriesById, reportReconciliation } from '@tp/ledger';
import { cents } from '@tp/money';

import { statementHtml } from '../../worker/src/reconcile/statement-html';
import { expectAccessible } from './a11y';
import { signInWithTotp } from './helpers';
import { journeyPractice, pricedAndTriaged, signedOffSchedule } from './journeys';
import { startLocalWorker } from './worker';

/**
 * The PaidWhole brand in the browser (docs/brand/BRAND.md; docs/adr/0054 and 0055): no page asks a font
 * service or any other origin for anything (the brand's faces are self-hosted by next/font/local and load
 * from this origin); the header carries the lockup with the practice switcher and the account on the
 * right and the single brass underline under the active rail item; the dashboard's tiles, a table's status
 * tints and the sign-in page are on brand; and a printed statement's cover carries the Verified seal only
 * when the ledger says its recovered total reconciles to cash. Screenshots of each go to brand-screenshots/
 * (gitignored; BRAND_SCREENSHOTS_DIR moves them) for a person to look at. In a practice of its own, with
 * SYNTHETIC remittances (CAS-08, CAS-04) priced under a signed-off schedule. Synthetic data only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
const SHOTS = process.env.BRAND_SCREENSHOTS_DIR ?? path.resolve(import.meta.dirname, '../../../brand-screenshots');
const PRACTICE = 'SYNTHETIC OTHER PRACTICE BRAND';
const SETTINGS = { place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT', case_materiality_cents: '1000' };
const FONT_SERVICES = /fonts\.googleapis\.com|fonts\.gstatic\.com/;
/** Brass, rgb() as the browser computes it: the active rail item's underline. */
const BRASS = 'rgb(201, 154, 59)';

function shot(name: string): string {
  mkdirSync(SHOTS, { recursive: true });
  return path.join(SHOTS, name);
}

/** Every request a page makes, kept so the test can say none left this origin. */
function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  return urls;
}

/** The families document.fonts has loaded once the page settles. */
async function loadedFonts(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((face) => face.status === 'loaded').map((face) => `${face.family} ${face.weight}`);
  });
}

test('no page asks a font service or another origin for anything; the brand faces load from this origin', async ({ page, baseURL }) => {
  const requests = recordRequests(page);
  for (const screen of ['/sign-in', '/request-audit', '/status']) {
    await page.goto(screen);
    await page.waitForLoadState('networkidle');
    expect((await loadedFonts(page)).length, `${screen}: the brand faces it uses load`).toBeGreaterThanOrEqual(2);
  }
  await expect(page.locator('[data-slot="public-header"] [data-slot="lockup"]')).toBeVisible();
  expect(requests.filter((url) => FONT_SERVICES.test(url))).toEqual([]);
  expect(requests.filter((url) => !url.startsWith(baseURL ?? 'http://localhost') && !url.startsWith('data:') && !url.startsWith('blob:'))).toEqual([]);
  // The fonts are next/font/local's files, served from this origin.
  expect(requests.some((url) => url.startsWith(`${baseURL ?? ''}/_next/static/media/`) && url.endsWith('.woff2'))).toBe(true);
});

test('the sign-in page is the stacked lockup on Paper, and nothing else decorative', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/sign-in');
  await expect(page.locator('[data-slot="sign-in-ground"]')).toHaveCSS('background-color', 'rgb(246, 244, 238)');
  await expect(page.locator('[data-slot="sign-in-ground"] [data-slot="lockup"]')).toContainText('PaidWhole');
  await expect(page.getByText('PaidWhole staff sign in with a hardware key')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: shot('sign-in.png'), fullPage: true });
});

test('the workspace wears the brand: header, brass underline, tiles in mono, status as text on tint; and the printed cover earns the seal only from the ledger', async ({ page, baseURL, browser }) => {
  test.setTimeout(420_000);
  const requests = recordRequests(page);
  const practiceId = await journeyPractice({ name: PRACTICE, settings: SETTINGS });
  await signInWithTotp(page, 'brand-manager');
  const local = await startLocalWorker();
  try {
    await test.step('two SYNTHETIC remittances load and March to May is priced and triaged', async () => {
      await page.goto(`/p/${practiceId}/uploads`);
      await page.getByLabel('Choose files to upload').setInputFiles([
        { name: 'april.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'CAS-08/remit.835')) },
        { name: 'june.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'CAS-04/remit.835')) },
      ]);
      const batch = page.getByRole('region', { name: 'This batch' });
      for (const file of ['april.835', 'june.835']) {
        await expect(batch.getByRole('listitem').filter({ hasText: file })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
      }
      await signedOffSchedule({ practiceId, managerKey: 'brand-manager', planKey: 'CE:SYNPLAN-FIX-ONE' });
      await pricedAndTriaged({ practiceId, managerKey: 'brand-manager', periodFrom: '2026-03-01', periodTo: '2026-05-31' });
    });
  } finally {
    await local.close();
  }

  await test.step('the header: the lockup left, the practice switcher and the account right, one brass underline on the active item', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/p/${practiceId}`);
    const header = page.locator('[data-slot="app-header"]');
    await expect(header.locator('[data-slot="lockup"]')).toContainText('PaidWhole');
    await expect(header.getByLabel('Practice switcher')).toContainText(PRACTICE);
    await expect(header.getByLabel('Account')).toBeVisible();
    const active = page.getByRole('navigation', { name: 'Practice' }).getByRole('link', { name: 'Practice home', exact: true });
    await expect(active).toHaveAttribute('aria-current', 'page');
    await expect(active).toHaveCSS('text-decoration-color', BRASS);
    await expect(active).toHaveCSS('text-decoration-line', 'underline');
    await expect(page.getByRole('navigation', { name: 'Practice' }).getByRole('link', { name: 'Uploads', exact: true })).not.toHaveCSS('text-decoration-color', BRASS);
    await expect(header.locator('[data-slot="lockup"] span').first()).toHaveCSS('font-family', /display/i);
    await page.waitForLoadState('networkidle');
    await header.screenshot({ path: shot('header-1280.png') });
  });

  await test.step('the dashboard tiles: label in Slate, the figure in Plex Mono, recovered named with its proof level', async () => {
    const tiles = page.locator('[data-slot="tile-row"]');
    await expect(tiles.locator('[data-figure="recovered-total"]')).toContainText('Recovered (posted)');
    await expect(tiles.locator('[data-figure="actionable"] .font-mono')).toHaveCSS('font-family', /mono/i);
    await expect(tiles.locator('[data-figure="actionable"] .font-mono')).toHaveCSS('font-variant-numeric', 'tabular-nums');
    await expectAccessible(page, 'The dashboard on brand');
    await tiles.screenshot({ path: shot('dashboard-tiles.png') });
  });

  await test.step('a table of lines with their status as text on a quiet tint, each with its label', async () => {
    await page.goto(`/p/${practiceId}/claims`);
    const table = page.getByRole('table', { name: 'Claims and lines' });
    const chips = table.locator('[data-slot="status-chip"]');
    await expect(chips.first()).toBeVisible();
    await expect(chips.first()).not.toHaveText('');
    // Short: colored text on its tint, never white text on a saturated fill.
    const short = table.locator('[data-slot="status-chip"][data-tone="short"]').first();
    await expect(short).toHaveCSS('color', 'rgb(181, 69, 46)');
    await expect(short).toHaveCSS('background-color', 'rgb(248, 236, 232)');
    await expectAccessible(page, 'Claims and lines on brand');
    await table.screenshot({ path: shot('status-table.png') });
  });

  await test.step('the header at a phone width: the lockup, the switcher, the account and the menu fit', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/p/${practiceId}`);
    const header = page.locator('[data-slot="app-header"]');
    await expect(header.locator('[data-slot="lockup"]')).toBeVisible();
    await expect(header.getByText('Menu')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.waitForLoadState('networkidle');
    await header.screenshot({ path: shot('header-390.png') });
    await header.getByText('Menu').click();
    await expect(header.getByRole('navigation', { name: 'Practice' }).getByRole('link', { name: 'Practice home', exact: true })).toHaveCSS('text-decoration-color', BRASS);
  });

  await test.step('no request of the workspace left this origin, fonts included', () => {
    expect(requests.filter((url) => FONT_SERVICES.test(url))).toEqual([]);
    expect(requests.filter((url) => !url.startsWith(baseURL ?? 'http://localhost') && !url.startsWith('data:') && !url.startsWith('blob:'))).toEqual([]);
  });

  await test.step('a printed statement’s cover: the seal and its definition only when the ledger says it reconciles to cash', async () => {
    const entries: LedgerEntry[] = [
      { id: '5e1d0000-0000-4000-8000-000000000001', caseId: '5e1d0000-0000-4000-8000-0000000000c1', serviceLineId: '5e1d0000-0000-4000-8000-0000000000a1', stage: 'deposited', amountCents: cents(3000n), evidenceKind: 'eft_row', evidenceId: 'synthetic-eft-row', allocated: false, effectiveOn: '2026-08-14' },
      { id: '5e1d0000-0000-4000-8000-000000000002', caseId: '5e1d0000-0000-4000-8000-0000000000c1', serviceLineId: '5e1d0000-0000-4000-8000-0000000000a1', stage: 'recouped', amountCents: cents(-1800n), evidenceKind: 'provider_adjustment', evidenceId: 'synthetic-plb', allocated: false, effectiveOn: '2026-09-02' },
    ];
    const ledger = entriesById(entries);
    const statement = {
      periodFrom: '2026-04-01',
      periodTo: '2026-09-30',
      proofLevel: 'deposited' as const,
      feesCents: cents(0n),
      recoveredCents: cents(1200n),
      interestCents: cents(0n),
      approvedUnpostedCents: cents(0n),
      actionableOpenCents: cents(9000n),
      pursuitHours: '0.00',
      links: { recovered: entries.map((entry) => entry.id), interest: [], approvedUnposted: [], actionableOpen: [] },
    };
    const none = { storedCents: cents(0n), recomputedCents: cents(0n), matches: true, entries: [] };
    const check = { matches: true, recovered: { storedCents: cents(1200n), recomputedCents: cents(1200n), matches: true, entries }, interest: none, approvedUnposted: none };
    const gate = (stated: bigint): ReportReconciliation =>
      reportReconciliation({ report: { kind: 'roi_statement', id: '5e1d0000-0000-4000-8000-0000000000f1' }, proofLevel: 'deposited', statedRecoveredCents: cents(stated), recoveredEntryIds: statement.links.recovered, ledger });
    const cover = async (reconciliation: ReportReconciliation, name: string) => {
      const printed = await browser.newPage({ viewport: { width: 816, height: 1056 } });
      try {
        await printed.emulateMedia({ media: 'print' });
        await printed.setContent(
          statementHtml({ statementId: '5e1d0000-0000-4000-8000-0000000000f1', practiceName: PRACTICE, statement, check, generatedBy: 'SYNTHETIC BILLING MANAGER', generatedAt: '2026-10-01 09:00:00', reconciliation }),
          { waitUntil: 'load' },
        );
        const section = printed.locator('section.cover');
        await printed.evaluate(() => document.fonts.ready);
        await section.screenshot({ path: shot(name) });
        return { seal: await section.locator('[data-verified="seal"]').count(), text: await section.innerText() };
      } finally {
        await printed.close();
      }
    };
    const earned = gate(1200n);
    expect(earned.reconciledToCash).toBe(true);
    const withSeal = await cover(earned, 'report-cover-with-seal.png');
    expect(withSeal.seal).toBe(1);
    expect(withSeal.text).toContain('Verified: recovered amounts reconcile to posted or deposited remittance');
    const refused = gate(1300n);
    expect(refused).toMatchObject({ reconciledToCash: false, reason: 'total_differs' });
    const withoutSeal = await cover(refused, 'report-cover-without-seal.png');
    expect(withoutSeal.seal).toBe(0);
    expect(withoutSeal.text).not.toContain('Verified:');
  });
});
