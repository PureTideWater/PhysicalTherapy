import { type KeyProvider, type PracticeScope, type ScopeClient, loadPracticeCipher, readWithAudit } from '@tp/db/runtime';
import {
  type LedgerEntry,
  type PatientShare,
  type PatientShareChange,
  type ShareLine,
  claimAllocations,
  claimLevelShares,
  countedStage,
  entriesById,
  ledgerTotals,
  patientShareChange,
} from '@tp/ledger';
import { type Cents, ZERO_CENTS, centsToString, cents, parseCents, sumCents } from '@tp/money';
import { parseTrace } from '@tp/pricing';
import {
  type AdjustmentBehavior,
  BEHAVIOR_RECORD_TYPES,
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

import { parseCoverage } from '../../price/coverage';
import { RUN_IN_EFFECT } from '../../price/in-effect';
import { contentGapsOf, releaseContentSpans, typedRelease } from '../../price/release';
import { type Scope, ledgerEntries, practiceLedgerSettings } from '../../reconcile/ledger';
import { type LineCorrection, type MatchCorrection, type MatchReading, casePatientBalance } from '../../reconcile/patient-share';
import { type ChainClaim, type ClaimLine, type LineChain, chainContext, claimLines, lineChain } from '../../reconcile/remittances';
import { lineDeadlines } from '../../triage/deadline';
import { wholeTriageInScope } from '../../triage/test-support/whole-triage';
import {
  type AuditReportContent,
  CONTENT_NOT_LOADED_REASONS,
  type EvidenceGap,
  type GatherInput,
  REPORT_FORMAT,
  type ReportAnomaly,
  type ReportCase,
  type ReportLine,
  type ReportPattern,
  contentNotLoadedReason,
  deadlineRemedy,
} from '../content';
import { auditCsv } from '../csv';
import { auditHtml, auditReconciliation } from '../html';
import { UNPRICED_REMEDIES } from '../remedies';

/**
 * For the tests (CAS-41, SUITE-CAP-1a): the audit report's whole read, as it ran before the report streamed, kept as
 * the reference the streamed report is compared with (docs/adr/0083). The text below is content.ts's and
 * patient-share.ts's at 085299bd, word for word: every line of the run read at once with its trace, one deadline read
 * for all of them, the lines sorted and filtered for each figure, the practice's ledger entries read by the report and
 * again by lineCorrections, and the patient's share of each claim's lines found by filtering every adjustment for each
 * claim and each line. Only the names changed: gatherReport is wholeGatherReport, lineCorrections
 * wholeLineCorrections, lineShares wholeLineShares and patientBalanceCases wholePatientBalanceCases, the last two
 * exported. Below it, the reference job (wholeReport) and the report's line order (reportLineOrder, the sort's
 * comparator) are the tests' own. Synthetic data only.
 */

// patient-share.ts, 085299bd (lines 78-99, 101-152, 169-232).

const NO_SHARE: PatientShare = { deductibleCents: ZERO_CENTS, coinsuranceCents: ZERO_CENTS, copayCents: ZERO_CENTS, otherCents: ZERO_CENTS };

const REASON_KEY: Readonly<Record<string, keyof PatientShare>> = { '1': 'deductibleCents', '2': 'coinsuranceCents', '3': 'copayCents' };

interface AdjustmentRow {
  readonly claim_id: string;
  readonly service_line_id: string | null;
  readonly group_code: string;
  readonly reason_code: string;
  readonly amount_cents: string;
}

type ShareCents = Record<keyof PatientShare, bigint>;

const shareKey = (reasonCode: string): keyof PatientShare => REASON_KEY[reasonCode] ?? 'otherCents';

const asShare = (share: ShareCents): PatientShare => ({
  deductibleCents: cents(share.deductibleCents),
  coinsuranceCents: cents(share.coinsuranceCents),
  copayCents: cents(share.copayCents),
  otherCents: cents(share.otherCents),
});

/**
 * The patient's share of every line of the claims named, by service line: its own PR rows by reason, and its part of
 * the claim's CAS at the claim's level by the cash's own rule (remittances.ts claimLines, @tp/ledger claimLevelShares:
 * the same lines take a part, by the same weights, keeping the same parts, the line's one rounded part split over
 * the claim's reasons), its PR reasons the patient's and flagged with the weights it was split by.
 */
export async function wholeLineShares(scope: Scope, practiceId: string, claimIds: readonly string[]): Promise<Map<string, Pick<ShareLine, 'share' | 'allocation'>>> {
  const ids = [...new Set(claimIds)];
  const { rows: adjustments } = await scope.client.query<AdjustmentRow>(
    "SELECT a.claim_id, a.service_line_id, a.group_code, a.reason_code, a.amount_cents::text AS amount_cents FROM adjustment a WHERE a.practice_id = $1 AND a.claim_id = ANY ($2::uuid[]) AND (a.service_line_id IS NULL OR a.group_code = 'PR') ORDER BY a.claim_id, a.position",
    [practiceId, ids],
  );
  const lines = await claimLines(scope, ids);
  const shares = new Map<string, Pick<ShareLine, 'share' | 'allocation'>>();
  for (const [claimId, claimLinesOf] of lines) {
    const atClaim = adjustments.filter((row) => row.claim_id === claimId && row.service_line_id === null);
    const splits = claimLinesOf.map((line) => line.split);
    const parts = claimLevelShares({ lines: splits, reasonCents: atClaim.map((row) => parseCents(row.amount_cents)) });
    const allocations = atClaim.some((row) => row.group_code === 'PR') ? claimAllocations(splits) : splits.map(() => null);
    for (const [index, line] of claimLinesOf.entries()) {
      const share: ShareCents = { ...NO_SHARE };
      for (const row of adjustments.filter((adjustment) => adjustment.service_line_id === line.serviceLineId)) {
        share[shareKey(row.reason_code)] += parseCents(row.amount_cents);
      }
      for (const [position, row] of atClaim.entries()) {
        if (row.group_code === 'PR') {
          share[shareKey(row.reason_code)] += (parts[index] as Cents[])[position] as Cents;
        }
      }
      shares.set(line.serviceLineId, { share: asShare(share), allocation: allocations[index] ?? null });
    }
  }
  return shares;
}

const direction = (next: Cents, baseline: Cents): MatchCorrection['allowed'] => (next > baseline ? 'higher' : next < baseline ? 'lower' : 'same');

function readingOf(outcome: MatchCorrection['outcome'], allowed: MatchCorrection['allowed'], entryCents: Cents, change: PatientShareChange): MatchReading {
  if (outcome === 'no_change') {
    return 'no_change';
  }
  if (outcome === 'decreased') {
    return entryCents < ZERO_CENTS ? 'taken_back' : allowed === 'lower' ? 'payment_did_not_fall' : 'nothing_to_take_back';
  }
  if (entryCents > ZERO_CENTS) {
    return 'approved';
  }
  if (change.paymentIncreaseCents > ZERO_CENTS) {
    return 'confirmed';
  }
  return change.billableCents > ZERO_CENTS ? 'patient_balance' : 'other_reductions';
}

/** The case lines named, each with its claim matches read in payment terms, its correction and its billable to the patient. */
export async function wholeLineCorrections(scope: Scope, practiceId: string, serviceLineIds: readonly string[]): Promise<Map<string, LineCorrection>> {
  const corrections = new Map<string, LineCorrection>();
  if (serviceLineIds.length === 0) {
    return corrections;
  }
  const { rows } = await scope.client.query<{ case_id: string; service_line_id: string; claim_id: string }>(
    'SELECT cl.case_id, cl.service_line_id, l.claim_id FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id WHERE cl.practice_id = $1 AND cl.service_line_id = ANY ($2::uuid[])',
    [practiceId, serviceLineIds],
  );
  const entries = await ledgerEntries(scope, practiceId);
  const byId = entriesById(entries);
  // What each match's own entries approved (net of their corrections).
  const approvedBy = new Map<string, bigint>();
  for (const entry of entries) {
    if (entry.matchId !== null && countedStage(entry, byId) === 'approved') {
      approvedBy.set(entry.matchId, (approvedBy.get(entry.matchId) ?? 0n) + entry.amountCents);
    }
  }
  const context = await chainContext(scope, practiceId, rows.map((row) => row.claim_id), entries);
  const chains = rows.map((row) => ({ row, chain: lineChain(context, { serviceLineId: row.service_line_id, claimId: row.claim_id }) }));
  const shares = await wholeLineShares(
    scope,
    practiceId,
    chains.flatMap(({ chain }) => (chain === undefined ? [] : chain.claims.map((claim) => claim.claimId))),
  );
  const shareLine = (line: ClaimLine): ShareLine => ({ allowedCents: line.observedAllowedCents, paidCents: line.paidCents, ...(shares.get(line.serviceLineId) ?? { share: NO_SHARE, allocation: null }) });
  for (const { row, chain } of chains) {
    if (chain === undefined) {
      continue;
    }
    const lineOf = (matchId: string | null): ClaimLine => chain.claims.find((claim) => (claim.match?.id ?? null) === matchId)?.line ?? chain.original;
    const matches = chain.claims.flatMap((claim): MatchCorrection[] => (claim.match === null ? [] : [matchCorrection(chain, { ...claim, match: claim.match }, approvedBy, context.recouped, lineOf, shareLine)]));
    const latest = matches.filter((match) => match.outcome === 'approved').at(-1);
    const correction = latest !== undefined && (latest.reading === 'patient_balance' || latest.reading === 'other_reductions') ? latest.reading : null;
    const anchor = chain.chain.current.anchorMatchId;
    const billable =
      anchor === null
        ? null
        : patientShareChange({ before: shareLine(chain.original), after: shareLine(lineOf(anchor)), paymentIncreaseCents: cents(lineOf(anchor).paidCents - chain.original.paidCents) });
    corrections.set(row.service_line_id, { caseId: row.case_id, serviceLineId: row.service_line_id, correction, billable, matches });
  }
  return corrections;
}

/** A standing claim match read against the line its baselines stood on just before it. */
function matchCorrection(
  chain: LineChain,
  claim: ChainClaim & { readonly match: NonNullable<ChainClaim['match']> },
  approvedBy: ReadonlyMap<string, bigint>,
  recouped: ReadonlyMap<string, Cents>,
  lineOf: (matchId: string | null) => ClaimLine,
  shareLine: (line: ClaimLine) => ShareLine,
): MatchCorrection {
  const { match } = claim;
  const matchId = match.id;
  const before = chain.chain.before.get(matchId);
  const baselineAllowed = before?.allowedCents ?? chain.original.observedAllowedCents;
  const change = patientShareChange({ before: shareLine(lineOf(before?.anchorMatchId ?? null)), after: shareLine(claim.line), paymentIncreaseCents: chain.chain.net.get(matchId) ?? ZERO_CENTS });
  const outcome = match.outcome ?? 'no_change';
  const allowed = direction(claim.line.observedAllowedCents, baselineAllowed);
  const entryCents = cents((approvedBy.get(matchId) ?? 0n) + (recouped.get(matchId) ?? ZERO_CENTS));
  return { matchId, claimId: claim.claimId, remittanceId: match.remittanceId, outcome, allowed, reading: readingOf(outcome, allowed, entryCents, change), entryCents, change };
}

// content.ts, 085299bd (lines 277-352, 363-484, 499-878).

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
            WHERE p.pricing_run_id = $1 AND p.practice_id = $2`,
          [input.pricingRunId, input.practiceId],
        )
      ).rows,
    (row) => ({ objectId: row.priced_line_id, practiceId: row.practice_id }),
  );
}

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
 * line of the case, whichever run priced it.
 */
export async function wholePatientBalanceCases(scope: PracticeScope<ScopeClient>, practiceId: string, caseIds: readonly string[]): Promise<Set<string>> {
  if (caseIds.length === 0) {
    return new Set();
  }
  const { rows } = await scope.client.query<{ case_id: string; service_line_id: string; written_off: boolean; stage: string | null }>(
    `SELECT cl.case_id, cl.service_line_id, cl.written_off_reason IS NOT NULL AS written_off,
            (SELECT s.stage FROM line_status s WHERE s.service_line_id = cl.service_line_id ORDER BY s.seq DESC LIMIT 1) AS stage
       FROM case_line cl WHERE cl.practice_id = $1 AND cl.case_id = ANY ($2::uuid[])`,
    [practiceId, caseIds],
  );
  const corrections = await wholeLineCorrections(
    scope,
    practiceId,
    rows.map((row) => row.service_line_id),
  );
  const qualifies = new Set<string>();
  for (const caseId of new Set(rows.map((row) => row.case_id))) {
    const lines = rows.filter((row) => row.case_id === caseId).map((row) => ({ correction: corrections.get(row.service_line_id)?.correction ?? null, writtenOff: row.written_off, stage: row.stage }));
    if (casePatientBalance(lines)) {
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

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Everything the report shows, and its lines, as of the report's triage date. */
export async function wholeGatherReport(scope: PracticeScope<ScopeClient>, input: GatherInput): Promise<{ readonly content: AuditReportContent; readonly lines: readonly ReportLine[] }> {
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
  const rows = await runLines(scope, input);
  // Whether each line's deadline is verified (D17 a), as triage judged it.
  const deadlines = await lineDeadlines(
    client,
    rows.map((row) => row.priced_line_id),
  );

  /** The content-not-loaded key of each line whose trace read MPPR or MUE content its release does not load for its date. */
  const contentKeyOf = new Map<string, string>();
  const lines: ReportLine[] = rows.map((row) => {
    // A contract window cited in a rule the engine does not compute yet has no end the report can state or judge.
    const windowRuleComputed = deadlines.get(row.priced_line_id)?.cause !== 'CONTRACT_WINDOW_RULE_NOT_COMPUTED';
    const variance = row.variance_cents === null ? null : parseCents(row.variance_cents);
    const visit = row.visit_variance_cents === null ? null : parseCents(row.visit_variance_cents);
    const trace = row.trace === null ? null : parseTrace(row.trace);
    const gaps = trace === null ? [] : contentGapsOf(trace, spans);
    if (gaps.length > 0) {
      contentKeyOf.set(row.priced_line_id, contentNotLoadedReason(gaps));
    }
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
  });
  lines.sort(
    (a, b) =>
      compareText(a.payer, b.payer) ||
      compareText(a.plan, b.plan) ||
      compareText(a.payer_claim_control_number, b.payer_claim_control_number) ||
      a.line_no - b.line_no ||
      compareText(a.service_line_id, b.service_line_id),
  );

  const validated = lines.filter((line) => line.validated_cents !== null);
  const overpaid = lines.filter((line) => line.status === 'overpaid');
  /** What an overpaid line counts: its variance, or for the line carrying a visit the visit's net. */
  const overpaidCents = (line: ReportLine): string => line.visit_variance_cents ?? line.variance_cents ?? '0';
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
    entry.variances.push(line.validated_cents as string);
    patterns.set(key, entry);
  }
  const notActionableReasons = [
    // CONTENT_NOT_LOADED by the content its lines' traces read (UX-10): the report names which.
    ...NOT_ACTIONABLE_REASONS.filter((reason) => reason !== 'WRITTEN_OFF').flatMap((reason) => (reason === 'CONTENT_NOT_LOADED' ? CONTENT_NOT_LOADED_REASONS : [reason])),
    'BELOW_CASE_MATERIALITY',
    'CASE_LINE_FROM_OTHER_RUN',
    ...Object.keys(WRITE_OFF_TEXT).map((reason) => `written_off:${reason}`),
  ];
  const notActionable = notActionableReasons
    .map((reason) => {
      const matching = validated.filter((line) =>
        reason.startsWith('written_off:')
          ? line.status === 'written_off' && line.reasons.includes(reason.slice('written_off:'.length))
          : reason.startsWith('CONTENT_NOT_LOADED:')
            ? line.reasons.includes('CONTENT_NOT_LOADED') && contentKeyOf.get(line.priced_line_id) === reason
            : line.reasons.includes(reason),
      );
      return { reason, lines: matching.length, variance_cents: text(sum(matching.map((line) => line.validated_cents as string))) };
    })
    .filter((entry) => entry.lines > 0);

  // The recovery ledger, read as it stands (docs/adr/0042): each case's entries for its lines this run priced
  // (and for the case as a whole when it holds no other run's line), at the practice's proof level.
  const { proofLevel } = await practiceLedgerSettings(scope, input.practiceId);
  const ledger: readonly LedgerEntry[] = caseRows.length === 0 ? [] : await ledgerEntries(scope, input.practiceId);
  const byId = entriesById(ledger);
  const inRun = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.case_id !== null && row.case_in_run === true) {
      inRun.set(row.case_id, (inRun.get(row.case_id) ?? new Set()).add(row.service_line_id));
    }
  }
  const actionableNow = (caseId: string) => lines.filter((line) => line.case_id === caseId && line.status === 'actionable');
  const ledgerOf = (row: CaseRow) => {
    const share = inRun.get(row.id) ?? new Set<string>();
    const whole = row.case_lines === row.lines;
    return ledgerTotals(
      ledger.filter((entry) => entry.caseId === row.id && (entry.serviceLineId === null ? whole : share.has(entry.serviceLineId))),
      proofLevel,
      byId,
    );
  };

  const patientBalance = await wholePatientBalanceCases(scope, input.practiceId, caseRows.map((row) => row.id));

  const cases: ReportCase[] = caseRows.map((row) => {
    const still = actionableNow(row.id);
    const stillCents = sum(still.map((line) => line.variance_cents ?? '0'));
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
      actionable_now_lines: still.length,
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
    validatedLines: validated.length,
    validatedCents: sum(validated.map((line) => line.validated_cents as string)),
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
  const unverified = validated.filter((line) => line.reasons.includes('DEADLINE_UNVERIFIED'));
  if (unverified.length > 0) {
    gaps.push({
      kind: 'deadline_unverified',
      reason: 'DEADLINE_UNVERIFIED',
      lines: unverified.length,
      charge_cents: text(sum(unverified.map((line) => line.charge_cents))),
      detail:
        'The dispute deadline of these validated lines is not verified (D17 a): their contract’s window is not cited and verified on its page or cites a rule the product does not compute yet, the release’s window is its commercial default or below L2, or the Medicare Advantage dispute route is not confirmed, so they are not actionable',
      remedy: deadlineRemedy(unverified.map((line) => deadlines.get(line.priced_line_id)?.cause ?? null)),
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
      lines: validated.length,
      variance_cents: text(sum(validated.map((line) => line.validated_cents as string))),
      patterns: [...patterns.values()]
        .map((entry) => ({ ...entry.key, lines: entry.variances.length, variance_cents: text(sum(entry.variances)) }))
        .sort((a, b) => compareText(a.payer, b.payer) || compareText(a.plan, b.plan) || compareText(a.behavior, b.behavior) || compareText(a.rate_record_id ?? '', b.rate_record_id ?? '')),
      not_actionable: notActionable,
    },
    overpaid: { lines: overpaid.length, variance_cents: text(sum(overpaid.map(overpaidCents))) },
    cases,
    pursuit: { estimated, cost_cents: pursuitTotal === null ? null : text(pursuitTotal), net_expected_cents: pursuitTotal === null ? null : text(cents(actionableCents - pursuitTotal)) },
    evidence_gaps: gaps,
  };
  return { content, lines };
}

// The tests' own.

/** The report's line order (content.ts's sort, 085299bd): payer, plan, the payer's claim control number, line number and line, each text by code unit. */
export function reportLineOrder(a: ReportLine, b: ReportLine): number {
  return (
    compareText(a.payer, b.payer) ||
    compareText(a.plan, b.plan) ||
    compareText(a.payer_claim_control_number, b.payer_claim_control_number) ||
    a.line_no - b.line_no ||
    compareText(a.service_line_id, b.service_line_id)
  );
}

/** What the reference job made of a queued report: the content it would store, the line CSV's bytes and the HTML it would print. */
export type WholeReport =
  | { readonly outcome: 'ready'; readonly content: AuditReportContent; readonly lines: readonly ReportLine[]; readonly csv: Buffer; readonly html: string }
  | { readonly outcome: 'not_generated'; readonly reason: string };

/**
 * The report job's work on a queued report as generate.ts did it at 085299bd (its inline triage, the whole read, the
 * Verified gate, the HTML and the CSV), in the caller's transaction and without storing anything: the caller rolls the
 * transaction back, so the job it is compared with starts from the same rows.
 */
export async function wholeReport(scope: PracticeScope<ScopeClient>, keys: KeyProvider, practiceId: string, auditReportId: string, asOf: string, requestId: string): Promise<WholeReport> {
  const { rows } = await scope.client.query<{ status: string; pricing_run_id: string }>('SELECT status, pricing_run_id FROM audit_report WHERE id = $1 AND practice_id = $2 FOR UPDATE', [auditReportId, practiceId]);
  const report = rows[0];
  if (report === undefined || report.status !== 'queued') {
    return { outcome: 'not_generated', reason: report === undefined ? 'missing' : report.status };
  }
  const { rows: withdrawn } = await scope.client.query<{ withdrawn: boolean }>('SELECT pricing_run_release_withdrawn($1) AS withdrawn', [report.pricing_run_id]);
  if (withdrawn[0]?.withdrawn === true) {
    return { outcome: 'not_generated', reason: 'release_withdrawn' };
  }
  const triaged = await wholeTriageInScope(scope, practiceId, report.pricing_run_id, requestId, asOf);
  if (triaged.outcome !== 'triaged') {
    return { outcome: 'not_generated', reason: triaged.outcome };
  }
  const cipher = await loadPracticeCipher(scope, keys, practiceId);
  const { content, lines } = await wholeGatherReport(scope, { practiceId, auditReportId, pricingRunId: report.pricing_run_id, asOf, requestId, cipher });
  const reconciliation = auditReconciliation(content, (await practiceLedgerSettings(scope, practiceId)).proofLevel);
  return { outcome: 'ready', content, lines, csv: Buffer.from(auditCsv(lines), 'utf8'), html: auditHtml(content, reconciliation) };
}
