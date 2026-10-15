import { randomUUID } from 'node:crypto';

import { openPool } from '@tp/db';
import { createLogger } from '@tp/observability';
import { PgBoss } from 'pg-boss';

import { type IntakeConfig, type PlatformConfig, type WorkerConfig, WorkerConfigError, readIntakeConfig, readPlatformConfig, readWorkerConfig } from './config';
import { type JobHandlers, placeholderHandlers } from './jobs/handlers';
import { databaseJobRuns } from './jobs/runs';
import { intakeHandler } from './intake/intake';
import { intakeServices } from './intake/wiring';
import { parseHandler } from './parse/job';
import { platformRuntime } from './platform/wiring';
import { installShutdownHandlers } from './shutdown';
import { startWorker } from './worker';

const logger = createLogger({ base: { worker_id: randomUUID() } });

let config: WorkerConfig | undefined;
let platform: PlatformConfig | null = null;
let intake: IntakeConfig | undefined;
try {
  const worker = readWorkerConfig();
  platform = readPlatformConfig();
  intake = readIntakeConfig();
  config = worker;
} catch (error) {
  if (!(error instanceof WorkerConfigError)) {
    throw error;
  }
  // Configuration messages are written by this codebase and name the variable, never its value.
  process.stderr.write(`worker: ${error.message}\n`);
  process.exitCode = 2;
}

if (config !== undefined && intake !== undefined) {
  try {
    const boss = new PgBoss(config.queueDatabaseUrl);
    boss.on('error', () => {
      // pg-boss errors are logged by code only; their text can carry SQL and connection details.
      logger.error('queue error', { error_code: 'QUEUE_ERROR' });
    });
    const runtime = platform === null ? undefined : platformRuntime(platform);
    if (runtime === undefined) {
      logger.info('platform jobs not configured on this worker');
    }
    // Practice jobs: the application login, each transaction scoped to the job's one practice.
    const pool = openPool(config.databaseUrl, 4);
    // Intake takes uploads in and queues parse_835 per clean 835, which parses and loads it; the other
    // jobs arrive with their milestones. Every practice job's attempts are recorded in job_run.
    const services = intakeServices(intake);
    const handlers: JobHandlers = { ...placeholderHandlers, intake: intakeHandler(services), parse_835: parseHandler(services) };
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
