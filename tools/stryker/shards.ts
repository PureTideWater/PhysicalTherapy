import path from 'node:path';

import { MUTATION_PACKAGES, type MutationPackage, SHARD_VARIABLE, type Shard, readShards } from '../../stryker/base.mjs';
import { repositoryRoot } from '../content-files';
import { type Spawn, runStryker } from './stryker';

/**
 * The mutation workflow's shards (stryker/shards.json; docs/adr/0066, Part 4): which packages each holds, and which
 * shards each package's mutants are split over. A shard runs every one of its packages' files in full, and a package's
 * shards run all or none (the workflow's changes job selects every shard of each affected package), so a package is
 * fully run exactly when all its shards ran.
 *
 * `pnpm -s exec tsx tools/stryker/shards.ts <shard>` runs one shard: each of its packages' Stryker configurations in
 * turn, under TP_MUTATION_SHARD, each writing reports/mutation/<shard>/<package>.json. It stops at the first failure.
 * Stryker runs by path (tools/stryker/stryker.ts; docs/adr/0066, Part 7), never through a root script or a bin by name.
 */

export type { Shard } from '../../stryker/base.mjs';

/** The packages a shard mutates, in MUTATION_PACKAGES's order. */
export function packagesOf(shard: Shard): MutationPackage[] {
  return MUTATION_PACKAGES.filter((pkg) => shard.mutate[pkg] !== undefined);
}

/** The shards that hold a package's files, in the file's order. */
export function shardsOf(pkg: MutationPackage, shards: readonly Shard[] = readShards()): Shard[] {
  return shards.filter((shard) => shard.mutate[pkg] !== undefined);
}

/** A shard by name, or a message naming the shards there are. */
export function shardNamed(name: string, shards: readonly Shard[] = readShards()): Shard {
  const found = shards.find((shard) => shard.name === name);
  if (found === undefined) throw new Error(`stryker/shards.json has no shard "${name}": ${shards.map((shard) => shard.name).join(', ')}`);
  return found;
}

/**
 * Runs a shard's packages one after another, as its CI job does, each through Stryker by path in `root`; returns the
 * first failing exit status, or 0. `spawn` starts each run (a test passes a recorder, so no process starts).
 */
export function runShard(name: string, root: string = repositoryRoot, spawn?: Spawn): number {
  const shard = shardNamed(name);
  for (const pkg of packagesOf(shard)) {
    process.stdout.write(`stryker (${name}): ${pkg}\n`);
    const status = runStryker(['run', `stryker/${pkg}.config.mjs`], { ...process.env, [SHARD_VARIABLE]: name }, root, spawn);
    if (status !== 0) return status;
  }
  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const name = process.argv[2];
  if (name === undefined) {
    process.stderr.write('usage: pnpm -s exec tsx tools/stryker/shards.ts <shard>\n');
    process.exit(2);
  }
  process.exitCode = runShard(name);
}
