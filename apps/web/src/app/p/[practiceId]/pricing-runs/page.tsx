import { randomUUID } from 'node:crypto';

import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../components/action-form';
import { utc } from '../../../../components/format';
import { CoverageShares, FAILURE_TEXT, RERUN_TEXT, RunStatusBadge } from '../../../../components/pricing/display';
import { Money, Pager } from '../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../components/shell';
import { loadPage } from '../../../../lib/http/next';
import { pricingRunsPage } from '../../../../lib/routes/pricing';
import { createPricingRunFormAction } from './actions';

export const metadata: Metadata = { title: 'Pricing runs' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The Pricing runs screen (PRD 7; PRD 5, J7): every run with its period, rule release, engine version,
 * the contract versions it priced under, its coverage and its variance by payer pattern, newest
 * first; and, for the roles that map plans, the form that creates a run for a period under the current
 * release. A run never changes once complete; when a mapping, a contract version or the release has
 * changed since, the screen offers a new run of the same period.
 */
export default async function PricingRunsPage(props: Props) {
  const page = await loadPage(pricingRunsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="pricing_runs" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, list, release, readiness, canCreate } = page.data;
  const path = `/p/${practiceId}/pricing-runs`;
  return (
    <AppShell shell={page.shell} section="pricing_runs">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pricing runs</h1>
        <p className="text-sm text-muted-foreground">
          Each run prices every line of a period under the signed-off contract version in force on its service date and one numbered rule release, and keeps the result as it was priced.
        </p>
      </div>
      <Card role="region" aria-label="Create a run">
        <CardHeader>
          <CardTitle>Create a run</CardTitle>
          <CardDescription>
            {release === null
              ? 'No rule release is published yet, so no run can be created.'
              : `A run created now is pinned to rule release ${String(release.releaseNo)} (manifest ${release.manifestSha256.slice(0, 12)}…).`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {readiness.allowed ? null : (
            <Alert variant="destructive" data-state="refused">
              <AlertTitle>Pricing is refused until every plan is mapped</AlertTitle>
              <AlertDescription>
                {readiness.unmappedPlans} {readiness.unmappedPlans === 1 ? 'plan has' : 'plans have'} no mapping at all; a run over a period with their lines is refused.{' '}
                <Link className="underline" href={`/p/${practiceId}/mapping`}>
                  Map them
                </Link>{' '}
                first.
              </AlertDescription>
            </Alert>
          )}
          {release === null ? null : canCreate ? (
            <ActionForm action={createPricingRunFormAction} submit="Create the run" className="grid max-w-xl gap-3">
              <input type="hidden" name="requestKey" value={randomUUID()} />
              <input type="hidden" name="practiceId" value={practiceId} />
              <input type="hidden" name="releaseNo" value={release.releaseNo} />
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="run-from">First month of service</Label>
                  <Input id="run-from" name="fromMonth" type="month" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="run-to">Last month (blank for one month)</Label>
                  <Input id="run-to" name="toMonth" type="month" />
                </div>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted-foreground">Runs are created by the roles that map plans (the billing manager and the firm principal).</p>
          )}
        </CardContent>
      </Card>
      <section aria-label="Runs" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Runs</h2>
        {list.total === 0 ? (
          <EmptyState title="No pricing run yet" nextStep="Map every plan with lines, then create a run for the months you want priced." />
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Pricing runs">
            {list.runs.map((run) => (
              <li key={run.id} className="rounded-md border p-4" data-run={run.id} data-status={run.status}>
                <div className="flex flex-wrap items-center gap-2">
                  <Link className="font-medium underline" href={`${path}/${run.id}`}>
                    {run.periodFrom} to {run.periodTo}
                  </Link>
                  <RunStatusBadge status={run.status} />
                  <span className="text-xs text-muted-foreground">
                    Release {run.releaseNo}, engine {run.engineVersion}; created {utc(run.createdAt)} by {run.createdBy}
                    {run.completedAt === null ? '' : `; complete ${utc(run.completedAt)}`}
                  </span>
                </div>
                {run.failureCode === null ? null : <p className="pt-2 text-sm text-destructive">{FAILURE_TEXT[run.failureCode] ?? run.failureCode}</p>}
                {run.coverage === null ? null : (
                  <div className="flex flex-col gap-1 pt-2 text-sm">
                    <CoverageShares coverage={run.coverage} />
                    <span>
                      Underpaid (validated): <Money value={run.coverage.patterns.reduce((sum, pattern) => sum + BigInt(pattern.underpaid_cents), 0n).toString()} /> across {run.coverage.patterns.length}{' '}
                      {run.coverage.patterns.length === 1 ? 'payer pattern' : 'payer patterns'}; {run.coverage.versions.length} contract{' '}
                      {run.coverage.versions.length === 1 ? 'version' : 'versions'}
                    </span>
                  </div>
                )}
                {run.rerun.length === 0 ? null : (
                  <p className="pt-2 text-sm" data-state="rerun-offered">
                    Since this run, {run.rerun.map((reason) => RERUN_TEXT[reason]).join(' and ')}. This run stays as it was;{' '}
                    {canCreate ? 'create a new run for the same months to price under what is in force now.' : 'a billing manager can create a new run for the same months.'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <Pager path={path} query={{}} page={list.page} pages={list.pages} total={list.total} noun="runs" />
      </section>
    </AppShell>
  );
}
