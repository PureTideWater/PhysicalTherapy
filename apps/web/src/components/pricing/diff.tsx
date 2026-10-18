import type { DiffChange, DiffLine, DiffSide, DiffSummary } from '@tp/worker/pricing';
import Link from 'next/link';

import { causeText } from '../../lib/pricing/causes';
import { Money } from '../remittances/display';

/**
 * The diff of two pricing runs (PRD 7, Pricing runs: "compare two runs; re-run under a new release with a
 * diff"; PRD 9, step 4; docs/adr/0037): exactly the lines whose expected allowed, unpriced reason,
 * adjustments, dispute window, review flags or terms differ, each with what differs, both runs' results
 * and the cause read from the traces, and the lines one run priced and the other did not. Dollar figures
 * are expected allowed, never "recovered".
 */

const KIND_TEXT: Readonly<Record<DiffLine['kind'], string>> = {
  changed: 'Priced differently',
  only_before: 'In the first run only',
  only_after: 'In the second run only',
};

const CHANGE_TEXT: Readonly<Record<DiffChange, string>> = {
  expected_allowed: 'expected allowed',
  unpriced_reason: 'unpriced reason',
  adjustments: 'adjustments',
  window: 'dispute window',
  review_flags: 'review flags',
  terms: 'mapping or contract terms',
};

function SideCell({ side }: { readonly side: DiffSide | null }) {
  if (side === null) {
    return <span className="text-muted-foreground">Not priced by this run</span>;
  }
  return (
    <div className="flex flex-col">
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

export function DiffSummaryText({ summary }: { readonly summary: DiffSummary }) {
  return (
    <span>
      {summary.changed} of {summary.compared} lines both runs priced are priced differently
      {summary.windowChanged === 0 ? '' : ` (${String(summary.windowChanged)} with another dispute window)`}
      {summary.onlyBefore === 0 ? '' : `; ${String(summary.onlyBefore)} only in the first run`}
      {summary.onlyAfter === 0 ? '' : `; ${String(summary.onlyAfter)} only in the second`}. Expected allowed over the lines both priced: <Money value={summary.beforeExpectedCents} /> before,{' '}
      <Money value={summary.afterExpectedCents} /> after.
    </span>
  );
}

export function DiffTable({ practiceId, lines, beforeRunId, afterRunId }: { readonly practiceId: string; readonly lines: readonly DiffLine[]; readonly beforeRunId: string; readonly afterRunId: string }) {
  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-state="no-changes">
        No line is priced differently: the two runs agree on every line&apos;s expected allowed, unpriced reason, adjustments, dispute window, review flags and
        terms.
      </p>
    );
  }
  return (
    <table className="w-full text-left text-sm" aria-label="Changed lines">
      <thead className="text-muted-foreground">
        <tr>
          <th className="py-1 pr-3 font-medium">Code and modifiers</th>
          <th className="py-1 pr-3 font-medium">Change</th>
          <th className="py-1 pr-3 font-medium">First run</th>
          <th className="py-1 pr-3 font-medium">Second run</th>
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
              {KIND_TEXT[line.kind]}
              {line.changes.length === 0 ? null : (
                <span className="block text-xs text-muted-foreground" data-changes={line.changes.join(' ')}>
                  {line.changes.map((change) => CHANGE_TEXT[change]).join(', ')}
                </span>
              )}
            </td>
            <td className="py-1 pr-3">
              <SideCell side={line.before} />
            </td>
            <td className="py-1 pr-3">
              <SideCell side={line.after} />
            </td>
            <td className="py-1 pr-3">
              {line.causes.length === 0 ? (
                <span className="text-muted-foreground">Only one run priced the line</span>
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
                  <Link className="underline" href={`/p/${practiceId}/lines/${line.serviceLineId}?run=${beforeRunId}`}>
                    First trace
                  </Link>
                )}
                {line.after === null ? null : (
                  <Link className="underline" href={`/p/${practiceId}/lines/${line.serviceLineId}?run=${afterRunId}`}>
                    Second trace
                  </Link>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
