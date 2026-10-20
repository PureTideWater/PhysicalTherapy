import type { ScopeClient } from '@tp/db/runtime';
import type { PacketContent } from '@tp/packets';
import { type DeadlineStatus, packetDeadlineStatus } from '@tp/triage';

import { lineDeadlines, nextLevelDeadline } from '../triage/deadline';
import { statesItsInputs } from './records';

/**
 * Whether a packet version can be exported now, checked before anything is queued and again by the export job
 * (the best-option audit's item #26, the founder's ruling of 2026-10-18; docs/adr/0061). The web's export
 * action (requestExportOnce()), the worker's requestPacketExport() and the packet_export job all ask this one
 * function, so the person hears at once what the job would refuse, with the remedy, instead of a queued job that
 * finishes having done nothing. Every reason that holds is given, in this order:
 *
 * 1. not_approved: no one approved the version;
 * 2. not_current: a later version of the packet was written since;
 * 3. outdated: a tp-packet/1 version, which states no deadline;
 * 4. case_changed: the version no longer asks for exactly its case's lines (packet_version_matches_case), or
 *    the case was closed written off;
 * 5. not_case_level: the version was written at an earlier dispute level than the case's now;
 * 6. window_passed: a line's dispute window (priced_line.window_ends_on) ended before the day;
 * 7. pricing_not_current: packet_version_pricing_check() is not 'current' (audit item #4);
 * 8. deadline_unverified: the database (packet_version_deadline_status()) or @tp/triage, deriving the deadline
 *    again now, says unverified;
 * 9. inputs_differ: the version does not state its deadlines and calculations as its inputs give them now.
 *
 * A tp-packet/1 version states neither a deadline nor calculations, so 'outdated' stands for the last two (it is
 * written again either way). The verifier is not run here: it runs only in the job, over exactly what it prints
 * with the identifiers read then (verifier_failed). The database refuses the export's UPDATE again for the level,
 * the pricing and the deadline (packet_version_export_guard). Codes only: no reason carries a value.
 */

/** Every code a refusal of the export job names, in readiness order and then the verifier's (packet_export_refusal_codes()). */
export const PACKET_EXPORT_REFUSALS = [
  'not_approved',
  'not_current',
  'outdated',
  'case_changed',
  'not_case_level',
  'window_passed',
  'pricing_not_current',
  'deadline_unverified',
  'inputs_differ',
  'verifier_failed',
] as const;
export type PacketExportRefusal = (typeof PACKET_EXPORT_REFUSALS)[number];

/** Every code a failed try of the export job names (packet_export_failure_codes()). */
export const PACKET_EXPORT_FAILURES = ['store_mismatch', 'render_failed', 'store_failed', 'database_refused', 'unexpected'] as const;
export type PacketExportFailure = (typeof PACKET_EXPORT_FAILURES)[number];

/** The reasons readiness checks before anything is printed: every refusal but the verifier's. */
export type ExportReadinessReason = Exclude<PacketExportRefusal, 'verifier_failed'>;

export type ExportReadiness =
  | { readonly outcome: 'ready' }
  /** Exported already: nothing is asked again. */
  | { readonly outcome: 'exported' }
  | { readonly outcome: 'refused'; readonly reasons: readonly [ExportReadinessReason, ...ExportReadinessReason[]] };

export interface ExportReadinessRequest {
  readonly practiceId: string;
  readonly versionId: string;
  /** The day the windows are judged on (UTC): the export's day. */
  readonly asOf: string;
}

/**
 * The version's deadline derived again now (D17), as @tp/triage derives it: at the first dispute level every
 * line's from its stored trace and its window's evidence, after a reopened denial the next level's. Never the
 * status the version stated.
 */
export async function exportDeadlineStatus(client: ScopeClient, caseId: string, content: PacketContent): Promise<DeadlineStatus> {
  if (content.format !== 'tp-packet/2') {
    return 'unverified';
  }
  if (content.dispute_level > 1) {
    return (await nextLevelDeadline(client, caseId)).verification.status;
  }
  const deadlines = await lineDeadlines(
    client,
    content.lines.map((line) => line.priced_line_id),
  );
  return packetDeadlineStatus(content.lines.map((line) => deadlines.get(line.priced_line_id) ?? { status: 'unverified' as const }));
}

interface ReadinessRow {
  readonly case_id: string;
  readonly content: PacketContent;
  readonly exported: boolean;
  readonly approved: boolean;
  readonly current: boolean;
  readonly matches: boolean;
  readonly case_closed: boolean;
  readonly at_case_level: boolean;
  readonly window_passed: boolean;
  readonly pricing: string | null;
  readonly deadline_status: DeadlineStatus | null;
}

/**
 * The version's readiness for export on `asOf`, in the caller's scope (a person's request, or the job's): undefined
 * when the caller cannot see the version in that practice. Every check reads the database as it stands now; a row
 * the caller cannot see fails its check closed (the SQL functions are SECURITY INVOKER).
 */
export async function exportReadiness(client: ScopeClient, request: ExportReadinessRequest): Promise<ExportReadiness | undefined> {
  const { rows } = await client.query<ReadinessRow>(
    `SELECT p.case_id, v.content, v.exported_at IS NOT NULL AS exported, v.approved_by IS NOT NULL AS approved,
            p.current_version_id IS NOT DISTINCT FROM v.id AS current,
            packet_version_matches_case(p.case_id, v.content) AS matches,
            c.state = 'closed_written_off' AS case_closed,
            v.dispute_level = 1 + case_reopened_levels(p.case_id) AS at_case_level,
            EXISTS (
              SELECT 1 FROM jsonb_array_elements(v.content -> 'lines') l
                JOIN priced_line pl ON pl.id = (l ->> 'priced_line_id')::uuid AND pl.practice_id = v.practice_id
               WHERE pl.window_ends_on < $3::date
            ) AS window_passed,
            packet_version_pricing_check(v.content) AS pricing,
            packet_version_deadline_status(p.case_id, v.content) AS deadline_status
       FROM packet_version v JOIN packet p ON p.id = v.packet_id JOIN "case" c ON c.id = p.case_id
      WHERE v.id = $1 AND v.practice_id = $2`,
    [request.versionId, request.practiceId, request.asOf],
  );
  const version = rows[0];
  if (version === undefined) {
    return undefined;
  }
  if (version.exported) {
    return { outcome: 'exported' };
  }
  const outdated = version.content.format !== 'tp-packet/2';
  const reasons: ExportReadinessReason[] = [];
  if (!version.approved) {
    reasons.push('not_approved');
  }
  if (!version.current) {
    reasons.push('not_current');
  }
  if (outdated) {
    reasons.push('outdated');
  }
  if (!version.matches || version.case_closed) {
    reasons.push('case_changed');
  }
  if (!version.at_case_level) {
    reasons.push('not_case_level');
  }
  if (version.window_passed) {
    reasons.push('window_passed');
  }
  // A value the database does not return fails closed.
  if (version.pricing !== 'current') {
    reasons.push('pricing_not_current');
  }
  if (!outdated) {
    // The deadline derived again now, by the database and by @tp/triage: either unverified refuses it.
    if (version.deadline_status !== 'verified' && version.deadline_status !== 'not_applicable') {
      reasons.push('deadline_unverified');
    } else if ((await exportDeadlineStatus(client, version.case_id, version.content)) === 'unverified') {
      reasons.push('deadline_unverified');
    }
    // What the version states of its deadlines and calculations, stated again from its inputs now.
    if (version.content.format === 'tp-packet/2' && !(await statesItsInputs(client, request.practiceId, version.case_id, version.content))) {
      reasons.push('inputs_differ');
    }
  }
  const [first, ...rest] = reasons;
  return first === undefined ? { outcome: 'ready' } : { outcome: 'refused', reasons: [first, ...rest] };
}
