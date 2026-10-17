import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../components/action-form';
import { utc } from '../../../components/format';
import { ReleaseChanges, ReleaseStatusText } from '../../../components/releases/note';
import { AppShell, Forbidden } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { ruleReleasesPage } from '../../../lib/routes/rule-releases';
import { prepareRuleReleaseFormAction } from './actions';
import { FormKeys } from '../../../components/form-keys';

export const metadata: Metadata = { title: 'Rule releases' };

type Props = { readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Rule releases (PRD 7, Internal console: "Drafts, checks, published releases, release notes,
 * affected-run diffs ... Prepare, check"; PRD 9, The release pipeline; PRD 18, Releases; the
 * load-release skill; docs/adr/0037). Published releases, the one in force and any withdrawal come from
 * the database, with each release's notes and record changes and, per practice, the runs pinned to it
 * and what the re-runs made under it changed, as counts (no run, line or claim is read). The drafts, the
 * content checker and preparing the next release work in the content checkout the server is given.
 * Publishing is never here: CI publishes a prepared release when its pull request merges.
 */
export default async function RuleReleasesPage(props: Props) {
  const page = await loadPage(ruleReleasesPage, { searchParams: props.searchParams });
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="rule_releases" roles={page.roles} message={page.message} nextStep="Rule releases are the platform administrators'." />;
  }
  const { releases, runs, note, elsewhere, workspace, check, nextRelease, prepared } = page.data;
  const shownRuns = note === null ? [] : runs.filter((row) => row.releaseNo === note.releaseNo);
  return (
    <AppShell shell={page.shell} section="rule_releases">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-display">Rule releases</h1>
        <p className="text-sm text-muted-foreground">
          Prepare and check releases here; CI publishes a prepared release when its pull request merges, and <span className="font-mono text-xs">pnpm release:load</span> and{' '}
          <span className="font-mono text-xs">pnpm release:rollback</span> load and withdraw it. Runs pinned to a release never change.
        </p>
      </div>
      {prepared === null ? null : (
        <Alert data-state="prepared">
          <AlertTitle>Release {prepared} prepared in content/outgoing</AlertTitle>
          <AlertDescription>
            Next: <span className="font-mono text-xs">pnpm release:dry-run {prepared}</span> against the staging snapshot, then a pull request titled &quot;content: release {prepared}&quot; with the runs whose lines change. Do not merge it yourself.
          </AlertDescription>
        </Alert>
      )}
      <section aria-label="Published releases" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Published releases</h2>
        {releases.length === 0 ? (
          <EmptyState title="No release is published" nextStep="Prepare release 1 from the verified drafts and open its pull request." />
        ) : (
          <table className="w-full text-left text-sm" aria-label="Rule releases">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Release</th>
                <th className="py-1 font-medium">Published</th>
                <th className="py-1 text-right font-medium">Records</th>
                <th className="py-1 font-medium">Standing</th>
                <th className="py-1 text-right font-medium">Complete runs</th>
                <th className="py-1 text-right font-medium">Re-runs (accepted)</th>
                <th className="py-1 text-right font-medium">Lines re-runs changed</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((release) => {
                const rows = runs.filter((row) => row.releaseNo === release.releaseNo);
                const sum = (field: 'runs' | 'reruns' | 'rerunsAccepted' | 'changedLines') => rows.reduce((total, row) => total + row[field], 0);
                return (
                  <tr key={release.releaseNo} className="border-t" data-release={release.releaseNo}>
                    <td className="py-1 pr-3">
                      <Link className="underline" href={`/console/rule-releases?release=${String(release.releaseNo)}`} aria-current={release.releaseNo === note?.releaseNo ? 'page' : undefined}>
                        {release.releaseNo}
                      </Link>
                    </td>
                    <td className="py-1 pr-3">{utc(release.publishedAt)}</td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums">{release.records}</td>
                    <td className="py-1 pr-3">
                      {release.withdrawal !== null ? <Badge variant="destructive">Withdrawn</Badge> : release.inForce ? <Badge>In force</Badge> : <span className="text-muted-foreground">Earlier</span>}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums">{sum('runs')}</td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums">
                      {sum('reruns')} ({sum('rerunsAccepted')})
                    </td>
                    <td className="py-1 text-right font-mono tabular-nums">{sum('changedLines')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      {note === null ? null : (
        <Card role="region" aria-label={`Release ${String(note.releaseNo)}`}>
          <CardHeader>
            <CardTitle>Release {note.releaseNo}</CardTitle>
            <CardDescription>
              <ReleaseStatusText note={note} /> Manifest <span className="font-mono text-xs">{note.manifestSha256}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ReleaseChanges note={note} />
            <div className="flex flex-col gap-2">
              <h3 className="font-medium">Affected runs</h3>
              <p className="text-sm text-muted-foreground">Counts per practice. A practice reads its own runs and their diffs; the console reads none.</p>
              {shownRuns.length === 0 && elsewhere.length === 0 ? (
                <p className="text-sm text-muted-foreground">No practice has a complete run.</p>
              ) : (
                <table className="w-full text-left text-sm" aria-label="Affected runs by practice">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-1 font-medium">Practice</th>
                      <th className="py-1 text-right font-medium">Runs pinned to it (in effect)</th>
                      <th className="py-1 text-right font-medium">Re-runs under it (accepted)</th>
                      <th className="py-1 text-right font-medium">Lines those re-runs changed</th>
                      <th className="py-1 text-right font-medium">Runs in effect on other releases</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...new Set([...shownRuns.map((row) => row.practiceId), ...elsewhere.map((row) => row.practiceId)])].map((practiceId) => {
                      const here = shownRuns.find((row) => row.practiceId === practiceId);
                      const other = elsewhere.find((row) => row.practiceId === practiceId);
                      return (
                        <tr key={practiceId} className="border-t" data-practice={practiceId}>
                          <td className="py-1 pr-3">{here?.name ?? other?.name}</td>
                          <td className="py-1 pr-3 text-right font-mono tabular-nums">
                            {here?.runs ?? 0} ({here?.runsInEffect ?? 0})
                          </td>
                          <td className="py-1 pr-3 text-right font-mono tabular-nums">
                            {here?.reruns ?? 0} ({here?.rerunsAccepted ?? 0})
                          </td>
                          <td className="py-1 pr-3 text-right font-mono tabular-nums">{here?.changedLines ?? 0}</td>
                          <td className="py-1 text-right font-mono tabular-nums">{other?.runsInEffect ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      <Card role="region" aria-label="Content workspace">
        <CardHeader>
          <CardTitle>Drafts and prepared releases</CardTitle>
          <CardDescription>
            {workspace === null
              ? 'This server has no content checkout (CONTENT_ROOT). Prepare and check releases with pnpm release:assemble and pnpm verify-content in one, as the load-release skill says.'
              : 'From the content checkout this server works in. Only drafts verified to L2 or higher enter a release.'}
          </CardDescription>
        </CardHeader>
        {workspace === null ? null : (
          <CardContent className="flex flex-col gap-4">
            {workspace.drafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No drafts in content/drafts.</p>
            ) : (
              <table className="w-full text-left text-sm" aria-label="Drafts">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">Draft file</th>
                    <th className="py-1 font-medium">Record types</th>
                    <th className="py-1 text-right font-medium">Records</th>
                    <th className="py-1 text-right font-medium">L1</th>
                    <th className="py-1 text-right font-medium">L2</th>
                    <th className="py-1 text-right font-medium">L3</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.drafts.map((draft) => (
                    <tr key={draft.file} className="border-t" data-draft={draft.file}>
                      <td className="py-1 pr-3 font-mono text-xs">{draft.file}</td>
                      <td className="py-1 pr-3 font-mono text-xs">{draft.recordTypes.join(', ')}</td>
                      <td className="py-1 pr-3 text-right font-mono tabular-nums">{draft.records}</td>
                      <td className="py-1 pr-3 text-right font-mono tabular-nums">{draft.levels.L1}</td>
                      <td className="py-1 pr-3 text-right font-mono tabular-nums">{draft.levels.L2}</td>
                      <td className="py-1 text-right font-mono tabular-nums">{draft.levels.L3}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="flex flex-col gap-2">
              <h3 className="font-medium">The content checker</h3>
              {check === null ? (
                <Link className="text-sm underline" href={`/console/rule-releases?check=1${note === null ? '' : `&release=${String(note.releaseNo)}`}`}>
                  Run pnpm verify-content over the drafts and every prepared and published release
                </Link>
              ) : (
                <div className="flex flex-col gap-1 text-sm" data-state={check.ok ? 'check-passed' : 'check-failed'}>
                  <p>{check.ok ? 'Every content set passes.' : `${String(check.problems.length)} problem(s); a release with a failed check cannot publish.`}</p>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-3 text-xs">{[check.message, ...check.problems].join('\n')}</pre>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="font-medium">Prepared releases (content/outgoing)</h3>
              {workspace.prepared.length === 0 ? (
                <p className="text-sm text-muted-foreground">None prepared.</p>
              ) : (
                <ul className="flex flex-col gap-2" aria-label="Prepared releases">
                  {workspace.prepared.map((release) => (
                    <li key={release.release} className="rounded-md border p-3 text-sm" data-prepared={release.release}>
                      <p>
                        Release {release.release}: {release.records} records, manifest <span className="font-mono text-xs">{release.manifestSha256.slice(0, 12)}…</span>
                        {release.problems.length === 0 ? '' : `; ${String(release.problems.length)} problem(s)`}
                      </p>
                      <details>
                        <summary className="cursor-pointer underline">RELEASE.md</summary>
                        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-3 text-xs">{release.notes}</pre>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {nextRelease === null ? null : (
              <ActionForm action={prepareRuleReleaseFormAction} submit={`Prepare release ${String(nextRelease)}`} variant="outline" className="flex flex-col gap-2">
                <FormKeys />
                <p className="text-sm text-muted-foreground">
                  Copies the drafts at L2 or higher into content/outgoing/{nextRelease} with RELEASE.md and MANIFEST.json, refused when the drafts fail the checker. Drafts below L2 stay where they are.
                </p>
              </ActionForm>
            )}
          </CardContent>
        )}
      </Card>
    </AppShell>
  );
}
