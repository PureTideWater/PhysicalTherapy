import type { JobHandler } from '../jobs/handlers';
import { closePassedWindows, todayUtc } from '../triage/execute';
import { type MonitorPlan, planMonitoring } from './plan';

/**
 * The monitor job (PRD 5, J11; docs/adr/0004 and 0039): one practice per job, keyed by what set it off
 * (monitor:<practice>:<document> after a document's parse, monitor:<practice>:<day> on the daily
 * schedule), three attempts with the operator's alert on the third (the worker's, ADR 0019). It plans
 * in one transaction (plan.ts) and then queues the price job of every run the chain created that is
 * still queued: the run is committed before its job can start. A replay plans nothing new (JOB-01).
 *
 * First, in its own transaction, it writes off every open case's line whose dispute window closed
 * before today (window passed; PRD 12, Deadlines), so a case's actionable total and deadline follow the
 * calendar on the daily schedule even when no new file arrives. Again the same day, it writes off
 * nothing more.
 *
 * After a document, when the plan prices nothing (no month to price, a month waiting on a mapping, no
 * rule release in force), it queues the recovery ledger's reconcile keyed by the document
 * (reconcile:<practice>:<document>; docs/adr/0043): a remittance that reprocesses a case line or takes
 * money back by PLB is matched to the open case lines after its parse, not on the next day's schedule.
 * When it prices a run, triage queues the reconcile once the run is triaged.
 */
export function monitorHandler(): JobHandler<'monitor'> {
  return async (payload, context) => {
    const closed = await context.transaction((scope) => closePassedWindows(scope, payload.practice_id, todayUtc()));
    if (closed > 0) {
      context.logger.info('monitoring wrote off case lines whose windows closed');
    }
    const plan: MonitorPlan = await context.transaction((scope) => planMonitoring(scope, payload.practice_id, context.jobId));
    if (plan.outcome === 'batch_loading') {
      // The parse of each document still on its way queues this step again when it is done.
      context.logger.info('monitoring waits for the rest of the upload batch');
      return;
    }
    if (plan.outcome === 'no_release') {
      context.logger.warn('monitoring found no rule release in force; nothing was priced', { error_code: 'NO_RULE_RELEASE' });
    } else {
      for (const pricingRunId of plan.queued) {
        await context.enqueue('price', { practice_id: payload.practice_id, pricing_run_id: pricingRunId });
      }
      if (plan.waitingOnMapping.length > 0) {
        // Coverage shows the dollars waiting on mappings; a month is planned again on the next trigger.
        context.logger.info('monitoring left months waiting on a plan mapping', { release_no: plan.releaseNo, error_code: 'UNMAPPED_PLAN' });
      }
      context.logger.info('monitoring planned the practice’s months', { release_no: plan.releaseNo });
    }
    if ('document_id' in payload && (plan.outcome === 'no_release' || plan.queued.length === 0)) {
      await context.enqueue('reconcile', { practice_id: payload.practice_id, document_id: payload.document_id });
    }
  };
}
