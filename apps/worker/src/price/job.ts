import type { JobHandler } from '../jobs/handlers';
import { createdByMonitoring } from '../monitor/chain';
import { type ExecuteOptions, executePricingRun, failRun } from './execute';

/**
 * The worker's price job (PRD 5, J7; PRD 6, Monitoring jobs: "a failed job retries three times then
 * alerts"; test matrix JOB-01, JOB-02; docs/adr/0004, 0019 and 0035): one practice per job (its scope
 * is the payload's practice), keyed by the run (price:<practice>:<run>, so a replay while the first is
 * queued or active is refused), idempotent by the run (a complete or failed run is left as it is), and
 * one run of a practice at a time. Three attempts in all; when the third fails the run is marked failed
 * (job_failed) and the worker logs the operator's alert line.
 *
 * A run the monitoring chain created goes on to its triage once complete (docs/adr/0039): the job
 * queues triage for it, again on a replay of a complete run, so a chain whose next step was never
 * queued is picked up where it stopped; the triage job's key keeps it to one.
 */

/** The run is not there yet: the request that created it queues the job before it commits. */
export class PricingRunNotFoundError extends Error {
  override readonly name = 'PricingRunNotFoundError';
}

export function priceHandler(options: ExecuteOptions = {}): JobHandler<'price'> {
  return async (payload, context) => {
    let complete: boolean;
    try {
      const outcome = await executePricingRun(context, payload.practice_id, payload.pricing_run_id, options);
      if (outcome.outcome === 'missing') {
        if (!context.lastAttempt) {
          // The creating request commits just after it queues the job: the next attempt finds the run.
          throw new PricingRunNotFoundError('the pricing run is not recorded yet');
        }
        // Still not there on the last attempt: its creation rolled back, so there is nothing to price.
        context.logger.warn('pricing run not found', { pricing_run_id: payload.pricing_run_id, error_code: 'PRICING_RUN_NOT_FOUND' });
      }
      complete = outcome.outcome === 'complete' || (outcome.outcome === 'already_finished' && outcome.status === 'complete');
    } catch (error) {
      if (context.lastAttempt) {
        try {
          await context.transaction((scope) => failRun(scope.client, payload.practice_id, payload.pricing_run_id, 'job_failed'));
        } catch {
          context.logger.warn('pricing run not marked failed', { pricing_run_id: payload.pricing_run_id, error_code: 'PRICING_RUN_NOT_MARKED' });
        }
      }
      throw error;
    }
    if (complete && (await context.transaction((scope) => createdByMonitoring(scope, payload.practice_id, payload.pricing_run_id)))) {
      await context.enqueue('triage', { practice_id: payload.practice_id, pricing_run_id: payload.pricing_run_id });
    }
  };
}
