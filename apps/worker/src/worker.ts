import { type DatabasePool, type PracticeScope, type ScopeClient, type ScopePool, openPool, withJobScope } from '@tp/db';
import { recordAuditEvent } from '@tp/db/runtime';
import type { Logger } from '@tp/observability';
import type { PgBoss } from 'pg-boss';

import { SUSPENDED_ERROR_CODE, practiceRunRefusal, startsRun } from './billing/refusal';
import { jobHeap, startHeapWatch } from './heap';
import { startHeartbeat } from './heartbeat';
import type { JobHandlers } from './jobs/handlers';
import { PLATFORM_JOB_TYPES, PLATFORM_SCHEDULES, type PlatformHandlers, type PlatformJobType, parsePlatformPayload } from './jobs/platform';
import { enqueue } from './jobs/enqueue';
import {
  JOB_TYPES,
  type JobPayload,
  type JobType,
  PRACTICE_JOB_SLOTS,
  QUEUE_OPTIONS,
  SCREENING_JOB_HEARTBEAT_SECONDS,
  SCREENING_QUEUE_OPTIONS,
  jobSubject,
  parsePayload,
  queueOptions,
  singletonKey,
  workOptions,
} from './jobs/registry';
import type { JobRunEnd, JobRunRecorder } from './jobs/runs';
import {
  SCREENING_JOB_TYPES,
  SCREENING_PRICING_JOB_TYPES,
  SCREENING_SCHEDULES,
  SCREENING_SWEEP_JOB,
  type ScreeningHandlers,
  type ScreeningJobType,
  type ScreeningJobs,
  parseScreeningPayload,
  screeningWorkOptions,
} from './jobs/screening';
import { SCREENING_PRICE_JOB } from './jobs/enqueue';

export type QueueClient = Pick<PgBoss, 'start' | 'stop' | 'createQueue' | 'updateQueue' | 'work' | 'schedule' | 'unschedule' | 'send' | 'getWipData' | 'notifyWorker'>;

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
  /** The free screening's pricing (docs/adr/0062): its handlers and threads, where this worker holds the screening login. */
  readonly screening?: ScreeningJobs;
  /** Where each practice job's attempts are recorded for the practice's dashboard (job_run, JOB-02). */
  readonly runs?: JobRunRecorder;
  readonly heartbeatMs: number;
  /** How long a graceful stop waits for active jobs. */
  readonly shutdownTimeoutMs?: number;
}

export interface RunningWorker {
  stop(): Promise<void>;
}

/**
 * The application login's pool for the practice jobs (main.ts): a connection for each job the worker runs at once
 * (PRACTICE_JOB_SLOTS, fifteen: a job from each practice queue and four parses), since each attempt holds one at a time.
 * So no job waits for a connection another job holds: a month's price job or audit report holds its one for minutes, and
 * on four connections the concurrent phase's six jobs left two waiting until the connection timeout failed their
 * attempts (CAS-42.5 on 3ac856d5: A price and C parse 4 completed on attempt 2; docs/adr/0083). The timeout stays, for a
 * database that cannot give a connection at all (CONNECTION_TIMEOUT_MS, docs/adr/0055).
 */
export function practicePool(url: string, options: { readonly connectionTimeoutMillis?: number } = {}): DatabasePool {
  return openPool(url, PRACTICE_JOB_SLOTS, options);
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

/**
 * The line each attempt logs as it ends, completed or failed (docs/adr/0083, D19): the largest live heap of the process
 * seen while it ran, just after a major collection, and V8's heap limit, in MiB. IDs and numbers only. The worker log
 * group's metric filter takes its peak and alarms at 75% of the worker's heap (infra/lib/jobs.ts); the weekly real-size
 * run reads it back by job ID.
 */
export const JOB_HEAP_MESSAGE = 'job heap';

/**
 * The line each failed attempt logs, the last among them, with the job's ID and type and its error's code
 * (attemptErrorCode), never the error's text: an attempt that is retried leaves its cause in the log, which the weekly
 * real-size run prints beside a job that completed on a later attempt (docs/adr/0083). An attempt pg-boss failed before
 * its handler returned (its expiry, a lost claim, a stop past its grace) logs it too, once the handler returns
 * (abandonedAttemptCode). The last attempt also logs JOB_FAILED_MESSAGE for the operator alarm.
 */
export const JOB_ATTEMPT_FAILED_MESSAGE = 'job attempt failed';

/** pg-pool's own failures, by their fixed texts: a waiter past connectionTimeoutMillis, a new connection slower than it, a dropped one. */
const POOL_FAILURES: readonly (readonly [string, string])[] = [
  ['timeout exceeded when trying to connect', 'DB_POOL_TIMEOUT'],
  ['Connection terminated due to connection timeout', 'DB_CONNECT_TIMEOUT'],
  ['Connection terminated unexpectedly', 'DB_CONNECTION_TERMINATED'],
];

/** A class's name in upper snake case: ExportLoadFailed as EXPORT_LOAD_FAILED, DBInstanceNotFoundFault as DB_INSTANCE_NOT_FOUND_FAULT. */
function upperSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toUpperCase();
}

/**
 * Whether an error's name is its class's own, so code wrote it, never data: the name of the class it was constructed
 * from (this codebase's ExportLoadFailed, DigestSendFailed), or an AWS SDK v3 service exception's, which is the service's
 * error code (NoSuchKey, ThrottlingException, or S3's SlowDown on the service's own exception class), told by the shape
 * the SDK's own check reads (ServiceException.isInstance: a client or server fault, and the response's metadata). A name
 * set on an error afterwards (Object.assign) is neither.
 */
function namedByItsClass(error: Error): boolean {
  if (error.name === error.constructor.name) {
    return true;
  }
  const { $fault, $metadata } = error as { readonly $fault?: unknown; readonly $metadata?: unknown };
  return ($fault === 'client' || $fault === 'server') && typeof $metadata === 'object' && $metadata !== null;
}

/**
 * The code a failed attempt logs for its error, never its text: the pool's own failures (DB_POOL_TIMEOUT when the job
 * waited CONNECTION_TIMEOUT_MS for a connection, DB_CONNECT_TIMEOUT, DB_CONNECTION_TERMINATED); PostgreSQL's SQLSTATE as
 * DB_<state> (DB_40P01 a deadlock, DB_53200 out of shared memory); a code the error carries in this codebase's form or
 * Node's (ECONNRESET); else its name in upper snake case, an Error by name (PRICING_RUN_NOT_FOUND_ERROR, TYPE_ERROR) or a
 * class's own name (EXPORT_LOAD_FAILED, the reconcile attempt's designed failure; NO_SUCH_KEY, an S3 exception;
 * namedByItsClass); UNCLASSIFIED for anything else.
 */
export function attemptErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return 'UNCLASSIFIED';
  }
  const { message, code, severity, name } = error as { readonly message?: unknown; readonly code?: unknown; readonly severity?: unknown; readonly name?: unknown };
  const pool = POOL_FAILURES.find(([text]) => message === text)?.[1];
  if (pool !== undefined) {
    return pool;
  }
  if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) && typeof severity === 'string') {
    return `DB_${code}`;
  }
  if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,62}$/.test(code)) {
    return code;
  }
  if (typeof name === 'string' && /^(?:[A-Z][A-Za-z0-9]{0,40})?Error$/.test(name)) {
    return upperSnake(name);
  }
  if (typeof name === 'string' && /^[A-Z][A-Za-z0-9]{0,62}$/.test(name) && error instanceof Error && namedByItsClass(error)) {
    return upperSnake(name);
  }
  return 'UNCLASSIFIED';
}

/**
 * The code of an attempt pg-boss failed while its handler still ran, read from the job's signal once the handler
 * returns, or null when pg-boss had not (pg-boss 12.38 aborts a job's signal when it gives up on the attempt, before the
 * handler returns, and on an ordinary completion only after it returned): JOB_CLAIM_LOST when the heartbeat found the
 * job no longer this worker's (its signal's reason is pg-boss's own Error); JOB_STOPPED when the worker was stopping, so
 * the stop's grace ran out and pg-boss failed its active jobs; JOB_EXPIRED otherwise, the attempt past its
 * expireInSeconds (fifteen minutes; an hour for intake). pg-boss has already failed the attempt and will retry it, or
 * failed the job on its last.
 */
export function abandonedAttemptCode(signal: AbortSignal | undefined, stopping: boolean): 'JOB_CLAIM_LOST' | 'JOB_STOPPED' | 'JOB_EXPIRED' | null {
  if (signal?.aborted !== true) {
    return null;
  }
  const reason: unknown = signal.reason;
  if (reason instanceof Error && reason.name !== 'AbortError') {
    return 'JOB_CLAIM_LOST';
  }
  return stopping ? 'JOB_STOPPED' : 'JOB_EXPIRED';
}

interface QueuedJob {
  readonly id: string;
  readonly data: unknown;
  /** How many times pg-boss has retried the job; the attempt is retryCount + 1. */
  readonly retryCount?: number;
  /** pg-boss's signal for this attempt, aborted once pg-boss gives up on it (abandonedAttemptCode). */
  readonly signal?: AbortSignal;
}

/** Whether the worker has been asked to stop, for abandonedAttemptCode. */
type Stopping = () => boolean;

/**
 * Logs a failed attempt's code, and the job's final failure on its last attempt for the operator alarm. Lines only: it
 * never throws, so it never replaces the job's own error or fails an attempt pg-boss already failed.
 */
function logFailedAttempt(type: string, job: QueuedJob, logger: Logger, code: string): void {
  try {
    // The text is JOB_ATTEMPT_FAILED_MESSAGE, written out for the log lint; worker.test.ts holds them equal.
    logger.warn('job attempt failed', { job_id: job.id, job_type: type, error_code: code });
  } catch {
    // Nothing to do: the line is lost, and the attempt ends as it would have.
  }
  if ((job.retryCount ?? 0) >= QUEUE_OPTIONS.retryLimit) {
    try {
      // The text is JOB_FAILED_MESSAGE, written out for the log lint (fixed text only); worker.test.ts holds them equal.
      logger.error('job failed on its last attempt', { job_id: job.id, job_type: type, error_code: 'JOB_FAILED' });
    } catch {
      // Nothing to do, as above.
    }
  }
}

/**
 * Runs one attempt, logging a failure's code (JOB_ATTEMPT_FAILED_MESSAGE) and the job's final failure (its third attempt)
 * for the operator alarm, and, however it ends, the live heap it saw (JOB_HEAP_MESSAGE). A handler that returns after
 * pg-boss failed its attempt (abandonedAttemptCode) logs the same lines: the attempt failed, though nothing threw.
 */
async function attempt(type: string, job: QueuedJob, logger: Logger, stopping: Stopping, run: () => Promise<void>): Promise<void> {
  const heap = jobHeap();
  try {
    await run();
    const abandoned = abandonedAttemptCode(job.signal, stopping());
    if (abandoned !== null) {
      logFailedAttempt(type, job, logger, abandoned);
    }
  } catch (error) {
    logFailedAttempt(type, job, logger, attemptErrorCode(error));
    throw error;
  } finally {
    // A measurement only: it never fails a completed job (pg-boss would run it again) or replaces a job's own error.
    try {
      const { heapLivePeakMib, heapLimitMib } = heap.end();
      // The text is JOB_HEAP_MESSAGE, written out for the log lint; worker.test.ts holds them equal.
      logger.info('job heap', { job_id: job.id, job_type: type, heap_live_peak_mib: heapLivePeakMib, heap_limit_mib: heapLimitMib });
    } catch {
      // Nothing to do: the line is lost, and the weekly run fails closed on a measured job with no heap line.
    }
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

/** The practice jobs this worker works, or undefined on a platform-only or screening-only worker. */
function practiceJobs(options: WorkerOptions): PracticeJobs | undefined {
  const { handlers, pool } = options;
  if (handlers === undefined && pool === undefined) {
    if (options.platform === undefined && options.screening === undefined) {
      throw new Error('a worker works the practice jobs, the platform jobs, the screening jobs or more than one');
    }
    return undefined;
  }
  if (handlers === undefined || pool === undefined) {
    throw new Error('the practice jobs need both their handlers and the application login pool');
  }
  return { handlers, pool };
}

/**
 * The gate of a run-starting job, in the job's own scope (docs/adr/0050, 0080): whether the practice's hold refuses it.
 * In a job's scope only the owner's hold applies, since the actor is never a person. A refused packet export is also
 * recorded on its version as packet_export_refused with organization_suspended, in the same transaction, so its page
 * reads refused (packet_export_refusal_codes(), migration 20261108090000).
 */
export async function refusedByHold<T extends JobType>(scope: PracticeScope<ScopeClient>, type: T, payload: JobPayload<T>, jobId: string): Promise<boolean> {
  if ((await practiceRunRefusal(scope.client, payload.practice_id)) === null) {
    return false;
  }
  if (type === 'packet_export' && 'packet_version_id' in payload) {
    await recordAuditEvent(scope, {
      action: 'packet_export_refused',
      objectType: 'packet_version',
      objectId: payload.packet_version_id,
      practiceId: payload.practice_id,
      purpose: 'organization_suspended',
      requestId: jobId,
    });
  }
  return true;
}

async function runJob<T extends JobType>(type: T, job: QueuedJob, options: WorkerOptions, practice: PracticeJobs, stopping: Stopping): Promise<void> {
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
  // A held practice starts no new work (PRD 5, J18; docs/adr/0050, 0080): the chain's own run-starting steps ask the
  // database first and, refused, do nothing, are not retried and raise no alert; a refused export is recorded refused.
  if (startsRun(type) && (await withJobScope(pool, { jobId: job.id, practiceId }, (scope) => refusedByHold(scope, type, payload, job.id)))) {
    jobLogger.info('job refused: the organization may not start new runs', { error_code: SUSPENDED_ERROR_CODE });
    await recordEnd(runs, jobLogger, { jobId: job.id, practiceId, outcome: 'refused', errorCode: SUSPENDED_ERROR_CODE });
    return;
  }
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
  // A handler that returned after pg-boss failed its attempt did not succeed: pg-boss retries it, or failed the job.
  const abandoned = abandonedAttemptCode(job.signal, stopping());
  await recordEnd(
    runs,
    jobLogger,
    abandoned === null
      ? { jobId: job.id, practiceId, outcome: 'succeeded', errorCode: null }
      : { jobId: job.id, practiceId, outcome: lastAttempt ? 'failed' : 'retrying', errorCode: abandoned },
  );
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

async function runScreeningJob<T extends ScreeningJobType>(type: T, job: QueuedJob, handlers: ScreeningHandlers, logger: Logger): Promise<void> {
  let payload;
  try {
    payload = parseScreeningPayload(type, job.data);
  } catch {
    logger.error('job payload rejected', { job_id: job.id, job_type: type, error_code: 'JOB_PAYLOAD_INVALID' });
    throw new JobPayloadError(`payload rejected for ${type} job ${job.id}`);
  }
  await handlers[type](payload, { jobId: job.id, logger: logger.child({ job_id: job.id, job_type: type }) });
}

/**
 * Starts pg-boss, creates every queue, subscribes a handler to each and starts the heartbeat. Every worker
 * creates the platform and screening queues too, so a producer's send (the web app's screening job, docs/adr/0062)
 * never meets a missing queue whichever worker started first; with platform handlers it also schedules and works them
 * (UTC schedules, one job of each queued or active at a time). Without practice handlers (a platform-only or
 * screening-only worker) it creates the practice queues and works none of them.
 *
 * With the screening jobs (the consumer, WORKER_JOBS=screening; PR 6b-3) it sets the job heartbeat and notify on their
 * queues with updateQueue, since createQueue leaves a queue that already exists as it was (screening_price was the
 * platform's, with neither); removes the platform's old minute schedule of screening_price; schedules the sweep; and
 * works screening_price as many at once as it has threads, screening_price_waiting one fewer (the waiting tier never
 * holds every thread: Q7) and the sweep one at a time (screeningWorkOptions). When a pricing job ends with its run
 * priced, its thread is free, so it wakes the pricing queues' workers to fetch at once (wakePricing). Stopping, it waits
 * for the runs in hand, then ends the threads.
 */
export async function startWorker(options: WorkerOptions): Promise<RunningWorker> {
  const { boss, logger } = options;
  const practice = practiceJobs(options);
  // Set before any handler can run, so an attempt the stop's grace abandons reads JOB_STOPPED (abandonedAttemptCode).
  let stopRequested = false;
  const isStopping: Stopping = () => stopRequested;
  await boss.start();
  const stopHeapWatch = startHeapWatch();
  for (const type of JOB_TYPES) {
    await boss.createQueue(type, queueOptions(type));
  }
  for (const type of PLATFORM_JOB_TYPES) {
    await boss.createQueue(type, QUEUE_OPTIONS);
  }
  for (const type of SCREENING_JOB_TYPES) {
    await boss.createQueue(type, SCREENING_QUEUE_OPTIONS);
  }
  if (practice !== undefined) {
    for (const type of JOB_TYPES) {
      await boss.work(type, workOptions(type), async (jobs) => {
        for (const job of jobs) {
          await attempt(type, job, logger, isStopping, () => runJob(type, job, options, practice, isStopping));
        }
      });
    }
  }
  const { platform } = options;
  if (platform !== undefined) {
    for (const type of PLATFORM_JOB_TYPES) {
      await boss.schedule(type, PLATFORM_SCHEDULES[type], {}, { tz: 'UTC', singletonKey: type });
      await boss.work(type, { batchSize: 1 }, async (jobs) => {
        for (const job of jobs) {
          await attempt(type, job, logger, isStopping, () => runPlatformJob(type, job, platform, logger));
        }
      });
    }
  }
  const { screening } = options;
  if (screening !== undefined) {
    for (const type of SCREENING_JOB_TYPES) {
      await boss.updateQueue(type, { heartbeatSeconds: SCREENING_JOB_HEARTBEAT_SECONDS, notify: SCREENING_QUEUE_OPTIONS.notify });
    }
    await boss.unschedule(SCREENING_PRICE_JOB);
    await boss.schedule(SCREENING_SWEEP_JOB, SCREENING_SCHEDULES[SCREENING_SWEEP_JOB], {}, { tz: 'UTC', singletonKey: SCREENING_SWEEP_JOB });
    // A pricing job that ends with its run priced frees its thread: every pricing worker fetches now rather than at its
    // next poll, so a worker whose run took less than the poll does not sleep out the rest of it while a job waits (a
    // NOTIFY wakes workers on a send, not on a thread freed). A busy worker so woken fetches as soon as its own run
    // ends. A failed attempt wakes nothing, so threads that cannot price (a pool past its restarts) fail queued jobs one
    // poll at a time, never in a burst. The pool still decides which run a free thread takes: the normal tier first,
    // the waiting tier only while another thread stays idle.
    const wakePricing = () => {
      for (const worker of boss.getWipData()) {
        if ((SCREENING_PRICING_JOB_TYPES as readonly string[]).includes(worker.name)) {
          boss.notifyWorker(worker.id);
        }
      }
    };
    for (const type of SCREENING_JOB_TYPES) {
      const pricing = SCREENING_PRICING_JOB_TYPES.includes(type);
      await boss.work(type, screeningWorkOptions(type, screening.concurrency), async (jobs) => {
        for (const job of jobs) {
          await attempt(type, job, logger, isStopping, () => runScreeningJob(type, job, screening.handlers, logger));
          if (pricing) {
            wakePricing();
          }
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
        stopRequested = true;
        heartbeat.stop();
        await boss.stop({ graceful: true, timeout: options.shutdownTimeoutMs ?? 30_000 });
        await screening?.close();
        stopHeapWatch();
        logger.info('worker stopped');
      })();
      return stopping;
    },
  };
}
