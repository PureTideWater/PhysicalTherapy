import type { FailureCode, RerunReason, RunCoverage } from '@tp/worker/pricing';
import { Badge, EmptyState } from '@tp/ui';
import Link from 'next/link';

import { unpricedReasonText } from '../../lib/contracts/remedies';
import type { RunNames, RunStatus, RunSummary } from '../../lib/pricing/queries';
import { shareOf } from '../../lib/pricing/view';
import { Money } from '../remittances/display';

/**
 * Display pieces of the Pricing runs screens (PRD 7): a run's state, its coverage as shares worked out
 * in integers, its variance by payer pattern, and why a new run would price differently. Dollar
 * figures carry their label: underpaid lines are validated discrepancies, never "recovered".
 */

const STATUS_TEXT: Readonly<Record<RunStatus, string>> = {
  queued: 'Queued',
  running: 'Pricing',
  complete: 'Complete',
  failed: 'Failed',
};

export function RunStatusBadge({ status }: { readonly status: RunStatus }) {
  return (
    <Badge variant={status === 'failed' ? 'destructive' : status === 'complete' ? 'default' : 'secondary'} data-status={status}>
      {STATUS_TEXT[status]}
    </Badge>
  );
}

/** Why a run failed, in words, from its fixed code (every FailureCode the price job records). */
export const FAILURE_TEXT: Readonly<Record<string, string>> = {
  engine_version_mismatch: 'The run was created for another version of the pricing engine; create a new run.',
  unmapped_plan: 'A plan of the period’s lines has no mapping: map it, then create a new run.',
  job_failed: 'The price job failed three times and the operator was alerted; create a new run once it is fixed.',
  // Audit #33 (docs/adr/0064): a line needed the location, so no line was kept and the month waits for it.
  location_not_ready: 'A line of the period needs the practice’s billing ZIP or ZIP+4: fix it in Pricing settings. Waiting months are priced by themselves once it is set.',
  // Audit #7 (docs/adr/0071): a line read the MPPR or the MUE on a date its release does not load them for, so no line
  // was kept and the month waits for that content; the code names the families exactly.
  waiting_on_content_mue: 'A line of the period needs Medicare’s unit limits (MUE) for dates PaidWhole has not loaded yet, so no line was kept. The month is priced by itself once that content is loaded.',
  waiting_on_content_mppr:
    'A line of the period needs Medicare’s multiple-procedure reduction list (MPPR) for dates PaidWhole has not loaded yet, so no line was kept. The month is priced by itself once that content is loaded.',
  waiting_on_content_mppr_mue:
    'Lines of the period need Medicare’s multiple-procedure reduction list (MPPR) and unit limits (MUE) for dates PaidWhole has not loaded yet, so no line was kept. The month is priced by itself once that content is loaded.',
  // Audit #31: the price job looked up a key outside the ones it fetched for its batch, which is PaidWhole's defect.
  release_read_outside_fetch: 'The price job read rule content it had not fetched, so no line was kept and the operator was alerted; create a new run once it is fixed.',
} satisfies Readonly<Record<FailureCode, string>>;

export const RERUN_TEXT: Readonly<Record<RerunReason, string>> = {
  mapping_changed: 'a plan’s mapping changed',
  release_published: 'a newer rule release is in force',
  release_withdrawn: 'its rule release was withdrawn',
  version_signed_off: 'a contract version was signed off',
};

/**
 * Where a complete run stands (docs/adr/0037): in effect for its period, a re-run waiting for a person to
 * accept it, a run another one took over from, and whether its rule release was withdrawn (flagged, never
 * changed).
 */
export function RunStateBadges({ run }: { readonly run: RunSummary }) {
  if (run.status !== 'complete') {
    return null;
  }
  return (
    <>
      {run.inEffect ? (
        <Badge variant="outline" data-state="in-effect">
          In effect
        </Badge>
      ) : run.rerunOfId !== null && run.acceptedAt === null ? (
        <Badge variant="secondary" data-state="awaiting-acceptance">
          Re-run awaiting acceptance
        </Badge>
      ) : (
        <Badge variant="secondary" data-state="superseded">
          Not in effect
        </Badge>
      )}
      {run.withdrawal === null ? null : (
        <Badge variant="destructive" data-state="release-withdrawn">
          Release {run.releaseNo} withdrawn
        </Badge>
      )}
    </>
  );
}

/** Priced lines and billed dollars as a share of the run's. */
export function CoverageShares({ coverage }: { readonly coverage: RunCoverage }) {
  return (
    <span>
      {coverage.priced.lines} of {coverage.lines} lines priced ({shareOf(coverage.priced.lines, coverage.lines)}); <Money value={coverage.priced.charge_cents} /> of <Money value={coverage.charge_cents} /> billed (
      {shareOf(coverage.priced.charge_cents, coverage.charge_cents)})
    </span>
  );
}

/**
 * The run's unpriced lines by reason, each with its remedy and billed dollars (PRD 7, Pricing runs: "the unpriced
 * reasons by count"), then its engine errors by detail. A run that left no line unpriced says so as an empty state,
 * never as a table's header over no rows (the screen tour's C3).
 */
export function UnpricedReasons({ coverage }: { readonly coverage: RunCoverage }) {
  const reasons = coverage.reasons.filter((entry) => entry.lines > 0);
  if (reasons.length === 0) {
    return <EmptyState title="No line of this run is unpriced" nextStep="Nothing to obtain for this run. Coverage shows what the practice’s other lines wait on, and the lines below open each trace." />;
  }
  return (
    <>
      <table className="w-full text-left text-sm" aria-label="Unpriced reasons">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-medium">Reason</th>
            <th className="py-1 pr-3 font-medium">Remedy</th>
            <th className="py-1 pr-3 text-right font-medium">Lines</th>
            <th className="py-1 text-right font-medium">Billed</th>
          </tr>
        </thead>
        <tbody>
          {reasons.map((entry) => (
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
          Engine errors by detail: {coverage.engine_errors.map((entry) => `${entry.detail} (${String(entry.lines)}${entry.pages_operator ? ', operator alerted' : ', for review'})`).join('; ')}.
        </p>
      )}
    </>
  );
}

const KIND_TEXT: Readonly<Record<string, string>> = {
  contract: 'Contract',
  ma_noncontracted: 'Medicare Advantage, non-contracted',
};

/** The run's variance by payer pattern: payer and plan, how it was priced, and the shortfall and overpayment. */
export function PatternTable({ practiceId, coverage, names, limit }: { readonly practiceId: string; readonly coverage: RunCoverage; readonly names: RunNames; readonly limit?: number }) {
  const patterns = limit === undefined ? coverage.patterns : coverage.patterns.slice(0, limit);
  if (patterns.length === 0) {
    return <p className="text-sm text-muted-foreground">No line of this run was priced, so there is no variance to show.</p>;
  }
  return (
    <table className="w-full text-left text-sm" aria-label="Variance by payer pattern">
      <thead className="text-muted-foreground">
        <tr>
          <th className="py-1 pr-3 font-medium">Payer and plan</th>
          <th className="py-1 pr-3 font-medium">Priced under</th>
          <th className="py-1 pr-3 text-right font-medium">Lines</th>
          <th className="py-1 pr-3 text-right font-medium">Underpaid lines</th>
          <th className="py-1 pr-3 text-right font-medium">Underpaid (validated)</th>
          <th className="py-1 text-right font-medium">Overpaid (recorded)</th>
        </tr>
      </thead>
      <tbody>
        {patterns.map((pattern) => {
          const version = pattern.contract_version_id === null ? undefined : names.versions[pattern.contract_version_id];
          return (
            <tr key={`${pattern.plan_id}:${pattern.mapping_kind}:${pattern.contract_version_id ?? ''}:${pattern.rate_record_id ?? ''}`} className="border-t align-top" data-plan={pattern.plan_id}>
              <td className="py-1 pr-3">
                {names.payers[pattern.payer_id] ?? 'Payer'}
                <div className="font-mono text-xs">
                  <Link className="underline" href={`/p/${practiceId}/mapping/${pattern.plan_id}`}>
                    {names.plans[pattern.plan_id] ?? pattern.plan_id}
                  </Link>
                </div>
              </td>
              <td className="py-1 pr-3">
                {version === undefined ? (
                  (KIND_TEXT[pattern.mapping_kind] ?? pattern.mapping_kind)
                ) : (
                  <Link className="underline" href={`/p/${practiceId}/contracts/versions/${pattern.contract_version_id ?? ''}`}>
                    {version.title}, version {version.versionNo}
                  </Link>
                )}
                {pattern.rate_record_id === null ? null : <div className="font-mono text-xs text-muted-foreground">rate record {pattern.rate_record_id}</div>}
              </td>
              <td className="py-1 pr-3 text-right font-mono tabular-nums">{pattern.lines}</td>
              <td className="py-1 pr-3 text-right font-mono tabular-nums">{pattern.underpaid_lines}</td>
              <td className="py-1 pr-3 text-right">
                <Money value={pattern.underpaid_cents} />
              </td>
              <td className="py-1 text-right">
                <Money value={pattern.overpaid_cents} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
