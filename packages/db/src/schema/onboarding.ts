import { bigint, date, index, integer, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { agreement, membership, organization, user } from './tenancy';

/**
 * Customer sign-in and production readiness (milestone 11; docs/adr/0053), mirroring
 * migrations/20261030090000_customer_sign_in_and_readiness.sql for typed queries. None holds PHI. The SQL is the
 * source of truth for who reads and writes each (row-level security, grants, the functions that are the only
 * writers of several of them); a database test checks that these columns match it.
 *
 * - prospect_request: the public audit request (PRD 5, J1), written only by submit_prospect_request().
 * - invitation: one per membership of an invited user, with its seven-day expiry (J2).
 * - terms_version, terms_acceptance: the terms of use by version and each customer's acceptance.
 * - agreement_event: each e-signature webhook event, once.
 * - support_ticket: a ticket from any screen (PRD 19, Support), or from mail to the support address.
 * - support_mail_receipt: each message the support_mail job read, once (migrations/20261101120000_support_mail.sql).
 * - rate_limit_counter: fixed-window counters shared by every web task, touched only by rate_limit_take().
 * - status_component, status_incident, status_incident_update: the public status page.
 * - compliance_record: evidence a person records for the SOC 2 Type I checklist.
 */

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const PROSPECT_BILLING_ARRANGEMENTS = ['in_house', 'billing_firm', 'mixed', 'other'] as const;
export type ProspectBillingArrangement = (typeof PROSPECT_BILLING_ARRANGEMENTS)[number];
export const PROSPECT_STATUSES = ['new', 'contacted', 'converted', 'declined'] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const prospectRequest = pgTable(
  'prospect_request',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactName: text('contact_name').notNull(),
    contactEmail: text('contact_email').notNull(),
    organizationName: text('organization_name').notNull(),
    locations: integer('locations').notNull(),
    payers: text('payers').array().notNull(),
    billingArrangement: text('billing_arrangement', { enum: PROSPECT_BILLING_ARRANGEMENTS }).notNull(),
    status: text('status', { enum: PROSPECT_STATUSES }).notNull().default('new'),
    organizationId: uuid('organization_id').references(() => organization.id),
    reviewedBy: uuid('reviewed_by').references(() => user.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('prospect_request_by_status').on(table.status, table.createdAt.desc())],
);

/** How long an invitation (and Cognito's temporary password) lasts. */
export const INVITATION_DAYS = 7;

export const invitation = pgTable(
  'invitation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id),
    membershipId: uuid('membership_id')
      .notNull()
      .unique()
      .references(() => membership.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => user.id),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    sends: integer('sends').notNull().default(1),
    lastSentBy: uuid('last_sent_by')
      .notNull()
      .references(() => user.id),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('invitation_by_organization').on(table.organizationId, table.createdAt.desc()), index('invitation_by_user').on(table.userId)],
);

export const termsVersion = pgTable(
  'terms_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    version: text('version').notNull().unique(),
    documentRef: text('document_ref').notNull(),
    sha256: text('sha256').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    publishedBy: uuid('published_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (table) => [index('terms_version_by_published').on(table.publishedAt.desc())],
);

export const termsAcceptance = pgTable(
  'terms_acceptance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    termsVersionId: uuid('terms_version_id')
      .notNull()
      .references(() => termsVersion.id),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
    requestId: text('request_id'),
    createdAt: createdAt(),
  },
  (table) => [unique('terms_acceptance_once').on(table.userId, table.termsVersionId)],
);

export const agreementEvent = pgTable('agreement_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerEventId: text('provider_event_id').notNull().unique(),
  envelopeRef: text('envelope_ref').notNull(),
  agreementId: uuid('agreement_id')
    .notNull()
    .references(() => agreement.id),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

export const SUPPORT_TICKET_CATEGORIES = ['question', 'problem', 'access', 'billing', 'data', 'other'] as const;
export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];
export const SUPPORT_TICKET_STATUSES = ['open', 'answered', 'closed'] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];
/** Where a ticket came from: the in-app form, or mail to the support address (migrations/20261101120000_support_mail.sql). */
export const SUPPORT_TICKET_SOURCES = ['form', 'mail'] as const;
export type SupportTicketSource = (typeof SUPPORT_TICKET_SOURCES)[number];
/** What came of a message the support_mail job read. */
export const SUPPORT_MAIL_OUTCOMES = ['opened', 'withheld', 'unknown_sender', 'unverified_sender', 'unreadable'] as const;
export type SupportMailOutcome = (typeof SUPPORT_MAIL_OUTCOMES)[number];

export const supportTicket = pgTable(
  'support_ticket',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: bigint('number', { mode: 'bigint' }).generatedAlwaysAsIdentity().unique(),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => user.id),
    /** The screen it was written from (its route's ID, as a code). */
    screen: text('screen').notNull(),
    category: text('category', { enum: SUPPORT_TICKET_CATEGORIES }).notNull(),
    subject: text('subject').notNull(),
    message: text('message').notNull(),
    status: text('status', { enum: SUPPORT_TICKET_STATUSES }).notNull().default('open'),
    statusChangedBy: uuid('status_changed_by').references(() => user.id),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    source: text('source', { enum: SUPPORT_TICKET_SOURCES }).notNull().default('form'),
    /** A mailed ticket's message: the SHA-256 of where the inbox holds it. */
    mailRef: text('mail_ref').unique(),
  },
  (table) => [
    index('support_ticket_by_requester').on(table.requesterId, table.createdAt.desc()),
    index('support_ticket_by_status').on(table.status, table.createdAt.desc()),
  ],
);

/** Every message the support_mail job read, once, with what came of it: no address, subject or text. */
export const supportMailReceipt = pgTable(
  'support_mail_receipt',
  {
    mailRef: text('mail_ref').primaryKey(),
    outcome: text('outcome', { enum: SUPPORT_MAIL_OUTCOMES }).notNull(),
    ticketId: uuid('ticket_id').references(() => supportTicket.id),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('support_mail_receipt_by_read_at').on(table.readAt)],
);

export const rateLimitCounter = pgTable(
  'rate_limit_counter',
  {
    bucket: text('bucket').notNull(),
    /** A SHA-256 the application computed of the user, the address or the account. */
    subject: text('subject').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    hits: integer('hits').notNull(),
  },
  (table) => [primaryKey({ columns: [table.bucket, table.subject, table.windowStart] }), index('rate_limit_counter_by_window').on(table.windowStart)],
);

export const STATUS_COMPONENT_KEYS = ['web', 'sign_in', 'uploads', 'jobs', 'exports', 'billing', 'email'] as const;
export type StatusComponentKey = (typeof STATUS_COMPONENT_KEYS)[number];
export const STATUS_COMPONENT_STATUSES = ['operational', 'degraded', 'partial_outage', 'major_outage', 'maintenance'] as const;
export type StatusComponentStatus = (typeof STATUS_COMPONENT_STATUSES)[number];
export const STATUS_INCIDENT_IMPACTS = ['minor', 'major', 'critical'] as const;
export type StatusIncidentImpact = (typeof STATUS_INCIDENT_IMPACTS)[number];
export const STATUS_INCIDENT_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'] as const;
export type StatusIncidentStatus = (typeof STATUS_INCIDENT_STATUSES)[number];

export const statusComponent = pgTable('status_component', {
  key: text('key', { enum: STATUS_COMPONENT_KEYS }).primaryKey(),
  name: text('name').notNull(),
  position: integer('position').notNull().unique(),
  status: text('status', { enum: STATUS_COMPONENT_STATUSES }).notNull().default('operational'),
  changedBy: uuid('changed_by').references(() => user.id),
  changedAt: timestamp('changed_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const statusIncident = pgTable(
  'status_incident',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    impact: text('impact', { enum: STATUS_INCIDENT_IMPACTS }).notNull(),
    components: text('components').array().notNull(),
    status: text('status', { enum: STATUS_INCIDENT_STATUSES }).notNull().default('investigating'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('status_incident_by_started').on(table.startedAt.desc())],
);

export const statusIncidentUpdate = pgTable(
  'status_incident_update',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => statusIncident.id),
    status: text('status', { enum: STATUS_INCIDENT_STATUSES }).notNull(),
    message: text('message').notNull(),
    postedBy: uuid('posted_by')
      .notNull()
      .references(() => user.id),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [index('status_incident_update_by_incident').on(table.incidentId, table.postedAt)],
);

export const COMPLIANCE_RECORD_KINDS = ['policy_approval', 'access_review', 'tabletop_exercise', 'training_attestation', 'vendor_review', 'risk_analysis', 'security_official'] as const;
export type ComplianceRecordKind = (typeof COMPLIANCE_RECORD_KINDS)[number];

export const complianceRecord = pgTable(
  'compliance_record',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind', { enum: COMPLIANCE_RECORD_KINDS }).notNull(),
    /** What it is evidence for, as a code: a policy and version, a quarter, a person's opaque ID. */
    subject: text('subject').notNull(),
    occurredOn: date('occurred_on').notNull(),
    documentRef: text('document_ref').notNull(),
    sha256: text('sha256').notNull(),
    recordedBy: uuid('recorded_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (table) => [index('compliance_record_by_kind').on(table.kind, table.subject, table.occurredOn.desc())],
);

export type ProspectRequestRow = typeof prospectRequest.$inferSelect;
export type InvitationRow = typeof invitation.$inferSelect;
export type TermsVersionRow = typeof termsVersion.$inferSelect;
export type TermsAcceptanceRow = typeof termsAcceptance.$inferSelect;
export type AgreementEventRow = typeof agreementEvent.$inferSelect;
export type SupportTicketRow = typeof supportTicket.$inferSelect;
export type SupportMailReceiptRow = typeof supportMailReceipt.$inferSelect;
export type StatusComponentRow = typeof statusComponent.$inferSelect;
export type StatusIncidentRow = typeof statusIncident.$inferSelect;
export type StatusIncidentUpdateRow = typeof statusIncidentUpdate.$inferSelect;
export type ComplianceRecordRow = typeof complianceRecord.$inferSelect;
