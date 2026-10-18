import type { JobHandler } from '../jobs/handlers';
import { createdByMonitoring, notifyRun } from '../monitor/chain';
import { executeTriage } from './execute';

/** The error code a refused triage is logged with, by outcome. */
const TRIAGE_REFUSALS = { missing: 'TRIAGE_RUN_NOT_FOUND', not_complete: 'TRIAGE_RUN_NOT_COMPLETE', not_in_effect: 'TRIAGE_RUN_NOT_IN_EFFECT' } as const;

/**
 * The worker's triage job (PRD 5, J8 and J11; PRD 12; docs/adr/0038): one practice per job (the
 * payload's), keyed by the run (triage:<practice>:<run>), idempotent (a triage run again adds only what
 * changed since), three attempts. A person queues it for the run in effect for its period from the Cases
 * screen, and the report job runs the same triage before it reads a run's numbers. A run that is not
 * complete, or not in effect (a re-run nobody has accepted, a run since replaced), is logged and left.
 *
 * For a run the monitoring chain created (docs/adr/0039), the triaged run then tells the practice's
 * people in the app (counts and totals only, once per person) and queues the chain's last step, the
 * ledger's reconcile of the run.
 */
export function triageHandler(): JobHandler<'triage'> {
  return async (payload, context) => {
    const outcome = await executeTriage(context, payload.practice_id, payload.pricing_run_id);
    if (outcome.outcome !== 'triaged') {
      context.logger.warn('triage found no pricing run in effect', { pricing_run_id: payload.pricing_run_id, error_code: TRIAGE_REFUSALS[outcome.outcome] });
      return;
    }
    context.logger.info('triage complete', { pricing_run_id: payload.pricing_run_id });
    const chained = await context.transaction(async (scope) => {
      if (!(await createdByMonitoring(scope, payload.practice_id, payload.pricing_run_id))) {
        return false;
      }
      await notifyRun(scope, payload.practice_id, payload.pricing_run_id);
      return true;
    });
    if (chained) {
      await context.enqueue('reconcile', { practice_id: payload.practice_id, pricing_run_id: payload.pricing_run_id });
    }
  };
}
