import { describe, expect, it } from 'vitest';

import { MIB, postgresLimit, productionLimits } from './limits';
import { anonBytes, cpuThrottling, ioMax, median, memoryEvents, phaseLines, phasesByRun, psqlTimings, workerStarted } from './measure';
import { ROUND_TRIP_SCRIPT, dockerRunArgs, postgresRunArgs } from './containers';

/**
 * The capacity test's readers (audit #53 part 1): cgroup files of both versions, the platform's phase lines, psql's
 * timings and io.max; and the Docker arguments that apply production's limits. Synthetic inputs only.
 */

describe('cgroup readers', () => {
  it('read anonymous memory, events and throttling from v2 files', () => {
    expect(anonBytes('anon 123456\nfile 999\n', 2)).toBe(123_456);
    expect(memoryEvents('low 0\nhigh 0\nmax 4\noom 1\noom_kill 1\n', 2)).toEqual({ max: 4, oomKill: 1 });
    expect(cpuThrottling('usage_usec 10\nnr_periods 200\nnr_throttled 50\nthrottled_usec 7000\n', 2)).toEqual({ periods: 200, throttledPeriods: 50, throttledUs: 7000 });
    expect(() => anonBytes('file 1\n', 2)).toThrow(RangeError);
  });

  it('read the same from v1 files (a local machine)', () => {
    expect(anonBytes('cache 5\nrss 100\ntotal_rss 300\n', 1)).toBe(300);
    expect(memoryEvents('oom_kill_disable 0\nunder_oom 0\noom_kill 2\n', 1, '7\n')).toEqual({ max: 7, oomKill: 2 });
    expect(cpuThrottling('nr_periods 10\nnr_throttled 3\nthrottled_time 5000000\n', 1)).toEqual({ periods: 10, throttledPeriods: 3, throttledUs: 5000 });
  });

  it('read io.max and psql’s timings', () => {
    expect(ioMax('8:0 rbps=131072000 wbps=131072000 riops=3000 wiops=3000\n')).toEqual([{ device: '8:0', rbps: 131_072_000, wbps: 131_072_000, riops: 3000, wiops: 3000 }]);
    expect(ioMax('8:0 rbps=max wbps=max riops=3000 wiops=max')[0]).toMatchObject({ rbps: null, riops: 3000 });
    expect(psqlTimings('Timing is on.\n?column?\nTime: 2.104 ms\nTime: 2.500 ms\n')).toEqual([2.104, 2.5]);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(ROUND_TRIP_SCRIPT.split('\n').filter((line) => line === 'SELECT 1;')).toHaveLength(50);
  });
});

describe('the platform’s log', () => {
  it('reads the job’s phase lines by run, numbers only, and the worker’s start line', () => {
    const lines = [
      'not json',
      JSON.stringify({ job_id: 'j', screening_run_id: 'r-1', elapsed_ms: 900, record_count: 2000, time: '2026-10-20T12:00:00.000Z', level: 'info', msg: 'screening release shared types read' }),
      JSON.stringify({ job_id: 'j', screening_run_id: 'r-1', elapsed_ms: 4000, record_count: 150000, time: '2026-10-20T12:00:04.000Z', level: 'info', msg: 'screening release keyed records read' }),
      JSON.stringify({ job_id: 'j', screening_run_id: 'r-1', elapsed_ms: 20000, record_count: 50000, time: '2026-10-20T12:00:24.000Z', level: 'info', msg: 'screening run rows priced' }),
      JSON.stringify({ job_id: 'j', screening_run_id: 'r-2', elapsed_ms: 0, record_count: 2000, time: '2026-10-20T12:00:30.000Z', level: 'info', msg: 'screening release shared types held from an earlier run' }),
      JSON.stringify({ level: 'info', msg: 'worker started', time: '2026-10-20T11:59:00.000Z' }),
    ];
    const parsed = phaseLines(lines);
    expect(parsed.map((line) => [line.runId, line.phase, line.elapsedMs, line.recordCount])).toEqual([
      ['r-1', 'shared_load', 900, 2000],
      ['r-1', 'keyed_read', 4000, 150000],
      ['r-1', 'pricing', 20000, 50000],
      ['r-2', 'shared_held', 0, 2000],
    ]);
    expect(phasesByRun(parsed).get('r-1')).toEqual({ shared_load: { elapsedMs: 900, recordCount: 2000 }, keyed_read: { elapsedMs: 4000, recordCount: 150000 }, pricing: { elapsedMs: 20000, recordCount: 50000 } });
    expect(workerStarted(lines)).toBe(true);
    expect(workerStarted(lines.slice(0, 3))).toBe(false);
  });
});

describe('Docker’s arguments', () => {
  const limits = productionLimits();
  const postgres = postgresLimit({ cpus: 4, memoryMiB: 16_000, cpuModel: '', kernel: '' }, limits);

  it('give web and platform a quarter CPU on the last CPU and 512 MiB with no swap, never restarted', () => {
    const args = dockerRunArgs({ name: 'platform', env: { NODE_ENV: 'test' }, limit: limits.platform, cpuset: postgres.taskCpuset }, { image: 'tp-worker:capacity', network: 'tp-capacity', dataHost: '/tmp/data', dataService: '/data', user: '1001:1001' });
    expect(args).toEqual(expect.arrayContaining(['--cpus=0.25', '--cpuset-cpus=3', '--memory=512m', '--memory-swap=512m', '--restart=no', '-e', 'NODE_ENV=test']));
    expect(args.at(-1)).toBe('tp-worker:capacity');
    expect(args.slice(args.indexOf('--user'), args.indexOf('--user') + 2)).toEqual(['--user', '1001:1001']);
  });

  it('give Postgres its CPUs, memory with no swap and gp3’s baseline on the data root’s device', () => {
    const args = postgresRunArgs(postgres, { iops: 3000, bytesPerSecond: 125 * MIB }, { network: 'tp-capacity', device: '/dev/sda', port: 55_432 });
    expect(args).toEqual(
      expect.arrayContaining([
        '--cpus=2',
        '--cpuset-cpus=0-2',
        '--memory=4096m',
        '--memory-swap=4096m',
        '--device-read-iops=/dev/sda:3000',
        '--device-write-iops=/dev/sda:3000',
        `--device-read-bps=/dev/sda:${String(125 * MIB)}`,
        `--device-write-bps=/dev/sda:${String(125 * MIB)}`,
        'postgres:18',
      ]),
    );
  });
});
