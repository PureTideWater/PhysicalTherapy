import type { MappedLine } from '@tp/contracts';
import { type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import { type Cents, parseCents } from '@tp/money';

/**
 * The lines a pricing run prices (PRD 5, J7: "a run is created for a practice and a period"): every
 * service line of the practice whose service date (the line's own, else its claim's first) falls in
 * the period, of every claim the payer adjudicated and no correction superseded. A reversal (claim
 * status 22) is the payer's undo of a claim, not a service, so it is not a line to price; a claim a
 * correction supersedes is priced through its correction; a claim reversed and not corrected stays and
 * comes out REVERSED_CLAIM. Only lines loaded by the time the run was created belong to it, so a run's
 * lines are fixed when it is created and the guard at creation saw the same plans.
 */

export interface RunScope {
  readonly practiceId: string;
  /** First and last service dates, both included. */
  readonly periodFrom: string;
  readonly periodTo: string;
  /**
   * Lines loaded after this instant are not the run's: its creation, or for a re-run the original's
   * (as text it keeps the database's microseconds).
   */
  readonly loadedBy: Date | string;
}

const RUN_LINES = `
  FROM claim c
  JOIN service_line l ON l.claim_id = c.id
 WHERE c.practice_id = $1
   AND c.claim_status_code <> '22' AND c.superseded_by_claim_id IS NULL
   AND coalesce(l.service_date, c.service_from) BETWEEN $2::date AND $3::date
   AND l.created_at <= $4`;

/**
 * One line per plan of the run's lines (its earliest service date): what the creator's guard checks
 * (MAP-01: pricing is refused while any plan has no mapping at all). Plans are opaque IDs.
 */
export async function runPlans(client: ScopeClient, run: RunScope): Promise<MappedLine[]> {
  const { rows } = await client.query<{ plan_id: string; first_date: string }>(
    `SELECT l.payer_plan_key AS plan_id, min(coalesce(l.service_date, c.service_from))::text AS first_date ${RUN_LINES}
      GROUP BY l.payer_plan_key ORDER BY l.payer_plan_key`,
    [run.practiceId, run.periodFrom, run.periodTo, run.loadedBy],
  );
  return rows.map((row) => ({ planId: row.plan_id, serviceDate: row.first_date }));
}

/** A line's patient-responsibility adjustment (CAS PR at line level). */
export interface StoredShare {
  readonly reasonCode: string;
  readonly amountCents: Cents;
}

/** One stored line as the engine's facts need it, before its agreement is resolved. */
export interface StoredLine {
  readonly serviceLineId: string;
  readonly lineNo: number;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly units: string;
  readonly serviceDate: string;
  readonly placeOfService: string | null;
  readonly chargeCents: Cents;
  readonly observedAllowedCents: Cents;
  readonly observedAllowedBasis: 'amt_b6' | 'paid_plus_pr';
  readonly planId: string;
  readonly patientShare: readonly StoredShare[];
}

/** One claim of the run with its lines in the period. */
export interface StoredClaim {
  readonly claimId: string;
  readonly claimStatusCode: string;
  readonly reversed: boolean;
  readonly corrected: boolean;
  readonly remittanceDate: string;
  readonly lines: readonly StoredLine[];
}

interface ClaimRow {
  readonly claim_id: string;
  readonly practice_id: string;
  readonly claim_status_code: string;
  readonly remittance_date: string;
  readonly reversed: boolean;
  readonly corrected: boolean;
  readonly lines: readonly {
    readonly id: string;
    readonly line_no: number;
    readonly procedure_code: string;
    readonly modifiers: readonly string[] | null;
    readonly units: string;
    readonly service_date: string;
    readonly place_of_service: string | null;
    readonly charge_cents: string;
    readonly observed_allowed_cents: string;
    readonly observed_allowed_basis: 'amt_b6' | 'paid_plus_pr';
    readonly plan_id: string;
    readonly pr: readonly { readonly reason_code: string; readonly amount_cents: string }[];
  }[];
}

/** The smallest UUID: the first page starts after it. */
export const FIRST_CLAIM = '00000000-0000-0000-0000-000000000000';

/**
 * A page of the run's claims, in claim ID order after `afterClaimId`, each with its lines in the
 * period in line order. Every claim returned is an audited read (purpose pricing, or release_impact for
 * a dry run's in-memory pricing) in the scope.
 * Units come back as billed, without trailing zeros (SVC05 absent is one unit, its 835 default).
 */
export async function claimPage(scope: PracticeScope<ScopeClient>, run: RunScope, afterClaimId: string, limit: number, requestId: string, purpose = 'pricing'): Promise<StoredClaim[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'claim', purpose, requestId },
    async (client) =>
      (
        await client.query<ClaimRow>(
          `WITH page AS (
             SELECT c.id FROM claim c
              WHERE c.practice_id = $1 AND c.id > $5::uuid
                AND c.claim_status_code <> '22' AND c.superseded_by_claim_id IS NULL
                AND EXISTS (SELECT 1 FROM service_line l
                             WHERE l.claim_id = c.id AND coalesce(l.service_date, c.service_from) BETWEEN $2::date AND $3::date AND l.created_at <= $4)
              ORDER BY c.id
              LIMIT $6
           )
           SELECT c.id AS claim_id, c.practice_id, c.claim_status_code, r.bpr16_date::text AS remittance_date,
                  EXISTS (SELECT 1 FROM claim x WHERE x.reversal_of_claim_id = c.id) AS reversed,
                  c.superseded_by_claim_id IS NOT NULL AS corrected,
                  json_agg(json_build_object(
                    'id', l.id, 'line_no', l.line_no, 'procedure_code', l.procedure_code, 'modifiers', l.modifiers,
                    'units', trim_scale(coalesce(l.units, 1))::text, 'service_date', coalesce(l.service_date, c.service_from)::text,
                    'place_of_service', l.place_of_service, 'charge_cents', l.charge_cents::text,
                    'observed_allowed_cents', l.observed_allowed_cents::text, 'observed_allowed_basis', l.observed_allowed_basis,
                    'plan_id', l.payer_plan_key,
                    'pr', (SELECT coalesce(json_agg(json_build_object('reason_code', a.reason_code, 'amount_cents', a.amount_cents::text) ORDER BY a.position), '[]'::json)
                             FROM adjustment a WHERE a.service_line_id = l.id AND a.group_code = 'PR')
                  ) ORDER BY l.line_no) AS lines
             FROM page
             JOIN claim c ON c.id = page.id
             JOIN remittance r ON r.id = c.remittance_id
             JOIN service_line l ON l.claim_id = c.id
            WHERE coalesce(l.service_date, c.service_from) BETWEEN $2::date AND $3::date AND l.created_at <= $4
            GROUP BY c.id, r.bpr16_date
            ORDER BY c.id`,
          [run.practiceId, run.periodFrom, run.periodTo, run.loadedBy, afterClaimId, limit],
        )
      ).rows,
    (row) => ({ objectId: row.claim_id, practiceId: row.practice_id }),
  );
  return rows.map((row) => ({
    claimId: row.claim_id,
    claimStatusCode: row.claim_status_code,
    reversed: row.reversed,
    corrected: row.corrected,
    remittanceDate: row.remittance_date,
    lines: row.lines.map((line) => ({
      serviceLineId: line.id,
      lineNo: line.line_no,
      procedureCode: line.procedure_code,
      // Empty modifier positions carry nothing (PAR-22 keeps the positions; the engine reads the codes).
      modifiers: (line.modifiers ?? []).filter((modifier) => modifier !== ''),
      units: line.units,
      serviceDate: line.service_date,
      placeOfService: line.place_of_service,
      chargeCents: parseCents(line.charge_cents),
      observedAllowedCents: parseCents(line.observed_allowed_cents),
      observedAllowedBasis: line.observed_allowed_basis,
      planId: line.plan_id,
      patientShare: line.pr.map((item) => ({ reasonCode: item.reason_code, amountCents: parseCents(item.amount_cents) })),
    })),
  }));
}
