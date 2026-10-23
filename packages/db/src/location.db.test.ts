import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { RULE_RECORD_TYPES } from '@tp/rules';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withActor, withJobScope, withPracticeScope } from './authz';
import { readDatabaseUrl } from './config';
import { APP_ROLE, BILLING_ROLE, ESIGN_ROLE, OPERATOR_ROLE, SCREENING_ROLE } from './roles';
import type { MembershipRole } from './schema';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createPracticeWithLocation, createTenantWorld, createUser, endPool } from './testing';

/**
 * The practice's pricing location and the place-of-service split pinned on each run (migration
 * 20261105090000_pricing_location_and_zip_plus_four.sql; audit #33 and #16's minimal record; ADR 0064; test matrix
 * PRC-21, PRC-23 and PRC-24): rule_record's closed list of record types; every status of locality_status() under the
 * SYNTHETIC releases 900001 and 900006 as committed; the practice's status under the caller's row-level security; who
 * may set the location (pricing_settings.set, the founder's answer to PR 6b's Q5 (a)) and what the setters refuse with
 * the handler bypassed; who may confirm it, recorded on the location for every role that opens the practice, only
 * while nothing is left to change, a save that changes nothing, and a deleted practice (the review of 2026-10-22,
 * findings 1, 2, 8, 9 and 11); a confirmation taken only of the ZIP and ZIP+4 the person was shown, refused from a page
 * read before a change and after waiting on the console's change, on two connections (practice_site_changed; the
 * verification of PR 6b-2, finding 1); the record's rules and a practice that cannot be created without one; the run
 * guard and the split pin as the application role, a person's request and the worker's job alike, and the split's read;
 * and every function's privileges by its exact name. Synthetic data only.
 */

const RULES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic/rules');
/** The record types the location and the content spans read. */
const LOADED_TYPES = ['locality_map', 'locality_map_plus_four', 'mppr_rate', 'ncci_mue'] as const;
/** The closed list of statuses (LOCATION_STATUSES in packages/contracts/src/location.ts holds the same, with its words). */
const STATUSES = ['ready', 'no_release', 'zip_missing', 'zip_unknown', 'locality_not_loaded', 'zip_plus_four_needed', 'zip_plus_four_unknown'];
const SPLIT = { '11': 'non_facility', '21': 'facility', '22': 'facility' };
const LATER_SPLIT = { '11': 'non_facility', '12': 'non_facility', '22': 'facility' };

interface FixtureRecord {
  readonly record_type: string;
  readonly key: object;
  readonly value: object;
  readonly effective_from: string;
  readonly effective_to: string | null;
}

let database: MigratedDatabase;
let owner: pg.Client;
let app: pg.Pool;
let worker: pg.Pool;
let world: TenantWorld;
let other: TenantWorld;
let platformAdmin: string;
let specialist: string;

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** A committed SYNTHETIC release's records of the loaded types, from every file that holds an array of records (a second pass repeats the first). */
function releaseRecords(release: number): FixtureRecord[] {
  const root = path.join(RULES, `release-synth-${String(release)}`);
  const records: FixtureRecord[] = [];
  for (const type of LOADED_TYPES) {
    if (!existsSync(path.join(root, type))) {
      continue;
    }
    for (const year of readdirSync(path.join(root, type))) {
      for (const file of readdirSync(path.join(root, type, year))) {
        const parsed = JSON.parse(readFileSync(path.join(root, type, year, file), 'utf8')) as unknown;
        if (Array.isArray(parsed)) {
          records.push(...(parsed as FixtureRecord[]));
        }
      }
    }
  }
  return records;
}

/** Loads and publishes a committed SYNTHETIC release's location and content records, as the owner's loader would. */
async function loadRelease(release: number): Promise<void> {
  const records = releaseRecords(release);
  await owner.query('BEGIN');
  try {
    await owner.query('INSERT INTO rule_release (release_no, manifest_sha256) VALUES ($1, $2)', [release, sha(`release ${String(release)}`)]);
    for (const record of records) {
      await owner.query(
        `INSERT INTO rule_record (release_no, record_type, key, value, effective_from, effective_to, source, verification, sha256)
         VALUES ($1, $2, $3, $4, $5, $6, '{"synthetic":true}', 'L1', $7)`,
        [release, record.record_type, JSON.stringify(record.key), JSON.stringify(record.value), record.effective_from, record.effective_to, sha(JSON.stringify(record))],
      );
    }
    await owner.query('UPDATE rule_release SET published_at = now() WHERE release_no = $1', [release]);
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }
}

async function memberOf(organizationId: string, role: MembershipRole): Promise<string> {
  const person = await createUser(owner);
  await addMembership(owner, organizationId, person, role);
  return person;
}

async function internalUser(role: 'platform_admin' | 'contract_specialist' | 'reviewer' | 'support'): Promise<string> {
  const internal = await createOrganization(owner, 'internal');
  const person = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, person, role);
  return person;
}

/** A firm with a grant in force to the world's practice, admitting `roles`. */
async function firmGrant(practice: TenantWorld, roles: readonly MembershipRole[]): Promise<string> {
  const firmId = await createOrganization(owner, 'firm', 'location firm');
  const agreementId = randomUUID();
  await asOwner(owner, [practice.practiceId], async () => {
    await owner.query(
      `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
       VALUES ($1, $2, $3, 'engagement', '1', now(), 'SYNTHETIC SIGNER', 'agreements/engagement', $4)`,
      [agreementId, firmId, practice.practiceId, randomBytes(32).toString('hex')],
    );
    await owner.query(
      `INSERT INTO "grant" (organization_id, practice_id, scope, ends_at, approved_by_user_id, agreement_id) VALUES ($1, $2, $3, now() + interval '30 days', $4, $5)`,
      [firmId, practice.practiceId, JSON.stringify({ roles }), practice.adminUserId, agreementId],
    );
  });
  return firmId;
}

/** A practice as one created before migration 20261105090000 with no ZIP (dev and staging only): no location, its triggers off for the insert. */
async function legacyPracticeWithoutLocation(organizationId: string): Promise<string> {
  const id = randomUUID();
  await owner.query('BEGIN');
  try {
    await owner.query('SET LOCAL session_replication_role = replica');
    await owner.query("INSERT INTO practice (id, organization_id, name, data_key_ref) VALUES ($1, $2, 'SYNTHETIC PRACTICE WITHOUT A ZIP', 'local:v1:AAAA')", [id, organizationId]);
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }
  return id;
}

/** A new practice of a new group, with its administrator, and its location as given. */
async function practiceAt(zip: string, zipPlusFour: string | null = null): Promise<TenantWorld> {
  const created = await createTenantWorld(owner, `at ${zip}`);
  await owner.query('UPDATE practice_site SET zip = $2, zip_plus_four = $3 WHERE practice_id = $1', [created.practiceId, zip, zipPlusFour]);
  return created;
}

/** practice_set_location() as `actorId` in a request's scope of `practiceIds`, for `target`. */
const setLocation = (actorId: string, practiceIds: readonly string[], target: string, zip: string | null, plusFour: string | null) =>
  withPracticeScope(app, { actorId, practiceIds }, async (scope) => (await scope.client.query<{ status: string }>('SELECT practice_set_location($1, $2, $3) AS status', [target, zip, plusFour])).rows[0]?.status);

const siteOf = async (practiceId: string) =>
  (await owner.query<{ zip: string; zip_plus_four: string | null; updated_by: string | null; updated_at: Date }>('SELECT zip, zip_plus_four, updated_by, updated_at FROM practice_site WHERE practice_id = $1', [practiceId])).rows;

/** A person's run of January 2026 for `practiceId`, as the application role in the request's scope; its ID and pinned split. */
const personRun = (actorId: string, practiceId: string) =>
  withPracticeScope(app, { actorId, practiceIds: [practiceId] }, async (scope) => {
    const { rows } = await scope.client.query<{ id: string; place_of_service_split_id: string | null }>(
      `INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by)
       VALUES ($1, '2026-01-01', '2026-01-31', current_rule_release(), 'phase-two/2', app_actor_id()) RETURNING id, place_of_service_split_id`,
      [practiceId],
    );
    return rows[0];
  });

/** The monitor job's run of February 2026, as the worker's login in the job's scope. */
const jobRun = (practiceId: string) =>
  withJobScope(worker, { jobId: randomUUID(), practiceId }, async (scope) => {
    const { rows } = await scope.client.query<{ id: string; place_of_service_split_id: string | null }>(
      `INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by_job_id)
       VALUES ($1, '2026-02-01', '2026-02-28', current_rule_release(), 'phase-two/2', app_actor_id()) RETURNING id, place_of_service_split_id`,
      [practiceId],
    );
    return rows[0];
  });

const approveSplit = (settings: object) =>
  withActor(app, specialist, async (scope) => (await scope.client.query<{ id: string }>('SELECT console_approve_place_of_service_split($1) AS id', [JSON.stringify(settings)])).rows[0]?.id ?? '');

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  app = new pg.Pool({ connectionString: database.appUrl, max: 4 });
  worker = new pg.Pool({ connectionString: database.workerUrl, max: 2 });
  world = await createTenantWorld(owner, 'location');
  other = await createTenantWorld(owner, 'other');
  platformAdmin = await internalUser('platform_admin');
  specialist = await internalUser('contract_specialist');
  // 900006 is loaded last, so it is the release in force.
  await loadRelease(900001);
  await loadRelease(900006);
}, 60_000);

afterAll(async () => {
  await endPool(worker);
  await endPool(app);
  await owner.end();
  await database.drop();
});

describe('rule_record’s closed list of record types (the founder’s answer to PR 6b’s Q3 (a))', () => {
  it('holds RULE_RECORD_TYPES equal to the record-type CHECK’s 17 values, and refuses any other type', async () => {
    const { rows } = await owner.query<{ definition: string }>("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'rule_record'::regclass AND conname = 'rule_record_record_type_check'");
    const values = [...(rows[0]?.definition ?? '').matchAll(/'([a-z0-9_]+)'::text/g)].map((match) => match[1]);
    expect(values).toHaveLength(17);
    expect([...values].sort()).toEqual([...RULE_RECORD_TYPES].sort());
    expect(values).toContain('locality_map_plus_four');
    // 900006's plus-four record is loaded (beforeAll); a type outside the list is not, even into an unpublished release.
    expect((await owner.query("SELECT count(*)::int AS n FROM rule_record WHERE release_no = 900006 AND record_type = 'locality_map_plus_four'")).rows).toEqual([{ n: 1 }]);
    await owner.query('BEGIN');
    try {
      await owner.query("INSERT INTO rule_release (release_no, manifest_sha256) VALUES (900099, $1)", [sha('900099')]);
      await expect(
        owner.query(
          `INSERT INTO rule_record (release_no, record_type, key, value, effective_from, source, verification, sha256)
           VALUES (900099, 'locality_map_plus_five', '{"zip":"00012"}', '{}', '2026-01-01', '{"synthetic":true}', 'L1', $1)`,
          [sha('five')],
        ),
      ).rejects.toMatchObject({ code: '23514', constraint: 'rule_record_record_type_check' });
    } finally {
      await owner.query('ROLLBACK');
    }
  });
});

describe('the location’s status in a release (locality_status, practice_location_status)', () => {
  const status = async (release: number | null, zip: string, plusFour: string | null, from: string | null = null, to: string | null = null) =>
    (await app.query<{ status: string; carrier: string | null; locality: string | null }>('SELECT * FROM locality_status($1, $2, $3, $4, $5)', [release, zip, plusFour, from, to])).rows;

  it('reaches every status of a ZIP and ZIP+4 under the committed SYNTHETIC releases 900006 and 900001, as the application role', async () => {
    const ready = (locality: string) => [{ status: 'ready', carrier: '99999', locality }];
    const only = (value: string) => [{ status: value, carrier: null, locality: null }];
    // 900006: 00012 splits at its ZIP+4, 0000-4999 in locality 01, 5000-8999 in 02, 9000-9999 not listed.
    expect(await status(900006, '00011', null)).toEqual(ready('01'));
    expect(await status(900006, '00011', '1234')).toEqual(ready('01'));
    expect(await status(900006, '00012', '0001')).toEqual(ready('01'));
    expect(await status(900006, '00012', '4999')).toEqual(ready('01'));
    expect(await status(900006, '00012', '5000')).toEqual(ready('02'));
    expect(await status(900006, '00012', '8999')).toEqual(ready('02'));
    expect(await status(900006, '00012', null)).toEqual(only('zip_plus_four_needed'));
    expect(await status(900006, '00012', '9100')).toEqual(only('zip_plus_four_unknown'));
    expect(await status(900006, '00012', '12a4')).toEqual(only('zip_plus_four_unknown'));
    expect(await status(900006, '00099', null)).toEqual(only('zip_unknown'));
    expect(await status(900006, '00099', '1234', '2025-01-01', '2025-12-31')).toEqual(only('zip_unknown'));
    expect(await status(900006, '00011', null, '2026-04-01', '2026-06-30')).toEqual(ready('01'));
    // The ZIP is known, but no window of it meets the period: content not loaded, nothing for the customer to change.
    expect(await status(900001, '00011', null, '2025-01-01', '2025-03-31')).toEqual(only('locality_not_loaded'));
    expect(await status(900006, '00012', '5000', '2025-01-01', '2025-12-31')).toEqual(only('locality_not_loaded'));
    // 900001 flags 00012 and loads no ZIP+4 list: the ZIP+4 is asked for, and once given, the list is what is missing.
    expect(await status(900001, '00012', null)).toEqual(only('zip_plus_four_needed'));
    expect(await status(900001, '00012', '0001')).toEqual(only('locality_not_loaded'));
    expect(await status(900001, '00011', null)).toEqual(ready('01'));
    // No release at all: nothing is known.
    expect(await status(null, '00011', null)).toEqual(only('zip_unknown'));
  });

  it('gives a practice’s status: no_release, zip_missing for a practice with no location or outside the scope, and locality_status()’s otherwise', async () => {
    const flagged = await practiceAt('00012', null);
    const legacy = await legacyPracticeWithoutLocation(flagged.organizationId);
    const seen = await withPracticeScope(app, { actorId: flagged.adminUserId, practiceIds: [flagged.practiceId, legacy] }, async (scope) => {
      expect([...scope.practiceIds].sort()).toEqual([flagged.practiceId, legacy].sort());
      const ask = async (target: string, release: number | null, from: string | null = null, to: string | null = null) =>
        (await scope.client.query<{ status: string }>('SELECT practice_location_status($1, $2, $3, $4) AS status', [target, release, from, to])).rows[0]?.status;
      return {
        flagged: await ask(flagged.practiceId, 900006),
        flaggedIn2025: await ask(flagged.practiceId, 900006, '2025-01-01', '2025-01-31'),
        noRelease: await ask(flagged.practiceId, null),
        legacy: await ask(legacy, 900006),
        // Another practice's location is not the caller's to read: it has none as far as this scope sees.
        outside: await ask(world.practiceId, 900006),
      };
    });
    expect(seen).toEqual({ flagged: 'zip_plus_four_needed', flaggedIn2025: 'locality_not_loaded', noRelease: 'no_release', legacy: 'zip_missing', outside: 'zip_missing' });
    const reached = new Set<string>(Object.values(seen).map(String));
    for (const [release, zip, plusFour] of [
      [900006, '00011', null],
      [900006, '00099', null],
      [900006, '00012', '9100'],
    ] as const) {
      reached.add((await status(release, zip, plusFour))[0]?.status ?? '');
    }
    expect([...reached].sort()).toEqual([...STATUSES].sort());
  });

  it('reports the dates each silently read content is loaded for, empty when a release has none (audit #7)', async () => {
    const spans = async (release: number) => (await app.query<{ content: string; loaded: string }>('SELECT content, loaded::text FROM rule_release_content_span($1)', [release])).rows;
    // 900001 as committed: MUE and the per-code reduction for 2026, the general reduction from 2026 on.
    expect(await spans(900001)).toEqual([
      { content: 'mppr_code', loaded: '{[2026-01-01,2027-01-01)}' },
      { content: 'mppr_general', loaded: '{[2026-01-01,)}' },
      { content: 'ncci_mue', loaded: '{[2026-01-01,2027-01-01)}' },
    ]);
    expect(await spans(900006)).toEqual(await spans(900001));
    // No release by that number: every content empty, never the infinite span.
    expect(await spans(899999)).toEqual([
      { content: 'mppr_code', loaded: '{}' },
      { content: 'mppr_general', loaded: '{}' },
      { content: 'ncci_mue', loaded: '{}' },
    ]);
  });
});

describe('who sets the location (pricing_settings.set, the founder’s answer to PR 6b’s Q5 (a))', () => {
  let target: TenantWorld;
  let billingManager: string;
  let viewer: string;
  let analyst: string;
  let firmBillingManager: string;
  let firmPrincipal: string;
  let reviewer: string;

  beforeAll(async () => {
    target = await createTenantWorld(owner, 'setter');
    billingManager = await memberOf(target.organizationId, 'billing_manager');
    viewer = await memberOf(target.organizationId, 'viewer');
    analyst = await memberOf(target.organizationId, 'analyst');
    const firm = await firmGrant(target, ['firm_principal', 'billing_manager', 'analyst', 'viewer']);
    firmBillingManager = await memberOf(firm, 'billing_manager');
    firmPrincipal = await memberOf(firm, 'firm_principal');
    reviewer = await internalUser('reviewer');
    await asOwner(owner, [target.practiceId], () =>
      owner.query("INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'LOC-1', 'SYNTHETIC REVIEW', now() + interval '1 hour')", [target.practiceId, reviewer]),
    );
  });

  it('refuses the viewer, the analyst and the reviewer, a practice outside the scope, a platform administrator and a job', async () => {
    for (const person of [viewer, analyst, reviewer]) {
      await expect(setLocation(person, [target.practiceId], target.practiceId, '00011', null)).rejects.toMatchObject({ code: '42501' });
    }
    // The practice administrator of another practice, with that practice in scope, names this one.
    await expect(setLocation(other.adminUserId, [other.practiceId], target.practiceId, '00011', null)).rejects.toMatchObject({ code: '42501' });
    // This practice's administrator with only another practice in scope (the request asks for a practice it reaches no route to).
    await expect(setLocation(target.adminUserId, [other.practiceId], target.practiceId, '00011', null)).rejects.toMatchObject({ code: '42501' });
    // A platform administrator holds no practice role, whatever its scope says.
    await expect(
      withActor(app, platformAdmin, async (scope) => {
        await scope.client.query("SELECT set_config('app.practice_ids', $1, true)", [`{${target.practiceId}}`]);
        return scope.client.query("SELECT practice_set_location($1, '00011', NULL)", [target.practiceId]);
      }),
    ).rejects.toMatchObject({ code: '42501' });
    // A job is no person.
    await expect(withJobScope(worker, { jobId: randomUUID(), practiceId: target.practiceId }, (scope) => scope.client.query("SELECT practice_set_location($1, '00011', NULL)", [target.practiceId]))).rejects.toMatchObject({
      code: '42501',
    });
    expect(await siteOf(target.practiceId)).toEqual([expect.objectContaining({ zip: '00011', zip_plus_four: null, updated_by: null })]);
  });

  it('accepts the practice administrator, the billing manager by ownership and under a firm grant, and the firm principal, and returns each status', async () => {
    const before = (await siteOf(target.practiceId))[0]?.updated_at;
    expect(await setLocation(billingManager, [target.practiceId], target.practiceId, '00012', null)).toBe('zip_plus_four_needed');
    expect(await siteOf(target.practiceId)).toEqual([expect.objectContaining({ zip: '00012', zip_plus_four: null, updated_by: billingManager })]);
    expect((await siteOf(target.practiceId))[0]?.updated_at.getTime()).toBeGreaterThan(before?.getTime() ?? Infinity);
    expect(await setLocation(firmBillingManager, [target.practiceId], target.practiceId, '00012', '9100')).toBe('zip_plus_four_unknown');
    expect(await setLocation(firmPrincipal, [target.practiceId], target.practiceId, '00099', null)).toBe('zip_unknown');
    expect(await setLocation(target.adminUserId, [target.practiceId], target.practiceId, '00012', '5000')).toBe('ready');
    expect(await siteOf(target.practiceId)).toEqual([expect.objectContaining({ zip: '00012', zip_plus_four: '5000', updated_by: target.adminUserId })]);
    expect(await setLocation(target.adminUserId, [target.practiceId], target.practiceId, '00011', null)).toBe('ready');
    // Still one location: the setter replaces it, never adds a second.
    expect((await owner.query('SELECT count(*)::int AS n FROM practice_site WHERE practice_id = $1', [target.practiceId])).rows).toEqual([{ n: 1 }]);
  });

  it('refuses a malformed ZIP or ZIP+4 sent with the handler bypassed, by the constraint’s name, and writes nothing', async () => {
    for (const zip of ['2760', '276011', '27601-1234', 'ABCDE', '', null]) {
      await expect(setLocation(target.adminUserId, [target.practiceId], target.practiceId, zip, null), String(zip)).rejects.toMatchObject({ code: '23514', constraint: 'practice_site_zip' });
    }
    for (const plusFour of ['12a4', '123', '12345', '']) {
      await expect(setLocation(target.adminUserId, [target.practiceId], target.practiceId, '00012', plusFour), plusFour).rejects.toMatchObject({
        code: '23514',
        constraint: 'practice_site_zip_plus_four',
      });
    }
    expect(await siteOf(target.practiceId)).toEqual([expect.objectContaining({ zip: '00011', zip_plus_four: null })]);
  });

  it('lets a platform administrator set it from the console, in the practice’s one scope, restoring the caller’s, and refuses everyone else', async () => {
    const console_ = (actorId: string, practiceId: string, zip: string | null, plusFour: string | null) =>
      withActor(app, actorId, async (scope) => {
        const result = (await scope.client.query<{ status: string | null }>('SELECT console_set_practice_location($1, $2, $3) AS status', [practiceId, zip, plusFour])).rows[0]?.status;
        const after = (await scope.client.query<{ scope: string }>("SELECT current_setting('app.practice_ids', true) AS scope")).rows[0]?.scope;
        return { result, after };
      });
    expect(await console_(platformAdmin, target.practiceId, '00012', '0001')).toEqual({ result: 'ready', after: '{}' });
    expect(await siteOf(target.practiceId)).toEqual([expect.objectContaining({ zip: '00012', zip_plus_four: '0001', updated_by: platformAdmin })]);
    // A practice that does not exist: nothing set.
    expect(await console_(platformAdmin, randomUUID(), '00011', null)).toEqual({ result: null, after: '{}' });
    await expect(console_(target.adminUserId, target.practiceId, '00011', null)).rejects.toMatchObject({ code: '42501' });
    await expect(console_(specialist, target.practiceId, '00011', null)).rejects.toMatchObject({ code: '42501' });
    await expect(console_(platformAdmin, target.practiceId, '0001', null)).rejects.toMatchObject({ constraint: 'practice_site_zip' });
    await expect(console_(platformAdmin, target.practiceId, '00012', '1')).rejects.toMatchObject({ constraint: 'practice_site_zip_plus_four' });
  });

  it('serves the console’s settings from the location: its ZIP and ZIP+4 read, a changed ZIP set (its ZIP+4 cleared), the same or none left, and practice.zip never written', async () => {
    const settings = (actorId: string) =>
      withActor(app, actorId, async (scope) => (await scope.client.query<{ zip: string | null; zip_plus_four: string | null }>('SELECT zip, zip_plus_four FROM console_practice_settings($1)', [target.practiceId])).rows);
    const save = (zip: string | null) =>
      withActor(app, platformAdmin, async (scope) => (await scope.client.query<{ changed: boolean }>("SELECT console_set_practice_settings($1, $2, '{}') AS changed", [target.practiceId, zip])).rows[0]?.changed);
    // The stored ZIP+4 too, so the console shows it and a save never replaces it unseen (review of PR 6b-2, finding 14).
    expect(await settings(platformAdmin)).toEqual([{ zip: '00012', zip_plus_four: '0001' }]);
    expect(await settings(target.adminUserId)).toEqual([]);
    const stamped = (await siteOf(target.practiceId))[0]?.updated_at;
    // The same ZIP (the previous image's save sends the form's): the location, its ZIP+4 and its time are as they were.
    expect(await save('00012')).toBe(true);
    expect(await siteOf(target.practiceId)).toEqual([expect.objectContaining({ zip: '00012', zip_plus_four: '0001', updated_at: stamped })]);
    // None (the new image's): left as it is.
    expect(await save(null)).toBe(true);
    expect(await siteOf(target.practiceId)).toEqual([expect.objectContaining({ zip: '00012', zip_plus_four: '0001', updated_at: stamped })]);
    // Another ZIP: set, and the ZIP+4 of the old one cleared.
    expect(await save('00011')).toBe(true);
    expect(await siteOf(target.practiceId)).toEqual([expect.objectContaining({ zip: '00011', zip_plus_four: null, updated_by: platformAdmin })]);
    expect(await settings(platformAdmin)).toEqual([{ zip: '00011', zip_plus_four: null }]);
    await expect(save('0001')).rejects.toMatchObject({ constraint: 'practice_site_zip' });
    expect((await owner.query('SELECT zip FROM practice WHERE id = $1', [target.practiceId])).rows).toEqual([{ zip: null }]);
  });
});

describe('the practice’s confirmation of its location, and a save that changes nothing (review of PR 6b-2, findings 1, 2, 8, 9 and 11)', () => {
  let target: TenantWorld;
  let billingManager: string;
  let viewer: string;
  let analyst: string;
  let firmPrincipal: string;
  let reviewer: string;
  let engineer: string;

  /**
   * practice_confirm_location() as `actorId` in a request's scope of `practiceIds`, for `practiceId`, of the ZIP and
   * ZIP+4 the person was shown (`shown`, the location as it stands unless a test says otherwise).
   */
  const confirm = (actorId: string, practiceIds: readonly string[], practiceId: string, shown: readonly [string | null, string | null]) =>
    withPracticeScope(app, { actorId, practiceIds }, async (scope) =>
      (await scope.client.query<{ status: string }>('SELECT practice_confirm_location($1, $2, $3) AS status', [practiceId, shown[0], shown[1]])).rows[0]?.status,
    );
  /** A statement as `actorId` with app.practice_ids set by hand, as a handler bug or another route could set it. */
  const asActorIn = (actorId: string, practiceIds: readonly string[], statement: string, values: unknown[]) =>
    withActor(app, actorId, async (scope) => {
      await scope.client.query("SELECT set_config('app.practice_ids', $1, true)", [`{${practiceIds.join(',')}}`]);
      return scope.client.query(statement, values);
    });
  const consoleSet = (zip: string, plusFour: string | null) =>
    withActor(app, platformAdmin, async (scope) => (await scope.client.query<{ status: string | null }>('SELECT console_set_practice_location($1, $2, $3) AS status', [target.practiceId, zip, plusFour])).rows[0]?.status);
  /** The location as the owner reads it: who set it and when, who confirmed it, and whether that confirmation still holds. */
  const stateOf = async (practiceId: string) =>
    (
      await owner.query<{ zip: string; zip_plus_four: string | null; updated_by: string | null; updated_at: Date; confirmed_by: string | null; confirmed: boolean }>(
        'SELECT zip, zip_plus_four, updated_by, updated_at, confirmed_by, (confirmed_at IS NOT NULL AND confirmed_at >= updated_at) AS confirmed FROM practice_site WHERE practice_id = $1',
        [practiceId],
      )
    ).rows[0];

  beforeAll(async () => {
    target = await createTenantWorld(owner, 'confirmation');
    billingManager = await memberOf(target.organizationId, 'billing_manager');
    viewer = await memberOf(target.organizationId, 'viewer');
    analyst = await memberOf(target.organizationId, 'analyst');
    firmPrincipal = await memberOf(await firmGrant(target, ['firm_principal']), 'firm_principal');
    reviewer = await internalUser('reviewer');
    engineer = await internalUser('support');
    for (const [person, ticket] of [
      [reviewer, 'LOC-2'],
      [engineer, 'LOC-3'],
    ] as const) {
      await asOwner(owner, [target.practiceId], () =>
        owner.query("INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, $3, 'SYNTHETIC REVIEW', now() + interval '1 hour')", [target.practiceId, person, ticket]),
      );
    }
  });

  it('records who confirmed it and when beside the location, both or neither, read by every role that opens the practice', async () => {
    await expect(owner.query('UPDATE practice_site SET confirmed_by = $2 WHERE practice_id = $1', [target.practiceId, billingManager])).rejects.toMatchObject({
      code: '23514',
      constraint: 'practice_site_confirmed',
    });
    await expect(owner.query('UPDATE practice_site SET confirmed_at = now() WHERE practice_id = $1', [target.practiceId])).rejects.toMatchObject({ code: '23514', constraint: 'practice_site_confirmed' });
    for (const person of [viewer, analyst, engineer]) {
      const read = await withPracticeScope(app, { actorId: person, practiceIds: [target.practiceId] }, async (scope) =>
        (await scope.client.query<{ confirmed_by: string | null; confirmed_at: Date | null }>('SELECT confirmed_by, confirmed_at FROM practice_site WHERE practice_id = $1', [target.practiceId])).rows,
      );
      expect(read, person).toEqual([{ confirmed_by: null, confirmed_at: null }]);
    }
  });

  it('refuses the confirmation, as the application role, to a viewer, an analyst, a support engineer, a reviewer, another practice’s administrator, a platform administrator and a job, and writes nothing', async () => {
    // Each sends the location as it stands, so only who asks is refused; one sent with another location is refused the
    // same way, before the location is read, so the refusal says nothing of it.
    for (const person of [viewer, analyst, engineer, reviewer]) {
      await expect(confirm(person, [target.practiceId], target.practiceId, ['00011', null]), person).rejects.toMatchObject({ code: '42501' });
      await expect(confirm(person, [target.practiceId], target.practiceId, ['00099', '1234']), person).rejects.toMatchObject({ code: '42501' });
    }
    // Another practice's administrator, even with this practice put in the scope by hand.
    await expect(
      asActorIn(other.adminUserId, [other.practiceId, target.practiceId], "SELECT practice_confirm_location($1, '00011', NULL)", [target.practiceId]),
    ).rejects.toMatchObject({ code: '42501' });
    // This practice's administrator with only another practice in scope.
    await expect(confirm(target.adminUserId, [other.practiceId], target.practiceId, ['00011', null])).rejects.toMatchObject({ code: '42501' });
    // A platform administrator holds no practice role, whatever its scope says; a job is no person.
    await expect(asActorIn(platformAdmin, [target.practiceId], "SELECT practice_confirm_location($1, '00011', NULL)", [target.practiceId])).rejects.toMatchObject({ code: '42501' });
    await expect(
      withJobScope(worker, { jobId: randomUUID(), practiceId: target.practiceId }, (scope) => scope.client.query("SELECT practice_confirm_location($1, '00011', NULL)", [target.practiceId])),
    ).rejects.toMatchObject({
      code: '42501',
    });
    // Nor is the confirmation written around the function: the application role holds no write on the location.
    await expect(
      asActorIn(viewer, [target.practiceId], 'UPDATE practice_site SET confirmed_by = app_actor_id(), confirmed_at = now() WHERE practice_id = $1', [target.practiceId]),
    ).rejects.toMatchObject({ code: '42501' });
    expect(await stateOf(target.practiceId)).toMatchObject({ confirmed_by: null, confirmed: false });
  });

  it('takes the confirmation of the billing manager, the firm principal and the practice administrator only while nothing is left to change (practice_site_settled), keeping the location’s time', async () => {
    const before = await stateOf(target.practiceId);
    expect(before).toMatchObject({ zip: '00011', zip_plus_four: null, updated_by: null });
    expect(await confirm(billingManager, [target.practiceId], target.practiceId, ['00011', null])).toBe('ready');
    expect(await stateOf(target.practiceId)).toEqual({ ...before, confirmed_by: billingManager, confirmed: true });
    expect(await confirm(firmPrincipal, [target.practiceId], target.practiceId, ['00011', null])).toBe('ready');
    expect(await stateOf(target.practiceId)).toEqual({ ...before, confirmed_by: firmPrincipal, confirmed: true });
    // A location that still asks the customer for something is never confirmed as it stands; a console change clears the confirmation.
    for (const [zip, plusFour, status] of [
      ['00012', null, 'zip_plus_four_needed'],
      ['00012', '9100', 'zip_plus_four_unknown'],
      ['00099', null, 'zip_unknown'],
    ] as const) {
      expect(await consoleSet(zip, plusFour)).toBe(status);
      await expect(confirm(target.adminUserId, [target.practiceId], target.practiceId, [zip, plusFour]), status).rejects.toMatchObject({ code: '23514', constraint: 'practice_site_settled' });
      expect(await stateOf(target.practiceId), status).toMatchObject({ confirmed_by: null, confirmed: false });
    }
    // A practice with no location at all (zip_missing) by the same rule, whatever the page sent.
    const legacy = await legacyPracticeWithoutLocation(target.organizationId);
    await expect(confirm(target.adminUserId, [legacy], legacy, ['00011', null])).rejects.toMatchObject({ code: '23514', constraint: 'practice_site_settled' });
    await expect(confirm(target.adminUserId, [legacy], legacy, [null, null])).rejects.toMatchObject({ code: '23514', constraint: 'practice_site_settled' });
    expect(await consoleSet('00012', '5000')).toBe('ready');
    expect(await stateOf(target.practiceId)).toMatchObject({ zip: '00012', zip_plus_four: '5000', updated_by: platformAdmin, confirmed_by: null, confirmed: false });
    expect(await confirm(target.adminUserId, [target.practiceId], target.practiceId, ['00012', '5000'])).toBe('ready');
    expect(await stateOf(target.practiceId)).toMatchObject({ updated_by: platformAdmin, confirmed_by: target.adminUserId, confirmed: true });
  });

  it('moves updated_at and updated_by only when the ZIP or ZIP+4 changes, whoever writes it; a person’s save is their confirmation, and a console change clears it', async () => {
    const before = await stateOf(target.practiceId);
    // The same location saved by a person of the practice: their confirmation; the location's time and setter kept.
    expect(await setLocation(billingManager, [target.practiceId], target.practiceId, '00012', '5000')).toBe('ready');
    expect(await stateOf(target.practiceId)).toEqual({ ...before, confirmed_by: billingManager });
    // The same location from the console, or by the owner: nothing moves, and the confirmation stays.
    expect(await consoleSet('00012', '5000')).toBe('ready');
    await owner.query("UPDATE practice_site SET zip = '00012', zip_plus_four = '5000' WHERE practice_id = $1", [target.practiceId]);
    expect(await stateOf(target.practiceId)).toEqual({ ...before, confirmed_by: billingManager });
    // A person's change: stamped, theirs, and confirmed by the save itself.
    expect(await setLocation(firmPrincipal, [target.practiceId], target.practiceId, '00012', '0001')).toBe('ready');
    const changed = await stateOf(target.practiceId);
    expect(changed).toMatchObject({ zip_plus_four: '0001', updated_by: firmPrincipal, confirmed_by: firmPrincipal, confirmed: true });
    expect(changed?.updated_at.getTime()).toBeGreaterThan(before?.updated_at.getTime() ?? Infinity);
    // The previous image's console save: the same ZIP leaves everything; another ZIP sets it and clears the confirmation.
    const save = (zip: string) =>
      withActor(app, platformAdmin, async (scope) => (await scope.client.query<{ changed: boolean }>("SELECT console_set_practice_settings($1, $2, '{}') AS changed", [target.practiceId, zip])).rows[0]?.changed);
    expect(await save('00012')).toBe(true);
    expect(await stateOf(target.practiceId)).toEqual(changed);
    expect(await save('00011')).toBe(true);
    expect(await stateOf(target.practiceId)).toMatchObject({ zip: '00011', zip_plus_four: null, updated_by: platformAdmin, confirmed_by: null, confirmed: false });
  });

  it('never sets or confirms the location of a deleted practice, from the practice or the console', async () => {
    const gone = await createTenantWorld(owner, 'deleted');
    const kept = await stateOf(gone.practiceId);
    await owner.query('BEGIN');
    try {
      await owner.query('SET LOCAL session_replication_role = replica');
      await owner.query("UPDATE practice SET status = 'deleted', deleted_at = now() WHERE id = $1", [gone.practiceId]);
      await owner.query('COMMIT');
    } catch (error) {
      await owner.query('ROLLBACK');
      throw error;
    }
    // Its administrator, with the practice put in the scope by hand (effective_practice_access() does not read a practice's status).
    await expect(asActorIn(gone.adminUserId, [gone.practiceId], "SELECT practice_set_location($1, '00099', NULL)", [gone.practiceId])).rejects.toMatchObject({ code: '42501' });
    await expect(asActorIn(gone.adminUserId, [gone.practiceId], "SELECT practice_confirm_location($1, '00011', NULL)", [gone.practiceId])).rejects.toMatchObject({ code: '42501' });
    // The console's setter answers null; the previous image's settings save leaves the location as it is.
    expect((await asActorIn(platformAdmin, [], "SELECT console_set_practice_location($1, '00099', NULL) AS status", [gone.practiceId])).rows).toEqual([{ status: null }]);
    await asActorIn(platformAdmin, [], "SELECT console_set_practice_settings($1, '00099', '{}')", [gone.practiceId]);
    expect(await stateOf(gone.practiceId)).toEqual(kept);
  });

  it('confirms only the ZIP and ZIP+4 the person was shown: from a page read before the location changed, nothing is confirmed (practice_site_changed) (verification of PR 6b-2, finding 1)', async () => {
    // The page showed 00011 with no ZIP+4; the console has since set 00012-5000, which prices (locality 02).
    expect(await consoleSet('00011', null)).toBe('ready');
    expect(await consoleSet('00012', '5000')).toBe('ready');
    const changed = await stateOf(target.practiceId);
    expect(changed).toMatchObject({ zip: '00012', zip_plus_four: '5000', confirmed_by: null, confirmed: false });
    // Any other ZIP or ZIP+4 than the location's own, a ZIP+4 missing or added among them, is not what the person saw.
    for (const shown of [
      ['00011', null],
      ['00012', null],
      ['00012', '5001'],
      ['00011', '5000'],
      ['00012', ''],
      [null, '5000'],
      [null, null],
    ] as const) {
      await expect(confirm(target.adminUserId, [target.practiceId], target.practiceId, shown), shown.join('-')).rejects.toMatchObject({ code: '23514', constraint: 'practice_site_changed' });
    }
    expect(await stateOf(target.practiceId)).toEqual(changed);
    // A location that still asks for something, shown as another: the change is what the person is told of first.
    expect(await consoleSet('00012', null)).toBe('zip_plus_four_needed');
    await expect(confirm(target.adminUserId, [target.practiceId], target.practiceId, ['00012', '5000'])).rejects.toMatchObject({ code: '23514', constraint: 'practice_site_changed' });
    await expect(confirm(target.adminUserId, [target.practiceId], target.practiceId, ['00012', null])).rejects.toMatchObject({ code: '23514', constraint: 'practice_site_settled' });
    // The location as it stands, shown again: confirmed.
    expect(await consoleSet('00012', '5000')).toBe('ready');
    expect(await confirm(billingManager, [target.practiceId], target.practiceId, ['00012', '5000'])).toBe('ready');
    expect(await stateOf(target.practiceId)).toMatchObject({ zip: '00012', zip_plus_four: '5000', confirmed_by: billingManager, confirmed: true });
  });

  it('refuses a confirmation that waited on the console’s change of the location, which committed while it waited, and leaves the location unconfirmed; one that holds the location first is cleared by the change that follows (two connections)', async () => {
    expect(await consoleSet('00011', null)).toBe('ready');
    type Body = (client: pg.PoolClient) => Promise<void>;
    /**
     * A transaction held open, once `body` has run in it, until `release()`: `started` gives its backend's pid (or the
     * body's error), `done` its commit.
     */
    const hold = (open: (run: Body) => Promise<void>, body: Body) => {
      let release: () => void = () => undefined;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let ran: (pid: number) => void = () => undefined;
      let failed: (error: unknown) => void = () => undefined;
      const started = new Promise<number>((resolve, reject) => {
        ran = resolve;
        failed = reject;
      });
      const done = open(async (client) => {
        await body(client);
        ran((await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid ?? 0);
        await released;
      });
      done.catch(failed);
      return { started, release: () => release(), done };
    };
    /** Until another backend waits on a lock the backend `pid` holds. */
    const waitsOn = async (pid: number) => {
      for (let attempt = 0; attempt < 400; attempt += 1) {
        const { rows } = await owner.query<{ waiting: boolean }>('SELECT EXISTS (SELECT 1 FROM pg_stat_activity a WHERE $1 = ANY (pg_blocking_pids(a.pid))) AS waiting', [pid]);
        if (rows[0]?.waiting === true) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error('no transaction waited on the held location');
    };

    // The console changes the location to 00012-5001 and holds it, uncommitted. The practice administrator, whose page
    // showed 00011, confirms; the confirmation waits on the console's lock, which then commits.
    const change = hold(
      (run) => withActor(app, platformAdmin, (scope) => run(scope.client)),
      async (client) => {
        expect((await client.query('SELECT console_set_practice_location($1, $2, $3) AS status', [target.practiceId, '00012', '5001'])).rows).toEqual([{ status: 'ready' }]);
      },
    );
    try {
      const holder = await change.started;
      const confirming = confirm(target.adminUserId, [target.practiceId], target.practiceId, ['00011', null]);
      confirming.catch(() => undefined);
      await waitsOn(holder);
      change.release();
      await change.done;
      await expect(confirming).rejects.toMatchObject({ code: '23514', constraint: 'practice_site_changed' });
    } finally {
      change.release();
    }
    expect(await stateOf(target.practiceId)).toMatchObject({ zip: '00012', zip_plus_four: '5001', updated_by: platformAdmin, confirmed_by: null, confirmed: false });

    // The other order: the confirmation of what the page showed holds the location first; the console's change waits on
    // it, then applies and clears it, so the location waits for the practice again.
    const confirmation = hold(
      (run) => withPracticeScope(app, { actorId: target.adminUserId, practiceIds: [target.practiceId] }, (scope) => run(scope.client)),
      async (client) => {
        expect((await client.query("SELECT practice_confirm_location($1, '00012', '5001') AS status", [target.practiceId])).rows).toEqual([{ status: 'ready' }]);
      },
    );
    try {
      const holder = await confirmation.started;
      const changing = consoleSet('00011', null);
      changing.catch(() => undefined);
      await waitsOn(holder);
      confirmation.release();
      await confirmation.done;
      expect(await changing).toBe('ready');
    } finally {
      confirmation.release();
    }
    expect(await stateOf(target.practiceId)).toMatchObject({ zip: '00011', zip_plus_four: null, updated_by: platformAdmin, confirmed_by: null, confirmed: false });
  });
});

describe('the location record', () => {
  it('is created with its practice: a practice inserted without one fails at commit (practice_has_site), whoever inserts it', async () => {
    const group = await createOrganization(owner, 'group', 'no location');
    await memberOf(group, 'practice_admin');
    const id = randomUUID();
    await expect(
      asOwner(owner, [id], () => owner.query("INSERT INTO practice (id, organization_id, name, data_key_ref) VALUES ($1, $2, 'SYNTHETIC WITHOUT A LOCATION', 'local:v1:AAAA')", [id, group])),
    ).rejects.toMatchObject({ code: '23514', constraint: 'practice_has_site' });
    expect((await owner.query('SELECT count(*)::int AS n FROM practice WHERE id = $1', [id])).rows).toEqual([{ n: 0 }]);
    // The platform administrator's insert, as the console's, is bound too; with the location in the same transaction it commits.
    const consoleId = randomUUID();
    await expect(
      withActor(app, platformAdmin, (scope) => scope.client.query("INSERT INTO practice (id, organization_id, name, data_key_ref) VALUES ($1, $2, 'SYNTHETIC CONSOLE PRACTICE', 'local:v1:AAAA')", [consoleId, group])),
    ).rejects.toMatchObject({ code: '23514', constraint: 'practice_has_site' });
    await withActor(app, platformAdmin, async (scope) => {
      await scope.client.query("INSERT INTO practice (id, organization_id, name, data_key_ref) VALUES ($1, $2, 'SYNTHETIC CONSOLE PRACTICE', 'local:v1:AAAA')", [consoleId, group]);
      expect((await scope.client.query<{ status: string }>("SELECT console_set_practice_location($1, '00012', NULL) AS status", [consoleId])).rows).toEqual([{ status: 'zip_plus_four_needed' }]);
    });
    expect(await siteOf(consoleId)).toEqual([expect.objectContaining({ zip: '00012', zip_plus_four: null, updated_by: platformAdmin })]);
    await asOwner(owner, [id], () => createPracticeWithLocation(owner, { id, organizationId: group, name: 'SYNTHETIC WITH A LOCATION', zip: '00012', zipPlusFour: '5000' }));
    expect(await siteOf(id)).toEqual([expect.objectContaining({ zip: '00012', zip_plus_four: '5000', updated_by: null })]);
  });

  it('refuses a deletion, a truncation and a change of its practice, id or creation, whoever asks; a change of its ZIP stamps the time', async () => {
    const at = await practiceAt('00011');
    const inScope = <T>(run: () => Promise<T>) => asOwner(owner, [at.practiceId], run);
    await expect(inScope(() => owner.query('DELETE FROM practice_site WHERE practice_id = $1', [at.practiceId]))).rejects.toMatchObject({ code: '23514', constraint: 'practice_site_kept' });
    await expect(owner.query('DELETE FROM practice_site WHERE practice_id = $1', [at.practiceId])).rejects.toMatchObject({ constraint: 'practice_site_kept' });
    await expect(owner.query('TRUNCATE practice_site')).rejects.toMatchObject({ code: 'P0001' });
    await expect(inScope(() => owner.query('UPDATE practice_site SET practice_id = $2 WHERE practice_id = $1', [at.practiceId, other.practiceId]))).rejects.toMatchObject({
      constraint: 'practice_site_fixed',
    });
    await expect(owner.query('UPDATE practice_site SET id = gen_random_uuid() WHERE practice_id = $1', [at.practiceId])).rejects.toMatchObject({ constraint: 'practice_site_fixed' });
    await expect(owner.query("UPDATE practice_site SET created_at = now() - interval '1 day' WHERE practice_id = $1", [at.practiceId])).rejects.toMatchObject({ constraint: 'practice_site_fixed' });
    await expect(owner.query("UPDATE practice_site SET zip = '0001' WHERE practice_id = $1", [at.practiceId])).rejects.toMatchObject({ code: '23514', constraint: 'practice_site_zip' });
    await expect(owner.query("UPDATE practice_site SET zip_plus_four = '1' WHERE practice_id = $1", [at.practiceId])).rejects.toMatchObject({ constraint: 'practice_site_zip_plus_four' });
    // A second location of the practice: one per practice until the multi-site pull request.
    await expect(inScope(() => owner.query("INSERT INTO practice_site (practice_id, zip) VALUES ($1, '00011')", [at.practiceId]))).rejects.toMatchObject({
      code: '23505',
      constraint: 'practice_site_one_per_practice',
    });
    const before = (await siteOf(at.practiceId))[0]?.updated_at;
    await owner.query("UPDATE practice_site SET zip = '00012', zip_plus_four = '5000', updated_at = '2020-01-01' WHERE practice_id = $1", [at.practiceId]);
    expect((await siteOf(at.practiceId))[0]?.updated_at.getTime()).toBeGreaterThan(before?.getTime() ?? Infinity);
  });

  it('gives the application role SELECT in a practice’s scope alone: no write of a location, and no write of practice.zip', async () => {
    await withPracticeScope(app, { actorId: world.adminUserId, practiceIds: [world.practiceId] }, async (scope) => {
      expect((await scope.client.query('SELECT practice_id, zip, zip_plus_four FROM practice_site')).rows).toEqual([{ practice_id: world.practiceId, zip: '00011', zip_plus_four: null }]);
      for (const statement of [
        "INSERT INTO practice_site (practice_id, zip) VALUES ($1, '00012')",
        "UPDATE practice_site SET zip = '00012' WHERE practice_id = $1",
        'DELETE FROM practice_site WHERE practice_id = $1',
        "UPDATE practice SET zip = '27601' WHERE id = $1",
      ]) {
        await scope.client.query('SAVEPOINT probe');
        await expect(scope.client.query(statement, [world.practiceId]), statement).rejects.toMatchObject({ code: '42501' });
        await scope.client.query('ROLLBACK TO SAVEPOINT probe');
      }
    });
    const group = await createOrganization(owner, 'group', 'zip column');
    await memberOf(group, 'practice_admin');
    await expect(
      withActor(app, platformAdmin, (scope) =>
        scope.client.query("INSERT INTO practice (id, organization_id, name, zip, data_key_ref) VALUES ($1, $2, 'SYNTHETIC', '27601', 'local:v1:AAAA')", [randomUUID(), group]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    const privileges = await owner.query<{ insert: boolean; update: boolean; delete: boolean; truncate: boolean; select: boolean; zip_insert: boolean; zip_update: boolean }>(
      `SELECT has_table_privilege($1, 'practice_site', 'INSERT') AS insert, has_table_privilege($1, 'practice_site', 'UPDATE') AS update,
              has_table_privilege($1, 'practice_site', 'DELETE') AS delete, has_table_privilege($1, 'practice_site', 'TRUNCATE') AS truncate,
              has_table_privilege($1, 'practice_site', 'SELECT') AS select,
              has_column_privilege($1, 'practice', 'zip', 'INSERT') AS zip_insert, has_column_privilege($1, 'practice', 'zip', 'UPDATE') AS zip_update`,
      [APP_ROLE],
    );
    expect(privileges.rows).toEqual([{ insert: false, update: false, delete: false, truncate: false, select: true, zip_insert: false, zip_update: false }]);
    for (const role of [OPERATOR_ROLE, BILLING_ROLE, ESIGN_ROLE]) {
      const held = await owner.query<{ any: boolean }>("SELECT has_any_column_privilege($1, 'practice_site', 'SELECT') OR has_table_privilege($1, 'practice_site', 'INSERT') AS any", [role]);
      expect(held.rows, role).toEqual([{ any: false }]);
    }
  });
});

describe('the run guard and the split, as the application role (PRC-23, PRC-24)', () => {
  let manager: string;

  beforeAll(async () => {
    manager = await memberOf(world.organizationId, 'billing_manager');
  });

  it('pins no split before one is approved, and the split’s read then returns no row', async () => {
    const run = await personRun(manager, world.practiceId);
    expect(run?.place_of_service_split_id).toBeNull();
    const read = await withPracticeScope(app, { actorId: manager, practiceIds: [world.practiceId] }, (scope) => scope.client.query('SELECT * FROM pricing_run_split($1)', [run?.id]));
    expect(read.rows).toEqual([]);
  });

  it('pins the split in force on a person’s run and on a job’s, and reads it back to the run’s own practice alone', async () => {
    const first = await approveSplit(SPLIT);
    const person = await personRun(manager, world.practiceId);
    const job = await jobRun(world.practiceId);
    expect([person?.place_of_service_split_id, job?.place_of_service_split_id]).toEqual([first, first]);
    const readAs = (practiceIds: readonly string[], actorId: string, run: string | undefined) =>
      withPracticeScope(app, { actorId, practiceIds }, async (scope) => (await scope.client.query<{ place_of_service_split_id: string; settings: object }>('SELECT place_of_service_split_id, settings FROM pricing_run_split($1)', [run])).rows);
    expect(await readAs([world.practiceId], manager, person?.id)).toEqual([{ place_of_service_split_id: first, settings: SPLIT }]);
    // With the time it was approved, which the re-run's diff names (review of PR 6b-2, finding 16).
    const approvedAt = (await owner.query<{ approved_at: Date }>('SELECT approved_at FROM place_of_service_split WHERE id = $1', [first])).rows[0]?.approved_at;
    expect(
      await withPracticeScope(app, { actorId: manager, practiceIds: [world.practiceId] }, async (scope) => (await scope.client.query<{ approved_at: Date }>('SELECT approved_at FROM pricing_run_split($1)', [person?.id])).rows),
    ).toEqual([{ approved_at: approvedAt }]);
    // The worker's read, in the job's scope.
    expect(
      (await withJobScope(worker, { jobId: randomUUID(), practiceId: world.practiceId }, (scope) => scope.client.query('SELECT place_of_service_split_id FROM pricing_run_split($1)', [job?.id]))).rows,
    ).toEqual([{ place_of_service_split_id: first }]);
    // Another practice's scope reads nothing of this run.
    expect(await readAs([other.practiceId], other.adminUserId, person?.id)).toEqual([]);
    expect((await withJobScope(worker, { jobId: randomUUID(), practiceId: other.practiceId }, (scope) => scope.client.query('SELECT * FROM pricing_run_split($1)', [job?.id]))).rows).toEqual([]);
    // A later approval is in force for the next run; the earlier run keeps the split it pinned.
    const later = await approveSplit(LATER_SPLIT);
    const next = await personRun(manager, world.practiceId);
    expect(next?.place_of_service_split_id).toBe(later);
    expect(await readAs([world.practiceId], manager, person?.id)).toEqual([{ place_of_service_split_id: first, settings: SPLIT }]);
    expect(await readAs([world.practiceId], manager, next?.id)).toEqual([{ place_of_service_split_id: later, settings: LATER_SPLIT }]);
  });

  it('refuses a run that names its split, and keeps the split it pinned', async () => {
    const [earliest] = (await owner.query<{ id: string }>('SELECT id FROM place_of_service_split ORDER BY approved_at, id LIMIT 1')).rows;
    // The application role holds no privilege on the column.
    await expect(
      withPracticeScope(app, { actorId: manager, practiceIds: [world.practiceId] }, (scope) =>
        scope.client.query(
          `INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by, place_of_service_split_id)
           VALUES ($1, '2026-03-01', '2026-03-31', current_rule_release(), 'phase-two/2', app_actor_id(), $2)`,
          [world.practiceId, earliest?.id],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    // Nor does the owner pin another than the split in force.
    await expect(
      asOwner(
        owner,
        [world.practiceId],
        () =>
          owner.query(
            `INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by, place_of_service_split_id)
             VALUES ($1, '2026-03-01', '2026-03-31', current_rule_release(), 'phase-two/2', $2, $3)`,
            [world.practiceId, manager, earliest?.id],
          ),
        manager,
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'pricing_run_split_pinned' });
    const run = await personRun(manager, world.practiceId);
    await expect(asOwner(owner, [world.practiceId], () => owner.query('UPDATE pricing_run SET place_of_service_split_id = $2 WHERE id = $1', [run?.id, earliest?.id]))).rejects.toMatchObject({
      code: '23514',
    });
    await expect(asOwner(owner, [world.practiceId], () => owner.query('UPDATE pricing_run SET place_of_service_split_id = NULL WHERE id = $1', [run?.id]))).rejects.toMatchObject({ code: '23514' });
    await expect(
      withPracticeScope(app, { actorId: manager, practiceIds: [world.practiceId] }, (scope) => scope.client.query('UPDATE pricing_run SET place_of_service_split_id = NULL WHERE id = $1', [run?.id])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('refuses a run of a practice with no location, re-runs included, and creates one whose ZIP needs its ZIP+4', async () => {
    const legacyGroup = await createOrganization(owner, 'group', 'legacy');
    await memberOf(legacyGroup, 'practice_admin');
    const legacy = await legacyPracticeWithoutLocation(legacyGroup);
    const legacyManager = await memberOf(legacyGroup, 'billing_manager');
    await expect(personRun(legacyManager, legacy)).rejects.toMatchObject({ code: '23514', constraint: 'pricing_run_location_missing' });
    await expect(jobRun(legacy)).rejects.toMatchObject({ code: '23514', constraint: 'pricing_run_location_missing' });
    // From another practice's scope the run is the tenant policy's to refuse, and nothing says whether the practice has a location.
    await expect(
      withPracticeScope(app, { actorId: manager, practiceIds: [world.practiceId] }, (scope) =>
        scope.client.query(
          `INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by)
           VALUES ($1, '2026-01-01', '2026-01-31', current_rule_release(), 'phase-two/2', app_actor_id())`,
          [legacy],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501', message: expect.stringMatching(/row-level security/) as string });
    // A complete run from before the migration, priced again: refused the same way.
    const original = randomUUID();
    await owner.query('BEGIN');
    try {
      await owner.query('SET LOCAL session_replication_role = replica');
      await owner.query(
        `INSERT INTO pricing_run (id, practice_id, period_from, period_to, release_no, engine_version, created_by, status, coverage, completed_at)
         VALUES ($1, $2, '2026-01-01', '2026-01-31', 900006, 'phase-two/2', $3, 'complete', '{"lines": 0}', now())`,
        [original, legacy, legacyManager],
      );
      await owner.query('COMMIT');
    } catch (error) {
      await owner.query('ROLLBACK');
      throw error;
    }
    await expect(
      withPracticeScope(app, { actorId: legacyManager, practiceIds: [legacy] }, (scope) =>
        scope.client.query(
          `INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by, rerun_of_id, lines_loaded_by)
           SELECT r.practice_id, r.period_from, r.period_to, current_rule_release(), 'phase-two/2', app_actor_id(), r.id, r.created_at FROM pricing_run r WHERE r.id = $1`,
          [original],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'pricing_run_location_missing' });
    // A ZIP that needs its ZIP+4 and has none still gets its run: the run prices, and fails only if a line needs the location.
    const flagged = await practiceAt('00012', null);
    const flaggedManager = await memberOf(flagged.organizationId, 'billing_manager');
    expect(await personRun(flaggedManager, flagged.practiceId)).toEqual({ id: expect.any(String) as string, place_of_service_split_id: expect.any(String) as string });
  });
});

describe('every function of the migration, by its exact name: the definer flag, no PUBLIC EXECUTE, and exactly its grants', () => {
  it('matches the migration’s list', async () => {
    const expected: Readonly<Record<string, { readonly definer: boolean; readonly grantees: readonly string[] }>> = {
      'locality_status(integer,text,text,date,date)': { definer: false, grantees: [APP_ROLE] },
      'practice_location_status(uuid,integer,date,date)': { definer: false, grantees: [APP_ROLE] },
      'practice_set_location(uuid,text,text)': { definer: true, grantees: [APP_ROLE] },
      'practice_confirm_location(uuid,text,text)': { definer: true, grantees: [APP_ROLE] },
      'console_set_practice_location(uuid,text,text)': { definer: true, grantees: [APP_ROLE] },
      'console_practice_settings(uuid)': { definer: true, grantees: [APP_ROLE] },
      'console_set_practice_settings(uuid,text,jsonb)': { definer: true, grantees: [APP_ROLE] },
      'place_of_service_split_in_force()': { definer: true, grantees: [APP_ROLE] },
      'pricing_run_split(uuid)': { definer: true, grantees: [APP_ROLE] },
      'console_place_of_service_splits()': { definer: true, grantees: [APP_ROLE] },
      'console_approve_place_of_service_split(jsonb)': { definer: true, grantees: [APP_ROLE] },
      'screening_status()': { definer: true, grantees: [APP_ROLE] },
      'rule_release_content_span(integer)': { definer: false, grantees: [APP_ROLE] },
      'place_of_service_split_valid(jsonb)': { definer: false, grantees: [] },
      'practice_site_rules()': { definer: false, grantees: [] },
      'practice_site_required()': { definer: true, grantees: [] },
      'pricing_run_rules()': { definer: false, grantees: [] },
      'screening_band_days(text)': { definer: false, grantees: [] },
      // Recreated by migration 20261106090000 with the receipt and the account's keyed subject before the request, and by
      // 20261107090000 with the client's keyed subject after it (Q10 (a)).
      'submit_screening(text,text,text,text,text,text[],text[],integer[],text[],text[],text[],bigint[],integer[],integer,integer,bigint,integer,bigint,bigint,text,text,text,text,text,text,text,text,timestamp with time zone,text,text,text)':
        { definer: true, grantees: [APP_ROLE] },
      'screening_result_summary(text)': { definer: true, grantees: [APP_ROLE] },
      // The screening consumer's too since migration 20261106090000; the operator's for its one-release overlap.
      'operator_screening_claim(uuid)': { definer: true, grantees: [OPERATOR_ROLE, SCREENING_ROLE] },
      'operator_screening_release(uuid)': { definer: true, grantees: [OPERATOR_ROLE, SCREENING_ROLE] },
      'operator_screening_run_records(uuid)': { definer: true, grantees: [OPERATOR_ROLE, SCREENING_ROLE] },
      'screening_rejection_valid(jsonb)': { definer: false, grantees: [] },
      'screening_refusal_codes_valid(text[])': { definer: false, grantees: [] },
      'screening_labels_version()': { definer: false, grantees: [] },
    };
    const { rows } = await owner.query<{ name: string; definer: boolean; config: string[] | null; grantees: string[]; public: boolean }>(
      `SELECT p.oid::regprocedure::text AS name, p.prosecdef AS definer, p.proconfig AS config,
              ARRAY(SELECT DISTINCT pg_get_userbyid(x.grantee)::text FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                     WHERE x.privilege_type = 'EXECUTE' AND x.grantee <> 0 AND x.grantee <> p.proowner ORDER BY 1) AS grantees,
              EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE') AS public
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.oid::regprocedure::text = ANY ($1) ORDER BY 1`,
      [Object.keys(expected)],
    );
    expect(rows.map((row) => row.name).sort()).toEqual(Object.keys(expected).sort());
    for (const row of rows) {
      const wanted = expected[row.name];
      expect({ definer: row.definer, grantees: row.grantees, public: row.public }, row.name).toEqual({ definer: wanted?.definer, grantees: [...(wanted?.grantees ?? [])].sort(), public: false });
      if (row.definer) {
        expect(row.config, row.name).toEqual(['search_path=pg_catalog, public, pg_temp']);
      }
    }
    // The functions the migration drops or renames are gone.
    const gone = await owner.query<{ name: string }>(
      `SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN ('screening_zip_status', 'screening_split_in_force', 'screening_split_valid', 'console_screening_splits', 'console_approve_screening_split')`,
    );
    expect(gone.rows).toEqual([]);
    // One signature each: the confirmation takes the location the person was shown (verification of PR 6b-2, finding 1).
    for (const name of ['submit_screening', 'practice_confirm_location']) {
      expect((await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM pg_proc WHERE proname = $1', [name])).rows, name).toEqual([{ n: 1 }]);
    }
  });
});
