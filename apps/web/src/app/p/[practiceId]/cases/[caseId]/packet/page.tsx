import { randomUUID } from 'node:crypto';

import { NARRATIVE_MAX_LENGTH } from '@tp/worker/packets';
import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../../components/action-form';
import { utc } from '../../../../../../components/format';
import { Countdown } from '../../../../../../components/packets/countdown';
import { Citation, EvidenceList, Hash, InterestSection, LineSchedule, Sources, StoredNarrative } from '../../../../../../components/packets/display';
import { DraftBadge, HandEntryNotice, ModelNoticeAlert, draftOf } from '../../../../../../components/models/display';
import { NarrativeEditor } from '../../../../../../components/packets/narrative-editor';
import { Money } from '../../../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../../../components/shell';
import { CaseStateBadge, stageLabel } from '../../../../../../components/triage/display';
import { loadPage } from '../../../../../../lib/http/next';
import { BLOCKED_TEXT, waitText } from '../../../../../../lib/packets/approval';
import type { AttachableDocument, BuilderView, VersionView } from '../../../../../../lib/packets/queries';
import { REQUEST_MESSAGE_MAX_LENGTH, packetPage } from '../../../../../../lib/routes/packets';
import { approveFormAction, draftNarrativeFormAction, exportFormAction, requestApprovalFormAction, writeVersionFormAction } from './actions';

export const metadata: Metadata = { title: 'Packet builder' };

type Props = { readonly params: Promise<{ practiceId: string; caseId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

const NOTICES = {
  written: 'A new version is written, with the verifier’s result. Any approval of an earlier version no longer stands.',
  unchanged: 'Nothing changed: the current version already holds this, so no version was written.',
  requested: 'Approval is requested. A second person who approves packets approves it here.',
  approved: 'The version is approved. Export it to print the PDF and CSV with the identifiers.',
  export_requested: 'The export is asked for: the worker prints the PDF and CSV, inserts the identifiers and records their SHA-256. Reload the page in a moment.',
  exported: 'This version is exported. Its SHA-256 is below and goes into the submission log.',
} as const;

const KIND_TEXT: Readonly<Record<string, string>> = { payer_letter: 'Payer letter', other: 'Other document', contract: 'Contract', exhibit: 'Exhibit' };

function documentLabel(document: AttachableDocument): string {
  return `${KIND_TEXT[document.kind] ?? document.kind}, uploaded ${utc(document.uploadedAt)}${document.sha256 === null ? '' : `, SHA-256 ${document.sha256.slice(0, 12)}…`}`;
}

/** The fields every version write carries: the version edited, the prompt-pay state and the attached documents. */
function VersionFields({ practiceId, caseId, builder, version }: { readonly practiceId: string; readonly caseId: string; readonly builder: BuilderView; readonly version: VersionView | null }) {
  const attached = new Set(version?.attachedDocumentIds ?? []);
  return (
    <>
      <input type="hidden" name="requestKey" value={randomUUID()} />
      <input type="hidden" name="practiceId" value={practiceId} />
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="basedOnVersionId" value={version?.id ?? ''} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`prompt-pay-${version?.id ?? 'first'}`}>Prompt-pay state (interest, its own line)</Label>
        <select id={`prompt-pay-${version?.id ?? 'first'}`} name="promptPayState" defaultValue={version?.content.interest?.state ?? ''} className="h-9 max-w-xs rounded-md border bg-background px-2 text-sm">
          <option value="">None: no interest line</option>
          {builder.promptPayStates.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
      </div>
      {builder.attachable.length === 0 ? null : (
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="font-medium">Attach to the evidence list</legend>
          {builder.attachable.map((document) => (
            <label key={document.id} className="flex items-center gap-2">
              <input type="checkbox" name={`attach:${document.id}`} defaultChecked={attached.has(document.id)} />
              {documentLabel(document)}
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}

/**
 * The packet builder (PRD 7, Packet builder: "citation, line table, traces, narrative editor with
 * verifier results, interest, evidence list, approval panel, export history"; "edit, request approval,
 * approve (second person), export"; "verifier failures block approval; identifiers are shown as
 * placeholders until export"; PRD 5, J9; PRD 12): one packet per case, its versions immutable, each
 * edit a new version whose narrative the server verifies again; the approval panel says what the
 * viewer may do and why not; the export prints the PDF and CSV with the identifiers and their SHA-256.
 */
export default async function PacketPage(props: Props) {
  const page = await loadPage(packetPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="cases" roles={page.roles} message={page.message} nextStep="A billing manager, an analyst or a firm principal builds packets; open the case to see its state." />;
  }
  const { practiceId, case: item, builder, notice, canApprove, canExport, asOf, canDraftWithModel, drafts, modelNotice } = page.data;
  const casePath = `/p/${practiceId}/cases/${item.id}`;
  const version = builder.version;
  const approval = builder.approval;
  return (
    <AppShell shell={page.shell} section="cases">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={casePath}>
          The case
        </Link>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          Packet: {item.payer}, {item.plan} <CaseStateBadge state={item.state} />
        </h1>
        <p className="text-sm text-muted-foreground">
          {item.behaviorText}. {stageLabel('actionable')}: <Money value={item.actionableNowCents} /> on {item.openLines} {item.openLines === 1 ? 'line' : 'lines'}, as of {asOf}.
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
            <ActionForm action={writeVersionFormAction} submit="Write the first version" className="flex max-w-xl flex-col gap-3">
              <VersionFields practiceId={practiceId} caseId={item.id} builder={builder} version={null} />
              <input type="hidden" name="useDraft" value="on" />
            </ActionForm>
            {canDraftWithModel ? (
              <ActionForm action={draftNarrativeFormAction} submit="Write the first version with the model's narrative" variant="outline" className="mt-4 flex max-w-xl flex-col gap-3">
                <VersionFields practiceId={practiceId} caseId={item.id} builder={builder} version={null} />
              </ActionForm>
            ) : null}
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
                <>
                  <ActionForm action={writeVersionFormAction} submit="Save as a new version" className="flex flex-col gap-3">
                    <VersionFields practiceId={practiceId} caseId={item.id} builder={builder} version={version} />
                    <NarrativeEditor name="narrative" initial={version.narrative} content={version.content} maxLength={NARRATIVE_MAX_LENGTH} />
                  </ActionForm>
                  <ActionForm action={writeVersionFormAction} submit="Write a new version from the code-built draft" variant="outline" className="flex flex-col gap-3">
                    <VersionFields practiceId={practiceId} caseId={item.id} builder={builder} version={version} />
                    <input type="hidden" name="useDraft" value="on" />
                  </ActionForm>
                  <div className="flex flex-col gap-2 border-t pt-4" role="group" aria-label="Draft with the model">
                    <p className="text-sm font-medium">Draft the narrative with the model</p>
                    <p className="text-sm text-muted-foreground">
                      The model is given the pattern statement’s figures and sources only, never an identifier. Its narrative is written as a new version and verified as any; edit it before
                      you request approval. A second person approves it as always.
                    </p>
                    {canDraftWithModel ? (
                      <ActionForm action={draftNarrativeFormAction} submit="Draft the narrative with the model" variant="outline" className="flex flex-col gap-3">
                        <VersionFields practiceId={practiceId} caseId={item.id} builder={builder} version={version} />
                      </ActionForm>
                    ) : (
                      <HandEntryNotice what="write the narrative above" />
                    )}
                  </div>
                </>
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
                  <AlertDescription>{BLOCKED_TEXT[approval.reason]}</AlertDescription>
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
              {approval !== null && approval.status !== 'approved' && approval.status !== 'blocked' && builder.approvalRequest === null && version.current ? (
                <ActionForm action={requestApprovalFormAction} submit="Request approval" variant="outline" className="flex max-w-xl flex-col gap-2">
                  <input type="hidden" name="requestKey" value={randomUUID()} />
                  <input type="hidden" name="practiceId" value={practiceId} />
                  <input type="hidden" name="caseId" value={item.id} />
                  <input type="hidden" name="versionId" value={version.id} />
                  <Label htmlFor="request-message">A word to the approver (optional)</Label>
                  <textarea id="request-message" name="message" maxLength={REQUEST_MESSAGE_MAX_LENGTH} rows={2} className="w-full rounded-md border bg-background p-2 text-sm" />
                </ActionForm>
              ) : null}
              {canApprove && approval !== null && approval.status !== 'approved' ? (
                approval.status === 'ready' || approval.status === 'drafter' ? (
                  <ActionForm action={approveFormAction} submit="Approve this version" className="flex flex-col gap-2">
                    <input type="hidden" name="requestKey" value={randomUUID()} />
                    <input type="hidden" name="practiceId" value={practiceId} />
                    <input type="hidden" name="caseId" value={item.id} />
                    <input type="hidden" name="versionId" value={version.id} />
                    <input type="hidden" name="versionSha256" value={version.contentSha256} />
                  </ActionForm>
                ) : (
                  <div>
                    <Button type="button" disabled aria-describedby="approval-blocked">
                      Approve this version
                    </Button>
                    <p id="approval-blocked" className="pt-1 text-muted-foreground">
                      {approval.status === 'waiting' ? 'Available once the 24-hour delay is over.' : 'Not available until the version can be approved.'}
                    </p>
                  </div>
                )
              ) : null}
            </CardContent>
          </Card>
          <Card role="region" aria-label="Export">
            <CardHeader>
              <CardTitle>Export</CardTitle>
              <CardDescription>The export prints the approved version as a PDF and a CSV schedule with the identifiers inserted from the claim and patient records, stores both sealed, and records their SHA-256.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {version.exportedAt !== null ? (
                <p data-export="done">
                  Exported {utc(version.exportedAt)}. PDF SHA-256 <Hash value={version.exportSha256} label="PDF SHA-256" />; CSV SHA-256 <Hash value={version.exportCsvSha256} label="CSV SHA-256" />.{' '}
                  <Link className="underline" href={`${casePath}/submissions`}>
                    Log its submission
                  </Link>
                </p>
              ) : approval?.status === 'approved' && version.current ? (
                canExport ? (
                  <ActionForm action={exportFormAction} submit="Export PDF and CSV" className="flex flex-col gap-2">
                    <input type="hidden" name="requestKey" value={randomUUID()} />
                    <input type="hidden" name="practiceId" value={practiceId} />
                    <input type="hidden" name="caseId" value={item.id} />
                    <input type="hidden" name="versionId" value={version.id} />
                  </ActionForm>
                ) : (
                  <p>A billing manager or firm principal exports the packet: the export holds line-level PHI.</p>
                )
              ) : (
                <p data-export="not_yet">Not exported: the current version is exported once it is approved.</p>
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
