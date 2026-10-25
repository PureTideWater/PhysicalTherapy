import { describe, expect, it } from 'vitest';

import { MUTATE, MUTATION_PACKAGES, PACKAGE_VARIABLE, SHARD_VARIABLE, packageOptions, readShards } from '../../stryker/base.mjs';
import { selectFiles, shardsFor, trackedFiles } from './affected';
import { packagesOf, shardNamed, shardsOf } from './shards';

/**
 * The mutation workflow's shards (stryker/shards.json; docs/adr/0066, Part 4): every file a package's configuration
 * mutates is in exactly one of that package's shards, every shard file is one it mutates, and every package has its
 * shards listed, so a package's shards, run all together, run every one of its mutants once.
 */
describe('the shard partition', () => {
  const shards = readShards();
  const files = trackedFiles();

  it('lists each package’s shards', () => {
    for (const pkg of MUTATION_PACKAGES) expect(shardsOf(pkg).length, pkg).toBeGreaterThan(0);
    expect(shards.map((shard) => shard.name)).toEqual(['money-ledger', 'packets-scan', 'packets-rest', 'pricing-engine', 'pricing-recompute', 'pricing-rest']);
    expect(new Set(shards.map((shard) => shard.name)).size).toBe(shards.length);
    for (const shard of shards) {
      expect(shard.name, 'a job, artifact and directory name').toMatch(/^[a-z]+(?:-[a-z]+)*$/);
      expect(packagesOf(shard).length, shard.name).toBeGreaterThan(0);
      for (const pkg of Object.keys(shard.mutate)) expect(MUTATION_PACKAGES, `${shard.name}: ${pkg}`).toContain(pkg);
    }
  });

  it('puts every file each package mutates in exactly one of its shards, and nothing else', () => {
    for (const pkg of MUTATION_PACKAGES) {
      const mutated = selectFiles(files, MUTATE[pkg]).sort();
      const sharded = shardsOf(pkg).flatMap((shard) => [...(shard.mutate[pkg] ?? [])]);
      expect(mutated.length, pkg).toBeGreaterThan(0);
      expect([...sharded].sort(), pkg).toEqual(mutated);
      expect(new Set(sharded).size, `${pkg}: a file in two shards`).toBe(sharded.length);
    }
  });

  it('is what the workflow’s matrix runs when every package is affected, and what each shard’s configuration mutates', () => {
    expect(shardsFor([...MUTATION_PACKAGES])).toEqual(shards.map((shard) => shard.name));
    const before = [process.env[SHARD_VARIABLE], process.env[PACKAGE_VARIABLE]] as const;
    try {
      for (const shard of shards) {
        process.env[SHARD_VARIABLE] = shard.name;
        for (const pkg of packagesOf(shard)) {
          const options = packageOptions(pkg);
          expect(options.mutate, `${shard.name} ${pkg}`).toEqual(shard.mutate[pkg]);
          expect(options.jsonReporter?.fileName).toBe(`reports/mutation/${shard.name}/${pkg}.json`);
        }
        const outside = MUTATION_PACKAGES.find((pkg) => shard.mutate[pkg] === undefined);
        if (outside !== undefined) expect(() => packageOptions(outside)).toThrow(`${SHARD_VARIABLE}=${shard.name}: that shard mutates no file of ${outside}`);
      }
      process.env[SHARD_VARIABLE] = 'nowhere';
      expect(() => packageOptions('money')).toThrow(`${SHARD_VARIABLE}=nowhere: stryker/shards.json has no shard of that name`);
    } finally {
      for (const [name, value] of [[SHARD_VARIABLE, before[0]], [PACKAGE_VARIABLE, before[1]]] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it('names a shard’s packages and finds a shard by name', () => {
    expect(packagesOf(shardNamed('money-ledger'))).toEqual(['money', 'ledger']);
    expect(shardsOf('pricing').map((shard) => shard.name)).toEqual(['pricing-engine', 'pricing-recompute', 'pricing-rest']);
    expect(() => shardNamed('nowhere')).toThrow('stryker/shards.json has no shard "nowhere": money-ledger, packets-scan, packets-rest, pricing-engine, pricing-recompute, pricing-rest');
  });
});
