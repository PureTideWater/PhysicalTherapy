import { dollarsWaitingOnMapping } from '@tp/contracts';
import { HELD_AT_INTAKE, type PracticeScope, type ScopeClient } from '@tp/db/runtime';
import { quarterOf, quarterPeriod } from '@tp/ledger';
import { centsToString, parseCents, sumCents } from '@tp/money';
import { type RecoveredPeriods, practiceRecoveredPeriods, unmatchedItems } from '@tp/worker/ledger';
import { followUpsDue } from '@tp/worker/packets';
import { ACTIONABLE_NOW_OF } from '@tp/worker/triage';

import { coverageInEffect } from '../coverage/in-effect';
import { type SummaryRow, practiceStageSummary } from '../monitoring/queries';
import { RUN_IN_EFFECT } from '../pricing/queries';
import { practiceTriageSettings } from '../triage/queries';
import { baaOnFile } from '../uploads/gate';

/**
 * The practice dashboard's counts and totals (PRD 7, Practice dashboard: "data freshness (last file,
 * last run), coverage, open cases by stage, deadlines in 14 days, recovered this quarter, last run
 * status ... jump to any queue"; PRD 12, What a customer sees as the headline: "three numbers, never
 * one: actionable, payer approved, recovered ... the flagged and validated totals are shown below them
 * with their labels"; PRD 6: every number links to the stage it came from; docs/adr/0045). Each figure
 * is read as the screen it links to reads it, so the number and the screen agree:
 *
 * - actionable: the Cases screen's figure (@tp/worker/triage's ACTIONABLE_NOW_OF; docs/adr/0082), the
 *   variance of case lines not written off, still at actionable, on their pricing in effect, in the cases
 *   still being worked, counted in lines by the same predicate, with the lines out of it by cause;
 * - payer approved and recovered: the recovery ledger's totals (recovered at the practice's proof
 *   level, net of recoupments and reversals; approved is its own stage and never summed into it), as
 *   Reconciliation shows them: recovered to date since its first counted entry, and this quarter, the
 *   same for entries dated in the quarter, both from one read of the ledger (practiceRecoveredPeriods);
 * - flagged and validated: the lines at those stages now, as the monthly summary counts them (validated
 *   with its shortfall under the pricing in effect), Claims and lines filtered to the stage;
 * - coverage: each line's result in its pricing in effect, across every run in effect (the digest's
 *   statement, as Coverage reads it), never the latest run's lines alone;
 * - the queues: what waits for a person on each screen.
 *
 * Counts, integer cents as text and opaque IDs only; no patient, claim or line identifier.
 *
 * Cost: the cases are read in one statement (HOME_CASES) that runs the pricing check at most once per case
 * line at actionable and returns one row per state. The home as a whole is not bounded by it: the ledger's
 * entries are read into the server once, and the stage summary reads every line.
 */

type Scope = PracticeScope<ScopeClient>;

/** How many days ahead the dashboard's deadlines look (PRD 7: "deadlines in 14 days"; the Cases screen's own filter). */
export const DEADLINE_WINDOW_DAYS = 14;

/** The case lines of the cases still being worked that are not written off and out of the actionable figure, by cause. */
export interface OutOfFigure {
  /** Whose latest stage is not actionable: moved on to payer approved or recovered, or (rarely) reopened by a person to an earlier stage. */
  readonly movedOn: number;
  /**
   * At actionable, but priced_line_pricing_check() is not 'current' (PRICING_CHECK_RESULTS, packages/db/src/schema/
   * packets.ts): priced again or no run in effect, its rule release withdrawn, its plan mapping no longer in force on the
   * service date, or its contract version no longer signed off or no longer covering the service date.
   */
  readonly stale: number;
}

export interface Headline {
  /** The Cases screen's figure over the cases still being worked, its lines (the same predicate, counted), and the lines out of it. */
  readonly actionable: { readonly lines: number; readonly cents: string; readonly outOfFigure: OutOfFigure };
  readonly payerApprovedCents: string;
  /** Recovered to date (the proof level's stage plus recoupments, net of reversals). */
  readonly recoveredCents: string;
  /** The earliest date of a recovery to date that still stands (RecoveredPeriods.firstOn: an original entry the to-date figure sums, never a reversal, an adjustment or one reversed since); null when none stands ("to date, none yet"). */
  readonly recoveredSince: string | null;
  readonly proofLevel: 'posted' | 'deposited';
  readonly flagged: { readonly lines: number };
  readonly validated: { readonly lines: number; readonly cents: string };
}

export interface Queues {
  /** Files held at intake or by the parser, or failed: the Uploads screen. */
  readonly heldFiles: number;
  /** Plans with lines no mapping covers: Payer and plan mapping. */
  readonly plansWaiting: number;
  /** The contract specialist's open questions to the practice: Contracts. */
  readonly openQuestions: number;
  /** Anomaly cohorts of the runs in effect nobody has reviewed: Anomalies (investigatory). */
  readonly anomaliesToReview: number;
  /** Cases still being worked with no owner: Cases, unassigned. */
  readonly unassignedCases: number;
  /** Postings, deposits and adjusted payments that match nothing: Reconciliation. */
  readonly unmatched: number;
}

export interface Dashboard {
  /**
   * Coverage under the pricing in effect (Coverage's own): the lines the runs in effect priced, each at its
   * pricing in effect, and the service dates those runs cover; null before any run is in effect.
   */
  readonly coverage: {
    readonly runs: number;
    readonly periodFrom: string;
    readonly periodTo: string;
    readonly lines: number;
    readonly pricedLines: number;
    readonly chargeCents: string;
    readonly pricedChargeCents: string;
  } | null;
  readonly headline: Headline;
  /** The practice's cases by state, with each state's stage-three figure (lines still at actionable). */
  readonly casesByState: readonly { readonly state: string; readonly cases: number; readonly actionableCents: string }[];
  /** Cases still being worked whose deadline falls within DEADLINE_WINDOW_DAYS of today (any passed included), as the Cases screen's deadline filter lists them. */
  readonly deadlines: { readonly cases: number; readonly actionableCents: string; readonly earliest: string | null };
  /** Cases whose latest submission has no response and whose follow-up date has come (PRD 7: "overdue follow-ups surface on the dashboard"; CAS-14). */
  readonly followUps: { readonly due: number; readonly earliest: string | null; readonly first: readonly { readonly caseId: string; readonly followUpOn: string }[] };
  /** Recovered this quarter: the ledger's, for entries dated in the quarter (the practice's proof level, net), never an estimate and never approved. */
  readonly recoveredQuarter: { readonly quarter: string; readonly from: string; readonly to: string; readonly cents: string };
  readonly queues: Queues;
  /**
   * The agreement half of the upload gate, as Uploads reads it (lib/uploads/gate.ts: the practice's or its
   * organization's BAA, signed by now); the page's suspension is the other half.
   */
  readonly uploads: { readonly baaOnFile: boolean };
}

const WORKED = "state NOT IN ('resolved', 'closed_written_off')";

/**
 * The practice's cases in one statement, by state (`ORDER BY c.state`): each state's cases and their
 * figure (ACTIONABLE_NOW_OF, read once per case), its lines, its lines not written off and those out of
 * the figure by cause, and, of the cases still being worked whose deadline falls within `$3` days of `$2`
 * (passed ones included, as the Cases screen's deadline filter lists them), the count, the figure and the
 * earliest deadline. The headline, the cases by state and the deadlines are its rows, so they agree.
 */
export const HOME_CASES = `SELECT c.state, count(*)::int AS cases,
            coalesce(sum(a.cents), 0)::text AS cents, coalesce(sum(a.lines), 0)::int AS lines,
            coalesce(sum(a.moved_on), 0)::int AS moved_on, coalesce(sum(a.stale), 0)::int AS stale,
            (count(*) FILTER (WHERE c.${WORKED} AND c.deadline_on <= $2::date + $3::int))::int AS near_cases,
            coalesce(sum(a.cents) FILTER (WHERE c.${WORKED} AND c.deadline_on <= $2::date + $3::int), 0)::text AS near_cents,
            (min(c.deadline_on) FILTER (WHERE c.${WORKED} AND c.deadline_on <= $2::date + $3::int))::text AS near_earliest
       FROM "case" c
       CROSS JOIN LATERAL ${ACTIONABLE_NOW_OF('c')} a
      WHERE c.practice_id = $1
      GROUP BY c.state
      ORDER BY c.state`;

interface HomeCasesRow {
  readonly state: string;
  readonly cases: number;
  readonly cents: string;
  readonly lines: number;
  readonly moved_on: number;
  readonly stale: number;
  readonly near_cases: number;
  readonly near_cents: string;
  readonly near_earliest: string | null;
}

function worked(row: HomeCasesRow): boolean {
  return row.state !== 'resolved' && row.state !== 'closed_written_off';
}

function headlineOf(rows: readonly HomeCasesRow[], recovered: RecoveredPeriods, stages: SummaryRow): Headline {
  const open = rows.filter(worked);
  const count = (of: (row: HomeCasesRow) => number) => open.reduce((total, row) => total + of(row), 0);
  return {
    actionable: {
      lines: count((row) => row.lines),
      cents: centsToString(sumCents(open.map((row) => parseCents(row.cents)))),
      outOfFigure: { movedOn: count((row) => row.moved_on), stale: count((row) => row.stale) },
    },
    // Approvals net of what recoupments took back of them before they were proved (PRD 12: what has been accepted).
    payerApprovedCents: centsToString(recovered.toDate.payerApprovedCents),
    recoveredCents: centsToString(recovered.toDate.recoveredCents),
    recoveredSince: recovered.firstOn,
    proofLevel: recovered.toDate.proofLevel,
    flagged: { lines: stages.figures.flagged.lines },
    validated: { lines: stages.figures.validated.lines, cents: stages.figures.validated.varianceCents ?? '0' },
  };
}

async function queuesOf(scope: Scope, practiceId: string): Promise<Queues> {
  const minimumCohort = (await practiceTriageSettings(scope, practiceId)).anomalyMinimumCohort;
  const { rows } = await scope.client.query<{ held: number; questions: number; anomalies: number; unassigned: number }>(
    `SELECT (SELECT count(*)::int FROM source_document d WHERE d.practice_id = $1 AND d.status = ANY ($2::text[])) AS held,
            (SELECT count(*)::int FROM contract_question q WHERE q.practice_id = $1 AND q.status = 'open') AS questions,
            (SELECT count(*)::int FROM anomaly a JOIN pricing_run r ON r.id = a.pricing_run_id
              WHERE a.practice_id = $1 AND a.reviewed_by IS NULL AND a.cohort_size >= $3 AND ${RUN_IN_EFFECT('r')}) AS anomalies,
            (SELECT count(*)::int FROM "case" c WHERE c.practice_id = $1 AND c.${WORKED} AND c.owner_user_id IS NULL) AS unassigned`,
    [practiceId, ['held', 'failed', ...HELD_AT_INTAKE], minimumCohort],
  );
  const row = rows[0];
  const unmatched = await unmatchedItems(scope, practiceId);
  return {
    heldFiles: row?.held ?? 0,
    plansWaiting: (await dollarsWaitingOnMapping(scope, practiceId)).length,
    openQuestions: row?.questions ?? 0,
    anomaliesToReview: row?.anomalies ?? 0,
    unassignedCases: row?.unassigned ?? 0,
    unmatched: unmatched.postings.length + unmatched.deposits.length + unmatched.adjustedPayments.length,
  };
}

/** The dashboard's counts and totals, on `today` (UTC). */
export async function dashboard(scope: Scope, practiceId: string, today: string): Promise<Dashboard> {
  const coverage = await coverageInEffect(scope, practiceId);
  const { rows } = await scope.client.query<HomeCasesRow>(HOME_CASES, [practiceId, today, DEADLINE_WINDOW_DAYS]);
  const near = rows.filter(worked);
  const earliest = near.reduce<string | null>((first, row) => (row.near_earliest !== null && (first === null || row.near_earliest < first) ? row.near_earliest : first), null);
  const due = await followUpsDue(scope, { practiceId, asOf: today });
  const quarter = quarterOf(today);
  const period = quarterPeriod(quarter);
  const recovered = await practiceRecoveredPeriods(scope, practiceId, period);
  return {
    coverage:
      coverage.runs === 0 || coverage.periodFrom === null || coverage.periodTo === null
        ? null
        : {
            runs: coverage.runs,
            periodFrom: coverage.periodFrom,
            periodTo: coverage.periodTo,
            lines: coverage.of.lines,
            pricedLines: coverage.priced.lines,
            chargeCents: coverage.of.chargeCents,
            pricedChargeCents: coverage.priced.chargeCents,
          },
    headline: headlineOf(rows, recovered, await practiceStageSummary(scope, practiceId)),
    casesByState: rows.map((row) => ({ state: row.state, cases: row.cases, actionableCents: centsToString(parseCents(row.cents)) })),
    deadlines: {
      cases: near.reduce((total, row) => total + row.near_cases, 0),
      actionableCents: centsToString(sumCents(near.map((row) => parseCents(row.near_cents)))),
      earliest,
    },
    followUps: { due: due.length, earliest: due[0]?.followUpOn ?? null, first: due.slice(0, 5).map((item) => ({ caseId: item.caseId, followUpOn: item.followUpOn })) },
    recoveredQuarter: { quarter, from: period.from, to: period.to, cents: centsToString(recovered.period.recoveredCents) },
    queues: await queuesOf(scope, practiceId),
    uploads: { baaOnFile: await baaOnFile(scope, practiceId) },
  };
}
