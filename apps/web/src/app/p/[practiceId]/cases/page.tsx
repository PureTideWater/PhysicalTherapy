import { centsToString } from '@tp/money';
import { CASE_STATES, DEFAULT_TRIAGE_SETTINGS } from '@tp/triage';
import { Alert, AlertDescription, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../components/action-form';
import { SelectField } from '../../../../components/field';
import { MoneyField } from '../../../../components/money-field';
import { Money, Pager } from '../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../components/shell';
import { CASE_STATE_TEXT, CaseStateBadge, Deadline, stageLabel } from '../../../../components/triage/display';
import { loadPage } from '../../../../lib/http/next';
import { dollarsForInput } from '../../../../lib/money-input';
import { casesPage } from '../../../../lib/routes/triage';
import { MATERIALITY_CONSEQUENCE } from '../../../../lib/routes/workbench';
import { openCaseFormAction, setMaterialityFormAction, triageRunFormAction } from './actions';
import { FormKeys } from '../../../../components/form-keys';
import { ReferenceSearch } from '../../../../components/packets/reference-search';

export const metadata: Metadata = { title: 'Cases' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

const WAITING_TEXT = {
  ready: 'Reaches the case materiality: open its case now',
  held: 'Below the case materiality: its lines accumulate',
  joins_open_case: 'Joins its open case at the next triage',
} as const;

/**
 * The Cases screen (PRD 7, Cases: "list by stage, payer, owner, deadline, actionable total"; "create
 * from a pattern; assign; set materiality"; "deadline colors"; PRD 5, J8; PRD 12): one case per payer
 * pattern, its total the sum of its lines not written off and its deadline the earliest open window
 * among them, filtered in the URL by state, payer, owner and deadline. The roles that work cases triage
 * a run, open a case on a waiting pattern that reaches the case materiality, and set the practice's
 * materiality thresholds; the case's own page assigns it, keeps its notes and opens its packet.
 */
export default async function CasesPage(props: Props) {
  const page = await loadPage(casesPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="cases" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, cases, actionableCents, openCases, runs, canTriage, asOf, filters, payers, workers, total, waiting, deadlineUnverified, materiality, notice } = page.data;
  const path = `/p/${practiceId}/cases`;
  const filtered = filters.state !== undefined || filters.payer !== undefined || filters.owner !== undefined || filters.deadline !== undefined;
  return (
    <AppShell shell={page.shell} section="cases">
      <div className="flex flex-col gap-1">
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Cases</h1>
        <p className="text-base text-muted-foreground">
          {stageLabel('actionable')}: <Money value={actionableCents} /> across {openCases} {openCases === 1 ? 'case' : 'cases'} still being worked{filtered ? ' the filters admit' : ''}, as of {asOf}. A case’s total is the sum of its lines not written off;
          a line past its window is struck through and out of it. Payer approved and recovered (posted or deposited) amounts come from the recovery ledger, on each case’s page.
        </p>
      </div>
      {notice === 'materiality' ? (
        <Alert data-notice="materiality">
          <AlertDescription>The materiality thresholds are saved. Triage uses them from its next run.</AlertDescription>
        </Alert>
      ) : null}
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
              <p className="text-sm text-muted-foreground">No pricing run in effect yet: a complete run, or a re-run once it is accepted.</p>
            ) : (
              <ActionForm action={triageRunFormAction} submit="Triage the run" className="flex max-w-xl flex-col gap-3">
                <FormKeys />
                <input type="hidden" name="practiceId" value={practiceId} />
                <SelectField id="triage-run" label="Pricing run" name="runId" options={runs.map((run) => ({ value: run.id, label: `${run.periodFrom} to ${run.periodTo} (release ${String(run.releaseNo)})` }))} required />
              </ActionForm>
            )}
          </CardContent>
        </Card>
      ) : null}
      {canTriage ? (
        <Card role="region" aria-label="Patterns waiting for a case">
          <CardHeader>
            <CardTitle>Patterns waiting for a case</CardTitle>
            <CardDescription>
              Validated lines in no case, by payer pattern, judged on today’s date. A pattern whose actionable lines reach the case materiality (<Money value={materiality.caseCents} />) can be opened now, with its owner; a smaller one keeps
              accumulating.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {deadlineUnverified.lines === 0 ? null : (
              <p className="pb-3 text-sm" data-waiting="deadline_unverified">
                {deadlineUnverified.lines} validated {deadlineUnverified.lines === 1 ? 'line waits' : 'lines wait'} for a verified deadline (<Money value={deadlineUnverified.validatedCents} />, DEADLINE_UNVERIFIED): their contract’s dispute window is not
                cited and verified on its page yet, or is counted in business days, in months or from a date other than the payment date, which the product does not compute yet; or
                they are Medicare Advantage non-contracted lines, whose deadline is not verified until the product applies the answer to which dispute route they take (golden
                question Q34, a product-wide question the contract specialist is answering), so no packet of a Medicare Advantage non-contracted line is exported until then. A
                Medicare Advantage plan mapped to a contract is not held: its contract’s window is cited and verified like any other. They join no case until the deadline is verified.
              </p>
            )}
            {waiting.length === 0 ? (
              <p className="text-sm text-muted-foreground">No validated line is waiting for a case. Triage a run to judge its lines.</p>
            ) : (
              <ul className="flex flex-col gap-3" aria-label="Waiting patterns">
                {waiting.map((pattern) => (
                  <li key={JSON.stringify(pattern.key)} className="rounded-md border p-3 text-sm" data-waiting={pattern.status}>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {pattern.payer}, {pattern.plan}
                      </span>
                      <span>{pattern.behaviorText}</span>
                      <Badge variant={pattern.status === 'ready' ? 'default' : 'outline'}>{WAITING_TEXT[pattern.status]}</Badge>
                    </p>
                    <p className="pt-1 text-muted-foreground">
                      {stageLabel('validated')}, to be {stageLabel('actionable').toLowerCase()} in its case: <Money value={pattern.actionableCents} /> on {pattern.actionableLines} {pattern.actionableLines === 1 ? 'line' : 'lines'}
                      {pattern.earliestWindow === null ? '' : `, the earliest window closing ${pattern.earliestWindow}`}
                      {pattern.windowPassedLines === 0 ? '' : `; ${String(pattern.windowPassedLines)} more past their windows (WINDOW_PASSED, out of the total)`}.
                    </p>
                    {pattern.status === 'joins_open_case' && pattern.openCaseId !== null ? (
                      <Link className="underline" href={`${path}/${pattern.openCaseId}`}>
                        Its open case
                      </Link>
                    ) : null}
                    {pattern.status === 'ready' ? (
                      <ActionForm action={openCaseFormAction} submit="Open the case" className="flex flex-wrap items-end gap-3 pt-2">
                        <FormKeys />
                        <input type="hidden" name="practiceId" value={practiceId} />
                        <input type="hidden" name="payerId" value={pattern.key.payerId} />
                        <input type="hidden" name="planId" value={pattern.key.planId} />
                        <input type="hidden" name="mappingKind" value={pattern.key.mappingKind} />
                        <input type="hidden" name="contractVersionId" value={pattern.key.contractVersionId ?? ''} />
                        <input type="hidden" name="rateRecordId" value={pattern.key.rateRecordId ?? ''} />
                        <input type="hidden" name="behavior" value={pattern.key.behavior} />
                        <SelectField
                          id={`owner-${pattern.key.planId}-${pattern.key.behavior}`}
                          label="Owner"
                          name="ownerUserId"
                          defaultValue=""
                          options={[{ value: '', label: 'Unassigned' }, ...workers.map((person) => ({ value: person.userId, label: person.email }))]}
                        />
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
      <Card role="region" aria-label="Materiality">
        <CardHeader>
          <CardTitle>Materiality</CardTitle>
          <CardDescription>
            A validated line is actionable at or above the per-line threshold (<Money value={materiality.lineCents} />); a payer pattern becomes a case at or above the per-case threshold (<Money value={materiality.caseCents} />). The defaults are <Money value={centsToString(DEFAULT_TRIAGE_SETTINGS.lineMaterialityCents)} /> and{' '}
            <Money value={centsToString(DEFAULT_TRIAGE_SETTINGS.caseMaterialityCents)} />.
          </CardDescription>
        </CardHeader>
        {canTriage ? (
          <CardContent>
            <ActionForm action={setMaterialityFormAction} submit="Save the thresholds" className="flex max-w-xl flex-col gap-3">
              <FormKeys />
              <input type="hidden" name="practiceId" value={practiceId} />
              <div className="flex flex-wrap gap-3">
                <MoneyField id="line-materiality" label="Per line" name="lineMateriality" defaultValue={dollarsForInput(materiality.lineCents)} required />
                <MoneyField id="case-materiality" label="Per case" name="caseMateriality" defaultValue={dollarsForInput(materiality.caseCents)} required />
              </div>
              <p className="text-sm text-muted-foreground">{MATERIALITY_CONSEQUENCE}</p>
            </ActionForm>
          </CardContent>
        ) : null}
      </Card>
      <ReferenceSearch practiceId={practiceId} />
      <section aria-label="Case list" className="flex flex-col gap-3">
        <h2 className="text-xl font-bold tracking-display">By deadline</h2>
        <form method="get" action={path} className="flex flex-wrap items-end gap-3 text-sm" aria-label="Filter the cases">
          <div className="flex flex-col gap-1">
            <Label htmlFor="cases-state">State</Label>
            <select id="cases-state" name="state" defaultValue={filters.state ?? ''} className="h-9 rounded-md border bg-background px-2">
              <option value="">Any state</option>
              {CASE_STATES.map((state) => (
                <option key={state} value={state}>
                  {CASE_STATE_TEXT[state]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="cases-payer">Payer</Label>
            <select id="cases-payer" name="payer" defaultValue={filters.payer ?? ''} className="h-9 rounded-md border bg-background px-2">
              <option value="">Every payer</option>
              {payers.map((payer) => (
                <option key={payer.id} value={payer.id}>
                  {payer.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="cases-owner">Owner</Label>
            <select id="cases-owner" name="owner" defaultValue={filters.owner ?? ''} className="h-9 rounded-md border bg-background px-2">
              <option value="">Anyone</option>
              <option value="mine">Mine</option>
              <option value="none">Unassigned</option>
              {workers.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.email}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="cases-deadline">Deadline</Label>
            <select id="cases-deadline" name="deadline" defaultValue={filters.deadline ?? ''} className="h-9 rounded-md border bg-background px-2">
              <option value="">Any deadline</option>
              <option value="14">Within 14 days (or passed)</option>
              <option value="30">Within 30 days (or passed)</option>
              <option value="90">Within 90 days (or passed)</option>
            </select>
          </div>
          <button type="submit" className="h-9 rounded-md border px-3">
            Filter
          </button>
        </form>
        {cases.length === 0 && total === 0 && !filtered ? (
          <EmptyState title="No case yet" nextStep="Triage a complete pricing run: a payer pattern whose actionable lines reach the case materiality opens a case, or opens from the waiting patterns above." />
        ) : cases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No case matches these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Cases">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-1 font-medium">Payer and plan</th>
                  <th className="px-2 py-1 font-medium">Pattern</th>
                  <th className="px-2 py-1 font-medium">State</th>
                  <th className="px-2 py-1 font-medium">Lines</th>
                  <th className="px-2 py-1 font-medium">{stageLabel('actionable')} total</th>
                  <th className="px-2 py-1 font-medium">Deadline</th>
                  <th className="px-2 py-1 font-medium">Pursuit cost</th>
                  <th className="px-2 py-1 font-medium">Owner</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((item) => (
                  <tr key={item.id} className="border-b last:border-0" data-case={item.id} data-state={item.state}>
                    <td className="px-2 py-1">
                      <Link className="underline" href={`${path}/${item.id}`}>
                        {item.payer}, {item.plan}
                      </Link>
                    </td>
                    <td className="px-2 py-1">{item.behaviorText}</td>
                    <td className="px-2 py-1">
                      <CaseStateBadge state={item.state} />
                    </td>
                    <td className="px-2 py-1 font-mono tabular-nums">
                      {item.openLines} of {item.lines}
                    </td>
                    <td className="px-2 py-1">
                      <Money value={item.actionableNowCents} />
                    </td>
                    <td className="px-2 py-1">
                      <Deadline on={item.deadlineOn} state={item.state === 'resolved' || item.state === 'closed_written_off' ? 'none' : item.deadline} />
                    </td>
                    <td className="px-2 py-1">{item.pursuitCostCents === null ? 'not estimated' : <Money value={item.pursuitCostCents} />}</td>
                    <td className="px-2 py-1">{item.owner ?? 'Unassigned'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager path={path} query={filters} page={page.data.page} pages={page.data.pages} total={total} noun="Cases" />
      </section>
    </AppShell>
  );
}
