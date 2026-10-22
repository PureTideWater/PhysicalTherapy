import { openPool } from '@tp/db';
import type { Logger } from '@tp/observability';

import type { ScreeningConfig } from '../config';
import type { JobSender } from '../jobs/enqueue';
import { type ScreeningJobs, createScreeningHandlers } from '../jobs/screening';
import { mailSender } from '../platform/wiring';
import { SWEEP_MIN_QUEUED_AGE_SECONDS, resendScreeningRuns } from './job';
import type { ScreeningThreadSettings } from './thread';
import { ScreeningThreadPool, screeningThreadScript } from './threads';

/** The sweep's own connections on the main thread: the due runs, a stale run's failure and the gauge, one at a time. */
export const SCREENING_SWEEP_CONNECTIONS = 2;

export interface ScreeningConsumerOptions {
  /** The process's worker_id, on every line its threads log. */
  readonly workerId: string;
  /** The threads' module and Node options (tests give their own); the real thread otherwise. */
  readonly thread?: { readonly script: URL; readonly execArgv: readonly string[] };
}

/**
 * The screening consumer (WORKER_JOBS=screening, or a development worker with SCREENING_DATABASE_URL; docs/adr/0062):
 * starts its pricing threads, one per run priced at once, and waits until each is ready; then gives the worker the two
 * screening jobs' handlers. screening_price hands its run to a thread and waits for it there, so pg-boss's heartbeat for
 * the job keeps beating on this thread while the run is priced; a thread that fails the run fails the job, with fixed
 * text, never the error's. The sweep runs here, on its own two connections on the screening login, and sends jobs to
 * `queue`. close() ends the threads (after the runs in hand) and the sweep's connections.
 */
export async function startScreeningConsumer(config: ScreeningConfig, queue: JobSender, logger: Logger, options: ScreeningConsumerOptions): Promise<ScreeningJobs> {
  const settings: ScreeningThreadSettings = { databaseUrl: config.databaseUrl, notifications: config.notifications, workerId: options.workerId };
  const pool = new ScreeningThreadPool({ size: config.concurrency, ...(options.thread ?? screeningThreadScript()), workerData: settings, logger });
  try {
    await pool.start();
  } catch (error) {
    await pool.close();
    throw error;
  }
  const sweep = openPool(config.databaseUrl, SCREENING_SWEEP_CONNECTIONS);
  const mail = mailSender(config.notifications);
  return {
    concurrency: config.concurrency,
    handlers: createScreeningHandlers({
      price: async (runId, context) => {
        await pool.price({ runId, jobId: context.jobId });
      },
      sweep: async (context) => {
        await resendScreeningRuns({ operator: sweep, mail, appOrigin: config.notifications.appOrigin, logger: context.logger, jobId: context.jobId }, queue, {
          minQueuedAgeSeconds: SWEEP_MIN_QUEUED_AGE_SECONDS,
        });
      },
    }),
    close: async () => {
      await pool.close();
      await sweep.end();
    },
  };
}
