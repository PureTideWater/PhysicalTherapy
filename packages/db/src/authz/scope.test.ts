import pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openPool, openedPool } from '../connect';
import { fakePool } from '../test-support/fake-pool';
import { ScopeError, isUuid, requireUuid } from './ids';
import { JobActorIsPersonError, OnePracticePerJobError, type PracticeScope, type ScopeClient, accessByPractice, onePracticeJob, openScopeReaches, withActor, withJobScope, withPracticeScope, withPublicSnapshot } from './scope';

const ACTOR = '3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60';
const PRACTICE_A = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01';
const PRACTICE_B = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c02';
const GRANT_1 = '7b6a5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c01';
const GRANT_2 = '7b6a5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c02';
const JOB = '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382701';

describe('ids', () => {
  it('accepts canonical UUIDs only, normalized to lowercase', () => {
    expect(isUuid(ACTOR)).toBe(true);
    expect(isUuid(ACTOR.toUpperCase())).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(requireUuid(ACTOR.toUpperCase(), 'actorId')).toBe(ACTOR);
    expect(() => requireUuid('SYN000000001', 'actorId')).toThrow(new ScopeError('actorId must be a UUID'));
    expect(() => requireUuid(undefined, 'actorId')).toThrow(ScopeError);
  });

  it('never echoes the refused value', () => {
    expect(() => requireUuid('SYNTHETIC TWIN', 'actorId')).not.toThrow(/SYNTHETIC/);
  });
});

describe('transaction handling', () => {
  it('opens, runs and commits on one connection, then returns it to the pool', async () => {
    const { pool, texts, released } = fakePool();
    await expect(withActor(pool, ACTOR, () => Promise.resolve('done'))).resolves.toBe('done');
    expect(texts()).toEqual(['BEGIN', expect.stringContaining("set_config('app.actor_id'"), 'COMMIT']);
    expect(released).toEqual([false]);
  });

  it('rolls back when the work fails, and rethrows', async () => {
    const { pool, texts, released } = fakePool();
    await expect(withActor(pool, ACTOR, () => Promise.reject(new Error('work failed')))).rejects.toThrow('work failed');
    expect(texts().at(-1)).toBe('ROLLBACK');
    expect(released).toEqual([false]);
  });

  it('rolls back when the commit fails (a deferred constraint), and rethrows', async () => {
    const { pool, texts } = fakePool((text) => (text === 'COMMIT' ? new Error('deferred check failed') : undefined));
    await expect(withActor(pool, ACTOR, () => Promise.resolve(1))).rejects.toThrow('deferred check failed');
    expect(texts().slice(-2)).toEqual(['COMMIT', 'ROLLBACK']);
  });

  it('destroys a connection whose rollback fails', async () => {
    const { pool, released } = fakePool((text) => (text === 'ROLLBACK' ? new Error('connection lost') : undefined));
    await expect(withActor(pool, ACTOR, () => Promise.reject(new Error('work failed')))).rejects.toThrow('work failed');
    expect(released).toEqual([true]);
  });

  it('destroys a connection that cannot begin a transaction', async () => {
    const { pool, texts, released } = fakePool((text) => (text === 'BEGIN' ? new Error('connection lost') : undefined));
    await expect(withActor(pool, ACTOR, () => Promise.resolve(1))).rejects.toThrow('connection lost');
    expect(texts()).toEqual(['BEGIN']);
    expect(released).toEqual([true]);
  });

  it('rolls back when opening the scope fails', async () => {
    const { pool, texts } = fakePool((text) => (text.includes('open_practice_scope') ? new Error('no such actor') : undefined));
    await expect(withPracticeScope(pool, { actorId: ACTOR, practiceIds: [PRACTICE_A] }, () => Promise.resolve(1))).rejects.toThrow('no such actor');
    expect(texts().at(-1)).toBe('ROLLBACK');
  });
});

describe('withActor', () => {
  it('sets the actor and an empty practice scope', async () => {
    const { pool, calls } = fakePool();
    await withActor(pool, ACTOR, (scope) => {
      expect(scope).toMatchObject({ kind: 'actor', actorId: ACTOR, actorKind: 'user', practiceIds: [] });
      expect(scope.access(PRACTICE_A)).toBeUndefined();
      return Promise.resolve();
    });
    expect(calls[1]).toEqual({
      text: "SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)",
      values: [ACTOR],
    });
  });

  it('reads the allowed-practice set from the effective-permission function', async () => {
    const { pool } = fakePool((text) => (text.includes('allowed_practice_ids') ? [{ ids: [PRACTICE_A] }] : undefined));
    await expect(withActor(pool, ACTOR, (scope) => scope.allowedPracticeIds())).resolves.toEqual([PRACTICE_A]);
    const empty = fakePool();
    await expect(withActor(empty.pool, ACTOR, (scope) => scope.allowedPracticeIds())).resolves.toEqual([]);
  });

  it('refuses an actor that is not a UUID before taking a connection', () => {
    const { pool, calls } = fakePool();
    expect(() => withActor(pool, 'someone', () => Promise.resolve())).toThrow(ScopeError);
    expect(calls).toEqual([]);
  });
});

describe('withPracticeScope', () => {
  it('opens the scope in SQL with the requested practices, deduplicated and sorted', async () => {
    const { pool, calls } = fakePool((text) =>
      text.includes('open_practice_scope') ? [{ practice_id: PRACTICE_A, via: 'grant', grant_id: GRANT_1, role: 'firm_analyst' }] : undefined,
    );
    await withPracticeScope(pool, { actorId: ACTOR, practiceIds: [PRACTICE_B, PRACTICE_A.toUpperCase(), PRACTICE_B] }, (scope) => {
      expect(scope).toMatchObject({ kind: 'practice', actorId: ACTOR, actorKind: 'user', practiceIds: [PRACTICE_A] });
      expect(scope.access(PRACTICE_A)).toEqual({ practiceId: PRACTICE_A, via: 'grant', grantId: GRANT_1, roles: ['firm_analyst'] });
      expect(scope.access(PRACTICE_B)).toBeUndefined();
      return Promise.resolve();
    });
    expect(calls[1]).toEqual({ text: "SELECT set_config('app.actor_id', $1, true)", values: [ACTOR] });
    expect(calls[2]).toEqual({
      text: 'SELECT practice_id, via, grant_id, role FROM open_practice_scope($1::uuid[])',
      values: [[PRACTICE_A, PRACTICE_B]],
    });
  });

  it('reads one snapshot when the request asks for it (REPEATABLE READ from its first statement), and READ COMMITTED otherwise', async () => {
    const snapshot = fakePool();
    await withPracticeScope(snapshot.pool, { actorId: ACTOR, practiceIds: [PRACTICE_A], oneSnapshot: true }, () => Promise.resolve());
    expect(snapshot.texts()).toEqual(['BEGIN ISOLATION LEVEL REPEATABLE READ', expect.stringContaining("set_config('app.actor_id'"), expect.stringContaining('open_practice_scope'), 'COMMIT']);
    for (const request of [{ actorId: ACTOR, practiceIds: [PRACTICE_A] }, { actorId: ACTOR, practiceIds: [PRACTICE_A], oneSnapshot: false }]) {
      const plain = fakePool();
      await withPracticeScope(plain.pool, request, () => Promise.resolve());
      expect(plain.texts()[0]).toBe('BEGIN');
    }
  });

  it('is empty when the actor may reach none of the requested practices', async () => {
    const { pool } = fakePool();
    await withPracticeScope(pool, { actorId: ACTOR, practiceIds: [PRACTICE_A] }, (scope) => {
      expect(scope.practiceIds).toEqual([]);
      return Promise.resolve();
    });
  });

  it('refuses a practice ID that is not a UUID', () => {
    const { pool } = fakePool();
    expect(() => withPracticeScope(pool, { actorId: ACTOR, practiceIds: ['{a,b}'] }, () => Promise.resolve())).toThrow(
      new ScopeError('every practice ID must be a UUID'),
    );
  });
});

describe('withPublicSnapshot', () => {
  it('reads a public page in one read-only snapshot with no actor and no practice set, and commits', async () => {
    const { pool, texts, released } = fakePool((text) => (text === 'SELECT 1 AS one' ? [{ one: 1 }] : undefined));
    const result = await withPublicSnapshot(pool, async (client) => (await client.query<{ one: number }>('SELECT 1 AS one')).rows[0]?.one);
    expect(result).toBe(1);
    expect(texts()).toEqual(['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', 'SELECT 1 AS one', 'COMMIT']);
    expect(released).toEqual([false]);
  });

  it('rolls back when the read fails, rethrows, and destroys a connection whose rollback fails', async () => {
    const failing = fakePool();
    await expect(withPublicSnapshot(failing.pool, () => Promise.reject(new Error('not found')))).rejects.toThrow('not found');
    expect(failing.texts()).toEqual(['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', 'ROLLBACK']);
    expect(failing.released).toEqual([false]);
    const lost = fakePool((text) => (text === 'ROLLBACK' ? new Error('connection lost') : undefined));
    await expect(withPublicSnapshot(lost.pool, () => Promise.reject(new Error('not found')))).rejects.toThrow('not found');
    expect(lost.released).toEqual([true]);
  });
});

describe('accessByPractice', () => {
  it('prefers ownership, then a grant, then a support grant, and gathers every role', () => {
    const access = accessByPractice([
      { practice_id: PRACTICE_A, via: 'support', grant_id: GRANT_2, role: 'support' },
      { practice_id: PRACTICE_A, via: 'grant', grant_id: GRANT_2, role: 'viewer' },
      { practice_id: PRACTICE_A, via: 'grant', grant_id: GRANT_1, role: 'analyst' },
      { practice_id: PRACTICE_A, via: 'grant', grant_id: GRANT_1, role: 'analyst' },
      { practice_id: PRACTICE_B, via: 'grant', grant_id: GRANT_1, role: 'analyst' },
      { practice_id: PRACTICE_B, via: 'ownership', grant_id: null, role: 'practice_admin' },
    ]);
    expect(access.get(PRACTICE_A)).toEqual({ practiceId: PRACTICE_A, via: 'grant', grantId: GRANT_1, roles: ['analyst', 'support', 'viewer'] });
    expect(access.get(PRACTICE_B)).toEqual({ practiceId: PRACTICE_B, via: 'ownership', grantId: null, roles: ['analyst', 'practice_admin'] });
  });

  it('merges two ownership routes to one practice (two current memberships in its group)', () => {
    const access = accessByPractice([
      { practice_id: PRACTICE_A, via: 'ownership', grant_id: null, role: 'viewer' },
      { practice_id: PRACTICE_A, via: 'ownership', grant_id: null, role: 'billing_manager' },
    ]);
    expect(access.get(PRACTICE_A)).toEqual({ practiceId: PRACTICE_A, via: 'ownership', grantId: null, roles: ['billing_manager', 'viewer'] });
  });

  it('refuses a route it does not know', () => {
    expect(() => accessByPractice([{ practice_id: PRACTICE_A, via: 'bypass', grant_id: null, role: 'viewer' }])).toThrow(ScopeError);
  });
});

describe('withJobScope (one practice per job, SEC-06)', () => {
  it('scopes the job to its one practice, built as a one-element array in SQL', async () => {
    const { pool, calls } = fakePool();
    await withJobScope(pool, { jobId: JOB, practiceId: PRACTICE_A.toUpperCase() }, (scope) => {
      expect(scope).toMatchObject({ kind: 'job', actorId: JOB, actorKind: 'service', practiceIds: [PRACTICE_A] });
      expect(scope.access(PRACTICE_A)).toEqual({ practiceId: PRACTICE_A, via: 'job', grantId: null, roles: [] });
      expect(scope.access(PRACTICE_B)).toBeUndefined();
      return Promise.resolve();
    });
    expect(calls[1]).toEqual({
      text: "SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', ARRAY[$2::uuid]::text, true)",
      values: [JOB, PRACTICE_A],
    });
  });

  it.each([
    ['two practices', { jobId: JOB, practiceId: [PRACTICE_A, PRACTICE_B] }],
    ['a one-element list', { jobId: JOB, practiceId: [PRACTICE_A] }],
    ['a practice list smuggled in a string', { jobId: JOB, practiceId: `{${PRACTICE_A},${PRACTICE_B}}` }],
    ['no practice', { jobId: JOB }],
    ['an extra practice list beside the practice', { jobId: JOB, practiceId: PRACTICE_A, practiceIds: [PRACTICE_B] }],
  ])('refuses %s before taking a connection', (_label, request) => {
    const { pool, calls } = fakePool();
    expect(() => withJobScope(pool, request as never, () => Promise.resolve())).toThrow(OnePracticePerJobError);
    expect(calls).toEqual([]);
  });

  it('refuses a job ID that is not a UUID', () => {
    expect(() => onePracticeJob({ jobId: 'job-1', practiceId: PRACTICE_A })).toThrow(new ScopeError('jobId must be a UUID'));
  });

  it('asks the database whether the job ID names a person, and runs the job when it names none', async () => {
    const { pool, texts } = fakePool((text) => (text.includes('app_actor_is_person') ? [{ person: false }] : undefined));
    await expect(withJobScope(pool, { jobId: JOB, practiceId: PRACTICE_A }, () => Promise.resolve('ran'))).resolves.toBe('ran');
    expect(texts()).toEqual(['BEGIN', expect.stringContaining("set_config('app.actor_id'"), 'SELECT app_actor_is_person() AS person', 'COMMIT']);
  });

  it('refuses a job ID that names a person before the job runs, and rolls back (docs/adr/0061)', async () => {
    const { pool, texts } = fakePool((text) => (text.includes('app_actor_is_person') ? [{ person: true }] : undefined));
    let ran = false;
    await expect(
      withJobScope(pool, { jobId: ACTOR, practiceId: PRACTICE_A }, () => {
        ran = true;
        return Promise.resolve();
      }),
    ).rejects.toThrow(JobActorIsPersonError);
    expect(ran).toBe(false);
    expect(texts().at(-1)).toBe('ROLLBACK');
  });
});

describe('openScopeReaches: a scope this module opened on a pool openPool opened (combined audit item 120’s review, P12)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A pool openPool opened whose connections are a fake client's (pg's own connect stood in for, before it is opened). */
  function openedFake(respond: Parameters<typeof fakePool>[0]) {
    const fake = fakePool(respond);
    vi.spyOn(pg.Pool.prototype as unknown as { connect: () => Promise<pg.PoolClient> }, 'connect').mockImplementation(() => Promise.resolve(fake.client as pg.PoolClient));
    return { ...fake, pool: openPool('postgres://synthetic@localhost:1/none', 1) };
  }
  const grantA = (text: string) => (text.includes('open_practice_scope') ? [{ practice_id: PRACTICE_A, via: 'grant', grant_id: GRANT_1, role: 'firm_analyst' }] : undefined);

  it('answers for a request scope while its transaction is open, for the practices it reaches only, and never for a copy', async () => {
    const { pool } = openedFake(grantA);
    let kept: PracticeScope<ScopeClient> | undefined;
    await withPracticeScope(pool, { actorId: ACTOR, practiceIds: [PRACTICE_A, PRACTICE_B] }, (scope) => {
      kept = scope;
      expect(openScopeReaches(scope, PRACTICE_A)).toBe(true);
      expect(openScopeReaches(scope, PRACTICE_B)).toBe(false);
      // An object of the same shape, its properties copied or made to claim another practice, proves nothing.
      expect(openScopeReaches({ ...scope }, PRACTICE_A)).toBe(false);
      const claimed = scope as { access: PracticeScope<ScopeClient>['access']; practiceIds: readonly string[] };
      claimed.access = (id) => ({ practiceId: id, via: 'grant', grantId: GRANT_2, roles: ['firm_analyst'] });
      claimed.practiceIds = [PRACTICE_A, PRACTICE_B];
      expect(openScopeReaches(scope, PRACTICE_B)).toBe(false);
      return Promise.resolve();
    });
    // Kept past its transaction, it reaches nothing.
    expect(openScopeReaches(kept, PRACTICE_A)).toBe(false);
  });

  it('answers for a job scope for its one practice while it runs, and ends with it even when the job fails', async () => {
    const { pool } = openedFake((text) => (text.includes('app_actor_is_person') ? [{ person: false }] : undefined));
    let kept: PracticeScope<ScopeClient> | undefined;
    await expect(
      withJobScope(pool, { jobId: JOB, practiceId: PRACTICE_A }, (scope) => {
        kept = scope;
        expect([openScopeReaches(scope, PRACTICE_A), openScopeReaches(scope, PRACTICE_B)]).toEqual([true, false]);
        return Promise.reject(new Error('SYNTHETIC job failed'));
      }),
    ).rejects.toThrow('SYNTHETIC job failed');
    expect(openScopeReaches(kept, PRACTICE_A)).toBe(false);
  });

  it('answers for no scope opened on a pool of the same shape, and for anything that is not a scope', async () => {
    const { pool } = fakePool(grantA);
    await withPracticeScope(pool, { actorId: ACTOR, practiceIds: [PRACTICE_A] }, (scope) => {
      expect(scope.access(PRACTICE_A)).toBeDefined();
      expect(openScopeReaches(scope, PRACTICE_A)).toBe(false);
      return Promise.resolve();
    });
    for (const value of [undefined, null, PRACTICE_A, { access: () => ({ practiceId: PRACTICE_A, via: 'grant', grantId: GRANT_1, roles: [] }), practiceIds: [PRACTICE_A] }]) {
      expect(openScopeReaches(value, PRACTICE_A)).toBe(false);
    }
  });
});

describe('openedPool: a pool openPool opened (P12)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hands back the connect openPool found, whatever is assigned to the pool after, and nothing for a pool built another way', async () => {
    const fake = fakePool();
    const connect = vi.spyOn(pg.Pool.prototype as unknown as { connect: () => Promise<pg.PoolClient> }, 'connect').mockImplementation(() => Promise.resolve(fake.client as pg.PoolClient));
    const pool = openPool('postgres://synthetic@localhost:1/none', 1);
    const stub = vi.fn(() => Promise.reject(new Error('SYNTHETIC stub')));
    (pool as unknown as { connect: unknown }).connect = stub;
    await expect(openedPool(pool)?.connect()).resolves.toBe(fake.client);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(stub).not.toHaveBeenCalled();
    expect(Object.isFrozen(openedPool(pool))).toBe(true);
    for (const other of [new pg.Pool({ connectionString: 'postgres://synthetic@localhost:1/none', max: 1 }), fake.pool, { connect: () => pool.connect() }, undefined, null, 'pool']) {
      expect(openedPool(other)).toBeUndefined();
    }
  });
});
