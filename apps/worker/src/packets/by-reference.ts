import { type PracticeScope, type ScopeClient, requirePracticePermission } from '@tp/db/runtime';
import { packetReference, packetReferencePrefix, withPacketReference } from '@tp/packets';

/**
 * Finding a packet by the reference a payer quotes back by phone or letter (audit item #37 part 1, D5; the founder's
 * ruling of 2026-10-20; docs/adr/0061). The reference is derived from the approved version's SHA-256 and stored
 * nowhere, so the lookup reads the practice's approved versions whose hash starts with the 12 hex digits the
 * reference fixes, in the practice's own scope (packet_version is FORCE ROW LEVEL SECURITY, and the practice is named
 * again), and keeps every one whose reference is the one asked for: nothing makes a reference unique, so every match
 * is returned.
 */

export interface PacketVersionByReference {
  readonly versionId: string;
  readonly packetId: string;
  readonly caseId: string;
  readonly versionNo: number;
  readonly disputeLevel: number;
  /** The UTC calendar date of its approval. */
  readonly approvedOn: string;
  readonly reference: string;
  readonly exported: boolean;
  readonly submitted: boolean;
}

/** The practice's approved versions whose reference is `reference` (in its printed form, normalizePacketReference()). */
export async function packetVersionsByReference(scope: PracticeScope<ScopeClient>, input: { readonly practiceId: string; readonly reference: string }): Promise<PacketVersionByReference[]> {
  requirePracticePermission(scope, input.practiceId, 'practice.open');
  const prefix = packetReferencePrefix(input.reference);
  const { rows } = await scope.client.query<{
    id: string;
    packet_id: string;
    case_id: string;
    version_no: number;
    dispute_level: number;
    approved_at: Date;
    approved_sha256: string;
    exported: boolean;
    submitted: boolean;
  }>(
    `SELECT v.id, v.packet_id, p.case_id, v.version_no, v.dispute_level, v.approved_at, v.approved_sha256, v.exported_at IS NOT NULL AS exported,
            EXISTS (SELECT 1 FROM submission s WHERE s.packet_version_id = v.id AND s.practice_id = v.practice_id) AS submitted
       FROM packet_version v JOIN packet p ON p.id = v.packet_id
      WHERE v.practice_id = $1 AND v.approved_sha256 IS NOT NULL AND left(v.approved_sha256, 12) = $2
      ORDER BY v.approved_at DESC, v.id`,
    [input.practiceId, prefix],
  );
  return withPacketReference(
    rows.map((row) => ({ ...row, approvedSha256: row.approved_sha256 })),
    input.reference,
  ).map((row) => ({
    versionId: row.id,
    packetId: row.packet_id,
    caseId: row.case_id,
    versionNo: row.version_no,
    disputeLevel: row.dispute_level,
    approvedOn: row.approved_at.toISOString().slice(0, 10),
    reference: packetReference(row.approved_sha256),
    exported: row.exported,
    submitted: row.submitted,
  }));
}
