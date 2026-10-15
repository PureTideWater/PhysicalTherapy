import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@tp/ui';
import { monthName } from '@tp/worker/digests';
import type { Metadata } from 'next';
import Link from 'next/link';

import { utc } from '../../../../../components/format';
import { Money } from '../../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import type { SummaryBucket, SummaryFigure } from '../../../../../lib/monitoring/queries';
import { SUMMARY_LABELS, monthlySummaryPage } from '../../../../../lib/routes/monitoring';

export const metadata: Metadata = { title: 'Monthly variance summary' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

const STAGES: readonly SummaryBucket[] = ['flagged', 'validated', 'actionable', 'payer_approved', 'recovered'];
const OTHERS: readonly SummaryBucket[] = ['priced', 'overpaid', 'unpriced', 'not_priced'];

/** Each stage's figure links to the screen it comes from. */
function stageHref(practiceId: string, bucket: SummaryBucket, month: string): string {
  switch (bucket) {
    case 'flagged':
      return `/p/${practiceId}/anomalies`;
    case 'actionable':
    case 'payer_approved':
    case 'recovered':
      return `/p/${practiceId}/cases`;
    case 'unpriced':
    case 'not_priced':
      return `/p/${practiceId}/coverage`;
    case 'validated':
    case 'priced':
    case 'overpaid':
      return `/p/${practiceId}/claims?from=${month}&to=${month}`;
  }
}

function Dollars({ figure, bucket }: { readonly figure: SummaryFigure; readonly bucket: SummaryBucket }) {
  if (bucket === 'flagged') {
    return <span className="text-muted-foreground">a count, never a dollar claim</span>;
  }
  return figure.varianceCents === null ? <span className="text-muted-foreground">—</span> : <Money value={figure.varianceCents} />;
}

/**
 * The monthly variance summary (PRD 5, J12; PRD 7, Reports: "monthly summary ... every total links to
 * its stage"): the month's lines by service date, each counted once at the furthest stage it has
 * reached, with counts, billed charges and, for validated and actionable, the variance; by payer
 * beside it. Headline totals never mix stages: no figure here adds one stage to another.
 */
export default async function MonthlySummaryPage(props: Props) {
  const page = await loadPage(monthlySummaryPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="reports" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, summary, digests } = page.data;
  const { month, total, byPayer } = summary;
  return (
    <AppShell shell={page.shell} section="reports">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Monthly variance summary, {monthName(month)}</h1>
        <p className="text-sm text-muted-foreground">
          Lines with a service date in the month, each counted once at the furthest stage it has reached. Every figure carries its stage; none is added to another. Payer approved and recovered come from the recovery ledger.
        </p>
      </div>
      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="summary-month">Month of service</Label>
          <Input id="summary-month" name="month" type="month" defaultValue={month} className="w-44" />
        </div>
        <Button type="submit" variant="outline">
          Show the month
        </Button>
        <a className="text-sm underline" href={`/p/${practiceId}/reports/monthly/csv?month=${month}`}>
          Download the summary CSV
        </a>
      </form>
      <Card role="region" aria-label="By stage">
        <CardHeader>
          <CardTitle>By stage</CardTitle>
          <CardDescription>Variance is expected allowed less observed allowed on the priced line the stage names.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-left text-sm" aria-label="Lines by stage">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Stage</th>
                <th className="py-1 font-medium">Lines</th>
                <th className="py-1 font-medium">Billed</th>
                <th className="py-1 font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {STAGES.map((bucket) => (
                <tr key={bucket} className="border-t" data-stage={bucket}>
                  <td className="py-1">
                    <Link className="underline" href={stageHref(practiceId, bucket, month)}>
                      {SUMMARY_LABELS[bucket]}
                    </Link>
                  </td>
                  <td className="py-1 tabular-nums">{total.figures[bucket].lines}</td>
                  <td className="py-1">
                    <Money value={total.figures[bucket].billedCents} />
                  </td>
                  <td className="py-1">
                    <Dollars figure={total.figures[bucket]} bucket={bucket} />
                  </td>
                </tr>
              ))}
              <tr className="border-t text-muted-foreground" data-stage="actionable_written_off">
                <td className="py-1">Written off from a case (not in the actionable total)</td>
                <td className="py-1 tabular-nums">{total.writtenOff.lines}</td>
                <td className="py-1">
                  <Money value={total.writtenOff.billedCents} />
                </td>
                <td className="py-1">
                  <Money value={total.writtenOff.varianceCents} />
                </td>
              </tr>
              {OTHERS.map((bucket) => (
                <tr key={bucket} className="border-t text-muted-foreground" data-stage={bucket}>
                  <td className="py-1">
                    <Link className="underline" href={stageHref(practiceId, bucket, month)}>
                      {SUMMARY_LABELS[bucket]}
                    </Link>
                  </td>
                  <td className="py-1 tabular-nums">{total.figures[bucket].lines}</td>
                  <td className="py-1">
                    <Money value={total.figures[bucket].billedCents} />
                  </td>
                  <td className="py-1">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card role="region" aria-label="By payer">
        <CardHeader>
          <CardTitle>By payer</CardTitle>
          <CardDescription>Lines and dollars at each stage, each stage on its own.</CardDescription>
        </CardHeader>
        <CardContent>
          {byPayer.length === 0 ? (
            <p className="text-sm text-muted-foreground">No line has a service date in {monthName(month)}.</p>
          ) : (
            <table className="w-full text-left text-sm" aria-label="Stages by payer">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Payer</th>
                  <th className="py-1 font-medium">{SUMMARY_LABELS.flagged}</th>
                  <th className="py-1 font-medium">{SUMMARY_LABELS.validated}</th>
                  <th className="py-1 font-medium">{SUMMARY_LABELS.actionable}</th>
                  <th className="py-1 font-medium">{SUMMARY_LABELS.payer_approved}</th>
                  <th className="py-1 font-medium">{SUMMARY_LABELS.recovered}</th>
                </tr>
              </thead>
              <tbody>
                {byPayer.map((row) => (
                  <tr key={row.payerId ?? 'none'} className="border-t" data-payer={row.payerId ?? ''}>
                    <td className="py-1">{row.payerName ?? 'Unnamed payer'}</td>
                    <td className="py-1 tabular-nums">{row.figures.flagged.lines} lines</td>
                    {(['validated', 'actionable', 'payer_approved', 'recovered'] as const).map((bucket) => (
                      <td key={bucket} className="py-1">
                        {row.figures[bucket].lines} lines, <Money value={row.figures[bucket].varianceCents} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <section aria-label="Monthly digests" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Monthly digests</h2>
        {digests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No digest yet: the first goes out on the morning after a month ends.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {digests.map((digest) => (
              <li key={digest.id}>
                <Link className="underline" href={`/p/${practiceId}/digests/${digest.id}`}>
                  {monthName(digest.period)}
                </Link>{' '}
                <span className="text-muted-foreground">{digest.sentAt === null ? '(not sent yet)' : `(sent ${utc(digest.sentAt)})`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
