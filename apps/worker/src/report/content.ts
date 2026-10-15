import { type PracticeCipher, type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import { type Cents, centsToString, cents, parseCents, sumCents } from '@tp/money';
import { type UnpricedReason, parseTrace } from '@tp/pricing';
import {
  type AdjustmentBehavior,
  BEHAVIOR_TEXT,
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
import { loadRuleRelease } from '../price/release';
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
 *   that is not actionable is not;
 * - actionable: the cases, each total the sum of its lines not written off, with its deadline, pursuit
 *   cost and net expected value;
 * - payer approved and recovered: zero until the recovery ledger has entries (milestone 9);
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
  readonly deadline_on: string | null;
  readonly lines: number;
  readonly actionable_lines: number;
  readonly actionable_cents: string;
  readonly written_off_lines: number;
  readonly written_off_cents: string;
  readonly materiality_cents: string;
  readonly pursuit_cost_cents: string | null;
  readonly net_expected_cents: string | null;
  readonly owner: string | null;
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

export interface EvidenceGap {
  readonly kind: 'unpriced' | 'no_window' | 'ma_confirmation' | 'pursuit_settings';
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
  readonly unpriced_reason: string | null;
  readonly window_ends_on: string | null;
  /** The line's stage now (flagged, validated, actionable), or empty. */
  readonly stage: string;
  /** actionable, written_off, not_actionable, held, overpaid, paid_as_expected, unpriced. */
  readonly status: string;
  /** Why it is not actionable, or its write-off reason. */
  readonly reasons: readonly string[];
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
  readonly version_status: string | null;
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
  readonly written_off_reason: WriteOffReason | null;
  readonly trace: unknown;
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
  readonly materiality_cents: string;
  readonly pursuit_cost_cents: string | null;
  readonly owner: string | null;
  readonly lines: string;
  readonly open_lines: string;
  readonly written_off_cents: string;
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

async function runLines(scope: PracticeScope<ScopeClient>, input: GatherInput): Promise<LineRow[]> {
  return readWithAudit(
    scope,
    { objectType: 'priced_line', purpose: 'audit_report', requestId: input.requestId },
    async (client) =>
      (
        await client.query<LineRow>(
          `WITH current_stage AS (
             SELECT DISTINCT ON (s.service_line_id) s.service_line_id, s.stage FROM line_status s WHERE s.practice_id = $2 ORDER BY s.service_line_id, s.seq DESC
           )
           SELECT p.id AS priced_line_id, p.practice_id, p.service_line_id, p.expected_allowed_cents::text, p.observed_allowed_cents::text, p.variance_cents::text,
                  p.unpriced_reason, p.window_ends_on::text, p.contract_version_id, p.rate_record_id, m.mapping_kind, v.status AS version_status,
                  l.line_no, l.procedure_code, l.modifiers, trim_scale(coalesce(l.units, 1))::text AS units, coalesce(l.service_date, c.service_from)::text AS service_date,
                  l.charge_cents::text, c.payer_claim_control_number, py.id AS payer_id, py.name_raw AS payer_name, pl.id AS plan_id, coalesce(pl.name, pl.plan_key) AS plan_name,
                  (c.claim_status_code = '22' OR EXISTS (SELECT 1 FROM claim x WHERE x.reversal_of_claim_id = c.id)) AS reversed,
                  c.superseded_by_claim_id IS NOT NULL AS superseded,
                  cs.stage, cl.case_id, cl.written_off_reason,
                  CASE WHEN p.variance_cents > 0 THEN p.trace END AS trace
             FROM priced_line p
             JOIN service_line l ON l.id = p.service_line_id
             JOIN claim c ON c.id = l.claim_id
             JOIN plan pl ON pl.id = l.payer_plan_key
             JOIN payer py ON py.id = pl.payer_id
             LEFT JOIN payer_plan_mapping m ON m.id = p.mapping_id
             LEFT JOIN contract_version v ON v.id = p.contract_version_id
             LEFT JOIN current_stage cs ON cs.service_line_id = p.service_line_id
             LEFT JOIN case_line cl ON cl.service_line_id = p.service_line_id
            WHERE p.pricing_run_id = $1 AND p.practice_id = $2`,
          [input.pricingRunId, input.practiceId],
        )
      ).rows,
    (row) => ({ objectId: row.priced_line_id, practiceId: row.practice_id }),
  );
}

async function runCases(client: ScopeClient, input: GatherInput): Promise<CaseRow[]> {
  const { rows } = await client.query<CaseRow>(
    `SELECT c.id, c.pattern_key, py.name_raw AS payer_name, coalesce(pl.name, pl.plan_key) AS plan_name, c.rate_record_id, c.state, c.deadline_on::text,
            c.actionable_cents::text, c.materiality_cents::text, c.pursuit_cost_cents::text, u.email AS owner,
            count(cl.id)::text AS lines, count(cl.id) FILTER (WHERE cl.written_off_reason IS NULL)::text AS open_lines,
            coalesce(sum(p.variance_cents) FILTER (WHERE cl.written_off_reason IS NOT NULL), 0)::text AS written_off_cents
       FROM "case" c
       JOIN payer py ON py.id = c.payer_id
       JOIN plan pl ON pl.id = c.plan_id
       LEFT JOIN "user" u ON u.id = c.owner_user_id
       JOIN case_line cl ON cl.case_id = c.id
       JOIN priced_line p ON p.id = cl.priced_line_id
      WHERE c.practice_id = $2 AND EXISTS (SELECT 1 FROM case_line x JOIN priced_line y ON y.id = x.priced_line_id WHERE x.case_id = c.id AND y.pricing_run_id = $1)
      GROUP BY c.id, py.name_raw, pl.name, pl.plan_key, u.email
      ORDER BY py.name_raw, coalesce(pl.name, pl.plan_key), c.opened_at, c.id`,
    [input.pricingRunId, input.practiceId],
  );
  return rows;
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

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Everything the report shows, and its lines, as of the report's triage date. */
export async function gatherReport(scope: PracticeScope<ScopeClient>, input: GatherInput): Promise<{ readonly content: AuditReportContent; readonly lines: readonly ReportLine[] }> {
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
  const references = releaseReferences(await loadRuleRelease(client, run.release_no));

  const anomalyRows = await runAnomalies(client, input);
  const anomalyOf = new Map<string, string>();
  for (const row of anomalyRows) {
    for (const lineId of row.line_ids) {
      anomalyOf.set(lineId, row.id);
    }
  }
  const caseRows = await runCases(client, input);
  const rows = await runLines(scope, input);

  const lines: ReportLine[] = rows.map((row) => {
    const variance = row.variance_cents === null ? null : parseCents(row.variance_cents);
    const behavior = row.trace === null || variance === null || variance <= 0n ? null : detectBehavior(parseTrace(row.trace), references);
    let status: string;
    let reasons: string[] = [];
    if (row.unpriced_reason !== null) {
      status = 'unpriced';
    } else if (variance !== null && variance < 0n) {
      status = 'overpaid';
    } else if (variance === null || variance === 0n) {
      status = 'paid_as_expected';
    } else if (row.case_id !== null) {
      status = row.written_off_reason === null ? 'actionable' : 'written_off';
      reasons = row.written_off_reason === null ? [] : [row.written_off_reason];
    } else {
      const judged = judgeLine(
        {
          varianceCents: variance,
          windowEndsOn: row.window_ends_on,
          claimReversed: row.reversed,
          claimSuperseded: row.superseded,
          mappingKind: row.mapping_kind,
          contractVersionStatus: row.version_status,
          writtenOff: false,
        },
        settings.lineMaterialityCents,
        input.asOf,
      );
      status = judged.actionable ? 'held' : 'not_actionable';
      reasons = judged.actionable ? ['BELOW_CASE_MATERIALITY'] : [...judged.reasons];
    }
    return {
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
      unpriced_reason: row.unpriced_reason,
      window_ends_on: row.window_ends_on,
      stage: row.stage ?? '',
      status,
      reasons,
      behavior,
      case_id: row.case_id,
      anomaly_id: anomalyOf.get(row.service_line_id) ?? null,
    };
  });
  lines.sort(
    (a, b) =>
      compareText(a.payer, b.payer) ||
      compareText(a.plan, b.plan) ||
      compareText(a.payer_claim_control_number, b.payer_claim_control_number) ||
      a.line_no - b.line_no ||
      compareText(a.service_line_id, b.service_line_id),
  );

  const validated = lines.filter((line) => line.variance_cents !== null && parseCents(line.variance_cents) > 0n);
  const overpaid = lines.filter((line) => line.status === 'overpaid');
  const patterns = new Map<string, { readonly key: Omit<ReportPattern, 'lines' | 'variance_cents'>; readonly variances: string[] }>();
  const rowById = new Map(rows.map((row) => [row.priced_line_id, row]));
  for (const line of validated) {
    const row = rowById.get(line.priced_line_id) as LineRow;
    const behavior = line.behavior ?? 'BELOW_CONTRACT_RATE';
    const key = JSON.stringify([row.payer_name, row.plan_name, row.mapping_kind, row.contract_version_id, row.rate_record_id, behavior]);
    const entry = patterns.get(key) ?? {
      key: {
        payer: row.payer_name,
        plan: row.plan_name,
        mapping_kind: row.mapping_kind ?? 'contract',
        contract_version_id: row.contract_version_id,
        rate_record_id: row.rate_record_id,
        behavior,
        behavior_text: BEHAVIOR_TEXT[behavior],
      },
      variances: [],
    };
    entry.variances.push(line.variance_cents as string);
    patterns.set(key, entry);
  }
  const notActionableReasons = [...NOT_ACTIONABLE_REASONS.filter((reason) => reason !== 'WRITTEN_OFF'), 'BELOW_CASE_MATERIALITY', ...Object.keys(WRITE_OFF_TEXT).map((reason) => `written_off:${reason}`)];
  const notActionable = notActionableReasons
    .map((reason) => {
      const matching = validated.filter((line) => (reason.startsWith('written_off:') ? line.status === 'written_off' && line.reasons.includes(reason.slice('written_off:'.length)) : line.reasons.includes(reason)));
      return { reason, lines: matching.length, variance_cents: text(sum(matching.map((line) => line.variance_cents as string))) };
    })
    .filter((entry) => entry.lines > 0);

  const cases: ReportCase[] = caseRows.map((row) => {
    const actionable = parseCents(row.actionable_cents);
    const pursuit = row.pursuit_cost_cents === null ? null : parseCents(row.pursuit_cost_cents);
    const net = netExpectedValue(actionable, pursuit);
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
      materiality_cents: row.materiality_cents,
      pursuit_cost_cents: row.pursuit_cost_cents,
      net_expected_cents: net === null ? null : text(net),
      owner: row.owner,
    };
  });
  const openCases = cases.filter((item) => item.state === 'open');
  const actionableCents = sum(openCases.map((item) => item.actionable_cents));
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
    actionableLines: openCases.reduce((total, item) => total + item.actionable_lines, 0),
    payerApprovedCents: cents(0n),
    recoveredCents: cents(0n),
    flaggedLines: anomalies.reduce((total, item) => total + item.flagged_lines, 0),
    flaggedRangeLowCents: sum(anomalies.map((item) => item.range_low_cents)),
    flaggedRangeHighCents: sum(anomalies.map((item) => item.range_high_cents)),
    validatedLines: validated.length,
    validatedCents: sum(validated.map((line) => line.variance_cents as string)),
  });

  const pursuitCosts = openCases.map((item) => item.pursuit_cost_cents);
  const estimated = openCases.length > 0 && pursuitCosts.every((value) => value !== null);
  const pursuitTotal = estimated ? sum(pursuitCosts) : null;
  const gaps: EvidenceGap[] = [];
  for (const entry of coverage.reasons) {
    if (entry.lines > 0) {
      gaps.push({ kind: 'unpriced', reason: entry.reason, lines: entry.lines, charge_cents: entry.charge_cents, detail: UNPRICED_REMEDIES[entry.reason].meaning, remedy: UNPRICED_REMEDIES[entry.reason].remedy });
    }
  }
  const noWindow = validated.filter((line) => line.reasons.includes('NO_WINDOW'));
  if (noWindow.length > 0) {
    gaps.push({
      kind: 'no_window',
      reason: 'NO_WINDOW',
      lines: noWindow.length,
      charge_cents: text(sum(noWindow.map((line) => line.charge_cents))),
      detail: 'No dispute window is known for these validated lines: the contract states none and the release has no default for them',
      remedy: 'Obtain the contract’s dispute terms',
    });
  }
  const maCases = openCases.filter((item) => item.mapping_kind === 'ma_noncontracted');
  if (maCases.length > 0) {
    gaps.push({
      kind: 'ma_confirmation',
      reason: null,
      lines: maCases.reduce((total, item) => total + item.actionable_lines, 0),
      charge_cents: null,
      detail: `${String(maCases.length)} Medicare Advantage non-contracted case(s) price from the public fee schedule under 42 CFR 422.214`,
      remedy: 'A reimbursement specialist confirms the regulation applies to each case before a packet goes out',
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
      actionable_lines: openCases.reduce((total, item) => total + item.actionable_lines, 0),
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
      lines: validated.length,
      variance_cents: text(sum(validated.map((line) => line.variance_cents as string))),
      patterns: [...patterns.values()]
        .map((entry) => ({ ...entry.key, lines: entry.variances.length, variance_cents: text(sum(entry.variances)) }))
        .sort((a, b) => compareText(a.payer, b.payer) || compareText(a.plan, b.plan) || compareText(a.behavior, b.behavior) || compareText(a.rate_record_id ?? '', b.rate_record_id ?? '')),
      not_actionable: notActionable,
    },
    overpaid: { lines: overpaid.length, variance_cents: text(sum(overpaid.map((line) => line.variance_cents as string))) },
    cases,
    pursuit: { estimated, cost_cents: pursuitTotal === null ? null : text(pursuitTotal), net_expected_cents: pursuitTotal === null ? null : text(cents(actionableCents - pursuitTotal)) },
    evidence_gaps: gaps,
  };
  return { content, lines };
}
