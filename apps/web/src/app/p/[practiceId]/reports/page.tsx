import { randomUUID } from 'node:crypto';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../components/action-form';
import { utc } from '../../../../components/format';
import { ReleaseState, ReportStatusBadge } from '../../../../components/reports/display';
import { Money, Pager } from '../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../components/shell';
import { loadPage } from '../../../../lib/http/next';
import { reportsPage } from '../../../../lib/routes/reports';
import { generateReportFormAction } from './actions';

export const metadata: Metadata = { title: 'Reports' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The Reports screen (PRD 7, Reports: "audit report ... export history; generate, download; every
 * total links to its stage; line-level export logged"; PRD 4, Audit v0). An audit report is generated
 * by the worker from a complete pricing run after its triage, as a PDF and a line CSV stored with their
 * SHA-256; a reimbursement reviewer signs its checklist before it is released.
 */
export default async function ReportsPage(props: Props) {
  const page = await loadPage(reportsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="reports" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, reports, history, runs, canGenerate, canExport, canReview } = page.data;
  const path = `/p/${practiceId}/reports`;
  return (
    <AppShell shell={page.shell} section="reports">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Audit reports keep coverage, anomalies (investigatory), validated discrepancies and actionable amounts apart, with the pursuit cost and the evidence gaps. A report is released only after a reimbursement reviewer signs its
          attestation.
        </p>
      </div>
      <Card role="region" aria-label="Monthly variance summary">
        <CardHeader>
          <CardTitle>Monthly variance summary</CardTitle>
          <CardDescription>A month&apos;s lines by stage and payer, counts and totals, never one stage added to another; with the monthly digests.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link className="text-sm underline" href={`${path}/monthly`}>
            Open the monthly summary
          </Link>
        </CardContent>
      </Card>
      <Card role="region" aria-label="ROI statements">
        <CardHeader>
          <CardTitle>ROI statements</CardTitle>
          <CardDescription>Recovered cash net of recoupments against the fees paid, quarterly and on demand, every figure with the ledger entries it sums.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link className="text-sm underline" href={`${path}/roi`}>
            Open the ROI statements
          </Link>
        </CardContent>
      </Card>
      {canGenerate ? (
        <Card role="region" aria-label="Generate an audit report">
          <CardHeader>
            <CardTitle>Generate an audit report</CardTitle>
            <CardDescription>The report job triages the run on today’s date, then prints the report to PDF and writes the line CSV; the numbers never change once generated.</CardDescription>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pricing run in effect yet: a complete run, or a re-run once it is accepted.</p>
            ) : (
              <ActionForm action={generateReportFormAction} submit="Generate the report" className="flex max-w-xl flex-col gap-3">
                <input type="hidden" name="requestKey" value={randomUUID()} />
                <input type="hidden" name="practiceId" value={practiceId} />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="report-run">Pricing run</Label>
                  <select id="report-run" name="runId" className="h-9 rounded-md border bg-background px-2 text-sm" required>
                    {runs.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.periodFrom} to {run.periodTo} (release {run.releaseNo})
                      </option>
                    ))}
                  </select>
                </div>
              </ActionForm>
            )}
          </CardContent>
        </Card>
      ) : null}
      <section aria-label="Audit reports" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Audit reports</h2>
        {reports.total === 0 ? (
          <EmptyState title="No audit report yet" nextStep="Generate one from the pricing run in effect for its period." />
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Reports">
            {reports.items.map((report) => (
              <li key={report.id} className="rounded-md border p-4" data-report={report.id} data-status={report.status}>
                <div className="flex flex-wrap items-center gap-2">
                  <Link className="font-medium underline" href={`${path}/${report.id}`}>
                    Service {report.periodFrom} to {report.periodTo}
                  </Link>
                  <ReportStatusBadge status={report.status} />
                  <ReleaseState report={report} />
                  <span className="text-xs text-muted-foreground">
                    Requested {utc(report.createdAt)} by {report.requestedBy ?? 'a member of the practice'}
                    {report.generatedAt === null ? '' : `; generated ${utc(report.generatedAt)}, windows judged on ${report.asOf ?? '—'}`}
                  </span>
                </div>
                {report.headline === null ? null : (
                  <p className="pt-2 text-sm">
                    {report.headline.labels.actionable} <Money value={report.headline.actionable_cents} />; {report.headline.labels.payer_approved} <Money value={report.headline.payer_approved_cents} />;{' '}
                    {report.headline.labels.recovered} <Money value={report.headline.recovered_cents} />.
                  </p>
                )}
                {report.status !== 'ready' ? null : (
                  <p className="flex flex-wrap gap-3 pt-2 text-sm">
                    <a className="underline" href={`${path}/${report.id}/pdf`}>
                      Download the PDF
                    </a>
                    {canExport ? (
                      <a className="underline" href={`${path}/${report.id}/csv`}>
                        Download the line CSV
                      </a>
                    ) : null}
                    {canReview && report.attestedAt === null ? (
                      <Link className="underline" href={`${path}/${report.id}/review`}>
                        Open the reviewer checklist
                      </Link>
                    ) : null}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <Pager path={path} query={{ history: String(history.page) }} page={reports.page} pages={reports.pages} total={reports.total} noun="Reports" />
      </section>
      <section aria-label="Export history" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Export history</h2>
        {history.total === 0 ? (
          <p className="text-sm text-muted-foreground">No report file has been downloaded.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {history.items.map((entry) => (
              <li key={`${entry.reportId}:${entry.file}:${entry.downloadedAt}:${entry.downloadedBy ?? ''}`}>
                {utc(entry.downloadedAt)}: {entry.file === 'csv' ? 'line CSV' : 'PDF'} of{' '}
                <Link className="underline" href={`${path}/${entry.reportId}`}>
                  a report
                </Link>{' '}
                by {entry.downloadedBy ?? 'a member of the practice'}
              </li>
            ))}
          </ul>
        )}
        <Pager path={path} query={{ page: String(reports.page) }} page={history.page} pages={history.pages} total={history.total} noun="Downloads" param="history" />
      </section>
    </AppShell>
  );
}
