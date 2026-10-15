import { randomUUID } from 'node:crypto';

import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../components/action-form';
import { utc } from '../../../../components/format';
import { CoverageShares, FAILURE_TEXT, RERUN_TEXT, RunStateBadges, RunStatusBadge } from '../../../../components/pricing/display';
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
 * changed since, the run's page offers a re-run of it with a diff, which is in effect only once
 * accepted. Any two complete runs compare line for line, and when runs in effect are pinned to another
 * release than the one in force, the release note says what would change (docs/adr/0037).
 */
export default async function PricingRunsPage(props: Props) {
  const page = await loadPage(pricingRunsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="pricing_runs" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, list, release, readiness, canCreate, options, pinnedElsewhere } = page.data;
  const path = `/p/${practiceId}/pricing-runs`;
  const optionLabel = (option: (typeof options)[number]) =>
    `${option.periodFrom} to ${option.periodTo}, release ${String(option.releaseNo)}${option.rerunOfId === null ? '' : ', re-run'}${option.inEffect ? ', in effect' : ''} (complete ${utc(option.completedAt)})`;
  return (
    <AppShell shell={page.shell} section="pricing_runs">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pricing runs</h1>
        <p className="text-sm text-muted-foreground">
          Each run prices every line of a period under the signed-off contract version in force on its service date and one numbered rule release, and keeps the result as it was priced.
        </p>
      </div>
      {release === null || pinnedElsewhere === 0 ? null : (
        <Alert data-state="release-note">
          <AlertTitle>Rule release {release.releaseNo} is in force</AlertTitle>
          <AlertDescription>
            {pinnedElsewhere} {pinnedElsewhere === 1 ? 'run in effect is' : 'runs in effect are'} pinned to another release; they stay as they were priced.{' '}
            <Link className="underline" href={`/p/${practiceId}/releases?release=${String(release.releaseNo)}`}>
              Read the release note
            </Link>{' '}
            for what changed and which runs it would change, and re-run them from there.
          </AlertDescription>
        </Alert>
      )}
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
      {options.length < 2 ? null : (
        <Card role="region" aria-label="Compare two runs">
          <CardHeader>
            <CardTitle>Compare two runs</CardTitle>
            <CardDescription>Lists exactly the lines whose expected allowed, unpriced reason or adjustments differ, with the cause from the traces.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={`${path}/compare`} method="get" className="grid max-w-3xl gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="compare-before">First run</Label>
                <select id="compare-before" name="before" required defaultValue={options[1]?.id} className="h-9 rounded-md border bg-background px-2 text-sm">
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {optionLabel(option)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="compare-after">Second run</Label>
                <select id="compare-after" name="after" required defaultValue={options[0]?.id} className="h-9 rounded-md border bg-background px-2 text-sm">
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {optionLabel(option)}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" variant="outline">
                Compare
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      <section aria-label="Runs" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Runs</h2>
          <Link className="text-sm underline" href={`/p/${practiceId}/releases`}>
            Rule release notes
          </Link>
        </div>
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
                  <RunStateBadges run={run} />
                  {run.rerunOfId === null ? null : (
                    <Link className="text-xs underline" href={`${path}/${run.rerunOfId}`}>
                      Re-run of an earlier run
                    </Link>
                  )}
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
                {run.rerun.length === 0 || !run.inEffect ? null : (
                  <p className="pt-2 text-sm" data-state="rerun-offered">
                    Since this run, {run.rerun.map((reason) => RERUN_TEXT[reason]).join(' and ')}. This run stays as it was;{' '}
                    <Link className="underline" href={`${path}/${run.id}`}>
                      {canCreate ? 're-run it from its page' : 'a billing manager can re-run it from its page'}
                    </Link>{' '}
                    to see exactly which lines would change before anyone accepts the new run.
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
