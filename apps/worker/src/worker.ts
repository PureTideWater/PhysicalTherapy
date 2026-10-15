import type { Logger } from '@tp/observability';
import type { PgBoss } from 'pg-boss';

import { startHeartbeat } from './heartbeat';
import type { JobHandlers } from './jobs/handlers';
import { JOB_TYPES, type JobType, QUEUE_OPTIONS, parsePayload } from './jobs/registry';

export type QueueClient = Pick<PgBoss, 'start' | 'stop' | 'createQueue' | 'work'>;

export interface WorkerOptions {
  readonly boss: QueueClient;
  readonly logger: Logger;
  readonly handlers: JobHandlers;
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

async function runJob<T extends JobType>(
  type: T,
  job: { id: string; data: unknown },
  handlers: JobHandlers,
  logger: Logger,
): Promise<void> {
  let payload;
  try {
    payload = parsePayload(type, job.data);
  } catch {
    // The payload is not echoed: the error and the log carry the job's ID and type only.
    logger.error('job payload rejected', { job_id: job.id, job_type: type, error_code: 'JOB_PAYLOAD_INVALID' });
    throw new JobPayloadError(`payload rejected for ${type} job ${job.id}`);
  }
  const jobLogger = logger.child({ job_id: job.id, job_type: type, practice_id: payload.practice_id });
  await handlers[type](payload, { jobId: job.id, logger: jobLogger });
}

/** Starts pg-boss, creates every queue, subscribes a handler to each and starts the heartbeat. */
export async function startWorker(options: WorkerOptions): Promise<RunningWorker> {
  const { boss, logger, handlers } = options;
  await boss.start();
  for (const type of JOB_TYPES) {
    await boss.createQueue(type, QUEUE_OPTIONS);
  }
  for (const type of JOB_TYPES) {
    await boss.work(type, { batchSize: 1 }, async (jobs) => {
      for (const job of jobs) {
        await runJob(type, job, handlers, logger);
      }
    });
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
