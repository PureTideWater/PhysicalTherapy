import { loadPracticeCipher } from '@tp/db/runtime';

import type { JobContext } from '../jobs/handlers';
import { type ExportLoad, type ExportServices, loadExports } from './exports';
import { lockLedger } from './ledger';
import { matchDeposits, matchPostings, settleMatches } from './postings';
import { type RecordReprocessedNoChange, type RemittanceOutcome, reconcileRemittances } from './remittances';
import { type AcceptedResponses, approveFromResponses } from './responses';
import { type StageSync, manualRecoupments, notifyRecoupments, syncLineStages } from './stages';

/**
 * One reconcile of a practice (PRD 5, J10 and J11: "updates the ledger"; PRD 13): the practice's waiting
 * exports read into rows, then, in one transaction locked for the practice, the payer responses that
 * accept an amount, remittances against case lines (approvals, recoupments, interest), posting and EFT
 * rows against remittances, the posted and deposited entries their matches owe, every case line's stage
 * from its entries, and the recoupment notices. Every step is idempotent, so a replayed or overlapping reconcile adds nothing twice (JOB-01).
 */

export interface ReconcileServices extends ExportServices {
  /** Records a payer response "reprocessed, no change" (the submissions' function, milestone 8). */
  readonly recordNoChange: RecordReprocessedNoChange;
  /** The payer responses that accept an amount (the submissions' function, milestone 8). */
  readonly acceptedResponses: AcceptedResponses;
}

/** Until submissions are wired: no case has a submission to answer, and no response accepts anything. */
export const NO_SUBMISSIONS: Pick<ReconcileServices, 'recordNoChange' | 'acceptedResponses'> = {
  recordNoChange: () => Promise.resolve('no_submission'),
  acceptedResponses: () => Promise.resolve([]),
};

export interface ReconcileSummary {
  readonly exports: readonly ExportLoad[];
  readonly approvedFromResponses: number;
  readonly remittances: RemittanceOutcome;
  readonly postingsMatched: number;
  readonly depositsMatched: number;
  readonly entriesSettled: number;
  readonly stages: StageSync;
  readonly notified: number;
}

export async function reconcilePractice(context: JobContext, services: ReconcileServices, practiceId: string, options: { readonly documentId?: string } = {}): Promise<ReconcileSummary> {
  const cipher = await context.transaction((scope) => loadPracticeCipher(scope, services.keys, practiceId));
  const exports = await loadExports(context, services, cipher, practiceId, options.documentId);
  return context.transaction(async (scope) => {
    await lockLedger(scope, practiceId);
    const approvedFromResponses = await approveFromResponses(scope, practiceId, await services.acceptedResponses(scope, practiceId));
    const remittances = await reconcileRemittances(scope, cipher, practiceId, services.recordNoChange);
    const postingsMatched = await matchPostings(scope, cipher, practiceId);
    const depositsMatched = await matchDeposits(scope, practiceId);
    const entriesSettled = await settleMatches(scope, practiceId, null);
    const stages = await syncLineStages(scope, cipher, practiceId, null);
    let notified = await notifyRecoupments(scope, practiceId, remittances.recouped);
    for (const entry of await manualRecoupments(scope, practiceId)) {
      notified += await notifyRecoupments(scope, practiceId, [entry]);
    }
    return { exports, approvedFromResponses, remittances, postingsMatched, depositsMatched, entriesSettled, stages, notified };
  });
}
