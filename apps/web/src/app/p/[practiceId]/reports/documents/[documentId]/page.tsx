import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import { COVERAGE_REPORT_FORMAT } from '@tp/worker/reports';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../../components/action-form';
import { DownloadRefusal } from '../../../../../../components/download-refusal';
import { utc } from '../../../../../../components/format';
import { CoverageFigures, DocumentStatusBadge, MonthlyFigures, documentTitle } from '../../../../../../components/reports/documents';
import { ShareLink } from '../../../../../../components/share';
import { AppShell, Forbidden } from '../../../../../../components/shell';
import { downloadRefusal } from '../../../../../../lib/http/download-refusal';
import { loadPage } from '../../../../../../lib/http/next';
import { reportDocumentPage } from '../../../../../../lib/routes/report-documents';
import { generateReportDocumentFormAction } from '../actions';
import { FormKeys } from '../../../../../../components/form-keys';

export const metadata: Metadata = { title: 'Report' };

type Props = { readonly params: Promise<{ practiceId: string; documentId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * A coverage report or a month's variance summary (PRD 5, J12; PRD 6, Reports and exports; PRD 7,
 * Reports: "generate, download, share within the organization ... every total links to its stage";
 * docs/adr/0045): its figures as they stood when it was generated, each linked to the screen it comes
 * from; its PDF (printed by the worker, with its SHA-256) and its CSV, neither of them line-level PHI;
 * and the link to share within the organization. A refused download of either file comes back here, said beside them
 * (docs/adr/0079).
 */
export default async function ReportDocumentPage(props: Props) {
  const page = await loadPage(reportDocumentPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="reports" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, document, origin, canGenerate } = page.data;
  const path = `/p/${practiceId}/reports/documents/${document.id}`;
  const content = document.content;
  const refusal = downloadRefusal(await props.searchParams);
  return (
    <AppShell shell={page.shell} section="reports">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/reports`}>
          Reports
        </Link>
        <h1 className="flex flex-wrap items-center gap-2 text-[2rem] font-bold leading-display tracking-display">
          {documentTitle(document.kind, document.period, content.generated_on)} <DocumentStatusBadge status={document.status} />
        </h1>
        <p className="text-base text-muted-foreground">
          Figures fixed {utc(document.generatedAt)} by {document.requestedBy ?? 'a member of the practice'}; they never change. Counts and dollar totals by stage, with payer and plan names: no patient, claim or line.
        </p>
      </div>
      {document.status === 'queued' ? (
        <Alert data-state="printing">
          <AlertTitle>Being printed</AlertTitle>
          <AlertDescription>The worker prints the PDF from these figures; reload in a moment. The CSV is ready now.</AlertDescription>
        </Alert>
      ) : null}
      {document.status === 'failed' ? (
        <Alert variant="destructive" data-state="failed">
          <AlertTitle>The PDF could not be printed</AlertTitle>
          <AlertDescription>The print failed three times ({document.failureCode ?? 'unknown'}) and the operator was alerted. The CSV still downloads; generate the report again once the print is fixed.</AlertDescription>
        </Alert>
      ) : null}
      <Card role="region" aria-label="Files">
        <CardHeader>
          <CardTitle>Files</CardTitle>
          <CardDescription>The PDF is stored sealed with the practice’s key and checked against its SHA-256 before it is sent; the CSV is computed from the same figures. Every download is in the export history.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <DownloadRefusal refusal={refusal} />
          <p>
            {document.status === 'ready' ? (
              <a className="underline" href={`${path}/pdf`}>
                Download the PDF
              </a>
            ) : (
              <span>PDF (not printed yet)</span>
            )}{' '}
            {document.pdfSha256 === null ? null : <span className="font-mono text-xs">SHA-256 {document.pdfSha256}</span>}
          </p>
          <p>
            <a className="underline" href={`${path}/csv`}>
              Download the CSV
            </a>
          </p>
          <ShareLink href={`${origin}${path}`} />
        </CardContent>
      </Card>
      {content.format === COVERAGE_REPORT_FORMAT ? <CoverageFigures practiceId={practiceId} content={content} /> : <MonthlyFigures practiceId={practiceId} content={content} />}
      {canGenerate ? (
        <Card role="region" aria-label="Generate again">
          <CardHeader>
            <CardTitle>Generate it again</CardTitle>
            <CardDescription>A new document with the figures as they stand now; this one keeps its own.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={generateReportDocumentFormAction} submit="Generate a new one" variant="outline">
              <FormKeys />
              <input type="hidden" name="practiceId" value={practiceId} />
              <input type="hidden" name="kind" value={document.kind} />
              {document.period === null ? null : <input type="hidden" name="month" value={document.period} />}
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </AppShell>
  );
}
