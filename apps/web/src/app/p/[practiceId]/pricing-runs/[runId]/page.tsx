import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../components/action-form';
import { utc } from '../../../../../components/format';
import { DiffSummaryText, DiffTable } from '../../../../../components/pricing/diff';
import { CoverageShares, FAILURE_TEXT, PatternTable, RERUN_TEXT, RunStateBadges, RunStatusBadge } from '../../../../../components/pricing/display';
import { Fact, Money, Pager } from '../../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { unpricedReasonText } from '../../../../../lib/contracts/remedies';
import { loadPage } from '../../../../../lib/http/next';
import { pricingRunPage } from '../../../../../lib/routes/pricing';
import { acceptPricingRunFormAction, rerunPricingRunFormAction } from '../actions';
import { FormKeys } from '../../../../../components/form-keys';

export const metadata: Metadata = { title: 'Pricing run' };

type Props = { readonly params: Promise<{ practiceId: string; runId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

const FILTER_NAMES: Readonly<Record<string, string>> = { all: 'All lines', priced: 'Priced', unpriced: 'Unpriced' };

/**
 * One pricing run (PRD 7, Pricing runs; PRD 5, J7): its period, pinned release and engine, the
 * contract versions it priced under, its coverage, the unpriced reasons by count, the variance by
 * payer pattern, and its lines (largest shortfall first), each opening the line's trace under this
 * run. A complete run never changes. For the roles that price runs, a complete run is re-run here under
 * the release in force; a re-run shows its diff against the run it prices again (exactly the lines
 * that changed, with their causes) and is accepted here, after which it is the run in effect
 * (docs/adr/0037).
 */
export default async function PricingRunPage(props: Props) {
  const page = await loadPage(pricingRunPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="pricing_runs" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, run, names, filter, lines, reruns, diff, release, canRerun } = page.data;
  const pricingRuns = `/p/${practiceId}/pricing-runs`;
  const path = `${pricingRuns}/${run.id}`;
  const coverage = run.coverage;
  const filters = ['all', 'priced', 'unpriced', ...(coverage?.reasons.filter((entry) => entry.lines > 0).map((entry) => entry.reason) ?? [])];
  return (
    <AppShell shell={page.shell} section="pricing_runs">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/pricing-runs`}>
          Pricing runs
        </Link>
        <h1 className="text-[2rem] font-bold leading-display tracking-display">
          Pricing run, {run.periodFrom} to {run.periodTo}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <RunStatusBadge status={run.status} />
          <RunStateBadges run={run} />
          {run.status === 'complete' ? <span className="text-xs text-muted-foreground">Complete runs never change.</span> : null}
        </div>
      </div>
      {run.withdrawal === null ? null : (
        <Alert variant="destructive" data-state="release-withdrawn">
          <AlertTitle>Rule release {run.releaseNo} was withdrawn</AlertTitle>
          <AlertDescription>
            It was withdrawn on {utc(run.withdrawal.withdrawnAt)} ({run.withdrawal.reason}); release {run.withdrawal.reinstatedReleaseNo} is in force again. This run keeps every line as it was priced
            {run.status === 'complete' ? '; re-run it to price it under the release in force' : ''}.
          </AlertDescription>
        </Alert>
      )}
      {run.rerunOfId === null ? null : (
        <Card role="region" aria-label="Re-run">
          <CardHeader>
            <CardTitle>Re-run</CardTitle>
            <CardDescription>
              It prices the lines of{' '}
              <Link className="underline" href={`${pricingRuns}/${run.rerunOfId}`}>
                an earlier run
              </Link>{' '}
              again, under rule release {run.releaseNo}; that run stays as it was. Nothing of it is in effect until a person accepts it.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {diff === null ? (
              <p className="text-sm text-muted-foreground">The diff appears once the run is complete.</p>
            ) : (
              <>
                <p className="text-sm" data-state="diff-summary">
                  <DiffSummaryText summary={diff.summary} />
                </p>
                <DiffTable practiceId={practiceId} lines={diff.lines} beforeRunId={diff.before.id} afterRunId={diff.after.id} />
                {diff.total > diff.lines.length ? (
                  <Link className="text-sm underline" href={`${pricingRuns}/compare?before=${diff.before.id}&after=${diff.after.id}`}>
                    All {diff.total} lines of the diff
                  </Link>
                ) : null}
              </>
            )}
            {run.acceptedAt !== null ? (
              <p className="text-sm" data-state="accepted">
                Accepted {utc(run.acceptedAt)} by {run.acceptedBy}.
              </p>
            ) : run.status === 'complete' && run.withdrawal === null && canRerun ? (
              <ActionForm action={acceptPricingRunFormAction} submit="Accept this run" className="flex flex-col gap-2">
                <FormKeys />
                <input type="hidden" name="practiceId" value={practiceId} />
                <input type="hidden" name="runId" value={run.id} />
                <p className="text-sm">Accepting makes this run the one in effect for its period: Claims and lines and Coverage read it from then on.</p>
              </ActionForm>
            ) : run.status === 'complete' && run.withdrawal === null ? (
              <p className="text-sm text-muted-foreground">A billing manager or firm principal accepts a re-run.</p>
            ) : null}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Run</CardTitle>
          <CardDescription>What the run is pinned to and who created it.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-[max-content_1fr] gap-y-1 text-sm">
            <Fact label="Service dates">
              {run.periodFrom} to {run.periodTo}
            </Fact>
            <Fact label="Rule release">{run.releaseNo}</Fact>
            <Fact label="Engine">
              <span className="font-mono text-xs">{run.engineVersion}</span>
            </Fact>
            <Fact label="Created">
              {utc(run.createdAt)} by {run.createdBy}
            </Fact>
            <Fact label="Completed">{run.completedAt === null ? '—' : utc(run.completedAt)}</Fact>
            <Fact label="Triage date">{run.createdAt.slice(0, 10)} (windows are judged on the day the run was created)</Fact>
            {run.failureCode === null ? null : <Fact label="Failed">{FAILURE_TEXT[run.failureCode] ?? run.failureCode}</Fact>}
          </dl>
          {run.rerun.length === 0 ? null : (
            <p className="pt-3 text-sm" data-state="rerun-offered">
              Since this run, {run.rerun.map((reason) => RERUN_TEXT[reason]).join(' and ')}; this run stays as it was, and a re-run prices its lines under what is in force now.
            </p>
          )}
          {run.status !== 'complete' || release === null ? null : canRerun ? (
            <ActionForm action={rerunPricingRunFormAction} submit={`Re-run under release ${String(release.releaseNo)}`} variant="outline" className="flex flex-col gap-2 pt-3">
              <FormKeys />
              <input type="hidden" name="practiceId" value={practiceId} />
              <input type="hidden" name="runId" value={run.id} />
              <input type="hidden" name="releaseNo" value={release.releaseNo} />
              <p className="text-sm text-muted-foreground">
                A re-run prices the same lines again under rule release {release.releaseNo} and today&apos;s mappings and contract versions, and lists exactly the lines that change. This run never changes.
              </p>
            </ActionForm>
          ) : null}
          {reruns.length === 0 ? null : (
            <ul className="flex flex-col gap-1 pt-3 text-sm" aria-label="Re-runs of this run">
              {reruns.map((item) => (
                <li key={item.id} data-run={item.id}>
                  <Link className="underline" href={`${pricingRuns}/${item.id}`}>
                    Re-run under release {item.releaseNo}
                  </Link>
                  , created {utc(item.createdAt)}: {item.status === 'complete' ? (item.acceptedAt === null ? 'awaiting acceptance' : `accepted ${utc(item.acceptedAt)}`) : item.status}
                  {item.status === 'complete' ? (
                    <>
                      {' '}
                      (
                      <Link className="underline" href={`${pricingRuns}/compare?before=${run.id}&after=${item.id}`}>
                        diff
                      </Link>
                      )
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {coverage === null ? (
        <EmptyState
          mark
          title={run.status === 'failed' ? 'This run priced nothing' : 'This run has not finished'}
          nextStep={run.status === 'failed' ? 'Create a new run once the reason above is dealt with.' : 'The worker prices the run; reload this page in a moment.'}
        />
      ) : (
        <>
          <Card role="region" aria-label="Coverage">
            <CardHeader>
              <CardTitle>Coverage</CardTitle>
              <CardDescription>
                <CoverageShares coverage={coverage} />
              </CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full text-left text-sm" aria-label="Unpriced reasons">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">Reason</th>
                    <th className="py-1 font-medium">Remedy</th>
                    <th className="py-1 text-right font-medium">Lines</th>
                    <th className="py-1 text-right font-medium">Billed</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.reasons
                    .filter((entry) => entry.lines > 0)
                    .map((entry) => (
                      <tr key={entry.reason} className="border-t" data-reason={entry.reason}>
                        <td className="py-1 pr-3 font-mono text-xs">{entry.reason}</td>
                        <td className="py-1 pr-3">{unpricedReasonText(entry.reason).remedy}</td>
                        <td className="py-1 pr-3 text-right font-mono tabular-nums">{entry.lines}</td>
                        <td className="py-1 text-right">
                          <Money value={entry.charge_cents} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {coverage.engine_errors.length === 0 ? null : (
                <p className="pt-3 text-sm">
                  Engine errors by detail:{' '}
                  {coverage.engine_errors.map((entry) => `${entry.detail} (${String(entry.lines)}${entry.pages_operator ? ', operator alerted' : ', for review'})`).join('; ')}.
                </p>
              )}
            </CardContent>
          </Card>
          <Card role="region" aria-label="Contract versions">
            <CardHeader>
              <CardTitle>Contract versions</CardTitle>
              <CardDescription>The signed-off versions in force on the lines’ service dates, as this run used them.</CardDescription>
            </CardHeader>
            <CardContent>
              {coverage.versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No line of this run was priced under a contract version.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm" aria-label="Versions">
                  {coverage.versions.map((version) => {
                    const named = names.versions[version.contract_version_id];
                    return (
                      <li key={version.contract_version_id}>
                        <Link className="underline" href={`/p/${practiceId}/contracts/versions/${version.contract_version_id}`}>
                          {named === undefined ? version.contract_version_id : `${named.title}, version ${String(named.versionNo)} (from ${named.effectiveFrom})`}
                        </Link>
                        : {version.lines} {version.lines === 1 ? 'line' : 'lines'}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
          <section aria-label="Variance by payer pattern" className="flex flex-col gap-2">
            <h2 className="text-xl font-bold tracking-display">Variance by payer pattern</h2>
            <p className="text-sm text-muted-foreground">Expected allowed less observed allowed, over the priced lines. An underpaid line is a validated discrepancy; an overpayment is recorded and never pursued.</p>
            <PatternTable practiceId={practiceId} coverage={coverage} names={names} />
          </section>
        </>
      )}
      <section aria-label="Lines" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-display">Lines</h2>
        <nav aria-label="Line filter" className="flex flex-wrap gap-2 text-sm">
          {filters.map((name) => (
            <Link key={name} href={`${path}?lines=${name}`} aria-current={name === filter ? 'page' : undefined} className={name === filter ? 'font-medium underline' : 'underline'}>
              {FILTER_NAMES[name] ?? name}
            </Link>
          ))}
        </nav>
        {lines.total === 0 ? (
          <p className="text-sm text-muted-foreground">No line of this run matches.</p>
        ) : (
          <table className="w-full text-left text-sm" aria-label="Run lines">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Code and modifiers</th>
                <th className="py-1 text-right font-medium">Units</th>
                <th className="py-1 text-right font-medium">Expected allowed</th>
                <th className="py-1 text-right font-medium">Observed allowed</th>
                <th className="py-1 text-right font-medium">Variance</th>
                <th className="py-1 font-medium">Method or reason</th>
                <th className="py-1 font-medium">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.lines.map((line) => (
                <tr key={line.pricedLineId} className="border-t" data-line={line.serviceLineId}>
                  <td className="py-1 pr-3 font-mono text-xs">
                    {line.procedureCode}
                    {line.modifiers.length === 0 ? '' : ` ${line.modifiers.join(' ')}`}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono tabular-nums">{line.units ?? '—'}</td>
                  <td className="py-1 pr-3 text-right">
                    <Money value={line.expectedAllowedCents} />
                  </td>
                  <td className="py-1 pr-3 text-right">
                    <Money value={line.observedAllowedCents} />
                  </td>
                  <td className="py-1 pr-3 text-right">
                    <Money value={line.varianceCents} />
                  </td>
                  <td className="py-1 pr-3 font-mono text-xs">{line.unpricedReason ?? line.method ?? '—'}</td>
                  <td className="py-1 text-xs">
                    <Link className="underline" href={`/p/${practiceId}/lines/${line.serviceLineId}?run=${run.id}`}>
                      Line trace
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pager path={path} query={{ lines: filter }} page={lines.page} pages={lines.pages} total={lines.total} noun="lines" />
      </section>
    </AppShell>
  );
}
