import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { practice } from './tenancy';

/**
 * job_run (Data dictionary, Operations: job and job_run), mirroring
 * migrations/20261016121000_job_runs.sql (job types as of 20261020090000): one row per practice job, written by the worker in the job's
 * own scope as each attempt starts and ends, which the practice dashboard reads for its last run
 * (test matrix JOB-02). Codes and opaque IDs only.
 */

export const JOB_RUN_OUTCOMES = ['running', 'retrying', 'succeeded', 'failed'] as const;
export type JobRunOutcome = (typeof JOB_RUN_OUTCOMES)[number];

export const JOB_RUN_TYPES = ['intake', 'parse_835', 'monitor', 'price', 'triage', 'audit_report', 'reconcile', 'digest', 'export'] as const;

export const jobRun = pgTable(
  'job_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    jobId: uuid('job_id').notNull(),
    jobType: text('job_type', { enum: JOB_RUN_TYPES }).notNull(),
    singletonKey: text('singleton_key').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    attempts: integer('attempts').notNull(),
    outcome: text('outcome', { enum: JOB_RUN_OUTCOMES }).notNull(),
    errorCode: text('error_code'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('job_run_once').on(table.jobId), index('job_run_by_practice').on(table.practiceId, table.startedAt.desc(), table.id)],
);

export type JobRunRow = typeof jobRun.$inferSelect;
