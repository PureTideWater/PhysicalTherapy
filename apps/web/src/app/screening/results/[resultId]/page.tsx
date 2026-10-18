import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicHeader } from '../../../../components/public-header';
import { ScreeningAnomalies, ScreeningTopRows } from '../../../../components/screening/anomalies';
import { ScreeningConvertForm } from '../../../../components/screening/convert-form';
import { ScreeningCoverage } from '../../../../components/screening/coverage';
import { ScreeningHeading, ScreeningSummary } from '../../../../components/screening/result-summary';
import { loadPublicPage } from '../../../../lib/http/next';
import { screeningResult } from '../../../../lib/screening/routes';
import { convertScreeningAction } from './actions';

/** The link is the result's only key: kept out of search engines, and out of the Referer of any link it holds. */
export const metadata: Metadata = { title: 'Your screening', robots: { index: false, follow: false }, referrer: 'no-referrer' };

/**
 * A free screening's result, reached by the unguessable link the email carried (Change Order 001, CO-04;
 * reconciliation-001, D19 to D21): the file's totals; the Medicare-priced figures, labelled "before the reduction
 * across codes"; the anomalies by code and payer product; the coverage, with the rows missing a contract; the dollars
 * that cannot be priced without a contract, apart from the rows not screened or not priced; the rows with the largest
 * differences; and the conversion to an audit request. A link that is unknown, expired or not yet priced is not
 * found. Every figure is the database's sum of the engine's per-row results. The lockup without the tagline (D11);
 * never owed, underpaid or recovered.
 */
export default async function ScreeningResultPage(props: {
  readonly params: Promise<Record<string, string | string[] | undefined>>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadPublicPage(screeningResult, props);
  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:p-10" data-slot="screening-result">
        <ScreeningHeading summary={data.summary} />
        <ScreeningSummary summary={data.summary} />
        <ScreeningAnomalies groups={data.groups} />
        <ScreeningCoverage coverage={data.coverage} />
        <ScreeningTopRows rows={data.rows} />
        <ScreeningConvertForm action={convertScreeningAction} resultId={data.resultId} arrangements={data.arrangements} requested={data.requested} converted={data.converted} />
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
    </>
  );
}
