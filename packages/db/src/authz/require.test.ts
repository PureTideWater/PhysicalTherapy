import { describe, expect, it } from 'vitest';

import { fakePool } from '../test-support/fake-pool';
import {
  PermissionDeniedError,
  databasePermits,
  knownRoles,
  organizationRoles,
  platformRoles,
  practiceDirectory,
  requireOrganizationPermission,
  requirePermission,
  requirePlatformPermission,
  requirePracticePermission,
  requireRole,
} from './require';
import { type ActorScope, type PracticeAccess, type PracticeScope, type ScopeClient, withActor } from './scope';

const ACTOR = '3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60';
const PRACTICE_A = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01';
const PRACTICE_B = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c02';
const ORGANIZATION = '6c5b4a39-2817-4f6e-8d5c-4b3a29180701';

function practiceScope(access: Record<string, PracticeAccess>): PracticeScope<ScopeClient> {
  const { client } = fakePool();
  return {
    kind: 'practice',
    client,
    actorId: ACTOR,
    actorKind: 'user',
    practiceIds: Object.keys(access).sort(),
    access: (practiceId) => access[practiceId],
  };
}

describe('requirePermission', () => {
  it('passes when a role holds the permission', () => {
    expect(() => {
      requirePermission(['billing_manager'], 'packet.approve');
    }).not.toThrow();
  });

  it('refuses a role without it, naming the persona and never an identifier', () => {
    const error = (() => {
      try {
        requirePermission(['viewer', 'unknown'], 'case.work');
      } catch (caught) {
        return caught as PermissionDeniedError;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect(error).toMatchObject({ permission: 'case.work', reason: 'no_role', roles: ['viewer'] });
    expect(error?.message).toBe('Viewer (CFO, owner) cannot work cases');
  });

  it('refuses a "must not" with the rule', () => {
    expect(() => {
      requirePermission(['viewer'], 'phi.export');
    }).toThrow(new PermissionDeniedError('phi.export', 'no_role', ['viewer'], { rule: 'Export line-level PHI', denies: ['phi.export'] }));
    try {
      requirePermission(['analyst'], 'packet.approve');
    } catch (caught) {
      expect(caught).toMatchObject({ reason: 'must_not', rule: { rule: 'Approve packets, change grants' } });
      expect((caught as Error).message).toBe('Analyst must not approve packets (Approve packets, change grants)');
    }
  });

  it('refuses no role at all', () => {
    expect(() => {
      requirePermission([], 'practice.open');
    }).toThrow('no role cannot open the practice’s workspace');
  });

  it('names several roles together', () => {
    expect(() => {
      requirePermission(['viewer', 'support'], 'case.work');
    }).toThrow('Viewer (CFO, owner) and Support engineer cannot work cases');
  });
});

describe('requireRole and knownRoles', () => {
  it('returns the first matching role in the matrix’s order', () => {
    expect(requireRole(['viewer', 'practice_admin'], ['practice_admin', 'viewer'], 'practice.open')).toBe('practice_admin');
    expect(knownRoles(['support', 'nobody', 'viewer'])).toEqual(['viewer', 'support']);
  });

  it('refuses when no role is allowed', () => {
    expect(() => requireRole(['viewer'], ['practice_admin'], 'grant.approve')).toThrow(PermissionDeniedError);
  });
});

describe('requirePracticePermission', () => {
  const scope = practiceScope({ [PRACTICE_A]: { practiceId: PRACTICE_A, via: 'ownership', grantId: null, roles: ['analyst'] } });

  it('returns the practice’s access when its roles hold the permission', () => {
    expect(requirePracticePermission(scope, PRACTICE_A.toUpperCase(), 'case.work')).toMatchObject({ via: 'ownership' });
  });

  it('refuses a practice outside the scope as no_access', () => {
    expect(() => requirePracticePermission(scope, PRACTICE_B, 'practice.open')).toThrow(
      expect.objectContaining({ reason: 'no_access', message: 'no current membership or grant reaches this practice, so you cannot open the practice’s workspace' }),
    );
  });

  it('refuses a permission the roles lack, and a permission of another scope', () => {
    expect(() => requirePracticePermission(scope, PRACTICE_A, 'packet.approve')).toThrow(expect.objectContaining({ reason: 'must_not' }));
    expect(() => requirePracticePermission(scope, PRACTICE_A, 'organization.manage')).toThrow('organization.manage is a platform permission, not a practice one');
  });

  it('refuses a malformed practice ID', () => {
    expect(() => requirePracticePermission(scope, 'SYN-1', 'practice.open')).toThrow('practiceId must be a UUID');
  });
});

describe('roles from the database', () => {
  async function asActor<T>(rows: unknown[], run: (scope: ActorScope<ScopeClient>) => Promise<T>) {
    const pool = fakePool((text) => (text.includes('app_actor_') ? rows : undefined));
    const result = await withActor(pool.pool, ACTOR, run);
    return { result, calls: pool.calls };
  }

  it('reads the platform roles from the internal organization, keeping known roles only', async () => {
    const { result, calls } = await asActor([{ role: 'platform_admin' }, { role: 'retired_role' }], (scope) => platformRoles(scope));
    expect(result).toEqual(['platform_admin']);
    expect(calls.at(-2)?.text).toContain("organization_kind = 'internal'");
  });

  it('requires a platform permission from those roles', async () => {
    await expect(asActor([{ role: 'platform_admin' }], (scope) => requirePlatformPermission(scope, 'support_grant.create'))).resolves.toMatchObject({ result: ['platform_admin'] });
    await expect(asActor([{ role: 'support' }], (scope) => requirePlatformPermission(scope, 'support_grant.create'))).rejects.toThrow(PermissionDeniedError);
    await expect(asActor([], (scope) => requirePlatformPermission(scope, 'phi.read'))).rejects.toThrow('phi.read is a practice permission, not a platform one');
  });

  it('reads an organization’s roles and requires an organization permission', async () => {
    const { result, calls } = await asActor([{ role: 'firm_principal' }], (scope) => organizationRoles(scope, ORGANIZATION));
    expect(result).toEqual(['firm_principal']);
    expect(calls.at(-2)?.values).toEqual([ORGANIZATION]);
    await expect(asActor([{ role: 'firm_principal' }], (scope) => requireOrganizationPermission(scope, ORGANIZATION, 'portfolio.read'))).resolves.toBeDefined();
    await expect(asActor([{ role: 'firm_analyst' }], (scope) => requireOrganizationPermission(scope, ORGANIZATION, 'portfolio.read'))).rejects.toThrow(PermissionDeniedError);
    await expect(asActor([], (scope) => requireOrganizationPermission(scope, ORGANIZATION, 'case.work'))).rejects.toThrow('case.work is a practice permission, not an organization one');
  });

  it('asks the database’s own check for a practice permission', async () => {
    const yes = fakePool((text) => (text.includes('app_actor_permitted') ? [{ ok: true }] : undefined));
    await expect(withActor(yes.pool, ACTOR, (scope) => databasePermits(scope, PRACTICE_A, 'grant.approve'))).resolves.toBe(true);
    expect(yes.calls.at(-2)?.values).toEqual([PRACTICE_A, 'grant.approve']);
    const none = fakePool();
    await expect(withActor(none.pool, ACTOR, (scope) => databasePermits(scope, PRACTICE_A, 'grant.approve'))).resolves.toBe(false);
    await expect(withActor(none.pool, ACTOR, (scope) => databasePermits(scope, PRACTICE_A, 'billing.manage'))).rejects.toThrow('not a practice one');
  });

  it('lists the practice directory', async () => {
    const { result } = await asActor([{ practice_id: PRACTICE_A, name: 'SYNTHETIC PRACTICE A', organization_id: null }], (scope) => practiceDirectory(scope));
    expect(result).toEqual([{ practiceId: PRACTICE_A, name: 'SYNTHETIC PRACTICE A', organizationId: null }]);
  });
});
