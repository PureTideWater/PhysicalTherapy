import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { QuestionList, TotalsText } from '../../../../components/contracts/display';
import { utc } from '../../../../components/format';
import { Money, Pager } from '../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../components/shell';
import { REMEDY_SCREEN_NAMES, remedyPath } from '../../../../lib/contracts/remedies';
import { shareOf } from '../../../../lib/pricing/view';
import { loadPage } from '../../../../lib/http/next';
import { coveragePage } from '../../../../lib/routes/coverage';

export const metadata: Metadata = { title: 'Coverage' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The Coverage screen (PRD 7): the share of lines and dollars priced, the unpriced reasons by count
 * with each reason's remedy linked to the screen it is taken on, the dollars waiting on mappings, what
 * to obtain to raise coverage, and the request-to-payer letter for a missing schedule (a text file from
 * a fixed template). Shares and counts are the latest complete pricing run's; until one completes,
 * they are zero.
 */
export default async function CoveragePage(props: Props) {
  const page = await loadPage(coveragePage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="coverage" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, lines, priced, run, pricingRuns, reasons, waiting, waitingPlans, readiness, obtain, payers, contracts } = page.data;
  // The shares are of the latest complete run's lines; before one, of every line the practice holds.
  const of = run === null ? { lines: lines.lines, chargeCents: lines.chargeCents } : { lines: run.lines, chargeCents: run.chargeCents };
  const path = `/p/${practiceId}/coverage`;
  return (
    <AppShell shell={page.shell} section="coverage">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Coverage</h1>
        <p className="text-sm text-muted-foreground">How much of the practice’s billing the platform can price under its agreements, why the rest is unpriced, and what raises it.</p>
      </div>
      <Card role="region" aria-label="Priced share">
        <CardHeader>
          <CardTitle>
            Priced: {priced.lines} of {of.lines} lines ({shareOf(priced.lines, of.lines)}); <Money value={priced.chargeCents} /> of <Money value={of.chargeCents} /> billed ({shareOf(priced.chargeCents, of.chargeCents)})
          </CardTitle>
          <CardDescription>
            {run === null ? (
              pricingRuns === 0 ? (
                'No pricing run has priced this practice’s lines yet, so every line counts as unpriced. A pricing run prices each line under the signed-off contract version in force on its service date, or records why it cannot; the shares and counts here come from the latest one.'
              ) : (
                <>
                  No pricing run has completed yet; the shares and counts here come from the latest complete one (
                  <Link className="underline" href={`/p/${practiceId}/pricing-runs`}>
                    Pricing runs
                  </Link>
                  ).
                </>
              )
            ) : (
              <>
                From the latest complete pricing run,{' '}
                <Link className="underline" href={`/p/${practiceId}/pricing-runs/${run.id}`}>
                  {run.periodFrom} to {run.periodTo}
                </Link>{' '}
                under rule release {run.releaseNo}, complete {utc(run.completedAt)}. The practice holds {lines.lines} lines in all.
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
                  <th className="py-1 font-medium">Payer</th>
                  <th className="py-1 font-medium">Plan</th>
                  <th className="py-1 text-right font-medium">Lines</th>
                  <th className="py-1 text-right font-medium">Claims</th>
                  <th className="py-1 text-right font-medium">Billed</th>
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
                    <td className="py-1 pr-3 text-right tabular-nums">{plan.waiting.lines}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{plan.waiting.claims}</td>
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
        <h2 className="text-lg font-semibold">Unpriced reasons</h2>
        <p className="text-sm text-muted-foreground">{run === null ? 'Counts appear once a pricing run completes.' : 'Lines of the latest complete pricing run, by the reason it left them unpriced.'}</p>
        <table className="w-full text-left text-sm" aria-label="Unpriced reasons and their remedies">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Reason</th>
              <th className="py-1 font-medium">Meaning</th>
              <th className="py-1 text-right font-medium">Lines</th>
              <th className="py-1 font-medium">Remedy</th>
            </tr>
          </thead>
          <tbody>
            {reasons.map((reason) => (
              <tr key={reason.reason} className="border-t align-top" data-reason={reason.reason}>
                <td className="py-1 pr-3 font-mono text-xs">{reason.reason}</td>
                <td className="py-1 pr-3">{reason.meaning}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{reason.lines}</td>
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
        <h2 className="text-lg font-semibold">What to obtain</h2>
        {obtain.length === 0 ? (
          <EmptyState
            title="The contract specialist is not waiting on any document"
            nextStep="When a contract cannot be abstracted (missing pages, a missing fee schedule, an undefined method), the specialist's question appears here with what to obtain."
          />
        ) : (
          <QuestionList questions={obtain} practiceId={practiceId} />
        )}
      </section>
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
