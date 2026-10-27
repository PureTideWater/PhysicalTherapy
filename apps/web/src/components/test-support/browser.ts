import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Browser, type Page, chromium } from '@playwright/test';
import { createViteServer } from 'vitest/node';

/**
 * The forms' browser harness (docs/adr/0077; design section 8.2): the real form components in Playwright's Chromium,
 * with no new dependency. A Vite server (vitest's own) serves forms-harness.html, whose entry renders a form the test
 * names with in-memory actions it scripts through `window.harness`; the page links the real stylesheet as plain CSS,
 * so the unlayered rules apply as in the app. Synthetic values only; nothing reaches a server but this one.
 *
 * The tests skip where Chromium is not installed, which is right on a developer's machine; on CI the unit project's
 * global setup fails the run instead (tools/test/ci-chromium.ts, CI-05), so they cannot silently skip there. A
 * developer without Playwright's pinned build may name another Chromium in FORMS_HARNESS_CHROMIUM: a signal for
 * that machine only, never set on CI, whose runs are the record.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../../../..');

/** Another Chromium than Playwright's pinned build, for a developer's run only (unset: the pinned build). */
const elsewhere = process.env.FORMS_HARNESS_CHROMIUM === '' ? undefined : process.env.FORMS_HARNESS_CHROMIUM;

/** Whether the harness's Chromium is installed here. */
export function chromiumInstalled(): boolean {
  try {
    return existsSync(elsewhere ?? chromium.executablePath());
  } catch {
    return false;
  }
}

/** A started harness: open a form in a new page, then close everything. */
export interface Harness {
  /** Opens the harness's form `form` in a new page of `width` CSS pixels (1280 by default); its errors fail `errors()`. */
  open(form: string, options?: { readonly width?: number }): Promise<Page>;
  /** The uncaught errors of every page opened so far. */
  errors(): readonly string[];
  close(): Promise<void>;
}

/** Starts the Vite server and Chromium. */
export async function startHarness(): Promise<Harness> {
  const server = await createViteServer({
    configFile: false,
    root: here,
    cacheDir: path.join(repository, 'node_modules/.vite/forms-harness'),
    logLevel: 'warn',
    clearScreen: false,
    // The stylesheet is served as written: no PostCSS config is looked for, so its Tailwind at-rules reach the browser,
    // which ignores them, and its plain rules apply.
    css: { postcss: {} },
    // Next's client modules read process.env; the harness runs outside Next.
    define: { 'process.env.__NEXT_ROUTER_BASEPATH': '""', 'process.env.NODE_ENV': '"development"' },
    resolve: { dedupe: ['react', 'react-dom'] },
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null, fs: { allow: [repository] } },
  });
  await server.listen();
  const base = server.resolvedUrls?.local[0];
  if (base === undefined) {
    await server.close();
    throw new Error('the harness server has no address');
  }
  let browser: Browser;
  try {
    browser = await chromium.launch(elsewhere === undefined ? {} : { executablePath: elsewhere });
  } catch (error) {
    await server.close();
    throw error;
  }
  const errors: string[] = [];
  return {
    async open(form, options = {}) {
      const page = await browser.newPage({ viewport: { width: options.width ?? 1280, height: 800 } });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${base}forms-harness.html?form=${encodeURIComponent(form)}`);
      await page.waitForFunction(() => (window as unknown as { harnessReady?: boolean }).harnessReady === true, null, { timeout: 30_000 });
      return page;
    },
    errors: () => errors,
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

/** Runs `run` with a started harness, and closes it however `run` ends. */
export async function withHarness<T>(run: (harness: Harness) => Promise<T>): Promise<T> {
  const harness = await startHarness();
  try {
    return await run(harness);
  } finally {
    await harness.close();
  }
}
