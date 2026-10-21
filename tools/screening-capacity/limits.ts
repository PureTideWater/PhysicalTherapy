import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type EnvironmentSettings, type ServiceSettings, environmentSettings } from '../../infra/lib/environments';
import { repositoryRoot } from '../content-files';

/**
 * The limits the screening capacity test runs under (audit #53 part 1; docs/adr/0062, "Capacity under production
 * limits"; the founder's rulings of 2026-10-20, decisions 13 to 16): production's task sizes and database class,
 * read from infra/lib/environments.ts and infra/lib/constructs/database.ts, never typed here, through tables that
 * throw on a class or storage type they do not know; the rule that sizes Postgres to the runner; and the time verdict's
 * thresholds and its switch.
 *
 * The time verdict is "open, PR 6b" while environments.ts declares no screening consumer (compute.screening, which PR
 * 6b adds with its size and concurrency) and fails the job from the moment it does: the switch is screeningConsumer()
 * below, read from the same settings the stacks deploy, and report.test.ts proves both sides. With the consumer
 * declared, a time above 48 s on the runner fails ("allowance") until staging measures how much faster the runner's
 * cores are than Fargate's (RUNNER_TO_FARGATE); from then on the limit is 60 s scaled by that factor ("promise").
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

/** The screening's own consumer, once PR 6b declares it in environments.ts (compute.screening); null until then. */
export interface ScreeningConsumer extends ServiceSettings {
  /** Screenings it prices at once. */
  readonly concurrency?: number;
}

export function screeningConsumer(settings: EnvironmentSettings): ScreeningConsumer | null {
  const compute = settings.compute as EnvironmentSettings['compute'] & { readonly screening?: ScreeningConsumer };
  return compute.screening ?? null;
}

/** Production's limits as the test applies them. */
export interface ProductionLimits {
  readonly web: ContainerLimit;
  /** The platform task, or the screening consumer once declared (the container the screening job runs in). */
  readonly platform: ContainerLimit;
  readonly screeningConsumer: ScreeningConsumer | null;
  readonly database: { readonly instanceType: string; readonly vcpus: number; readonly memoryMiB: number; readonly storageType: string; readonly iops: number; readonly bytesPerSecond: number };
}

export function productionLimits(settings: EnvironmentSettings = environmentSettings('production'), databaseSource: string = readFileSync(path.join(repositoryRoot, 'infra/lib/constructs/database.ts'), 'utf8')): ProductionLimits {
  const instanceType = settings.database.instanceType.toString();
  const storageType = storageTypeOf(databaseSource);
  const consumer = screeningConsumer(settings);
  return {
    web: taskLimit(settings.compute.web),
    platform: taskLimit(consumer ?? settings.compute.platform),
    screeningConsumer: consumer,
    database: { instanceType, ...databaseClass(instanceType), storageType, ...storageBaseline(storageType) },
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
/** The fewest CPUs the runner may have: one for web and platform, one at least for Postgres and the harness. */
export const MIN_RUNNER_CPUS = 2;

/** Postgres's share of the runner: at most the database class's, and what is left of the runner after the tasks and the reserve. */
export interface PostgresLimit {
  readonly cpus: number;
  readonly memoryMiB: number;
  /** The CPUs Postgres, the harness and the browsers are pinned to: all but the last. */
  readonly cpuset: string;
  /** The CPU web and platform share (their quotas are fractions of it): the last. */
  readonly taskCpuset: string;
}

export function postgresLimit(runner: Runner, limits: ProductionLimits): PostgresLimit {
  const memory = Math.min(limits.database.memoryMiB, runner.memoryMiB - (limits.web.memoryMiB + limits.platform.memoryMiB) - RUNNER_RESERVE_MIB);
  const cpus = Math.max(0, Math.min(limits.database.vcpus, runner.cpus - 1));
  return { cpus, memoryMiB: memory, cpuset: runner.cpus <= 2 ? '0' : `0-${String(runner.cpus - 2)}`, taskCpuset: String(Math.max(0, runner.cpus - 1)) };
}

/** Why the runner is too small to measure on; empty when it is not. */
export function runnerTooSmall(runner: Runner, limits: ProductionLimits): string[] {
  const reasons: string[] = [];
  if (runner.cpus < MIN_RUNNER_CPUS) {
    reasons.push(`the runner has ${String(runner.cpus)} CPU; the test needs ${String(MIN_RUNNER_CPUS)}`);
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
/** A scenario stops at this cap; an upload not emailed by then fails. */
export const SCENARIO_CAP_MS = 30 * 60_000;
/**
 * A run in pricing that records no batch for this long has stalled, and so has a run still queued while nothing in its
 * scenario moved (no batch recorded, no run claimed or finished, no email) for this long.
 */
export const STALL_MS = 5 * 60_000;
/**
 * The harness's own deadlines inside the job's 90 minutes (screening-capacity.yml's timeout-minutes; the image builds,
 * the install, the browser and the release take up to about 15 before the harness starts): no scenario starts after 60
 * minutes of the harness, and one still running at 70 ends there, its uploads not emailed by then failing, so the oracle
 * and the report always have time to be written. The report is also written after every scenario.
 */
export const SCENARIO_START_DEADLINE_MS = 60 * 60_000;
export const HARNESS_DEADLINE_MS = 70 * 60_000;
