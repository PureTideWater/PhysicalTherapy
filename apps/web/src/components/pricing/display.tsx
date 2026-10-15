import type { RerunReason, RunCoverage } from '@tp/worker/pricing';
import { Badge } from '@tp/ui';
import Link from 'next/link';

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

/** Why a run failed, in words, from its fixed code. */
export const FAILURE_TEXT: Readonly<Record<string, string>> = {
  engine_version_mismatch: 'The run was created for another version of the pricing engine; create a new run.',
  unmapped_plan: 'A plan of the period’s lines has no mapping: map it, then create a new run.',
  job_failed: 'The price job failed three times and the operator was alerted; create a new run once it is fixed.',
};

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
          <th className="py-1 font-medium">Payer and plan</th>
          <th className="py-1 font-medium">Priced under</th>
          <th className="py-1 text-right font-medium">Lines</th>
          <th className="py-1 text-right font-medium">Underpaid lines</th>
          <th className="py-1 text-right font-medium">Underpaid (validated)</th>
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
              <td className="py-1 pr-3 text-right tabular-nums">{pattern.lines}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{pattern.underpaid_lines}</td>
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
