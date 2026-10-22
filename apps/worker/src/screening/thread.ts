import { isMainThread, parentPort, workerData } from 'node:worker_threads';

import { openPool } from '@tp/db';
import { createLogger } from '@tp/observability';

import type { NotificationConfig } from '../config';
import { LocalMailSender, type MailSender, sesMailSender } from '../mail/mail';
import { priceScreeningRun } from './job';
import type { ScreeningThreadReply, ScreeningThreadRequest } from './threads';

/**
 * One of the screening consumer's pricing threads (threads.ts; docs/adr/0062): bundled as dist/screening-thread.js
 * beside main.js (build.ts), run from thread.ts under tsx's loader in the source tree. It holds its own connections (two,
 * on the screening login, each transaction as tp_screening), mail sender, logger and release cache (job.ts's, one copy
 * of each release's shared types per thread), and prices the runs it is handed one at a time with priceScreeningRun(),
 * replying how each ended. A run whose pricing throws is logged by its IDs and a code and replied `failed`, with
 * nothing of the error's text: its job fails and is retried, and the run is claimed again. Imported anywhere but as a
 * worker thread, it starts nothing.
 */

/** What the main thread hands each thread when it starts it (workerData). */
export interface ScreeningThreadSettings {
  /** The screening login (SCREENING_DATABASE_URL), which switches to tp_screening in every transaction. */
  readonly databaseUrl: string;
  /** Where the result's email goes from, the application it links to, and the static host of its art. */
  readonly notifications: NotificationConfig;
  /** The process's worker_id, on every line the thread logs. */
  readonly workerId: string;
}

/** The thread's connections: two, as each prices one run at a time (a read and a record never overlap). */
export const SCREENING_THREAD_CONNECTIONS = 2;

function isSettings(value: unknown): value is ScreeningThreadSettings {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const settings = value as Partial<ScreeningThreadSettings>;
  return typeof settings.databaseUrl === 'string' && typeof settings.workerId === 'string' && typeof settings.notifications?.appOrigin === 'string';
}

function threadMail(notifications: NotificationConfig): MailSender {
  return notifications.mail.kind === 'ses' ? sesMailSender(notifications.mail.from, notifications.staticAssetOrigin) : new LocalMailSender(notifications.mail.dir, notifications.staticAssetOrigin);
}

/**
 * The code a run's failure in its thread is logged by: SCREENING_RUN_FAILED, with the error's own code when it has one
 * shaped like a code (PostgreSQL's SQLSTATE, such as 57014 for a cancelled statement, or Node's, such as ECONNRESET),
 * never its text, which can carry SQL or an address.
 */
export function screeningRunFailureCode(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : '';
  return /^[A-Z0-9_]{1,32}$/.test(code) ? `SCREENING_RUN_FAILED_${code}` : 'SCREENING_RUN_FAILED';
}

/** Starts answering the main thread; called once, as the thread's module loads. */
export function serveScreeningThread(port: NonNullable<typeof parentPort>, settings: ScreeningThreadSettings): void {
  const operator = openPool(settings.databaseUrl, SCREENING_THREAD_CONNECTIONS);
  const mail = threadMail(settings.notifications);
  const logger = createLogger({ base: { worker_id: settings.workerId } });
  const reply = (message: ScreeningThreadReply) => {
    port.postMessage(message);
  };
  port.on('message', (request: ScreeningThreadRequest) => {
    priceScreeningRun({ operator, mail, appOrigin: settings.notifications.appOrigin, logger, jobId: request.jobId }, request.runId).then(
      (outcome) => {
        reply({ kind: 'priced', outcome });
      },
      (error: unknown) => {
        // Logged here, by the run's and the job's IDs and a code: the main thread fails the job with fixed text only.
        logger.error('screening run failed in its thread', { job_id: request.jobId, screening_run_id: request.runId, error_code: screeningRunFailureCode(error) });
        reply({ kind: 'failed' });
      },
    );
  });
  reply({ kind: 'ready' });
}

if (!isMainThread && parentPort !== null) {
  if (!isSettings(workerData)) {
    throw new Error('the screening thread was started without its settings');
  }
  serveScreeningThread(parentPort, workerData);
}
