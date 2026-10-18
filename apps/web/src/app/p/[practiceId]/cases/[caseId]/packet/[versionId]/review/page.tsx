import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../../../../components/action-form';
import { FormKeys } from '../../../../../../../../components/form-keys';
import { utc } from '../../../../../../../../components/format';
import { CalculationTable, Citation, DeadlineChip, DeadlineSummary, Hash, LineSchedule } from '../../../../../../../../components/packets/display';
import { Money } from '../../../../../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../../../../../components/shell';
import { loadPage } from '../../../../../../../../lib/http/next';
import { PACKET_ATTESTATION_TEXT } from '../../../../../../../../lib/packets/review';
import { packetReviewPage } from '../../../../../../../../lib/routes/packets';
import { attestPacketFormAction } from './actions';

export const metadata: Metadata = { title: 'Packet review' };

type Props = { readonly params: Promise<{ practiceId: string; caseId: string; versionId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The reimbursement reviewer's review of a packet's export (D16; docs/adr/0061), as the audit report's
 * checklist: the reviewer reaches the practice under a support grant, reads the version's deadline and
 * its evidence, each line's calculation, who wrote and approved it, downloads the exported PDF and CSV
 * from here (each checked against its SHA-256 as it is served and recorded as their download) and attests
 * over their SHA-256. The attest button stays disabled, saying why, until both files are downloaded (the
 * owner's addition of 2026-10-18: the handler and the database refuse an attestation before it). The
 * attestation is the only record the reviewer writes; the database refuses one by anyone who drafted, wrote
 * or approved the packet, and a submission is logged only after it. Identifiers show as placeholders on
 * this screen.
 */
export default async function PacketReviewPage(props: Props) {
  const page = await loadPage(packetReviewPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="packet_reviews" roles={page.roles} message={page.message} nextStep="A packet's export is attested by a reimbursement reviewer under a support grant." />;
  }
  const { practiceId, review, checklist, notice } = page.data;
  const path = `/p/${practiceId}/cases/${review.caseId}/packet/${review.versionId}/review`;
  const { content } = review;
  const blocked =
    review.exportedAt === null
      ? 'not_exported'
      : !review.current
        ? 'not_current'
        : !review.atCaseLevel
          ? 'stale_level'
          : review.deadlineNow === 'unverified'
            ? 'deadline_unverified'
            : review.viewerTookPart
              ? 'took_part'
              : null;
  const downloadedBoth = review.viewerDownloaded.pdf && review.viewerDownloaded.csv;
  const missing = [review.viewerDownloaded.pdf ? null : 'the PDF', review.viewerDownloaded.csv ? null : 'the CSV schedule'].filter((file) => file !== null).join(' and ');
  return (
    <AppShell shell={page.shell} section="packet_reviews">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/packet-reviews`}>
          Packets to attest
        </Link>
        <h1 className="text-[2rem] font-bold leading-display tracking-display">
          Packet review: {content.payer.name}, version {review.versionNo}
        </h1>
        <p className="text-base text-muted-foreground">
          Dispute level {content.dispute_level}; {content.pattern.lines} lines on {content.pattern.claims} claims, variance <Money value={content.pattern.variance_cents} />. Written by {review.writtenBy ?? 'a person of the practice'}
          {review.approvedAt === null ? '; not approved.' : `; approved ${utc(review.approvedAt)} by ${review.approvedBy ?? 'a person of the practice'}${review.approvedAlone ? ' (alone, flagged)' : ''}.`}
        </p>
      </div>
      {review.approvedAlone ? (
        <Alert data-approved-alone="true">
          <AlertTitle>Approved alone</AlertTitle>
          <AlertDescription>
            No one else in the practice approves packets, so the person who wrote this version approved it alone, 24 hours after writing it. Your attestation is the only check of this export by a person who did not write it.
          </AlertDescription>
        </Alert>
      ) : null}
      {notice === 'attested' ? (
        <Alert data-notice="attested">
          <AlertDescription>The export is attested. The practice may now log its submission.</AlertDescription>
        </Alert>
      ) : null}
      <Card role="region" aria-label="Export">
        <CardHeader>
          <CardTitle>Exported files</CardTitle>
          <CardDescription>
            {review.exportedAt === null
              ? 'The version is not exported yet: it is attested once its export is made.'
              : `Exported ${utc(review.exportedAt)}. Download both files and review them before you attest: each download is checked against its SHA-256 as it is served and recorded as yours, and the attestation names their SHA-256.`}
          </CardDescription>
        </CardHeader>
        {review.exportedAt === null ? null : (
          <CardContent className="flex flex-col gap-2 text-sm">
            <p data-download="pdf" data-downloaded={review.viewerDownloaded.pdf ? 'true' : 'false'}>
              <a className="underline" href={`${path}/pdf`} download>
                PDF
              </a>{' '}
              SHA-256 <Hash value={review.exportSha256} label="PDF SHA-256" />
              <span className="block text-muted-foreground">{review.viewerDownloaded.pdf ? 'You downloaded it after the export, checked against this SHA-256.' : 'You have not downloaded it yet.'}</span>
            </p>
            <p data-download="csv" data-downloaded={review.viewerDownloaded.csv ? 'true' : 'false'}>
              <a className="underline" href={`${path}/csv`} download>
                CSV schedule
              </a>{' '}
              (line-level PHI: the download is recorded) SHA-256 <Hash value={review.exportCsvSha256} label="CSV SHA-256" />
              <span className="block text-muted-foreground">{review.viewerDownloaded.csv ? 'You downloaded it after the export, checked against this SHA-256.' : 'You have not downloaded it yet.'}</span>
            </p>
            {review.exportVerifier === null ? null : (
              <p data-export-verifier={review.exportVerifier.passed ? 'passed' : 'failed'}>
                The verifier checked the narrative the export printed: {review.exportVerifier.passed ? 'passed' : 'failed'}, {review.exportVerifier.checked} figures, placeholders and citations in {review.exportVerifier.sentences} sentences.
              </p>
            )}
          </CardContent>
        )}
      </Card>
      <Card role="region" aria-label="Deadline">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Deadline <DeadlineChip status={review.deadlineNow} />
          </CardTitle>
          <CardDescription>The deadline as the database derives it now, and as the version stated it with its evidence.</CardDescription>
        </CardHeader>
        <CardContent>
          <DeadlineSummary content={content} now={review.deadlineNow} />
        </CardContent>
      </Card>
      <Card role="region" aria-label="Citation">
        <CardHeader>
          <CardTitle>Contract citation</CardTitle>
        </CardHeader>
        <CardContent>
          <Citation content={content} />
        </CardContent>
      </Card>
      <Card role="region" aria-label="Line table">
        <CardHeader>
          <CardTitle>Line schedule</CardTitle>
          <CardDescription>Identifiers show as placeholders here; the exported files carry them.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LineSchedule content={content} practiceId={practiceId} />
          <CalculationTable content={content} />
        </CardContent>
      </Card>
      <Card role="region" aria-label="Attestation">
        <CardHeader>
          <CardTitle>Attestation</CardTitle>
          <CardDescription>
            {review.attestation === null ? 'Confirm every item. You attest over these files: ' : `Attested ${utc(review.attestation.at)}${review.attestation.byViewer ? ' by you' : ''} over these files: `}
            <span className="font-mono text-xs">PDF {review.exportSha256 ?? '—'}</span>, <span className="font-mono text-xs">CSV {review.exportCsvSha256 ?? '—'}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {review.attestation !== null ? (
            <div data-attestation="attested">
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                {checklist.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm">{PACKET_ATTESTATION_TEXT}</p>
            </div>
          ) : blocked !== null ? (
            <Alert data-attestation="blocked" data-reason={blocked}>
              <AlertTitle>Not ready to attest</AlertTitle>
              <AlertDescription>
                {blocked === 'not_exported'
                  ? 'The version is not exported yet.'
                  : blocked === 'not_current'
                    ? 'A later version of the packet was written; only the current version’s export is attested.'
                    : blocked === 'stale_level'
                      ? 'The payer’s denial reopened the case for its next dispute level after this version was written, so it states the earlier level’s deadline and its export is not attested. The practice writes the packet again at this level.'
                      : blocked === 'deadline_unverified'
                      ? 'Its deadline is not verified now, so the export is not attested.'
                        : 'You drafted, wrote or approved a version of this packet: another reimbursement reviewer attests it.'}
              </AlertDescription>
            </Alert>
          ) : !downloadedBoth ? (
            <div data-attestation="needs_downloads" className="flex flex-col gap-3">
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                {checklist.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ul>
              <div>
                <Button type="button" disabled aria-describedby="attest-blocked">
                  Attest the export
                </Button>
                <p id="attest-blocked" className="pt-1 text-sm text-muted-foreground">
                  Download {missing} under Exported files first: you attest only files you have downloaded since the export, each checked against its SHA-256. Then reload this page.
                </p>
              </div>
            </div>
          ) : (
            <ActionForm action={attestPacketFormAction} submit="Attest the export" className="flex flex-col gap-3">
              <FormKeys />
              <input type="hidden" name="practiceId" value={practiceId} />
              <input type="hidden" name="caseId" value={review.caseId} />
              <input type="hidden" name="versionId" value={review.versionId} />
              <input type="hidden" name="pdfSha256" value={review.exportSha256 ?? ''} />
              <input type="hidden" name="csvSha256" value={review.exportCsvSha256 ?? ''} />
              {checklist.map((item) => (
                <label key={item.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name={`confirm_${item.id}`} required className="mt-1" />
                  <span>{item.text}</span>
                </label>
              ))}
              <p className="text-sm">{PACKET_ATTESTATION_TEXT}</p>
            </ActionForm>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
