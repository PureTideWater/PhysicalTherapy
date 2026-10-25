import { chromiumInstalled } from '../../apps/worker/src/report/pdf';

/**
 * Vitest's global setup for the unit and db projects (vitest.config.ts; test matrix CI-05; docs/adr/0066). The tests
 * that print a PDF (report.db.test.ts, payer-copy.db.test.ts and the worker's unit files that print) skip where
 * Playwright's Chromium is not installed, which is right on a developer's machine and wrong on CI: a job that forgot the
 * install would pass with them unrun. So on CI a run without Chromium fails here, before any test, and names the step
 * it lacks. Off CI it does nothing.
 */

/** The install step every CI job that runs the unit or db project takes first. */
export const CHROMIUM_INSTALL = 'pnpm --filter @tp/web exec playwright install --with-deps chromium';

/** Whether this is a CI run: CI set to anything but empty or "false" (as tools/engine-freeze reads it). */
export function inCi(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.CI !== undefined && env.CI !== '' && env.CI !== 'false';
}

/** Throws on CI when Chromium is missing; returns otherwise. */
export function requireChromiumOnCi(env: Readonly<Record<string, string | undefined>>, installed: () => boolean): void {
  if (inCi(env) && !installed()) {
    throw new Error(`Playwright's Chromium is not installed, and on CI the tests that print may not skip: run \`${CHROMIUM_INSTALL}\` before vitest (docs/adr/0066)`);
  }
}

export default function setup(): void {
  requireChromiumOnCi(process.env, chromiumInstalled);
}
