import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import pg from 'pg';

import { type ContainerLimit, MIB, type PostgresLimit } from './limits';
import { type CgroupVersion, ioMax, median, psqlTimings } from './measure';
import type { AppliedContainer, AppliedLimits } from './report';

/**
 * Where the capacity test's three services run (audit #53 part 1; docs/adr/0062, "Capacity under production limits").
 *
 * DockerRuntime (CI, the measurement): the production images as containers under cgroup v2 limits equal to production's
 * task sizes; Postgres 18 with its CPUs, memory, gp3's I/O baseline on the device behind Docker's data root (io.max) and
 * a 1 ms delay each way on its interface (netem, set from the host in its network namespace); limits read back with
 * docker inspect and the container's own io.max, and the round trip measured from a client container.
 *
 * ProcessRuntime (a developer machine without Docker): the same build outputs laid out as the images lay them out
 * (dist and migrations for the worker, the standalone server for the web), run as processes in cgroups with the same
 * CPU quota, cpuset and memory with no swap (v2, or v1's cpu, cpuset and memory controllers), against a Postgres
 * server the caller names, which the harness cannot limit: its run reports Postgres's limits as not applied, so it
 * never passes for a CI run.
 */

const exec = promisify(execFile);

export type ServiceName = 'web' | 'platform';

export interface ServiceStatus {
  readonly restarts: number;
  readonly oomKilled: boolean;
  readonly running: boolean;
}

/** One service's environment and limits. */
export interface ServiceSpec {
  readonly name: ServiceName;
  readonly env: Readonly<Record<string, string>>;
  readonly limit: ContainerLimit;
  readonly cpuset: string;
}

export interface Runtime {
  readonly kind: 'docker' | 'process';
  readonly cgroupVersion: CgroupVersion;
  /** The directory the services share with the harness (outbox, local stores), as the harness sees it and as the services see it. */
  readonly dataDir: { readonly host: string; readonly service: string };
  /** Starts Postgres; its admin URL as the harness reaches it and as the services do. */
  startPostgres(limit: PostgresLimit, storage: { readonly iops: number; readonly bytesPerSecond: number }, delayMs: number): Promise<{ readonly harnessUrl: string; readonly serviceUrl: string }>;
  /** Restarts Postgres with a cold cache (the operating system's page cache dropped where the runner allows). */
  restartPostgres(): Promise<void>;
  /** The migration task: the migrations, then the logins, as the owner. */
  migrate(ownerServiceUrl: string, loginsEnv: Readonly<Record<string, string>>): Promise<void>;
  startService(spec: ServiceSpec): Promise<void>;
  stopService(name: ServiceName): Promise<void>;
  /** The service's log lines so far. */
  logs(name: ServiceName): Promise<string[]>;
  /** A file of the service's cgroup (memory.stat and the like), or null when it cannot be read. */
  cgroupFile(name: ServiceName, file: string): Promise<string | null>;
  status(name: ServiceName): Promise<ServiceStatus>;
  /** The limits as applied, read back. */
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

async function docker(...args: string[]): Promise<string> {
  const { stdout } = await exec('docker', args, { maxBuffer: 256 * MIB });
  return stdout;
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

  constructor(
    private readonly images: { readonly web: string; readonly worker: string },
    dataHost: string,
    private readonly postgresPort = 55_432,
  ) {
    this.dataDir = { host: dataHost, service: '/data' };
  }

  /** The block device behind Docker's data root (its whole disk). */
  private async dataDevice(): Promise<string> {
    const root = (await docker('info', '-f', '{{.DockerRootDir}}')).trim();
    const { stdout: source } = await exec('df', ['--output=source', root]);
    const partition = source.trim().split('\n').at(-1)?.trim() ?? '';
    const { stdout: parent } = await exec('lsblk', ['-no', 'pkname', partition]).catch(() => ({ stdout: '' }));
    return parent.trim() === '' ? partition : `/dev/${parent.trim()}`;
  }

  private postgresLimit: PostgresLimit | null = null;
  private storage: { readonly iops: number; readonly bytesPerSecond: number } | null = null;
  private delayMs = 0;

  async startPostgres(limit: PostgresLimit, storage: { readonly iops: number; readonly bytesPerSecond: number }, delayMs: number): Promise<{ readonly harnessUrl: string; readonly serviceUrl: string }> {
    this.postgresLimit = limit;
    this.storage = storage;
    this.delayMs = delayMs;
    await docker('network', 'create', this.network).catch(() => '');
    await docker(...postgresRunArgs(limit, storage, { network: this.network, device: await this.dataDevice(), port: this.postgresPort }));
    await waitFor('Postgres', async () => (await exec('docker', ['exec', 'tp-capacity-postgres', 'pg_isready', '-U', 'postgres'])).stdout.includes('accepting'), 120_000);
    await this.delay();
    return { harnessUrl: `postgres://postgres:test@127.0.0.1:${String(this.postgresPort)}/postgres`, serviceUrl: 'postgres://postgres:test@db:5432/postgres' };
  }

  /** netem on Postgres's interface, set from the host in its network namespace. */
  private async delay(): Promise<void> {
    const pid = (await docker('inspect', '-f', '{{.State.Pid}}', 'tp-capacity-postgres')).trim();
    await exec('sudo', ['nsenter', '-t', pid, '-n', 'tc', 'qdisc', 'replace', 'dev', 'eth0', 'root', 'netem', 'delay', `${String(this.delayMs)}ms`]);
  }

  async restartPostgres(): Promise<void> {
    await docker('restart', 'tp-capacity-postgres');
    await exec('sudo', ['sh', '-c', 'sync && echo 3 > /proc/sys/vm/drop_caches']).catch(() => undefined);
    await waitFor('Postgres', async () => (await exec('docker', ['exec', 'tp-capacity-postgres', 'pg_isready', '-U', 'postgres'])).stdout.includes('accepting'), 120_000);
    await this.delay();
  }

  async migrate(ownerServiceUrl: string, loginsEnv: Readonly<Record<string, string>>): Promise<void> {
    const run = (command: string, env: Readonly<Record<string, string>>) =>
      docker('run', '--rm', '--network', this.network, ...Object.entries(env).flatMap(([name, value]) => ['-e', `${name}=${value}`]), this.images.worker, 'node', command);
    await run('dist/migrate.js', { DATABASE_URL: ownerServiceUrl });
    await run('dist/logins.js', loginsEnv);
  }

  async startService(spec: ServiceSpec): Promise<void> {
    await docker('rm', '-f', `tp-capacity-${spec.name}`).catch(() => '');
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
    await docker('rm', '-f', `tp-capacity-${name}`).catch(() => '');
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

  async applied(_postgresServiceUrl?: string): Promise<AppliedLimits> {
    const inspect = async (name: 'web' | 'platform' | 'postgres'): Promise<AppliedContainer> => {
      const text = (await docker('inspect', '-f', '{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}} {{.HostConfig.MemorySwap}} {{.HostConfig.CpusetCpus}}', `tp-capacity-${name}`)).trim();
      const [cpus, memory, swap, cpuset] = text.split(' ');
      const number = (value: string | undefined) => (value === undefined || value === '0' ? null : Number.parseInt(value, 10));
      return { name, nanoCpus: number(cpus), memoryBytes: number(memory), memorySwapBytes: number(swap), cpuset: cpuset === undefined || cpuset === '' ? null : cpuset };
    };
    const ioText = await docker('exec', 'tp-capacity-postgres', 'cat', '/sys/fs/cgroup/io.max').catch(() => '');
    const line = ioMax(ioText)[0];
    const { stdout: timing } = await exec('sh', ['-c', `printf '%s\\n' "$1" | docker run --rm -i --network ${this.network} --cpuset-cpus=${this.postgresLimit?.taskCpuset ?? '0'} postgres:18 psql -X -q postgres://postgres:test@db:5432/postgres`, 'sh', ROUND_TRIP_SCRIPT]).catch(() => ({ stdout: '' }));
    return {
      containers: [await inspect('web'), await inspect('platform'), await inspect('postgres')],
      ioMax: line === undefined ? null : { riops: line.riops, wiops: line.wiops, rbps: line.rbps, wbps: line.wbps },
      roundTripMedianMs: median(psqlTimings(timing)),
    };
  }

  async stopAll(): Promise<void> {
    for (const name of ['web', 'platform', 'postgres']) {
      await docker('rm', '-f', `tp-capacity-${name}`).catch(() => '');
    }
    await docker('network', 'rm', this.network).catch(() => '');
  }
}

/** cgroup v1's controllers the process runtime limits with, or v2's unified tree. */
function cgroupVersion(): CgroupVersion {
  return existsSync('/sys/fs/cgroup/cgroup.controllers') ? 2 : 1;
}

/** The images' layout of the build outputs, under a directory: worker/dist and worker/migrations, web/ the standalone server. */
export interface ProcessImages {
  readonly worker: string;
  readonly web: string;
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

  async restartPostgres(): Promise<void> {
    // A shared server is never restarted here: its cache stays as it is (reported among the run's departures).
  }

  async migrate(ownerServiceUrl: string, loginsEnv: Readonly<Record<string, string>>): Promise<void> {
    const node = process.execPath;
    await exec(node, [path.join(this.images.worker, 'dist/migrate.js')], { env: { ...process.env, DATABASE_URL: ownerServiceUrl }, cwd: this.images.worker });
    await exec(node, [path.join(this.images.worker, 'dist/logins.js')], { env: { ...process.env, ...loginsEnv }, cwd: this.images.worker });
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

  async startService(spec: ServiceSpec): Promise<void> {
    await this.stopService(spec.name);
    const dirs = this.limit(spec);
    this.cgroups.set(spec.name, dirs);
    const join = dirs.map((dir) => `echo $$ > ${dir}/cgroup.procs`).join(' && ');
    const [command, cwd] = spec.name === 'web' ? ['node apps/web/server.js', this.images.web] : ['node --enable-source-maps dist/main.js', this.images.worker];
    const env = { ...spec.env, PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...(spec.name === 'web' ? { PORT: String(this.webPort), HOSTNAME: '127.0.0.1' } : {}) };
    // The shell joins the cgroups before it becomes the service, so nothing runs outside the limits.
    const child = spawn('sh', ['-c', `${join} && exec ${command}`], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const entry = { child, lines: [] as string[], exited: false };
    // The service's output beside the data directory, as `docker logs` keeps a container's: IDs, codes and numbers
    // only (the services' logger allowlist), synthetic data, never uploaded with the report.
    const logFile = path.join(path.dirname(this.dataDir.host), 'logs', `${spec.name}.log`);
    mkdirSync(path.dirname(logFile), { recursive: true });
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
      containers: [await read('web'), await read('platform'), { name: 'postgres', nanoCpus: null, memoryBytes: null, memorySwapBytes: null, cpuset: null }],
      ioMax: null,
      roundTripMedianMs: median(trips),
    };
  }

  async stopAll(): Promise<void> {
    await this.stopService('web');
    await this.stopService('platform');
  }
}
