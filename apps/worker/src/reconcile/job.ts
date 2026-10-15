import type { JobHandler } from '../jobs/handlers';

/**
 * The monitoring chain's last step, the ledger's reconcile (PRD 5, J11: "updates the ledger"; J10; PRD
 * 13; docs/adr/0039): one practice per job, keyed by the run (reconcile:<practice>:<run>), three
 * attempts with the operator's alert on the third. The recovery ledger arrives with milestone 9, which
 * fills this step in: the run's new remittances matched to case lines, adjusted payments to entries at
 * payer approved, posting and EFT exports to posted and deposited. Until then the step checks the run
 * is complete and records that it ran: the worker records every attempt in job_run (its subject, the
 * run, as the idempotency key), and the step adds no ledger entry, so a replay has nothing to repeat.
 */
export function reconcileHandler(): JobHandler<'reconcile'> {
  return async (payload, context) => {
    const status = await context.transaction(
      async (scope) => (await scope.client.query<{ status: string }>('SELECT status FROM pricing_run WHERE id = $1 AND practice_id = $2', [payload.pricing_run_id, payload.practice_id])).rows[0]?.status,
    );
    if (status !== 'complete') {
      context.logger.warn('reconcile found no complete pricing run', { pricing_run_id: payload.pricing_run_id, error_code: status === undefined ? 'RECONCILE_RUN_NOT_FOUND' : 'RECONCILE_RUN_NOT_COMPLETE' });
      return;
    }
    context.logger.info('reconcile ran; the recovery ledger has no entries to post yet', { pricing_run_id: payload.pricing_run_id });
  };
}
