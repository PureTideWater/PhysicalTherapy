import type { ScopeClient } from '@tp/db/runtime';
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
 * - Recoveries posted: zero until the recovery ledger (milestone 9) posts entries.
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
  coverage: `SELECT count(*)::int AS lines, (count(*) FILTER (WHERE latest.unpriced_reason IS NULL))::int AS priced_lines,
            coalesce(sum(l.charge_cents), 0)::text AS billed, coalesce(sum(l.charge_cents) FILTER (WHERE latest.unpriced_reason IS NULL), 0)::text AS priced_billed
       FROM (${PRICED_IN_EFFECT('$1', 'true')}) latest
       JOIN service_line l ON l.id = latest.service_line_id`,
  previous: `SELECT d.counts, d.totals_cents FROM digest d WHERE d.practice_id = $1 AND d.period < $2 ORDER BY d.period DESC LIMIT 1`,
  contracts: `SELECT count(DISTINCT v.contract_id)::int AS contracts
       FROM contract_version v
      WHERE v.practice_id = $1 AND v.status = 'signed_off' AND v.effective_to BETWEEN $2::date AND $2::date + $3::int
        AND NOT EXISTS (SELECT 1 FROM contract_version n WHERE n.contract_id = v.contract_id AND n.status = 'signed_off' AND n.effective_from > v.effective_from)`,
} as const;

/** The digest's figures for `period` (YYYY-MM), as of `asOf` (the digest's day, UTC). */
export async function digestFigures(client: ScopeClient, practiceId: string, period: string, asOf: string): Promise<DigestFigures> {
  const payers = (await client.query<PayerRow>(DIGEST_QUERIES.validated, [practiceId, `${period}-01`])).rows;
  const deadlines = (await client.query<{ cases: number; cents: string }>(DIGEST_QUERIES.deadlines, [practiceId, asOf, DEADLINE_DAYS])).rows[0];
  const coverage = (await client.query<{ lines: number; priced_lines: number; billed: string; priced_billed: string }>(DIGEST_QUERIES.coverage, [practiceId])).rows[0];
  const previous = (await client.query<{ counts: unknown; totals_cents: unknown }>(DIGEST_QUERIES.previous, [practiceId, period])).rows[0];
  const contracts = (await client.query<{ contracts: number }>(DIGEST_QUERIES.contracts, [practiceId, asOf, CONTRACT_EXPIRY_DAYS])).rows[0];

  const before = previous === undefined ? undefined : { counts: digestCountsSchema.parse(previous.counts), totals: digestTotalsSchema.parse(previous.totals_cents) };
  const counts: DigestCounts = {
    validated_lines: payers.reduce((sum, row) => sum + row.lines, 0),
    validated_payers: payers.length,
    validated_lines_by_payer: Object.fromEntries(payers.map((row) => [row.payer_id, row.lines])),
    cases_nearing_deadline: deadlines?.cases ?? 0,
    // The recovery ledger (milestone 9) posts entries; until then nothing is recovered.
    recoveries_posted: 0,
    coverage_lines: coverage?.lines ?? 0,
    coverage_priced_lines: coverage?.priced_lines ?? 0,
    ...(before === undefined ? {} : { previous_coverage_lines: before.counts.coverage_lines, previous_coverage_priced_lines: before.counts.coverage_priced_lines }),
    contracts_expiring: contracts?.contracts ?? 0,
  };
  const totals: DigestTotals = {
    validated_variance: centsToString(sumCents(payers.map((row) => parseCents(row.cents)))),
    validated_variance_by_payer: Object.fromEntries(payers.map((row) => [row.payer_id, centsToString(parseCents(row.cents))])),
    cases_nearing_deadline_actionable: centsToString(parseCents(deadlines?.cents ?? '0')),
    recovered: '0',
    coverage_billed: centsToString(parseCents(coverage?.billed ?? '0')),
    coverage_priced_billed: centsToString(parseCents(coverage?.priced_billed ?? '0')),
    ...(before === undefined ? {} : { previous_coverage_billed: before.totals.coverage_billed, previous_coverage_priced_billed: before.totals.coverage_priced_billed }),
  };
  return { counts, totals };
}
