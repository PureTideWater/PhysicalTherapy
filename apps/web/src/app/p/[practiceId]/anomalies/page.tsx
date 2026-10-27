import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../components/action-form';
import { utc } from '../../../../components/format';
import { Money, Pager } from '../../../../components/remittances/display';
import { ScrollTable } from '../../../../components/scroll-table';
import { AppShell, Forbidden } from '../../../../components/shell';
import { Investigatory, lineName } from '../../../../components/triage/display';
import { loadPage } from '../../../../lib/http/next';
import { anomaliesPage } from '../../../../lib/routes/triage';
import { requestValidationFormAction, reviewAnomalyFormAction } from './actions';
import { FormKeys } from '../../../../components/form-keys';

export const metadata: Metadata = { title: 'Anomalies' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The Anomalies screen (PRD 7: "cohorts with counts, dollars, modal and observed amounts;
 * investigatory label; open a cohort; mark reviewed; convert to a validation request; hidden for
 * cohorts under the minimum size"; PRD 12, Anomaly screening). An anomaly compares lines that could
 * not be priced with their cohort; it is a count and a range, never a claim, never in a case or a
 * report total. The only way forward is validation: obtain the agreement, map the plan, and price.
 */
export default async function AnomaliesPage(props: Props) {
  const page = await loadPage(anomaliesPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="anomalies" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, anomalies, open, minimumCohort, thresholdCents, canWork, canReadPhi, filters, runs, payers, total } = page.data;
  const path = `/p/${practiceId}/anomalies`;
  return (
    <AppShell shell={page.shell} section="anomalies">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-[2rem] font-bold leading-display tracking-display">
          Anomalies <Investigatory />
        </h1>
        <p className="text-base text-muted-foreground">
          Lines a pricing run could not price, each compared with its cohort: the same payer and plan, code and modifiers, place of service and quarter, at least {minimumCohort} lines. A line counts when it was paid short of
          the cohort’s mode by more than <Money value={thresholdCents} />. Cohorts under the minimum are not shown.
        </p>
      </div>
      {open === null ? null : (
        <Card role="region" aria-label="Cohort" data-anomaly={open.anomaly.id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {open.anomaly.payer}, {open.anomaly.plan}: {[open.anomaly.procedureCode, ...open.anomaly.modifiers].join(' ')} in {open.anomaly.quarter} <Investigatory />
            </CardTitle>
            <CardDescription>
              {open.anomaly.cohortSize} lines at place of service {open.anomaly.placeOfService ?? '—'}, from the run of {open.anomaly.periodFrom} to {open.anomaly.periodTo}. Mode per unit <Money value={open.anomaly.modalAllowedCents} />{' '}
              ({open.anomaly.stats.modal_lines} lines); per unit the lowest is <Money value={open.anomaly.stats.min_cents} />, the quartiles <Money value={open.anomaly.stats.p25_cents} />,{' '}
              <Money value={open.anomaly.stats.median_cents} /> and <Money value={open.anomaly.stats.p75_cents} />, the highest <Money value={open.anomaly.stats.max_cents} />. {open.anomaly.stats.flagged_lines} lines short of
              the mode by more than the threshold, <Money value={open.anomaly.stats.range_low_cents} /> to <Money value={open.anomaly.stats.range_high_cents} /> in all: investigatory.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ScrollTable label="Flagged lines">
              <table className="w-full min-w-[48rem] text-sm" aria-label="Flagged lines">
                <thead>
                  <tr className="border-b text-left">
                    {canReadPhi ? <th className="px-2 py-1 font-medium">Payer claim control number</th> : null}
                    <th className="px-2 py-1 font-medium">{canReadPhi ? 'Service date' : 'Line'}</th>
                    <th className="px-2 py-1 font-medium">Code</th>
                    <th className="px-2 py-1 font-medium">Units</th>
                    <th className="px-2 py-1 font-medium">Observed allowed</th>
                    <th className="px-2 py-1 font-medium">Mode for the units</th>
                    <th className="px-2 py-1 font-medium">Short of the mode</th>
                  </tr>
                </thead>
                <tbody>
                  {open.lines.map((line, index) => (
                    <tr key={line.serviceLineId} className="border-b last:border-0">
                      {canReadPhi ? <td className="px-2 py-1 wrap-anywhere">{line.payerClaimControlNumber}</td> : null}
                      <td className="px-2 py-1">
                        <Link className="underline" href={`/p/${practiceId}/lines/${line.serviceLineId}`}>
                          {line.serviceDate ?? lineName(index + 1, open.lines.length)}
                        </Link>
                      </td>
                      <td className="px-2 py-1 font-mono">{[line.procedureCode, ...line.modifiers].join(' ')}</td>
                      <td className="px-2 py-1 font-mono tabular-nums">{line.units}</td>
                      <td className="px-2 py-1">
                        <Money value={line.observedAllowedCents} />
                      </td>
                      <td className="px-2 py-1">
                        <Money value={line.modalForUnitsCents} />
                      </td>
                      <td className="px-2 py-1">
                        <Money value={line.shortCents} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
            <div className="flex flex-col gap-2 text-sm">
              <p data-state={open.anomaly.reviewedAt === null ? 'unreviewed' : 'reviewed'}>
                {open.anomaly.reviewedAt === null ? 'Not reviewed yet.' : `Reviewed ${utc(open.anomaly.reviewedAt)} by ${open.anomaly.reviewedBy ?? '—'}.`}{' '}
                {open.anomaly.validationRequestedAt === null ? '' : `Converted to a validation request ${utc(open.anomaly.validationRequestedAt)} by ${open.anomaly.validationRequestedBy ?? '—'}.`}
              </p>
              {canWork ? (
                <div className="flex flex-wrap gap-3">
                  {open.anomaly.reviewedAt === null ? (
                    <ActionForm action={reviewAnomalyFormAction} submit="Mark reviewed" variant="outline">
                      <FormKeys />
                      <input type="hidden" name="practiceId" value={practiceId} />
                      <input type="hidden" name="anomalyId" value={open.anomaly.id} />
                    </ActionForm>
                  ) : null}
                  {open.anomaly.validationRequestedAt === null ? (
                    <ActionForm action={requestValidationFormAction} submit="Convert to a validation request">
                      <FormKeys />
                      <input type="hidden" name="practiceId" value={practiceId} />
                      <input type="hidden" name="anomalyId" value={open.anomaly.id} />
                    </ActionForm>
                  ) : null}
                </div>
              ) : (
                <p className="text-muted-foreground">Anomalies are worked by the billing manager and the firm principal.</p>
              )}
              <p className="text-muted-foreground">
                Validating means obtaining the payer’s agreement or schedule, mapping the plan to it, and pricing the period again; the lines then become validated discrepancies or not.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      <section aria-label="Cohorts" className="flex flex-col gap-3">
        <h2 className="text-xl font-bold tracking-display">Cohorts</h2>
        <form method="get" action={path} className="flex flex-wrap items-end gap-3 text-sm" aria-label="Filter the cohorts">
          <div className="flex flex-col gap-1">
            <Label htmlFor="anomalies-run">Pricing run</Label>
            <select id="anomalies-run" name="run" defaultValue={filters.run ?? ''} className="h-9 rounded-md border bg-background px-2">
              <option value="">Every run</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.periodFrom} to {run.periodTo}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="anomalies-payer">Payer</Label>
            <select id="anomalies-payer" name="payer" defaultValue={filters.payer ?? ''} className="h-9 rounded-md border bg-background px-2">
              <option value="">Every payer</option>
              {payers.map((payer) => (
                <option key={payer.id} value={payer.id}>
                  {payer.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="h-9 rounded-md border px-3">
            Filter
          </button>
        </form>
        {anomalies.length === 0 && filters.run === undefined && filters.payer === undefined ? (
          <EmptyState title="No anomaly" nextStep="Triage a complete pricing run from the Cases screen; cohorts of unpriced lines at or above the minimum size with lines paid short of their mode appear here." />
        ) : anomalies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cohort matches these filters.</p>
        ) : (
          <ScrollTable label="Anomaly cohorts">
            <table className="w-full min-w-[54rem] text-sm" aria-label="Anomaly cohorts">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-1 font-medium">Label</th>
                  <th className="px-2 py-1 font-medium">Payer and plan</th>
                  <th className="px-2 py-1 font-medium">Code</th>
                  <th className="px-2 py-1 font-medium">Quarter</th>
                  <th className="px-2 py-1 font-medium">Cohort</th>
                  <th className="px-2 py-1 font-medium">Mode per unit</th>
                  <th className="px-2 py-1 font-medium">Flagged lines</th>
                  <th className="px-2 py-1 font-medium">Range</th>
                  <th className="px-2 py-1 font-medium">Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((anomaly) => (
                  <tr key={anomaly.id} className="border-b last:border-0" data-anomaly={anomaly.id}>
                    <td className="px-2 py-1">investigatory</td>
                    <td className="px-2 py-1">
                      <Link className="underline" href={`${path}?anomaly=${anomaly.id}`}>
                        {anomaly.payer}, {anomaly.plan}
                      </Link>
                    </td>
                    <td className="px-2 py-1 font-mono">{[anomaly.procedureCode, ...anomaly.modifiers].join(' ')}</td>
                    <td className="px-2 py-1">{anomaly.quarter}</td>
                    <td className="px-2 py-1 font-mono tabular-nums">{anomaly.cohortSize}</td>
                    <td className="px-2 py-1">
                      <Money value={anomaly.modalAllowedCents} />
                    </td>
                    <td className="px-2 py-1 font-mono tabular-nums">{anomaly.stats.flagged_lines}</td>
                    <td className="px-2 py-1">
                      <Money value={anomaly.stats.range_low_cents} /> to <Money value={anomaly.stats.range_high_cents} />
                    </td>
                    <td className="px-2 py-1">{anomaly.reviewedAt === null ? 'No' : 'Yes'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        )}
        <Pager path={path} query={filters} page={page.data.page} pages={page.data.pages} total={total} noun="Cohorts" />
      </section>
    </AppShell>
  );
}
