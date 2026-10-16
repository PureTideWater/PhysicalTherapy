import { type DeadlineState, STAGE_LABELS, WRITE_OFF_TEXT, type WriteOffReason } from '@tp/triage';
import { Badge } from '@tp/ui';

import type { CaseState } from '../../lib/triage/queries';

/**
 * Display pieces of the Anomalies and Cases screens (PRD 7; PRD 12): a case's state and deadline
 * colours (passed, within 14 days, later), the stage labels (flagged is investigatory, never a dollar
 * claim; recovered only beside stage five) and the write-off reasons in words.
 */

/** A case's state in words. */
export const CASE_STATE_TEXT: Readonly<Record<CaseState, string>> = {
  open: 'Open',
  submitted: 'Submitted',
  awaiting_response: 'Awaiting response',
  partially_resolved: 'Partially resolved',
  resolved: 'Resolved',
  closed_written_off: 'Closed (written off)',
};

export function CaseStateBadge({ state }: { readonly state: CaseState }) {
  return (
    <Badge variant={state === 'open' || state === 'awaiting_response' ? 'default' : 'outline'} data-state={state}>
      {CASE_STATE_TEXT[state]}
    </Badge>
  );
}

const DEADLINE_CLASS: Readonly<Record<DeadlineState, string>> = {
  passed: 'bg-destructive text-destructive-foreground',
  soon: 'bg-amber-200 text-amber-950',
  later: 'bg-emerald-100 text-emerald-950',
  none: '',
};

const DEADLINE_TEXT: Readonly<Record<DeadlineState, string>> = {
  passed: 'window passed',
  soon: 'within 14 days',
  later: 'open',
  none: 'no window',
};

/** A deadline with its colour: passed, within 14 days, or later (PRD 7, Cases: "deadline colors"). */
export function Deadline({ on, state }: { readonly on: string | null; readonly state: DeadlineState }) {
  return (
    <span className="inline-flex items-center gap-1.5" data-deadline={state}>
      <span className="tabular-nums">{on ?? '—'}</span>
      <Badge variant="outline" className={DEADLINE_CLASS[state]}>
        {DEADLINE_TEXT[state]}
      </Badge>
    </span>
  );
}

export function stageLabel(stage: keyof typeof STAGE_LABELS): string {
  return STAGE_LABELS[stage];
}

export function writeOffText(reason: WriteOffReason): string {
  return WRITE_OFF_TEXT[reason];
}

/** The investigatory label every anomaly carries (PRD 12: "the UI label says 'investigatory'"). */
export function Investigatory() {
  return (
    <Badge variant="secondary" data-label="investigatory">
      Investigatory
    </Badge>
  );
}
