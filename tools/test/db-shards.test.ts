import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { SLOW_FIRST } from '../../vitest.config';
import { type ShardPlan, shardProblems } from './db-shards';

/**
 * The database suite in shards (test matrix CI-04; docs/adr/0066). CI's `db (k/N)` jobs each run
 * `pnpm test:db --shard=k/N`; through vitest's own Node API and sequencer (db-shards.ts, in a process of its own),
 * for 4 shards (the public repository's) and 6 (a private one's), the shards' files are disjoint, none is empty, and
 * together they are exactly the db project's files. A fixture sequencer that drops a file shows the check fails when a
 * file runs nowhere.
 */

const ROOT = path.resolve(import.meta.dirname, '../..');
const TSX = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;

function plan(count: number, sequencer?: string): ShardPlan {
  const output = execFileSync(process.execPath, ['--import', TSX, path.join(ROOT, 'tools/test/db-shards.ts'), String(count), ...(sequencer === undefined ? [] : ['--sequencer', sequencer])], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120_000,
  });
  return JSON.parse(output) as ShardPlan;
}

/** The db project's files as the repository holds them (tracked or new, not ignored), outside apps/web/e2e: vitest.config.ts's include and exclude. */
function dbFiles(): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'apps', 'packages', 'infra', 'tools'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((file) => file.endsWith('.db.test.ts') && !file.startsWith('apps/web/e2e/') && !file.split('/').includes('node_modules'))
    .sort();
}

describe.each([4, 6])('the database suite in %i shards', (count) => {
  let shards: ShardPlan;

  beforeAll(() => {
    shards = plan(count);
  }, 120_000);

  it('runs every file of the db project in exactly one shard, and no shard is empty', () => {
    expect(shardProblems(shards)).toEqual([]);
    expect(shards.shards.map((shard) => shard.index)).toEqual(Array.from({ length: count }, (_, index) => index + 1));
    expect(shards.shards.flatMap((shard) => shard.files).sort()).toEqual(shards.files);
    expect(shards.files).toEqual(dbFiles());
    // The catalog and cross-tenant tests are among them (CLAUDE.md rule 4: on every pull request).
    expect(shards.files).toEqual(expect.arrayContaining(['packages/db/src/catalog.db.test.ts', 'packages/db/src/cross-tenant.db.test.ts']));
  });

  it('starts each shard’s generated route tests and SCR-19’s lease wait first when no duration is recorded', () => {
    for (const shard of shards.shards) {
      expect([...shard.coldOrder].sort(), `shard ${String(shard.index)}`).toEqual(shard.files);
      const slow = shard.coldOrder.map((file) => SLOW_FIRST.some((pattern) => pattern.test(file)));
      expect(slow.indexOf(false) === -1 || !slow.slice(slow.indexOf(false)).includes(true), `shard ${String(shard.index)}: ${shard.coldOrder.join(', ')}`).toBe(true);
    }
    const all = shards.shards.flatMap((shard) => shard.files);
    expect(all.filter((file) => SLOW_FIRST.some((pattern) => pattern.test(file)))).toHaveLength(13);
  });
});

describe('the shard check', () => {
  it('names the file a sequencer leaves out of every shard', () => {
    const dropped = plan(4, path.join(ROOT, 'tools/test/db-shards.fixture.ts'));
    const problems = shardProblems(dropped);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^\S+\.db\.test\.ts runs in no shard$/);
  }, 120_000);

  it('names an empty shard, a file run twice and a file outside the project', () => {
    const files = ['a.db.test.ts', 'b.db.test.ts'];
    expect(
      shardProblems({
        count: 3,
        files,
        cacheDir: '',
        shards: [
          { index: 1, files: ['a.db.test.ts', 'c.db.test.ts'], coldOrder: [] },
          { index: 2, files: ['a.db.test.ts', 'b.db.test.ts'], coldOrder: [] },
          { index: 3, files: [], coldOrder: [] },
        ],
      }),
    ).toEqual(['shard 3/3 runs no file', 'a.db.test.ts runs in shards 1, 2', 'c.db.test.ts runs in shard 1 but is not a file of the db project']);
  });

  it('keeps the results cache CI restores under node_modules/.vite/vitest', () => {
    expect(path.relative(ROOT, plan(1).cacheDir).split(path.sep).slice(0, 3)).toEqual(['node_modules', '.vite', 'vitest']);
  }, 120_000);
});
