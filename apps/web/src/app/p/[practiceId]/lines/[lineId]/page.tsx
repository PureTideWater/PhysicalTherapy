import { formatUnroundedUsd } from '@tp/money';
import { ExplainWordsError } from '@tp/packets/explain';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../components/action-form';
import { utc } from '../../../../../components/format';
import { Fact, LineStatusChip, Money, basisName, claimStatusName, period } from '../../../../../components/remittances/display';
import { AdjustmentWords, LineSummary, LineTrace, UnpricedWords } from '../../../../../components/pricing/line-words';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { notComputedWindowText } from '../../../../../lib/contracts/display';
import { loadPage } from '../../../../../lib/http/next';
import { type PricingWords, lineTraceSteps, pricingWords } from '../../../../../lib/pricing/view';
import { linePage } from '../../../../../lib/routes/remittances';
import { addLineNoteAction } from './actions';
import { FormKeys } from '../../../../../components/form-keys';

export const metadata: Metadata = { title: 'Line trace' };

/**
 * The line trace (PRD 7, Claims and lines: "open the line trace; add a note"; PRD 11 step 9): what the
 * 835 said about the line, its adjustments and how its observed allowed was derived, and how a
 * complete pricing run priced it: expected allowed with the unrounded amount beside it, the variance
 * or the unpriced reason, the dispute window, and every step of the run's trace in the engine's order,
 * in words (@tp/packets/explain; docs/adr/0072), with the rule records and the release it read. `run`
 * picks one of the runs that priced the line; without it, the latest. Every role reads the words; a
 * viewer's hold no date. What the engine recorded carries the line's dates, so it shows, in a closed
 * disclosure under the words, to roles that read PHI, as notes do; roles that work cases add notes.
 */
export default async function LinePage(props: {
  readonly params: Promise<{ practiceId: string; lineId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const page = await loadPage(linePage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="claims" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, detail, canNote, canReadPhi, pricing, steps, words, worksheets, wordsRefusal, runs } = page.data;
  const { line, adjustments, notes } = detail;
  // The method and adjustments in the words' own vocabulary; a code they have none for is refused, never shown (design 3.7).
  let cardWords: PricingWords | null = null;
  let refusal = wordsRefusal;
  if (pricing !== null && pricing.unpricedReason === null) {
    try {
      cardWords = pricingWords(pricing);
    } catch (error) {
      if (!(error instanceof ExplainWordsError)) {
        throw error;
      }
      refusal ??= `${error.list} has no words`;
    }
  }
  const modifiers = line.modifiers.filter((modifier) => modifier !== '');
  return (
    <AppShell shell={page.shell} section="claims">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/claims?view=all&claim=${line.claimId}`}>
          Claims and lines
        </Link>
        <h1 className="text-[2rem] font-bold leading-display tracking-display">
          Line {line.lineNo}: {line.procedureCode}
          {modifiers.length === 0 ? '' : ` ${modifiers.join(' ')}`}
        </h1>
        <div className="flex flex-wrap gap-1">
          <LineStatusChip status={line.status} priced={line.pricing !== null} shortfall={line.pricing !== null && BigInt(line.pricing.varianceCents ?? '0') > 0n} />
          {line.reversal ? <Badge variant="secondary">Reversal</Badge> : null}
          {line.reversed ? <Badge variant="outline">Reversed</Badge> : null}
          {line.superseded ? <Badge variant="outline">Superseded</Badge> : null}
        </div>
      </div>
      <Card role="region" aria-label="Pricing">
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>
            {pricing === null
              ? 'No complete pricing run has priced this line yet. A run prices it under the signed-off contract version in force on its service date, or records why it cannot.'
              : `As the pricing run of ${pricing.run.periodFrom} to ${pricing.run.periodTo} priced it, under rule release ${String(pricing.run.releaseNo)}.`}
          </CardDescription>
        </CardHeader>
        {pricing === null ? null : (
          <CardContent className="flex flex-col gap-3">
            <LineSummary words={words} refusal={refusal} />
            <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-[max-content_1fr] gap-y-1 text-sm">
              {pricing.unpricedReason === null ? (
                <>
                  <Fact label="Expected allowed">
                    <Money value={pricing.expectedAllowedCents} />{' '}
                    {pricing.expectedUnrounded === null ? null : (
                      <span className="text-xs text-muted-foreground">
                        (unrounded <span className="font-mono tabular-nums">{formatUnroundedUsd(pricing.expectedUnrounded)}</span>)
                      </span>
                    )}
                  </Fact>
                  <Fact label="Variance">
                    <Money value={pricing.varianceCents} /> {BigInt(pricing.varianceCents ?? '0') < 0n ? <span className="text-xs text-muted-foreground">(overpaid: recorded, never pursued)</span> : null}
                  </Fact>
                  {cardWords === null ? null : (
                    <>
                      <Fact label="Method">{cardWords.method ?? '—'}</Fact>
                      <Fact label="Adjustments">
                        <AdjustmentWords adjustments={cardWords.adjustments} />
                      </Fact>
                    </>
                  )}
                  {canReadPhi ? (
                    <Fact label="Dispute window ends">
                      {pricing.windowRuleNotComputed === null ? (
                        (pricing.windowEndsOn ?? 'No window known')
                      ) : (
                        <span data-window-rule="not_computed">{notComputedWindowText(pricing.windowRuleNotComputed.length, pricing.windowRuleNotComputed.rule)}</span>
                      )}
                    </Fact>
                  ) : null}
                </>
              ) : (
                <Fact label="Unpriced">
                  <UnpricedWords reason={pricing.unpricedReason} words={words} />
                </Fact>
              )}
              <Fact label="Mapping">
                <span className="font-mono text-xs">{pricing.mappingId ?? '—'}</span>
              </Fact>
              <Fact label="Contract version">
                {pricing.contractVersionId === null ? (
                  '—'
                ) : (
                  <Link className="font-mono text-xs underline" href={`/p/${practiceId}/contracts/versions/${pricing.contractVersionId}`}>
                    {pricing.contractVersionId}
                  </Link>
                )}
              </Fact>
              <Fact label="Rate record">
                <span className="font-mono text-xs">{pricing.rateRecordId ?? '—'}</span>
              </Fact>
              <Fact label="Rule release">
                {pricing.run.releaseNo} <span className="font-mono text-xs">(manifest {pricing.run.manifestSha256})</span>
              </Fact>
              <Fact label="Run">
                <Link className="underline" href={`/p/${practiceId}/pricing-runs/${pricing.run.id}`}>
                  {pricing.run.periodFrom} to {pricing.run.periodTo}
                </Link>
                , engine <span className="font-mono text-xs">{pricing.run.engineVersion}</span>, complete {utc(pricing.run.completedAt)}
              </Fact>
            </dl>
            {runs.length <= 1 ? null : (
              <nav aria-label="Runs that priced this line" className="flex flex-wrap gap-2 text-sm">
                <span className="text-muted-foreground">Other runs:</span>
                {runs
                  .filter((other) => other.runId !== pricing.run.id)
                  .map((other) => (
                    <Link key={other.runId} className="underline" href={`/p/${practiceId}/lines/${line.lineId}?run=${other.runId}`}>
                      {other.periodFrom} to {other.periodTo} (release {other.releaseNo}
                      {other.unpricedReason === null ? null : <span data-reason={other.unpricedReason}>, not priced</span>})
                    </Link>
                  ))}
              </nav>
            )}
          </CardContent>
        )}
      </Card>
      {pricing === null ? null : (
        <section aria-label="Trace" className="flex min-w-0 flex-col gap-2">
          <h2 className="text-xl font-bold tracking-display">Trace</h2>
          <LineTrace steps={lineTraceSteps(words, steps)} worksheets={worksheets} canReadPhi={canReadPhi} notApplied={words !== null && pricing.unpricedReason === null} />
        </section>
      )}
      <Card>
        <CardHeader>
          <CardTitle>The line as paid</CardTitle>
          <CardDescription>What the 835 said about the line.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-[max-content_1fr] gap-y-1 text-sm">
            <Fact label="Expected allowed">
              <Money value={line.expectedAllowedCents} />
            </Fact>
            <Fact label="Observed allowed">
              <Money value={line.observedAllowedCents} /> ({basisName(line.observedAllowedBasis, line.observedAllowedAllocated)})
            </Fact>
            <Fact label="AMT B6">
              <Money value={line.lineAllowedCents} />
            </Fact>
            <Fact label="Charge">
              <Money value={line.chargeCents} />
            </Fact>
            <Fact label="Paid">
              <Money value={line.paidCents} />
            </Fact>
            <Fact label="Patient share">
              <Money value={line.patientShareCents} />
            </Fact>
            <Fact label="Units">
              <span className="font-mono tabular-nums">{line.units ?? '—'}</span>
              {line.originalUnits === null ? '' : ` (billed ${line.originalUnits})`}
            </Fact>
            <Fact label="Code">
              <span className="font-mono text-xs">
                {line.procedureQualifier}:{line.procedureCode}
                {line.modifiers.length === 0 ? '' : `:${line.modifiers.join(':')}`}
              </span>
            </Fact>
            <Fact label="Revenue code">{line.revenueCode ?? '—'}</Fact>
            <Fact label="Plan key">
              <span className="font-mono text-xs">{line.planKey}</span>
            </Fact>
            <Fact label="Payer">
              {line.payerName}, paid {line.paymentDate}{' '}
              <Link className="underline" href={`/p/${practiceId}/remittances/${line.remittanceId}`}>
                (remittance)
              </Link>
            </Fact>
            <Fact label="Claim status">{claimStatusName(line.claimStatusCode)}</Fact>
            {line.identifiers === null ? null : (
              <>
                <Fact label="Patient reference">{line.identifiers.patient}</Fact>
                <Fact label="Patient control number">
                  <span className="font-mono text-xs">{line.identifiers.patientControlNumber}</span>
                </Fact>
                <Fact label="Payer claim control number">
                  <span className="font-mono text-xs">{line.identifiers.payerClaimControlNumber}</span>
                </Fact>
                <Fact label="Service date">{period(line.identifiers.serviceDate, line.identifiers.serviceDateTo)}</Fact>
                <Fact label="Rendering NPI">{line.renderingNpi ?? '—'}</Fact>
              </>
            )}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Adjustments</CardTitle>
          <CardDescription>The CAS adjustments on this line and on its claim. An unknown code loads with its flag.</CardDescription>
        </CardHeader>
        <CardContent>
          {adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No adjustments.</p>
          ) : (
            <table className="w-full text-left text-sm" aria-label="Adjustments">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Level</th>
                  <th className="py-1 pr-3 font-medium">Group</th>
                  <th className="py-1 pr-3 font-medium">Reason</th>
                  <th className="py-1 pr-3 text-right font-medium">Quantity</th>
                  <th className="py-1 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((item, index) => (
                  <tr key={index} className="border-t">
                    <td className="py-1 pr-3">{item.level === 'line' ? 'Line' : 'Claim'}</td>
                    <td className="py-1 pr-3 font-mono text-xs">{item.groupCode}</td>
                    <td className="py-1 pr-3 font-mono text-xs">
                      {item.reasonCode} {item.unknownCode ? <Badge variant="destructive">Unknown code</Badge> : null}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums">{item.quantity ?? '—'}</td>
                    <td className="py-1 text-right">
                      <Money value={item.amountCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      {notes === null ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>Kept with the line for the people who work it; encrypted with the practice’s key.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {notes.length === 0 ? (
              <EmptyState title="No notes yet" nextStep={canNote ? 'Add what you found or what to do next with this line.' : 'Roles that work cases add notes here.'} />
            ) : (
              <ul className="flex flex-col gap-2" aria-label="Notes">
                {notes.map((note) => (
                  <li key={note.id} className="rounded-md border p-3 text-sm">
                    <p className="whitespace-pre-wrap">{note.note}</p>
                    <p className="pt-1 text-xs text-muted-foreground">
                      {note.createdBy}, {utc(note.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {canNote ? (
              <ActionForm action={addLineNoteAction} submit="Add the note">
                <FormKeys />
                <input type="hidden" name="practiceId" value={practiceId} />
                <input type="hidden" name="lineId" value={line.lineId} />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="note">Note</Label>
                  <textarea id="note" name="note" required maxLength={2000} rows={3} className="rounded-md border bg-background p-2 text-sm" />
                </div>
              </ActionForm>
            ) : null}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
