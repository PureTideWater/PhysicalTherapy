import { type ScopeClient, type ScopePool, withJobScope } from '@tp/db';
import type { Logger } from '@tp/observability';
import type { PgBoss } from 'pg-boss';

import { startHeartbeat } from './heartbeat';
import type { JobHandlers } from './jobs/handlers';
import { PLATFORM_JOB_TYPES, PLATFORM_SCHEDULES, type PlatformHandlers, type PlatformJobType, parsePlatformPayload } from './jobs/platform';
import { enqueue } from './jobs/enqueue';
import { JOB_TYPES, type JobType, QUEUE_OPTIONS, jobSubject, parsePayload, queueOptions, singletonKey, workOptions } from './jobs/registry';
import type { JobRunEnd, JobRunRecorder } from './jobs/runs';

export type QueueClient = Pick<PgBoss, 'start' | 'stop' | 'createQueue' | 'work' | 'schedule' | 'send'>;

export interface WorkerOptions {
  readonly boss: QueueClient;
  readonly logger: Logger;
  /**
   * The practice jobs' handlers, with `pool`. Both are absent on a platform-only worker
   * (WORKER_JOBS=platform), which creates the practice queues, so the monitoring schedule can queue
   * into them, and works none of them.
   */
  readonly handlers?: JobHandlers;
  /** The application login's pool: practice jobs reach the database only through withJobScope on it. */
  readonly pool?: ScopePool<ScopeClient>;
  /** The platform jobs (audit copy, restore drill), where this worker holds an operator connection. */
  readonly platform?: PlatformHandlers;
  /** Where each practice job's attempts are recorded for the practice's dashboard (job_run, JOB-02). */
  readonly runs?: JobRunRecorder;
  readonly heartbeatMs: number;
  /** How long a graceful stop waits for active jobs. */
  readonly shutdownTimeoutMs?: number;
}

export interface RunningWorker {
  stop(): Promise<void>;
}

export class JobPayloadError extends Error {
  override readonly name = 'JobPayloadError';
}

/** A job tried to queue work for a practice other than its own (one practice per job, SEC-06). */
export class CrossPracticeJobError extends Error {
  override readonly name = 'CrossPracticeJobError';
}

/**
 * The line a job's last failed attempt logs (test matrix JOB-02: "three failures: alert raised"). The
 * worker log group's metric filter counts it and the operator alarm fires on it (infra/lib/jobs.ts);
 * the earlier attempts' failures are retried without an alert.
 */
export const JOB_FAILED_MESSAGE = 'job failed on its last attempt';

interface QueuedJob {
  readonly id: string;
  readonly data: unknown;
  /** How many times pg-boss has retried the job; the attempt is retryCount + 1. */
  readonly retryCount?: number;
}

/** Runs one attempt, logging the job's final failure (its third attempt) for the operator alarm. */
async function attempt(type: string, job: QueuedJob, logger: Logger, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if ((job.retryCount ?? 0) >= QUEUE_OPTIONS.retryLimit) {
      // The text is JOB_FAILED_MESSAGE, written out for the log lint (fixed text only); worker.test.ts holds them equal.
      logger.error('job failed on its last attempt', { job_id: job.id, job_type: type, error_code: 'JOB_FAILED' });
    }
    throw error;
  }
}

/** Records how an attempt ended; a failure to record is logged and never fails the job or hides its error. */
async function recordEnd(runs: JobRunRecorder | undefined, logger: Logger, end: JobRunEnd): Promise<void> {
  try {
    await runs?.finished(end);
  } catch {
    logger.warn('job run not recorded', { job_id: end.jobId, error_code: 'JOB_RUN_NOT_RECORDED' });
  }
}

interface PracticeJobs {
  readonly handlers: JobHandlers;
  readonly pool: ScopePool<ScopeClient>;
}

/** The practice jobs this worker works, or undefined on a platform-only worker. */
function practiceJobs(options: WorkerOptions): PracticeJobs | undefined {
  const { handlers, pool } = options;
  if (handlers === undefined && pool === undefined) {
    if (options.platform === undefined) {
      throw new Error('a worker works the practice jobs, the platform jobs or both');
    }
    return undefined;
  }
  if (handlers === undefined || pool === undefined) {
    throw new Error('the practice jobs need both their handlers and the application login pool');
  }
  return { handlers, pool };
}

async function runJob<T extends JobType>(type: T, job: QueuedJob, options: WorkerOptions, practice: PracticeJobs): Promise<void> {
  const { logger, boss, runs } = options;
  const { handlers, pool } = practice;
  let payload;
  try {
    payload = parsePayload(type, job.data);
  } catch {
    // The payload is not echoed: the error and the log carry the job's ID and type only.
    logger.error('job payload rejected', { job_id: job.id, job_type: type, error_code: 'JOB_PAYLOAD_INVALID' });
    throw new JobPayloadError(`payload rejected for ${type} job ${job.id}`);
  }
  const jobLogger = logger.child({ job_id: job.id, job_type: type, practice_id: payload.practice_id });
  // One practice per job (PRD 3; SEC-06): every transaction the handler opens is scoped to exactly the
  // payload's practice, as the job's service actor; the handler is never handed a raw connection.
  const practiceId = payload.practice_id;
  const lastAttempt = (job.retryCount ?? 0) >= QUEUE_OPTIONS.retryLimit;
  await runs?.started({ jobId: job.id, practiceId, type, singletonKey: singletonKey(type, payload), subject: jobSubject(type, payload), attempt: (job.retryCount ?? 0) + 1 });
  try {
    await handlers[type](payload, {
      jobId: job.id,
      logger: jobLogger,
      transaction: (run) => withJobScope(pool, { jobId: job.id, practiceId }, run),
      enqueue: (next, nextPayload, nextOptions) => {
        if (nextPayload.practice_id !== practiceId) {
          return Promise.reject(new CrossPracticeJobError(`a ${type} job queues work for its own practice only`));
        }
        return enqueue(boss, next, nextPayload, nextOptions);
      },
      lastAttempt,
    });
  } catch (error) {
    await recordEnd(runs, jobLogger, { jobId: job.id, practiceId, outcome: lastAttempt ? 'failed' : 'retrying', errorCode: 'JOB_FAILED' });
    throw error;
  }
  await recordEnd(runs, jobLogger, { jobId: job.id, practiceId, outcome: 'succeeded', errorCode: null });
}

async function runPlatformJob<T extends PlatformJobType>(type: T, job: QueuedJob, handlers: PlatformHandlers, logger: Logger): Promise<void> {
  let payload;
  try {
    payload = parsePlatformPayload(type, job.data);
  } catch {
    logger.error('job payload rejected', { job_id: job.id, job_type: type, error_code: 'JOB_PAYLOAD_INVALID' });
    throw new JobPayloadError(`payload rejected for ${type} job ${job.id}`);
  }
  await handlers[type](payload, { jobId: job.id, logger: logger.child({ job_id: job.id, job_type: type }) });
}

/**
 * Starts pg-boss, creates every queue, subscribes a handler to each and starts the heartbeat. With
 * platform handlers it also creates, schedules and works the platform queues (UTC schedules, one job
 * of each queued or active at a time). Without practice handlers (a platform-only worker) it creates
 * the practice queues and works none of them.
 */
export async function startWorker(options: WorkerOptions): Promise<RunningWorker> {
  const { boss, logger } = options;
  const practice = practiceJobs(options);
  await boss.start();
  for (const type of JOB_TYPES) {
    await boss.createQueue(type, queueOptions(type));
  }
  if (practice !== undefined) {
    for (const type of JOB_TYPES) {
      await boss.work(type, workOptions(type), async (jobs) => {
        for (const job of jobs) {
          await attempt(type, job, logger, () => runJob(type, job, options, practice));
        }
      });
    }
  }
  const { platform } = options;
  if (platform !== undefined) {
    for (const type of PLATFORM_JOB_TYPES) {
      await boss.createQueue(type, QUEUE_OPTIONS);
      await boss.schedule(type, PLATFORM_SCHEDULES[type], {}, { tz: 'UTC', singletonKey: type });
      await boss.work(type, { batchSize: 1 }, async (jobs) => {
        for (const job of jobs) {
          await attempt(type, job, logger, () => runPlatformJob(type, job, platform, logger));
        }
      });
    }
  }
  const heartbeat = startHeartbeat(logger, options.heartbeatMs);
  logger.info('worker started');

  let stopping: Promise<void> | undefined;
  return {
    stop: () => {
      stopping ??= (async () => {
        heartbeat.stop();
        await boss.stop({ graceful: true, timeout: options.shutdownTimeoutMs ?? 30_000 });
        logger.info('worker stopped');
      })();
      return stopping;
    },
  };
}
