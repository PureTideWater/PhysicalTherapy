import { appDevLoginUrl, developmentMasterKey, openPool } from '@tp/db';
import { createLogger } from '@tp/observability';
import { type RunningWorker, databaseJobRuns, intakeHandler, intakeServices, parseHandler, placeholderHandlers, priceHandler, startWorker } from '@tp/worker/runtime';
import { PgBoss } from 'pg-boss';

import { E2E_DOCUMENTS_DIR, e2eDatabaseUrl } from './env';

/** The worker, as main.ts wires it in development, for the length of a test. */
export async function startLocalWorker(): Promise<{ worker: RunningWorker; close: () => Promise<void> }> {
  const pool = openPool(appDevLoginUrl(e2eDatabaseUrl()), 4);
  const boss = new PgBoss(e2eDatabaseUrl());
  boss.on('error', () => undefined);
  const services = intakeServices({ documents: { kind: 'local', dir: E2E_DOCUMENTS_DIR }, keys: { kind: 'local', masterKey: developmentMasterKey() }, scanWaitMs: 10_000 });
  const worker = await startWorker({
    boss,
    pool,
    logger: createLogger({ sink: () => undefined }),
    handlers: { ...placeholderHandlers, intake: intakeHandler(services), parse_835: parseHandler(services), price: priceHandler() },
    runs: databaseJobRuns(pool),
    heartbeatMs: 60_000,
    shutdownTimeoutMs: 5_000,
  });
  return {
    worker,
    close: async () => {
      await worker.stop();
      await pool.end();
    },
  };
}

