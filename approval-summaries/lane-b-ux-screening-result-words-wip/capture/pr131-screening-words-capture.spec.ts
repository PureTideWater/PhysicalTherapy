import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { type Browser, type BrowserContextOptions, type Locator, type Page, expect, test } from '@playwright/test';

import { outboxFor } from '/home/user/screens/apps/web/e2e/outbox';
import { CLEAN_ROWS, OUTSIDE_ROWS, SCREENING_ZIP, SMALL_ROWS, resultLinkIn, screeningCsv, startLocalScreeningConsumer } from '/home/user/screens/apps/web/e2e/screening';

/**
 * PR #131 (co-001/ux-screening-result-words, UX PR 4b), before and after: the states its description's "Reviewer
 * agents' findings" list names, beside the tour's own screening.* and screening-result.* shots. Extended from PR #83's
 * capture spec (approval-summaries/lane-b-ux-screening-result-tables-wip/capture). Synthetic data only. One spec for
 * both sides: each run's /home/user/screens is checked out at that side's ref, so the live pages and the static
 * harness both draw that ref's own components.
 *
 * Runs on a fresh prepare, before the tour's restricted run (or after it on the same server: its practices are not the
 * tour's, so the tour's send and conversion touch neither result), with screens.config.ts's capture
 * project (its browser rasterizes text as the repository's e2e browser does):
 *
 *   cd $TOUR_DIR && ./node_modules/.bin/playwright test --config $TOUR_DIR/screens.config.ts --project capture \
 *     --workers 1 pr131-screening-words-capture.spec.ts
 *
 * Its own two live sends through /screening (the screening consumer started here, the link read from the local outbox):
 * - one anomaly: the tour's file (CLEAN_ROWS, SMALL_ROWS and OUTSIDE_ROWS), whose 97140 ma_noncontracted row is the
 *   one anomaly, as SYNTHETIC SCREENING CLINIC A;
 * - no anomaly: the same file less that row, as SYNTHETIC SCREENING CLINIC B.
 * (A practice has one screening at a time: a later send of the same practice name and ZIP code, or the same email,
 * replaces the earlier, so the names differ from each other and from the tour's.)
 * Shots (full page unless named): screening-result.one-anomaly.{1280,1280-dark,390,390-dark}; .no-anomaly.{1280,390};
 * .band.820; .top-rows-scrolled.390 and .top-rows-tab-focus.1280 (viewport); .summary-card.{1280,390} (the "Priced under
 * Medicare" card, an element shot); element shots at device scale 2 of a chip with its $5 (.chip-anomaly-2x.1280 in the
 * table copy, .chip-anomaly-2x.390 in the stacked copy, .chip-below-2x.1280) and of the anomalies card's description
 * (.anomalies-description-2x.1280); the static harness pages screening-result-harness.several.{1280,1280-dark,390},
 * .one-other.{1280,390}, .others.{1280,390}, and two harness chips at device scale 2. Each shot merges into
 * $TOUR_DIR/shots.json in the tour's entry shape (a failure into its `skipped`); measurements go to
 * $TOUR_DIR/capture-measures.json.
 */

const OUT = process.env.TOUR_DIR ?? '';
if (OUT === '') throw new Error('Set TOUR_DIR (README, Set-up).');
const PNG = `${OUT}/png`;
const SHOTS_JSON = `${OUT}/shots.json`;
const MEASURES = `${OUT}/capture-measures.json`;
const LINKS = `${OUT}/pr131-links.json`;
const PROGRESS = `${OUT}/progress.log`;
const HARNESS = process.env.HARNESS_DIR ?? `${OUT}/harness`;
const ROUTE = '/screening/results/[resultId]';
const HARNESS_ROUTE = '/screening/results/[resultId] (static harness)';
const DARK = 'dark (tokens only)';
const DESKTOP: BrowserContextOptions = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const PHONE: BrowserContextOptions = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const BAND: BrowserContextOptions = { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1 };
const DESKTOP_2X: BrowserContextOptions = { ...DESKTOP, deviceScaleFactor: 2 };
const PHONE_2X: BrowserContextOptions = { ...PHONE, deviceScaleFactor: 2 };
const COMMIT = execFileSync('git', ['-C', '/home/user/screens', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const AT = COMMIT.slice(0, 8);
mkdirSync(PNG, { recursive: true });

interface ShotEntry {
  readonly file: string;
  readonly id: string;
  readonly path: string;
  readonly routePattern: string;
  readonly role: string;
  readonly width: number;
  readonly theme: 'light' | typeof DARK;
  readonly state: string;
  readonly note: string;
}
interface ShotsFile {
  shots: ShotEntry[];
  skipped: { shot: string; route: string; reason: string }[];
  emails?: Record<string, string>;
}

function readShots(): ShotsFile {
  if (!existsSync(SHOTS_JSON)) return { shots: [], skipped: [], emails: {} };
  return JSON.parse(readFileSync(SHOTS_JSON, 'utf8')) as ShotsFile;
}

function log(line: string): void {
  appendFileSync(PROGRESS, `${new Date().toISOString().slice(11, 19)} ${line}\n`);
  console.log(line);
}

function record(entry: ShotEntry): void {
  const all = readShots();
  all.shots = all.shots.filter((item) => item.id !== entry.id);
  all.shots.push(entry);
  all.skipped = all.skipped.filter((item) => item.shot !== entry.id);
  writeFileSync(SHOTS_JSON, JSON.stringify(all, null, 2));
  log(`SHOT ${entry.id}`);
}

function skip(id: string, route: string, reason: string): void {
  const all = readShots();
  if (all.shots.some((item) => item.id === id)) return;
  all.skipped = all.skipped.filter((item) => item.shot !== id);
  all.skipped.push({ shot: id, route, reason });
  writeFileSync(SHOTS_JSON, JSON.stringify(all, null, 2));
  log(`SKIP ${id}: ${reason}`);
}

const measures: Record<string, unknown> = existsSync(MEASURES) ? (JSON.parse(readFileSync(MEASURES, 'utf8')) as Record<string, unknown>) : {};
function measure(id: string, value: unknown): void {
  measures[id] = value;
  writeFileSync(MEASURES, JSON.stringify(measures, null, 1));
}

/** PR131_ONLY (comma-separated ids) restricts a retake to the steps that take those shots; unset, every step runs. */
const ONLY = (process.env.PR131_ONLY ?? '').split(',').map((item) => item.trim()).filter((item) => item !== '');

/** Runs the steps for these shots; a failure records each one not taken as skipped with the first line of its error. */
async function attempt(ids: readonly string[], route: string, run: () => Promise<void>): Promise<void> {
  if (ONLY.length > 0 && !ids.some((id) => ONLY.includes(id))) return;
  try {
    await run();
  } catch (error) {
    const reason = (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? 'failed';
    for (const id of ids) skip(id, route, reason);
  }
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await Promise.race([page.evaluate(() => document.fonts.ready.then(() => undefined)), new Promise<void>((resolve) => setTimeout(resolve, 5_000))]).catch(() => undefined);
  await page.waitForTimeout(400);
}

const readyResult = async (page: Page): Promise<void> => expect(page.getByRole('heading', { level: 1, name: 'Your free screening' })).toBeVisible();

async function toTop(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
    document.documentElement.scrollIntoView({ block: 'start', inline: 'start', behavior: 'instant' });
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(250);
  const at = await page.evaluate(() => [window.scrollX, window.scrollY, window.visualViewport?.pageTop ?? 0]);
  if (at.some((value) => Math.abs(value) >= 1)) throw new Error(`not at the top for the full-page shot: ${at.join(',')}`);
}

function pathOf(page: Page): string {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}${url.hash}`;
}

/** A full-page shot, light, and (with `dark`) the dark tokens after it: data-theme="dark" on <html>, as the tour does. */
async function fullShot(page: Page, id: string, o: { state: string; note: string; routePattern?: string; dark?: boolean }): Promise<void> {
  await settle(page);
  await page.mouse.move(0, 0).catch(() => undefined);
  await toTop(page);
  const width = page.viewportSize()?.width ?? 0;
  const base = { path: pathOf(page), routePattern: o.routePattern ?? ROUTE, role: 'public', width, state: o.state };
  const file = `${PNG}/${id}.png`;
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  record({ file, id, theme: 'light', note: o.note, ...base });
  if (o.dark === true) {
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    try {
      await page.waitForTimeout(400);
      await toTop(page);
      const darkFile = `${PNG}/${id}-dark.png`;
      await page.screenshot({ path: darkFile, fullPage: true, animations: 'disabled' });
      record({ file: darkFile, id: `${id}-dark`, theme: DARK, note: `${o.note} Dark tokens (data-theme="dark" on <html>).`, ...base });
    } finally {
      await page.evaluate(() => document.documentElement.removeAttribute('data-theme')).catch(() => undefined);
    }
  }
}

async function viewShot(page: Page, id: string, state: string, note: string): Promise<void> {
  const file = `${PNG}/${id}.png`;
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
  record({ file, id, path: pathOf(page), routePattern: ROUTE, role: 'public', width: page.viewportSize()?.width ?? 0, theme: 'light', state, note });
}

async function elementShot(page: Page, target: Locator, id: string, o: { state: string; note: string; routePattern?: string }): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0).catch(() => undefined);
  await page.waitForTimeout(200);
  const file = `${PNG}/${id}.png`;
  await target.screenshot({ path: file, animations: 'disabled' });
  const scale = await page.evaluate(() => window.devicePixelRatio);
  record({ file, id, path: pathOf(page), routePattern: o.routePattern ?? ROUTE, role: 'public', width: page.viewportSize()?.width ?? 0, theme: 'light', state: o.state, note: `${o.note} Element shot at device scale ${String(scale)}.` });
}

/** The first of the matches that is drawn (the table copy at 1280, the stacked copy at 390). */
async function firstShown(locator: Locator): Promise<Locator> {
  const count = await locator.count();
  for (let at = 0; at < count; at++) {
    const item = locator.nth(at);
    if (await item.isVisible()) return item;
  }
  throw new Error(`no drawn match among ${String(count)}`);
}

/** What the page says and how it draws it: the anomalies card's description, each drawn chip's words, tone and faces. */
async function onLoad(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const drawn = (element: Element): boolean => (element as HTMLElement).getBoundingClientRect().height > 0;
    const face = (element: Element): string => getComputedStyle(element).fontFamily.split(',')[0]?.trim() ?? '';
    const chips = [...document.querySelectorAll<HTMLElement>('[data-section="anomalies"] [data-slot="status-chip"], [data-section="top-rows"] [data-slot="status-chip"]')]
      .filter(drawn)
      .map((chip) => {
        const mono = chip.querySelector('.font-mono');
        return {
          section: chip.closest('[data-section]')?.getAttribute('data-section'),
          copy: chip.closest('[data-stacked-copy]')?.getAttribute('data-stacked-copy') ?? null,
          tone: chip.getAttribute('data-tone'),
          standing: chip.getAttribute('data-standing') ?? chip.getAttribute('data-stacked-standing'),
          text: chip.textContent?.trim(),
          face: face(chip),
          figure: mono === null ? null : { text: mono.textContent, face: face(mono), numeric: getComputedStyle(mono).fontVariantNumeric },
          oneLine: chip.getBoundingClientRect().height < 30,
        };
      });
    const description = (section: string): { text: string | null; figures: string[] } => {
      const element = document.querySelector(`[data-section="${section}"] [data-slot="card-description"]`);
      return { text: element?.textContent?.trim() ?? null, figures: element === null ? [] : [...element.querySelectorAll('.font-mono')].map((item) => `${item.textContent ?? ''} (${face(item)})`) };
    };
    const priced = [...document.querySelectorAll('[data-section="priced"] dt')].map((term) => term.textContent?.trim() ?? '');
    const headers = (section: string): string[] =>
      [...document.querySelectorAll(`[data-section="${section}"] [data-stacked-copy="table"] th`)].map((cell) => cell.textContent?.trim() ?? '');
    const others = document.querySelector<HTMLElement>('[data-section="anomalies"] [data-stacked-group="others"]');
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      pageHeight: document.documentElement.scrollHeight,
      anomalies: description('anomalies'),
      topRows: description('top-rows'),
      pricedTerms: priced,
      anomalyHeaders: headers('anomalies'),
      topRowHeaders: headers('top-rows'),
      othersItemHeading: others !== null && drawn(others) ? (others.querySelector('h3, h4')?.textContent?.trim() ?? null) : null,
      chips,
    };
  });
}

async function withPage<T>(browser: Browser, options: BrowserContextOptions, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext(options);
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

async function openLive(page: Page, link: string): Promise<void> {
  await page.goto(link);
  await readyResult(page);
  await settle(page);
}

function links(): Record<'one-anomaly' | 'no-anomaly', string> {
  if (!existsSync(LINKS)) throw new Error('no live sends recorded: the first test failed');
  return JSON.parse(readFileSync(LINKS, 'utf8')) as Record<'one-anomaly' | 'no-anomaly', string>;
}

test.describe.configure({ mode: 'serial' });

test('two live sends through /screening: one anomaly and no anomaly', async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  if (!existsSync(SHOTS_JSON)) writeFileSync(SHOTS_JSON, JSON.stringify({ shots: [], skipped: [], emails: {} }, null, 2));
  const anomalyRow = (row: readonly string[]): boolean => row[0] === '97140' && row[4] === 'ma_noncontracted';
  const quiet = CLEAN_ROWS.filter((row) => !anomalyRow(row));
  if (CLEAN_ROWS.length - quiet.length !== 1) throw new Error(`CLEAN_ROWS holds ${String(CLEAN_ROWS.length - quiet.length)} 97140 ma_noncontracted rows, not 1`);
  // A practice has one screening at a time (submit_screening(): a later one of the same practice name and ZIP code,
  // or of the same email, replaces the earlier and its link stops opening it), so each send names its own practice,
  // and neither is the tour's SYNTHETIC SCREENING CLINIC.
  const files = {
    'one-anomaly': { practice: 'SYNTHETIC SCREENING CLINIC A', file: screeningCsv([...CLEAN_ROWS, ...SMALL_ROWS, ...OUTSIDE_ROWS]) },
    'no-anomaly': { practice: 'SYNTHETIC SCREENING CLINIC B', file: screeningCsv([...quiet, ...SMALL_ROWS, ...OUTSIDE_ROWS]) },
  } as const;
  const tag = randomBytes(4).toString('hex');
  const started = await startLocalScreeningConsumer();
  const found: Record<string, string> = {};
  try {
    for (const [name, { practice, file }] of Object.entries(files)) {
      const contact = `screening-pr131-${name}-${tag}@clinic-e2e.synthetic.test`;
      await withPage(browser, DESKTOP, async (page) => {
        await page.goto('/screening');
        await page.getByLabel('Practice name').fill(practice);
        await page.getByLabel('State').selectOption('MN');
        await page.getByLabel('ZIP code', { exact: true }).fill(SCREENING_ZIP);
        await page.getByLabel('Work email').fill(contact);
        await page.getByLabel('How did you hear about us?').selectOption('billing_firm');
        await page.getByLabel('Referring billing firm').fill('SYNTHETIC BILLING PARTNERS');
        await page.getByLabel('File to screen').setInputFiles({ name: 'totals.csv', mimeType: 'text/csv', buffer: file });
        await expect(page.locator('[data-state="file-ready"]')).toBeVisible();
        await page.getByRole('button', { name: 'Screen the file' }).click();
        await expect(page).toHaveURL(/\/screening\?sent=1/);
      });
      await expect.poll(() => outboxFor(contact).length, { timeout: 150_000, intervals: [500] }).toBe(1);
      const [message] = outboxFor(contact);
      found[name] = new URL(resultLinkIn(message as NonNullable<typeof message>)).pathname;
      log(`SEND ${name}: result ready`);
    }
  } finally {
    await started.close().catch(() => undefined);
  }
  writeFileSync(LINKS, JSON.stringify(found, null, 1));
  // Both links still open their results (neither replaced the other).
  for (const [name, link] of Object.entries(found)) {
    await withPage(browser, DESKTOP, async (page) => {
      const response = await page.goto(link);
      if (response?.status() !== 200) throw new Error(`${name}'s link answered ${String(response?.status())}`);
      await readyResult(page);
    });
  }
});

test('the live results: one anomaly and no anomaly, the band, the top rows, the summary card, chips at 2x', async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const live = links();
  const one = live['one-anomaly'];
  const none = live['no-anomaly'];
  const oneNote = `A live result of ${AT} (its own synthetic send as SYNTHETIC SCREENING CLINIC A: the tour's file, CLEAN_ROWS, SMALL_ROWS and OUTSIDE_ROWS; the 97140 ma_noncontracted row is the one anomaly).`;
  const noneNote = `A live result of ${AT} (its own synthetic send as SYNTHETIC SCREENING CLINIC B: the tour's file less CLEAN_ROWS' 97140 ma_noncontracted row, so no group is an anomaly).`;

  // One anomaly at 1280 (and its dark tokens) and 390 (and its dark tokens).
  for (const [width, options] of [
    [1280, DESKTOP],
    [390, PHONE],
  ] as const) {
    const id = `screening-result.one-anomaly.${String(width)}`;
    await attempt([id, `${id}-dark`], ROUTE, () =>
      withPage(browser, options, async (page) => {
        await openLive(page, one);
        measure(id, await onLoad(page));
        await fullShot(page, id, { state: 'interaction:one-anomaly', note: oneNote, dark: true });
      }),
    );
  }
  // No anomaly at 1280 and 390.
  for (const [width, options] of [
    [1280, DESKTOP],
    [390, PHONE],
  ] as const) {
    const id = `screening-result.no-anomaly.${String(width)}`;
    await attempt([id], ROUTE, () =>
      withPage(browser, options, async (page) => {
        await openLive(page, none);
        measure(id, await onLoad(page));
        await fullShot(page, id, { state: 'interaction:no-anomaly', note: noneNote });
      }),
    );
  }
  // 820x1180, no mobile emulation: the band where the stacked terms sit beside their values.
  await attempt(['screening-result.band.820'], ROUTE, () =>
    withPage(browser, BAND, async (page) => {
      await openLive(page, one);
      measure('screening-result.band.820', await onLoad(page));
      await fullShot(page, 'screening-result.band.820', { state: 'interaction:band', note: `${oneNote} At 820x1180, no mobile emulation.` });
    }),
  );
  // 390: scrolled to the top rows, the viewport (844 px) there.
  await attempt(['screening-result.top-rows-scrolled.390'], ROUTE, () =>
    withPage(browser, PHONE, async (page) => {
      await openLive(page, one);
      const at = await page.evaluate(() => {
        const card = document.querySelector<HTMLElement>('[data-section="top-rows"]');
        if (card === null) throw new Error('no top rows card');
        const header = [...document.querySelectorAll<HTMLElement>('header')].find((item) => ['sticky', 'fixed'].includes(getComputedStyle(item).position));
        const offset = header === undefined ? 0 : header.getBoundingClientRect().height;
        const top = card.getBoundingClientRect().top + window.scrollY - offset - 8;
        window.scrollTo(0, top);
        return { top: Math.round(top), header: Math.round(offset) };
      });
      await page.waitForTimeout(500);
      measure('screening-result.top-rows-scrolled.390', { ...at, scrollY: await page.evaluate(() => Math.round(window.scrollY)) });
      await viewShot(page, 'screening-result.top-rows-scrolled.390', 'interaction:top-rows-scrolled', `${oneNote} The 390x844 touch viewport scrolled to the top rows card ("Rows with the largest differences"), its title ${String(at.header)} px below the viewport's top past the sticky header, if any.`);
    }),
  );
  // 1280: Tab from the top of the page until the focus is in the top rows card; the viewport after it.
  await attempt(['screening-result.top-rows-tab-focus.1280'], ROUTE, () =>
    withPage(browser, DESKTOP, async (page) => {
      await openLive(page, one);
      const path: string[] = [];
      let reached = false;
      for (let presses = 0; presses < 80 && !reached; presses++) {
        await page.keyboard.press('Tab');
        const now = await page.evaluate(() => {
          const active = document.activeElement as HTMLElement | null;
          return {
            inTopRows: active?.closest('[data-section="top-rows"]') !== null && active !== null && active !== document.body,
            name: `${active?.tagName.toLowerCase() ?? ''}${active?.getAttribute('role') === null || active?.getAttribute('role') === undefined ? '' : `[${String(active.getAttribute('role'))}]`} ${(active?.getAttribute('aria-label') ?? active?.textContent ?? '').trim().slice(0, 40)}`,
          };
        });
        path.push(now.name);
        reached = now.inTopRows;
      }
      if (!reached) throw new Error(`Tab never reached the top rows card in 80 presses: ${path.slice(-6).join(' | ')}`);
      await page.waitForTimeout(400);
      const focus = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement;
        const style = getComputedStyle(active);
        const rect = active.getBoundingClientRect();
        return { tag: active.tagName.toLowerCase(), role: active.getAttribute('role'), label: active.getAttribute('aria-label'), focusVisible: active.matches(':focus-visible'), outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor} offset ${style.outlineOffset}`, top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
      });
      measure('screening-result.top-rows-tab-focus.1280', { presses: path.length, tabPath: path, focus });
      await viewShot(page, 'screening-result.top-rows-tab-focus.1280', 'interaction:top-rows-tab-focus', `${oneNote} Tab from the top of the page (${String(path.length)} presses) to the top rows card's ${focus.tag}${focus.role === null ? '' : ` role ${focus.role}`}${focus.label === null ? '' : ` "${focus.label}"`}; the 1280x800 viewport with its focus ring.`);
    }),
  );
  // The summary card ("Priced under Medicare": the figure and difference terms), an element shot at both widths.
  for (const [width, options] of [
    [1280, DESKTOP],
    [390, PHONE],
  ] as const) {
    const id = `screening-result.summary-card.${String(width)}`;
    await attempt([id], ROUTE, () =>
      withPage(browser, options, async (page) => {
        await openLive(page, one);
        await elementShot(page, page.locator('[data-section="priced"]'), id, { state: 'interaction:summary-card', note: `${oneNote} The "Priced under Medicare" card.` });
      }),
    );
  }
  // Chips with their $5 and the anomalies card's description, at device scale 2 (the mono face). Each its own step.
  await attempt(['screening-result.chip-anomaly-2x.1280'], ROUTE, () =>
    withPage(browser, DESKTOP_2X, async (page) => {
      await openLive(page, one);
      const table = page.locator('[data-section="anomalies"] [data-stacked-copy="table"]');
      await elementShot(page, await firstShown(table.locator('[data-standing="anomaly"]')), 'screening-result.chip-anomaly-2x.1280', { state: 'interaction:chip', note: `${oneNote} The anomalies table's anomaly chip.` });
    }),
  );
  await attempt(['screening-result.anomalies-description-2x.1280'], ROUTE, () =>
    withPage(browser, DESKTOP_2X, async (page) => {
      await openLive(page, one);
      await elementShot(page, page.locator('[data-section="anomalies"] [data-slot="card-description"]'), 'screening-result.anomalies-description-2x.1280', { state: 'interaction:chip', note: `${oneNote} The anomalies card's description (its anomaly rule's $5).` });
    }),
  );
  await attempt(['screening-result.chip-below-2x.1280'], ROUTE, () =>
    withPage(browser, DESKTOP_2X, async (page) => {
      await openLive(page, one);
      const below = page.locator('[data-section="anomalies"] [data-stacked-copy="table"] [data-standing="below_by_threshold_or_less"]');
      if ((await below.count()) === 0) {
        throw new Error('the live result has no group below its figure by $5 a claim line or less (its standings: anomaly, within the range, at or above); screening-result-harness.several.chip-below-one-figure-2x.1280 shows that chip');
      }
      await elementShot(page, await firstShown(below), 'screening-result.chip-below-2x.1280', { state: 'interaction:chip', note: `${oneNote} The anomalies table's first below-by-$5-or-less chip.` });
    }),
  );
  await attempt(['screening-result.chip-anomaly-2x.390'], ROUTE, () =>
    withPage(browser, PHONE_2X, async (page) => {
      await openLive(page, one);
      await elementShot(page, await firstShown(page.locator('[data-section="anomalies"] [data-stacked-copy="rows"] [data-stacked-standing="anomaly"]')), 'screening-result.chip-anomaly-2x.390', { state: 'interaction:chip', note: `${oneNote} The stacked rows' anomaly chip.` });
    }),
  );
});

test('the static harness: several anomalies, one other group, and the later page whose last entry sums the others', async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const host = links()['one-anomaly'];
  const origin = new URL(test.info().project.use.baseURL ?? 'http://localhost:3297').origin;
  const what: Record<string, string> = {
    several: 'onePage(GROUPS): five groups, two anomalies (one of them 2 of 2 rows), one within the range, one at or above, one below by $5 or less at its one figure; SUMMARY, COVERAGE and ROWS (P4-DR-09).',
    'one-other': 'FIRST_PAGE with oneOther(1): 51 groups, page 1 of 2, groups 1 to 50 listed and the 51st summed as the one other group (an anomaly), the database’s one-other shape.',
    others: 'the unit test’s DATA: LATER_GROUPS on LATER_PAGE, page 2 of 411 of 20,507 groups, groups 51 to 55 listed and the other 20,457 summed as the last entry (anomalies among them).',
    'one-group': 'onePage([GROUPS[0]]): one group (97161 ma_noncontracted, 2 of 2 rows anomalies), the only group an anomaly; SUMMARY, COVERAGE and ROWS as several’s, so only the anomalies card’s words are this state’s (PR #131 fix round, 4B-UX-03).',
  };
  const harnessNote = (name: string): string =>
    `Static harness (no script; ${AT}'s ScreeningResultView with result-tables.test.tsx's SYNTHETIC fixtures, the same text on both sides, in a copy of a live result's document): ${what[name] ?? name} ScrollTable's cue is its server render.`;
  const open = async (page: Page, name: string): Promise<void> => {
    const main = readFileSync(`${HARNESS}/${name}.html`, 'utf8');
    await openLive(page, host);
    const document = await page.evaluate((harness) => {
      const root = window.document.documentElement.cloneNode(true) as HTMLElement;
      for (const script of root.querySelectorAll('script, link[rel="modulepreload"], link[as="script"]')) script.remove();
      const own = root.querySelector('main[data-slot="screening-result"]');
      if (own === null) throw new Error('no result <main> on the live page');
      const template = window.document.createElement('template');
      template.innerHTML = harness;
      own.replaceWith(template.content);
      root.removeAttribute('data-theme');
      return `<!DOCTYPE html>${root.outerHTML}`;
    }, main);
    const at = `${origin}/__harness/${name}`;
    await page.route(at, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: document }));
    await page.goto(at);
    await readyResult(page);
    await settle(page);
  };
  for (const [name, width, options, dark] of [
    ['several', 1280, DESKTOP, true],
    ['several', 390, PHONE, false],
    ['one-other', 1280, DESKTOP, false],
    ['one-other', 390, PHONE, false],
    ['others', 1280, DESKTOP, false],
    ['others', 390, PHONE, false],
  ] as const) {
    const id = `screening-result-harness.${name}.${String(width)}`;
    await attempt(dark ? [id, `${id}-dark`] : [id], HARNESS_ROUTE, () =>
      withPage(browser, options, async (page) => {
        await open(page, name);
        measure(id, await onLoad(page));
        await fullShot(page, id, { state: 'default', note: harnessNote(name), routePattern: HARNESS_ROUTE, dark });
      }),
    );
  }
  // PR #131's fix round (4B-UX-03), after only: one group, whose anomalies card ends at the rule, at 1280 and 390, and
  // its description at device scale 2 (ids suffixed .fix).
  for (const [width, options] of [
    [1280, DESKTOP],
    [390, PHONE],
  ] as const) {
    const id = `screening-result-harness.one-group.${String(width)}.fix`;
    await attempt([id], HARNESS_ROUTE, () =>
      withPage(browser, options, async (page) => {
        await open(page, 'one-group');
        measure(id, await onLoad(page));
        await fullShot(page, id, { state: 'default', note: harnessNote('one-group'), routePattern: HARNESS_ROUTE });
      }),
    );
  }
  await attempt(['screening-result-harness.one-group.anomalies-description-2x.1280.fix'], HARNESS_ROUTE, () =>
    withPage(browser, DESKTOP_2X, async (page) => {
      await open(page, 'one-group');
      measure('screening-result-harness.one-group.anomalies-description-2x.1280.fix', await onLoad(page));
      await elementShot(page, page.locator('[data-section="anomalies"] [data-slot="card-description"]'), 'screening-result-harness.one-group.anomalies-description-2x.1280.fix', {
        state: 'interaction:chip',
        note: `${harnessNote('one-group')} The anomalies card's description (one group: no order sentence).`,
        routePattern: HARNESS_ROUTE,
      });
    }),
  );
  // Two harness chips at device scale 2: the one-figure below chip and the anomaly of 2 of 2 rows (the table copy).
  await attempt(['screening-result-harness.several.chip-below-one-figure-2x.1280', 'screening-result-harness.several.chip-anomaly-rows-2x.1280'], HARNESS_ROUTE, () =>
    withPage(browser, DESKTOP_2X, async (page) => {
      await open(page, 'several');
      const table = page.locator('[data-section="anomalies"] [data-stacked-copy="table"]');
      await elementShot(page, table.locator('[data-group="97035:medicare_ffs"] [data-standing="below_by_threshold_or_less"]'), 'screening-result-harness.several.chip-below-one-figure-2x.1280', {
        state: 'interaction:chip',
        note: `${harnessNote('several')} The one-figure below chip (group 5, 97035).`,
        routePattern: HARNESS_ROUTE,
      });
      await elementShot(page, table.locator('[data-group="97161:ma_noncontracted"] [data-standing="anomaly"]'), 'screening-result-harness.several.chip-anomaly-rows-2x.1280', {
        state: 'interaction:chip',
        note: `${harnessNote('several')} The anomaly chip of a group with 2 of 2 rows (group 1, 97161).`,
        routePattern: HARNESS_ROUTE,
      });
    }),
  );
});
