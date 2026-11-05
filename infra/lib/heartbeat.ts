import type { DeploymentSettings } from './environments';
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

/** How long ECS waits after SIGTERM for the worker to drain its active jobs (compute.ts WORKER_STOP_TIMEOUT). */
export const WORKER_STOP_TIMEOUT_SECONDS = 60;

/**
 * Where the worker deploys stop-first (dev only: environments.ts STOP_FIRST_DEPLOYMENT; Lane A's orchestrator,
 * 2026-11-05), what the alarm allows the new task between the old one's stop and its own first beat: Fargate's placement,
 * the worker image's pull (Chromium is in it) and the worker's start (pg-boss and its queues) before startHeartbeat beats.
 */
export const STOP_FIRST_START_ALLOWANCE_SECONDS = 480;

/**
 * The missed beats the practice worker's heartbeat alarm waits for, by how its deploy replaces it: MISSED_HEARTBEATS_TO_ALARM
 * where the new task starts before the old one stops (ROLLING_DEPLOYMENT), so a deploy leaves no gap; where the old one
 * stops first (STOP_FIRST_DEPLOYMENT, a minimum healthy of 0), every period a deploy's gap can leave empty: up to one
 * interval since the old task's last beat, its stop timeout, and the new task's start (60 + 60 + 480 s: ten periods). So
 * a dev deploy never pages, and a dev worker that does not come back still does, ten minutes on.
 */
export function missedHeartbeatsToAlarm(deployment: DeploymentSettings): number {
  if (deployment.minHealthyPercent > 0) {
    return MISSED_HEARTBEATS_TO_ALARM;
  }
  return Math.ceil((HEARTBEAT_INTERVAL_SECONDS + WORKER_STOP_TIMEOUT_SECONDS + STOP_FIRST_START_ALLOWANCE_SECONDS) / HEARTBEAT_INTERVAL_SECONDS);
}

/** The worker's log group in each environment. */
export function workerLogGroupName(environment: string): string {
  return logGroupName(environment, 'worker');
}
