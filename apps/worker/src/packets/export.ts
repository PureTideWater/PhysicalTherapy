import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { type KeyProvider, type PracticeCipher, type PracticeScope, type ScopeClient, loadPracticeCipher, packetExportKey, readWithAudit } from '@tp/db/runtime';
import { type PacketContent, type RowIdentifiers, insertIdentifiers } from '@tp/packets';

import type { JobHandler } from '../jobs/handlers';
import type { PdfRenderer } from '../report/pdf';
import type { DocumentStore } from '../storage/documents';
import type { TriageJobContext } from '../triage/execute';
import { packetCsv } from './csv';
import { packetHtml } from './html';

/**
 * The packet export job (PRD 12: "Identifiers ... inserted from the record at export"; "Export
 * produces a PDF and a CSV schedule, hashed and stored; the hash is in the submission log"; test
 * matrix CAS-11, CAS-12), in the packet's one practice, in one transaction: the current approved
 * version whose lines are still its case's is read, its narrative decrypted, the identifiers of each
 * schedule row read from the canonical claim and patient records (an audited read) and inserted, the
 * PDF printed by Chromium from self-contained HTML and the CSV schedule written, both stored sealed
 * with the practice's key under keys of their own for this attempt, and the version records their keys
 * and SHA-256 (the database lets only a job record them, once, on an approved current version). A
 * version already exported is left as it is (JOB-01); one not approved, no longer current or whose case
 * changed is refused at once, since no attempt changes that.
 */

export interface PacketExportServices {
  readonly documents: DocumentStore;
  readonly keys: KeyProvider;
  readonly pdf: PdfRenderer;
}

export type PacketExportOutcome =
  | { readonly outcome: 'exported'; readonly pdfSha256: string; readonly csvSha256: string }
  | { readonly outcome: 'already_exported' }
  | { readonly outcome: 'not_exportable'; readonly reason: 'not_approved' | 'not_current' | 'case_changed' }
  | { readonly outcome: 'missing' };

interface ExportRow {
  readonly packet_id: string;
  readonly version_no: number;
  readonly content: PacketContent;
  readonly narrative: string;
  readonly content_sha256: string;
  readonly approved_at: Date | null;
  readonly approved_alone: boolean;
  readonly exported_at: Date | null;
  readonly current: boolean;
  readonly matches: boolean;
  readonly drafted_by_email: string | null;
  readonly approved_by_email: string | null;
  readonly regulation_confirmed_by_email: string | null;
}

interface IdentifierRow {
  readonly service_line_id: string;
  readonly practice_id: string;
  readonly patient_control_number: string;
  readonly payer_claim_control_number: string;
  readonly last_name: string | null;
  readonly first_name: string | null;
  readonly member_id: string | null;
  readonly insured_member_id: string | null;
}

/** Each schedule row's identifiers from its claim and patient records (the canonical record), decrypted. */
async function identifiersOf(scope: PracticeScope<ScopeClient>, cipher: PracticeCipher, content: PacketContent, requestId: string): Promise<Map<number, RowIdentifiers>> {
  const lineIds = content.lines.map((line) => line.service_line_id);
  const rows = await readWithAudit(
    scope,
    { objectType: 'claim', purpose: 'packet_export', requestId },
    async (client) =>
      (
        await client.query<IdentifierRow>(
          `SELECT sl.id AS service_line_id, c.practice_id, c.patient_control_number, c.payer_claim_control_number, pr.last_name, pr.first_name, pr.member_id,
                  ir.member_id AS insured_member_id
             FROM service_line sl JOIN claim c ON c.id = sl.claim_id JOIN patient_ref pr ON pr.id = c.patient_ref_id LEFT JOIN patient_ref ir ON ir.id = c.insured_ref_id
            WHERE sl.id = ANY ($1::uuid[])`,
          [lineIds],
        )
      ).rows,
    (row) => ({ objectId: row.service_line_id, practiceId: row.practice_id }),
  );
  const byLine = new Map(rows.map((row) => [row.service_line_id, row]));
  const decrypt = (column: 'patient_ref.last_name' | 'patient_ref.first_name' | 'patient_ref.member_id', value: string | null) => (value === null ? null : cipher.decrypt(column, value));
  const identifiers = new Map<number, RowIdentifiers>();
  for (const line of content.lines) {
    const row = byLine.get(line.service_line_id);
    if (row === undefined) {
      continue;
    }
    const last = decrypt('patient_ref.last_name', row.last_name);
    const first = decrypt('patient_ref.first_name', row.first_name);
    identifiers.set(line.row, {
      claim_control_number: cipher.decrypt('claim.payer_claim_control_number', row.payer_claim_control_number),
      patient_control_number: cipher.decrypt('claim.patient_control_number', row.patient_control_number),
      patient_name: last === null && first === null ? null : [last, first].filter((part) => part !== null).join(', '),
      member_id: decrypt('patient_ref.member_id', row.member_id) ?? decrypt('patient_ref.member_id', row.insured_member_id),
    });
  }
  return identifiers;
}

export async function exportPacketVersion(context: TriageJobContext, services: PacketExportServices, practiceId: string, versionId: string): Promise<PacketExportOutcome> {
  return context.transaction(async (scope) => {
    // One export of a version at a time, whatever the queue does.
    await scope.client.query("SELECT pg_advisory_xact_lock(hashtextextended('packet_export:' || $1::text, 0))", [versionId]);
    const { rows } = await scope.client.query<ExportRow>(
      `SELECT v.packet_id, v.version_no, v.content, v.narrative, v.content_sha256, v.approved_at, v.approved_alone, v.exported_at,
              p.current_version_id = v.id AS current, packet_version_matches_case(p.case_id, v.content) AS matches,
              people.drafted_by_email, people.approved_by_email, people.regulation_confirmed_by_email
         FROM packet_version v JOIN packet p ON p.id = v.packet_id, LATERAL packet_version_people(v.id) people
        WHERE v.id = $1 AND v.practice_id = $2`,
      [versionId, practiceId],
    );
    const version = rows[0];
    if (version === undefined) {
      return { outcome: 'missing' };
    }
    if (version.exported_at !== null) {
      return { outcome: 'already_exported' };
    }
    if (version.approved_at === null) {
      return { outcome: 'not_exportable', reason: 'not_approved' };
    }
    if (!version.current) {
      return { outcome: 'not_exportable', reason: 'not_current' };
    }
    if (!version.matches) {
      return { outcome: 'not_exportable', reason: 'case_changed' };
    }
    const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
    const narrative = cipher.decrypt('packet_version.narrative', version.narrative);
    const exported = insertIdentifiers(version.content, narrative, await identifiersOf(scope, cipher, version.content, context.jobId));
    const pdf = await services.pdf.render(
      packetHtml(exported, {
        versionNo: version.version_no,
        versionSha256: version.content_sha256,
        draftedBy: version.drafted_by_email,
        approvedBy: version.approved_by_email,
        approvedAt: version.approved_at.toISOString(),
        approvedAlone: version.approved_alone,
        regulationConfirmedBy: version.regulation_confirmed_by_email,
      }),
    );
    const csv = Buffer.from(packetCsv(exported), 'utf8');
    const pdfKey = packetExportKey(practiceId, version.packet_id, randomUUID(), 'pdf');
    const csvKey = packetExportKey(practiceId, version.packet_id, randomUUID(), 'csv');
    const writtenPdf = await services.documents.write(cipher, pdfKey, Readable.from([pdf]));
    const writtenCsv = await services.documents.write(cipher, csvKey, Readable.from([csv]));
    await scope.client.query(
      'UPDATE packet_version SET export_pdf_key = $3, export_csv_key = $4, export_sha256 = $5, export_csv_sha256 = $6 WHERE id = $1 AND practice_id = $2',
      [versionId, practiceId, pdfKey, csvKey, writtenPdf.sha256, writtenCsv.sha256],
    );
    return { outcome: 'exported', pdfSha256: writtenPdf.sha256, csvSha256: writtenCsv.sha256 };
  });
}

/** The error code an export not made is logged with, by reason. */
const EXPORT_REFUSALS = {
  missing: 'PACKET_VERSION_NOT_FOUND',
  not_approved: 'PACKET_VERSION_NOT_APPROVED',
  not_current: 'PACKET_VERSION_NOT_CURRENT',
  case_changed: 'PACKET_CASE_CHANGED',
} as const;

export function packetExportHandler(services: PacketExportServices): JobHandler<'packet_export'> {
  return async (payload, context) => {
    const outcome = await exportPacketVersion(context, services, payload.practice_id, payload.packet_version_id);
    if (outcome.outcome === 'missing' || outcome.outcome === 'not_exportable') {
      context.logger.warn('packet not exported', { packet_version_id: payload.packet_version_id, error_code: EXPORT_REFUSALS[outcome.outcome === 'missing' ? 'missing' : outcome.reason] });
    }
  };
}
