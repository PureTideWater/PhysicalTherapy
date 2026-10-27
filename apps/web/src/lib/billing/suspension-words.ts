import type { SuspensionReason } from '@tp/db/runtime';

/**
 * The customer's words for a hold on new work at a practice (docs/adr/0080; design SS-01, sections 6.2, 6.3 and 6.6):
 * the practice home's notice (H1 to H13) with its next step, the work a grantee's hold stops, the job outcome label
 * (J1) and the state of a grant whose grantee is held (G1, G2). Pure: the hold in, the words out, so its tests read
 * every sentence whole.
 *
 * Whose hold it is and why come from Postgres (practice_run_hold): someone outside the held organization receives
 * the cause on_hold, or closed, and never a reason (D6), so these words never say more than they were given. As a
 * second guard, a suspension or nonpayment given for a reader outside the organization is worded as on hold, and no
 * reason or billing link is printed to them.
 */

/** The run-starting permissions, in run_starting_permissions()'s order (the words' order). */
export const RUN_STARTING_PERMISSIONS = ['mapping.edit', 'case.work', 'posting.reconcile', 'phi.export', 'file.upload'] as const;
export type RunStartingPermission = (typeof RUN_STARTING_PERMISSIONS)[number];

/** What each run-starting permission starts, in the notice's words. */
const WORK: Readonly<Record<RunStartingPermission, readonly string[]>> = {
  'mapping.edit': ['pricing runs'],
  'case.work': ['triage', 'reports'],
  'posting.reconcile': ['ROI statements'],
  'phi.export': ['packet exports'],
  'file.upload': ['uploads'],
};

export type HoldSource = 'owner' | 'grantee';
/** suspended and nonpayment reach the owning organization's members only; anyone else reads on_hold (D6). */
export type HoldCause = 'suspended' | 'nonpayment' | 'on_hold' | 'closed';

/** A hold on new work at the practice, as the person reads it (lib/billing/hold.ts practiceHold). */
export interface PracticeHold {
  readonly source: HoldSource;
  readonly cause: HoldCause;
  /** PaidWhole's stored reason, given only for a suspension, to the held organization's own members. */
  readonly reason: SuspensionReason | null;
  /** Since when: PaidWhole's suspension or the closure, or billing's hold. */
  readonly since: Date | null;
  /** For a grantee's hold, the work it stops for this person (never empty); none for the owner's. */
  readonly stopped: readonly RunStartingPermission[];
  /** For a grantee's hold, the name of the person's own organization, which the hold is on. */
  readonly name: string | null;
  /** Whether the person is a member of the held organization. */
  readonly viewer: 'member' | 'other';
  /** The held organization's billing page, when the person holds its billing. */
  readonly billingHref: string | null;
}

/** The line under the notice: a link and the words after it, or words alone. */
export interface HoldNextStep {
  readonly link: string | null;
  readonly href: string | null;
  readonly text: string;
}

export interface HoldNotice {
  readonly source: HoldSource;
  readonly title: string;
  readonly body: string;
  readonly nextStep: HoldNextStep | null;
}

/** J1: a job the worker's gate refused, on the practice home. */
export const JOB_REFUSED_LABEL = "Refused: new work had stopped for the practice's organization";

/** The ticket for a question about a closure (H11; the billing page's own). */
const CLOSURE_TICKET: HoldNextStep = { link: 'Open a support ticket', href: '/support?from=billing', text: ' if you have a question about the closure.' };

/** The owner's hold stops all of it, monitoring included. */
const ALL_WORK = 'pricing runs, triage, reports, packet exports, uploads and monitoring';

/** The reason clause, for the held organization's own members only (D6). */
const REASON_CLAUSE: Readonly<Record<SuspensionReason, string>> = {
  customer_request: ", at your organization's request",
  security_hold: ', while it looks into a security concern',
  agreement_ended: ", because your organization's agreement with PaidWhole has ended",
};

/** A date as the pages print one: YYYY-MM-DD, UTC. */
const day = (date: Date): string => date.toISOString().slice(0, 10);

/** The stopped work in its order and words, joined with commas and "or" before the last. */
export function stoppedWork(stopped: readonly RunStartingPermission[]): string {
  const words = RUN_STARTING_PERMISSIONS.filter((permission) => stopped.includes(permission)).flatMap((permission) => WORK[permission]);
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} or ${words.at(-1) ?? ''}`;
}

const capitalized = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** H8 or H9: where a member reads why and what to do next. */
function memberStep(hold: PracticeHold): HoldNextStep {
  return hold.billingHref === null
    ? { link: null, href: null, text: "Your organization's administrator sees why and what to do next in Settings, Billing." }
    : { link: 'Settings, Billing', href: hold.billingHref, text: ' shows why and what to do next.' };
}

/** H10: anyone else at a practice its owner's hold stops. */
const PRACTICE_ADMINISTRATOR_STEP: HoldNextStep = { link: null, href: null, text: "The practice's administrator sees why and what to do next in Settings, Billing." };

function grantee(hold: PracticeHold): HoldNotice {
  const firm = hold.name ?? 'your organization';
  const work = stoppedWork(hold.stopped);
  const title = "Work through your organization's grant has stopped";
  if (hold.cause === 'closed') {
    return { source: 'grantee', title, body: `${capitalized(firm)} is closed, so you start no new ${work} at this practice through its grant.`, nextStep: CLOSURE_TICKET };
  }
  const clause = hold.reason === null ? '' : REASON_CLAUSE[hold.reason];
  const suspended = hold.since === null ? `PaidWhole has suspended ${firm}${clause}` : `PaidWhole suspended ${firm} on ${day(hold.since)}${clause}`;
  return {
    source: 'grantee',
    title,
    body: `${suspended}, so you start no new ${work} at this practice through its grant until PaidWhole reinstates ${firm}. You can still read everything here, and the practice's own staff carry on.`,
    nextStep: memberStep(hold),
  };
}

function owner(hold: PracticeHold): HoldNotice {
  const member = hold.viewer === 'member';
  if (hold.cause === 'closed') {
    return {
      source: 'owner',
      title: 'No new runs start',
      body: `${member ? 'Your organization' : "The practice's organization"} is closed, so ${ALL_WORK} do not start here. Everything here stays readable.`,
      nextStep: member ? CLOSURE_TICKET : null,
    };
  }
  if (hold.cause === 'on_hold' || !member) {
    const held = hold.since === null ? 'is on hold' : `has been on hold since ${day(hold.since)}`;
    return {
      source: 'owner',
      title: 'New work has stopped here',
      body: `The PaidWhole account of the practice's organization ${held}, so ${ALL_WORK} do not start here. Everything here stays readable.`,
      nextStep: PRACTICE_ADMINISTRATOR_STEP,
    };
  }
  if (hold.cause === 'nonpayment') {
    return {
      source: 'owner',
      title: 'New runs have stopped',
      body: `An invoice of your organization has been unpaid for 30 days since its payment failed, so ${ALL_WORK} do not start here until it is paid. Everything here stays readable.`,
      nextStep: memberStep(hold),
    };
  }
  const clause = hold.reason === null ? '' : REASON_CLAUSE[hold.reason];
  const suspended = hold.since === null ? `PaidWhole has suspended your organization${clause}` : `PaidWhole suspended your organization on ${day(hold.since)}${clause}`;
  return {
    source: 'owner',
    title: 'New runs have stopped',
    body: `${suspended}. ${capitalized(ALL_WORK)} do not start here until PaidWhole reinstates your organization. Everything here stays readable.`,
    nextStep: memberStep(hold),
  };
}

/** The practice home's notice of the hold (H1 to H13), with its next step (H8 to H12). */
export function holdNotice(hold: PracticeHold): HoldNotice {
  return hold.source === 'grantee' ? grantee(hold) : owner(hold);
}

/** G1 or G2: a grant in force whose grantee is held, on the practice's grants; null while the grantee is active. */
export function grantHoldState(granteeStatus: string, granteeName: string): string | null {
  if (granteeStatus === 'suspended') {
    return `In force. The PaidWhole account of ${granteeName} is on hold, so its people start no new work here through this grant; your own staff carry on.`;
  }
  if (granteeStatus === 'closed') {
    return `In force. ${granteeName} is closed, so its people start no new work here through this grant.`;
  }
  return null;
}
