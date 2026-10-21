import { NARRATIVE_MAX_LENGTH, PACKET_EXPORT_REFUSALS } from '@tp/worker/packets';
import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../../components/action-form';
import { FormKeys } from '../../../../../../components/form-keys';
import { utc } from '../../../../../../components/format';
import { DraftBadge, HandEntryNotice, ModelNoticeAlert, draftOf } from '../../../../../../components/models/display';
import { Countdown } from '../../../../../../components/packets/countdown';
import { CalculationTable, Citation, DeadlineChip, DeadlineSummary, EvidenceList, Hash, InterestSection, LineSchedule, Sources, StoredNarrative } from '../../../../../../components/packets/display';
import { ExportRequestForm, ExportStatus } from '../../../../../../components/packets/export-status';
import { PricingNowPanel } from '../../../../../../components/packets/pricing';
import { type AttachableOption, VersionForm } from '../../../../../../components/packets/version-form';
import { Money } from '../../../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../../../components/shell';
import { CaseStateBadge, stageLabel } from '../../../../../../components/triage/display';
import { loadPage } from '../../../../../../lib/http/next';
import { waitText } from '../../../../../../lib/packets/approval';
import { CONTACT_MALFORMED_TEXT, CONTACT_MISSING_TEXT, type ContactNow, PAYER_COPY_TEXT, correspondenceSettingsPath } from '../../../../../../lib/packets/contact';
import { ATTEMPT_REFRESH_MS, exportAttemptWords, exportRefusalText } from '../../../../../../lib/packets/export-attempts';
import { BLOCKED_TEXT, DRAFTER_APPROVAL_TEXT, DRAFTER_REQUESTED_TEXT, type AttachableDocument, type BuilderView, type VersionView } from '../../../../../../lib/packets/queries';
import { DEADLINE_CAUSE_TEXT } from '../../../../../../lib/packets/view';
import { everyLineStale, staleExportBuilder } from '../../../../../../lib/packets/unattested';
import { REQUEST_MESSAGE_MAX_LENGTH, packetPage } from '../../../../../../lib/routes/packets';
import { approveFormAction, draftNarrativeFormAction, exportFormAction, requestApprovalFormAction, writeVersionFormAction } from './actions';

export const metadata: Metadata = { title: 'Packet builder' };

type Props = { readonly params: Promise<{ practiceId: string; caseId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

const NOTICES = {
  written: 'A new version is written, with the verifier’s result. Any approval of an earlier version no longer stands.',
  unchanged: 'Nothing changed: the current version already holds this, so no version was written.',
  requested: 'Approval is requested. A second person who approves packets approves it here.',
  approved: 'The version is approved. Export it to print the PDF and CSV with the identifiers.',
  export_requested:
    'The export is asked for: the worker checks the version again, prints the PDF and CSV with the identifiers inserted and records their SHA-256. Its progress is under Export below.',
  exported: 'This version is exported. Its SHA-256 is below; once the reimbursement reviewer attests it, it goes into the submission log.',
} as const;

const KIND_TEXT: Readonly<Record<string, string>> = { payer_letter: 'Payer letter', other: 'Other document', contract: 'Contract', exhibit: 'Exhibit' };

function documentLabel(document: AttachableDocument): string {
  return `${KIND_TEXT[document.kind] ?? document.kind}, uploaded ${utc(document.uploadedAt)}${document.sha256 === null ? '' : `, SHA-256 ${document.sha256.slice(0, 12)}…`}`;
}

/** The documents a version may attach, each with its label and whether the version shown attaches it. */
function attachableOptions(builder: BuilderView, version: VersionView | null): AttachableOption[] {
  const attached = new Set(version?.attachedDocumentIds ?? []);
  return builder.attachable.map((document) => ({ id: document.id, label: documentLabel(document), checked: attached.has(document.id) }));
}

/** The Approve button where the viewer may not approve now, described by the reason beside it (audit item #61). */
function DisabledApprove({ describedBy }: { readonly describedBy: string }) {
  return (
    <div>
      <Button type="button" disabled aria-describedby={describedBy}>
        Approve this version
      </Button>
    </div>
  );
}

/**
 * What the export prints for the payer (audit item #37 part 1): the payer's copy, and the correspondence contact it
 * closes with as set now, or that none is set, linking the administrator to where it is set.
 */
function PayerCopyNote({
  contact,
  exported,
  practiceId,
  canSetContact,
  refusedForContact,
}: {
  readonly contact: ContactNow;
  readonly exported: boolean;
  readonly practiceId: string;
  readonly canSetContact: boolean;
  /** The export's refusal names the missing contact already, with its remedy: the note does not say it a second time. */
  readonly refusedForContact: boolean;
}) {
  const settings = canSetContact ? (
    <>
      {' '}
      <Link className="underline" href={correspondenceSettingsPath(practiceId)}>
        Settings, Correspondence
      </Link>
    </>
  ) : null;
  return (
    <div className="flex flex-col gap-1" data-payer-copy={contact.state}>
      <p>{PAYER_COPY_TEXT}</p>
      {contact.state === 'set' ? (
        <p data-contact="set">
          {exported ? 'The correspondence contact set now (an export already made keeps the one it was printed with): ' : 'Correspondence contact it prints: '}
          {contact.text}.{settings}
        </p>
      ) : refusedForContact ? null : (
        <p data-contact={contact.state}>
          {contact.state === 'missing' ? CONTACT_MISSING_TEXT : CONTACT_MALFORMED_TEXT}
          {settings}
        </p>
      )}
    </div>
  );
}

/** Why the export is blocked: every reason that holds, each with its fix, and the deadline's causes under its own. */
function ExportBlocked({ version }: { readonly version: VersionView }) {
  if (version.exportReadiness.outcome !== 'refused') {
    return null;
  }
  const { reasons } = version.exportReadiness;
  // Not approved yet, a later version written, or only the correspondence contact to set (a setup step, not a fault in the packet).
  const notYet = reasons.includes('not_approved') || reasons.includes('not_current') || reasons.every((reason) => reason === 'contact_missing');
  const causes = version.content.format === 'tp-packet/2' ? version.content.deadline.causes : [];
  return (
    <Alert variant={notYet ? 'default' : 'destructive'} data-export={notYet ? 'not_yet' : 'blocked'} data-reason={reasons[0]}>
      <AlertTitle>{notYet ? 'Not exported yet' : 'Export blocked'}</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 list-disc pl-5" aria-label="Why the export is blocked">
          {reasons.map((reason) => (
            <li key={reason} data-refusal={reason}>
              {exportRefusalText(reason, { singleUser: version.singleUser })}
              {reason === 'deadline_unverified' && causes.length > 0 ? (
                <ul className="mt-1 list-disc pl-5" aria-label="Why the deadline is not verified">
                  {causes.map((cause) => (
                    <li key={cause} data-blocked-cause={cause}>
                      {DEADLINE_CAUSE_TEXT[cause]}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/**
 * The packet builder (PRD 7, Packet builder: "citation, line table, traces, narrative editor with
 * verifier results, interest, evidence list, approval panel, export history"; "edit, request approval,
 * approve (second person), export"; "verifier failures block approval; identifiers are shown as
 * placeholders until export"; PRD 5, J9; PRD 12): one packet per case, its versions immutable, each
 * edit a new version whose narrative the server verifies again; the approval panel says what the
 * viewer may do and why not; the export prints the PDF and CSV with the identifiers and their SHA-256.
 * CO-05 (docs/adr/0061): each line's deadline shows with its status as a label, the version's deadline
 * with its evidence and, when it is not verified, why and what to do; the export is blocked until the
 * database verifies it; once exported, the reimbursement reviewer attests the export before it is
 * submitted (D16).
 *
 * The best-option audit's items #4, #26 and #61 (the founder's ruling of 2026-10-18; docs/adr/0061): a version
 * whose pricing is no longer current shows its stale lines with their figures then and now (Pricing now), and
 * its approval is blocked with the reason; the Export button shows only for a version the export job would print,
 * and otherwise every reason with its fix; the latest attempt at the export shows as in progress (a live status
 * that asks again every few seconds), trying again, refused with its fix, or failed; a version is written
 * through one form whose fields every button sends; and the drafter sees the Approve button disabled with the
 * reason, next to Request approval.
 */
export default async function PacketPage(props: Props) {
  const page = await loadPage(packetPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="cases" roles={page.roles} message={page.message} nextStep="A billing manager, an analyst or a firm principal builds packets; open the case to see its state." />;
  }
  const { practiceId, case: item, builder, notice, canApprove, canExport, asOf, canDraftWithModel, drafts, modelNotice, canSetContact } = page.data;
  const casePath = `/p/${practiceId}/cases/${item.id}`;
  const version = builder.version;
  const approval = builder.approval;
  return (
    <AppShell shell={page.shell} section="cases">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={casePath}>
          The case
        </Link>
        <h1 className="flex flex-wrap items-center gap-2 text-[2rem] font-bold leading-display tracking-display">
          Packet: {item.payer}, {item.plan} <CaseStateBadge state={item.state} />
        </h1>
        <p className="text-base text-muted-foreground">
          {item.behaviorText}. {stageLabel('actionable')}: <Money value={item.actionableNowCents} /> on{' '}
          {item.actionableNowLines === item.openLines
            ? `${String(item.openLines)} ${item.openLines === 1 ? 'line' : 'lines'}`
            : `${String(item.actionableNowLines)} of the ${String(item.openLines)} ${item.openLines === 1 ? 'line' : 'lines'} not written off (the rest are out of the figure: their pricing is no longer current, or they moved past actionable)`}
          , as of {asOf}.
        </p>
      </div>
      {notice === null ? null : (
        <Alert data-notice={notice}>
          <AlertDescription>{NOTICES[notice]}</AlertDescription>
        </Alert>
      )}
      <ModelNoticeAlert notice={modelNotice} />
      {version === null ? (
        <Card role="region" aria-label="First version">
          <CardHeader>
            <CardTitle>No packet yet</CardTitle>
            <CardDescription>
              The first version is assembled by code from the case’s lines not written off and its approved records, with a code-built draft of the pattern statement; edit its narrative once it is written.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VersionForm
              writeAction={writeVersionFormAction}
              modelAction={draftNarrativeFormAction}
              keys={<FormKeys />}
              practiceId={practiceId}
              caseId={item.id}
              basedOnVersionId={null}
              promptPay={{ states: builder.promptPayStates, selected: '' }}
              attachable={attachableOptions(builder, null)}
              narrative={null}
              submits={[
                { intent: 'code_draft', label: 'Write the first version' },
                ...(canDraftWithModel ? [{ intent: 'model_draft' as const, label: 'Draft the first version with the model', variant: 'outline' as const }] : []),
              ]}
              model={null}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card role="region" aria-label="Version">
            <CardHeader>
              <CardTitle>
                Version {version.versionNo} {version.current ? <Badge>Current</Badge> : <Badge variant="outline">Earlier version</Badge>} <DraftBadge draft={draftOf(drafts, version.id)} />
              </CardTitle>
              <CardDescription>
                Written {utc(version.writtenAt)} by {version.writtenBy ?? '—'}. Version SHA-256 (what an approval names): <Hash value={version.contentSha256} label="Version SHA-256" />. Dispute level {version.content.dispute_level}.
                {version.reference === null ? null : (
                  <>
                    {' '}
                    Reference <span className="font-mono" data-reference={version.reference}>{version.reference}</span>: what the payer’s copy prints in its approval line and names its files by, and what a payer quotes back.
                  </>
                )}
              </CardDescription>
            </CardHeader>
            {version.current ? null : (
              <CardContent>
                <Link className="text-sm underline" href={`${casePath}/packet`}>
                  Open the current version
                </Link>
              </CardContent>
            )}
          </Card>
          <PricingNowPanel pricing={version.pricingNow} />
          <Card role="region" aria-label="Citation">
            <CardHeader>
              <CardTitle>Contract citation</CardTitle>
              <CardDescription>Rule release {version.content.rule_releases.map((release) => release.release_no).join(', ') || '—'}.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Citation content={version.content} />
              {version.content.citation.kind === 'regulation' ? (
                <p className="text-sm" data-regulation={version.regulationConfirmation === null ? 'waiting' : 'confirmed'}>
                  {version.regulationConfirmation === null
                    ? 'Waiting for a contract specialist to confirm the regulation applies to this case; approval is blocked until then.'
                    : `A contract specialist (${version.regulationConfirmation.by ?? 'a former specialist'}) confirmed the regulation applies to this case on ${utc(version.regulationConfirmation.at)}.`}
                </p>
              ) : null}
            </CardContent>
          </Card>
          <Card role="region" aria-label="Line table">
            <CardHeader>
              <CardTitle>Line schedule</CardTitle>
              <CardDescription>
                {version.content.pattern.lines} lines on {version.content.pattern.claims} claims of {version.content.pattern.patients} patients: expected <Money value={version.content.pattern.expected_cents} />, observed{' '}
                <Money value={version.content.pattern.observed_cents} />, variance <Money value={version.content.pattern.variance_cents} /> ({stageLabel('actionable')}). Identifiers show as placeholders here: the export inserts them from the
                claim and patient records.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LineSchedule content={version.content} practiceId={practiceId} />
            </CardContent>
          </Card>
          <Card role="region" aria-label="Deadline">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Deadline {version.content.format === 'tp-packet/2' ? <DeadlineChip status={version.content.deadline.status} /> : null}
              </CardTitle>
              <CardDescription>
                A deadline is verified only from evidence a person signed off: the contract version’s own dispute window with its page, quote and hash, or a Medicare window record of the rule release verified to
                level L2. The export is held to the deadline as the database derives it when the export is made.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DeadlineSummary content={version.content} now={version.deadlineNow} />
            </CardContent>
          </Card>
          {version.content.format === 'tp-packet/2' ? (
            <Card role="region" aria-label="Calculation">
              <CardHeader>
                <CardTitle>Calculation per line</CardTitle>
                <CardDescription>Each line’s steps and its one rounding, copied from the line’s stored trace (the unrounded amount kept beside the rounded one). The patient share is shown and never counted.</CardDescription>
              </CardHeader>
              <CardContent>
                <CalculationTable content={version.content} />
              </CardContent>
            </Card>
          ) : null}
          <Card role="region" aria-label="Interest">
            <CardHeader>
              <CardTitle>Interest</CardTitle>
              <CardDescription>Prompt-pay interest where a state rule applies, as its own line, never part of expected.</CardDescription>
            </CardHeader>
            <CardContent>
              <InterestSection content={version.content} />
            </CardContent>
          </Card>
          <Card role="region" aria-label="Evidence">
            <CardHeader>
              <CardTitle>Evidence list</CardTitle>
              <CardDescription>Requested action: {version.content.requested_action}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <EvidenceList content={version.content} />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">Numbered sources every sentence of the narrative cites</p>
                <Sources content={version.content} />
              </div>
            </CardContent>
          </Card>
          <Card role="region" aria-label="Narrative">
            <CardHeader>
              <CardTitle>Narrative</CardTitle>
              <CardDescription>
                The pattern statement. Every figure must be among this version’s records and every sentence must cite a numbered source; identifiers are placeholders such as {'{{claim_control_number:1}}'}. The server verifies the narrative
                again when the version is written: a version that fails cannot be approved.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <StoredNarrative narrative={version.narrative} verifier={version.verifier} />
              {version.current ? (
                <VersionForm
                  writeAction={writeVersionFormAction}
              modelAction={draftNarrativeFormAction}
                  keys={<FormKeys />}
                  practiceId={practiceId}
                  caseId={item.id}
                  basedOnVersionId={version.id}
                  promptPay={{ states: builder.promptPayStates, selected: version.content.interest?.state ?? '' }}
                  attachable={attachableOptions(builder, version)}
                  narrative={{ initial: version.narrative, content: version.content, maxLength: NARRATIVE_MAX_LENGTH }}
                  submits={[
                    { intent: 'save', label: 'Save as a new version' },
                    { intent: 'code_draft', label: 'Write a new version from the code-built draft', variant: 'outline' },
                  ]}
                  model={{
                    heading: 'Draft the narrative with the model',
                    description:
                      'The model is given the pattern statement’s figures and sources only, never an identifier. Its narrative is written as a new version and verified as any; edit it before you request approval. A second person approves it as always.',
                    submit: canDraftWithModel ? { intent: 'model_draft', label: 'Draft the narrative with the model', variant: 'outline' } : null,
                    unavailable: <HandEntryNotice what="write the narrative above" />,
                  }}
                />
              ) : null}
            </CardContent>
          </Card>
          <Card role="region" aria-label="Approval">
            <CardHeader>
              <CardTitle>Approval</CardTitle>
              <CardDescription>The person who drafted or last edited a packet cannot approve it; a second person who approves packets does. A practice with no one else to approve waits 24 hours and is flagged.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {approval === null ? null : approval.status === 'approved' ? (
                <p data-approval="approved">
                  Approved {utc(approval.at)} by {approval.by ?? '—'}, naming the version’s SHA-256.
                  {approval.alone ? (
                    <>
                      {' '}
                      <Badge variant="destructive" data-flag="approved_alone">
                        Approved alone: single-user practice, after the 24-hour delay (audit flag)
                      </Badge>
                    </>
                  ) : null}
                </p>
              ) : approval.status === 'blocked' ? (
                <Alert variant="destructive" data-approval="blocked" data-reason={approval.reason}>
                  <AlertTitle>Approval blocked</AlertTitle>
                  <AlertDescription id="approval-blocked-reason">{BLOCKED_TEXT[approval.reason]}</AlertDescription>
                </Alert>
              ) : approval.status === 'not_approver' ? (
                <p data-approval="not_approver">A billing manager or firm principal of the practice approves packets; your role drafts them.</p>
              ) : approval.status === 'drafter' ? (
                <Alert data-approval="drafter">
                  <AlertTitle>You drafted or last edited this packet</AlertTitle>
                  <AlertDescription>The database refuses your approval: a second person who approves packets approves it.</AlertDescription>
                </Alert>
              ) : approval.status === 'waiting' ? (
                <Alert data-approval="waiting">
                  <AlertTitle>Single-user practice: a 24-hour delay</AlertTitle>
                  <AlertDescription>
                    No one else here approves packets, so you may approve your own version alone from {utc(approval.until)}, in <Countdown until={approval.until} initialRemainingMs={approval.remainingMs} /> (
                    {waitText(approval.remainingMs)} when this page loaded). The approval will carry the audit flag.
                  </AlertDescription>
                </Alert>
              ) : (
                <p data-approval="ready">{approval.alone ? 'The 24-hour delay is over: you may approve this version alone, and the approval carries the single-user audit flag.' : 'Ready for a second person’s approval.'}</p>
              )}
              {builder.approvalRequest === null ? null : (
                <p data-approval-request="yes">
                  Approval requested {utc(builder.approvalRequest.at)} by {builder.approvalRequest.by ?? '—'}
                  {builder.approvalRequest.message === null ? '.' : `: ${builder.approvalRequest.message}`}
                </p>
              )}
              <div className="flex flex-wrap items-end gap-4">
                {approval !== null && approval.status !== 'approved' && approval.status !== 'blocked' && builder.approvalRequest === null && version.current ? (
                  <ActionForm action={requestApprovalFormAction} submit="Request approval" variant="outline" className="flex max-w-xl flex-col gap-2">
                    <FormKeys />
                    <input type="hidden" name="practiceId" value={practiceId} />
                    <input type="hidden" name="caseId" value={item.id} />
                    <input type="hidden" name="versionId" value={version.id} />
                    <Label htmlFor="request-message">A word to the approver (optional)</Label>
                    <textarea id="request-message" name="message" maxLength={REQUEST_MESSAGE_MAX_LENGTH} rows={2} className="w-full rounded-md border bg-background p-2 text-sm" />
                  </ActionForm>
                ) : null}
                {!canApprove || approval === null || approval.status === 'approved' || approval.status === 'not_approver' ? null : approval.status === 'ready' ? (
                  <ActionForm action={approveFormAction} submit="Approve this version" className="flex flex-col gap-2">
                    <FormKeys />
                    <input type="hidden" name="practiceId" value={practiceId} />
                    <input type="hidden" name="caseId" value={item.id} />
                    <input type="hidden" name="versionId" value={version.id} />
                    <input type="hidden" name="versionSha256" value={version.contentSha256} />
                  </ActionForm>
                ) : approval.status === 'blocked' ? (
                  <DisabledApprove describedBy="approval-blocked-reason" />
                ) : approval.status === 'drafter' ? (
                  <div className="flex flex-col gap-1">
                    <DisabledApprove describedBy="approval-drafter-reason" />
                    <p id="approval-drafter-reason" className="text-muted-foreground" data-approve-disabled="drafter">
                      {builder.approvalRequest === null ? DRAFTER_APPROVAL_TEXT : DRAFTER_REQUESTED_TEXT}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <DisabledApprove describedBy="approval-wait-reason" />
                    <p id="approval-wait-reason" className="text-muted-foreground" data-approve-disabled="waiting">
                      Available once the 24-hour delay is over: you approve alone from {utc(approval.until)}.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          <Card role="region" aria-label="Export">
            <CardHeader>
              <CardTitle>Export</CardTitle>
              <CardDescription>The export prints the approved version as a PDF and a CSV schedule with the identifiers inserted from the claim and patient records, stores both sealed, and records their SHA-256.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <PayerCopyNote
                contact={builder.contact}
                exported={version.exportedAt !== null}
                practiceId={practiceId}
                canSetContact={canSetContact}
                refusedForContact={version.exportedAt === null && version.exportReadiness.outcome === 'refused' && version.exportReadiness.reasons.includes('contact_missing')}
              />
              {version.exportedAt !== null ? (
                <>
                  <p data-export="done">
                    Exported {utc(version.exportedAt)}. PDF SHA-256 <Hash value={version.exportSha256} label="PDF SHA-256" />; CSV SHA-256 <Hash value={version.exportCsvSha256} label="CSV SHA-256" />.
                    {version.exportVerifier === null ? null : ` The verifier checked the narrative the export printed: ${version.exportVerifier.passed ? 'passed' : 'failed'}.`}
                  </p>
                  {version.attestation === null ? (
                    version.pricingNow.status === 'current' ? (
                      <p data-attestation="waiting">Waiting for the reimbursement reviewer’s attestation of the export over its two SHA-256; the submission is logged after it.</p>
                    ) : (
                      // Its pricing went stale after the export: never attested (the founder's ruling of 2026-10-20).
                      <p data-attestation="never">
                        {staleExportBuilder(everyLineStale(version.pricingNow, version.content.lines.length))}{' '}
                        <Link className="underline" href={`${casePath}/submissions`}>
                          Submissions
                        </Link>
                      </p>
                    )
                  ) : (
                    <p data-attestation="attested">
                      Attested {utc(version.attestation.at)} by {version.attestation.by ?? 'the reimbursement reviewer'} over the export’s SHA-256.{' '}
                      <Link className="underline" href={`${casePath}/submissions`}>
                        Log its submission
                      </Link>
                    </p>
                  )}
                </>
              ) : (
                (() => {
                  // A refusal whose reason no longer holds (the version is ready now) is told as the earlier request's, not with its fix.
                  const attempt = exportAttemptWords(version.exportAttempt, utc, { cleared: version.exportReadiness.outcome === 'ready', singleUser: version.singleUser });
                  const status = attempt === null ? null : <ExportStatus words={attempt} checkAgainHref={`${casePath}/packet?version=${version.id}`} refreshMs={ATTEMPT_REFRESH_MS} />;
                  if (version.exportReadiness.outcome === 'refused') {
                    const { reasons } = version.exportReadiness;
                    // Everything else ready but the contact: the button is there, disabled, with its reason (item #61).
                    const onlyContact = reasons.length === 1 && reasons[0] === 'contact_missing';
                    return (
                      <>
                        {status}
                        <ExportBlocked version={version} />
                        {onlyContact && canExport ? (
                          <div>
                            <Button type="button" disabled aria-describedby="export-contact-missing">
                              Export PDF and CSV
                            </Button>
                            <p id="export-contact-missing" className="pt-1 text-sm text-muted-foreground">
                              {CONTACT_MISSING_TEXT}
                            </p>
                          </div>
                        ) : null}
                      </>
                    );
                  }
                  if (attempt?.live === true) {
                    // Asked for and in progress: the status says when it finishes; asking again would queue nothing new.
                    return status;
                  }
                  return (
                    <>
                      {status}
                      {canExport ? (
                        <ExportRequestForm action={exportFormAction} refusalCodes={PACKET_EXPORT_REFUSALS}>
                          <FormKeys />
                          <input type="hidden" name="practiceId" value={practiceId} />
                          <input type="hidden" name="caseId" value={item.id} />
                          <input type="hidden" name="versionId" value={version.id} />
                        </ExportRequestForm>
                      ) : (
                        <p data-export="ready">Ready to export. A billing manager or firm principal exports the packet: the export holds line-level PHI.</p>
                      )}
                    </>
                  );
                })()
              )}
            </CardContent>
          </Card>
        </>
      )}
      <Card role="region" aria-label="Export history">
        <CardHeader>
          <CardTitle>Versions and export history</CardTitle>
          <CardDescription>Every version of the packet, newest first; a version never changes once written.</CardDescription>
        </CardHeader>
        <CardContent>
          {builder.versions.length === 0 ? (
            <EmptyState title="No version yet" nextStep="Write the first version above." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Versions">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-2 py-1 font-medium">Version</th>
                    <th className="px-2 py-1 font-medium">Written</th>
                    <th className="px-2 py-1 font-medium">Verifier</th>
                    <th className="px-2 py-1 font-medium">Deadline stated</th>
                    <th className="px-2 py-1 font-medium">Approved</th>
                    <th className="px-2 py-1 font-medium">Exported, SHA-256</th>
                    <th className="px-2 py-1 font-medium">Files</th>
                  </tr>
                </thead>
                <tbody>
                  {builder.versions.map((entry) => (
                    <tr key={entry.id} className="border-b align-top last:border-0" data-version={entry.versionNo}>
                      <td className="px-2 py-1">
                        <Link className="underline" href={`${casePath}/packet?version=${entry.id}`}>
                          Version {entry.versionNo}
                        </Link>
                        {entry.current ? ' (current)' : ''}
                        {draftOf(drafts, entry.id) === undefined ? '' : ', drafted by the model'}
                      </td>
                      <td className="px-2 py-1">
                        {utc(entry.writtenAt)}, {entry.writtenBy ?? '—'}
                      </td>
                      <td className="px-2 py-1">{entry.verifierPassed ? 'Passed' : 'Failed'}</td>
                      <td className="px-2 py-1">
                        <DeadlineChip status={entry.deadlineStatus} />
                      </td>
                      <td className="px-2 py-1">{entry.approvedAt === null ? '—' : `${utc(entry.approvedAt)}, ${entry.approvedBy ?? '—'}${entry.approvedAlone ? ' (alone, flagged)' : ''}`}</td>
                      <td className="px-2 py-1">
                        {entry.exportedAt === null ? (
                          '—'
                        ) : (
                          <span className="flex flex-col">
                            <span>{utc(entry.exportedAt)}</span>
                            <span>
                              PDF <Hash value={entry.exportSha256} />
                            </span>
                            <span>
                              CSV <Hash value={entry.exportCsvSha256} />
                            </span>
                            <span>{entry.attestedAt === null ? 'Not attested yet' : `Attested ${utc(entry.attestedAt)}`}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        {entry.exportedAt === null || !canExport ? (
                          '—'
                        ) : (
                          <span className="flex flex-col">
                            <a className="underline" href={`${casePath}/packet/${entry.id}/pdf`}>
                              PDF
                            </a>
                            <a className="underline" href={`${casePath}/packet/${entry.id}/csv`}>
                              CSV
                            </a>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
