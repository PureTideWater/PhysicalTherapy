import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@tp/ui';
import { monthName } from '@tp/worker/digests';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../components/action-form';
import { utc } from '../../../../../components/format';
import { MonthlyFigures } from '../../../../../components/reports/documents';
import { ShareLink } from '../../../../../components/share';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import { monthlyContent } from '../../../../../lib/reports/documents';
import { monthlySummaryPage } from '../../../../../lib/routes/monitoring';
import { generateReportDocumentFormAction } from '../documents/actions';
import { FormKeys } from '../../../../../components/form-keys';

export const metadata: Metadata = { title: 'Monthly variance summary' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The monthly variance summary (PRD 5, J12; PRD 7, Reports: "monthly summary ... generate, download,
 * share within the organization ... every total links to its stage"): the month's lines by service
 * date, each counted once at the furthest stage it has reached, with counts, billed charges and, for
 * validated and actionable, the variance; by payer beside it. Every figure links to the lines or cases
 * it counts; no figure adds one stage to another. Payer approved and recovered are counts here: their
 * dollars are the recovery ledger's. The month's CSV downloads now; its PDF is a document printed by the
 * worker with the figures as they stand when it is generated (docs/adr/0045).
 */
export default async function MonthlySummaryPage(props: Props) {
  const page = await loadPage(monthlySummaryPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="reports" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, summary, digests, canGenerate, origin } = page.data;
  const { month } = summary;
  const path = `/p/${practiceId}/reports/monthly`;
  return (
    <AppShell shell={page.shell} section="reports">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/reports`}>
          Reports
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Monthly variance summary, {monthName(month)}</h1>
        <p className="text-sm text-muted-foreground">
          Lines with a service date in the month, each counted once at the furthest stage it has reached. Every figure carries its stage; none is added to another. Payer approved and recovered are counts of lines here; their dollars are
          the recovery ledger’s, on Reconciliation.
        </p>
      </div>
      <form className="flex flex-wrap items-end gap-3" method="get" aria-label="Choose the month">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="summary-month">Month of service</Label>
          <Input id="summary-month" name="month" type="month" defaultValue={month} className="w-44" />
        </div>
        <Button type="submit" variant="outline">
          Show the month
        </Button>
        <a className="text-sm underline" href={`${path}/csv?month=${month}`}>
          Download the summary CSV
        </a>
      </form>
      {canGenerate ? (
        <ActionForm action={generateReportDocumentFormAction} submit="Generate the month’s PDF" variant="outline" className="flex flex-wrap items-end gap-3">
          <FormKeys />
          <input type="hidden" name="practiceId" value={practiceId} />
          <input type="hidden" name="kind" value="monthly_summary" />
          <input type="hidden" name="month" value={month} />
        </ActionForm>
      ) : null}
      <MonthlyFigures practiceId={practiceId} content={monthlyContent(summary, '')} />
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
      <Card role="region" aria-label="Share">
        <CardHeader>
          <CardTitle>Share within the organization</CardTitle>
          <CardDescription>The month is in the link, so a colleague opens the same summary.</CardDescription>
        </CardHeader>
        <CardContent>
          <ShareLink href={`${origin}${path}?month=${month}`} />
        </CardContent>
      </Card>
    </AppShell>
  );
}
