import type { JobHandler } from '../jobs/handlers';
import { type MonitorPlan, planMonitoring } from './plan';

/**
 * The monitor job (PRD 5, J11; docs/adr/0004 and 0039): one practice per job, keyed by what set it off
 * (monitor:<practice>:<document> after a document's parse, monitor:<practice>:<day> on the daily
 * schedule), three attempts with the operator's alert on the third (the worker's, ADR 0019). It plans
 * in one transaction (plan.ts) and then queues the price job of every run the chain created that is
 * still queued: the run is committed before its job can start. A replay plans nothing new (JOB-01).
 */
export function monitorHandler(): JobHandler<'monitor'> {
  return async (payload, context) => {
    const plan: MonitorPlan = await context.transaction((scope) => planMonitoring(scope, payload.practice_id, context.jobId));
    if (plan.outcome === 'batch_loading') {
      // The parse of each document still on its way queues this step again when it is done.
      context.logger.info('monitoring waits for the rest of the upload batch');
      return;
    }
    if (plan.outcome === 'no_release') {
      context.logger.warn('monitoring found no rule release in force; nothing was priced', { error_code: 'NO_RULE_RELEASE' });
      return;
    }
    for (const pricingRunId of plan.queued) {
      await context.enqueue('price', { practice_id: payload.practice_id, pricing_run_id: pricingRunId });
    }
    if (plan.waitingOnMapping.length > 0) {
      // Coverage shows the dollars waiting on mappings; a month is planned again on the next trigger.
      context.logger.info('monitoring left months waiting on a plan mapping', { release_no: plan.releaseNo, error_code: 'UNMAPPED_PLAN' });
    }
    context.logger.info('monitoring planned the practice’s months', { release_no: plan.releaseNo });
  };
}
