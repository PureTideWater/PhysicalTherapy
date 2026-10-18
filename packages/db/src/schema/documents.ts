import { type SQL, sql } from 'drizzle-orm';
import { type AnyPgColumn, bigint, boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { practice, user } from './tenancy';

/**
 * Documents, payers and plans (Data dictionary, Documents and remittances; Payers, contracts and
 * rates), mirroring migrations/20261016090000_documents_payers_plans.sql for typed queries. The SQL
 * is the source of truth for constraints, triggers, row-level security and grants; a database test
 * checks that these columns match it. All three are PHI tables: every query runs inside a scope from
 * src/authz.
 */

/**
 * What a document is declared to be: the data dictionary's kinds and era_export, a practice-management
 * system's ERA export (migration 20261102090000; docs/adr/0060), in the order of the kind CHECK (x12_835 first).
 */
export const DOCUMENT_KINDS = ['x12_835', 'era_export', 'contract', 'exhibit', 'posting_export', 'eft_export', 'payer_letter', 'other'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/**
 * The vendor ERA export formats a document of kind era_export may be (source_document.format_id): the ERA
 * entries of the format registry (packages/synth/src/formats/vendors/registry.ts and the worker's runtime
 * registry), in the order of the format_id CHECK. A new format version (a `_v1`) needs a migration; confirming
 * a format is a change to registry data only. A test holds the CHECK, this list and the registries equal.
 */
export const ERA_FORMAT_IDS = ['webpt_billing_era_v0', 'prompt_era_v0', 'spry_era_v0', 'raintree_era_v0'] as const;
export type EraFormatId = (typeof ERA_FORMAT_IDS)[number];

/**
 * A document's receipt state. The intake pipeline moves a document from awaiting_upload to received,
 * then to scanned (a clean 835, queued for parse), stored (a clean document of another kind),
 * expanded (a zip whose entries are their own documents) or one of the held states, which name their
 * reason. parse_queued, parsed, balanced, loaded and held belong to the parse job and the loader.
 */
export const DOCUMENT_STATUSES = [
  'awaiting_upload',
  'received',
  'scanned',
  'stored',
  'expanded',
  'parse_queued',
  'parsed',
  'balanced',
  'loaded',
  'held',
  'duplicate',
  'quarantined',
  'not_835',
  'wrong_type',
  'unreadable',
  'too_large',
  'too_compressed',
  'nested_zip',
  'unsafe_entry',
  'encrypted',
  'too_many_entries',
  'failed',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** The intake states that hold a document with a reason; nothing parses it. */
export const HELD_AT_INTAKE: readonly DocumentStatus[] = [
  'duplicate',
  'quarantined',
  'not_835',
  'wrong_type',
  'unreadable',
  'too_large',
  'too_compressed',
  'nested_zip',
  'unsafe_entry',
  'encrypted',
  'too_many_entries',
];

/**
 * The malware scan's verdict: pending until known; clean; flagged (malware, an executable or a
 * script); unscannable (the scanner could not look inside, which is treated as flagged); failed.
 */
export const SCAN_STATUSES = ['pending', 'clean', 'flagged', 'unscannable', 'failed'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const NETWORK_STATUSES = ['in_network', 'out_of_network', 'unknown'] as const;
export type NetworkStatus = (typeof NETWORK_STATUSES)[number];

/**
 * A document's object key, as the database generates it: the practice's prefix and the document's
 * own ID, opaque by construction (SEC-08).
 */
export function documentObjectKey(practiceId: string, documentId: string): string {
  return `practices/${practiceId}/documents/${documentId}`;
}

/** The page texts intake read from a contract document: beside its original, sealed the same way (docs/adr/0033). */
export function documentPagesKey(practiceId: string, documentId: string): string {
  return `${documentObjectKey(practiceId, documentId)}.pages`;
}

/**
 * How intake's reading of a contract, exhibit or payer letter went: ready (its page text is stored),
 * unsupported_document (no supported kind, or past a limit) or document_unreadable. Null until read.
 */
export const PAGE_TEXT_STATUSES = ['ready', 'unsupported_document', 'document_unreadable'] as const;
export type PageTextStatus = (typeof PAGE_TEXT_STATUSES)[number];

/**
 * Where a browser uploads a document in S3 before its malware scan: the documents bucket's intake
 * prefix, where GuardDuty scans it, until the worker seals it under documentObjectKey (docs/adr/0018).
 */
export function documentIntakeKey(practiceId: string, documentId: string): string {
  return `intake/${practiceId}/${documentId}`;
}

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const sourceDocument = pgTable(
  'source_document',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    kind: text('kind', { enum: DOCUMENT_KINDS }).notNull(),
    s3Key: text('s3_key')
      .notNull()
      .generatedAlwaysAs((): SQL => sql`'practices/' || practice_id::text || '/documents/' || id::text`),
    sha256: text('sha256'),
    sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
    contentType: text('content_type').notNull(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => user.id),
    scanStatus: text('scan_status', { enum: SCAN_STATUSES }).notNull().default('pending'),
    scanAt: timestamp('scan_at', { withTimezone: true }),
    retentionClass: text('retention_class', { enum: ['records'] }).notNull().default('records'),
    parentDocumentId: uuid('parent_document_id').references((): AnyPgColumn => sourceDocument.id),
    status: text('status', { enum: DOCUMENT_STATUSES }).notNull().default('awaiting_upload'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Set by intake for contracts, exhibits and payer letters (migration 20261017120000; docs/adr/0033). */
    pageTextStatus: text('page_text_status', { enum: PAGE_TEXT_STATUSES }),
    pageCount: integer('page_count'),
    /** An ERA export's vendor format, set exactly for kind era_export and never changed (migration 20261102090000). */
    formatId: text('format_id', { enum: ERA_FORMAT_IDS }),
  },
  (table) => [
    index('source_document_by_practice').on(table.practiceId, table.createdAt.desc(), table.id),
    index('source_document_by_parent')
      .on(table.parentDocumentId, table.status)
      .where(sql`parent_document_id IS NOT NULL`),
    // One document per bytes and format (migration 20261102090000): an ERA export of another format is read.
    uniqueIndex('source_document_first_of_its_bytes')
      .on(table.practiceId, table.sha256, sql`coalesce(${table.formatId}, '')`)
      .where(sql`sha256 IS NOT NULL AND status <> 'duplicate'`),
  ],
);

export const payer = pgTable(
  'payer',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    payerIdRaw: text('payer_id_raw').notNull(),
    nameRaw: text('name_raw').notNull(),
    canonicalPayerId: uuid('canonical_payer_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('payer_by_raw_id').on(table.practiceId, table.payerIdRaw)],
);

export const plan = pgTable(
  'plan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    payerId: uuid('payer_id')
      .notNull()
      .references(() => payer.id),
    planKey: text('plan_key').notNull(),
    name: text('name'),
    networkStatus: text('network_status', { enum: NETWORK_STATUSES }).notNull().default('unknown'),
    isMedicareAdvantage: boolean('is_medicare_advantage').notNull().default(false),
    maContracted: boolean('ma_contracted').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('plan_by_key').on(table.practiceId, table.payerId, table.planKey), index('plan_by_payer').on(table.payerId)],
);

export type SourceDocumentRow = typeof sourceDocument.$inferSelect;
export type PayerRow = typeof payer.$inferSelect;
export type PlanRow = typeof plan.$inferSelect;
