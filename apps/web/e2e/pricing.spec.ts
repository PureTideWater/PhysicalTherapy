import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import { assertNoPhi } from '@tp/observability';

import { practiceId, registerKeyAndSignIn, signInWithTotp } from './helpers';
import { startLocalWorker } from './worker';

/**
 * Pricing runs in the browser (PRD 5, J7; PRD 7, Pricing runs, Claims and lines, Coverage; test matrix
 * MAP-05): a platform administrator sets the practice's pricing location (its billing ZIP, docs/adr/0064) and
 * place-of-service settings in the internal console (docs/adr/0040), a billing manager uploads a SYNTHETIC remittance from a
 * Medicare Advantage plan (fixture MAP-05, February 2026), maps the plan as MA non-contracted,
 * creates a run for February under the SYNTHETIC release prepare.ts loads, and the price job (the
 * worker run here beside the server) prices it. The run shows complete with its coverage and its variance by payer pattern; a line opens
 * its trace, every step in order with the rule records it read; the line's claim shows its expected
 * allowed; Coverage shows the run's shares. Then the run is re-run (docs/adr/0037): the re-run's page
 * shows its diff (nothing changed under the same release and mapping), Coverage keeps reading the
 * first run until the re-run is accepted, and the release note lists release 900001 in force. In the
 * other group's practice, whose February no other spec loads lines into. Synthetic data only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
const KNOWN = ['SYNTHLASTYQFQC8', 'SYNTHFIRSTN5T', 'SYNPCNMAP05001', 'SYNCCNMAP050001', 'SYNMBR01538394'];

test('a billing manager creates a pricing run; the worker prices it, and its lines open their traces (J7, MAP-05)', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await signInWithTotp(page, 'pricing-manager');
  const other = await practiceId('other');
  await test.step('a platform administrator sets the practice’s pricing location and place-of-service settings in the console', async () => {
    const context = await browser.newContext();
    const admin = await context.newPage();
    try {
      await registerKeyAndSignIn(admin, 'pricing-admin');
      await admin.goto(`/console/practices/${other}`);
      // The pricing location has its own form since PR 6b (audit #33): the billing ZIP, set whole.
      await admin.getByLabel('Billing ZIP (ZIP+4 if Medicare needs one)').fill('00011');
      await admin.getByRole('button', { name: 'Save the location' }).click();
      await expect(admin.locator('[data-notice="location"]')).toBeVisible();
      // The status the location has now, read from the database, and the stored location in the field (review of PR 6b-2, finding 14).
      await expect(admin.locator('[data-location-status="ready"]')).toHaveText('Medicare prices this location in locality 99999-01 under rule release 900001.');
      await expect(admin.locator('[data-location-zip]')).toHaveText('00011');
      await expect(admin.getByLabel('Billing ZIP (ZIP+4 if Medicare needs one)')).toHaveValue('00011');
      await admin.getByLabel('Places of service priced as facility').fill('22');
      await admin.getByLabel('Places of service priced as non-facility').fill('11');
      await admin.getByLabel('Default rounding when a contract is silent').selectOption('HALF_UP_CENT');
      await admin.getByRole('button', { name: 'Save the settings' }).click();
      await expect(admin.locator('[data-notice="saved"]')).toBeVisible();
      await expect(admin.locator('[data-location-zip]')).toHaveText('00011');
    } finally {
      await context.close();
    }
  });

  await test.step('the remittance loads', async () => {
    await page.goto(`/p/${other}/uploads`);
    const local = await startLocalWorker();
    try {
      await page.getByLabel('Choose files to upload').setInputFiles([{ name: 'advantage.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'MAP-05', 'remit.835')) }]);
      await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'advantage.835' })).toContainText('Loaded 1 remittance, 1 claim and 3 lines', { timeout: 90_000 });
    } finally {
      await local.close();
    }
  });

  await test.step('the plan is mapped as Medicare Advantage non-contracted', async () => {
    await page.goto(`/p/${other}/mapping`);
    const row = page.getByRole('table', { name: 'Payers and plans' }).getByRole('row').filter({ hasText: 'SYNPLAN-MA-05' });
    await row.getByRole('link', { name: 'CE:SYNPLAN-MA-05' }).click();
    await page.getByLabel('Agreement', { exact: true }).selectOption({ label: 'Medicare Advantage, non-contracted' });
    await page.getByLabel('Effective from', { exact: true }).fill('2026-01-01');
    await page.getByRole('button', { name: 'Save the mapping' }).click();
    await expect(page.locator('[data-notice="mapped"]')).toBeVisible();
  });

  await test.step('a run for February is created, and the price job prices it', async () => {
    const response = await page.goto(`/p/${other}/pricing-runs`);
    expect(response?.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
    await expect(page.getByRole('heading', { level: 1, name: 'Pricing runs' })).toBeVisible();
    const create = page.getByRole('region', { name: 'Create a run' });
    await expect(create).toContainText('pinned to rule release 900001');
    const local = await startLocalWorker();
    try {
      await create.getByLabel('First month of service').fill('2026-02');
      await create.getByRole('button', { name: 'Create the run' }).click();
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Pricing run, 2026-02-01 to 2026-02-28');
      await expect(async () => {
        await page.reload();
        await expect(page.locator('[data-status="complete"]').first()).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 90_000 });
    } finally {
      await local.close();
    }
    await expect(page.getByText('Complete runs never change.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Coverage' })).toContainText('3 of 3 lines priced (100.0%); $326.00 of $326.00 billed (100.0%)');
    const pattern = page.getByRole('table', { name: 'Variance by payer pattern' }).getByRole('row').filter({ hasText: 'SYNTHETIC PAYER M' });
    await expect(pattern).toContainText('Medicare Advantage, non-contracted');
    await expect(page.getByRole('table', { name: 'Run lines' }).getByRole('row')).toHaveCount(4);
    expect(() => {
      assertNoPhi('url', page.url(), { known: KNOWN });
    }).not.toThrow();
  });

  await test.step('a line opens its trace, every step in order with the records it read', async () => {
    const line = page.getByRole('table', { name: 'Run lines' }).getByRole('row').filter({ hasText: '97110' });
    const lineId = await line.getAttribute('data-line');
    const expected = ((await line.getByRole('cell').nth(2).textContent()) ?? '').trim();
    expect(expected).toMatch(/^\$\d+\.\d{2}$/);
    await line.getByRole('link', { name: 'Line trace' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('97110');
    const pricing = page.getByRole('region', { name: 'Pricing' });
    await expect(pricing).toContainText('under rule release 900001');
    await expect(pricing).toContainText(expected);
    await expect(pricing).toContainText('PERCENT_OF_MEDICARE');
    const steps = page.getByRole('list', { name: 'Trace steps' });
    const keys = await steps.locator(':scope > li').evaluateAll((items) => items.map((item) => item.getAttribute('data-step')));
    expect(keys.slice(0, 7)).toEqual(['release', 'as_of', 'settings', 'claim', 'line', 'agreement', 'terms']);
    expect(keys.at(-1)).toBe('outcome');
    expect(keys.indexOf('fee_schedule')).toBeLessThan(keys.indexOf('adjustments'));
    await expect(page.getByRole('list', { name: 'Rule records of Step 2: the fee schedule' })).toContainText('pfs_rvu');
    expect(() => {
      assertNoPhi('url', page.url(), { known: KNOWN });
    }).not.toThrow();

    // The line's claim shows the run's expected allowed beside what was observed.
    await page.locator('main').getByRole('link', { name: 'Claims and lines' }).click();
    await expect(page.getByRole('table', { name: 'Claims and lines' }).locator(`tr[data-line="${lineId ?? ''}"]`)).toContainText(expected);
  });

  await test.step('Coverage shows the run’s priced shares', async () => {
    await page.goto(`/p/${other}/coverage`);
    const priced = page.getByRole('region', { name: 'Priced share' });
    // Each line at its pricing in effect, across the runs in effect; the latest to take effect is named beside them.
    await expect(priced).toContainText('Each line at its pricing in effect, across 1 pricing run in effect (service 2026-02-01 to 2026-02-28)');
    await expect(priced).toContainText('The latest to take effect is 2026-02-01 to 2026-02-28 under rule release 900001');
    await expect(priced).toContainText('Priced: 3 of 3 lines (100.0%); $326.00 of $326.00 billed (100.0%)');
    for (const value of KNOWN) {
      await expect(page.locator('main')).not.toContainText(value);
    }
  });

  await test.step('the run is re-run; its diff shows before anyone accepts it, and Coverage reads it only once accepted', async () => {
    await page.goto(`/p/${other}/pricing-runs`);
    const firstRun = page.getByRole('list', { name: 'Pricing runs' }).getByRole('listitem').first();
    const firstId = (await firstRun.getAttribute('data-run')) ?? '';
    await firstRun.getByRole('link', { name: '2026-02-01 to 2026-02-28' }).click();
    const local = await startLocalWorker();
    try {
      await page.getByRole('button', { name: 'Re-run under release 900001' }).click();
      await expect(page.getByRole('region', { name: 'Re-run' })).toBeVisible();
      await expect(async () => {
        await page.reload();
        await expect(page.locator('[data-state="diff-summary"]')).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 90_000 });
    } finally {
      await local.close();
    }
    const rerunUrl = page.url();
    await expect(page.locator('[data-state="diff-summary"]')).toContainText('0 of 3 lines both runs priced are priced differently');
    await expect(page.locator('[data-state="no-changes"]')).toBeVisible();
    await expect(page.locator('[data-state="awaiting-acceptance"]')).toBeVisible();
    // Until a person accepts the re-run, Coverage reads the first run.
    await page.goto(`/p/${other}/coverage`);
    await expect(page.getByRole('region', { name: 'Priced share' })).toContainText('Priced: 3 of 3 lines');
    await page.goto(`/p/${other}/pricing-runs/compare?before=${firstId}&after=${rerunUrl.split('/').at(-1) ?? ''}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Compare two runs' })).toBeVisible();
    await page.getByRole('button', { name: 'Accept the second run' }).click();
    await expect(page.locator('[data-state="accepted"]')).toBeVisible();
    await expect(page.locator('[data-state="in-effect"]')).toBeVisible();
    expect(() => {
      assertNoPhi('url', page.url(), { known: KNOWN });
    }).not.toThrow();
  });

  await test.step('the release note shows release 900001 in force', async () => {
    await page.goto(`/p/${other}/releases`);
    await expect(page.getByRole('heading', { level: 1, name: 'Rule release notes' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Release 900001' })).toContainText('In force: runs created now pin it.');
    await expect(page.getByRole('region', { name: 'Runs it would change' })).toContainText('No run in effect is pinned to another release.');
  });
});
