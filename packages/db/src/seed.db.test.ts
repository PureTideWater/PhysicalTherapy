import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withActor, withPracticeScope } from './authz';
import { readDatabaseUrl } from './config';
import { LocalKeyProvider } from './crypto/key-provider';
import { openPracticeCipher } from './crypto/practice-keys';
import { type SeedPerson, SeedError, seedSyntheticTenancy } from './seed';
import { type MigratedDatabase, createMigratedDatabase } from './testing';

/** The synthetic seed (pnpm db:seed): every persona, the practices, their agreements and the firm's grant. */

let database: MigratedDatabase;
let owner: pg.Client;
let app: pg.Pool;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  app = new pg.Pool({ connectionString: database.appUrl, max: 2 });
});

afterAll(async () => {
  await app.end();
  await owner.end();
  await database.drop();
});

const person = (key: string, organization: SeedPerson['organization'], role: SeedPerson['role'], invited = false): SeedPerson => ({
  key,
  email: `${key}@synthetic.test`,
  sub: randomUUID(),
  organization,
  role,
  invited,
});

const PEOPLE: readonly SeedPerson[] = [
  person('practice-admin', 'group', 'practice_admin'),
  person('viewer', 'group', 'viewer'),
  person('invited', 'group', 'viewer', true),
  person('other-admin', 'other_group', 'practice_admin'),
  person('firm-principal', 'firm', 'firm_principal'),
  person('platform-admin', 'internal', 'platform_admin'),
];

describe('seedSyntheticTenancy', () => {
  it('creates the organizations, practices with data keys and agreements, the people and the firm’s grant', async () => {
    const keys = LocalKeyProvider.random();
    const seeded = await seedSyntheticTenancy(owner, PEOPLE, keys);
    const at = (key: string) => seeded.users[key] ?? '';
    expect((await withActor(app, at('practice-admin'), (scope) => scope.allowedPracticeIds())).sort()).toEqual([seeded.practices.north, seeded.practices.south].sort());
    expect(await withActor(app, at('other-admin'), (scope) => scope.allowedPracticeIds())).toEqual([seeded.practices.other]);
    expect(await withActor(app, at('firm-principal'), (scope) => scope.allowedPracticeIds())).toEqual([seeded.practices.north]);
    expect(await withActor(app, at('platform-admin'), (scope) => scope.allowedPracticeIds())).toEqual([]);
    expect(await withActor(app, at('invited'), (scope) => scope.allowedPracticeIds())).toEqual([]);
    await withPracticeScope(app, { actorId: at('practice-admin'), practiceIds: [seeded.practices.north] }, async (scope) => {
      const agreements = await scope.client.query<{ kind: string }>('SELECT kind FROM agreement WHERE practice_id = $1 ORDER BY kind, organization_id', [seeded.practices.north]);
      expect(agreements.rows.map((row) => row.kind)).toEqual(['baa', 'engagement', 'engagement']);
      const practice = await scope.client.query<{ data_key_ref: string }>('SELECT data_key_ref FROM practice WHERE id = $1', [seeded.practices.north]);
      await expect(openPracticeCipher(keys, seeded.practices.north, practice.rows[0]?.data_key_ref ?? null)).resolves.toBeDefined();
    });
    const users = await owner.query<{ status: string; mfa_enrolled: boolean; hardware_key_required: boolean; email: string }>(
      'SELECT email, status, mfa_enrolled, hardware_key_required FROM "user" ORDER BY email',
    );
    expect(users.rows).toContainEqual({ email: 'invited@synthetic.test', status: 'invited', mfa_enrolled: false, hardware_key_required: false });
    expect(users.rows).toContainEqual({ email: 'platform-admin@synthetic.test', status: 'active', mfa_enrolled: true, hardware_key_required: true });
  });

  it('refuses to seed the same database twice', async () => {
    await expect(seedSyntheticTenancy(owner, PEOPLE, LocalKeyProvider.random())).rejects.toThrow(SeedError);
  });

  it('needs an active practice administrator for the group', async () => {
    const fresh = await createMigratedDatabase(readDatabaseUrl());
    const client = new pg.Client({ connectionString: fresh.url });
    await client.connect();
    try {
      await expect(seedSyntheticTenancy(client, [person('viewer', 'group', 'viewer')], LocalKeyProvider.random())).rejects.toThrow('needs an active practice administrator');
    } finally {
      await client.end();
      await fresh.drop();
    }
  });
});
