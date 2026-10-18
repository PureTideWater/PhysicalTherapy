import type { PgBoss } from 'pg-boss';

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
