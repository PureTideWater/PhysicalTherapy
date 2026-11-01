import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { type Browser, type BrowserContextOptions, type Page, expect, test } from '@playwright/test';

/**
 * PR #83 (co-001/ux-screening-result-tables), the fix round's after-only shots (2026-11-01): only the states the fix
 * round changed, beside the tour's own `screening-result.default.390`, `.1280` and `.1280-dark` (TOUR_ONLY
 * 'screening-result.default.*'). Synthetic data only. Runs after the tour's capture, on the same server and database,
 * with screens.config.ts's capture project (its browser rasterizes text as the repository's e2e browser does):
 *
 *   cd $TOUR_DIR && ./node_modules/.bin/playwright test --config $TOUR_DIR/screens.config.ts --project capture \
 *     --workers 1 lane-b-ux-screening-result-tables-capture.spec.ts
 *
 * It opens the run's one live result (the emailed link the tour recorded as `screening-result.default.1280`'s path) and
 * takes:
 * - `screening-result.top-audit-link-focus.1280`: the top link reached by Tab and followed with Enter, the viewport after
 *   it (focus on the form's heading, the form in view); `.390`: the same link tapped in the phone's touch viewport.
 * - `screening-result.band.820`: the result full page at 820x1180, no mobile emulation (the stacked terms beside their
 *   values from 24rem: UXR-04's 8 px between pairs).
 * - `screening-result-harness.one-other.390` and `.1280`, `screening-result-harness.several.390`: the result's own view
 *   rendered statically with the head unit test's fixtures (capture/screening-result-harness.mts writes the <main>), put
 *   in place of the live result's <main> on a copy of its document with no script, served on the server's origin so
 *   the app's stylesheets and fonts load. one-other: the database's one-other shape (51 groups, page 1 of 2, the 51st
 *   summed); several: two could-not-price rows and a rates-change row in coverage, with the could-not-price card.
 * Each shot merges into $TOUR_DIR/shots.json in the tour's own entry shape; measurements go to
 * $TOUR_DIR/capture-measures.json.
 */

const OUT = process.env.TOUR_DIR ?? '';
if (OUT === '') throw new Error('Set TOUR_DIR (README, Set-up).');
const PNG = `${OUT}/png`;
const SHOTS_JSON = `${OUT}/shots.json`;
const MEASURES = `${OUT}/capture-measures.json`;
const HARNESS = process.env.HARNESS_DIR ?? `${OUT}/harness`;
const ROUTE = '/screening/results/[resultId]';
const DESKTOP: BrowserContextOptions = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const PHONE: BrowserContextOptions = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const BAND: BrowserContextOptions = { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1 };
mkdirSync(PNG, { recursive: true });

interface ShotEntry {
  readonly file: string;
  readonly id: string;
  readonly path: string;
  readonly routePattern: string;
  readonly role: string;
  readonly width: number;
  readonly theme: 'light';
  readonly state: string;
  readonly note: string;
}

const measures: Record<string, unknown> = existsSync(MEASURES) ? (JSON.parse(readFileSync(MEASURES, 'utf8')) as Record<string, unknown>) : {};

function record(entry: ShotEntry): void {
  const all = JSON.parse(readFileSync(SHOTS_JSON, 'utf8')) as { shots: ShotEntry[]; skipped: { shot: string }[] } & Record<string, unknown>;
  all.shots = all.shots.filter((item) => item.id !== entry.id);
  all.shots.push(entry);
  all.skipped = all.skipped.filter((item) => item.shot !== entry.id);
  writeFileSync(SHOTS_JSON, JSON.stringify(all, null, 2));
  console.log(`SHOT ${entry.id}`);
}

function measure(id: string, value: unknown): void {
  measures[id] = value;
  writeFileSync(MEASURES, JSON.stringify(measures, null, 1));
}

/** The run's one live result: the path the tour recorded for its default at 1280. */
function liveResult(): string {
  const all = JSON.parse(readFileSync(SHOTS_JSON, 'utf8')) as { shots: ShotEntry[] };
  const entry = all.shots.find((item) => item.id === 'screening-result.default.1280');
  if (entry === undefined) throw new Error('the tour took no screening-result.default.1280: run the tour first');
  return entry.path;
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

async function fullShot(page: Page, id: string, state: string, note: string, routePattern = ROUTE): Promise<void> {
  await settle(page);
  await page.mouse.move(0, 0).catch(() => undefined);
  await toTop(page);
  const file = `${PNG}/${id}.png`;
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  record({ file, id, path: pathOf(page), routePattern, role: 'public', width: page.viewportSize()?.width ?? 0, theme: 'light', state, note });
}

async function viewShot(page: Page, id: string, state: string, note: string): Promise<void> {
  const file = `${PNG}/${id}.png`;
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
  record({ file, id, path: pathOf(page), routePattern: ROUTE, role: 'public', width: page.viewportSize()?.width ?? 0, theme: 'light', state, note });
}

function pathOf(page: Page): string {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Where the top link stands on load, and what the coverage items' terms are (UXR-01; UXR-03, P4-RC-04). */
async function onLoad(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const link = document.querySelector<HTMLElement>('a[data-link="convert"]');
    const rect = link?.getBoundingClientRect();
    const items = [...document.querySelectorAll<HTMLElement>('[data-section="coverage"] [data-stacked-row]')];
    const coverage = items.map((item) => ({
      heading: item.querySelector('h3, h4')?.textContent?.trim() ?? '',
      terms: [...item.querySelectorAll('dt')].map((term) => term.textContent?.trim() ?? ''),
      reason: [...item.querySelectorAll('dt')].find((term) => term.textContent?.trim() === 'Reason')?.nextElementSibling?.textContent?.trim() ?? null,
      shown: item.getBoundingClientRect().height > 0,
    }));
    const couldNot = document.querySelector('[data-section="could-not-price"] [data-slot="card-description"]')?.textContent?.trim() ?? null;
    const description = document.querySelector('[data-section="anomalies"] [data-slot="card-description"]')?.textContent?.trim();
    const others = document.querySelector<HTMLElement>('[data-section="anomalies"] [data-stacked-row="others"], [data-section="anomalies"] [data-stacked-group="others"]');
    const othersHeading = others !== null && others.getBoundingClientRect().height > 0 ? (others.querySelector('h3, h4')?.textContent?.trim() ?? null) : null;
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      link: link === null || rect === undefined ? null : { text: link.textContent, top: Math.round(rect.top), bottom: Math.round(rect.bottom), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height), inView: rect.top >= 0 && rect.bottom <= window.innerHeight },
      pageHeight: document.documentElement.scrollHeight,
      couldNotPriceSentence: couldNot,
      anomaliesDescription: description ?? null,
      othersItemHeading: othersHeading,
      coverageItems: coverage,
    };
  });
}

/** After the link is followed: what has the focus, where the form's heading and form stand, and how the focus is drawn. */
async function afterFollow(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const title = document.getElementById('screening-convert');
    const form = document.querySelector('[data-section="convert"] form');
    const rect = title?.getBoundingClientRect();
    const formRect = form?.getBoundingClientRect();
    const style = active === null ? null : getComputedStyle(active);
    return {
      hash: location.hash,
      scrollY: Math.round(window.scrollY),
      active: active === null ? null : { tag: active.tagName.toLowerCase(), id: active.id, text: active.textContent?.trim().slice(0, 60), focusVisible: active.matches(':focus-visible'), outline: style === null ? null : `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor} offset ${style.outlineOffset}` },
      title: rect === undefined ? null : { top: Math.round(rect.top), bottom: Math.round(rect.bottom), inView: rect.top >= 0 && rect.bottom <= window.innerHeight },
      form: formRect === undefined ? null : { top: Math.round(formRect.top), bottom: Math.round(formRect.bottom), visibleTop: formRect.top < window.innerHeight },
      viewport: { width: window.innerWidth, height: window.innerHeight },
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

test.describe.configure({ mode: 'serial' });

test('the live result: the top link on load, followed by keyboard and by touch; the band at 820', async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  const link = liveResult();

  // On load at both widths (the tour's default shots are the pictures; these are the numbers beside them).
  for (const [name, options] of [
    ['default.1280', DESKTOP],
    ['default.390', PHONE],
  ] as const) {
    await withPage(browser, options, async (page) => {
      await page.goto(link);
      await readyResult(page);
      await settle(page);
      measure(`screening-result.${name}`, await onLoad(page));
    });
  }

  // 1280: Tab from the top of the page to the link, then Enter.
  await withPage(browser, DESKTOP, async (page) => {
    await page.goto(link);
    await readyResult(page);
    await settle(page);
    const path: string[] = [];
    let presses = 0;
    for (; presses < 12; presses++) {
      await page.keyboard.press('Tab');
      const now = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        return { convert: active?.getAttribute('data-link') === 'convert', name: `${active?.tagName.toLowerCase() ?? ''} ${(active?.textContent ?? active?.getAttribute('aria-label') ?? '').trim().slice(0, 40)}` };
      });
      path.push(now.name);
      if (now.convert) break;
    }
    const reached = await page.evaluate(() => document.activeElement?.getAttribute('data-link') === 'convert');
    if (!reached) throw new Error(`Tab never reached the top link: ${path.join(' | ')}`);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#screening-convert$/);
    await page.waitForTimeout(500);
    const after = await afterFollow(page);
    measure('screening-result.top-audit-link-focus.1280', { tabPath: path, presses: presses + 1, ...after });
    await viewShot(
      page,
      'screening-result.top-audit-link-focus.1280',
      'interaction:top-audit-link-focus',
      `The live result's top link "Ask for a PaidWhole audit" reached by Tab (press ${String(presses + 1)}: ${path.join(' > ')}) and followed with Enter; the viewport (1280x800) after it. Focus: ${JSON.stringify(after.active)}.`,
    );
  });

  // 390: the phone's touch viewport, the link tapped.
  await withPage(browser, PHONE, async (page) => {
    await page.goto(link);
    await readyResult(page);
    await settle(page);
    await page.locator('a[data-link="convert"]').tap();
    await expect(page).toHaveURL(/#screening-convert$/);
    await page.waitForTimeout(600);
    const after = await afterFollow(page);
    measure('screening-result.top-audit-link-focus.390', after);
    await viewShot(
      page,
      'screening-result.top-audit-link-focus.390',
      'interaction:top-audit-link-focus',
      `The live result's top link tapped in the 390x844 touch viewport; the viewport after it. Focus: ${JSON.stringify(after.active)}.`,
    );
  });

  // 820x1180, no mobile emulation: the stacked rows with their terms beside the values (from 24rem).
  await withPage(browser, BAND, async (page) => {
    await page.goto(link);
    await readyResult(page);
    await settle(page);
    const lists = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-stacked-row] dl')]
        .filter((list) => list.getBoundingClientRect().height > 0)
        .map((list) => {
          const style = getComputedStyle(list);
          const terms = [...list.querySelectorAll('dt')];
          return {
            item: list.closest('[data-stacked-row]')?.getAttribute('data-stacked-row'),
            columns: style.gridTemplateColumns,
            rowGap: style.rowGap,
            columnGap: style.columnGap,
            wrappedTerms: terms.filter((term) => term.getBoundingClientRect().height > 30).map((term) => term.textContent?.trim()),
          };
        }),
    );
    measure('screening-result.band.820', { shownStackedLists: lists.length, lists });
    await fullShot(page, 'screening-result.band.820', 'default', `The live result at 820x1180, no mobile emulation: ${String(lists.length)} stacked lists shown; row gap ${String(lists[0]?.rowGap ?? 'n/a')} between pairs beside their terms (UXR-04).`);
  });
});

test('the static harness: one other group (51 groups, page 1 of 2) and several outcomes in coverage', async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  const link = liveResult();
  const origin = new URL(test.info().project.use.baseURL ?? 'http://localhost:3297').origin;
  const harnessCommit = execFileSync('git', ['-C', '/home/user/screens', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  for (const [name, width, options] of [
    ['one-other', 390, PHONE],
    ['one-other', 1280, DESKTOP],
    ['several', 390, PHONE],
  ] as const) {
    const main = readFileSync(`${HARNESS}/${name}.html`, 'utf8');
    await withPage(browser, options, async (page) => {
      // A copy of the live result's document at this width, with no script, the harness's <main> in place of its own.
      await page.goto(link);
      await readyResult(page);
      await settle(page);
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
      await expect(page.getByRole('heading', { level: 1, name: 'Your free screening' })).toBeVisible();
      await settle(page);
      measure(`screening-result-harness.${name}.${String(width)}`, await onLoad(page));
      await fullShot(
        page,
        `screening-result-harness.${name}.${String(width)}`,
        'default',
        `Static harness (no script; ${harnessCommit.slice(0, 8)}'s ScreeningResultView with result-tables.test.tsx's SYNTHETIC fixtures, in a copy of the live result's document): ${
          name === 'one-other'
            ? 'FIRST_PAGE with oneOther(1): 51 groups, page 1 of 2, groups 1 to 50 listed and the 51st summed as the one other group (an anomaly), the database’s one-other shape (P4-RC-01, UXR-02).'
            : 'SUMMARY (5 rows could not be priced), onePage(GROUPS) (two anomalies among five groups), COVERAGE (two could-not-price rows, a rates-change row, four rows with no reason) and ROWS (P4-RC-04, UXR-03).'
        } ScrollTable's cue is its server render.`,
        '/screening/results/[resultId] (static harness)',
      );
    });
  }
});
