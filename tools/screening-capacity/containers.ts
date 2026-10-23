import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import pg from 'pg';

import { SCREENING_MAIN_HEAP_FLAG } from '../../apps/worker/src/screening/threads';
import { type ContainerLimit, MIB, NETWORK_DELAY_MS, type PostgresLimit } from './limits';
import { type CgroupVersion, ioMax, median, psqlTimings } from './measure';
import type { AppliedContainer, AppliedLimits } from './report';

/**
 * Where the capacity test's services run (audit #53 part 1; docs/adr/0062, "Capacity under production limits"): web,
 * platform, and the screening consumer's tasks (screening-1 to screening-N, PR 6b-3), beside Postgres.
 *
 * DockerRuntime (CI, the measurement): the production images as containers under cgroup v2 limits equal to production's
 * task sizes; Postgres 18 with its CPUs, memory, a 1 GiB /dev/shm (its parallel queries' shared memory; RDS has no 64
 * MiB cap), gp3's I/O baseline on the device behind Docker's data root (io.max) and a 1 ms delay each way on its link
 * (netem on its own interface and on the host's end of the link: netemCommands); ready once a client container on the
 * services' network reaches it over TCP; limits read back with docker inspect and the container's own io.max, and the
 * round trip measured from a client container. Each container's log (stdout and stderr) is saved under <out>/logs
 * before the container is removed, result links' tokens masked.
 *
 * ProcessRuntime (a developer machine without Docker): the same build outputs laid out as the images lay them out
 * (dist and migrations for the worker, the standalone server for the web), run as processes in cgroups with the same
 * CPU quota, cpuset and memory with no swap (v2, or v1's cpu, cpuset and memory controllers), against a Postgres
 * server the caller names, which the harness cannot limit: its run reports Postgres's limits as not applied, so it
 * never passes for a CI run. Each service is exec'd under `taskset -c <its cpuset>` after joining its cgroups: under
 * cgroup v1 a process that joins a cpuset keeps the intersection of the affinity it inherited and the cpuset, so a
 * service started from a harness pinned to other CPUs would otherwise run on the overlap alone (the design's affinity
 * finding: three pricing processes on one CPU).
 */

const exec = promisify(execFile);

/** A command that failed, with the tail of what it wrote to stderr (credentials in a URL masked). */
export class CommandError extends Error {
  override readonly name = 'CommandError';
  constructor(
    readonly command: string,
    readonly stderr: string,
  ) {
    super(`${command} failed: ${stderrTail(stderr)}`);
  }
}

/** A URL's credentials masked, and a result link's token, so neither reaches a log line, an error or the report. */
export function masked(text: string): string {
  return text.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1***@').replace(/\/screening\/results\/[a-z]{32}/g, '/screening/results/<token>');
}

/** The last lines of a command's stderr, at most 400 characters, masked: what the report's "run not finished" names. */
export function stderrTail(stderr: string, characters = 400): string {
  const lines = masked(stderr)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const tail = lines.slice(-4).join(' | ');
  return tail === '' ? 'no stderr' : tail.length <= characters ? tail : `…${tail.slice(tail.length - characters + 1)}`;
}

/** Runs a command, its stdout returned; a failure is a CommandError with its stderr. */
async function run(command: string, args: readonly string[], options: { readonly env?: NodeJS.ProcessEnv; readonly cwd?: string } = {}): Promise<string> {
  try {
    const { stdout } = await exec(command, [...args], { maxBuffer: 256 * MIB, ...options });
    return stdout;
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    const shown = [command, ...args.slice(0, 1)].join(' ');
    throw new CommandError(masked(shown), typeof stderr === 'string' && stderr !== '' ? stderr : error instanceof Error ? error.message : String(error));
  }
}

/** A screening consumer task's service: screening-1 to screening-N, one per declared task. */
export type ScreeningServiceName = `screening-${number}`;
export type ServiceName = 'web' | 'platform' | ScreeningServiceName;

/** The consumer's task services, one per declared task (production's desiredCount). */
export function screeningServices(tasks: number): ScreeningServiceName[] {
  return Array.from({ length: tasks }, (_, index) => `screening-${String(index + 1)}` as ScreeningServiceName);
}

export function isScreeningService(name: string): name is ScreeningServiceName {
  return /^screening-[1-9]\d*$/.test(name);
}

/**
 * What each service runs, as production's task definitions run it: the images' own commands (infra/lib/constructs/
 * compute.ts, COMMANDS), and for the screening consumer the worker's command with the main thread's heap limit
 * (SCREENING_MAIN_HEAP_FLAG, #31's explicit heap limit; its pricing threads carry their own).
 */
export const SERVICE_COMMANDS = {
  web: ['node', 'apps/web/server.js'],
  platform: ['node', '--enable-source-maps', 'dist/main.js'],
  screening: ['node', '--enable-source-maps', SCREENING_MAIN_HEAP_FLAG, 'dist/main.js'],
} as const;

/** A service's command (SERVICE_COMMANDS). */
export function serviceCommand(name: ServiceName): readonly string[] {
  return isScreeningService(name) ? SERVICE_COMMANDS.screening : SERVICE_COMMANDS[name];
}

export interface ServiceStatus {
  readonly restarts: number;
  readonly oomKilled: boolean;
  readonly running: boolean;
}

/** Postgres's own state: its cgroup's oom_kill count and Docker's restart count (null where they cannot be read). */
export interface PostgresStatus {
  readonly oomKills: number | null;
  readonly restarts: number | null;
  readonly running: boolean | null;
}

/** A cold start: whether Postgres was restarted and the operating system's page cache dropped. */
export interface ColdStart {
  readonly restarted: boolean;
  readonly cacheDropped: boolean;
}

/** One service's environment, limits and command. */
export interface ServiceSpec {
  readonly name: ServiceName;
  readonly env: Readonly<Record<string, string>>;
  readonly limit: ContainerLimit;
  readonly cpuset: string;
  /** What it runs (serviceCommand): the image's command, or the consumer's with its heap limit. */
  readonly command: readonly string[];
}

export interface Runtime {
  readonly kind: 'docker' | 'process';
  readonly cgroupVersion: CgroupVersion;
  /** The directory the services share with the harness (outbox, local stores), as the harness sees it and as the services see it. */
  readonly dataDir: { readonly host: string; readonly service: string };
  /**
   * Starts Postgres; its admin URL as the harness reaches it and as the services do. `clientCpuset` is where the client
   * that measures the round trip runs (the platform's CPU: the round trip a service sees).
   */
  startPostgres(limit: PostgresLimit, storage: { readonly iops: number; readonly bytesPerSecond: number }, delayMs: number, clientCpuset: string): Promise<{ readonly harnessUrl: string; readonly serviceUrl: string }>;
  /** Restarts Postgres with a cold cache (the operating system's page cache dropped where the runner allows); what was done. */
  restartPostgres(): Promise<ColdStart>;
  /** The migration task: the migrations, then the logins, as the owner. A failure is a CommandError with its stderr. */
  migrate(ownerServiceUrl: string, loginsEnv: Readonly<Record<string, string>>): Promise<void>;
  /** Starts a service; `label` names the part of the run it serves (setup, or a scenario), as its saved log is named. */
  startService(spec: ServiceSpec, label: string): Promise<void>;
  stopService(name: ServiceName): Promise<void>;
  /** Stops every service, leaving Postgres running (the oracle reads it after the services stop). */
  stopServices(): Promise<void>;
  /** Postgres's own OOM kills and restarts. */
  postgresStatus(): Promise<PostgresStatus>;
  /** The service's log lines so far. */
  logs(name: ServiceName): Promise<string[]>;
  /** A file of the service's cgroup (memory.stat and the like), or null when it cannot be read. */
  cgroupFile(name: ServiceName, file: string): Promise<string | null>;
  status(name: ServiceName): Promise<ServiceStatus>;
  /** The limits as applied to every service started and to Postgres, read back. */
  applied(postgresServiceUrl: string): Promise<AppliedLimits>;
  /** The web's origin as the harness's browser reaches it. */
  readonly webOrigin: string;
  stopAll(): Promise<void>;
}

/** Docker's arguments for a service's container (pure: the test checks them). */
export function dockerRunArgs(
  spec: ServiceSpec,
  options: { readonly image: string; readonly network: string; readonly dataHost: string; readonly dataService: string; readonly publish?: string; readonly user?: string },
): string[] {
  const memory = `${String(spec.limit.memoryMiB)}m`;
  return [
    'run',
    '-d',
    '--name',
    `tp-capacity-${spec.name}`,
    '--network',
    options.network,
    '--network-alias',
    spec.name,
    `--cpus=${String(spec.limit.cpus)}`,
    `--cpuset-cpus=${spec.cpuset}`,
    `--memory=${memory}`,
    `--memory-swap=${memory}`,
    '--restart=no',
    // The runner's own user, so the harness can read the outbox the worker writes with mode 0600 (the image's user is node).
    ...(options.user === undefined ? [] : ['--user', options.user]),
    '-v',
    `${options.dataHost}:${options.dataService}`,
    ...(options.publish === undefined ? [] : ['-p', options.publish]),
    ...Object.entries(spec.env).flatMap(([name, value]) => ['-e', `${name}=${value}`]),
    options.image,
    ...spec.command,
  ];
}

/** Docker's arguments for Postgres's container: its CPUs, memory with no swap, and gp3's baseline on the device. */
export function postgresRunArgs(limit: PostgresLimit, storage: { readonly iops: number; readonly bytesPerSecond: number }, options: { readonly network: string; readonly device: string; readonly port: number }): string[] {
  const memory = `${String(limit.memoryMiB)}m`;
  return [
    'run',
    '-d',
    '--name',
    'tp-capacity-postgres',
    '--network',
    options.network,
    '--network-alias',
    'db',
    `--cpus=${String(limit.cpus)}`,
    `--cpuset-cpus=${limit.cpuset}`,
    `--memory=${memory}`,
    `--memory-swap=${memory}`,
    `--device-read-iops=${options.device}:${String(storage.iops)}`,
    `--device-write-iops=${options.device}:${String(storage.iops)}`,
    `--device-read-bps=${options.device}:${String(storage.bytesPerSecond)}`,
    `--device-write-bps=${options.device}:${String(storage.bytesPerSecond)}`,
    // Parallel queries' dynamic shared memory lives in /dev/shm; Docker's default 64 MiB is not RDS's.
    '--shm-size=1g',
    '-p',
    `127.0.0.1:${String(options.port)}:5432`,
    '-e',
    'POSTGRES_PASSWORD=test',
    'postgres:18',
    '-c',
    `shared_buffers=${String(Math.floor(limit.memoryMiB / 4))}MB`,
    '-c',
    'max_connections=200',
    '-c',
    'log_min_messages=panic',
    '-c',
    'log_min_error_statement=panic',
  ];
}

/** psql's input for 50 timed round trips. */
export const ROUND_TRIP_SCRIPT = ['\\timing on', ...Array.from({ length: 50 }, () => 'SELECT 1;')].join('\n');

/**
 * The commands that put the delay on both directions of Postgres's link: netem on its own eth0 (from the host, in its
 * network namespace) delays what Postgres sends, and netem on the host's end of its veth pair delays what it receives,
 * so every client (the services, the probe, the harness) sees the delay twice in a round trip. One alone delays one
 * direction only (audit #53 part 1's capacity review).
 */
export function netemCommands(delayMs: number, postgresPid: string, hostInterface: string): string[][] {
  const netem = ['root', 'netem', 'delay', `${String(delayMs)}ms`];
  return [
    ['sudo', 'nsenter', '-t', postgresPid, '-n', 'tc', 'qdisc', 'replace', 'dev', 'eth0', ...netem],
    ['sudo', 'tc', 'qdisc', 'replace', 'dev', hostInterface, ...netem],
  ];
}

/** The round trip the commands give: the delay once per direction they cover. */
export function delayedRoundTripMs(delayMs: number = NETWORK_DELAY_MS): number {
  return delayMs * netemCommands(delayMs, '1', 'veth0').length;
}

/** The host's index of the peer of a container's eth0, from `ip -o link show eth0` in its namespace ("12: eth0@if13: ..."). */
export function peerIndex(ipLinkShow: string): number | null {
  const found = /^\d+:\s+eth0@if(\d+):/m.exec(ipLinkShow);
  return found === null ? null : Number.parseInt(found[1] ?? '', 10);
}

/** The interface with an index in the host's `ip -o link` ("13: veth3a1b2c4@if12: ..."), its name without the peer. */
export function interfaceByIndex(ipLink: string, index: number): string | null {
  for (const line of ipLink.split('\n')) {
    const found = /^(\d+):\s+([^:@\s]+)(?:@[^:\s]+)?:/.exec(line.trim());
    if (found !== null && Number.parseInt(found[1] ?? '', 10) === index) {
      return found[2] ?? null;
    }
  }
  return null;
}

async function docker(...args: string[]): Promise<string> {
  return run('docker', args);
}

async function waitFor(what: string, check: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    if (await check().catch(() => false)) {
      return;
    }
    if (Date.now() > until) {
      throw new Error(`${what} did not become ready in ${String(timeoutMs / 1000)} s`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export class DockerRuntime implements Runtime {
  readonly kind = 'docker' as const;
  readonly cgroupVersion = 2 as const;
  readonly dataDir: { readonly host: string; readonly service: string };
  readonly webOrigin = 'http://localhost:3000';
  private readonly network = 'tp-capacity';
  private readonly labels = new Map<string, string>();

  constructor(
    private readonly images: { readonly web: string; readonly worker: string },
    dataHost: string,
    private readonly logDir: string,
    private readonly postgresPort = 55_432,
  ) {
    this.dataDir = { host: dataHost, service: '/data' };
  }

  /** The block device behind Docker's data root (its whole disk). */
  private async dataDevice(): Promise<string> {
    const root = (await docker('info', '-f', '{{.DockerRootDir}}')).trim();
    const source = await run('df', ['--output=source', root]);
    const partition = source.trim().split('\n').at(-1)?.trim() ?? '';
    const parent = await run('lsblk', ['-no', 'pkname', partition]).catch(() => '');
    return parent.trim() === '' ? partition : `/dev/${parent.trim()}`;
  }

  private clientCpuset = '0';
  private delayMs = 0;

  private get harnessUrl(): string {
    return `postgres://postgres:test@127.0.0.1:${String(this.postgresPort)}/postgres`;
  }

  async startPostgres(limit: PostgresLimit, storage: { readonly iops: number; readonly bytesPerSecond: number }, delayMs: number, clientCpuset: string): Promise<{ readonly harnessUrl: string; readonly serviceUrl: string }> {
    this.clientCpuset = clientCpuset;
    this.delayMs = delayMs;
    this.labels.set('postgres', 'run');
    await docker('network', 'create', this.network).catch(() => '');
    await docker(...postgresRunArgs(limit, storage, { network: this.network, device: await this.dataDevice(), port: this.postgresPort }));
    await this.waitForPostgres();
    await this.delay();
    return { harnessUrl: this.harnessUrl, serviceUrl: 'postgres://postgres:test@db:5432/postgres' };
  }

  /**
   * Ready once a client container on the services' network reaches Postgres over TCP, as web, platform and the
   * migration task do, and the harness through the published port. pg_isready inside the container would also call the
   * image's initialisation server ready, which listens on its Unix socket alone and is then stopped.
   */
  private async waitForPostgres(): Promise<void> {
    await waitFor(
      'Postgres on the services’ network',
      async () => {
        await docker('run', '--rm', '--network', this.network, 'postgres:18', 'pg_isready', '-q', '-h', 'db', '-p', '5432', '-U', 'postgres', '-t', '5');
        return true;
      },
      180_000,
    );
    await waitFor(
      'Postgres from the harness',
      async () => {
        const client = new pg.Client({ connectionString: this.harnessUrl });
        client.on('error', () => undefined);
        await client.connect();
        try {
          await client.query('SELECT 1');
        } finally {
          await client.end();
        }
        return true;
      },
      60_000,
    );
  }

  /** netem on both ends of Postgres's link (netemCommands). */
  private async delay(): Promise<void> {
    const pid = (await docker('inspect', '-f', '{{.State.Pid}}', 'tp-capacity-postgres')).trim();
    const peer = peerIndex(await run('sudo', ['nsenter', '-t', pid, '-n', 'ip', '-o', 'link', 'show', 'eth0']));
    const host = peer === null ? null : interfaceByIndex(await run('ip', ['-o', 'link']), peer);
    if (host === null) {
      throw new Error('the host’s end of Postgres’s link was not found, so the delay cannot be applied both ways');
    }
    for (const command of netemCommands(this.delayMs, pid, host)) {
      await run(command[0] ?? 'sudo', command.slice(1));
    }
  }

  async restartPostgres(): Promise<ColdStart> {
    await docker('restart', 'tp-capacity-postgres');
    const cacheDropped = await run('sudo', ['sh', '-c', 'sync && echo 3 > /proc/sys/vm/drop_caches']).then(
      () => true,
      () => false,
    );
    await this.waitForPostgres();
    // A restarted container has a new link: the delay goes on again.
    await this.delay();
    return { restarted: true, cacheDropped };
  }

  async migrate(ownerServiceUrl: string, loginsEnv: Readonly<Record<string, string>>): Promise<void> {
    const once = (command: string, env: Readonly<Record<string, string>>) =>
      docker('run', '--rm', '--network', this.network, ...Object.entries(env).flatMap(([name, value]) => ['-e', `${name}=${value}`]), this.images.worker, 'node', command).catch((error: unknown) => {
        throw error instanceof CommandError ? new CommandError(`the migration task (${command})`, error.stderr) : error;
      });
    await once('dist/migrate.js', { DATABASE_URL: ownerServiceUrl });
    await once('dist/logins.js', loginsEnv);
  }

  /** The container's log (stdout, then stderr) appended to <out>/logs/<label>-<name>.log, tokens and credentials masked. */
  private async saveLogs(name: string): Promise<void> {
    const container = `tp-capacity-${name}`;
    const output = await exec('docker', ['logs', container], { maxBuffer: 256 * MIB }).catch(() => null);
    if (output === null) {
      return;
    }
    mkdirSync(this.logDir, { recursive: true });
    const file = path.join(this.logDir, `${this.labels.get(name) ?? 'run'}-${name}.log`);
    appendFileSync(file, `${masked(output.stdout)}${output.stderr === '' ? '' : `\n[harness] ${name}'s stderr:\n${masked(output.stderr)}`}`);
  }

  /** The services started and not stopped since, in the order they started. */
  private readonly services = new Set<ServiceName>();

  async startService(spec: ServiceSpec, label: string): Promise<void> {
    await this.saveLogs(spec.name);
    await docker('rm', '-f', `tp-capacity-${spec.name}`).catch(() => '');
    this.labels.set(spec.name, label);
    this.services.add(spec.name);
    await docker(
      ...dockerRunArgs(spec, {
        image: spec.name === 'web' ? this.images.web : this.images.worker,
        network: this.network,
        dataHost: this.dataDir.host,
        dataService: this.dataDir.service,
        ...(spec.name === 'web' ? { publish: '127.0.0.1:3000:3000' } : {}),
        ...(process.getuid === undefined || process.getgid === undefined ? {} : { user: `${String(process.getuid())}:${String(process.getgid())}` }),
      }),
    );
  }

  async stopService(name: ServiceName): Promise<void> {
    await docker('stop', '-t', '30', `tp-capacity-${name}`).catch(() => '');
    await this.saveLogs(name);
    await docker('rm', '-f', `tp-capacity-${name}`).catch(() => '');
    this.labels.delete(name);
    this.services.delete(name);
  }

  async stopServices(): Promise<void> {
    for (const name of [...this.services]) {
      await this.stopService(name);
    }
  }

  async logs(name: ServiceName): Promise<string[]> {
    const { stdout } = await exec('docker', ['logs', `tp-capacity-${name}`], { maxBuffer: 256 * MIB }).catch(() => ({ stdout: '' }));
    return stdout.split('\n');
  }

  private async cgroupDir(name: string): Promise<string | null> {
    const pid = (await docker('inspect', '-f', '{{.State.Pid}}', `tp-capacity-${name}`).catch(() => '')).trim();
    if (pid === '' || pid === '0') {
      return null;
    }
    const line = readFileSync(`/proc/${pid}/cgroup`, 'utf8')
      .split('\n')
      .find((entry) => entry.startsWith('0::'));
    return line === undefined ? null : path.join('/sys/fs/cgroup', line.slice(3));
  }

  async cgroupFile(name: ServiceName, file: string): Promise<string | null> {
    const dir = await this.cgroupDir(name);
    if (dir === null) {
      return null;
    }
    try {
      return readFileSync(path.join(dir, file), 'utf8');
    } catch {
      return null;
    }
  }

  async status(name: ServiceName): Promise<ServiceStatus> {
    const text = (await docker('inspect', '-f', '{{.RestartCount}} {{.State.OOMKilled}} {{.State.Running}}', `tp-capacity-${name}`).catch(() => '0 false false')).trim();
    const [restarts, oom, running] = text.split(' ');
    return { restarts: Number.parseInt(restarts ?? '0', 10), oomKilled: oom === 'true', running: running === 'true' };
  }

  async postgresStatus(): Promise<PostgresStatus> {
    const text = (await docker('inspect', '-f', '{{.RestartCount}} {{.State.Running}}', 'tp-capacity-postgres').catch(() => '')).trim();
    const [restarts, running] = text.split(' ');
    const dir = await this.cgroupDir('postgres');
    const readEvents = (): string | null => {
      try {
        return dir === null ? null : readFileSync(path.join(dir, 'memory.events'), 'utf8');
      } catch {
        return null;
      }
    };
    const events = readEvents();
    const kills = events === null ? null : /^oom_kill (\d+)$/m.exec(events)?.[1];
    return {
      oomKills: kills === undefined || kills === null ? null : Number.parseInt(kills, 10),
      restarts: restarts === undefined || restarts === '' ? null : Number.parseInt(restarts, 10),
      running: running === undefined ? null : running === 'true',
    };
  }

  async applied(_postgresServiceUrl?: string): Promise<AppliedLimits> {
    const inspect = async (name: AppliedContainer['name']): Promise<AppliedContainer> => {
      const text = (await docker('inspect', '-f', '{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}} {{.HostConfig.MemorySwap}} {{.HostConfig.CpusetCpus}}', `tp-capacity-${name}`)).trim();
      const [cpus, memory, swap, cpuset] = text.split(' ');
      const number = (value: string | undefined) => (value === undefined || value === '0' ? null : Number.parseInt(value, 10));
      return { name, nanoCpus: number(cpus), memoryBytes: number(memory), memorySwapBytes: number(swap), cpuset: cpuset === undefined || cpuset === '' ? null : cpuset };
    };
    const ioText = await docker('exec', 'tp-capacity-postgres', 'cat', '/sys/fs/cgroup/io.max').catch(() => '');
    const line = ioMax(ioText)[0];
    const { stdout: timing } = await exec('sh', ['-c', `printf '%s\\n' "$1" | docker run --rm -i --network ${this.network} --cpuset-cpus=${this.clientCpuset} postgres:18 psql -X -q postgres://postgres:test@db:5432/postgres`, 'sh', ROUND_TRIP_SCRIPT]).catch(() => ({ stdout: '' }));
    return {
      containers: [...(await Promise.all([...this.services].map((name) => inspect(name)))), await inspect('postgres')],
      ioMax: line === undefined ? null : { riops: line.riops, wiops: line.wiops, rbps: line.rbps, wbps: line.wbps },
      roundTripMedianMs: median(psqlTimings(timing)),
    };
  }

  async stopAll(): Promise<void> {
    for (const name of [...this.services, 'postgres']) {
      await this.saveLogs(name);
      await docker('rm', '-f', `tp-capacity-${name}`).catch(() => '');
      this.labels.delete(name);
    }
    this.services.clear();
    await docker('network', 'rm', this.network).catch(() => '');
  }
}

/** cgroup v1's controllers the process runtime limits with, or v2's unified tree. */
function cgroupVersion(): CgroupVersion {
  return existsSync('/sys/fs/cgroup/cgroup.controllers') ? 2 : 1;
}

/**
 * The images' layout of the build outputs, under a directory, as the Dockerfiles lay them out: worker/dist,
 * worker/migrations and worker/node_modules/playwright-core (apps/worker/Dockerfile installs it beside the bundle, which
 * imports it at its top, at the version apps/worker/package.json pins: `npm install --no-save playwright-core@<version>`
 * in worker/), and web/ the standalone server with its static files and public.
 */
export interface ProcessImages {
  readonly worker: string;
  readonly web: string;
}

/** The playwright-core version the worker image installs beside its bundle (apps/worker/package.json, as the Dockerfile pins it). */
export function workerPlaywrightVersion(root: string = path.resolve(import.meta.dirname, '../..')): string {
  const manifest = JSON.parse(readFileSync(path.join(root, 'apps/worker/package.json'), 'utf8')) as { dependencies?: Record<string, string> };
  return manifest.dependencies?.['playwright-core'] ?? '';
}

/**
 * What the process runtime's layout lacks of what the images hold, each by its path, or nothing: without
 * playwright-core every worker process stops as it loads its bundle, and the run stopped with PLATFORM_NOT_READY (the
 * integrator's first smoke run), which said nothing of why.
 */
export function processImagesProblems(images: ProcessImages, playwrightVersion: string = workerPlaywrightVersion()): string[] {
  const problems: string[] = [];
  for (const needed of ['dist/main.js', 'dist/screening-thread.js', 'dist/migrate.js', 'dist/logins.js', 'migrations']) {
    if (!existsSync(path.join(images.worker, needed))) {
      problems.push(`${path.join(images.worker, needed)} is missing (pnpm --filter @tp/worker build, then copy dist and packages/db/migrations)`);
    }
  }
  const playwright = path.join(images.worker, 'node_modules/playwright-core/package.json');
  const installed = existsSync(playwright) ? (JSON.parse(readFileSync(playwright, 'utf8')) as { version?: string }).version : undefined;
  if (installed !== playwrightVersion) {
    problems.push(
      `${path.join(images.worker, 'node_modules/playwright-core')} is ${installed === undefined ? 'missing' : `at ${installed}`}, not ${playwrightVersion}, which the worker image installs beside its bundle (npm install --no-save playwright-core@${playwrightVersion} in ${images.worker})`,
    );
  }
  if (!existsSync(path.join(images.web, 'apps/web/server.js'))) {
    problems.push(`${path.join(images.web, 'apps/web/server.js')} is missing (the web's standalone server, with .next/static and public beside it)`);
  }
  return problems;
}

export class ProcessRuntime implements Runtime {
  readonly kind = 'process' as const;
  readonly cgroupVersion = cgroupVersion();
  readonly dataDir: { readonly host: string; readonly service: string };
  readonly webOrigin: string;
  private readonly children = new Map<ServiceName, { readonly child: ChildProcess; readonly lines: string[]; exited: boolean }>();
  private readonly cgroups = new Map<ServiceName, string[]>();

  constructor(
    private readonly images: ProcessImages,
    dataDir: string,
    private readonly adminUrl: string,
    private readonly databaseName: string,
    private readonly webPort = 3300,
  ) {
    this.dataDir = { host: dataDir, service: dataDir };
    this.webOrigin = `http://localhost:${String(webPort)}`;
  }

  async startPostgres(): Promise<{ readonly harnessUrl: string; readonly serviceUrl: string }> {
    // The caller's server, unlimited: a scratch database of the harness's own.
    const client = new pg.Client({ connectionString: this.adminUrl });
    await client.connect();
    try {
      await client.query(`DROP DATABASE IF EXISTS ${client.escapeIdentifier(this.databaseName)}`);
      await client.query(`CREATE DATABASE ${client.escapeIdentifier(this.databaseName)}`);
    } finally {
      await client.end();
    }
    const url = new URL(this.adminUrl);
    url.pathname = `/${this.databaseName}`;
    return { harnessUrl: url.toString(), serviceUrl: url.toString() };
  }

  restartPostgres(): Promise<ColdStart> {
    // A shared server is never restarted here: its cache stays as it is (reported among the run's departures).
    return Promise.resolve({ restarted: false, cacheDropped: false });
  }

  async migrate(ownerServiceUrl: string, loginsEnv: Readonly<Record<string, string>>): Promise<void> {
    const node = process.execPath;
    const once = (script: string, env: NodeJS.ProcessEnv) =>
      run(node, [path.join(this.images.worker, script)], { env, cwd: this.images.worker }).catch((error: unknown) => {
        throw error instanceof CommandError ? new CommandError(`the migration task (${script})`, error.stderr) : error;
      });
    await once('dist/migrate.js', { ...process.env, DATABASE_URL: ownerServiceUrl });
    await once('dist/logins.js', { ...process.env, ...loginsEnv });
  }

  /** Creates the service's cgroups with its limits; the directories it is in. */
  private limit(spec: ServiceSpec): string[] {
    const name = `tp-capacity-${spec.name}`;
    const quota = Math.round(spec.limit.cpus * 100_000);
    const bytes = String(spec.limit.memoryMiB * MIB);
    if (this.cgroupVersion === 2) {
      const dir = path.join('/sys/fs/cgroup', name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'cpu.max'), `${String(quota)} 100000`);
      writeFileSync(path.join(dir, 'cpuset.cpus'), spec.cpuset);
      writeFileSync(path.join(dir, 'memory.max'), bytes);
      writeFileSync(path.join(dir, 'memory.swap.max'), '0');
      return [dir];
    }
    const cpu = path.join('/sys/fs/cgroup/cpu', name);
    const cpuset = path.join('/sys/fs/cgroup/cpuset', name);
    const memory = path.join('/sys/fs/cgroup/memory', name);
    for (const dir of [cpu, cpuset, memory]) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(path.join(cpu, 'cpu.cfs_period_us'), '100000');
    writeFileSync(path.join(cpu, 'cpu.cfs_quota_us'), String(quota));
    writeFileSync(path.join(cpuset, 'cpuset.cpus'), spec.cpuset);
    writeFileSync(path.join(cpuset, 'cpuset.mems'), readFileSync('/sys/fs/cgroup/cpuset/cpuset.mems', 'utf8').trim());
    writeFileSync(path.join(memory, 'memory.limit_in_bytes'), bytes);
    if (existsSync(path.join(memory, 'memory.memsw.limit_in_bytes'))) {
      writeFileSync(path.join(memory, 'memory.memsw.limit_in_bytes'), bytes);
    }
    // Counters from a previous run of the same service start again.
    writeFileSync(path.join(memory, 'memory.max_usage_in_bytes'), '0');
    return [cpu, cpuset, memory];
  }

  async startService(spec: ServiceSpec, label: string): Promise<void> {
    await this.stopService(spec.name);
    const dirs = this.limit(spec);
    this.cgroups.set(spec.name, dirs);
    const cwd = spec.name === 'web' ? this.images.web : this.images.worker;
    const env = { ...spec.env, PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...(spec.name === 'web' ? { PORT: String(this.webPort), HOSTNAME: '127.0.0.1' } : {}) };
    // The shell joins the cgroups, then becomes the service under taskset (processShellCommand), so nothing runs
    // outside the limits and its affinity is its whole cpuset.
    const child = spawn('sh', ['-c', processShellCommand(dirs, spec.cpuset, spec.command)], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const entry = { child, lines: [] as string[], exited: false };
    // The service's output beside the data directory, as `docker logs` keeps a container's: IDs, codes and numbers
    // only (the services' logger allowlist), synthetic data, never uploaded with the report.
    const logFile = path.join(path.dirname(this.dataDir.host), 'logs', `${spec.name}.log`);
    mkdirSync(path.dirname(logFile), { recursive: true });
    appendFileSync(logFile, `[harness] ${spec.name} started for ${label}\n`);
    let partial = '';
    child.stdout.on('data', (chunk: Buffer) => {
      appendFileSync(logFile, chunk);
      const text = partial + chunk.toString('utf8');
      const parts = text.split('\n');
      partial = parts.pop() ?? '';
      entry.lines.push(...parts);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      appendFileSync(logFile, chunk);
    });
    child.on('exit', (code, signal) => {
      appendFileSync(logFile, `[harness] ${spec.name} exited: code ${String(code)}, signal ${String(signal)}\n`);
      entry.exited = true;
    });
    this.children.set(spec.name, entry);
  }

  async stopService(name: ServiceName): Promise<void> {
    const entry = this.children.get(name);
    if (entry !== undefined && !entry.exited) {
      entry.child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          entry.child.kill('SIGKILL');
          resolve();
        }, 30_000);
        entry.child.on('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    this.children.delete(name);
    for (const dir of this.cgroups.get(name) ?? []) {
      try {
        rmdirSync(dir);
      } catch {
        // Still holding a process for a moment; the next start writes over its limits.
      }
    }
  }

  async stopServices(): Promise<void> {
    for (const name of [...this.children.keys()]) {
      await this.stopService(name);
    }
  }

  postgresStatus(): Promise<PostgresStatus> {
    // The caller's server: neither its cgroup nor a restart count is the harness's to read.
    return Promise.resolve({ oomKills: null, restarts: null, running: null });
  }

  logs(name: ServiceName): Promise<string[]> {
    return Promise.resolve([...(this.children.get(name)?.lines ?? [])]);
  }

  cgroupFile(name: ServiceName, file: string): Promise<string | null> {
    const dirs = this.cgroups.get(name) ?? [];
    const v1 = (controller: string) => dirs.find((dir) => dir.includes(`/${controller}/`));
    const at =
      this.cgroupVersion === 2
        ? dirs[0]
        : file.startsWith('memory.')
          ? v1('memory')
          : file.startsWith('cpuset.')
            ? v1('cpuset')
            : v1('cpu');
    if (at === undefined) {
      return Promise.resolve(null);
    }
    try {
      return Promise.resolve(readFileSync(path.join(at, file), 'utf8'));
    } catch {
      return Promise.resolve(null);
    }
  }

  async status(name: ServiceName): Promise<ServiceStatus> {
    const entry = this.children.get(name);
    const oom = this.cgroupVersion === 1 ? await this.cgroupFile(name, 'memory.oom_control') : await this.cgroupFile(name, 'memory.events');
    const killed = /oom_kill (\d+)/.exec(oom ?? '')?.[1];
    return { restarts: 0, oomKilled: killed !== undefined && killed !== '0', running: entry !== undefined && !entry.exited };
  }

  async applied(postgresServiceUrl: string): Promise<AppliedLimits> {
    const read = async (name: ServiceName): Promise<AppliedContainer> => {
      const affinity = this.affinity(name);
      if (this.cgroupVersion === 2) {
        const [quota, period] = ((await this.cgroupFile(name, 'cpu.max')) ?? 'max 100000').trim().split(' ');
        const memory = (await this.cgroupFile(name, 'memory.max'))?.trim();
        const swap = (await this.cgroupFile(name, 'memory.swap.max'))?.trim();
        const memoryBytes = memory === undefined || memory === 'max' ? null : Number.parseInt(memory, 10);
        return {
          name,
          nanoCpus: quota === undefined || quota === 'max' ? null : Math.round((Number.parseInt(quota, 10) * 1e9) / Number.parseInt(period ?? '100000', 10)),
          memoryBytes,
          memorySwapBytes: memoryBytes === null || swap !== '0' ? null : memoryBytes,
          cpuset: (await this.cgroupFile(name, 'cpuset.cpus'))?.trim() ?? null,
          affinity,
        };
      }
      const quota = Number.parseInt((await this.cgroupFile(name, 'cpu.cfs_quota_us')) ?? '-1', 10);
      const period = Number.parseInt((await this.cgroupFile(name, 'cpu.cfs_period_us')) ?? '100000', 10);
      const memory = (await this.cgroupFile(name, 'memory.limit_in_bytes'))?.trim();
      const swap = (await this.cgroupFile(name, 'memory.memsw.limit_in_bytes'))?.trim();
      return {
        name,
        nanoCpus: quota <= 0 ? null : Math.round((quota * 1e9) / period),
        memoryBytes: memory === undefined ? null : Number.parseInt(memory, 10),
        // Without swap accounting (memsw), no swap limit can be read back; the runner has no swap configured.
        memorySwapBytes: swap === undefined ? (existsSync('/proc/swaps') && readFileSync('/proc/swaps', 'utf8').trim().split('\n').length <= 1 && memory !== undefined ? Number.parseInt(memory, 10) : null) : Number.parseInt(swap, 10),
        cpuset: (await this.cgroupFile(name, 'cpuset.cpus'))?.trim() ?? null,
        affinity,
      };
    };
    // The caller's Postgres is not limited here; its round trip is measured as it is.
    const client = new pg.Client({ connectionString: postgresServiceUrl });
    await client.connect();
    const trips: number[] = [];
    try {
      for (let index = 0; index < 50; index += 1) {
        const started = performance.now();
        await client.query('SELECT 1');
        trips.push(performance.now() - started);
      }
    } finally {
      await client.end();
    }
    return {
      containers: [...(await Promise.all([...this.children.keys()].map((name) => read(name)))), { name: 'postgres', nanoCpus: null, memoryBytes: null, memorySwapBytes: null, cpuset: null }],
      ioMax: null,
      roundTripMedianMs: median(trips),
    };
  }

  /** The service's process's CPU affinity as the kernel reports it (Cpus_allowed_list), or null when it is not running. */
  private affinity(name: ServiceName): string | null {
    const pid = this.children.get(name)?.child.pid;
    if (pid === undefined) {
      return null;
    }
    try {
      return /Cpus_allowed_list:\s*(\S+)/.exec(readFileSync(`/proc/${String(pid)}/status`, 'utf8'))?.[1] ?? null;
    } catch {
      return null;
    }
  }

  async stopAll(): Promise<void> {
    await this.stopServices();
  }
}

/**
 * The process runtime's shell command for a service (pure: the test checks it): join each of its cgroups, then exec the
 * service under `taskset -c <cpuset>`, so its affinity is its whole cpuset whatever the harness's own was (see the
 * module comment).
 */
export function processShellCommand(cgroupDirs: readonly string[], cpuset: string, command: readonly string[]): string {
  if (!/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(cpuset)) {
    throw new RangeError('a cpuset is a list of CPUs and ranges, such as 2-3');
  }
  const join = cgroupDirs.map((dir) => `echo $$ > ${dir}/cgroup.procs`);
  return [...join, `exec taskset -c ${cpuset} ${command.join(' ')}`].join(' && ');
}
