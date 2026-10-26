import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm, RefusalTakeover } from '../../../../../components/action-form';
import { utc } from '../../../../../components/format';
import { DiffSummaryText, DiffTable, SplitChangeText, acceptingChanges } from '../../../../../components/pricing/diff';
import {
  CoverageShares,
  FAILURE_TEXT,
  HeldByLimitNote,
  NotInEffectAlert,
  PatternTable,
  PendingRunsAlert,
  QueuedRunsNote,
  RERUN_TEXT,
  RerunBlockedAlert,
  RunLink,
  RunStateBadges,
  RunStatusBadge,
  UnpricedReasons,
  diffRunName,
  nothingMoreToAccept,
  runName,
  unacceptedRerunText,
} from '../../../../../components/pricing/display';
import { Fact, Money, Pager } from '../../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import type { RerunAcceptanceView, RunSummary } from '../../../../../lib/pricing/queries';
import type { DiffRun } from '@tp/worker/pricing';
import { ACCEPT_HELD_BY_LIMIT, type CurrentRelease, pricingRunPage } from '../../../../../lib/routes/pricing';
import { acceptPricingRunFormAction, rerunPricingRunFormAction } from '../actions';
import { FormKeys } from '../../../../../components/form-keys';
import { ScrollTable } from '../../../../../components/scroll-table';

export const metadata: Metadata = { title: 'Pricing run' };

type Props = { readonly params: Promise<{ practiceId: string; runId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

const FILTER_NAMES: Readonly<Record<string, string>> = { all: 'All lines', priced: 'Priced', unpriced: 'Unpriced' };

/**
 * The Re-run button for a run (the run in effect for its service dates; createRerun refuses any other), pinned to the
 * release in force, with the sentence of what a re-run does. On the run's own page it reads "Re-run under release N"
 * and a refusal "This run: ..."; offered on a superseded re-run's page for the run in effect, its words name that run
 * ("Re-run the run in effect under release N", "The run to re-run: ..."), so nobody reads it as re-running the page's
 * own run (UX review of PR #50, UX-4); that longer button wraps at a phone's width (UX recheck, N1). "Rule release:
 * ..." for the release. It refreshes the page after a refusal (`takeover`: the key of the explanation that may take
 * its place, which then takes the focus).
 */
function RerunForm({
  practiceId,
  run,
  release,
  className,
  takeover,
  target = 'this',
}: {
  readonly practiceId: string;
  readonly run: RunSummary;
  readonly release: CurrentRelease;
  readonly className: string;
  readonly takeover: string;
  readonly target?: 'this' | 'in_effect';
}) {
  return (
    <ActionForm
      action={rerunPricingRunFormAction}
      submit={target === 'this' ? `Re-run under release ${String(release.releaseNo)}` : `Re-run the run in effect under release ${String(release.releaseNo)}`}
      variant="outline"
      className={className}
      labels={{ runId: target === 'this' ? 'This run' : 'The run to re-run', releaseNo: 'Rule release' }}
      refreshOnError={takeover}
      wrapSubmit={target === 'in_effect'}
    >
      <FormKeys />
      <input type="hidden" name="practiceId" value={practiceId} />
      <input type="hidden" name="runId" value={run.id} />
      <input type="hidden" name="releaseNo" value={release.releaseNo} />
      <p className="text-sm text-muted-foreground">
        {target === 'this' ? (
          <>
            A re-run prices the same lines again under rule release {release.releaseNo} and today&apos;s mappings and contract versions, and lists exactly the lines that change. This run never
            changes.
          </>
        ) : (
          <>
            A re-run of the run in effect, {runName(run)}, prices its lines again under rule release {release.releaseNo} and today&apos;s mappings and contract versions, and lists exactly the
            lines that would change. The run in effect stays as it is until a person accepts the new re-run.
          </>
        )}
      </p>
    </ActionForm>
  );
}

/**
 * What a superseded re-run's page offers instead of Accept: the Re-run button of the run in effect for its service
 * dates, for a person who may re-run. Not when that run, priced after the re-run, already prices these lines under
 * what is in force now ("nothing more to accept": nothingMoreToAccept), nor for a re-run whose run in effect waits
 * for a first run of overlapping dates (named instead). Superseded by the cut-off, a release or a split alone, the
 * re-run may have read newer settings, so the button is offered. For other service dates the run in effect is the
 * re-run's original unless a later run of its dates took effect, and re-running it again is always useful: the new
 * re-run is priced after the runs that superseded this one.
 */
function SupersededRerunOffer({
  practiceId,
  rerunId,
  acceptance,
  release,
  canRerun,
}: {
  readonly practiceId: string;
  readonly rerunId: string;
  readonly acceptance: Extract<RerunAcceptanceView, { state: 'superseded' }>;
  readonly release: CurrentRelease | null;
  readonly canRerun: boolean;
}) {
  const target = acceptance.inEffect;
  if (target === null || release === null || nothingMoreToAccept(acceptance)) {
    return null;
  }
  if (acceptance.inEffectPending.length > 0) {
    return (
      <RefusalTakeover keys={[`rerun-from:${rerunId}`]}>
        <PendingRunsAlert practiceId={practiceId} runs={acceptance.inEffectPending} inEffect={target} />
      </RefusalTakeover>
    );
  }
  return canRerun ? <RerunForm practiceId={practiceId} run={target} release={release} className="flex flex-col gap-2" takeover={`rerun-from:${rerunId}`} target="in_effect" /> : null;
}

/**
 * The runs of other service dates whose pricing in effect the diff reads (payment-engine review of PR #50, F4): on
 * the lines they hold, accepting this re-run replaces their pricing, so those lines are compared with them (J17:
 * the diff lists exactly what accepting changes).
 */
function HeldByText({ practiceId, heldBy }: { readonly practiceId: string; readonly heldBy: readonly DiffRun[] }) {
  return (
    <p className="text-sm" data-state="held-by">
      {heldBy.length === 1 ? 'Some of these lines are priced in effect by a run of other service dates, ' : 'Some of these lines are priced in effect by runs of other service dates: '}
      {heldBy.map((held, index) => (
        <span key={held.id}>
          {index === 0 ? '' : index === heldBy.length - 1 ? ' and ' : ', '}
          <Link className="underline" href={`/p/${practiceId}/pricing-runs/${held.id}`} data-run-link={held.id}>
            {diffRunName(held)}
          </Link>
        </span>
      ))}
      . Accepting this re-run replaces that pricing too, so those lines are compared with {heldBy.length === 1 ? 'it' : 'them'}: the lines below are exactly what accepting changes.
    </p>
  );
}

/**
 * One pricing run (PRD 7, Pricing runs; PRD 5, J7): its period, pinned release and engine, the
 * contract versions it priced under, its coverage, the unpriced reasons by count, the variance by
 * payer pattern, and its lines (largest shortfall first), each opening the line's trace under this
 * run. A complete run never changes. For the roles that price runs, the run in effect for its service
 * dates is re-run here under the release in force; any other complete run names that run instead, and a
 * first run of overlapping dates queued or being priced is named in the button's place. A re-run shows
 * its diff against the pricing its acceptance would replace (exactly the lines that changed, with their
 * causes) and is accepted here, after which it is the run in effect (docs/adr/0037), but only while
 * nothing in effect for overlapping service dates is newer than it: otherwise the page says why it can no
 * longer be accepted, links to the run to use, and offers that run's Re-run button (combined audit #10;
 * docs/adr/0037, amendment of 2026-10-26; PRC-25 to PRC-28).
 */
export default async function PricingRunPage(props: Props) {
  const page = await loadPage(pricingRunPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="pricing_runs" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, run, names, filter, lines, reruns, diff, heldBy, acceptance, original, periodInEffect, rerunPending, release, canRerun } = page.data;
  const heldByOverLimit = heldBy !== null && heldBy.length > ACCEPT_HELD_BY_LIMIT;
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
            {run.status !== 'complete' ? null : run.inEffect ? (
              '; re-run it to price it under the release in force'
            ) : periodInEffect === null ? null : (
              <>
                ; re-run{' '}
                <RunLink practiceId={practiceId} run={periodInEffect}>
                  the run in effect for these service dates
                </RunLink>{' '}
                to price them under the release in force
              </>
            )}
            .
          </AlertDescription>
        </Alert>
      )}
      {run.rerunOfId === null ? null : (
        <Card role="region" aria-label="Re-run">
          <CardHeader>
            <CardTitle>Re-run</CardTitle>
            <CardDescription>
              It prices the lines of{' '}
              {original === null ? (
                <Link className="underline" href={`${pricingRuns}/${run.rerunOfId}`}>
                  an earlier run
                </Link>
              ) : (
                <RunLink practiceId={practiceId} run={original} />
              )}{' '}
              again, under rule release {run.releaseNo}; that run stays as it was.
              {run.acceptedAt !== null
                ? null
                : run.acceptance === 'superseded' || run.acceptance === 'release_withdrawn'
                  ? ' It was never accepted, and it is not in effect.'
                  : ' Nothing of it is in effect until a person accepts it.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {acceptance?.state === 'acceptable' && acceptance.replaces.id !== run.rerunOfId ? (
              <p className="text-sm" data-state="replaces-later-run">
                Since this re-run was created, <RunLink practiceId={practiceId} run={acceptance.replaces} /> took effect for these service dates. Accepting this re-run replaces that run, so the lines
                below are compared with it.
              </p>
            ) : null}
            {acceptance?.state === 'acceptable' && heldBy !== null && heldBy.length > 0 ? <HeldByText practiceId={practiceId} heldBy={heldBy} /> : null}
            {acceptance?.state === 'acceptable' && acceptance.queued.length > 0 ? <QueuedRunsNote practiceId={practiceId} runs={acceptance.queued} /> : null}
            {diff === null ? (
              <p className="text-sm text-muted-foreground">The diff appears once the run is complete.</p>
            ) : (
              <>
                {heldBy !== null && acceptingChanges(diff.summary) === 0 ? null : (
                  <p className="text-sm" data-state="diff-summary">
                    <DiffSummaryText summary={diff.summary} accepting={heldBy !== null} />
                  </p>
                )}
                <SplitChangeText before={diff.before} after={diff.after} />
                <DiffTable practiceId={practiceId} lines={diff.lines} beforeRunId={diff.before.id} afterRunId={diff.after.id} heldBy={heldBy ?? undefined} />
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
            ) : acceptance === null ? null : acceptance.state === 'acceptable' ? (
              heldByOverLimit ? (
                <HeldByLimitNote count={heldBy.length} limit={ACCEPT_HELD_BY_LIMIT} />
              ) : canRerun ? (
                <ActionForm
                  action={acceptPricingRunFormAction}
                  submit="Accept this run"
                  className="flex flex-col gap-2"
                  labels={{ runId: 'This re-run', replacesId: 'The run it replaces', heldByIds: 'The runs of other service dates holding its lines' }}
                  refreshOnError={`accept:${run.id}`}
                >
                  <FormKeys />
                  <input type="hidden" name="practiceId" value={practiceId} />
                  <input type="hidden" name="runId" value={run.id} />
                  <input type="hidden" name="replacesId" value={acceptance.replaces.id} />
                  {(heldBy ?? []).map((held) => (
                    <input key={held.id} type="hidden" name="heldByIds[]" value={held.id} />
                  ))}
                  <p className="text-sm">Accepting makes this run the one in effect for its period: Claims and lines and Coverage read it from then on.</p>
                </ActionForm>
              ) : (
                <p className="text-sm text-muted-foreground">A billing manager or firm principal accepts a re-run.</p>
              )
            ) : (
              <>
                <RefusalTakeover keys={[`accept:${run.id}`, `rerun-from:${run.id}`]}>
                  <RerunBlockedAlert practiceId={practiceId} acceptance={acceptance} />
                </RefusalTakeover>
                {acceptance.state === 'superseded' ? <SupersededRerunOffer practiceId={practiceId} rerunId={run.id} acceptance={acceptance} release={release} canRerun={canRerun} /> : null}
              </>
            )}
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
          {run.status !== 'complete' ? null : !run.inEffect ? (
            <RefusalTakeover keys={[`rerun:${run.id}`]} className="mt-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <NotInEffectAlert practiceId={practiceId} inEffect={periodInEffect} />
            </RefusalTakeover>
          ) : rerunPending.length > 0 ? (
            <RefusalTakeover keys={[`rerun:${run.id}`]} className="mt-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <PendingRunsAlert practiceId={practiceId} runs={rerunPending} inEffect={run} self />
            </RefusalTakeover>
          ) : (
            <>
              {run.rerun.length === 0 ? null : (
                <p className="pt-3 text-sm" data-state="rerun-offered">
                  Since this run, {run.rerun.map((reason) => RERUN_TEXT[reason]).join(' and ')}; this run stays as it was, and a re-run prices its lines under what is in force now.
                </p>
              )}
              {release !== null && canRerun ? <RerunForm practiceId={practiceId} run={run} release={release} className="flex flex-col gap-2 pt-3" takeover={`rerun:${run.id}`} /> : null}
            </>
          )}
          {reruns.length === 0 ? null : (
            <ul className="flex flex-col gap-1 pt-3 text-sm" aria-label="Re-runs of this run">
              {reruns.map((item) => (
                <li key={item.id} data-run={item.id}>
                  <Link className="underline" href={`${pricingRuns}/${item.id}`}>
                    Re-run under release {item.releaseNo}
                  </Link>
                  , created {utc(item.createdAt)}: {item.status === 'complete' ? (item.acceptedAt === null ? unacceptedRerunText(item) : `accepted ${utc(item.acceptedAt)}`) : item.status}
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
              <UnpricedReasons coverage={coverage} />
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
          <ScrollTable label="Run lines">
            <table className="w-full min-w-[40rem] text-left text-sm" aria-label="Run lines">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Code and modifiers</th>
                  <th className="py-1 pr-3 text-right font-medium">Units</th>
                  <th className="py-1 pr-3 text-right font-medium">Expected allowed</th>
                  <th className="py-1 pr-3 text-right font-medium">Observed allowed</th>
                  <th className="py-1 pr-3 text-right font-medium">Variance</th>
                  <th className="py-1 pr-3 font-medium">Method or reason</th>
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
          </ScrollTable>
        )}
        <Pager path={path} query={{ lines: filter }} page={lines.page} pages={lines.pages} total={lines.total} noun="lines" />
      </section>
    </AppShell>
  );
}
