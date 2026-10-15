import { type EncryptedColumn, type PracticeCipher, type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import { parseCents, sumCents } from '@tp/money';
import { type AdjustmentBehavior, BEHAVIOR_TEXT, type DeadlineState, type LineStage, type WriteOffReason, deadlineState, netExpectedValue, triageSettings } from '@tp/triage';

/**
 * The Anomalies and Cases reads (PRD 7, Anomalies and Cases; PRD 12; PRD 8, The status machine;
 * docs/adr/0038). Every read runs in the request's practice scope under the practice's policies, and
 * every anomaly, case line and service line returned is an audited read (readWithAudit). Amounts are
 * integer cents as text; nothing here computes an expected amount: a case's total and deadline are
 * the database's (derived from its lines), a line's variance its pricing run's.
 *
 * Claim control numbers and the words people wrote (a write-off's "other", a reopen's reason) are
 * decrypted only for the roles that read PHI; the others see the line by date, code and amounts.
 */

type Scope = PracticeScope<ScopeClient>;

/** A complete pricing run, for choosing one to triage or report on. */
export interface RunChoice {
  readonly id: string;
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly releaseNo: number;
  readonly completedAt: string;
}

/** The practice's complete runs, newest first. */
export async function completeRuns(scope: Scope, practiceId: string): Promise<RunChoice[]> {
  const { rows } = await scope.client.query<{ id: string; period_from: string; period_to: string; release_no: number; completed_at: Date }>(
    `SELECT id, period_from::text, period_to::text, release_no, completed_at FROM pricing_run
      WHERE practice_id = $1 AND status = 'complete' ORDER BY completed_at DESC, id DESC LIMIT 100`,
    [practiceId],
  );
  return rows.map((row) => ({ id: row.id, periodFrom: row.period_from, periodTo: row.period_to, releaseNo: row.release_no, completedAt: row.completed_at.toISOString() }));
}

/** Whether the practice's run is complete (triage and reports read complete runs only). */
export async function isCompleteRun(scope: Scope, practiceId: string, runId: string): Promise<boolean> {
  const { rowCount } = await scope.client.query("SELECT 1 FROM pricing_run WHERE id = $1 AND practice_id = $2 AND status = 'complete'", [runId, practiceId]);
  return rowCount === 1;
}

/** The practice's triage settings, read from its settings (the defaults where it names none). */
export async function practiceTriageSettings(scope: Scope, practiceId: string) {
  const { rows } = await scope.client.query<{ settings: unknown }>('SELECT settings FROM practice WHERE id = $1', [practiceId]);
  return triageSettings(rows[0]?.settings ?? {});
}

export interface AnomalyView {
  readonly id: string;
  readonly runId: string;
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly payer: string;
  readonly plan: string;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly placeOfService: string | null;
  readonly quarter: string;
  readonly cohortSize: number;
  /** The modal observed allowed per unit. */
  readonly modalAllowedCents: string;
  readonly stats: {
    readonly min_cents: string;
    readonly p25_cents: string;
    readonly median_cents: string;
    readonly p75_cents: string;
    readonly max_cents: string;
    readonly modal_lines: number;
    readonly threshold_cents: string;
    readonly below_mode_lines: number;
    readonly flagged_lines: number;
    readonly flagged_observed_cents: string;
    readonly range_low_cents: string;
    readonly range_high_cents: string;
  };
  readonly lineIds: readonly string[];
  readonly reviewedAt: string | null;
  readonly reviewedBy: string | null;
  readonly validationRequestedAt: string | null;
  readonly validationRequestedBy: string | null;
}

interface AnomalyRow {
  readonly id: string;
  readonly practice_id: string;
  readonly pricing_run_id: string;
  readonly period_from: string;
  readonly period_to: string;
  readonly payer: string;
  readonly plan: string;
  readonly cohort_key: { readonly procedure_code: string; readonly modifiers: readonly string[]; readonly place_of_service: string | null; readonly quarter: string };
  readonly cohort_size: number;
  readonly modal_allowed_cents: string;
  readonly stats: AnomalyView['stats'];
  readonly line_ids: readonly string[];
  readonly reviewed_at: Date | null;
  readonly reviewed_by: string | null;
  readonly validation_requested_at: Date | null;
  readonly validation_requested_by: string | null;
}

const ANOMALIES = `
  SELECT a.id, a.practice_id, a.pricing_run_id, r.period_from::text, r.period_to::text, py.name_raw AS payer, coalesce(pl.name, pl.plan_key) AS plan,
         a.cohort_key, a.cohort_size, a.modal_allowed_cents::text, a.stats, a.line_ids,
         a.reviewed_at, ru.email AS reviewed_by, a.validation_requested_at, vu.email AS validation_requested_by
    FROM anomaly a
    JOIN pricing_run r ON r.id = a.pricing_run_id
    JOIN plan pl ON pl.id = (a.cohort_key ->> 'plan_id')::uuid
    JOIN payer py ON py.id = pl.payer_id
    LEFT JOIN "user" ru ON ru.id = a.reviewed_by
    LEFT JOIN "user" vu ON vu.id = a.validation_requested_by`;

function anomalyView(row: AnomalyRow): AnomalyView {
  return {
    id: row.id,
    runId: row.pricing_run_id,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    payer: row.payer,
    plan: row.plan,
    procedureCode: row.cohort_key.procedure_code,
    modifiers: row.cohort_key.modifiers,
    placeOfService: row.cohort_key.place_of_service,
    quarter: row.cohort_key.quarter,
    cohortSize: row.cohort_size,
    modalAllowedCents: row.modal_allowed_cents,
    stats: row.stats,
    lineIds: row.line_ids,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    reviewedBy: row.reviewed_by,
    validationRequestedAt: row.validation_requested_at?.toISOString() ?? null,
    validationRequestedBy: row.validation_requested_by,
  };
}

/**
 * The practice's anomalies at or above its minimum cohort size (PRD 7: "hidden for cohorts under the
 * minimum size"; triage writes none below it, and one written under a lower minimum stays hidden),
 * newest period first.
 */
export async function listAnomalies(scope: Scope, practiceId: string, minimumCohort: number, requestId: string): Promise<AnomalyView[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'anomaly', purpose: 'anomaly_review', requestId },
    async (client) =>
      (
        await client.query<AnomalyRow>(
          `${ANOMALIES} WHERE a.practice_id = $1 AND a.cohort_size >= $2
            ORDER BY r.period_from DESC, r.completed_at DESC, py.name_raw, coalesce(pl.name, pl.plan_key), a.cohort_key ->> 'procedure_code', a.cohort_key ->> 'quarter', a.id LIMIT 200`,
          [practiceId, minimumCohort],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  return rows.map(anomalyView);
}

export async function anomalyOf(scope: Scope, practiceId: string, anomalyId: string, minimumCohort: number, requestId: string): Promise<AnomalyView | undefined> {
  const [row] = await readWithAudit(
    scope,
    { objectType: 'anomaly', purpose: 'anomaly_review', requestId },
    async (client) => (await client.query<AnomalyRow>(`${ANOMALIES} WHERE a.id = $1 AND a.practice_id = $2 AND a.cohort_size >= $3`, [anomalyId, practiceId, minimumCohort])).rows,
    (found) => ({ objectId: found.id, practiceId: found.practice_id }),
  );
  return row === undefined ? undefined : anomalyView(row);
}

/** One flagged line of a cohort: what it was paid against the cohort's mode for its units. */
export interface FlaggedLine {
  readonly serviceLineId: string;
  readonly serviceDate: string;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly units: string;
  readonly observedAllowedCents: string;
  /** The mode per unit times the line's units, rounded to the cent. */
  readonly modalForUnitsCents: string;
  readonly shortCents: string;
  /** For the roles that read PHI; null otherwise. */
  readonly payerClaimControlNumber: string | null;
}

export async function flaggedLines(scope: Scope, practiceId: string, anomaly: AnomalyView, cipher: PracticeCipher | null, requestId: string): Promise<FlaggedLine[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'service_line', purpose: 'anomaly_review', requestId },
    async (client) =>
      (
        await client.query<{
          id: string;
          practice_id: string;
          service_date: string;
          procedure_code: string;
          modifiers: readonly string[] | null;
          units: string;
          observed_allowed_cents: string;
          modal_cents: string;
          payer_claim_control_number: string;
        }>(
          `SELECT l.id, l.practice_id, coalesce(l.service_date, c.service_from)::text AS service_date, l.procedure_code, l.modifiers,
                  trim_scale(coalesce(l.units, 1))::text AS units, l.observed_allowed_cents::text,
                  round($3::numeric * coalesce(l.units, 1))::bigint::text AS modal_cents, c.payer_claim_control_number
             FROM service_line l JOIN claim c ON c.id = l.claim_id
            WHERE l.id = ANY ($1::uuid[]) AND l.practice_id = $2
            ORDER BY coalesce(l.service_date, c.service_from), l.id`,
          [anomaly.lineIds, practiceId, anomaly.modalAllowedCents],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  return rows.map((row) => ({
    serviceLineId: row.id,
    serviceDate: row.service_date,
    procedureCode: row.procedure_code,
    modifiers: (row.modifiers ?? []).filter((modifier) => modifier !== ''),
    units: row.units,
    observedAllowedCents: row.observed_allowed_cents,
    modalForUnitsCents: row.modal_cents,
    shortCents: (parseCents(row.modal_cents) - parseCents(row.observed_allowed_cents)).toString(),
    payerClaimControlNumber: cipher === null ? null : cipher.decrypt('claim.payer_claim_control_number', row.payer_claim_control_number),
  }));
}

export type CaseState = 'open' | 'submitted' | 'awaiting_response' | 'partially_resolved' | 'resolved' | 'closed_written_off';

export interface CaseSummary {
  readonly id: string;
  readonly state: CaseState;
  readonly payer: string;
  readonly plan: string;
  readonly mappingKind: string;
  readonly behavior: AdjustmentBehavior;
  readonly behaviorText: string;
  readonly lines: number;
  readonly openLines: number;
  readonly actionableCents: string;
  readonly writtenOffCents: string;
  readonly deadlineOn: string | null;
  readonly deadline: DeadlineState;
  readonly materialityCents: string;
  readonly pursuitCostCents: string | null;
  readonly netExpectedCents: string | null;
  readonly owner: string | null;
  readonly openedAt: string;
  readonly closedAt: string | null;
}

interface CaseRow {
  readonly id: string;
  readonly practice_id: string;
  readonly state: CaseState;
  readonly payer: string;
  readonly plan: string;
  readonly pattern_key: { readonly mapping_kind: string; readonly behavior: AdjustmentBehavior };
  readonly lines: string;
  readonly open_lines: string;
  readonly actionable_cents: string;
  readonly written_off_cents: string;
  readonly deadline_on: string | null;
  readonly materiality_cents: string;
  readonly pursuit_cost_cents: string | null;
  readonly owner: string | null;
  readonly opened_at: Date;
  readonly closed_at: Date | null;
}

const CASES = `
  SELECT c.id, c.practice_id, c.state, py.name_raw AS payer, coalesce(pl.name, pl.plan_key) AS plan, c.pattern_key,
         (SELECT count(*) FROM case_line x WHERE x.case_id = c.id)::text AS lines,
         (SELECT count(*) FROM case_line x WHERE x.case_id = c.id AND x.written_off_reason IS NULL)::text AS open_lines,
         c.actionable_cents::text,
         (SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id WHERE x.case_id = c.id AND x.written_off_reason IS NOT NULL)::text AS written_off_cents,
         c.deadline_on::text, c.materiality_cents::text, c.pursuit_cost_cents::text, u.email AS owner, c.opened_at, c.closed_at
    FROM "case" c
    JOIN payer py ON py.id = c.payer_id
    JOIN plan pl ON pl.id = c.plan_id
    LEFT JOIN "user" u ON u.id = c.owner_user_id`;

function caseSummary(row: CaseRow, asOf: string): CaseSummary {
  const net = netExpectedValue(parseCents(row.actionable_cents), row.pursuit_cost_cents === null ? null : parseCents(row.pursuit_cost_cents));
  return {
    id: row.id,
    state: row.state,
    payer: row.payer,
    plan: row.plan,
    mappingKind: row.pattern_key.mapping_kind,
    behavior: row.pattern_key.behavior,
    behaviorText: BEHAVIOR_TEXT[row.pattern_key.behavior],
    lines: Number.parseInt(row.lines, 10),
    openLines: Number.parseInt(row.open_lines, 10),
    actionableCents: row.actionable_cents,
    writtenOffCents: row.written_off_cents,
    deadlineOn: row.deadline_on,
    deadline: deadlineState(row.deadline_on, asOf),
    materialityCents: row.materiality_cents,
    pursuitCostCents: row.pursuit_cost_cents,
    netExpectedCents: net === null ? null : net.toString(),
    owner: row.owner,
    openedAt: row.opened_at.toISOString(),
    closedAt: row.closed_at?.toISOString() ?? null,
  };
}

/** The practice's cases: open ones first by deadline, then the closed. */
export async function listCases(scope: Scope, practiceId: string, asOf: string, requestId: string): Promise<CaseSummary[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'case', purpose: 'case_review', requestId },
    async (client) =>
      (
        await client.query<CaseRow>(`${CASES} WHERE c.practice_id = $1 ORDER BY (c.state = 'open') DESC, c.deadline_on ASC NULLS LAST, c.opened_at, c.id LIMIT 500`, [practiceId])
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  return rows.map((row) => caseSummary(row, asOf));
}

export async function caseOf(scope: Scope, practiceId: string, caseId: string, asOf: string, requestId: string): Promise<CaseSummary | undefined> {
  const [row] = await readWithAudit(
    scope,
    { objectType: 'case', purpose: 'case_review', requestId },
    async (client) => (await client.query<CaseRow>(`${CASES} WHERE c.id = $1 AND c.practice_id = $2`, [caseId, practiceId])).rows,
    (found) => ({ objectId: found.id, practiceId: found.practice_id }),
  );
  return row === undefined ? undefined : caseSummary(row, asOf);
}

export interface CaseLineView {
  readonly id: string;
  readonly serviceLineId: string;
  readonly pricingRunId: string;
  readonly lineNo: number;
  readonly serviceDate: string;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly units: string;
  readonly expectedAllowedCents: string | null;
  readonly observedAllowedCents: string;
  readonly varianceCents: string;
  readonly windowEndsOn: string | null;
  /** Whether its window has closed (it is struck through, out of the total: WINDOW_PASSED). */
  readonly windowPassed: boolean;
  readonly actionable: boolean;
  readonly writtenOffReason: WriteOffReason | null;
  /** The "other" reason's words, for the roles that read PHI. */
  readonly writtenOffText: string | null;
  /** Who wrote it off; null when triage did because its window passed. */
  readonly writtenOffBy: string | null;
  readonly writtenOffAt: string | null;
  readonly reopenReason: string | null;
  readonly reopenedBy: string | null;
  readonly reopenedAt: string | null;
  readonly payerClaimControlNumber: string | null;
}

export interface CaseEvent {
  readonly at: string;
  readonly serviceLineId: string;
  readonly lineNo: number;
  readonly kind: 'stage' | 'reopened_stage' | 'written_off' | 'reopened';
  readonly stage: LineStage | null;
  readonly reopenedFrom: LineStage | null;
  readonly writeOffReason: WriteOffReason | null;
  /** Who: a person's email, or null for triage (a job). */
  readonly by: string | null;
}

export interface CaseDetail {
  readonly lines: readonly CaseLineView[];
  readonly events: readonly CaseEvent[];
}

interface CaseLineRow {
  readonly id: string;
  readonly practice_id: string;
  readonly service_line_id: string;
  readonly pricing_run_id: string;
  readonly line_no: number;
  readonly service_date: string;
  readonly procedure_code: string;
  readonly modifiers: readonly string[] | null;
  readonly units: string;
  readonly expected_allowed_cents: string | null;
  readonly observed_allowed_cents: string;
  readonly variance_cents: string;
  readonly window_ends_on: string | null;
  readonly window_passed: boolean;
  readonly actionable: boolean;
  readonly written_off_reason: WriteOffReason | null;
  readonly written_off_text: string | null;
  readonly written_off_by: string | null;
  readonly written_off_at: Date | null;
  readonly reopen_reason: string | null;
  readonly reopened_by: string | null;
  readonly reopened_at: Date | null;
  readonly payer_claim_control_number: string;
}

/** A case's lines (each with its priced line and its write-off or reopen) and its timeline. */
export async function caseDetail(scope: Scope, practiceId: string, caseId: string, cipher: PracticeCipher | null, requestId: string): Promise<CaseDetail> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'case_line', purpose: 'case_review', requestId },
    async (client) =>
      (
        await client.query<CaseLineRow>(
          `SELECT cl.id, cl.practice_id, cl.service_line_id, p.pricing_run_id, l.line_no, coalesce(l.service_date, c.service_from)::text AS service_date,
                  l.procedure_code, l.modifiers, trim_scale(coalesce(l.units, 1))::text AS units,
                  p.expected_allowed_cents::text, p.observed_allowed_cents::text, p.variance_cents::text, p.window_ends_on::text,
                  (p.window_ends_on IS NOT NULL AND p.window_ends_on < (now() AT TIME ZONE 'UTC')::date) AS window_passed,
                  cl.actionable, cl.written_off_reason, cl.written_off_text, wu.email AS written_off_by, cl.written_off_at,
                  cl.reopen_reason, ru.email AS reopened_by, cl.reopened_at, c.payer_claim_control_number
             FROM case_line cl
             JOIN priced_line p ON p.id = cl.priced_line_id
             JOIN service_line l ON l.id = cl.service_line_id
             JOIN claim c ON c.id = l.claim_id
             LEFT JOIN "user" wu ON wu.id = cl.written_off_by
             LEFT JOIN "user" ru ON ru.id = cl.reopened_by
            WHERE cl.case_id = $1 AND cl.practice_id = $2
            ORDER BY coalesce(l.service_date, c.service_from), l.line_no, cl.id`,
          [caseId, practiceId],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  const decrypt = (column: EncryptedColumn, value: string | null) => (cipher === null || value === null ? null : cipher.decrypt(column, value));
  const lines: CaseLineView[] = rows.map((row) => ({
    id: row.id,
    serviceLineId: row.service_line_id,
    pricingRunId: row.pricing_run_id,
    lineNo: row.line_no,
    serviceDate: row.service_date,
    procedureCode: row.procedure_code,
    modifiers: (row.modifiers ?? []).filter((modifier) => modifier !== ''),
    units: row.units,
    expectedAllowedCents: row.expected_allowed_cents,
    observedAllowedCents: row.observed_allowed_cents,
    varianceCents: row.variance_cents,
    windowEndsOn: row.window_ends_on,
    windowPassed: row.window_passed,
    actionable: row.actionable,
    writtenOffReason: row.written_off_reason,
    writtenOffText: decrypt('case_line.written_off_text', row.written_off_text),
    writtenOffBy: row.written_off_by,
    writtenOffAt: row.written_off_at?.toISOString() ?? null,
    reopenReason: decrypt('case_line.reopen_reason', row.reopen_reason),
    reopenedBy: row.reopened_by,
    reopenedAt: row.reopened_at?.toISOString() ?? null,
    payerClaimControlNumber: decrypt('claim.payer_claim_control_number', row.payer_claim_control_number),
  }));
  const lineNo = new Map(lines.map((line) => [line.serviceLineId, line.lineNo]));
  const { rows: stages } = await scope.client.query<{ service_line_id: string; stage: LineStage; reopened_from: LineStage | null; set_at: Date; set_by: string | null }>(
    `SELECT s.service_line_id, s.stage, s.reopened_from, s.set_at, u.email AS set_by
       FROM line_status s LEFT JOIN "user" u ON u.id = s.set_by
      WHERE s.practice_id = $2 AND s.service_line_id = ANY ($1::uuid[]) ORDER BY s.seq`,
    [lines.map((line) => line.serviceLineId), practiceId],
  );
  const events: CaseEvent[] = stages.map((row) => ({
    at: row.set_at.toISOString(),
    serviceLineId: row.service_line_id,
    lineNo: lineNo.get(row.service_line_id) ?? 0,
    kind: row.reopened_from === null ? 'stage' : 'reopened_stage',
    stage: row.stage,
    reopenedFrom: row.reopened_from,
    writeOffReason: null,
    by: row.set_by,
  }));
  for (const line of lines) {
    if (line.writtenOffAt !== null) {
      events.push({ at: line.writtenOffAt, serviceLineId: line.serviceLineId, lineNo: line.lineNo, kind: 'written_off', stage: null, reopenedFrom: null, writeOffReason: line.writtenOffReason, by: line.writtenOffBy });
    }
    if (line.reopenedAt !== null) {
      events.push({ at: line.reopenedAt, serviceLineId: line.serviceLineId, lineNo: line.lineNo, kind: 'reopened', stage: null, reopenedFrom: null, writeOffReason: null, by: line.reopenedBy });
    }
  }
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.lineNo - b.lineNo));
  return { lines, events };
}

/** A case line of the practice, as a write-off or a reopen finds it. */
export interface CaseLineState {
  readonly id: string;
  readonly caseId: string;
  readonly serviceLineId: string;
  readonly writtenOffReason: WriteOffReason | null;
  readonly windowEndsOn: string | null;
  readonly windowPassed: boolean;
}

export async function caseLineState(scope: Scope, practiceId: string, caseLineId: string): Promise<CaseLineState | undefined> {
  const { rows } = await scope.client.query<{ id: string; case_id: string; service_line_id: string; written_off_reason: WriteOffReason | null; window_ends_on: string | null; window_passed: boolean }>(
    `SELECT cl.id, cl.case_id, cl.service_line_id, cl.written_off_reason, p.window_ends_on::text,
            (p.window_ends_on IS NOT NULL AND p.window_ends_on < (now() AT TIME ZONE 'UTC')::date) AS window_passed
       FROM case_line cl JOIN priced_line p ON p.id = cl.priced_line_id
      WHERE cl.id = $1 AND cl.practice_id = $2 FOR UPDATE OF cl`,
    [caseLineId, practiceId],
  );
  const row = rows[0];
  return row === undefined
    ? undefined
    : { id: row.id, caseId: row.case_id, serviceLineId: row.service_line_id, writtenOffReason: row.written_off_reason, windowEndsOn: row.window_ends_on, windowPassed: row.window_passed };
}

/** The line's current stage, and the priced line it was judged from. */
export async function currentStage(scope: Scope, serviceLineId: string): Promise<LineStage | null> {
  const { rows } = await scope.client.query<{ stage: LineStage }>('SELECT stage FROM line_status WHERE service_line_id = $1 ORDER BY seq DESC LIMIT 1', [serviceLineId]);
  return rows[0]?.stage ?? null;
}

/** The sum of the open cases' actionable totals, for the Cases screen's own total (never mixed with another stage). */
export function openActionableCents(cases: readonly CaseSummary[]): string {
  return sumCents(cases.filter((item) => item.state === 'open').map((item) => parseCents(item.actionableCents))).toString();
}
