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
