import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { type Page, expect, test } from '@playwright/test';

import { practiceId, refusal, registerKeyAndSignIn, signInWithTotp } from '/home/user/screens/apps/web/e2e/helpers';
import { startLocalWorker } from '/home/user/screens/apps/web/e2e/worker';

/**
 * Screens of audit #10 (a superseded re-run can be accepted), design lane-b-superseded-rerun §8.3, before and after.
 * Run by the Lane B screen tour's capture project (tools/lane-b-screen-tour, screens.config.ts) against a fresh
 * tp_e2e_screens database and the production build of /home/user/screens, on BOTH the PR's base and its head: every
 * state is reached by navigation and by the product's own forms and jobs, never by the presence of a button the fix
 * removes. Synthetic data only (fixture MAP-05, the seeded personas, release 900001).
 *
 * The flow is apps/web/e2e/pricing.spec.ts's (the console sets the location, the MAP-05 835 loads, the plan is mapped
 * as MA non-contracted, a billing manager creates a February run F and re-runs it as R), then the design's Sequence A
 * (§1.2, §6.6, review finding 1): before anyone accepts R, the billing manager creates a new run X of February on the
 * Pricing runs screen, priced after R. Shots are taken while X is queued (pending), once X is complete (superseded,
 * "nothing more to accept" on the head), after a mapping correction (superseded, "re-run that run" on the head), and
 * of a tab opened on R before X existed whose Accept is pressed afterwards (stale accept, before and after the press).
 */

const OUT = process.env.TOUR_DIR ?? '';
if (OUT === '') throw new Error('Set TOUR_DIR to the tour working directory (README, Set-up).');
const PNG = `${OUT}/png`;
const FIXTURES = '/home/user/screens/fixtures/synthetic';
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
// The narrowest phone (UX recheck of PR #50, N1: the longer "Re-run the run in effect under release N" button wraps).
const NARROW = { width: 320, height: 568 };
const WIDTHS = [DESKTOP, PHONE] as const;

interface Shot {
  readonly file: string;
  readonly route: string;
  readonly state: string;
  readonly width: number;
}
const shots: Shot[] = [];
const skipped: string[] = [];
let counter = 0;

function record(): void {
  writeFileSync(`${OUT}/shots.json`, `${JSON.stringify({ shots, skipped }, null, 2)}\n`);
}

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

/** The page as it stands now (no navigation), at its current width. */
async function save(page: Page, name: string, state: string, tag?: string, quick = tag !== undefined && tag !== 'c'): Promise<void> {
  // A quick shot is the refusal moment (tags "a", "b"), while the page's refresh is held on purpose: waiting for the
  // network to go idle would wait on that held read and outlast the head's focus hand-off (action-form.tsx
  // TAKEOVER_MS, 15 s), so it waits only for the load, the fonts and a short pause. Tag "c" is a 320 px shot of a state
  // already shot at 1280 and 390 px, added after them without renumbering; it settles as usual.
  if (!quick) {
    await settle(page);
  } else {
    await page.waitForLoadState('load');
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForTimeout(400);
  }
  // A tagged shot (tag "a", "b", "c") sits after shot `counter` without taking a number, so a shot only one side of a
  // before/after pair, or only a later tour, has does not renumber the shots after it.
  if (tag === undefined) counter += 1;
  const width = page.viewportSize()?.width ?? 0;
  const file = `${PNG}/${String(counter).padStart(2, '0')}${tag ?? ''}-${name}-${String(width)}.png`;
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  const url = new URL(page.url());
  shots.push({ file, route: `${url.pathname}${url.search}`, state, width });
  record();
}

/** Whether the page offers the run in effect's Re-run (head only), logged beside a 320 px shot for the record. */
async function logRerunOffer(page: Page, file: string): Promise<void> {
  const offered = await page.getByRole('button', { name: /^Re-run the run in effect under release \d+$/ }).count();
  console.log(`320 px ${file}: "Re-run the run in effect" buttons ${String(offered)}`);
}

/**
 * Opens the route at 1280 then 390 px and saves each; a failure is recorded and the capture goes on. `narrow` adds a
 * 320 px shot: tagged "c" (no new number) for a state earlier tours shot at two widths only, or numbered ("numbered")
 * for a state new to this spec.
 */
async function capture(page: Page, name: string, route: string, state: string, narrow?: 'tagged' | 'numbered'): Promise<void> {
  await test.step(`${name} (${state})`, async () => {
    try {
      for (const size of WIDTHS) {
        await page.setViewportSize(size);
        await page.goto(route);
        await save(page, name, state);
      }
      if (narrow !== undefined) {
        await page.setViewportSize(NARROW);
        await page.goto(route);
        await save(page, name, state, narrow === 'tagged' ? 'c' : undefined);
        await logRerunOffer(page, `${name} (${state})`);
      }
    } catch (error) {
      skipped.push(`${name} (${state}): ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
      record();
    } finally {
      await page.setViewportSize(DESKTOP);
    }
  });
}

function runIdOf(page: Page): string {
  return new URL(page.url()).pathname.split('/').at(-1) ?? '';
}

/** Reloads the run's page until it shows complete. */
async function untilComplete(page: Page): Promise<void> {
  await expect(async () => {
    await page.reload();
    await expect(page.locator('[data-status="complete"]').first()).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 120_000 });
}

// No action waits forever: a missing control fails its step in 30 s, not the whole test at its timeout.
test.use({ actionTimeout: 30_000, navigationTimeout: 60_000 });

test('audit #10 screens: a re-run superseded by a newer run of its month (synthetic, MAP-05)', async ({ page, browser }) => {
  test.setTimeout(900_000);
  mkdirSync(PNG, { recursive: true });
  record();
  await page.setViewportSize(DESKTOP);
  await signInWithTotp(page, 'pricing-manager');
  const other = await practiceId('other');
  const runs = `/p/${other}/pricing-runs`;

  await test.step('the console sets the pricing location and place-of-service settings (as pricing.spec.ts)', async () => {
    const context = await browser.newContext();
    const admin = await context.newPage();
    try {
      await registerKeyAndSignIn(admin, 'pricing-admin');
      await admin.goto(`/console/practices/${other}`);
      await admin.getByLabel('Billing ZIP (ZIP+4 if Medicare needs one)').fill('00011');
      await admin.getByRole('button', { name: 'Save the location' }).click();
      await expect(admin.locator('[data-notice="location"]')).toBeVisible();
      await admin.getByLabel('Places of service priced as facility').fill('22');
      await admin.getByLabel('Places of service priced as non-facility').fill('11');
      await admin.getByLabel('Default rounding when a contract is silent').selectOption('HALF_UP_CENT');
      await admin.getByRole('button', { name: 'Save the settings' }).click();
      await expect(admin.locator('[data-notice="saved"]')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  await test.step('the SYNTHETIC MAP-05 remittance loads', async () => {
    await page.goto(`/p/${other}/uploads`);
    const local = await startLocalWorker();
    try {
      await page.getByLabel('Choose files to upload').setInputFiles([{ name: 'advantage.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'MAP-05', 'remit.835')) }]);
      await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'advantage.835' })).toContainText('Loaded 1 remittance, 1 claim and 3 lines', { timeout: 90_000 });
    } finally {
      await local.close();
    }
  });

  // The mapping screen lists only plans waiting on mapping by default, so the plan's own page is kept from the first
  // mapping and the correction goes there directly.
  let planPage = '';
  const mapPlan = async (correct: boolean): Promise<void> => {
    if (planPage === '') {
      await page.goto(`/p/${other}/mapping`);
      const row = page.getByRole('table', { name: 'Payers and plans' }).getByRole('row').filter({ hasText: 'SYNPLAN-MA-05' });
      await row.getByRole('link', { name: 'CE:SYNPLAN-MA-05' }).click();
      await expect(page.getByLabel('Agreement', { exact: true })).toBeVisible();
      planPage = new URL(page.url()).pathname;
    } else {
      await page.goto(planPage);
    }
    await page.getByLabel('Agreement', { exact: true }).selectOption({ label: 'Medicare Advantage, non-contracted' });
    await page.getByLabel('Effective from', { exact: true }).fill('2026-01-01');
    if (correct) {
      // A correction of the mapping in force (MAP-03): the same agreement, superseding it, so every earlier run
      // reads "a plan's mapping changed" (rerunReasons) while February prices the same.
      await page.getByLabel('Corrects', { exact: true }).selectOption({ index: 1 });
    }
    await page.getByRole('button', { name: 'Save the mapping' }).click();
    // A first mapping says "mapped", a correction "corrected" (lib/routes/mapping.ts).
    await expect(page.locator(`[data-notice="${correct ? 'corrected' : 'mapped'}"]`)).toBeVisible();
  };

  await test.step('the plan is mapped as Medicare Advantage non-contracted', async () => {
    await mapPlan(false);
  });

  let first = '';
  await test.step('run F of February is created on the Pricing runs screen and priced', async () => {
    await page.goto(runs);
    const local = await startLocalWorker();
    try {
      const create = page.getByRole('region', { name: 'Create a run' });
      await create.getByLabel('First month of service').fill('2026-02');
      await create.getByRole('button', { name: 'Create the run' }).click();
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Pricing run, 2026-02-01 to 2026-02-28');
      first = runIdOf(page);
      await untilComplete(page);
    } finally {
      await local.close();
    }
  });

  let rerun = '';
  await test.step('F is re-run from its page (R), and R is priced', async () => {
    await page.goto(`${runs}/${first}`);
    const local = await startLocalWorker();
    try {
      await page.getByRole('button', { name: /^Re-run under release \d+$/ }).click();
      await expect(page.getByRole('region', { name: 'Re-run' })).toBeVisible();
      rerun = runIdOf(page);
      // The diff, or (accepting it changing nothing, the head since its second fix round) its one no-changes line.
      await expect(async () => {
        await page.reload();
        await expect(page.locator('[data-state="diff-summary"], [data-state="no-changes"]').first()).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 120_000 });
    } finally {
      await local.close();
    }
    expect(rerun).not.toBe(first);
  });

  await capture(page, 'rerun-page', `${runs}/${rerun}`, 'R awaiting acceptance, F in effect (control)');

  // A tab opened on R while it is still the newest pricing of February: its Accept is pressed after X completes.
  const stale = await page.context().newPage();
  await stale.setViewportSize(DESKTOP);
  await stale.goto(`${runs}/${rerun}`);
  await settle(stale);

  let newer = '';
  await test.step('before anyone accepts R, a new run X of February is created on the Pricing runs screen (queued: no worker yet)', async () => {
    await page.goto(runs);
    const create = page.getByRole('region', { name: 'Create a run' });
    await create.getByLabel('First month of service').fill('2026-02');
    await create.getByRole('button', { name: 'Create the run' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Pricing run, 2026-02-01 to 2026-02-28');
    newer = runIdOf(page);
    expect([first, rerun]).not.toContain(newer);
  });

  const PENDING = 'pending: X of the same month queued, R awaiting acceptance';
  await capture(page, 'rerun-page', `${runs}/${rerun}`, PENDING);
  await capture(page, 'original-run-page', `${runs}/${first}`, PENDING);
  await capture(page, 'releases', `/p/${other}/releases`, PENDING);

  await test.step('the worker prices X', async () => {
    await page.goto(`${runs}/${newer}`);
    const local = await startLocalWorker();
    try {
      await untilComplete(page);
    } finally {
      await local.close();
    }
  });

  const SUPERSEDED = 'superseded: X of the same month complete and in effect after R was priced; X has no re-run reason';
  await capture(page, 'rerun-page', `${runs}/${rerun}`, SUPERSEDED);
  await capture(page, 'original-run-page', `${runs}/${first}`, `${SUPERSEDED}; F not in effect (its page and its re-runs list)`);
  await capture(page, 'compare-original-rerun', `${runs}/compare?before=${first}&after=${rerun}`, SUPERSEDED);
  await capture(page, 'pricing-runs-list', runs, SUPERSEDED);
  await capture(page, 'newer-run-page', `${runs}/${newer}`, `${SUPERSEDED}; X in effect`);
  await capture(page, 'releases', `/p/${other}/releases`, SUPERSEDED);

  await test.step('the plan’s mapping is corrected (same agreement), so X would price differently now', async () => {
    try {
      await mapPlan(true);
    } catch (error) {
      skipped.push(`mapping correction: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
      record();
    }
  });

  const SUPERSEDED_RERUN = 'superseded: X in effect and would price differently now (a mapping corrected after X)';
  await capture(page, 'rerun-page', `${runs}/${rerun}`, SUPERSEDED_RERUN, 'tagged');
  await capture(page, 'original-run-page', `${runs}/${first}`, SUPERSEDED_RERUN);
  await capture(page, 'compare-original-rerun', `${runs}/compare?before=${first}&after=${rerun}`, SUPERSEDED_RERUN);
  await capture(page, 'pricing-runs-list', runs, SUPERSEDED_RERUN);
  await capture(page, 'releases', `/p/${other}/releases`, SUPERSEDED_RERUN);

  await test.step('stale accept: the tab opened on R before X existed presses Accept', async () => {
    try {
      const STALE = 'stale tab on R, loaded before X existed, X now in effect: before pressing Accept';
      await save(stale, 'stale-rerun-before-accept', STALE);
      await stale.setViewportSize(PHONE);
      await save(stale, 'stale-rerun-before-accept', STALE);
      await stale.setViewportSize(DESKTOP);
      // The refusal moment (head only): ActionForm's refreshOnError reads the page again (router.refresh, a GET with
      // the RSC header) right after a refusal. Those reads are held until the refusal is captured, then let through;
      // the gate opens by itself after 60 s, so a page that needs such a read to show its result (the base's
      // acceptance) is only delayed. The server action's own POST is never held.
      let open: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        open = resolve;
        setTimeout(resolve, 60_000);
      });
      await stale.route('**/*', async (route) => {
        const request = route.request();
        const headers = request.headers();
        if (request.method() === 'GET' && headers.rsc === '1' && headers['next-action'] === undefined) await gate;
        await route.continue().catch(() => undefined);
      });
      const refused = refusal(stale).filter({ hasText: 'This re-run:' });
      const explanation = refusal(stale).filter({ hasText: 'A newer run of these service dates is in effect' });
      await stale.getByRole('button', { name: 'Accept this run' }).click();
      // The base accepts (data-state="accepted"); the head refuses ("This re-run: ...").
      await expect(stale.locator('[data-state="accepted"]').or(refused)).toBeVisible({ timeout: 30_000 });
      if (await refused.isVisible()) {
        const REFUSED = 'stale tab on R: Accept refused, before the page refreshes (head only: the base accepts)';
        await save(stale, 'stale-rerun-refused', REFUSED, 'a');
        await stale.setViewportSize(PHONE);
        await save(stale, 'stale-rerun-refused', REFUSED, 'b');
        await stale.setViewportSize(DESKTOP);
      }
      open();
      // Then the page as it settles: accepted on the base, the explanation in place of the form on the head.
      await expect(stale.locator('[data-state="accepted"]').or(explanation)).toBeVisible({ timeout: 30_000 });
      // The head hands the refused form's focus to the explanation that takes its place ([data-takes-over^="accept:"]);
      // the base has no such element. Logged for the record, not asserted, so the same spec runs on both.
      await stale.waitForTimeout(500);
      const focused = await stale.evaluate(() => document.activeElement?.getAttribute('data-takes-over') ?? document.activeElement?.tagName ?? 'none');
      console.log(`stale accept: focus after the refresh is on ${focused}`);
      const AFTER = 'stale tab on R: after pressing Accept (the base accepts it; the head refuses and refreshes)';
      await save(stale, 'stale-rerun-after-accept', AFTER);
      await stale.setViewportSize(PHONE);
      await save(stale, 'stale-rerun-after-accept', AFTER);
      await stale.setViewportSize(NARROW);
      await save(stale, 'stale-rerun-after-accept', AFTER, 'c');
      await logRerunOffer(stale, 'stale-rerun-after-accept');
    } catch (error) {
      skipped.push(`stale accept: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
      record();
    } finally {
      await stale.close();
    }
  });

  const AFTER_STALE = 'after the stale Accept was pressed';
  await capture(page, 'rerun-page', `${runs}/${rerun}`, AFTER_STALE, 'tagged');
  await capture(page, 'original-run-page', `${runs}/${first}`, AFTER_STALE);
  await capture(page, 'coverage', `/p/${other}/coverage`, AFTER_STALE);

  // A re-run whose acceptance diff has changed lines (UX recheck of PR #50, N3: the changed-lines table scrolls
  // sideways on a phone). The plan's mapping is corrected to out of network, so every February line would read
  // NO_AGREEMENT (docs/product/unpriced-reasons.md) instead of its MA non-contracted price, and the run in effect is
  // re-run: from the superseded re-run's page where it offers "Re-run the run in effect" (head), else from the run in
  // effect's own page (the base, where the stale Accept made R the run in effect). Taken last, so no earlier shot moves.
  let changed = '';
  await test.step('the plan’s mapping is corrected to out of network, and the run in effect is re-run (changed lines)', async () => {
    try {
      await page.goto(planPage);
      await page.getByLabel('Agreement', { exact: true }).selectOption({ label: 'No agreement (out of network)' });
      await page.getByLabel('Effective from', { exact: true }).fill('2026-01-01');
      await page.getByLabel('Corrects', { exact: true }).selectOption({ index: 1 });
      await page.getByRole('button', { name: 'Save the mapping' }).click();
      await expect(page.locator('[data-notice="corrected"]')).toBeVisible();
      await page.goto(`${runs}/${rerun}`);
      const offer = page.getByRole('button', { name: /^Re-run the run in effect under release \d+$/ });
      let from = page.url();
      if ((await offer.count()) === 0) {
        await page.goto(runs);
        const inEffect = page.getByRole('list', { name: 'Pricing runs' }).getByRole('listitem').filter({ has: page.locator('[data-state="in-effect"]') });
        await inEffect.getByRole('link', { name: /^Pricing run, 2026-02-01 to 2026-02-28, / }).first().click();
        await expect(page.getByRole('button', { name: /^Re-run under release \d+$/ })).toBeVisible();
        from = page.url();
      }
      const local = await startLocalWorker();
      try {
        await page.getByRole('button', { name: /^Re-run (the run in effect )?under release \d+$/ }).click();
        await expect(page).not.toHaveURL(from);
        await expect(page.getByRole('region', { name: 'Re-run' })).toBeVisible();
        changed = runIdOf(page);
        await expect(async () => {
          await page.reload();
          await expect(page.locator('[data-state="diff-summary"], [data-state="no-changes"]').first()).toBeVisible({ timeout: 1_000 });
        }).toPass({ timeout: 120_000 });
      } finally {
        await local.close();
      }
      const lines = await page.getByRole('table', { name: 'Changed lines' }).getByRole('row').count();
      console.log(`changed-lines re-run ${changed}: Changed lines table rows (with its header) ${String(lines)}`);
      // Changed lines, not the no-changes line (the table's name is the head's; the base's table may have none).
      await expect(page.locator('[data-state="diff-summary"]')).toBeVisible();
      await expect(page.locator('[data-state="no-changes"]')).toHaveCount(0);
    } catch (error) {
      skipped.push(`changed-lines re-run: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
      record();
    }
  });

  if (changed !== '') {
    const CHANGED = 'changed lines: the plan corrected to out of network, the run in effect re-run, awaiting acceptance (every line priced in effect would read NO_AGREEMENT)';
    await capture(page, 'changed-rerun-page', `${runs}/${changed}`, CHANGED, 'numbered');
    await test.step('the changed-lines re-run is accepted', async () => {
      try {
        await page.goto(`${runs}/${changed}`);
        await page.getByRole('button', { name: 'Accept this run' }).click();
        await expect(page.locator('[data-state="accepted"]')).toBeVisible({ timeout: 30_000 });
      } catch (error) {
        skipped.push(`changed-lines accept: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
        record();
      }
    });
    await capture(page, 'changed-rerun-page', `${runs}/${changed}`, 'changed lines: that re-run accepted and in effect', 'numbered');
  }

  writeFileSync(`${OUT}/ids.superseded.json`, `${JSON.stringify({ practice: other, first, rerun, newer, changed }, null, 2)}\n`);
  record();
  expect(skipped).toEqual([]);
});
