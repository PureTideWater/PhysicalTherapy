import { WRITE_OFF_REASONS } from '@tp/triage';
import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../components/action-form';
import { CaseTimeline } from '../../../../../components/cases/timeline';
import { utc } from '../../../../../components/format';
import { Fact, Money, Pager } from '../../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { CaseStateBadge, Deadline, lineName, stageLabel, writeOffText } from '../../../../../components/triage/display';
import { loadPage } from '../../../../../lib/http/next';
import { PRICING_CAUSE_TEXT } from '../../../../../lib/packets/pricing';
import { WRITE_OFF_CONSEQUENCE, casePage } from '../../../../../lib/routes/triage';
import { NOTE_MAX_LENGTH } from '../../../../../lib/routes/workbench';
import { assignFormAction, noteFormAction, reopenFormAction, writeOffFormAction } from './actions';
import { FormKeys } from '../../../../../components/form-keys';
import { recoveredLabel } from '../../../../../components/reconciliation/display';
import { STATUS_TONES } from '../../../../../components/remittances/display';
import { StatusChip } from '../../../../../components/status';

export const metadata: Metadata = { title: 'Case' };

type Props = { readonly params: Promise<{ practiceId: string; caseId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

const PROOF_TEXT: Readonly<Record<string, string>> = { posted: 'posted in the practice’s payment posting', deposited: 'deposited in the practice’s bank' };

/**
 * A case (PRD 7, Cases: "detail with lines, trace, deadline, pursuit cost, notes, timeline"; "assign;
 * write off a line with reason; open the packet"; "a line past its window is struck through"; PRD 12,
 * Write-offs and reopening, and the headline's three numbers): its pattern and totals at their own
 * stages (actionable here, payer approved and recovered from the recovery ledger), deadline, pursuit
 * cost and owner; every line with its trace, struck through when written off (with its reason, kept
 * visible: WINDOW_PASSED when its window closed); its notes; its packet and dispute; and the timeline
 * of everything recorded on it. A line whose pricing is no longer current (priced again since it joined, its rule
 * release withdrawn, or its contract version no longer signed off or covering its date; audit item #4) is marked
 * with the cause: it is out of the actionable figure, and the packet is written only once it is written off or
 * priced current again, since nothing refreshes the case automatically yet.
 */
export default async function CasePage(props: Props) {
  const page = await loadPage(casePage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="cases" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, case: item, detail, activity, timeline, workers, dispute, ledger, canWork, canDraft, canReadPhi } = page.data;
  const base = `/p/${practiceId}/cases/${item.id}`;
  const notes = activity.filter((entry) => entry.kind === 'note');
  return (
    <AppShell shell={page.shell} section="cases">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/cases`}>
          Cases
        </Link>
        <h1 className="flex flex-wrap items-center gap-2 text-[2rem] font-bold leading-display tracking-display">
          {item.payer}, {item.plan} <CaseStateBadge state={item.state} />
        </h1>
        <p className="text-base text-muted-foreground">{item.behaviorText}.</p>
      </div>
      {dispute.latestSubmission?.followUpDue === true ? (
        <Alert variant="destructive" data-follow-up="due">
          <AlertTitle>Follow-up due</AlertTitle>
          <AlertDescription>
            The payer has not answered the submission of {dispute.latestSubmission.submittedOn}; its follow-up was due {dispute.latestSubmission.followUpOn}.{' '}
            <Link className="underline" href={`${base}/submissions`}>
              Submissions and responses
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      <Card role="region" aria-label="Case summary">
        <CardContent className="pt-6">
          <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-[max-content_1fr] gap-y-2 text-sm sm:grid-cols-[max-content_1fr_max-content_1fr]">
            <Fact label={stageLabel('actionable')}>
              <span data-figure="actionable">
                <Money value={item.actionableNowCents} />
              </span>{' '}
              ({item.openLines} of {item.lines} lines not written off)
            </Fact>
            <Fact label="Written off">
              <Money value={item.writtenOffCents} /> ({item.lines - item.openLines} lines, struck through below)
            </Fact>
            <Fact label={stageLabel('payer_approved')}>
              <span data-figure="payer-approved">
                <Money value={ledger.approvedCents} />
              </span>{' '}
              (from the recovery ledger)
            </Fact>
            <Fact label={recoveredLabel(ledger.proofLevel)}>
              <span data-figure="recovered">
                <Money value={ledger.recoveredCents} />
              </span>{' '}
              (stage five: cash {PROOF_TEXT[ledger.proofLevel] ?? ledger.proofLevel}, net of recoupments and reversals)
            </Fact>
            <Fact label="Deadline (earliest open window)">
              <Deadline on={item.deadlineOn} state={item.deadline} />
            </Fact>
            <Fact label="Case materiality">
              <Money value={item.materialityCents} />
            </Fact>
            <Fact label="Pursuit cost (estimate)">{item.pursuitCostCents === null ? 'Not estimated (no staff rate and minutes in the practice’s settings)' : <Money value={item.pursuitCostCents} />}</Fact>
            <Fact label="Net expected value">{item.netExpectedCents === null ? '—' : <Money value={item.netExpectedCents} />}</Fact>
            <Fact label="Owner">
              <span data-owner={item.ownerUserId ?? 'none'}>{item.owner ?? 'Unassigned'}</span>
            </Fact>
            <Fact label="Opened">{utc(item.openedAt)}</Fact>
            <Fact label="Closed">{item.closedAt === null ? '—' : utc(item.closedAt)}</Fact>
          </dl>
          {canWork ? (
            <ActionForm action={assignFormAction} submit="Assign" variant="outline" className="flex flex-wrap items-end gap-3 pt-4">
              <FormKeys />
              <input type="hidden" name="practiceId" value={practiceId} />
              <input type="hidden" name="caseId" value={item.id} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="case-owner">Owner</Label>
                <select id="case-owner" name="ownerUserId" defaultValue={item.ownerUserId ?? ''} className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="">Unassigned</option>
                  {workers.map((person) => (
                    <option key={person.userId} value={person.userId}>
                      {person.email}
                    </option>
                  ))}
                </select>
              </div>
            </ActionForm>
          ) : null}
        </CardContent>
      </Card>
      <Card role="region" aria-label="Packet and dispute">
        <CardHeader>
          <CardTitle>Packet and dispute</CardTitle>
          <CardDescription>The packet presents the pattern once and the lines as a schedule; the practice submits it through the payer’s own channel and logs the submission and the payer’s response.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p data-packet={dispute.packet === null ? 'none' : dispute.packet.approved ? 'approved' : 'draft'}>
            {dispute.packet === null
              ? 'No packet yet.'
              : `Packet version ${String(dispute.packet.versionNo)}: ${dispute.packet.verifierPassed ? 'the verifier passed it' : 'the verifier failed it'}; ${dispute.packet.approved ? 'approved' : 'not approved'}; ${dispute.packet.exported ? 'exported' : 'not exported'}.`}
          </p>
          <p>
            {dispute.latestSubmission === null
              ? 'Not submitted yet.'
              : `Last submitted ${dispute.latestSubmission.submittedOn}; ${dispute.latestSubmission.answered ? 'the payer has answered' : `follow-up ${dispute.latestSubmission.followUpOn}`}.`}
          </p>
          <div className="flex flex-wrap gap-4">
            {canDraft ? (
              <Link className="underline" href={`${base}/packet`}>
                {dispute.packet === null ? 'Build the packet' : 'Open the packet'}
              </Link>
            ) : null}
            <Link className="underline" href={`${base}/submissions`}>
              Submissions and responses
            </Link>
          </div>
        </CardContent>
      </Card>
      <section aria-label="Lines" className="flex flex-col gap-3">
        <h2 className="text-xl font-bold tracking-display">Lines ({detail.totalLines})</h2>
        <ul className="flex flex-col gap-3" aria-label="Case lines">
          {detail.lines.map((line) => (
            <li key={line.id} className="rounded-md border p-4" data-case-line={line.id} data-actionable={line.actionable ? 'yes' : 'no'}>
              <div className={line.actionable ? 'flex flex-wrap items-center gap-3 text-sm' : 'flex flex-wrap items-center gap-3 text-sm text-muted-foreground line-through'}>
                {canReadPhi && line.payerClaimControlNumber !== null ? <span>{line.payerClaimControlNumber}</span> : null}
                <Link className="underline" href={`/p/${practiceId}/lines/${line.serviceLineId}?run=${line.pricingRunId}`}>
                  {lineName(line.position, detail.totalLines, line.serviceDate)}
                </Link>
                <span className="font-mono tabular-nums">
                  {[line.procedureCode, ...line.modifiers].join(' ')} x {line.units}
                </span>
                <span>
                  Expected <Money value={line.expectedAllowedCents} />, observed <Money value={line.observedAllowedCents} />, variance <Money value={line.varianceCents} />
                </span>
                <span>Window ends {line.windowEndsOn ?? '—'}</span>
                {line.stage === null ? null : <StatusChip tone={STATUS_TONES[line.stage]}>{stageLabel(line.stage)}</StatusChip>}
              </div>
              {line.writtenOffReason !== null || line.pricingCheck === 'current' ? null : (
                <p className="flex flex-wrap items-center gap-2 pt-1 text-sm" data-pricing-check={line.pricingCheck}>
                  <StatusChip tone="danger">Pricing not current</StatusChip>
                  <span>
                    {PRICING_CAUSE_TEXT[line.pricingCheck]}. It is out of the actionable figure, and a packet is written, approved, exported and attested only on the pricing in effect. Nothing refreshes
                    the case automatically yet, and the line does not become current again: write it off below (it leaves this dispute), then write, approve and export the packet again
                    without it.
                  </span>
                </p>
              )}
              {line.writtenOffReason === null ? null : (
                <p className="pt-1 text-sm" data-reason={line.writtenOffReason}>
                  {line.writtenOffReason === 'window_passed' && line.writtenOffBy === null ? 'WINDOW_PASSED: struck through by triage once its window closed; out of the actionable total.' : `Written off: ${writeOffText(line.writtenOffReason)}`}
                  {line.writtenOffText === null ? '' : ` (${line.writtenOffText})`}
                  {line.writtenOffBy === null ? '' : `, by ${line.writtenOffBy}`}
                  {line.writtenOffAt === null ? '' : `, ${utc(line.writtenOffAt)}`}.
                </p>
              )}
              {line.reopenedAt === null ? null : (
                <p className="pt-1 text-sm text-muted-foreground">
                  Last reopened {utc(line.reopenedAt)} by {line.reopenedBy ?? '—'}
                  {line.reopenReason === null ? '' : `: ${line.reopenReason}`}.
                </p>
              )}
              {!canWork ? null : line.writtenOffReason === null ? (
                <details className="pt-2">
                  <summary className="cursor-pointer text-sm underline">Write this line off</summary>
                  <ActionForm action={writeOffFormAction} submit="Write off" variant="destructive" className="flex max-w-xl flex-col gap-3 pt-2">
                    <FormKeys />
                    <input type="hidden" name="practiceId" value={practiceId} />
                    <input type="hidden" name="caseLineId" value={line.id} />
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`reason-${line.id}`}>Reason</Label>
                      <select id={`reason-${line.id}`} name="reason" className="h-9 rounded-md border bg-background px-2 text-sm" required>
                        {WRITE_OFF_REASONS.map((reason) => (
                          <option key={reason} value={reason}>
                            {writeOffText(reason)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`text-${line.id}`}>Why (for “Other” only)</Label>
                      <Input id={`text-${line.id}`} name="text" maxLength={500} />
                    </div>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name="confirm" required className="mt-1" />
                      <span>{WRITE_OFF_CONSEQUENCE} Write it off.</span>
                    </label>
                  </ActionForm>
                </details>
              ) : line.windowPassed || line.windowEndsOn === null ? null : (
                <details className="pt-2">
                  <summary className="cursor-pointer text-sm underline">Reopen this line</summary>
                  <ActionForm action={reopenFormAction} submit="Reopen" className="flex max-w-xl flex-col gap-3 pt-2">
                    <FormKeys />
                    <input type="hidden" name="practiceId" value={practiceId} />
                    <input type="hidden" name="caseLineId" value={line.id} />
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`reopen-${line.id}`}>Reason</Label>
                      <Input id={`reopen-${line.id}`} name="reason" maxLength={500} required />
                    </div>
                  </ActionForm>
                </details>
              )}
            </li>
          ))}
        </ul>
        <Pager path={base} query={{}} page={detail.page} pages={detail.pages} total={detail.totalLines} noun="Lines" />
      </section>
      <Card role="region" aria-label="Notes" id="notes">
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>Kept encrypted with the practice’s key; their words show to the roles that read PHI.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No note yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm" aria-label="Case notes">
              {notes.map((note) => (
                <li key={note.id} className="rounded-md border p-2">
                  <p className="text-muted-foreground">
                    {utc(note.at)}, {note.by ?? '—'}
                  </p>
                  <p className="whitespace-pre-wrap">{note.text ?? 'Its words show to the roles that read PHI.'}</p>
                </li>
              ))}
            </ul>
          )}
          {canWork ? (
            <ActionForm action={noteFormAction} submit="Add the note" variant="outline" className="flex max-w-xl flex-col gap-2">
              <FormKeys />
              <input type="hidden" name="practiceId" value={practiceId} />
              <input type="hidden" name="caseId" value={item.id} />
              <Label htmlFor="case-note">A note</Label>
              <textarea id="case-note" name="text" required maxLength={NOTE_MAX_LENGTH} rows={3} className="w-full rounded-md border bg-background p-2 text-sm" />
            </ActionForm>
          ) : null}
        </CardContent>
      </Card>
      <Card role="region" aria-label="Timeline">
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>
            Everything recorded on the case, oldest first (line events of the lines on this page). Stages move forward only; a reopen is an explicit action with a reason. Payer approved and recovered (posted or deposited) come from the recovery ledger.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CaseTimeline events={timeline} />
        </CardContent>
      </Card>
    </AppShell>
  );
}
