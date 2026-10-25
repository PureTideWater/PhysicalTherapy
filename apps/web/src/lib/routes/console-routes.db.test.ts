import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPracticeCipher, openPool, readDatabaseUrl, withActor, withJobScope, withPracticeScope } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, createMigratedDatabase, createOrganization, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { loadRelease } from '@tp/rules/loader';
import type { JobPayload, JobType } from '@tp/worker/jobs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession, resolveSession } from '../auth/sessions';
import { selfRoute } from '../http/invoke';
import type { CookieJar, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import {
  createOrganization as createOrganizationRoute,
  createPractice,
  createSupportGrant,
  endMembership,
  endSupportGrant,
  inviteMember,
  organizationPage,
  practiceSettingsPage,
  recordAgreement,
  setOrganizationStatus,
  setPracticeLocation,
  setPracticeSettings,
  supportPage,
  unlockUser,
} from './console';
import { consoleModelsPage, setModelFlag } from './console-models';
import { practiceHome, supportAccessPage } from './practice';
import { csrfTokenFor } from '../http/csrf';

/**
 * What the internal console and the practice workspace do, beyond who may use them (which
 * route-tests/define.ts covers for every route): a practice gets its own data key, an invitation
 * creates the provider's account and an invited user, a membership's end revokes the user's
 * sessions, the last administrator cannot leave, a support grant lasts four hours and its reads reach
 * the practice's administrators, and the database's refusals come back as outcomes. A practice is created with its
 * pricing location, its billing ZIP required, and the console sets the location on its own form (audit #33; PR 6b),
 * under SYNTHETIC release 900001 (00011 is known; 00012 needs its ZIP+4, and 900001 has no ZIP+4 list).
 */

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let services: Services;
let keys: LocalKeyProvider;
let provider: DevAuthProvider;
let invitations: string[];
let queue: SeenAtSend;

/**
 * The queue in memory, recording for each monitor job the ZIP another connection reads when the job is sent: a job
 * sent before the save commits would be planned by an idle worker against the old location.
 */
class SeenAtSend extends MemoryQueue {
  readonly zipsSeen: (string | null)[] = [];

  override async enqueue<T extends JobType>(type: T, payload: JobPayload<T>): Promise<string | null> {
    if (type === 'monitor') {
      const practiceId = (payload as { readonly practice_id: string }).practice_id;
      this.zipsSeen.push((await owner.query<{ zip: string }>('SELECT zip FROM practice_site WHERE practice_id = $1', [practiceId])).rows[0]?.zip ?? null);
    }
    return super.enqueue(type, payload);
  }
}

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
  queue = new SeenAtSend();
  services = createServices({ origin: 'http://localhost:3100', pool: app, provider, keys, sealer, logger: createLogger({ sink: () => undefined }), queue });
  await loadRelease(owner, path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic/rules/release-synth-900001'), { release: 900001, allowSyntheticFixtureForTests: true });
}, 120_000);

afterAll(async () => {
  await endPool(app);
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
    expect(await run(createPractice, admin.token, { organizationId, name: 'SYNTHETIC CONSOLE PRACTICE', npi: '', zip: '00011' })).toEqual({
      status: 'invalid',
      issues: [{ field: 'input', message: "invite the practice group's administrator before creating or moving its practice: a practice always has an administrator" }],
    });
    const invited = await run(inviteMember, admin.token, { organizationId, email: 'console-group-admin@synthetic.test', role: 'practice_admin' });
    expect(invited.status).toBe('ok');
    // The billing ZIP is required: a practice is never created without its pricing location.
    expect(await run(createPractice, admin.token, { organizationId, name: 'SYNTHETIC CONSOLE PRACTICE', npi: '' })).toMatchObject({ status: 'invalid', issues: [{ field: 'zip' }] });
    expect(await run(createPractice, admin.token, { organizationId, name: 'SYNTHETIC CONSOLE PRACTICE', npi: '', zip: '0001' })).toMatchObject({
      status: 'invalid',
      issues: [{ field: 'zip', message: 'five digits, or ZIP+4 such as 27601-1234' }],
    });
    const practice = await run(createPractice, admin.token, { organizationId, name: 'SYNTHETIC CONSOLE PRACTICE', npi: '', zip: '00011' });
    if (practice.status !== 'ok' || practice.data.objectId === undefined) {
      throw new Error(`expected a new practice, got ${practice.status}`);
    }
    const practiceId = practice.data.objectId;
    // The link names the practice alone: its location's status is read from the database (review of PR 6b-2, finding 14).
    expect(practice.data.redirect).toBe(`/console/organizations/${organizationId}?created=${practiceId}`);
    const { rows } = await owner.query<{ data_key_ref: string; npi: string | null; zip: string | null }>('SELECT data_key_ref, npi, zip FROM practice WHERE id = $1', [practiceId]);
    // practice.zip is deprecated and never written: the location is practice_site's.
    expect(rows[0]).toMatchObject({ npi: null, zip: null, data_key_ref: expect.stringMatching(/^local:v1:/) });
    expect((await owner.query('SELECT zip, zip_plus_four, updated_by FROM practice_site WHERE practice_id = $1', [practiceId])).rows).toEqual([{ zip: '00011', zip_plus_four: null, updated_by: admin.id }]);
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
    const page = await run(organizationPage, admin.token, undefined, { organizationId, created: practiceId });
    expect(page).toMatchObject({
      status: 'ok',
      data: {
        organization: { kind: 'group' },
        practices: [{ id: practiceId, name: 'SYNTHETIC CONSOLE PRACTICE' }],
        members: [{ email: 'console-group-admin@synthetic.test', role: 'practice_admin' }],
        agreements: [],
        grants: [],
        created: { practiceId, zip: '00011', zipPlusFour: null, status: 'ready', text: 'Medicare prices this location in locality 99999-01 under rule release 900001.' },
      },
    });
    // A status a hand-edited link names is not read; a practice not of the organization shows nothing.
    expect(await run(organizationPage, admin.token, undefined, { organizationId, created: practiceId, location: 'zip_unknown' })).toMatchObject({
      status: 'ok',
      data: { created: { practiceId, status: 'ready' } },
    });
    expect(await run(organizationPage, admin.token, undefined, { organizationId, created: world.practiceId })).toMatchObject({ status: 'ok', data: { created: null } });
  });

  it('accepts a ZIP that needs its ZIP+4, or one the release does not list, with its status, never refusing it (audit #33)', async () => {
    const created = await run(createOrganizationRoute, admin.token, { kind: 'group', name: 'SYNTHETIC SPLIT ZIP GROUP' });
    const organizationId = created.status === 'ok' ? (created.data.objectId ?? '') : '';
    expect((await run(inviteMember, admin.token, { organizationId, email: 'console-split-admin@synthetic.test', role: 'practice_admin' })).status).toBe('ok');
    const split = await run(createPractice, admin.token, { organizationId, name: 'SYNTHETIC SPLIT ZIP PRACTICE', zip: '00012' });
    if (split.status !== 'ok' || split.data.objectId === undefined) {
      throw new Error(`expected a new practice, got ${split.status}`);
    }
    expect(split.data.redirect).toBe(`/console/organizations/${organizationId}?created=${split.data.objectId}`);
    expect(await run(organizationPage, admin.token, undefined, { organizationId, created: split.data.objectId })).toMatchObject({
      status: 'ok',
      data: { created: { status: 'zip_plus_four_needed', text: 'Medicare splits ZIP 00012 between payment localities. Add its ZIP+4.' } },
    });
    const unknown = await run(createPractice, admin.token, { organizationId, name: 'SYNTHETIC UNLISTED ZIP PRACTICE', zip: '27601-1234' });
    const unknownId = unknown.status === 'ok' ? (unknown.data.objectId ?? '') : '';
    expect(await run(organizationPage, admin.token, undefined, { organizationId, created: unknownId })).toMatchObject({
      status: 'ok',
      data: { created: { zip: '27601', zipPlusFour: '1234', status: 'zip_unknown' } },
    });
    // A ZIP+4 given for a ZIP the release does not list is kept as given.
    expect((await owner.query('SELECT zip, zip_plus_four FROM practice_site WHERE practice_id = $1', [unknownId])).rows).toEqual([{ zip: '27601', zip_plus_four: '1234' }]);
  });

  it('refuses a practice owned by a firm, with the database’s rule as the reason', async () => {
    const firmId = await createOrganization(owner, 'firm', 'console firm');
    expect(await run(createPractice, admin.token, { organizationId: firmId, name: 'SYNTHETIC', zip: '00011' })).toEqual({
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
  it('sets a practice’s pricing and triage settings, keeping its other settings and its location, and audits it', async () => {
    const practice = await createTenantWorld(owner, 'settings');
    await owner.query(`UPDATE practice SET settings = '{"kept_elsewhere": true, "line_materiality_cents": "900"}'::jsonb WHERE id = $1`, [practice.practiceId]);
    await owner.query("UPDATE practice_site SET zip = '00012', zip_plus_four = '0001' WHERE practice_id = $1", [practice.practiceId]);
    const set = await run(setPracticeSettings, admin.token, {
      practiceId: practice.practiceId,
      // The form has no ZIP since PR 6b: one sent anyway is not a field it reads, and the location is left as it is.
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
    expect((await owner.query('SELECT zip, zip_plus_four FROM practice_site WHERE practice_id = $1', [practice.practiceId])).rows).toEqual([{ zip: '00012', zip_plus_four: '0001' }]);
    const { rows } = await owner.query('SELECT settings FROM practice WHERE id = $1', [practice.practiceId]);
    expect(rows).toEqual([
      {
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
        // The console reads the location whole, its ZIP+4 too, with its status now.
        location: { practiceId: practice.practiceId, zip: '00012', zipPlusFour: '0001', status: 'locality_not_loaded' },
        locationSaved: false,
        form: {
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
    expect((await run(setPracticeSettings, admin.token, { practiceId: practice.practiceId })).status).toBe('ok');
    expect((await owner.query('SELECT settings FROM practice WHERE id = $1', [practice.practiceId])).rows).toEqual([{ settings: { kept_elsewhere: true } }]);
  });

  it('refuses settings the engine or triage would refuse, naming the field', async () => {
    expect(await run(setPracticeSettings, admin.token, { practiceId: world.practiceId, facilityPlaces: '11', nonFacilityPlaces: '11' })).toEqual({
      status: 'invalid',
      issues: [{ field: 'facilityPlaces', message: 'place of service 11 is listed as both facility and non-facility' }],
    });
    expect(await run(setPracticeSettings, admin.token, { practiceId: world.practiceId, staffRatePerHour: '60.00' })).toMatchObject({ status: 'invalid', issues: [{ field: 'staffRatePerHour' }] });
    expect(await run(setPracticeSettings, admin.token, { practiceId: randomUUID() })).toEqual({ status: 'not_found' });
    expect(await run(practiceSettingsPage, admin.token, undefined, { practiceId: randomUUID() })).toEqual({ status: 'not_found' });
  });

  it('is the platform administrator’s alone, in the routes and in the database', async () => {
    const adminToken = await sessionFor(world.adminUserId, 'totp');
    expect(await run(setPracticeSettings, adminToken, { practiceId: world.practiceId })).toMatchObject({ status: 'forbidden' });
    expect(await run(setPracticeLocation, adminToken, { practiceId: world.practiceId, zip: '00011' })).toMatchObject({ status: 'forbidden' });
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

describe('the console’s location form (audit #33; PR 6b)', () => {
  it('sets the location whole, audits it, queues the monitoring chain by the request and shows its status', async () => {
    const practice = await createTenantWorld(owner, 'console location');
    const queued = queue.jobs.length;
    queue.zipsSeen.splice(0);
    const saved = await run(setPracticeLocation, admin.token, { practiceId: practice.practiceId, zip: '00012-0001' });
    // Sent once the save had committed: another connection already read the saved ZIP (the world's was 00011).
    expect(queue.zipsSeen).toEqual(['00012']);
    // The link says it was saved, never a status: the page reads the location's status from the database.
    expect(saved).toMatchObject({ status: 'ok', data: { objectId: practice.practiceId, redirect: `/console/practices/${practice.practiceId}?location=saved` } });
    expect((await owner.query('SELECT zip, zip_plus_four, updated_by FROM practice_site WHERE practice_id = $1', [practice.practiceId])).rows).toEqual([{ zip: '00012', zip_plus_four: '0001', updated_by: admin.id }]);
    const audit = await owner.query<{ object_id: string; request_id: string }>("SELECT object_id, request_id FROM audit_event WHERE actor_id = $1 AND action = 'console_pricing_location_set' AND object_type = 'practice'", [admin.id]);
    expect(audit.rows).toEqual([{ object_id: practice.practiceId, request_id: expect.stringMatching(/^test-/) }]);
    // The monitor of that practice, keyed by the save's own request, so a daily plan already queued never swallows it.
    expect(queue.jobs.slice(queued)).toEqual([{ type: 'monitor', payload: { practice_id: practice.practiceId, request_id: audit.rows[0]?.request_id } }]);
    // The page shows the stored ZIP and ZIP+4, and the status they have now (900001 has no ZIP+4 list: the content is
    // not loaded, never "check the four digits"), whatever the link says (review of PR 6b-2, finding 14).
    const stored = {
      practiceId: practice.practiceId,
      zip: '00012',
      zipPlusFour: '0001',
      status: 'locality_not_loaded',
      text: 'PaidWhole has not loaded Medicare’s ZIP+4 list for ZIP 00012 yet. There is nothing for you to change.',
    };
    expect(await run(practiceSettingsPage, admin.token, undefined, { practiceId: practice.practiceId, location: 'saved' })).toMatchObject({ status: 'ok', data: { location: stored, locationSaved: true } });
    expect(await run(practiceSettingsPage, admin.token, undefined, { practiceId: practice.practiceId })).toMatchObject({ status: 'ok', data: { location: stored, locationSaved: false } });
    expect(await run(practiceSettingsPage, admin.token, undefined, { practiceId: practice.practiceId, location: 'ready' })).toMatchObject({ status: 'ok', data: { location: stored, locationSaved: false } });
    // Saved whole each time: five digits alone clear the ZIP+4.
    expect(await run(setPracticeLocation, admin.token, { practiceId: practice.practiceId, zip: '00011' })).toMatchObject({ status: 'ok', data: { redirect: `/console/practices/${practice.practiceId}?location=saved` } });
    expect((await owner.query('SELECT zip, zip_plus_four FROM practice_site WHERE practice_id = $1', [practice.practiceId])).rows).toEqual([{ zip: '00011', zip_plus_four: null }]);
    expect(await run(practiceSettingsPage, admin.token, undefined, { practiceId: practice.practiceId, location: 'saved' })).toMatchObject({
      status: 'ok',
      data: { location: { zip: '00011', zipPlusFour: null, status: 'ready', text: 'Medicare prices this location in locality 99999-01 under rule release 900001.' }, locationSaved: true },
    });
    expect(await run(setPracticeLocation, admin.token, { practiceId: practice.practiceId, zip: '0001' })).toMatchObject({ status: 'invalid', issues: [{ field: 'zip' }] });
    expect(await run(setPracticeLocation, admin.token, { practiceId: randomUUID(), zip: '00011' })).toEqual({ status: 'not_found' });
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

describe('the model features’ console (docs/adr/0055; test matrix MOD-05, MOD-06)', () => {
  it('sets the kill switch, a budget and the letter reader through set_feature_flag, audited, and shows today’s spend against each budget', async () => {
    const before = await run(consoleModelsPage, admin.token);
    if (before.status !== 'ok') {
      throw new Error(`expected the page, got ${before.status}`);
    }
    expect(before.data.keys.map((key) => key.value)).toEqual(['model.kill_switch', 'model.daily_budget_cents', 'model.read_denial_letter']);
    expect(before.data.targets).toEqual(expect.arrayContaining([{ value: 'global', label: 'Everyone' }, { value: `practice:${world.practiceId}`, label: expect.stringMatching(/^Practice: /) }]));
    // A day's spend: two synthetic calls logged for the practice.
    await withPracticeScope(app, { actorId: world.adminUserId, practiceIds: [world.practiceId] }, async (scope) => {
      for (const [cents, cost] of [
        ['121', '120.250000'],
        ['31', '30.000001'],
      ]) {
        await scope.client.query(
          `INSERT INTO model_call (practice_id, actor_kind, actor_id, purpose, provider, model_id, prompt_version, idempotency_key, input_hashes, tokens_in, tokens_out, cost_cents, cost_unrounded, citations, outcome, error_code, attempts, latency_ms)
           VALUES ($1, 'user', app_actor_id(), 'suggestEvidenceRequests', 'local', 'local-synthetic', 'suggest-evidence-requests/1', $2, ARRAY[repeat('a', 64)], 1, 1, $3, $4, '[]', 'failed', 'rejected', 1, 1)`,
          [world.practiceId, randomBytes(32).toString('hex'), cents, cost],
        );
      }
    });
    expect((await run(setModelFlag, admin.token, { key: 'model.daily_budget_cents', target: `practice:${world.practiceId}`, value: '300' })).status).toBe('ok');
    expect((await run(setModelFlag, admin.token, { key: 'model.kill_switch', target: `organization:${world.organizationId}`, value: 'on' })).status).toBe('ok');
    const page = await run(consoleModelsPage, admin.token, undefined, { notice: 'set' });
    if (page.status !== 'ok') {
      throw new Error(`expected the page, got ${page.status}`);
    }
    expect(page.data.notice).toBe('set');
    expect(page.data.flags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'model.daily_budget_cents', scope: 'practice', scopeId: world.practiceId, value: '300' }),
        expect.objectContaining({ key: 'model.kill_switch', scope: 'organization', scopeId: world.organizationId, value: 'On' }),
      ]),
    );
    // 150.250001 cents spent: 151 shown, against 300, 50 per cent; switched off through the organization.
    expect(page.data.spend.find((row) => row.practiceId === world.practiceId)).toMatchObject({ calls: 2, spentCents: '151', budgetCents: '300', percent: 50, killSwitch: true });
    expect((await run(setModelFlag, admin.token, { key: 'model.kill_switch', target: `organization:${world.organizationId}`, value: 'off' })).status).toBe('ok');
    // Refused values name the field; nothing is set.
    expect(await run(setModelFlag, admin.token, { key: 'model.daily_budget_cents', target: 'global', value: '4.50' })).toEqual({ status: 'invalid', issues: [{ field: 'value', message: 'a budget in whole cents, such as 500 for $5.00' }] });
    expect(await run(setModelFlag, admin.token, { key: 'model.kill_switch', target: 'global', value: 'maybe' })).toEqual({ status: 'invalid', issues: [{ field: 'value', message: 'on or off' }] });
    const audited = await owner.query<{ action: string; n: number }>(
      "SELECT action, count(*)::int AS n FROM audit_event WHERE actor_id = $1 AND action IN ('model_flag_set', 'feature_flag_set') GROUP BY action ORDER BY action",
      [admin.id],
    );
    expect(audited.rows).toEqual([
      { action: 'feature_flag_set', n: 3 },
      { action: 'model_flag_set', n: 3 },
    ]);
    // Nobody without feature_flag.manage reads the spend, even by calling the function.
    await expect(withActor(app, world.adminUserId, (scope) => scope.client.query("SELECT * FROM console_model_spend('2026-10-17')"))).rejects.toMatchObject({ code: '42501' });
  });
});

describe('suspending and reinstating an organization (docs/adr/0055)', () => {
  it('refuses new runs for the organization’s practices by the run refusal path, keeps them readable, and lifts it at once; setting the same status changes nothing', async () => {
    const target = await createTenantWorld(owner, 'console suspension');
    const refusal = () => withJobScope(app, { jobId: randomUUID(), practiceId: target.practiceId }, async (scope) => (await scope.client.query<{ reason: string | null }>('SELECT practice_run_refusal($1) AS reason', [target.practiceId])).rows[0]?.reason);
    expect(await refusal()).toBeNull();
    expect((await run(setOrganizationStatus, admin.token, { organizationId: target.organizationId, status: 'suspended' })).status).toBe('ok');
    expect(await refusal()).toMatch(/^the organization is suspended: its data stays readable/);
    expect((await run(setOrganizationStatus, admin.token, { organizationId: target.organizationId, status: 'suspended' })).status).toBe('ok');
    expect((await run(setOrganizationStatus, admin.token, { organizationId: target.organizationId, status: 'active' })).status).toBe('ok');
    expect(await refusal()).toBeNull();
    const events = await owner.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_event WHERE action = 'organization_status_set' AND object_id = $1", [target.organizationId]);
    expect(events.rows[0]?.n).toBe(3);
    // The company's own organization, a closed one and one that does not exist are refused.
    expect((await run(setOrganizationStatus, admin.token, { organizationId: admin.internalId, status: 'suspended' })).status).toBe('not_found');
    expect((await run(setOrganizationStatus, admin.token, { organizationId: randomUUID(), status: 'suspended' })).status).toBe('not_found');
    await owner.query("UPDATE organization SET status = 'closed' WHERE id = $1", [target.organizationId]);
    expect((await run(setOrganizationStatus, admin.token, { organizationId: target.organizationId, status: 'active' })).status).toBe('invalid');
    // A customer may not.
    const customer = await sessionFor(target.adminUserId, 'totp');
    expect((await run(setOrganizationStatus, customer, { organizationId: target.organizationId, status: 'active' })).status).not.toBe('ok');
  });
});
