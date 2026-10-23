import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { type EnvironmentSettings, environmentSettings } from '../../infra/lib/environments';
import { repositoryRoot } from '../content-files';
import { HARNESS_CPUS, MIB, cpuLayout, cpuNeeds, databaseClass, harnessCpus, layoutProblems, layoutText, postgresLimit, productionLimits, requiredCpus, runnerTooSmall, screeningConsumer, storageBaseline, storageTypeOf, taskLimit } from './limits';
import { withoutConsumer } from './test-support/measurements';

/**
 * The capacity test's limits come from production's own settings (audit #53 part 1; PR 6b-3): the tasks, the screening
 * consumer among them, from environmentSettings('production'), the database class and storage type from the stack's
 * settings and construct, through tables that throw on what they do not know; the layout gives every service CPUs of its
 * own, as production has them (the founder's ruling of 2026-10-23 on the runner): Postgres the class's vCPUs, the
 * consumer its tasks', the web and the platform one each, and the harness with Chromium the last two, eight on GitHub's
 * 8-core runner.
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
    expect([limits.screening, limits.screeningTasks, limits.screeningConcurrency, limits.cpuNeeds.consumer]).toEqual([null, 0, 0, 0]);
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

describe('the layout on the runner (the founder’s ruling of 2026-10-23 on the runner: GitHub’s 8-core runner, each service on CPUs of its own)', () => {
  const limits = productionLimits();
  const layout = cpuLayout(limits.cpuNeeds);

  /** The CPUs a cpuset names ("2-3" is 2 and 3). */
  const cpus = (set: string): number[] => {
    const [first = '', last = first] = set.split('-');
    return Array.from({ length: Number(last) - Number(first) + 1 }, (_, index) => Number(first) + index);
  };

  it('gives Postgres db.t4g.medium’s 2 vCPU on CPUs 0-1, the consumer compute.screening’s 2 on 2-3, the web 4 and the platform 5 (each its quota within its own CPU) and the harness with Chromium 6-7', () => {
    expect(limits.cpuNeeds).toEqual({ postgres: 2, consumer: 2, web: 1, platform: 1, harness: HARNESS_CPUS });
    expect(HARNESS_CPUS).toBe(2);
    expect(layout).toEqual({ postgres: '0-1', consumer: '2-3', web: '4', platform: '5', harness: '6-7' });
    expect(requiredCpus(limits)).toBe(8);
    expect(postgresLimit(runner(8, 32_768), limits)).toEqual({ cpus: 2, memoryMiB: 4096, cpuset: '0-1' });
    // No two services share a CPU: the eight CPUs, each named once.
    const named = Object.values(layout).flatMap(cpus);
    expect(named.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(layoutProblems(layout)).toEqual([]);
    expect(layoutText(layout)).toBe('Postgres on CPUs 0-1, the screening consumer on 2-3, the web on 4, the platform on 5 and the harness with Chromium on 6-7');
    // A larger runner changes nothing: the spare CPUs stay idle, so every runner measures the same layout.
    expect(postgresLimit(runner(16, 65_536), limits)).toEqual({ cpus: 2, memoryMiB: 4096, cpuset: '0-1' });
  });

  it('pins the harness, its child processes and Chromium to CPUs of their own (6-7), never a service’s', () => {
    expect(harnessCpus(runner(8, 32_768), limits)).toBe('6-7');
    expect(harnessCpus(runner(16, 65_536), limits)).toBe('6-7');
    // A runner too small still starts the harness, on every CPU it has, which then reports it.
    expect(harnessCpus(runner(4, 16_384), limits)).toBe('0-3');
    expect(harnessCpus(runner(1, 16_384), limits)).toBe('0');
  });

  it('derives the layout from the sizes environments.ts declares, never typed numbers: a larger consumer moves every CPU after it', () => {
    const production = environmentSettings('production');
    const larger = { ...production, compute: { ...production.compute, screening: { ...production.compute.screening, cpu: 4096, memoryMiB: 8192 } } } as EnvironmentSettings;
    expect(cpuNeeds(larger)).toEqual({ postgres: 2, consumer: 4, web: 1, platform: 1, harness: 2 });
    expect(cpuLayout(cpuNeeds(larger))).toEqual({ postgres: '0-1', consumer: '2-5', web: '6', platform: '7', harness: '8-9' });
    expect(cpuNeeds(production)).toEqual(limits.cpuNeeds);
  });

  it('names every CPU two services share, as the free 4-CPU runner’s layout had them', () => {
    const shared = { postgres: '0-1', consumer: '2-3', web: '3', platform: '3', harness: '0-1' };
    expect(layoutProblems(shared)).toEqual(['Postgres and the harness share CPUs 0-1', 'the screening consumer, the web and the platform share CPU 3']);
    expect(layoutProblems({ ...layout, platform: '4' })).toEqual(['the web and the platform share CPU 4']);
    expect(layoutProblems({ ...layout, web: 'four' })).toEqual(['the web’s CPUs four are not a list of CPUs']);
  });

  it('takes Postgres’s memory from what the runner leaves after every task, the consumer’s 4 GiB included, and the reserve', () => {
    // 10,000 MiB less web, platform and the consumer (5,632 MiB) and the 2,560 MiB reserve.
    expect(postgresLimit(runner(8, 10_000), limits).memoryMiB).toBe(1808);
  });

  it('calls a runner too small with fewer CPUs than every service’s own, naming each service’s need, or one that leaves Postgres under 2 GiB', () => {
    expect(runnerTooSmall(runner(8, 32_768), limits)).toEqual([]);
    const needs = 'each service on CPUs of its own: 2 for Postgres (db.t4g.medium’s), 2 for the screening consumer (compute.screening’s), 1 for the web, 1 for the platform and 2 for the harness, its child processes and Chromium';
    // GitHub's free 4-CPU runner, where the services shared CPUs until the founder's ruling of 2026-10-23 on the runner.
    expect(runnerTooSmall(runner(4, 16_384), limits)).toEqual([`the runner has 4 CPUs; the test needs 8, ${needs}`]);
    // A private repository's standard runner, 2 vCPU and 7 GB.
    expect(runnerTooSmall(runner(2, 7_168), limits)).toEqual([`the runner has 2 CPUs; the test needs 8, ${needs}`, 'Postgres would have -1024 MiB; the test needs 2048 MiB']);
    expect(runnerTooSmall(runner(7, 32_768), limits)).toEqual([`the runner has 7 CPUs; the test needs 8, ${needs}`]);
    expect(runnerTooSmall(runner(8, 9_000), limits)).toEqual(['Postgres would have 808 MiB; the test needs 2048 MiB']);
  });
});
