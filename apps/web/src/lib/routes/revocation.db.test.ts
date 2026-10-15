import { randomBytes, randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import type { CookieJar } from '../http/route';
import { type Services, createServices } from '../server/services';
import { homePage } from './index';
import { practiceHome } from './practice';

/**
 * Grants through the routes (test matrix SEC-03, SEC-04; sessions.md "a session never caches the
 * practice set"): a firm user in the middle of a session loses the practice on the very next request
 * after the practice administrator revokes the grant, or once it expires, and the practice leaves
 * their switcher at the same moment.
 */

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let services: Services;
let world: TenantWorld;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 4);
  const sealer = new Sealer(randomBytes(32));
  services = createServices({
    origin: 'http://localhost:3100',
    pool: app,
    provider: new DevAuthProvider({
      store: new MemoryDevStore(),
      sealer: sealer.derive('dev-provider'),
      webauthn: { rpId: 'localhost', rpName: 'Test', origin: 'http://localhost:3100' },
      deliverInvitation: () => Promise.resolve(),
    }),
    keys: LocalKeyProvider.random(),
    sealer,
    logger: createLogger({ sink: () => undefined }),
  });
  world = await createTenantWorld(owner, 'revocation');
});

afterAll(async () => {
  await app.end();
  await owner.end();
  await database.drop();
});

const jar = (token: string): CookieJar => ({ get: (name) => (name === SESSION_COOKIE ? token : undefined), set: () => undefined, delete: () => undefined });

const request = (token: string) => ({ cookies: jar(token), params: { practiceId: world.practiceId }, requestId: `test-${randomUUID()}`, userAgent: null });

/** A firm principal with a grant from the practice's administrator, signed in. */
async function firmUser(endsIn: string): Promise<{ token: string; grantId: string }> {
  const firmId = await createOrganization(owner, 'firm', 'firm');
  const userId = await createUser(owner);
  await addMembership(owner, firmId, userId, 'firm_principal');
  const agreementId = randomUUID();
  const grantId = randomUUID();
  await asOwner(owner, [world.practiceId], async () => {
    await owner.query(
      `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
       VALUES ($1, $2, $3, 'engagement', '1', now(), 'SYNTHETIC SIGNER', 'esign:revocation', $4)`,
      [agreementId, firmId, world.practiceId, randomBytes(32).toString('hex')],
    );
    await owner.query(
      `INSERT INTO "grant" (id, organization_id, practice_id, scope, ends_at, approved_by_user_id, agreement_id)
       VALUES ($1, $2, $3, '{"roles":["firm_principal"]}', now() + $4::interval, $5, $6)`,
      [grantId, firmId, world.practiceId, endsIn, world.adminUserId, agreementId],
    );
  });
  const session = await openSession(app, { userId, method: 'totp', deviceToken: undefined, userAgent: null, requestId: 'test' });
  return { token: session.sessionToken, grantId };
}

describe('grants end within one request (SEC-03, SEC-04)', () => {
  it('denies the next request after the practice administrator revokes the grant', async () => {
    const { token, grantId } = await firmUser('30 days');
    expect(await practiceHome.invoke(request(token), services)).toMatchObject({ status: 'ok', data: { access: { via: 'grant', roles: ['firm_principal'] } } });
    await asOwner(owner, [world.practiceId], () => owner.query('UPDATE "grant" SET revoked_at = now(), revoked_by = $1 WHERE id = $2', [world.adminUserId, grantId]));
    expect(await practiceHome.invoke(request(token), services)).toEqual({ status: 'not_found' });
    expect(await homePage.invoke(request(token), services)).toMatchObject({ status: 'ok', shell: { practices: [] } });
  });

  it('denies the next request once the grant has expired', async () => {
    const { token } = await firmUser('2 seconds');
    expect((await practiceHome.invoke(request(token), services)).status).toBe('ok');
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(await practiceHome.invoke(request(token), services)).toEqual({ status: 'not_found' });
  });
});
