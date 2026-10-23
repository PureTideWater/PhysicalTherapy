import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { type EnvironmentSettings, environmentSettings } from '../../infra/lib/environments';
import { repositoryRoot } from '../content-files';
import {
  HARNESS_CPUS,
  MIB,
  cpuLayout,
  cpuNeeds,
  cpuNeedsOf,
  databaseClass,
  harnessCpus,
  layoutShares,
  layoutText,
  ownLayout,
  ownLayoutCpus,
  postgresLimit,
  productionLimits,
  requiredCpus,
  runnerTooSmall,
  screeningConsumer,
  sharedLayout,
  storageBaseline,
  storageTypeOf,
  taskLimit,
} from './limits';
import { withoutConsumer } from './test-support/measurements';

/**
 * The capacity test's limits come from production's own settings (audit #53 part 1; PR 6b-3): the tasks, the screening
 * consumer among them, from environmentSettings('production'), the database class and storage type from the stack's
 * settings and construct, through tables that throw on what they do not know; the layout is the free 4-CPU runner's
 * (the founder's third ruling of 2026-10-23, "Free: time advisory"): Postgres the class's vCPUs, shared with the harness
 * and Chromium, the consumer its tasks', whose last the web and the platform share; a runner of eight CPUs or more gives
 * every service CPUs of its own, derived the same way.
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

describe('the layout on the runner (the founder’s third ruling of 2026-10-23, “Free: time advisory”: the free 4-CPU runner, its CPUs shared)', () => {
  const limits = productionLimits();

  it('on the free 4-CPU runner, as before the 8-core ruling: Postgres, the harness and Chromium on 0-1, the consumer on 2-3, the web and the platform on 3, the consumer’s last', () => {
    expect(limits.cpuNeeds).toEqual({ postgres: 2, consumer: 2, web: 1, platform: 1, harness: HARNESS_CPUS });
    expect(HARNESS_CPUS).toBe(2);
    const layout = cpuLayout(limits.cpuNeeds, 4);
    expect(layout).toEqual({ kind: 'shared', postgres: '0-1', consumer: '2-3', web: '3', platform: '3', harness: '0-1' });
    expect(sharedLayout(limits.cpuNeeds)).toEqual(layout);
    expect(postgresLimit(runner(4, 16_000), limits)).toEqual({ cpus: 2, memoryMiB: 4096, cpuset: '0-1' });
    expect(harnessCpus(runner(4, 16_000), limits)).toBe('0-1');
    // What that layout needs is what the runner must have: the class's vCPUs and the consumer's.
    expect(requiredCpus(limits)).toBe(4);
    expect(runnerTooSmall(runner(4, 16_000), limits)).toEqual([]);
    expect(layoutShares(layout)).toEqual(['Postgres and the harness share CPUs 0-1', 'the screening consumer, the web and the platform share CPU 3']);
    expect(layoutText(layout)).toBe(
      'shared CPUs: Postgres on CPUs 0-1, the screening consumer on 2-3, the web on 3, the platform on 3 and the harness with Chromium on 0-1 (Postgres and the harness share CPUs 0-1; the screening consumer, the web and the platform share CPU 3)',
    );
  });

  it('on a runner of 8 CPUs or more, each service on CPUs of its own, derived the same way: Postgres 0-1, the consumer 2-3, the web 4, the platform 5, the harness 6-7', () => {
    const own = cpuLayout(limits.cpuNeeds, 8);
    expect(own).toEqual({ kind: 'own', postgres: '0-1', consumer: '2-3', web: '4', platform: '5', harness: '6-7' });
    expect(ownLayout(limits.cpuNeeds)).toEqual(own);
    expect(ownLayoutCpus(limits.cpuNeeds)).toBe(8);
    expect(layoutShares(own)).toEqual([]);
    expect(layoutText(own)).toBe('CPUs of their own: Postgres on CPUs 0-1, the screening consumer on 2-3, the web on 4, the platform on 5 and the harness with Chromium on 6-7');
    expect(harnessCpus(runner(8, 32_768), limits)).toBe('6-7');
    // A larger runner changes nothing: the spare CPUs stay idle.
    expect(cpuLayout(limits.cpuNeeds, 16)).toEqual(own);
    expect(harnessCpus(runner(16, 65_536), limits)).toBe('6-7');
    expect(postgresLimit(runner(16, 65_536), limits)).toEqual({ cpus: 2, memoryMiB: 4096, cpuset: '0-1' });
    // Between four and eight, the free runner's layout.
    expect(cpuLayout(limits.cpuNeeds, 7)).toEqual(sharedLayout(limits.cpuNeeds));
  });

  it('derives both layouts from the sizes environments.ts declares, never typed numbers: a larger consumer moves every CPU after it', () => {
    const production = environmentSettings('production');
    const larger = { ...production, compute: { ...production.compute, screening: { ...production.compute.screening, cpu: 4096, memoryMiB: 8192 } } } as EnvironmentSettings;
    expect(cpuNeeds(larger)).toEqual({ postgres: 2, consumer: 4, web: 1, platform: 1, harness: 2 });
    expect(sharedLayout(cpuNeeds(larger))).toEqual({ kind: 'shared', postgres: '0-1', consumer: '2-5', web: '5', platform: '5', harness: '0-1' });
    expect(ownLayout(cpuNeeds(larger))).toEqual({ kind: 'own', postgres: '0-1', consumer: '2-5', web: '6', platform: '7', harness: '8-9' });
    expect(cpuNeeds(production)).toEqual(limits.cpuNeeds);
    // The needs read back from a report's own limits are the settings' (the verdict lays the runner out again from them).
    expect(cpuNeedsOf({ databaseVcpus: 2, web: limits.web, platform: limits.platform, screening: limits.screening, screeningTasks: limits.screeningTasks })).toEqual(limits.cpuNeeds);
  });

  it('names every CPU two services share, and a cpuset that is not a list of CPUs', () => {
    expect(layoutShares({ ...ownLayout(limits.cpuNeeds), platform: '4' })).toEqual(['the web and the platform share CPU 4']);
    expect(layoutShares({ ...ownLayout(limits.cpuNeeds), web: 'four' })).toEqual(['the web’s CPUs four are not a list of CPUs']);
  });

  it('takes Postgres’s memory from what the runner leaves after every task, the consumer’s 4 GiB included, and the reserve', () => {
    // 10,000 MiB less web, platform and the consumer (5,632 MiB) and the 2,560 MiB reserve.
    expect(postgresLimit(runner(4, 10_000), limits).memoryMiB).toBe(1808);
  });

  it('calls a runner too small with fewer CPUs than the free runner’s layout needs, naming each need, or one that leaves Postgres under 2 GiB', () => {
    const needs = '2 for Postgres (db.t4g.medium’s), which the harness and Chromium share, and 2 for the screening consumer (compute.screening’s), whose last the web and the platform share';
    // A private repository's standard runner, 2 vCPU and 7 GB.
    expect(runnerTooSmall(runner(2, 7_168), limits)).toEqual([`the runner has 2 CPUs; the test needs 4: ${needs}`, 'Postgres would have -1024 MiB; the test needs 2048 MiB']);
    // Three CPUs would leave Postgres one, which lands at the line (the design's run 9).
    expect(runnerTooSmall(runner(3, 16_000), limits)).toEqual([`the runner has 3 CPUs; the test needs 4: ${needs}`]);
    expect(runnerTooSmall(runner(4, 9_000), limits)).toEqual(['Postgres would have 808 MiB; the test needs 2048 MiB']);
    // The workflow still starts the harness on a runner too small, on every CPU it has, which then reports it.
    expect(harnessCpus(runner(3, 16_000), limits)).toBe('0-2');
    expect(harnessCpus(runner(1, 16_000), limits)).toBe('0');
  });
});
