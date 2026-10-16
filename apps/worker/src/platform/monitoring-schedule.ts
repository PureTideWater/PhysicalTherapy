import { OPERATOR_ROLE } from '@tp/db';

import { type JobSender, enqueue } from '../jobs/enqueue';
import { previousMonth } from '../digest/view';

/**
 * The monitoring chain's schedule (PRD 5, J11: "on each new upload batch (or on a schedule)"; PRD 6:
 * "schedules"; docs/adr/0039): a platform job, daily, as the operator role (tp_operator, which owns
 * nothing and reads no table): it learns the active practices' IDs from operator_active_practice_ids()
 * and queues, for each, that practice's own jobs: the day's monitor job (which prices any month a batch
 * left unplanned), the digest of the month before (sent once; the days after it are replays with no
 * effect) and the day's reconcile (the recovery ledger brought up to date, and the quarter before's ROI
 * statement, generated once). It reads no practice's data and spans no practice's transaction: each job it queues is one
 * practice's (SEC-06).
 */

export interface ScheduleClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface MonitoringScheduleResult {
  readonly practices: number;
  /** Jobs the queue took (a job with the same key already queued or active is not counted). */
  readonly queued: number;
}

/** The active practices' IDs, in a transaction as the operator role with no practice in scope. */
async function activePractices(client: ScheduleClient): Promise<string[]> {
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${OPERATOR_ROLE}`);
    await client.query("SELECT set_config('app.practice_ids', '{}', true)");
    const { rows } = await client.query('SELECT id FROM operator_active_practice_ids() AS id');
    await client.query('COMMIT');
    return (rows as { id: string }[]).map((row) => row.id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/** Queues the day's monitor job, the previous month's digest and the day's reconcile for every active practice. */
export async function queueMonitoringSchedule(options: { readonly client: ScheduleClient; readonly queue: JobSender; readonly day: string }): Promise<MonitoringScheduleResult> {
  const practices = await activePractices(options.client);
  const period = previousMonth(options.day);
  let queued = 0;
  for (const practiceId of practices) {
    for (const sent of [
      await enqueue(options.queue, 'monitor', { practice_id: practiceId, day: options.day }),
      await enqueue(options.queue, 'digest', { practice_id: practiceId, period }),
      await enqueue(options.queue, 'reconcile', { practice_id: practiceId, day: options.day }),
    ]) {
      queued += sent === null ? 0 : 1;
    }
  }
  return { practices: practices.length, queued };
}
