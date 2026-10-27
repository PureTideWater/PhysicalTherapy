import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm, RefusalFallback, RefusalTakeover } from '../../../../components/action-form';
import { utc } from '../../../../components/format';
import { ReleaseLoadedThrough } from '../../../../components/pricing/content';
import { PendingRunsAlert, RunStateBadges } from '../../../../components/pricing/display';
import { ReleaseChanges, ReleaseStatusText } from '../../../../components/releases/note';
import { ScrollTable } from '../../../../components/scroll-table';
import { AppShell, Forbidden } from '../../../../components/shell';
import { loadPage } from '../../../../lib/http/next';
import { releasesPage } from '../../../../lib/routes/releases';
import { rerunPricingRunFormAction } from '../pricing-runs/actions';
import { FormKeys } from '../../../../components/form-keys';

export const metadata: Metadata = { title: 'Rule release notes' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The customer's release notes (PRD 9, The release pipeline step 5: "Customers see a release note: what
 * changed, which of their runs would change, and a button to re-run"; PRD 5, J17; PRD 18, Releases;
 * docs/adr/0037): every published rule release, and the one chosen (the release in force by default)
 * with what it changes, whether it is in force or was withdrawn, and the practice's runs in effect
 * pinned to another release. For the roles that price runs, each of those runs can be checked for how
 * many of its lines the release in force would change (worked out in memory, nothing written) and
 * re-run under it; the re-run's page shows exactly which lines change, and nothing is in effect until
 * a person accepts it. While a first run of a listed run's dates is queued or being priced, the run it
 * waits for is named in place of its Re-run button (docs/adr/0037, amendment of 2026-10-26). A refused
 * Re-run whose run leaves the list on the refresh is said after the list, which takes the focus
 * (RefusalFallback; UX recheck of PR #50, N6). Beside the release in force, through what date it loads each content
 * family (audit #59).
 */
export default async function ReleasesPage(props: Props) {
  const page = await loadPage(releasesPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="pricing_runs" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, releases, runsByRelease, inForce, note, otherRuns, pendingByRun, impact, canRerun, loadedThrough } = page.data;
  const path = `/p/${practiceId}/releases`;
  return (
    <AppShell shell={page.shell} section="pricing_runs">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/pricing-runs`}>
          Pricing runs
        </Link>
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Rule release notes</h1>
        <p className="text-base text-muted-foreground">
          Every expected amount is priced under one numbered release of the Medicare rules. A new release never changes a run; a re-run under it shows exactly which lines it would change before anyone accepts it.
        </p>
      </div>
      {note === null ? (
        <EmptyState mark title="No rule release is published yet" nextStep="Runs can be created once the first rule release is loaded." />
      ) : (
        <>
          <Card role="region" aria-label={`Release ${String(note.releaseNo)}`}>
            <CardHeader>
              <CardTitle>Rule release {note.releaseNo}</CardTitle>
              <CardDescription>
                <ReleaseStatusText note={note} /> {note.records} records; manifest <span className="font-mono text-xs">{note.manifestSha256.slice(0, 12)}…</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReleaseChanges note={note} />
            </CardContent>
          </Card>
          {note.releaseNo !== inForce || loadedThrough.length === 0 ? null : (
            <Card role="region" aria-label="What this release covers">
              <CardHeader>
                <CardTitle>What this release covers</CardTitle>
              </CardHeader>
              <CardContent>
                <ReleaseLoadedThrough families={loadedThrough} coverageHref={`/p/${practiceId}/coverage`} />
              </CardContent>
            </Card>
          )}
          <Card role="region" aria-label="Runs it would change">
            <CardHeader>
              <CardTitle>Your runs</CardTitle>
              <CardDescription>
                {note.inForce
                  ? `Runs in effect pinned to another release stay as they were priced. Re-running one prices its lines again under release ${String(note.releaseNo)}.`
                  : `Release ${String(note.releaseNo)} is not in force${inForce === null ? '' : `; release ${String(inForce)} is`}, so no run is priced under it again.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {otherRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No run in effect is pinned to another release.</p>
              ) : (
                <ul className="flex flex-col gap-3" aria-label="Runs pinned to another release">
                  {otherRuns.map((run) => (
                    <li key={run.id} className="flex flex-col gap-2 rounded-md border p-3" data-run={run.id}>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Link className="font-medium underline" href={`/p/${practiceId}/pricing-runs/${run.id}`}>
                          {run.periodFrom} to {run.periodTo}
                        </Link>
                        <span>under release {run.releaseNo}</span>
                        <RunStateBadges run={run} />
                        <span className="text-xs text-muted-foreground">complete {utc(run.completedAt)}</span>
                      </div>
                      {impact !== null && impact.pricingRunId === run.id ? (
                        <p className="text-sm" data-state="impact">
                          Release {note.releaseNo} would price {impact.changedLines} of its {impact.lines} lines differently.
                        </p>
                      ) : null}
                      {note.inForce && canRerun ? (
                        <div className="flex flex-wrap items-start gap-3">
                          <Link className="text-sm underline" href={`${path}?release=${String(note.releaseNo)}&check=${run.id}`}>
                            How many lines would change?
                          </Link>
                          {(pendingByRun[run.id] ?? []).length > 0 ? (
                            <RefusalTakeover keys={[`rerun:${run.id}`]}>
                              <PendingRunsAlert practiceId={practiceId} runs={pendingByRun[run.id] ?? []} inEffect={run} />
                            </RefusalTakeover>
                          ) : (
                            <ActionForm
                              action={rerunPricingRunFormAction}
                              submit={`Re-run under release ${String(note.releaseNo)}`}
                              variant="outline"
                              className="flex flex-col gap-2"
                              labels={{ runId: 'This run', releaseNo: 'Rule release' }}
                              refreshOnError={`rerun:${run.id}`}
                            >
                              <FormKeys />
                              <input type="hidden" name="practiceId" value={practiceId} />
                              <input type="hidden" name="runId" value={run.id} />
                              <input type="hidden" name="releaseNo" value={note.releaseNo} />
                            </ActionForm>
                          )}
                        </div>
                      ) : note.inForce && (pendingByRun[run.id] ?? []).length > 0 ? (
                        <PendingRunsAlert practiceId={practiceId} runs={pendingByRun[run.id] ?? []} inEffect={run} />
                      ) : note.inForce ? (
                        <p className="text-sm text-muted-foreground">A billing manager or firm principal can re-run it.</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {note.inForce && canRerun ? (
                <RefusalFallback
                  prefix="rerun:"
                  present={otherRuns.map((run) => `rerun:${run.id}`)}
                  lead="The run you asked to re-run is no longer listed: the list above now shows the runs in effect pinned to another release."
                />
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
      <section aria-label="Published releases" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-display">Published releases</h2>
        {releases.length === 0 ? null : (
          <ScrollTable label="Rule releases">
            <table className="w-full min-w-[32rem] text-left text-sm" aria-label="Rule releases">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Release</th>
                  <th className="py-1 pr-3 font-medium">Published</th>
                  <th className="py-1 pr-3 font-medium">Standing</th>
                  <th className="py-1 text-right font-medium">Your runs in effect on it</th>
                </tr>
              </thead>
              <tbody>
                {releases.map((release) => (
                  <tr key={release.releaseNo} className="border-t" data-release={release.releaseNo}>
                    <td className="py-1 pr-3">
                      <Link className="underline" href={`${path}?release=${String(release.releaseNo)}`} aria-current={release.releaseNo === note?.releaseNo ? 'page' : undefined}>
                        {release.releaseNo}
                      </Link>
                    </td>
                    <td className="py-1 pr-3">{utc(release.publishedAt)}</td>
                    <td className="py-1 pr-3">{release.withdrawal !== null ? `Withdrawn ${utc(release.withdrawal.withdrawnAt)}` : release.inForce ? 'In force' : 'Earlier'}</td>
                    <td className="py-1 text-right font-mono tabular-nums">{runsByRelease[String(release.releaseNo)] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        )}
      </section>
    </AppShell>
  );
}
