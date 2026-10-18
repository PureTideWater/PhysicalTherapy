import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { pricingRun } from './pricing';
import { practice, user } from './tenancy';

/**
 * The v1 reports' printed documents (PRD 6, Reports and exports; PRD 7, Reports; docs/adr/0045),
 * mirroring migrations/20261025090000_report_documents_and_export_history.sql for typed queries: a
 * coverage report or a month's variance summary, its figures fixed when a person generated it and its
 * PDF recorded once by the print job. The SQL is the source of truth for who generates one, the
 * single update the job makes, row-level security and grants; a database test checks that these
 * columns match it. A PHI table: every query runs inside a scope from src/authz. Its content holds
 * counts, integer cents as text, codes and payer and plan names, never a patient, claim or line
 * identifier.
 */

export const REPORT_DOCUMENT_KINDS = ['coverage', 'monthly_summary'] as const;
export type ReportDocumentKind = (typeof REPORT_DOCUMENT_KINDS)[number];
export const REPORT_DOCUMENT_STATUSES = ['queued', 'ready', 'failed'] as const;
export type ReportDocumentStatus = (typeof REPORT_DOCUMENT_STATUSES)[number];

export const reportDocument = pgTable(
  'report_document',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    kind: text('kind', { enum: REPORT_DOCUMENT_KINDS }).notNull(),
    /** A monthly summary's month (YYYY-MM); null for a coverage report. */
    period: text('period'),
    /** The run in effect a coverage report read; null before any. */
    pricingRunId: uuid('pricing_run_id').references(() => pricingRun.id),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => user.id),
    /** tp-coverage-report/1 or tp-monthly-summary/1. */
    content: jsonb('content').$type<Readonly<Record<string, unknown>>>().notNull(),
    status: text('status', { enum: REPORT_DOCUMENT_STATUSES }).notNull().default('queued'),
    pdfKey: text('pdf_key'),
    pdfSha256: text('pdf_sha256'),
    failureCode: text('failure_code'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    printedAt: timestamp('printed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('report_document_by_practice').on(table.practiceId, table.generatedAt.desc(), table.id)],
);

/** The object key of a report document's PDF: the practice, the document and the object, opaque IDs only. */
export function reportDocumentKey(practiceId: string, reportDocumentId: string, objectId: string): string {
  return `practices/${practiceId}/reports/${reportDocumentId}/${objectId}.pdf`;
}

export type ReportDocumentRow = typeof reportDocument.$inferSelect;
