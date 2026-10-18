import { createHash } from 'node:crypto';

import { type PracticeScope, type ScopeClient, loadPracticeCipher, readWithAudit, recordAuditEvent } from '@tp/db/runtime';
import type { AuditReportContent } from '@tp/worker/reports';

import { type ListPage, pageWindow } from '../http/paging';
import type { Services } from '../server/services';

/**
 * The Reports reads and the report files (PRD 7, Reports: "Audit report ... export history; generate,
 * download"; PRD 4, Audit v0; PRD 6, Reports and exports: "line-level exports role-gated and
 * logged"; docs/adr/0038). A report's numbers are read as the report job stored them
 * (tp-audit-report/1) and never recomputed here; its PDF and CSV are read from the object store,
 * opened with the practice's key and checked against the SHA-256 the report recorded before they are
 * sent; every download is recorded (audit_report_download) and audited.
 */

type Scope = PracticeScope<ScopeClient>;

export type ReportStatus = 'queued' | 'ready' | 'failed';
export type ReportFile = 'pdf' | 'csv';

export interface ReportSummary {
  readonly id: string;
  readonly status: ReportStatus;
  readonly runId: string;
  readonly periodFrom: string;
  readonly periodTo: string;
  /** Who requested it: their email where the actor may see it (the user directory's policies), else null. */
  readonly requestedBy: string | null;
  readonly createdAt: string;
  readonly generatedAt: string | null;
  readonly asOf: string | null;
  readonly failureCode: string | null;
  readonly pdfSha256: string | null;
  readonly csvSha256: string | null;
  /**
   * Who signed the attestation, once signed: their email where the user directory lets the reader see it,
   * else their role, "the reimbursement reviewer" (an internal reviewer reaches the practice under a support
   * grant, and the directory hides them from the practice's people). Null until signed.
   */
  readonly attestedBy: string | null;
  readonly attestedAt: string | null;
  /** Who released it, once released: their email where the reader may see it, else "a member of the practice". Null until released. */
  readonly releasedBy: string | null;
  readonly releasedAt: string | null;
  /** The headline as generated; null until the report is ready. */
  readonly headline: AuditReportContent['headline'] | null;
}

export interface ReportDetail extends ReportSummary {
  readonly content: AuditReportContent | null;
  readonly attestation: Attestation | null;
}

/** What a reviewer signs: the checklist items they confirmed and the files' SHA-256 (no words a person typed). */
export interface Attestation {
  readonly format: 'tp-attestation/1';
  readonly checklist: readonly string[];
  readonly pdf_sha256: string;
  readonly csv_sha256: string;
}

interface ReportRow {
  readonly id: string;
  readonly practice_id: string;
  readonly status: ReportStatus;
  readonly pricing_run_id: string;
  readonly period_from: string;
  readonly period_to: string;
  readonly requested_by: string | null;
  readonly created_at: Date;
  readonly generated_at: Date | null;
  readonly as_of: string | null;
  readonly failure_code: string | null;
  readonly pdf_sha256: string | null;
  readonly csv_sha256: string | null;
  readonly attested_by: string | null;
  readonly attested_at: Date | null;
  readonly released_by: string | null;
  readonly released_at: Date | null;
  readonly headline: AuditReportContent['headline'] | null;
  readonly content?: AuditReportContent | null;
  readonly attestation?: Attestation | null;
}

const REPORTS = (withContent: boolean) => `
  SELECT a.id, a.practice_id, a.status, a.pricing_run_id, r.period_from::text, r.period_to::text, qu.email AS requested_by, a.created_at, a.generated_at,
         a.as_of::text, a.failure_code, a.pdf_sha256, a.csv_sha256, au.email AS attested_by, a.attested_at, lu.email AS released_by, a.released_at,
         a.content -> 'headline' AS headline${withContent ? ', a.content, a.attestation' : ''}
    FROM audit_report a
    JOIN pricing_run r ON r.id = a.pricing_run_id
    LEFT JOIN "user" qu ON qu.id = a.requested_by
    LEFT JOIN "user" au ON au.id = a.attested_by
    LEFT JOIN "user" lu ON lu.id = a.released_by`;

/** The signer named by role where the directory hides their address (as Contracts names "the contract specialist"). */
export const REVIEWER_ROLE = 'the reimbursement reviewer';

function summary(row: ReportRow): ReportSummary {
  return {
    id: row.id,
    status: row.status,
    runId: row.pricing_run_id,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    requestedBy: row.requested_by,
    createdAt: row.created_at.toISOString(),
    generatedAt: row.generated_at?.toISOString() ?? null,
    asOf: row.as_of,
    failureCode: row.failure_code,
    pdfSha256: row.pdf_sha256,
    csvSha256: row.csv_sha256,
    attestedBy: row.attested_at === null ? null : (row.attested_by ?? REVIEWER_ROLE),
    attestedAt: row.attested_at?.toISOString() ?? null,
    releasedBy: row.released_at === null ? null : (row.released_by ?? 'a member of the practice'),
    releasedAt: row.released_at?.toISOString() ?? null,
    headline: row.headline,
  };
}

export const REPORTS_PER_PAGE = 25;
export const DOWNLOADS_PER_PAGE = 50;

/** A page of the practice's reports, newest first. */
export async function listReports(scope: Scope, practiceId: string, requestId: string, page = 1): Promise<ListPage<ReportSummary>> {
  const { rows: counted } = await scope.client.query<{ n: number }>('SELECT count(*)::int AS n FROM audit_report WHERE practice_id = $1', [practiceId]);
  const total = counted[0]?.n ?? 0;
  const at = pageWindow(total, REPORTS_PER_PAGE, page);
  const rows = await readWithAudit(
    scope,
    { objectType: 'audit_report', purpose: 'report_review', requestId },
    async (client) =>
      (await client.query<ReportRow>(`${REPORTS(false)} WHERE a.practice_id = $1 ORDER BY a.created_at DESC, a.id LIMIT ${String(REPORTS_PER_PAGE)} OFFSET ${String(at.offset)}`, [practiceId])).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  return { items: rows.map(summary), page: at.page, pages: at.pages, total };
}

export async function reportOf(scope: Scope, practiceId: string, reportId: string, requestId: string): Promise<ReportDetail | undefined> {
  const [row] = await readWithAudit(
    scope,
    { objectType: 'audit_report', purpose: 'report_review', requestId },
    async (client) => (await client.query<ReportRow>(`${REPORTS(true)} WHERE a.id = $1 AND a.practice_id = $2`, [reportId, practiceId])).rows,
    (found) => ({ objectId: found.id, practiceId: found.practice_id }),
  );
  return row === undefined ? undefined : { ...summary(row), content: row.content ?? null, attestation: row.attestation ?? null };
}

export interface DownloadRecord {
  readonly reportId: string;
  readonly file: ReportFile;
  readonly downloadedBy: string | null;
  readonly downloadedAt: string;
}

/** A page of the export history: who downloaded which report's file, newest first (one report's, or every report's). */
export async function downloads(scope: Scope, practiceId: string, reportId: string | null, requestId: string, page = 1): Promise<ListPage<DownloadRecord>> {
  const { rows: counted } = await scope.client.query<{ n: number }>('SELECT count(*)::int AS n FROM audit_report_download d WHERE d.practice_id = $1 AND ($2::uuid IS NULL OR d.audit_report_id = $2)', [
    practiceId,
    reportId,
  ]);
  const total = counted[0]?.n ?? 0;
  const at = pageWindow(total, DOWNLOADS_PER_PAGE, page);
  const rows = await readWithAudit(
    scope,
    { objectType: 'audit_report_download', purpose: 'export_history', requestId },
    async (client) =>
      (
        await client.query<{ id: string; practice_id: string; audit_report_id: string; file: ReportFile; downloaded_by: string | null; downloaded_at: Date }>(
          `SELECT d.id, d.practice_id, d.audit_report_id, d.file, u.email AS downloaded_by, d.downloaded_at
             FROM audit_report_download d LEFT JOIN "user" u ON u.id = d.downloaded_by
            WHERE d.practice_id = $1 AND ($2::uuid IS NULL OR d.audit_report_id = $2)
            ORDER BY d.downloaded_at DESC, d.id LIMIT ${String(DOWNLOADS_PER_PAGE)} OFFSET ${String(at.offset)}`,
          [practiceId, reportId],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  return { items: rows.map((row) => ({ reportId: row.audit_report_id, file: row.file, downloadedBy: row.downloaded_by, downloadedAt: row.downloaded_at.toISOString() })), page: at.page, pages: at.pages, total };
}

/** A stored report file did not match the SHA-256 its report recorded: it is never sent. */
export class ReportFileIntegrityError extends Error {
  override readonly name = 'ReportFileIntegrityError';
}

async function collect(source: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of source) {
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts);
}

/**
 * A ready report's file, read and checked against its recorded SHA-256, with the download recorded
 * in the downloader's name and audited (action audit_report_downloaded, purpose the file). Undefined
 * when the report is not the practice's or not ready.
 */
export async function reportFile(scope: Scope, services: Services, practiceId: string, reportId: string, file: ReportFile, requestId: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const { rows } = await scope.client.query<{ key: string | null; sha256: string | null }>(
    `SELECT ${file === 'pdf' ? 'pdf_key' : 'csv_key'} AS key, ${file === 'pdf' ? 'pdf_sha256' : 'csv_sha256'} AS sha256
       FROM audit_report WHERE id = $1 AND practice_id = $2 AND status = 'ready'`,
    [reportId, practiceId],
  );
  const row = rows[0];
  if (row?.key === null || row?.key === undefined || row.sha256 === null) {
    return undefined;
  }
  const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
  const bytes = await collect(services.documents.read(cipher, row.key));
  if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
    throw new ReportFileIntegrityError('the stored report file does not match the SHA-256 its report recorded');
  }
  await scope.client.query('INSERT INTO audit_report_download (practice_id, audit_report_id, file, downloaded_by) VALUES ($1, $2, $3, app_actor_id())', [practiceId, reportId, file]);
  await recordAuditEvent(scope, { action: 'audit_report_downloaded', objectType: 'audit_report', objectId: reportId, practiceId, purpose: file === 'pdf' ? 'report_pdf' : 'line_export', requestId });
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}
