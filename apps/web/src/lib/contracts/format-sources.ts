import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { ERA_EXPORT_FORMATS, eraFormatName, unconfirmedEraFormatIds } from '@tp/worker/era-formats';

/**
 * The practice's lines whose source is an unconfirmed ERA export format (Change Order 001, CO-03: "an
 * unconfirmed format is flagged in the Coverage screen"; docs/adr/0060). A vendor's export is read with the
 * layout in the worker's format registry (@tp/worker/era-formats); while a format is FORMAT_UNCONFIRMED that
 * layout is a placeholder no format description has confirmed, so the lines read with it are flagged with the
 * format's name and why. Counts, billed dollars and payer names only: no claim, line or patient. Confirming
 * the format (registry data) clears the flag, since the query asks for unconfirmed formats only.
 */

export interface UnconfirmedFormatSource {
  readonly formatId: string;
  /** "<vendor> ERA export". */
  readonly name: string;
  readonly remittances: number;
  readonly payers: number;
  readonly lines: number;
  /** The billed dollars of those lines, in cents (a reversal's lines count negative, as they were sent). */
  readonly chargeCents: string;
  /** The payers' names, as their remittances name them, in order. */
  readonly payerNames: readonly string[];
}

/** Why the flag is shown, and what to do, in the words of the screen. */
export function unconfirmedFormatExplanation(name: string): string {
  return (
    `PaidWhole reads the ${name} with a placeholder layout, because no description of the format has been received from its vendor. ` +
    'Check these lines against the export before relying on their amounts. The flag clears when the format is confirmed.'
  );
}

interface SourceRow {
  readonly format_id: string;
  readonly remittances: number;
  readonly payers: number;
  readonly lines: number;
  readonly charge_cents: string;
}

/**
 * For each unconfirmed format the practice has loaded remittances from: their remittances, lines, payers and billed
 * dollars. `ids` is the registry's unconfirmed formats; a test passes another list to stand for a confirmation.
 */
export async function unconfirmedFormatSources(scope: PracticeScope<ScopeClient>, practiceId: string, ids: readonly string[] = unconfirmedEraFormatIds()): Promise<UnconfirmedFormatSource[]> {
  if (ids.length === 0) {
    return [];
  }
  const { rows } = await scope.client.query<SourceRow>(
    `SELECT d.format_id, count(DISTINCT r.id)::int AS remittances, count(DISTINCT r.payer_id)::int AS payers, count(l.id)::int AS lines,
            coalesce(sum(l.charge_cents), 0)::text AS charge_cents
       FROM remittance r
       JOIN source_document d ON d.id = r.source_document_id
       LEFT JOIN claim c ON c.remittance_id = r.id
       LEFT JOIN service_line l ON l.claim_id = c.id
      WHERE r.practice_id = $1 AND r.provenance = 'era_export' AND d.format_id = ANY ($2::text[])
      GROUP BY d.format_id`,
    [practiceId, [...ids]],
  );
  if (rows.length === 0) {
    return [];
  }
  const names = await scope.client.query<{ format_id: string; name: string }>(
    `SELECT DISTINCT d.format_id, p.name_raw AS name
       FROM remittance r
       JOIN source_document d ON d.id = r.source_document_id
       JOIN payer p ON p.id = r.payer_id
      WHERE r.practice_id = $1 AND r.provenance = 'era_export' AND d.format_id = ANY ($2::text[])
      ORDER BY 1, 2`,
    [practiceId, [...ids]],
  );
  const order = new Map(ERA_EXPORT_FORMATS.map((format, index) => [format.id as string, index]));
  return rows
    .map((row) => {
      const format = ERA_EXPORT_FORMATS.find((candidate) => candidate.id === row.format_id);
      return {
        formatId: row.format_id,
        name: format === undefined ? 'ERA export' : eraFormatName(format),
        remittances: row.remittances,
        payers: row.payers,
        lines: row.lines,
        chargeCents: row.charge_cents,
        payerNames: names.rows.filter((name) => name.format_id === row.format_id).map((name) => name.name),
      };
    })
    .sort((left, right) => (order.get(left.formatId) ?? 0) - (order.get(right.formatId) ?? 0));
}
