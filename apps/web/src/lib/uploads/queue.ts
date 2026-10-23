import { CONNECTION_TIMEOUT_MS } from '@tp/db/runtime';
import type { Logger } from '@tp/observability';
import { type JobPayload, type JobType, SCREENING_PRICE_PAYLOAD, SCREENING_PRIORITY, type ScreeningRunJobOptions, enqueue, enqueueScreeningRun, parsePayload } from '@tp/worker/jobs';
import { PgBoss } from 'pg-boss';

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
 * pg-boss as a producer only: it supervises, schedules and migrates nothing (the worker does), and it
 * starts on first use.
 */
export class PgBossQueue implements JobQueue {
  private started: Promise<PgBoss> | undefined;

  constructor(
    private readonly connectionString: string,
    private readonly logger: Logger,
  ) {}

  private boss(): Promise<PgBoss> {
    this.started ??= (async () => {
      const boss = new PgBoss({ connectionString: this.connectionString, supervise: false, schedule: false, migrate: false, max: 2, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS });
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
