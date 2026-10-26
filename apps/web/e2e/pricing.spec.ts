import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import { assertNoPhi } from '@tp/observability';

import { atPhoneWidth, expectAccessible } from './a11y';
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
 * first run until the re-run is accepted, and the release note lists release 900001 in force. Then
 * an older re-run is overtaken (combined audit #10; test matrix PRC-25 and PRC-28; docs/adr/0037, amendment of
 * 2026-10-26): the run in effect is re-run, and before anyone accepts it a new run of February is
 * created and priced after it. The re-run's page then says a newer run of these service dates is in
 * effect, says it was priced after the re-run, links to it by a name that tells it from the re-run and
 * offers no Accept button; the first run's page names the run in effect and offers no Re-run button; and
 * an Accept clicked on a page opened before the new run reads "This re-run: ..." under "Not done" alone
 * (no field to mark), gives way to the explanation and hands it the focus. In the other group's practice,
 * whose February no other spec loads lines into. Synthetic data only.
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
    // The method and the calculation in words, never a code (combined audit #38; CAS-30).
    await expect(pricing).toContainText('Percent of Medicare');
    await expect(pricing).not.toContainText('PERCENT_OF_MEDICARE');
    await expect(pricing.locator('[data-summary]')).toContainText(/^\d+ units? × \$[\d.,]+ = \$[\d.,]+ under 42 CFR 422\.214; .*rounded once to \$[\d.,]+; observed allowed \$[\d.,]+; /);
    await expect(pricing.locator('[data-summary]')).toContainText(`rounded once to ${expected}`);
    const steps = page.getByRole('list', { name: 'Trace steps' });
    const keys = await steps.locator(':scope > li').evaluateAll((items) => items.map((item) => item.getAttribute('data-step')));
    expect(keys.slice(0, 7)).toEqual(['release', 'as_of', 'settings', 'claim', 'line', 'agreement', 'terms']);
    expect(keys.at(-1)).toBe('outcome');
    expect(keys.indexOf('fee_schedule')).toBeLessThan(keys.indexOf('adjustments'));
    const fee = steps.locator(':scope > li[data-step="fee_schedule"]');
    await expect(fee).toContainText(/Fee schedule: the \d{4} records in force on \d{4}-\d{2}-\d{2}\./);
    await expect(fee.getByRole('table', { name: 'Fee schedule worksheet 1' })).toBeVisible();
    await expect(steps.locator(':scope > li[data-step="rounding"]')).toContainText(/Rounded once, half up to the cent/);
    // What the engine recorded sits in a closed disclosure under the words: open it, then read its rule records.
    // Each step's title is a heading under Trace (h2), named in its record's summary for a screen reader.
    await expect(fee.getByRole('heading', { level: 3, name: 'Step 2, continued: the fee schedule' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Rule records of Step 2, continued: the fee schedule' })).toBeHidden();
    await fee.getByText('As the engine recorded it').click();
    await expect(page.getByRole('list', { name: 'Rule records of Step 2, continued: the fee schedule' })).toContainText('pfs_rvu');
    await expectAccessible(page, 'the line trace page, its fee schedule record open');
    await atPhoneWidth(page, 'the line trace page, its fee schedule record open');
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
    // Each run's link reads alone, priced to the second (UX recheck of PR #50, N4).
    await firstRun.getByRole('link', { name: /^Pricing run, 2026-02-01 to 2026-02-28, priced \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/ }).click();
    const local = await startLocalWorker();
    try {
      await page.getByRole('button', { name: 'Re-run under release 900001' }).click();
      await expect(page.getByRole('region', { name: 'Re-run' })).toBeVisible();
      await expect(async () => {
        await page.reload();
        // The diff, or (accepting it changing nothing) its one no-changes line.
        await expect(page.locator('[data-state="diff-summary"], [data-state="no-changes"]').first()).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 90_000 });
    } finally {
      await local.close();
    }
    const rerunUrl = page.url();
    // The diff is exactly what accepting changes (payment-engine review of PR #50, F4): nothing, under the same release and mapping.
    // Said once: the no-changes line alone, no summary of zero changes above it (UX recheck of PR #50, N2).
    await expect(page.locator('[data-state="no-changes"]')).toContainText("Accepting this re-run changes no line's pricing in effect");
    await expect(page.locator('[data-state="diff-summary"]')).toHaveCount(0);
    await expect(page.locator('[data-state="awaiting-acceptance"]')).toBeVisible();
    // The run page fits a phone: each wide table (Unpriced reasons, Variance by payer pattern, Run lines) scrolls inside
    // its own region, which clips the visually hidden header cell it holds, and says so while it scrolls (UX confirm of
    // PR #50, NEW-A and N3).
    await atPhoneWidth(page, 'The re-run’s page');
    const viewport = page.viewportSize();
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('[data-state="scrolls-sideways"]').first()).toBeVisible();
      // At 320 px the page's own content fits too: nothing in main reaches past the window (the header's menus are the
      // shell's, outside this page).
      await page.setViewportSize({ width: 320, height: 844 });
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const main = document.querySelector('main');
              return main === null ? null : { overflow: main.scrollWidth - main.clientWidth, fits: main.getBoundingClientRect().right <= window.innerWidth };
            }),
          { message: 'the re-run’s page content at 320 px' },
        )
        .toEqual({ overflow: 0, fits: true });
      await expect(page.locator('[data-state="scrolls-sideways"]').first()).toBeVisible();
      if (viewport !== null) {
        await page.setViewportSize(viewport);
      }
      // A table that fits says nothing of scrolling.
      await expect(page.locator('[data-state="scrolls-sideways"]')).toHaveCount(0);
    } finally {
      if (viewport !== null) {
        await page.setViewportSize(viewport);
      }
    }
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

  await test.step('a re-run overtaken by a newer run of February can no longer be accepted, and says which run is in effect (PRC-25, PRC-28)', async () => {
    // The run in effect is the re-run accepted above; it is re-run, and nobody accepts the new re-run yet.
    await page.goto(`/p/${other}/pricing-runs`);
    const firstId = (await page.getByRole('list', { name: 'Pricing runs' }).getByRole('listitem').last().getAttribute('data-run')) ?? '';
    const inEffect = page.getByRole('list', { name: 'Pricing runs' }).getByRole('listitem').filter({ has: page.locator('[data-state="in-effect"]') });
    await inEffect.getByRole('link', { name: /^Pricing run, 2026-02-01 to 2026-02-28, priced / }).click();
    await expect(page.locator('[data-state="accepted"]')).toBeVisible();
    const inEffectUrl = page.url();
    let local = await startLocalWorker();
    try {
      await page.getByRole('button', { name: 'Re-run under release 900001' }).click();
      // The run in effect is itself a re-run with a Re-run card: wait for the redirect to the new one.
      await expect(page).not.toHaveURL(inEffectUrl);
      await expect(page.locator('[data-state="accepted"]')).toHaveCount(0);
      await expect(async () => {
        await page.reload();
        // The diff, or (accepting it changing nothing) its one no-changes line.
        await expect(page.locator('[data-state="diff-summary"], [data-state="no-changes"]').first()).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 90_000 });
    } finally {
      await local.close();
    }
    const staleUrl = page.url();
    await expect(page.getByRole('button', { name: 'Accept this run' })).toBeVisible();

    // A second tab, opened on the re-run's page before the new run exists, keeps its Accept button.
    const context = await browser.newContext({ storageState: await page.context().storageState() });
    const tab = await context.newPage();
    try {
      await tab.goto(staleUrl);
      await expect(tab.getByRole('button', { name: 'Accept this run' })).toBeVisible();

      // A new run of February, priced after the re-run.
      await page.goto(`/p/${other}/pricing-runs`);
      local = await startLocalWorker();
      try {
        await page.getByRole('region', { name: 'Create a run' }).getByLabel('First month of service').fill('2026-02');
        await page.getByRole('region', { name: 'Create a run' }).getByRole('button', { name: 'Create the run' }).click();
        await expect(page.getByRole('heading', { level: 1 })).toContainText('Pricing run, 2026-02-01 to 2026-02-28');
        await expect(async () => {
          await page.reload();
          await expect(page.locator('[data-status="complete"]').first()).toBeVisible({ timeout: 1_000 });
        }).toPass({ timeout: 90_000 });
      } finally {
        await local.close();
      }
      const newerId = page.url().split('/').at(-1) ?? '';

      // The re-run's page: the explanation, the link to the run in effect, and no Accept button.
      await page.goto(staleUrl);
      // A note, not an alert: it is on the page from the start (UX review of PR #50, UX-5).
      const explanation = page.getByRole('status').filter({ hasText: 'A newer run of these service dates is in effect' });
      await expect(explanation).toBeVisible();
      await expect(page.getByRole('alert').filter({ hasText: 'these service dates' })).toHaveCount(0);
      await expect(explanation).toContainText(/Pricing run, 2026-02-01 to 2026-02-28, rule release 900001, priced \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC took effect after the run this re-run prices again, and it was priced after this re-run\./);
      await expect(explanation).toContainText('There is nothing more to accept.');
      // The link's name tells the run in effect from this re-run, which has the same dates and release (UX-2).
      const named = explanation.getByRole('link', { name: /^Pricing run, 2026-02-01 to 2026-02-28, rule release 900001, priced / });
      await expect(named).toHaveAttribute('href', `/p/${other}/pricing-runs/${newerId}`);
      await expect(page.getByRole('region', { name: 'Re-run' })).toContainText('It was never accepted, and it is not in effect.');
      await expect(page.getByRole('region', { name: 'Re-run' })).not.toContainText('Nothing of it is in effect until a person accepts it.');
      await expect(page.getByRole('button', { name: 'Accept this run' })).toHaveCount(0);
      await expect(page.locator('span[data-state="rerun-superseded"]')).toHaveText('Can no longer be accepted');
      await expectAccessible(page, 'a re-run that can no longer be accepted');

      // The first run's page: no Re-run button, and the run in effect named.
      await page.goto(`/p/${other}/pricing-runs/${firstId}`);
      await expect(page.getByRole('button', { name: 'Re-run under release 900001' })).toHaveCount(0);
      await expect(page.locator('[data-state="rerun-not-in-effect"]')).toContainText('Only the run in effect for these service dates is priced again:');
      await expect(page.locator('[data-state="rerun-not-in-effect"]').getByRole('link')).toHaveAttribute('href', `/p/${other}/pricing-runs/${newerId}`);
      await expectAccessible(page, 'a run that is not in effect');

      // The stale tab's Accept is refused after its label, and the page refreshes to the explanation.
      await tab.evaluate(() => {
        const seen = (): void => {
          const text = document.body.textContent;
          if (text.includes('This re-run: can no longer be accepted, because a newer run of these service dates is in effect; the page is updated to name it')) {
            document.body.dataset.refusalSeen = 'true';
          }
          // Every issue is on the form's hidden run field: no "fields marked below" (UX review of PR #50, UX-3).
          if (text.includes('Check the fields marked below.')) {
            document.body.dataset.genericSeen = 'true';
          }
        };
        new MutationObserver(seen).observe(document.body, { childList: true, subtree: true, characterData: true });
      });
      await tab.getByRole('button', { name: 'Accept this run' }).click();
      await expect(tab.getByRole('status').filter({ hasText: 'A newer run of these service dates is in effect' })).toBeVisible({ timeout: 15_000 });
      await expect(tab.locator('body')).toHaveAttribute('data-refusal-seen', 'true');
      await expect(tab.locator('body')).not.toHaveAttribute('data-generic-seen', 'true');
      // The refused form is gone: the focus it held moves to the explanation that took its place (UX-6).
      await expect(tab.locator('[data-takes-over^="accept:"]')).toBeFocused();
      await expect(tab.getByRole('button', { name: 'Accept this run' })).toHaveCount(0);
      await expect(tab.locator('[data-state="accepted"]')).toHaveCount(0);
      await expectAccessible(tab, 'a stale Accept refused');
      expect(() => {
        assertNoPhi('url', tab.url(), { known: KNOWN });
      }).not.toThrow();
    } finally {
      await context.close();
    }
  });
});
