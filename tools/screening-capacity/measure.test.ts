import { describe, expect, it } from 'vitest';

import { SCREENING_MAIN_HEAP_FLAG } from '../../apps/worker/src/screening/threads';
import { COMMANDS } from '../../infra/lib/constructs/compute';
import { MIB, MIN_ROUND_TRIP_MS, NETWORK_DELAY_MS, postgresLimit, productionLimits } from './limits';
import { anonBytes, cpuThrottling, emailedLines, ioMax, median, memoryEvents, phaseLines, phasesByRun, pricedRuns, psqlTimings, workerStarted } from './measure';
import {
  CommandError,
  ROUND_TRIP_SCRIPT,
  SERVICE_COMMANDS,
  delayedRoundTripMs,
  dockerRunArgs,
  interfaceByIndex,
  isScreeningService,
  masked,
  netemCommands,
  peerIndex,
  postgresRunArgs,
  processShellCommand,
  screeningServices,
  serviceCommand,
  stderrTail,
} from './containers';

/**
 * The capacity test's readers (audit #53 part 1): cgroup files of both versions, the consumer's phase and time-to-email
 * lines, psql's timings and io.max; the Docker arguments and the process runtime's command that apply production's
 * limits, the consumer's included (PR 6b-3). Synthetic inputs only.
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

describe('the consumer’s log', () => {
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

  it('reads the time-to-email lines with their tier, and the runs a log shows priced (the platform’s must show none)', () => {
    const lines = [
      JSON.stringify({ job_id: 'j', screening_run_id: 'r-1', elapsed_ms: 31_234, time: '2026-10-22T12:00:31.300Z', level: 'info', msg: 'screening result emailed' }),
      JSON.stringify({ job_id: 'j', screening_run_id: 'r-2', elapsed_ms: 95_000, error_code: 'SCREENING_ACCOUNT_SHARE', time: '2026-10-22T12:01:35.000Z', level: 'info', msg: 'screening result emailed after waiting' }),
      JSON.stringify({ job_id: 'j', screening_run_id: 'r-3', elapsed_ms: 'soon', time: '2026-10-22T12:01:35.000Z', level: 'info', msg: 'screening result emailed' }),
      JSON.stringify({ job_id: 'j', record_count: 0, elapsed_ms: 0, time: '2026-10-22T12:02:00.000Z', level: 'info', msg: 'screening queue' }),
      JSON.stringify({ job_id: 'j', screening_run_id: 'r-4', elapsed_ms: 900, record_count: 2000, time: '2026-10-22T12:00:00.000Z', level: 'info', msg: 'screening release shared types read' }),
    ];
    expect(emailedLines(lines)).toEqual([
      { runId: 'r-1', elapsedMs: 31_234, tier: 'normal', at: '2026-10-22T12:00:31.300Z' },
      { runId: 'r-2', elapsedMs: 95_000, tier: 'waiting', at: '2026-10-22T12:01:35.000Z' },
    ]);
    expect([...pricedRuns(lines)].sort()).toEqual(['r-1', 'r-2', 'r-4']);
    expect(pricedRuns([JSON.stringify({ msg: 'worker started', time: '2026-10-22T12:00:00.000Z' }), JSON.stringify({ msg: 'screening expiry', job_id: 'j', record_count: 0, time: '2026-10-22T12:00:00.000Z' })]).size).toBe(0);
  });
});

describe('the services’ commands', () => {
  it('are production’s task definitions’ own, the consumer’s with the main thread’s 512 MiB heap', () => {
    expect(SERVICE_COMMANDS.web).toEqual(COMMANDS.web);
    expect(SERVICE_COMMANDS.platform).toEqual(COMMANDS.worker);
    // The consumer's container command (infra/lib/constructs/compute.ts, PR 6b-3): #31's explicit heap limit.
    expect(SERVICE_COMMANDS.screening).toEqual((COMMANDS as Readonly<Record<string, readonly string[]>>).screening);
    expect(SERVICE_COMMANDS.screening).toContain(SCREENING_MAIN_HEAP_FLAG);
    expect(SCREENING_MAIN_HEAP_FLAG).toBe('--max-old-space-size=512');
    expect(screeningServices(1)).toEqual(['screening-1']);
    expect(screeningServices(2)).toEqual(['screening-1', 'screening-2']);
    expect([isScreeningService('screening-1'), isScreeningService('screening-0'), isScreeningService('platform')]).toEqual([true, false, false]);
    expect(serviceCommand('screening-1')).toEqual(SERVICE_COMMANDS.screening);
    expect(serviceCommand('platform')).toEqual(SERVICE_COMMANDS.platform);
  });

  it('exec each process under taskset with its whole cpuset, after joining its cgroups (the cgroup-v1 affinity fix)', () => {
    const dirs = ['/sys/fs/cgroup/cpu/tp-capacity-screening-1', '/sys/fs/cgroup/cpuset/tp-capacity-screening-1', '/sys/fs/cgroup/memory/tp-capacity-screening-1'];
    expect(processShellCommand(dirs, '2-3', SERVICE_COMMANDS.screening)).toBe(
      'echo $$ > /sys/fs/cgroup/cpu/tp-capacity-screening-1/cgroup.procs && echo $$ > /sys/fs/cgroup/cpuset/tp-capacity-screening-1/cgroup.procs && echo $$ > /sys/fs/cgroup/memory/tp-capacity-screening-1/cgroup.procs && exec taskset -c 2-3 node --enable-source-maps --max-old-space-size=512 dist/main.js',
    );
    expect(processShellCommand(['/sys/fs/cgroup/tp-capacity-web'], '3', SERVICE_COMMANDS.web)).toBe('echo $$ > /sys/fs/cgroup/tp-capacity-web/cgroup.procs && exec taskset -c 3 node apps/web/server.js');
    expect(() => processShellCommand([], '2-3; rm -rf /', SERVICE_COMMANDS.web)).toThrow(RangeError);
  });
});

describe('Docker’s arguments', () => {
  const limits = productionLimits();
  const postgres = postgresLimit({ cpus: 4, memoryMiB: 16_000, cpuModel: '', kernel: '' }, limits);

  it('give web and platform a quarter CPU on the consumer’s last CPU and 512 MiB with no swap, never restarted', () => {
    const args = dockerRunArgs(
      { name: 'platform', env: { NODE_ENV: 'test' }, limit: limits.platform, cpuset: postgres.taskCpuset, command: SERVICE_COMMANDS.platform },
      { image: 'tp-worker:capacity', network: 'tp-capacity', dataHost: '/tmp/data', dataService: '/data', user: '1001:1001' },
    );
    expect(args).toEqual(expect.arrayContaining(['--cpus=0.25', '--cpuset-cpus=3', '--memory=512m', '--memory-swap=512m', '--restart=no', '-e', 'NODE_ENV=test']));
    expect(args.slice(-4)).toEqual(['tp-worker:capacity', 'node', '--enable-source-maps', 'dist/main.js']);
    expect(args.slice(args.indexOf('--user'), args.indexOf('--user') + 2)).toEqual(['--user', '1001:1001']);
  });

  it('give the consumer its 2 vCPU on CPUs 2-3 and 4 GiB with no swap, running the worker image with its heap limit', () => {
    const screening = limits.screening;
    expect(screening).not.toBeNull();
    const args = dockerRunArgs(
      { name: 'screening-1', env: { WORKER_JOBS: 'screening' }, limit: screening ?? { cpus: 0, memoryMiB: 0 }, cpuset: postgres.consumerCpuset, command: SERVICE_COMMANDS.screening },
      { image: 'tp-worker:capacity', network: 'tp-capacity', dataHost: '/tmp/data', dataService: '/data' },
    );
    expect(args.slice(0, 7)).toEqual(['run', '-d', '--name', 'tp-capacity-screening-1', '--network', 'tp-capacity', '--network-alias']);
    expect(args).toEqual(expect.arrayContaining(['--cpus=2', '--cpuset-cpus=2-3', '--memory=4096m', '--memory-swap=4096m', '--restart=no', '-e', 'WORKER_JOBS=screening']));
    expect(args.slice(-5)).toEqual(['tp-worker:capacity', 'node', '--enable-source-maps', '--max-old-space-size=512', 'dist/main.js']);
  });

  it('give Postgres its CPUs, memory with no swap and gp3’s baseline on the data root’s device', () => {
    const args = postgresRunArgs(postgres, { iops: 3000, bytesPerSecond: 125 * MIB }, { network: 'tp-capacity', device: '/dev/sda', port: 55_432 });
    expect(args).toEqual(
      expect.arrayContaining([
        '--cpus=2',
        '--cpuset-cpus=0-1',
        '--memory=4096m',
        '--memory-swap=4096m',
        '--device-read-iops=/dev/sda:3000',
        '--device-write-iops=/dev/sda:3000',
        `--device-read-bps=/dev/sda:${String(125 * MIB)}`,
        `--device-write-bps=/dev/sda:${String(125 * MIB)}`,
        // RDS has no 64 MiB cap on parallel queries' shared memory, so neither does the harness's Postgres.
        '--shm-size=1g',
        'postgres:18',
      ]),
    );
  });

  it('delay both directions of Postgres’s link, so the delays add up to the round trip the verdict asks for', () => {
    const commands = netemCommands(NETWORK_DELAY_MS, '4242', 'veth3a1b2c4');
    expect(commands).toEqual([
      ['sudo', 'nsenter', '-t', '4242', '-n', 'tc', 'qdisc', 'replace', 'dev', 'eth0', 'root', 'netem', 'delay', '1ms'],
      ['sudo', 'tc', 'qdisc', 'replace', 'dev', 'veth3a1b2c4', 'root', 'netem', 'delay', '1ms'],
    ]);
    expect(delayedRoundTripMs(NETWORK_DELAY_MS)).toBe(MIN_ROUND_TRIP_MS);
    // The host's end of the link, from the container's eth0 and the host's links.
    expect(peerIndex('12: eth0@if13: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP mode DEFAULT')).toBe(13);
    expect(peerIndex('1: lo: <LOOPBACK,UP>')).toBeNull();
    const links = ['1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536', '4: docker0: <BROADCAST,MULTICAST,UP> mtu 1500', '13: veth3a1b2c4@if12: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 master br-1'].join('\n');
    expect(interfaceByIndex(links, 13)).toBe('veth3a1b2c4');
    expect(interfaceByIndex(links, 14)).toBeNull();
  });
});

describe('a failed command', () => {
  it('keeps the last lines of its stderr, bounded, with credentials and result tokens masked', () => {
    const stderr = ['node:internal/modules/run_main:123', '    at async main', 'db:migrate: connect ECONNREFUSED 172.18.0.2:5432 (postgres://postgres:test@db:5432/tp_capacity)', ''].join('\n');
    const error = new CommandError('the migration task (dist/migrate.js)', stderr);
    expect(error.message).toBe('the migration task (dist/migrate.js) failed: node:internal/modules/run_main:123 | at async main | db:migrate: connect ECONNREFUSED 172.18.0.2:5432 (postgres://***@db:5432/tp_capacity)');
    expect(stderrTail('x'.repeat(1_000)).length).toBe(400);
    expect(stderrTail('')).toBe('no stderr');
    expect(masked('GET /screening/results/abcdefghijklmnopqrstuvwxyzabcdef 200')).toBe('GET /screening/results/<token> 200');
  });
});
