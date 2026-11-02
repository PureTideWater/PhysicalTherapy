import { type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import {
  CONTENT_FAILURE_CODES,
  type ContentFailureCode,
  ELIGIBLE_RUN,
  MONITOR_MONTHS_LIMIT,
  NEWER_RUN_PENDING,
  PRICEABLE_LINE,
  PRICED_IN_EFFECT,
  RERUN_ACCEPTANCE,
  RUN_IN_EFFECT,
  coversMore,
  termsUnchangedSince,
  uncoveredMonths,
} from '@tp/worker/pricing';

import { monthsWaitingOnContent } from './content';
import { monthsWaitingOnLocation, releaseInForce } from './location';

/**
 * The months a plan's mapping leaves to price (combined audit #32; docs/adr/0075; PRD 5, J6: "a wrong mapping is corrected
 * by a new mapping ... a re-run is offered"; test matrix MAP-06 to MAP-09, PRC-29, PRC-31). A plan with no mapping no
 * longer freezes a month: a run prices every other line and leaves the plan's own lines unpriced (NO_MAPPING where the
 * resolver reaches them). What follows once the plan is mapped is read here, for the mapping screens, Coverage, Pricing
 * runs and the home page:
 *
 * - Months no run covers (monthsAwaitingMappings, design 4.1): for each, how many of its plans have a mapping in force
 *   on its lines' dates and how many have none (decided per line date, as the resolver and the run's own "nothing
 *   mapped" check decide: PR #95 review R3N-1, security F2), its lines with and without one, and whether the monitor holds it without a run on the pricing location (#33, ADR 0064) or on
 *   Medicare content (#49, ADR 0071), read from the screens' own lists of those waits so a month shows in one card
 *   (D18). A mapping that leaves a month complete (every plan mapped, not held) queues monitoring of exactly the
 *   complete months (completeMonths, D2b and D20); a mixed month waits for its other plans or "Price them now".
 * - Months already priced whose pricing in effect leaves lines NO_MAPPING while a mapping is now in force on their date
 *   (MAPPED_NOT_PRICED, design 4.2): one row per run in effect holding them, in one state each (monthsToPriceAgain:
 *   being priced again, a re-run to accept, waiting for a newer first run, a re-run that failed on what has not
 *   changed since, or ready), under #50's rule (createRerun, RERUN_ACCEPTANCE; docs/adr/0037).
 * - Re-runs accepted after a mapping that still wait for a person to triage the lines a mapping brought to pricing
 *   (monthsToTriage, D13: ADR 0038 keeps triage a person's case work).
 * - The practice-wide figure of lines of mapped plans still NO_MAPPING in effect (mappedNotPricedTotals, PRC-31).
 *
 * Every query runs in the request's practice scope under the practice's policies, and is one aggregate statement that
 * returns at most one row per run, per month or of totals, never a line (ADR 0083's bound on what a request holds). The
 * two per-run listings are audited reads of runs (pricing_run, purpose payer_plan_mapping, as every read of the mapping
 * screens); the totals and the months return no run or line ID and are unaudited aggregates, as waitingTotals is.
 * Amounts are integer cents as text (bigint sums in SQL).
 */

type Scope = PracticeScope<ScopeClient>;

/** The most months one press of "Price these months again" prices again, oldest first (D5: five years; the rest is listed after). */
export const PRICE_AGAIN_LIMIT = 60;

/**
 * Takes the practice's months lock for the rest of the transaction (D22, review R3-6): the mapping action and "Price these
 * months again" take it first, before any read, so two people mapping a month's last two plans queue monitoring once,
 * and two presses of one page create one re-run per month (the second waits for the first to commit, then reads its
 * mapping or its re-runs). The codebase's advisory-lock pattern (rerun.ts's pricing_current, the monitor's own); the
 * canonical text of the practice ID, as the other keys hash it.
 */
export async function lockPlanMonths(client: ScopeClient, practiceId: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('plan_months:' || $1::uuid::text, 0))", [practiceId]);
}

// ---------------------------------------------------------------------------------------------------
// Months no run covers
// ---------------------------------------------------------------------------------------------------

/** Why the monitor leaves a month without a run whatever its mappings: the billing ZIP (#33) or Medicare content (#49); null when nothing holds it. */
export type MonthHeld = 'location' | 'content' | null;

export interface MonthAwaitingMappings {
  readonly periodFrom: string;
  readonly periodTo: string;
  /** The plans of the month's lines (a run's own line set, PRICEABLE_LINE), sorted. */
  readonly planIds: readonly string[];
  /**
   * Of them, the plans none of whose lines in the month has a mapping in force on its date, sorted: a plan with no
   * mapping at all, or mapped only for other dates (R3N-1). A plan with a mapping in force on any one of its lines'
   * dates counts as mapped for the month; its other lines are NO_MAPPING one by one (MAP-02).
   */
  readonly unmappedPlanIds: readonly string[];
  readonly unmappedPlans: number;
  readonly mappedPlans: number;
  /** The month's lines (PRICEABLE_LINE) with a mapping of their plan in force on their date (UX-10). */
  readonly mappedLines: number;
  /** Of those, the lines whose mapping in force is one a run prices under (a contract version, or Medicare Advantage non-contracted). */
  readonly linesToPrice: number;
  /** The month's lines with no mapping in force on their date: a run of the month leaves them unpriced, NO_MAPPING where the resolver reaches them. */
  readonly unmappedLines: number;
  /** Billed cents of every line of the month, summed in SQL as bigint; integer text. */
  readonly chargeCents: string;
  readonly held: MonthHeld;
}

/** The mapping kinds a run prices under; no_agreement, government and other resolve NO_AGREEMENT, unpriced (MAP-04). */
const PRICING_KINDS = "('contract', 'ma_noncontracted')";

/**
 * The months no run covers (the monitor's own uncoveredMonths), oldest first, each with its plans mapped and unmapped and
 * whether it is held: on the location when Coverage's location card lists it as zip_missing or location_not_ready, on
 * content when the content card lists it as waiting (a month those cards show as being priced again is not held). None
 * while no release is in force: the monitor prices nothing then. Read inside the mapping's own transaction, it sees the
 * new mapping (a content wait it releases reads terms_changed, not held).
 */
export async function monthsAwaitingMappings(scope: Scope, practiceId: string): Promise<MonthAwaitingMappings[]> {
  const { client } = scope;
  if ((await releaseInForce(client)) === null) {
    return [];
  }
  const months = await uncoveredMonths(client, practiceId);
  if (months.length === 0) {
    return [];
  }
  // Each (plan, date) is looked up once (payer_plan_mapping_in_force, the database's mappingInForce), then every
  // line of the month takes its date's answer: a plan is mapped for the month when any of its lines is (R3N-1).
  const { rows } = await client.query<{
    period_from: string;
    plan_ids: string[];
    unmapped_plan_ids: string[];
    mapped_lines: number;
    lines_to_price: number;
    unmapped_lines: number;
    charge_cents: string;
  }>(
    `WITH dated AS (
       SELECT date_trunc('month', coalesce(l.service_date, c.service_from))::date AS month_start, l.payer_plan_key AS plan_id,
              coalesce(l.service_date, c.service_from) AS service_date, l.charge_cents
         FROM claim c JOIN service_line l ON l.claim_id = c.id
        WHERE c.practice_id = $1 AND ${PRICEABLE_LINE}
          AND date_trunc('month', coalesce(l.service_date, c.service_from))::date = ANY ($2::date[])
     ), in_force AS (
       SELECT k.plan_id, k.service_date, m.mapping_kind
         FROM (SELECT DISTINCT plan_id, service_date FROM dated) k
         LEFT JOIN payer_plan_mapping m ON m.id = payer_plan_mapping_in_force(k.plan_id, k.service_date)
     ), lines AS (
       SELECT d.month_start, d.plan_id, d.charge_cents, f.mapping_kind FROM dated d JOIN in_force f USING (plan_id, service_date)
     ), plans AS (
       SELECT month_start, plan_id, bool_or(mapping_kind IS NOT NULL) AS mapped FROM lines GROUP BY month_start, plan_id
     ), per_month AS (
       SELECT month_start,
              count(*) FILTER (WHERE mapping_kind IS NOT NULL)::int AS mapped_lines,
              count(*) FILTER (WHERE mapping_kind IN ${PRICING_KINDS})::int AS lines_to_price,
              count(*) FILTER (WHERE mapping_kind IS NULL)::int AS unmapped_lines,
              coalesce(sum(charge_cents), 0)::text AS charge_cents
         FROM lines GROUP BY month_start
     )
     SELECT m.month_start::text AS period_from,
            coalesce(array_agg(p.plan_id::text ORDER BY p.plan_id) FILTER (WHERE p.plan_id IS NOT NULL), '{}') AS plan_ids,
            coalesce(array_agg(p.plan_id::text ORDER BY p.plan_id) FILTER (WHERE p.plan_id IS NOT NULL AND NOT p.mapped), '{}') AS unmapped_plan_ids,
            coalesce(min(t.mapped_lines), 0) AS mapped_lines, coalesce(min(t.lines_to_price), 0) AS lines_to_price,
            coalesce(min(t.unmapped_lines), 0) AS unmapped_lines, coalesce(min(t.charge_cents), '0') AS charge_cents
       FROM unnest($2::date[]) AS m (month_start)
       LEFT JOIN plans p ON p.month_start = m.month_start
       LEFT JOIN per_month t ON t.month_start = m.month_start
      GROUP BY m.month_start`,
    [practiceId, months.map((month) => month.periodFrom)],
  );
  const plans = new Map(rows.map((row) => [row.period_from, row]));
  const onLocation = new Set((await monthsWaitingOnLocation(client, practiceId)).filter((month) => month.kind !== 'repricing').map((month) => month.periodFrom));
  const onContent = new Set((await monthsWaitingOnContent(scope, practiceId)).filter((month) => month.kind === 'waiting').map((month) => month.periodFrom));
  return months.map((month) => {
    const row = plans.get(month.periodFrom);
    const planIds = row?.plan_ids ?? [];
    const unmappedPlanIds = row?.unmapped_plan_ids ?? [];
    return {
      periodFrom: month.periodFrom,
      periodTo: month.periodTo,
      planIds,
      unmappedPlanIds,
      unmappedPlans: unmappedPlanIds.length,
      mappedPlans: planIds.length - unmappedPlanIds.length,
      mappedLines: row?.mapped_lines ?? 0,
      linesToPrice: row?.lines_to_price ?? 0,
      unmappedLines: row?.unmapped_lines ?? 0,
      chargeCents: row?.charge_cents ?? '0',
      held: onLocation.has(month.periodFrom) ? 'location' : onContent.has(month.periodFrom) ? 'content' : null,
    };
  });
}

/** A month every plan of whose lines has a mapping in force on some line's date, with a plan at all, that nothing holds: a monitor planning it gives it a first run. */
export function monthComplete(month: MonthAwaitingMappings): boolean {
  return month.held === null && month.unmappedPlans === 0 && month.mappedPlans > 0;
}

/** A month with lines of a mapped plan and of a plan with no mapping, that nothing holds: it waits for its other plans' mappings, or "Price them now". */
export function monthMixed(month: MonthAwaitingMappings): boolean {
  return month.held === null && month.unmappedPlans > 0 && month.mappedPlans > 0;
}

/**
 * The months a mapping's monitoring job names (D20): the first day of every complete month, whichever plans it holds,
 * oldest first, at most MONITOR_MONTHS_LIMIT (the daily monitor plans the rest). Empty when the mapping completes no
 * month holding `planId`'s lines: then nothing is queued (D2b).
 */
export function monthsToQueue(months: readonly MonthAwaitingMappings[], planId: string): string[] {
  const complete = months.filter(monthComplete);
  if (!complete.some((month) => month.planIds.includes(planId))) {
    return [];
  }
  return complete.slice(0, MONITOR_MONTHS_LIMIT).map((month) => month.periodFrom);
}

/** The mixed months, for the practice or for the months holding one plan's lines, and how many other plans they wait for. */
export interface MonthsWaiting {
  readonly months: readonly MonthAwaitingMappings[];
  /** The plans with no mapping those months hold, other than `planId`. */
  readonly plans: number;
  /**
   * Whether `planId` itself is one of the plans those months wait for (it has no mapping in force on its lines'
   * dates in at least one of them), so its own page says the months wait for this plan's mapping, never for "0 other
   * plans" (UX-2). Decided from the months, since mappings apply by date. Always false for the practice (planId null).
   */
  readonly self: boolean;
}

export function monthsWaitingForMappings(months: readonly MonthAwaitingMappings[], planId: string | null): MonthsWaiting {
  const mixed = months.filter((month) => monthMixed(month) && (planId === null || month.planIds.includes(planId)));
  return {
    months: mixed,
    plans: new Set(mixed.flatMap((month) => month.unmappedPlanIds).filter((id) => id !== planId)).size,
    self: planId !== null && mixed.some((month) => month.unmappedPlanIds.includes(planId)),
  };
}

// ---------------------------------------------------------------------------------------------------
// Months already priced: lines of mapped plans still NO_MAPPING in effect
// ---------------------------------------------------------------------------------------------------

/**
 * The service lines (under `lineFilter`, a condition on service_line `l`) whose pricing in effect is NO_MAPPING while a
 * mapping of their plan is now in force on their date, each with the run in effect that holds it, its plan, its billed
 * cents and the mapping now in force with its kind (design 4.2). The candidates are the lines an eligible run left NO_MAPPING, read
 * through priced_line_by_reason, never a scan of the practice's priced lines (#81); the outer NO_MAPPING decides, after
 * PRICED_IN_EFFECT has chosen each line's pricing in effect (filtering inside it would pick an older priced line).
 * payer_plan_mapping_in_force() is the database's mappingInForce. `practice` is a parameter.
 */
export const MAPPED_NOT_PRICED = (practice: string, lineFilter: string) => `
  WITH candidate AS (
    SELECT DISTINCT x.service_line_id
      FROM pricing_run r JOIN priced_line x ON x.pricing_run_id = r.id AND x.unpriced_reason = 'NO_MAPPING'
     WHERE r.practice_id = ${practice} AND ${ELIGIBLE_RUN('r')}
  ), in_effect AS (${PRICED_IN_EFFECT(practice, 'p.service_line_id IN (SELECT service_line_id FROM candidate)')})
  SELECT p.pricing_run_id, l.id AS service_line_id, l.payer_plan_key AS plan_id, l.charge_cents,
         m.id AS mapping_id, m.created_at AS mapping_created_at, m.mapping_kind
    FROM in_effect p
    JOIN service_line l ON l.id = p.service_line_id JOIN claim c ON c.id = l.claim_id
    JOIN payer_plan_mapping m ON m.id = payer_plan_mapping_in_force(l.payer_plan_key, coalesce(l.service_date, c.service_from))
   WHERE p.unpriced_reason = 'NO_MAPPING' AND (${lineFilter})`;

/** The line filter for the practice ($2 null) or one plan ($2 its ID). */
const PLAN_FILTER = '($2::uuid IS NULL OR l.payer_plan_key = $2::uuid)';

/**
 * The same filter over a MAPPED_NOT_PRICED row `x`. A run is listed for the plan when it holds a line of the plan, with
 * that plan's lines and cents, but its state is the run's: keyed on the newest mapping now in force on any of its
 * listed lines, whichever plan's page reads it, so the practice-wide list and every plan's page show the same state
 * for a run (design 4.2): a re-run that predates another plan's mapping never reads as pricing this plan's months.
 */
const SHOWN = '($2::uuid IS NULL OR x.plan_id = $2::uuid)';

export interface MappedNotPricedTotals {
  readonly lines: number;
  readonly chargeCents: string;
  /** The pricing runs in effect holding them: the rows "Price these months again" lists, and the count on its button. */
  readonly runs: number;
  /**
   * The calendar months those runs' periods span (R2-4): a run a person creates can cover several months, so the
   * runs are never called "priced months"; "in 1 pricing run covering 3 months".
   */
  readonly months: number;
  /**
   * Of the lines, those whose mapping now in force is one a run prices under (a contract version, or Medicare
   * Advantage non-contracted), and their billed cents (UX-3). The rest are mapped as no agreement, government or
   * other: a re-run records them under that mapping (NO_AGREEMENT) and they stay unpriced.
   */
  readonly linesToPrice: number;
  readonly chargeCentsToPrice: string;
}

/** Figure 2 (PRC-31): the practice's lines of mapped plans still NO_MAPPING in the pricing in effect, their billed cents, runs and months. */
export async function mappedNotPricedTotals(client: ScopeClient, practiceId: string): Promise<MappedNotPricedTotals> {
  const { rows } = await client.query<{ lines: number; charge_cents: string; runs: number; months: number; lines_to_price: number; charge_cents_to_price: string }>(
    `WITH x AS (${MAPPED_NOT_PRICED('$1', 'true')})
     SELECT count(*)::int AS lines, coalesce(sum(x.charge_cents), 0)::text AS charge_cents, count(DISTINCT x.pricing_run_id)::int AS runs,
            (SELECT count(DISTINCT g.month)::int
               FROM pricing_run r
               CROSS JOIN LATERAL generate_series(date_trunc('month', r.period_from::timestamp), r.period_to::timestamp, interval '1 month') AS g (month)
              WHERE r.practice_id = $1 AND r.id IN (SELECT pricing_run_id FROM x)) AS months,
            (count(*) FILTER (WHERE x.mapping_kind IN ${PRICING_KINDS}))::int AS lines_to_price,
            coalesce(sum(x.charge_cents) FILTER (WHERE x.mapping_kind IN ${PRICING_KINDS}), 0)::text AS charge_cents_to_price
       FROM x`,
    [practiceId],
  );
  const row = rows[0];
  return {
    lines: row?.lines ?? 0,
    chargeCents: row?.charge_cents ?? '0',
    runs: row?.runs ?? 0,
    months: row?.months ?? 0,
    linesToPrice: row?.lines_to_price ?? 0,
    chargeCentsToPrice: row?.charge_cents_to_price ?? '0',
  };
}

/** What a failed re-run since the newest mapping waited on, in the monitor's terms (D21). */
export type RerunWait = 'location' | 'content';

/**
 * Why the last re-run failed, on a month that is ready again (D21): its job failed, it read content it had not fetched,
 * it was created for another engine, or it waited on the billing ZIP or on Medicare content and that has changed since.
 * `other` is a code none of these names (a re-run never fails unmapped_plan after combined audit #32).
 */
export type LastFailureReason = 'job_failed' | 'release_read_outside_fetch' | 'engine_version_mismatch' | 'location' | 'content' | 'other';

export interface LastFailure {
  readonly rerunId: string;
  readonly failureCode: string;
  readonly reason: LastFailureReason;
  /**
   * Whether a mapping now in force on the run's listed lines was created after that re-run failed (R2-3): the wait it
   * stopped on may still hold, so the screen says it stopped "before another plan was mapped" rather than hiding it.
   */
  readonly mappedSince: boolean;
}

/**
 * Where a listed run stands (design 4.2, in this order). being_priced: a counting re-run is queued or running;
 * to_accept: it is complete and awaits a person (RERUN_ACCEPTANCE awaiting); waiting: the run waits for a newer first
 * run of overlapping dates (NEWER_RUN_PENDING), or its counting re-run does (newer_run_pending); rerun_failed: no re-run
 * counts and the last re-run (none created after it) failed on what has not changed since (the gate); ready: none of
 * these, with the last failure when a failed re-run's gate is open.
 *
 * A re-run counts by the mappings it read, never only by when it was created (PR #95 review R2-1): not failed, not
 * accepted, when complete still acceptable or waiting, and queued (it reads the mappings in force when it prices,
 * execute.ts), running and created after the newest mapping of the listed lines (when it read them is not recorded), or
 * complete with none of the listed lines priced NO_MAPPING or under a mapping other than the one now in force (a
 * mapping corrected after it priced makes it stale).
 */
export type PriceAgainState =
  | { readonly kind: 'being_priced'; readonly rerunId: string }
  | { readonly kind: 'to_accept'; readonly rerunId: string }
  | { readonly kind: 'waiting'; readonly rerunId: string | null }
  | { readonly kind: 'rerun_failed'; readonly rerunId: string; readonly failureCode: string; readonly wait: RerunWait }
  | { readonly kind: 'ready'; readonly lastFailure: LastFailure | null };

export interface MonthToPriceAgain {
  readonly pricingRunId: string;
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly releaseNo: number;
  /** Its lines of mapped plans still NO_MAPPING (for the practice, or the one plan), and their billed cents. */
  readonly lines: number;
  readonly chargeCents: string;
  /**
   * Of those lines, the ones whose mapping now in force is one a run prices under (a contract version, or Medicare
   * Advantage non-contracted; UX-3). When 0, a re-run only records the lines under their mapping (no agreement,
   * government or other: NO_AGREEMENT) and they stay unpriced: "Ready to record under its mapping", never "price".
   */
  readonly linesToPrice: number;
  /** The latest created_at of the mappings now in force on the run's listed lines, of every plan. */
  readonly newestMappingAt: string;
  readonly state: PriceAgainState;
}

interface PriceAgainRow {
  readonly pricing_run_id: string;
  readonly practice_id: string;
  readonly period_from: string;
  readonly period_to: string;
  readonly release_no: number;
  readonly lines: number;
  readonly charge_cents: string;
  readonly lines_to_price: number;
  readonly newest_mapping_at: Date;
  readonly newer_run_pending: boolean;
  readonly counting_id: string | null;
  readonly counting_status: string | null;
  readonly counting_acceptance: string | null;
  readonly failed_id: string | null;
  readonly failed_code: string | null;
  readonly failed_release_no: number | null;
  readonly failed_terms_unchanged: boolean | null;
  readonly location_saved_since: boolean | null;
  readonly mapped_since_failure: boolean | null;
}

function isContentFailureCode(code: string): code is ContentFailureCode {
  return (CONTENT_FAILURE_CODES as readonly string[]).includes(code);
}

const OTHER_REASONS: readonly LastFailureReason[] = ['job_failed', 'release_read_outside_fetch', 'engine_version_mismatch'];

/**
 * The runs in effect holding lines of mapped plans still NO_MAPPING (of `planId`, or of every plan), oldest first
 * (period_from, period_to, ID), each with its lines and billed cents and one state. Every listed run is in effect by
 * construction (it holds a line's pricing in effect), so createRerun's not_in_effect cannot apply to it when it is
 * read; the action checks again anyway. The gate of a failed re-run reads the monitor's own rules (D21): content opens
 * when the practice's terms changed since the re-run was created (termsUnchangedSince) or the release in force loads
 * more of that content for the period than the re-run's (coversMore); the location when practice_site was saved after
 * the re-run was created, or another release is in force (none in force keeps it closed); both open when a mapping now
 * in force on the run's lines was created after the re-run failed (R2-3, LastFailure.mappedSince); every other code
 * is open. Audited: one read event per run.
 */
export async function monthsToPriceAgain(scope: Scope, practiceId: string, planId: string | null, requestId: string): Promise<MonthToPriceAgain[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'pricing_run', purpose: 'payer_plan_mapping', requestId },
    async (client) =>
      (
        await client.query<PriceAgainRow>(
          `WITH listed AS (${MAPPED_NOT_PRICED('$1', 'true')}),
                per_run AS (
                  SELECT x.pricing_run_id,
                         count(*) FILTER (WHERE ${SHOWN})::int AS lines,
                         coalesce(sum(x.charge_cents) FILTER (WHERE ${SHOWN}), 0)::text AS charge_cents,
                         count(*) FILTER (WHERE ${SHOWN} AND x.mapping_kind IN ${PRICING_KINDS})::int AS lines_to_price,
                         max(x.mapping_created_at) AS newest_mapping_at
                    FROM listed x GROUP BY x.pricing_run_id
                  HAVING count(*) FILTER (WHERE ${SHOWN}) > 0
                )
           SELECT r.id AS pricing_run_id, r.practice_id, r.period_from::text AS period_from, r.period_to::text AS period_to, r.release_no,
                  k.lines, k.charge_cents, k.lines_to_price, k.newest_mapping_at, ${NEWER_RUN_PENDING('r')} AS newer_run_pending,
                  counting.id AS counting_id, counting.status AS counting_status, counting.acceptance AS counting_acceptance,
                  failed.id AS failed_id, failed.failure_code AS failed_code, failed.release_no AS failed_release_no,
                  failed.terms_unchanged AS failed_terms_unchanged, failed.location_saved_since, failed.mapped_since_failure
             FROM per_run k
             JOIN pricing_run r ON r.id = k.pricing_run_id AND r.practice_id = $1
             LEFT JOIN LATERAL (
               SELECT rr.id, rr.status, rr.acceptance FROM (
                 SELECT q.id, q.status, q.created_at, ${RERUN_ACCEPTANCE('q')} AS acceptance
                   FROM pricing_run q
                  WHERE q.practice_id = $1 AND q.rerun_of_id = r.id AND q.status <> 'failed' AND q.accepted_at IS NULL
                    AND (q.status = 'queued'
                         OR (q.status = 'running' AND q.created_at > k.newest_mapping_at)
                         OR (q.status = 'complete' AND NOT EXISTS (
                               SELECT 1 FROM listed x JOIN priced_line y ON y.pricing_run_id = q.id AND y.service_line_id = x.service_line_id
                                WHERE x.pricing_run_id = r.id
                                  AND (y.unpriced_reason = 'NO_MAPPING' OR (y.mapping_id IS NOT NULL AND y.mapping_id <> x.mapping_id)))))) rr
                WHERE rr.status <> 'complete' OR rr.acceptance IN ('awaiting', 'newer_run_pending')
                ORDER BY rr.created_at DESC, rr.id DESC LIMIT 1) counting ON true
             LEFT JOIN LATERAL (
               SELECT q.id, q.failure_code, q.release_no, (${termsUnchangedSince('$1', 'q.created_at')}) AS terms_unchanged,
                      EXISTS (SELECT 1 FROM practice_site s WHERE s.practice_id = $1 AND s.updated_at > q.created_at) AS location_saved_since,
                      k.newest_mapping_at > q.updated_at AS mapped_since_failure
                 FROM pricing_run q
                WHERE q.practice_id = $1 AND q.rerun_of_id = r.id AND q.status = 'failed'
                  AND NOT EXISTS (SELECT 1 FROM pricing_run z WHERE z.practice_id = $1 AND z.rerun_of_id = r.id AND z.status <> 'failed' AND z.created_at > q.created_at)
                ORDER BY q.created_at DESC, q.id DESC LIMIT 1) failed ON true
            ORDER BY r.period_from, r.period_to, r.id`,
          [practiceId, planId],
        )
      ).rows,
    (row) => ({ objectId: row.pricing_run_id, practiceId: row.practice_id }),
  );
  const inForce = rows.some((row) => row.failed_id !== null) ? await releaseInForce(scope.client) : null;
  const months: MonthToPriceAgain[] = [];
  for (const row of rows) {
    months.push({
      pricingRunId: row.pricing_run_id,
      periodFrom: row.period_from,
      periodTo: row.period_to,
      releaseNo: row.release_no,
      lines: row.lines,
      chargeCents: row.charge_cents,
      linesToPrice: row.lines_to_price,
      newestMappingAt: row.newest_mapping_at.toISOString(),
      state: await stateOf(scope.client, row, inForce),
    });
  }
  return months;
}

async function stateOf(client: ScopeClient, row: PriceAgainRow, inForce: number | null): Promise<PriceAgainState> {
  if (row.counting_id !== null && row.counting_status !== 'complete') {
    return { kind: 'being_priced', rerunId: row.counting_id };
  }
  if (row.counting_id !== null && row.counting_acceptance === 'awaiting') {
    return { kind: 'to_accept', rerunId: row.counting_id };
  }
  if (row.newer_run_pending || row.counting_id !== null) {
    return { kind: 'waiting', rerunId: row.counting_id };
  }
  if (row.failed_id === null || row.failed_code === null) {
    return { kind: 'ready', lastFailure: null };
  }
  const failureCode = row.failed_code;
  const rerunId = row.failed_id;
  // A mapping created since the re-run failed opens every gate (R2-3): it can remove what the re-run waited on (a plan
  // remapped to a contract reads no locality or Medicare content), and the line says the wait may still hold.
  const mappedSince = row.mapped_since_failure === true;
  const ready = (reason: LastFailureReason): PriceAgainState => ({ kind: 'ready', lastFailure: { rerunId, failureCode, reason, mappedSince } });
  if (isContentFailureCode(failureCode)) {
    const open =
      mappedSince ||
      row.failed_terms_unchanged === false ||
      (inForce !== null &&
        row.failed_release_no !== null &&
        inForce !== row.failed_release_no &&
        (await coversMore(client, { failureCode, releaseNo: row.failed_release_no }, inForce, { periodFrom: row.period_from, periodTo: row.period_to })));
    return open ? ready('content') : { kind: 'rerun_failed', rerunId, failureCode, wait: 'content' };
  }
  if (failureCode === 'location_not_ready') {
    // Another release in force opens it (F5); with none in force nothing can be priced, so it stays closed, as content does.
    const open = mappedSince || row.location_saved_since === true || (inForce !== null && inForce !== row.failed_release_no);
    return open ? ready('location') : { kind: 'rerun_failed', rerunId, failureCode, wait: 'location' };
  }
  return ready(OTHER_REASONS.find((known) => known === failureCode) ?? 'other');
}

/** What a press of "Price these months again" acts on (design 4.2 step 2): the ready runs, oldest first, up to the limit, and the runs already being priced again since their newest mapping. */
export function priceAgainSets(months: readonly MonthToPriceAgain[]): { readonly ready: readonly MonthToPriceAgain[]; readonly already: ReadonlySet<string> } {
  return {
    ready: months.filter((month) => month.state.kind === 'ready').slice(0, PRICE_AGAIN_LIMIT),
    already: new Set(months.filter((month) => month.state.kind === 'being_priced' || month.state.kind === 'to_accept').map((month) => month.pricingRunId)),
  };
}

// ---------------------------------------------------------------------------------------------------
// Accepted re-runs to triage
// ---------------------------------------------------------------------------------------------------

/**
 * The candidates of monthsToTriage (PR #95 review F1): the service lines any run of the practice left NO_MAPPING, read
 * through priced_line_by_reason (#81), the same run condition as its EXISTS on an earlier NO_MAPPING pricing (any run,
 * eligible or not), so restricting to them changes no result and never scans the accepted re-runs' whole priced
 * history. `practice` is a parameter.
 */
export const TRIAGE_CANDIDATES = (practice: string) => `
  SELECT DISTINCT x.service_line_id
    FROM pricing_run q JOIN priced_line x ON x.pricing_run_id = q.id AND x.unpriced_reason = 'NO_MAPPING'
   WHERE q.practice_id = ${practice}`;

export interface MonthToTriage {
  readonly pricingRunId: string;
  readonly periodFrom: string;
  readonly periodTo: string;
  /** The lines a mapping brought to pricing that triage would validate and has not, and their billed cents. */
  readonly lines: number;
  readonly chargeCents: string;
}

/**
 * The accepted re-runs in effect (of `planId`'s lines, or any plan's) holding, as pricing in effect, a line a mapping
 * brought to pricing (some earlier pricing of the same service line, in a run created before the re-run, was
 * NO_MAPPING: review R3-4, through priced_line_by_service_line) that triage would validate and has not: priced, with a
 * positive shortfall (priced_line_shortfall_cents, the database's twin of @tp/triage's shortfallOf, the condition
 * triage validates on), in no case_line, and whose newest stage ranks below validated. A re-run a person created is
 * never chained to triage (ADR 0038), so the screens point to Cases until triage has run on it. Oldest first. Audited:
 * one read event per run.
 */
export async function monthsToTriage(scope: Scope, practiceId: string, planId: string | null, requestId: string): Promise<MonthToTriage[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'pricing_run', purpose: 'payer_plan_mapping', requestId },
    async (client) =>
      (
        await client.query<{ pricing_run_id: string; practice_id: string; period_from: string; period_to: string; lines: number; charge_cents: string }>(
          `WITH accepted AS (
             SELECT r.id, r.created_at FROM pricing_run r
              WHERE r.practice_id = $1 AND r.rerun_of_id IS NOT NULL AND r.accepted_at IS NOT NULL AND ${RUN_IN_EFFECT('r')}
           ), candidate AS (${TRIAGE_CANDIDATES('$1')}), in_effect AS (${PRICED_IN_EFFECT('$1', 'p.service_line_id IN (SELECT service_line_id FROM candidate)')}),
           to_triage AS (
             SELECT p.pricing_run_id, l.charge_cents
               FROM in_effect p JOIN accepted a ON a.id = p.pricing_run_id JOIN service_line l ON l.id = p.service_line_id
              WHERE p.unpriced_reason IS NULL AND ${PLAN_FILTER}
                AND EXISTS (SELECT 1 FROM priced_line y JOIN pricing_run q ON q.id = y.pricing_run_id
                             WHERE y.practice_id = $1 AND y.service_line_id = p.service_line_id AND y.unpriced_reason = 'NO_MAPPING' AND q.created_at < a.created_at)
                AND priced_line_shortfall_cents(p.id) IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM case_line k WHERE k.practice_id = $1 AND k.service_line_id = p.service_line_id)
                AND coalesce((SELECT line_stage_rank(s.stage) FROM line_status s WHERE s.practice_id = $1 AND s.service_line_id = p.service_line_id ORDER BY s.seq DESC LIMIT 1), 0)
                    < line_stage_rank('validated')
           )
           SELECT r.id AS pricing_run_id, r.practice_id, r.period_from::text AS period_from, r.period_to::text AS period_to,
                  count(*)::int AS lines, coalesce(sum(t.charge_cents), 0)::text AS charge_cents
             FROM to_triage t JOIN pricing_run r ON r.id = t.pricing_run_id
            GROUP BY r.id
            ORDER BY r.period_from, r.period_to, r.id`,
          [practiceId, planId],
        )
      ).rows,
    (row) => ({ objectId: row.pricing_run_id, practiceId: row.practice_id }),
  );
  return rows.map((row) => ({ pricingRunId: row.pricing_run_id, periodFrom: row.period_from, periodTo: row.period_to, lines: row.lines, chargeCents: row.charge_cents }));
}
