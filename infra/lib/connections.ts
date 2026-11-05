import { WEB_POOL_CONNECTIONS } from '../../apps/web/src/lib/server/pools';
import { type TaskPool, workerTaskPools } from '../../apps/worker/src/pools';
import { databaseClass } from '../../tools/screening-capacity/limits';
import { WEB_ESIGN_PROVIDER, WORKER_JOBS } from './constructs/compute';
import { DATABASE_PARAMETERS } from './constructs/database';
import type { EnvironmentName, EnvironmentSettings, ServiceSettings } from './environments';

/**
 * The database's connection budget, checked at synthesis for every environment (docs/adr/0083, "The practice pool";
 * Lane A's orchestrator's addition of 2026-11-04): the most connections every task the environment can run at once
 * could hold, each of its pools full, plus a reserve, must stay under the connections its instance class gives the
 * application logins. A stack over budget does not synthesize, so no deploy can start one; PlatformStack runs the check.
 *
 * - Tasks: each service at the most ECS runs at once, its desired count times its own deployment's maxHealthyPercent
 *   (environments.ts: 200 where it starts the new tasks before it stops the old ones, every service but dev's worker;
 *   100 where it stops them first, dev's worker), and the migration task.
 * - Pools: read from the apps, where they are opened (apps/web/src/lib/server/pools.ts; apps/worker/src/pools.ts, the
 *   practice pool's PRACTICE_JOB_SLOTS among them), never typed here.
 * - The instance's connections: the parameter group's max_connections where it sets one (DATABASE_PARAMETERS), else RDS
 *   for PostgreSQL's documented default, LEAST({DBInstanceClassMemory/9531392}, 5000), less the connections PostgreSQL
 *   and RDS keep for superusers (RDS_RESERVED_CONNECTIONS).
 */

/** RDS for PostgreSQL's default max_connections: LEAST({DBInstanceClassMemory/9531392}, 5000). */
export const RDS_BYTES_PER_CONNECTION = 9_531_392;
export const RDS_MAX_CONNECTIONS_CAP = 5_000;

/**
 * Connections the application logins cannot use: PostgreSQL's superuser_reserved_connections (3, which RDS keeps for its
 * own rdsadmin) and RDS's rds.rds_superuser_reserved_connections (2, for rds_superuser members). Neither is set in the
 * parameter group, so both are RDS's defaults.
 */
export const RDS_RESERVED_CONNECTIONS = 3 + 2;

const MIB = 1024 * 1024;

/**
 * DBInstanceClassMemory, which the default divides: the class's memory less what RDS keeps for the operating system and
 * its own processes. RDS publishes the formula, not that figure per class, so the budget takes the class's memory less
 * the larger of 512 MiB and an eighth of it, which stays below what RDS for PostgreSQL 17 reported on the classes of the
 * same memory (191 connections at 2 GiB, 402 at 4 GiB and 841 at 8 GiB, where the whole memory would give 225, 450 and
 * 901): so the budget never counts on a connection the instance may not have, and its alarm (infra/lib/constructs/
 * monitoring.ts) fires early rather than late.
 */
export function classMemoryBytes(memoryMiB: number): number {
  return (memoryMiB - Math.max(512, memoryMiB / 8)) * MIB;
}

/** The instance's max_connections: the parameter group's, where it sets one, else RDS's default for the class. */
export function maxConnections(instanceType: string, parameters: Readonly<Record<string, string>> = DATABASE_PARAMETERS): number {
  const set = parameters.max_connections;
  if (set !== undefined) {
    if (!/^[1-9][0-9]*$/.test(set)) {
      throw new RangeError(`the parameter group's max_connections is ${set}; the connection budget reads a whole number only`);
    }
    return Number(set);
  }
  return Math.min(Math.floor(classMemoryBytes(databaseClass(instanceType).memoryMiB) / RDS_BYTES_PER_CONNECTION), RDS_MAX_CONNECTIONS_CAP);
}

/** The migration task: the migrator, then the logins step, each one client (packages/db/src/migrate.ts, apps/worker/src/deploy/logins-cli.ts). */
export const MIGRATION_TASK_CONNECTIONS = 1;

/**
 * Connections held back for what no task's pool counts: the seven Secrets Manager rotation functions, one connection
 * each should all run at once (infra/lib/constructs/database.ts), and three for a person's session.
 */
export const RESERVE_CONNECTIONS = 10;

/** The DatabaseConnections alarm's line: this percentage of max_connections (infra/lib/constructs/monitoring.ts). */
export const DATABASE_CONNECTIONS_ALARM_PERCENT = 80;

/** One kind of task in the budget: how many can run at once, and what each one's pools hold. */
export interface BudgetLine {
  readonly service: 'web' | 'worker' | 'platform' | 'screening' | 'migration';
  readonly tasks: number;
  readonly pools: readonly TaskPool[];
  /** The connections one task's pools hold, all of them full. */
  readonly perTask: number;
  /** tasks x perTask. */
  readonly connections: number;
}

export interface ConnectionBudget {
  readonly environment: EnvironmentName;
  /** The class as the settings name it (t4g.medium). */
  readonly instanceType: string;
  readonly maxConnections: number;
  /** maxConnections less RDS_RESERVED_CONNECTIONS: what the application logins can open. */
  readonly available: number;
  readonly lines: readonly BudgetLine[];
  readonly reserve: number;
  /** Every line's connections and the reserve. */
  readonly worstCase: number;
  /** worstCase under available. */
  readonly fits: boolean;
  /** The DatabaseConnections alarm's threshold: DATABASE_CONNECTIONS_ALARM_PERCENT of maxConnections, rounded up. */
  readonly alarmThreshold: number;
}

/** The web task's pools as the web opens them: the e-signature pool only where a vendor is configured. */
export function webTaskPools(esignProvider: string = WEB_ESIGN_PROVIDER): readonly TaskPool[] {
  return [
    { pool: 'application login', connections: WEB_POOL_CONNECTIONS.application },
    { pool: 'billing login', connections: WEB_POOL_CONNECTIONS.billing },
    ...(esignProvider === 'none' ? [] : [{ pool: 'e-signature login', connections: WEB_POOL_CONNECTIONS.esign }]),
    { pool: 'model gateway (application login)', connections: WEB_POOL_CONNECTIONS.model },
    { pool: 'pg-boss producer (queue login)', connections: WEB_POOL_CONNECTIONS.queue },
  ];
}

/**
 * The most tasks a service runs at once: during a deploy, its own deployment's maxHealthyPercent of its desired count
 * (twice it for a new-before-old deploy, the desired count itself for a stop-first one), never fewer than the desired count.
 */
export function mostTasks(service: ServiceSettings): number {
  return Math.max(service.desiredCount, Math.floor((service.desiredCount * service.deployment.maxHealthyPercent) / 100));
}

function line(service: BudgetLine['service'], tasks: number, pools: readonly TaskPool[]): BudgetLine {
  const perTask = pools.reduce((sum, pool) => sum + pool.connections, 0);
  return { service, tasks, pools, perTask, connections: tasks * perTask };
}

/** The environment's budget, from its settings, the apps' pools and the parameter group. */
export function connectionBudget(settings: EnvironmentSettings, parameters: Readonly<Record<string, string>> = DATABASE_PARAMETERS): ConnectionBudget {
  const { compute } = settings;
  const instanceType = settings.database.instanceType.toString();
  const max = maxConnections(instanceType, parameters);
  const available = max - RDS_RESERVED_CONNECTIONS;
  const lines = [
    line('web', mostTasks(compute.web), webTaskPools()),
    line('worker', mostTasks(compute.worker), workerTaskPools(WORKER_JOBS.worker, compute.screening.concurrency)),
    line('platform', mostTasks(compute.platform), workerTaskPools(WORKER_JOBS.platform, compute.screening.concurrency)),
    line('screening', mostTasks(compute.screening), workerTaskPools(WORKER_JOBS.screening, compute.screening.concurrency)),
    line('migration', 1, [{ pool: 'owner login, one client at a time', connections: MIGRATION_TASK_CONNECTIONS }]),
  ];
  const worstCase = lines.reduce((sum, entry) => sum + entry.connections, 0) + RESERVE_CONNECTIONS;
  return {
    environment: settings.name,
    instanceType,
    maxConnections: max,
    available,
    lines,
    reserve: RESERVE_CONNECTIONS,
    worstCase,
    fits: worstCase < available,
    alarmThreshold: Math.ceil((max * DATABASE_CONNECTIONS_ALARM_PERCENT) / 100),
  };
}

/** The budget's figures in one sentence, for the refusal and the record. */
export function describeBudget(budget: ConnectionBudget): string {
  const terms = budget.lines.map((entry) => `${entry.service} ${String(entry.tasks)} x ${String(entry.perTask)}`).join(', ');
  return (
    `the ${budget.environment} database (db.${budget.instanceType}) gives the application logins ${String(budget.available)} connections ` +
    `(max_connections ${String(budget.maxConnections)} less ${String(RDS_RESERVED_CONNECTIONS)} reserved), and its tasks can hold ` +
    `${String(budget.worstCase)} at once (${terms}, reserve ${String(budget.reserve)})`
  );
}

export class ConnectionBudgetError extends Error {
  override readonly name = 'ConnectionBudgetError';
}

/** The budget, or a refusal naming its figures when the worst case does not stay under what the instance gives. */
export function checkedConnectionBudget(settings: EnvironmentSettings, parameters: Readonly<Record<string, string>> = DATABASE_PARAMETERS): ConnectionBudget {
  const budget = connectionBudget(settings, parameters);
  if (!budget.fits) {
    throw new ConnectionBudgetError(
      `${describeBudget(budget)}: over budget. Move the environment's database up a class, or lower a pool or a task count (infra/lib/connections.ts; docs/adr/0083).`,
    );
  }
  return budget;
}
