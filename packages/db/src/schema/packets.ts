import { type AnyPgColumn, bigint, boolean, date, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { sourceDocument } from './documents';
import { remittance } from './remittances';
import { practice, user } from './tenancy';
import { caseTable } from './triage';

/**
 * Packets, their versions, submissions and payer responses (Data dictionary, Pricing, triage and
 * cases: packet, packet_version, submission, payer_response; PRD 12), mirroring
 * migrations/20261023090000_packets_submissions_and_responses.sql for typed queries. The SQL is the
 * source of truth for the versions' immutability, approval (a passing verifier, the two-person rule,
 * the single-user delay and its flag), the export, the submission and response rules and the case
 * states they derive; a database test checks that these columns match it. Every table is a PHI table:
 * every query runs inside a scope from src/authz, and the columns marked (enc) hold `enc:v1:`
 * ciphertext under the practice's data key.
 */

export const SUBMISSION_CHANNEL_VALUES = ['payer_portal', 'fax', 'mail', 'provider_relations_email'] as const;
/** packet_version.deadline_verification_status (CO-12; migration 20261103090000), in the CHECK's order. */
export const DEADLINE_VERIFICATION_STATUS_VALUES = ['verified', 'unverified', 'not_applicable'] as const;
export const PAYER_RESPONSE_KIND_VALUES = ['accepted', 'partial', 'denied', 'info_requested', 'reprocessed_no_change'] as const;
export const DENIAL_CATEGORY_VALUES = ['authorization', 'visit_limit', 'modifier', 'medical_necessity', 'timely_filing', 'bundling', 'other'] as const;
export const PACKET_EXPORT_FILES = ['pdf', 'csv'] as const;
export type PacketExportFile = (typeof PACKET_EXPORT_FILES)[number];
/**
 * Whether a packet version's pricing is still current (audit item #4; migration 20261103090000's
 * packet_version_pricing_check() and submission.pricing_check), in the CHECK's order: 'current', then each
 * cause from the most severe. A stale line's pricing is no longer in effect (an accepted re-run, a later first
 * run), its rule release was withdrawn, the plan mapping it priced under is no longer the plan's mapping in force
 * on its service date (a correction since, MAP-03), or its contract version is no longer signed off or no longer
 * covers the service date.
 */
export const PRICING_CHECK_RESULTS = ['current', 'PRICING_NOT_IN_EFFECT', 'RELEASE_WITHDRAWN', 'MAPPING_NOT_IN_FORCE', 'CONTRACT_VERSION_NOT_SIGNED_OFF', 'CONTRACT_VERSION_NOT_IN_FORCE'] as const;
export type PricingCheckResult = (typeof PRICING_CHECK_RESULTS)[number];

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const practiceId = () =>
  uuid('practice_id')
    .notNull()
    .references(() => practice.id);

export const packet = pgTable(
  'packet',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => caseTable.id),
    /** The version written last (kept by the database). */
    currentVersionId: uuid('current_version_id').references((): AnyPgColumn => packetVersion.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('packet_once_per_case').on(table.caseId), index('packet_by_practice').on(table.practiceId, table.caseId)],
);

export const packetVersion = pgTable(
  'packet_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    packetId: uuid('packet_id')
      .notNull()
      .references(() => packet.id),
    versionNo: integer('version_no').notNull(),
    /** tp-packet/2, or tp-packet/1 written before 20261103090000 (@tp/packets PacketContent). */
    content: jsonb('content').$type<Readonly<Record<string, unknown>>>().notNull(),
    /** Generated from the content. */
    citation: jsonb('citation')
      .$type<Readonly<Record<string, unknown>>>()
      .generatedAlwaysAs(sql`content -> 'citation'`),
    /** Generated from the content: the schedule, identifiers as placeholders. */
    lineTable: jsonb('line_table')
      .$type<readonly unknown[]>()
      .generatedAlwaysAs(sql`content -> 'lines'`),
    /** Generated from the content. */
    evidence: jsonb('evidence')
      .$type<readonly unknown[]>()
      .generatedAlwaysAs(sql`content -> 'evidence'`),
    /** Generated from the content: the interest line's total, never inside expected allowed. */
    interestCents: bigint('interest_cents', { mode: 'bigint' }).generatedAlwaysAs(sql`(content -> 'interest' ->> 'total_cents')::bigint`),
    /** Generated from the content. */
    disputeLevel: integer('dispute_level').generatedAlwaysAs(sql`(content ->> 'dispute_level')::integer`),
    /** (enc) The person's words, identifiers as placeholders. */
    narrative: text('narrative').notNull(),
    contentSha256: text('content_sha256').notNull(),
    verifierPassed: boolean('verifier_passed').notNull(),
    /** tp-packet-verifier/2 (or /1, written before 20261027090000): codes and positions only. */
    verifierReport: jsonb('verifier_report').$type<Readonly<Record<string, unknown>>>().notNull(),
    draftedBy: uuid('drafted_by')
      .notNull()
      .references(() => user.id),
    regulationConfirmedBy: uuid('regulation_confirmed_by').references(() => user.id),
    regulationConfirmedAt: timestamp('regulation_confirmed_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => user.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedSha256: text('approved_sha256'),
    /** The audit flag: approved by its own writer in a single-user practice, after 24 hours. */
    approvedAlone: boolean('approved_alone').notNull().default(false),
    exportPdfKey: text('export_pdf_key'),
    exportCsvKey: text('export_csv_key'),
    exportSha256: text('export_sha256'),
    exportCsvSha256: text('export_csv_sha256'),
    exportedAt: timestamp('exported_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /**
     * Generated from the content (CO-12; migration 20261103090000): tp-packet/2's content.deadline.status, and
     * unverified for every tp-packet/1 version. What the version stated when written; the export derives it again.
     */
    deadlineVerificationStatus: text('deadline_verification_status', { enum: DEADLINE_VERIFICATION_STATUS_VALUES })
      .notNull()
      .generatedAlwaysAs(sql`CASE WHEN content ->> 'format' = 'tp-packet/2' THEN content -> 'deadline' ->> 'status' ELSE 'unverified' END`),
    /** The verifier's report over the narrative the export rendered (tp-packet-verifier/2), written with the export. */
    exportVerifierReport: jsonb('export_verifier_report').$type<Readonly<Record<string, unknown>>>(),
    /** The reimbursement reviewer's attestation over the export's two SHA-256 (D16): who, when and tp-attestation/1. */
    attestedBy: uuid('attested_by').references(() => user.id),
    attestedAt: timestamp('attested_at', { withTimezone: true }),
    attestation: jsonb('attestation').$type<Readonly<Record<string, unknown>>>(),
  },
  (table) => [unique('packet_version_numbered').on(table.packetId, table.versionNo), index('packet_version_by_packet').on(table.practiceId, table.packetId, table.versionNo.desc())],
);

export const submission = pgTable(
  'submission',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => caseTable.id),
    packetVersionId: uuid('packet_version_id')
      .notNull()
      .references(() => packetVersion.id),
    submittedOn: date('submitted_on').notNull(),
    channel: text('channel', { enum: SUBMISSION_CHANNEL_VALUES }).notNull(),
    /** (enc) The payer's reference. */
    reference: text('reference'),
    submittedBy: uuid('submitted_by')
      .notNull()
      .references(() => user.id),
    followUpOn: date('follow_up_on').notNull(),
    exportSha256: text('export_sha256').notNull(),
    exportCsvSha256: text('export_csv_sha256').notNull(),
    /** Set by the database. */
    disputeLevel: integer('dispute_level').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /**
     * Whether the version sent was still priced current when the submission was logged (migration
     * 20261103090000): set by the database from packet_version_pricing_check(), never refused for it, and
     * never written by the application. Null only on a row logged before that migration.
     */
    pricingCheck: text('pricing_check', { enum: PRICING_CHECK_RESULTS }),
  },
  (table) => [index('submission_by_case').on(table.practiceId, table.caseId, table.submittedOn.desc()), index('submission_by_follow_up').on(table.practiceId, table.followUpOn)],
);

export const payerResponse = pgTable(
  'payer_response',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submission.id),
    kind: text('kind', { enum: PAYER_RESPONSE_KIND_VALUES }).notNull(),
    amountCents: bigint('amount_cents', { mode: 'bigint' }),
    documentId: uuid('document_id').references(() => sourceDocument.id),
    remittanceId: uuid('remittance_id').references(() => remittance.id),
    receivedOn: date('received_on').notNull(),
    denialCategory: text('denial_category', { enum: DENIAL_CATEGORY_VALUES }),
    /** (enc) */
    notes: text('notes'),
    reopensCase: boolean('reopens_case').notNull().default(false),
    /** Set by the database when a denial reopens the case. */
    nextWindowEndsOn: date('next_window_ends_on'),
    /** Null when the recovery ledger's matching recorded it. */
    recordedBy: uuid('recorded_by').references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('payer_response_by_submission').on(table.practiceId, table.submissionId, table.receivedOn.desc())],
);

/**
 * An exported packet's stored file: an opaque key under the practice and the packet, never a name, a
 * claim number or a date. Each export attempt writes new objects (stored objects are written once).
 */
export function packetExportKey(practiceId: string, packetId: string, objectId: string, file: PacketExportFile): string {
  return `practices/${practiceId}/packets/${packetId}/${objectId}.${file}`;
}

export type PacketRow = typeof packet.$inferSelect;
export type PacketVersionRow = typeof packetVersion.$inferSelect;
export type SubmissionRow = typeof submission.$inferSelect;
export type PayerResponseRow = typeof payerResponse.$inferSelect;
