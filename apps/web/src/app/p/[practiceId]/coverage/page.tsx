import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../components/action-form';
import { QuestionList, TotalsText } from '../../../../components/contracts/display';
import { Figure } from '../../../../components/coverage/share';
import { utc } from '../../../../components/format';
import { ChecklistCard, HandEntryNotice, ModelNoticeAlert } from '../../../../components/models/display';
import { Money, Pager } from '../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../components/shell';
import { REMEDY_SCREEN_NAMES, remedyPath } from '../../../../lib/contracts/remedies';
import { shareOf } from '../../../../lib/pricing/view';
import { loadPage } from '../../../../lib/http/next';
import { coveragePage } from '../../../../lib/routes/coverage';
import { generateReportDocumentFormAction } from '../reports/documents/actions';
import { reviewEvidenceFormAction, suggestEvidenceFormAction } from './actions';
import { FormKeys } from '../../../../components/form-keys';

export const metadata: Metadata = { title: 'Coverage' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The Coverage screen (PRD 7): the share of lines and dollars priced, the unpriced reasons by count
 * with each reason's remedy linked to the screen it is taken on, the dollars waiting on mappings, what
 * to obtain to raise coverage, and the request-to-payer letter for a missing schedule (a text file from
 * a fixed template). Shares and counts are each line's result in its pricing in effect, across every
 * run in effect (lib/coverage/in-effect.ts, as the dashboard and the digest read them), with the run
 * that took effect last named beside them; until a run takes effect, they are zero.
 */
export default async function CoveragePage(props: Props) {
  const page = await loadPage(coveragePage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="coverage" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, lines, priced, share, run, pricingRuns, reasons, waiting, waitingPlans, readiness, obtain, payers, contracts, canGenerateReport, checklist, canSuggest, modelNotice } = page.data;
  // The shares are of every line a run in effect priced; before one takes effect, of every line the practice holds.
  const inEffect = share.runs > 0;
  const of = inEffect ? share.of : { lines: lines.lines, chargeCents: lines.chargeCents };
  const path = `/p/${practiceId}/coverage`;
  return (
    <AppShell shell={page.shell} section="coverage">
      <div className="flex flex-col gap-1">
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Coverage</h1>
        <p className="text-base text-muted-foreground">How much of the practice’s billing PaidWhole can price under its agreements, why the rest is unpriced, and what raises it.</p>
      </div>
      <ModelNoticeAlert notice={modelNotice} />
      <Card role="region" aria-label="Priced share">
        <CardHeader>
          <CardTitle>
            Priced: <Figure>{priced.lines}</Figure> of <Figure>{of.lines}</Figure> lines (<Figure>{shareOf(priced.lines, of.lines)}</Figure>); <Money value={priced.chargeCents} /> of{' '}
            <Money value={of.chargeCents} /> billed (<Figure>{shareOf(priced.chargeCents, of.chargeCents)}</Figure>)
          </CardTitle>
          <CardDescription>
            {!inEffect || run === null ? (
              pricingRuns === 0 ? (
                'No pricing run has priced this practice’s lines yet, so every line counts as unpriced. A pricing run prices each line under the signed-off contract version in force on its service date, or records why it cannot; the shares and counts here take each line at its pricing in effect.'
              ) : (
                <>
                  No pricing run has completed yet; the shares and counts here take each line at its pricing in effect once one does (
                  <Link className="underline" href={`/p/${practiceId}/pricing-runs`}>
                    Pricing runs
                  </Link>
                  ).
                </>
              )
            ) : (
              <>
                Each line at its pricing in effect, across <Figure>{share.runs}</Figure> {share.runs === 1 ? 'pricing run' : 'pricing runs'} in effect (service {share.periodFrom} to {share.periodTo}). The
                latest to take effect is{' '}
                <Link className="underline" href={`/p/${practiceId}/pricing-runs/${run.id}`}>
                  {run.periodFrom} to {run.periodTo}
                </Link>{' '}
                under rule release {run.releaseNo}, complete {utc(run.completedAt)}. The practice holds <Figure>{lines.lines}</Figure> lines in all.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {readiness.allowed ? (
            <Alert data-state="ready">
              <AlertTitle>Pricing can run</AlertTitle>
              <AlertDescription>Every plan with lines has a mapping. Lines outside every mapping’s dates are left unpriced with NO_MAPPING, one by one.</AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive" data-state="refused">
              <AlertTitle>Pricing is refused until every plan is mapped</AlertTitle>
              <AlertDescription>
                {readiness.unmappedPlans} {readiness.unmappedPlans === 1 ? 'plan has' : 'plans have'} no mapping at all. A pricing run over them would be refused;{' '}
                <Link className="underline" href={`/p/${practiceId}/mapping`}>
                  map them
                </Link>{' '}
                first.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      <Card role="region" aria-label="Dollars waiting on mappings">
        <CardHeader>
          <CardTitle>
            Dollars waiting on mappings: <Money value={waiting.chargeCents} /> billed
          </CardTitle>
          <CardDescription>
            <TotalsText totals={waiting} /> with no mapping on their service date.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {waitingPlans.total === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is waiting on a mapping.</p>
          ) : (
            <table className="w-full text-left text-sm" aria-label="Plans waiting on mapping">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Payer</th>
                  <th className="py-1 pr-3 font-medium">Plan</th>
                  <th className="py-1 pr-3 text-right font-medium">Lines</th>
                  <th className="py-1 pr-3 text-right font-medium">Claims</th>
                  <th className="py-1 pr-3 text-right font-medium">Billed</th>
                  <th className="py-1 text-right font-medium">Paid</th>
                </tr>
              </thead>
              <tbody>
                {waitingPlans.plans.map((plan) => (
                  <tr key={plan.planId} className="border-t" data-plan={plan.planId}>
                    <td className="py-1 pr-3">{plan.payerName}</td>
                    <td className="py-1 pr-3">
                      <Link className="underline" href={`/p/${practiceId}/mapping/${plan.planId}`}>
                        {plan.planKey}
                      </Link>
                    </td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums">{plan.waiting.lines}</td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums">{plan.waiting.claims}</td>
                    <td className="py-1 pr-3 text-right">
                      <Money value={plan.waiting.chargeCents} />
                    </td>
                    <td className="py-1 text-right">
                      <Money value={plan.waiting.paidCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pager path={path} query={{}} page={waitingPlans.page} pages={waitingPlans.pages} total={waitingPlans.total} noun="plans" />
        </CardContent>
      </Card>
      <section aria-label="Unpriced reasons" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-display">Unpriced reasons</h2>
        <p className="text-sm text-muted-foreground">
          {inEffect ? 'Lines the runs in effect priced, each by the reason its pricing in effect left it unpriced.' : 'Counts appear once a pricing run completes.'}
        </p>
        <table className="w-full text-left text-sm" aria-label="Unpriced reasons and their remedies">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-medium">Reason</th>
              <th className="py-1 pr-3 font-medium">Meaning</th>
              <th className="py-1 pr-3 text-right font-medium">Lines</th>
              <th className="py-1 font-medium">Remedy</th>
            </tr>
          </thead>
          <tbody>
            {reasons.map((reason) => (
              <tr key={reason.reason} className="border-t align-top" data-reason={reason.reason}>
                <td className="py-1 pr-3 font-mono text-xs">{reason.reason}</td>
                <td className="py-1 pr-3">{reason.meaning}</td>
                <td className="py-1 pr-3 text-right font-mono tabular-nums">{reason.lines}</td>
                <td className="py-1">
                  {reason.remedy}
                  {reason.screen === null ? null : (
                    <>
                      {' '}
                      (
                      <Link className="underline" href={remedyPath(practiceId, reason.screen)}>
                        {REMEDY_SCREEN_NAMES[reason.screen]}
                      </Link>
                      )
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section aria-label="What to obtain" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-display">What to obtain</h2>
        {obtain.length === 0 ? (
          <EmptyState
            title="The contract specialist is not waiting on any document"
            nextStep="When a contract cannot be abstracted (missing pages, a missing fee schedule, an undefined method), the specialist's question appears here with what to obtain."
          />
        ) : (
          <QuestionList questions={obtain} practiceId={practiceId} />
        )}
        {checklist === null ? null : (
          <ChecklistCard
            checklist={checklist}
            review={(shown) => (
              <ActionForm action={reviewEvidenceFormAction} submit="Keep the checked items" className="flex flex-col gap-3">
                <input type="hidden" name="practiceId" value={practiceId} />
                <input type="hidden" name="proposalId" value={shown.id} />
                <fieldset className="flex flex-col gap-2 text-sm">
                  <legend className="font-medium">Keep the items that apply</legend>
                  {shown.items.map((item, index) => (
                    <label key={`${item.reason}:${String(index)}`} className="flex items-start gap-2" data-item={index}>
                      <input type="checkbox" name={`keep:${String(index)}`} value="on" defaultChecked />
                      <span>
                        <span className="font-medium">{item.document}</span> ({item.reason}): {item.why}
                      </span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 border-t pt-2">
                    <input type="checkbox" name="dismiss" value="on" />
                    Dismiss the whole checklist
                  </label>
                </fieldset>
              </ActionForm>
            )}
          />
        )}
        {canSuggest ? (
          <ActionForm action={suggestEvidenceFormAction} submit="Suggest what to obtain with the model" variant="outline">
            <FormKeys />
            <input type="hidden" name="practiceId" value={practiceId} />
            <p className="text-sm text-muted-foreground">
              The model is given the unpriced reasons’ counts and codes and the specialist’s open questions, nothing about a patient or a claim; each item it suggests must name one of
              them. You keep the items that apply.
            </p>
          </ActionForm>
        ) : canGenerateReport ? (
          <HandEntryNotice what="use each reason's remedy above and the specialist's questions" />
        ) : null}
      </section>
      <Card role="region" aria-label="Coverage report">
        <CardHeader>
          <CardTitle>Coverage report</CardTitle>
          <CardDescription>This screen as a PDF and a CSV, with its figures fixed as they stand now (no patient, claim or line in either). It is listed under Reports, with its downloads in the export history.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          {canGenerateReport ? (
            <ActionForm action={generateReportDocumentFormAction} submit="Generate the coverage report" variant="outline">
              <FormKeys />
              <input type="hidden" name="practiceId" value={practiceId} />
              <input type="hidden" name="kind" value="coverage" />
            </ActionForm>
          ) : (
            <p className="text-sm text-muted-foreground">A billing manager or analyst generates it; every generated report is on the Reports screen.</p>
          )}
          <Link className="text-sm underline" href={`/p/${practiceId}/reports`}>
            Reports
          </Link>
        </CardContent>
      </Card>
      <Card role="region" aria-label="Request-to-payer letter">
        <CardHeader>
          <CardTitle>Request a missing fee schedule from a payer</CardTitle>
          <CardDescription>A letter from a fixed template asking the payer for the schedule (or the page) that sets the rate for the codes you name. It downloads as a text file to sign and send.</CardDescription>
        </CardHeader>
        <CardContent>
          {payers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Payers appear once their 835s load.</p>
          ) : (
            <form method="get" action={`${path}/letter`} className="grid max-w-xl gap-3" aria-label="Letter">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="letter-payer">Payer</Label>
                <select id="letter-payer" name="payer" required className="h-9 rounded-md border bg-background px-2 text-sm">
                  {payers.map((payer) => (
                    <option key={payer.id} value={payer.id}>
                      {payer.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="letter-contract">The payer’s contract (optional)</Label>
                <select id="letter-contract" name="contract" className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="">None named</option>
                  {payers
                    .filter((payer) => contracts.some((contract) => contract.payerId === payer.id))
                    .map((payer) => (
                      <optgroup key={payer.id} label={payer.name}>
                        {contracts
                          .filter((contract) => contract.payerId === payer.id)
                          .map((contract) => (
                            <option key={contract.id} value={contract.id}>
                              {contract.title}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="letter-codes">Procedure codes (optional)</Label>
                <Input id="letter-codes" name="codes" placeholder="97110, 97530" maxLength={400} />
                <p className="text-xs text-muted-foreground">Leave blank to ask for the complete schedule.</p>
              </div>
              <div>
                <Button type="submit" variant="outline">
                  Download the letter
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
