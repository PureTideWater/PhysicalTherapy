import { loadAgreementRecords } from '@tp/contracts';
import { type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import type { IndexedRelease } from '@tp/pricing';

import { lineResolver, priceClaims, runAsOf } from './execute';
import { FIRST_CLAIM, type RunScope, claimPage } from './lines';
import { loadRuleRelease } from './release';
import { practiceSettings } from './settings';
import type { PricedLineInsert } from './store';

/**
 * What a rule release would change in a complete run, worked out in memory and written nowhere (PRD 9,
 * The release pipeline step 3 and the load-release skill: "run pnpm release:dry-run <next> against the
 * staging snapshot and paste the list of runs whose lines change"; step 5: customers see "which of
 * their runs would change"; docs/adr/0037). The run's lines (its period, up to its cut-off) are priced
 * twice by this engine with the practice's agreements and settings as they are now and the run's
 * triage date: once under the run's own release and once under the other; a line would change when
 * its expected allowed, unpriced reason or adjustments differ, the same test as a re-run's diff. So the
 * count is the release's own effect, whatever else changed since the run (a mapping, a sign-off),
 * which a re-run's diff shows with its causes. Claims are audited reads (purpose release_impact).
 */

export interface ImpactRun {
  readonly id: string;
  readonly practiceId: string;
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly releaseNo: number;
  readonly createdAt: Date;
  /** The run's cut-off, as text to the microsecond (its creation, or for a re-run the original's). */
  readonly cutOff: string;
}

export interface RunImpact {
  readonly pricingRunId: string;
  readonly practiceId: string;
  readonly releaseNo: number;
  /** The lines priced in memory. */
  readonly lines: number;
  /** Of those, the ones the other release prices differently. */
  readonly changedLines: number;
}

export interface ImpactOptions {
  readonly claimsPerBatch?: number;
  /** The audit purpose of the claim reads. */
  readonly purpose?: string;
}

const CLAIMS_PER_BATCH = 500;

/** Whether two rows of one line differ in what a diff compares: expected allowed, reason, adjustments. */
export function linePricesDiffer(first: PricedLineInsert, second: PricedLineInsert): boolean {
  return first.expectedAllowedCents !== second.expectedAllowedCents || first.unpricedReason !== second.unpricedReason || first.adjustmentsApplied !== second.adjustmentsApplied;
}

/** The practice's complete runs, newest first, each an audited read. */
export async function completeRuns(scope: PracticeScope<ScopeClient>, practiceId: string, requestId: string, purpose = 'release_impact'): Promise<ImpactRun[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'pricing_run', purpose, requestId },
    async (client) =>
      (
        await client.query<{ id: string; practice_id: string; period_from: string; period_to: string; release_no: number; created_at: Date; cut_off: string }>(
          `SELECT id, practice_id, period_from::text AS period_from, period_to::text AS period_to, release_no, created_at,
                  coalesce(lines_loaded_by, created_at)::text AS cut_off
             FROM pricing_run WHERE practice_id = $1 AND status = 'complete' ORDER BY completed_at DESC, id`,
          [practiceId],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  return rows.map((row) => ({ id: row.id, practiceId: row.practice_id, periodFrom: row.period_from, periodTo: row.period_to, releaseNo: row.release_no, createdAt: row.created_at, cutOff: row.cut_off }));
}

/** The run's lines priced under its own release and under `release`, and how many differ. */
export async function runReleaseImpact(scope: PracticeScope<ScopeClient>, run: ImpactRun, release: IndexedRelease, requestId: string, options: ImpactOptions = {}): Promise<RunImpact> {
  const purpose = options.purpose ?? 'release_impact';
  const own = run.releaseNo === release.releaseNo ? release : await loadRuleRelease(scope.client, run.releaseNo);
  const records = await loadAgreementRecords(scope, { practiceId: run.practiceId, requestId, purpose });
  const settings = await practiceSettings(scope.client, run.practiceId);
  const resolve = lineResolver(records);
  const asOf = runAsOf(run.createdAt);
  const lines: RunScope = { practiceId: run.practiceId, periodFrom: run.periodFrom, periodTo: run.periodTo, loadedBy: run.cutOff };
  let priced = 0;
  let changed = 0;
  let after = FIRST_CLAIM;
  for (;;) {
    const claims = await claimPage(scope, lines, after, options.claimsPerBatch ?? CLAIMS_PER_BATCH, requestId, purpose);
    const last = claims.at(-1);
    if (last === undefined) {
      break;
    }
    const first = priceClaims(claims, resolve, own, settings, asOf);
    const second = own === release ? first : priceClaims(claims, resolve, release, settings, asOf);
    priced += first.length;
    changed += first.filter((row, index) => linePricesDiffer(row, second[index] as PricedLineInsert)).length;
    after = last.claimId;
  }
  return { pricingRunId: run.id, practiceId: run.practiceId, releaseNo: run.releaseNo, lines: priced, changedLines: changed };
}
