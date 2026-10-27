import { REINSTATEMENT_REASONS, type ReinstatementReason, SUSPENSION_REASONS, type SuspensionReason } from '@tp/db/runtime';

import { utc, utcDate } from '../format';

/**
 * The console's words for PaidWhole's suspension of an organization (docs/adr/0080; design SS-01, section 6.5, C1 to
 * C12 and O1): what a suspension stops, per kind; the tick with the real counts; who suspended it and why; the history;
 * a grant whose grantee is held; and the billing status's reason. Operator words, read by PaidWhole's platform
 * administrators only. A pure module, so its tests read every sentence whole.
 */

/** The suspension reasons' labels, in the closed list's order (organization.status_reason). */
export const SUSPENSION_REASON_LABELS: Readonly<Record<SuspensionReason, string>> = {
  customer_request: "At the customer's request",
  security_hold: 'Security hold',
  agreement_ended: 'Agreement ended',
};

/** The reinstatement reasons' labels, as the history reads them. */
export const REINSTATEMENT_REASON_LABELS: Readonly<Record<ReinstatementReason, string>> = {
  resolved: 'The cause is resolved',
  in_error: 'Suspended in error',
};

/** C4: the reason select's options, starting empty. */
export const SUSPENSION_REASON_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: '', label: 'Choose a reason' },
  ...SUSPENSION_REASONS.map((reason) => ({ value: reason, label: SUSPENSION_REASON_LABELS[reason] })),
];

/** C4's hint: nonpayment is billing's hold, and a security hold does not stop reads (review findings F2, F7). */
export const SUSPENSION_REASON_HINT =
  'Nonpayment is not a reason here: billing holds an organization whose invoice has been unpaid for 30 days, and lifts the hold when it is paid. A security hold stops new work only: its people still read and download everything. To stop their access, end their memberships.';

/** C5: the note's label and hint. */
export const SUSPENSION_NOTE_LABEL = 'Note (optional)';
export const SUSPENSION_NOTE_HINT = "Seen only by PaidWhole's platform administrators. No patient details. At most 500 characters.";

export type SuspendableKind = 'group' | 'firm';

/** What a suspension reaches: a group's active practices, or the practices a firm is granted; and the grants in force it holds. */
export interface Reach {
  readonly practices: number;
  readonly grants: number;
}

const practicesText = (n: number) => `${String(n)} ${n === 1 ? 'practice' : 'practices'}`;
const grantsText = (m: number) => `${String(m)} ${m === 1 ? 'grant' : 'grants'}`;

/** C1 (active) or C7's title (suspended). */
export function suspensionTitle(status: string): string {
  return status === 'suspended' ? 'Suspended' : 'Suspension';
}

/** C2 (a group) and C3 (a firm): what suspending stops. */
export function suspensionDescription(kind: SuspendableKind): string {
  return kind === 'group'
    ? "Suspending stops all new work at this organization's practices, whoever starts it: pricing runs, triage, reports, packet exports, uploads and monitoring. Its people also start no new work through any grant it holds at another practice. Every record stays readable. Billing's own hold for an unpaid invoice is separate."
    : "Suspending stops this firm's people from starting new work through its grants: pricing runs, triage, reports, packet exports and uploads at the practices it is granted. Work a person starts through their own practice or another firm's grant is not stopped. The practices' own staff and their monitoring carry on, and every record stays readable.";
}

/** C6: the tick that confirms what the suspension stops, with the real counts. */
export function suspensionTick(kind: SuspendableKind, name: string, reach: Reach): string {
  if (kind === 'firm') {
    return reach.practices === 0
      ? `Suspend ${name}: it holds no grant in force now; every record stays readable.`
      : `Suspend ${name}: its people start no new work through its grants at the ${practicesText(reach.practices)} it is granted; every record stays readable.`;
  }
  const held = reach.grants > 0 ? `, and its people start no new work through the ${grantsText(reach.grants)} it holds` : '';
  return reach.practices === 0
    ? `Suspend ${name}: it has no active practice now${held}; every record stays readable.`
    : `Suspend ${name}: new work stops at its ${practicesText(reach.practices)} for everyone${held}; every record stays readable.`;
}

/** The submit of the suspension form (C6). */
export const SUSPEND_SUBMIT = 'Suspend the organization';

/** The suspension in force, as the page's data gives it. */
export interface SuspensionRecord {
  readonly reason: SuspensionReason | null;
  readonly since: Date | null;
  readonly suspendedBy: { readonly email: string; readonly at: Date } | null;
  readonly reasonChangedBy: { readonly email: string; readonly at: Date } | null;
}

/** C7's lines: who suspended it and when, the reason, and who changed the reason since, when anyone did. */
export function suspendedLines(suspension: SuspensionRecord): readonly string[] {
  const first =
    suspension.suspendedBy !== null
      ? `Suspended by ${suspension.suspendedBy.email} on ${utc(suspension.suspendedBy.at)}.`
      : suspension.since !== null
        ? `Suspended on ${utc(suspension.since)}; who suspended it was not recorded.`
        : 'Suspended; when and by whom were not recorded.';
  const reason = suspension.reason === null ? 'No reason was recorded.' : `Reason: ${SUSPENSION_REASON_LABELS[suspension.reason]}.`;
  const changed = suspension.reasonChangedBy === null ? [] : [`Reason changed by ${suspension.reasonChangedBy.email} on ${utc(suspension.reasonChangedBy.at)}.`];
  return [first, reason, ...changed];
}

/** C8: what the suspension in force stops. */
export function suspendedEffect(kind: SuspendableKind, reach: Reach): string {
  if (kind === 'firm') {
    return `Its people start no new work through its grants at the ${practicesText(reach.practices)} it is granted; the practices' own staff carry on. Reinstating lifts it at once.`;
  }
  const held = reach.grants > 0 ? `, and its people start no new work through the ${grantsText(reach.grants)} it holds` : '';
  return `New work is refused at its ${practicesText(reach.practices)} for everyone${held}; every record stays readable. Reinstating lifts it at once.`;
}

/** C9: the note, and the actions on a suspension in force. */
export const suspendedNote = (note: string) => `Note: ${note}`;
export const CHANGE_REASON_SUBMIT = 'Change the reason';
export const REINSTATE_SUBMITS: Readonly<Record<ReinstatementReason, string>> = {
  resolved: 'Reinstate: the cause is resolved',
  in_error: 'Reinstate: suspended in error',
};

/** C10: the history table. */
export const HISTORY_CAPTION = 'History';
export const HISTORY_COLUMNS = ['When (UTC)', 'Change', 'Reason', 'By', 'Note'] as const;
export const HISTORY_EMPTY = 'No suspension recorded.';
export const HISTORY_CHANGES: Readonly<Record<'suspended' | 'reinstated' | 'reason_changed', string>> = {
  suspended: 'Suspended',
  reinstated: 'Reinstated',
  reason_changed: 'Reason changed',
};

/** A history row's reason, in words: a suspension reason or a reinstatement reason. */
export function reasonLabel(reason: string): string {
  if ((SUSPENSION_REASONS as readonly string[]).includes(reason)) {
    return SUSPENSION_REASON_LABELS[reason as SuspensionReason];
  }
  if ((REINSTATEMENT_REASONS as readonly string[]).includes(reason)) {
    return REINSTATEMENT_REASON_LABELS[reason as ReinstatementReason];
  }
  return reason;
}

/** A grant as the Grants card's State column reads it: C11 and C12 when it is in force and its grantee is held. */
export function grantState(grant: { readonly revokedAt: Date | null; readonly endsAt: Date; readonly granteeStatus: string }, now: Date): string {
  if (grant.revokedAt !== null) {
    return `revoked ${utcDate(grant.revokedAt)}`;
  }
  if (new Date(grant.endsAt) <= now) {
    return 'expired';
  }
  if (grant.granteeStatus === 'suspended') {
    return 'in force; its people start no new work through it while their organization is suspended';
  }
  if (grant.granteeStatus === 'closed') {
    return 'in force; its people start no new work through it, since their organization is closed';
  }
  return 'in force';
}

/** O1: the Standing cell of an organization PaidWhole suspended, with the stored reason when there is one. */
export function suspendedByPaidWhole(reason: SuspensionReason | null): string {
  return reason === null ? 'Suspended by PaidWhole' : `Suspended by PaidWhole: ${SUSPENSION_REASON_LABELS[reason]}`;
}
