/**
 * The worker heartbeat contract (PRD 19, monitoring: "worker heartbeat (two misses alert)"; test
 * matrix JOB-04). The worker logs HEARTBEAT_MESSAGE as the `msg` of a JSON line every
 * HEARTBEAT_INTERVAL_SECONDS (apps/worker/src/heartbeat.ts, interval from WORKER_HEARTBEAT_SECONDS);
 * a metric filter on the worker's log group turns each line into one count of the custom metric
 * below, and the alarm fires when MISSED_HEARTBEATS_TO_ALARM consecutive intervals have none.
 */
export const HEARTBEAT_MESSAGE = 'worker heartbeat';

/** The custom metric the heartbeat lines produce. */
export const HEARTBEAT_METRIC = { namespace: 'TherapyPlatform/Worker', metricName: 'Heartbeat' } as const;

/**
 * One beat per alarm period, so "two missed heartbeats" is exactly two empty periods. CloudWatch
 * evaluates metric-filter metrics per minute at the finest, so the deployed worker must run with
 * WORKER_HEARTBEAT_SECONDS=60 (the task definition sets it with the compute, milestone 11).
 */
export const HEARTBEAT_INTERVAL_SECONDS = 60;

export const MISSED_HEARTBEATS_TO_ALARM = 2;

/** The worker's log group in each environment. */
export function workerLogGroupName(environment: string): string {
  return `/tp/${environment}/worker`;
}
