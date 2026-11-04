import { type SpawnSyncOptions, type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { repositoryRoot } from '../content-files';

/**
 * Stryker, run by path (docs/adr/0066, Part 7; test matrix CI-29): this Node on the bin @stryker-mutator/core's own
 * manifest names, resolved from the repository's root, never `pnpm stryker` or a bin by name. So no root `stryker`,
 * `prestryker` or `poststryker` script, and no other package's `stryker` bin, decides what runs, and those scripts
 * stay inert for mutation. The package's exports allow its manifest (`./package.json`), not its bin file, so the bin
 * is found through the manifest. The core must be the root's own install, its direct link
 * <root>/node_modules/@stryker-mutator/core: one a parent directory supplies, or a copy only hoisted under
 * <root>/node_modules/.pnpm/node_modules that NODE_PATH (which the tsx and stryker shims set to it) resolves, is
 * refused.
 *
 * `pnpm -s exec tsx tools/stryker/stryker.ts run <config>` runs Stryker as the canary's step does
 * (tools/stryker/shards.ts runs each package's configuration the same way).
 */

/** How a process is started: spawnSync, or a test's recorder. */
export type Spawn = (command: string, args: readonly string[], options: SpawnSyncOptions) => Pick<SpawnSyncReturns<Buffer>, 'status' | 'error'>;

export const STRYKER_PACKAGE = '@stryker-mutator/core';

/** The absolute path of Stryker's bin as the root's own @stryker-mutator/core names it; throws, naming the package, when it cannot. */
export function strykerBin(root: string = repositoryRoot): string {
  const modules = path.join(realpathSync(root), 'node_modules');
  const outside = (directory: string, file: string) => {
    const relative = path.relative(directory, file);
    return relative.startsWith('..') || path.isAbsolute(relative);
  };
  let manifestPath: string;
  try {
    manifestPath = createRequire(path.join(root, 'package.json')).resolve(`${STRYKER_PACKAGE}/package.json`);
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'MODULE_NOT_FOUND') throw new Error(`${STRYKER_PACKAGE} is not installed in ${modules}, so Stryker cannot run by path: run pnpm install --frozen-lockfile`, { cause: error });
    throw new Error(`${STRYKER_PACKAGE}'s package.json cannot be resolved from ${root} (${String(code ?? error)}), so Stryker cannot run by path`, { cause: error });
  }
  // A parent directory's node_modules, or NODE_PATH (which the tsx and stryker shims set), is not the root's install.
  if (outside(modules, manifestPath)) throw new Error(`${STRYKER_PACKAGE} is not installed in ${modules} (it resolves to ${manifestPath}, outside it), so Stryker cannot run by path: run pnpm install --frozen-lockfile`);
  // Nor is a copy under node_modules but not the root's direct link: NODE_PATH points into node_modules/.pnpm/node_modules,
  // where pnpm hoists every package, so a core the root no longer declares can still resolve from there.
  const direct = path.join(modules, STRYKER_PACKAGE, 'package.json');
  if (!existsSync(direct) || realpathSync(direct) !== realpathSync(manifestPath)) {
    throw new Error(`${STRYKER_PACKAGE} is not installed in ${modules} as the root's own dependency (it resolves to ${manifestPath}), so Stryker cannot run by path: run pnpm install --frozen-lockfile`);
  }
  const directory = path.dirname(manifestPath);
  const bin = (JSON.parse(readFileSync(manifestPath, 'utf8')) as { bin?: unknown } | null)?.bin;
  const named = typeof bin === 'object' && bin !== null ? (bin as Record<string, unknown>).stryker : undefined;
  if (typeof named !== 'string' || named === '') throw new Error(`${STRYKER_PACKAGE}'s package.json names no bin.stryker (${manifestPath})`);
  const file = path.resolve(directory, named);
  if (outside(directory, file)) throw new Error(`${STRYKER_PACKAGE}'s bin.stryker, ${named}, lies outside the package (${directory})`);
  if (!existsSync(file)) throw new Error(`${STRYKER_PACKAGE}'s bin.stryker, ${named}, is not installed (${file})`);
  return file;
}

/**
 * Runs Stryker with the given arguments and environment in `root`, on this Node; returns its exit status. `spawn`
 * starts it (a test passes a recorder, so no process starts).
 */
export function runStryker(args: readonly string[], env: NodeJS.ProcessEnv, root: string = repositoryRoot, spawn: Spawn = spawnSync): number {
  const bin = strykerBin(root);
  const run = spawn(process.execPath, [bin, ...args], { cwd: root, stdio: 'inherit', env });
  if (run.error !== undefined) throw run.error;
  return run.status ?? 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  process.exitCode = runStryker(process.argv.slice(2), process.env);
}
