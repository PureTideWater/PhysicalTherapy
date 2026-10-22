import type { PgBoss } from 'pg-boss';
import { z } from 'zod';

import { type JobPayload, type JobType, SCREENING_JOB_HEARTBEAT_SECONDS, parsePayload, singletonKey } from './registry';

export type JobSender = Pick<PgBoss, 'send'>;

export interface EnqueueOptions {
  /** Hold the job this many seconds before a worker may take it (the monitoring chain waits for the rest of a batch). */
  readonly startAfterSeconds?: number;
}

/**
 * Queues a job after validating its payload. Returns the job ID, or null when a job with the same
 * singleton key is already queued or active.
 */
export async function enqueue<T extends JobType>(boss: JobSender, type: T, payload: JobPayload<T>, options: EnqueueOptions = {}): Promise<string | null> {
  const valid = parsePayload(type, payload);
  return boss.send(type, valid, { singletonKey: singletonKey(type, valid), ...(options.startAfterSeconds === undefined ? {} : { startAfter: options.startAfterSeconds }) });
}

/**
 * The free screening's pricing job (the screening consumer's, WORKER_JOBS=screening: docs/adr/0062): the run to price,
 * by its opaque ID, or nothing (a minute's schedule of the platform's before PR 6b-3, which the consumer runs as its
 * sweep). It never carries the result link's token or anything a prospect typed.
 */
export const SCREENING_PRICE_JOB = 'screening_price';
/**
 * The waiting tier's own queue (Q7; the review of 2026-10-22): a run past its account's share or the day's cap, priced
 * when no normal run waits. The consumer works it with one thread fewer than it has, so the waiting tier never holds
 * every thread and a normal upload that arrives meanwhile starts at once (pg-boss never preempts a job it is working).
 */
export const SCREENING_PRICE_WAITING_JOB = 'screening_price_waiting';
export const SCREENING_PRICE_PAYLOAD = z.strictObject({ screening_run_id: z.uuid().optional() });
export type ScreeningPricePayload = z.infer<typeof SCREENING_PRICE_PAYLOAD>;

/** The singleton key of a run's on-demand pricing job: one queued or active at a time (a run's tier never changes, so its queue never does). */
export function screeningPriceKey(runId: string): string {
  return `${SCREENING_PRICE_JOB}:${runId}`;
}

/**
 * A run's place in pg-boss's queue: its queue_priority as submit_screening() set it (0, the normal tier; -k for an
 * account's k-th upload past its share today, -1 past the day's cap; the founder's Q7), which screening_wait() returns.
 */
export interface ScreeningRunJobOptions {
  readonly priority?: number;
}

/** The priorities a run can carry (screening_run_priority: -20 to 0). */
export const SCREENING_PRIORITY = z.number().int().min(-20).max(0);

/** The queue a run's pricing goes to: the normal tier's at priority 0, the waiting tier's below it. */
export function screeningPriceQueue(priority: number): typeof SCREENING_PRICE_JOB | typeof SCREENING_PRICE_WAITING_JOB {
  return priority < 0 ? SCREENING_PRICE_WAITING_JOB : SCREENING_PRICE_JOB;
}

/**
 * Queues a run's pricing (the web app once the upload is stored, and the consumer's sweep for a run whose job is gone):
 * on its tier's queue (screeningPriceQueue), with its singleton key, its priority (pg-boss takes higher first, then
 * older), and the screening heartbeat, so a dead consumer's job is failed and the run claimed again within minutes
 * whatever the queue held when it was sent. Returns the job ID, or null when that run's job is already queued or
 * active. A send that fails is not fatal to the web: the run stays queued and the minute's sweep sends it.
 */
export async function enqueueScreeningRun(boss: JobSender, runId: string, options: ScreeningRunJobOptions = {}): Promise<string | null> {
  const payload = SCREENING_PRICE_PAYLOAD.parse({ screening_run_id: runId });
  const priority = SCREENING_PRIORITY.parse(options.priority ?? 0);
  return boss.send(screeningPriceQueue(priority), payload, { singletonKey: screeningPriceKey(runId), priority, heartbeatSeconds: SCREENING_JOB_HEARTBEAT_SECONDS });
}
