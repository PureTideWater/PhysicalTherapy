import { type DeadlineState, STAGE_LABELS, WRITE_OFF_TEXT, type WriteOffReason } from '@tp/triage';
import { Badge } from '@tp/ui';
import { Fragment } from 'react';

import { counted, listed } from '../../lib/copy/words';
import type { CaseState, NetExpectedState } from '../../lib/triage/queries';
import { Counted, Money } from '../remittances/display';
import { StatusChip, type StatusTone } from '../status';

/**
 * Display pieces of the Anomalies and Cases screens (PRD 7; PRD 12): a case's state and deadline
 * colours (passed, within 14 days, later), the stage labels (flagged is investigatory, never a dollar
 * claim; recovered only beside the cash posted or deposited at the proof level), the write-off reasons in words,
 * the words that count an actionable figure's lines, and a case's net expected value with its reason (docs/adr/0082).
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
 * moved_on and stale), the causes listed in words: "out of the figure: 1 line whose pricing is no longer current and
 * 2 lines moved on past actionable", each part only when it counts one or more; empty when the figure holds every
 * such line. The text <OutOfFigure/> renders, and a test's oracle.
 */
export function outOfFigureWords(movedOn: number, stale: number): string {
  const parts = [
    ...(stale > 0 ? [`${counted(stale, 'line')} whose pricing is no longer current`] : []),
    ...(movedOn > 0 ? [`${counted(movedOn, 'line')} moved on past actionable`] : []),
  ];
  return parts.length === 0 ? '' : `out of the figure: ${listed(parts)}`;
}

/**
 * outOfFigureWords' words with each count in the mono face (<Counted/>; docs/brand/BRAND.md: every unit count): the
 * home's tile, the case page, the packet builder and a case's Net expected value say it in these words. Nothing when
 * the figure holds every line not written off.
 */
export function OutOfFigure({ movedOn, stale }: { readonly movedOn: number; readonly stale: number }) {
  const parts = [
    ...(stale > 0
      ? [
          <Fragment key="stale">
            <Counted value={stale} one="line" /> whose pricing is no longer current
          </Fragment>,
        ]
      : []),
    ...(movedOn > 0
      ? [
          <Fragment key="moved-on">
            <Counted value={movedOn} one="line" /> moved on past actionable
          </Fragment>,
        ]
      : []),
  ];
  if (parts.length === 0) {
    return null;
  }
  // Two causes at most, so the list in words is "a and b" (listed()'s rule).
  return <>out of the figure: {parts.length === 2 ? [parts[0], ' and ', parts[1]] : parts}</>;
}

/** A case's actionable figure's lines, as CaseSummary counts them (all its lines, those not written off, the figure's, and the two causes between). */
export interface ActionableLines {
  readonly lines: number;
  readonly actionableNowLines: number;
  readonly openLines: number;
  readonly actionableNowMovedOn: number;
  readonly actionableNowStale: number;
}

/**
 * The lines a case's actionable figure is on, after "on": "3 lines" when it holds every line not written off; "no line
 * (all 3 lines written off)" when every line is written off ("no line (its 1 line written off)" for a case of one line,
 * never "all 1"); otherwise "0 of the 3 lines not written off (out of the
 * figure: 3 lines moved on past actionable)", the causes in parentheses so words after them (the packet's ", as of")
 * do not read as one of them. The case page and the packet builder pair their dollars with it, so neither reads $0.00
 * beside "3 of 3 lines". The text <ActionableLinesOn/> renders, and a test's oracle.
 */
export function actionableLinesWords(item: ActionableLines): string {
  if (item.openLines === 0) {
    return `no line (${item.lines === 1 ? 'its' : 'all'} ${counted(item.lines, 'line')} written off)`;
  }
  if (item.actionableNowLines === item.openLines) {
    return counted(item.actionableNowLines, 'line');
  }
  const out = outOfFigureWords(item.actionableNowMovedOn, item.actionableNowStale);
  return `${item.actionableNowLines.toLocaleString('en-US')} of the ${counted(item.openLines, 'line')} not written off${out === '' ? '' : ` (${out})`}`;
}

/**
 * A case's row on Cases, in its mono column: "2 of 3" (the figure's lines of those not written off), or "none (all 3
 * written off)" when every line is written off, never "0 of 0".
 */
export function casesLinesCell(item: Pick<ActionableLines, 'lines' | 'actionableNowLines' | 'openLines'>): string {
  if (item.openLines === 0) {
    return `none (all ${item.lines.toLocaleString('en-US')} written off)`;
  }
  return `${item.actionableNowLines.toLocaleString('en-US')} of ${item.openLines.toLocaleString('en-US')}`;
}

/** actionableLinesWords' words with each count in the mono face (<Counted/>), as Cases sets the same counts. */
export function ActionableLinesOn({ item }: { readonly item: ActionableLines }) {
  if (item.openLines === 0) {
    return (
      <>
        no line ({item.lines === 1 ? 'its' : 'all'} <Counted value={item.lines} one="line" /> written off)
      </>
    );
  }
  if (item.actionableNowLines === item.openLines) {
    return <Counted value={item.actionableNowLines} one="line" />;
  }
  return (
    <>
      <span className="font-mono tabular-nums">{item.actionableNowLines.toLocaleString('en-US')}</span> of the <Counted value={item.openLines} one="line" /> not written off
      <OutOfFigureAside item={item} />
    </>
  );
}

/** The causes of the lines out of the figure in parentheses after a space, or nothing when there are none. */
function OutOfFigureAside({ item }: { readonly item: ActionableLines }) {
  if (item.actionableNowMovedOn === 0 && item.actionableNowStale === 0) {
    return null;
  }
  return (
    <>
      {' '}
      (<OutOfFigure movedOn={item.actionableNowMovedOn} stale={item.actionableNowStale} />)
    </>
  );
}

/**
 * A case's Net expected value with its reason (docs/adr/0082 Decision 5), by CaseSummary's netExpectedState: on a case
 * still being worked, the live figure less the pursuit cost, negative when pursuit is not worth it; a dash with its
 * reason when the case is resolved or closed (nothing is being pursued) or the cost is not estimated; and words, no
 * amount, when no line is in the figure, so a case that recovered money never reads as a loss of the whole cost.
 */
export function NetExpected({ item }: { readonly item: ActionableLines & { readonly netExpectedState: NetExpectedState; readonly netExpectedCents: string | null } }) {
  switch (item.netExpectedState) {
    case 'closed':
      return <>— (the case is resolved or closed; nothing is left to pursue)</>;
    case 'unestimated':
      return <>— (not estimated)</>;
    case 'no_line':
      return item.openLines === 0 ? (
        <>Not computed: every line is written off</>
      ) : (
        <>
          Not computed: no line is in the actionable figure now
          <OutOfFigureAside item={item} />
        </>
      );
    case 'live':
      return (
        <>
          <span data-figure="net-expected">
            <Money value={item.netExpectedCents} />
          </span>{' '}
          ({STAGE_LABELS.actionable.toLowerCase()} less the pursuit cost)
        </>
      );
  }
}

/** The investigatory label every anomaly carries (PRD 12: "the UI label says 'investigatory'"). */
export function Investigatory() {
  return (
    <Badge variant="secondary" data-label="investigatory">
      Investigatory
    </Badge>
  );
}
