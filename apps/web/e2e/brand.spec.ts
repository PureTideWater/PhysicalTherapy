import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import { type Page, expect, test } from '@playwright/test';
import { type LedgerEntry, type ReportReconciliation, entriesById, reportReconciliation } from '@tp/ledger';
import { cents } from '@tp/money';

import { mailBodyHtml } from '../../worker/src/mail/mail';
import { EMAIL_LOCKUP_PATH } from '../../worker/src/mail/template';
import { statementHtml } from '../../worker/src/reconcile/statement-html';
import { expectAccessible } from './a11y';
import { signInWithTotp } from './helpers';
import { journeyPractice, pricedAndTriaged, signedOffSchedule } from './journeys';
import { startLocalWorker } from './worker';

/**
 * The PaidWhole brand in the browser (docs/brand/BRAND.md; docs/adr/0056 and 0057): no page asks a font
 * service or any other origin for anything (the brand's faces are self-hosted by next/font/local and load
 * from this origin); the header carries the lockup with the practice switcher and the account on the
 * right and the single brass underline under the active rail item; the dashboard's tiles, a table's status
 * tints and the sign-in page are on brand; and a printed statement's cover carries the Verified seal only
 * when the ledger says its recovered total reconciles to cash. Screenshots of each go to brand-screenshots/
 * (gitignored; BRAND_SCREENSHOTS_DIR moves them) for a person to look at, and the header at 1280 and 390 px
 * and the cover with and without the seal are also compared with committed baselines (CO-01; see VISUAL and
 * STRICT), beside computed checks of what a picture's tolerance cannot see (the lockup's colors, face and place,
 * the cover's ground, the brass underline).
 * In a practice of its own, with SYNTHETIC remittances (CAS-08, CAS-04) priced under a signed-off schedule.
 * Synthetic data only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
const SHOTS = process.env.BRAND_SCREENSHOTS_DIR ?? path.resolve(import.meta.dirname, '../../../brand-screenshots');
const PRACTICE = 'SYNTHETIC OTHER PRACTICE BRAND';
const SETTINGS = { place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT', case_materiality_cents: '1000' };
const FONT_SERVICES = /fonts\.googleapis\.com|fonts\.gstatic\.com/;
/** The path CloudFront serves the brand art under (infra/lib/constructs/edge.ts, BRAND_PATH_PATTERN, without its *). */
const BRAND_PATH = '/brand/';
/** Brass, rgb() as the browser computes it: the active rail item's underline, and the mark's keystone. */
const BRASS = 'rgb(201, 154, 59)';
/** Ink, rgb() as the browser computes it: the mark's ring and the wordmark. */
const INK = 'rgb(13, 30, 58)';
/** Paper, rgb() as the browser computes it: the report cover's ground. */
const PAPER = 'rgb(246, 244, 238)';
/** Paper (the cover's ground) and Brass (the seal's keystone) as a screenshot's pixels hold them. */
const PAPER_RGB: Rgb = [246, 244, 238];
const BRASS_RGB: Rgb = [201, 154, 59];

/**
 * The visual baselines (CO-01: "visual tests of the header at 1280 and 390 px and the report cover with and without
 * the seal"; docs/adr/0058), committed beside this file in brand.spec.ts-snapshots/. They are Playwright's own
 * Chromium on Linux, the build ci.yml installs before the e2e step, so CI renders with the browser that made them, and
 * with the text rendering playwright.config.ts fixes for it (no hinting, grayscale antialiasing, e2e/fonts.conf), so a
 * host's font configuration moves none of their pixels; every text they hold is in the brand's own web faces.
 * Animations are off, the caret is hidden, pixels are CSS pixels, and any <time> is masked, although neither region
 * shows the clock: the header's words are the persona's address and the journey's practice, and the cover prints the
 * statement's fixed generatedAt. A pixel counts as changed past Playwright's default color threshold (0.2), and up
 * to 1% of them may change: that absorbs a stray antialiased glyph edge, and catches a region's layout changing (the
 * switcher, the account, a line of the cover moved or gone). It cannot see a small element change inside a mostly empty
 * picture: a recolored keystone or wordmark, the wordmark in another face, a lockup moved a few pixels, or the cover's
 * whole ground changed all stay under 1% of a 1280 x 56 header or an 816 x 1056 cover. Those are held by STRICT
 * comparisons of the regions that hold the brand (the header's lockup band, the cover's top band) and by computed
 * checks (expectLockupOnBrand, expectCoverOnBrand), each shown to fail by mutation (docs/adr/0058). The brass
 * underline is on the rail, outside the header's picture, and is held by its computed color. The seal's absence is
 * not left to a tolerance either: the cover's foot, where the seal prints, must hold Paper and nothing else
 * (pixelsUnlike).
 */
const VISUAL = { animations: 'disabled', caret: 'hide', scale: 'css', maxDiffPixelRatio: 0.01 } as const;

/**
 * The comparison of a region that holds the brand and little else: a pixel counts as changed past a color threshold of
 * 0.05, and a handful may change. The same browser build and the same self-hosted faces draw these regions identically
 * from run to run; the allowance is for a stray antialiased edge, under the 15 or so pixels a 17 px mark's keystone
 * covers.
 */
const STRICT = { animations: 'disabled', caret: 'hide', scale: 'css', threshold: 0.05, maxDiffPixels: 6 } as const;

/** The header's left band, from its left edge to just short of the switcher at 390 px: the lockup and the ground around it. */
const LOCKUP_BAND_WIDTH = 152;
/** The cover's top band, above its kicker: the outlined lockup on Paper and the ground around it. */
const COVER_TOP_BAND = { x: 0, y: 0, width: 816, height: 200 } as const;
/** Where the lockup sits in the header (at 1280 and 390 px) and on the cover (0.85 in and 0.9 in in, 28 px tall), in CSS px. */
const HEADER_LOCKUP_PLACE = { left: 24, top: 15 } as const;
const HEADER_LOCKUP_PLACE_390 = { left: 16, top: 15 } as const;
const COVER_LOCKUP_PLACE = { left: 82, top: 86, height: 28 } as const;

type Rgb = readonly [number, number, number];
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * How many pixels of a PNG inside a box are not the given color (any channel more than 8 away), or -1 when the box
 * does not fit the image; decoded by the browser itself on a blank page, so it reads exactly what a baseline file or a
 * screenshot holds.
 */
async function pixelsUnlike(page: Page, png: Buffer, box: Box, rgb: Rgb): Promise<number> {
  return page.evaluate(
    async ({ data, area, color }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (context === null || area.x + area.width > image.naturalWidth || area.y + area.height > image.naturalHeight) {
        return -1;
      }
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(area.x, area.y, area.width, area.height).data;
      let unlike = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const [red, green, blue] = [pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0];
        if (Math.abs(red - color[0]) > 8 || Math.abs(green - color[1]) > 8 || Math.abs(blue - color[2]) > 8) {
          unlike += 1;
        }
      }
      return unlike;
    },
    { data: png.toString('base64'), area: box, color: rgb },
  );
}

/**
 * The header's lockup as the brand draws it (BRAND.md, sections 2 and 3; .claude/rules/brand.md): the ring Ink and
 * the keystone Brass, the wordmark one word in the display face at 700 and -0.03em, Ink, and where the header puts it.
 */
async function expectLockupOnBrand(page: Page, place: { readonly left: number; readonly top: number }): Promise<void> {
  const header = page.locator('[data-slot="app-header"]');
  const lockup = header.locator('[data-slot="lockup"]');
  const [ring, keystone] = [lockup.locator('svg path').nth(0), lockup.locator('svg path').nth(1)];
  await expect(ring).toHaveCSS('fill', INK);
  await expect(keystone).toHaveCSS('fill', BRASS);
  const wordmark = lockup.locator('span').first();
  await expect(wordmark).toHaveText('PaidWhole');
  await expect(wordmark).toHaveCSS('color', INK);
  // next/font/local names the family after its export (apps/web/src/lib/fonts.ts): the display face, first.
  await expect(wordmark).toHaveCSS('font-family', /^display\b/);
  await expect(wordmark).toHaveCSS('font-weight', '700');
  await expect(wordmark).toHaveCSS('letter-spacing', '-0.6px');
  const [outer, inner] = await Promise.all([header.boundingBox(), lockup.boundingBox()]);
  expect(outer !== null && inner !== null ? { left: Math.round(inner.x - outer.x), top: Math.round(inner.y - outer.y) } : null).toEqual(place);
}

/** The header's lockup band as a clip of the page: fixed to the header, so a lockup that moves changes the picture. */
async function lockupBand(page: Page): Promise<Box> {
  const header = await page.locator('[data-slot="app-header"]').boundingBox();
  expect(header, 'the header is on the page').not.toBeNull();
  const box = header as Box;
  return { x: box.x, y: box.y, width: LOCKUP_BAND_WIDTH, height: box.height };
}

/**
 * A printed cover as the brand draws it (BRAND.md, section 7): Paper ground; the outlined lockup top left, in its
 * place, its ring and wordmark Ink and its keystone Brass; the practice's name in the display face.
 */
async function expectCoverOnBrand(printed: Page): Promise<void> {
  const section = printed.locator('section.cover');
  await expect(section).toHaveCSS('background-color', PAPER);
  const lockup = section.locator('.cover-top .lockup svg[role="img"][aria-label="PaidWhole"]');
  await expect(lockup).toHaveCount(1);
  // The outlined lockup: the ring, the keystone, then the wordmark's letters (packages/brand/assets).
  const fills = await lockup.locator('path').evaluateAll((paths) => paths.map((path) => getComputedStyle(path).fill));
  expect(fills.length).toBeGreaterThan(2);
  expect(fills[1]).toBe(BRASS);
  expect(fills.filter((fill, index) => index !== 1 && fill !== INK)).toEqual([]);
  const [outer, inner] = await Promise.all([section.boundingBox(), lockup.boundingBox()]);
  expect(outer !== null && inner !== null ? { left: Math.round(inner.x - outer.x), top: Math.round(inner.y - outer.y), height: Math.round(inner.height) } : null).toEqual(COVER_LOCKUP_PLACE);
  const practice = section.locator('.practice');
  await expect(practice).toHaveCSS('font-family', /^"?Schibsted Grotesk"?,/);
  await expect(practice).toHaveCSS('font-weight', '600');
  await expect(practice).toHaveCSS('color', INK);
}

function shot(name: string): string {
  mkdirSync(SHOTS, { recursive: true });
  return path.join(SHOTS, name);
}

/** The page's width as the document lays it out, beside the window's: equal when nothing scrolls sideways. */
async function pageWidths(page: Page): Promise<[number, number]> {
  return page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth] as [number, number]);
}

/** Every request a page makes, kept so the test can say none left this origin. */
function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  return urls;
}

/** The families document.fonts has loaded once the page settles. */
async function loadedFonts(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((face) => face.status === 'loaded').map((face) => `${face.family} ${face.weight}`);
  });
}

test('no page asks a font service or another origin for anything; the brand faces load from this origin', async ({ page, baseURL }) => {
  const requests = recordRequests(page);
  for (const screen of ['/sign-in', '/request-audit', '/status']) {
    await page.goto(screen);
    await page.waitForLoadState('networkidle');
    expect((await loadedFonts(page)).length, `${screen}: the brand faces it uses load`).toBeGreaterThanOrEqual(2);
  }
  await expect(page.locator('[data-slot="public-header"] [data-slot="lockup"]')).toBeVisible();
  expect(requests.filter((url) => FONT_SERVICES.test(url))).toEqual([]);
  expect(requests.filter((url) => !url.startsWith(baseURL ?? 'http://localhost') && !url.startsWith('data:') && !url.startsWith('blob:'))).toEqual([]);
  // The fonts are next/font/local's files, served from this origin.
  expect(requests.some((url) => url.startsWith(`${baseURL ?? ''}/_next/static/media/`) && url.endsWith('.woff2'))).toBe(true);
});

test('the email header is the outlined lockup with its tagline at 160 px on White, embedded from the static host, which alone answers cross-origin', async ({ page, baseURL }) => {
  // The application's own headers stay as ADR 0053 and 0055 set them, the brand art included (reconciliation-001, D7).
  const art = await page.request.get(EMAIL_LOCKUP_PATH);
  expect(art.status()).toBe(200);
  expect(art.headers()['content-type']).toBe('image/png');
  expect(art.headers()['cross-origin-resource-policy']).toBe('same-origin');
  expect((await page.request.get('/sign-in')).headers()['cross-origin-resource-policy']).toBe('same-origin');
  const body = await art.body();
  const message = {
    to: ['admin@synthetic.test'],
    subject: 'Monitoring digest for October 2026',
    lines: ['SYNTHETIC: 3 new lines were flagged and 1 case reached its materiality this month.'],
    links: [`${baseURL ?? 'http://localhost:3100'}/p/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01/notifications`],
  };
  // A server of the test's own, reached under two origins: as 127.0.0.1 it stands in for the CloudFront static host
  // (STATIC_ASSET_ORIGIN; infra/lib/constructs/edge.ts), answering /brand/* with the application's bytes under
  // `policy`, which CloudFront's response headers policy sets to cross-origin; as localhost it is a web mail client,
  // another origin, that opens the message. The browser enforces the resource policy on real responses only.
  let policy = 'cross-origin';
  let opened = '';
  const served: string[] = [];
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname.startsWith(BRAND_PATH)) {
      served.push(pathname);
      response.writeHead(200, { 'content-type': 'image/png', 'cross-origin-resource-policy': policy, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' }).end(body);
    } else {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(opened);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = String((server.address() as AddressInfo).port);
  const staticHost = `http://127.0.0.1:${port}`;
  const mailClient = `http://localhost:${port}`;
  try {
    const html = mailBodyHtml(message, staticHost);
    expect(html).toContain(`src="${staticHost}${EMAIL_LOCKUP_PATH}"`);
    opened = html;
    await page.setViewportSize({ width: 640, height: 520 });
    await page.goto(`${mailClient}/message`, { waitUntil: 'load' });
    const lockup = page.getByRole('img', { name: 'PaidWhole' });
    await expect(lockup).toHaveJSProperty('complete', true);
    expect(await lockup.evaluate((image: HTMLImageElement) => [image.naturalWidth, Math.round(image.getBoundingClientRect().width)])).toEqual([1200, 160]);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await page.screenshot({ path: shot('email.png'), fullPage: true });
    // Answered as the application answers (same-origin), the mail client could not embed the art at all: the
    // exception lives on the static host alone. (Another address for the art, so no cache answers for it.)
    policy = 'same-origin';
    opened = html.replace(`${EMAIL_LOCKUP_PATH}"`, `${EMAIL_LOCKUP_PATH}?as-the-application-answers"`);
    await page.goto(`${mailClient}/message-again`, { waitUntil: 'load' });
    await expect(lockup).toHaveJSProperty('complete', true);
    expect(await lockup.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(0);
    expect(served).toEqual([EMAIL_LOCKUP_PATH, EMAIL_LOCKUP_PATH]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  // With no static host configured (a local build) the message goes without the art, never with the name typed instead.
  const bare = mailBodyHtml(message, null);
  expect(bare).not.toMatch(/<img\b/);
  expect(bare).not.toMatch(/>\s*PaidWhole\s*</);
});

test('the sign-in page is the stacked lockup on Paper, and nothing else decorative', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/sign-in');
  await expect(page.locator('[data-slot="sign-in-ground"]')).toHaveCSS('background-color', 'rgb(246, 244, 238)');
  await expect(page.locator('[data-slot="sign-in-ground"] [data-slot="lockup"]')).toContainText('PaidWhole');
  await expect(page.getByText('PaidWhole staff sign in with a hardware key')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: shot('sign-in.png'), fullPage: true });
});

test('the workspace wears the brand: header, brass underline, tiles in mono, status as text on tint; and the printed cover earns the seal only from the ledger', async ({ page, baseURL, browser }) => {
  test.setTimeout(420_000);
  const requests = recordRequests(page);
  const practiceId = await journeyPractice({ name: PRACTICE, settings: SETTINGS });
  await signInWithTotp(page, 'brand-manager');
  const local = await startLocalWorker();
  try {
    await test.step('two SYNTHETIC remittances load and March to May is priced and triaged', async () => {
      await page.goto(`/p/${practiceId}/uploads`);
      await page.getByLabel('Choose files to upload').setInputFiles([
        { name: 'april.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'CAS-08/remit.835')) },
        { name: 'june.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'CAS-04/remit.835')) },
      ]);
      const batch = page.getByRole('region', { name: 'This batch' });
      for (const file of ['april.835', 'june.835']) {
        await expect(batch.getByRole('listitem').filter({ hasText: file })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
      }
      await signedOffSchedule({ practiceId, managerKey: 'brand-manager', planKey: 'CE:SYNPLAN-FIX-ONE' });
      await pricedAndTriaged({ practiceId, managerKey: 'brand-manager', periodFrom: '2026-03-01', periodTo: '2026-05-31' });
    });
  } finally {
    await local.close();
  }

  await test.step('the header: the lockup left, the practice switcher and the account right, one brass underline on the active item', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/p/${practiceId}`);
    const header = page.locator('[data-slot="app-header"]');
    await expect(header.locator('[data-slot="lockup"]')).toContainText('PaidWhole');
    await expect(header.getByLabel('Practice switcher')).toContainText(PRACTICE);
    await expect(header.getByLabel('Account menu')).toBeVisible();
    const active = page.getByRole('navigation', { name: 'Practice' }).getByRole('link', { name: 'Practice home', exact: true });
    await expect(active).toHaveAttribute('aria-current', 'page');
    await expect(active).toHaveCSS('text-decoration-color', BRASS);
    await expect(active).toHaveCSS('text-decoration-line', 'underline');
    await expect(page.getByRole('navigation', { name: 'Practice' }).getByRole('link', { name: 'Uploads', exact: true })).not.toHaveCSS('text-decoration-color', BRASS);
    await expect(header.locator('[data-slot="lockup"] span').first()).toHaveCSS('font-family', /display/i);
    await page.waitForLoadState('networkidle');
    // The pointer rests away from the header, so no hover state is in the picture.
    await page.mouse.move(1279, 899);
    await header.screenshot({ path: shot('header-1280.png') });
    await expect(header).toHaveScreenshot('header-1280.png', { ...VISUAL, mask: [header.locator('time')] });
    await expectLockupOnBrand(page, HEADER_LOCKUP_PLACE);
    await expect(page).toHaveScreenshot('header-lockup-1280.png', { ...STRICT, clip: await lockupBand(page) });
  });

  await test.step('the dashboard tiles: label in Slate, the figure in Plex Mono, recovered named with its proof level', async () => {
    const tiles = page.locator('[data-slot="tile-row"]');
    await expect(tiles.locator('[data-figure="recovered-total"]')).toContainText('Recovered (posted)');
    await expect(tiles.locator('[data-figure="actionable"] .font-mono')).toHaveCSS('font-family', /mono/i);
    await expect(tiles.locator('[data-figure="actionable"] .font-mono')).toHaveCSS('font-variant-numeric', 'tabular-nums');
    await expectAccessible(page, 'The dashboard on brand');
    await page.mouse.move(0, 0);
    await tiles.screenshot({ path: shot('dashboard-tiles.png') });
  });

  await test.step('a table of lines with their status as text on a quiet tint, each with its label', async () => {
    await page.goto(`/p/${practiceId}/claims`);
    const table = page.getByRole('table', { name: 'Claims and lines' });
    // The three numbers side by side in the brand's order: expected, paid (what the payer allowed), short.
    // toHaveText waits for the streamed table and reads every header in order.
    await expect(table.locator('thead th')).toHaveText([
      'Patient reference',
      'Claim control numbers',
      'Service date',
      'Code and modifiers',
      'Units',
      'Charge',
      'Expected allowed',
      'Observed allowed',
      'Short (variance)',
      'Paid',
      'Patient share',
      'Status',
    ]);
    // Each short is the line's variance in the mono face.
    await expect(table.locator('td[data-variance] .font-mono').first()).toHaveCSS('font-family', /mono/i);
    const chips = table.locator('[data-slot="status-chip"]');
    await expect(chips.first()).toBeVisible();
    await expect(chips.first()).not.toHaveText('');
    // Short: colored text on its tint, never white text on a saturated fill.
    const short = table.locator('[data-slot="status-chip"][data-tone="short"]').first();
    await expect(short).toHaveCSS('color', 'rgb(181, 69, 46)');
    await expect(short).toHaveCSS('background-color', 'rgb(248, 236, 232)');
    await expectAccessible(page, 'Claims and lines on brand');
    await page.mouse.move(0, 0);
    await table.screenshot({ path: shot('status-table.png') });
    await page.screenshot({ path: shot('claims-1280.png'), fullPage: true });
    // At desktop width the whole table fits its card: nothing is cut off or left to scroll.
    expect(await table.evaluate((element) => [element.scrollWidth <= (element.parentElement?.clientWidth ?? 0), element.getBoundingClientRect().right <= window.innerWidth])).toEqual([true, true]);
  });

  await test.step('the dashboard and the Reconciliation screen at desktop width, and the dashboard on a dark ground', async () => {
    await page.goto(`/p/${practiceId}`);
    await page.waitForLoadState('networkidle');
    await page.mouse.move(0, 0);
    await page.screenshot({ path: shot('dashboard-1280.png'), fullPage: true });
    // The page title, a section's heading and a card's title, each a step down the one scale.
    const sizes = await page.evaluate(() => {
      const size = (selector: string) => {
        const element = document.querySelector(selector);
        return element === null ? null : [getComputedStyle(element).fontSize, getComputedStyle(element).fontWeight];
      };
      return { title: size('main h1'), card: size('main [data-slot="card-title"]') };
    });
    expect(sizes).toEqual({ title: ['32px', '700'], card: ['18px', '700'] });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.screenshot({ path: shot('dashboard-dark-1280.png'), fullPage: true });
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    await page.goto(`/p/${practiceId}/reconciliation`);
    await page.waitForLoadState('networkidle');
    // One screen, one mark at most: an empty section is its words alone.
    expect(await page.locator('main [data-slot="state-mark"]').count()).toBeLessThanOrEqual(1);
    await page.screenshot({ path: shot('reconciliation-1280.png'), fullPage: true });
  });

  await test.step('the header at a phone width: the lockup, the switcher, the account and the menu fit', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/p/${practiceId}`);
    const header = page.locator('[data-slot="app-header"]');
    await expect(header.locator('[data-slot="lockup"]')).toBeVisible();
    await expect(header.getByText('Menu')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.mouse.move(389, 843);
    await header.screenshot({ path: shot('header-390.png') });
    await expect(header).toHaveScreenshot('header-390.png', { ...VISUAL, mask: [header.locator('time')] });
    await expectLockupOnBrand(page, HEADER_LOCKUP_PLACE_390);
    await expect(page).toHaveScreenshot('header-lockup-390.png', { ...STRICT, clip: await lockupBand(page) });
    // The header itself fits the phone's width: nothing in it overflows or scrolls sideways.
    expect(await header.evaluate((element) => [element.scrollWidth, element.clientWidth, Math.round(element.getBoundingClientRect().width), window.innerWidth])).toEqual([390, 390, 390, 390]);
    // And so does the whole page: a wide table scrolls inside its own card, never the page.
    expect(await pageWidths(page)).toEqual([390, 390]);
    await page.screenshot({ path: shot('dashboard-390.png'), fullPage: true });
    await header.getByText('Menu').click();
    await expect(header.getByRole('navigation', { name: 'Practice' }).getByRole('link', { name: 'Practice home', exact: true })).toHaveCSS('text-decoration-color', BRASS);
    await page.goto(`/p/${practiceId}/claims`);
    await page.waitForLoadState('networkidle');
    expect(await pageWidths(page)).toEqual([390, 390]);
    await page.screenshot({ path: shot('claims-390.png'), fullPage: true });
  });

  await test.step('no request of the workspace left this origin, fonts included', () => {
    expect(requests.filter((url) => FONT_SERVICES.test(url))).toEqual([]);
    expect(requests.filter((url) => !url.startsWith(baseURL ?? 'http://localhost') && !url.startsWith('data:') && !url.startsWith('blob:'))).toEqual([]);
  });

  await test.step('a printed statement’s cover: the seal and its definition only when the ledger says it reconciles to cash', async () => {
    const entries: LedgerEntry[] = [
      { id: '5e1d0000-0000-4000-8000-000000000001', caseId: '5e1d0000-0000-4000-8000-0000000000c1', serviceLineId: '5e1d0000-0000-4000-8000-0000000000a1', stage: 'deposited', amountCents: cents(3000n), evidenceKind: 'eft_row', evidenceId: 'synthetic-eft-row', allocated: false, effectiveOn: '2026-08-14' },
      { id: '5e1d0000-0000-4000-8000-000000000002', caseId: '5e1d0000-0000-4000-8000-0000000000c1', serviceLineId: '5e1d0000-0000-4000-8000-0000000000a1', stage: 'recouped', amountCents: cents(-1800n), evidenceKind: 'provider_adjustment', evidenceId: 'synthetic-plb', allocated: false, effectiveOn: '2026-09-02' },
    ];
    const ledger = entriesById(entries);
    const statement = {
      periodFrom: '2026-04-01',
      periodTo: '2026-09-30',
      proofLevel: 'deposited' as const,
      feesCents: cents(0n),
      recoveredCents: cents(1200n),
      interestCents: cents(0n),
      approvedUnpostedCents: cents(0n),
      actionableOpenCents: cents(9000n),
      pursuitHours: '0.00',
      links: { recovered: entries.map((entry) => entry.id), interest: [], approvedUnposted: [], actionableOpen: [] },
    };
    const none = { storedCents: cents(0n), recomputedCents: cents(0n), matches: true, entries: [] };
    const check = { matches: true, recovered: { storedCents: cents(1200n), recomputedCents: cents(1200n), matches: true, entries }, interest: none, approvedUnposted: none };
    const gate = (stated: bigint): ReportReconciliation =>
      reportReconciliation({ report: { kind: 'roi_statement', id: '5e1d0000-0000-4000-8000-0000000000f1' }, proofLevel: 'deposited', statedRecoveredCents: cents(stated), recoveredEntryIds: statement.links.recovered, ledger });
    const cover = async (reconciliation: ReportReconciliation, name: string) => {
      const printed = await browser.newPage({ viewport: { width: 816, height: 1056 } });
      try {
        await printed.emulateMedia({ media: 'print' });
        await printed.setContent(
          statementHtml({ statementId: '5e1d0000-0000-4000-8000-0000000000f1', practiceName: PRACTICE, statement, check, generatedBy: 'SYNTHETIC BILLING MANAGER', generatedAt: '2026-10-01 09:00:00', reconciliation }),
          { waitUntil: 'load' },
        );
        const section = printed.locator('section.cover');
        await printed.evaluate(() => document.fonts.ready);
        const picture = await section.screenshot({ path: shot(name) });
        await expect(section).toHaveScreenshot(name, { ...VISUAL, mask: [section.locator('time')] });
        await expectCoverOnBrand(printed);
        // The top band, the same with the seal or without it: the lockup in its place on Paper.
        await expect(printed).toHaveScreenshot('report-cover-top.png', { ...STRICT, clip: COVER_TOP_BAND });
        // The ground where nothing prints, above the lockup and across the cover's lower left, is Paper to the pixel.
        const scratch = await browser.newPage();
        try {
          expect(await pixelsUnlike(scratch, picture, { x: 0, y: 0, width: 816, height: 60 }, PAPER_RGB)).toBe(0);
          expect(await pixelsUnlike(scratch, picture, { x: 0, y: 700, width: 400, height: 356 }, PAPER_RGB)).toBe(0);
        } finally {
          await scratch.close();
        }
        // The cover's foot, where the seal prints (bottom right; it keeps its height with no seal in it), as a box
        // inside the cover's picture.
        const foot = await section.evaluate((element): Box | null => {
          const outer = element.getBoundingClientRect();
          const inner = element.querySelector('.cover-foot')?.getBoundingClientRect();
          return inner === undefined ? null : { x: Math.round(inner.left - outer.left), y: Math.round(inner.top - outer.top), width: Math.round(inner.width), height: Math.round(inner.height) };
        });
        expect(foot, 'the cover has its foot').not.toBeNull();
        return { seal: await section.locator('[data-verified="seal"]').count(), text: await section.innerText(), picture, foot: foot as Box };
      } finally {
        await printed.close();
      }
    };
    const earned = gate(1200n);
    expect(earned.reconciledToCash).toBe(true);
    const withSeal = await cover(earned, 'report-cover-with-seal.png');
    expect(withSeal.seal).toBe(1);
    expect(withSeal.text).toContain('Verified: recovered amounts reconcile to posted or deposited remittance');
    const refused = gate(1300n);
    expect(refused).toMatchObject({ reconciledToCash: false, reason: 'total_differs' });
    const withoutSeal = await cover(refused, 'report-cover-without-seal.png');
    expect(withoutSeal.seal).toBe(0);
    expect(withoutSeal.text).not.toContain('Verified:');
    // In pixels: where the seal is earned, its ink, its brass keystone and its definition line draw thousands of pixels
    // in the foot, so that box is where it prints. They are about half of one percent of the whole cover, under the
    // comparison's tolerance, so the seal's absence is checked here and not left to it: where the seal is not earned
    // the foot is Paper and nothing else, in this run's picture and in the committed baseline, so no tolerance can let
    // a seal through and no baseline can be updated to hold one.
    const scratch = await browser.newPage();
    try {
      const area = (box: Box) => box.width * box.height;
      expect(await pixelsUnlike(scratch, withSeal.picture, withSeal.foot, PAPER_RGB)).toBeGreaterThan(2000);
      expect(area(withSeal.foot) - (await pixelsUnlike(scratch, withSeal.picture, withSeal.foot, BRASS_RGB))).toBeGreaterThan(0);
      expect(area(withoutSeal.foot)).toBeGreaterThan(0);
      expect(await pixelsUnlike(scratch, withoutSeal.picture, withoutSeal.foot, PAPER_RGB)).toBe(0);
      const baseline = readFileSync(test.info().snapshotPath('report-cover-without-seal.png', { kind: 'screenshot' }));
      expect(await pixelsUnlike(scratch, baseline, withoutSeal.foot, PAPER_RGB)).toBe(0);
    } finally {
      await scratch.close();
    }
  });
});
