import type { PgBoss } from 'pg-boss';

import { type JobPayload, type JobType, parsePayload, singletonKey } from './registry';

export type JobSender = Pick<PgBoss, 'send'>;

/**
 * Queues a job after validating its payload. Returns the job ID, or null when a job with the same
 * singleton key is already queued or active.
 */
export async function enqueue<T extends JobType>(boss: JobSender, type: T, payload: JobPayload<T>): Promise<string | null> {
  const valid = parsePayload(type, payload);
  return boss.send(type, valid, { singletonKey: singletonKey(type, valid) });
}
