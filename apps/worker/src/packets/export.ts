import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { type KeyProvider, type ScopeClient, loadPracticeCipher, packetExportKey } from '@tp/db/runtime';
import { type PacketContent, type VerifierReport, insertIdentifiers, narrativeFacts, verifyNarrative } from '@tp/packets';
import { type DeadlineStatus, packetDeadlineStatus } from '@tp/triage';

import type { JobHandler } from '../jobs/handlers';
import type { PdfRenderer } from '../report/pdf';
import type { DocumentStore } from '../storage/documents';
import { lineDeadlines, nextLevelDeadline } from '../triage/deadline';
import type { TriageJobContext } from '../triage/execute';
import { packetCsv } from './csv';
import { packetHtml } from './html';
import { scheduleIdentifiers } from './identifiers';
import { statesItsInputs } from './records';

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
 *
 * CO-05 (docs/adr/0061): the export is refused, and no file written, when the version is not of the case's
 * dispute level now (one written before a denial reopened the case states the earlier level's deadline);
 * when the version's deadline is not verified, derived again now both by the database
 * (packet_version_deadline_status, which also refuses the export's UPDATE) and here (the lines' deadlines
 * from their traces and their windows' evidence, or the next level's), never read from what the version
 * stated; when the version does not state its deadlines and calculations exactly as its inputs give them
 * now (each line's calculation copied again from its trace with the trace's SHA-256, each deadline and its
 * sources derived again: what is printed is what the inputs hold); and when the verifier, run again over
 * exactly the narrative and content the PDF and CSV are printed from and against the schedule rows'
 * identifiers read now, fails it. Its report is stored with the export. The SHA-256 recorded is of the exact bytes printed,
 * and the store must have sealed exactly those bytes (its plaintext hash) before the version records them.
 */

export interface PacketExportServices {
  readonly documents: DocumentStore;
  readonly keys: KeyProvider;
  readonly pdf: PdfRenderer;
}

export type PacketExportRefusal = 'not_approved' | 'not_current' | 'case_changed' | 'not_case_level' | 'deadline_unverified' | 'inputs_differ' | 'verifier_failed';

export type PacketExportOutcome =
  | { readonly outcome: 'exported'; readonly pdfSha256: string; readonly csvSha256: string; readonly verifier: VerifierReport }
  | { readonly outcome: 'already_exported' }
  | { readonly outcome: 'not_exportable'; readonly reason: PacketExportRefusal }
  | { readonly outcome: 'missing' };

/** The store sealed other bytes than the export printed: nothing is recorded, and the job fails. */
export class PacketExportIntegrityError extends Error {
  override readonly name = 'PacketExportIntegrityError';
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/**
 * The version's deadline derived again now (D17), as @tp/triage derives it: at the first dispute level
 * every line's from its stored trace and its window's evidence, after a reopened denial the next
 * level's. Never the status the version stated.
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

interface ExportRow {
  readonly packet_id: string;
  readonly case_id: string;
  readonly deadline_status: DeadlineStatus;
  readonly verifier_report: VerifierReport;
  readonly version_no: number;
  readonly content: PacketContent;
  readonly narrative: string;
  readonly content_sha256: string;
  readonly approved_at: Date | null;
  readonly approved_alone: boolean;
  readonly exported_at: Date | null;
  readonly current: boolean;
  readonly matches: boolean;
  readonly at_case_level: boolean;
  readonly drafted_by_email: string | null;
  readonly approved_by_email: string | null;
  readonly regulation_confirmed_by_email: string | null;
}

export async function exportPacketVersion(context: TriageJobContext, services: PacketExportServices, practiceId: string, versionId: string): Promise<PacketExportOutcome> {
  return context.transaction(async (scope) => {
    // One export of a version at a time, whatever the queue does.
    await scope.client.query("SELECT pg_advisory_xact_lock(hashtextextended('packet_export:' || $1::text, 0))", [versionId]);
    const { rows } = await scope.client.query<ExportRow>(
      `SELECT v.packet_id, p.case_id, v.version_no, v.content, v.narrative, v.content_sha256, v.verifier_report, v.approved_at, v.approved_alone, v.exported_at,
              p.current_version_id = v.id AS current, packet_version_matches_case(p.case_id, v.content) AS matches,
              v.dispute_level = 1 + case_reopened_levels(p.case_id) AS at_case_level,
              packet_version_deadline_status(p.case_id, v.content) AS deadline_status,
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
    // A version of the case's dispute level now: one written before a denial reopened the case states the earlier level's deadline.
    if (!version.at_case_level) {
      return { outcome: 'not_exportable', reason: 'not_case_level' };
    }
    // The deadline, derived again now by the database and by @tp/triage (CO-05): either unverified refuses it.
    if (version.deadline_status === 'unverified' || (await exportDeadlineStatus(scope.client, version.case_id, version.content)) === 'unverified') {
      return { outcome: 'not_exportable', reason: 'deadline_unverified' };
    }
    // What the version states of its deadlines and calculations, stated again from its inputs now: anything else is not printed.
    if (version.content.format !== 'tp-packet/2' || !(await statesItsInputs(scope.client, practiceId, version.case_id, version.content))) {
      return { outcome: 'not_exportable', reason: 'inputs_differ' };
    }
    const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
    const narrative = cipher.decrypt('packet_version.narrative', version.narrative);
    const identifiers = await scheduleIdentifiers(scope, cipher, version.content, { purpose: 'packet_export', requestId: context.jobId });
    // The verifier again, over exactly what is printed below: this narrative, this content, today's identifiers.
    const verifier = verifyNarrative(narrative, narrativeFacts(version.content), identifiers.all);
    if (!verifier.passed || verifier.narrative_sha256 !== version.verifier_report.narrative_sha256) {
      return { outcome: 'not_exportable', reason: 'verifier_failed' };
    }
    const exported = insertIdentifiers(version.content, narrative, identifiers.rows);
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
    // The hashes of the exact bytes printed, which the store must seal unchanged.
    const pdfSha256 = sha256(pdf);
    const csvSha256 = sha256(csv);
    const pdfKey = packetExportKey(practiceId, version.packet_id, randomUUID(), 'pdf');
    const csvKey = packetExportKey(practiceId, version.packet_id, randomUUID(), 'csv');
    const writtenPdf = await services.documents.write(cipher, pdfKey, Readable.from([pdf]));
    const writtenCsv = await services.documents.write(cipher, csvKey, Readable.from([csv]));
    if (writtenPdf.sha256 !== pdfSha256 || writtenCsv.sha256 !== csvSha256 || writtenPdf.sizeBytes !== pdf.length || writtenCsv.sizeBytes !== csv.length) {
      throw new PacketExportIntegrityError('the store sealed other bytes than the export printed');
    }
    await scope.client.query(
      'UPDATE packet_version SET export_pdf_key = $3, export_csv_key = $4, export_sha256 = $5, export_csv_sha256 = $6, export_verifier_report = $7 WHERE id = $1 AND practice_id = $2',
      [versionId, practiceId, pdfKey, csvKey, pdfSha256, csvSha256, JSON.stringify(verifier)],
    );
    return { outcome: 'exported', pdfSha256, csvSha256, verifier };
  });
}

/** The error code an export not made is logged with, by reason. */
export const EXPORT_REFUSALS = {
  missing: 'PACKET_VERSION_NOT_FOUND',
  not_approved: 'PACKET_VERSION_NOT_APPROVED',
  not_current: 'PACKET_VERSION_NOT_CURRENT',
  case_changed: 'PACKET_CASE_CHANGED',
  not_case_level: 'PACKET_VERSION_NOT_CASE_LEVEL',
  deadline_unverified: 'PACKET_DEADLINE_UNVERIFIED',
  inputs_differ: 'PACKET_CONTENT_NOT_ITS_INPUTS',
  verifier_failed: 'PACKET_VERIFIER_FAILED',
} as const;

export function packetExportHandler(services: PacketExportServices): JobHandler<'packet_export'> {
  return async (payload, context) => {
    const outcome = await exportPacketVersion(context, services, payload.practice_id, payload.packet_version_id);
    if (outcome.outcome === 'missing' || outcome.outcome === 'not_exportable') {
      context.logger.warn('packet not exported', { packet_version_id: payload.packet_version_id, error_code: EXPORT_REFUSALS[outcome.outcome === 'missing' ? 'missing' : outcome.reason] });
    }
  };
}
