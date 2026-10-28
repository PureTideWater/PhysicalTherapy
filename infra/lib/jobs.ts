/**
 * The job-failure alert contract (test matrix JOB-02: "Three failures: alert raised"; PRD 16 Backups
 * and restore: the restore job "alarms on failure"; the build-wide rule that a job is attempted at
 * most three times). The worker logs JOB_FAILED_MESSAGE as the `msg` of a JSON line when a job fails
 * its last attempt (apps/worker/src/worker.ts), for practice jobs and platform jobs alike, the restore
 * drill and the audit copy included; earlier failed attempts are retried and log nothing for it. A
 * metric filter on the worker's log group counts those lines and the alarm tells the operator.
 */
export const JOB_FAILED_MESSAGE = 'job failed on its last attempt';

export const JOB_FAILED_METRIC = { namespace: 'TherapyPlatform/Worker', metricName: 'JobFailedOnLastAttempt' } as const;

/** One evaluation period: the alarm fires within five minutes of a final failure and clears after a quiet one. */
export const JOB_FAILED_PERIOD_SECONDS = 300;

/**
 * The worker's live-heap alert contract (docs/adr/0083, D19 and D23): each attempt of a job logs JOB_HEAP_MESSAGE as it
 * ends, completed or failed (apps/worker/src/worker.ts), with `heap_live_peak_mib`, the largest heap in use just after a
 * major collection while it ran, and `heap_limit_mib`. A metric filter on the worker's log group takes the peak, and the
 * alarm fires when its maximum in a period passes JOB_HEAP_ALARM_PERCENT of the worker's heap (infra/lib/heap.ts), the
 * line the weekly real-size run checks, so a month that outgrows the margin is seen before it crashes the worker.
 */
export const JOB_HEAP_MESSAGE = 'job heap';

export const JOB_HEAP_METRIC = { namespace: 'TherapyPlatform/Worker', metricName: 'JobHeapLivePeak' } as const;

/** The share of the worker's heap limit above which a job's live peak alarms. */
export const JOB_HEAP_ALARM_PERCENT = 75;

/**
 * The pricing-run alert contract (Rules reference, Unpriced reasons and their remedies: ENGINE_ERROR's
 * remedy is "Operator alert"; docs/adr/0035): the worker logs PRICING_ENGINE_ERRORS_MESSAGE once per
 * completed pricing run that recorded an ENGINE_ERROR line whose detail pages the operator
 * (apps/worker/src/price/execute.ts). The line carries the run's ID only; the lines and their fixed
 * detail codes are on the run.
 */
export const PRICING_ENGINE_ERRORS_MESSAGE = 'pricing run recorded engine errors for the operator';

export const PRICING_ENGINE_ERRORS_METRIC = { namespace: 'TherapyPlatform/Worker', metricName: 'PricingRunEngineErrors' } as const;

/**
 * The content alert contract (audit #7; docs/adr/0071): the worker logs CONTENT_NOT_LOADED_MESSAGE once per pricing
 * run that met rule content PaidWhole has not loaded for its lines' dates, a run refused waiting_on_content_* and a
 * complete run with lines stopped by such content alike (apps/worker/src/price/execute.ts), with error_code
 * CONTENT_NOT_LOADED and the lines as record_count. Its metric filter and alarm come in the later pull request, with
 * infra/lib/constructs/monitoring.ts; until then such a gap that pages as an engine error keeps paging
 * (PRICING_ENGINE_ERRORS_MESSAGE above). infra/test/content-alert.test.ts holds the worker's text equal to this.
 */
export const CONTENT_NOT_LOADED_MESSAGE = 'pricing run found lines stopped by rule content not loaded for their dates';

export const CONTENT_NOT_LOADED_METRIC = { namespace: 'TherapyPlatform/Worker', metricName: 'PricingRunContentNotLoaded' } as const;
