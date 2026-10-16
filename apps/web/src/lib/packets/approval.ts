/**
 * The packet builder's approval panel (PRD 7, Packet builder: "approval panel"; PRD 12, Approval: "The
 * person who drafted or last edited a packet cannot approve it. A practice with one user gets a 24-hour
 * delay and an audit flag instead"; test matrix CAS-08 to CAS-10; docs/adr/0041 and 0044): what the
 * person looking at a version may do about its approval, and why not. Pure, over what the database
 * holds; the database decides every approval again (a passing verifier, the current version, the case's
 * lines unchanged, the regulation confirmed, the approver's role, the two-person rule and the delay), so
 * this only says ahead what it will answer.
 */

/** The single-user delay: the version's writer approves it alone only this long after writing it. */
export const SINGLE_USER_DELAY_MS = 24 * 60 * 60 * 1000;

export interface ApprovalFacts {
  readonly verifierPassed: boolean;
  /** Whether the current verifier wrote the version's report (an earlier one's pass is not approved; docs/adr/0047). */
  readonly verifierCurrent: boolean;
  /** Whether it is the packet's current version (an edit since makes a new one, which clears approval). */
  readonly current: boolean;
  /** Whether it still asks for exactly the case's lines not written off, at their priced amounts. */
  readonly matchesCase: boolean;
  /** A Medicare Advantage non-contracted citation, and whether a contract specialist confirmed it applies. */
  readonly regulationCitation: boolean;
  readonly regulationConfirmed: boolean;
  readonly approvedAt: string | null;
  readonly approvedBy: string | null;
  readonly approvedAlone: boolean;
  /** When the version was written (the database's time). */
  readonly writtenAt: string;
  /** Who wrote this version, and who wrote the packet's first (its drafter). */
  readonly writerId: string;
  readonly drafterId: string;
}

export interface ApprovalViewer {
  readonly userId: string;
  /** packet.approve on the practice. */
  readonly approves: boolean;
  /** Whether anyone else who reaches the practice now may approve its packets (false: a single-user practice). */
  readonly othersApprove: boolean;
}

export type ApprovalState =
  | { readonly status: 'approved'; readonly by: string | null; readonly at: string; readonly alone: boolean }
  | { readonly status: 'blocked'; readonly reason: 'verifier' | 'verifier_outdated' | 'not_current' | 'case_changed' | 'regulation' }
  /** The viewer does not approve packets: a billing manager or firm principal does. */
  | { readonly status: 'not_approver' }
  /** The viewer drafted or last edited the packet, and someone else may approve it: the database refuses them. */
  | { readonly status: 'drafter' }
  /** The viewer wrote it in a single-user practice: they may approve it alone once the delay is over. */
  | { readonly status: 'waiting'; readonly until: string; readonly remainingMs: number }
  /** The viewer may approve it now; alone means the approval carries the single-user audit flag. */
  | { readonly status: 'ready'; readonly alone: boolean };

export function approvalState(facts: ApprovalFacts, viewer: ApprovalViewer, now: Date): ApprovalState {
  if (facts.approvedAt !== null) {
    return { status: 'approved', by: facts.approvedBy, at: facts.approvedAt, alone: facts.approvedAlone };
  }
  if (!facts.verifierPassed) {
    return { status: 'blocked', reason: 'verifier' };
  }
  if (!facts.verifierCurrent) {
    return { status: 'blocked', reason: 'verifier_outdated' };
  }
  if (!facts.current) {
    return { status: 'blocked', reason: 'not_current' };
  }
  if (!facts.matchesCase) {
    return { status: 'blocked', reason: 'case_changed' };
  }
  if (facts.regulationCitation && !facts.regulationConfirmed) {
    return { status: 'blocked', reason: 'regulation' };
  }
  if (!viewer.approves) {
    return { status: 'not_approver' };
  }
  const wrote = viewer.userId === facts.writerId || viewer.userId === facts.drafterId;
  if (!wrote) {
    return { status: 'ready', alone: false };
  }
  if (viewer.othersApprove) {
    return { status: 'drafter' };
  }
  const until = Date.parse(facts.writtenAt) + SINGLE_USER_DELAY_MS;
  const remainingMs = until - now.getTime();
  return remainingMs > 0 ? { status: 'waiting', until: new Date(until).toISOString(), remainingMs } : { status: 'ready', alone: true };
}

/** Why approval is blocked, in words, with the next step. */
export const BLOCKED_TEXT: Readonly<Record<Extract<ApprovalState, { status: 'blocked' }>['reason'], string>> = {
  verifier: 'Approval is blocked: the verifier failed this version (its mismatches are listed above). Correct the narrative and save a new version; only a version that passes can be approved.',
  verifier_outdated: 'An earlier verifier checked this version. Save it again as a new version so the current verifier checks it; only a version the current verifier passed can be approved.',
  not_current: 'A later version of this packet was written since; only the current version can be approved.',
  case_changed: 'The case’s lines changed since this version was written (a line was written off or reopened); write a new version first.',
  regulation:
    'A contract specialist confirms the Medicare Advantage regulation applies to this case before its packet can be approved: they do it on their Regulations to confirm page, under the practice’s support grant (the platform administrator opens one from a ticket).',
};

/** A wait as hours and minutes, rounded up to the minute ("23 h 59 min"). */
export function waitText(remainingMs: number): string {
  const minutes = Math.max(0, Math.ceil(remainingMs / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${String(minutes)} min` : `${String(hours)} h ${String(minutes % 60)} min`;
}
