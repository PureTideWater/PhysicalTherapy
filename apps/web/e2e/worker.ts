import { setTimeout } from 'node:timers/promises';

import { databaseClient, developmentMasterKey, openPool, workerDevLoginUrl } from '@tp/db';
import { createLogger } from '@tp/observability';
import {
  ChromiumPdfRenderer,
  type JobContext,
  type JobHandlers,
  LocalMailSender,
  type RunningWorker,
  auditReportHandler,
  databaseJobRuns,
  digestHandler,
  intakeHandler,
  intakeServices,
  monitorHandler,
  packetExportHandler,
  parseHandler,
  placeholderHandlers,
  priceHandler,
  reconcileHandler,
  reportDocumentHandler,
  roiStatementHandler,
  startWorker,
  triageHandler,
} from '@tp/worker/runtime';
import { PgBoss } from 'pg-boss';

import { E2E_DOCUMENTS_DIR, E2E_MAIL_OUTBOX_DIR, E2E_ORIGIN, e2eDatabaseUrl } from './env';
import { LEDGER_PRACTICE } from './ledger';

/** The practice of the monthly monitoring journey (e2e/monitoring.spec.ts), whose digest the e2e worker sends. */
export const MONITORED_PRACTICE = 'SYNTHETIC OTHER PRACTICE MONITORING';

/**
 * The practices the monitoring chain's planning step acts for here: the monthly monitoring journey's
 * and the recovery journey's (e2e/reconciliation.spec.ts, J10), whose remittances reach the ledger
 * through the chain's own monitor, price, triage and reconcile.
 */
export const CHAINED_PRACTICES: ReadonlySet<string> = new Set([MONITORED_PRACTICE, LEDGER_PRACTICE]);

/**
 * A handler that does its work for the named practices only, and nothing (the placeholder) for every
 * other: whichever spec's worker takes the job, those journeys' runs, and no other spec's runs, come from
 * the chain.
 */
function onlyFor<T extends 'monitor' | 'digest'>(practices: ReadonlySet<string>, real: JobHandlers[T], fallback: JobHandlers[T]): JobHandlers[T] {
  return (async (payload: Parameters<JobHandlers[T]>[0], context: JobContext) => {
    const named = await context.transaction(async (scope) => (await scope.client.query<{ name: string }>('SELECT name FROM practice WHERE id = $1', [payload.practice_id])).rows[0]?.name);
    await (named !== undefined && practices.has(named) ? real : fallback)(payload as never, context);
  }) as JobHandlers[T];
}

/** The advisory lock a spec holds (holdExports) while an export it asked for must wait, whichever spec's worker takes it. */
function exportHoldKey(practiceId: string): string {
  return `e2e_packet_export_hold:${practiceId}`;
}

/**
 * The packet export, once no spec holds its practice's exports: every spec's worker takes any practice's export, so a
 * journey that needs its export to wait (the line written off before the job runs, e2e/packets.spec.ts) holds it
 * instead of relying on no other spec's worker running at the same time. The worker asks for the hold without waiting
 * on it, so it holds no connection meanwhile; a worker that stops while the export is held leaves it to pg-boss's retry
 * (the attempt records no event: the export's own handler has not run).
 */
function heldWhileAsked(real: JobHandlers['packet_export'], stopping: () => boolean): JobHandlers['packet_export'] {
  return async (payload: Parameters<JobHandlers['packet_export']>[0], context: JobContext) => {
    for (;;) {
      const free = await context.transaction(async (scope) => {
        const { rows } = await scope.client.query<{ free: boolean }>('SELECT pg_try_advisory_xact_lock_shared(hashtextextended($1, 0)) AS free', [exportHoldKey(payload.practice_id)]);
        return rows[0]?.free === true;
      });
      if (free) {
        break;
      }
      if (stopping()) {
        throw new Error('the export is held, and this worker is stopping');
      }
      await setTimeout(200);
    }
    await real(payload, context);
  };
}

/**
 * Holds every packet export of the practice until `release`: a worker that takes one waits, then exports or refuses it
 * as the version stands then; `release` may be called again, and does nothing then. The lock is the e2e database
 * superuser's, on a connection of its own.
 */
export async function holdExports(practiceId: string): Promise<{ release: () => Promise<void> }> {
  const client = databaseClient(e2eDatabaseUrl());
  await client.connect();
  await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [exportHoldKey(practiceId)]);
  let released = false;
  return {
    // Once: the journey releases it when its export may run, and again on its way out whatever happened.
    release: async () => {
      if (released) {
        return;
      }
      released = true;
      try {
        await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [exportHoldKey(practiceId)]);
      } finally {
        await client.end();
      }
    },
  };
}

/**
 * The worker, as main.ts wires it in development, for the length of a test. The monitoring chain's
 * planning step (monitor; docs/adr/0039) is real for the monitoring and recovery journeys' practices
 * (CHAINED_PRACTICES), and the digest for the monitoring journey's alone (emailed to the local outbox,
 * MAIL_OUTBOX_DIR's directory); both are placeholders for every other practice: each other spec's
 * pricing runs are the ones it creates, and the database tests run the chain on synthetic files. A spec
 * starts the monitor step a parse queued without its batch wait (e2e/journeys.ts, chainFrom). The
 * ledger's reconcile and the ROI statement's and report documents' prints are real (docs/adr/0043,
 * 0045): they act only where there is something to do (a case line, an export, a statement, a document),
 * so every worker takes them.
 */
export async function startLocalWorker(): Promise<{ worker: RunningWorker; close: () => Promise<void> }> {
  // The worker's own login, as in development and production (docs/adr/0061).
  const pool = openPool(workerDevLoginUrl(e2eDatabaseUrl()), 4);
  const boss = new PgBoss(e2eDatabaseUrl());
  boss.on('error', () => undefined);
  let stopping = false;
  const services = intakeServices({ documents: { kind: 'local', dir: E2E_DOCUMENTS_DIR }, keys: { kind: 'local', masterKey: developmentMasterKey() }, scanWaitMs: 10_000 });
  const worker = await startWorker({
    boss,
    pool,
    logger: createLogger({ sink: () => undefined }),
    handlers: {
      ...placeholderHandlers,
      monitor: onlyFor<'monitor'>(CHAINED_PRACTICES, monitorHandler(), placeholderHandlers.monitor),
      digest: onlyFor<'digest'>(new Set([MONITORED_PRACTICE]), digestHandler({ mail: new LocalMailSender(E2E_MAIL_OUTBOX_DIR, null), appOrigin: E2E_ORIGIN }), placeholderHandlers.digest),
      intake: intakeHandler(services),
      parse_835: parseHandler(services),
      price: priceHandler(),
      triage: triageHandler(),
      audit_report: auditReportHandler({ documents: services.documents, keys: services.keys, pdf: new ChromiumPdfRenderer() }),
      reconcile: reconcileHandler({ documents: services.documents, keys: services.keys }),
      roi_statement: roiStatementHandler({ documents: services.documents, keys: services.keys, pdf: new ChromiumPdfRenderer() }),
      // A packet's export is real too (docs/adr/0041): it prints only a version a person approved and exports.
      packet_export: heldWhileAsked(packetExportHandler({ documents: services.documents, keys: services.keys, pdf: new ChromiumPdfRenderer() }), () => stopping),
      report_document: reportDocumentHandler({ documents: services.documents, keys: services.keys, pdf: new ChromiumPdfRenderer() }),
    },
    runs: databaseJobRuns(pool),
    heartbeatMs: 60_000,
    shutdownTimeoutMs: 5_000,
  });
  return {
    worker,
    close: async () => {
      stopping = true;
      await worker.stop();
      await pool.end();
    },
  };
}

