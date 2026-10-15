import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Tenancy and access tables (Data dictionary, Tenancy and access), mirroring
 * migrations/20261015140000_tenancy.sql for typed queries. The SQL migration is the source of truth
 * for constraints, triggers, row-level security and grants; a database test checks that these
 * columns match it. Every query runs inside a scope from src/authz (SET LOCAL app.practice_ids and
 * app.actor_id), so these tables are read and written under their policies.
 */

export const ORGANIZATION_KINDS = ['group', 'firm', 'internal'] as const;
export const ORGANIZATION_STATUSES = ['active', 'suspended', 'closed'] as const;
export const USER_STATUSES = ['invited', 'active', 'disabled'] as const;
export const PRACTICE_STATUSES = ['active', 'deleted'] as const;
export const MEMBERSHIP_ROLES = [
  'practice_admin',
  'billing_manager',
  'analyst',
  'viewer',
  'firm_principal',
  'firm_analyst',
  'platform_admin',
  'contract_specialist',
  'reviewer',
  'support',
] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
/** The roles a grant's scope may admit: the grantee's customer and firm roles (never internal ones). */
export const GRANT_SCOPE_ROLES = ['firm_principal', 'firm_analyst', 'billing_manager', 'analyst', 'viewer'] as const;
export const AGREEMENT_KINDS = ['baa', 'engagement', 'terms', 'data_rights', 'dpa'] as const;

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const organization = pgTable('organization', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind', { enum: ORGANIZATION_KINDS }).notNull(),
  name: text('name').notNull(),
  billingCustomerRef: text('billing_customer_ref'),
  status: text('status', { enum: ORGANIZATION_STATUSES }).notNull().default('active'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const user = pgTable(
  'user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cognitoSub: text('cognito_sub').notNull().unique(),
    email: text('email').notNull(),
    mfaEnrolled: boolean('mfa_enrolled').notNull().default(false),
    hardwareKeyRequired: boolean('hardware_key_required').notNull().default(false),
    status: text('status', { enum: USER_STATUSES }).notNull().default('invited'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Consecutive failed sign-in attempts; ten lock the account (migration 20261015170000). */
    failedSignIns: integer('failed_sign_ins').notNull().default(0),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('user_email_unique').on(sql`lower(${table.email})`)],
);

/** Practice settings (jsonb): materiality, anomaly threshold, proof level, staff rate. */
export type PracticeSettings = Readonly<Record<string, unknown>>;

export const practice = pgTable(
  'practice',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organization.id),
    name: text('name').notNull(),
    taxIdLast4: text('tax_id_last4'),
    npi: text('npi'),
    localityCode: text('locality_code'),
    zip: text('zip'),
    settings: jsonb('settings').$type<PracticeSettings>().notNull().default({}),
    dataKeyRef: text('data_key_ref'),
    status: text('status', { enum: PRACTICE_STATUSES }).notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('practice_by_organization').on(table.organizationId)],
);

export const membership = pgTable(
  'membership',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    role: text('role', { enum: MEMBERSHIP_ROLES }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('membership_open')
      .on(table.organizationId, table.userId)
      .where(sql`ends_at IS NULL`),
    index('membership_by_user').on(table.userId),
  ],
);

export const agreement = pgTable(
  'agreement',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id),
    practiceId: uuid('practice_id').references(() => practice.id),
    kind: text('kind', { enum: AGREEMENT_KINDS }).notNull(),
    version: text('version').notNull(),
    signedAt: timestamp('signed_at', { withTimezone: true }).notNull(),
    signer: text('signer').notNull(),
    documentRef: text('document_ref').notNull(),
    sha256: text('sha256').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('agreement_by_practice').on(table.practiceId), index('agreement_by_organization').on(table.organizationId)],
);

/** A grant's scope: the grantee's membership roles it admits. */
export interface GrantScope {
  readonly roles?: readonly (typeof GRANT_SCOPE_ROLES)[number][];
}

export const grant = pgTable(
  'grant',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    scope: jsonb('scope').$type<GrantScope>().notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    approvedByUserId: uuid('approved_by_user_id')
      .notNull()
      .references(() => user.id),
    agreementId: uuid('agreement_id')
      .notNull()
      .references(() => agreement.id),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => user.id),
    reason: text('reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('grant_by_practice').on(table.practiceId), index('grant_by_organization').on(table.organizationId)],
);

export const supportGrant = pgTable(
  'support_grant',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    ticket: text('ticket').notNull(),
    reason: text('reason').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('support_grant_by_practice').on(table.practiceId), index('support_grant_by_user').on(table.userId)],
);

export const phiTableRegistry = pgTable('phi_table_registry', {
  id: uuid('id').primaryKey().defaultRandom(),
  tableName: text('table_name').notNull().unique(),
  registeredBy: text('registered_by').notNull(),
  policyName: text('policy_name').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type OrganizationRow = typeof organization.$inferSelect;
export type UserRow = typeof user.$inferSelect;
export type PracticeRow = typeof practice.$inferSelect;
export type MembershipRow = typeof membership.$inferSelect;
export type AgreementRow = typeof agreement.$inferSelect;
export type GrantRow = typeof grant.$inferSelect;
export type SupportGrantRow = typeof supportGrant.$inferSelect;
export type PhiTableRegistryRow = typeof phiTableRegistry.$inferSelect;
