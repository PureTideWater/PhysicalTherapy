import { createHash } from 'node:crypto';

import { type KeyProvider, type PracticeScope, type ScopeClient, loadPracticeCipher, readWithAudit, recordAuditEvent } from '@tp/db/runtime';

import { type DocumentStore, collect } from '../storage/documents';

/**
 * A packet export's files as a person downloads them (D16; the owner's addition of 2026-10-18, docs/adr/0061):
 * the version's PDF or CSV read from the sealed store under the caller's scope, its bytes hashed and served only
 * when the hash is the one the version recorded, and the download recorded in the same transaction as
 * packet_export_pdf_downloaded or packet_export_csv_downloaded (purpose line_export: the files carry the
 * identifiers). That event is the evidence a reimbursement reviewer's attestation needs: the database records it
 * only for a person, in their own name, who may read the export, of an exported version
 * (audit_event_packet_download), so a job's scope writes none; and the attestation counts only the attester's
 * own downloads of that version since its export (packet_export_downloads_of_actor()).
 */

/** The two files of an export. */
export const PACKET_EXPORT_FILES = ['pdf', 'csv'] as const;
export type PacketExportFile = (typeof PACKET_EXPORT_FILES)[number];

/** The audit action each file's download records (the export history lists them with the earlier packet_export_downloaded). */
export const PACKET_EXPORT_DOWNLOADED: Readonly<Record<PacketExportFile, string>> = {
  pdf: 'packet_export_pdf_downloaded',
  csv: 'packet_export_csv_downloaded',
};

/** A stored export did not hash to the SHA-256 its version recorded: it is never served, and nothing is recorded. */
export class PacketExportFileIntegrityError extends Error {
  override readonly name = 'PacketExportFileIntegrityError';
}

export interface PacketExportDownloadServices {
  readonly documents: DocumentStore;
  readonly keys: KeyProvider;
}

export interface PacketExportDownloadInput {
  readonly practiceId: string;
  readonly versionId: string;
  /** The case the version must belong to (the route's own); omitted, any case of the practice. */
  readonly caseId?: string;
  readonly file: PacketExportFile;
  readonly requestId: string;
}

/**
 * A version's exported PDF or CSV (line-level PHI), checked against the SHA-256 its version recorded and
 * recorded as the caller's download; undefined when the version has no export (or is not the case's). A file
 * whose bytes do not hash to the recorded SHA-256 throws PacketExportFileIntegrityError before anything is
 * recorded, and the caller's transaction rolls back its read.
 */
export async function downloadPacketExport(
  scope: PracticeScope<ScopeClient>,
  services: PacketExportDownloadServices,
  input: PacketExportDownloadInput,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const column = input.file === 'pdf' ? { key: 'v.export_pdf_key', sha256: 'v.export_sha256' } : { key: 'v.export_csv_key', sha256: 'v.export_csv_sha256' };
  const [row] = await readWithAudit(
    scope,
    { objectType: 'packet_version', purpose: 'line_export', requestId: input.requestId },
    async (client) =>
      (
        await client.query<{ id: string; practice_id: string; key: string | null; sha256: string | null }>(
          `SELECT v.id, v.practice_id, ${column.key} AS key, ${column.sha256} AS sha256
             FROM packet_version v JOIN packet p ON p.id = v.packet_id
            WHERE v.id = $1 AND v.practice_id = $2 AND ($3::uuid IS NULL OR p.case_id = $3::uuid)`,
          [input.versionId, input.practiceId, input.caseId ?? null],
        )
      ).rows,
    (found) => ({ objectId: found.id, practiceId: found.practice_id }),
  );
  if (row?.key === null || row?.key === undefined || row.sha256 === null) {
    return undefined;
  }
  const cipher = await loadPracticeCipher(scope, services.keys, input.practiceId);
  const bytes = await collect(services.documents.read(cipher, row.key));
  if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
    throw new PacketExportFileIntegrityError('the stored packet export does not match the SHA-256 its version recorded');
  }
  // The fingerprint check passed: the download is recorded in the caller's own name, with the read.
  await recordAuditEvent(scope, { action: PACKET_EXPORT_DOWNLOADED[input.file], objectType: 'packet_version', objectId: input.versionId, practiceId: input.practiceId, purpose: 'line_export', requestId: input.requestId });
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}

/**
 * The files of the version's export that the caller, as a person, has downloaded since its export, each checked
 * against its SHA-256 as it was served (the database's packet_export_downloads_of_actor(): never another person's
 * downloads, another version's or a job's). The attestation needs both.
 */
export async function packetExportDownloads(scope: PracticeScope<ScopeClient>, input: { readonly versionId: string }): Promise<readonly PacketExportFile[]> {
  const { rows } = await scope.client.query<{ files: string[] }>('SELECT packet_export_downloads_of_actor($1) AS files', [input.versionId]);
  const files = rows[0]?.files ?? [];
  return PACKET_EXPORT_FILES.filter((file) => files.includes(file));
}
