import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { MEMBERSHIP_ROLES, type MembershipRole } from '../schema/tenancy';
import {
  PERMISSIONS,
  PERMISSION_NAMES,
  PERSONAS,
  type Permission,
  STRUCTURAL_RULES,
  WRITE_PERMISSIONS,
  denyingRule,
  isPermission,
  matrixRows,
  permissionsOf,
  rolesPermit,
} from './permissions';

const CUSTOMER_ROLES: readonly MembershipRole[] = ['practice_admin', 'billing_manager', 'analyst', 'viewer', 'firm_principal', 'firm_analyst'];
const INTERNAL_ROLES: readonly MembershipRole[] = ['platform_admin', 'contract_specialist', 'reviewer', 'support'];

describe('the persona matrix (PRD 3)', () => {
  it('has a persona for every membership role, and nothing else', () => {
    expect(Object.keys(PERSONAS).sort()).toEqual([...MEMBERSHIP_ROLES].sort());
  });

  it('never lets a persona do what its "Must not" column denies', () => {
    for (const role of MEMBERSHIP_ROLES) {
      const denied = PERSONAS[role].mustNot.flatMap((entry) => entry.denies);
      expect(PERSONAS[role].does.filter((permission) => denied.includes(permission)), role).toEqual([]);
    }
  });

  it('names only known permissions and structural rules', () => {
    for (const role of MEMBERSHIP_ROLES) {
      for (const permission of [...PERSONAS[role].does, ...PERSONAS[role].mustNot.flatMap((entry) => entry.denies)]) {
        expect(isPermission(permission), `${role} ${permission}`).toBe(true);
      }
      for (const entry of PERSONAS[role].mustNot) {
        expect(entry.structural === undefined || Object.hasOwn(STRUCTURAL_RULES, entry.structural)).toBe(true);
      }
    }
    expect(isPermission('phi.read')).toBe(true);
    expect(isPermission('toString')).toBe(false);
    expect(isPermission(42)).toBe(false);
  });

  it('gives every customer role at least what a viewer reads, and only customer and support roles practice access', () => {
    for (const role of CUSTOMER_ROLES) {
      expect(rolesPermit([role], 'practice.open'), role).toBe(true);
      expect(rolesPermit([role], 'report.read'), role).toBe(true);
    }
    expect(rolesPermit(['support'], 'practice.open')).toBe(true);
    for (const role of ['platform_admin', 'contract_specialist', 'reviewer'] as const) {
      expect(rolesPermit([role], 'practice.open'), role).toBe(false);
    }
  });

  it('keeps every customer role out of the platform permissions', () => {
    const platform = PERMISSION_NAMES.filter((name) => PERMISSIONS[name].scope === 'platform');
    for (const role of CUSTOMER_ROLES) {
      expect(platform.filter((permission) => rolesPermit([role], permission)), role).toEqual([]);
    }
    expect(INTERNAL_ROLES.some((role) => rolesPermit([role], 'organization.manage'))).toBe(true);
  });

  it.each([
    ['practice_admin', 'rate_record.edit', 'Edit rate records'],
    ['billing_manager', 'packet.approve_own_draft', 'Approve a packet she drafted'],
    ['analyst', 'packet.approve', 'Approve packets, change grants'],
    ['analyst', 'grant.revoke', 'Approve packets, change grants'],
    ['firm_analyst', 'grant.approve', 'Approve packets, change grants'],
    ['viewer', 'phi.export', 'Export line-level PHI'],
    ['firm_principal', 'packet.approve_own_draft', 'Approve a packet she drafted'],
    ['contract_specialist', 'rate_record.edit_published', 'Edit a published rate version'],
    ['reviewer', 'case.work', 'Edit anything'],
    ['platform_admin', 'phi.read', 'Read PHI without a support grant'],
  ] as const)('denies %s %s ("%s")', (role, permission, rule) => {
    expect(rolesPermit([role], permission)).toBe(false);
    expect(denyingRule([role], permission)?.rule).toContain(rule);
  });

  it('keeps the reviewer read-only: every permission that writes is denied', () => {
    expect(WRITE_PERMISSIONS.length).toBeGreaterThan(10);
    expect(WRITE_PERMISSIONS.filter((permission) => rolesPermit(['reviewer'], permission))).toEqual([]);
    expect(permissionsOf(['reviewer'])).toEqual(['report.read', 'phi.read', 'audit_finding.validate']);
  });

  it('lets nobody approve their own draft, and only billing managers and firm principals approve packets', () => {
    for (const role of MEMBERSHIP_ROLES) {
      expect(rolesPermit([role], 'packet.approve_own_draft'), role).toBe(false);
    }
    expect(MEMBERSHIP_ROLES.filter((role) => rolesPermit([role], 'packet.approve'))).toEqual(['billing_manager', 'firm_principal']);
    expect(MEMBERSHIP_ROLES.filter((role) => rolesPermit([role], 'grant.approve'))).toEqual(['practice_admin']);
  });

  it('marks the structural "must not" rules', () => {
    expect(PERSONAS.firm_principal.mustNot.map((entry) => entry.structural)).toContain('grant_in_force');
    expect(PERSONAS.support.mustNot.map((entry) => entry.structural)).toEqual(['support_grant_expiry']);
    expect(PERSONAS.platform_admin.mustNot.map((entry) => entry.structural)).toEqual(['support_grant_required']);
  });
});

describe('rolesPermit', () => {
  it('holds nothing for no role or an unknown role', () => {
    expect(rolesPermit([], 'practice.open')).toBe(false);
    expect(rolesPermit(['owner'], 'practice.open')).toBe(false);
    expect(denyingRule(['owner'], 'phi.export')).toBeUndefined();
    expect(permissionsOf([])).toEqual([]);
  });

  it('lets a denial win over another role’s allow', () => {
    expect(rolesPermit(['billing_manager'], 'phi.export')).toBe(true);
    expect(rolesPermit(['billing_manager', 'viewer'], 'phi.export')).toBe(false);
    expect(rolesPermit(['viewer', 'billing_manager'], 'phi.export')).toBe(false);
    expect(denyingRule(['billing_manager', 'viewer'], 'phi.export')?.rule).toBe('Export line-level PHI');
  });

  it('is the union of the roles’ permissions minus every denial (property)', () => {
    const role = fc.constantFrom(...MEMBERSHIP_ROLES);
    const permission = fc.constantFrom(...PERMISSION_NAMES);
    fc.assert(
      fc.property(fc.array(role, { maxLength: 4 }), permission, (roles, wanted: Permission) => {
        const allowed = roles.some((held) => PERSONAS[held].does.includes(wanted));
        const denied = roles.some((held) => PERSONAS[held].mustNot.some((entry) => entry.denies.includes(wanted)));
        expect(rolesPermit(roles, wanted)).toBe(allowed && !denied);
      }),
    );
  });
});

describe('matrixRows', () => {
  it('lists one row per role and permission, allow for "Does" and deny for "Must not", sorted', () => {
    const rows = matrixRows();
    expect(new Set(rows.map((row) => `${row.role} ${row.action}`)).size).toBe(rows.length);
    expect(rows).toContainEqual({ role: 'viewer', action: 'phi.export', effect: 'deny' });
    expect(rows).toContainEqual({ role: 'viewer', action: 'report.read', effect: 'allow' });
    expect(rows).toEqual([...rows].sort((a, b) => a.role.localeCompare(b.role) || a.action.localeCompare(b.action)));
    expect(rows[0]).toEqual({ role: 'analyst', action: 'case.work', effect: 'allow' });
    for (const row of rows) {
      expect(rolesPermit([row.role], row.action), `${row.role} ${row.action}`).toBe(row.effect === 'allow');
    }
  });
});
