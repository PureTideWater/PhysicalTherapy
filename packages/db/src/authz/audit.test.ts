import { describe, expect, it } from 'vitest';

import { fakePool } from '../test-support/fake-pool';
import { readWithAudit, recordAuditEvent, rowTarget } from './audit';
import { ScopeError } from './ids';
import { type PracticeScope, type ScopeClient, withActor, withJobScope, withPracticeScope } from './scope';

const ACTOR = '3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60';
const PRACTICE_A = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01';
const PRACTICE_B = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c02';
const GRANT = '7b6a5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c01';
const OBJECT_1 = '9c8b7a65-4321-4fed-8cba-987654321001';
const OBJECT_2 = '9c8b7a65-4321-4fed-8cba-987654321002';
const JOB = '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382701';
const READ = { objectType: 'claim', purpose: 'case_review', requestId: 'req-1' };

/** A scope reaching practice A through a grant and practice B by ownership. */
function scoped<T>(run: (scope: PracticeScope<ScopeClient>, calls: ReturnType<typeof fakePool>['calls']) => Promise<T>) {
  const fake = fakePool((text) =>
    text.includes('open_practice_scope')
      ? [
          { practice_id: PRACTICE_A, via: 'grant', grant_id: GRANT, role: 'firm_analyst' },
          { practice_id: PRACTICE_B, via: 'ownership', grant_id: null, role: 'viewer' },
        ]
      : undefined,
  );
  return withPracticeScope(fake.pool, { actorId: ACTOR, practiceIds: [PRACTICE_A, PRACTICE_B] }, (scope) => run(scope, fake.calls));
}

const inserts = (calls: { text: string; values: unknown[] | undefined }[]) => calls.filter((call) => call.text.startsWith('INSERT INTO audit_event'));

describe('readWithAudit', () => {
  it('records one read event per returned row, with the grant each practice was reached through', async () => {
    await scoped(async (scope, calls) => {
      const rows = [
        { id: OBJECT_1, practiceId: PRACTICE_A },
        { id: OBJECT_2, practiceId: PRACTICE_B },
      ];
      await expect(readWithAudit(scope, READ, () => Promise.resolve(rows), rowTarget)).resolves.toEqual(rows);
      expect(inserts(calls)).toEqual([
        {
          text: expect.stringContaining('unnest($7::uuid[], $8::uuid[], $9::uuid[])'),
          values: [ACTOR, 'user', 'read', 'claim', 'case_review', 'req-1', [OBJECT_1, OBJECT_2], [PRACTICE_A, PRACTICE_B], [GRANT, null]],
        },
      ]);
    });
  });

  it('reads through the scope’s own connection', async () => {
    await scoped(async (scope) => {
      await readWithAudit(
        scope,
        READ,
        (client) => {
          expect(client).toBe(scope.client);
          return Promise.resolve([]);
        },
        rowTarget,
      );
    });
  });

  it('records nothing when nothing was read', async () => {
    await scoped(async (scope, calls) => {
      await expect(readWithAudit(scope, READ, () => Promise.resolve([]), rowTarget)).resolves.toEqual([]);
      expect(inserts(calls)).toEqual([]);
    });
  });

  it('records a job’s reads as the service actor', async () => {
    const fake = fakePool();
    await withJobScope(fake.pool, { jobId: JOB, practiceId: PRACTICE_A }, (scope) =>
      readWithAudit(scope, { ...READ, requestId: JOB }, () => Promise.resolve([{ id: OBJECT_1, practiceId: PRACTICE_A }]), rowTarget),
    );
    expect(inserts(fake.calls)[0]?.values).toEqual([JOB, 'service', 'read', 'claim', 'case_review', JOB, [OBJECT_1], [PRACTICE_A], [null]]);
  });

  it('refuses a row outside the scope, so nothing unaudited is returned', async () => {
    const OTHER = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c09';
    await scoped(async (scope, calls) => {
      await expect(readWithAudit(scope, READ, () => Promise.resolve([{ id: OBJECT_1, practiceId: OTHER }]), rowTarget)).rejects.toThrow(
        /outside the scope/,
      );
      expect(inserts(calls)).toEqual([]);
    });
  });

  it('refuses rows without an opaque object ID or practice', async () => {
    await scoped(async (scope) => {
      await expect(readWithAudit(scope, READ, () => Promise.resolve([{ id: 'SYNPCN0001', practiceId: PRACTICE_A }]), rowTarget)).rejects.toThrow(ScopeError);
      await expect(readWithAudit(scope, READ, () => Promise.resolve([{ id: OBJECT_1, practiceId: 'x' }]), rowTarget)).rejects.toThrow(ScopeError);
    });
  });

  it.each([
    [{ ...READ, objectType: 'Claim Number' }, /objectType/],
    [{ ...READ, purpose: 'reviewing SYNTHETIC TWIN' }, /purpose/],
    [{ ...READ, requestId: 'req 1' }, /requestId/],
  ])('refuses free text in the event (%j)', async (context, message) => {
    await scoped(async (scope) => {
      await expect(readWithAudit(scope, context, () => Promise.resolve([]), rowTarget)).rejects.toThrow(message);
    });
  });
});

describe('recordAuditEvent', () => {
  it('records an action on a practice in scope, with the grant it rests on', async () => {
    await scoped(async (scope, calls) => {
      await recordAuditEvent(scope, { action: 'grant_revoked', objectType: 'grant', objectId: OBJECT_1, practiceId: PRACTICE_A, purpose: 'offboarding', requestId: 'req-2' });
      expect(inserts(calls)[0]?.values).toEqual([ACTOR, 'user', 'grant_revoked', 'grant', 'offboarding', 'req-2', [OBJECT_1], [PRACTICE_A], [GRANT]]);
    });
  });

  it('records an action outside any practice from an actor scope', async () => {
    const fake = fakePool();
    await withActor(fake.pool, ACTOR, (scope) => recordAuditEvent(scope, { action: 'sign_in', objectType: 'user', requestId: 'req-3' }));
    expect(inserts(fake.calls)[0]?.values).toEqual([ACTOR, 'user', 'sign_in', 'user', null, 'req-3', [null], [null], [null]]);
  });

  it('refuses a practice outside the scope, and reads (which go through readWithAudit)', async () => {
    const fake = fakePool();
    await withActor(fake.pool, ACTOR, async (scope) => {
      await expect(recordAuditEvent(scope, { action: 'export', objectType: 'practice', practiceId: PRACTICE_A, requestId: 'r' })).rejects.toThrow(
        /outside the scope/,
      );
      await expect(recordAuditEvent(scope, { action: 'read', objectType: 'claim', requestId: 'r' })).rejects.toThrow(/readWithAudit/);
      await expect(recordAuditEvent(scope, { action: 'sign_in', objectType: 'user', objectId: 'u-1', requestId: 'r' })).rejects.toThrow(ScopeError);
      await expect(recordAuditEvent(scope, { action: 'Sign In', objectType: 'user', requestId: 'r' })).rejects.toThrow(/action/);
    });
    expect(inserts(fake.calls)).toEqual([]);
  });
});
