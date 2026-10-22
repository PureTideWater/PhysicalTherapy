import type { Logger } from '@tp/observability';
import { z } from 'zod';

import { SCREENING_PRICE_JOB, SCREENING_PRICE_PAYLOAD, SCREENING_PRICE_WAITING_JOB } from './enqueue';

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
 * - screening_price_waiting: the same for a run in the waiting tier (Q7: past its account's share or the day's cap, at
 *   priority -k), on a queue of its own the consumer works with one thread fewer than it has, so the waiting tier never
 *   holds every thread; its handler tells the pool it is waiting-tier, and the pool keeps a thread idle for the normal
 *   tier.
 * - screening_sweep: every minute, on the consumer's main thread (it prices nothing): fails a stale run out of attempts,
 *   sends each due run's job again with its singleton key, priority and heartbeat (the exclusive policy refuses a
 *   duplicate), and logs the queue's gauge (`screening queue`).
 *
 * A free thread takes the next job at once: a send wakes the consumer's idle workers through LISTEN/NOTIFY
 * (SCREENING_BOSS_OPTIONS), and a run's end wakes the pricing queues' workers (worker.ts), so neither waits out
 * pg-boss's poll, which stays as the fallback (SCREENING_POLL_SECONDS).
 *
 * Payloads are opaque IDs or nothing: never the link's token, an address, a practice's name or a row.
 */
export const SCREENING_SWEEP_JOB = 'screening_sweep';
export const SCREENING_JOB_TYPES = [SCREENING_PRICE_JOB, SCREENING_PRICE_WAITING_JOB, SCREENING_SWEEP_JOB] as const;
export type ScreeningJobType = (typeof SCREENING_JOB_TYPES)[number];

export const SCREENING_JOB_PAYLOADS = {
  screening_price: SCREENING_PRICE_PAYLOAD,
  screening_price_waiting: z.strictObject({ screening_run_id: z.uuid() }),
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
  /**
   * Prices one run in a worker thread; resolves once it is priced (or not there to claim), rejects when the thread
   * failed. `waiting` marks a waiting-tier run, which never takes the last idle thread.
   */
  readonly price: (runId: string, context: ScreeningJobContext, options?: { readonly waiting?: boolean }) => Promise<void>;
  /** The minute's sweep, on the main thread. */
  readonly sweep: (context: ScreeningJobContext) => Promise<void>;
}

/** The two jobs' handlers over the consumer's thread pool and its sweep. */
export function createScreeningHandlers(parts: ScreeningJobParts): ScreeningHandlers {
  return {
    screening_price: (payload, context) => (payload.screening_run_id === undefined ? parts.sweep(context) : parts.price(payload.screening_run_id, context)),
    screening_price_waiting: (payload, context) => parts.price(payload.screening_run_id, context, { waiting: true }),
    screening_sweep: (_payload, context) => parts.sweep(context),
  };
}

/** What a worker that works the screening jobs is given (worker.ts): their handlers, how many runs at once, and what to close once it stops. */
export interface ScreeningJobs {
  readonly handlers: ScreeningHandlers;
  /**
   * Runs priced at once: pg-boss's local concurrency on screening_price, one thread each; screening_price_waiting's is
   * one fewer (screeningWaitingConcurrency).
   */
  readonly concurrency: number;
  /** Ends the threads and the sweep's connections, after pg-boss has stopped. */
  readonly close: () => Promise<void>;
}

/** How many waiting-tier runs the consumer works at once: one fewer than its threads, so one is always the normal tier's (none to spare with one). */
export function screeningWaitingConcurrency(concurrency: number): number {
  return Math.max(1, concurrency - 1);
}

/**
 * The pg-boss instance of a worker that works the screening jobs (main.ts): it LISTENs on one connection of its own on
 * the queue login, so a send to a screening queue (each notifies: SCREENING_QUEUE_OPTIONS) wakes the queue's idle workers
 * the moment it commits. Without it a job sent while every worker slept between polls waited out up to pg-boss's 2-s
 * poll with threads free: on CI's S5 at 7abb99c, two of three practice uploads queued as the first was emailed started
 * after that email (the capacity report's "slots not used"). Should the listener drop, pg-boss polls alone until it
 * is back, then has every worker fetch once.
 */
export const SCREENING_BOSS_OPTIONS = { useListenNotify: true } as const;

/**
 * How often an idle screening worker fetches when nothing has woken it, in seconds: pg-boss's own 2-s poll, kept while
 * LISTEN/NOTIFY is up (pg-boss would relax it to 30 s), so a job no NOTIFY announces, such as a retry coming due after
 * its backoff, still starts within it, and a worker never waits longer after a run than it did before.
 */
export const SCREENING_POLL_SECONDS = 2;

/** How the consumer works each screening queue: one job per fetch, pg-boss's poll kept under NOTIFY, as many at once as each tier may hold. */
export function screeningWorkOptions(type: ScreeningJobType, concurrency: number): {
  readonly batchSize: 1;
  readonly pollingIntervalSeconds: number;
  readonly notifyPollingIntervalSeconds: number;
  readonly localConcurrency?: number;
} {
  const poll = { batchSize: 1, pollingIntervalSeconds: SCREENING_POLL_SECONDS, notifyPollingIntervalSeconds: SCREENING_POLL_SECONDS } as const;
  switch (type) {
    case SCREENING_PRICE_JOB:
      return { ...poll, localConcurrency: concurrency };
    case SCREENING_PRICE_WAITING_JOB:
      return { ...poll, localConcurrency: screeningWaitingConcurrency(concurrency) };
    case SCREENING_SWEEP_JOB:
      return poll;
  }
}

/** The queues whose jobs hold a pricing thread: when one ends, its thread is free for the next (worker.ts wakes their workers). */
export const SCREENING_PRICING_JOB_TYPES: readonly ScreeningJobType[] = [SCREENING_PRICE_JOB, SCREENING_PRICE_WAITING_JOB];
