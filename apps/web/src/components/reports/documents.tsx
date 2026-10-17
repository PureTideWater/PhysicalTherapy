import { type CoverageReportContent, type MonthlySummaryContent, SUMMARY_BUCKET_LABELS, type SummaryBucketCode, shareText } from '@tp/worker/reports';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import Link from 'next/link';

import { REMEDY_SCREEN_NAMES, remedyPath, unpricedReasonText } from '../../lib/contracts/remedies';
import { type StageCode, monthLinesHref, stageDollarsHref, stageLinesHref } from '../../lib/reports/links';
import { Money } from '../remittances/display';

/**
 * A coverage report's and a monthly summary's stored figures on screen (PRD 7, Reports: "every total
 * links to its stage"; PRD 12: headline totals never mix stages; docs/adr/0045): the same figures the
 * PDF and the CSV were made from, each linked to the screen it comes from. Recovered and payer approved
 * are counts of lines here; their dollars are the recovery ledger's, one link away.
 */

const STAGES: readonly StageCode[] = ['flagged', 'validated', 'actionable', 'payer_approved', 'recovered'];
const OTHERS: readonly SummaryBucketCode[] = ['priced', 'overpaid', 'unpriced', 'not_priced'];

export function DocumentStatusBadge({ status }: { readonly status: 'queued' | 'ready' | 'failed' }) {
  return (
    <Badge variant={status === 'ready' ? 'default' : status === 'failed' ? 'destructive' : 'secondary'} data-document-status={status}>
      {status === 'ready' ? 'Printed' : status === 'failed' ? 'Print failed' : 'Being printed'}
    </Badge>
  );
}

export function documentTitle(kind: 'coverage' | 'monthly_summary', period: string | null, generatedOn: string): string {
  return kind === 'coverage' ? `Coverage report, ${generatedOn}` : `Monthly variance summary, ${period ?? ''}`;
}

export function CoverageFigures({ practiceId, content }: { readonly practiceId: string; readonly content: CoverageReportContent }) {
  return (
    <>
      <Card role="region" aria-label="Priced share">
        <CardHeader>
          <CardTitle data-figure="priced-share">
            Priced: {content.priced.lines} of {content.of.lines} lines ({shareText(content.priced.lines, content.of.lines)}); <Money value={content.priced.charge_cents} /> of <Money value={content.of.charge_cents} /> billed (
            {shareText(content.priced.charge_cents, content.of.charge_cents)})
          </CardTitle>
          <CardDescription>
            {content.run === null ? (
              'No pricing run had taken effect when this report was generated, so every line counted as unpriced.'
            ) : (
              <>
                {content.runs_in_effect === undefined || content.runs_in_effect === null ? (
                  'From the pricing run in effect, '
                ) : (
                  <>
                    Each line at its pricing in effect, across <span className="font-mono tabular-nums">{content.runs_in_effect.runs}</span>{' '}
                    {content.runs_in_effect.runs === 1 ? 'pricing run' : 'pricing runs'} in effect (service {content.runs_in_effect.period_from} to {content.runs_in_effect.period_to}); the latest to
                    take effect,{' '}
                  </>
                )}
                <Link className="underline" href={`/p/${practiceId}/pricing-runs/${content.run.id}`}>
                  service {content.run.period_from} to {content.run.period_to}
                </Link>
                , under rule release {content.run.release_no}. The practice held {content.lines.lines} lines, <Money value={content.lines.charge_cents} /> billed.
              </>
            )}{' '}
            {content.readiness.allowed ? 'Every plan with lines had a mapping.' : `${String(content.readiness.unmapped_plans)} plan(s) had no mapping at all: pricing them was refused.`}
          </CardDescription>
        </CardHeader>
      </Card>
      <section aria-label="Unpriced reasons" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-display">Unpriced reasons</h2>
        <table className="w-full text-left text-sm" aria-label="Unpriced reasons and their remedies">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Reason</th>
              <th className="py-1 text-right font-medium">Lines</th>
              <th className="py-1 font-medium">Remedy</th>
            </tr>
          </thead>
          <tbody>
            {content.reasons.map((entry) => {
              const text = unpricedReasonText(entry.reason);
              return (
                <tr key={entry.reason} className="border-t" data-reason={entry.reason}>
                  <td className="py-1 pr-3 font-mono text-xs">{entry.reason}</td>
                  <td className="py-1 pr-3 text-right font-mono tabular-nums">{entry.lines}</td>
                  <td className="py-1">
                    {text.remedy}
                    {text.screen === null ? null : (
                      <>
                        {' '}
                        (
                        <Link className="underline" href={remedyPath(practiceId, text.screen)}>
                          {REMEDY_SCREEN_NAMES[text.screen]}
                        </Link>
                        )
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section aria-label="Dollars waiting on mappings" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-display">
          Dollars waiting on mappings:{' '}
          <Link className="underline" href={`/p/${practiceId}/mapping`} data-figure="waiting">
            <Money value={content.waiting.charge_cents} /> billed
          </Link>
        </h2>
        {content.waiting_plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing was waiting on a mapping.</p>
        ) : (
          <table className="w-full text-left text-sm" aria-label="Plans waiting on mapping">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Payer</th>
                <th className="py-1 font-medium">Plan</th>
                <th className="py-1 text-right font-medium">Lines</th>
                <th className="py-1 text-right font-medium">Billed</th>
              </tr>
            </thead>
            <tbody>
              {content.waiting_plans.map((plan) => (
                <tr key={plan.plan_id} className="border-t">
                  <td className="py-1 pr-3">{plan.payer_name}</td>
                  <td className="py-1 pr-3">
                    <Link className="underline" href={`/p/${practiceId}/mapping/${plan.plan_id}`}>
                      {plan.plan_key}
                    </Link>
                  </td>
                  <td className="py-1 pr-3 text-right font-mono tabular-nums">{plan.lines}</td>
                  <td className="py-1 text-right">
                    <Money value={plan.charge_cents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function StageDollars({ practiceId, stage, cents }: { readonly practiceId: string; readonly stage: StageCode; readonly cents: string | null }) {
  if (stage === 'flagged') {
    return <span className="text-muted-foreground">a count, never a dollar claim</span>;
  }
  if (stage === 'payer_approved' || stage === 'recovered') {
    return (
      <Link className="underline" href={stageDollarsHref(practiceId, stage)}>
        the ledger’s
      </Link>
    );
  }
  return cents === null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <Link className="underline" href={stageDollarsHref(practiceId, stage)}>
      <Money value={cents} />
    </Link>
  );
}

export function MonthlyFigures({ practiceId, content }: { readonly practiceId: string; readonly content: Pick<MonthlySummaryContent, 'month' | 'total' | 'by_payer' | 'approved_alone'> }) {
  return (
    <>
      <Card role="region" aria-label="By stage">
        <CardHeader>
          <CardTitle>By stage</CardTitle>
          <CardDescription>Each line of the month once, at the furthest stage it has reached; variance is expected allowed less observed allowed on the priced line the stage names. Every figure links to the lines or the cases it counts.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-left text-sm" aria-label="Lines by stage">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Stage</th>
                <th className="py-1 font-medium">Lines</th>
                <th className="py-1 font-medium">Billed</th>
                <th className="py-1 font-medium">Dollars</th>
              </tr>
            </thead>
            <tbody>
              {STAGES.map((stage) => (
                <tr key={stage} className="border-t" data-stage={stage}>
                  <td className="py-1">{SUMMARY_BUCKET_LABELS[stage]}</td>
                  <td className="py-1 font-mono tabular-nums">
                    <Link className="underline" href={stageLinesHref(practiceId, stage, content.month)}>
                      {content.total.figures[stage].lines}
                    </Link>
                  </td>
                  <td className="py-1">
                    <Money value={content.total.figures[stage].billed_cents} />
                  </td>
                  <td className="py-1">
                    <StageDollars practiceId={practiceId} stage={stage} cents={content.total.figures[stage].variance_cents} />
                  </td>
                </tr>
              ))}
              <tr className="border-t text-muted-foreground" data-stage="actionable_written_off">
                <td className="py-1">Written off from a case (not in the actionable total)</td>
                <td className="py-1 font-mono tabular-nums">{content.total.written_off.lines}</td>
                <td className="py-1">
                  <Money value={content.total.written_off.billed_cents} />
                </td>
                <td className="py-1">
                  <Money value={content.total.written_off.variance_cents} />
                </td>
              </tr>
              {OTHERS.map((bucket) => (
                <tr key={bucket} className="border-t text-muted-foreground" data-stage={bucket}>
                  <td className="py-1">{SUMMARY_BUCKET_LABELS[bucket]}</td>
                  <td className="py-1 font-mono tabular-nums">
                    <Link className="underline" href={monthLinesHref(practiceId, content.month)}>
                      {content.total.figures[bucket].lines}
                    </Link>
                  </td>
                  <td className="py-1">
                    <Money value={content.total.figures[bucket].billed_cents} />
                  </td>
                  <td className="py-1">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card role="region" aria-label="By payer">
        <CardHeader>
          <CardTitle>By payer</CardTitle>
          <CardDescription>Lines at each stage, each stage on its own; dollars where the stage carries them here.</CardDescription>
        </CardHeader>
        <CardContent>
          {content.by_payer.length === 0 ? (
            <p className="text-sm text-muted-foreground">No line has a service date in {content.month}.</p>
          ) : (
            <table className="w-full text-left text-sm" aria-label="Stages by payer">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Payer</th>
                  {STAGES.map((stage) => (
                    <th key={stage} className="py-1 font-medium">
                      {SUMMARY_BUCKET_LABELS[stage]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {content.by_payer.map((row) => (
                  <tr key={row.payer_id ?? 'none'} className="border-t" data-payer={row.payer_id ?? ''}>
                    <td className="py-1">{row.payer_name ?? 'Unnamed payer'}</td>
                    {STAGES.map((stage) => (
                      <td key={stage} className="py-1">
                        {row.figures[stage].lines} {row.figures[stage].lines === 1 ? 'line' : 'lines'}
                        {(stage === 'validated' || stage === 'actionable') && row.figures[stage].variance_cents !== null ? (
                          <>
                            , <Money value={row.figures[stage].variance_cents} />
                          </>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      {content.approved_alone === undefined ? null : (
        <Card role="region" aria-label="Packets approved alone">
          <CardHeader>
            <CardTitle>Packets approved alone</CardTitle>
            <CardDescription>
              With no second person to approve its packets, the writer of a version approved it alone at least 24 hours after writing it. Each carries the audit flag (the single-user gap).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {content.approved_alone.length === 0 ? (
              <p className="text-sm text-muted-foreground">No packet of the practice was approved by its own writer.</p>
            ) : (
              <table className="w-full text-left text-sm" aria-label="Packets approved by their own writer">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">Case</th>
                    <th className="py-1 font-medium">Packet version</th>
                    <th className="py-1 font-medium">Approved on</th>
                    <th className="py-1 font-medium">Hours after it was written</th>
                  </tr>
                </thead>
                <tbody>
                  {content.approved_alone.map((row) => (
                    <tr key={row.packet_version_id} className="border-t" data-approved-alone={row.packet_version_id}>
                      <td className="py-1">
                        <Link className="underline" href={`/p/${practiceId}/cases/${row.case_id}/packet`}>
                          Case packet
                        </Link>
                      </td>
                      <td className="py-1 font-mono text-xs">{row.packet_version_id}</td>
                      <td className="py-1">{row.approved_on}</td>
                      <td className="py-1 font-mono tabular-nums">{row.hours_waited}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
