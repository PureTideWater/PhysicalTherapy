import { type AuditReportContent, reasonText } from '@tp/worker/reports';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import type { ReportStatus, ReportSummary } from '../../lib/reports/queries';
import { Money } from '../remittances/display';
import { Investigatory } from '../triage/display';

/**
 * Display pieces of the Reports screens (PRD 7, Reports: "every total links to its stage"; PRD 12,
 * What a customer sees as the headline: three numbers, actionable, payer approved and recovered, with
 * flagged and validated below and never added in). Every figure is one the report job stored; each
 * total links to the section and the screen of its stage. Anomalies are investigatory and in no total.
 */

const STATUS_TEXT: Readonly<Record<ReportStatus, string>> = { queued: 'Generating', ready: 'Ready', failed: 'Failed' };

export function ReportStatusBadge({ status }: { readonly status: ReportStatus }) {
  return (
    <Badge variant={status === 'failed' ? 'destructive' : status === 'ready' ? 'default' : 'secondary'} data-status={status}>
      {STATUS_TEXT[status]}
    </Badge>
  );
}

/** Where a report stands on its way out: unsigned, signed by the reviewer, released. */
export function ReleaseState({ report }: { readonly report: Pick<ReportSummary, 'status' | 'attestedAt' | 'releasedAt'> }) {
  if (report.status !== 'ready') {
    return null;
  }
  if (report.releasedAt !== null) {
    return (
      <Badge variant="default" data-release="released">
        Released
      </Badge>
    );
  }
  return report.attestedAt === null ? (
    <Badge variant="outline" data-release="unsigned">
      Awaiting the reviewer’s attestation; not released
    </Badge>
  ) : (
    <Badge variant="secondary" data-release="attested">
      Attested; not yet released
    </Badge>
  );
}

const count = (value: number, noun: string) => `${String(value)} ${noun}${value === 1 ? '' : 's'}`;

/** The headline: three numbers, then flagged and validated below, each linked to its stage. */
export function Headline({ headline, practiceId, base }: { readonly headline: AuditReportContent['headline']; readonly practiceId: string; readonly base: string }) {
  const figures = [
    { label: headline.labels.actionable, amount: headline.actionable_cents, note: `${count(headline.actionable_lines, 'line')} in open cases`, href: `${base}#stage-actionable` },
    { label: headline.labels.payer_approved, amount: headline.payer_approved_cents, note: 'no payer response is recorded yet', href: `${base}#stage-payer-approved` },
    { label: headline.labels.recovered, amount: headline.recovered_cents, note: 'cash posted and reconciled, net of recoupments', href: `${base}#stage-recovered` },
  ];
  return (
    <section aria-label="Headline" className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {figures.map((figure) => (
          <a key={figure.label} href={figure.href} className="rounded-lg border p-4 hover:bg-accent" data-figure={figure.label}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{figure.label}</div>
            <div className="text-2xl font-semibold">
              <Money value={figure.amount} />
            </div>
            <div className="text-xs text-muted-foreground">{figure.note}</div>
          </a>
        ))}
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        <li>
          <a className="underline" href={`${base}#stage-flagged`}>
            {headline.labels.flagged}
          </a>
          : {count(headline.flagged_lines, 'line')}, <Money value={headline.flagged_range_low_cents} /> to <Money value={headline.flagged_range_high_cents} />; investigatory, never a claim and in no
          total (
          <Link className="underline" href={`/p/${practiceId}/anomalies`}>
            Anomalies
          </Link>
          ).
        </li>
        <li>
          <a className="underline" href={`${base}#stage-validated`}>
            {headline.labels.validated}
          </a>
          : <Money value={headline.validated_cents} /> across {count(headline.validated_lines, 'line')}; priced under signed-off terms and paid below them, before the actionable checks.
        </li>
      </ul>
    </section>
  );
}

/** A stored report's table; `figures` names its columns (0-based) of codes, counts and amounts, set in the mono face with tabular numerals. */
function Table({ caption, headers, rows, empty, figures = [] }: { readonly caption: string; readonly headers: readonly string[]; readonly rows: readonly (readonly ReactNode[])[]; readonly empty: string; readonly figures?: readonly number[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b text-left">
            {headers.map((header) => (
              <th key={header} scope="col" className="px-2 py-1 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            // The rows are a stored report's, in its order; nothing reorders them, so the index is their key.
            <tr key={index} className="border-b last:border-0">
              {row.map((cell, column) => (
                <td key={column} className={figures.includes(column) ? 'px-2 py-1 align-top font-mono tabular-nums' : 'px-2 py-1 align-top'}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The report's sections, kept apart: coverage, anomalies, validated discrepancies, actionable cases, evidence gaps. */
export function ReportSections({ content, practiceId }: { readonly content: AuditReportContent; readonly practiceId: string }) {
  const money = (value: string | null) => (value === null ? 'not estimated' : <Money value={value} />);
  return (
    <div className="flex flex-col gap-4">
      <Card role="region" aria-label="Coverage">
        <CardHeader>
          <CardTitle>Coverage</CardTitle>
          <CardDescription>
            {content.coverage.priced_lines} of {content.coverage.lines} lines priced (<Money value={content.coverage.priced_charge_cents} /> of <Money value={content.coverage.charge_cents} /> billed), under rule
            release {content.run.release_no}, for service from {content.run.period_from} to {content.run.period_to}; windows judged on {content.as_of}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table
            caption="Unpriced lines by reason"
            headers={['Reason', 'Lines', 'Billed', 'Remedy']}
            figures={[0, 1]}
            rows={content.coverage.reasons.map((reason) => [reason.reason, String(reason.lines), <Money key="billed" value={reason.charge_cents} />, reason.remedy])}
            empty="Every line priced."
          />
        </CardContent>
      </Card>
      <Card role="region" aria-label="Anomalies" id="stage-flagged">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Anomalies <Investigatory />
          </CardTitle>
          <CardDescription>
            Lines that could not be priced, compared with their cohort (same payer and plan, code and modifiers, place of service and quarter, at least {content.settings.anomaly_minimum_cohort} lines). A count and a range,
            never a claim, and in no total.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table
            caption="Anomaly cohorts"
            headers={['Label', 'Payer', 'Plan', 'Code', 'Quarter', 'Cohort', 'Mode per unit', 'Flagged', 'Range']}
            figures={[3, 4, 5, 7]}
            rows={content.anomalies.map((anomaly) => [
              anomaly.label,
              anomaly.payer,
              anomaly.plan,
              [anomaly.procedure_code, ...anomaly.modifiers].join(' '),
              anomaly.quarter,
              String(anomaly.cohort_size),
              <Money key="mode" value={anomaly.modal_allowed_cents} />,
              String(anomaly.flagged_lines),
              <span key="range">
                <Money value={anomaly.range_low_cents} /> to <Money value={anomaly.range_high_cents} />
              </span>,
            ])}
            empty="No cohort reaches the minimum size, or none has lines paid short of its mode."
          />
        </CardContent>
      </Card>
      <Card role="region" aria-label="Validated discrepancies" id="stage-validated">
        <CardHeader>
          <CardTitle>Validated discrepancies</CardTitle>
          <CardDescription>
            <Money value={content.validated.variance_cents} /> across {count(content.validated.lines, 'line')} priced under signed-off terms and paid below them, by payer pattern. Overpayments: {count(content.overpaid.lines, 'line')},{' '}
            <Money value={content.overpaid.variance_cents} />; recorded and shown, never pursued.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Table
            caption="Validated discrepancies by payer pattern"
            headers={['Payer', 'Plan', 'Pattern', 'Lines', 'Variance']}
            figures={[3]}
            rows={content.validated.patterns.map((pattern) => [pattern.payer, pattern.plan, pattern.behavior_text, String(pattern.lines), <Money key="variance" value={pattern.variance_cents} />])}
            empty="No line was paid below its contract."
          />
          <Table
            caption="Validated but not actionable"
            headers={['Why not actionable', 'Lines', 'Variance']}
            figures={[1]}
            rows={content.validated.not_actionable.map((item) => [reasonText(item.reason), String(item.lines), <Money key="variance" value={item.variance_cents} />])}
            empty="Every validated line is actionable."
          />
        </CardContent>
      </Card>
      <Card role="region" aria-label="Actionable cases" id="stage-actionable">
        <CardHeader>
          <CardTitle>Actionable cases</CardTitle>
          <CardDescription>
            One case per payer pattern at or above the case materiality; each total is the sum of its lines not written off. A pattern accumulates across runs, so a case may hold lines other runs
            priced: the report counts this run’s lines, with the whole case beside them. Pursuit cost:{' '}
            {content.pursuit.estimated ? (
              <>
                {money(content.pursuit.cost_cents)}; net expected value {money(content.pursuit.net_expected_cents)}.
              </>
            ) : (
              'not estimated (the practice has not set its staff rate and minutes).'
            )}{' '}
            <Link className="underline" href={`/p/${practiceId}/cases`}>
              Cases
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table
            caption="Cases"
            headers={['Payer', 'Plan', 'Pattern', 'State', 'Lines (this run)', 'Actionable (this run)', 'Deadline (this run)', 'Whole case', 'Pursuit cost', 'Net expected']}
            figures={[4, 6]}
            rows={content.cases.map((item) => [
              item.payer,
              item.plan,
              item.behavior_text,
              item.state,
              `${String(item.actionable_lines)} of ${String(item.lines)}`,
              <Money key="actionable" value={item.actionable_cents} />,
              item.deadline_on ?? '—',
              <span key="case">
                {count(item.case_lines, 'line')}, <Money value={item.case_actionable_cents} />
              </span>,
              money(item.pursuit_cost_cents),
              money(item.net_expected_cents),
            ])}
            empty="No pattern reaches the case materiality yet."
          />
        </CardContent>
      </Card>
      <Card role="region" aria-label="Payer approved and recovered">
        <CardHeader>
          <CardTitle id="stage-payer-approved">Payer approved and recovered</CardTitle>
          <CardDescription id="stage-recovered">
            Both come from the recovery ledger: payer approved once a payer accepts a submitted case, recovered only once cash is posted and reconciled. Neither has an entry yet.
          </CardDescription>
        </CardHeader>
      </Card>
      <Card role="region" aria-label="Evidence gaps">
        <CardHeader>
          <CardTitle>Evidence gaps</CardTitle>
          <CardDescription>What to obtain to price more lines or to pursue them.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table
            caption="Evidence gaps"
            headers={['Gap', 'Lines', 'Billed', 'Detail', 'Remedy']}
            figures={[1]}
            rows={content.evidence_gaps.map((gap) => [gap.reason ?? gap.kind, String(gap.lines), gap.charge_cents === null ? '—' : <Money key="billed" value={gap.charge_cents} />, gap.detail, gap.remedy])}
            empty="No evidence gap."
          />
        </CardContent>
      </Card>
    </div>
  );
}
