import { dollarsWaitingOnMapping } from '@tp/contracts';
import { HELD_AT_INTAKE, type PracticeScope, type ScopeClient } from '@tp/db/runtime';
import { quarterOf, quarterPeriod } from '@tp/ledger';
import { centsToString } from '@tp/money';
import { practiceLedgerTotals, unmatchedItems } from '@tp/worker/ledger';
import { followUpsDue } from '@tp/worker/packets';

import { coverageInEffect } from '../coverage/in-effect';
import { practiceStageSummary } from '../monitoring/queries';
import { RUN_IN_EFFECT } from '../pricing/queries';
import { ACTIONABLE_NOW, practiceTriageSettings } from '../triage/queries';

/**
 * The practice dashboard's counts and totals (PRD 7, Practice dashboard: "data freshness (last file,
 * last run), coverage, open cases by stage, deadlines in 14 days, recovered this quarter, last run
 * status ... jump to any queue"; PRD 12, What a customer sees as the headline: "three numbers, never
 * one: actionable, payer approved, recovered ... the flagged and validated totals are shown below them
 * with their labels"; PRD 6: every number links to the stage it came from; docs/adr/0045). Each figure
 * is read as the screen it links to reads it, so the number and the screen agree:
 *
 * - actionable: the Cases screen's figure, the variance of case lines still at actionable, not written
 *   off, in the cases still being worked;
 * - payer approved and recovered: the recovery ledger's totals (recovered at the practice's proof
 *   level, net of recoupments and reversals; approved is its own stage and never summed into it), as
 *   Reconciliation shows them; recovered this quarter is the same for entries dated in the quarter;
 * - flagged and validated: the lines at those stages now, as the monthly summary counts them (validated
 *   with its shortfall under the pricing in effect), Claims and lines filtered to the stage;
 * - coverage: each line's result in its pricing in effect, across every run in effect (the digest's
 *   statement, as Coverage reads it), never the latest run's lines alone;
 * - the queues: what waits for a person on each screen.
 *
 * Counts, integer cents as text and opaque IDs only; no patient, claim or line identifier.
 */

type Scope = PracticeScope<ScopeClient>;

/** How many days ahead the dashboard's deadlines look (PRD 7: "deadlines in 14 days"; the Cases screen's own filter). */
export const DEADLINE_WINDOW_DAYS = 14;

export interface Headline {
  readonly actionable: { readonly lines: number; readonly cents: string };
  readonly payerApprovedCents: string;
  readonly recoveredCents: string;
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
}

const WORKED = "state NOT IN ('resolved', 'closed_written_off')";

async function headlineOf(scope: Scope, practiceId: string): Promise<Headline> {
  const actionable = await scope.client.query<{ lines: number; cents: string }>(
    `SELECT (SELECT count(*)::int FROM case_line x JOIN "case" k ON k.id = x.case_id
              WHERE x.practice_id = $1 AND k.${WORKED} AND x.written_off_reason IS NULL
                AND (SELECT s.stage FROM line_status s WHERE s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable') AS lines,
            coalesce((SELECT sum(${ACTIONABLE_NOW('c')}) FROM "case" c WHERE c.practice_id = $1 AND c.${WORKED}), 0)::text AS cents`,
    [practiceId],
  );
  const ledger = await practiceLedgerTotals(scope, practiceId);
  const stages = await practiceStageSummary(scope, practiceId);
  return {
    actionable: { lines: actionable.rows[0]?.lines ?? 0, cents: actionable.rows[0]?.cents ?? '0' },
    // Approvals net of what recoupments took back of them before they were proved (PRD 12: what has been accepted).
    payerApprovedCents: centsToString(ledger.payerApprovedCents),
    recoveredCents: centsToString(ledger.recoveredCents),
    proofLevel: ledger.proofLevel,
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
  const states = await scope.client.query<{ state: string; cases: number; actionable: string }>(
    `SELECT c.state, count(*)::int AS cases, coalesce(sum(${ACTIONABLE_NOW('c')}), 0)::text AS actionable FROM "case" c WHERE c.practice_id = $1 GROUP BY c.state ORDER BY c.state`,
    [practiceId],
  );
  const near = await scope.client.query<{ cases: number; actionable: string; earliest: string | null }>(
    `SELECT count(*)::int AS cases, coalesce(sum(${ACTIONABLE_NOW('c')}), 0)::text AS actionable, min(c.deadline_on)::text AS earliest
       FROM "case" c WHERE c.practice_id = $1 AND c.${WORKED} AND c.deadline_on <= $2::date + $3::int`,
    [practiceId, today, DEADLINE_WINDOW_DAYS],
  );
  const due = await followUpsDue(scope, { practiceId, asOf: today });
  const quarter = quarterOf(today);
  const period = quarterPeriod(quarter);
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
    headline: await headlineOf(scope, practiceId),
    casesByState: states.rows.map((row) => ({ state: row.state, cases: row.cases, actionableCents: row.actionable })),
    deadlines: { cases: near.rows[0]?.cases ?? 0, actionableCents: near.rows[0]?.actionable ?? '0', earliest: near.rows[0]?.earliest ?? null },
    followUps: { due: due.length, earliest: due[0]?.followUpOn ?? null, first: due.slice(0, 5).map((item) => ({ caseId: item.caseId, followUpOn: item.followUpOn })) },
    recoveredQuarter: { quarter, from: period.from, to: period.to, cents: centsToString((await practiceLedgerTotals(scope, practiceId, period)).recoveredCents) },
    queues: await queuesOf(scope, practiceId),
  };
}
