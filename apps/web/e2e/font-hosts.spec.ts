import { type BrowserContext, type Page, expect, test } from '@playwright/test';

import { practiceId, signInWithTotp } from './helpers';

/**
 * CO-01's acceptance in the browser: "no page requests fonts from Google" (its two font hosts; docs/adr/0056,
 * the brand's faces are self-hosted through next/font/local). The main public pages, and the main pages of a
 * practice signed in (a viewer of the SYNTHETIC group, practice north, reading only), are each loaded until the
 * network is idle, and for each the test collects every request the browser made, every request the page's
 * Content-Security-Policy refused before it was made (the policy would hide an attempt from the network log), and
 * every URL its document and its style sheets name. None may name either host. Any request to them is also
 * refused here, so nothing leaves the machine even if one were made. Synthetic data only.
 */

const FONT_HOSTS = /fonts\.googleapis\.com|fonts\.gstatic\.com/i;

const PUBLIC_PAGES = ['/', '/sign-in', '/sign-in/hardware-key', '/request-audit', '/screening', '/status', '/terms', '/support', '/maintenance', '/security'];
const PRACTICE_PAGES = ['', '/claims', '/remittances', '/uploads', '/contracts', '/coverage', '/cases', '/anomalies', '/reports', '/reconciliation', '/notifications', '/settings'];
const ACCOUNT_PAGES = ['/account/devices', '/account/notifications'];

interface Evidence {
  readonly requests: string[];
  readonly refused: string[];
}

/** Every request the context makes, and every request to a font host refused at the route (it never leaves). */
async function watch(context: BrowserContext): Promise<Evidence> {
  const evidence: Evidence = { requests: [], refused: [] };
  context.on('request', (request) => evidence.requests.push(request.url()));
  await context.route(FONT_HOSTS, async (route) => {
    evidence.refused.push(route.request().url());
    await route.abort('blockedbyclient');
  });
  // The page's own record of what its policy refused: a refused request never reaches the network log.
  await context.addInitScript(() => {
    const refusals: string[] = [];
    Object.defineProperty(window, '__cspRefusals', { value: refusals });
    document.addEventListener('securitypolicyviolation', (event) => refusals.push(event.blockedURI));
  });
  return evidence;
}

/** What the loaded page names: its CSP refusals, every element's URL attribute, its markup, and each style sheet's rules. */
async function named(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const refusals = (window as unknown as { __cspRefusals?: string[] }).__cspRefusals ?? [];
    const urls = [...document.querySelectorAll('[href], [src], [srcset]')].flatMap((element) => ['href', 'src', 'srcset'].map((name) => element.getAttribute(name) ?? ''));
    const rules = [...document.styleSheets].flatMap((sheet) => {
      const own = sheet.href ?? '';
      try {
        return [own, ...[...sheet.cssRules].map((rule) => rule.cssText)];
      } catch {
        // A style sheet from another origin cannot be read; its address alone is enough to fail the test.
        return [own];
      }
    });
    return [...refusals, ...urls, ...rules, document.documentElement.outerHTML];
  });
}

async function visit(page: Page, evidence: Evidence, url: string): Promise<void> {
  const response = await page.goto(url);
  expect(response?.status() ?? 0, url).toBeLessThan(500);
  await page.waitForLoadState('networkidle');
  // Every face the page uses has settled (self-hosted, so from this origin).
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const found = (await named(page)).filter((text) => FONT_HOSTS.test(text));
  expect(found, `${url}: names a Google font host`).toEqual([]);
  expect(evidence.requests.filter((request) => FONT_HOSTS.test(request)), `${url}: asked a Google font host`).toEqual([]);
  expect(evidence.refused, url).toEqual([]);
}

test('no public page asks Google’s font hosts for anything, or names them', async ({ page, context, baseURL }) => {
  const evidence = await watch(context);
  for (const url of PUBLIC_PAGES) {
    await visit(page, evidence, url);
  }
  // The faces the public pages use are the self-hosted woff2 files, from this origin.
  expect(evidence.requests.some((url) => url.startsWith(`${baseURL ?? ''}/_next/static/media/`) && url.endsWith('.woff2'))).toBe(true);
});

test('no page of a signed-in practice asks Google’s font hosts for anything, or names them', async ({ page, context, baseURL }) => {
  test.setTimeout(180_000);
  const evidence = await watch(context);
  await signInWithTotp(page, 'viewer');
  const north = await practiceId('north');
  for (const url of [...PRACTICE_PAGES.map((suffix) => `/p/${north}${suffix}`), ...ACCOUNT_PAGES]) {
    await visit(page, evidence, url);
  }
  // Every request the signed-in pages made stayed on this origin, fonts included.
  expect(evidence.requests.filter((url) => !url.startsWith(baseURL ?? 'http://localhost') && !url.startsWith('data:') && !url.startsWith('blob:'))).toEqual([]);
  expect(evidence.requests.some((url) => url.startsWith(`${baseURL ?? ''}/_next/static/media/`) && url.endsWith('.woff2'))).toBe(true);
});
