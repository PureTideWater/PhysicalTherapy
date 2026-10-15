import type { PracticeScope, ScopeClient } from '@tp/db';
import type { Logger } from '@tp/observability';

import type { JobPayload, JobType } from './registry';

export interface JobContext {
  readonly jobId: string;
  /** Carries job_id, job_type and practice_id on every line. */
  readonly logger: Logger;
  /**
   * Runs `run` in one transaction scoped to exactly the job's practice (withJobScope: app.practice_ids
   * holds that one practice and app.actor_id the job), as the application role. The only way a
   * practice job reaches the database; it may open several in turn.
   */
  transaction<T>(run: (scope: PracticeScope<ScopeClient>) => Promise<T>): Promise<T>;
}

export type JobHandler<T extends JobType> = (payload: JobPayload<T>, context: JobContext) => Promise<void>;

export type JobHandlers = { readonly [T in JobType]: JobHandler<T> };

/** Logs receipt and completes. Each job type's real handler replaces its entry in a later milestone. */
async function placeholder(_payload: unknown, context: JobContext): Promise<void> {
  context.logger.info('job received by placeholder handler; no work yet');
  return Promise.resolve();
}

export const placeholderHandlers: JobHandlers = {
  parse_835: placeholder,
  price: placeholder,
  triage: placeholder,
  reconcile: placeholder,
  digest: placeholder,
  export: placeholder,
};
