import path from 'node:path';
import { Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';

import { type TestSequencer, type TestSequencerConstructor, type TestSpecification, type Vitest, createVitest } from 'vitest/node';

/**
 * Which database files each of N shards runs, as `pnpm test:db --shard=k/N` decides it (test matrix CI-04;
 * docs/adr/0066): vitest's own Node API with the db project and `shard: 'k/N'`, its test files globbed, then the
 * configured sequencer's shard() (and sort(), with no results cache, for the order a cold shard starts its files in).
 * db-shards.test.ts runs this in a process of its own, so its own vitest is never the one asked.
 *
 *   tsx tools/test/db-shards.ts <N> [--sequencer <module whose default export is a sequencer class>]
 *
 * prints the plan as JSON. --sequencer replaces the configured sequencer (the test's fixture that drops a file).
 */

export interface ShardPlan {
  /** The number of shards. */
  readonly count: number;
  /** Every file of the db project, root-relative and sorted. */
  readonly files: readonly string[];
  /** Each shard's files (sorted), and the order it starts them in when no duration is recorded. */
  readonly shards: readonly { readonly index: number; readonly files: readonly string[]; readonly coldOrder: readonly string[] }[];
  /** Where vitest keeps the results cache CI restores per shard. */
  readonly cacheDir: string;
}

const ROOT = path.resolve(import.meta.dirname, '../..');

const relative = (vitest: Vitest, spec: TestSpecification) => path.relative(vitest.config.root, spec.moduleId).split(path.sep).join('/');

/** A vitest of the db project, as `vitest run --project db` would start it, closed after `use`. */
async function withVitest<T>(options: { readonly shard?: string; readonly cache?: false }, use: (vitest: Vitest) => Promise<T>): Promise<T> {
  const quiet = new Writable({ write: (_chunk, _encoding, done) => done() });
  const vitest = await createVitest('test', { root: ROOT, project: ['db'], watch: false, ...options }, {}, { stdout: quiet, stderr: process.stderr });
  try {
    return await use(vitest);
  } finally {
    await vitest.close();
  }
}

export async function planShards(count: number, sequencer?: TestSequencerConstructor): Promise<ShardPlan> {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`the number of shards is a whole number, at least one: ${String(count)}`);
  }
  const make = (vitest: Vitest): TestSequencer => new (sequencer ?? vitest.config.sequence.sequencer)(vitest);
  const { files, cacheDir } = await withVitest({}, async (vitest) => ({
    files: (await vitest.globTestSpecifications()).map((spec) => relative(vitest, spec)).sort(),
    cacheDir: vitest.vite.config.cacheDir,
  }));
  const shards = [];
  for (let index = 1; index <= count; index += 1) {
    shards.push(
      await withVitest({ shard: `${String(index)}/${String(count)}`, cache: false }, async (vitest) => {
        const order = make(vitest);
        const mine = await order.shard(await vitest.globTestSpecifications());
        return { index, files: mine.map((spec) => relative(vitest, spec)).sort(), coldOrder: (await order.sort(mine)).map((spec) => relative(vitest, spec)) };
      }),
    );
  }
  return { count, files, shards, cacheDir };
}

/** What is wrong with a plan: an empty shard, a file run twice, a file no shard runs, a file not in the project. */
export function shardProblems(plan: ShardPlan): string[] {
  const problems: string[] = [];
  if (plan.shards.length !== plan.count) {
    problems.push(`${String(plan.shards.length)} shards, not ${String(plan.count)}`);
  }
  const ranBy = new Map<string, number[]>();
  for (const shard of plan.shards) {
    if (shard.files.length === 0) {
      problems.push(`shard ${String(shard.index)}/${String(plan.count)} runs no file`);
    }
    for (const file of shard.files) {
      ranBy.set(file, [...(ranBy.get(file) ?? []), shard.index]);
    }
  }
  for (const [file, indexes] of ranBy) {
    if (indexes.length > 1) {
      problems.push(`${file} runs in shards ${indexes.join(', ')}`);
    }
    if (!plan.files.includes(file)) {
      problems.push(`${file} runs in shard ${indexes.join(', ')} but is not a file of the db project`);
    }
  }
  for (const file of plan.files) {
    if (!ranBy.has(file)) {
      problems.push(`${file} runs in no shard`);
    }
  }
  return problems;
}

async function main(argv: readonly string[]): Promise<void> {
  const [count, flag, module] = argv;
  if (count === undefined || (flag !== undefined && (flag !== '--sequencer' || module === undefined))) {
    throw new Error('usage: tsx tools/test/db-shards.ts <N> [--sequencer <module>]');
  }
  const sequencer = module === undefined ? undefined : ((await import(pathToFileURL(path.resolve(module)).href)) as { default: TestSequencerConstructor }).default;
  process.stdout.write(`${JSON.stringify(await planShards(Number(count), sequencer))}\n`);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await main(process.argv.slice(2));
}
