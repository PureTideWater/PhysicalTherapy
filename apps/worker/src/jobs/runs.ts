import { type ScopeClient, type ScopePool, withJobScope } from '@tp/db/runtime';

import type { JobType } from './registry';

/**
 * Each practice job's run, as the practice sees it (job_run; PRD 7, Practice dashboard: "last run
 * status; run failed banner with the job reference"; test matrix JOB-02). The worker records an
 * attempt as it starts and as it ends, inside the job's own scope (the job is the actor and its one
 * practice the scope), so the dashboard can say when a run failed on its last attempt and name the
 * job. Codes and opaque IDs only.
 */

export interface JobRunStart {
  readonly jobId: string;
  readonly practiceId: string;
  readonly type: JobType;
  readonly singletonKey: string;
  readonly subject: string;
  /** 1 to 3. */
  readonly attempt: number;
}

export interface JobRunEnd {
  readonly jobId: string;
  readonly practiceId: string;
  /** retrying: this attempt failed and another follows; failed: the last attempt failed. */
  readonly outcome: 'succeeded' | 'retrying' | 'failed';
  readonly errorCode: string | null;
}

export interface JobRunRecorder {
  started(run: JobRunStart): Promise<void>;
  finished(run: JobRunEnd): Promise<void>;
}

/** Records runs in job_run through the application role's pool, one job scope per write. */
export function databaseJobRuns(pool: ScopePool<ScopeClient>): JobRunRecorder {
  return {
    started: (run) =>
      withJobScope(pool, { jobId: run.jobId, practiceId: run.practiceId }, async (scope) => {
        await scope.client.query(
          `INSERT INTO job_run (practice_id, job_id, job_type, singleton_key, idempotency_key, attempts, outcome)
           VALUES ($1, $2, $3, $4, $5, $6, 'running')
           ON CONFLICT (job_id) DO UPDATE SET attempts = EXCLUDED.attempts, outcome = 'running', error_code = NULL, started_at = now(), finished_at = NULL`,
          [run.practiceId, run.jobId, run.type, run.singletonKey, run.subject, run.attempt],
        );
      }),
    finished: (run) =>
      withJobScope(pool, { jobId: run.jobId, practiceId: run.practiceId }, async (scope) => {
        await scope.client.query('UPDATE job_run SET outcome = $2, error_code = $3, finished_at = now() WHERE job_id = $1', [run.jobId, run.outcome, run.errorCode]);
      }),
  };
}
