import type { DiffChange, DiffLine, DiffRun, DiffSide, DiffSummary } from '@tp/worker/pricing';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

import { causeText } from '../../lib/pricing/causes';
import { utc } from '../format';
import { Money } from '../remittances/display';
import { ScrollTable } from '../scroll-table';
import { diffRunName } from './display';

/**
 * The diff of two pricing runs (PRD 7, Pricing runs: "compare two runs; re-run under a new release with a
 * diff"; PRD 9, step 4; docs/adr/0037): exactly the lines whose expected allowed, unpriced reason,
 * adjustments, dispute window, review flags or terms differ, each with what differs, both runs' results
 * and the cause read from the traces, and the lines one run priced and the other did not. Dollar figures
 * are expected allowed, never "recovered". The same table shows what accepting a re-run changes (`heldBy` given:
 * compareAcceptance), each line's pricing in effect now against its pricing once accepted, naming a run of other
 * service dates where one holds the line.
 */

const KIND_TEXT: Readonly<Record<DiffLine['kind'], string>> = {
  changed: 'Priced differently',
  only_before: 'In the first run only',
  only_after: 'In the second run only',
};

/** The kinds as what accepting a re-run changes. */
const ACCEPTING_KIND_TEXT: Readonly<Record<DiffLine['kind'], string>> = {
  changed: 'Priced differently',
  only_before: 'No longer priced once accepted',
  only_after: 'Priced only once accepted',
};

const CHANGE_TEXT: Readonly<Record<DiffChange, string>> = {
  expected_allowed: 'expected allowed',
  unpriced_reason: 'unpriced reason',
  adjustments: 'adjustments',
  window: 'dispute window',
  review_flags: 'review flags',
  terms: 'mapping or contract terms',
};

/** One side of a line; in what accepting changes (`accepting`), a side a run of other service dates holds names it (`from`). */
function SideCell({ side, accepting = false, practiceId, from }: { readonly side: DiffSide | null; readonly accepting?: boolean; readonly practiceId: string; readonly from?: DiffRun }) {
  if (side === null) {
    return <span className="text-muted-foreground">{accepting ? 'Not priced' : 'Not priced by this run'}</span>;
  }
  return (
    <div className="flex flex-col">
      {from === undefined ? null : (
        <Link className="text-xs underline" href={`/p/${practiceId}/pricing-runs/${from.id}`} data-held-by={from.id}>
          From {diffRunName(from)}
        </Link>
      )}
      {side.unpricedReason === null ? <Money value={side.expectedAllowedCents} /> : <span className="font-mono text-xs">{side.unpricedReason}</span>}
      {side.adjustments.length === 0 ? null : (
        <span className="text-xs text-muted-foreground">{side.adjustments.map((adjustment) => adjustment.name).join(', ')}</span>
      )}
      {side.unpricedReason === null ? (
        <span className="text-xs text-muted-foreground" data-window={side.windowEndsOn ?? 'none'}>
          {side.windowEndsOn === null ? 'No dispute window known' : `Dispute by ${side.windowEndsOn}`}
        </span>
      ) : null}
      {side.reviewFlags.length === 0 ? null : (
        <span className="text-xs text-muted-foreground" data-review-flags={side.reviewFlags.length}>
          {side.reviewFlags.map((flag) => `${flag.flag} with line ${String(flag.column1_line_no)}`).join(', ')}
        </span>
      )}
    </div>
  );
}

/**
 * How many lines the diff lists: those priced differently (or left unpriced differently) and those on one side only. In
 * what accepting a re-run changes, the lines whose pricing in effect accepting changes. With none, the table's one
 * no-changes line says so, and no summary is shown (UX recheck of PR #50, N2; UX confirm, N2 residual).
 */
export function acceptingChanges(summary: DiffSummary): number {
  return summary.changed + summary.onlyBefore + summary.onlyAfter;
}

/** "A", "A and B", "A, B and C". */
function listed(parts: readonly ReactNode[]): ReactNode {
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index === 0 ? '' : index === parts.length - 1 ? ' and ' : ', '}
      {part}
    </Fragment>
  ));
}

/** Unpriced reasons by their closed-list codes, as each line's side shows them. */
function Reasons({ reasons }: { readonly reasons: readonly string[] }) {
  return (
    <>
      {' ('}
      {reasons.map((reason, index) => (
        <Fragment key={reason}>
          {index === 0 ? '' : ', '}
          <span className="font-mono text-xs">{reason}</span>
        </Fragment>
      ))}
      {')'}
    </>
  );
}

const lines = (count: number) => `${String(count)} ${count === 1 ? 'line' : 'lines'}`;

/**
 * The diff's counts in a sentence; `accepting`: as what accepting a re-run changes, now against once accepted, the
 * count first, then the totals (UX recheck of PR #50, N2). Expected allowed is totalled over the lines priced on both
 * sides only, and a line priced on one side and unpriced on the other is counted as such, its reasons named by code,
 * never as a line priced at $0.00 (UX confirm, NEW-B); with no line priced on both sides there is no totals sentence.
 * A diff that lists no line is said once, by the table's no-changes line, so the summary is then null.
 */
export function DiffSummaryText({ summary, accepting = false }: { readonly summary: DiffSummary; readonly accepting?: boolean }) {
  const changes = acceptingChanges(summary);
  if (changes === 0) {
    return null;
  }
  const window = summary.windowChanged === 0 ? '' : ` (${String(summary.windowChanged)} with another dispute window)`;
  if (accepting) {
    const parts = [
      summary.pricedChanged === 0 ? null : `${String(summary.pricedChanged)} priced differently${window}`,
      summary.pricedToUnpriced === 0 ? null : (
        <Fragment key="priced-to-unpriced">
          {summary.pricedToUnpriced} priced now and unpriced once accepted
          <Reasons reasons={summary.pricedToUnpricedReasons} />
        </Fragment>
      ),
      summary.unpricedToPriced === 0 ? null : (
        <Fragment key="unpriced-to-priced">
          {summary.unpricedToPriced} unpriced now
          <Reasons reasons={summary.unpricedToPricedReasons} /> and priced once accepted
        </Fragment>
      ),
      summary.unpricedChanged === 0 ? null : `${String(summary.unpricedChanged)} unpriced both now and once accepted, under another reason or terms`,
      summary.onlyBefore === 0 ? null : `${String(summary.onlyBefore)} no longer priced`,
      summary.onlyAfter === 0 ? null : `${String(summary.onlyAfter)} priced only once accepted`,
    ].filter((part) => part !== null);
    return (
      <span>
        Accepting this re-run changes the pricing in effect of {lines(changes)}: {listed(parts)}.
        {summary.compared === 0 ? null : (
          <>
            {' '}
            Expected allowed on the {lines(summary.compared)} priced both now and once accepted: <Money value={summary.beforeExpectedCents} /> now,{' '}
            <Money value={summary.afterExpectedCents} /> once accepted.
          </>
        )}
      </span>
    );
  }
  const parts = [
    summary.pricedToUnpriced === 0 ? null : (
      <Fragment key="priced-to-unpriced">
        {summary.pricedToUnpriced} priced by the first run and unpriced by the second
        <Reasons reasons={summary.pricedToUnpricedReasons} />
      </Fragment>
    ),
    summary.unpricedToPriced === 0 ? null : (
      <Fragment key="unpriced-to-priced">
        {summary.unpricedToPriced} unpriced by the first run
        <Reasons reasons={summary.unpricedToPricedReasons} /> and priced by the second
      </Fragment>
    ),
    summary.unpricedChanged === 0 ? null : `${String(summary.unpricedChanged)} unpriced by both, under another reason or terms`,
    summary.onlyBefore === 0 ? null : `${String(summary.onlyBefore)} only in the first run`,
    summary.onlyAfter === 0 ? null : `${String(summary.onlyAfter)} only in the second`,
  ].filter((part) => part !== null);
  return (
    <span>
      {summary.compared === 0 ? 'No line is priced by both runs' : `${String(summary.pricedChanged)} of ${lines(summary.compared)} both runs priced ${summary.pricedChanged === 1 ? 'is' : 'are'} priced differently${window}`}
      {parts.map((part, index) => (
        <Fragment key={index}>; {part}</Fragment>
      ))}
      .
      {summary.compared === 0 ? null : (
        <>
          {' '}
          Expected allowed over the lines both priced: <Money value={summary.beforeExpectedCents} /> before, <Money value={summary.afterExpectedCents} /> after.
        </>
      )}
    </span>
  );
}

/** How the two runs' place-of-service splits differ: each pinned one, only the later run did, or only the earlier. */
export type SplitChange = 'both' | 'added' | 'removed';

/**
 * What the diff says when the two runs pinned different place-of-service splits, by which of them pinned one, naming
 * when each split was approved (UTC, to the minute; review of PR 6b-2, finding 16).
 */
export function splitChangeText(change: SplitChange, beforeApprovedAt: Date | null, afterApprovedAt: Date | null): string {
  switch (change) {
    case 'both':
      return `Places of service set from the approved split: the earlier run priced under the split approved ${utc(beforeApprovedAt)} and this run under the one approved ${utc(afterApprovedAt)}, so a place the practice has not set may price at the other rate.`;
    case 'added':
      return `The earlier run priced with no approved split; this run takes the split approved ${utc(afterApprovedAt)} for every place the practice has not set, so such a place may now price, or price at the other rate.`;
    case 'removed':
      return `The earlier run took the split approved ${utc(beforeApprovedAt)} for every place the practice had not set; this run priced with no approved split, so such a place may no longer price, or price at the other rate.`;
  }
}

type RunSplit = Pick<DiffRun, 'placeOfServiceSplitId' | 'placeOfServiceSplitApprovedAt'>;

/**
 * When the two runs pinned different place-of-service splits (docs/adr/0064): every place a practice has not set
 * prices as the split a run pinned says, so a line's place of service may price at the other rate, or (when one run
 * pinned none, as every run before PR 6b and before the first approval) price in one run only. Null when both pinned
 * the same one, or none.
 */
export function SplitChangeText({ before, after }: { readonly before: RunSplit; readonly after: RunSplit }) {
  if (before.placeOfServiceSplitId === after.placeOfServiceSplitId) {
    return null;
  }
  const change: SplitChange = before.placeOfServiceSplitId === null ? 'added' : after.placeOfServiceSplitId === null ? 'removed' : 'both';
  return (
    <p className="text-sm" data-state="split-changed" data-split-change={change}>
      {splitChangeText(change, before.placeOfServiceSplitApprovedAt, after.placeOfServiceSplitApprovedAt)}
    </p>
  );
}

/**
 * The diff's lines. With `heldBy` (what accepting a re-run changes: compareAcceptance), the sides are the pricing in
 * effect now and once accepted, a side held by a run of other service dates names that run, and each trace link
 * opens the line under the run that priced that side.
 */
export function DiffTable({
  practiceId,
  lines,
  beforeRunId,
  afterRunId,
  heldBy,
}: {
  readonly practiceId: string;
  readonly lines: readonly DiffLine[];
  readonly beforeRunId: string;
  readonly afterRunId: string;
  readonly heldBy?: readonly DiffRun[];
}) {
  const accepting = heldBy !== undefined;
  const held = (side: DiffSide | null) => (side === null ? undefined : heldBy?.find((run) => run.id === side.pricingRunId));
  if (lines.length === 0) {
    return accepting ? (
      <p className="text-sm text-muted-foreground" data-state="no-changes">
        Accepting this re-run changes no line&apos;s pricing in effect: every line it prices is priced in effect now with the same expected allowed, unpriced reason, adjustments, dispute window,
        review flags and terms.
      </p>
    ) : (
      <p className="text-sm text-muted-foreground" data-state="no-changes">
        No line is priced differently: the two runs agree on every line&apos;s expected allowed, unpriced reason, adjustments, dispute window, review flags and
        terms.
      </p>
    );
  }
  // Six columns, a run's name in a cell: at a phone's width the table scrolls inside a region the keyboard reaches
  // (UX recheck of PR #50, N3), as the months waiting on the billing ZIP do.
  return (
    <ScrollTable label="Changed lines">
      <table className="w-full min-w-[40rem] text-left text-sm" aria-label="Changed lines">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-medium">Code and modifiers</th>
            <th className="py-1 pr-3 font-medium">Change</th>
            <th className="py-1 pr-3 font-medium">{accepting ? 'In effect now' : 'First run'}</th>
            <th className="py-1 pr-3 font-medium">{accepting ? 'Once accepted' : 'Second run'}</th>
            <th className="py-1 pr-3 font-medium">Cause</th>
            <th className="py-1 font-medium">
              <span className="sr-only">Traces</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.serviceLineId} className="border-t align-top" data-line={line.serviceLineId} data-kind={line.kind}>
              <td className="py-1 pr-3 font-mono text-xs">
                {line.procedureCode}
                {line.modifiers.length === 0 ? '' : ` ${line.modifiers.join(' ')}`}
                {line.units === null ? '' : ` × ${line.units}`}
              </td>
              <td className="py-1 pr-3">
                {(accepting ? ACCEPTING_KIND_TEXT : KIND_TEXT)[line.kind]}
                {line.changes.length === 0 ? null : (
                  <span className="block text-xs text-muted-foreground" data-changes={line.changes.join(' ')}>
                    {line.changes.map((change) => CHANGE_TEXT[change]).join(', ')}
                  </span>
                )}
              </td>
              <td className="py-1 pr-3">
                <SideCell side={line.before} accepting={accepting} practiceId={practiceId} from={held(line.before)} />
              </td>
              <td className="py-1 pr-3">
                <SideCell side={line.after} accepting={accepting} practiceId={practiceId} from={held(line.after)} />
              </td>
              <td className="py-1 pr-3">
                {line.causes.length === 0 ? (
                  <span className="text-muted-foreground">{accepting ? 'Priced on one side only' : 'Only one run priced the line'}</span>
                ) : (
                  <ul className="flex flex-col gap-0.5" aria-label="Causes">
                    {line.causes.map((cause, index) => (
                      <li key={`${cause.kind}:${String(index)}`} data-cause={cause.kind}>
                        {causeText(cause)}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="py-1 text-xs">
                <div className="flex flex-col">
                  {line.before === null ? null : (
                    <Link className="underline" href={`/p/${practiceId}/lines/${line.serviceLineId}?run=${accepting ? line.before.pricingRunId : beforeRunId}`}>
                      {accepting ? 'Trace now' : 'First trace'}
                    </Link>
                  )}
                  {line.after === null ? null : (
                    <Link className="underline" href={`/p/${practiceId}/lines/${line.serviceLineId}?run=${accepting ? line.after.pricingRunId : afterRunId}`}>
                      {accepting ? 'Trace once accepted' : 'Second trace'}
                    </Link>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}
