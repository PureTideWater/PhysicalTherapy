import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import Link from 'next/link';

import { counted } from '../../lib/copy/words';
import type { FigureView } from '../../lib/reconciliation/queries';
import { entryStage } from '../reconciliation/display';
import { Money } from '../remittances/display';

/**
 * One figure of an ROI statement (PRD 13, ROI statement: "every figure links to its entries"; test matrix LED-11):
 * its label and stored amount, the amount its linked entries give now (counted in the singular for one entry, the
 * screen tour's C1: "its 1 linked entries"), and the entries beneath it, each linking to its case's ledger.
 */
export function RoiFigure({
  id,
  label,
  note,
  figure,
  practiceId,
  empty,
}: {
  readonly id: string;
  /** The figure's whole label, also the region's name: a recovered figure's names its proof level, heard as well as seen. */
  readonly label: string;
  readonly note: string;
  readonly figure: FigureView;
  readonly practiceId: string;
  readonly empty: string;
}) {
  return (
    <Card role="region" aria-label={label} id={id}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline gap-2">
          {label}: <Money value={figure.storedCents} />
        </CardTitle>
        <CardDescription>
          {note}{' '}
          <span data-recomputed={id} data-matches={figure.matches ? 'yes' : 'no'}>
            {figure.matches ? `Recomputed from its ${counted(figure.entries.length, 'linked entry', 'linked entries')}: ` : 'Its linked entries give '}
            <Money value={figure.recomputedCents} />
            {figure.matches ? ', the figure stored.' : ', not the figure stored.'}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {figure.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <table aria-label={`Entries of ${label.toLowerCase()}`} className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1 pr-3">Money moved</th>
                <th className="py-1 pr-3">Stage</th>
                <th className="py-1 pr-3 text-right">Amount</th>
                <th className="py-1">Entry</th>
              </tr>
            </thead>
            <tbody>
              {figure.entries.map((entry) => (
                <tr key={entry.id} className="border-b" data-entry={entry.id}>
                  <td className="py-1 pr-3">{entry.effectiveOn}</td>
                  <td className="py-1 pr-3">
                    {entryStage(entry.stage)}
                    {entry.allocated ? ' (allocated pro rata)' : ''}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    <Money value={entry.amountCents} />
                  </td>
                  <td className="py-1">
                    <Link className="underline" href={`/p/${practiceId}/reconciliation?case=${entry.caseId}#entry-${entry.id}`}>
                      In its case’s ledger
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
