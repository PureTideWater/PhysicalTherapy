import { randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createOrganization, createUser } from '@tp/db/testing';

import { type PacketExportDownloadServices, type PacketExportFile, downloadPacketExport } from '../downloads';
import { attestPacketExport } from '../services';

/**
 * Test support (synthetic data only): the reimbursement reviewer who attests a packet's export (D16;
 * docs/adr/0061), an internal user with the reviewer role and a four-hour support grant on the practice,
 * as the founder reaches a practice; and the attestation itself, over the export's two SHA-256 as the
 * version records them, once the reviewer has downloaded both files (each checked against its SHA-256 and
 * recorded as their download, as the review's download routes do; the owner's addition of 2026-10-18).
 */

/** A reimbursement reviewer of a new internal organization, under a support grant on the practice; their user ID. */
export async function grantedReviewer(owner: DatabaseClient, practiceId: string): Promise<string> {
  const internal = await createOrganization(owner, 'internal', `review ${randomUUID().slice(0, 8)}`);
  const reviewer = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, reviewer, 'reviewer');
  await asOwner(owner, [practiceId], () =>
    owner.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'RV-PACKET', 'SYNTHETIC PACKET REVIEW', now() + interval '4 hours')`, [practiceId, reviewer]),
  );
  return reviewer;
}

/** `actorId` downloads the version's PDF and CSV as the download routes serve them (each checked against its SHA-256 and recorded as theirs). */
export async function downloadExportAs(
  app: DatabasePool,
  services: PacketExportDownloadServices,
  practiceId: string,
  actorId: string,
  versionId: string,
  files: readonly PacketExportFile[] = ['pdf', 'csv'],
): Promise<void> {
  for (const file of files) {
    const bytes = await withPracticeScope(app, { actorId, practiceIds: [practiceId] }, (scope) => downloadPacketExport(scope, services, { practiceId, versionId, file, requestId: `test-download-${randomUUID()}` }));
    if (bytes === undefined) {
      throw new Error('the packet version has no export to download');
    }
  }
}

/** The reviewer downloads the version's two files and attests its export over the SHA-256 it records. */
export async function attestAsReviewer(app: DatabasePool, services: PacketExportDownloadServices, practiceId: string, reviewerId: string, versionId: string): Promise<Date> {
  await downloadExportAs(app, services, practiceId, reviewerId, versionId);
  return withPracticeScope(app, { actorId: reviewerId, practiceIds: [practiceId] }, async (scope) => {
    const { rows } = await scope.client.query<{ export_sha256: string; export_csv_sha256: string }>('SELECT export_sha256, export_csv_sha256 FROM packet_version WHERE id = $1', [versionId]);
    const row = rows[0];
    if (row === undefined) {
      throw new Error('no such packet version');
    }
    const attested = await attestPacketExport(scope, { practiceId, versionId, pdfSha256: row.export_sha256, csvSha256: row.export_csv_sha256, requestId: `test-attest-${randomUUID()}` });
    return attested.attestedAt;
  });
}
