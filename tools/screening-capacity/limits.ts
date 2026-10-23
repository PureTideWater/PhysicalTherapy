import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type EnvironmentSettings, type ServiceSettings, environmentSettings } from '../../infra/lib/environments';
import { repositoryRoot } from '../content-files';

/**
 * The limits the screening capacity test runs under (audit #53 part 1; docs/adr/0062, "Capacity under production
 * limits"; the founder's rulings of 2026-10-20, decisions 13 to 16, of 2026-10-21, Q1 (a), and of 2026-10-23 on the
 * runner): production's task sizes and database class, read from infra/lib/environments.ts and
 * infra/lib/constructs/database.ts, never typed here, through tables that throw on a class or storage type they do not
 * know; the layout that gives each service CPUs of its own on GitHub's 8-core runner, as production has them; and the
 * time verdict's thresholds and its switch.
 *
 * The time verdict is "open, PR 6b" while environments.ts declares no screening consumer (compute.screening) and fails
 * the job from the moment it does: the switch is screeningConsumer() below, read from the same settings the stacks
 * deploy, and report.test.ts proves both sides. PR 6b-3 declares it (2 vCPU, 4 GiB, one task, three screenings at once)
 * and the harness runs it as production will (HARNESS_RUNS_SCREENING_CONSUMER), so time is enforced: above 48 s on the
 * runner fails ("allowance") until staging measures how much faster the runner's cores are than Fargate's
 * (RUNNER_TO_FARGATE); from then on the limit is 60 s scaled by that factor ("promise").
 */

export const MIB = 1024 * 1024;

/** One container's limits: whole and fractional vCPUs, and memory with no swap. */
export interface ContainerLimit {
  /** vCPUs, as Docker's --cpus takes them (a quarter is 0.25). */
  readonly cpus: number;
  readonly memoryMiB: number;
}

/** A Fargate task size (CPU units of 1024 a vCPU, memory in MiB) as a container limit. */
export function taskLimit(task: { readonly cpu: number; readonly memoryMiB: number }): ContainerLimit {
  return { cpus: task.cpu / 1024, memoryMiB: task.memoryMiB };
}

/** RDS instance classes the stacks use or may: vCPUs and memory. An unknown class throws. */
export const DATABASE_CLASSES: Readonly<Record<string, { readonly vcpus: number; readonly memoryMiB: number }>> = {
  't4g.micro': { vcpus: 2, memoryMiB: 1024 },
  't4g.small': { vcpus: 2, memoryMiB: 2048 },
  't4g.medium': { vcpus: 2, memoryMiB: 4096 },
  't4g.large': { vcpus: 2, memoryMiB: 8192 },
  't4g.xlarge': { vcpus: 4, memoryMiB: 16_384 },
};

/** RDS storage types' I/O baseline (no burst): operations a second each way, and bytes a second. An unknown type throws. */
export const STORAGE_TYPES: Readonly<Record<string, { readonly iops: number; readonly bytesPerSecond: number }>> = {
  gp3: { iops: 3000, bytesPerSecond: 125 * MIB },
};

export function databaseClass(instanceType: string): { readonly vcpus: number; readonly memoryMiB: number } {
  const found = DATABASE_CLASSES[instanceType];
  if (found === undefined) {
    throw new RangeError(`no limits are known for the database class ${instanceType}; add it to DATABASE_CLASSES`);
  }
  return found;
}

export function storageBaseline(storageType: string): { readonly iops: number; readonly bytesPerSecond: number } {
  const found = STORAGE_TYPES[storageType];
  if (found === undefined) {
    throw new RangeError(`no I/O baseline is known for the storage type ${storageType}; add it to STORAGE_TYPES`);
  }
  return found;
}

/** The storage type the database construct deploys (rds.StorageType.X in its source), lower-cased. */
export function storageTypeOf(constructSource: string): string {
  const types = [...constructSource.matchAll(/storageType:\s*rds\.StorageType\.([A-Z0-9_]+)/g)].map((match) => (match[1] ?? '').toLowerCase());
  const distinct = [...new Set(types)];
  if (distinct.length !== 1) {
    throw new RangeError(`the database construct names ${distinct.length === 0 ? 'no' : 'more than one'} storage type`);
  }
  return distinct[0] as string;
}

/**
 * The screening's own consumer as environments.ts declares it (compute.screening, PR 6b-3): its task size, how many
 * tasks run, and how many screenings each prices at once (one worker thread each). The harness reads desiredCount and
 * ignores when production starts it.
 */
export interface ScreeningConsumer extends ServiceSettings {
  /** Screenings one task prices at once. */
  readonly concurrency: number;
}

/** The consumer environments.ts declares, or null for settings that declare none (a test's, or an older checkout's). */
export function screeningConsumer(settings: EnvironmentSettings): ScreeningConsumer | null {
  const compute: { readonly screening?: ScreeningConsumer } = settings.compute;
  return compute.screening ?? null;
}

/**
 * Whether the harness runs the consumer as production will: a WORKER_JOBS=screening service per task, on the screening
 * login, at the declared size and concurrency, beside a platform service that prices no screening (env.ts,
 * screeningEnvironment; run.ts). A consumer declared while this is false fails the run ("consumer not run"), so time is
 * never enforced over the wrong topology.
 */
export const HARNESS_RUNS_SCREENING_CONSUMER = true;

/** Production's limits as the test applies them. */
export interface ProductionLimits {
  readonly web: ContainerLimit;
  /** The platform task, which no longer prices a screening (PR 6b-3). */
  readonly platform: ContainerLimit;
  /** The consumer as declared, or null when the settings declare none (the harness then stops: run.ts). */
  readonly screeningConsumer: ScreeningConsumer | null;
  /** One consumer task's limits; null without a consumer. */
  readonly screening: ContainerLimit | null;
  /** Consumer tasks, each its own container (0 without a consumer). */
  readonly screeningTasks: number;
  /** Screenings each consumer task prices at once (0 without a consumer). */
  readonly screeningConcurrency: number;
  readonly database: { readonly instanceType: string; readonly vcpus: number; readonly memoryMiB: number; readonly storageType: string; readonly iops: number; readonly bytesPerSecond: number };
  /** The CPUs each service takes on the runner (cpuNeeds), from the same settings. */
  readonly cpuNeeds: CpuNeeds;
}

export function productionLimits(settings: EnvironmentSettings = environmentSettings('production'), databaseSource: string = readFileSync(path.join(repositoryRoot, 'infra/lib/constructs/database.ts'), 'utf8')): ProductionLimits {
  const instanceType = settings.database.instanceType.toString();
  const storageType = storageTypeOf(databaseSource);
  const consumer = screeningConsumer(settings);
  return {
    web: taskLimit(settings.compute.web),
    platform: taskLimit(settings.compute.platform),
    screeningConsumer: consumer,
    screening: consumer === null ? null : taskLimit(consumer),
    screeningTasks: consumer?.desiredCount ?? 0,
    screeningConcurrency: consumer?.concurrency ?? 0,
    database: { instanceType, ...databaseClass(instanceType), storageType, ...storageBaseline(storageType) },
    cpuNeeds: cpuNeeds(settings),
  };
}

/**
 * The CPUs the harness, its child processes (the release's build and load, the oracles) and Chromium take: two of their
 * own, after every service's, where the free 4-CPU runner put them on Postgres's.
 */
export const HARNESS_CPUS = 2;

/** The CPUs each service takes on the runner, in the layout's order. */
export interface CpuNeeds {
  /** The database class's vCPUs (db.t4g.medium's 2). */
  readonly postgres: number;
  /** ⌈vCPUs × tasks⌉ of the screening consumer (compute.screening's 2), 0 without one. */
  readonly consumer: number;
  /** ⌈the web task's vCPU⌉ (half a vCPU: 1); the harness runs one web container where production runs two. */
  readonly web: number;
  /** ⌈the platform task's vCPU⌉ (a quarter vCPU: 1). */
  readonly platform: number;
  /** HARNESS_CPUS. */
  readonly harness: number;
}

/**
 * Each service's CPUs, from the sizes environments.ts declares for the settings given (production's for the harness and
 * the launch check): never a typed number, so a resized task moves the layout and what the runner needs with it. Reads
 * no construct source, so the launch check computes production's layout at synthesis from the settings alone.
 */
export function cpuNeeds(settings: EnvironmentSettings): CpuNeeds {
  const consumer = screeningConsumer(settings);
  return {
    postgres: databaseClass(settings.database.instanceType.toString()).vcpus,
    consumer: consumer === null ? 0 : Math.ceil(taskLimit(consumer).cpus * consumer.desiredCount),
    web: Math.ceil(taskLimit(settings.compute.web).cpus),
    platform: Math.ceil(taskLimit(settings.compute.platform).cpus),
    harness: HARNESS_CPUS,
  };
}

/** The runner the test finds itself on. */
export interface Runner {
  readonly cpus: number;
  readonly memoryMiB: number;
  readonly cpuModel: string;
  readonly kernel: string;
}

/** What the browser, the harness and the system keep for themselves on the runner. */
export const RUNNER_RESERVE_MIB = 2560;
/** The least memory Postgres may have; below it the runner is too small. */
export const MIN_POSTGRES_MIB = 2048;

/**
 * Where everything runs on the runner (the design's §5.1, as the founder's ruling of 2026-10-23 on the runner changed
 * it): each service on CPUs of its own, as production has them, laid out from cpuNeeds in order. On GitHub's 8-core
 * runner: Postgres 0-1 (db.t4g.medium's 2 vCPU), the consumer 2-3 (compute.screening's 2 vCPU), the web 4 and the
 * platform 5 (each its fractional quota within a CPU of its own), and the harness, its child processes and Chromium
 * 6-7. A larger runner leaves its spare CPUs idle, so every runner measures the same layout. On the free 4-CPU runner
 * the harness shared Postgres's CPUs and the web and the platform the consumer's last, a contention production does not
 * have, which swung the same code's S4 from 38 to 57 s with the host's speed.
 */
export interface CpuLayout {
  readonly postgres: string;
  readonly consumer: string;
  readonly web: string;
  readonly platform: string;
  /** The harness, its child processes and Chromium (the workflow pins them here with taskset: --print-harness-cpus). */
  readonly harness: string;
}

/** The services of a layout in its order, as its sentences name them. */
const LAYOUT_SERVICES: readonly { readonly key: keyof CpuLayout; readonly name: string }[] = [
  { key: 'postgres', name: 'Postgres' },
  { key: 'consumer', name: 'the screening consumer' },
  { key: 'web', name: 'the web' },
  { key: 'platform', name: 'the platform' },
  { key: 'harness', name: 'the harness' },
];

/** A run of CPUs as a cpuset and taskset take it ("2-3", or "3" for one). */
function cpuRange(first: number, count: number): string {
  const last = first + Math.max(1, count) - 1;
  return last === first ? String(first) : `${String(first)}-${String(last)}`;
}

/** The layout: each service's CPUs after the one before's, each at least one CPU. */
export function cpuLayout(needs: CpuNeeds): CpuLayout {
  let next = 0;
  const take = (count: number): string => {
    const range = cpuRange(next, count);
    next += Math.max(1, count);
    return range;
  };
  return { postgres: take(needs.postgres), consumer: take(needs.consumer), web: take(needs.web), platform: take(needs.platform), harness: take(needs.harness) };
}

/** The CPUs the measurement needs: every service's own, as the layout takes them (eight for production's sizes). */
export function requiredCpus(limits: Pick<ProductionLimits, 'cpuNeeds'>): number {
  const { postgres, consumer, web, platform, harness } = limits.cpuNeeds;
  return [postgres, consumer, web, platform, harness].reduce((sum, count) => sum + Math.max(1, count), 0);
}

/** The CPUs a cpuset names ("0-1,4" is 0, 1 and 4), or null when it is not a list of CPUs and ranges. */
function cpusOf(cpuset: string): number[] | null {
  if (!/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(cpuset)) {
    return null;
  }
  return cpuset.split(',').flatMap((part) => {
    const [first = 0, last = first] = part.split('-').map(Number);
    return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
  });
}

/** CPUs as a cpuset names them, runs of consecutive CPUs as ranges ("0-1,4"). */
function cpusetOf(cpus: readonly number[]): string {
  const runs: string[] = [];
  let start = cpus[0];
  for (let index = 0; start !== undefined && index < cpus.length; index += 1) {
    const current = cpus[index] as number;
    const next = cpus[index + 1];
    if (next !== current + 1) {
      runs.push(cpuRange(start, current - start + 1));
      start = next;
    }
  }
  return runs.join(',');
}

/** "a, b and c". */
function listed(names: readonly string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

/**
 * Why a layout is not one of CPUs of their own: each set of CPUs two or more services share, named once with every
 * service on it, and a service whose CPUs are not a list of CPUs; empty when every service has CPUs of its own. The
 * verdict fails a report whose layout this names, and the launch check refuses it.
 */
export function layoutProblems(layout: CpuLayout): string[] {
  const problems: string[] = [];
  const onCpu = new Map<number, string[]>();
  for (const { key, name } of LAYOUT_SERVICES) {
    const cpus = cpusOf(String(layout[key]));
    if (cpus === null) {
      problems.push(`${name}’s CPUs ${String(layout[key])} are not a list of CPUs`);
      continue;
    }
    for (const cpu of cpus) {
      onCpu.set(cpu, [...(onCpu.get(cpu) ?? []), name]);
    }
  }
  // The CPUs each group of services shares, in the order of their first CPU.
  const shared = new Map<string, { readonly names: readonly string[]; readonly cpus: number[] }>();
  for (const [cpu, names] of [...onCpu.entries()].sort(([a], [b]) => a - b)) {
    if (names.length > 1) {
      const group = shared.get(names.join('\n')) ?? { names, cpus: [] };
      group.cpus.push(cpu);
      shared.set(names.join('\n'), group);
    }
  }
  for (const { names, cpus } of shared.values()) {
    problems.push(`${listed(names)} share CPU${cpus.length === 1 ? '' : 's'} ${cpusetOf(cpus)}`);
  }
  return problems;
}

/** The layout in one sentence, for the summary and the launch check's reasons. */
export function layoutText(layout: CpuLayout): string {
  const [postgres, ...rest] = LAYOUT_SERVICES.map(({ key, name }) => `${name === 'the harness' ? 'the harness with Chromium' : name} on ${key === 'postgres' ? 'CPUs ' : ''}${String(layout[key])}`);
  return `${postgres ?? ''}, ${listed(rest)}`;
}

/** Postgres's limits on the runner: the class's vCPUs on its own CPUs, and its memory. */
export interface PostgresLimit {
  readonly cpus: number;
  /** The class's memory, or what the runner leaves after every task and the reserve. */
  readonly memoryMiB: number;
  /** Postgres's own CPUs: the layout's first, as many as the class has vCPUs. */
  readonly cpuset: string;
}

export function postgresLimit(runner: Runner, limits: ProductionLimits): PostgresLimit {
  const tasksMiB = limits.web.memoryMiB + limits.platform.memoryMiB + (limits.screening?.memoryMiB ?? 0) * limits.screeningTasks;
  const memory = Math.min(limits.database.memoryMiB, runner.memoryMiB - tasksMiB - RUNNER_RESERVE_MIB);
  return { cpus: limits.database.vcpus, memoryMiB: memory, cpuset: cpuLayout(limits.cpuNeeds).postgres };
}

/**
 * The CPUs the workflow pins the harness, its child processes and Chromium to (`--print-harness-cpus`): the layout's
 * own, never a service's. On a runner too small for the layout, every CPU it has, so the harness still starts and
 * reports it ("runner too small") instead of taskset refusing CPUs the runner lacks.
 */
export function harnessCpus(runner: Runner, limits: ProductionLimits): string {
  return runner.cpus >= requiredCpus(limits) ? cpuLayout(limits.cpuNeeds).harness : cpuRange(0, runner.cpus);
}

/** Why the runner is too small to measure on, each service's need named; empty when it is not. */
export function runnerTooSmall(runner: Runner, limits: ProductionLimits): string[] {
  const reasons: string[] = [];
  const needed = requiredCpus(limits);
  if (runner.cpus < needed) {
    const needs = limits.cpuNeeds;
    const each = [
      `${String(needs.postgres)} for Postgres (db.${limits.database.instanceType}’s)`,
      `${String(needs.consumer)} for the screening consumer (compute.screening’s)`,
      `${String(needs.web)} for the web`,
      `${String(needs.platform)} for the platform`,
      `${String(needs.harness)} for the harness, its child processes and Chromium`,
    ];
    reasons.push(`the runner has ${String(runner.cpus)} CPU${runner.cpus === 1 ? '' : 's'}; the test needs ${String(needed)}, each service on CPUs of its own: ${listed(each)}`);
  }
  const postgres = postgresLimit(runner, limits);
  if (postgres.memoryMiB < MIN_POSTGRES_MIB) {
    reasons.push(`Postgres would have ${String(postgres.memoryMiB)} MiB; the test needs ${String(MIN_POSTGRES_MIB)} MiB`);
  }
  return reasons;
}

/**
 * Each way, the network delay put on Postgres's link (netem on its own interface, which delays what it sends, and on the
 * host's end of its link, which delays what it receives; containers.ts, netemCommands): a 2 ms round trip, more than an
 * in-VPC trip with Multi-AZ's commit.
 */
export const NETWORK_DELAY_MS = 1;
/** The least median round trip from a client container on the services' network that proves the delay applied both ways. */
export const MIN_ROUND_TRIP_MS = 2;
/** A sampled anonymous memory above this share of a task's limit fails the run. */
export const MEMORY_LIMIT_PERCENT = 90;

/** The time verdict's thresholds (decision 15): 48 s on the runner while the factor is unknown; 60 s the promise. */
export const TIME_ALLOWANCE_MS = 48_000;
export const TIME_PROMISE_MS = 60_000;
/**
 * How many times faster the runner prices than the production consumer (Fargate time over runner time), once staging
 * measures it; null until then, and the 48 s allowance applies.
 */
export const RUNNER_TO_FARGATE: number | null = null;
/**
 * How far below the harness's time the consumer's logged time to email (TimeToEmailMs) may be: the harness's clock starts
 * at the browser's POST, the metric's at the web's received_at once the request reaches the handler, and the upload's
 * transfer over loopback takes well under this. A logged time further below would mean the metric leaves out the web's
 * share or the send (the design's §5.3).
 */
export const TIME_METRIC_BELOW_MS = 2_000;
/** A scenario stops at this cap; an upload not emailed by then fails. */
export const SCENARIO_CAP_MS = 30 * 60_000;
/**
 * A run in pricing that records no batch for this long has stalled, and so has a run still queued while nothing in its
 * scenario moved (no batch recorded, no run claimed or finished, no email) for this long.
 */
export const STALL_MS = 5 * 60_000;
/**
 * The harness's own deadlines inside the job's 100 minutes (screening-capacity.yml's timeout-minutes; the image builds,
 * the install, the browser and the release take up to about 15 before the harness starts): no scenario starts after 60
 * minutes of the harness, and one still running at 70 ends there, its uploads not emailed by then failing, so the oracle
 * and the report always have time to be written. The report is also written after every scenario. S4's two more runs
 * (the founder's ruling of 2026-10-23) add about 3 minutes to a harness that took 9 to 11 on CI, far inside them, so
 * the deadlines stay where they were and the job's 10 more minutes are margin.
 */
export const SCENARIO_START_DEADLINE_MS = 60 * 60_000;
export const HARNESS_DEADLINE_MS = 70 * 60_000;
