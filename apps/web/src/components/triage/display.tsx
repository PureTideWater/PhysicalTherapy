import { type DeadlineState, STAGE_LABELS, WRITE_OFF_TEXT, type WriteOffReason } from '@tp/triage';
import { Badge } from '@tp/ui';

import { counted } from '../../lib/copy/words';
import type { CaseState } from '../../lib/triage/queries';
import { StatusChip, type StatusTone } from '../status';

/**
 * Display pieces of the Anomalies and Cases screens (PRD 7; PRD 12): a case's state and deadline
 * colours (passed, within 14 days, later), the stage labels (flagged is investigatory, never a dollar
 * claim; recovered only beside the cash posted or deposited at the proof level), the write-off reasons in words,
 * and the words that count an actionable figure's lines (docs/adr/0082).
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

/** A deadline's tint (docs/adr/0056): within 14 days is short (act now), a passed window is unpriced gray (nothing left to pursue), later and none are neutral; always with its words. */
const DEADLINE_TONE: Readonly<Record<DeadlineState, StatusTone>> = {
  passed: 'unpriced',
  soon: 'short',
  later: 'neutral',
  none: 'neutral',
};

const DEADLINE_TEXT: Readonly<Record<DeadlineState, string>> = {
  passed: 'window passed',
  soon: 'within 14 days',
  later: 'open',
  none: 'no window',
};

/**
 * A deadline with its colour: passed, within 14 days, or later (PRD 7, Cases: "deadline colors"). The date stays
 * whole, and in a narrow column its status wraps under it (docs/adr/0078), so the Cases table still fits its card.
 */
export function Deadline({ on, state }: { readonly on: string | null; readonly state: DeadlineState }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" data-deadline={state}>
      <span className="font-mono tabular-nums whitespace-nowrap">{on ?? '—'}</span>
      <StatusChip tone={DEADLINE_TONE[state]}>{DEADLINE_TEXT[state]}</StatusChip>
    </span>
  );
}

/**
 * A line of a case's schedule or a cohort's flagged lines by its place in the list, which is unique on
 * the page and not PHI ("Line 2 of 3"; a line's number inside its own claim is not unique: CAS-08's
 * three claims each have a line 1), then its service date where the handler returned one (the roles
 * that read PHI only, as on Claims and lines).
 */
export function lineName(position: number, total: number, serviceDate: string | null = null): string {
  const place = `Line ${String(position)} of ${String(total)}`;
  return serviceDate === null ? place : `${place}, ${serviceDate}`;
}

export function stageLabel(stage: keyof typeof STAGE_LABELS): string {
  return STAGE_LABELS[stage];
}

export function writeOffText(reason: WriteOffReason): string {
  return WRITE_OFF_TEXT[reason];
}

/**
 * The lines not written off that the actionable figure leaves out, each counted by its cause (ACTIONABLE_NOW_OF's
 * moved_on and stale): "out of the figure: 1 line whose pricing is no longer current, 2 lines moved on past
 * actionable", each part only when it counts one or more; empty when the figure holds every such line. The home's
 * tile, the case page and the packet builder say it in these words.
 */
export function outOfFigureWords(movedOn: number, stale: number): string {
  const parts = [
    ...(stale > 0 ? [`${counted(stale, 'line')} whose pricing is no longer current`] : []),
    ...(movedOn > 0 ? [`${counted(movedOn, 'line')} moved on past actionable`] : []),
  ];
  return parts.length === 0 ? '' : `out of the figure: ${parts.join(', ')}`;
}

/** A case's actionable figure's lines, as CaseSummary counts them (the figure's lines, those not written off, and the two causes between). */
export interface ActionableLines {
  readonly actionableNowLines: number;
  readonly openLines: number;
  readonly actionableNowMovedOn: number;
  readonly actionableNowStale: number;
}

/**
 * The lines a case's actionable figure is on, after "on": "3 lines" when it holds every line not written off,
 * otherwise "0 of the 3 lines not written off; out of the figure: 3 lines moved on past actionable". The case page
 * and the packet builder pair their dollars with it, so neither reads $0.00 beside "3 of 3 lines".
 */
export function actionableLinesWords(item: ActionableLines): string {
  if (item.actionableNowLines === item.openLines) {
    return counted(item.actionableNowLines, 'line');
  }
  const out = outOfFigureWords(item.actionableNowMovedOn, item.actionableNowStale);
  return `${String(item.actionableNowLines)} of the ${counted(item.openLines, 'line')} not written off${out === '' ? '' : `; ${out}`}`;
}

/** The investigatory label every anomaly carries (PRD 12: "the UI label says 'investigatory'"). */
export function Investigatory() {
  return (
    <Badge variant="secondary" data-label="investigatory">
      Investigatory
    </Badge>
  );
}
