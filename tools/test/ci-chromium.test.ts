import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { chromiumInstalled } from '../../apps/worker/src/report/pdf';
import config from '../../vitest.config';
import { CHROMIUM_INSTALL, inCi, requireChromiumOnCi } from './ci-chromium';

/**
 * The unit and db projects' global setup (test matrix CI-05; docs/adr/0066): on CI, a run without Playwright's Chromium
 * fails instead of skipping the tests that print; off CI, or with Chromium, it does nothing.
 */

const SETUP = pathToFileURL(path.join(import.meta.dirname, 'ci-chromium.ts')).href;
const TSX = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const noBrowsers = mkdtempSync(path.join(tmpdir(), 'tp-no-browsers-'));

afterAll(() => {
  rmSync(noBrowsers, { recursive: true, force: true });
});

/** The global setup as vitest runs it, in a process of its own with the given environment. */
function runSetup(env: Record<string, string | undefined>): { status: number | null; stderr: string } {
  const result = spawnSync(process.execPath, ['--import', TSX, '--input-type=module', '-e', `const setup = await import(${JSON.stringify(SETUP)}); setup.default();`], {
    env: Object.fromEntries(Object.entries({ PATH: process.env.PATH, HOME: process.env.HOME, ...env }).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { status: result.status, stderr: result.stderr };
}

describe('requireChromiumOnCi', () => {
  it('throws on CI without Chromium, naming the install step', () => {
    for (const ci of ['true', '1', 'yes']) {
      expect(() => {
        requireChromiumOnCi({ CI: ci }, () => false);
      }).toThrow(CHROMIUM_INSTALL);
    }
  });

  it('returns on CI with Chromium, and off CI either way', () => {
    expect(requireChromiumOnCi({ CI: 'true' }, () => true)).toBeUndefined();
    for (const env of [{}, { CI: '' }, { CI: 'false' }]) {
      expect(inCi(env)).toBe(false);
      expect(requireChromiumOnCi(env, () => false)).toBeUndefined();
    }
  });
});

describe('the global setup, as vitest loads it', () => {
  it('fails a CI run whose Chromium is missing, and lets the same run through off CI', { timeout: 120_000 }, () => {
    const missing = runSetup({ CI: 'true', PLAYWRIGHT_BROWSERS_PATH: noBrowsers });
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain(CHROMIUM_INSTALL);
    expect(runSetup({ CI: undefined, PLAYWRIGHT_BROWSERS_PATH: noBrowsers }).status).toBe(0);
  });

  // On CI the setup itself guarantees Chromium, so this never skips there.
  it.skipIf(!chromiumInstalled())('lets a CI run through where Chromium is installed', { timeout: 120_000 }, () => {
    expect(runSetup({ CI: 'true', PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH })).toMatchObject({ status: 0 });
  });

  it('is the unit and db projects’ global setup, and not the golden project’s', () => {
    const projects = (config.test?.projects ?? []) as { test?: { name?: string; globalSetup?: string | string[] } }[];
    const setupOf = (name: string) => projects.find((project) => project.test?.name === name)?.test?.globalSetup;
    expect(setupOf('unit')).toEqual(['tools/test/ci-chromium.ts']);
    expect(setupOf('db')).toEqual(['tools/test/ci-chromium.ts']);
    expect(setupOf('golden')).toBeUndefined();
  });
});
