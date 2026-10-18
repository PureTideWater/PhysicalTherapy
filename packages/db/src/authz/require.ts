import { MEMBERSHIP_ROLES, type MembershipRole } from '../schema/tenancy';
import { ScopeError, requireUuid } from './ids';
import { type MustNot, PERMISSIONS, type Permission, type PermissionScope, PERSONAS, denyingRule, rolesPermit } from './permissions';
import type { AnyScope, PracticeAccess, PracticeScope, ScopeClient } from './scope';

/**
 * Role checks for route handlers and server actions (PRD 3, Authorization in code: "role checks live
 * in the route handlers and server actions, never only in middleware, and again in the database as
 * policies on the few actions that are role-specific"). The roles come from the database every time:
 * a practice's from the scope (effective_practice_access(): the membership roles a grant's scope
 * admits, the own group's roles, the support role under a support grant), an organization's and the
 * platform's from app_actor_memberships(). Nothing here caches a role.
 */

export type DenialReason = 'no_access' | 'no_role' | 'must_not';

function roleNames(roles: readonly MembershipRole[]): string {
  return roles.length === 0 ? 'no role' : roles.map((role) => PERSONAS[role].persona).join(' and ');
}

function denialMessage(permission: Permission, reason: DenialReason, roles: readonly MembershipRole[], rule: MustNot | undefined): string {
  const what = PERMISSIONS[permission].description;
  if (rule !== undefined) {
    return `${roleNames(roles)} must not ${what} (${rule.rule})`;
  }
  if (reason === 'no_access') {
    return `no current membership or grant reaches this practice, so you cannot ${what}`;
  }
  return `${roleNames(roles)} cannot ${what}`;
}

/** The actor may not do this. The message names the permission and the rule, never an identifier. */
export class PermissionDeniedError extends ScopeError {
  override readonly name = 'PermissionDeniedError';
  readonly reason: DenialReason;

  constructor(
    readonly permission: Permission,
    access: 'no_access' | 'no_role',
    readonly roles: readonly MembershipRole[],
    readonly rule?: MustNot,
  ) {
    const reason: DenialReason = rule === undefined ? access : 'must_not';
    super(denialMessage(permission, reason, roles, rule));
    this.reason = reason;
  }
}

/** Only the matrix's roles, in the matrix's order. */
export function knownRoles(roles: readonly string[]): MembershipRole[] {
  return MEMBERSHIP_ROLES.filter((role) => roles.includes(role));
}

/** Throws PermissionDeniedError unless the roles together hold the permission. */
export function requirePermission(roles: readonly string[], permission: Permission): void {
  const held = knownRoles(roles);
  if (rolesPermit(held, permission)) {
    return;
  }
  throw new PermissionDeniedError(permission, 'no_role', held, denyingRule(held, permission));
}

/** Throws unless one of the roles is among `allowed`. */
export function requireRole(roles: readonly string[], allowed: readonly MembershipRole[], permission: Permission): MembershipRole {
  const match = knownRoles(roles).find((role) => allowed.includes(role));
  if (match === undefined) {
    throw new PermissionDeniedError(permission, 'no_role', knownRoles(roles));
  }
  return match;
}

const SCOPE_NAMES: Readonly<Record<PermissionScope, string>> = { practice: 'a practice', organization: 'an organization', platform: 'a platform' };

function requireScope(permission: Permission, scope: PermissionScope): void {
  if (PERMISSIONS[permission].scope !== scope) {
    throw new ScopeError(`${permission} is ${SCOPE_NAMES[PERMISSIONS[permission].scope]} permission, not ${SCOPE_NAMES[scope]} one`);
  }
}

/**
 * The practice's access in this scope, if the actor's roles on it hold the permission. A practice
 * outside the scope (no membership or grant reaches it right now) is refused as no_access.
 */
export function requirePracticePermission<C extends ScopeClient>(scope: PracticeScope<C>, practiceId: string, permission: Permission): PracticeAccess {
  requireScope(permission, 'practice');
  const access = scope.access(requireUuid(practiceId, 'practiceId'));
  if (access === undefined) {
    throw new PermissionDeniedError(permission, 'no_access', []);
  }
  requirePermission(access.roles, permission);
  return access;
}

/** The actor's current roles in the internal organization (none for a customer or a job). */
export async function platformRoles<C extends ScopeClient>(scope: AnyScope<C>): Promise<MembershipRole[]> {
  const { rows } = await scope.client.query<{ role: string }>("SELECT DISTINCT role FROM app_actor_memberships() WHERE organization_kind = 'internal' ORDER BY role");
  return knownRoles(rows.map((row) => row.role));
}

/** The actor's current role in one organization, if any. */
export async function organizationRoles<C extends ScopeClient>(scope: AnyScope<C>, organizationId: string): Promise<MembershipRole[]> {
  const { rows } = await scope.client.query<{ role: string }>('SELECT DISTINCT role FROM app_actor_memberships() WHERE organization_id = $1 ORDER BY role', [
    requireUuid(organizationId, 'organizationId'),
  ]);
  return knownRoles(rows.map((row) => row.role));
}

/** Throws unless the actor's internal roles hold the platform permission; returns those roles. */
export async function requirePlatformPermission<C extends ScopeClient>(scope: AnyScope<C>, permission: Permission): Promise<MembershipRole[]> {
  requireScope(permission, 'platform');
  const roles = await platformRoles(scope);
  requirePermission(roles, permission);
  return roles;
}

/** Throws unless the actor's role in the organization holds the organization permission. */
export async function requireOrganizationPermission<C extends ScopeClient>(scope: AnyScope<C>, organizationId: string, permission: Permission): Promise<MembershipRole[]> {
  requireScope(permission, 'organization');
  const roles = await organizationRoles(scope, organizationId);
  requirePermission(roles, permission);
  return roles;
}

/** The database's own answer for a practice permission (the check role-specific policies make). */
export async function databasePermits<C extends ScopeClient>(scope: AnyScope<C>, practiceId: string, permission: Permission): Promise<boolean> {
  requireScope(permission, 'practice');
  const { rows } = await scope.client.query<{ ok: boolean }>('SELECT app_actor_permitted($1::uuid, $2) AS ok', [requireUuid(practiceId, 'practiceId'), permission]);
  return rows[0]?.ok === true;
}

export interface DirectoryPractice {
  readonly practiceId: string;
  readonly name: string;
  readonly organizationId: string | null;
}

/**
 * The practices the actor may reach right now, by name, for the practice switcher. Resolved by the
 * effective-permission function on every call (sessions.md: a session never caches the practice set).
 */
export async function practiceDirectory<C extends ScopeClient>(scope: AnyScope<C>): Promise<DirectoryPractice[]> {
  const { rows } = await scope.client.query<{ practice_id: string; name: string; organization_id: string | null }>(
    'SELECT practice_id, name, organization_id FROM app_actor_practice_directory()',
  );
  return rows.map((row) => ({ practiceId: row.practice_id, name: row.name, organizationId: row.organization_id }));
}
