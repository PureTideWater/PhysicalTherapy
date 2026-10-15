import { randomUUID } from 'node:crypto';

import { WRITE_OFF_REASONS } from '@tp/triage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../components/action-form';
import { utc } from '../../../../../components/format';
import { Fact, Money } from '../../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { CaseStateBadge, Deadline, stageLabel, writeOffText } from '../../../../../components/triage/display';
import { loadPage } from '../../../../../lib/http/next';
import { casePage } from '../../../../../lib/routes/triage';
import type { CaseEvent } from '../../../../../lib/triage/queries';
import { reopenFormAction, writeOffFormAction } from './actions';

export const metadata: Metadata = { title: 'Case' };

type Props = { readonly params: Promise<{ practiceId: string; caseId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

function eventText(event: CaseEvent): string {
  if (event.kind === 'stage' && event.stage !== null) {
    return `${stageLabel(event.stage)}`;
  }
  if (event.kind === 'reopened_stage' && event.stage !== null && event.reopenedFrom !== null) {
    return `Reopened from ${stageLabel(event.reopenedFrom)} to ${stageLabel(event.stage)}, with a reason`;
  }
  if (event.kind === 'written_off' && event.writeOffReason !== null) {
    return `Written off: ${writeOffText(event.writeOffReason)}`;
  }
  return 'Reopened into the case, with a reason';
}

/**
 * A case (PRD 7, Cases: "detail with lines, trace, deadline, pursuit cost, notes, timeline ... write
 * off a line with reason ... a line past its window is struck through"; PRD 12, Write-offs and
 * reopening): its pattern, total, deadline and pursuit cost; every line with its trace, struck through
 * when written off (with its reason, kept visible); and the timeline of stages, write-offs and reopens.
 */
export default async function CasePage(props: Props) {
  const page = await loadPage(casePage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="cases" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, case: item, detail, canWork, canReadPhi } = page.data;
  return (
    <AppShell shell={page.shell} section="cases">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/cases`}>
          Cases
        </Link>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {item.payer}, {item.plan} <CaseStateBadge state={item.state} />
        </h1>
        <p className="text-sm text-muted-foreground">{item.behaviorText}.</p>
      </div>
      <Card role="region" aria-label="Case summary">
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-3">
          <Fact label={stageLabel('actionable')}>
            <Money value={item.actionableCents} /> ({item.openLines} of {item.lines} lines)
          </Fact>
          <Fact label="Written off">
            <Money value={item.writtenOffCents} /> ({item.lines - item.openLines} lines)
          </Fact>
          <Fact label="Deadline (earliest open window)">
            <Deadline on={item.deadlineOn} state={item.deadline} />
          </Fact>
          <Fact label="Case materiality">
            <Money value={item.materialityCents} />
          </Fact>
          <Fact label="Pursuit cost">{item.pursuitCostCents === null ? 'Not estimated (no staff rate and minutes in the practice’s settings)' : <Money value={item.pursuitCostCents} />}</Fact>
          <Fact label="Net expected value">{item.netExpectedCents === null ? '—' : <Money value={item.netExpectedCents} />}</Fact>
          <Fact label="Owner">{item.owner ?? 'Unassigned (assignment comes with the workbench)'}</Fact>
          <Fact label="Opened">{utc(item.openedAt)}</Fact>
          <Fact label="Closed">{item.closedAt === null ? '—' : utc(item.closedAt)}</Fact>
        </CardContent>
      </Card>
      <section aria-label="Lines" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Lines</h2>
        <ul className="flex flex-col gap-3" aria-label="Case lines">
          {detail.lines.map((line) => (
            <li key={line.id} className="rounded-md border p-4" data-case-line={line.id} data-actionable={line.actionable ? 'yes' : 'no'}>
              <div className={line.actionable ? 'flex flex-wrap items-center gap-3 text-sm' : 'flex flex-wrap items-center gap-3 text-sm text-muted-foreground line-through'}>
                {canReadPhi ? <span>{line.payerClaimControlNumber}</span> : null}
                <Link className="underline" href={`/p/${practiceId}/lines/${line.serviceLineId}?run=${line.pricingRunId}`}>
                  Line {line.lineNo}, {line.serviceDate}
                </Link>
                <span>
                  {[line.procedureCode, ...line.modifiers].join(' ')} x {line.units}
                </span>
                <span>
                  Expected <Money value={line.expectedAllowedCents} />, observed <Money value={line.observedAllowedCents} />, variance <Money value={line.varianceCents} />
                </span>
                <span>Window ends {line.windowEndsOn ?? '—'}</span>
              </div>
              {line.writtenOffReason === null ? null : (
                <p className="pt-1 text-sm" data-reason={line.writtenOffReason}>
                  {line.writtenOffReason === 'window_passed' && line.writtenOffBy === null ? 'WINDOW_PASSED: struck through by triage once its window closed.' : `Written off: ${writeOffText(line.writtenOffReason)}`}
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
                    <input type="hidden" name="requestKey" value={randomUUID()} />
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
                  </ActionForm>
                </details>
              ) : line.windowPassed || line.windowEndsOn === null ? null : (
                <details className="pt-2">
                  <summary className="cursor-pointer text-sm underline">Reopen this line</summary>
                  <ActionForm action={reopenFormAction} submit="Reopen" className="flex max-w-xl flex-col gap-3 pt-2">
                    <input type="hidden" name="requestKey" value={randomUUID()} />
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
      </section>
      <Card role="region" aria-label="Timeline">
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>Stages move forward only; a reopen is an explicit action with a reason. Payer approved and recovered come from the recovery ledger.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-1 text-sm">
            {detail.events.map((event) => (
              <li key={`${event.at}:${event.serviceLineId}:${event.kind}:${event.stage ?? ''}`}>
                {utc(event.at)}: line {event.lineNo}, {eventText(event)} ({event.by ?? 'triage'})
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </AppShell>
  );
}
