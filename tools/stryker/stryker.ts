import { type SpawnSyncOptions, type SpawnSyncReturns, spawnSync } from 'node:child_process';
import path from 'node:path';

import { repositoryRoot } from '../content-files';

/**
 * Stryker, run by path (docs/adr/0066, Part 7): this Node on the bin @stryker-mutator/core's own manifest names, so
 * no root script, pre or post script, or other package's `stryker` bin decides what runs.
 *
 * `pnpm -s exec tsx tools/stryker/stryker.ts run <config>` runs Stryker as the canary's step does.
 */

/** How a process is started: spawnSync, or a test's recorder. */
export type Spawn = (command: string, args: readonly string[], options: SpawnSyncOptions) => Pick<SpawnSyncReturns<Buffer>, 'status' | 'error'>;

/** Runs Stryker with the given arguments and environment in `root`; returns its exit status. */
export function runStryker(args: readonly string[], env: NodeJS.ProcessEnv, root: string = repositoryRoot, spawn: Spawn = spawnSync): number {
  const run = spawn('pnpm', ['stryker', ...args], { cwd: root, stdio: 'inherit', env });
  if (run.error !== undefined) throw run.error;
  return run.status ?? 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  process.exitCode = runStryker(process.argv.slice(2), process.env);
}
