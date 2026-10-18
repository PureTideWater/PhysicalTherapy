import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

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
