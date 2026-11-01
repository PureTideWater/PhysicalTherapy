import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { repositoryRoot } from '../content-files';
import { workerPlaywrightVersion } from '../screening-capacity/containers';

/**
 * One browser build everywhere (test matrix CI-18; docs/adr/0058; A4 (b)): the web tests' @playwright/test, the
 * worker's and the tools' playwright-core (one catalog line), and the lockfile's playwright, playwright-core and
 * @playwright/test name one version; the lockfile's axe-core is the one @axe-core/playwright's range allows; and the
 * worker image installs the lockfile's playwright-core, copied from its build stage, with no version of its own. The
 * gap this closes is #38's: the manifests moved and the image's own literal did not.
 *
 * The manifests, the catalog, the lockfile and the Dockerfile are read through CI_TREE when it is set (a base's
 * archive, for the failing-first run); what is installed is read from the repository's own node_modules.
 * apps/web/e2e/browser.json names no Playwright version: its revision and Chrome for Testing version bind, and
 * tools/ci/browser-build.ts holds them to the installed playwright-core's browsers.json.
 */

const CI_ROOT = process.env.CI_TREE ?? repositoryRoot;
const read = (file: string) => readFileSync(path.join(CI_ROOT, file), 'utf8');
const manifest = (file: string) => JSON.parse(read(file)) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
const named = (file: string, name: string) => {
  const { dependencies, devDependencies } = manifest(file);
  return dependencies?.[name] ?? devDependencies?.[name];
};

/** The version the web tests' @playwright/test names: exact, the one every other place must equal. */
function playwrightVersion(): string {
  const version = named('apps/web/package.json', '@playwright/test') ?? '';
  expect(version, 'apps/web/package.json names @playwright/test at one exact version').toMatch(/^\d+\.\d+\.\d+$/);
  return version;
}

interface Lockfile {
  readonly packages?: Record<string, unknown>;
  readonly snapshots?: Record<string, { dependencies?: Record<string, string> } | null>;
}
const lockfile = () => parse(read('pnpm-lock.yaml')) as Lockfile;

/** Every version the lockfile resolves a package at. */
function locked(name: string): string[] {
  return Object.keys(lockfile().packages ?? {})
    .filter((key) => key.startsWith(`${name}@`))
    .map((key) => key.slice(name.length + 1));
}

/** Whether a version is in a range of the three forms npm manifests here use: exact, ~x.y.z and ^x.y.z. */
export function satisfies(version: string, range: string): boolean {
  const parts = (text: string) => text.split('.').map(Number);
  const [major, minor, patch] = parts(version);
  const form = /^([~^]?)(\d+\.\d+\.\d+)$/.exec(range);
  if (form === null || major === undefined || minor === undefined || patch === undefined) throw new Error(`a range this test does not read: ${range}`);
  const [wantMajor, wantMinor, wantPatch] = parts(form[2] ?? '');
  const atLeast = major > (wantMajor ?? 0) || (major === wantMajor && (minor > (wantMinor ?? 0) || (minor === wantMinor && patch >= (wantPatch ?? 0))));
  if (form[1] === '') return version === form[2];
  if (form[1] === '~') return major === wantMajor && minor === wantMinor && atLeast;
  return major === wantMajor && (major > 0 || minor === wantMinor) && atLeast;
}

describe('one browser build everywhere (CI-18)', () => {
  it('names playwright-core once, as pnpm-workspace.yaml’s catalog line at @playwright/test’s version, which the worker and the tools take as catalog:', () => {
    const version = playwrightVersion();
    const catalog = (parse(read('pnpm-workspace.yaml')) as { catalog?: Record<string, string> }).catalog ?? {};
    expect(catalog['playwright-core'], 'pnpm-workspace.yaml catalog: playwright-core').toBe(version);
    expect(named('apps/worker/package.json', 'playwright-core')).toBe('catalog:');
    expect(named('tools/package.json', 'playwright-core')).toBe('catalog:');
  });

  it('resolves @playwright/test, playwright and playwright-core in the lockfile at that one version, and nothing else of them', () => {
    const version = playwrightVersion();
    for (const name of ['@playwright/test', 'playwright', 'playwright-core']) expect(locked(name), name).toEqual([version]);
  });

  it('resolves the lockfile’s axe-core within @axe-core/playwright’s range, at one version', () => {
    const axe = locked('axe-core');
    expect(axe).toHaveLength(1);
    // The adapter's own manifest (it exports no ./package.json; apps/web links it, as a direct dependency).
    const adapter = JSON.parse(readFileSync(path.join(repositoryRoot, 'apps/web/node_modules/@axe-core/playwright/package.json'), 'utf8')) as { version: string; dependencies: Record<string, string> };
    const range = adapter.dependencies['axe-core'] ?? '';
    expect(satisfies(axe[0] ?? '', range), `axe-core ${axe[0] ?? ''} within ${range}`).toBe(true);
    // The installed adapter is the one the manifest and the lockfile name, so the range judged is the lockfile's.
    expect(locked('@axe-core/playwright')).toEqual([named('apps/web/package.json', '@axe-core/playwright')]);
    expect(adapter.version).toBe(named('apps/web/package.json', '@axe-core/playwright'));
  });

  it('runs the web tests, the worker and the tools on that version as installed, and the capacity harness reads it as the worker image’s', () => {
    const version = playwrightVersion();
    const installed = (from: string, chain: string[]) => {
      let file = path.join(repositoryRoot, from, 'package.json');
      for (const name of chain) file = createRequire(file).resolve(`${name}/package.json`);
      return (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version;
    };
    expect(installed('apps/web', ['@playwright/test'])).toBe(version);
    expect(installed('apps/web', ['@playwright/test', 'playwright', 'playwright-core'])).toBe(version);
    expect(installed('apps/worker', ['playwright-core'])).toBe(version);
    expect(installed('tools', ['playwright-core'])).toBe(version);
    // tools/screening-capacity/measure.test.ts held this to a literal, which its comment said was the image's.
    expect(workerPlaywrightVersion()).toBe(version);
  });

  it('builds the worker image with the lockfile’s playwright-core, copied from the build stage, and no version of its own', () => {
    const dockerfile = read('apps/worker/Dockerfile');
    const [build = '', runtime = ''] = dockerfile.split(/^FROM .* AS runtime$/m);
    expect(dockerfile).not.toMatch(/playwright(?:-core)?@/);
    expect(dockerfile).not.toMatch(/\bnpm install\b|\bnpx playwright/);
    expect(build).toMatch(/^RUN pnpm install --frozen-lockfile --filter "@tp\/worker\.\.\."$/m);
    expect(build).toMatch(/^RUN mkdir \/out && cp -RL apps\/worker\/node_modules\/playwright-core \/out\/playwright-core$/m);
    expect(runtime).toMatch(/^COPY --from=build \/out\/playwright-core \.\/node_modules\/playwright-core$/m);
    expect(runtime).toMatch(/^ && node node_modules\/playwright-core\/cli\.js install --with-deps chromium-headless-shell \\$/m);
  });
});

describe('satisfies', () => {
  it.each([
    ['4.14.0', '~4.14.0', true],
    ['4.14.3', '~4.14.0', true],
    ['4.15.0', '~4.14.0', false],
    ['4.13.9', '~4.14.0', false],
    ['4.20.0', '^4.14.0', true],
    ['5.0.0', '^4.14.0', false],
    ['0.3.1', '^0.3.0', true],
    ['0.4.0', '^0.3.0', false],
    ['1.2.3', '1.2.3', true],
    ['1.2.4', '1.2.3', false],
  ])('%s in %s: %s', (version, range, expected) => {
    expect(satisfies(version, range)).toBe(expected);
  });

  it('refuses a range form it does not read', () => {
    expect(() => satisfies('1.0.0', '>=1.0.0')).toThrow(/does not read/);
  });
});
