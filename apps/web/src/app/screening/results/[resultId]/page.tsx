import type { Metadata } from 'next';

import { PublicHeader } from '../../../../components/public-header';
import { ScreeningResultView } from '../../../../components/screening/result-view';
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
 * found; one priced under a rule release since withdrawn says so above its figures. Every figure is the database's sum
 * of the engine's per-row results. The lockup without the tagline (D11); never owed, underpaid or recovered. The page
 * says what is kept once the link closes (and, after an audit request, what is kept with it), and its opened signal
 * records a person's first open, never the GET (audit #57; the founder's rulings of 2026-10-20). The groups by code
 * and payer product come one page at a time (?groups=N), so the page holds a bounded part of any result
 * (src/components/screening/result-view.tsx; audit #53 part 1).
 */
export default async function ScreeningResultPage(props: {
  readonly params: Promise<Record<string, string | string[] | undefined>>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadPublicPage(screeningResult, props);
  return (
    <>
      <PublicHeader />
      <ScreeningResultView data={data} convert={convertScreeningAction} />
    </>
  );
}
