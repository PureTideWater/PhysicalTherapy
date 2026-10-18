import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withActor, withPracticeScope } from '../authz';
import { readDatabaseUrl } from '../config';
import { type MigratedDatabase, addMembership, asOwner, createMigratedDatabase, createOrganization, createUser, endPool } from '../testing';
import { CiphertextError } from './cipher';
import { LocalKeyProvider } from './key-provider';
import { DataKeyDestroyedError, destroyPracticeDataKey, loadPracticeCipher, provisionPracticeKey } from './practice-keys';

/**
 * Per-practice data keys in the database, and key destruction for the deletion workflow (PRD 16
 * Encryption; test matrix SEC-11 relies on it): once a practice's key is destroyed, none of its
 * ciphertexts can be read, by the practice or anyone else.
 */

let database: MigratedDatabase;
let owner: pg.Client;
let app: pg.Pool;
const provider = LocalKeyProvider.random();

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  app = new pg.Pool({ connectionString: database.appUrl, max: 2 });
});

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

/** A platform administrator creates a practice with a fresh data key, once its administrator is invited. */
async function practiceWithKey(): Promise<{ practiceId: string; adminUserId: string }> {
  const internal = await createOrganization(owner, 'internal');
  const platformAdmin = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, platformAdmin, 'platform_admin');
  const group = await createOrganization(owner, 'group');
  // The group's administrator first: a practice always has one (PRD 3).
  const adminUserId = await createUser(owner);
  await addMembership(owner, group, adminUserId, 'practice_admin');
  const practiceId = randomUUID();
  const { dataKeyRef } = await provisionPracticeKey(provider, practiceId);
  await withActor(app, platformAdmin, (scope) =>
    scope.client.query("INSERT INTO practice (id, organization_id, name, data_key_ref) VALUES ($1, $2, 'SYNTHETIC KEYED PRACTICE', $3)", [practiceId, group, dataKeyRef]),
  );
  return { practiceId, adminUserId };
}

describe('practice data keys', () => {
  it('opens the practice’s cipher inside its scope, and only there', async () => {
    const { practiceId, adminUserId } = await practiceWithKey();
    const sealed = await withPracticeScope(app, { actorId: adminUserId, practiceIds: [practiceId] }, async (scope) => {
      const cipher = await loadPracticeCipher(scope, provider, practiceId);
      return cipher.encrypt('patient_ref.last_name', 'SYNTHETIC');
    });
    const other = await practiceWithKey();
    await expect(
      withPracticeScope(app, { actorId: other.adminUserId, practiceIds: [practiceId] }, (scope) => loadPracticeCipher(scope, provider, practiceId)),
    ).rejects.toThrow(/not in this scope/);
    const otherCipher = await withPracticeScope(app, { actorId: other.adminUserId, practiceIds: [other.practiceId] }, (scope) =>
      loadPracticeCipher(scope, provider, other.practiceId),
    );
    expect(() => otherCipher.decrypt('patient_ref.last_name', sealed)).toThrow(CiphertextError);
  });

  it('makes every ciphertext unreadable once the key is destroyed', async () => {
    const { practiceId, adminUserId } = await practiceWithKey();
    const sealed = await withPracticeScope(app, { actorId: adminUserId, practiceIds: [practiceId] }, async (scope) => {
      const cipher = await loadPracticeCipher(scope, provider, practiceId);
      return ['SYNTHETIC', 'TWIN', '1950-01-01', 'SYN000000001'].map((value) => cipher.encrypt('patient_ref.member_id', value));
    });
    const requestId = `deletion-${randomUUID()}`;
    await expect(destroyPracticeDataKey(owner, practiceId, requestId)).resolves.toBe(true);
    await expect(destroyPracticeDataKey(owner, practiceId, requestId)).resolves.toBe(false);

    const stored = await owner.query<{ data_key_ref: string | null; status: string }>('SELECT data_key_ref, status FROM practice WHERE id = $1', [practiceId]);
    expect(stored.rows).toEqual([{ data_key_ref: null, status: 'deleted' }]);
    await expect(withPracticeScope(app, { actorId: adminUserId, practiceIds: [practiceId] }, (scope) => loadPracticeCipher(scope, provider, practiceId))).rejects.toThrow(
      DataKeyDestroyedError,
    );
    // No other key in the system opens them: not a new key for the same practice, not another practice's.
    const replacement = await provisionPracticeKey(provider, practiceId);
    for (const value of sealed) {
      expect(() => replacement.cipher.decrypt('patient_ref.member_id', value)).toThrow(CiphertextError);
    }
    const audit = await owner.query('SELECT actor_kind, action, object_id FROM audit_event WHERE request_id = $1', [requestId]);
    expect(audit.rows).toEqual([{ actor_kind: 'system', action: 'data_key_destroyed', object_id: practiceId }]);
  });

  it('refuses a practice without a data key unless it is deleted', async () => {
    const group = await createOrganization(owner, 'group');
    const practiceId = randomUUID();
    await expect(
      asOwner(owner, [practiceId], () => owner.query("INSERT INTO practice (id, organization_id, name) VALUES ($1, $2, 'SYNTHETIC KEYLESS')", [practiceId, group])),
    ).rejects.toThrow(/practice_has_data_key/);
  });
});
