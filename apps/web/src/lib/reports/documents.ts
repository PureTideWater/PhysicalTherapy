import { createHash, randomUUID } from 'node:crypto';

import { type PracticeScope, type ReportDocumentKind, type ReportDocumentStatus, type ScopeClient, loadPracticeCipher, readWithAudit, recordAuditEvent } from '@tp/db/runtime';
import {
  COVERAGE_REPORT_FORMAT,
  type CoverageReportContent,
  MONTHLY_SUMMARY_FORMAT,
  type MonthlySummaryContent,
  type MonthlySummaryRow,
  type ReportDocumentContent,
  parseReportDocument,
  reportDocumentCsv,
} from '@tp/worker/reports';

import { UNPRICED_REASON_TEXT } from '../contracts/remedies';
import { coverageInEffect } from '../coverage/in-effect';
import { allWaitingPlans, lineTotals, pricingReadiness, waitingTotals } from '../contracts/mapping-queries';
import { peopleEmails } from '../cases/people';
import { type ListPage, pageWindow } from '../http/paging';
import { type MonthlySummary, type SummaryFigure, type SummaryRow, monthlySummary } from '../monitoring/queries';
import { latestRunInEffect, runCount } from '../pricing/queries';
import type { Services } from '../server/services';

/**
 * The v1 reports' documents in the web app (PRD 5, J12; PRD 6, Reports and exports; PRD 7, Reports:
 * "generate, download, share within the organization ... export history; every total links to its
 * stage; line-level export logged"; docs/adr/0045): a coverage report or a month's variance summary is
 * generated with the screens' own queries, its figures stored as generated in the requester's name and
 * its print queued; its PDF is read from the object store, opened with the practice's key and checked
 * against its SHA-256 before it is sent; its CSV is computed from the stored figures. Every download is
 * audited, and the export history reads those audit events back for the practice's report readers.
 */

type Scope = PracticeScope<ScopeClient>;

// ---------------------------------------------------------------------------------------------------
// Generating
// ---------------------------------------------------------------------------------------------------

/**
 * The Coverage screen's figures, as a coverage report stores them: the shares and reasons of each line at its
 * pricing in effect across the runs in effect (lib/coverage/in-effect.ts), the run that took effect last, and
 * every plan waiting on a mapping.
 */
export async function coverageContent(scope: Scope, practiceId: string, today: string, requestId: string): Promise<CoverageReportContent> {
  const latest = await latestRunInEffect(scope, practiceId, requestId);
  const run = latest === undefined || latest.completedAt === null ? null : { latest, completedAt: latest.completedAt };
  const inEffect = await coverageInEffect(scope, practiceId);
  const lines = await lineTotals(scope, practiceId);
  const waiting = await waitingTotals(scope, practiceId);
  const counts = new Map(inEffect.reasons.map((entry) => [entry.reason, entry.lines]));
  const priced = inEffect.runs > 0 && inEffect.periodFrom !== null && inEffect.periodTo !== null ? { runs: inEffect.runs, from: inEffect.periodFrom, to: inEffect.periodTo } : null;
  const readiness = await pricingReadiness(scope, practiceId, requestId);
  return {
    format: COVERAGE_REPORT_FORMAT,
    generated_on: today,
    run: run === null ? null : { id: run.latest.id, period_from: run.latest.periodFrom, period_to: run.latest.periodTo, release_no: run.latest.releaseNo, completed_at: run.completedAt },
    runs_in_effect: priced === null ? null : { runs: priced.runs, period_from: priced.from, period_to: priced.to },
    lines: { lines: lines.lines, claims: lines.claims, charge_cents: lines.chargeCents, paid_cents: lines.paidCents },
    priced: priced === null ? { lines: 0, charge_cents: '0' } : { lines: inEffect.priced.lines, charge_cents: inEffect.priced.chargeCents },
    of: priced === null ? { lines: lines.lines, charge_cents: lines.chargeCents } : { lines: inEffect.of.lines, charge_cents: inEffect.of.chargeCents },
    // The closed list in the Coverage screen's order (the rules reference's), each with its count in effect; zero before a run.
    reasons: UNPRICED_REASON_TEXT.map((entry) => ({ reason: entry.reason, lines: counts.get(entry.reason) ?? 0 })),
    waiting: { lines: waiting.lines, claims: waiting.claims, charge_cents: waiting.chargeCents, paid_cents: waiting.paidCents },
    waiting_plans: (await allWaitingPlans(scope, practiceId, requestId)).map((plan) => ({
      plan_id: plan.planId,
      payer_name: plan.payerName,
      plan_key: plan.planKey,
      lines: plan.waiting.lines,
      claims: plan.waiting.claims,
      charge_cents: plan.waiting.chargeCents,
      paid_cents: plan.waiting.paidCents,
    })),
    readiness: { allowed: readiness.allowed, unmapped_plans: readiness.unmappedPlans },
    pricing_runs: await runCount(scope, practiceId),
  };
}

function figureOf(figure: SummaryFigure): MonthlySummaryRow['figures']['flagged'] {
  return { lines: figure.lines, billed_cents: figure.billedCents, variance_cents: figure.varianceCents };
}

function rowOf(row: SummaryRow): MonthlySummaryRow {
  return {
    payer_id: row.payerId,
    payer_name: row.payerName,
    figures: Object.fromEntries(Object.entries(row.figures).map(([bucket, figure]) => [bucket, figureOf(figure)])) as MonthlySummaryRow['figures'],
    written_off: figureOf(row.writtenOff),
  };
}

/** A month's summary as a document stores it (and as its CSV reads it). */
export function monthlyContent(summary: MonthlySummary, today: string): MonthlySummaryContent {
  return {
    format: MONTHLY_SUMMARY_FORMAT,
    generated_on: today,
    month: summary.month,
    total: rowOf(summary.total),
    by_payer: summary.byPayer.map(rowOf),
    approved_alone: summary.approvedAlone.map((item) => ({ packet_version_id: item.versionId, case_id: item.caseId, approved_on: item.approvedOn, hours_waited: item.hoursWaited })),
  };
}

export type GenerateRequest = { readonly kind: 'coverage' } | { readonly kind: 'monthly_summary'; readonly month: string };

/**
 * Generates a document in the person's name (the database checks they work the practice's cases) with
 * its figures read now, and queues its print in the same request: a failure to queue undoes the
 * document, so none waits on a print never sent. Returns its ID.
 */
export async function generateReportDocument(scope: Scope, services: Services, practiceId: string, request: GenerateRequest, requestId: string): Promise<string> {
  const today = services.now().toISOString().slice(0, 10);
  const id = randomUUID();
  const content = request.kind === 'coverage' ? await coverageContent(scope, practiceId, today, requestId) : monthlyContent(await monthlySummary(scope, practiceId, request.month), today);
  await scope.client.query('INSERT INTO report_document (id, practice_id, kind, period, pricing_run_id, requested_by, content) VALUES ($1, $2, $3, $4, $5, app_actor_id(), $6)', [
    id,
    practiceId,
    request.kind,
    request.kind === 'monthly_summary' ? request.month : null,
    content.format === COVERAGE_REPORT_FORMAT ? (content.run?.id ?? null) : null,
    JSON.stringify(content),
  ]);
  await services.queue.enqueue('report_document', { practice_id: practiceId, report_document_id: id });
  return id;
}

// ---------------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------------

export interface ReportDocumentSummary {
  readonly id: string;
  readonly kind: ReportDocumentKind;
  readonly period: string | null;
  readonly status: ReportDocumentStatus;
  readonly requestedBy: string | null;
  readonly generatedAt: string;
  readonly printedAt: string | null;
  readonly pdfSha256: string | null;
  readonly failureCode: string | null;
}

export interface ReportDocumentDetail extends ReportDocumentSummary {
  readonly content: ReportDocumentContent;
}

interface DocumentRow {
  readonly id: string;
  readonly practice_id: string;
  readonly kind: ReportDocumentKind;
  readonly period: string | null;
  readonly status: ReportDocumentStatus;
  readonly requested_by: string;
  readonly generated_at: Date;
  readonly printed_at: Date | null;
  readonly pdf_sha256: string | null;
  readonly failure_code: string | null;
  readonly content?: unknown;
}

const COLUMNS = 'd.id, d.practice_id, d.kind, d.period, d.status, d.requested_by, d.generated_at, d.printed_at, d.pdf_sha256, d.failure_code';

function summaryOf(row: DocumentRow, emails: ReadonlyMap<string, string>): ReportDocumentSummary {
  return {
    id: row.id,
    kind: row.kind,
    period: row.period,
    status: row.status,
    requestedBy: emails.get(row.requested_by) ?? null,
    generatedAt: row.generated_at.toISOString(),
    printedAt: row.printed_at?.toISOString() ?? null,
    pdfSha256: row.pdf_sha256,
    failureCode: row.failure_code,
  };
}

export const DOCUMENTS_PER_PAGE = 20;

/** A page of the practice's report documents, newest first. */
export async function listReportDocuments(scope: Scope, practiceId: string, requestedPage: number, requestId: string): Promise<ListPage<ReportDocumentSummary>> {
  const { rows: counted } = await scope.client.query<{ n: number }>('SELECT count(*)::int AS n FROM report_document WHERE practice_id = $1', [practiceId]);
  const total = counted[0]?.n ?? 0;
  const at = pageWindow(total, DOCUMENTS_PER_PAGE, requestedPage);
  const rows = await readWithAudit(
    scope,
    { objectType: 'report_document', purpose: 'report_review', requestId },
    async (client) =>
      (await client.query<DocumentRow>(`SELECT ${COLUMNS} FROM report_document d WHERE d.practice_id = $1 ORDER BY d.generated_at DESC, d.id LIMIT ${String(DOCUMENTS_PER_PAGE)} OFFSET ${String(at.offset)}`, [practiceId]))
        .rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  const emails = await peopleEmails(scope, practiceId, rows.map((row) => row.requested_by));
  return { items: rows.map((row) => summaryOf(row, emails)), page: at.page, pages: at.pages, total };
}

export async function reportDocumentOf(scope: Scope, practiceId: string, documentId: string, requestId: string): Promise<ReportDocumentDetail | undefined> {
  const [row] = await readWithAudit(
    scope,
    { objectType: 'report_document', purpose: 'report_review', requestId },
    async (client) => (await client.query<DocumentRow>(`SELECT ${COLUMNS}, d.content FROM report_document d WHERE d.id = $1 AND d.practice_id = $2`, [documentId, practiceId])).rows,
    (found) => ({ objectId: found.id, practiceId: found.practice_id }),
  );
  if (row === undefined) {
    return undefined;
  }
  return { ...summaryOf(row, await peopleEmails(scope, practiceId, [row.requested_by])), content: parseReportDocument(row.kind, row.content) };
}

/** A stored document PDF did not match the SHA-256 its document recorded: it is never sent. */
export class ReportDocumentIntegrityError extends Error {
  override readonly name = 'ReportDocumentIntegrityError';
}

async function collect(source: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of source) {
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts);
}

/** A printed document's PDF, checked against its SHA-256, the download audited; undefined when it is not the practice's or not printed. */
export async function reportDocumentPdf(scope: Scope, services: Services, practiceId: string, documentId: string, requestId: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const { rows } = await scope.client.query<{ pdf_key: string | null; pdf_sha256: string | null }>("SELECT pdf_key, pdf_sha256 FROM report_document WHERE id = $1 AND practice_id = $2 AND status = 'ready'", [
    documentId,
    practiceId,
  ]);
  const row = rows[0];
  if (row?.pdf_key === null || row?.pdf_key === undefined || row.pdf_sha256 === null) {
    return undefined;
  }
  const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
  const bytes = await collect(services.documents.read(cipher, row.pdf_key));
  if (createHash('sha256').update(bytes).digest('hex') !== row.pdf_sha256) {
    throw new ReportDocumentIntegrityError('the stored report document does not match the SHA-256 it recorded');
  }
  await recordAuditEvent(scope, { action: 'report_document_downloaded', objectType: 'report_document', objectId: documentId, practiceId, purpose: 'report_pdf', requestId });
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}

/** A document's CSV, computed from its stored figures, the download audited; undefined when it is not the practice's. */
export async function reportDocumentCsvFile(scope: Scope, practiceId: string, documentId: string, requestId: string): Promise<{ readonly kind: ReportDocumentKind; readonly body: string } | undefined> {
  const found = await reportDocumentOf(scope, practiceId, documentId, requestId);
  if (found === undefined) {
    return undefined;
  }
  await recordAuditEvent(scope, { action: 'report_document_downloaded', objectType: 'report_document', objectId: documentId, practiceId, purpose: 'report_csv', requestId });
  return { kind: found.kind, body: reportDocumentCsv(found.content) };
}

// ---------------------------------------------------------------------------------------------------
// The export history
// ---------------------------------------------------------------------------------------------------

export type ExportKind = 'audit_report' | 'roi_statement' | 'report_document' | 'monthly_summary' | 'packet_export';

export interface ExportRecord {
  readonly eventId: string;
  readonly kind: ExportKind;
  /** What was downloaded (its opaque ID); null for a monthly summary's CSV, which is of no stored record. */
  readonly objectId: string | null;
  /** A report's PDF or CSV, an audit report's line CSV, or a packet's export (its PDF or CSV schedule, identifiers inserted). */
  readonly file: 'pdf' | 'csv' | 'line_csv' | 'packet';
  /** Line-level PHI: an audit report's line CSV, a packet's export. */
  readonly lineLevel: boolean;
  readonly downloadedBy: string | null;
  readonly downloadedAt: string;
  /** The case a packet export belongs to (for its link). */
  readonly caseId: string | null;
}

const KINDS: Readonly<Record<string, ExportKind>> = {
  audit_report_downloaded: 'audit_report',
  roi_statement_downloaded: 'roi_statement',
  report_document_downloaded: 'report_document',
  monthly_summary_downloaded: 'monthly_summary',
  packet_export_downloaded: 'packet_export',
};

export const EXPORTS_PER_PAGE = 50;

/**
 * A page of the export history: every download of a report's file and every line-level export, newest
 * first, from the audit log (practice_export_history: the download events alone, for a reader of the
 * practice's reports). A line-level export says so.
 */
export async function exportHistory(scope: Scope, practiceId: string, requestedPage: number, requestId: string): Promise<ListPage<ExportRecord>> {
  const { rows: counted } = await scope.client.query<{ n: number }>('SELECT practice_export_count($1) AS n', [practiceId]);
  const total = counted[0]?.n ?? 0;
  const at = pageWindow(total, EXPORTS_PER_PAGE, requestedPage);
  const { rows } = await scope.client.query<{ event_id: string; action: string; object_id: string | null; purpose: string | null; actor_id: string | null; at: Date }>(
    'SELECT event_id, action, object_id, purpose, actor_id, at FROM practice_export_history($1, $2, $3)',
    [practiceId, EXPORTS_PER_PAGE, at.offset],
  );
  const packetVersions = rows.filter((row) => row.action === 'packet_export_downloaded' && row.object_id !== null).map((row) => row.object_id as string);
  const cases =
    packetVersions.length === 0
      ? []
      : await readWithAudit(
          scope,
          { objectType: 'packet_version', purpose: 'export_history', requestId },
          async (client) =>
            (
              await client.query<{ id: string; practice_id: string; case_id: string }>(
                'SELECT v.id, v.practice_id, p.case_id FROM packet_version v JOIN packet p ON p.id = v.packet_id WHERE v.practice_id = $1 AND v.id = ANY ($2::uuid[])',
                [practiceId, packetVersions],
              )
            ).rows,
          (row) => ({ objectId: row.id, practiceId: row.practice_id }),
        );
  const caseOf = new Map(cases.map((row) => [row.id, row.case_id]));
  const emails = await peopleEmails(scope, practiceId, rows.map((row) => row.actor_id));
  return {
    items: rows.map((row) => ({
      eventId: row.event_id,
      kind: KINDS[row.action] ?? 'report_document',
      objectId: row.object_id,
      file: row.action === 'packet_export_downloaded' ? 'packet' : row.purpose === 'line_export' ? 'line_csv' : row.purpose === 'report_pdf' ? 'pdf' : 'csv',
      lineLevel: row.purpose === 'line_export',
      downloadedBy: row.actor_id === null ? null : (emails.get(row.actor_id) ?? null),
      downloadedAt: row.at.toISOString(),
      caseId: row.object_id === null ? null : (caseOf.get(row.object_id) ?? null),
    })),
    page: at.page,
    pages: at.pages,
    total,
  };
}
