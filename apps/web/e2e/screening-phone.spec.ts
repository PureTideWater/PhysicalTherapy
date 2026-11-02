import { createHash, randomBytes } from 'node:crypto';

import { type Page, expect, test } from '@playwright/test';
import { databaseClient } from '@tp/db';

import { WITHIN_REDUCTION_RANGE } from '../src/lib/screening/labels';
import { SCREENING_GROUPS_PER_PAGE } from '../src/lib/screening/routes';
import { atPhoneWidth, expectAccessible, expectScrollersAgree } from './a11y';
import { e2eDatabaseUrl } from './env';
import { withDatabase } from './helpers';
import { outboxFor } from './outbox';
import { CLEAN_ROWS, SCREENING_HEADER, SCREENING_ZIP, resultLinkIn, screeningRowsCsv, startLocalScreeningConsumer } from './screening';

/**
 * The screening result on a phone and from a desktop's width (test matrix TBL-05 to TBL-07; docs/adr/0078; UX-005,
 * UX-134). A prospect, with no account, screens CLEAN_ROWS (e2e/screening.ts) at 390 px; the screening consumer prices
 * it and emails the link; the link opens the result. Loaded at 390 px, the link to the audit request under the heading
 * is in view, and followed from the keyboard it puts the focus on the form's title, from which Tab goes into the form.
 * Each of the three tables (the anomalies by code and payer product, the coverage, the rows with the largest
 * differences) is a list of stacked items named by its card's title and its table is hidden: one item for each group,
 * coverage row and top row the database returns, each group's status the database's standing in words, an anomaly in
 * the unpriced tone (P4-DR-03), and each item's terms its table's headers but the naming columns, in their order; every
 * value lies in the window, no status is cut, the page does not scroll sideways, and axe finds nothing. Without script
 * the switch is the same: it is a container query. At 820 px the anomalies and the top rows stack while the coverage
 * keeps its table. At 1280 px the three tables show, with the database's rows, and the lists are hidden; the tables
 * hidden since the first load measure again, so the synthetic result's anomalies and coverage fit their cards (each
 * status wraps in its cell above a floor; a result whose figures run wider scrolls in the region with the cue) and the
 * top rows scroll in their region with the cue; axe finds nothing. Where the cards' content is exactly 54rem, the
 * narrowest width at which the tables show (994 px without a classic scrollbar; the step adds the bar's width, P4-DR-02,
 * P4-RC-03), the anomalies and the coverage still fit.
 *
 * Free of the screening journey's known races (screening.spec.ts; LANES.md "Handed to Lane A"): its own practice and
 * its own address on a .test domain of its own, so no other spec's screening is replaced and no other bucket of the
 * screening's rate limit is spent; no sign-in and no hardware key (the prospect's journey is public, and prepare.ts
 * approved the split); no read of the upload's status or the outcome's stage while the consumer prices; and, once the
 * email is in the outbox, a wait for the run's commit before the link is opened, since the consumer sends the email
 * inside its completion's transaction and a link opened before the commit is not found. Synthetic data only.
 */

/**
 * The key of the one screening stream's advisory lock: #42's SCREENING_STREAM_LOCK (e2e/mail.ts), which every
 * screening journey holds shared and #42's mail cut-off journey holds alone while it pauses the stream.
 */
const SCREENING_STREAM_LOCK = 760_065;

/**
 * The screening stream, held shared for the test (P4-DR-01): a screening sent while the cut-off journey has paused the
 * stream would wait for an email that never comes. Until #42 merges nothing else takes the key; once it has, the pull
 * request merged second may swap this for #42's holdScreeningStream('shared'). Its own time, as #42's streamTest: the
 * lock waits while the cut-off journey holds the stream alone, which may take that journey's whole 240 seconds.
 */
const phoneTest = test.extend<{ stream: undefined; consumer: Awaited<ReturnType<typeof startLocalScreeningConsumer>> }>({
  stream: [
    // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from its first parameter's pattern.
    async ({}, provide) => {
      const client = databaseClient(e2eDatabaseUrl());
      await client.connect();
      try {
        await client.query('SELECT pg_advisory_lock_shared($1)', [SCREENING_STREAM_LOCK]);
        try {
          await provide(undefined);
        } finally {
          await client.query('SELECT pg_advisory_unlock_shared($1)', [SCREENING_STREAM_LOCK]);
        }
      } finally {
        await client.end();
      }
    },
    { auto: true, timeout: 240_000 },
  ],
  // The journey's screening consumer (WORKER_JOBS=screening, in process), as screening.spec.ts runs it, inside the hold.
  consumer: [
    async ({ stream }, provide) => {
      void stream;
      const consumer = await startLocalScreeningConsumer();
      try {
        await provide(consumer);
      } finally {
        await consumer.close();
      }
    },
    { auto: true },
  ],
});

const PRACTICE = 'SYNTHETIC PHONE SCREENING CLINIC';
/** The prospect's address: one per worker, so a retry (a new worker) has an outbox and a rate limit's account of its own. */
const CONTACT = `screening-phone-${randomBytes(4).toString('hex')}@clinic-phone.synthetic.test`;
const FORBIDDEN = /\b(?:owed|under-?paid|recovered)\b/i;
/** The audit request's title, which the link under the result's heading reads too (components/screening/convert-form.tsx). */
const CONVERT_TITLE = 'Ask for a PaidWhole audit';

/**
 * The result's three cards, in the page's order: each card's title names its table and its stacked list, and the
 * columns its items' headings take, which are never a field.
 */
const ANOMALIES = { section: 'anomalies', title: 'Anomalies by code and payer product', naming: ['Code', 'Payer product'] } as const;
const COVERAGE = { section: 'coverage', title: 'Coverage, and the rows missing a contract', naming: ['Payer product', 'Outcome'] } as const;
const TOP_ROWS = { section: 'top-rows', title: 'Rows with the largest differences', naming: ['Row', 'Code', 'Payer product'] } as const;
const CARDS = [ANOMALIES, COVERAGE, TOP_ROWS] as const;
type Section = (typeof CARDS)[number]['section'];

/**
 * One copy of a card's rows (docs/adr/0078): the table's or the stacked list's. A part every component names for
 * itself (data-slot, data-tone) is in both copies, so a locator of one is scoped to a copy.
 */
function copyOf(page: Page, section: Section, copy: 'table' | 'rows') {
  return page.locator(`[data-section="${section}"] [data-stacked-copy="${copy}"]`);
}

function scrollTableOf(page: Page, section: Section) {
  return copyOf(page, section, 'table').locator('[data-slot="scroll-table"]');
}

/** A hook's value on each of a card's stacked items that carries it, in the list's order. */
function stackedHooks(page: Page, section: Section, hook: string): Promise<string[]> {
  return copyOf(page, section, 'rows')
    .locator(`[${hook}]`)
    .evaluateAll((items, name) => items.map((item) => item.getAttribute(name) ?? ''), hook);
}

/** What a card's scroller measures: its state, and the table's width against the room it has, so a failure says by how much. */
function fitOf(page: Page, section: Section) {
  return scrollTableOf(page, section).evaluate((holder) => {
    const scroller = holder.querySelector('[data-scroller]');
    return { scroll: holder.getAttribute('data-scroll'), table: scroller?.scrollWidth ?? null, room: scroller?.clientWidth ?? null };
  });
}

/** The page's own sideways overflow at the viewport's width, in pixels: 0 when it does not scroll sideways. */
function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
}

phoneTest('the screening result reads on a phone: its three tables as stacked rows with every value in the window, the tables from a desktop’s width, axe at 390 and 1280 px (TBL-05, TBL-06, TBL-07)', async ({ page, browser }) => {
  test.setTimeout(180_000);

  let link = '';
  await test.step('a prospect screens a clean file at 390 px; the consumer prices it, commits the run and emails the link', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/screening');
    await page.getByLabel('Practice name').fill(PRACTICE);
    await page.getByLabel('State').selectOption('MN');
    await page.getByLabel('ZIP code', { exact: true }).fill(SCREENING_ZIP);
    await page.getByLabel('Work email').fill(CONTACT);
    await page.getByLabel('File to screen').setInputFiles({ name: 'totals.csv', mimeType: 'text/csv', buffer: screeningRowsCsv([SCREENING_HEADER, ...CLEAN_ROWS]) });
    await expect(page.locator('[data-state="file-ready"]')).toBeVisible();
    await page.getByRole('button', { name: 'Screen the file' }).click();
    // Only that it was sent: the wait it words depends on the queue other specs share.
    await expect(page.locator('[data-state="sent"]')).toBeVisible();
    await expect.poll(() => outboxFor(CONTACT).length, { timeout: 90_000, intervals: [500] }).toBe(1);
    // The email is sent inside the completion's transaction: a link opened before its commit is not found.
    const runs = () =>
      withDatabase(async (client) => (await client.query<{ status: string }>('SELECT r.status FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1', [CONTACT])).rows.map((run) => run.status));
    await expect.poll(runs, { timeout: 30_000, intervals: [250] }).toEqual(['complete']);
    const [message] = outboxFor(CONTACT);
    if (message === undefined) {
      throw new Error('the outbox holds no message for the prospect');
    }
    link = resultLinkIn(message);
  });

  // What the page must list, from the database, in the order and at the page size the route reads it (P4-RC-05).
  const token = link.slice(link.lastIndexOf('/') + 1);
  const listed = await withDatabase(async (client) => {
    const sha = createHash('sha256').update(token).digest('hex');
    return {
      groups: (
        await client.query<{ grp: string; standing: string }>("SELECT procedure_code || ':' || payer_product AS grp, standing FROM screening_result_groups($1, 1, $2) ORDER BY group_no", [
          sha,
          SCREENING_GROUPS_PER_PAGE,
        ])
      ).rows,
      coverage: (
        await client.query<{ entry: string; reason: string | null }>(
          "SELECT c.payer_product || ':' || c.disposition AS entry, c.unpriced_reason AS reason FROM screening_result_coverage($1) WITH ORDINALITY AS c ORDER BY c.ordinality",
          [sha],
        )
      ).rows,
      rows: (await client.query<{ row_no: number; standing: string }>('SELECT t.row_no, t.standing FROM screening_result_rows($1, 25) WITH ORDINALITY AS t ORDER BY t.ordinality', [sha])).rows,
    };
  });
  // The result is the one CLEAN_ROWS gives: G01's 97110 within the range of the reduction across codes, 97140 an anomaly.
  expect(listed.groups).toEqual(expect.arrayContaining([{ grp: '97110:ma_noncontracted', standing: 'within_reduction_range' }, { grp: '97140:ma_noncontracted', standing: 'anomaly' }]));
  expect(listed.coverage.map((entry) => entry.reason)).toContain('ENGINE_ERROR');
  expect(listed.rows.length).toBeGreaterThan(0);

  await test.step('loaded at 390 px, each table is a list of stacked items with every column, every value in the window, and axe finds nothing (TBL-05, TBL-07)', async () => {
    await page.goto(link);
    await expect(page.getByRole('heading', { level: 1, name: 'Your free screening' })).toBeVisible();
    // The prospect's one action is in view on load, above every stacked list (UX-134).
    await expect(page.getByRole('link', { name: CONVERT_TITLE, exact: true })).toBeInViewport();
    for (const card of CARDS) {
      await expect(page.getByRole('list', { name: card.title, exact: true })).toBeVisible();
      await expect(page.getByRole('table', { name: card.title, exact: true })).toHaveCount(0);
      await expect(copyOf(page, card.section, 'table')).toBeHidden();
    }
    // Hydrated: every scroller has measured itself, a hidden table's as fitting (it measures 0 while hidden).
    await expect(page.locator('[data-slot="scroll-table"][data-scroll="unmeasured"]')).toHaveCount(0);

    // One item per group (and the others' sum when the table has it), coverage row and top row, in the database's order.
    const others = await copyOf(page, 'anomalies', 'table').locator('tfoot tr[data-group="others"]').count();
    expect(await stackedHooks(page, 'anomalies', 'data-stacked-group')).toEqual([...listed.groups.map((group) => group.grp), ...(others > 0 ? ['others'] : [])]);
    expect(await stackedHooks(page, 'coverage', 'data-stacked-coverage')).toEqual(listed.coverage.map((entry) => entry.entry));
    expect(await stackedHooks(page, 'coverage', 'data-stacked-reason')).toEqual(listed.coverage.flatMap((entry) => (entry.reason === null ? [] : [entry.reason])));
    expect(await stackedHooks(page, 'top-rows', 'data-stacked-row-no')).toEqual(listed.rows.map((row) => String(row.row_no)));

    // Each status: the database's standing, the table row's words, and an anomaly in the unpriced tone, never Short (a
    // screening makes no finding about a payer); every other standing neutral.
    const statuses = [
      ...listed.groups.map(({ grp, standing }) => ({ section: 'anomalies' as const, stacked: `[data-stacked-group="${grp}"]`, table: `[data-group="${grp}"]`, standing })),
      ...listed.rows.map(({ row_no: rowNo, standing }) => ({ section: 'top-rows' as const, stacked: `[data-stacked-row-no="${String(rowNo)}"]`, table: `[data-row-no="${String(rowNo)}"]`, standing })),
    ];
    for (const { section, stacked, table, standing } of statuses) {
      const chip = copyOf(page, section, 'rows').locator(`${stacked} [data-slot="status-chip"]`);
      await expect(chip).toHaveAttribute('data-stacked-standing', standing);
      await expect(chip).toHaveAttribute('data-tone', standing === 'anomaly' ? 'unpriced' : 'neutral');
      await expect(chip).toHaveText((await copyOf(page, section, 'table').locator(`${table} [data-slot="status-chip"]`).textContent()) ?? '');
    }
    const groupStatus = (grp: string) => copyOf(page, 'anomalies', 'rows').locator(`[data-stacked-group="${grp}"] [data-slot="status-chip"]`);
    await expect(groupStatus('97110:ma_noncontracted')).toHaveText(WITHIN_REDUCTION_RANGE);
    await expect(groupStatus('97140:ma_noncontracted')).toHaveText('Anomaly: more than $5 a claim line below the fully reduced figure');
    // The reason in words alone: its code stays in the item's hook.
    await expect(copyOf(page, 'coverage', 'rows')).not.toContainText('ENGINE_ERROR');

    // Every column but the naming ones, under the table's own header and in its order (the hidden table's headers); a
    // coverage row's Reason only when it has one, since the heading's outcome says what happened (UXR-03).
    for (const card of CARDS) {
      const headers = (await copyOf(page, card.section, 'table').locator('thead th').allTextContents()).map((header) => header.trim());
      const fields = headers.filter((header) => !(card.naming as readonly string[]).includes(header));
      expect(fields.length, `${card.title}: the columns that are fields`).toBe(headers.length - card.naming.length);
      const items = await copyOf(page, card.section, 'rows').evaluate((list) =>
        [...list.children].map((item) => ({
          key: item.getAttribute('data-stacked-row') ?? '',
          reason: item.hasAttribute('data-stacked-reason'),
          terms: [...item.querySelectorAll('dt')].map((term) => (term.textContent ?? '').trim()),
        })),
      );
      for (const item of items) {
        const expected = card === COVERAGE && !item.reason ? fields.filter((field) => field !== 'Reason') : fields;
        expect(item.terms, `${card.title}, item ${item.key}: its terms`).toEqual(expected);
      }
    }
    expect(await page.locator('body').innerText()).not.toMatch(FORBIDDEN);

    await atPhoneWidth(page, 'the screening result', { lists: CARDS.map((card) => card.title) });
  });

  await test.step('at 390 px the link under the heading takes the keyboard to the audit request: the form’s title holds the focus, in view, and Tab goes on into the form (UX-134)', async () => {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    const title = page.getByRole('heading', { level: 2, name: CONVERT_TITLE, exact: true });
    await expect(title).not.toBeInViewport();
    await page.getByRole('link', { name: CONVERT_TITLE, exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(title).toBeFocused();
    await expect(title).toBeInViewport();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Your name', { exact: true })).toBeFocused();
  });

  await test.step('without script, at 390 px, the lists show and the tables do not: the switch is a container query (TBL-06)', async () => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    try {
      const still = await context.newPage();
      await still.goto(link);
      for (const card of CARDS) {
        await expect(still.getByRole('list', { name: card.title, exact: true })).toBeVisible();
        await expect(still.getByRole('table', { name: card.title, exact: true })).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  });

  await test.step('at 820 px the anomalies and the top rows stack while the coverage keeps its table: each card switches at its own table’s width (TBL-06)', async () => {
    await page.setViewportSize({ width: 820, height: 1000 });
    for (const card of [ANOMALIES, TOP_ROWS]) {
      await expect(page.getByRole('list', { name: card.title, exact: true })).toBeVisible();
      await expect(page.getByRole('table', { name: card.title, exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole('table', { name: COVERAGE.title, exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: COVERAGE.title, exact: true })).toHaveCount(0);
    await expect.poll(() => sidewaysOverflow(page), { message: 'the screening result at 820 px scrolls sideways' }).toBe(0);
    await expectScrollersAgree(page, 'the screening result at 820 px');
  });

  await test.step('at 1280 px the three tables show with the database’s rows, the hidden tables measure again, the synthetic result’s anomalies and coverage fit, and axe finds nothing (TBL-06, TBL-07)', async () => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const rows: Readonly<Record<Section, number>> = { anomalies: listed.groups.length, coverage: listed.coverage.length, 'top-rows': listed.rows.length };
    for (const card of CARDS) {
      const table = page.getByRole('table', { name: card.title, exact: true });
      await expect(table).toBeVisible();
      await expect(table.locator('tbody tr')).toHaveCount(rows[card.section]);
      await expect(page.getByRole('list', { name: card.title, exact: true })).toHaveCount(0);
      await expect(copyOf(page, card.section, 'rows')).toBeHidden();
    }
    // A table hidden since the first load measured 0 and read "fits": shown, it measures again.
    await expectScrollersAgree(page, 'the screening result at 1280 px');
    await expect.poll(() => fitOf(page, 'anomalies'), { message: `${ANOMALIES.title} fits its card at 1280 px` }).toMatchObject({ scroll: 'fits' });
    await expect.poll(() => fitOf(page, 'coverage'), { message: `${COVERAGE.title} fits its card at 1280 px` }).toMatchObject({ scroll: 'fits' });
    // Sixteen columns: the top rows scroll in their region, with the cue.
    await expect(scrollTableOf(page, 'top-rows')).toHaveAttribute('data-scroll', 'overflows');
    await expect(scrollTableOf(page, 'top-rows').locator('[data-state="scrolls-sideways"]')).toBeVisible();
    await expect(page.getByRole('region', { name: `${TOP_ROWS.title}, scrolls sideways`, exact: true })).toBeVisible();
    await expect.poll(() => sidewaysOverflow(page), { message: 'the screening result at 1280 px scrolls sideways' }).toBe(0);
    await expectAccessible(page, 'the screening result at 1280 px');
  });

  await test.step('where the cards’ content is exactly 54rem, the narrowest width at which the tables show (994 px without a classic scrollbar), the synthetic result’s anomalies and coverage still fit (TBL-06; P4-RC-03)', async () => {
    // A classic scrollbar (a headed browser on most desktops) takes its width from the layout, so the viewport adds it:
    // the step means the same width of content headed, headless and on every platform.
    const bar = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
    const width = 994 + bar;
    await page.setViewportSize({ width, height: 720 });
    // The container its query reads: the anomalies card's content, 54rem.
    await expect.poll(() => page.evaluate(() => document.querySelector('[data-section="anomalies"] [data-slot="stacked-rows"]')?.clientWidth), { message: 'the cards’ content is 54rem' }).toBe(54 * 16);
    for (const card of [ANOMALIES, COVERAGE]) {
      await expect(page.getByRole('table', { name: card.title, exact: true })).toBeVisible();
      await expect(page.getByRole('list', { name: card.title, exact: true })).toHaveCount(0);
    }
    await expectScrollersAgree(page, `the screening result at ${String(width)} px`);
    await expect.poll(() => fitOf(page, 'anomalies'), { message: `${ANOMALIES.title} fits its card at ${String(width)} px` }).toMatchObject({ scroll: 'fits' });
    await expect.poll(() => fitOf(page, 'coverage'), { message: `${COVERAGE.title} fits its card at ${String(width)} px` }).toMatchObject({ scroll: 'fits' });
    await expect.poll(() => sidewaysOverflow(page), { message: `the screening result at ${String(width)} px scrolls sideways` }).toBe(0);
  });
});
