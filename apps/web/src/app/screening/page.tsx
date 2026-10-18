import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicHeader } from '../../components/public-header';
import { ScreeningUploadForm } from '../../components/screening/upload-form';
import { loadPublicPage } from '../../lib/http/next';
import { MEDICARE_FIGURE_LABEL, PRODUCT_NOTES, productLabel } from '../../lib/screening/labels';
import { screeningPage } from '../../lib/screening/routes';
import { TEMPLATE_COLUMNS } from '../../lib/screening/template';
import { submitScreeningAction } from './actions';

export const metadata: Metadata = { title: 'Free screening' };

/**
 * The free screening (Change Order 001, CO-04; reconciliation-001, D11, D18 to D21): a prospect uploads a file of
 * totals, one row per code, modifier set, units, place of service, payer product and quarter, with the allowed total
 * and the claim count, and no patient information. The browser reads the file and sends only its rows of totals; the
 * Medicare fee schedule at the practice's locality prices the Medicare rows, row by row, through the unchanged engine;
 * the result is emailed as a link that opens it for 30 days. The page shows the lockup without the tagline (D11), and
 * never says owed, underpaid or recovered. Screening opens once a rule release is in force and a contract specialist
 * has approved the place-of-service split.
 */
export default async function ScreeningPage(props: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await loadPublicPage(screeningPage, props);
  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:p-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-[2rem] font-bold leading-display tracking-display">A free screening of your allowed amounts</h1>
          <p className="text-base text-muted-foreground">
            Upload a file of totals, with no patient information, and see where the allowed amounts in it sit against the Medicare fee schedule at your locality, by code and payer product, and how much of
            your volume cannot be priced without a contract.
          </p>
        </div>
        {data.sent ? (
          <Alert data-state="sent">
            <AlertTitle>Check your email</AlertTitle>
            <AlertDescription>
              We are screening your file. The result is emailed to the address you gave as a link, usually within a few minutes, and the link opens it for 30 days. If nothing arrives, check your spam
              folder, or <Link className="underline" href="/screening">start again</Link>.
            </AlertDescription>
          </Alert>
        ) : !data.open ? (
          <Alert data-state="closed">
            <AlertTitle>Screening is not open yet</AlertTitle>
            <AlertDescription>
              The free screening opens with the first published rule release. Until then,{' '}
              <Link className="underline" href="/request-audit">
                request an audit
              </Link>{' '}
              and we will be in touch.
            </AlertDescription>
          </Alert>
        ) : (
          <ScreeningUploadForm action={submitScreeningAction} states={data.states.map((code) => ({ value: code, label: code }))} maxRows={data.limits.maxRows} />
        )}
        <Card>
          <CardHeader>
            <CardTitle>What the file holds</CardTitle>
            <CardDescription>
              A header and one row of totals for each combination, in any order of columns, as CSV or tab-separated text. The page can make the header for you. A column of names, dates of birth,
              member IDs, dates of service or claim numbers refuses the file.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" aria-label="The screening columns">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Column</th>
                    <th className="py-1 pr-3 font-medium">What it holds</th>
                    <th className="py-1 font-medium">Example</th>
                  </tr>
                </thead>
                <tbody>
                  {TEMPLATE_COLUMNS.filter((column) => data.columns.includes(column.name)).map((column) => (
                    <tr key={column.name} className="border-t align-top">
                      <td className="py-1 pr-3 font-mono">{column.name}</td>
                      <td className="py-1 pr-3">{column.holds}</td>
                      <td className="py-1 font-mono tabular-nums">{column.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What each payer product gets</CardTitle>
            <CardDescription>The Medicare figure is labelled “{MEDICARE_FIGURE_LABEL}”: each row is priced on its own, so the reduction across the codes of one visit is not applied.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {data.products.map((product) => (
                <li key={product} data-product={product}>
                  <span className="font-medium">{productLabel(product)}</span> <span className="font-mono text-xs text-muted-foreground">{product}</span>: {PRODUCT_NOTES[product]}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <p className="text-sm text-muted-foreground">
          Want your lines priced under your own contracts?{' '}
          <Link className="underline" href="/request-audit">
            Request an audit
          </Link>
          . Already a customer?{' '}
          <Link className="underline" href="/sign-in">
            Sign in
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
