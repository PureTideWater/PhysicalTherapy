import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import { assertNoPhi } from '@tp/observability';

import { personaEmail } from '../scripts/synthetic-personas';
import { expectAccessible, tabTo } from './a11y';
import { signInWithTotp } from './helpers';
import { journeyPractice, pricedAndTriaged, signedOffSchedule } from './journeys';
import { startLocalWorker } from './worker';

/**
 * Triage to cases in the browser (PRD 5, J8; PRD 7, Cases and Practice dashboard; PRD 12; test matrix
 * CAS-03, CAS-04, CAS-06, CAS-07, CAS-38, CAS-39, PRC-14): in a practice of its own whose case materiality is 100.00, a
 * billing manager uploads two SYNTHETIC remittances of one payer pattern, CAS-08 (paid 2026-04-08,
 * three lines 30.00 short) and CAS-04 (paid 2026-06-04, three lines 20.00 short). The payer's schedule
 * is signed off beside the browser with a dispute window that closed ten days ago for CAS-08's payment
 * and is open for CAS-04's (measured from today, so the journey holds on any later date), and March to
 * May is priced and triaged by the worker. The pattern waits below the case materiality (CAS-04), which the
 * cases page and Settings → Defaults show in dollars and an unchanged save keeps (CAS-38, CAS-39); the
 * manager lowers it, told the consequence first, opens the case on the pattern by keyboard with an owner,
 * and the case attaches the three open lines with the deadline of their window. Triage again adds the
 * three lines past their window struck through with WINDOW_PASSED, out of the actionable total. A line
 * is written off with its reason (CAS-06) and reopened with a reason (CAS-07); the dashboard's headline
 * follows each step, its figure the Cases screen's. Synthetic data only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
const KNOWN = ['SYNPCNCAS04001', 'SYNCCNCAS040001', 'SYNCCNCAS080001', 'SYNPCNCAS08001'];
const PRACTICE = 'SYNTHETIC OTHER PRACTICE TRIAGE';
const SETTINGS = { place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT', case_materiality_cents: '10000' };

/** Days from the CAS-08 payment (2026-04-08) to today, less ten: its window closed ten days ago, CAS-04's (57 days later) is open. */
function disputeWindowDays(): number {
  const paid = Date.UTC(2026, 3, 8);
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  return Math.round((today - paid) / 86_400_000) - 10;
}

test('a pattern below the case materiality waits; lowered, it opens as a case with its lines, deadline and owner; a line past its window is struck through; a write-off and a reopen move the actionable total (J8)', async ({ page }) => {
  test.setTimeout(420_000);
  const practiceId = await journeyPractice({ name: PRACTICE, settings: SETTINGS });
  await signInWithTotp(page, 'triage-manager');
  const local = await startLocalWorker();
  try {
    await test.step('the two remittances load, the schedule is signed off, and March to May is priced and triaged', async () => {
      await page.goto(`/p/${practiceId}/uploads`);
      await page.getByLabel('Choose files to upload').setInputFiles([
        { name: 'april.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'CAS-08/remit.835')) },
        { name: 'june.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'CAS-04/remit.835')) },
      ]);
      const batch = page.getByRole('region', { name: 'This batch' });
      for (const file of ['april.835', 'june.835']) {
        await expect(batch.getByRole('listitem').filter({ hasText: file })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
      }
      await signedOffSchedule({ practiceId, managerKey: 'triage-manager', planKey: 'CE:SYNPLAN-FIX-ONE', disputeWindowDays: disputeWindowDays() });
      await pricedAndTriaged({ practiceId, managerKey: 'triage-manager', periodFrom: '2026-03-01', periodTo: '2026-05-31' });
    });

    await test.step('the pattern waits below the case materiality (CAS-04); nothing is actionable yet', async () => {
      const response = await page.goto(`/p/${practiceId}/cases`);
      expect(response?.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
      const pattern = page.getByRole('list', { name: 'Waiting patterns' }).getByRole('listitem');
      await expect(pattern).toHaveCount(1);
      await expect(pattern).toHaveAttribute('data-waiting', 'held');
      await expect(pattern).toContainText('$60.00 on 3 lines');
      await expect(pattern).toContainText('3 more past their windows (WINDOW_PASSED, out of the total)');
      await expect(pattern.getByRole('button', { name: 'Open the case' })).toHaveCount(0);
      await expectAccessible(page, 'Cases');
      await page.goto(`/p/${practiceId}`);
      await expect(page.locator('[data-figure="actionable"]')).toContainText('$0.00');
      await expect(page.locator('[data-figure="validated"]')).toContainText('across 6 lines');
    });

    await test.step('the thresholds read as dollars on the cases page and on Settings → Defaults, in the mono face, and an unchanged save keeps them (CAS-38, CAS-39)', async () => {
      await page.goto(`/p/${practiceId}/cases`);
      await expect(page.getByRole('region', { name: 'Materiality' }).getByLabel('Per case (dollars)')).toHaveValue('100.00');
      await page.goto(`/p/${practiceId}/settings/defaults`);
      const defaults = page.getByRole('region', { name: 'Materiality' });
      await expect(defaults).toContainText('Now $5.00 per line and $100.00 per case.');
      await expect(defaults.locator('.font-mono')).toHaveText(['$5.00', '$100.00']);
      await expect(defaults.locator('.font-mono').first()).toHaveCSS('font-family', /mono/i);
      await expect(defaults.getByLabel('Per line (dollars)')).toHaveValue('5.00');
      await expect(defaults.getByLabel('Per case (dollars)')).toHaveValue('100.00');
      await defaults.getByRole('button', { name: 'Save materiality' }).click();
      await expect(page.getByText('The materiality thresholds apply from the next triage.')).toBeVisible();
      await expect(page.getByRole('region', { name: 'Materiality' })).toContainText('Now $5.00 per line and $100.00 per case.');
      await page.goto(`/p/${practiceId}/cases`);
      await expect(page.getByRole('region', { name: 'Materiality' })).toContainText('per-case threshold ($100.00)');
      await expect(page.getByRole('list', { name: 'Waiting patterns' }).getByRole('listitem')).toHaveAttribute('data-waiting', 'held');
    });

    await test.step('the manager lowers the case materiality, told the consequence, and opens the case by keyboard with its owner', async () => {
      await page.goto(`/p/${practiceId}/cases`);
      const materiality = page.getByRole('region', { name: 'Materiality' });
      await expect(materiality).toContainText('cases already open keep the materiality they opened with');
      await materiality.getByLabel('Per case (dollars)').fill('50.00');
      await materiality.getByRole('button', { name: 'Save the thresholds' }).click();
      await expect(page.locator('[data-notice="materiality"]')).toBeVisible();
      const pattern = page.getByRole('list', { name: 'Waiting patterns' }).getByRole('listitem');
      await expect(pattern).toHaveAttribute('data-waiting', 'ready');
      await pattern.getByLabel('Owner').selectOption({ label: personaEmail('triage-manager') });
      await tabTo(page, { role: 'button', name: 'Open the case' });
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/p/${practiceId}/cases/[0-9a-f-]{36}$`));
      const summary = page.getByRole('region', { name: 'Case summary' });
      await expect(summary.locator('[data-figure="actionable"]')).toHaveText('$60.00');
      await expect(summary).toContainText('3 of 3 lines not written off');
      await expect(summary.locator('[data-owner]')).toHaveText(personaEmail('triage-manager'));
      // The deadline is the earliest open window among its lines: CAS-04's payment date and the window.
      await expect(summary).toContainText(new Date(Date.UTC(2026, 5, 4) + disputeWindowDays() * 86_400_000).toISOString().slice(0, 10));
      await expect(page.getByRole('list', { name: 'Case lines' }).locator('[data-actionable="yes"]')).toHaveCount(3);
      expect(() => {
        assertNoPhi('url', page.url(), { known: KNOWN });
      }).not.toThrow();
    });
    const casePath = new URL(page.url()).pathname;

    await test.step('triage again adds the lines past their window, struck through with WINDOW_PASSED and out of the actionable total', async () => {
      await page.goto(`/p/${practiceId}/cases`);
      await expect(page.getByRole('list', { name: 'Waiting patterns' }).getByRole('listitem')).toHaveAttribute('data-waiting', 'joins_open_case');
      await page.getByRole('region', { name: 'Triage a run' }).getByRole('button', { name: 'Triage the run' }).click();
      await expect(async () => {
        await page.goto(casePath);
        await expect(page.getByRole('list', { name: 'Case lines' }).getByRole('listitem')).toHaveCount(6, { timeout: 1_000 });
      }).toPass({ timeout: 90_000 });
      const passed = page.getByRole('list', { name: 'Case lines' }).locator('[data-actionable="no"]');
      await expect(passed).toHaveCount(3);
      await expect(passed.locator('[data-reason="window_passed"]')).toHaveCount(3);
      await expect(passed.first()).toContainText('WINDOW_PASSED: struck through by triage once its window closed; out of the actionable total.');
      await expect(passed.first().locator('.line-through')).toBeVisible();
      await expect(page.locator('[data-figure="actionable"]').first()).toHaveText('$60.00');
      await expectAccessible(page, 'A case');
    });

    await test.step('a line written off with its reason leaves the total and stays visible (CAS-06); reopened with a reason, it returns (CAS-07)', async () => {
      const open = page.getByRole('list', { name: 'Case lines' }).locator('[data-actionable="yes"]').first();
      const lineId = (await open.getAttribute('data-case-line')) ?? '';
      await open.getByText('Write this line off').click();
      await open.getByRole('combobox', { name: 'Reason' }).selectOption({ label: 'Not worth pursuit' });
      await open.getByRole('checkbox').check();
      await open.getByRole('button', { name: 'Write off' }).click();
      const line = page.locator(`[data-case-line="${lineId}"]`);
      await expect(line).toHaveAttribute('data-actionable', 'no');
      await expect(line.locator('[data-reason="not_worth_pursuit"]')).toContainText(`by ${personaEmail('triage-manager')}`);
      await expect(page.locator('[data-figure="actionable"]').first()).toHaveText('$40.00');
      await page.goto(`/p/${practiceId}`);
      await expect(page.locator('[data-figure="actionable"]')).toContainText('$40.00');
      await page.goto(casePath);
      await line.getByText('Reopen this line').click();
      await line.getByRole('textbox', { name: 'Reason' }).fill('SYNTHETIC the payer’s portal shows the claim still open');
      await line.getByRole('button', { name: 'Reopen' }).click();
      await expect(line).toHaveAttribute('data-actionable', 'yes');
      await expect(line).toContainText('SYNTHETIC the payer’s portal shows the claim still open');
      await expect(page.locator('[data-figure="actionable"]').first()).toHaveText('$60.00');
    });

    await test.step('the dashboard’s headline is the Cases screen’s actionable, and each number opens its stage', async () => {
      await page.goto(`/p/${practiceId}`);
      await expect(page.locator('[data-figure="actionable"]')).toContainText('$60.00');
      await expect(page.locator('[data-figure="actionable"]')).toContainText('3 lines in cases still being worked');
      await expect(page.locator('[data-figure="cases"]').locator('[data-state="open"]')).toContainText('1 open');
      await page.locator('[data-figure="actionable"]').click();
      await expect(page).toHaveURL(new RegExp(`/p/${practiceId}/cases$`));
      await expect(page.getByRole('table', { name: 'Cases' }).getByRole('row')).toHaveCount(2);
      await page.goto(`/p/${practiceId}`);
      await page.locator('[data-figure="cases"]').getByRole('link', { name: '1 open' }).click();
      await expect(page).toHaveURL(/\/cases\?state=open$/);
      for (const value of KNOWN) {
        await expect(page.locator('main')).not.toContainText(value);
      }
      // Validated, below the headline, opens Claims and lines filtered to the lines at that stage now.
      await page.goto(`/p/${practiceId}`);
      await expect(page.locator('[data-figure="validated"]')).toContainText('across 3 lines');
      await page.locator('[data-figure="validated"]').getByRole('link').click();
      await expect(page).toHaveURL(new RegExp(`/p/${practiceId}/claims\\?stage=validated$`));
      await expect(page.getByLabel('Stage now')).toHaveValue('validated');
      await expectAccessible(page, 'Claims and lines at a stage');
    });
  } finally {
    await local.close();
  }
});
