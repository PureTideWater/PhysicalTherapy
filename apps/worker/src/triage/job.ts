import type { JobHandler } from '../jobs/handlers';
import { executeTriage } from './execute';

/**
 * The worker's triage job (PRD 5, J8 and J11; PRD 12; docs/adr/0038): one practice per job (the
 * payload's), keyed by the run (triage:<practice>:<run>), idempotent (a triage run again adds only what
 * changed since), three attempts. A person queues it for a complete run from the Cases screen, and the
 * report job runs the same triage before it reads a run's numbers. A run that is not complete is
 * logged and left: triage waits for the run.
 */
export function triageHandler(): JobHandler<'triage'> {
  return async (payload, context) => {
    const outcome = await executeTriage(context, payload.practice_id, payload.pricing_run_id);
    if (outcome.outcome !== 'triaged') {
      context.logger.warn('triage found no complete pricing run', { pricing_run_id: payload.pricing_run_id, error_code: outcome.outcome === 'missing' ? 'TRIAGE_RUN_NOT_FOUND' : 'TRIAGE_RUN_NOT_COMPLETE' });
      return;
    }
    context.logger.info('triage complete', { pricing_run_id: payload.pricing_run_id });
  };
}
