import type { Logger } from '@tp/observability';
import { z } from 'zod';

import { SCREENING_PRICE_JOB, SCREENING_PRICE_PAYLOAD } from './enqueue';

/**
 * The free screening's own jobs (docs/adr/0062; PR 6b-3, audit #53 parts 3 and 4): the screening consumer
 * (WORKER_JOBS=screening, its own service and task) works them, each run priced in one of its worker threads as
 * tp_screening, which holds EXECUTE on the screening's pricing functions alone (migration 20261106090000). The platform
 * no longer prices a screening: screening_price left PLATFORM_JOB_TYPES with the same queue name, so jobs queued before
 * a deploy move to the consumer with no copy and no loss; screening_expiry stays the platform's.
 *
 * - screening_price: one run, by its opaque ID, sent by the web once the upload is stored and by the sweep for a run
 *   whose job is gone, at the run's priority (pg-boss takes higher first, then older). A job with no run (the
 *   platform's minute schedule before this pull request, fired before the consumer removed it) runs the sweep.
 * - screening_sweep: every minute, on the consumer's main thread (it prices nothing): fails a stale run out of attempts,
 *   sends each due run's job again with its singleton key, priority and heartbeat (the exclusive policy refuses a
 *   duplicate), and logs the queue's gauge (`screening queue`).
 *
 * Payloads are opaque IDs or nothing: never the link's token, an address, a practice's name or a row.
 */
export const SCREENING_SWEEP_JOB = 'screening_sweep';
export const SCREENING_JOB_TYPES = [SCREENING_PRICE_JOB, SCREENING_SWEEP_JOB] as const;
export type ScreeningJobType = (typeof SCREENING_JOB_TYPES)[number];

export const SCREENING_JOB_PAYLOADS = {
  screening_price: SCREENING_PRICE_PAYLOAD,
  screening_sweep: z.strictObject({}),
} satisfies Record<ScreeningJobType, z.ZodType>;

export type ScreeningJobPayload<T extends ScreeningJobType> = z.infer<(typeof SCREENING_JOB_PAYLOADS)[T]>;

export function parseScreeningPayload<T extends ScreeningJobType>(type: T, payload: unknown): ScreeningJobPayload<T> {
  return SCREENING_JOB_PAYLOADS[type].parse(payload ?? {}) as ScreeningJobPayload<T>;
}

/** When the scheduled one runs, in UTC: the sweep every minute. */
export const SCREENING_SCHEDULES = { [SCREENING_SWEEP_JOB]: '* * * * *' } as const;

export interface ScreeningJobContext {
  readonly jobId: string;
  readonly logger: Logger;
}

export type ScreeningHandlers = {
  readonly [T in ScreeningJobType]: (payload: ScreeningJobPayload<T>, context: ScreeningJobContext) => Promise<void>;
};

export interface ScreeningJobParts {
  /** Prices one run in a worker thread; resolves once it is priced (or not there to claim), rejects when the thread failed. */
  readonly price: (runId: string, context: ScreeningJobContext) => Promise<void>;
  /** The minute's sweep, on the main thread. */
  readonly sweep: (context: ScreeningJobContext) => Promise<void>;
}

/** The two jobs' handlers over the consumer's thread pool and its sweep. */
export function createScreeningHandlers(parts: ScreeningJobParts): ScreeningHandlers {
  return {
    screening_price: (payload, context) => (payload.screening_run_id === undefined ? parts.sweep(context) : parts.price(payload.screening_run_id, context)),
    screening_sweep: (_payload, context) => parts.sweep(context),
  };
}

/** What a worker that works the screening jobs is given (worker.ts): their handlers, how many runs at once, and what to close once it stops. */
export interface ScreeningJobs {
  readonly handlers: ScreeningHandlers;
  /** Runs priced at once: pg-boss's local concurrency on screening_price, one thread each. */
  readonly concurrency: number;
  /** Ends the threads and the sweep's connections, after pg-boss has stopped. */
  readonly close: () => Promise<void>;
}
