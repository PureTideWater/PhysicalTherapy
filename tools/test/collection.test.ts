import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';

/**
 * Collecting a test file runs its module and its describe blocks but none of its hooks, so a file that makes a temporary
 * directory there and removes it in afterAll leaves one behind on every `vitest list` and every run whose filter skips
 * the file's tests (the review of docs/adr/0066's pull request, N-6). The unit test files the CI series added or
 * rewrote whole make theirs in beforeAll or in a test, which this proves by collecting them, with no test run, under a
 * temporary directory of their own.
 */

/** Every unit test file directly in a directory of the CI series' tools, so a file added there later is collected too. */
const testsIn = (dir: string): string[] =>
  existsSync(path.join(repositoryRoot, dir))
    ? readdirSync(path.join(repositoryRoot, dir))
        .filter((file) => file.endsWith('.test.ts') && !file.endsWith('.db.test.ts'))
        .sort()
        .map((file) => `${dir}/${file}`)
    : [];

const FILES = [
  'tools/test/ci-gate.test.ts',
  'tools/test/workflows.test.ts',
  'tools/test/required-checks.test.ts',
  'tools/test/ci-chromium.test.ts',
  'tools/test/db-shards.test.ts',
  'tools/lint/groups.test.ts',
  'tools/typecheck/run.test.ts',
  'apps/web/scripts/build-stamp.test.ts',
  'apps/web/src/lib/routes/route-tests/partition.test.ts',
  // ci-deps (docs/adr/0066, Part 2).
  'tools/test/dependabot-config.test.ts',
  'tools/test/no-duplicated-versions.test.ts',
  ...testsIn('tools/check-action-pins'),
  ...testsIn('tools/check-toolchain'),
  ...testsIn('tools/ci'),
  // ci-browser (docs/adr/0066, Part 3).
  'tools/screening-capacity/image-id.test.ts',
  'tools/test/browser-version.test.ts',
];

/** What Node itself keeps in the temporary directory (module.enableCompileCache), not a test's. */
const NODE_OWN = new Set(['node-compile-cache']);

it('leaves no temporary directory behind when vitest collects the CI series’ unit test files and runs none of them', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'tp-collection-'));
  try {
    const vitest = path.join(path.dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs');
    // A vitest of its own: none of this run's VITEST_ variables, and the temporary directory above for os.tmpdir().
    const env: NodeJS.ProcessEnv = { ...process.env, TMPDIR: tmp };
    for (const name of Object.keys(env).filter((key) => key.startsWith('VITEST'))) {
      Reflect.deleteProperty(env, name);
    }
    const listed = spawnSync(process.execPath, [vitest, 'list', '--no-staticParse', '--project', 'unit', ...FILES], { cwd: repositoryRoot, env, encoding: 'utf8', timeout: 110_000 });
    expect(listed.error).toBeUndefined();
    expect(listed.status, `${listed.stdout}${listed.stderr}`).toBe(0);
    // Every file was collected, so each module and describe block ran.
    for (const file of FILES) expect(listed.stdout, file).toContain(file);
    expect(readdirSync(tmp).filter((name) => !NODE_OWN.has(name))).toEqual([]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}, 120_000);
