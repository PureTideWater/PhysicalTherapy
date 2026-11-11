import { randomBytes, randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, TransactionNotCommittedError, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import type { ScopeClient, ScopePool } from '@tp/db/runtime';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { type OpenedSession, SESSION_COOKIE, resolveSession } from '../auth/sessions';
import { csrfTokenFor } from '../http/csrf';
import type { CookieJar, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { revokeDeviceAction, signOutAction } from './account';
import { endMembership } from './console';
import { endMembershipAction } from './settings';
import { openSessionNow } from './test-support/open-session';

/**
 * A session's end and its audit event are one transaction, however the session ends (Queues item 25 (d)): a limit
 * the database finds on a request (idle, expired, a revoked device, a disabled user), sign-out, a device's revocation
 * and a membership's end from the console and from an organization's settings. (A password reset's sweep is in
 * auth/sign-in.db.test.ts, beside the flow it belongs to.) For each: a failure at the event leaves the session live; a
 * failure at the end leaves no event; a commit the server answers with ROLLBACK reports neither as done; and the
 * way through writes both. The faults are synthetic, injected between the application and a real database.
 */

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let faulty: Services;
let world: TenantWorld;

/** The fault the next matching transaction meets: a statement refused, or its COMMIT sent as ROLLBACK (what PostgreSQL answers a failed transaction). */
type Fault = { readonly kind: 'statement'; readonly match: RegExp } | { readonly kind: 'commit'; readonly within: RegExp };
let fault: Fault | undefined;
let faultsMet = 0;

const AUDIT = /INSERT INTO audit_event/;

/** The application's pool, with the armed fault met by every transaction it matches (synthetic failures only). */
function faultyPool(): ScopePool<ScopeClient> {
  return {
    connect: async () => {
      const client = await app.connect();
      let within = false;
      return new Proxy(client, {
        get(target, property) {
          if (property === 'query') {
            return (text: unknown, values?: unknown[]) => {
              if (typeof text === 'string' && fault !== undefined) {
                if (text.startsWith('BEGIN')) {
                  within = false;
                }
                if (fault.kind === 'statement' && fault.match.test(text)) {
                  faultsMet += 1;
                  return Promise.reject(new Error('synthetic failure'));
                }
                if (fault.kind === 'commit') {
                  within ||= fault.within.test(text);
                  if (text === 'COMMIT' && within) {
                    faultsMet += 1;
                    return target.query('ROLLBACK');
                  }
                }
              }
              return target.query(text as string, values);
            };
          }
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
        },
      });
    },
  };
}

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 4);
  const sealer = new Sealer(randomBytes(32));
  const provider = new DevAuthProvider({
    store: new MemoryDevStore(),
    sealer: sealer.derive('dev-provider'),
    webauthn: { rpId: 'localhost', rpName: 'Test', origin: 'http://localhost:3100' },
    deliverInvitation: () => Promise.resolve(),
    scryptCost: { n: 1024, r: 8, p: 1 },
  });
  const shared = { origin: 'http://localhost:3100', provider, keys: LocalKeyProvider.random(), sealer, logger: createLogger({ sink: () => undefined }) };
  faulty = createServices({ ...shared, pool: faultyPool(), queue: new MemoryQueue() });
  world = await createTenantWorld(owner, 'session-end');
}, 120_000);

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

beforeEach(() => {
  fault = undefined;
  faultsMet = 0;
});

class Jar implements CookieJar {
  private readonly values = new Map<string, string>();
  constructor(token: string) {
    this.values.set(SESSION_COOKIE, token);
  }
  get(name: string) {
    return this.values.get(name);
  }
  set(name: string, value: string) {
    this.values.set(name, value);
  }
  delete(name: string) {
    this.values.delete(name);
  }
}

function sessionFor(userId: string, method: 'totp' | 'webauthn' = 'totp'): Promise<OpenedSession> {
  return openSessionNow(app, { userId, method, deviceToken: undefined, userAgent: null, requestId: 'test' });
}

/** The route's outcome on the given services: its status, or `threw` when the failure was not one the routes map to an outcome. */
async function run<R>(on: Services, route: Route<R>, token: string, input: Record<string, unknown> = {}, params: Record<string, unknown> = {}): Promise<string> {
  try {
    return (await route.invoke({ cookies: new Jar(token), params, input: { csrfToken: csrfTokenFor(on.sealer, token), requestKey: randomUUID(), ...input }, requestId: `test-${randomUUID()}`, userAgent: null }, on)).status;
  } catch {
    return 'threw';
  }
}

/** How the session stands in the database: live, or its end's reason. */
async function standing(sessionId: string): Promise<string> {
  const { rows } = await owner.query<{ ended: boolean; end_reason: string | null }>('SELECT ended_at IS NOT NULL AS ended, end_reason FROM user_session WHERE id = $1', [sessionId]);
  return rows[0]?.ended === true ? (rows[0].end_reason ?? 'ended without a reason') : 'live';
}

/** The audit events of one action about one object: who acted, and the purpose recorded. */
async function events(action: string, objectId: string): Promise<{ actor_id: string; purpose: string | null }[]> {
  return (await owner.query<{ actor_id: string; purpose: string | null }>('SELECT actor_id, purpose FROM audit_event WHERE action = $1 AND object_id = $2', [action, objectId])).rows;
}

const LIMITS: readonly { readonly reason: 'idle' | 'expired' | 'device_revoked' | 'user_disabled'; readonly reach: (session: OpenedSession, userId: string) => Promise<unknown> }[] = [
  { reason: 'idle', reach: (session) => owner.query("UPDATE user_session SET last_seen_at = now() - interval '31 minutes' WHERE id = $1", [session.sessionId]) },
  {
    reason: 'expired',
    reach: (session) => owner.query("UPDATE user_session SET started_at = now() - interval '12 hours 1 minute', expires_at = now() - interval '1 minute' WHERE id = $1", [session.sessionId]),
  },
  // The device's row alone, as the owner: the route that revokes a device ends its sessions itself (below).
  { reason: 'device_revoked', reach: (session) => owner.query('UPDATE user_device SET revoked_at = now() WHERE id = $1', [session.deviceId]) },
  { reason: 'user_disabled', reach: (_session, userId) => asOwner(owner, [], () => owner.query(`UPDATE "user" SET status = 'disabled' WHERE id = $1`, [userId])) },
];

describe('a session past a limit: the database ends it on the next request, and the end’s audit event is in that transaction', () => {
  for (const { reason, reach } of LIMITS) {
    it(`${reason}: a failure at the event, at the end or at the commit leaves the session live with no event; the way through writes both, once`, async () => {
      const userId = await createUser(owner);
      const session = await sessionFor(userId);
      expect(await resolveSession(app, session.sessionToken, 'test')).toMatchObject({ state: 'active' });
      await reach(session, userId);
      expect(await standing(session.sessionId)).toBe('live');

      // The audit event's insert fails: the end rolls back with it.
      fault = { kind: 'statement', match: AUDIT };
      await expect(resolveSession(faulty.pool, session.sessionToken, 'test')).rejects.toThrow('synthetic failure');
      expect(faultsMet).toBe(1);
      expect(await standing(session.sessionId)).toBe('live');
      expect(await events('session_ended', session.sessionId)).toEqual([]);

      // The end itself fails: no event is written for it.
      fault = { kind: 'statement', match: /resolve_session/ };
      await expect(resolveSession(faulty.pool, session.sessionToken, 'test')).rejects.toThrow('synthetic failure');
      expect(faultsMet).toBe(2);
      expect(await standing(session.sessionId)).toBe('live');
      expect(await events('session_ended', session.sessionId)).toEqual([]);

      // The commit is answered ROLLBACK: neither is reported as done, and neither was.
      fault = { kind: 'commit', within: /resolve_session/ };
      await expect(resolveSession(faulty.pool, session.sessionToken, 'test')).rejects.toBeInstanceOf(TransactionNotCommittedError);
      expect(faultsMet).toBe(3);
      expect(await standing(session.sessionId)).toBe('live');
      expect(await events('session_ended', session.sessionId)).toEqual([]);

      // No fault: the session ends for its reason, with one event in its user's name; a later request adds none.
      fault = undefined;
      expect(await resolveSession(faulty.pool, session.sessionToken, 'test')).toEqual({ state: 'ended', reason });
      expect(await standing(session.sessionId)).toBe(reason);
      expect(await events('session_ended', session.sessionId)).toEqual([{ actor_id: userId, purpose: reason }]);
      expect(await resolveSession(app, session.sessionToken, 'test')).toEqual({ state: 'ended', reason: 'ended' });
      expect(await events('session_ended', session.sessionId)).toEqual([{ actor_id: userId, purpose: reason }]);
    });
  }

  it('touches an active session and commits, leaving no connection in a transaction and writing no event', async () => {
    const userId = await createUser(owner);
    const session = await sessionFor(userId);
    await owner.query("UPDATE user_session SET last_seen_at = now() - interval '5 minutes' WHERE id = $1", [session.sessionId]);
    expect(await resolveSession(app, session.sessionToken, 'test')).toMatchObject({ state: 'active', session: { sessionId: session.sessionId, userId } });
    const { rows } = await owner.query<{ fresh: boolean }>("SELECT last_seen_at > now() - interval '1 minute' AS fresh FROM user_session WHERE id = $1", [session.sessionId]);
    expect(rows).toEqual([{ fresh: true }]);
    expect(await events('session_ended', session.sessionId)).toEqual([]);
    expect(await resolveSession(app, randomBytes(32).toString('base64url'), 'test')).toEqual({ state: 'none' });
    const idle = await owner.query("SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND state LIKE 'idle in transaction%'");
    expect(idle.rows).toEqual([]);
  });
});

interface Ending {
  /** The session that must end, the session that asks for it, and the object the route's audit event names. */
  readonly ends: OpenedSession;
  readonly asks: OpenedSession;
  readonly objectId: string;
  readonly route: Route<unknown>;
  readonly input: Record<string, unknown>;
  readonly params: Record<string, unknown>;
  readonly actorId: string;
}

const ROUTES: readonly { readonly name: string; readonly action: string; readonly endReason: string; readonly end: RegExp; readonly arrange: () => Promise<Ending> }[] = [
  {
    name: 'sign-out',
    action: 'sign_out',
    endReason: 'signed_out',
    end: /UPDATE user_session SET ended_at/,
    arrange: async () => {
      const actorId = await createUser(owner);
      const session = await sessionFor(actorId);
      return { ends: session, asks: session, objectId: session.sessionId, route: signOutAction, input: {}, params: {}, actorId };
    },
  },
  {
    name: 'a device’s revocation',
    action: 'device_revoked',
    endReason: 'device_revoked',
    end: /UPDATE user_session SET ended_at/,
    arrange: async () => {
      const actorId = await createUser(owner);
      const session = await sessionFor(actorId);
      return { ends: session, asks: session, objectId: session.deviceId, route: revokeDeviceAction, input: { deviceId: session.deviceId }, params: {}, actorId };
    },
  },
  {
    name: 'End membership in the console',
    action: 'membership_ended',
    endReason: 'revoked',
    end: /revoke_user_sessions/,
    arrange: async () => {
      const internalId = await createOrganization(owner, 'internal');
      const actorId = await createUser(owner, { hardwareKeyRequired: true });
      await addMembership(owner, internalId, actorId, 'platform_admin');
      const leaving = await createUser(owner);
      const membershipId = await addMembership(owner, world.organizationId, leaving, 'analyst');
      return { ends: await sessionFor(leaving), asks: await sessionFor(actorId, 'webauthn'), objectId: membershipId, route: endMembership, input: { membershipId }, params: {}, actorId };
    },
  },
  {
    name: 'End membership in an organization’s settings',
    action: 'membership_ended',
    endReason: 'revoked',
    end: /revoke_user_sessions/,
    arrange: async () => {
      const leaving = await createUser(owner);
      const membershipId = await addMembership(owner, world.organizationId, leaving, 'analyst');
      return {
        ends: await sessionFor(leaving),
        asks: await sessionFor(world.adminUserId),
        objectId: membershipId,
        route: endMembershipAction,
        input: { membershipId, confirm: 'on' },
        params: { organizationId: world.organizationId },
        actorId: world.adminUserId,
      };
    },
  },
];

describe('a session a person ends: the route’s audit event is in the transaction that ends it', () => {
  for (const { name, action, endReason, end, arrange } of ROUTES) {
    it(`${name}: a failure at the event, at the end or at the commit leaves the session live with no event; the way through writes both, once`, async () => {
      const { ends, asks, objectId, route, input, params, actorId } = await arrange();

      fault = { kind: 'statement', match: AUDIT };
      expect(await run(faulty, route, asks.sessionToken, input, params)).not.toBe('ok');
      expect(faultsMet).toBe(1);
      expect(await standing(ends.sessionId)).toBe('live');
      expect(await events(action, objectId)).toEqual([]);

      fault = { kind: 'statement', match: end };
      expect(await run(faulty, route, asks.sessionToken, input, params)).not.toBe('ok');
      expect(faultsMet).toBe(2);
      expect(await standing(ends.sessionId)).toBe('live');
      expect(await events(action, objectId)).toEqual([]);

      fault = { kind: 'commit', within: end };
      expect(await run(faulty, route, asks.sessionToken, input, params)).not.toBe('ok');
      expect(faultsMet).toBe(3);
      expect(await standing(ends.sessionId)).toBe('live');
      expect(await events(action, objectId)).toEqual([]);

      fault = undefined;
      expect(await run(faulty, route, asks.sessionToken, input, params)).toBe('ok');
      expect(await standing(ends.sessionId)).toBe(endReason);
      expect(await events(action, objectId)).toEqual([{ actor_id: actorId, purpose: null }]);
      // The ended session's next request finds it ended already: no second event of any kind for its end.
      expect(await resolveSession(app, ends.sessionToken, 'test')).toEqual({ state: 'ended', reason: 'ended' });
      expect(await events('session_ended', ends.sessionId)).toEqual([]);
      expect(await events(action, objectId)).toHaveLength(1);
    });
  }
});
