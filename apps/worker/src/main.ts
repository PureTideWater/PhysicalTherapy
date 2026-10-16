import { randomUUID } from 'node:crypto';

import { openPool } from '@tp/db';
import { createLogger } from '@tp/observability';
import { PgBoss } from 'pg-boss';

import {
  type IntakeConfig,
  type NotificationConfig,
  type PlatformConfig,
  type WorkerConfig,
  WorkerConfigError,
  readIntakeConfig,
  readNotificationConfig,
  readPlatformConfig,
  readWorkerConfig,
} from './config';
import { digestHandler } from './digest/job';
import { type JobHandlers, placeholderHandlers } from './jobs/handlers';
import { databaseJobRuns } from './jobs/runs';
import { intakeHandler } from './intake/intake';
import { intakeServices } from './intake/wiring';
import { monitorHandler } from './monitor/job';
import { packetExportHandler } from './packets/export';
import { parseHandler } from './parse/job';
import { mailSender, platformRuntime } from './platform/wiring';
import { priceHandler } from './price/job';
import { reconcileHandler } from './reconcile/job';
import { auditReportHandler } from './report/generate';
import { ChromiumPdfRenderer } from './report/pdf';
import { installShutdownHandlers } from './shutdown';
import { triageHandler } from './triage/job';
import { startWorker } from './worker';

const logger = createLogger({ base: { worker_id: randomUUID() } });

let config: WorkerConfig | undefined;
let platform: PlatformConfig | null = null;
let intake: IntakeConfig | undefined;
let notifications: NotificationConfig | undefined;
try {
  const worker = readWorkerConfig();
  platform = readPlatformConfig();
  intake = readIntakeConfig();
  notifications = readNotificationConfig();
  config = worker;
} catch (error) {
  if (!(error instanceof WorkerConfigError)) {
    throw error;
  }
  // Configuration messages are written by this codebase and name the variable, never its value.
  process.stderr.write(`worker: ${error.message}\n`);
  process.exitCode = 2;
}

if (config !== undefined && intake !== undefined && notifications !== undefined) {
  try {
    const boss = new PgBoss(config.queueDatabaseUrl);
    boss.on('error', () => {
      // pg-boss errors are logged by code only; their text can carry SQL and connection details.
      logger.error('queue error', { error_code: 'QUEUE_ERROR' });
    });
    const runtime = platform === null ? undefined : platformRuntime(platform, boss);
    if (runtime === undefined) {
      logger.info('platform jobs not configured on this worker');
    }
    // Practice jobs: the application login, each transaction scoped to the job's one practice.
    const pool = openPool(config.databaseUrl, 4);
    // Intake takes uploads in and queues parse_835 per clean 835, which parses and loads it and queues
    // the monitoring chain: monitor plans the months to price, price executes a pricing run, triage
    // screens a complete run and groups its lines into cases, reconcile is the ledger's step; digest
    // sends a practice's monthly digest; audit_report triages a run and prints its report;
    // packet_export prints an approved packet's PDF and CSV with its identifiers inserted; export
    // arrives with its milestone. Every practice job's attempts are recorded in job_run.
    const services = intakeServices(intake);
    const handlers: JobHandlers = {
      ...placeholderHandlers,
      intake: intakeHandler(services),
      parse_835: parseHandler(services),
      monitor: monitorHandler(),
      price: priceHandler(),
      triage: triageHandler(),
      reconcile: reconcileHandler({ documents: services.documents, keys: services.keys }),
      digest: digestHandler({ mail: mailSender(notifications), appOrigin: notifications.appOrigin }),
      audit_report: auditReportHandler({ documents: services.documents, keys: services.keys, pdf: new ChromiumPdfRenderer() }),
      packet_export: packetExportHandler({ documents: services.documents, keys: services.keys, pdf: new ChromiumPdfRenderer() }),
    };
    const worker = await startWorker({
      boss,
      logger,
      handlers,
      pool,
      runs: databaseJobRuns(pool),
      heartbeatMs: config.heartbeatMs,
      ...(runtime === undefined ? {} : { platform: runtime.handlers }),
    });
    installShutdownHandlers(worker, logger);
  } catch {
    logger.error('worker failed to start', { error_code: 'WORKER_START_FAILED' });
    process.exitCode = 1;
  }
}
