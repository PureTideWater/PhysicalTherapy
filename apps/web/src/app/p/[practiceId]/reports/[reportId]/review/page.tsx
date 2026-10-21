import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../../components/action-form';
import { utc } from '../../../../../../components/format';
import { Headline, ReportSections } from '../../../../../../components/reports/display';
import { AppShell, Forbidden } from '../../../../../../components/shell';
import { loadPage } from '../../../../../../lib/http/next';
import { REPORT_RELEASE_WITHDRAWN_TEXT } from '../../../../../../lib/reports/queries';
import { ATTESTATION_TEXT, reviewChecklistPage } from '../../../../../../lib/routes/reports';
import { attestReportFormAction } from './actions';
import { FormKeys } from '../../../../../../components/form-keys';

export const metadata: Metadata = { title: 'Reviewer checklist' };

type Props = { readonly params: Promise<{ practiceId: string; reportId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The independent reviewer's checklist (PRD 2: "independently validates audit findings against
 * contracts before an audit report is released ... read-only with a signed attestation"; milestone 6:
 * "an independent reviewer signs the checklist"). The reviewer reaches the practice under a support
 * grant, reads the report's numbers and its PDF, confirms every item and signs over the SHA-256 of the
 * files shown here; the signature is the only record the reviewer writes. A report whose rule release was
 * withdrawn since it was generated (audit item #4) is not signed: the checklist says why and the button is
 * disabled (the attest route and the database refuse it too).
 */
export default async function ReviewChecklistPage(props: Props) {
  const page = await loadPage(reviewChecklistPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="reports" roles={page.roles} message={page.message} nextStep="The checklist is signed by a reimbursement reviewer under a support grant." />;
  }
  const { practiceId, report, checklist } = page.data;
  const path = `/p/${practiceId}/reports/${report.id}`;
  return (
    <AppShell shell={page.shell} section="reports">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={path}>
          Audit report
        </Link>
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Reviewer checklist</h1>
        <p className="text-base text-muted-foreground">
          Service {report.periodFrom} to {report.periodTo}; windows judged on {report.asOf ?? '—'}. Read the report, its{' '}
          <a className="underline" href={`${path}/pdf`}>
            PDF
          </a>{' '}
          and its{' '}
          <a className="underline" href={`${path}/review/csv`}>
            line CSV
          </a>{' '}
          (line-level PHI: the download is recorded), check each finding against the practice’s contracts, then sign.
        </p>
      </div>
      {report.status === 'ready' && report.releaseWithdrawn && report.attestedAt === null ? (
        <Alert variant="destructive" data-state="release-withdrawn">
          <AlertTitle>Rule release withdrawn since this report was generated</AlertTitle>
          <AlertDescription>Its numbers rest on a rule release whose content was wrong, so {REPORT_RELEASE_WITHDRAWN_TEXT}.</AlertDescription>
        </Alert>
      ) : null}
      {report.content === null ? (
        <p className="text-sm text-muted-foreground">The report is not generated yet; the checklist opens once it is ready.</p>
      ) : (
        <>
          <Headline headline={report.content.headline} practiceId={practiceId} base={`${path}/review`} />
          <Card role="region" aria-label="Checklist">
            <CardHeader>
              <CardTitle>Checklist</CardTitle>
              <CardDescription>
                {report.attestedAt === null
                  ? 'Confirm every item. You sign over these files: '
                  : `Signed ${utc(report.attestedAt)} by ${report.attestedBy ?? 'the reimbursement reviewer'} over these files: `}
                <span className="font-mono text-xs">PDF {report.pdfSha256}</span>, <span className="font-mono text-xs">CSV {report.csvSha256}</span>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.attestedAt !== null ? (
                <>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                    {checklist.map((item) => (
                      <li key={item.id}>{item.text}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-sm">{ATTESTATION_TEXT}</p>
                </>
              ) : report.releaseWithdrawn ? (
                <div className="flex flex-col gap-3" data-attestation="blocked" data-reason="release_withdrawn">
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                    {checklist.map((item) => (
                      <li key={item.id}>{item.text}</li>
                    ))}
                  </ul>
                  <div>
                    <Button type="button" disabled aria-describedby="attest-release-withdrawn">
                      Sign the attestation
                    </Button>
                    <p id="attest-release-withdrawn" className="pt-1 text-sm text-muted-foreground">
                      Not signed: {REPORT_RELEASE_WITHDRAWN_TEXT}.
                    </p>
                  </div>
                </div>
              ) : (
                <ActionForm action={attestReportFormAction} submit="Sign the attestation" className="flex flex-col gap-3">
                  <FormKeys />
                  <input type="hidden" name="practiceId" value={practiceId} />
                  <input type="hidden" name="reportId" value={report.id} />
                  <input type="hidden" name="pdfSha256" value={report.pdfSha256 ?? ''} />
                  <input type="hidden" name="csvSha256" value={report.csvSha256 ?? ''} />
                  {checklist.map((item) => (
                    <label key={item.id} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name={`confirm_${item.id}`} required className="mt-1" />
                      <span>{item.text}</span>
                    </label>
                  ))}
                  <p className="text-sm">{ATTESTATION_TEXT}</p>
                </ActionForm>
              )}
            </CardContent>
          </Card>
          <ReportSections content={report.content} practiceId={practiceId} />
        </>
      )}
    </AppShell>
  );
}
