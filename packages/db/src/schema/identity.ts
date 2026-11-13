import { sql } from 'drizzle-orm';
import { type AnyPgColumn, customType, index, integer, pgTable, smallint, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { MEMBERSHIP_ROLES, user } from './tenancy';

/**
 * Identity and authorization tables (migrations/20261015170000_identity_and_permissions.sql;
 * docs/adr/0016 and 0017): the persona permission matrix, the devices and sessions sign-in creates,
 * and the request keys every mutation records. None holds PHI; the last three force row-level
 * security with self policies.
 */

export const PERMISSION_EFFECTS = ['allow', 'deny'] as const;

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const rolePermission = pgTable(
  'role_permission',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    role: text('role', { enum: MEMBERSHIP_ROLES }).notNull(),
    action: text('action').notNull(),
    effect: text('effect', { enum: PERMISSION_EFFECTS }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('role_permission_once').on(table.role, table.action)],
);

export const userDevice = pgTable(
  'user_device',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    tokenSha256: text('token_sha256').notNull(),
    label: text('label').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('user_device_once').on(table.userId, table.tokenSha256)],
);

export const MFA_METHODS = ['totp', 'webauthn'] as const;
export type MfaMethod = (typeof MFA_METHODS)[number];
export const SESSION_END_REASONS = ['signed_out', 'idle', 'expired', 'device_revoked', 'revoked', 'user_disabled'] as const;
export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

/** PostgreSQL bytea, as the driver gives it. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const userSession = pgTable(
  'user_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => userDevice.id),
    tokenSha256: text('token_sha256').notNull().unique(),
    mfaMethod: text('mfa_method', { enum: MFA_METHODS }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endReason: text('end_reason', { enum: SESSION_END_REASONS }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** When the sign-in attempt that opened the session began (sign_in_step_began(); docs/adr/0093). Absent on a session the release before opened. */
    signInBeganAt: timestamp('sign_in_began_at', { withTimezone: true }),
    /** The SHA-256 of the credential ID of the hardware key a key session was opened with (docs/adr/0095). Absent on a code session and on a key session the release before opened. */
    keyCredentialSha256: bytea('key_credential_sha256'),
  },
  (table) => [index('user_session_by_user').on(table.userId), index('user_session_by_device').on(table.deviceId)],
);

export const mutationRequest = pgTable(
  'mutation_request',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    requestKey: uuid('request_key').notNull(),
    routeId: text('route_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('mutation_request_once').on(table.userId, table.requestKey)],
);

export type RolePermissionRow = typeof rolePermission.$inferSelect;
export type UserDeviceRow = typeof userDevice.$inferSelect;
export type UserSessionRow = typeof userSession.$inferSelect;
export type MutationRequestRow = typeof mutationRequest.$inferSelect;

/**
 * The hardware-key registry, its two-person removal and the provider sign-out's outbox (docs/adr/0095; migration
 * 20261116090000). Platform tables: they describe an account, hold no PHI and no contact detail, and are closed to
 * both runtime roles (FORCE ROW LEVEL SECURITY, one policy for the owner, no privilege). Every read and write goes
 * through a definer function of the migration, so nothing queries these tables through Drizzle at runtime.
 */
export const HARDWARE_KEY_REMOVAL_STATES = ['requested', 'confirmed', 'cancelled', 'expired'] as const;
export type HardwareKeyRemovalState = (typeof HARDWARE_KEY_REMOVAL_STATES)[number];
export const HARDWARE_KEY_NOTICE_KINDS = ['removed', 'registration_opened', 'registered_after_removal'] as const;
export type HardwareKeyNoticeKind = (typeof HARDWARE_KEY_NOTICE_KINDS)[number];
export const HARDWARE_KEY_NOTICE_STATES = ['pending', 'sent', 'delivered', 'undelivered', 'failed'] as const;
export type HardwareKeyNoticeState = (typeof HARDWARE_KEY_NOTICE_STATES)[number];
export const PROVIDER_SIGN_OUT_REASONS = ['membership_ended', 'password_reset_completed', 'password_reset_outcome_unknown', 'hardware_keys_removed', 'password_reset_unrecorded'] as const;
export type ProviderSignOutReason = (typeof PROVIDER_SIGN_OUT_REASONS)[number];

/** A removal of every key of an account: requested by one platform administrator, confirmed by another inside 24 hours. */
export const hardwareKeyRemoval = pgTable(
  'hardware_key_removal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => user.id),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
    /** requested_at plus 24 hours. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    requestId: text('request_id'),
    /** SHA-256 of the removal's ID, a colon and the account's lower-cased address at the request: the notices go only to that address. */
    addressSha256: bytea('address_sha256').notNull(),
    state: text('state', { enum: HARDWARE_KEY_REMOVAL_STATES }).notNull().default('requested'),
    decidedBy: uuid('decided_by').references(() => user.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedRequestId: text('decided_request_id'),
    keysRemoved: integer('keys_removed'),
    sessionsEnded: integer('sessions_ended'),
    /** The opening of the account's next registration: null together until an administrator opens it, on a confirmed row only. */
    registrationOpenedBy: uuid('registration_opened_by').references(() => user.id),
    registrationOpenedAt: timestamp('registration_opened_at', { withTimezone: true }),
    registrationOpenUntil: timestamp('registration_open_until', { withTimezone: true }),
    /** The SHA-256 of the one-time code; the code itself is stored nowhere. */
    registrationCodeSha256: bytea('registration_code_sha256'),
    registrationCodeTries: smallint('registration_code_tries').notNull().default(0),
    registrationOpenedRequestId: text('registration_opened_request_id'),
  },
  (table) => [
    uniqueIndex('hardware_key_removal_open_once')
      .on(table.userId)
      .where(sql`state = 'requested'`),
    index('hardware_key_removal_by_user').on(table.userId, table.state),
    index('hardware_key_removal_open_by_expiry')
      .on(table.expiresAt)
      .where(sql`state = 'requested'`),
  ],
);

/** One row a registered hardware key: the digest of its credential ID and its public key. One live key an account. */
export const hardwareKey = pgTable(
  'hardware_key',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    credentialSha256: bytea('credential_sha256').notNull(),
    publicKey: bytea('public_key').notNull(),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull(),
    registeredRequestId: text('registered_request_id'),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removalId: uuid('removal_id').references((): AnyPgColumn => hardwareKeyRemoval.id),
  },
  (table) => [
    unique('hardware_key_credential_once').on(table.credentialSha256),
    uniqueIndex('hardware_key_one_live')
      .on(table.userId)
      .where(sql`removed_at IS NULL`),
    index('hardware_key_by_user').on(table.userId),
    index('hardware_key_by_removal')
      .on(table.removalId)
      .where(sql`removal_id IS NOT NULL`),
  ],
);

/** The member's email about a removal, an opening and the registration after a removal: the shape of password_notice. */
export const hardwareKeyNotice = pgTable(
  'hardware_key_notice',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    kind: text('kind', { enum: HARDWARE_KEY_NOTICE_KINDS }).notNull(),
    removalId: uuid('removal_id')
      .notNull()
      .references(() => hardwareKeyRemoval.id),
    /** When the thing the email reports happened. */
    eventAt: timestamp('event_at', { withTimezone: true }).notNull(),
    state: text('state', { enum: HARDWARE_KEY_NOTICE_STATES }).notNull().default('pending'),
    attempts: smallint('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    sesMessageId: text('ses_message_id').unique(),
    /** Set exactly when failed: an error's name, NoticeStale or AddressChanged. Never a message. */
    errorCode: text('error_code'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    undeliveredReportedAt: timestamp('undelivered_reported_at', { withTimezone: true }),
    /** event_at plus 90 days; operator_mail_expire() deletes it after, never while pending. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('hardware_key_notice_once').on(table.removalId, table.kind),
    index('hardware_key_notice_pending')
      .on(table.nextAttemptAt)
      .where(sql`state = 'pending'`),
    index('hardware_key_notice_by_expiry').on(table.expiresAt),
    index('hardware_key_notice_by_user').on(table.userId),
  ],
);

/** The outbox of sign-outs owed at the identity provider, one row for each cause's audit event. No subject is stored. */
export const providerSignOut = pgTable(
  'provider_sign_out',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    reason: text('reason', { enum: PROVIDER_SIGN_OUT_REASONS }).notNull(),
    /** The audit event that caused it: the idempotency key (provider_sign_out_once). */
    sourceEventId: uuid('source_event_id').notNull(),
    requestId: text('request_id'),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull(),
    /** Counted at the claim; never past 30. */
    attempts: smallint('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
    leasedUntil: timestamp('leased_until', { withTimezone: true }),
    doneAt: timestamp('done_at', { withTimezone: true }),
    lateAt: timestamp('late_at', { withTimezone: true }),
    gaveUpAt: timestamp('gave_up_at', { withTimezone: true }),
    lateReportedAt: timestamp('late_reported_at', { withTimezone: true }),
    gaveUpReportedAt: timestamp('gave_up_reported_at', { withTimezone: true }),
    /** An error's class-like name, or unknown. Never a message. */
    lastErrorCode: text('last_error_code'),
  },
  (table) => [
    unique('provider_sign_out_once').on(table.sourceEventId),
    index('provider_sign_out_due')
      .on(table.nextAttemptAt)
      .where(sql`done_at IS NULL AND gave_up_at IS NULL`),
    index('provider_sign_out_by_user').on(table.userId),
  ],
);

export type HardwareKeyRow = typeof hardwareKey.$inferSelect;
export type HardwareKeyRemovalRow = typeof hardwareKeyRemoval.$inferSelect;
export type HardwareKeyNoticeRow = typeof hardwareKeyNotice.$inferSelect;
export type ProviderSignOutRow = typeof providerSignOut.$inferSelect;
