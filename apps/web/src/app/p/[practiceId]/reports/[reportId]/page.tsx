import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../components/action-form';
import { DownloadRefusal } from '../../../../../components/download-refusal';
import { ForgetRefusal } from '../../../../../components/forget-refusal';
import { utc } from '../../../../../components/format';
import { Headline, ReleaseState, ReportSections, ReportStatusBadge } from '../../../../../components/reports/display';
import { Pager } from '../../../../../components/remittances/display';
import { ShareLink } from '../../../../../components/share';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { downloadRefusal } from '../../../../../lib/http/download-refusal';
import { loadPage } from '../../../../../lib/http/next';
import { REPORT_RELEASE_WITHDRAWN_TEXT, reportFailureText, reportReleaseWithdrawnText } from '../../../../../lib/reports/queries';
import { reportPage } from '../../../../../lib/routes/reports';
import { releaseReportFormAction } from './actions';
import { FormKeys } from '../../../../../components/form-keys';

export const metadata: Metadata = { title: 'Audit report' };

type Props = { readonly params: Promise<{ practiceId: string; reportId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * An audit report (PRD 4, Audit v0; PRD 12, the headline): the three headline numbers with flagged and
 * validated below, every total linked to its stage's section; its files with their SHA-256 (the PDF
 * for every reader of reports, the line CSV for the roles that export PHI, each download recorded);
 * the reviewer's attestation; and the release, refused until the attestation is signed. A report that could not
 * be generated says why in words (its rule release withdrawn since the request, its run replaced since, or the job's
 * failure); a ready report whose rule release was withdrawn since it was generated (audit item #4) carries a banner,
 * and its attestation and release are disabled with the reason (the database refuses both). A refused download of its
 * files comes back here, said beside them (docs/adr/0079).
 */
export default async function ReportPage(props: Props) {
  const page = await loadPage(reportPage, props);
  if (page.kind === 'forbidden') {
    // A refused download comes back here to a role this page refuses too: the refusal leaves the address bar.
    return (
      <>
        <Forbidden shell={page.shell} section="reports" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />
        {downloadRefusal(await props.searchParams) === null ? null : <ForgetRefusal />}
      </>
    );
  }
  const { practiceId, report, history, canExport, canRelease, canReview, origin } = page.data;
  const path = `/p/${practiceId}/reports/${report.id}`;
  const refusal = downloadRefusal(await props.searchParams);
  return (
    <AppShell shell={page.shell} section="reports">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/reports`}>
          Reports
        </Link>
        <h1 className="flex flex-wrap items-center gap-2 text-[2rem] font-bold leading-display tracking-display">
          Audit report, service {report.periodFrom} to {report.periodTo} <ReportStatusBadge status={report.status} /> <ReleaseState report={report} />
        </h1>
        <p className="text-base text-muted-foreground">
          Requested {utc(report.createdAt)} by {report.requestedBy ?? 'a member of the practice'}
          {report.generatedAt === null ? '' : `; generated ${utc(report.generatedAt)}; windows and deadlines judged on ${report.asOf ?? '—'}`}.
        </p>
      </div>
      {report.status === 'queued' ? (
        <Alert data-state="generating">
          <AlertTitle>Generating</AlertTitle>
          <AlertDescription>The report job triages the run and prints the report; reload in a moment.</AlertDescription>
        </Alert>
      ) : null}
      {report.status === 'failed' ? (
        <Alert variant="destructive" data-state="failed" data-failure={report.failureCode ?? 'unknown'}>
          <AlertTitle>The report could not be generated</AlertTitle>
          <AlertDescription>{reportFailureText(report.failureCode)}</AlertDescription>
        </Alert>
      ) : null}
      {report.status === 'ready' && report.releaseWithdrawn ? (
        <Alert variant="destructive" data-state="release-withdrawn" data-released={report.releasedAt === null ? 'no' : 'yes'}>
          <AlertTitle>Rule release withdrawn since this report was generated</AlertTitle>
          <AlertDescription>{reportReleaseWithdrawnText(report, utc)}</AlertDescription>
        </Alert>
      ) : null}
      {/* A report without content shows no files, so a refusal of one is said here instead. */}
      {report.content === null ? (
        <DownloadRefusal refusal={refusal} />
      ) : (
        <>
          <Headline headline={report.content.headline} practiceId={practiceId} base={path} />
          <Card role="region" aria-label="Files">
            <CardHeader>
              <CardTitle>Files</CardTitle>
              <CardDescription>Stored sealed with the practice’s key; each is checked against its SHA-256 before it is sent, and every download is recorded.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <DownloadRefusal refusal={refusal} />
              <p>
                <a className="underline" href={`${path}/pdf`}>
                  PDF
                </a>{' '}
                <span className="font-mono text-xs">SHA-256 {report.pdfSha256}</span>
              </p>
              <p>
                {canExport ? (
                  <a className="underline" href={`${path}/csv`}>
                    Line CSV
                  </a>
                ) : (
                  <span>Line CSV (line-level PHI: for the roles that export it)</span>
                )}{' '}
                <span className="font-mono text-xs">SHA-256 {report.csvSha256}</span>
              </p>
              <ShareLink href={`${origin}${path}`} />
            </CardContent>
          </Card>
          <Card role="region" aria-label="Attestation and release">
            <CardHeader>
              <CardTitle>Attestation and release</CardTitle>
              <CardDescription>
                {report.attestedAt === null
                  ? 'No reimbursement reviewer has signed this report’s checklist yet; it cannot be released unsigned.'
                  : `Attested ${utc(report.attestedAt)} by ${report.attestedBy ?? 'the reimbursement reviewer'}, over the files above.`}{' '}
                {report.releasedAt === null ? '' : `Released ${utc(report.releasedAt)} by ${report.releasedBy ?? 'a member of the practice'}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {canReview && report.attestedAt === null && !report.releaseWithdrawn ? (
                <Link className="text-sm underline" href={`${path}/review`}>
                  Open the reviewer checklist
                </Link>
              ) : null}
              {canRelease && report.releasedAt === null ? (
                report.releaseWithdrawn ? (
                  <div data-state="release-refused" data-reason="release_withdrawn">
                    <Button type="button" disabled aria-describedby="release-withdrawn">
                      Release the report
                    </Button>
                    <p id="release-withdrawn" className="pt-1 text-sm text-muted-foreground">
                      Not released: {REPORT_RELEASE_WITHDRAWN_TEXT}.
                    </p>
                  </div>
                ) : report.attestedAt === null ? (
                  <p className="text-sm text-muted-foreground" data-state="release-refused">
                    Release waits for the reviewer’s attestation.
                  </p>
                ) : (
                  <ActionForm action={releaseReportFormAction} submit="Release the report">
                    <FormKeys />
                    <input type="hidden" name="practiceId" value={practiceId} />
                    <input type="hidden" name="reportId" value={report.id} />
                  </ActionForm>
                )
              ) : null}
            </CardContent>
          </Card>
          <ReportSections content={report.content} practiceId={practiceId} />
        </>
      )}
      <section aria-label="Export history" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-display">Export history</h2>
        {history.total === 0 ? (
          <p className="text-sm text-muted-foreground">No file of this report has been downloaded.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {history.items.map((entry) => (
              <li key={`${entry.file}:${entry.downloadedAt}:${entry.downloadedBy ?? ''}`}>
                {utc(entry.downloadedAt)}: {entry.file === 'csv' ? 'line CSV' : 'PDF'} by {entry.downloadedBy ?? 'a member of the practice'}
              </li>
            ))}
          </ul>
        )}
        <Pager path={path} query={{}} page={history.page} pages={history.pages} total={history.total} noun="Downloads" param="history" />
      </section>
    </AppShell>
  );
}
