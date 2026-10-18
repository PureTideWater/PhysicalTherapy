import { SUBMISSION_CHANNELS } from '@tp/packets';
import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../../components/action-form';
import { utc } from '../../../../../../components/format';
import { Hash } from '../../../../../../components/packets/display';
import { Money } from '../../../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../../../components/shell';
import { CaseStateBadge, stageLabel } from '../../../../../../components/triage/display';
import { CHANNEL_TEXT, RESPONSE_TEXT } from '../../../../../../lib/cases/timeline';
import { loadPage } from '../../../../../../lib/http/next';
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
 * Submissions and responses (PRD 7: "Per case: submissions, responses, follow-ups, documents"; "log a
 * submission or response; set a follow-up"; "overdue follow-ups surface on the dashboard"; PRD 5, J9 and
 * J10; PRD 12; test matrix CAS-12, CAS-14): the submission log with each export's SHA-256 as sent, each
 * submission's follow-up (45 days unless set), the payer's responses with their documents, and the
 * forms that log them. The product never submits; recording a response moves no money and no stage.
 */
export default async function SubmissionsPage(props: Props) {
  const page = await loadPage(submissionsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="cases" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, case: item, submissions, submittable, defaultFollowUpOn, documents, notice, canLog, canReadPhi, asOf } = page.data;
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
        <Alert data-notice={notice}>
          <AlertDescription>{notice === 'logged' ? 'The submission is logged with the export’s SHA-256.' : 'The payer’s response is recorded.'}</AlertDescription>
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
          {submittable === null ? (
            <CardContent>
              <Link className="text-sm underline" href={`${casePath}/packet`}>
                The packet
              </Link>
            </CardContent>
          ) : (
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm">
                PDF SHA-256 <Hash value={submittable.exportSha256} label="Export SHA-256" />; CSV SHA-256 <Hash value={submittable.exportCsvSha256} label="CSV SHA-256" />
              </p>
              <ActionForm action={logSubmissionFormAction} submit="Log the submission" className="flex max-w-xl flex-col gap-3">
                <FormKeys />
                <input type="hidden" name="practiceId" value={practiceId} />
                <input type="hidden" name="caseId" value={item.id} />
                <input type="hidden" name="versionId" value={submittable.versionId} />
                <div className="flex flex-wrap gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="submitted-on">Submitted on</Label>
                    <Input id="submitted-on" name="submittedOn" type="date" defaultValue={asOf} min={submittable.exportedOn} max={asOf} required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="channel">Channel</Label>
                    <select id="channel" name="channel" className="h-9 rounded-md border bg-background px-2 text-sm" required>
                      {SUBMISSION_CHANNELS.map((channel) => (
                        <option key={channel} value={channel}>
                          {CHANNEL_TEXT[channel]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reference">Payer’s reference (a portal confirmation, a fax receipt)</Label>
                  <Input id="reference" name="reference" maxLength={200} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="follow-up-on">Follow up on (blank: 45 days after the submission, {defaultFollowUpOn} for today’s)</Label>
                  <Input id="follow-up-on" name="followUpOn" type="date" />
                </div>
              </ActionForm>
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
                    Reference: {canReadPhi ? (submission.reference ?? '—') : 'shown to the roles that read PHI'}; follow up on {submission.followUpOn}.
                  </p>
                  <p data-export-hash={submission.exportSha256}>
                    Export SHA-256: PDF <Hash value={submission.exportSha256} label="Submitted PDF SHA-256" />; CSV <Hash value={submission.exportCsvSha256} label="Submitted CSV SHA-256" />
                  </p>
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
