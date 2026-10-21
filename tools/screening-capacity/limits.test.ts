import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { environmentSettings } from '../../infra/lib/environments';
import { repositoryRoot } from '../content-files';
import { MIB, databaseClass, postgresLimit, productionLimits, runnerTooSmall, storageBaseline, storageTypeOf, taskLimit } from './limits';

/**
 * The capacity test's limits come from production's own settings (audit #53 part 1): the tasks from
 * environmentSettings('production'), the database class and storage type from the stack's settings and construct,
 * through tables that throw on what they do not know; Postgres takes what the runner leaves.
 */

describe('production’s limits', () => {
  it('are a quarter vCPU and 512 MiB for web and platform, from environments.ts', () => {
    const settings = environmentSettings('production');
    expect([settings.compute.web.cpu, settings.compute.web.memoryMiB, settings.compute.platform.cpu, settings.compute.platform.memoryMiB]).toEqual([256, 512, 256, 512]);
    const limits = productionLimits();
    expect(limits.web).toEqual({ cpus: 0.25, memoryMiB: 512 });
    expect(limits.platform).toEqual({ cpus: 0.25, memoryMiB: 512 });
    expect(limits.screeningConsumer).toBeNull();
    expect(taskLimit({ cpu: 1024, memoryMiB: 2048 })).toEqual({ cpus: 1, memoryMiB: 2048 });
  });

  it('are db.t4g.medium (2 vCPU, 4 GiB) on gp3 (3,000 IOPS, 125 MiB/s), from the stack’s settings and construct', () => {
    const limits = productionLimits();
    expect(limits.database).toEqual({ instanceType: 't4g.medium', vcpus: 2, memoryMiB: 4096, storageType: 'gp3', iops: 3000, bytesPerSecond: 125 * MIB });
    expect(storageTypeOf(readFileSync(path.join(repositoryRoot, 'infra/lib/constructs/database.ts'), 'utf8'))).toBe('gp3');
  });

  it('throw on a class or storage type the tables do not know, and on a construct naming none or two', () => {
    expect(() => databaseClass('r6g.large')).toThrow(RangeError);
    expect(() => storageBaseline('io2')).toThrow(RangeError);
    expect(() => storageTypeOf('allocatedStorage: 20,')).toThrow(RangeError);
    expect(() => storageTypeOf('storageType: rds.StorageType.GP3, storageType: rds.StorageType.IO2')).toThrow(RangeError);
  });
});

describe('Postgres on the runner', () => {
  const limits = productionLimits();

  it('takes min(2, CPUs less one) CPUs and min(4 GiB, the runner less the tasks and 2.5 GiB) of memory', () => {
    expect(postgresLimit({ cpus: 4, memoryMiB: 16_000, cpuModel: '', kernel: '' }, limits)).toEqual({ cpus: 2, memoryMiB: 4096, cpuset: '0-2', taskCpuset: '3' });
    // A private repository's standard runner: 2 vCPU and 7 GB give Postgres 1 CPU and about 3.5 GiB.
    expect(postgresLimit({ cpus: 2, memoryMiB: 7_168, cpuModel: '', kernel: '' }, limits)).toEqual({ cpus: 1, memoryMiB: 3584, cpuset: '0', taskCpuset: '1' });
  });

  it('calls a runner of one CPU, or one that leaves Postgres under 2 GiB, too small', () => {
    expect(runnerTooSmall({ cpus: 4, memoryMiB: 16_000, cpuModel: '', kernel: '' }, limits)).toEqual([]);
    expect(runnerTooSmall({ cpus: 1, memoryMiB: 16_000, cpuModel: '', kernel: '' }, limits)).toEqual(['the runner has 1 CPU; the test needs 2']);
    expect(runnerTooSmall({ cpus: 2, memoryMiB: 5_000, cpuModel: '', kernel: '' }, limits)).toEqual(['Postgres would have 1416 MiB; the test needs 2048 MiB']);
  });
});
