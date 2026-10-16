import { logGroupName } from './log-groups';

/**
 * The worker heartbeat contract (PRD 19, monitoring: "worker heartbeat (two misses alert)"; test
 * matrix JOB-04). The worker logs HEARTBEAT_MESSAGE as the `msg` of a JSON line every
 * HEARTBEAT_INTERVAL_SECONDS (apps/worker/src/heartbeat.ts, interval from WORKER_HEARTBEAT_SECONDS);
 * a metric filter on the worker's log group turns each line into one count of the custom metric
 * below, and the alarm fires when MISSED_HEARTBEATS_TO_ALARM consecutive intervals have none.
 */
export const HEARTBEAT_MESSAGE = 'worker heartbeat';

/** The custom metric the practice worker's heartbeat lines produce. */
export const HEARTBEAT_METRIC = { namespace: 'TherapyPlatform/Worker', metricName: 'Heartbeat' } as const;

/**
 * The platform jobs run in their own service (docs/adr/0049) and log the same heartbeat line to their
 * own log group, counted as their own metric, so either service's silence raises its own alarm.
 */
export const PLATFORM_HEARTBEAT_METRIC = { namespace: 'TherapyPlatform/Platform', metricName: 'Heartbeat' } as const;

/**
 * One beat per alarm period, so "two missed heartbeats" is exactly two empty periods. CloudWatch
 * evaluates metric-filter metrics per minute at the finest, so the deployed worker runs with
 * WORKER_HEARTBEAT_SECONDS=60, which the worker and platform task definitions set (Compute).
 */
export const HEARTBEAT_INTERVAL_SECONDS = 60;

export const MISSED_HEARTBEATS_TO_ALARM = 2;

/** The worker's log group in each environment. */
export function workerLogGroupName(environment: string): string {
  return logGroupName(environment, 'worker');
}
