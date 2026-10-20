import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { type KeyProvider, type PracticeScope, type ScopeClient, loadPracticeCipher, packetExportKey, recordAuditEvent } from '@tp/db/runtime';
import { type PacketContent, type VerifierReport, insertIdentifiers, narrativeFacts, packetReference, verifyNarrative } from '@tp/packets';

import type { JobHandler } from '../jobs/handlers';
import type { PdfRenderer } from '../report/pdf';
import type { DocumentStore } from '../storage/documents';
import { type TriageJobContext, todayUtc } from '../triage/execute';
import { practiceCorrespondenceContact } from './correspondence';
import { packetCsv } from './csv';
import { packetHtml } from './html';
import { scheduleIdentifiers } from './identifiers';
import { type PacketExportFailure, type PacketExportRefusal, exportReadiness } from './readiness';

export { exportDeadlineStatus } from './readiness';

/**
 * The packet export job (PRD 12: "Identifiers ... inserted from the record at export"; "Export
 * produces a PDF and a CSV schedule, hashed and stored; the hash is in the submission log"; test
 * matrix CAS-11, CAS-12), in the packet's one practice, in one transaction: the current approved
 * version whose lines are still its case's is read, its narrative decrypted, the identifiers of each
 * schedule row read from the canonical claim and patient records (an audited read) and inserted, the
 * PDF printed by Chromium from self-contained HTML and the CSV schedule written, both stored sealed
 * with the practice's key under keys of their own for this attempt, and the version records their keys
 * and SHA-256 (the database lets only a job record them, once, on an approved current version). A
 * version already exported is left as it is (JOB-01); one the readiness refuses is refused at once, since
 * no attempt changes that.
 *
 * CO-05 (docs/adr/0061): the export is refused, and no file written, for every reason exportReadiness()
 * gives (./readiness.ts, which the web's export action and requestPacketExport() ask first): the version not
 * approved, not current, a tp-packet/1 version, its case changed or closed, a version of an earlier dispute
 * level, a line's window passed, its pricing no longer current (audit item #4), its deadline not verified
 * (derived again now both by the database, packet_version_deadline_status, which also refuses the export's
 * UPDATE, and by @tp/triage), or what it states of its deadlines and calculations not what its inputs give
 * now; and when the verifier, run again over exactly the narrative and content the PDF and CSV are printed
 * from and against the schedule rows' identifiers read now, fails it. Its report is stored with the export.
 * The SHA-256 recorded is of the exact bytes printed, and the store must have sealed exactly those bytes (its
 * plaintext hash) before the version records them.
 *
 * Audit item #26 (the founder's ruling of 2026-10-18): every refusal is an audit event of the version
 * (packet_export_refused, its purpose the first reason, or verifier_failed) written by the job in its own
 * transaction, and every failed try one too (packet_export_attempt_failed while another try follows,
 * packet_export_failed on the last), written by the handler in a transaction of its own before the error is
 * rethrown, its purpose the failure's code. Codes and the version's ID only: no words, no patient data. The
 * packet page reads the latest (packet_version_export_attempt()). The logs keep the error code only.
 *
 * Audit item #37 part 1 (the founder's rulings of 2026-10-20; docs/adr/0061): the PDF and the CSV are the payer's
 * copy (./html.ts, ./csv.ts). The job reads no login and no approver for them (D13): the version's approval date (its
 * UTC calendar date), its reference (packetReference(approved_sha256), D5) and the practice's correspondence contact,
 * read again here after the readiness and before any narrative is decrypted or identifier read; a contact that is
 * not set by then (a concurrent change) refuses the export with contact_missing too (D7, step 3), recorded and never
 * retried.
 */

export interface PacketExportServices {
  readonly documents: DocumentStore;
  readonly keys: KeyProvider;
  readonly pdf: PdfRenderer;
}

export type { PacketExportRefusal } from './readiness';

export type PacketExportOutcome =
  | { readonly outcome: 'exported'; readonly pdfSha256: string; readonly csvSha256: string; readonly verifier: VerifierReport }
  | { readonly outcome: 'already_exported' }
  /** Refused: the first reason that holds (the refusal's event records it). */
  | { readonly outcome: 'not_exportable'; readonly reason: PacketExportRefusal }
  | { readonly outcome: 'missing' };

/** The store sealed other bytes than the export printed: nothing is recorded, and the job fails. */
export class PacketExportIntegrityError extends Error {
  override readonly name = 'PacketExportIntegrityError';
}

/** The PDF renderer failed: nothing is stored, and the job fails (fixed words; the renderer's own error is the cause, never logged). */
export class PacketExportRenderError extends Error {
  override readonly name = 'PacketExportRenderError';

  constructor(cause: unknown) {
    super('the PDF renderer failed to print the packet', { cause });
  }
}

/** The document store failed to seal a file: nothing is recorded, and the job fails (fixed words; the store's error is the cause). */
export class PacketExportStoreError extends Error {
  override readonly name = 'PacketExportStoreError';

  constructor(cause: unknown) {
    super('the document store failed to seal an export file', { cause });
  }
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

interface ExportRow {
  readonly packet_id: string;
  readonly content: PacketContent;
  readonly narrative: string;
  readonly verifier_report: VerifierReport;
  readonly approved_at: Date | null;
  readonly approved_sha256: string | null;
}

/** The job's refusal of a version, as an audit event in the export's own transaction: the version and one code, nothing else. */
async function recordRefusal(scope: PracticeScope<ScopeClient>, context: TriageJobContext, practiceId: string, versionId: string, reason: PacketExportRefusal): Promise<void> {
  await recordAuditEvent(scope, { action: 'packet_export_refused', objectType: 'packet_version', objectId: versionId, practiceId, purpose: reason, requestId: context.jobId });
}

export interface PacketExportOptions {
  /** The day a line's window is judged on (UTC); today unless a test names one. */
  readonly asOf?: string;
}

export async function exportPacketVersion(
  context: TriageJobContext,
  services: PacketExportServices,
  practiceId: string,
  versionId: string,
  options: PacketExportOptions = {},
): Promise<PacketExportOutcome> {
  return context.transaction(async (scope) => {
    // One export of a version at a time, whatever the queue does.
    await scope.client.query("SELECT pg_advisory_xact_lock(hashtextextended('packet_export:' || $1::text, 0))", [versionId]);
    const readiness = await exportReadiness(scope.client, { practiceId, versionId, asOf: options.asOf ?? todayUtc() });
    if (readiness === undefined) {
      return { outcome: 'missing' };
    }
    if (readiness.outcome === 'exported') {
      return { outcome: 'already_exported' };
    }
    if (readiness.outcome === 'refused') {
      await recordRefusal(scope, context, practiceId, versionId, readiness.reasons[0]);
      return { outcome: 'not_exportable', reason: readiness.reasons[0] };
    }
    const { rows } = await scope.client.query<ExportRow>(
      `SELECT v.packet_id, v.content, v.narrative, v.verifier_report, v.approved_at, v.approved_sha256
         FROM packet_version v
        WHERE v.id = $1 AND v.practice_id = $2`,
      [versionId, practiceId],
    );
    const version = rows[0];
    if (version === undefined) {
      return { outcome: 'missing' };
    }
    if (version.approved_at === null || version.approved_sha256 === null) {
      // The readiness read it approved in this transaction, and an approval is never taken back; this does not happen.
      await recordRefusal(scope, context, practiceId, versionId, 'not_approved');
      return { outcome: 'not_exportable', reason: 'not_approved' };
    }
    // The contact the payer's copy prints, read in this transaction before anything is decrypted (D7, step 3).
    const contact = await practiceCorrespondenceContact(scope.client, practiceId);
    if (contact.state !== 'set') {
      await recordRefusal(scope, context, practiceId, versionId, 'contact_missing');
      return { outcome: 'not_exportable', reason: 'contact_missing' };
    }
    const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
    const narrative = cipher.decrypt('packet_version.narrative', version.narrative);
    const identifiers = await scheduleIdentifiers(scope, cipher, version.content, { purpose: 'packet_export', requestId: context.jobId });
    // The verifier again, over exactly what is printed below: this narrative, this content, today's identifiers.
    const verifier = verifyNarrative(narrative, narrativeFacts(version.content), identifiers.all);
    if (!verifier.passed || verifier.narrative_sha256 !== version.verifier_report.narrative_sha256) {
      await recordRefusal(scope, context, practiceId, versionId, 'verifier_failed');
      return { outcome: 'not_exportable', reason: 'verifier_failed' };
    }
    const exported = insertIdentifiers(version.content, narrative, identifiers.rows);
    // The payer's copy: the approval's UTC date, the reference its approved hash gives, the contact (D4 to D6, D13).
    const html = packetHtml(exported, { approvedOn: version.approved_at.toISOString().slice(0, 10), reference: packetReference(version.approved_sha256), contact: contact.contact });
    let pdf: Uint8Array;
    try {
      pdf = await services.pdf.render(html);
    } catch (error) {
      throw new PacketExportRenderError(error);
    }
    const csv = Buffer.from(packetCsv(exported), 'utf8');
    // The hashes of the exact bytes printed, which the store must seal unchanged.
    const pdfSha256 = sha256(pdf);
    const csvSha256 = sha256(csv);
    const pdfKey = packetExportKey(practiceId, version.packet_id, randomUUID(), 'pdf');
    const csvKey = packetExportKey(practiceId, version.packet_id, randomUUID(), 'csv');
    let writtenPdf;
    let writtenCsv;
    try {
      writtenPdf = await services.documents.write(cipher, pdfKey, Readable.from([pdf]));
      writtenCsv = await services.documents.write(cipher, csvKey, Readable.from([csv]));
    } catch (error) {
      throw new PacketExportStoreError(error);
    }
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
  outdated: 'PACKET_VERSION_OUTDATED',
  case_changed: 'PACKET_CASE_CHANGED',
  not_case_level: 'PACKET_VERSION_NOT_CASE_LEVEL',
  window_passed: 'PACKET_WINDOW_PASSED',
  next_window_passed: 'PACKET_NEXT_WINDOW_PASSED',
  pricing_not_current: 'PACKET_PRICING_NOT_CURRENT',
  deadline_unverified: 'PACKET_DEADLINE_UNVERIFIED',
  inputs_differ: 'PACKET_CONTENT_NOT_ITS_INPUTS',
  contact_missing: 'PACKET_CORRESPONDENCE_CONTACT_MISSING',
  verifier_failed: 'PACKET_VERIFIER_FAILED',
} as const satisfies Readonly<Record<PacketExportRefusal | 'missing', string>>;

/** The error code a failed try is logged with, by its failure code. */
export const EXPORT_FAILURES = {
  store_mismatch: 'PACKET_EXPORT_STORE_MISMATCH',
  render_failed: 'PACKET_EXPORT_RENDER_FAILED',
  store_failed: 'PACKET_EXPORT_STORE_FAILED',
  database_refused: 'PACKET_EXPORT_DATABASE_REFUSED',
  unexpected: 'PACKET_EXPORT_UNEXPECTED',
} as const satisfies Readonly<Record<PacketExportFailure, string>>;

/** A database rule refused the export's own statements: a check or a privilege (the guard, the export's keys, the job's role). */
const REFUSING_SQLSTATES: ReadonlySet<string> = new Set(['23514', '42501']);

/** What a failed try failed on, as one code: the store's integrity, the renderer, the store, a database rule, or anything else. */
export function exportFailureCode(error: unknown): PacketExportFailure {
  if (error instanceof PacketExportIntegrityError) {
    return 'store_mismatch';
  }
  if (error instanceof PacketExportRenderError) {
    return 'render_failed';
  }
  if (error instanceof PacketExportStoreError) {
    return 'store_failed';
  }
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && REFUSING_SQLSTATES.has(error.code)) {
    return 'database_refused';
  }
  return 'unexpected';
}

export function packetExportHandler(services: PacketExportServices): JobHandler<'packet_export'> {
  return async (payload, context) => {
    let outcome: PacketExportOutcome;
    try {
      outcome = await exportPacketVersion(context, services, payload.practice_id, payload.packet_version_id);
    } catch (error) {
      const code = exportFailureCode(error);
      // The failed try, in a transaction of its own (the export's rolled back): another try follows, or this was the last.
      try {
        await context.transaction((scope) =>
          recordAuditEvent(scope, {
            action: context.lastAttempt ? 'packet_export_failed' : 'packet_export_attempt_failed',
            objectType: 'packet_version',
            objectId: payload.packet_version_id,
            practiceId: payload.practice_id,
            purpose: code,
            requestId: context.jobId,
          }),
        );
      } catch {
        context.logger.warn('packet export failure not recorded', { packet_version_id: payload.packet_version_id, error_code: 'PACKET_EXPORT_FAILURE_NOT_RECORDED' });
      }
      context.logger.warn('packet export failed', { packet_version_id: payload.packet_version_id, error_code: EXPORT_FAILURES[code] });
      throw error;
    }
    if (outcome.outcome === 'missing' || outcome.outcome === 'not_exportable') {
      context.logger.warn('packet not exported', { packet_version_id: payload.packet_version_id, error_code: EXPORT_REFUSALS[outcome.outcome === 'missing' ? 'missing' : outcome.reason] });
    }
  };
}
