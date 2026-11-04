import type { JobHandler } from '../jobs/handlers';
import { remindFollowUps } from '../packets/services';
import { closePassedWindows, todayUtc } from '../triage/execute';
import { type MonitorPlan, planMonitoring } from './plan';

/**
 * The monitor job (PRD 5, J11; docs/adr/0004 and 0039): one practice per job, keyed by what set it off
 * (monitor:<practice>:<document> after a document's parse, monitor:<practice>:<day> on the daily
 * schedule, monitor:<practice>:<request> for a person's request, so it is never swallowed by a daily job
 * that is active and read the old state: after a save of the practice's pricing location, after a mapping
 * that leaves months with every plan mapped, planning only those months (the payload's `months`; combined
 * audit #32, D20), and after "Price them now", planning every month no run covers), three attempts with the operator's alert on the third (the worker's, ADR 0019). It plans
 * in one transaction (plan.ts) and then queues the price job of every run the chain created that is
 * still queued: the run is committed before its job can start. A replay plans nothing new (JOB-01).
 *
 * First, in its own transaction, it writes off every open case's line whose dispute window closed
 * before today (window passed; PRD 12, Deadlines), so a case's actionable total and deadline follow the
 * calendar on the daily schedule even when no new file arrives. Again the same day, it writes off
 * nothing more. Then it reminds the case's owner of every submission whose follow-up date has come with
 * no response (in the app, once per submission; PRD 6, "follow-up dates; reminders").
 *
 * Months left waiting are logged by what they wait on, with their count: a mapping (months none of whose plans has
 * one, MAP-07) and the practice's pricing location as information (the customer's steps), Medicare content PaidWhole
 * has not loaded as a warning (WAITING_ON_CONTENT, the operator's; audit #7).
 *
 * After a document, when the plan prices nothing (no month to price, a month none of whose plans is mapped, no
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
    // The follow-up reminders whose day has come (once per submission), in their own transaction too.
    const reminded = await context.transaction((scope) => remindFollowUps(scope, { practiceId: payload.practice_id, asOf: todayUtc() }));
    if (reminded > 0) {
      context.logger.info('monitoring reminded the case owners of follow-ups that have come');
    }
    const plan: MonitorPlan = await context.transaction((scope) => planMonitoring(scope, payload.practice_id, context.jobId, 'months' in payload ? payload.months : undefined));
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
        // Months with no mapped plan at all (MAP-07); every other month was priced around its unmapped plans. Coverage shows
        // the dollars waiting on mappings; a mapping that completes a month queues this step, and the daily trigger plans it.
        context.logger.info('monitoring left months waiting on a plan mapping', {
          release_no: plan.releaseNo,
          error_code: 'UNMAPPED_PLAN',
          record_count: plan.waitingOnMapping.length,
        });
      }
      if (plan.waitingOnLocation.length > 0) {
        // The customer's step, never the operator's: Coverage and Pricing settings name the months; a save of the
        // location queues this step again (audit #33).
        context.logger.info('monitoring left months waiting on the practice’s pricing location', {
          release_no: plan.releaseNo,
          error_code: 'LOCATION_NOT_READY',
          record_count: plan.waitingOnLocation.length,
        });
      }
      if (plan.waitingOnContent.length > 0) {
        // PaidWhole's step, never the customer's: the months wait, with no run, until a release in force loads the
        // Medicare content they read (audit #7). The price job logged CONTENT_NOT_LOADED once per refused run; this is the
        // per-plan line. Both lines' alarms come with the later pull request (docs/adr/0071).
        context.logger.warn('monitoring left months waiting on rule content PaidWhole has not loaded', {
          release_no: plan.releaseNo,
          error_code: 'WAITING_ON_CONTENT',
          record_count: plan.waitingOnContent.length,
        });
      }
      context.logger.info('monitoring planned the practice’s months', { release_no: plan.releaseNo });
    }
    if ('document_id' in payload && (plan.outcome === 'no_release' || plan.queued.length === 0)) {
      await context.enqueue('reconcile', { practice_id: payload.practice_id, document_id: payload.document_id });
    }
  };
}
