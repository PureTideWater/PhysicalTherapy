import type { ScopeClient } from '@tp/db/runtime';
import { type EvidenceKind, type LedgerEntry, type LedgerStage, entriesById, ledgerSettings, ledgerTotals, periodEntries } from '@tp/ledger';
import { centsToString, parseCents, sumCents } from '@tp/money';

import { PRICED_IN_EFFECT } from '../price/in-effect';
import { CONTRACT_EXPIRY_DAYS, DEADLINE_DAYS, type DigestCounts, type DigestFigures, type DigestTotals, digestCountsSchema, digestTotalsSchema } from './view';

/**
 * The monthly digest's figures for one practice, read in its job's scope (docs/adr/0039). Every query
 * reads codes, dates, opaque IDs and amounts, and aggregates them: no patient reference, claim
 * identifier, name or text column is read (test matrix JOB-03, which checks the statements below).
 *
 * - New validated variance: the lines whose stage reached validated during the month (UTC), with the
 *   shortfall of the priced line triage validated them on (its variance; a per-visit line's at most its
 *   visit's net, priced_line_shortfall_cents()), by payer.
 * - Cases nearing deadline: open cases whose deadline falls on the digest's day or within
 *   DEADLINE_DAYS after it, with their actionable total (the case's own, derived in SQL).
 * - Recoveries posted: from the recovery ledger (docs/adr/0042), the lines with a posted or deposited
 *   entry (by the practice's proof level) dated in the month that no reversal offsets, and recovered:
 *   the month's entries' recovered total (proof less recoupments and reversals; approved and interest
 *   are never in it).
 * - Coverage: each line's result in its pricing in effect (PRICED_IN_EFFECT, as Claims and lines reads
 *   it), priced against all, by lines and billed dollars; beside it, the previous digest's.
 * - Contracts expiring: contracts whose signed-off version ends within CONTRACT_EXPIRY_DAYS of the
 *   digest's day with no signed-off version starting after it.
 */

interface PayerRow {
  readonly payer_id: string;
  readonly lines: number;
  readonly cents: string;
}

/**
 * Coverage under the pricing in effect, for the practice `$1`: each line's result in its pricing in
 * effect (PRICED_IN_EFFECT, the latest run in effect that priced it, whichever period), priced against
 * all, by lines and billed dollars. The one statement the digest, the dashboard, Coverage and the
 * coverage report read coverage with (docs/adr/0039, 0040), so their figures agree.
 */
export const COVERAGE_IN_EFFECT = `SELECT count(*)::int AS lines, (count(*) FILTER (WHERE latest.unpriced_reason IS NULL))::int AS priced_lines,
            coalesce(sum(l.charge_cents), 0)::text AS billed, coalesce(sum(l.charge_cents) FILTER (WHERE latest.unpriced_reason IS NULL), 0)::text AS priced_billed
       FROM (${PRICED_IN_EFFECT('$1', 'true')}) latest
       JOIN service_line l ON l.id = latest.service_line_id`;

/** The statements the digest reads with, by what they read (exported for the JOB-03 test). */
export const DIGEST_QUERIES = {
  validated: `WITH validated AS (
       SELECT DISTINCT ON (s.service_line_id) s.service_line_id, s.priced_line_id
         FROM line_status s
        WHERE s.practice_id = $1 AND s.stage = 'validated' AND s.priced_line_id IS NOT NULL
          AND s.set_at >= ($2::date::timestamp AT TIME ZONE 'UTC') AND s.set_at < (($2::date + interval '1 month') AT TIME ZONE 'UTC')
        ORDER BY s.service_line_id, s.seq
     )
     SELECT pl.payer_id, count(*)::int AS lines, sum(v.shortfall)::text AS cents
       FROM (SELECT validated.service_line_id, priced_line_shortfall_cents(validated.priced_line_id) AS shortfall FROM validated) v
       JOIN service_line l ON l.id = v.service_line_id
       JOIN plan pl ON pl.id = l.payer_plan_key
      WHERE v.shortfall IS NOT NULL
      GROUP BY pl.payer_id
      ORDER BY pl.payer_id`,
  deadlines: `SELECT count(*)::int AS cases, coalesce(sum(c.actionable_cents), 0)::text AS cents
       FROM "case" c
      WHERE c.practice_id = $1 AND c.state = 'open' AND c.deadline_on BETWEEN $2::date AND $2::date + $3::int`,
  coverage: COVERAGE_IN_EFFECT,
  ledger: `SELECT e.id, e.case_id, e.service_line_id, e.stage, e.amount_cents::text AS amount_cents, e.evidence_kind, e.evidence_id, e.allocated, e.effective_on::text AS effective_on
       FROM ledger_entry e
      WHERE e.practice_id = $1
      ORDER BY e.seq`,
  ledgerSettings: `SELECT p.settings FROM practice p WHERE p.id = $1`,
  previous: `SELECT d.counts, d.totals_cents FROM digest d WHERE d.practice_id = $1 AND d.period < $2 ORDER BY d.period DESC LIMIT 1`,
  contracts: `SELECT count(DISTINCT v.contract_id)::int AS contracts
       FROM contract_version v
      WHERE v.practice_id = $1 AND v.status = 'signed_off' AND v.effective_to BETWEEN $2::date AND $2::date + $3::int
        AND NOT EXISTS (SELECT 1 FROM contract_version n WHERE n.contract_id = v.contract_id AND n.status = 'signed_off' AND n.effective_from > v.effective_from)`,
} as const;

interface LedgerRow {
  readonly id: string;
  readonly case_id: string;
  readonly service_line_id: string | null;
  readonly stage: LedgerStage;
  readonly amount_cents: string;
  readonly evidence_kind: EvidenceKind;
  readonly evidence_id: string;
  readonly allocated: boolean;
  readonly effective_on: string;
}

/** The month's recoveries from the ledger: the lines its proof entries recovered, and the recovered total. */
async function monthRecoveries(client: ScopeClient, practiceId: string, period: string): Promise<{ readonly lines: number; readonly recovered: string }> {
  const { proofLevel } = ledgerSettings((await client.query<{ settings: unknown }>(DIGEST_QUERIES.ledgerSettings, [practiceId])).rows[0]?.settings ?? {});
  const all: LedgerEntry[] = (await client.query<LedgerRow>(DIGEST_QUERIES.ledger, [practiceId])).rows.map((row) => ({
    id: row.id,
    caseId: row.case_id,
    serviceLineId: row.service_line_id,
    stage: row.stage,
    amountCents: parseCents(row.amount_cents),
    evidenceKind: row.evidence_kind,
    evidenceId: row.evidence_id,
    allocated: row.allocated,
    effectiveOn: row.effective_on,
  }));
  // Calendar dates compare as text, so day 31 bounds every month.
  const inMonth = periodEntries(all, `${period}-01`, `${period}-31`);
  const reversed = new Set(all.filter((entry) => entry.stage === 'reversed').map((entry) => entry.evidenceId));
  const lines = new Set(inMonth.filter((entry) => entry.stage === proofLevel && !reversed.has(entry.id)).map((entry) => entry.serviceLineId ?? entry.caseId));
  return { lines: lines.size, recovered: centsToString(ledgerTotals(inMonth, proofLevel, entriesById(all)).recoveredCents) };
}

/** The digest's figures for `period` (YYYY-MM), as of `asOf` (the digest's day, UTC). */
export async function digestFigures(client: ScopeClient, practiceId: string, period: string, asOf: string): Promise<DigestFigures> {
  const payers = (await client.query<PayerRow>(DIGEST_QUERIES.validated, [practiceId, `${period}-01`])).rows;
  const deadlines = (await client.query<{ cases: number; cents: string }>(DIGEST_QUERIES.deadlines, [practiceId, asOf, DEADLINE_DAYS])).rows[0];
  const coverage = (await client.query<{ lines: number; priced_lines: number; billed: string; priced_billed: string }>(DIGEST_QUERIES.coverage, [practiceId])).rows[0];
  const previous = (await client.query<{ counts: unknown; totals_cents: unknown }>(DIGEST_QUERIES.previous, [practiceId, period])).rows[0];
  const contracts = (await client.query<{ contracts: number }>(DIGEST_QUERIES.contracts, [practiceId, asOf, CONTRACT_EXPIRY_DAYS])).rows[0];
  const recoveries = await monthRecoveries(client, practiceId, period);

  const before = previous === undefined ? undefined : { counts: digestCountsSchema.parse(previous.counts), totals: digestTotalsSchema.parse(previous.totals_cents) };
  const counts: DigestCounts = {
    validated_lines: payers.reduce((sum, row) => sum + row.lines, 0),
    validated_payers: payers.length,
    validated_lines_by_payer: Object.fromEntries(payers.map((row) => [row.payer_id, row.lines])),
    cases_nearing_deadline: deadlines?.cases ?? 0,
    recoveries_posted: recoveries.lines,
    coverage_lines: coverage?.lines ?? 0,
    coverage_priced_lines: coverage?.priced_lines ?? 0,
    ...(before === undefined ? {} : { previous_coverage_lines: before.counts.coverage_lines, previous_coverage_priced_lines: before.counts.coverage_priced_lines }),
    contracts_expiring: contracts?.contracts ?? 0,
  };
  const totals: DigestTotals = {
    validated_variance: centsToString(sumCents(payers.map((row) => parseCents(row.cents)))),
    validated_variance_by_payer: Object.fromEntries(payers.map((row) => [row.payer_id, centsToString(parseCents(row.cents))])),
    cases_nearing_deadline_actionable: centsToString(parseCents(deadlines?.cents ?? '0')),
    recovered: recoveries.recovered,
    coverage_billed: centsToString(parseCents(coverage?.billed ?? '0')),
    coverage_priced_billed: centsToString(parseCents(coverage?.priced_billed ?? '0')),
    ...(before === undefined ? {} : { previous_coverage_billed: before.totals.coverage_billed, previous_coverage_priced_billed: before.totals.coverage_priced_billed }),
  };
  return { counts, totals };
}
