import { PRICING_CHECK_RESULTS, type PracticeScope, type PricingCheckResult, type ScopeClient, readWithAudit } from '@tp/db/runtime';

/**
 * Whether a packet version's pricing is still current (audit item #4; migration 20261103090000,
 * packet_version_pricing_check()): every line still carries its service line's pricing in effect
 * (service_line_priced_in_effect(), the same rule as PRICED_IN_EFFECT: a complete first run or an accepted
 * re-run, the run of its period that took effect last), its rule release is not withdrawn, the plan mapping it
 * priced under is still the plan's mapping in force on its service date (a correction supersedes it, MAP-03), and
 * its contract version is still signed off and covers the service date (a back-dated amendment closes it). The database
 * holds the one rule, and approval, the export guard and the attestation refuse in SQL; the builder, the export
 * request, the export job and the attestation service ask it first through here, so they say no with the reason
 * before the database does. A submission is never refused for it: the database records the result on it.
 *
 * Nothing here refreshes a case: accepting a re-run, withdrawing a release or correcting a mapping leaves the case's
 * lines on the pricing they joined with until PR 11, and a stale line never becomes current again; it is written off
 * on the case page, and the packet is written, approved and exported again without it.
 */

/** Each cause a version's pricing is not current, from the most severe (the database's order). */
export const PRICING_CHECK_CAUSES = PRICING_CHECK_RESULTS.filter((result): result is Exclude<PricingCheckResult, 'current'> => result !== 'current');
export type PricingCheckCause = (typeof PRICING_CHECK_CAUSES)[number];

const RESULTS: ReadonlySet<string> = new Set(PRICING_CHECK_RESULTS);

/** The lines a version names, as packet_version_pricing_check() reads them. */
export interface PricedLines {
  readonly lines: readonly { readonly priced_line_id: string }[];
}

function asResult(value: unknown): PricingCheckResult {
  // A value the database does not return fails closed.
  return typeof value === 'string' && RESULTS.has(value) ? (value as PricingCheckResult) : 'PRICING_NOT_IN_EFFECT';
}

/** The database's verdict on a version's lines: 'current', or the most severe cause across them. */
export async function packetPricingCheck(client: ScopeClient, content: PricedLines): Promise<PricingCheckResult> {
  const lines = content.lines.map((line) => ({ priced_line_id: line.priced_line_id }));
  const { rows } = await client.query<{ check: string | null }>('SELECT packet_version_pricing_check($1::jsonb) AS check', [JSON.stringify({ lines })]);
  return asResult(rows[0]?.check);
}

/** A line's figures as they were priced when the version was written, and its pricing in effect now. */
export interface LinePricingNow {
  /** The line's row in the version's schedule. */
  readonly row: number;
  /** The line's own verdict ('current', or its first cause). */
  readonly check: PricingCheckResult;
  /** The priced line the version names: its run's release and its figures (integer cents as decimal text). */
  readonly was: {
    readonly pricedLineId: string;
    readonly releaseNo: number | null;
    readonly expectedCents: string | null;
    readonly varianceCents: string | null;
  };
  /**
   * The service line's pricing in effect now, when it is another priced line (an accepted re-run, a later first
   * run); null when it is the same line or no run in effect prices it (as after a withdrawal with no accepted
   * re-run yet: not priced again yet). An unpriced line has no figures and names its reason.
   */
  readonly now: {
    readonly pricedLineId: string;
    readonly releaseNo: number;
    readonly expectedCents: string | null;
    readonly varianceCents: string | null;
    readonly unpricedReason: string | null;
  } | null;
}

export interface LinePricingNowRequest {
  readonly practiceId: string;
  readonly content: { readonly lines: readonly { readonly row: number; readonly priced_line_id: string }[] };
  readonly requestId: string;
}

interface Row {
  readonly position: number;
  readonly practice_id: string;
  readonly service_line_id: string;
  readonly was_id: string;
  readonly was_release_no: number;
  readonly was_expected_cents: string | null;
  readonly was_variance_cents: string | null;
  readonly check: string | null;
  readonly now_id: string | null;
  readonly now_release_no: number | null;
  readonly now_expected_cents: string | null;
  readonly now_variance_cents: string | null;
  readonly now_unpriced_reason: string | null;
}

/**
 * Each line of a version with its verdict and its figures then and now, in row order: an audited read of the
 * lines' amounts (service_line, purpose packet_build), as the builder reads a case's lines. A line the caller
 * cannot read has no figures and is not current (fails closed).
 */
export async function linePricingNow(scope: PracticeScope<ScopeClient>, request: LinePricingNowRequest): Promise<readonly LinePricingNow[]> {
  const lines = request.content.lines.map((line, index) => ({ position: index, priced_line_id: line.priced_line_id }));
  const rows = await readWithAudit(
    scope,
    { objectType: 'service_line', purpose: 'packet_build', requestId: request.requestId },
    async (client) =>
      (
        await client.query<Row>(
          `SELECT l.position, p.practice_id, p.service_line_id, p.id::text AS was_id, r.release_no AS was_release_no,
                  p.expected_allowed_cents::text AS was_expected_cents, p.variance_cents::text AS was_variance_cents,
                  priced_line_pricing_check(p.id) AS check,
                  n.id::text AS now_id, nr.release_no AS now_release_no, n.expected_allowed_cents::text AS now_expected_cents,
                  n.variance_cents::text AS now_variance_cents, n.unpriced_reason AS now_unpriced_reason
             FROM jsonb_to_recordset($2::jsonb) AS l (position integer, priced_line_id uuid)
             JOIN priced_line p ON p.id = l.priced_line_id AND p.practice_id = $1
             JOIN pricing_run r ON r.id = p.pricing_run_id
             LEFT JOIN priced_line n ON n.id = service_line_priced_in_effect(p.service_line_id) AND n.id <> p.id
             LEFT JOIN pricing_run nr ON nr.id = n.pricing_run_id
            ORDER BY l.position`,
          [request.practiceId, JSON.stringify(lines)],
        )
      ).rows,
    (row) => ({ objectId: row.service_line_id, practiceId: row.practice_id }),
  );
  const byPosition = new Map(rows.map((row) => [row.position, row]));
  return request.content.lines.map((line, index): LinePricingNow => {
    const found = byPosition.get(index);
    if (found === undefined) {
      return { row: line.row, check: 'PRICING_NOT_IN_EFFECT', was: { pricedLineId: line.priced_line_id, releaseNo: null, expectedCents: null, varianceCents: null }, now: null };
    }
    return {
      row: line.row,
      check: asResult(found.check),
      was: { pricedLineId: found.was_id, releaseNo: found.was_release_no, expectedCents: found.was_expected_cents, varianceCents: found.was_variance_cents },
      now:
        found.now_id === null || found.now_release_no === null
          ? null
          : {
              pricedLineId: found.now_id,
              releaseNo: found.now_release_no,
              expectedCents: found.now_expected_cents,
              varianceCents: found.now_variance_cents,
              unpricedReason: found.now_unpriced_reason,
            },
    };
  });
}
