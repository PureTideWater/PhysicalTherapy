import { randomUUID } from 'node:crypto';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../components/action-form';
import { Money } from '../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../components/shell';
import { CaseStateBadge, Deadline, stageLabel } from '../../../../components/triage/display';
import { loadPage } from '../../../../lib/http/next';
import { casesPage } from '../../../../lib/routes/triage';
import { triageRunFormAction } from './actions';

export const metadata: Metadata = { title: 'Cases' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The Cases screen, v0 report-only (PRD 7, Cases: "list by stage, payer, owner, deadline, actionable
 * total"; PRD 12; milestone 6: "case grouping (report-only)"): one case per payer pattern, opened by
 * triage once the pattern's actionable lines reach the case materiality; its total is the sum of its
 * lines not written off and its deadline the earliest open window among them. Triaging a run is the
 * roles' that work cases; assignment, packets and submissions are the workbench's (milestone 8).
 */
export default async function CasesPage(props: Props) {
  const page = await loadPage(casesPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="cases" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, cases, actionableCents, runs, canTriage, asOf } = page.data;
  const open = cases.filter((item) => item.state === 'open');
  return (
    <AppShell shell={page.shell} section="cases">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Cases</h1>
        <p className="text-sm text-muted-foreground">
          {stageLabel('actionable')}: <Money value={actionableCents} /> across {open.length} open {open.length === 1 ? 'case' : 'cases'}, as of {asOf}. Each total is the sum of its lines not written off; a line past its window is
          struck through and out of it.
        </p>
      </div>
      {canTriage ? (
        <Card role="region" aria-label="Triage a run">
          <CardHeader>
            <CardTitle>Triage a run</CardTitle>
            <CardDescription>
              Screens the run’s unpriced lines for anomalies, judges its priced lines on today’s date (materiality, window, claim and version), and opens or adds to a case for each payer pattern at or above the case materiality.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No complete pricing run yet.</p>
            ) : (
              <ActionForm action={triageRunFormAction} submit="Triage the run" className="flex max-w-xl flex-col gap-3">
                <input type="hidden" name="requestKey" value={randomUUID()} />
                <input type="hidden" name="practiceId" value={practiceId} />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="triage-run">Pricing run</Label>
                  <select id="triage-run" name="runId" className="h-9 rounded-md border bg-background px-2 text-sm" required>
                    {runs.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.periodFrom} to {run.periodTo} (release {run.releaseNo})
                      </option>
                    ))}
                  </select>
                </div>
              </ActionForm>
            )}
          </CardContent>
        </Card>
      ) : null}
      <section aria-label="Case list" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">By deadline</h2>
        {cases.length === 0 ? (
          <EmptyState title="No case yet" nextStep="Triage a complete pricing run: a payer pattern whose actionable lines reach the case materiality opens a case." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Cases">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-1 font-medium">Payer and plan</th>
                  <th className="px-2 py-1 font-medium">Pattern</th>
                  <th className="px-2 py-1 font-medium">State</th>
                  <th className="px-2 py-1 font-medium">Lines</th>
                  <th className="px-2 py-1 font-medium">Actionable total</th>
                  <th className="px-2 py-1 font-medium">Deadline</th>
                  <th className="px-2 py-1 font-medium">Pursuit cost</th>
                  <th className="px-2 py-1 font-medium">Owner</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((item) => (
                  <tr key={item.id} className="border-b last:border-0" data-case={item.id} data-state={item.state}>
                    <td className="px-2 py-1">
                      <Link className="underline" href={`/p/${practiceId}/cases/${item.id}`}>
                        {item.payer}, {item.plan}
                      </Link>
                    </td>
                    <td className="px-2 py-1">{item.behaviorText}</td>
                    <td className="px-2 py-1">
                      <CaseStateBadge state={item.state} />
                    </td>
                    <td className="px-2 py-1 tabular-nums">
                      {item.openLines} of {item.lines}
                    </td>
                    <td className="px-2 py-1">
                      <Money value={item.actionableCents} />
                    </td>
                    <td className="px-2 py-1">
                      <Deadline on={item.deadlineOn} state={item.deadline} />
                    </td>
                    <td className="px-2 py-1">{item.pursuitCostCents === null ? 'not estimated' : <Money value={item.pursuitCostCents} />}</td>
                    <td className="px-2 py-1">{item.owner ?? 'Unassigned'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
