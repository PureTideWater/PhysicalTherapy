import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { repositoryRoot } from '../content-files';
import { SCREENING_ENTRY_POINTS, WATCHED_FIXED, WATCHED_LIST, importClosure, matchesWatched, readWatchedList, watchedListText, watchedPaths } from './watched';

/**
 * The screening-capacity gate's watched list (tools/screening-capacity/watched.ts; the founder's Q8 of 2026-10-21): the
 * committed list is exactly what the import graph of the measured images and the harness gives, so no file on the
 * screening's path can change with a green gate and no measurement (the review of 2026-10-22).
 */
describe('the watched list', () => {
  const committed = readWatchedList(readFileSync(path.join(repositoryRoot, WATCHED_LIST), 'utf8'));

  it('is what the entry points\' imports and the fixed lines give: run `pnpm exec tsx tools/screening-capacity/watched.ts --write` after an import changes', () => {
    expect(committed).toEqual(watchedPaths());
    expect(readFileSync(path.join(repositoryRoot, WATCHED_LIST), 'utf8')).toBe(watchedListText(watchedPaths()));
  });

  it('watches what the review found left out of the hand-kept list', () => {
    for (const file of [
      'apps/web/next.config.ts',
      'apps/web/src/lib/uploads/queue.ts',
      'apps/web/src/lib/server/config.ts',
      'apps/web/src/lib/http/rate-limit.ts',
      'apps/web/src/lib/http/invoke.ts',
      'apps/web/src/lib/http/next.ts',
      'apps/web/src/lib/http/received.ts',
      'packages/observability/src/fields.ts',
      'packages/db/src/connect.ts',
      'apps/worker/src/heartbeat.ts',
      'apps/worker/src/shutdown.ts',
      'apps/worker/src/platform/wiring.ts',
      'pnpm-lock.yaml',
      'apps/web/package.json',
      'apps/worker/package.json',
      'packages/db/package.json',
      'packages/db/migrations/20261105090000_pricing_location_and_zip_plus_four.sql',
      'apps/web/src/app/screening/results/[resultId]/page.tsx',
    ]) {
      expect(committed.some((line) => matchesWatched(file, line)), file).toBe(true);
    }
    // And not what the screening never runs: a practice's page, a test.
    expect(committed.some((line) => matchesWatched('apps/web/src/app/p/[practiceId]/uploads/page.tsx', line))).toBe(false);
    expect(committed.some((line) => matchesWatched('apps/worker/src/screening/threads.test.ts', line))).toBe(false);
  });

  it('follows relative imports and the workspace packages\' exports, and leaves tests out', () => {
    const closure = importClosure(['apps/worker/src/screening/thread.ts']);
    expect(closure).toContain('apps/worker/src/screening/job.ts');
    expect(closure).toContain('packages/db/src/index.ts');
    expect(closure).toContain('packages/pricing/src/index.ts');
    expect(closure.some((file) => file.endsWith('.test.ts'))).toBe(false);
  });

  it('follows tests only when asked (the mutation closures, tools/stryker/affected.ts), so the watched list is unchanged', () => {
    // Off by default and when false: the watched list derives exactly as before the option.
    expect(importClosure(SCREENING_ENTRY_POINTS, repositoryRoot, { includeTests: false })).toEqual(importClosure(SCREENING_ENTRY_POINTS));
    expect(committed).toEqual(watchedPaths());
    // A test as an entry point is skipped unless tests are included; then it and what it imports are followed.
    expect(importClosure(['packages/money/src/cents.test.ts'])).toEqual([]);
    const withTests = importClosure(['packages/money/src/cents.test.ts'], repositoryRoot, { includeTests: true });
    expect(withTests).toContain('packages/money/src/cents.test.ts');
    expect(withTests).toContain('packages/money/src/cents.ts');
    expect(withTests.every((file) => file.startsWith('packages/money/src/'))).toBe(true);
  });

  it('reads a line as the workflow does: the path itself, or a pattern with * and no other pattern character', () => {
    expect(matchesWatched('apps/web/src/app/screening/results/[resultId]/page.tsx', 'apps/web/src/app/screening/results/[resultId]/page.tsx')).toBe(true);
    expect(matchesWatched('apps/web/src/app/screening/results/r/page.tsx', 'apps/web/src/app/screening/results/[resultId]/page.tsx')).toBe(false);
    expect(matchesWatched('packages/db/migrations/20270101000000_x.sql', 'packages/db/migrations/*')).toBe(true);
    expect(matchesWatched('tools/screening-capacity/test-support/measurements.ts', 'tools/screening-capacity/*')).toBe(true);
    for (const line of committed.filter((entry) => entry.includes('*'))) {
      expect(line, line).toMatch(/^[^?[\]]*$/);
    }
    expect(WATCHED_FIXED).toContain('pnpm-lock.yaml');
    // The harness's Postgres image comes from the compose file (containers.ts), so a digest bump measures (CI-13).
    expect(WATCHED_FIXED).toContain('docker-compose.yml');
    expect(committed).toContain('docker-compose.yml');
    // The capacity job runs the system packages' check and the browser check, and the browser check reads browser.json,
    // so a change to any of them is measured on the job's own runner image (the review's N7; docs/adr/0066, Part 3).
    for (const file of ['tools/ci/apt-archives.sh', 'tools/ci/browser-build.ts', 'apps/web/e2e/browser.json']) {
      expect(WATCHED_FIXED, file).toContain(file);
      expect(committed, file).toContain(file);
    }
  });

  it('is inside what a push to the build branch measures', () => {
    const workflow = parse(readFileSync(path.join(repositoryRoot, '.github/workflows/screening-capacity.yml'), 'utf8')) as { on: { push: { paths: string[] } } };
    // `**` matches across `/`, a lone `*` within one segment.
    const pushPaths = workflow.on.push.paths.map((glob) => new RegExp(`^${glob.split('**').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('.*')}$`));
    for (const line of committed) {
      // A pattern line is checked by its fixed prefix: the push glob must cover what it can match.
      const probe = line.replace(/\*/g, 'x/y');
      expect(pushPaths.some((glob) => glob.test(probe)), line).toBe(true);
    }
  });
});
