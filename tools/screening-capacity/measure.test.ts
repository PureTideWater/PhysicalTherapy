import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SCREENING_MAIN_HEAP_FLAG } from '../../apps/worker/src/screening/threads';
import { COMMANDS } from '../../infra/lib/constructs/compute';
import { MIB, MIN_ROUND_TRIP_MS, NETWORK_DELAY_MS, cpuLayout, postgresLimit, productionLimits } from './limits';
import {
  ADDRESS_CHECKED_MESSAGE,
  addressCheckTimes,
  anonBytes,
  cpuThrottling,
  emailedLines,
  ioMax,
  median,
  memoryEvents,
  phaseLines,
  phasesByRun,
  pricedRuns,
  psqlTimings,
  untilComplete,
  workerStarted,
} from './measure';
import {
  CommandError,
  ROUND_TRIP_SCRIPT,
  SERVICE_COMMANDS,
  composePostgresImage,
  delayedRoundTripMs,
  dockerRunArgs,
  imageStoreOf,
  interfaceByIndex,
  isScreeningService,
  loadedImageProblems,
  masked,
  netemCommands,
  parseComposePostgresImage,
  peerIndex,
  postgresRunArgs,
  processImagesProblems,
  processShellCommand,
  proveLoadedImage,
  screeningServices,
  serviceCommand,
  stderrTail,
  workerPlaywrightVersion,
} from './containers';
import { CONFIG, attestedArchive, blobEntry } from './test-support/image-archive';

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

describe('the web’s log', () => {
  it('reads the address checks’ measured time by run, numbers only, a run’s first line kept', () => {
    const lines = [
      'not json',
      JSON.stringify({ request_id: 'q-1', screening_run_id: 'r-1', elapsed_ms: 2_004, time: '2026-10-27T12:00:02.000Z', level: 'info', msg: 'screening address checked' }),
      JSON.stringify({ screening_run_id: 'r-2', elapsed_ms: 2_131, time: '2026-10-27T12:00:03.000Z', level: 'info', msg: 'screening address checked' }),
      JSON.stringify({ screening_run_id: 'r-1', elapsed_ms: 9, time: '2026-10-27T12:00:04.000Z', level: 'info', msg: 'screening address checked' }),
      JSON.stringify({ screening_run_id: 'r-3', elapsed_ms: 'slow', time: '2026-10-27T12:00:04.000Z', level: 'info', msg: 'screening address checked' }),
      JSON.stringify({ screening_run_id: 'r-4', error_code: 'SCREENING_NOT_QUEUED', time: '2026-10-27T12:00:05.000Z', level: 'warn', msg: 'screening run not queued; the sweep will send it' }),
    ];
    expect([...addressCheckTimes(lines)]).toEqual([
      ['r-1', 2_004],
      ['r-2', 2_131],
    ]);
    expect(ADDRESS_CHECKED_MESSAGE).toBe('screening address checked');
  });
});

describe('a result link, opened once its run commits', () => {
  /** A clock the waits move: sleep advances it, and nothing waits for real. */
  function clock() {
    let at = 0;
    return { now: () => at, sleep: (ms: number) => ((at += ms), Promise.resolve()) };
  }

  it('waits while an emailed run is still pricing (its completion not yet committed) and returns once it reads complete', async () => {
    const time = clock();
    // S4-1's email is in the outbox while its completion's transaction has not committed: pricing for 600 ms.
    const reads: string[] = [];
    const status = (upload: string) => {
      reads.push(`${upload}@${String(time.now())}`);
      return Promise.resolve(upload === 'S4-1' && time.now() < 600 ? 'pricing' : 'complete');
    };
    expect(await untilComplete(['S4-1', 'S4-2'], status, { waitMs: 30_000, ...time })).toEqual([]);
    expect(time.now()).toBe(750);
    // S4-2 is read once; S4-1 until it commits.
    expect(reads).toEqual(['S4-1@0', 'S4-2@0', 'S4-1@250', 'S4-1@500', 'S4-1@750']);
  });

  it('gives up at the wait and returns the runs not complete, whose links are then opened as sent', async () => {
    const time = clock();
    const late = await untilComplete(['S1-1', 'S1-2', 'S1-3'], (upload) => Promise.resolve(upload === 'S1-1' ? 'complete' : upload === 'S1-2' ? 'pricing' : null), { waitMs: 1_000, ...time });
    expect(late).toEqual(['S1-2', 'S1-3']);
    expect(time.now()).toBe(1_000);
  });

  it('reads a status it cannot read as not complete, and waits for nothing when every run is complete or there is none', async () => {
    const time = clock();
    expect(await untilComplete(['S2-1'], () => Promise.reject(new Error('the connection went away')), { waitMs: 500, ...time })).toEqual(['S2-1']);
    const still = clock();
    expect(await untilComplete([], () => Promise.resolve(null), { waitMs: 30_000, ...still })).toEqual([]);
    expect(await untilComplete(['S3-1'], () => Promise.resolve('complete'), { waitMs: 30_000, ...still })).toEqual([]);
    expect(still.now()).toBe(0);
  });
});

describe('the services’ commands', () => {
  it('are production’s task definitions’ own, the consumer’s with the main thread’s 512 MiB heap', () => {
    expect(SERVICE_COMMANDS.web).toEqual(COMMANDS.web);
    expect(SERVICE_COMMANDS.platform).toEqual(COMMANDS.worker);
    // The consumer's container command (infra/lib/constructs/compute.ts, PR 6b-3): #31's explicit heap limit.
    expect(SERVICE_COMMANDS.screening).toEqual((COMMANDS as Readonly<Record<string, readonly string[]>>).screening);
    expect(SERVICE_COMMANDS.screening).toContain(SCREENING_MAIN_HEAP_FLAG);
    expect(SCREENING_MAIN_HEAP_FLAG).toBe('--max-old-space-size=896');
    expect(screeningServices(1)).toEqual(['screening-1']);
    expect(screeningServices(2)).toEqual(['screening-1', 'screening-2']);
    expect([isScreeningService('screening-1'), isScreeningService('screening-0'), isScreeningService('platform')]).toEqual([true, false, false]);
    expect(serviceCommand('screening-1')).toEqual(SERVICE_COMMANDS.screening);
    expect(serviceCommand('platform')).toEqual(SERVICE_COMMANDS.platform);
  });

  it('exec each process under taskset with its whole cpuset, after joining its cgroups (the cgroup-v1 affinity fix)', () => {
    const dirs = ['/sys/fs/cgroup/cpu/tp-capacity-screening-1', '/sys/fs/cgroup/cpuset/tp-capacity-screening-1', '/sys/fs/cgroup/memory/tp-capacity-screening-1'];
    expect(processShellCommand(dirs, '2-3', SERVICE_COMMANDS.screening)).toBe(
      'echo $$ > /sys/fs/cgroup/cpu/tp-capacity-screening-1/cgroup.procs && echo $$ > /sys/fs/cgroup/cpuset/tp-capacity-screening-1/cgroup.procs && echo $$ > /sys/fs/cgroup/memory/tp-capacity-screening-1/cgroup.procs && exec taskset -c 2-3 node --enable-source-maps --max-old-space-size=896 dist/main.js',
    );
    expect(processShellCommand(['/sys/fs/cgroup/tp-capacity-web'], '3', SERVICE_COMMANDS.web)).toBe('echo $$ > /sys/fs/cgroup/tp-capacity-web/cgroup.procs && exec taskset -c 3 node apps/web/server.js');
    expect(() => processShellCommand([], '2-3; rm -rf /', SERVICE_COMMANDS.web)).toThrow(RangeError);
  });
});

describe('Docker’s arguments', () => {
  const limits = productionLimits();
  // GitHub's free 4-CPU runner, where both capacity jobs measure (the founder's third ruling of 2026-10-23, time advisory).
  const postgres = postgresLimit({ cpus: 4, memoryMiB: 16_000, cpuModel: '', kernel: '' }, limits);
  const layout = cpuLayout(limits.cpuNeeds, 4);
  // An 8-CPU runner's layout, each service on CPUs of its own.
  const own = cpuLayout(limits.cpuNeeds, 8);

  it('give the web production’s half CPU and 1,024 MiB on the consumer’s last CPU with no swap, or a CPU of its own on eight (the founder’s rulings of 2026-10-22, O9, and of 2026-10-23)', () => {
    const args = dockerRunArgs(
      { name: 'web', env: { NODE_ENV: 'production' }, limit: limits.web, cpuset: layout.web, command: SERVICE_COMMANDS.web },
      { image: 'tp-web:capacity', network: 'tp-capacity', dataHost: '/tmp/data', dataService: '/data' },
    );
    expect(args).toEqual(expect.arrayContaining(['--cpus=0.5', '--cpuset-cpus=3', '--memory=1024m', '--memory-swap=1024m', '--restart=no']));
    expect(args.slice(-3)).toEqual(['tp-web:capacity', 'node', 'apps/web/server.js']);
    const ownArgs = dockerRunArgs({ name: 'web', env: {}, limit: limits.web, cpuset: own.web, command: SERVICE_COMMANDS.web }, { image: 'tp-web:capacity', network: 'tp-capacity', dataHost: '/tmp/data', dataService: '/data' });
    expect(ownArgs).toContain('--cpuset-cpus=4');
  });

  it('give platform a quarter CPU on the consumer’s last CPU and 512 MiB with no swap, never restarted', () => {
    const args = dockerRunArgs(
      { name: 'platform', env: { NODE_ENV: 'test' }, limit: limits.platform, cpuset: layout.platform, command: SERVICE_COMMANDS.platform },
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
      { name: 'screening-1', env: { WORKER_JOBS: 'screening' }, limit: screening ?? { cpus: 0, memoryMiB: 0 }, cpuset: layout.consumer, command: SERVICE_COMMANDS.screening },
      { image: 'tp-worker:capacity', network: 'tp-capacity', dataHost: '/tmp/data', dataService: '/data' },
    );
    expect(args.slice(0, 7)).toEqual(['run', '-d', '--name', 'tp-capacity-screening-1', '--network', 'tp-capacity', '--network-alias']);
    expect(args).toEqual(expect.arrayContaining(['--cpus=2', '--cpuset-cpus=2-3', '--memory=4096m', '--memory-swap=4096m', '--restart=no', '-e', 'WORKER_JOBS=screening']));
    expect(args.slice(-5)).toEqual(['tp-worker:capacity', 'node', '--enable-source-maps', '--max-old-space-size=896', 'dist/main.js']);
  });

  it('give Postgres its CPUs, memory with no swap and gp3’s baseline on the data root’s device', () => {
    const image = composePostgresImage();
    const args = postgresRunArgs(postgres, { iops: 3000, bytesPerSecond: 125 * MIB }, { network: 'tp-capacity', device: '/dev/sda', port: 55_432, image });
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
        image,
      ]),
    );
    // The image comes from docker-compose.yml, by digest, the one CI's database jobs run (CI-13).
    expect(image).toMatch(/^postgres:18-[\w.-]+@sha256:[0-9a-f]{64}$/);
    expect(args[args.indexOf(image) - 1]).toBe('POSTGRES_PASSWORD=test');
  });

  it('read Postgres’s image from the compose file’s postgres service, refusing one that is not pinned by digest', () => {
    const digest = `sha256:${'ab'.repeat(32)}`;
    expect(parseComposePostgresImage(`services:\n  postgres:\n    image: postgres:18-trixie@${digest}\n`)).toBe(`postgres:18-trixie@${digest}`);
    expect(() => parseComposePostgresImage('services:\n  postgres:\n    image: postgres:18\n')).toThrow('docker-compose.yml: services.postgres.image "postgres:18" is not postgres:<tag>@sha256:<digest>');
    expect(() => parseComposePostgresImage(`services:\n  postgres:\n    image: postgres@${digest}\n`)).toThrow('is not postgres:<tag>@sha256:<digest>');
    expect(() => parseComposePostgresImage(`services:\n  postgres:\n    image: mirror.example/postgres:18@${digest}\n`)).toThrow('is not postgres:<tag>@sha256:<digest>');
    expect(() => parseComposePostgresImage('services:\n  db:\n    image: postgres:18\n')).toThrow('docker-compose.yml: services.postgres.image is missing');
    expect(() => parseComposePostgresImage('')).toThrow('services.postgres.image is missing');
    // Read from a root: a tree whose compose file holds another digest gives that digest.
    const root = mkdtempSync(path.join(tmpdir(), 'compose-'));
    try {
      writeFileSync(path.join(root, 'docker-compose.yml'), `services:\n  postgres:\n    image: postgres:18-trixie@${digest}\n`);
      expect(composePostgresImage(root)).toBe(`postgres:18-trixie@${digest}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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

describe('the process runtime\'s images', () => {
  it('names what the layout lacks of the images, playwright-core beside the worker\'s bundle at its pinned version among them', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'capacity-images-'));
    try {
      const images = { worker: path.join(dir, 'worker'), web: path.join(dir, 'web') };
      for (const file of ['dist/main.js', 'dist/screening-thread.js', 'dist/migrate.js', 'dist/logins.js', 'migrations/.keep', 'web-placeholder']) {
        mkdirSync(path.dirname(path.join(images.worker, file)), { recursive: true });
        writeFileSync(path.join(images.worker, file), '');
      }
      mkdirSync(path.join(images.web, 'apps/web'), { recursive: true });
      writeFileSync(path.join(images.web, 'apps/web/server.js'), '');
      // The integrator's first smoke run: dist and migrations alone, and every worker stopped as it loaded its bundle.
      expect(processImagesProblems(images, '1.56.1')).toEqual([expect.stringMatching(/node_modules\/playwright-core is missing, not 1\.56\.1, the one the worker image copies beside its bundle from the lockfile's install \(cp -RL apps\/worker\/node_modules\/playwright-core .*\/worker\/node_modules\/\)$/)]);
      mkdirSync(path.join(images.worker, 'node_modules/playwright-core'), { recursive: true });
      writeFileSync(path.join(images.worker, 'node_modules/playwright-core/package.json'), JSON.stringify({ name: 'playwright-core', version: '1.55.0' }));
      expect(processImagesProblems(images, '1.56.1')).toEqual([expect.stringContaining('is at 1.55.0, not 1.56.1')]);
      writeFileSync(path.join(images.worker, 'node_modules/playwright-core/package.json'), JSON.stringify({ name: 'playwright-core', version: '1.56.1' }));
      expect(processImagesProblems(images, '1.56.1')).toEqual([]);
      // The version the image holds is the lockfile's, read from the worker's installed package (its manifest names the
      // catalog's entry): a tree with another installed version gives that one, and a tree with none gives none.
      mkdirSync(path.join(dir, 'tree/apps/worker/node_modules/playwright-core'), { recursive: true });
      writeFileSync(path.join(dir, 'tree/apps/worker/package.json'), JSON.stringify({ dependencies: { 'playwright-core': 'catalog:' } }));
      writeFileSync(path.join(dir, 'tree/apps/worker/node_modules/playwright-core/package.json'), JSON.stringify({ name: 'playwright-core', version: '1.64.1' }));
      expect(workerPlaywrightVersion(path.join(dir, 'tree'))).toBe('1.64.1');
      expect(workerPlaywrightVersion(path.join(dir, 'no-tree'))).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the measured image proved to be the one built (docs/adr/0066, Part 3)', () => {
  /** A stand-in docker on PATH: `info` gives this store, `image inspect` this ID, `save` this archive; it logs each call. */
  async function withDocker<T>(setup: { store: 'classic' | 'containerd'; id: string; save?: Buffer | 'fail' }, body: (dir: string) => Promise<T>): Promise<{ result: T; calls: string[] }> {
    const dir = mkdtempSync(path.join(tmpdir(), 'capacity-docker-'));
    const saved = process.env.PATH;
    try {
      mkdirSync(path.join(dir, 'bin'));
      writeFileSync(
        path.join(dir, 'bin/docker'),
        `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${dir}/calls'\ncase "$1" in\n  info) cat '${dir}/driver-status' ;;\n  image) cat '${dir}/id' ;;\n  save) if [ -f '${dir}/fail-save' ]; then echo "Error response from daemon: No such image: $2" >&2; exit 1; fi; cat '${dir}/save.tar' ;;\n  *) exit 97 ;;\nesac\n`,
      );
      chmodSync(path.join(dir, 'bin/docker'), 0o755);
      writeFileSync(path.join(dir, 'driver-status'), setup.store === 'containerd' ? '[["driver-type","io.containerd.snapshotter.v1"]]\n' : '[["Backing Filesystem","extfs"],["Supports d_type","true"],["Using metacopy","false"],["Native Overlay Diff","true"],["userxattr","false"]]\n');
      writeFileSync(path.join(dir, 'id'), `${setup.id}\n`);
      if (setup.save === 'fail') writeFileSync(path.join(dir, 'fail-save'), '');
      else if (setup.save !== undefined) writeFileSync(path.join(dir, 'save.tar'), setup.save);
      process.env.PATH = `${path.join(dir, 'bin')}:${saved ?? '/usr/bin:/bin'}`;
      const result = await body(dir);
      let calls: string[] = [];
      try {
        calls = readFileSync(path.join(dir, 'calls'), 'utf8').trim().split('\n');
      } catch {
        calls = [];
      }
      return { result, calls };
    } finally {
      process.env.PATH = saved;
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const attested = attestedArchive();

  it('reads the store from docker info: containerd’s snapshotter, or the classic graph driver', () => {
    expect(imageStoreOf('[["driver-type","io.containerd.snapshotter.v1"]]')).toBe('containerd');
    expect(imageStoreOf('[["Backing Filesystem","extfs"],["Supports d_type","true"]]')).toBe('classic');
    expect(imageStoreOf('null')).toBe('classic');
  });

  it('passes a tag whose .Id is the archive’s config on the classic store, reading the archive and never docker save', async () => {
    const { result, calls } = await withDocker({ store: 'classic', id: attested.config }, async (dir) => {
      writeFileSync(path.join(dir, 'worker.tar'), attested.archive);
      return proveLoadedImage('tp-worker:capacity', { archive: path.join(dir, 'worker.tar'), expectedConfig: attested.config });
    });
    expect(result).toEqual({ tag: 'tp-worker:capacity', identity: { config: attested.config, manifest: attested.manifest, target: attested.target }, store: 'classic', source: 'archive' });
    expect(calls).toEqual(['info --format {{json .DriverStatus}}', 'image inspect -f {{.Id}} tp-worker:capacity']);
  });

  it('passes a tag whose .Id is the archive’s top-level descriptor on the containerd store, and stops on the amd64 manifest’s digest of an attested index (the review’s S2) or any other', async () => {
    const run = (id: string) =>
      withDocker({ store: 'containerd', id }, async (dir) => {
        writeFileSync(path.join(dir, 'worker.tar'), attested.archive);
        return proveLoadedImage('tp-worker:capacity', { archive: path.join(dir, 'worker.tar') });
      });
    expect((await run(attested.target)).result.store).toBe('containerd');
    await expect(run(attested.manifest)).rejects.toThrow(`the image to measure is not the one built: tp-worker:capacity is ${attested.manifest} on the containerd image store, not the archive's top-level descriptor ${attested.target}`);
    await expect(run(attested.config)).rejects.toThrow(`not the archive's top-level descriptor ${attested.target}`);
    await expect(withDocker({ store: 'classic', id: attested.target }, async (dir) => {
      writeFileSync(path.join(dir, 'worker.tar'), attested.archive);
      return proveLoadedImage('tp-worker:capacity', { archive: path.join(dir, 'worker.tar') });
    })).rejects.toThrow(`tp-worker:capacity is ${attested.target} on the classic image store, not the archive's config ${attested.config}`);
  });

  it('stops when the archive holds another config than the build recorded (--expect-image; the review’s S1)', async () => {
    const other = attestedArchive(`${CONFIG} `);
    await expect(withDocker({ store: 'classic', id: other.config }, async (dir) => {
      writeFileSync(path.join(dir, 'worker.tar'), other.archive);
      return proveLoadedImage('tp-worker:capacity', { archive: path.join(dir, 'worker.tar'), expectedConfig: attested.config });
    })).rejects.toThrow(`the archive for tp-worker:capacity holds the config ${other.config}, not the ${attested.config} the build recorded`);
  });

  it('streams docker save of the tag when no archive is given (a local run), and fails with docker’s own error when the save fails', async () => {
    const { result, calls } = await withDocker({ store: 'classic', id: attested.config, save: attested.archive }, async () => proveLoadedImage('tp-worker:capacity'));
    expect(result.source).toBe('save');
    expect(calls[0]).toBe('save tp-worker:capacity');
    await expect(withDocker({ store: 'classic', id: attested.config, save: 'fail' }, async () => proveLoadedImage('tp-worker:missing'))).rejects.toThrow('docker save tp-worker:missing failed: Error response from daemon: No such image: tp-worker:missing');
  });

  it('names an archive with no index.json as unprovable on the containerd store', () => {
    const config = blobEntry(CONFIG);
    expect(loadedImageProblems('tp-web:capacity', config.digest, { config: config.digest }, 'containerd')).toEqual(["the archive for tp-web:capacity has no index.json, so it names no digest the containerd store's .Id could equal"]);
    expect(loadedImageProblems('tp-web:capacity', config.digest, { config: config.digest }, 'classic')).toEqual([]);
    expect(loadedImageProblems('tp-web:capacity', '', { config: config.digest }, 'classic')).toEqual([`tp-web:capacity is not loaded on the classic image store, not the archive's config ${config.digest}`]);
  });
});
