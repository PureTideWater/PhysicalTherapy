import { type Locator, type Page, expect, test } from '@playwright/test';

import { expectScrollersAgree, tabTo } from './a11y';
import { signInWithTotp, withDatabase } from './helpers';
import { tourPractice } from './journeys';
import { startLocalWorker } from './worker';

/**
 * The screens the screen tour found too wide or running together, at a 1280 px desktop window (the tour's L1 to L3,
 * C1 to C3), on the tour's shape of data (e2e/journeys.ts, tourPractice): in a practice of its own in the other group,
 * a billing manager uploads SYNTHETIC CAS-08 (payer Q, three 97110 lines in March, each 30.00 short) and CAS-02 (payer
 * N, 32 lines in April); payer Q's schedule is abstracted by the contract specialist (each field "Approved by the
 * contract specialist" with its time) and signed off beside the browser; payer N's plan is mapped as no agreement on
 * screen; March and April are priced and triaged by the worker (a case of payer Q's three lines; payer N's lines to
 * anomaly screening, some flagged as investigatory); and the billing manager writes the case's first packet version.
 * Then, as the billing manager, no page scrolls sideways (document.documentElement.scrollWidth is 1280): the contract
 * version's rate record fields, the packet's line schedule and the claims table (the billing manager's, with its PHI
 * columns) each fit their card with their last column inside it, at 1280 px and at 1280 less a classic scrollbar, and,
 * fitting, say nothing of scrolling: no caption, and a scroller with no role and no tab stop, even while a link in the
 * table holds focus (TBL-01, TBL-02; docs/adr/0078); the pricing runs' compare form fits its card; each table's headers
 * stand apart (the uploads, an upload, a contract and the coverage report's too); Settings, Correspondence and a packet
 * found by its reference fit the window too; a trace's code-pair step names NCCI in capitals; and a run that priced
 * every line shows its unpriced reasons as an empty state. Each check is soft, so one run reports every screen that
 * fails. Synthetic data only.
 */

const PRACTICE = 'SYNTHETIC OTHER PRACTICE LAYOUT';
const MANAGER = 'pricing-manager';
const WIDTH = 1280;
/**
 * The width the fit is checked at again (DR-04): 1280 less a classic 17 px scrollbar, which a Windows desktop or a Mac
 * set to show scrollbars takes from the page and headless Chromium does not.
 */
const WITH_SCROLLBAR = WIDTH - 17;
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

/**
 * Expects the table to fit its card at 1280 px and at 1280 less a classic scrollbar, its last column's header inside
 * it; and, once every scroller agrees with what it measures, its ScrollTable to say nothing of scrolling: it reads
 * data-scroll="fits", its scroller has no role and no tab stop, and the page shows no caption (no idle tab stop at
 * 1280; docs/adr/0078). The window is put back at 1280.
 */
async function expectFitsItsCard(table: Locator, what: string): Promise<void> {
  const page = table.page();
  try {
    for (const width of [WIDTH, WITH_SCROLLBAR]) {
      await page.setViewportSize({ width, height: 900 });
      const at = `${what} at ${String(width)} px`;
      await expectScrollersAgree(page, at, { soft: true });
      const found = await placement(table);
      expect.soft(found.past, `${at}: headers past the card (${found.widths})`).toEqual([]);
      expect.soft(found.fits, `${at}: the table fits its card (${found.widths})`).toBe(true);
      await expect.soft(table.locator('xpath=ancestor::*[@data-slot="scroll-table"][1]'), `${at}: its ScrollTable fits`).toHaveAttribute('data-scroll', 'fits');
      await expectPlainBox(table, at);
      await expect.soft(page.locator('[data-state="scrolls-sideways"]'), `${at}: no caption says a table scrolls`).toHaveCount(0);
    }
  } finally {
    await page.setViewportSize({ width: WIDTH, height: 900 });
  }
}

/** Expects the table's scroller to be a plain box: no role, no name and no tab stop. */
async function expectPlainBox(table: Locator, what: string): Promise<void> {
  const scroller = table.locator('xpath=..');
  await expect.soft(scroller, `${what}: the scroller is no region`).not.toHaveAttribute('role');
  await expect.soft(scroller, `${what}: the scroller has no name`).not.toHaveAttribute('aria-label');
  await expect.soft(scroller, `${what}: the scroller is no tab stop`).not.toHaveAttribute('tabindex');
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
  await signInWithTotp(page, MANAGER);
  const local = await startLocalWorker();
  let practiceId = '';
  try {
    practiceId = await tourPractice(page, { name: PRACTICE, manager: MANAGER });
  } finally {
    await local.close();
  }
  const at = (screen = '') => `/p/${practiceId}${screen}`;

  const { caseId, versionId, contractId, documentId, marchRun, aprilRun, remittanceId } = await withDatabase(async (client) => {
    const one = async (sql: string) => (await client.query<{ id: string }>(sql, [practiceId])).rows[0]?.id ?? '';
    return {
      caseId: await one('SELECT case_id AS id FROM case_line WHERE practice_id = $1 LIMIT 1'),
      versionId: await one("SELECT id FROM contract_version WHERE practice_id = $1 AND status = 'signed_off' ORDER BY created_at LIMIT 1"),
      contractId: await one("SELECT contract_id AS id FROM contract_version WHERE practice_id = $1 AND status = 'signed_off' ORDER BY created_at LIMIT 1"),
      documentId: await one("SELECT d.id FROM source_document d JOIN remittance r ON r.source_document_id = d.id WHERE d.practice_id = $1 AND r.trn02 = 'SYNEFTCAS08001' LIMIT 1"),
      marchRun: await one("SELECT id FROM pricing_run WHERE practice_id = $1 AND period_from = '2026-03-01' AND status = 'complete' ORDER BY created_at LIMIT 1"),
      aprilRun: await one("SELECT id FROM pricing_run WHERE practice_id = $1 AND period_from = '2026-04-01' AND status = 'complete' ORDER BY created_at LIMIT 1"),
      remittanceId: await one("SELECT r.id FROM remittance r WHERE r.practice_id = $1 AND r.trn02 = 'SYNEFTCAS08001' LIMIT 1"),
    };
  });
  for (const found of [caseId, versionId, contractId, documentId, marchRun, aprilRun, remittanceId]) {
    expect(found).not.toBe('');
  }

  await test.step('the contract version: each rate record field’s approval, “the contract specialist” and its time, stays inside its card (L1)', async () => {
    await page.goto(at(`/contracts/versions/${versionId}`));
    const record = page.getByRole('region', { name: 'Rate record 1', exact: true });
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

  await test.step('the packet builder: the line schedule fits its card, its window column (“Deadline” since tp-packet/2) and the trace column inside it (L2)', async () => {
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
    // A tp-packet/2 version's window column is its deadline, with the window's end and its status (CO-05).
    await expect.soft(schedule.locator('thead th', { hasText: 'Deadline' })).toBeInViewport();
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
    // A link inside a table that fits takes focus by Tab, and its scroller stays a plain box: only the scroller's own
    // focus keeps a region (DR-01), so nobody hears "scrolls sideways" over a table that does not.
    const first = table.getByRole('link').first();
    await tabTo(page, { role: 'link', name: ((await first.getAttribute('aria-label')) ?? (await first.textContent()) ?? '').trim() });
    await expect(first).toBeFocused();
    await expectPlainBox(table, 'the claims table, a link in it focused');
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

  await test.step('the pricing runs: comparing the March and April runs, each select as wide as its column, not its longest run’s name', async () => {
    await page.goto(at('/pricing-runs'));
    const compare = page.getByRole('region', { name: 'Compare two runs' });
    await expect(compare.getByLabel('Second run')).toBeVisible();
    await expectNoSidewaysScroll(page, 'the pricing runs');
    const past = await compare.evaluate((card) => {
      const right = card.getBoundingClientRect().right;
      return [...card.querySelectorAll('select, button')].filter((control) => control.getBoundingClientRect().right > right + 0.5).length;
    });
    expect.soft(past, 'controls past the compare card').toBe(0);
  });

  await test.step('the uploads, an upload, a contract and the coverage report: every header stands apart from the next (C2)', async () => {
    await page.goto(at('/uploads'));
    await expectHeadersApart(page.getByRole('region', { name: 'Receipts', exact: true }).getByRole('table'), 'the uploads’ receipts');
    await expectNoSidewaysScroll(page, 'the uploads');
    await page.goto(at(`/uploads/${documentId}`));
    await expectHeadersApart(page.getByRole('table', { name: 'Transaction sets' }), 'the upload’s transaction sets');
    await expectNoSidewaysScroll(page, 'the upload');
    await page.goto(at(`/contracts/${contractId}`));
    await expectHeadersApart(page.getByRole('table', { name: 'Versions' }), 'the contract’s versions');
    await expectNoSidewaysScroll(page, 'the contract');
    await page.goto(at('/coverage'));
    await page.getByRole('region', { name: 'Coverage report' }).getByRole('button', { name: 'Generate the coverage report' }).click();
    await expect(page).toHaveURL(/\/reports\/documents\/[0-9a-f-]{36}$/);
    await expectHeadersApart(page.getByRole('table', { name: 'Unpriced reasons and their remedies' }), 'the coverage report’s unpriced reasons');
    await expectNoSidewaysScroll(page, 'the coverage report');
  });

  await test.step('Settings, Correspondence (read-only for the billing manager) and Cases, a packet by its reference, fit the window (audit item #37 part 1)', async () => {
    await page.goto(at('/settings/correspondence'));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoSidewaysScroll(page, 'Settings, Correspondence');
    await page.goto(at('/cases/by-reference?reference=ZZZZZ-ZZZZZ'));
    await expect(page.getByRole('region', { name: 'Packets with this reference' })).toBeVisible();
    await expectNoSidewaysScroll(page, 'a packet by its reference');
  });

  await test.step('a line’s trace names its code-pair step in words with NCCI in capitals, never “Ncci ptp” (C1)', async () => {
    await page.goto(at(`/pricing-runs/${marchRun}`));
    await page.getByRole('table', { name: 'Run lines' }).getByRole('link', { name: 'Line trace' }).first().click();
    const steps = page.getByRole('list', { name: 'Trace steps' });
    await expect.soft(steps.locator('[data-step="ncci_ptp"] h3')).toHaveText('Step 3, continued: National Correct Coding Initiative (NCCI) procedure-to-procedure edits');
    await expect.soft(steps).not.toContainText('Ncci');
    await expectNoSidewaysScroll(page, 'the line’s trace');
  });
});
