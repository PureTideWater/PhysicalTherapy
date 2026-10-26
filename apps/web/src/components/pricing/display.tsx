import type { DiffRun, FailureCode, RerunReason, RunCoverage } from '@tp/worker/pricing';
import { Alert, AlertDescription, AlertTitle, Badge, EmptyState } from '@tp/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { unpricedReasonText } from '../../lib/contracts/remedies';
import type { NewerReason, RerunAcceptance, RerunAcceptanceView, RunNames, RunStatus, RunSummary } from '../../lib/pricing/queries';
import { shareOf } from '../../lib/pricing/view';
import { utcSeconds } from '../format';
import { Money } from '../remittances/display';

/**
 * Display pieces of the Pricing runs screens (PRD 7): a run's state, its coverage as shares worked out
 * in integers, its variance by payer pattern, and why a new run would price differently. Dollar
 * figures carry their label: underpaid lines are validated discrepancies, never "recovered". Why a
 * re-run can no longer be accepted, or a run is not re-run, is said in the same words on every screen
 * that offers either (combined audit #10; docs/adr/0037, amendment of 2026-10-26), each run named by a
 * link that reads alone (WCAG 2.4.4).
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
} satisfies Readonly<Record<FailureCode, string>>;

export const RERUN_TEXT: Readonly<Record<RerunReason, string>> = {
  mapping_changed: 'a plan’s mapping changed',
  release_published: 'a newer rule release is in force',
  release_withdrawn: 'its rule release was withdrawn',
  version_signed_off: 'a contract version was signed off',
};

/**
 * Where a complete run stands (docs/adr/0037): in effect for its period, a re-run waiting for a person to
 * accept it, one that can no longer be accepted (something in effect for overlapping service dates is
 * newer, or its rule release was withdrawn), one waiting while a first run of those dates is being priced, a
 * run another one took over from, and whether its rule release was withdrawn (flagged, never changed). "Not in
 * effect" keeps its data-state of superseded, which predates the re-run states; those have names of their own.
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
      ) : run.acceptance === 'superseded' || run.acceptance === 'release_withdrawn' ? (
        <Badge variant="secondary" data-state={run.acceptance === 'superseded' ? 'rerun-superseded' : 'rerun-withdrawn'}>
          Can no longer be accepted
        </Badge>
      ) : run.acceptance === 'newer_run_pending' ? (
        <Badge variant="secondary" data-state="rerun-waiting">
          Re-run waiting for a newer run
        </Badge>
      ) : run.acceptance === 'awaiting' ? (
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

const UNACCEPTED_TEXT: Readonly<Record<RerunAcceptance, string>> = {
  release_withdrawn: 'can no longer be accepted, its rule release withdrawn',
  superseded: 'can no longer be accepted',
  newer_run_pending: 'waiting for a newer run to finish',
  awaiting: 'awaiting acceptance',
};

/** A complete re-run nobody accepted, as a list of a run's re-runs states it: awaiting acceptance, or why not. */
export function unacceptedRerunText(run: RunSummary): string {
  return UNACCEPTED_TEXT[run.acceptance ?? 'awaiting'];
}

/**
 * A run's name as a link's text, which tells it from every other run of the same service dates: "Pricing run,
 * 2026-02-01 to 2026-02-28, rule release 900004, priced 2026-10-26 02:09:41 UTC" (a run not yet complete is named by
 * when it was created; the release left out where the wording names only the dates).
 */
export function runName(run: Pick<RunSummary, 'periodFrom' | 'periodTo' | 'releaseNo' | 'completedAt' | 'createdAt'>, withRelease = true): string {
  const when = run.completedAt === null ? `created ${utcSeconds(run.createdAt)}` : `priced ${utcSeconds(run.completedAt)}`;
  return `Pricing run, ${run.periodFrom} to ${run.periodTo}${withRelease ? `, rule release ${String(run.releaseNo)}` : ''}, ${when}`;
}

/** runName of a run as the diff reads it (DiffRun: complete, its times as dates). */
export function diffRunName(run: DiffRun): string {
  const at = run.completedAt.toISOString();
  return runName({ periodFrom: run.periodFrom, periodTo: run.periodTo, releaseNo: run.releaseNo, completedAt: at, createdAt: at });
}

/** A link to a run's page, its text the run's name (or the words given), so it reads alone. */
export function RunLink({ practiceId, run, withRelease = true, children }: { readonly practiceId: string; readonly run: RunSummary; readonly withRelease?: boolean; readonly children?: ReactNode }) {
  return (
    <Link className="underline" href={`/p/${practiceId}/pricing-runs/${run.id}`} data-run-link={run.id}>
      {children ?? runName(run, withRelease)}
    </Link>
  );
}

/** Runs as links joined in prose: "A", "A and B", "A, B and C". */
function RunLinks({ practiceId, runs, withRelease = true }: { readonly practiceId: string; readonly runs: readonly RunSummary[]; readonly withRelease?: boolean }) {
  return (
    <>
      {runs.map((run, index) => (
        <span key={run.id}>
          {index === 0 ? '' : index === runs.length - 1 ? ' and ' : ', '}
          <RunLink practiceId={practiceId} run={run} withRelease={withRelease} />
        </span>
      ))}
    </>
  );
}

/** The words for runs of these service dates queued or being priced: "waiting to be priced", "being priced", or both. */
function pendingWords(runs: readonly RunSummary[]): string {
  return runs.every((run) => run.status === 'queued') ? 'waiting to be priced' : runs.every((run) => run.status === 'running') ? 'being priced' : 'waiting to be priced or being priced';
}

/**
 * The first runs of overlapping dates queued or being priced, in place of a Re-run button (the re-run would be
 * refused, newer_run_pending): "A newer run of these service dates is being priced: [run]. Once it finishes, re-run
 * the run in effect for these service dates." Which run that is then depends on the pending run's dates (a run of
 * the same dates takes effect in this one's place; one of other dates leaves it in effect), so the step names the
 * run in effect, never this run. A note, not an alert: it is on the page from the start (a refused Re-run form that
 * refreshes into it hands it the focus; RefusalTakeover).
 */
export function PendingRunsAlert({ practiceId, runs }: { readonly practiceId: string; readonly runs: readonly RunSummary[] }) {
  return (
    <Alert role="status" data-state="rerun-pending">
      <AlertDescription>
        <p>
          {runs.length === 1 ? `A newer run of these service dates is ${pendingWords(runs)}: ` : `Newer runs of these service dates are ${pendingWords(runs)}: `}
          <RunLinks practiceId={practiceId} runs={runs} />. {runs.length === 1 ? 'Once it finishes' : 'Once they finish'}, re-run the run in effect for these service dates.
        </p>
      </AlertDescription>
    </Alert>
  );
}

/**
 * A re-run that can be accepted while first runs of overlapping dates are still queued: acceptance does not wait for
 * them, and each takes effect after it once priced, so the person knows before accepting (UX review of PR #50, UX-7).
 */
export function QueuedRunsNote({ practiceId, runs }: { readonly practiceId: string; readonly runs: readonly RunSummary[] }) {
  return (
    <p className="text-sm" data-state="rerun-queued">
      {runs.length === 1 ? 'A newer run of these service dates is waiting to be priced: ' : 'Newer runs of these service dates are waiting to be priced: '}
      <RunLinks practiceId={practiceId} runs={runs} />. This re-run can be accepted now, and {runs.length === 1 ? 'that run takes' : 'those runs take'} effect after it once priced.
    </p>
  );
}

/**
 * Why a complete run is not offered a Re-run button: only the run in effect for its service dates is priced again
 * (not_in_effect), named here. A note, not an alert, as PendingRunsAlert is.
 */
export function NotInEffectAlert({ practiceId, inEffect }: { readonly practiceId: string; readonly inEffect: RunSummary | null }) {
  return (
    <Alert role="status" data-state="rerun-not-in-effect">
      <AlertDescription>
        <p>
          {inEffect === null ? (
            'Only the run in effect for these service dates is priced again.'
          ) : (
            <>
              Only the run in effect for these service dates is priced again: <RunLink practiceId={practiceId} run={inEffect} />.
            </>
          )}
        </p>
      </AlertDescription>
    </Alert>
  );
}

type Blocked = Exclude<RerunAcceptanceView, { state: 'acceptable' }>;
type Superseded = Extract<RerunAcceptanceView, { state: 'superseded' }>;

/**
 * The run the same-period wording names: the run in effect for the re-run's dates when it is one of the runs that
 * supersede it (the one to re-run), otherwise the newest of them.
 */
export function newerRunOf(acceptance: Superseded): RunSummary | undefined {
  return acceptance.superseding.find((run) => run.id === acceptance.inEffect?.id) ?? acceptance.superseding[0];
}

/**
 * Whether a same-period superseded re-run has nothing more to offer (payment-engine review of PR #50, F5): the newer
 * run was priced after it (so it holds no newer pricing of its own on any input) and would price nothing differently
 * now (no newer mapping, contract version or release: RunSummary.rerun). Superseded by the cut-off, a release or a
 * split alone, the re-run may have read newer settings than the newer run, so re-running that run is offered.
 */
export function nothingMoreToAccept(acceptance: Superseded): boolean {
  const newer = newerRunOf(acceptance);
  return acceptance.kind === 'same_period' && newer !== undefined && newer.id === acceptance.inEffect?.id && acceptance.newerBy[newer.id] === 'priced_after' && newer.rerun.length === 0;
}

/** Why the named run is newer than the re-run, after "... took effect after the run this re-run prices again" (same service dates). */
const SAME_PERIOD_WHY: Readonly<Record<NewerReason, (newer: RunSummary) => string>> = {
  priced_after: () => ', and it was priced after this re-run',
  later_release: (newer) => `, and it is pinned to rule release ${String(newer.releaseNo)}, later than this re-run’s`,
  later_split: () => ', and it is pinned to a place-of-service split approved after this re-run’s',
  later_lines: () => ', and it takes in lines loaded later than this re-run does',
};

function samePeriodWhy(reason: NewerReason | null | undefined, newer: RunSummary): string {
  return reason === null || reason === undefined ? '' : SAME_PERIOD_WHY[reason](newer);
}

/** Why a run of other service dates is newer than the re-run, as a list item or a sentence's predicate (its cut-off counts only for the same dates). */
const OTHER_PERIOD_WHY: Readonly<Record<Exclude<NewerReason, 'later_lines'>, (run: RunSummary) => string>> = {
  priced_after: () => 'was priced after this re-run',
  later_release: (run) => `is pinned to rule release ${String(run.releaseNo)}, later than this re-run’s`,
  later_split: () => 'is pinned to a place-of-service split approved after this re-run’s',
};

function otherPeriodWhy(reason: NewerReason | null | undefined, run: RunSummary): string {
  return reason === null || reason === undefined || reason === 'later_lines' ? 'holds newer pricing than this re-run' : OTHER_PERIOD_WHY[reason](run);
}

/** The title of the explanation for a re-run that cannot be accepted, by its state and kind. */
export function rerunBlockedTitle(acceptance: Blocked): string {
  if (acceptance.state === 'newer_run_pending') {
    return 'A newer run of these service dates is being priced';
  }
  if (acceptance.kind === 'same_period') {
    return 'A newer run of these service dates is in effect';
  }
  if (acceptance.kind === 'original_not_in_effect') {
    return 'This re-run prices a run that was never in effect';
  }
  const one = acceptance.superseding.length === 1;
  return acceptance.superseding.every((run) => acceptance.newerBy[run.id] === 'priced_after')
    ? one
      ? 'A run of some of these service dates was priced after this re-run'
      : 'Runs of some of these service dates were priced after this re-run'
    : one
      ? 'A run of some of these service dates holds newer pricing than this re-run'
      : 'Runs of some of these service dates hold newer pricing than this re-run';
}

/**
 * The body of the explanation, the same on the re-run's page and on the comparison (the design's wording, §8.2,
 * with the fix round's: each says which condition holds, and names runs by links that tell them apart).
 * `original` is how the run the re-run prices again is named: "the run this re-run prices again" on its page, "the
 * first run" on the comparison that shows it as such.
 */
export function RerunBlockedBody({ practiceId, acceptance, original = 'the run this re-run prices again' }: { readonly practiceId: string; readonly acceptance: Blocked; readonly original?: string }) {
  if (acceptance.state === 'newer_run_pending') {
    const one = acceptance.running.length === 1;
    return (
      <p>
        <RunLinks practiceId={practiceId} runs={acceptance.running} withRelease={false} /> {one ? 'is' : 'are'} being priced. Wait until {one ? 'it finishes' : 'they finish'}: once{' '}
        {one ? 'it completes' : 'they complete'}, re-run the run in effect for these service dates; if {one ? 'it fails' : 'they fail'}, this re-run can still be accepted.
      </p>
    );
  }
  if (acceptance.kind === 'same_period') {
    const newer = newerRunOf(acceptance);
    if (newer === undefined) {
      return <p>A newer run of these service dates took effect after {original}. Accepting this re-run would replace newer pricing, so it can no longer be accepted.</p>;
    }
    const why = samePeriodWhy(acceptance.newerBy[newer.id], newer);
    const inEffect = acceptance.inEffect;
    return nothingMoreToAccept(acceptance) ? (
      <p data-state="nothing-more">
        <RunLink practiceId={practiceId} run={newer} /> took effect after {original}
        {why}. It already prices these lines under rule release {newer.releaseNo} and the mappings and contract versions in force now. There is nothing more to accept.
      </p>
    ) : (
      <p data-state="rerun-that-run">
        <RunLink practiceId={practiceId} run={newer} /> took effect after {original}
        {why}. Accepting this re-run would replace newer pricing, so it can no longer be accepted.
        {inEffect === null ? null : inEffect.id === newer.id ? (
          ' Re-run that run, the run in effect for these service dates, to price its lines under what is in force now.'
        ) : (
          <>
            {' '}
            Re-run <RunLink practiceId={practiceId} run={inEffect} />, the run in effect for these service dates, to price its lines under what is in force now.
          </>
        )}
      </p>
    );
  }
  if (acceptance.kind === 'other_period') {
    // The run in effect for the re-run's dates: its original, unless a later run of those dates took effect (createRerun re-runs only it).
    const earlier = acceptance.inEffect;
    const one = acceptance.superseding.length === 1;
    const again =
      earlier === null ? null : (
        <>
          {' '}
          Re-run <RunLink practiceId={practiceId} run={earlier} />, the run in effect for these service dates, again: the new re-run is priced after {one ? 'that run' : 'those runs'}, and can
          then be accepted.
        </>
      );
    const [first] = acceptance.superseding;
    return one && first !== undefined ? (
      <p>
        <RunLink practiceId={practiceId} run={first} /> {otherPeriodWhy(acceptance.newerBy[first.id], first)}, so accepting this re-run would put older pricing back on the lines both runs
        price. This re-run can no longer be accepted.{again}
      </p>
    ) : (
      <>
        <p>These runs of some of the same service dates hold newer pricing than this re-run:</p>
        <ul className="list-disc pl-5">
          {acceptance.superseding.map((run) => (
            <li key={run.id}>
              <RunLink practiceId={practiceId} run={run} />, which {otherPeriodWhy(acceptance.newerBy[run.id], run)}
            </li>
          ))}
        </ul>
        <p>Accepting this re-run would put older pricing back on the lines it shares with them. This re-run can no longer be accepted.{again}</p>
      </>
    );
  }
  return (
    <p>
      {original.charAt(0).toUpperCase() + original.slice(1)} was never accepted, so this re-run’s changes are not listed against the pricing it would replace. This re-run can no longer be
      accepted.
      {acceptance.inEffect === null ? null : (
        <>
          {' '}
          Re-run <RunLink practiceId={practiceId} run={acceptance.inEffect} />, the run in effect for these service dates, instead.
        </>
      )}
    </p>
  );
}

/**
 * Why a re-run cannot be accepted, in place of its Accept button: superseded (by a newer run of its service dates,
 * by a run of other dates holding newer pricing, or because the run it prices again was never in effect) or waiting
 * for a first run being priced. Not destructive (nothing is wrong with the re-run itself), and not an alert: it is on
 * the page from the start, and a refused Accept form that refreshes into it hands it the focus (RefusalTakeover).
 */
export function RerunBlockedAlert({ practiceId, acceptance }: { readonly practiceId: string; readonly acceptance: Blocked }) {
  return (
    <Alert role="status" data-state={acceptance.state === 'superseded' ? 'rerun-superseded' : 'rerun-waiting'} data-kind={acceptance.state === 'superseded' ? acceptance.kind : undefined}>
      <AlertTitle>{rerunBlockedTitle(acceptance)}</AlertTitle>
      <AlertDescription className="flex flex-col gap-1">
        <RerunBlockedBody practiceId={practiceId} acceptance={acceptance} />
      </AlertDescription>
    </Alert>
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
