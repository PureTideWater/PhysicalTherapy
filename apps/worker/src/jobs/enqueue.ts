import type { PgBoss } from 'pg-boss';
import { z } from 'zod';

import { type JobPayload, type JobType, parsePayload, singletonKey } from './registry';

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
 * The free screening's pricing job (a platform job: docs/adr/0062): the run to price, by its opaque ID, or nothing
 * for the minute's sweep. It never carries the result link's token or anything a prospect typed.
 */
export const SCREENING_PRICE_JOB = 'screening_price';
export const SCREENING_PRICE_PAYLOAD = z.strictObject({ screening_run_id: z.uuid().optional() });
export type ScreeningPricePayload = z.infer<typeof SCREENING_PRICE_PAYLOAD>;

/** The singleton key of a run's on-demand pricing job: one queued or active at a time. */
export function screeningPriceKey(runId: string): string {
  return `${SCREENING_PRICE_JOB}:${runId}`;
}

/**
 * Queues a run's pricing now (the web app, once the upload is stored). Returns the job ID, or null when that run's
 * job is already queued or active. A send that fails is not fatal to the caller: the run stays queued and the
 * minute's sweep prices it.
 */
export async function enqueueScreeningRun(boss: JobSender, runId: string): Promise<string | null> {
  const payload = SCREENING_PRICE_PAYLOAD.parse({ screening_run_id: runId });
  return boss.send(SCREENING_PRICE_JOB, payload, { singletonKey: screeningPriceKey(runId) });
}
