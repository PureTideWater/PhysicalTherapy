import { randomUUID } from 'node:crypto';

import { CONNECTION_TIMEOUT_MS, openPool } from '@tp/db';
import { createLogger } from '@tp/observability';
import { PgBoss } from 'pg-boss';

import {
  type IntakeConfig,
  type NotificationConfig,
  type PlatformConfig,
  type PlatformWorkerConfig,
  type ScreeningConfig,
  type ScreeningWorkerConfig,
  type WorkerConfig,
  WorkerConfigError,
  readIntakeConfig,
  readNotificationConfig,
  readPlatformConfig,
  readPlatformWorkerConfig,
  readScreeningConfig,
  readScreeningWorkerConfig,
  readWorkerConfig,
  readWorkerJobs,
} from './config';
import { digestHandler } from './digest/job';
import { type JobHandlers, placeholderHandlers } from './jobs/handlers';
import { databaseJobRuns } from './jobs/runs';
import type { ScreeningJobs } from './jobs/screening';
import { intakeHandler } from './intake/intake';
import { intakeServices } from './intake/wiring';
import { monitorHandler } from './monitor/job';
import { packetExportHandler } from './packets/export';
import { parseHandler } from './parse/job';
import { mailSender, platformRuntime } from './platform/wiring';
import { priceHandler } from './price/job';
import { reconcileHandler } from './reconcile/job';
import { roiStatementHandler } from './reconcile/print';
import { auditReportHandler } from './report/generate';
import { ChromiumPdfRenderer } from './report/pdf';
import { reportDocumentHandler } from './report/print-document';
import { startScreeningConsumer } from './screening/consumer';
import { installShutdownHandlers } from './shutdown';
import { triageHandler } from './triage/job';
import { startWorker } from './worker';

const workerId = randomUUID();
const logger = createLogger({ base: { worker_id: workerId } });

/**
 * The screening consumer's graceful stop (docs/adr/0062): pg-boss waits up to 110 seconds for the runs in hand (a
 * worst-shape run took at most 41 s three at once), under ECS's 120-second stop timeout for its service; the process
 * exits regardless at 115.
 */
const SCREENING_SHUTDOWN_MS = 110_000;
const SCREENING_FORCE_EXIT_MS = 115_000;

let config: WorkerConfig | undefined;
let platformWorker: PlatformWorkerConfig | undefined;
let screeningWorker: ScreeningWorkerConfig | undefined;
let platform: PlatformConfig | null = null;
let screening: ScreeningConfig | null = null;
let intake: IntakeConfig | undefined;
let notifications: NotificationConfig | undefined;
try {
  const jobs = readWorkerJobs();
  if (jobs === 'platform') {
    // The platform jobs alone (docs/adr/0049): the operator and queue logins, no application login.
    platformWorker = readPlatformWorkerConfig();
    platform = readPlatformConfig();
  } else if (jobs === 'screening') {
    // The screening consumer alone (docs/adr/0062): the screening and queue logins, nothing else.
    screeningWorker = readScreeningWorkerConfig();
  } else {
    const worker = readWorkerConfig();
    platform = jobs === 'practice' ? null : readPlatformConfig();
    // Development and the tests: the screening's pricing too, where its login is set.
    screening = jobs === 'practice' ? null : readScreeningConfig();
    intake = readIntakeConfig();
    notifications = readNotificationConfig();
    config = worker;
  }
} catch (error) {
  if (!(error instanceof WorkerConfigError)) {
    throw error;
  }
  // Configuration messages are written by this codebase and name the variable, never its value.
  process.stderr.write(`worker: ${error.message}\n`);
  process.exitCode = 2;
}

if (platformWorker !== undefined && platform !== null) {
  try {
    const boss = new PgBoss({ connectionString: platformWorker.queueDatabaseUrl, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS });
    boss.on('error', () => {
      logger.error('queue error', { error_code: 'QUEUE_ERROR' });
    });
    const runtime = platformRuntime(platform, boss);
    const worker = await startWorker({ boss, logger, heartbeatMs: platformWorker.heartbeatMs, platform: runtime.handlers });
    installShutdownHandlers(worker, logger);
  } catch {
    logger.error('worker failed to start', { error_code: 'WORKER_START_FAILED' });
    process.exitCode = 1;
  }
}

if (screeningWorker !== undefined) {
  let consumer: ScreeningJobs | undefined;
  try {
    const boss = new PgBoss({ connectionString: screeningWorker.queueDatabaseUrl, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS });
    boss.on('error', () => {
      logger.error('queue error', { error_code: 'QUEUE_ERROR' });
    });
    consumer = await startScreeningConsumer(screeningWorker.screening, boss, logger, { workerId });
    const worker = await startWorker({ boss, logger, heartbeatMs: screeningWorker.heartbeatMs, screening: consumer, shutdownTimeoutMs: SCREENING_SHUTDOWN_MS });
    installShutdownHandlers(worker, logger, process, SCREENING_FORCE_EXIT_MS);
  } catch {
    logger.error('worker failed to start', { error_code: 'WORKER_START_FAILED' });
    process.exitCode = 1;
    // Its threads would keep the process alive.
    await consumer?.close();
  }
}

if (config !== undefined && intake !== undefined && notifications !== undefined) {
  let consumer: ScreeningJobs | undefined;
  try {
    const boss = new PgBoss({ connectionString: config.queueDatabaseUrl, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS });
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
    // packet_export prints an approved packet's PDF and CSV with its identifiers inserted;
    // roi_statement prints an ROI statement's PDF; report_document prints a coverage report's or a monthly
    // summary's PDF; export arrives with its milestone. Every practice job's attempts are recorded in job_run.
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
      roi_statement: roiStatementHandler({ documents: services.documents, keys: services.keys, pdf: new ChromiumPdfRenderer() }),
      report_document: reportDocumentHandler({ documents: services.documents, keys: services.keys, pdf: new ChromiumPdfRenderer() }),
    };
    consumer = screening === null ? undefined : await startScreeningConsumer(screening, boss, logger, { workerId });
    const worker = await startWorker({
      boss,
      logger,
      handlers,
      pool,
      runs: databaseJobRuns(pool),
      heartbeatMs: config.heartbeatMs,
      ...(runtime === undefined ? {} : { platform: runtime.handlers }),
      ...(consumer === undefined ? {} : { screening: consumer }),
    });
    installShutdownHandlers(worker, logger);
  } catch {
    logger.error('worker failed to start', { error_code: 'WORKER_START_FAILED' });
    process.exitCode = 1;
    await consumer?.close();
  }
}
