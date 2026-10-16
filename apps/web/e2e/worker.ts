import { appDevLoginUrl, developmentMasterKey, openPool } from '@tp/db';
import { createLogger } from '@tp/observability';
import {
  ChromiumPdfRenderer,
  type RunningWorker,
  auditReportHandler,
  databaseJobRuns,
  intakeHandler,
  intakeServices,
  packetExportHandler,
  parseHandler,
  placeholderHandlers,
  priceHandler,
  startWorker,
  triageHandler,
} from '@tp/worker/runtime';
import { PgBoss } from 'pg-boss';

import { E2E_DOCUMENTS_DIR, e2eDatabaseUrl } from './env';

/**
 * The worker, as main.ts wires it in development, for the length of a test, except the monitoring
 * chain's own steps (monitor, reconcile, digest; docs/adr/0039), which stay placeholders here: each
 * spec's pricing runs are the ones it creates, and the database tests run the chain on synthetic files.
 */
export async function startLocalWorker(): Promise<{ worker: RunningWorker; close: () => Promise<void> }> {
  const pool = openPool(appDevLoginUrl(e2eDatabaseUrl()), 4);
  const boss = new PgBoss(e2eDatabaseUrl());
  boss.on('error', () => undefined);
  const services = intakeServices({ documents: { kind: 'local', dir: E2E_DOCUMENTS_DIR }, keys: { kind: 'local', masterKey: developmentMasterKey() }, scanWaitMs: 10_000 });
  const worker = await startWorker({
    boss,
    pool,
    logger: createLogger({ sink: () => undefined }),
    handlers: {
      ...placeholderHandlers,
      intake: intakeHandler(services),
      parse_835: parseHandler(services),
      price: priceHandler(),
      triage: triageHandler(),
      audit_report: auditReportHandler({ documents: services.documents, keys: services.keys, pdf: new ChromiumPdfRenderer() }),
      // A packet's export is real too (docs/adr/0041): it prints only a version a person approved and exports.
      packet_export: packetExportHandler({ documents: services.documents, keys: services.keys, pdf: new ChromiumPdfRenderer() }),
    },
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

