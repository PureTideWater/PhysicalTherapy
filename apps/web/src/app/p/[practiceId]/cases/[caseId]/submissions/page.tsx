import { SUBMISSION_CHANNELS } from '@tp/packets';
import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../../components/action-form';
import { utc } from '../../../../../../components/format';
import { Hash } from '../../../../../../components/packets/display';
import { PricingNowPanel } from '../../../../../../components/packets/pricing';
import { StatusChip } from '../../../../../../components/status';
import { Money } from '../../../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../../../components/shell';
import { CaseStateBadge, stageLabel } from '../../../../../../components/triage/display';
import { CHANNEL_TEXT, RESPONSE_TEXT } from '../../../../../../lib/cases/timeline';
import { loadPage } from '../../../../../../lib/http/next';
import { PRICING_CAUSE_TEXT } from '../../../../../../lib/packets/pricing';
import { CLOSED_CASE_SUBMISSION, EARLIER_EXPORT_SUBMISSION, NEVER_ATTESTED_LIST, SENT_WITHOUT_SIGN_OFF, STALE_EXPORT_SUBMISSION, everyLineStale, sentWithoutSignOffLine } from '../../../../../../lib/packets/unattested';
import { DENIAL_CATEGORIES, PERSON_RESPONSE_KINDS, submissionsPage } from '../../../../../../lib/routes/submissions';
import { logSubmissionFormAction, recordResponseFormAction } from './actions';
import { FormKeys } from '../../../../../../components/form-keys';

export const metadata: Metadata = { title: 'Submissions and responses' };

type Props = { readonly params: Promise<{ practiceId: string; caseId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

const DENIAL_TEXT: Readonly<Record<string, string>> = {
  authorization: 'Authorization',
  visit_limit: 'Visit limit',
  modifier: 'Modifier',
  medical_necessity: 'Medical necessity',
  timely_filing: 'Timely filing',
  bundling: 'Bundling',
  other: 'Other',
};

const KIND_TEXT: Readonly<Record<string, string>> = { payer_letter: 'Payer letter', other: 'Other document' };

const FOLLOW_UP_TEXT = { due: 'Follow-up due', waiting: 'Awaiting the payer', answered: 'Answered' } as const;

/**
 * The form that logs one export's submission as it happened: its date (from its export to the last day it may be
 * logged), channel, the payer's reference and the follow-up date; for an export never attested (its pricing went stale
 * after the export), the person's confirmation that it went without sign-off. Its fields' IDs carry `idPrefix`, so two
 * forms on the page never share one.
 */
function SubmissionForm({
  idPrefix,
  practiceId,
  caseId,
  versionId,
  minOn,
  maxOn,
  withoutSignOff,
  defaultFollowUpOn,
}: {
  readonly idPrefix: string;
  readonly practiceId: string;
  readonly caseId: string;
  readonly versionId: string;
  readonly minOn: string;
  readonly maxOn: string;
  readonly withoutSignOff: boolean;
  readonly defaultFollowUpOn: string;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <ActionForm action={logSubmissionFormAction} submit={withoutSignOff ? STALE_EXPORT_SUBMISSION.submit : 'Log the submission'} className="flex max-w-xl flex-col gap-3">
      <FormKeys />
      <input type="hidden" name="practiceId" value={practiceId} />
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="versionId" value={versionId} />
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id('submitted-on')}>Submitted on</Label>
          <Input id={id('submitted-on')} name="submittedOn" type="date" defaultValue={maxOn} min={minOn} max={maxOn} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id('channel')}>Channel</Label>
          <select id={id('channel')} name="channel" className="h-9 rounded-md border bg-background px-2 text-sm" required>
            {SUBMISSION_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {CHANNEL_TEXT[channel]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id('reference')}>Payer’s reference (a portal confirmation, a fax receipt)</Label>
        <Input id={id('reference')} name="reference" maxLength={200} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id('follow-up-on')}>Follow up on (blank: 45 days after the submission, {defaultFollowUpOn} for today’s)</Label>
        <Input id={id('follow-up-on')} name="followUpOn" type="date" />
      </div>
      {withoutSignOff ? (
        <label className="flex items-start gap-2 text-sm" data-confirm="sent-without-sign-off">
          <input type="checkbox" name="sentWithoutSignOff" required className="mt-1" />
          <span>{STALE_EXPORT_SUBMISSION.confirm}</span>
        </label>
      ) : null}
    </ActionForm>
  );
}

/**
 * Submissions and responses (PRD 7: "Per case: submissions, responses, follow-ups, documents"; "log a
 * submission or response; set a follow-up"; "overdue follow-ups surface on the dashboard"; PRD 5, J9 and
 * J10; PRD 12; test matrix CAS-12, CAS-14): the submission log with each export's SHA-256 as sent, each
 * submission's follow-up (45 days unless set), the payer's responses with their documents, and the
 * forms that log them. The product never submits; recording a response moves no money and no stage.
 * A submission of a version whose pricing is no longer current is logged, never refused (it already happened
 * outside the product), and flagged with its cause and the figures sent beside the pricing in effect now (audit
 * item #4); the form says so before it is logged. An export whose pricing went stale after it was made and before its
 * attestation is never attested (the founder's ruling of 2026-10-20; docs/adr/0061): the form says so, and that an
 * export that already went to the payer is logged first, before any line is written off or a new version is written;
 * the person logs it, confirming it went without sign-off; it is recorded unattested with its reason, flagged with the
 * cause, and the log shows it plainly, so reconciliation tracks the payer's answer. An export an edit replaced is still
 * offered, logged only as sent before the edit; on a case closed written off, which takes no submission, the page says
 * how to log one instead of offering a form.
 */
export default async function SubmissionsPage(props: Props) {
  const page = await loadPage(submissionsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="cases" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, case: item, submissions, submittable, earlier, closed, defaultFollowUpOn, documents, notice, canLog, canReadPhi, asOf } = page.data;
  const casePath = `/p/${practiceId}/cases/${item.id}`;
  const latest = submissions[0];
  return (
    <AppShell shell={page.shell} section="cases">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={casePath}>
          The case
        </Link>
        <h1 className="flex flex-wrap items-center gap-2 text-[2rem] font-bold leading-display tracking-display">
          Submissions and responses: {item.payer}, {item.plan} <CaseStateBadge state={item.state} />
        </h1>
        <p className="text-base text-muted-foreground">
          {stageLabel('actionable')}: <Money value={item.actionableNowCents} />. The practice submits the exported packet through the payer’s own channel and logs it here; payer approved and recovered (posted or deposited) amounts come from the recovery ledger, not
          from a response recorded here.
        </p>
      </div>
      {notice === null ? null : (
        <Alert data-notice={notice} variant={notice === 'logged_flagged' || notice === 'logged_unattested' ? 'destructive' : undefined}>
          <AlertDescription>
            {notice === 'logged'
              ? 'The submission is logged with the export’s SHA-256.'
              : notice === 'logged_flagged'
                ? 'The submission is logged with the export’s SHA-256 and flagged: the version it sent is no longer on the pricing in effect. The submission log below shows why, with the figures sent and the pricing now.'
                : notice === 'logged_unattested'
                  ? STALE_EXPORT_SUBMISSION.logged
                  : 'The payer’s response is recorded.'}
          </AlertDescription>
        </Alert>
      )}
      {latest?.followUp === 'due' ? (
        <Alert variant="destructive" data-follow-up="due">
          <AlertTitle>Follow-up due</AlertTitle>
          <AlertDescription>
            The payer has not answered the submission of {latest.submittedOn}; its follow-up was due {latest.followUpOn} (today is {asOf}). Follow up through the payer’s channel, then log the response or submit again.
          </AlertDescription>
        </Alert>
      ) : null}
      {canLog ? (
        <Card role="region" aria-label="Log a submission">
          <CardHeader>
            <CardTitle>Log a submission</CardTitle>
            <CardDescription>
              {submittable === null
                ? 'Nothing to submit yet: the packet’s current version is submitted once it is approved and exported.'
                : `Packet version ${String(submittable.versionNo)}, dispute level ${String(submittable.disputeLevel)}, exported ${submittable.exportedOn}. Its SHA-256 goes into the log.`}
            </CardDescription>
          </CardHeader>
          {closed ? (
            <CardContent>
              <Alert data-case-closed="true">
                <AlertTitle>No submission is logged on a closed case</AlertTitle>
                <AlertDescription>
                  {CLOSED_CASE_SUBMISSION}{' '}
                  <Link className="underline" href={casePath}>
                    The case
                  </Link>
                </AlertDescription>
              </Alert>
            </CardContent>
          ) : submittable === null ? (
            <CardContent>
              <Link className="text-sm underline" href={`${casePath}/packet`}>
                The packet
              </Link>
            </CardContent>
          ) : (
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm">
                PDF SHA-256 <Hash value={submittable.exportSha256} label="Export SHA-256" />; CSV SHA-256 <Hash value={submittable.exportCsvSha256} label="CSV SHA-256" />
                {submittable.packetReference === null ? null : (
                  <>
                    ; reference <span className="font-mono" data-reference={submittable.packetReference}>{submittable.packetReference}</span> (printed in the export’s approval line)
                  </>
                )}
              </p>
              {submittable.pricing.status === 'current' ? null : submittable.attestedAt !== null ? (
                <Alert variant="destructive" data-pricing-check={submittable.pricing.status}>
                  <AlertTitle>This export’s pricing is no longer current</AlertTitle>
                  <AlertDescription>
                    {PRICING_CAUSE_TEXT[submittable.pricing.status]}. If you already sent it to the payer, log the submission as it happened: it is logged and flagged, never refused. If you have not
                    sent it yet, do not: write the stale line off on the case page and write, approve and export the packet again.
                  </AlertDescription>
                </Alert>
              ) : submittable.unattestedReason !== null ? (
                <Alert variant="destructive" data-pricing-check={submittable.pricing.status} data-attestation="never" data-unattested-reason={submittable.unattestedReason}>
                  <AlertTitle>{STALE_EXPORT_SUBMISSION.title}</AlertTitle>
                  <AlertDescription className="flex flex-col gap-2">
                    <span>{STALE_EXPORT_SUBMISSION.why(submittable.pricing)}</span>
                    <span data-if-sent="first">{STALE_EXPORT_SUBMISSION.sent}</span>
                    <span>{STALE_EXPORT_SUBMISSION.notSent(everyLineStale(submittable.pricing, submittable.versionLines))}</span>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive" data-pricing-check={submittable.pricing.status} data-attestation="refused">
                  <AlertTitle>This export will not be attested: its pricing is no longer current</AlertTitle>
                  <AlertDescription>
                    {PRICING_CAUSE_TEXT[submittable.pricing.status]}. The reimbursement reviewer cannot attest an export whose pricing is no longer current. Nothing records that this
                    export’s pricing was current when it was made (it was made before the export’s checks were recorded), so it is not logged as sent without sign-off either. Do not send it:
                    write the stale line off on the case page (it leaves this dispute), then write, approve and export the packet again. If it already went to the payer, tell support.
                  </AlertDescription>
                </Alert>
              )}
              {submittable.attestedAt === null && submittable.unattestedReason === null ? (
                submittable.pricing.status === 'current' ? (
                  <p className="text-sm" data-attestation="waiting">
                    Waiting for the reimbursement reviewer’s attestation of this export. A submission is logged once the reviewer has attested the PDF and CSV over their SHA-256.
                  </p>
                ) : null
              ) : (
                <SubmissionForm
                  idPrefix="current"
                  practiceId={practiceId}
                  caseId={item.id}
                  versionId={submittable.versionId}
                  minOn={submittable.exportedOn}
                  maxOn={asOf}
                  withoutSignOff={submittable.attestedAt === null}
                  defaultFollowUpOn={defaultFollowUpOn}
                />
              )}
            </CardContent>
          )}
          {closed || earlier.length === 0 ? null : (
            <CardContent className="flex flex-col gap-4 border-t pt-4" data-earlier-exports={String(earlier.length)}>
              {earlier.map((export_) => (
                <section key={export_.versionId} className="flex flex-col gap-2" aria-label={EARLIER_EXPORT_SUBMISSION.title(export_.versionNo, export_.replacedOn)} data-earlier-export={export_.versionId}>
                  <h3 className="text-base font-semibold">{EARLIER_EXPORT_SUBMISSION.title(export_.versionNo, export_.replacedOn)}</h3>
                  <p className="text-sm">
                    {EARLIER_EXPORT_SUBMISSION.description(export_.replacedOn)} Exported {export_.exportedOn}; PDF SHA-256 <Hash value={export_.exportSha256} label={`Version ${String(export_.versionNo)} PDF SHA-256`} />
                    {export_.packetReference === null ? null : (
                      <>
                        ; reference <span className="font-mono">{export_.packetReference}</span>
                      </>
                    )}
                    .
                  </p>
                  {export_.unattestedReason === null ? null : (
                    <p className="flex flex-wrap items-center gap-2 text-sm" data-unattested-reason={export_.unattestedReason}>
                      <StatusChip tone="danger">{NEVER_ATTESTED_LIST.mark}</StatusChip>
                      <span>{STALE_EXPORT_SUBMISSION.sent}</span>
                    </p>
                  )}
                  <SubmissionForm
                    idPrefix={`v${String(export_.versionNo)}`}
                    practiceId={practiceId}
                    caseId={item.id}
                    versionId={export_.versionId}
                    minOn={export_.exportedOn}
                    maxOn={export_.lastDay < asOf ? export_.lastDay : asOf}
                    withoutSignOff={!export_.attested}
                    defaultFollowUpOn={defaultFollowUpOn}
                  />
                </section>
              ))}
            </CardContent>
          )}
        </Card>
      ) : null}
      {canLog && latest !== undefined ? (
        <Card role="region" aria-label="Log a payer response">
          <CardHeader>
            <CardTitle>Log a payer response</CardTitle>
            <CardDescription>To the submission of {latest.submittedOn}, with its document (upload the payer’s letter on the Uploads screen first). A denial with a reason can reopen the case for the next dispute level, within its window.</CardDescription>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <EmptyState
                title="No response document yet"
                nextStep="Upload the payer's letter (as a payer letter or other document) on the Uploads screen; it appears here once it is scanned clean."
              />
            ) : (
              <ActionForm action={recordResponseFormAction} submit="Record the response" className="flex max-w-xl flex-col gap-3">
                <FormKeys />
                <input type="hidden" name="practiceId" value={practiceId} />
                <input type="hidden" name="caseId" value={item.id} />
                <input type="hidden" name="submissionId" value={latest.submissionId} />
                <div className="flex flex-wrap gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="response-kind">Response</Label>
                    <select id="response-kind" name="kind" className="h-9 rounded-md border bg-background px-2 text-sm" required>
                      {PERSON_RESPONSE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {RESPONSE_TEXT[kind]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="received-on">Received on</Label>
                    <Input id="received-on" name="receivedOn" type="date" defaultValue={asOf} min={latest.submittedOn} max={asOf} required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="amount">Amount accepted (accepted or partial only, dollars)</Label>
                    <Input id="amount" name="amount" inputMode="decimal" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="response-document">Document</Label>
                  <select id="response-document" name="documentId" className="h-9 rounded-md border bg-background px-2 text-sm" required>
                    {documents.map((document) => (
                      <option key={document.id} value={document.id}>
                        {KIND_TEXT[document.kind] ?? document.kind}, uploaded {utc(document.uploadedAt)}
                        {document.sha256 === null ? '' : `, SHA-256 ${document.sha256.slice(0, 12)}…`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="denial-category">Denial reason (denials only)</Label>
                    <select id="denial-category" name="denialCategory" className="h-9 rounded-md border bg-background px-2 text-sm" defaultValue="">
                      <option value="">None</option>
                      {DENIAL_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {DENIAL_TEXT[category]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="reopensCase" />
                    Reopen the case for the next dispute level (a denial with its reason)
                  </label>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="response-notes">Notes (kept encrypted)</Label>
                  <textarea id="response-notes" name="notes" maxLength={2000} rows={2} className="w-full rounded-md border bg-background p-2 text-sm" />
                </div>
              </ActionForm>
            )}
          </CardContent>
        </Card>
      ) : null}
      <Card role="region" aria-label="Submission log">
        <CardHeader>
          <CardTitle>Submission log</CardTitle>
          <CardDescription>Newest first, each with the SHA-256 of the export it sent and the payer’s responses.</CardDescription>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <EmptyState title="Not submitted yet" nextStep="Approve and export the packet, submit it through the payer's channel, then log the submission here." />
          ) : (
            <ol className="flex flex-col gap-4" aria-label="Submissions">
              {submissions.map((submission) => (
                <li key={submission.submissionId} className="rounded-md border p-3 text-sm" data-submission={submission.submissionId}>
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {submission.submittedOn}, {CHANNEL_TEXT[submission.channel]}
                    </span>
                    <span>
                      packet version {submission.versionNo}, dispute level {submission.disputeLevel}, by {submission.submittedBy ?? '—'}
                    </span>
                    <Badge variant={submission.followUp === 'due' ? 'destructive' : 'outline'} data-follow-up={submission.followUp}>
                      {FOLLOW_UP_TEXT[submission.followUp]}
                    </Badge>
                  </p>
                  <p>
                    Payer’s reference: {canReadPhi ? (submission.reference ?? '—') : 'shown to the roles that read PHI'}; follow up on {submission.followUpOn}.
                  </p>
                  <p data-export-hash={submission.exportSha256}>
                    Export SHA-256: PDF <Hash value={submission.exportSha256} label="Submitted PDF SHA-256" />; CSV <Hash value={submission.exportCsvSha256} label="Submitted CSV SHA-256" />
                    {submission.packetReference === null ? null : (
                      <>
                        ; packet reference <span className="font-mono" data-reference={submission.packetReference}>{submission.packetReference}</span>
                      </>
                    )}
                  </p>
                  {submission.sent.kind === 'attested' ? null : (
                    <p className="flex flex-wrap items-center gap-2 pt-1" data-submission-sent="unattested" data-unattested-reason={submission.sent.reason}>
                      <StatusChip tone="danger">{SENT_WITHOUT_SIGN_OFF}</StatusChip>
                      <span>{sentWithoutSignOffLine(submission.sent.reason)}</span>
                    </p>
                  )}
                  {submission.pricingCheck === null || submission.pricingCheck === 'current' ? null : (
                    <div className="flex flex-col gap-2 pt-1" data-submission-pricing={submission.pricingCheck}>
                      <p className="flex flex-wrap items-center gap-2">
                        <StatusChip tone="danger">Logged with pricing not current</StatusChip>
                        <span>{PRICING_CAUSE_TEXT[submission.pricingCheck]}, when the submission was logged.</span>
                      </p>
                      {submission.pricing === null ? null : <PricingNowPanel pricing={submission.pricing} sent label={`Pricing now, submission of ${submission.submittedOn}`} />}
                    </div>
                  )}
                  {submission.responses.length === 0 ? (
                    <p className="text-muted-foreground">No response yet.</p>
                  ) : (
                    <ul className="list-disc pl-5" aria-label="Responses">
                      {submission.responses.map((response) => (
                        <li key={response.responseId} data-response={response.kind}>
                          {response.receivedOn}: {RESPONSE_TEXT[response.kind]}
                          {response.amountCents === null ? null : (
                            <>
                              , <Money value={response.amountCents} /> accepted ({stageLabel('payer_approved')} once the recovery ledger approves it)
                            </>
                          )}
                          {response.denialCategory === null ? '' : `, reason ${DENIAL_TEXT[response.denialCategory] ?? response.denialCategory}`}
                          {response.reopensCase ? `; the case reopened for the next dispute level, whose window ends ${response.nextWindowEndsOn ?? '—'}` : ''}
                          {response.documentId === null ? ' (from a reprocessed remittance)' : ' (with its document)'}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
