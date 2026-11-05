import { PRACTICE_JOB_SLOTS } from './jobs/registry';
import { SCREENING_BOSS_OPTIONS } from './jobs/screening';

/**
 * The database connections a worker task's pools hold at most, in one place for main.ts and the pools it opens, and for
 * the infrastructure's connection budget (infra/lib/connections.ts), which adds them up for every task an environment
 * can run at once against its database's max_connections at synthesis (docs/adr/0083, "The practice pool"). Every pool
 * connects on demand and closes a connection idle for thirty seconds (packages/db/src/connect.ts), so these are each
 * pool's worst case, when all of it is in use at once.
 */

/**
 * pg-boss's own pool on the queue login, one in every worker whatever it runs (main.ts): its fetches, completions,
 * sends and maintenance. Ten is pg-boss's own default, set explicitly so the budget counts what runs. A pg-boss with
 * LISTEN/NOTIFY on (the screening consumer's, SCREENING_BOSS_OPTIONS) also holds QUEUE_LISTEN_CONNECTIONS outside it.
 */
export const QUEUE_POOL_CONNECTIONS = 10;

/**
 * The LISTEN/NOTIFY client of a pg-boss with useListenNotify on (the screening consumer's, main.ts): pg-boss 12.38's
 * Db.listen opens a session-pinned pg.Client of its own on the queue login for it, outside its pool, so the pool's max
 * does not cap it (round-3 review WR-5, INFRA-1: a pool of 10 under load held 11 backends, the 11th the listener).
 */
export const QUEUE_LISTEN_CONNECTIONS = 1;

/** The platform jobs' operator pool (platform/wiring.ts, platformRuntime). */
export const OPERATOR_POOL_CONNECTIONS = 2;

/** The screening sweep's own connections on the consumer's main thread: the due runs, a stale run's failure and the gauge, one at a time. */
export const SCREENING_SWEEP_CONNECTIONS = 2;

/** Each screening pricing thread's connections: two, as each prices one run at a time (a read and a record never overlap). */
export const SCREENING_THREAD_CONNECTIONS = 2;

/** One pool a worker task opens, and the connections it holds at most. */
export interface TaskPool {
  readonly pool: string;
  readonly connections: number;
}

/**
 * The pools main.ts opens for a deployed worker task by its WORKER_JOBS: the practice jobs' pool of a connection for
 * each job the worker runs at once (worker.ts practicePool, PRACTICE_JOB_SLOTS); the platform jobs' operator pool; the
 * screening consumer's sweep and a pool per pricing thread, `screeningConcurrency` of them, and its pg-boss's LISTEN
 * client; and pg-boss's pool beside each. A change to a pool main.ts opens changes it here.
 */
export function workerTaskPools(jobs: 'practice' | 'platform' | 'screening', screeningConcurrency: number): readonly TaskPool[] {
  const queue: TaskPool = { pool: 'pg-boss (queue login)', connections: QUEUE_POOL_CONNECTIONS };
  switch (jobs) {
    case 'practice':
      return [{ pool: 'practice jobs (worker login)', connections: PRACTICE_JOB_SLOTS }, queue];
    case 'platform':
      return [{ pool: 'platform jobs (operator login)', connections: OPERATOR_POOL_CONNECTIONS }, queue];
    case 'screening':
      return [
        { pool: 'screening sweep (screening login)', connections: SCREENING_SWEEP_CONNECTIONS },
        { pool: `screening threads (screening login, ${String(screeningConcurrency)} x ${String(SCREENING_THREAD_CONNECTIONS)})`, connections: screeningConcurrency * SCREENING_THREAD_CONNECTIONS },
        queue,
        ...(SCREENING_BOSS_OPTIONS.useListenNotify ? [{ pool: 'pg-boss LISTEN/NOTIFY client (queue login, outside its pool)', connections: QUEUE_LISTEN_CONNECTIONS }] : []),
      ];
  }
}
