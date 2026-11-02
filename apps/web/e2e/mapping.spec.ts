import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Page, expect, test } from '@playwright/test';
import { assertNoPhi } from '@tp/observability';

import { atPhoneWidth, expectAccessible } from './a11y';
import { signInWithTotp, withDatabase } from './helpers';
import { chainFrom, journeyPractice, newestDocument, until } from './journeys';
import { MAPPING_PRACTICE_PREFIX, startLocalWorker } from './worker';

/**
 * Payer and plan mapping when one plan of a month has no mapping, in the browser (combined audit #32; docs/adr/0075;
 * PRD 5, J6; PRD 7; test matrix MAP-01, MAP-06, MAP-07, MAP-08, PRC-31). A billing manager uploads a SYNTHETIC
 * remittance of one month (fixture MAP-06, February 2026) holding two claims of one plan and one claim of another,
 * neither mapped: the parse's own monitoring leaves the month without a run, and Coverage counts both plans' lines as
 * not priced. Mapping the first plan leaves the month waiting for the other; "Price them now" has monitoring give it a
 * first run, which prices the mapped plan's lines and leaves the other's unpriced, and the run's page names that plan.
 * Mapping the second plan then lists the month to price again; "Price these months again" creates the re-run in the
 * manager's name, which is accepted by hand, and Coverage's figures fall to zero.
 *
 * In a practice of its own for each attempt (MAPPING_PRACTICE_PREFIX, whose monitoring the e2e worker runs for real:
 * worker.ts), so every count it asserts is exact and a retry starts from an empty practice. Both plans are mapped as no
 * agreement, which leaves no shortfall, so triage after acceptance is the database tests' (mapped-plan.db.test.ts).
 * Synthetic data only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
/** Every name and number of the file's patients and claims, which no URL or page may show. */
const KNOWN = [
  'SYNTHLAST5AHX69',
  'SYNTHFIRSTSRZ',
  'SYNMBR91870470',
  'SYNPCNMAP06001',
  'SYNCCNMAP060001',
  'SYNTHLAST8HPEAN',
  'SYNTHFIRST2V4',
  'SYNMBR40987222',
  'SYNPCNMAP06002',
  'SYNCCNMAP060002',
  'SYNTHLAST2XVLQ7',
  'SYNTHFIRSTMHY',
  'SYNMBR63964590',
  'SYNPCNMAP06003',
  'SYNCCNMAP060003',
];

function expectNoPhiIn(url: string): void {
  expect(() => {
    assertNoPhi('url', url, { known: KNOWN });
  }).not.toThrow();
}

/** Opens a plan's page from the mapping list, by its key, and maps it as no agreement from January 1. */
async function mapAsNoAgreement(page: Page, practiceId: string, plan: string): Promise<void> {
  await page.goto(`/p/${practiceId}/mapping?view=all`);
  await page.getByRole('table', { name: 'Payers and plans' }).getByRole('row').filter({ hasText: plan }).getByRole('link', { name: `CE:${plan}` }).click();
  await page.getByLabel('Agreement', { exact: true }).selectOption({ label: 'No agreement (out of network)' });
  await page.getByLabel('Effective from', { exact: true }).fill('2026-01-01');
  await page.getByRole('button', { name: 'Save the mapping' }).click();
}

/** Until the practice's monitoring, pricing, triage and reconcile jobs have run out, and it holds `runs` complete runs. */
async function untilPriced(practiceId: string, runs: number): Promise<void> {
  await until(
    () =>
      withDatabase(async (client) => {
        const { rows } = await client.query<{ complete: number; waiting: boolean }>(
          `SELECT (SELECT count(*)::int FROM pricing_run WHERE practice_id = $1::uuid AND status = 'complete') AS complete,
                  EXISTS (SELECT 1 FROM pgboss.job WHERE name = ANY ($2::text[]) AND data ->> 'practice_id' = $1::text AND state IN ('created', 'retry', 'active')) AS waiting`,
          [practiceId, ['monitor', 'price', 'triage', 'reconcile']],
        );
        return rows[0]?.complete === runs && !rows[0].waiting;
      }),
    `${String(runs)} complete pricing runs`,
  );
}

test('one plan with no mapping no longer freezes its month: the rest prices, and once mapped, the month is priced again by hand (J6, MAP-06 to MAP-08, PRC-31)', async ({ page }) => {
  test.setTimeout(300_000);
  const practiceId = await journeyPractice({ name: `${MAPPING_PRACTICE_PREFIX}${randomUUID().slice(0, 8)}`, settings: {} });
  await signInWithTotp(page, 'mapping-manager');
  const local = await startLocalWorker();
  try {
    await test.step('the remittance loads, and its monitoring leaves the month without a run: neither plan is mapped (MAP-07)', async () => {
      await page.goto(`/p/${practiceId}/uploads`);
      await page.getByLabel('Choose files to upload').setInputFiles([{ name: 'month.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'MAP-06', 'remit.835')) }]);
      await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'month.835' })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
      await chainFrom(practiceId, await newestDocument(practiceId, 'x12_835'));
      const runs = await withDatabase(async (client) => (await client.query<{ n: number }>('SELECT count(*)::int AS n FROM pricing_run WHERE practice_id = $1', [practiceId])).rows[0]?.n);
      expect(runs).toBe(0);
    });

    await test.step('Coverage and Pricing runs count both plans’ lines as not priced, in a default Alert (MAP-06)', async () => {
      const response = await page.goto(`/p/${practiceId}/coverage`);
      expect(response?.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
      const unmapped = page.locator('[data-state="unmapped"]');
      await expect(unmapped).toContainText('2 plans have no mapping; their lines are not priced');
      await expect(unmapped).toContainText('7 lines, $750.00 billed. Lines of every other plan price as usual. Map them on Payer and plan mapping.');
      // The red refusal is gone (combined audit #32): nothing failed, so the Alert is the default one.
      await expect(page.locator('[data-state="refused"]')).toHaveCount(0);
      await expect(page.getByRole('table', { name: 'Unpriced reasons and their remedies' }).getByRole('row').filter({ hasText: 'NO_MAPPING' })).toContainText('Map the plan');
      await page.goto(`/p/${practiceId}/pricing-runs`);
      await expect(page.locator('[data-state="unmapped"]')).toContainText(
        '7 lines, $750.00 billed, are not priced in any run until their plans are mapped; each is left unpriced as NO_MAPPING, unless it fails a check of its own facts first. Map them.',
      );
      await expect(page.getByText('No pricing run yet')).toBeVisible();
    });

    await test.step('mapping one plan leaves the month waiting for the other, and "Price them now" gives it a first run (MAP-07)', async () => {
      await mapAsNoAgreement(page, practiceId, 'SYNPLAN-COMM-06');
      await expect(page.locator('[data-notice="mapped"]')).toBeVisible();
      const waiting = page.getByRole('region', { name: 'Months waiting for a first run' });
      await expect(waiting).toContainText('1 month holding this plan’s lines waits for 1 other plan’s mapping.');
      await expect(waiting).toContainText('2026-02-01 to 2026-02-28');
      // Each waiting month says what it holds (UX-10): no line of a plan mapped as no agreement prices, the other plan's 3 lines have no mapping.
      await expect(waiting.locator('tr[data-waiting-month="2026-02-01"]')).toContainText('$750.00');
      await expectAccessible(page, 'a plan’s page with a month waiting for another plan’s mapping');
      await waiting.getByRole('button', { name: 'Price them now' }).click();
      await expect(page.locator('[data-notice="pricing_requested"]')).toContainText('Monitoring is pricing the waiting months now; they show on Pricing runs when done.');
      expectNoPhiIn(page.url());
      await untilPriced(practiceId, 1);
    });

    await test.step('the run priced the mapped plan and names the plan that had no mapping; Coverage and the home page count it (MAP-06)', async () => {
      await page.goto(`/p/${practiceId}/pricing-runs`);
      await page
        .getByRole('list', { name: 'Pricing runs' })
        .getByRole('link', { name: /^Pricing run, 2026-02-01 to 2026-02-28/ })
        .click();
      await expect(page.locator('[data-status="complete"]').first()).toBeVisible();
      const held = page.locator('[data-state="unmapped-plans"]');
      await expect(held).toContainText('When this run was priced, 1 plan had no mapping; its lines are not priced (3 lines, $300.00 billed).');
      await expect(held.getByRole('link', { name: 'CE:SYNPLAN-UNMAPPED-06' })).toBeVisible();
      await expect(page.getByRole('table', { name: 'Unpriced reasons' }).getByRole('row').filter({ hasText: 'NO_MAPPING' })).toContainText('$300.00');
      expectNoPhiIn(page.url());
      await page.goto(`/p/${practiceId}/coverage`);
      await expect(page.locator('[data-state="unmapped"]')).toContainText('1 plan has no mapping; its lines are not priced');
      await expect(page.locator('[data-state="unmapped"]')).toContainText('3 lines, $300.00 billed.');
      await page.goto(`/p/${practiceId}`);
      await expect(page.locator('[data-state="unmapped"]')).toContainText('1 plan has no mapping; its lines are not priced');
      await expect(page.locator('[data-state="unmapped"]')).toContainText('The queue “Plans waiting on a mapping” below also counts plans mapped for only some dates.');
    });

    await test.step('mapping the other plan lists the month to price again; Coverage counts its lines as mapped and not priced (MAP-08, PRC-31)', async () => {
      await mapAsNoAgreement(page, practiceId, 'SYNPLAN-UNMAPPED-06');
      // The month has a run, so nothing waits for a first run and the mapping queues nothing.
      await expect(page.locator('[data-notice="mapped"]')).toBeVisible();
      await expect(page.getByRole('region', { name: 'Months waiting for a first run' })).toHaveCount(0);
      const row = page.locator('tr[data-month]');
      await expect(row).toHaveCount(1);
      await expect(row).toHaveAttribute('data-state', 'ready');
      await expect(row).toContainText('2026-02-01 to 2026-02-28');
      await expect(row).toContainText('$300.00');
      // Both plans are mapped as no agreement, so the re-run records the lines under that mapping, unpriced (UX-3).
      await expect(row).toContainText('Ready to record under its mapping');
      await expectAccessible(page, 'a plan’s page with a month to price again');
      await atPhoneWidth(page, 'a plan’s page with a month to price again');
      await page.goto(`/p/${practiceId}/coverage`);
      await expect(page.locator('[data-state="unmapped"]')).toHaveCount(0);
      await expect(page.locator('[data-state="mapped"]')).toContainText('Every plan has a mapping');
      const mappedNotPriced = page.locator('[data-state="mapped_not_priced"]');
      await expect(mappedNotPriced).toContainText('3 lines of mapped plans are still not priced');
      // Counted in pricing runs, never "priced months" (R2-4), and what a re-run does with them (UX-3).
      await expect(mappedNotPriced).toContainText('$300.00 billed, in 1 pricing run, are still NO_MAPPING in the pricing in effect: their plans were mapped after that run was priced.');
      await expect(mappedNotPriced).toContainText('Their plans are mapped as no agreement, government or other, so a re-run records them under that mapping and they stay unpriced.');
      await expect(mappedNotPriced).toHaveAttribute('role', 'status');
    });

    await test.step('"Price these months again" creates the re-run in the manager’s name, and it is accepted by hand (MAP-08)', async () => {
      await page.goto(`/p/${practiceId}/mapping?view=all`);
      const region = page.getByRole('region', { name: 'Months with lines of mapped plans not priced' });
      await expect(region).toContainText('3 lines of mapped plans are still not priced');
      await region.getByRole('button', { name: 'Price these months again (1)' }).click();
      await expect(page.locator('[data-notice="priced_again"]')).toContainText('Accept each on its page after its list of changes.');
      // The notice is a note, said once: it leaves the address bar, and the list keeps the filter it showed (UX-7, C-2).
      await expect(page.locator('[data-notice="priced_again"]')).toHaveAttribute('role', 'status');
      await expect(page).toHaveURL(/[?&]view=all(&|$)/);
      await expect(page).not.toHaveURL(/notice=/);
      expectNoPhiIn(page.url());
      await expect(page.locator('tr[data-month]')).toHaveAttribute('data-state', /^(being_priced|to_accept)$/);
      await expect(async () => {
        await page.reload();
        await expect(page.locator('tr[data-month]')).toHaveAttribute('data-state', 'to_accept', { timeout: 1_000 });
      }).toPass({ timeout: 90_000 });
      const created = await withDatabase(
        async (client) => (await client.query<{ n: number }>('SELECT count(*)::int AS n FROM pricing_run WHERE practice_id = $1 AND rerun_of_id IS NOT NULL AND created_by_job_id IS NULL', [practiceId])).rows[0]?.n,
      );
      expect(created).toBe(1);
      // The reloads above showed the page as it is now, not the notice again (UX-7).
      await expect(page.locator('[data-notice="priced_again"]')).toHaveCount(0);
      await page.locator('tr[data-month]').getByRole('link', { name: 'Priced again: review and accept' }).click();
      await expect(page.getByRole('region', { name: 'Re-run' })).toBeVisible();
      await page.getByRole('button', { name: 'Accept this run' }).click();
      await expect(page.locator('[data-state="accepted"]')).toBeVisible();
      expectNoPhiIn(page.url());
    });

    await test.step('once accepted, no line of a mapped plan is left NO_MAPPING (PRC-31)', async () => {
      await page.goto(`/p/${practiceId}/coverage`);
      await expect(page.locator('[data-state="mapped"]')).toContainText('Every plan has a mapping');
      await expect(page.locator('[data-state="mapped_not_priced"]')).toHaveCount(0);
      await page.goto(`/p/${practiceId}/mapping`);
      await expect(page.getByRole('region', { name: 'Months with lines of mapped plans not priced' })).toHaveCount(0);
      // The whole page: while it streams, the route's loading skeleton is a second <main> beside the screen's.
      for (const value of KNOWN) {
        await expect(page.locator('body')).not.toContainText(value);
      }
    });
  } finally {
    await local.close();
  }
});
