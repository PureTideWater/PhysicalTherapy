import { previousQuarter, quarterPeriod } from '@tp/ledger';

import type { JobHandler } from '../jobs/handlers';
import { type ReconcileServices, reconcilePractice } from './pass';
import { queueUnprinted } from './print';
import { DEFAULT_STATEMENT_SOURCES, type StatementSources, generateRoiStatement } from './statements';

/**
 * The reconcile job, the recovery ledger's step (PRD 5, J10 and J11: "updates the ledger"; PRD 13;
 * docs/adr/0039 and 0042): one practice per job, three attempts with the operator's alert on the third
 * (the worker's, ADR 0019). It is queued three ways, each keyed by its subject:
 *
 * - by triage, after a run the monitoring chain priced (reconcile:<practice>:<run>): the new
 *   remittances' claims against the case lines, recoupments and interest;
 * - by intake, once a posting or EFT export is stored (reconcile:<practice>:<document>): the export
 *   read into rows first;
 * - by the operator's daily schedule (reconcile:<practice>:<day>): the practice's whole ledger brought
 *   up to date (a remittance no run followed, a person's manual recoupment to tell its owner), and the
 *   quarterly ROI statement of the quarter before the day, once, with its print (the roi_statement
 *   job) queued, and the print of any statement of the practice not printed yet queued again.
 *
 * Whichever set it off, it runs the whole reconcile of the practice (pass.ts), which is idempotent: a
 * replay, or two reconciles one after the other, add nothing twice (JOB-01). One export that cannot be
 * loaded never stops the rest: it stays stored, and the attempt fails once everything else is done.
 */
/** A waiting export failed to load (named in the log by its document ID, never in the message). */
export class ExportLoadFailed extends Error {
  override readonly name = 'ExportLoadFailed';
}

export function reconcileHandler(services: ReconcileServices, sources: StatementSources = DEFAULT_STATEMENT_SOURCES): JobHandler<'reconcile'> {
  return async (payload, context) => {
    if ('pricing_run_id' in payload) {
      const status = await context.transaction(
        async (scope) => (await scope.client.query<{ status: string }>('SELECT status FROM pricing_run WHERE id = $1 AND practice_id = $2', [payload.pricing_run_id, payload.practice_id])).rows[0]?.status,
      );
      if (status !== 'complete') {
        context.logger.warn('reconcile found no complete pricing run', { pricing_run_id: payload.pricing_run_id, error_code: status === undefined ? 'RECONCILE_RUN_NOT_FOUND' : 'RECONCILE_RUN_NOT_COMPLETE' });
        return;
      }
    }
    const summary = await reconcilePractice(context, services, payload.practice_id, 'document_id' in payload ? { documentId: payload.document_id } : {});
    if ('day' in payload) {
      const period = quarterPeriod(previousQuarter(payload.day));
      const generated = await context.transaction((scope) =>
        generateRoiStatement(scope, { practiceId: payload.practice_id, periodFrom: period.from, periodTo: period.to, requestId: context.jobId }, sources),
      );
      if (generated !== null) {
        context.logger.info('quarterly ROI statement generated', { roi_statement_id: generated.statementId });
      }
      // The new quarter's statement, and any whose print never ran (a queue that refused it, three failed attempts).
      await queueUnprinted(context, payload.practice_id);
    }
    // An export that failed to load (not one the template or the database refused: those are unreadable)
    // stays stored; with the rest of the reconcile done, the attempt fails so it is retried, and the third
    // failure raises the operator's alert (ADR 0019).
    if (summary.exports.some((load) => load.outcome === 'failed')) {
      throw new ExportLoadFailed('an export could not be loaded; it stays stored for the next attempt');
    }
    if ('pricing_run_id' in payload) {
      context.logger.info('reconcile complete', { pricing_run_id: payload.pricing_run_id });
    } else if ('document_id' in payload) {
      context.logger.info('reconcile complete', { document_id: payload.document_id });
    } else {
      context.logger.info('reconcile complete');
    }
  };
}
