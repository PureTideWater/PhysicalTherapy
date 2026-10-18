import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DataKeyDestroyedError,
  DataKeyError,
  type DatabaseClient,
  type DatabasePool,
  type DatabasePoolClient,
  LocalKeyProvider,
  type PracticeScope,
  databaseClient,
  destroyPracticeDataKey,
  loadPracticeCipher,
  openPool,
  provisionPracticeKey,
  readDatabaseUrl,
  withJobScope,
} from '@tp/db';
import { type MigratedDatabase, type TenantWorld, createMigratedDatabase, createTenantWorld, endPool } from '@tp/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LocalByteStore, PracticeObjectStore } from './practice-objects';

/**
 * Per-practice encryption of stored objects against a real database (PRD 16 Encryption: "S3
 * server-side encryption with per-practice data keys ... data keys destroyed on deletion"; PRD 6
 * Data lifecycle: "a deletion test leaves no readable object for the practice"; test matrix SEC-11;
 * docs/adr/0018): a job seals its practice's objects with that practice's key, which it can open only
 * in that practice's scope; another practice's job cannot open them; and once the key is destroyed,
 * the objects are still stored but nobody can read them.
 */

const JOB_A = '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382701';
const JOB_B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c04';
const KEY = 'documents/0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';
const BODY = Buffer.from('ISA*00*          *00*          *ZZ*SYNTHSENDER    *ZZ*SYNTHRECEIVER  ~GS*HP*SYNTH~ST*835*0001~', 'utf8');

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let keys: LocalKeyProvider;
let practiceA: TenantWorld;
let practiceB: TenantWorld;
let root: string;
let store: PracticeObjectStore;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 2);
  keys = LocalKeyProvider.random();
  practiceA = await createTenantWorld(owner, 'objects A');
  practiceB = await createTenantWorld(owner, 'objects B');
  // Real wrapped data keys in place of the worlds' placeholders (set as the superuser).
  for (const world of [practiceA, practiceB]) {
    const { dataKeyRef } = await provisionPracticeKey(keys, world.practiceId);
    await owner.query('UPDATE practice SET data_key_ref = $2 WHERE id = $1', [world.practiceId, dataKeyRef]);
  }
  root = mkdtempSync(path.join(tmpdir(), 'practice-objects-db-'));
  store = new PracticeObjectStore(new LocalByteStore(root));
});

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
  rmSync(root, { recursive: true, force: true });
});

function asJob<T>(jobId: string, practiceId: string, run: (scope: PracticeScope<DatabasePoolClient>) => Promise<T>): Promise<T> {
  return withJobScope(app, { jobId, practiceId }, run);
}

describe('a practice’s stored objects', () => {
  it('are sealed with the practice’s key by its own job and opened only in its scope', async () => {
    await asJob(JOB_A, practiceA.practiceId, async (scope) => store.put(await loadPracticeCipher(scope, keys, practiceA.practiceId), KEY, BODY));
    expect(readFileSync(path.join(root, KEY)).includes(Buffer.from('SYNTHSENDER'))).toBe(false);
    const opened = await asJob(JOB_A, practiceA.practiceId, async (scope) => store.get(await loadPracticeCipher(scope, keys, practiceA.practiceId), KEY));
    expect(opened.equals(BODY)).toBe(true);
    // Practice B's job cannot even load A's key, and B's own key does not open A's object.
    await expect(asJob(JOB_B, practiceB.practiceId, (scope) => loadPracticeCipher(scope, keys, practiceA.practiceId))).rejects.toThrow(DataKeyError);
    await expect(asJob(JOB_B, practiceB.practiceId, async (scope) => store.get(await loadPracticeCipher(scope, keys, practiceB.practiceId), KEY))).rejects.toThrow();
  });

  it('leave nothing readable once the practice’s data key is destroyed (SEC-11)', async () => {
    expect(await destroyPracticeDataKey(owner, practiceA.practiceId, `job-${JOB_A}`)).toBe(true);
    // The sealed bytes are still there; no key opens them, for the practice or anyone else.
    expect(readdirSync(path.join(root, 'documents'))).toEqual([path.basename(KEY)]);
    await expect(asJob(JOB_A, practiceA.practiceId, (scope) => loadPracticeCipher(scope, keys, practiceA.practiceId))).rejects.toThrow(DataKeyDestroyedError);
    const { rows } = await owner.query<{ data_key_ref: string | null; status: string }>('SELECT data_key_ref, status FROM practice WHERE id = $1', [practiceA.practiceId]);
    expect(rows).toEqual([{ data_key_ref: null, status: 'deleted' }]);
  });
});
