import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { environmentSettings } from '../../infra/lib/environments';
import { repositoryRoot } from '../content-files';
import { MIB, consumerCpus, databaseClass, harnessCpus, postgresLimit, productionLimits, requiredCpus, runnerTooSmall, screeningConsumer, storageBaseline, storageTypeOf, taskLimit } from './limits';
import { withoutConsumer } from './test-support/measurements';

/**
 * The capacity test's limits come from production's own settings (audit #53 part 1; PR 6b-3): the tasks, the screening
 * consumer among them, from environmentSettings('production'), the database class and storage type from the stack's
 * settings and construct, through tables that throw on what they do not know; the layout puts Postgres on the class's
 * vCPUs, the consumer on the next CPUs and web and platform on the consumer's last.
 */

const runner = (cpus: number, memoryMiB: number) => ({ cpus, memoryMiB, cpuModel: '', kernel: '' });

describe('production’s limits', () => {
  it('are half a vCPU and 1,024 MiB for web (the founder’s ruling of 2026-10-22, O9) and a quarter vCPU and 512 MiB for platform, read from environments.ts', () => {
    const settings = environmentSettings('production');
    expect([settings.compute.web.cpu, settings.compute.web.memoryMiB, settings.compute.platform.cpu, settings.compute.platform.memoryMiB]).toEqual([512, 1024, 256, 512]);
    const limits = productionLimits();
    // The very declaration the stacks deploy, never a copy: the harness measures the web at production's size.
    expect(limits.web).toEqual(taskLimit(settings.compute.web));
    expect(limits.web).toEqual({ cpus: 0.5, memoryMiB: 1024 });
    // The platform no longer prices a screening and keeps its own size.
    expect(limits.platform).toEqual({ cpus: 0.25, memoryMiB: 512 });
    expect(taskLimit({ cpu: 1024, memoryMiB: 2048 })).toEqual({ cpus: 1, memoryMiB: 2048 });
  });

  it('declare the screening consumer as the founder chose it: one task of 2 vCPU and 4 GiB pricing three at once (Q1 (a))', () => {
    const settings = environmentSettings('production');
    expect(screeningConsumer(settings)).toMatchObject({ cpu: 2048, memoryMiB: 4096, desiredCount: 1, concurrency: 3 });
    const limits = productionLimits();
    expect(limits.screeningConsumer).not.toBeNull();
    expect(limits.screening).toEqual({ cpus: 2, memoryMiB: 4096 });
    expect([limits.screeningTasks, limits.screeningConcurrency]).toEqual([1, 3]);
    // Staging measures production's task (decision 15): the same size there.
    expect(screeningConsumer(environmentSettings('staging'))).toMatchObject({ cpu: 2048, memoryMiB: 4096, desiredCount: 1, concurrency: 3 });
  });

  it('read no consumer from settings that declare none, and give it no limits', () => {
    const without = withoutConsumer();
    expect(screeningConsumer(without)).toBeNull();
    const limits = productionLimits(without);
    expect([limits.screening, limits.screeningTasks, limits.screeningConcurrency, consumerCpus(limits)]).toEqual([null, 0, 0, 0]);
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

describe('the layout on the runner', () => {
  const limits = productionLimits();

  it('gives Postgres the class’s 2 vCPU and 4 GiB on CPUs 0-1, the consumer 2-3, and web and platform 3 (a 4-CPU runner)', () => {
    expect(postgresLimit(runner(4, 16_000), limits)).toEqual({ cpus: 2, memoryMiB: 4096, cpuset: '0-1', consumerCpuset: '2-3', taskCpuset: '3' });
    // The harness and Chromium share Postgres's CPUs, never the tasks'.
    expect(harnessCpus(runner(4, 16_000), limits)).toBe('0-1');
    // A larger runner changes nothing: the spare CPUs stay idle, so every runner measures the same layout.
    expect(postgresLimit(runner(8, 32_000), limits)).toEqual({ cpus: 2, memoryMiB: 4096, cpuset: '0-1', consumerCpuset: '2-3', taskCpuset: '3' });
    expect([consumerCpus(limits), requiredCpus(limits)]).toEqual([2, 4]);
  });

  it('takes Postgres’s memory from what the runner leaves after every task, the consumer’s 4 GiB included, and the reserve', () => {
    // 10,000 MiB less web, platform and the consumer (5,632 MiB) and the 2,560 MiB reserve.
    expect(postgresLimit(runner(4, 10_000), limits).memoryMiB).toBe(1808);
  });

  it('calls a runner too small with fewer CPUs than the class’s and the consumer’s, or one that leaves Postgres under 2 GiB', () => {
    expect(runnerTooSmall(runner(4, 16_000), limits)).toEqual([]);
    // A private repository's standard runner, 2 vCPU and 7 GB, until the founder sets the 4-core larger runner (Q1 (d)).
    expect(runnerTooSmall(runner(2, 7_168), limits)).toEqual([
      'the runner has 2 CPUs; the test needs 4 (2 for Postgres, db.t4g.medium’s, and 2 for the screening consumer)',
      'Postgres would have -1024 MiB; the test needs 2048 MiB',
    ]);
    // Three CPUs would leave Postgres one, which lands at the line (the design's run 9).
    expect(runnerTooSmall(runner(3, 16_000), limits)).toEqual(['the runner has 3 CPUs; the test needs 4 (2 for Postgres, db.t4g.medium’s, and 2 for the screening consumer)']);
    expect(runnerTooSmall(runner(4, 9_000), limits)).toEqual(['Postgres would have 808 MiB; the test needs 2048 MiB']);
    // The workflow still starts the harness on a runner too small, which then reports it.
    expect(harnessCpus(runner(1, 16_000), limits)).toBe('0');
  });
});
