import { type PracticeCipher, type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import { entriesById, ledgerTotals } from '@tp/ledger';
import { type Cents, ZERO_CENTS, centsToString, cents, parseCents, sumCents } from '@tp/money';
import { type UnpricedReason, parseTrace } from '@tp/pricing';
import {
  type AdjustmentBehavior,
  BEHAVIOR_RECORD_TYPES,
  BEHAVIOR_TEXT,
  type BehaviorReferences,
  type DeadlineUnverifiedCause,
  type DeadlineVerification,
  INVESTIGATORY,
  NOT_ACTIONABLE_REASONS,
  STAGE_LABELS,
  type TriageSettings,
  WRITE_OFF_TEXT,
  type WriteOffReason,
  detectBehavior,
  headline,
  judgeLine,
  netExpectedValue,
  releaseReferences,
  triageSettings,
} from '@tp/triage';

import { parseCoverage } from '../price/coverage';
import { RUN_IN_EFFECT } from '../price/in-effect';
import { type ContentRead, type ContentSpans, contentGapsOf, familyOf, releaseContentSpans, typedRelease } from '../price/release';
import { type StoredEntry, ledgerEntries, practiceLedgerSettings } from '../reconcile/ledger';
import { PATIENT_BALANCE_UNSEEN, type PatientBalanceFold, foldPatientBalance, lineCorrections, patientBalanceOf } from '../reconcile/patient-share';
import { lineDeadlines } from '../triage/deadline';
import { CsvArena, type LineOrderKey, compareLineOrder, compareText } from './csv-arena';
import { UNPRICED_REMEDIES } from './remedies';

/**
 * The audit report's numbers (PRD 4, Audit v0: "coverage, anomalies, validated discrepancies,
 * actionable amounts, pursuit cost, evidence gaps"; PRD 12, What a customer sees as the headline; J12:
 * "every number links to the stage it came from; headline totals never mix stages"), read from a
 * complete pricing run after its triage on the report's date, and kept as `audit_report.content`
 * (tp-audit-report/1) with the PDF and the line CSV made from them. Kept apart, each with its stage:
 *
 * - coverage: the run's lines and billed dollars priced, and the unpriced reasons by count;
 * - anomalies (flagged, investigatory): counts and dollar ranges, in no total;
 * - validated discrepancies: priced lines paid below the contract, by payer pattern, with why each
 *   that is not actionable is not; a per-visit line is counted with its visit (the visit's net
 *   shortfall at most, on the line that carries the visit; docs/adr/0040);
 * - actionable: the cases holding this run's lines, each with this run's share (its lines priced by
 *   this run, not written off; their deadline), the whole case beside it, the pursuit cost and the
 *   net expected value of the share. A case may hold lines of other runs (a pattern accumulates
 *   across runs); those count in their own runs' reports, so the headline, the cases and the line CSV
 *   reconcile;
 * - the headline's three numbers come from the cases table's lines, each at its stage now: actionable
 *   the share's lines still at actionable (not yet approved or recovered), payer approved and recovered
 *   the recovery ledger's entries for the share's lines (docs/adr/0042: recovered is only ever the
 *   ledger's posted or deposited cash, at the practice's proof level, net of recoupments and reversals),
 *   each case's beside it in the table; the headline is the sum of the table's columns;
 * - evidence gaps: what to obtain to price more lines or to pursue them.
 *
 * Amounts are integer cents as text. Nothing here computes an expected amount: every amount is a
 * priced line's, a case's (derived in the database) or a sum of them.
 */

export const REPORT_FORMAT = 'tp-audit-report/1';

export interface ReportPattern {
  readonly payer: string;
  readonly plan: string;
  readonly mapping_kind: string;
  readonly contract_version_id: string | null;
  readonly rate_record_id: string | null;
  readonly behavior: AdjustmentBehavior;
  readonly behavior_text: string;
  readonly lines: number;
  readonly variance_cents: string;
}

export interface ReportCase {
  readonly case_id: string;
  readonly payer: string;
  readonly plan: string;
  readonly mapping_kind: string;
  readonly rate_record_id: string | null;
  readonly behavior: AdjustmentBehavior;
  readonly behavior_text: string;
  readonly state: string;
  /** This run's share of the case: its lines this run priced, those not written off, their total and earliest window. */
  readonly deadline_on: string | null;
  readonly lines: number;
  readonly actionable_lines: number;
  readonly actionable_cents: string;
  readonly written_off_lines: number;
  readonly written_off_cents: string;
  /** The whole case, every run's lines (the database's total and deadline). */
  readonly case_lines: number;
  readonly case_actionable_cents: string;
  readonly case_deadline_on: string | null;
  readonly materiality_cents: string;
  readonly pursuit_cost_cents: string | null;
  readonly net_expected_cents: string | null;
  readonly owner: string | null;
  /**
   * The share's lines at each stage now, from the same lines (absent in a report generated before the
   * headline read them): those still at actionable (not written off, not yet approved or recovered) and
   * their variance; and the recovery ledger's payer approved and recovered (at the practice's proof
   * level, net of recoupments and reversals) for the share's lines, and for the case as a whole when it
   * holds no other run's line. The headline is the sum of these over the cases.
   */
  readonly actionable_now_lines?: number;
  readonly actionable_now_cents?: string;
  readonly payer_approved_cents?: string;
  readonly recovered_cents?: string;
  /**
   * How many of the case's submissions were sent without sign-off when the report was generated (the founder's ruling of
   * 2026-10-20; docs/adr/0061): their export's pricing went stale after it was made, so it was never attested, and the
   * payer's answer is tracked as for any submission. Present only when there is one.
   */
  readonly unattested_submissions?: number;
  /**
   * Present, and true, when the case's corrections paid nothing more because the patient's share took them
   * (docs/adr/0067): one of its lines is such a correction, and every other line not written off is one too or is
   * payer approved or recovered. Said after the state, which stays as stored; counted in no figure.
   */
  readonly patient_balance?: true;
}

export interface ReportAnomaly {
  readonly anomaly_id: string;
  readonly label: typeof INVESTIGATORY;
  readonly payer: string;
  readonly plan: string;
  readonly procedure_code: string;
  readonly modifiers: readonly string[];
  readonly place_of_service: string | null;
  readonly quarter: string;
  readonly cohort_size: number;
  readonly modal_allowed_cents: string;
  readonly flagged_lines: number;
  readonly range_low_cents: string;
  readonly range_high_cents: string;
  readonly reviewed: boolean;
  readonly validation_requested: boolean;
}

/**
 * What makes the deadlines of a report's DEADLINE_UNVERIFIED lines verified, by what holds them back (D17 a; audit item
 * #5): a contract window is cited and checked on a corrected version; a contract window cited with a rule the product
 * does not compute yet (business days, months, or counted from another date than the payment date) waits, and the
 * report states no date for it, since the date the engine counts may be earlier or later than the contract's; a
 * contract silent on its window has its window entered and cited there too, since the release's commercial default is
 * never verified; a Medicare window needs a rule release whose record is verified to L2; and a Medicare Advantage
 * non-contracted window waits for the product-wide answer on its dispute route (golden QUESTIONS Q34). Each remedy that
 * applies, in that order, once.
 */
export function deadlineRemedy(causes: readonly (DeadlineUnverifiedCause | null)[]): string {
  const contract = causes.some((cause) => cause === null || (cause.startsWith('CONTRACT_') && cause !== 'CONTRACT_WINDOW_RULE_NOT_COMPUTED') || cause === 'NEXT_LEVEL_UNCITED');
  const notComputed = causes.includes('CONTRACT_WINDOW_RULE_NOT_COMPUTED');
  const silent = causes.includes('COMMERCIAL_DEFAULT');
  const release = causes.some((cause) => cause === 'RECORD_NOT_IN_RELEASE' || cause === 'RECORD_BELOW_LEVEL' || cause === 'RELEASE_WITHDRAWN' || cause === 'NEXT_LEVEL_DIFFERS');
  const route = causes.includes('MA_ROUTE_UNCONFIRMED');
  const remedies = [
    ...(contract ? ['For a contract window, have the contract specialist cite the contract’s dispute window on its page and check it on a corrected version, then sign the version off and price the lines again'] : []),
    ...(notComputed
      ? [
          'For a contract window counted in business days or months, or from a date other than the payment date, the product does not compute that rule yet, so it states no deadline for these lines (the date it would count may be earlier or later than the contract’s): keep the contract’s own deadline; these lines wait until the product computes that rule',
        ]
      : []),
    ...(silent ? ['For a contract silent on its window, the release’s default is never verified: have the contract specialist enter the window the contract states, cite it and check it on a corrected version'] : []),
    ...(release ? ['For a Medicare window, the lines are priced again under a rule release whose Medicare dispute windows a second reader verified to level L2'] : []),
    ...(route
      ? [
          'For a Medicare Advantage non-contracted line, the deadline waits for the product-wide answer on which dispute route applies (the plan’s own payment dispute policy or a Medicare redetermination; golden question Q34), which the contract specialist is answering and a later release of the product applies; nothing in this practice changes it, and no packet of such a line goes out until then: work the plan’s own dispute policy outside the product',
        ]
      : []),
  ];
  return remedies.join('. ');
}

export interface EvidenceGap {
  readonly kind: 'unpriced' | 'no_window' | 'deadline_unverified' | 'ma_confirmation' | 'pursuit_settings';
  readonly reason: string | null;
  readonly lines: number;
  readonly charge_cents: string | null;
  readonly detail: string;
  readonly remedy: string;
}

export interface AuditReportContent {
  readonly format: typeof REPORT_FORMAT;
  readonly report_id: string;
  readonly practice: { readonly name: string };
  readonly run: {
    readonly pricing_run_id: string;
    readonly period_from: string;
    readonly period_to: string;
    readonly release_no: number;
    readonly manifest_sha256: string;
    readonly engine_version: string;
    readonly completed_at: string;
  };
  readonly as_of: string;
  readonly settings: {
    readonly line_materiality_cents: string;
    readonly case_materiality_cents: string;
    readonly anomaly_minimum_cohort: number;
    readonly anomaly_threshold_cents: string;
  };
  readonly headline: {
    readonly actionable_cents: string;
    readonly actionable_lines: number;
    readonly payer_approved_cents: string;
    readonly recovered_cents: string;
    readonly flagged_lines: number;
    readonly flagged_range_low_cents: string;
    readonly flagged_range_high_cents: string;
    readonly validated_lines: number;
    readonly validated_cents: string;
    readonly labels: typeof STAGE_LABELS;
  };
  readonly coverage: {
    readonly lines: number;
    readonly charge_cents: string;
    readonly priced_lines: number;
    readonly priced_charge_cents: string;
    readonly reasons: readonly { readonly reason: UnpricedReason; readonly lines: number; readonly charge_cents: string; readonly remedy: string }[];
  };
  readonly anomalies: readonly ReportAnomaly[];
  readonly validated: {
    readonly lines: number;
    readonly variance_cents: string;
    readonly patterns: readonly ReportPattern[];
    /** The validated lines that are not actionable, by why (a line counts under each reason that holds). */
    readonly not_actionable: readonly { readonly reason: string; readonly lines: number; readonly variance_cents: string }[];
  };
  readonly overpaid: { readonly lines: number; readonly variance_cents: string };
  readonly cases: readonly ReportCase[];
  readonly pursuit: { readonly estimated: boolean; readonly cost_cents: string | null; readonly net_expected_cents: string | null };
  readonly evidence_gaps: readonly EvidenceGap[];
}

/** One line of the run, as the line CSV lists it. */
export interface ReportLine {
  readonly priced_line_id: string;
  readonly service_line_id: string;
  readonly payer_claim_control_number: string;
  readonly line_no: number;
  readonly service_date: string;
  readonly procedure_code: string;
  readonly modifiers: readonly string[];
  readonly units: string;
  readonly payer: string;
  readonly plan: string;
  readonly charge_cents: string;
  readonly observed_allowed_cents: string;
  readonly expected_allowed_cents: string | null;
  readonly variance_cents: string | null;
  /** The shortfall the line validates (its variance; for a per-visit line, at most its visit's net); null when it validates nothing. */
  readonly validated_cents: string | null;
  /** For a line of a per-visit visit, the visit's net variance (the sum of its lines'); null otherwise. */
  readonly visit_variance_cents: string | null;
  readonly unpriced_reason: string | null;
  readonly window_ends_on: string | null;
  /** The line's stage now (flagged, validated, actionable), or empty. */
  readonly stage: string;
  /**
   * actionable, payer_approved or recovered (in a case through this run's pricing, not written off, at
   * that stage now), written_off, not_actionable, held, in_case_other_run (in a case through another
   * run's pricing of it), overpaid, paid_as_expected, with_visit (a per-visit line the visit's carrying
   * line counts for), unpriced.
   */
  readonly status: string;
  /** Why it is not actionable, or its write-off reason. */
  readonly reasons: readonly string[];
  /** The review flags it was priced with (an NCCI procedure-to-procedure edit, naming the column-1 line). */
  readonly review_flags: readonly { readonly flag: string; readonly column1_line_no: number }[];
  readonly behavior: AdjustmentBehavior | null;
  readonly case_id: string | null;
  readonly anomaly_id: string | null;
}

interface LineRow {
  readonly priced_line_id: string;
  readonly practice_id: string;
  readonly service_line_id: string;
  readonly expected_allowed_cents: string | null;
  readonly observed_allowed_cents: string;
  readonly variance_cents: string | null;
  readonly unpriced_reason: string | null;
  readonly window_ends_on: string | null;
  readonly contract_version_id: string | null;
  readonly rate_record_id: string | null;
  readonly mapping_kind: string | null;
  /** Whether the mapping it priced under is still the plan's mapping in force on its service date (payer_plan_mapping_in_force()). */
  readonly mapping_in_force: boolean;
  readonly version_status: string | null;
  /** Whether the version still covers the line's service date (true without a version). */
  readonly version_covers_service: boolean;
  /** Whether the run's rule release has been withdrawn since. */
  readonly release_withdrawn: boolean;
  readonly line_no: number;
  readonly procedure_code: string;
  readonly modifiers: readonly string[] | null;
  readonly units: string;
  readonly service_date: string;
  readonly charge_cents: string;
  readonly payer_claim_control_number: string;
  readonly payer_id: string;
  readonly payer_name: string;
  readonly plan_id: string;
  readonly plan_name: string;
  readonly reversed: boolean;
  readonly superseded: boolean;
  readonly stage: string | null;
  readonly case_id: string | null;
  /** Whether the line's case line names this run's priced line (else another run's pricing of the line). */
  readonly case_in_run: boolean | null;
  readonly written_off_reason: WriteOffReason | null;
  readonly trace: unknown;
  readonly per_visit: { readonly carrier_line_no: number } | null;
  readonly visit_variance_cents: string | null;
  readonly review_flags: readonly { readonly flag: string; readonly column1_line_no: number }[];
}

interface CaseRow {
  readonly id: string;
  readonly pattern_key: { readonly behavior: AdjustmentBehavior; readonly mapping_kind: string };
  readonly payer_name: string;
  readonly plan_name: string;
  readonly rate_record_id: string | null;
  readonly state: string;
  readonly deadline_on: string | null;
  readonly actionable_cents: string;
  readonly case_actionable_cents: string;
  readonly case_deadline_on: string | null;
  readonly case_lines: string;
  readonly materiality_cents: string;
  readonly pursuit_cost_cents: string | null;
  readonly owner: string | null;
  readonly lines: string;
  readonly open_lines: string;
  readonly written_off_cents: string;
  readonly unattested_submissions: number;
}

interface AnomalyRow {
  readonly id: string;
  readonly cohort_key: { readonly payer_id: string; readonly plan_id: string; readonly procedure_code: string; readonly modifiers: readonly string[]; readonly place_of_service: string | null; readonly quarter: string };
  readonly cohort_size: number;
  readonly modal_allowed_cents: string;
  readonly stats: { readonly flagged_lines: number; readonly range_low_cents: string; readonly range_high_cents: string };
  readonly line_ids: readonly string[];
  readonly reviewed: boolean;
  readonly validation_requested: boolean;
  readonly payer_name: string;
  readonly plan_name: string;
}

export interface GatherInput {
  readonly practiceId: string;
  readonly auditReportId: string;
  readonly pricingRunId: string;
  readonly asOf: string;
  readonly requestId: string;
  readonly cipher: PracticeCipher;
}

const text = (value: Cents) => centsToString(value);
const sum = (values: readonly string[]) => sumCents(values.map(parseCents));

/**
 * The run's lines, each with what the report reads of it: its claim, plan and payer, its stage now, its case line, the
 * trace of a line with a shortfall, its visit's net and its review flags. $1 is the pricing run, $2 the practice.
 * gatherReport reads it through a cursor, REPORT_BATCH_LINES rows at a time (SUITE-CAP-1a D14; docs/adr/0083).
 */
const RUN_LINES_QUERY = `WITH current_stage AS (
     SELECT DISTINCT ON (s.service_line_id) s.service_line_id, s.stage FROM line_status s WHERE s.practice_id = $2 ORDER BY s.service_line_id, s.seq DESC
   )
   SELECT p.id AS priced_line_id, p.practice_id, p.service_line_id, p.expected_allowed_cents::text, p.observed_allowed_cents::text, p.variance_cents::text,
          p.unpriced_reason, p.window_ends_on::text, p.contract_version_id, p.rate_record_id, m.mapping_kind, v.status AS version_status,
          coalesce(payer_plan_mapping_in_force(l.payer_plan_key, coalesce(l.service_date, c.service_from)) = p.mapping_id, false) AS mapping_in_force,
          (p.contract_version_id IS NULL OR coalesce(v.effective_from <= coalesce(l.service_date, c.service_from)
             AND (v.effective_to IS NULL OR coalesce(l.service_date, c.service_from) < v.effective_to), false)) AS version_covers_service,
          EXISTS (SELECT 1 FROM pricing_run r JOIN rule_release_withdrawal w ON w.release_no = r.release_no WHERE r.id = p.pricing_run_id) AS release_withdrawn,
          l.line_no, l.procedure_code, l.modifiers, trim_scale(coalesce(l.units, 1))::text AS units, coalesce(l.service_date, c.service_from)::text AS service_date,
          l.charge_cents::text, c.payer_claim_control_number, py.id AS payer_id, py.name_raw AS payer_name, pl.id AS plan_id, coalesce(pl.name, pl.plan_key) AS plan_name,
          (c.claim_status_code = '22' OR EXISTS (SELECT 1 FROM claim x WHERE x.reversal_of_claim_id = c.id)) AS reversed,
          c.superseded_by_claim_id IS NOT NULL AS superseded,
          cs.stage, cl.case_id, cl.priced_line_id = p.id AS case_in_run, cl.written_off_reason,
          CASE WHEN p.variance_cents > 0 THEN p.trace END AS trace,
          CASE WHEN jsonb_typeof(p.trace #> '{steps,per_visit}') = 'object' THEN p.trace #> '{steps,per_visit}' END AS per_visit,
          priced_line_visit_variance_cents(p.id)::text AS visit_variance_cents,
          coalesce(p.trace #> '{outcome,review_flags}', '[]'::jsonb) AS review_flags
     FROM priced_line p
     JOIN service_line l ON l.id = p.service_line_id
     JOIN claim c ON c.id = l.claim_id
     JOIN plan pl ON pl.id = l.payer_plan_key
     JOIN payer py ON py.id = pl.payer_id
     LEFT JOIN payer_plan_mapping m ON m.id = p.mapping_id
     LEFT JOIN contract_version v ON v.id = p.contract_version_id
     LEFT JOIN current_stage cs ON cs.service_line_id = p.service_line_id
     LEFT JOIN case_line cl ON cl.service_line_id = p.service_line_id
    WHERE p.pricing_run_id = $1 AND p.practice_id = $2`;

/** How many of the run's lines the report holds at a time (SUITE-CAP-1a D14, D18; docs/adr/0083). */
export const REPORT_BATCH_LINES = 2000;

/**
 * The cases holding lines this run priced, each with this run's share (its case lines whose priced line
 * is this run's) beside the whole case (the database's total and deadline over every run's lines).
 */
async function runCases(client: ScopeClient, input: GatherInput): Promise<CaseRow[]> {
  const { rows } = await client.query<CaseRow>(
    `SELECT c.id, c.pattern_key, py.name_raw AS payer_name, coalesce(pl.name, pl.plan_key) AS plan_name, c.rate_record_id, c.state,
            min(p.window_ends_on) FILTER (WHERE p.pricing_run_id = $1 AND cl.written_off_reason IS NULL)::text AS deadline_on,
            coalesce(sum(p.variance_cents) FILTER (WHERE p.pricing_run_id = $1 AND cl.written_off_reason IS NULL), 0)::text AS actionable_cents,
            c.actionable_cents::text AS case_actionable_cents, c.deadline_on::text AS case_deadline_on, count(cl.id)::text AS case_lines,
            c.materiality_cents::text, c.pursuit_cost_cents::text, u.email AS owner,
            count(cl.id) FILTER (WHERE p.pricing_run_id = $1)::text AS lines,
            count(cl.id) FILTER (WHERE p.pricing_run_id = $1 AND cl.written_off_reason IS NULL)::text AS open_lines,
            coalesce(sum(p.variance_cents) FILTER (WHERE p.pricing_run_id = $1 AND cl.written_off_reason IS NOT NULL), 0)::text AS written_off_cents,
            (SELECT count(*) FROM submission s WHERE s.case_id = c.id AND s.practice_id = c.practice_id AND s.unattested_reason IS NOT NULL)::int AS unattested_submissions
       FROM "case" c
       JOIN payer py ON py.id = c.payer_id
       JOIN plan pl ON pl.id = c.plan_id
       LEFT JOIN "user" u ON u.id = c.owner_user_id
       JOIN case_line cl ON cl.case_id = c.id
       JOIN priced_line p ON p.id = cl.priced_line_id
      WHERE c.practice_id = $2
      GROUP BY c.id, py.name_raw, pl.name, pl.plan_key, u.email
     HAVING count(cl.id) FILTER (WHERE p.pricing_run_id = $1) > 0
      ORDER BY py.name_raw, coalesce(pl.name, pl.plan_key), c.opened_at, c.id`,
    [input.pricingRunId, input.practiceId],
  );
  return rows;
}

/**
 * The cases, of those named, whose corrections paid nothing more because the patient's share took them (docs/adr/0067):
 * the one rule the Reconciliation and case screens read too (reconcile/patient-share.ts casePatientBalance), over every
 * line of the case, whichever run priced it. The case lines are read through a cursor REPORT_BATCH_LINES at a time and
 * the rule folded per case (foldPatientBalance), each batch's corrections read from the practice's ledger entries as
 * the caller read them (SUITE-CAP-1a D18; docs/adr/0083): a line's correction reads its own claim alone, so a batch
 * answers each of its lines as one call for every line would. The lines come in their claim's order, so a batch holds
 * whole claims (but at its edges) and the batches together read each claim's lines and chain once, as one call did;
 * in no order, each batch would read the claims of nearly all its lines again (2.6 times the rows at 100,000 lines).
 */
export async function patientBalanceCases(scope: PracticeScope<ScopeClient>, practiceId: string, caseIds: readonly string[], entries: readonly StoredEntry[]): Promise<Set<string>> {
  if (caseIds.length === 0) {
    return new Set();
  }
  const { client } = scope;
  const folds = new Map<string, PatientBalanceFold>();
  await client.query(
    `DECLARE report_case_lines NO SCROLL CURSOR FOR
     SELECT cl.case_id, cl.service_line_id, cl.written_off_reason IS NOT NULL AS written_off,
            (SELECT s.stage FROM line_status s WHERE s.service_line_id = cl.service_line_id ORDER BY s.seq DESC LIMIT 1) AS stage
       FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id
      WHERE cl.practice_id = $1 AND cl.case_id = ANY ($2::uuid[])
      ORDER BY l.claim_id, cl.service_line_id`,
    [practiceId, caseIds],
  );
  for (;;) {
    const { rows } = await client.query<{ case_id: string; service_line_id: string; written_off: boolean; stage: string | null }>(`FETCH ${REPORT_BATCH_LINES} FROM report_case_lines`);
    if (rows.length === 0) {
      break;
    }
    const corrections = await lineCorrections(
      scope,
      practiceId,
      rows.map((row) => row.service_line_id),
      entries,
    );
    for (const row of rows) {
      const line = { correction: corrections.get(row.service_line_id)?.correction ?? null, writtenOff: row.written_off, stage: row.stage };
      folds.set(row.case_id, foldPatientBalance(folds.get(row.case_id) ?? PATIENT_BALANCE_UNSEEN, line));
    }
    if (rows.length < REPORT_BATCH_LINES) {
      break;
    }
  }
  await client.query('CLOSE report_case_lines');
  const qualifies = new Set<string>();
  for (const [caseId, fold] of folds) {
    if (patientBalanceOf(fold)) {
      qualifies.add(caseId);
    }
  }
  return qualifies;
}

async function runAnomalies(client: ScopeClient, input: GatherInput): Promise<AnomalyRow[]> {
  const { rows } = await client.query<AnomalyRow>(
    `SELECT a.id, a.cohort_key, a.cohort_size, a.modal_allowed_cents::text, a.stats, a.line_ids, a.reviewed_at IS NOT NULL AS reviewed,
            a.validation_requested_at IS NOT NULL AS validation_requested, py.name_raw AS payer_name, coalesce(pl.name, pl.plan_key) AS plan_name
       FROM anomaly a
       JOIN plan pl ON pl.id = (a.cohort_key ->> 'plan_id')::uuid
       JOIN payer py ON py.id = pl.payer_id
      WHERE a.pricing_run_id = $1 AND a.practice_id = $2
      ORDER BY py.name_raw, coalesce(pl.name, pl.plan_key), a.cohort_key ->> 'procedure_code', a.cohort_key ->> 'quarter', a.id`,
    [input.pricingRunId, input.practiceId],
  );
  return rows;
}

/**
 * The report's reasons for a validated line held because its trace read the MPPR or the MUE on a date its release does
 * not load them for (CONTENT_NOT_LOADED, audit #7), one per content read, so the report names which (fix round 2 of PR
 * #49, UX-10): `CONTENT_NOT_LOADED:mppr`, `:mue` or `:mppr_mue`.
 */
export const CONTENT_NOT_LOADED_REASONS = ['CONTENT_NOT_LOADED:mppr', 'CONTENT_NOT_LOADED:mue', 'CONTENT_NOT_LOADED:mppr_mue'] as const;

/** The reason of a line from the content reads its release does not load: MPPR, MUE, or both. */
export function contentNotLoadedReason(gaps: readonly ContentRead[]): (typeof CONTENT_NOT_LOADED_REASONS)[number] {
  const families = new Set(gaps.map((gap) => familyOf(gap.content)));
  return families.has('mppr') && families.has('mue') ? 'CONTENT_NOT_LOADED:mppr_mue' : families.has('mue') ? 'CONTENT_NOT_LOADED:mue' : 'CONTENT_NOT_LOADED:mppr';
}

/** What the mapping of a line reads besides its row: the run's release, settings and anomalies, and its batch's deadlines. */
interface LineReading {
  readonly input: GatherInput;
  readonly settings: TriageSettings;
  readonly references: BehaviorReferences;
  readonly spans: ContentSpans;
  readonly anomalyOf: ReadonlyMap<string, string>;
  readonly deadlines: ReadonlyMap<string, DeadlineVerification>;
}

/**
 * A run's line as the report counts it and the line CSV lists it, with the content-not-loaded reason of a line whose
 * trace read MPPR or MUE content its release does not load for its date (null otherwise). The trace is parsed and
 * dropped here.
 */
function reportLineOf(row: LineRow, reading: LineReading): { readonly line: ReportLine; readonly contentKey: string | null } {
  const { input, settings, references, spans, anomalyOf, deadlines } = reading;
  // A contract window cited in a rule the engine does not compute yet has no end the report can state or judge.
  const windowRuleComputed = deadlines.get(row.priced_line_id)?.cause !== 'CONTRACT_WINDOW_RULE_NOT_COMPUTED';
  const variance = row.variance_cents === null ? null : parseCents(row.variance_cents);
  const visit = row.visit_variance_cents === null ? null : parseCents(row.visit_variance_cents);
  const trace = row.trace === null ? null : parseTrace(row.trace);
  const gaps = trace === null ? [] : contentGapsOf(trace, spans);
  const contentKey = gaps.length > 0 ? contentNotLoadedReason(gaps) : null;
  const judged = judgeLine(
    {
      varianceCents: variance,
      windowEndsOn: row.window_ends_on,
      deadlineStatus: deadlines.get(row.priced_line_id)?.status ?? 'unverified',
      windowRuleComputed,
      claimReversed: row.reversed,
      claimSuperseded: row.superseded,
      mappingKind: row.mapping_kind,
      mappingInForce: row.mapping_in_force,
      contractVersionStatus: row.version_status,
      contractVersionCoversService: row.version_covers_service,
      releaseWithdrawn: row.release_withdrawn,
      contentNotLoaded: gaps.length > 0,
      writtenOff: false,
      visitVarianceCents: visit,
      reviewFlags: row.review_flags.map((flag) => flag.flag),
    },
    settings.lineMaterialityCents,
    input.asOf,
  );
  const validatedCents = judged.validatedCents;
  const behavior = trace === null || validatedCents === null ? null : detectBehavior(trace, references);
  // A per-visit line counts with its visit: on the line that carries it, at the visit's net.
  const counted = row.per_visit === null ? variance : row.per_visit.carrier_line_no === row.line_no ? visit : null;
  let status: string;
  let reasons: string[] = [];
  if (row.unpriced_reason !== null) {
    status = 'unpriced';
  } else if (row.per_visit !== null && row.per_visit.carrier_line_no !== row.line_no) {
    status = 'with_visit';
  } else if (counted !== null && counted < 0n) {
    status = 'overpaid';
  } else if (validatedCents === null) {
    status = 'paid_as_expected';
  } else if (row.case_id !== null && row.case_in_run === true) {
    // A case line past actionable is counted at its stage now (the ledger moved it), never as actionable too.
    status = row.written_off_reason !== null ? 'written_off' : row.stage === 'payer_approved' || row.stage === 'recovered' ? row.stage : 'actionable';
    reasons = row.written_off_reason === null ? [] : [row.written_off_reason];
  } else if (row.case_id !== null) {
    status = 'in_case_other_run';
    reasons = ['CASE_LINE_FROM_OTHER_RUN'];
  } else {
    status = judged.actionable ? 'held' : 'not_actionable';
    reasons = judged.actionable ? ['BELOW_CASE_MATERIALITY'] : [...judged.reasons];
  }
  const line: ReportLine = {
    priced_line_id: row.priced_line_id,
    service_line_id: row.service_line_id,
    payer_claim_control_number: input.cipher.decrypt('claim.payer_claim_control_number', row.payer_claim_control_number),
    line_no: row.line_no,
    service_date: row.service_date,
    procedure_code: row.procedure_code,
    modifiers: (row.modifiers ?? []).filter((modifier) => modifier !== ''),
    units: row.units,
    payer: row.payer_name,
    plan: row.plan_name,
    charge_cents: row.charge_cents,
    observed_allowed_cents: row.observed_allowed_cents,
    expected_allowed_cents: row.expected_allowed_cents,
    variance_cents: row.variance_cents,
    validated_cents: status === 'with_visit' || validatedCents === null ? null : centsToString(validatedCents),
    visit_variance_cents: row.visit_variance_cents,
    unpriced_reason: row.unpriced_reason,
    window_ends_on: windowRuleComputed ? row.window_ends_on : null,
    stage: row.stage ?? '',
    status,
    reasons,
    review_flags: row.review_flags,
    behavior,
    case_id: row.case_id,
    anomaly_id: anomalyOf.get(row.service_line_id) ?? null,
  };
  return { line, contentKey };
}

/** A count of lines and the sum of an amount of theirs, in integer cents. */
interface Tally {
  lines: number;
  cents: Cents;
}

const noLines = (): Tally => ({ lines: 0, cents: ZERO_CENTS });

function tallied(into: Tally, amount: string): void {
  into.lines += 1;
  into.cents = cents(into.cents + parseCents(amount));
}

/** A pattern of the validated lines: its key's fields, its lines and their total, and the first of its lines in the report's order. */
interface PatternFigures {
  readonly key: Omit<ReportPattern, 'lines' | 'variance_cents'>;
  readonly tally: Tally;
  first: LineOrderKey;
}

/**
 * The report's running figures over the run's lines (SUITE-CAP-1a D14, design 5.3 point 2; docs/adr/0083), one field
 * per filter the whole read ran over its lines, each a count and a sum in integer cents, so folding the lines a batch
 * at a time, in any order, gives the integers the whole read gave. Where the whole read's order followed its sorted
 * lines (a pattern's place among patterns that tie on the report's sort), a pattern keeps its first line in the
 * report's order and the patterns' sort breaks the tie by it.
 */
interface ReportFigures {
  /** The lines that validate a shortfall, and its sum. */
  readonly validated: Tally;
  /** The validated lines by payer pattern (payer, plan, mapping kind, contract version, rate record, behavior). */
  readonly patterns: Map<string, PatternFigures>;
  /** The validated lines by why each is not actionable, one per reason the report lists (by its place in the list), and their validated sum. */
  readonly notActionable: Map<number, Tally>;
  /** The overpaid lines and what each counts (its variance, or the visit's net on the line carrying it). */
  readonly overpaid: Tally;
  /** By case, the lines still actionable and their variance. */
  readonly actionableNow: Map<string, Tally>;
  /** By case, the service lines of the case this run priced (one ID per case line of the run). */
  readonly inRun: Map<string, Set<string>>;
  /** The validated lines with no window, and with a deadline not verified: their billed sum. */
  readonly noWindow: Tally;
  readonly unverified: Tally;
  /** What holds back the unverified deadlines (null for a line with none read): deadlineRemedy reads membership only. */
  readonly unverifiedCauses: Set<DeadlineVerification['cause'] | null>;
}

function reportFigures(): ReportFigures {
  return {
    validated: noLines(),
    patterns: new Map(),
    notActionable: new Map(),
    overpaid: noLines(),
    actionableNow: new Map(),
    inRun: new Map(),
    noWindow: noLines(),
    unverified: noLines(),
    unverifiedCauses: new Set(),
  };
}

/** The reasons the report lists a validated line under as not actionable, in its order. */
function notActionableReasons(): string[] {
  return [
    // CONTENT_NOT_LOADED by the content its lines' traces read (UX-10): the report names which.
    ...NOT_ACTIONABLE_REASONS.filter((reason) => reason !== 'WRITTEN_OFF').flatMap((reason) => (reason === 'CONTENT_NOT_LOADED' ? CONTENT_NOT_LOADED_REASONS : [reason])),
    'BELOW_CASE_MATERIALITY',
    'CASE_LINE_FROM_OTHER_RUN',
    ...Object.keys(WRITE_OFF_TEXT).map((reason) => `written_off:${reason}`),
  ];
}

/** What an overpaid line counts: its variance, or for the line carrying a visit the visit's net. */
const overpaidCents = (line: ReportLine): string => line.visit_variance_cents ?? line.variance_cents ?? '0';

/** Adds one line to the figures; nothing of the line is kept but its share of them. */
function foldLine(figures: ReportFigures, reasonsListed: readonly string[], row: LineRow, line: ReportLine, contentKey: string | null, deadlines: ReadonlyMap<string, DeadlineVerification>): void {
  if (row.case_id !== null && row.case_in_run === true) {
    figures.inRun.set(row.case_id, (figures.inRun.get(row.case_id) ?? new Set()).add(row.service_line_id));
  }
  if (line.case_id !== null && line.status === 'actionable') {
    const still = figures.actionableNow.get(line.case_id) ?? noLines();
    tallied(still, line.variance_cents ?? '0');
    figures.actionableNow.set(line.case_id, still);
  }
  if (line.status === 'overpaid') {
    tallied(figures.overpaid, overpaidCents(line));
  }
  if (line.validated_cents === null) {
    return;
  }
  tallied(figures.validated, line.validated_cents);
  const behavior = line.behavior ?? 'BELOW_CONTRACT_RATE';
  const key = JSON.stringify([row.payer_name, row.plan_name, row.mapping_kind, row.contract_version_id, row.rate_record_id, behavior]);
  const order: LineOrderKey = {
    payer: line.payer,
    plan: line.plan,
    payer_claim_control_number: line.payer_claim_control_number,
    line_no: line.line_no,
    service_line_id: line.service_line_id,
  };
  let pattern = figures.patterns.get(key);
  if (pattern === undefined) {
    pattern = {
      key: {
        payer: row.payer_name,
        plan: row.plan_name,
        mapping_kind: row.mapping_kind ?? 'contract',
        contract_version_id: row.contract_version_id,
        rate_record_id: row.rate_record_id,
        behavior,
        behavior_text: BEHAVIOR_TEXT[behavior],
      },
      tally: noLines(),
      first: order,
    };
    figures.patterns.set(key, pattern);
  } else if (compareLineOrder(order, pattern.first) < 0) {
    pattern.first = order;
  }
  tallied(pattern.tally, line.validated_cents);
  for (const [place, reason] of reasonsListed.entries()) {
    const matches = reason.startsWith('written_off:')
      ? line.status === 'written_off' && line.reasons.includes(reason.slice('written_off:'.length))
      : reason.startsWith('CONTENT_NOT_LOADED:')
        ? line.reasons.includes('CONTENT_NOT_LOADED') && contentKey === reason
        : line.reasons.includes(reason);
    if (matches) {
      const entry = figures.notActionable.get(place) ?? noLines();
      tallied(entry, line.validated_cents);
      figures.notActionable.set(place, entry);
    }
  }
  if (line.reasons.includes('NO_WINDOW')) {
    tallied(figures.noWindow, line.charge_cents);
  }
  if (line.reasons.includes('DEADLINE_UNVERIFIED')) {
    tallied(figures.unverified, line.charge_cents);
    figures.unverifiedCauses.add(deadlines.get(line.priced_line_id)?.cause ?? null);
  }
}

/**
 * Everything the report shows as of the report's triage date, and its line CSV held in an arena for the caller to
 * stream and release. The run's lines are read through a cursor REPORT_BATCH_LINES at a time (SUITE-CAP-1a D14, D17,
 * D18; docs/adr/0083): each batch is audited (one event per row read), its deadlines read, each row mapped to its line,
 * the line folded into the figures and its CSV row appended to the arena, and the batch dropped. The cursor lives in
 * the job's transaction and is closed before this returns; an error aborts the transaction, which ends it.
 */
export async function gatherReport(scope: PracticeScope<ScopeClient>, input: GatherInput): Promise<{ readonly content: AuditReportContent; readonly arena: CsvArena }> {
  const { client } = scope;
  const run = (
    await client.query<{ id: string; period_from: string; period_to: string; release_no: number; engine_version: string; coverage: unknown; completed_at: Date; manifest_sha256: string }>(
      `SELECT r.id, r.period_from::text, r.period_to::text, r.release_no, r.engine_version, r.coverage, r.completed_at, rr.manifest_sha256
         FROM pricing_run r JOIN rule_release rr ON rr.release_no = r.release_no WHERE r.id = $1 AND r.practice_id = $2 AND ${RUN_IN_EFFECT('r')}`,
      [input.pricingRunId, input.practiceId],
    )
  ).rows[0];
  if (run === undefined) {
    throw new Error('the audit report’s pricing run is not the run in effect for its period');
  }
  const practice = (await client.query<{ name: string; settings: unknown }>('SELECT name, settings FROM practice WHERE id = $1', [input.practiceId])).rows[0];
  const settings: TriageSettings = triageSettings(practice?.settings ?? {});
  const coverage = parseCoverage(run.coverage);
  // The run's release, for its MPPR rates and conversion factors alone (audit #31), and the spans of the contents it loads (audit #7).
  const references = releaseReferences(await typedRelease(client, run.release_no, BEHAVIOR_RECORD_TYPES));
  const spans = await releaseContentSpans(client, run.release_no);

  const anomalyRows = await runAnomalies(client, input);
  const anomalyOf = new Map<string, string>();
  for (const row of anomalyRows) {
    for (const lineId of row.line_ids) {
      anomalyOf.set(lineId, row.id);
    }
  }
  const caseRows = await runCases(client, input);

  const figures = reportFigures();
  const reasonsListed = notActionableReasons();
  const arena = new CsvArena();
  try {
    await client.query(`DECLARE report_lines NO SCROLL CURSOR FOR ${RUN_LINES_QUERY}`, [input.pricingRunId, input.practiceId]);
    for (;;) {
      const batch = await readWithAudit(
        scope,
        { objectType: 'priced_line', purpose: 'audit_report', requestId: input.requestId },
        async (reader) => (await reader.query<LineRow>(`FETCH ${REPORT_BATCH_LINES} FROM report_lines`)).rows,
        (row) => ({ objectId: row.priced_line_id, practiceId: row.practice_id }),
      );
      if (batch.length === 0) {
        break;
      }
      // Whether each line's deadline is verified (D17 a), as triage judged it.
      const deadlines = await lineDeadlines(
        client,
        batch.map((row) => row.priced_line_id),
      );
      const reading: LineReading = { input, settings, references, spans, anomalyOf, deadlines };
      for (const row of batch) {
        const { line, contentKey } = reportLineOf(row, reading);
        foldLine(figures, reasonsListed, row, line, contentKey, deadlines);
        arena.append(line);
      }
      if (batch.length < REPORT_BATCH_LINES) {
        break;
      }
    }
    await client.query('CLOSE report_lines');
  } catch (error) {
    arena.release();
    throw error;
  }

  const notActionable = reasonsListed
    .map((reason, place) => {
      const entry = figures.notActionable.get(place) ?? noLines();
      return { reason, lines: entry.lines, variance_cents: text(entry.cents) };
    })
    .filter((entry) => entry.lines > 0);

  // The recovery ledger, read as it stands (docs/adr/0042): each case's entries for its lines this run priced
  // (and for the case as a whole when it holds no other run's line), at the practice's proof level. Read once, for
  // the cases' totals and their patient balances (D18).
  const { proofLevel } = await practiceLedgerSettings(scope, input.practiceId);
  const ledger: readonly StoredEntry[] = caseRows.length === 0 ? [] : await ledgerEntries(scope, input.practiceId);
  const byId = entriesById(ledger);
  const actionableNow = (caseId: string) => figures.actionableNow.get(caseId) ?? noLines();
  const ledgerOf = (row: CaseRow) => {
    const share = figures.inRun.get(row.id) ?? new Set<string>();
    const whole = row.case_lines === row.lines;
    return ledgerTotals(
      ledger.filter((entry) => entry.caseId === row.id && (entry.serviceLineId === null ? whole : share.has(entry.serviceLineId))),
      proofLevel,
      byId,
    );
  };

  const patientBalance = await patientBalanceCases(
    scope,
    input.practiceId,
    caseRows.map((row) => row.id),
    ledger,
  );

  const cases: ReportCase[] = caseRows.map((row) => {
    const still = actionableNow(row.id);
    const stillCents = still.cents;
    const totals = ledgerOf(row);
    const pursuit = row.pursuit_cost_cents === null ? null : parseCents(row.pursuit_cost_cents);
    // What pursuing the case may still bring: its lines still actionable, less the cost.
    const net = netExpectedValue(stillCents, pursuit);
    return {
      case_id: row.id,
      payer: row.payer_name,
      plan: row.plan_name,
      mapping_kind: row.pattern_key.mapping_kind,
      rate_record_id: row.rate_record_id,
      behavior: row.pattern_key.behavior,
      behavior_text: BEHAVIOR_TEXT[row.pattern_key.behavior],
      state: row.state,
      deadline_on: row.deadline_on,
      lines: Number.parseInt(row.lines, 10),
      actionable_lines: Number.parseInt(row.open_lines, 10),
      actionable_cents: row.actionable_cents,
      written_off_lines: Number.parseInt(row.lines, 10) - Number.parseInt(row.open_lines, 10),
      written_off_cents: row.written_off_cents,
      case_lines: Number.parseInt(row.case_lines, 10),
      case_actionable_cents: row.case_actionable_cents,
      case_deadline_on: row.case_deadline_on,
      materiality_cents: row.materiality_cents,
      pursuit_cost_cents: row.pursuit_cost_cents,
      net_expected_cents: net === null ? null : text(net),
      owner: row.owner,
      actionable_now_lines: still.lines,
      actionable_now_cents: text(stillCents),
      payer_approved_cents: text(totals.payerApprovedCents),
      recovered_cents: text(totals.recoveredCents),
      ...(row.unattested_submissions > 0 ? { unattested_submissions: row.unattested_submissions } : {}),
      ...(patientBalance.has(row.id) ? { patient_balance: true as const } : {}),
    };
  });
  const openCases = cases.filter((item) => item.state === 'open');
  // The headline is the cases table's columns summed: the same lines, each at its stage now.
  const pursued = cases.filter((item) => (item.actionable_now_lines ?? 0) > 0);
  const actionableCents = sum(cases.map((item) => item.actionable_now_cents ?? '0'));
  const actionableLines = cases.reduce((total, item) => total + (item.actionable_now_lines ?? 0), 0);
  const anomalies: ReportAnomaly[] = anomalyRows.map((row) => ({
    anomaly_id: row.id,
    label: INVESTIGATORY,
    payer: row.payer_name,
    plan: row.plan_name,
    procedure_code: row.cohort_key.procedure_code,
    modifiers: row.cohort_key.modifiers,
    place_of_service: row.cohort_key.place_of_service,
    quarter: row.cohort_key.quarter,
    cohort_size: row.cohort_size,
    modal_allowed_cents: row.modal_allowed_cents,
    flagged_lines: row.stats.flagged_lines,
    range_low_cents: row.stats.range_low_cents,
    range_high_cents: row.stats.range_high_cents,
    reviewed: row.reviewed,
    validation_requested: row.validation_requested,
  }));
  const shown = headline({
    actionableCents,
    actionableLines,
    payerApprovedCents: sum(cases.map((item) => item.payer_approved_cents ?? '0')),
    recoveredCents: sum(cases.map((item) => item.recovered_cents ?? '0')),
    flaggedLines: anomalies.reduce((total, item) => total + item.flagged_lines, 0),
    flaggedRangeLowCents: sum(anomalies.map((item) => item.range_low_cents)),
    flaggedRangeHighCents: sum(anomalies.map((item) => item.range_high_cents)),
    validatedLines: figures.validated.lines,
    validatedCents: figures.validated.cents,
  });

  const pursuitCosts = pursued.map((item) => item.pursuit_cost_cents);
  const estimated = pursued.length > 0 && pursuitCosts.every((value) => value !== null);
  const pursuitTotal = estimated ? sum(pursuitCosts) : null;
  const gaps: EvidenceGap[] = [];
  for (const entry of coverage.reasons) {
    if (entry.lines > 0) {
      gaps.push({ kind: 'unpriced', reason: entry.reason, lines: entry.lines, charge_cents: entry.charge_cents, detail: UNPRICED_REMEDIES[entry.reason].meaning, remedy: UNPRICED_REMEDIES[entry.reason].remedy });
    }
  }
  const { noWindow, unverified } = figures;
  if (noWindow.lines > 0) {
    gaps.push({
      kind: 'no_window',
      reason: 'NO_WINDOW',
      lines: noWindow.lines,
      charge_cents: text(noWindow.cents),
      detail: 'No dispute window is known for these validated lines: the contract states none and the release has no default for them',
      remedy: 'Obtain the contract’s dispute terms',
    });
  }
  if (unverified.lines > 0) {
    gaps.push({
      kind: 'deadline_unverified',
      reason: 'DEADLINE_UNVERIFIED',
      lines: unverified.lines,
      charge_cents: text(unverified.cents),
      detail:
        'The dispute deadline of these validated lines is not verified (D17 a): their contract’s window is not cited and verified on its page or cites a rule the product does not compute yet, the release’s window is its commercial default or below L2, or the Medicare Advantage dispute route is not confirmed, so they are not actionable',
      remedy: deadlineRemedy([...figures.unverifiedCauses]),
    });
  }
  const maCases = openCases.filter((item) => item.mapping_kind === 'ma_noncontracted');
  if (maCases.length > 0) {
    gaps.push({
      kind: 'ma_confirmation',
      reason: null,
      lines: maCases.reduce((total, item) => total + item.actionable_lines, 0),
      charge_cents: null,
      detail: `${String(maCases.length)} Medicare Advantage non-contracted case(s) price from the public fee schedule under 42 CFR 422.214; their dispute deadline is not verified until the product-wide question of which dispute route applies is answered (golden question Q34), so no packet of theirs is exported until then`,
      remedy:
        'Which dispute route Medicare Advantage non-contracted lines take (the plan’s own payment dispute policy or a Medicare redetermination) is a product-wide question the contract specialist is answering, which a later release of the product applies; nothing in this practice changes it. Until then, work the plan’s own dispute policy outside the product; a reimbursement specialist also confirms the regulation applies to each case before a packet goes out',
    });
  }
  if (settings.pursuit === null) {
    gaps.push({
      kind: 'pursuit_settings',
      reason: null,
      lines: 0,
      charge_cents: null,
      detail: 'The practice has not set its staff rate and the minutes a packet and a follow-up take, so no pursuit cost is estimated',
      remedy: 'Set the staff rate, minutes per packet and minutes per follow-up',
    });
  }

  const content: AuditReportContent = {
    format: REPORT_FORMAT,
    report_id: input.auditReportId,
    practice: { name: practice?.name ?? '' },
    run: {
      pricing_run_id: run.id,
      period_from: run.period_from,
      period_to: run.period_to,
      release_no: run.release_no,
      manifest_sha256: run.manifest_sha256,
      engine_version: run.engine_version,
      completed_at: run.completed_at.toISOString(),
    },
    as_of: input.asOf,
    settings: {
      line_materiality_cents: text(settings.lineMaterialityCents),
      case_materiality_cents: text(settings.caseMaterialityCents),
      anomaly_minimum_cohort: settings.anomalyMinimumCohort,
      anomaly_threshold_cents: text(settings.anomalyThresholdCents),
    },
    headline: {
      actionable_cents: text(shown.figures[0].cents),
      actionable_lines: actionableLines,
      payer_approved_cents: text(shown.figures[1].cents),
      recovered_cents: text(shown.figures[2].cents),
      flagged_lines: shown.flagged.lines,
      flagged_range_low_cents: text(shown.flagged.rangeLowCents),
      flagged_range_high_cents: text(shown.flagged.rangeHighCents),
      validated_lines: shown.validated.lines,
      validated_cents: text(shown.validated.cents),
      labels: STAGE_LABELS,
    },
    coverage: {
      lines: coverage.lines,
      charge_cents: coverage.charge_cents,
      priced_lines: coverage.priced.lines,
      priced_charge_cents: coverage.priced.charge_cents,
      reasons: coverage.reasons.filter((entry) => entry.lines > 0).map((entry) => ({ ...entry, remedy: UNPRICED_REMEDIES[entry.reason].remedy })),
    },
    anomalies,
    validated: {
      lines: figures.validated.lines,
      variance_cents: text(figures.validated.cents),
      // Patterns tied on the sort keep the order of their first lines in the report's order, as the whole read's did.
      patterns: [...figures.patterns.values()]
        .sort(
          (a, b) =>
            compareText(a.key.payer, b.key.payer) ||
            compareText(a.key.plan, b.key.plan) ||
            compareText(a.key.behavior, b.key.behavior) ||
            compareText(a.key.rate_record_id ?? '', b.key.rate_record_id ?? '') ||
            compareLineOrder(a.first, b.first),
        )
        .map((entry) => ({ ...entry.key, lines: entry.tally.lines, variance_cents: text(entry.tally.cents) })),
      not_actionable: notActionable,
    },
    overpaid: { lines: figures.overpaid.lines, variance_cents: text(figures.overpaid.cents) },
    cases,
    pursuit: { estimated, cost_cents: pursuitTotal === null ? null : text(pursuitTotal), net_expected_cents: pursuitTotal === null ? null : text(cents(actionableCents - pursuitTotal)) },
    evidence_gaps: gaps,
  };
  return { content, arena };
}
