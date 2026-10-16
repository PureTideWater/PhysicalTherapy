import { randomBytes, randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPracticeCipher, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, createMigratedDatabase, createOrganization, createTenantWorld, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession, resolveSession } from '../auth/sessions';
import { selfRoute } from '../http/invoke';
import type { CookieJar, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import { createOrganization as createOrganizationRoute, createPractice, createSupportGrant, endMembership, endSupportGrant, inviteMember, organizationPage, practiceSettingsPage, recordAgreement, setPracticeSettings, supportPage, unlockUser } from './console';
import { practiceHome, supportAccessPage } from './practice';
import { csrfTokenFor } from '../http/csrf';

/**
 * What the internal console and the practice workspace do, beyond who may use them (which
 * route-tests.db.test.ts covers for every route): a practice gets its own data key, an invitation
 * creates the provider's account and an invited user, a membership's end revokes the user's
 * sessions, the last administrator cannot leave, a support grant lasts four hours and its reads reach
 * the practice's administrators, and the database's refusals come back as outcomes.
 */

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let services: Services;
let keys: LocalKeyProvider;
let provider: DevAuthProvider;
let invitations: string[];

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 4);
  keys = LocalKeyProvider.random();
  invitations = [];
  const sealer = new Sealer(randomBytes(32));
  provider = new DevAuthProvider({
    store: new MemoryDevStore(),
    sealer: sealer.derive('dev-provider'),
    webauthn: { rpId: 'localhost', rpName: 'Test', origin: 'http://localhost:3100' },
    deliverInvitation: (email) => {
      invitations.push(email);
      return Promise.resolve();
    },
    scryptCost: { n: 1024, r: 8, p: 1 },
  });
  services = createServices({ origin: 'http://localhost:3100', pool: app, provider, keys, sealer, logger: createLogger({ sink: () => undefined }) });
});

afterAll(async () => {
  await app.end();
  await owner.end();
  await database.drop();
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

async function sessionFor(userId: string, method: 'totp' | 'webauthn'): Promise<string> {
  return (await openSession(app, { userId, method, deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
}

async function platformAdmin(): Promise<{ id: string; token: string; internalId: string }> {
  const internalId = await createOrganization(owner, 'internal');
  const id = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internalId, id, 'platform_admin');
  return { id, token: await sessionFor(id, 'webauthn'), internalId };
}

function run<R>(route: Route<R>, token: string, input?: Record<string, unknown>, params: Record<string, unknown> = {}) {
  return route.invoke({ cookies: new Jar(token), params, input: route.mutation ? { csrfToken: csrfTokenFor(services.sealer, token), requestKey: randomUUID(), ...input } : input, requestId: `test-${randomUUID()}`, userAgent: null }, services);
}

let admin: { id: string; token: string; internalId: string };
let world: TenantWorld;

beforeAll(async () => {
  admin = await platformAdmin();
  world = await createTenantWorld(owner, 'console');
});

describe('organizations and practices', () => {
  it('creates a practice group, then a practice with its own data key', async () => {
    const created = await run(createOrganizationRoute, admin.token, { kind: 'group', name: 'SYNTHETIC CONSOLE GROUP' });
    if (created.status !== 'ok' || created.data.objectId === undefined) {
      throw new Error(`expected a new organization, got ${created.status}`);
    }
    const organizationId = created.data.objectId;
    expect(created.data.redirect).toBe(`/console/organizations/${organizationId}`);
    // A practice always has an administrator (PRD 3): until the group's is invited, there is no practice.
    expect(await run(createPractice, admin.token, { organizationId, name: 'SYNTHETIC CONSOLE PRACTICE', npi: '', zip: '27601' })).toEqual({
      status: 'invalid',
      issues: [{ field: 'input', message: "invite the practice group's administrator before creating or moving its practice: a practice always has an administrator" }],
    });
    const invited = await run(inviteMember, admin.token, { organizationId, email: 'console-group-admin@synthetic.test', role: 'practice_admin' });
    expect(invited.status).toBe('ok');
    const practice = await run(createPractice, admin.token, { organizationId, name: 'SYNTHETIC CONSOLE PRACTICE', npi: '', zip: '27601' });
    if (practice.status !== 'ok' || practice.data.objectId === undefined) {
      throw new Error(`expected a new practice, got ${practice.status}`);
    }
    const practiceId = practice.data.objectId;
    const { rows } = await owner.query<{ data_key_ref: string; npi: string | null; zip: string }>('SELECT data_key_ref, npi, zip FROM practice WHERE id = $1', [practiceId]);
    expect(rows[0]).toMatchObject({ npi: null, zip: '27601', data_key_ref: expect.stringMatching(/^local:v1:/) });
    // The wrapped key opens with the key provider, for this practice only.
    await expect(openPracticeCipher(keys, practiceId, rows[0]?.data_key_ref ?? null)).resolves.toBeDefined();
    await expect(openPracticeCipher(keys, randomUUID(), rows[0]?.data_key_ref ?? null)).rejects.toThrow();
    const audit = await owner.query("SELECT action, object_type, purpose, object_id, practice_id FROM audit_event WHERE actor_id = $1 AND action <> 'sign_in' ORDER BY at, action", [admin.id]);
    const membershipId = invited.status === 'ok' ? invited.data.objectId : undefined;
    expect(audit.rows).toEqual([
      { action: 'organization_created', object_type: 'organization', purpose: null, object_id: organizationId, practice_id: null },
      { action: 'membership_created', object_type: 'membership', purpose: null, object_id: membershipId, practice_id: null },
      // An administrator role given is a role escalation, recorded by the database for the weekly review.
      { action: 'security_event', object_type: 'membership', purpose: 'role_escalation', object_id: membershipId, practice_id: null },
      { action: 'practice_created', object_type: 'practice', purpose: null, object_id: practiceId, practice_id: null },
    ]);
    const page = await run(organizationPage, admin.token, undefined, { organizationId });
    expect(page).toMatchObject({
      status: 'ok',
      data: { organization: { kind: 'group' }, practices: [{ id: practiceId, name: 'SYNTHETIC CONSOLE PRACTICE' }], members: [{ email: 'console-group-admin@synthetic.test', role: 'practice_admin' }], agreements: [], grants: [] },
    });
  });

  it('refuses a practice owned by a firm, with the database’s rule as the reason', async () => {
    const firmId = await createOrganization(owner, 'firm', 'console firm');
    expect(await run(createPractice, admin.token, { organizationId: firmId, name: 'SYNTHETIC' })).toEqual({
      status: 'invalid',
      issues: [{ field: 'input', message: 'a practice is owned by a practice group' }],
    });
  });

  it('answers an unknown organization as not found', async () => {
    expect(await run(organizationPage, admin.token, undefined, { organizationId: randomUUID() })).toEqual({ status: 'not_found' });
    expect(await run(inviteMember, admin.token, { organizationId: randomUUID(), email: 'x@synthetic.test', role: 'viewer' })).toEqual({ status: 'not_found' });
  });
});

describe('members', () => {
  it('invites a member: the provider’s account, an invited user without MFA, and the membership; once', async () => {
    const email = `invited-${randomUUID()}@synthetic.test`;
    const invited = await run(inviteMember, admin.token, { organizationId: world.organizationId, email: email.toUpperCase(), role: 'billing_manager' });
    expect(invited.status).toBe('ok');
    expect(invitations).toContain(email);
    const { rows } = await owner.query('SELECT status, mfa_enrolled, hardware_key_required FROM "user" WHERE email = $1', [email]);
    expect(rows).toEqual([{ status: 'invited', mfa_enrolled: false, hardware_key_required: false }]);
    expect(await run(inviteMember, admin.token, { organizationId: world.organizationId, email, role: 'viewer' })).toEqual({
      status: 'invalid',
      issues: [{ field: 'email', message: 'already a member of this organization' }],
    });
    expect(await run(inviteMember, admin.token, { organizationId: world.organizationId, email, role: 'support' })).toMatchObject({ status: 'invalid', issues: [{ field: 'role' }] });
  });

  it('marks an internal member as needing a hardware key', async () => {
    const email = `staff-${randomUUID()}@synthetic.test`;
    expect((await run(inviteMember, admin.token, { organizationId: admin.internalId, email, role: 'support' })).status).toBe('ok');
    expect((await owner.query('SELECT hardware_key_required FROM "user" WHERE email = $1', [email])).rows).toEqual([{ hardware_key_required: true }]);
  });

  it('never adds the platform administrator, or any internal user, to a customer organization, nor a customer to the internal one (PRD 3)', async () => {
    const emailOf = async (userId: string) => (await owner.query<{ email: string }>('SELECT email FROM "user" WHERE id = $1', [userId])).rows[0]?.email ?? '';
    const firmId = await createOrganization(owner, 'firm', 'invite firm');
    const before = invitations.length;
    for (const organizationId of [world.organizationId, firmId]) {
      const role = organizationId === firmId ? 'firm_principal' : 'practice_admin';
      expect(await run(inviteMember, admin.token, { organizationId, email: await emailOf(admin.id), role })).toEqual({
        status: 'invalid',
        issues: [{ field: 'email', message: 'you cannot add yourself to an organization' }],
      });
      for (const internalRole of ['support', 'contract_specialist', 'reviewer', 'platform_admin'] as const) {
        const staff = await createUser(owner, { hardwareKeyRequired: true });
        await addMembership(owner, admin.internalId, staff, internalRole);
        expect(await run(inviteMember, admin.token, { organizationId, email: await emailOf(staff), role })).toEqual({
          status: 'invalid',
          issues: [{ field: 'email', message: 'an internal user cannot join a practice group or a firm; support access is a support grant' }],
        });
      }
    }
    expect(await run(inviteMember, admin.token, { organizationId: admin.internalId, email: await emailOf(world.adminUserId), role: 'support' })).toEqual({
      status: 'invalid',
      issues: [{ field: 'email', message: 'a member of a practice group or a firm cannot hold an internal role' }],
    });
    // Refused before the identity provider was asked for anything.
    expect(invitations).toHaveLength(before);
    // The practice stays out of the platform administrator's reach.
    expect(await run(practiceHome, admin.token, undefined, { practiceId: world.practiceId })).toEqual({ status: 'not_found' });
  });

  it('refuses an email that belongs to another identity', async () => {
    const userId = await createUser(owner);
    const { rows } = await owner.query<{ email: string }>('SELECT email FROM "user" WHERE id = $1', [userId]);
    expect(await run(inviteMember, admin.token, { organizationId: world.organizationId, email: rows[0]?.email ?? '', role: 'viewer' })).toMatchObject({
      status: 'invalid',
      issues: [{ field: 'email', message: expect.stringContaining('another identity') }],
    });
  });

  it('ends a membership: the user’s sessions end at once and the provider signs them out', async () => {
    const userId = await createUser(owner);
    const membershipId = await addMembership(owner, world.organizationId, userId, 'analyst');
    const token = await sessionFor(userId, 'totp');
    expect((await resolveSession(app, token, 'test')).state).toBe('active');
    const signOut = vi.spyOn(provider, 'globalSignOut');
    expect(await run(endMembership, admin.token, { membershipId })).toMatchObject({ status: 'ok', data: { redirect: `/console/organizations/${world.organizationId}` } });
    expect(signOut).toHaveBeenCalledWith(`synthetic-${userId}`);
    signOut.mockRestore();
    expect(await resolveSession(app, token, 'test')).toEqual({ state: 'ended', reason: 'ended' });
    expect(await run(endMembership, admin.token, { membershipId })).toEqual({ status: 'not_found' });
  });

  it('refuses ending the last practice administrator’s membership', async () => {
    const lone = await createTenantWorld(owner, 'lone');
    const { rows } = await owner.query<{ id: string }>('SELECT id FROM membership WHERE organization_id = $1', [lone.organizationId]);
    expect(await run(endMembership, admin.token, { membershipId: rows[0]?.id })).toEqual({
      status: 'invalid',
      issues: [{ field: 'input', message: 'a practice must always keep at least one practice administrator' }],
    });
  });

  it('unlocks a locked account, and says when there was nothing to unlock', async () => {
    const userId = await createUser(owner);
    await owner.query('UPDATE "user" SET failed_sign_ins = 10, locked_at = now() WHERE id = $1', [userId]);
    expect((await run(unlockUser, admin.token, { organizationId: world.organizationId, userId })).status).toBe('ok');
    expect((await owner.query('SELECT failed_sign_ins, locked_at FROM "user" WHERE id = $1', [userId])).rows).toEqual([{ failed_sign_ins: 0, locked_at: null }]);
    expect(await run(unlockUser, admin.token, { organizationId: world.organizationId, userId })).toEqual({ status: 'not_found' });
  });
});

describe('agreements', () => {
  it('records an agreement by reference and SHA-256 with version, signer and date', async () => {
    const recorded = await run(recordAgreement, admin.token, {
      organizationId: world.organizationId,
      practiceId: world.practiceId,
      kind: 'engagement',
      version: '2',
      signer: 'SYNTHETIC SIGNER',
      signedOn: '2026-10-01',
      documentRef: 'esign:synthetic-envelope-2',
      sha256: 'B'.repeat(64),
    });
    if (recorded.status !== 'ok') {
      throw new Error(`expected an agreement, got ${recorded.status}`);
    }
    const { rows } = await owner.query('SELECT kind, version, signer, signed_at, document_ref, sha256 FROM agreement WHERE id = $1', [recorded.data.objectId]);
    expect(rows).toEqual([{ kind: 'engagement', version: '2', signer: 'SYNTHETIC SIGNER', signed_at: new Date('2026-10-01T00:00:00Z'), document_ref: 'esign:synthetic-envelope-2', sha256: 'b'.repeat(64) }]);
    expect(await run(recordAgreement, admin.token, { organizationId: world.organizationId, kind: 'baa', version: '1', signer: 'S', signedOn: 'yesterday', documentRef: 'x y', sha256: 'short' })).toMatchObject({
      status: 'invalid',
      issues: expect.arrayContaining([expect.objectContaining({ field: 'signedOn' }), expect.objectContaining({ field: 'documentRef' }), expect.objectContaining({ field: 'sha256' })]),
    });
  });
});

describe('practice settings (PRD 5, J8; PRD 11, Inputs; PRD 12)', () => {
  it('sets a practice’s billing ZIP and its pricing and triage settings, keeping its other settings, and audits it', async () => {
    const practice = await createTenantWorld(owner, 'settings');
    await owner.query(`UPDATE practice SET settings = '{"kept_elsewhere": true, "line_materiality_cents": "900"}'::jsonb WHERE id = $1`, [practice.practiceId]);
    const set = await run(setPracticeSettings, admin.token, {
      practiceId: practice.practiceId,
      zip: '00011',
      facilityPlaces: '22, 21',
      nonFacilityPlaces: '11',
      defaultRounding: 'HALF_UP_CENT',
      lineMateriality: '5.00',
      caseMateriality: '250.00',
      anomalyMinimumCohort: '',
      anomalyThreshold: '',
      staffRatePerHour: '60.00',
      minutesPerPacket: '45',
      minutesPerFollowUp: '15',
    });
    expect(set).toMatchObject({ status: 'ok', data: { objectId: practice.practiceId, redirect: `/console/practices/${practice.practiceId}?saved=1` } });
    const { rows } = await owner.query('SELECT zip, settings FROM practice WHERE id = $1', [practice.practiceId]);
    expect(rows).toEqual([
      {
        zip: '00011',
        settings: {
          kept_elsewhere: true,
          place_of_service_settings: { '11': 'non_facility', '21': 'facility', '22': 'facility' },
          default_rounding: 'HALF_UP_CENT',
          line_materiality_cents: '500',
          case_materiality_cents: '25000',
          staff_rate_cents_per_hour: '6000',
          minutes_per_packet: 45,
          minutes_per_follow_up: 15,
        },
      },
    ]);
    const audit = await owner.query("SELECT object_type, object_id, practice_id FROM audit_event WHERE actor_id = $1 AND action = 'practice_settings_set'", [admin.id]);
    expect(audit.rows).toEqual([{ object_type: 'practice', object_id: practice.practiceId, practice_id: null }]);
    expect(await run(practiceSettingsPage, admin.token, undefined, { practiceId: practice.practiceId, saved: '1' })).toMatchObject({
      status: 'ok',
      data: {
        practice: { id: practice.practiceId, organizationId: practice.organizationId, name: expect.any(String) },
        form: {
          zip: '00011',
          facilityPlaces: '21, 22',
          nonFacilityPlaces: '11',
          defaultRounding: 'HALF_UP_CENT',
          lineMateriality: '5.00',
          caseMateriality: '250.00',
          anomalyMinimumCohort: '',
          anomalyThreshold: '',
          staffRatePerHour: '60.00',
          minutesPerPacket: '45',
          minutesPerFollowUp: '15',
        },
        saved: true,
      },
    });
    // A field left blank returns to its default.
    expect((await run(setPracticeSettings, admin.token, { practiceId: practice.practiceId, zip: '00011' })).status).toBe('ok');
    expect((await owner.query('SELECT settings FROM practice WHERE id = $1', [practice.practiceId])).rows).toEqual([{ settings: { kept_elsewhere: true } }]);
  });

  it('refuses settings the engine or triage would refuse, naming the field', async () => {
    expect(await run(setPracticeSettings, admin.token, { practiceId: world.practiceId, facilityPlaces: '11', nonFacilityPlaces: '11' })).toEqual({
      status: 'invalid',
      issues: [{ field: 'facilityPlaces', message: 'place of service 11 is listed as both facility and non-facility' }],
    });
    expect(await run(setPracticeSettings, admin.token, { practiceId: world.practiceId, staffRatePerHour: '60.00' })).toMatchObject({ status: 'invalid', issues: [{ field: 'staffRatePerHour' }] });
    expect(await run(setPracticeSettings, admin.token, { practiceId: world.practiceId, zip: '2760' })).toMatchObject({ status: 'invalid', issues: [{ field: 'zip' }] });
    expect(await run(setPracticeSettings, admin.token, { practiceId: randomUUID(), zip: '27601' })).toEqual({ status: 'not_found' });
    expect(await run(practiceSettingsPage, admin.token, undefined, { practiceId: randomUUID() })).toEqual({ status: 'not_found' });
  });

  it('is the platform administrator’s alone, in the routes and in the database', async () => {
    const adminToken = await sessionFor(world.adminUserId, 'totp');
    expect(await run(setPracticeSettings, adminToken, { practiceId: world.practiceId, zip: '00011' })).toMatchObject({ status: 'forbidden' });
    expect(await run(practiceSettingsPage, adminToken, undefined, { practiceId: world.practiceId })).toMatchObject({ status: 'forbidden' });
    // The practice's own administrator, as the application, cannot reach the functions either.
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [world.adminUserId, `{${world.practiceId}}`]);
      await expect(client.query("SELECT console_set_practice_settings($1, '00011', '{}'::jsonb)", [world.practiceId])).rejects.toMatchObject({ code: '42501' });
      await client.query('ROLLBACK');
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [world.adminUserId, `{${world.practiceId}}`]);
      expect((await client.query('SELECT * FROM console_practice_settings($1)', [world.practiceId])).rows).toEqual([]);
      await client.query('ROLLBACK');
      // And the platform administrator's function sets only the pricing and triage settings.
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [admin.id]);
      await expect(client.query(`SELECT console_set_practice_settings($1, '00011', '{"data_key_ref": "x"}'::jsonb)`, [world.practiceId])).rejects.toMatchObject({ code: '23514' });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});

describe('support grants (PRD 5, J15)', () => {
  it('opens a four-hour grant for a support engineer; the practice’s administrators see it and every record read under it', async () => {
    const engineer = await createUser(owner, { hardwareKeyRequired: true });
    await addMembership(owner, admin.internalId, engineer, 'support');
    expect(await run(createSupportGrant, admin.token, { practiceId: world.practiceId, userId: world.adminUserId, ticket: 'SYN-7', reason: 'SYNTHETIC' })).toMatchObject({
      status: 'invalid',
      issues: [{ field: 'userId' }],
    });
    expect(await run(createSupportGrant, admin.token, { practiceId: randomUUID(), userId: engineer, ticket: 'SYN-7', reason: 'SYNTHETIC' })).toMatchObject({ status: 'invalid', issues: [{ field: 'practiceId' }] });
    const created = await run(createSupportGrant, admin.token, { practiceId: world.practiceId, userId: engineer, ticket: 'SYN-7', reason: 'SYNTHETIC SUPPORT REASON' });
    if (created.status !== 'ok' || created.data.objectId === undefined) {
      throw new Error(`expected a support grant, got ${created.status}`);
    }
    const grantId = created.data.objectId;
    const { rows } = await owner.query<{ hours: string }>('SELECT extract(epoch FROM expires_at - created_at)::bigint::text AS hours FROM support_grant WHERE id = $1', [grantId]);
    expect(rows).toEqual([{ hours: String(4 * 3600) }]);

    // The engineer reads the practice under the grant; the read is audited against it.
    const engineerToken = await sessionFor(engineer, 'webauthn');
    expect(await run(practiceHome, engineerToken, undefined, { practiceId: world.practiceId })).toMatchObject({ status: 'ok', data: { access: { via: 'support', roles: ['support'] }, supportGrants: null } });
    const console = await run(supportPage, admin.token);
    expect(console).toMatchObject({ status: 'ok', data: { grants: expect.arrayContaining([expect.objectContaining({ id: grantId, ticket: 'SYN-7', reads: 1, open: true })]) } });

    // The practice's administrator sees the grant and the list of records read.
    const adminToken = await sessionFor(world.adminUserId, 'totp');
    expect(await run(practiceHome, adminToken, undefined, { practiceId: world.practiceId })).toMatchObject({ status: 'ok', data: { supportGrants: [expect.objectContaining({ id: grantId, open: true })] } });
    expect(await run(supportAccessPage, adminToken, undefined, { practiceId: world.practiceId, supportGrantId: grantId })).toMatchObject({
      status: 'ok',
      data: { grant: { id: grantId, ticket: 'SYN-7' }, reads: [{ objectType: 'practice', objectId: world.practiceId, purpose: 'workspace' }] },
    });
    expect(await run(supportAccessPage, adminToken, undefined, { practiceId: world.practiceId, supportGrantId: randomUUID() })).toEqual({ status: 'not_found' });
    // The engineer cannot read the practice's access log.
    expect(await run(supportAccessPage, engineerToken, undefined, { practiceId: world.practiceId, supportGrantId: grantId })).toMatchObject({ status: 'forbidden' });
  });

  it('ends an open grant at once when its ticket closes: the engineer loses the practice on the next request', async () => {
    const engineer = await createUser(owner, { hardwareKeyRequired: true });
    await addMembership(owner, admin.internalId, engineer, 'support');
    const created = await run(createSupportGrant, admin.token, { practiceId: world.practiceId, userId: engineer, ticket: 'SYN-8', reason: 'SYNTHETIC SUPPORT REASON' });
    if (created.status !== 'ok' || created.data.objectId === undefined) {
      throw new Error(`expected a support grant, got ${created.status}`);
    }
    const supportGrantId = created.data.objectId;
    const engineerToken = await sessionFor(engineer, 'webauthn');
    expect((await run(practiceHome, engineerToken, undefined, { practiceId: world.practiceId })).status).toBe('ok');
    expect(await run(endSupportGrant, admin.token, { supportGrantId })).toMatchObject({ status: 'ok', data: { redirect: '/console/support' } });
    expect(await run(practiceHome, engineerToken, undefined, { practiceId: world.practiceId })).toEqual({ status: 'not_found' });
    expect(await run(endSupportGrant, admin.token, { supportGrantId })).toEqual({ status: 'not_found' });
    const events = await owner.query<{ action: string; purpose: string | null }>("SELECT action, purpose FROM audit_event WHERE object_id = $1 AND action IN ('security_event', 'support_grant_ended') ORDER BY at, action", [supportGrantId]);
    expect(events.rows).toEqual([
      { action: 'security_event', purpose: 'support_grant_opened' },
      { action: 'security_event', purpose: 'grant_change' },
      { action: 'support_grant_ended', purpose: null },
    ]);
    expect(await run(supportPage, admin.token)).toMatchObject({ status: 'ok', data: { grants: expect.arrayContaining([expect.objectContaining({ id: supportGrantId, open: false })]) } });
  });

  it('lets the platform administrator read no practice data at all', async () => {
    expect(await run(practiceHome, admin.token, undefined, { practiceId: world.practiceId })).toEqual({ status: 'not_found' });
  });
});

describe('the database’s own refusals', () => {
  it('come back as forbidden when a policy or privilege refuses what a handler tried', async () => {
    const userId = await createUser(owner);
    const token = await sessionFor(userId, 'totp');
    const route = selfRoute({
      id: 'test.refused',
      kind: 'page',
      path: '/test',
      phi: false,
      params: z.object({}),
      handle: async ({ scope }) => {
        await scope.client.query("INSERT INTO role_permission (role, action, effect) VALUES ('viewer', 'phi.export', 'allow')");
        return {};
      },
    });
    expect(await run(route, token)).toEqual({ status: 'forbidden', permission: 'practice.open', message: 'the database refused this action for your role', roles: [] });
  });

  it('pass other server errors through', async () => {
    const userId = await createUser(owner);
    const token = await sessionFor(userId, 'totp');
    const route = selfRoute({ id: 'test.error', kind: 'page', path: '/test', phi: false, params: z.object({}), handle: () => Promise.reject(new Error('handler failed')) });
    await expect(run(route, token)).rejects.toThrow('handler failed');
  });

  it('give a refused page the shell, so the permission state renders inside it', async () => {
    const viewer = await createUser(owner);
    await addMembership(owner, world.organizationId, viewer, 'viewer');
    const token = await sessionFor(viewer, 'totp');
    const outcome = await run(supportAccessPage, token, undefined, { practiceId: world.practiceId, supportGrantId: randomUUID() });
    expect(outcome).toMatchObject({ status: 'forbidden', roles: ['viewer'], shell: { practices: [{ practiceId: world.practiceId }], currentPracticeId: world.practiceId } });
  });
});
