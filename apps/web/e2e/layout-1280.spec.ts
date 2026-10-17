import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Locator, type Page, expect, test } from '@playwright/test';

import { signInWithTotp, withDatabase } from './helpers';
import { journeyPractice, pricedAndTriaged, signedOffSchedule, untilLoaded, uploadedEarlier } from './journeys';
import { startLocalWorker } from './worker';

/**
 * The screens the screen tour found too wide or running together, at a 1280 px desktop window (the tour's L1 to L3,
 * C1 to C3), on the tour's shape of data: in a practice of its own in the other group, a billing manager uploads
 * SYNTHETIC CAS-08 (payer Q, three 97110 lines in March, each 30.00 short) and CAS-02 (payer N, 32 lines in April);
 * payer Q's schedule is abstracted by the contract specialist (each field "Approved by the contract specialist" with
 * its time) and signed off beside the browser; payer N's plan is mapped as no agreement on screen; March and April are
 * priced and triaged by the worker (a case of payer Q's three lines; payer N's lines to anomaly screening, some
 * flagged as investigatory); and the billing manager writes the case's first packet version. Then, as the billing
 * manager, no page scrolls sideways (document.documentElement.scrollWidth is 1280): the contract version's rate record
 * fields, the packet's line schedule and the claims table (the billing manager's, with its PHI columns) each fit their
 * card with their last column inside it; each table's headers stand apart; a trace's step reads NCCI PTP; and a run
 * that priced every line shows its unpriced reasons as an empty state. Each check is soft, so one run reports every
 * screen that fails. Synthetic data only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
const PRACTICE = 'SYNTHETIC OTHER PRACTICE LAYOUT';
const SETTINGS = { place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT', case_materiality_cents: '1000' };
const MANAGER = 'pricing-manager';
const WIDTH = 1280;
const FILES = [
  { name: 'era-payer-q.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'CAS-08/remit.835')) },
  { name: 'era-payer-n.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'CAS-02/remit.835')) },
];
/** The least space, in CSS px, between one header's words and the next header's: they never run together. */
const HEADER_GAP = 6;

test.use({ viewport: { width: WIDTH, height: 900 } });

/** The page's width as the document lays it out, beside the window's: equal when nothing scrolls sideways. */
async function pageWidths(page: Page): Promise<[number, number]> {
  return page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth] as [number, number]);
}

/**
 * How a table sits in its card: whether it fits the box that holds it (its scroller: nothing to scroll, and its right
 * edge inside the scroller's content box), and how far past that edge each header ends; with each column's width, so
 * a failure says which column took the room.
 */
async function placement(table: Locator): Promise<{ readonly fits: boolean; readonly past: readonly { readonly header: string; readonly px: number }[]; readonly widths: string }> {
  return table.evaluate((element) => {
    const scroller = element.parentElement;
    const box = scroller?.getBoundingClientRect();
    const style = scroller === null ? null : getComputedStyle(scroller);
    const inner = box === undefined || style === null ? window.innerWidth : box.right - Number.parseFloat(style.paddingRight) - Number.parseFloat(style.borderRightWidth);
    const headers = [...element.querySelectorAll('thead th')].map((cell) => ({ header: (cell.textContent ?? '').trim(), right: cell.getBoundingClientRect().right, width: Math.round(cell.getBoundingClientRect().width) }));
    return {
      fits: scroller === null ? false : scroller.scrollWidth <= scroller.clientWidth && element.getBoundingClientRect().right <= inner + 0.5,
      past: headers.filter((cell) => cell.right > inner + 0.5).map((cell) => ({ header: cell.header, px: Math.round(cell.right - inner) })),
      widths: `${headers.map((cell) => `${cell.header}=${String(cell.width)}`).join(' ')}; table ${String(Math.round(element.getBoundingClientRect().width))} in ${String(Math.round(inner - (box?.left ?? 0) - Number.parseFloat(style?.paddingLeft ?? '0')))}`,
    };
  });
}

/** Expects the table to fit its card at this width, its last column's header inside it. */
async function expectFitsItsCard(table: Locator, what: string): Promise<void> {
  const found = await placement(table);
  expect.soft(found.past, `${what}: headers past the card (${found.widths})`).toEqual([]);
  expect.soft(found.fits, `${what}: the table fits its card (${found.widths})`).toBe(true);
}

/** Each pair of neighbouring headers in the table and the space between their words, in CSS px (a hidden header is skipped). */
async function headerGaps(table: Locator): Promise<{ readonly between: string; readonly gap: number }[]> {
  return table.evaluate((element) => {
    const gaps: { between: string; gap: number }[] = [];
    for (const row of element.querySelectorAll('thead tr')) {
      const words = [...row.querySelectorAll('th')]
        .map((cell) => {
          const range = document.createRange();
          range.selectNodeContents(cell);
          return { text: (cell.textContent ?? '').trim(), box: range.getBoundingClientRect() };
        })
        .filter((cell) => cell.text !== '' && cell.box.width > 1);
      for (let index = 0; index + 1 < words.length; index += 1) {
        const [left, right] = [words[index], words[index + 1]];
        if (left !== undefined && right !== undefined) {
          gaps.push({ between: `${left.text} | ${right.text}`, gap: Math.round((right.box.left - left.box.right) * 10) / 10 });
        }
      }
    }
    return gaps;
  });
}

async function expectHeadersApart(table: Locator, what: string): Promise<void> {
  const gaps = await headerGaps(table);
  expect(gaps.length, `${what} has headers`).toBeGreaterThan(0);
  expect.soft(gaps.filter((pair) => pair.gap < HEADER_GAP), `${what}: headers that run together`).toEqual([]);
}

async function expectNoSidewaysScroll(page: Page, what: string): Promise<void> {
  expect.soft(await pageWidths(page), `${what}: the page's width and the window's`).toEqual([WIDTH, WIDTH]);
}

test('at 1280 px no page scrolls sideways, each wide table fits its card, and every table’s headers stand apart (the screen tour, L1 to L3 and C1 to C3)', async ({ page }) => {
  test.setTimeout(480_000);
  const practiceId = await journeyPractice({ name: PRACTICE, settings: SETTINGS });
  const at = (screen = '') => `/p/${practiceId}${screen}`;
  await signInWithTotp(page, MANAGER);

  const local = await startLocalWorker();
  try {
    await test.step('CAS-08 and CAS-02 load; payer Q’s schedule is signed off and payer N’s plan mapped as no agreement; March and April are priced and triaged', async () => {
      // A retry finds the attempt before's uploads: each is waited for, not uploaded again (it would be a duplicate of itself).
      const earlier = await uploadedEarlier(practiceId, FILES);
      const fresh = FILES.filter((file) => !earlier.has(file.name));
      if (fresh.length > 0) {
        await page.goto(at('/uploads'));
        await page.getByLabel('Choose files to upload').setInputFiles(fresh);
        const batch = page.getByRole('region', { name: 'This batch' });
        for (const file of fresh) {
          await expect(batch.getByRole('listitem').filter({ hasText: file.name })).toContainText('Loaded 1 remittance', { timeout: 120_000 });
        }
      }
      for (const documentId of earlier.values()) {
        await untilLoaded(documentId);
      }
      await signedOffSchedule({ practiceId, managerKey: MANAGER, planKey: 'CE:SYNPLAN-FIX-ONE', disputeWindowDays: 365 });
      const mapped = await withDatabase(
        async (client) =>
          ((await client.query("SELECT 1 FROM payer_plan_mapping m JOIN plan p ON p.id = m.plan_id WHERE m.practice_id = $1 AND p.plan_key = 'CE:SYNPLAN-OON-CAS'", [practiceId])).rowCount ?? 0) > 0,
      );
      if (!mapped) {
        await page.goto(at('/mapping'));
        await page.getByRole('table', { name: 'Payers and plans' }).getByRole('row').filter({ hasText: 'SYNPLAN-OON-CAS' }).getByRole('link', { name: 'CE:SYNPLAN-OON-CAS' }).click();
        await page.getByLabel('Agreement', { exact: true }).selectOption({ label: 'No agreement (out of network)' });
        await page.getByLabel('Effective from', { exact: true }).fill('2026-01-01');
        await page.getByRole('button', { name: 'Save the mapping' }).click();
        await expect(page.locator('[data-notice="mapped"]')).toBeVisible();
      }
      await pricedAndTriaged({ practiceId, managerKey: MANAGER, periodFrom: '2026-03-01', periodTo: '2026-03-31' });
      await pricedAndTriaged({ practiceId, managerKey: MANAGER, periodFrom: '2026-04-01', periodTo: '2026-04-30' });
    });
  } finally {
    await local.close();
  }

  const { caseId, versionId, marchRun, aprilRun, remittanceId } = await withDatabase(async (client) => {
    const one = async (sql: string) => (await client.query<{ id: string }>(sql, [practiceId])).rows[0]?.id ?? '';
    return {
      caseId: await one('SELECT case_id AS id FROM case_line WHERE practice_id = $1 LIMIT 1'),
      versionId: await one("SELECT id FROM contract_version WHERE practice_id = $1 AND status = 'signed_off' ORDER BY created_at LIMIT 1"),
      marchRun: await one("SELECT id FROM pricing_run WHERE practice_id = $1 AND period_from = '2026-03-01' AND status = 'complete' ORDER BY created_at LIMIT 1"),
      aprilRun: await one("SELECT id FROM pricing_run WHERE practice_id = $1 AND period_from = '2026-04-01' AND status = 'complete' ORDER BY created_at LIMIT 1"),
      remittanceId: await one("SELECT r.id FROM remittance r WHERE r.practice_id = $1 AND r.trn02 = 'SYNEFTCAS08001' LIMIT 1"),
    };
  });
  for (const found of [caseId, versionId, marchRun, aprilRun, remittanceId]) {
    expect(found).not.toBe('');
  }

  await test.step('the contract version: each rate record field’s approval, “the contract specialist” and its time, stays inside its card (L1)', async () => {
    await page.goto(at(`/contracts/versions/${versionId}`));
    const record = page.getByRole('region', { name: 'Rate record 1' });
    const fields = record.getByRole('table', { name: 'Fields' });
    await expect(fields).toContainText('Approved by the contract specialist');
    await expectNoSidewaysScroll(page, 'the contract version');
    const past = await fields.evaluate((table) => {
      const card = table.closest('[data-slot="card"]')?.getBoundingClientRect();
      return [...table.querySelectorAll('td, th')].filter((cell) => card === undefined || cell.getBoundingClientRect().right > card.right).length;
    });
    expect.soft(past, 'cells past the record’s card').toBe(0);
    await expectFitsItsCard(fields, 'the rate record’s fields');
  });

  await test.step('the packet builder: the line schedule fits its card, “Window ends” and the trace column inside it (L2)', async () => {
    await page.goto(at(`/cases/${caseId}/packet`));
    // A retry finds the version the attempt before wrote.
    const first = page.getByRole('region', { name: 'First version' });
    await expect(first.or(page.getByRole('table', { name: 'Line schedule' }))).toBeVisible();
    if ((await first.count()) > 0) {
      await page.getByRole('button', { name: 'Write the first version' }).click();
      await expect(page.locator('[data-notice="written"]')).toBeVisible();
    }
    const schedule = page.getByRole('table', { name: 'Line schedule' });
    await expect(schedule.locator('tbody tr')).toHaveCount(3);
    await expect(schedule.locator('thead th').last()).toHaveText('Trace');
    await expectNoSidewaysScroll(page, 'the packet builder');
    await expectFitsItsCard(schedule, 'the line schedule');
    await expect.soft(schedule.locator('thead th', { hasText: 'Window ends' })).toBeInViewport();
    await expectHeadersApart(schedule, 'the line schedule');
  });

  await test.step('claims and lines as the billing manager, with the PHI columns and an investigatory flag: the table fits its card, Status inside it (L3)', async () => {
    await page.goto(at('/claims'));
    const table = page.getByRole('table', { name: 'Claims and lines' });
    await expect(table.locator('thead th').first()).toHaveText(/^Patient reference/);
    await expect(table.locator('thead th').last()).toHaveText('Status');
    await expect(table.locator('[data-slot="status-chip"][data-status="flagged"]').first()).toBeVisible();
    await expectNoSidewaysScroll(page, 'claims and lines');
    await expectFitsItsCard(table, 'the claims table');
    await expectHeadersApart(table, 'the claims table');
  });

  await test.step('remittances, a remittance, coverage and the runs: every header stands apart from the next (C2), and a run that priced every line shows no empty table (C3)', async () => {
    await page.goto(at('/remittances'));
    await expectHeadersApart(page.getByRole('table', { name: 'Remittances' }), 'remittances');
    await expectNoSidewaysScroll(page, 'remittances');
    await page.goto(at(`/remittances/${remittanceId}`));
    await expectHeadersApart(page.getByRole('table', { name: 'Claims' }), 'the remittance’s claims');
    await expectNoSidewaysScroll(page, 'the remittance');
    await page.goto(at('/coverage'));
    await expectHeadersApart(page.getByRole('table', { name: 'Unpriced reasons and their remedies' }), 'coverage’s unpriced reasons');
    await expectNoSidewaysScroll(page, 'coverage');
    await page.goto(at(`/pricing-runs/${marchRun}`));
    const coverage = page.getByRole('region', { name: 'Coverage' });
    await expect(coverage).toContainText('3 of 3 lines priced');
    await expect.soft(coverage.getByRole('table')).toHaveCount(0);
    await expect.soft(coverage.locator('[data-slot="empty-state"]')).toContainText('No line of this run is unpriced');
    await expectHeadersApart(page.getByRole('table', { name: 'Run lines' }), 'the March run’s lines');
    await expectNoSidewaysScroll(page, 'the March run');
    await page.goto(at(`/pricing-runs/${aprilRun}`));
    await expectHeadersApart(page.getByRole('table', { name: 'Unpriced reasons' }), 'the April run’s unpriced reasons');
    await expect(page.getByRole('table', { name: 'Unpriced reasons' }).locator('[data-reason="NO_AGREEMENT"]')).toBeVisible();
    await expectNoSidewaysScroll(page, 'the April run');
  });

  await test.step('a line’s trace names its code-pair step NCCI PTP, never “Ncci ptp” (C1)', async () => {
    await page.goto(at(`/pricing-runs/${marchRun}`));
    await page.getByRole('table', { name: 'Run lines' }).getByRole('link', { name: 'Line trace' }).first().click();
    const steps = page.getByRole('list', { name: 'Trace steps' });
    await expect.soft(steps.locator('[data-step="ncci_ptp"] p').first()).toHaveText('NCCI PTP');
    await expect.soft(steps).not.toContainText('Ncci');
    await expectNoSidewaysScroll(page, 'the line’s trace');
  });
});
