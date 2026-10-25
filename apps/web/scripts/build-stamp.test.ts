import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { BuildStampError, STAMP, checkStamp, run, writeStamp } from './build-stamp';

/**
 * End-to-end shards over one build (test matrix CI-06 and CI-07; docs/adr/0066): the e2e suite runs a prebuilt web
 * app only when the build is stamped with the commit under test, and refuses a build of another commit or none; on CI
 * a test that passes only on its retry fails the run.
 */

const HEAD = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
let dir = '';
let stamp = '';

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'tp-build-stamp-'));
  stamp = path.join(dir, 'BUILD_COMMIT');
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the build stamp', () => {
  afterEach(() => {
    rmSync(stamp, { force: true });
  });

  it('passes a build stamped with the expected commit, as `git rev-parse HEAD >` or --write leaves it', () => {
    writeFileSync(stamp, `${HEAD}\n`);
    expect(checkStamp(HEAD, stamp)).toBe(HEAD);
    expect(run(['--expect', `${HEAD}\n`], stamp)).toBe(`the build is ${HEAD}'s`);
    const sha256 = 'c'.repeat(64);
    expect(run(['--write', sha256], stamp)).toBe(`stamped ${sha256}`);
    expect(checkStamp(sha256, stamp)).toBe(sha256);
  });

  it('refuses a build stamped with another commit, naming both', () => {
    writeStamp(OTHER, stamp);
    expect(() => checkStamp(HEAD, stamp)).toThrow(BuildStampError);
    expect(() => run(['--expect', HEAD], stamp)).toThrow(`was made from ${OTHER}, not ${HEAD}: refusing to run a build of another commit`);
  });

  it('refuses a build with no stamp', () => {
    expect(() => run(['--expect', HEAD], stamp)).toThrow(`no build stamp at ${stamp}`);
  });

  it('refuses a malformed stamp, and an expected commit that is not one (git rev-parse failed: an empty string)', () => {
    writeFileSync(stamp, 'main\n');
    expect(() => checkStamp(HEAD, stamp)).toThrow('is not a full commit name');
    writeStamp(HEAD, stamp);
    for (const expected of ['', 'HEAD', HEAD.slice(0, 12), `${HEAD} ${HEAD}`]) {
      expect(() => checkStamp(expected, stamp), JSON.stringify(expected)).toThrow('the expected commit is not a full commit name');
    }
    expect(() => {
      writeStamp('', stamp);
    }).toThrow('the commit to stamp is not a full commit name');
    expect(() => run(['--expect'], stamp)).toThrow('usage:');
    expect(() => run(['--check', HEAD], stamp)).toThrow('usage:');
  });

  it('reads apps/web/.next/BUILD_COMMIT, where the build job writes it', () => {
    expect(path.relative(path.resolve(import.meta.dirname, '..'), STAMP)).toBe(path.join('.next', 'BUILD_COMMIT'));
  });
});

describe('playwright.config.ts', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function configWith(env: Record<string, string | undefined>) {
    vi.resetModules();
    for (const [name, value] of Object.entries(env)) {
      vi.stubEnv(name, value);
    }
    return (await import('../playwright.config')).default;
  }

  const command = (config: Awaited<ReturnType<typeof configWith>>) => {
    const server = config.webServer;
    return (Array.isArray(server) ? server[0] : server)?.command ?? '';
  };

  it('with E2E_PREBUILT=1, prepares the database and runs the build that is there once its stamp names this commit, instead of building', async () => {
    const prebuilt = command(await configWith({ E2E_PREBUILT: '1', CI: 'true' }));
    expect(prebuilt).toContain('e2e/prepare.ts && ../../node_modules/.bin/tsx scripts/build-stamp.ts --expect "$(git rev-parse HEAD)" && PORT=');
    expect(prebuilt).not.toContain('pnpm run build');
    expect(prebuilt).toMatch(/&& PORT=\d+ bash scripts\/start-standalone\.sh$/);
  });

  it('without E2E_PREBUILT, builds the app itself, as before', async () => {
    for (const value of [undefined, '', '0']) {
      const built = command(await configWith({ E2E_PREBUILT: value }));
      expect(built).toContain('e2e/prepare.ts && pnpm run build && PORT=');
      expect(built).not.toContain('build-stamp');
    }
  });

  it('refuses any other E2E_PREBUILT', async () => {
    await expect(configWith({ E2E_PREBUILT: 'true' })).rejects.toThrow('E2E_PREBUILT is 1 (run the stamped build that is there) or unset');
  });

  it('on CI, fails a test that passes only on its retry, and annotates the pull request', async () => {
    const ci = await configWith({ CI: 'true' });
    expect(ci.retries).toBe(1);
    expect(ci.failOnFlakyTests).toBe(true);
    expect(ci.forbidOnly).toBe(true);
    expect(ci.reporter).toEqual([['list'], ['html', { open: 'never' }], ['github']]);
    const local = await configWith({ CI: undefined });
    expect(local.retries).toBe(0);
    expect(local.failOnFlakyTests).toBe(false);
    expect(local.reporter).toBe('list');
  });
});
