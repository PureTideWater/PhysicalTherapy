/**
 * The dunning schedule (PRD 5, J18: "failed payments follow dunning and suspend new runs after 30 days while
 * leaving data readable"; PRD 6, Billing: "dunning; suspension rules"; docs/adr/0050). Pure: dates in, the
 * notice due out.
 *
 * The clock starts at an invoice's first failed payment. Stripe retries the payment on its own schedule
 * (the local simulator on days 3, 7 and 14); the organization's administrators are told on the day it
 * fails, a week later, two weeks later, a week before the suspension and on the day it takes effect, 30
 * days after the failure, when the database starts refusing new runs (billing_standing, in SQL, holds the
 * same 30 days; a database test proves the two agree). Paying the invoice ends it: a suspended
 * organization is told it is reinstated, one paid earlier that its payment arrived ("resolved", quietly).
 */

export const SUSPENSION_DAYS = 30;

export type DunningNotice = 'payment_failed' | 'second_notice' | 'third_notice' | 'final_notice' | 'suspended';
export type DunningEnding = 'reinstated' | 'resolved';
export type DunningStageCode = DunningNotice | DunningEnding;

/** Each notice and the day after the first failed payment it is due. */
export const DUNNING_SCHEDULE: readonly { readonly notice: DunningNotice; readonly day: number }[] = [
  { notice: 'payment_failed', day: 0 },
  { notice: 'second_notice', day: 7 },
  { notice: 'third_notice', day: 14 },
  { notice: 'final_notice', day: SUSPENSION_DAYS - 7 },
  { notice: 'suspended', day: SUSPENSION_DAYS },
];

/** The days the local simulator retries a failed payment on, after the first failure (Stripe uses its own). */
export const SIMULATOR_RETRY_DAYS: readonly number[] = [3, 7, 14];

const DAY_MS = 86_400_000;

/** When the organization is suspended for an invoice whose payment first failed at `firstFailedAt`. */
export function suspensionAt(firstFailedAt: Date): Date {
  return new Date(firstFailedAt.getTime() + SUSPENSION_DAYS * DAY_MS);
}

/** Whether an unpaid invoice whose payment first failed at `firstFailedAt` suspends its organization at `now`. */
export function suspendsAt(firstFailedAt: Date, now: Date): boolean {
  return now.getTime() >= suspensionAt(firstFailedAt).getTime();
}

/** The latest notice due by `now` for an unpaid invoice, by the schedule. */
export function noticeDue(firstFailedAt: Date, now: Date): DunningNotice {
  let due: DunningNotice = 'payment_failed';
  for (const step of DUNNING_SCHEDULE) {
    if (now.getTime() >= firstFailedAt.getTime() + step.day * DAY_MS) {
      due = step.notice;
    }
  }
  return due;
}

function rank(stage: DunningStageCode | null): number {
  return stage === null ? -1 : DUNNING_SCHEDULE.findIndex((step) => step.notice === stage);
}

export interface DunningState {
  /** The invoice is still owed (open or uncollectible). */
  readonly unpaid: boolean;
  /** The invoice was paid (a voided one is neither). */
  readonly paid: boolean;
  readonly firstFailedAt: Date | null;
  /** The last notice recorded for it. */
  readonly stage: DunningStageCode | null;
}

/**
 * What to send now for one invoice, or null: the latest notice the schedule has reached that has not been
 * sent (a notice missed on a day the job did not run is skipped for the latest one, never sent late in a
 * pile), or, once paid, the ending (reinstated after a suspension, resolved before one).
 */
export function nextDunningStep(state: DunningState, now: Date): DunningStageCode | null {
  if (state.firstFailedAt === null) {
    return null;
  }
  if (state.paid) {
    if (state.stage === null || state.stage === 'reinstated' || state.stage === 'resolved') {
      return null;
    }
    return state.stage === 'suspended' ? 'reinstated' : 'resolved';
  }
  if (!state.unpaid || state.stage === 'reinstated' || state.stage === 'resolved') {
    return null;
  }
  const due = noticeDue(state.firstFailedAt, now);
  return rank(due) > rank(state.stage) ? due : null;
}
