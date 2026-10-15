import { randomUUID } from 'node:crypto';

import { createLogger } from '@tp/observability';
import { PgBoss } from 'pg-boss';

import { type WorkerConfig, WorkerConfigError, readWorkerConfig } from './config';
import { placeholderHandlers } from './jobs/handlers';
import { installShutdownHandlers } from './shutdown';
import { startWorker } from './worker';

const logger = createLogger({ base: { worker_id: randomUUID() } });

let config: WorkerConfig | undefined;
try {
  config = readWorkerConfig();
} catch (error) {
  if (!(error instanceof WorkerConfigError)) {
    throw error;
  }
  // Configuration messages are written by this codebase and name the variable, never its value.
  process.stderr.write(`worker: ${error.message}\n`);
  process.exitCode = 2;
}

if (config !== undefined) {
  try {
    const boss = new PgBoss(config.databaseUrl);
    boss.on('error', () => {
      // pg-boss errors are logged by code only; their text can carry SQL and connection details.
      logger.error('queue error', { error_code: 'QUEUE_ERROR' });
    });
    const worker = await startWorker({ boss, logger, handlers: placeholderHandlers, heartbeatMs: config.heartbeatMs });
    installShutdownHandlers(worker, logger);
  } catch {
    logger.error('worker failed to start', { error_code: 'WORKER_START_FAILED' });
    process.exitCode = 1;
  }
}
