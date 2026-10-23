import type { ScreeningServiceSettings } from './environments';

/**
 * The screening consumer's contract with the stacks (WORKER_JOBS=screening; docs/adr/0062; PR 6b-3, decisions 13 to 16
 * and the founder's Q1 and Q7 of 2026-10-21): the main thread's heap, how long a stopping task may drain, the log lines
 * its metrics count, and the alarms' limits. The consumer logs each line as the `msg` of a JSON line with allowlisted
 * fields only (packages/observability/src/fields.ts): opaque IDs, codes, `elapsed_ms` and `record_count`. No metric has
 * a dimension, so no value from a log line, an address least of all, ever names a metric.
 */

/**
 * The main thread's old-generation heap in MiB: the container runs node with --max-old-space-size at this (#31's
 * explicit heap limit; the plan's G3). Node gives every pricing thread the same limit, the process's flag winning over
 * a thread's resourceLimits (apps/worker/src/screening/threads.ts, SCREENING_THREAD_HEAP_MB, equal to it), and the
 * threads and the main thread together stay under 90% of the task's memory, so a thread out of memory fails alone
 * (infra/test/screening.test.ts reads the worker's constants and holds both).
 */
export const SCREENING_MAIN_HEAP_MB = 896;

/** The node flag that sets it on the container's command. */
export const SCREENING_MAIN_HEAP_FLAG = `--max-old-space-size=${String(SCREENING_MAIN_HEAP_MB)}`;

/** The share of the task's memory the heaps may hold at most (the plan's G3). */
export const SCREENING_HEAP_SHARE = 0.9;

/**
 * How long ECS waits after SIGTERM before it kills the consumer: Fargate's most. The consumer stops fetching and waits
 * up to 110 s for the runs its threads hold, and exits by itself at 115 s (apps/worker/src/main.ts); a worst-shape
 * screening took at most 41 s three at once.
 */
export const SCREENING_STOP_TIMEOUT_SECONDS = 120;

/** The namespace of every screening metric. */
export const SCREENING_NAMESPACE = 'TherapyPlatform/Screening';

/** The consumer's heartbeat line (the worker's, infra/lib/heartbeat.ts), counted from its own log group. */
export const SCREENING_HEARTBEAT_METRIC = { namespace: SCREENING_NAMESPACE, metricName: 'Heartbeat' } as const;

/**
 * Decision 14's promise, measured: the consumer logs this line once a normal-tier result's email has been sent and its
 * completion committed, with `elapsed_ms` from the web's receipt of the upload (screening_run.received_at). A run in the
 * waiting tier logs TIME_TO_EMAIL_AFTER_WAITING_MESSAGE instead and stays out of the promise's alarm.
 */
export const TIME_TO_EMAIL_MESSAGE = 'screening result emailed';
export const TIME_TO_EMAIL_AFTER_WAITING_MESSAGE = 'screening result emailed after waiting';
export const TIME_TO_EMAIL_METRIC = { namespace: SCREENING_NAMESPACE, metricName: 'TimeToEmailMs' } as const;
/** The promise: 60 seconds from receipt to the email, for every upload of the normal tier. */
export const TIME_TO_EMAIL_LIMIT_MS = 60_000;
/** One period: the alarm fires when any normal-tier upload of five minutes took longer. */
export const TIME_TO_EMAIL_PERIOD_SECONDS = 300;

/**
 * The sweep's gauge, every minute: `record_count` the normal-tier runs queued, `elapsed_ms` the oldest one's wait
 * since the web received it (operator_screening_queue()). A day past the daily cap leaves the gauge alone.
 */
export const QUEUE_MESSAGE = 'screening queue';
export const OLDEST_QUEUED_METRIC = { namespace: SCREENING_NAMESPACE, metricName: 'OldestQueuedMs' } as const;
/** A normal-tier run waiting longer than this, two minutes in a row, alarms. */
export const OLDEST_QUEUED_LIMIT_MS = 120_000;
export const OLDEST_QUEUED_PERIOD_SECONDS = 60;
export const OLDEST_QUEUED_PERIODS = 2;

/**
 * A screening failed: any line the consumer logs at level error (a release not available as pinned, a read outside the
 * fetch, a thread that failed or could not be replaced, a run the sweep could not send again), or a run out of attempts.
 */
export const RUN_FAILED_ERROR_CODES = ['PRICING_ATTEMPTS_EXHAUSTED'] as const;
export const RUN_FAILED_METRIC = { namespace: SCREENING_NAMESPACE, metricName: 'RunFailed' } as const;
export const RUN_FAILED_PERIOD_SECONDS = 300;

/**
 * The web's line for an upload over its account's share of the UTC day or over the day's cap (Q7): accepted, priced
 * when no normal run waits, and the prospect told. Counted from the web's log group; the alarm says such a day came.
 */
export const UPLOAD_SENT_TO_WAIT_MESSAGE = 'screening upload sent to wait';
export const UPLOADS_SENT_TO_WAIT_METRIC = { namespace: SCREENING_NAMESPACE, metricName: 'UploadsSentToWait' } as const;
export const UPLOADS_SENT_TO_WAIT_PERIOD_SECONDS = 3600;

/** The heaps one consumer task may hold at most: each thread's limit times the threads, and the main thread's. */
export function screeningHeapMib(settings: ScreeningServiceSettings, threadHeapMib: number): number {
  return settings.concurrency * threadHeapMib + SCREENING_MAIN_HEAP_MB;
}

/** Screenings priced at once across the service: what the web's "sent" page counts as busy (SCREENING_SLOTS). */
export function screeningSlots(settings: ScreeningServiceSettings): number {
  return settings.desiredCount * settings.concurrency;
}
