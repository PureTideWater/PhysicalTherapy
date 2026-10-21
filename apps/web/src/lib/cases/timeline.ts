import { type LineStage, STAGE_LABELS, WRITE_OFF_TEXT, type WriteOffReason } from '@tp/triage';
import { SUBMISSION_UNATTESTED_WORDS, type SubmissionUnattestedReason } from '@tp/worker/packets';

/**
 * A case's timeline (PRD 7, Cases: "detail with ... notes, timeline"): every recorded step of the case
 * in the order it happened, each said in fixed words built by code from the record (the stage labels
 * of PRD 8, the write-off reasons of PRD 12), with who took it (a person's email, or none for a job:
 * triage, the export job, the ledger's matching). A note's words are a person's and are shown only to
 * the roles that read PHI; nothing else here repeats anything a person typed. Pure: the reads are in
 * workbench.ts.
 */

export const RESPONSE_TEXT = {
  accepted: 'Accepted',
  partial: 'Partially accepted',
  denied: 'Denied',
  info_requested: 'More information requested',
  reprocessed_no_change: 'Reprocessed, no change',
} as const;
export type ResponseKindText = keyof typeof RESPONSE_TEXT;

export const CHANNEL_TEXT = {
  payer_portal: 'Payer portal',
  fax: 'Fax',
  mail: 'Mail',
  provider_relations_email: 'Provider-relations email',
} as const;

export type TimelineEvent =
  | { readonly kind: 'opened'; readonly at: string; readonly by: string | null }
  | { readonly kind: 'stage'; readonly at: string; readonly by: string | null; readonly position: number; readonly stage: LineStage }
  | { readonly kind: 'reopened_stage'; readonly at: string; readonly by: string | null; readonly position: number; readonly stage: LineStage; readonly from: LineStage }
  | { readonly kind: 'written_off'; readonly at: string; readonly by: string | null; readonly position: number; readonly reason: WriteOffReason }
  | { readonly kind: 'line_reopened'; readonly at: string; readonly by: string | null; readonly position: number }
  | { readonly kind: 'note'; readonly at: string; readonly by: string | null; readonly text: string | null }
  | { readonly kind: 'assigned'; readonly at: string; readonly by: string | null; readonly owner: string | null }
  | { readonly kind: 'approval_requested'; readonly at: string; readonly by: string | null; readonly versionNo: number }
  | { readonly kind: 'version_written'; readonly at: string; readonly by: string | null; readonly versionNo: number; readonly verifierPassed: boolean }
  | { readonly kind: 'version_approved'; readonly at: string; readonly by: string | null; readonly versionNo: number; readonly approvedAlone: boolean }
  | { readonly kind: 'version_exported'; readonly at: string; readonly by: null; readonly versionNo: number; readonly sha256: string }
  /** The reimbursement reviewer's attestation over the export (D16): never a person of the practice. */
  | { readonly kind: 'export_attested'; readonly at: string; readonly by: null; readonly versionNo: number }
  /** A submission, and the reason the database recorded it sent without sign-off, if it was (submission.unattested_reason). */
  | { readonly kind: 'submitted'; readonly at: string; readonly by: string | null; readonly versionNo: number; readonly level: number; readonly channel: keyof typeof CHANNEL_TEXT; readonly unattestedReason: SubmissionUnattestedReason | null }
  | { readonly kind: 'response'; readonly at: string; readonly by: string | null; readonly response: ResponseKindText; readonly reopens: boolean };

/** What the event records, in fixed words. */
export function eventText(event: TimelineEvent): string {
  switch (event.kind) {
    case 'opened':
      return event.by === null ? 'Case opened by triage from its payer pattern' : 'Case opened from its payer pattern';
    case 'stage':
      return `Line ${String(event.position)}: ${STAGE_LABELS[event.stage]}`;
    case 'reopened_stage':
      return `Line ${String(event.position)}: reopened from ${STAGE_LABELS[event.from]} to ${STAGE_LABELS[event.stage]}, with a reason`;
    case 'written_off':
      return event.reason === 'window_passed' && event.by === null
        ? `Line ${String(event.position)}: struck through, WINDOW_PASSED (its dispute window closed)`
        : `Line ${String(event.position)}: written off, ${WRITE_OFF_TEXT[event.reason]}`;
    case 'line_reopened':
      return `Line ${String(event.position)}: reopened into the case, with a reason`;
    case 'note':
      return event.text === null ? 'Note added (its words show to the roles that read PHI)' : `Note: ${event.text}`;
    case 'assigned':
      return event.owner === null ? 'Left unassigned' : `Assigned to ${event.owner}`;
    case 'approval_requested':
      return `Approval requested for packet version ${String(event.versionNo)}`;
    case 'version_written':
      return `Packet version ${String(event.versionNo)} written; ${event.verifierPassed ? 'the verifier passed it' : 'the verifier failed it, so it cannot be approved'}`;
    case 'version_approved':
      return `Packet version ${String(event.versionNo)} approved${event.approvedAlone ? ' alone after the 24-hour delay (single-user practice, audit flag)' : ' by a second person'}`;
    case 'version_exported':
      return `Packet version ${String(event.versionNo)} exported as PDF and CSV (PDF SHA-256 ${event.sha256.slice(0, 12)}…)`;
    case 'export_attested':
      return `Packet version ${String(event.versionNo)}’s export attested over its SHA-256 by the reimbursement reviewer`;
    case 'submitted':
      // A submission sent without sign-off says so, in the founder's words, as the submissions page does.
      return `Packet version ${String(event.versionNo)} submitted through the ${CHANNEL_TEXT[event.channel].toLowerCase()}, dispute level ${String(event.level)}${
        event.unattestedReason === null ? '' : `; ${SUBMISSION_UNATTESTED_WORDS[event.unattestedReason]}`
      }`;
    case 'response':
      return `Payer response: ${RESPONSE_TEXT[event.response]}${event.reopens ? ', reopening the case for the next dispute level' : ''}`;
  }
}

/** Who took the step, as the timeline names them. */
export function eventActor(event: TimelineEvent): string {
  if (event.by !== null) {
    return event.by;
  }
  switch (event.kind) {
    case 'version_exported':
      return 'the export job';
    case 'export_attested':
      return 'the reimbursement reviewer';
    case 'response':
      return 'the recovery ledger’s matching';
    case 'stage':
    case 'reopened_stage':
      return event.stage === 'payer_approved' || event.stage === 'recovered' || event.kind === 'reopened_stage' ? 'the recovery ledger' : 'triage';
    // Triage opens a case and writes off a line whose window closed; the ledger reopens a line a
    // recoupment took back.
    case 'opened':
    case 'written_off':
      return 'triage';
    case 'line_reopened':
      return 'the recovery ledger';
    // A person's own steps carry the person (an email, or a former member); never a job.
    case 'note':
    case 'assigned':
    case 'approval_requested':
    case 'version_written':
    case 'version_approved':
    case 'submitted':
      return 'a person of the practice';
  }
}

/** The events in the order they happened (a stable order for events of the same instant: as given). */
export function inOrder(events: readonly TimelineEvent[]): TimelineEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => (a.event.at < b.event.at ? -1 : a.event.at > b.event.at ? 1 : a.index - b.index))
    .map((entry) => entry.event);
}
