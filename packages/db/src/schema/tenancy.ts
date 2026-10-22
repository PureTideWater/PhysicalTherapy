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
    /** The user's own settings: notification preferences (migration 20261020090000). */
    settings: jsonb('settings').$type<UserSettings>().notNull().default({}),
  },
  (table) => [uniqueIndex('user_email_unique').on(sql`lower(${table.email})`)],
);

/**
 * A user's settings (jsonb; Data dictionary: notification preferences live in the user's settings). The
 * database admits {} or {"notifications": {"digest_email"?: boolean, "in_app"?: boolean}}, each on
 * unless turned off.
 */
export interface UserSettings {
  readonly notifications?: { readonly digest_email?: boolean; readonly in_app?: boolean };
}

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
    /**
     * Deprecated by practice_site (migrations/20261105090000; ADR 0064): never read or written, and the application
     * role may not insert or update it. Kept with its backfilled value until the multi-site pull request drops it.
     */
    zip: text('zip'),
    settings: jsonb('settings').$type<PracticeSettings>().notNull().default({}),
    dataKeyRef: text('data_key_ref'),
    status: text('status', { enum: PRACTICE_STATUSES }).notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** When it was deleted, stamped by the database (migrations/20261101090000_billing_review.sql). */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('practice_by_organization').on(table.organizationId)],
);

/**
 * The practice's pricing location (migrations/20261105090000_pricing_location_and_zip_plus_four.sql; audit #16's
 * minimal record and #33; ADR 0064): its billing ZIP and, where Medicare's locality list needs it, the ZIP+4. One per
 * practice, undated (the founder's answer to PR 6b's Q2 (a)); a practice is created with it in the same transaction
 * (the deferred check practice_has_site), and it is never deleted. Registered and forced like every table with a NOT
 * NULL practice_id, though it holds no PHI. The application role reads it in a practice's scope and writes it only
 * through practice_set_location() and the console's console_set_practice_location().
 */
export const practiceSite = pgTable(
  'practice_site',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    /** Five digits. */
    zip: text('zip').notNull(),
    /** Four digits, for a ZIP whose locality_map record needs them; null otherwise. */
    zipPlusFour: text('zip_plus_four'),
    /** The person who last set it; null when backfilled from practice.zip. */
    updatedBy: uuid('updated_by').references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('practice_site_one_per_practice').on(table.practiceId)],
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
export type PracticeSiteRow = typeof practiceSite.$inferSelect;
export type MembershipRow = typeof membership.$inferSelect;
export type AgreementRow = typeof agreement.$inferSelect;
export type GrantRow = typeof grant.$inferSelect;
export type SupportGrantRow = typeof supportGrant.$inferSelect;
export type PhiTableRegistryRow = typeof phiTableRegistry.$inferSelect;
