import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Label, PermissionState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ActionForm } from '../../../../components/action-form';
import { roleNames, utc } from '../../../../components/format';
import { EVIDENCE_WORDS, KindBadge, LedgerTotals, entryStage, exportStatusText, levelWords, outcomeWords } from '../../../../components/reconciliation/display';
import { UnattestedSubmissions } from '../../../../components/packets/unattested';
import { Money, Pager } from '../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../components/shell';
import { stageLabel } from '../../../../components/triage/display';
import { Uploader } from '../../../../components/uploads/uploader';
import { loadPage } from '../../../../lib/http/next';
import type { EntryView, LinkageLine, MatchView, RemittanceChoice } from '../../../../lib/reconciliation/queries';
import { REVERSAL_CONSEQUENCE, type ReconciliationNotice, reconciliationPage } from '../../../../lib/routes/reconciliation';
import { matchClaimFormAction, matchDepositFormAction, matchPostingFormAction, reverseMatchFormAction } from './actions';
import { FormKeys } from '../../../../components/form-keys';
import { pageCsrfToken } from '../../../../lib/http/csrf-page';

export const metadata: Metadata = { title: 'Reconciliation' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

const NOTICES: Readonly<Record<ReconciliationNotice, { readonly title: string; readonly text: string }>> = {
  matched: { title: 'Matched', text: 'The match is recorded in your name with its evidence; the ledger entries it owes follow from it.' },
  reversed: { title: 'Reversed', text: 'Each entry of the match, and each adjustment of one, is offset exactly by a reversed entry in your name; its evidence is unmatched again.' },
  already_matched: { title: 'Already matched', text: 'That match already stands; nothing was recorded twice.' },
  already_reversed: { title: 'Already reversed', text: 'That match was already reversed; nothing changed.' },
};

function ReverseForm({ practiceId, matchId, label = 'Reverse this match', idSuffix = '' }: { readonly practiceId: string; readonly matchId: string; readonly label?: string; readonly idSuffix?: string }) {
  return (
    <details className="pt-1">
      <summary className="cursor-pointer text-xs underline">{label}</summary>
      <ActionForm action={reverseMatchFormAction} submit="Reverse the match" variant="destructive" className="flex max-w-xl flex-col gap-2 pt-2">
        <FormKeys />
        <input type="hidden" name="practiceId" value={practiceId} />
        <input type="hidden" name="matchId" value={matchId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`reason-${matchId}${idSuffix}`}>Why it is reversed</Label>
          <textarea id={`reason-${matchId}${idSuffix}`} name="reason" required maxLength={2000} rows={2} className="rounded-md border bg-background p-2 text-sm" />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirm" required className="mt-1" />
          <span>{REVERSAL_CONSEQUENCE} Reverse it.</span>
        </label>
      </ActionForm>
    </details>
  );
}

function who(match: MatchView): string {
  return match.manual ? `by hand, ${match.matchedBy ?? ''}` : 'by the reconcile job';
}

/** One match with its evidence, its state and, for a person who reconciles postings, its reversal. */
function MatchItem({ practiceId, match, canReconcile, phi }: { readonly practiceId: string; readonly match: MatchView; readonly canReconcile: boolean; readonly phi: boolean }) {
  const evidence =
    match.evidence === null ? null : (
      <>
        {match.kind === 'posting' ? 'Posting row ' : 'Deposit row '}
        <span className="font-mono">{match.evidence.reference}</span>, {match.evidence.on}, <Money value={match.evidence.amountCents} />
        {match.evidence.batch === null ? '' : ` (batch ${match.evidence.batch})`}
        {' → '}
      </>
    );
  return (
    <li className="text-sm" data-match={match.id} data-kind={match.kind} data-standing={match.standing ? 'yes' : 'no'}>
      <span className={match.standing ? '' : 'line-through'}>
        {evidence}
        Remittance <span className="font-mono">{match.trace}</span>, {match.payerName}, paid {match.paidOn}
        {match.kind === 'claim' ? `: ${outcomeWords(match.outcome)}` : ''}
        {match.kind === 'posting' || match.kind === 'deposit' ? ` (${levelWords(match.level, match.allocated)})` : ''}
        {match.kind === 'recoupment' ? (match.source === 'plb' ? ': PLB WO take-back' : ': reversal of the attached claim') : ''}
        {match.kind === 'interest' ? (match.source === 'plb' ? ': PLB L6 interest' : ': the claim’s interest') : ''}; matched {who(match)}, {utc(match.matchedAt)}.
      </span>
      {match.standing ? null : (
        <span className="block text-xs text-muted-foreground" data-state="reversed">
          Reversed {utc(match.reversedAt)} by {match.reversedBy ?? '—'}
          {phi && match.reversalReason !== null ? `: ${match.reversalReason}` : ''}.
        </span>
      )}
      {match.standing && canReconcile && match.kind !== 'recoupment' && match.kind !== 'interest' ? <ReverseForm practiceId={practiceId} matchId={match.id} /> : null}
    </li>
  );
}

function Matches({ title, matches, empty, ...rest }: { readonly title: string; readonly matches: readonly MatchView[]; readonly empty: string; readonly practiceId: string; readonly canReconcile: boolean; readonly phi: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      {matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul aria-label={title} className="flex flex-col gap-1">
          {matches.map((match) => (
            <MatchItem key={match.id} match={match} {...rest} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EntryRows({ entries, practiceId, phi }: { readonly entries: readonly EntryView[]; readonly practiceId: string; readonly phi: boolean }) {
  return (
    <>
      {entries.map((entry) => (
        <tr key={entry.id} id={`entry-${entry.id}`} data-entry={entry.id} data-stage={entry.stage} className="border-b align-top">
          <td className="py-1 pr-3 font-mono text-xs">{entry.seq}</td>
          <td className="py-1 pr-3">{entry.effectiveOn}</td>
          <td className="py-1 pr-3">
            {entryStage(entry.stage)}
            {entry.allocated ? ' (allocated pro rata)' : ''}
          </td>
          <td className="py-1 pr-3 text-right">
            <Money value={entry.amountCents} />
          </td>
          <td className="py-1 pr-3">
            <Link className="underline" href={`/p/${practiceId}/reconciliation?case=${entry.caseId}`}>
              Case ledger
            </Link>
          </td>
          <td className="py-1 pr-3">{EVIDENCE_WORDS[entry.evidenceKind] ?? entry.evidenceKind}</td>
          <td className="py-1 pr-3">{entry.byJob ? 'the reconcile job' : (entry.createdBy ?? '—')}</td>
          <td className="py-1">{phi ? (entry.reason ?? '') : ''}</td>
        </tr>
      ))}
    </>
  );
}

function EntryTable({ entries, practiceId, phi, label }: { readonly entries: readonly EntryView[]; readonly practiceId: string; readonly phi: boolean; readonly label: string }) {
  return (
    <div className="overflow-x-auto">
      <table aria-label={label} className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-3">#</th>
            <th className="py-1 pr-3">Money moved</th>
            <th className="py-1 pr-3">Stage</th>
            <th className="py-1 pr-3 text-right">Amount</th>
            <th className="py-1 pr-3">Case</th>
            <th className="py-1 pr-3">Evidence</th>
            <th className="py-1 pr-3">Written by</th>
            <th className="py-1">{phi ? 'Reason' : ''}</th>
          </tr>
        </thead>
        <tbody>
          <EntryRows entries={entries} practiceId={practiceId} phi={phi} />
        </tbody>
      </table>
    </div>
  );
}

function LinkageItem({ line, practiceId, canReconcile, phi }: { readonly line: LinkageLine; readonly practiceId: string; readonly canReconcile: boolean; readonly phi: boolean }) {
  const shared = { practiceId, canReconcile, phi };
  return (
    <li className="flex flex-col gap-3 rounded-md border p-3" data-line={line.serviceLineId}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{phi ? `${line.procedureCode ?? ''} on ${line.serviceDate ?? '—'}` : 'Case line'}</span>
        <span data-line-stage={line.stage ?? 'none'}>{line.stage === null ? 'no stage' : stageLabel(line.stage as Parameters<typeof stageLabel>[0])}</span>
        <Link className="underline" href={`/p/${practiceId}/cases/${line.caseId}`}>
          Case
        </Link>
        <Link className="underline" href={`/p/${practiceId}/reconciliation?case=${line.caseId}`}>
          Case ledger
        </Link>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Matches title="ERA: the remittance that reprocessed it" matches={line.era} empty="No remittance has reprocessed this line yet." {...shared} />
        <Matches title="Posting" matches={line.postings} empty="No posting export row is matched to its remittance." {...shared} />
        <Matches title="EFT or bank deposit" matches={line.deposits} empty="No deposit is matched to its remittance." {...shared} />
      </div>
      {line.recoupments.length === 0 && line.interest.length === 0 ? null : (
        <div className="grid gap-3 lg:grid-cols-2">
          <Matches title="Recoupments" matches={line.recoupments} empty="Nothing taken back." {...shared} />
          <Matches title="Interest" matches={line.interest} empty="No interest paid." {...shared} />
        </div>
      )}
      {line.shortfallCents === null ? null : (
        <p className="rounded-md border border-dashed p-2 text-sm" data-shortfall={line.shortfallCents}>
          Shortfall: the payer accepted <Money value={line.shortfallCents} /> more than its remittance paid on this line. It stays approved and is never taken back as a recoupment. A contract
          specialist corrects the approval after review (under a support grant, with a reason), or the practice disputes it with a further submission.
        </p>
      )}
      <EntryTable entries={line.entries} practiceId={practiceId} phi={phi} label="Entries of the line" />
    </li>
  );
}

/**
 * Reconciliation (PRD 7: "ERA to posting to EFT linkage per case line; unmatched adjusted payments;
 * recoupments; ledger entries | Upload posting and EFT exports; match manually; reverse a match |
 * Unmatched items never count; every match shows its evidence"; PRD 5, J10; PRD 13): the ledger's
 * totals by stage, the uploads of posting and EFT exports and what became of each, what matches nothing
 * with its evidence and candidates side by side (counted in no total), each case line's linkage from its
 * remittance to its posting and deposit with its entries, and the ledger's entries. With ?case=, one
 * case's ledger. The submissions sent without sign-off (their pricing went stale after the export, so their export is
 * never attested; the founder's ruling of 2026-10-20) are listed plainly with the payer's latest answer.
 */
export default async function ReconciliationPage(props: Props) {
  const page = await loadPage(reconciliationPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="reconciliation" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const data = page.data;
  const { practiceId, caseId, canReconcile, phi } = data;
  const path = `/p/${practiceId}/reconciliation`;
  const query = { case: caseId ?? undefined };
  const unmatchedCount = data.unmatched.postings.length + data.unmatched.deposits.length + data.unmatched.adjustedPayments.length;
  const shared = { practiceId, canReconcile, phi };
  return (
    <AppShell shell={page.shell} section="reconciliation">
      <div className="flex flex-col gap-1">
        {caseId === null ? null : (
          <Link className="text-sm underline" href={path}>
            Reconciliation
          </Link>
        )}
        <h1 className="text-[2rem] font-bold leading-display tracking-display">{caseId === null ? 'Reconciliation' : 'Case ledger'}</h1>
        <p className="text-base text-muted-foreground">
          The recovery ledger: every amount is an entry with its evidence, never typed; recovered is the cash posted or deposited at the proof level, net of recoupments and reversals. Nothing unmatched counts.
        </p>
      </div>
      {data.notice === null ? null : (
        <Alert data-notice={data.notice}>
          <AlertTitle>{NOTICES[data.notice].title}</AlertTitle>
          <AlertDescription>{NOTICES[data.notice].text}</AlertDescription>
        </Alert>
      )}
      <LedgerTotals
        totals={data.totals}
        title={caseId === null ? 'Ledger totals' : 'This case’s ledger'}
        description="Each figure is its own stage, summed from the ledger’s entries; no figure adds two stages together."
      />
      <UnattestedSubmissions practiceId={practiceId} unattested={data.unattested} />
      {caseId === null ? (
        <>
          <Card role="region" aria-label="Posting template">
            <CardHeader>
              <CardTitle>Posting template</CardTitle>
              <CardDescription>
                {data.template.system === null
                  ? `No posting-export template is mapped yet${data.template.waiting === 0 ? '' : `: ${String(data.template.waiting)} posting ${data.template.waiting === 1 ? 'export waits' : 'exports wait'}, stored, until one is`}.`
                  : `Posting exports are read with the template for ${data.template.system}.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link className="text-sm underline" href={`${path}/template`}>
                {data.template.system === null ? 'Map the posting template' : 'Review the posting template'}
              </Link>
            </CardContent>
          </Card>
          <Card role="region" aria-label="Upload exports">
            <CardHeader>
              <CardTitle>Upload posting and EFT exports</CardTitle>
              <CardDescription>
                Each file goes through the same scanned intake as an 835; once it is stored, the reconcile reads it with the practice’s template and matches its rows to remittances, to the cent.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Uploader
                csrfToken={await pageCsrfToken()}
                practiceId={practiceId}
                canUpload={data.upload.canUpload}
                roleNames={roleNames(data.roles)}
                gate={data.upload.gate}
                limits={{ ...data.upload.limits, contentTypes: [...new Set(data.upload.kinds.flatMap((kind) => kind.contentTypes))] }}
                kinds={data.upload.kinds.map((kind) => ({ kind: kind.kind, label: kind.kind === 'posting_export' ? 'Posting export' : 'EFT or bank export', contentTypes: kind.contentTypes }))}
                heading="Drop posting or EFT exports here"
                description="CSV exports from the practice-management system or the bank, one at a time or a batch."
                uploaders="Billing managers, analysts and firm principals upload exports."
                showReceipts={false}
              />
            </CardContent>
          </Card>
          <section aria-label="Exports" className="flex flex-col gap-2">
            <h2 className="text-xl font-bold tracking-display">Exports</h2>
            {data.exports.total === 0 ? (
              <EmptyState title="No export uploaded yet" nextStep="Upload the practice-management system’s payment-posting export and the bank’s EFT export above." />
            ) : (
              <table aria-label="Exports" className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-1 pr-3">Kind</th>
                    <th className="py-1 pr-3">Uploaded</th>
                    <th className="py-1 pr-3">What became of it</th>
                    <th className="py-1 pr-3 text-right">Rows</th>
                    <th className="py-1 text-right">Matched</th>
                  </tr>
                </thead>
                <tbody>
                  {data.exports.items.map((item) => (
                    <tr key={item.id} className="border-b" data-document={item.id} data-status={item.status}>
                      <td className="py-1 pr-3">
                        <KindBadge kind={item.kind} />
                      </td>
                      <td className="py-1 pr-3">{utc(item.uploadedAt)}</td>
                      <td className="py-1 pr-3">{exportStatusText(item.status, item.kind, data.template.system !== null)}</td>
                      <td className="py-1 pr-3 text-right">{item.rows}</td>
                      <td className="py-1 text-right">{item.matchedRows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Pager path={path} query={query} page={data.exports.page} pages={data.exports.pages} total={data.exports.total} noun="Exports" param="exports" />
          </section>
          <section aria-label="Unmatched" className="flex flex-col gap-3">
            <h2 className="text-xl font-bold tracking-display">Unmatched: counted in no total</h2>
            <p className="text-sm text-muted-foreground">
              What matched nothing, with its evidence beside the records it could belong to. A match by hand records you, and the amounts must still agree to the cent.
            </p>
            {canReconcile ? null : <PermissionState role={roleNames(data.roles)} cannot="match or reverse" nextStep="A billing manager or firm principal reconciles postings." />}
            {unmatchedCount === 0 ? <EmptyState title="Nothing unmatched" nextStep="Every adjusted payment, posting row and deposit row the practice holds is matched." /> : null}
            {data.unmatched.adjustedPayments.length === 0 ? null : (
              <div className="flex flex-col gap-2" role="region" aria-label="Unmatched adjusted payments">
                <h3 className="font-semibold">Adjusted payments matching no case line</h3>
                <ul className="flex flex-col gap-2">
                  {data.unmatched.adjustedPayments.map((payment) => (
                    <li key={payment.claimId} className="grid gap-3 rounded-md border p-3 lg:grid-cols-2" data-claim={payment.claimId}>
                      <div className="text-sm">
                        <p className="font-medium">
                          {payment.payerName}, remittance <span className="font-mono">{payment.trace}</span>, paid {payment.paymentDate}: <Money value={payment.paidCents} />
                        </p>
                        <ul>
                          {payment.lines.map((line, index) => (
                            <li key={index}>
                              {phi ? `${line.procedureCode ?? ''} on ${line.serviceDate ?? '—'}: ` : 'A line: '}allowed <Money value={line.observedAllowedCents} />
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="text-sm">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Open case lines of the same code and date</p>
                        {payment.candidates.length === 0 ? (
                          <p className="text-muted-foreground">No open case line has its code and date of service.</p>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {payment.candidates.map((candidate) => (
                              <li key={candidate.serviceLineId} className="flex flex-wrap items-center gap-2">
                                <span>
                                  {phi ? `${candidate.procedureCode ?? ''} on ${candidate.serviceDate ?? '—'}, ` : ''}allowed before <Money value={candidate.observedAllowedCents} />
                                </span>
                                <Link className="underline" href={`/p/${practiceId}/cases/${candidate.caseId}`}>
                                  Case
                                </Link>
                                {canReconcile ? (
                                  <ActionForm action={matchClaimFormAction} submit="Match to this case line" variant="outline" className="flex">
                                    <FormKeys />
                                    <input type="hidden" name="practiceId" value={practiceId} />
                                    <input type="hidden" name="claimId" value={payment.claimId} />
                                    <input type="hidden" name="serviceLineId" value={candidate.serviceLineId} />
                                  </ActionForm>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.unmatched.postings.length === 0 ? null : (
              <div className="flex flex-col gap-2" role="region" aria-label="Unmatched postings">
                <h3 className="font-semibold">Posting rows matching no remittance</h3>
                <ul className="flex flex-col gap-2">
                  {data.unmatched.postings.map((row) => (
                    <li key={row.postingRowId} className="grid gap-3 rounded-md border p-3 lg:grid-cols-2" data-posting-row={row.postingRowId}>
                      <div className="text-sm">
                        <p className="font-medium">
                          Check or trace <span className="font-mono">{row.checkOrTrace}</span>, posted {row.postedOn}: <Money value={row.amountCents} />
                        </p>
                        <p className="text-muted-foreground">
                          Row {row.rowNo} of its export{row.payerName === null ? '' : `, ${row.payerName}`}
                          {row.batch === null ? '' : `, batch ${row.batch}`}
                          {row.lineLevel ? ', with line detail' : ', at the check level'}
                          {row.reversed ? '; a person reversed its earlier match' : ''}.
                        </p>
                        {row.correctionOf === null ? null : (
                          <div data-correction-of={row.correctionOf.matchId}>
                            <p>A take-back that offsets a posted row of the same check exactly: the export was corrected. It counts in no total; reverse the match it corrects.</p>
                            {canReconcile ? <ReverseForm practiceId={practiceId} matchId={row.correctionOf.matchId} label="Reverse the match this row corrects" idSuffix={`-${row.postingRowId}`} /> : null}
                          </div>
                        )}
                      </div>
                      <RemittanceCandidates candidates={row.candidates} form={(remittanceId) => (canReconcile ? <MatchForm action={matchPostingFormAction} practiceId={practiceId} hidden={{ postingRowId: row.postingRowId, remittanceId }} /> : null)} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.unmatched.deposits.length === 0 ? null : (
              <div className="flex flex-col gap-2" role="region" aria-label="Unmatched deposits">
                <h3 className="font-semibold">Deposit rows matching no remittance</h3>
                <ul className="flex flex-col gap-2">
                  {data.unmatched.deposits.map((row) => (
                    <li key={row.eftRowId} className="grid gap-3 rounded-md border p-3 lg:grid-cols-2" data-eft-row={row.eftRowId}>
                      <div className="text-sm">
                        <p className="font-medium">
                          Trace <span className="font-mono">{row.trace}</span>, deposited {row.depositedOn}: <Money value={row.amountCents} />
                        </p>
                        <p className="text-muted-foreground">
                          Row {row.rowNo} of its export{row.batchReference === null ? '' : `, batch ${row.batchReference}`}
                          {row.reversed ? '; a person reversed its earlier match' : ''}.
                        </p>
                      </div>
                      <RemittanceCandidates candidates={row.candidates} form={(remittanceId) => (canReconcile ? <MatchForm action={matchDepositFormAction} practiceId={practiceId} hidden={{ eftRowId: row.eftRowId, remittanceId }} /> : null)} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      ) : null}
      <section aria-label="Linkage" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-display">Case lines: ERA to posting to EFT</h2>
        {data.linkage.total === 0 ? (
          <EmptyState title="No case line has a ledger entry or a match yet" nextStep="Adjusted remittances are matched to case lines after they load; posting and EFT exports after they are uploaded." />
        ) : (
          <ul aria-label="Case lines" className="flex flex-col gap-3">
            {data.linkage.items.map((line) => (
              <LinkageItem key={line.serviceLineId} line={line} {...shared} />
            ))}
          </ul>
        )}
        <Pager path={path} query={query} page={data.linkage.page} pages={data.linkage.pages} total={data.linkage.total} noun="Case lines" param="lines" />
      </section>
      <section aria-label="Ledger entries" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-display">Ledger entries</h2>
        <p className="text-sm text-muted-foreground">Newest first. An entry never changes; a correction is an entry of its own, with its reason.</p>
        {data.entries.total === 0 ? (
          <EmptyState title="No entry yet" nextStep="Entries appear when a remittance, a posting or a deposit is matched to a case line." />
        ) : (
          <EntryTable entries={data.entries.items} practiceId={practiceId} phi={phi} label="Ledger entries" />
        )}
        <Pager path={path} query={query} page={data.entries.page} pages={data.entries.pages} total={data.entries.total} noun="Entries" param="entries" />
      </section>
    </AppShell>
  );
}

function MatchForm({ action, practiceId, hidden }: { readonly action: typeof matchPostingFormAction; readonly practiceId: string; readonly hidden: Readonly<Record<string, string>> }) {
  return (
    <ActionForm action={action} submit="Match to this remittance" variant="outline" className="flex">
      <FormKeys />
      <input type="hidden" name="practiceId" value={practiceId} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </ActionForm>
  );
}

function RemittanceCandidates({
  candidates,
  form,
}: {
  readonly candidates: readonly RemittanceChoice[];
  readonly form: (remittanceId: string) => ReactNode;
}) {
  return (
    <div className="text-sm">
      <p className="text-xs font-semibold uppercase text-muted-foreground">Remittances of its number or its amount</p>
      {candidates.length === 0 ? (
        <p className="text-muted-foreground">No loaded remittance has its number or its amount.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {candidates.map((candidate) => (
            <li key={candidate.remittanceId} className="flex flex-wrap items-center gap-2" data-remittance={candidate.remittanceId}>
              <span>
                <span className="font-mono">{candidate.trace}</span>, {candidate.payerName}, paid {candidate.paymentDate}: <Money value={candidate.paymentCents} />
              </span>
              {form(candidate.remittanceId)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
