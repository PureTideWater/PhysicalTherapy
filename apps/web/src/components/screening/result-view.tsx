import Link from 'next/link';

import type { ActionState } from '../../lib/http/next';
import type { ScreeningResultData } from '../../lib/screening/routes';
import { ScreeningAnomalies, ScreeningTopRows } from './anomalies';
import { ScreeningConvertForm, ScreeningConvertLink } from './convert-form';
import { ScreeningCoverage } from './coverage';
import { ScreeningOpenedSignal } from './opened-signal';
import { ScreeningHeading, ScreeningReleaseWithdrawn, ScreeningSummary } from './result-summary';

/**
 * A free screening's result below the public header (src/app/screening/results/[resultId]/page.tsx renders it with
 * the route's data; result-page.large.db.test.ts renders it the same way at the capacity test's worst shape): the
 * opened signal, the heading and what is kept, the link to the conversion (the prospect's one action, which a phone's
 * stacked rows would otherwise put tens of thousands of pixels down: UX-134), the withdrawn release's notice, the
 * totals, one page of the groups by code and payer product, the coverage, the top rows and the conversion. Everything
 * it shows is bounded: the summary, one page of at most 50 groups with the database's counts and sums of the rest, the
 * coverage's closed lists and the 25 top rows, whatever the result's size (audit #53 part 1).
 */
export function ScreeningResultView({ data, convert }: { readonly data: ScreeningResultData; readonly convert: (state: ActionState, form: FormData) => Promise<ActionState> }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:p-10" data-slot="screening-result">
      <ScreeningOpenedSignal resultId={data.resultId} />
      <ScreeningHeading summary={data.summary} converted={data.converted} />
      <ScreeningConvertLink requested={data.requested} converted={data.converted} />
      <ScreeningReleaseWithdrawn summary={data.summary} />
      <ScreeningSummary summary={data.summary} />
      <ScreeningAnomalies groups={data.groups} page={data.groupPage} path={`/screening/results/${data.resultId}`} />
      <ScreeningCoverage coverage={data.coverage} />
      <ScreeningTopRows rows={data.rows} />
      <ScreeningConvertForm action={convert} resultId={data.resultId} arrangements={data.arrangements} requested={data.requested} converted={data.converted} keptWith={data.summary.keptWith} />
      <p className="text-sm text-muted-foreground">
        Screen another file:{' '}
        <Link className="underline" href="/screening">
          free screening
        </Link>
        . Service status:{' '}
        <Link className="underline" href="/status">
          status page
        </Link>
        .
      </p>
    </main>
  );
}
