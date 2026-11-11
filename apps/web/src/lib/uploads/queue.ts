import { CONNECTION_TIMEOUT_MS, lockTimeoutParameter } from '@tp/db/runtime';
import type { Logger } from '@tp/observability';
import { type JobPayload, type JobType, SCREENING_PRICE_PAYLOAD, SCREENING_PRIORITY, type ScreeningRunJobOptions, enqueue, enqueueScreeningRun, parsePayload } from '@tp/worker/jobs';
import { type ConstructorOptions, PgBoss } from 'pg-boss';

import { WEB_POOL_CONNECTIONS } from '../server/pools';
import { WEB_LOCK_TIMEOUT_MS } from '../server/web-pool';

/**
 * How the web app queues work for the worker (PRD 10, Pipeline step 1: "the server records
 * source_document ... then queues"; docs/adr/0004 and 0026): through the worker's own job contract
 * (@tp/worker/jobs), so the queue, the payload's shape and the singleton key are the worker's. The
 * payload is opaque IDs only.
 */
export interface JobQueue {
  /** Queues the job; null when one with the same singleton key is already queued or active. */
  enqueue<T extends JobType>(type: T, payload: JobPayload<T>): Promise<string | null>;
  /**
   * Queues a free screening's pricing for the screening consumer (docs/adr/0062) at the run's queue priority (0, or below
   * for an upload over its account's share or the day's cap); null when that run's job is already queued or active.
   */
  enqueueScreeningRun(runId: string, options?: ScreeningRunJobOptions): Promise<string | null>;
}

/**
 * pg-boss's options as the web's producer: it supervises, schedules and migrates nothing (the worker does). Its pool
 * carries the web's lock_timeout, as the request pools do (server/web-pool.ts; docs/adr/0092, the amendment of
 * 2026-11-11): a handler queues inside its request's open transaction ("Queued in the request"), so a send that waited
 * on a lock (the queue's own schema change as a worker starts, a send of the same singleton key in flight) would hold
 * the request's application connection for as long. Given as pg's own parameter, which pg-boss hands to its pool with
 * the rest of its options; never through `options`, which a production URL's own `options` (the login's role) would
 * replace. queue.db.test.ts reads it back from a connection pg-boss opens.
 */
export function producerOptions(connectionString: string): ConstructorOptions {
  return {
    connectionString,
    supervise: false,
    schedule: false,
    migrate: false,
    max: WEB_POOL_CONNECTIONS.queue,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    ...lockTimeoutParameter(connectionString, WEB_LOCK_TIMEOUT_MS),
  };
}

/** pg-boss as a producer only (producerOptions); it starts on first use. */
export class PgBossQueue implements JobQueue {
  private started: Promise<PgBoss> | undefined;

  constructor(
    private readonly connectionString: string,
    private readonly logger: Logger,
  ) {}

  private boss(): Promise<PgBoss> {
    this.started ??= (async () => {
      const boss = new PgBoss(producerOptions(this.connectionString));
      boss.on('error', () => {
        // pg-boss errors are logged by code only; their text can carry SQL and connection details.
        this.logger.error('queue error', { error_code: 'QUEUE_ERROR' });
      });
      await boss.start();
      return boss;
    })().catch((error: unknown) => {
      this.started = undefined;
      throw error;
    });
    return this.started;
  }

  async enqueue<T extends JobType>(type: T, payload: JobPayload<T>): Promise<string | null> {
    return enqueue(await this.boss(), type, payload);
  }

  async enqueueScreeningRun(runId: string, options: ScreeningRunJobOptions = {}): Promise<string | null> {
    return enqueueScreeningRun(await this.boss(), runId, options);
  }
}

/** Tests and the e2e build's checks: the jobs queued, in order. */
export class MemoryQueue implements JobQueue {
  readonly jobs: { readonly type: JobType; readonly payload: unknown }[] = [];

  /** The screening runs queued for pricing, in order. */
  readonly screeningRuns: string[] = [];
  /** Each one's queue priority, in the same order. */
  readonly screeningPriorities: number[] = [];

  enqueue<T extends JobType>(type: T, payload: JobPayload<T>): Promise<string | null> {
    this.jobs.push({ type, payload: parsePayload(type, payload) });
    return Promise.resolve(`memory-${String(this.jobs.length)}`);
  }

  enqueueScreeningRun(runId: string, options: ScreeningRunJobOptions = {}): Promise<string | null> {
    this.screeningRuns.push(SCREENING_PRICE_PAYLOAD.parse({ screening_run_id: runId }).screening_run_id ?? '');
    this.screeningPriorities.push(SCREENING_PRIORITY.parse(options.priority ?? 0));
    return Promise.resolve(`memory-screening-${String(this.screeningRuns.length)}`);
  }
}
