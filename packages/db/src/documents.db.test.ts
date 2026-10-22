import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { assertNoPhi } from '@tp/observability';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withJobScope, withPracticeScope } from './authz';
import { readDatabaseUrl } from './config';
import { DOCUMENT_KINDS, ERA_FORMAT_IDS, documentObjectKey } from './schema';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createPracticeWithLocation, createTenantWorld, createUser, endPool } from './testing';

/**
 * The rules of migrations 20261016090000 (source_document, payer, plan), 20261017090000 (the malware
 * gate and the uploader) and 20261102090000 (the ERA export kind and its vendor format; docs/adr/0060) against
 * the application role (PRD 6, Agreements: "no upload without a BAA";
 * Intake and documents; PRD 8: one row per upload even for duplicates; PRD 10: the practice's own
 * prefix, "Malware scan result must be clean"; test matrix PAR-06, PAR-28, PAR-30, SEC-08). The catalog
 * test and the generated cross-tenant tests cover the tenant policies themselves.
 */

let database: MigratedDatabase;
let owner: pg.Client;
let app: pg.Pool;
let north: TenantWorld;
let other: TenantWorld;
let manager: string;
/** A practice of north's group with no agreement on file yet (J1). */
let unsigned: string;

const sha = () => randomBytes(32).toString('hex');

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  app = new pg.Pool({ connectionString: database.appUrl, max: 4 });
  north = await createTenantWorld(owner, 'north');
  other = await createTenantWorld(owner, 'other');
  manager = await createUser(owner);
  await addMembership(owner, north.organizationId, manager, 'billing_manager');
  unsigned = randomUUID();
  await asOwner(owner, [unsigned], () => createPracticeWithLocation(owner, { id: unsigned, organizationId: north.organizationId, name: 'SYNTHETIC UNSIGNED PRACTICE' }));
});

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

/** Runs `sql` as the application role for `actorId` with `practiceIds` in scope, rolled back. */
async function asApp(actorId: string, practiceIds: readonly string[], sql: string, values: unknown[] = []): Promise<pg.QueryResult> {
  const client = await app.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [actorId, `{${practiceIds.join(',')}}`]);
    return await client.query(sql, values);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

const INSERT = `INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by, parent_document_id)
                VALUES ($1, $2, 'x12_835', 1200, 'application/octet-stream', $3, $4) RETURNING s3_key, status, scan_status, retention_class`;

/** A document the manager uploads to north, committed. */
async function upload(): Promise<string> {
  const id = randomUUID();
  await withPracticeScope(app, { actorId: manager, practiceIds: [north.practiceId] }, (scope) => scope.client.query(INSERT, [id, north.practiceId, manager, null]));
  return id;
}

describe('source_document', () => {
  it('records an upload with an opaque key inside the practice’s prefix, awaiting its bytes', async () => {
    const id = randomUUID();
    const { rows } = await withPracticeScope(app, { actorId: manager, practiceIds: [north.practiceId] }, (scope) => scope.client.query<{ s3_key: string }>(INSERT, [id, north.practiceId, manager, null]));
    expect(rows).toEqual([{ s3_key: documentObjectKey(north.practiceId, id), status: 'awaiting_upload', scan_status: 'pending', retention_class: 'records' }]);
    expect(() => {
      assertNoPhi('s3_key', String(rows[0]?.s3_key));
    }).not.toThrow();
    // The key is generated: nobody writes one.
    await expect(asApp(manager, [north.practiceId], "UPDATE source_document SET s3_key = 'elsewhere' WHERE id = $1", [id])).rejects.toMatchObject({ code: '428C9' });
  });

  it('refuses an upload until the practice’s BAA is on file, and says so through practice_baa_on_file (J1)', async () => {
    const pool = (practiceId: string) => asApp(north.adminUserId, [practiceId], 'SELECT practice_baa_on_file($1) AS open', [practiceId]);
    expect((await pool(north.practiceId)).rows).toEqual([{ open: true }]);
    expect((await pool(unsigned)).rows).toEqual([{ open: false }]);
    await expect(asApp(north.adminUserId, [unsigned], INSERT, [randomUUID(), unsigned, north.adminUserId, null])).rejects.toMatchObject({ code: '42501', message: expect.stringMatching(/row-level security/) });
    // Only a practice in the transaction's scope gets an answer.
    expect((await asApp(north.adminUserId, [unsigned], 'SELECT practice_baa_on_file($1) AS open', [north.practiceId])).rows).toEqual([{ open: false }]);
  });

  it('counts only a BAA the practice’s own group signed, for the practice or the whole group', async () => {
    const practiceId = randomUUID();
    await asOwner(owner, [practiceId], async () => {
      await createPracticeWithLocation(owner, { id: practiceId, organizationId: north.organizationId, name: 'SYNTHETIC SECOND PRACTICE' });
      await owner.query(
        `INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256) VALUES ($1, $2, 'engagement', '1', now(), 'SYNTHETIC SIGNER', 'esign:synthetic-e', $3)`,
        [north.organizationId, practiceId, sha()],
      );
      // Another organization's BAA naming the practice is not the practice's own.
      await owner.query(
        `INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256) VALUES ($1, $2, 'baa', '1', now(), 'SYNTHETIC SIGNER', 'esign:synthetic-x', $3)`,
        [other.organizationId, practiceId, sha()],
      );
    });
    const open = async () => (await asApp(north.adminUserId, [practiceId], 'SELECT practice_baa_on_file($1) AS open', [practiceId])).rows[0] as { open: boolean } | undefined;
    expect(await open()).toEqual({ open: false });
    await asOwner(owner, [], () =>
      owner.query(
        `INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256) VALUES ($1, NULL, 'baa', '2', now(), 'SYNTHETIC SIGNER', 'esign:synthetic-g', $2)`,
        [north.organizationId, sha()],
      ),
    );
    expect(await open()).toEqual({ open: true });
  });

  it('records a top-level upload only in the acting user’s name; a zip’s entries carry the zip’s uploader', async () => {
    await expect(asApp(north.adminUserId, [north.practiceId], INSERT, [randomUUID(), north.practiceId, manager, null])).rejects.toMatchObject({ code: '42501' });
    const zip = await upload();
    // The worker, acting as its job, expands the zip in the practice's scope.
    const entry = randomUUID();
    await withJobScope(app, { jobId: randomUUID(), practiceId: north.practiceId }, (scope) => scope.client.query(INSERT, [entry, north.practiceId, manager, zip]));
    await expect(withJobScope(app, { jobId: randomUUID(), practiceId: north.practiceId }, (scope) => scope.client.query(INSERT, [randomUUID(), north.practiceId, manager, null]))).rejects.toMatchObject({
      code: '42501',
    });
    // An entry of an entry, an entry of another practice's document, and a document its own entry are refused.
    await expect(withJobScope(app, { jobId: randomUUID(), practiceId: north.practiceId }, (scope) => scope.client.query(INSERT, [randomUUID(), north.practiceId, manager, entry]))).rejects.toMatchObject({
      code: '23514',
    });
    const otherDocument = randomUUID();
    await withPracticeScope(app, { actorId: other.adminUserId, practiceIds: [other.practiceId] }, (scope) => scope.client.query(INSERT, [otherDocument, other.practiceId, other.adminUserId, null]));
    await expect(withJobScope(app, { jobId: randomUUID(), practiceId: north.practiceId }, (scope) => scope.client.query(INSERT, [randomUUID(), north.practiceId, manager, otherDocument]))).rejects.toMatchObject({
      code: '23514',
    });
    const self = randomUUID();
    await expect(asApp(manager, [north.practiceId], INSERT, [self, north.practiceId, manager, self])).rejects.toMatchObject({ code: '23514' });
  });

  it('fixes a document’s hash once recorded, never takes a scan verdict back, and deletes nothing', async () => {
    const id = await upload();
    const hash = sha();
    await withJobScope(app, { jobId: randomUUID(), practiceId: north.practiceId }, (scope) =>
      scope.client.query("UPDATE source_document SET sha256 = $2, scan_status = 'clean', scan_at = now(), status = 'scanned' WHERE id = $1", [id, hash]),
    );
    await expect(asApp(manager, [north.practiceId], 'UPDATE source_document SET sha256 = $2 WHERE id = $1', [id, sha()])).rejects.toMatchObject({ code: '23514' });
    await expect(asApp(manager, [north.practiceId], "UPDATE source_document SET scan_status = 'pending', scan_at = NULL WHERE id = $1", [id])).rejects.toMatchObject({ code: '23514' });
    await expect(asApp(manager, [north.practiceId], "UPDATE source_document SET scan_status = 'clean', scan_at = NULL WHERE id = $1", [id])).rejects.toMatchObject({ code: '23514' });
    await expect(asApp(manager, [north.practiceId], 'DELETE FROM source_document WHERE id = $1', [id])).rejects.toMatchObject({ code: '42501' });
    for (const column of ['kind', 'size_bytes', 'content_type', 'uploaded_by', 'parent_document_id', 'retention_class', 'practice_id']) {
      await expect(asApp(manager, [north.practiceId], `UPDATE source_document SET ${column} = ${column} WHERE id = $1`, [id]), column).rejects.toMatchObject({ code: '42501' });
    }
    expect((await asApp(manager, [north.practiceId], 'UPDATE source_document SET status = $2 WHERE id = $1', [id, 'parse_queued'])).rowCount).toBe(1);
  });

  it('never records an entry of a zip in another person’s name, whoever inserts it', async () => {
    const zip = await upload();
    // The manager (a user, not intake) names the practice administrator as the uploader of an entry of the manager's own zip.
    await expect(asApp(manager, [north.practiceId], INSERT, [randomUUID(), north.practiceId, north.adminUserId, zip])).rejects.toMatchObject({
      code: '23514',
      message: expect.stringMatching(/uploader/),
    });
    await expect(withJobScope(app, { jobId: randomUUID(), practiceId: north.practiceId }, (scope) => scope.client.query(INSERT, [randomUUID(), north.practiceId, north.adminUserId, zip]))).rejects.toMatchObject({
      code: '23514',
    });
  });

  it('inserts a document only unscanned and unhashed: an upload awaiting its bytes, an entry received or held', async () => {
    const insert = (columns: string, values: string, parent: string | null) =>
      asApp(manager, [north.practiceId], `INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by, parent_document_id, ${columns}) VALUES ($1, $2, 'x12_835', 1200, 'application/octet-stream', $3, $4, ${values})`, [
        randomUUID(),
        north.practiceId,
        manager,
        parent,
      ]);
    // A top-level document inserted clean and scanned would skip the malware scan.
    await expect(insert('scan_status, scan_at, status', "'clean', now(), 'scanned'", null)).rejects.toMatchObject({ code: '42501' });
    await expect(insert('scan_status, scan_at, status', "'clean', now(), 'stored'", null)).rejects.toMatchObject({ code: '42501' });
    await expect(insert('status', "'received'", null)).rejects.toMatchObject({ code: '42501' });
    await expect(insert('sha256', `'${sha()}'`, null)).rejects.toMatchObject({ code: '42501' });
    const zip = await upload();
    await withJobScope(app, { jobId: randomUUID(), practiceId: north.practiceId }, (scope) =>
      scope.client.query("UPDATE source_document SET scan_status = 'clean', scan_at = now(), status = 'scanned' WHERE id = $1", [zip]),
    );
    // Even under a clean zip, an entry is inserted unscanned: the job records its verdict after.
    await expect(insert('scan_status, scan_at, status', "'clean', now(), 'received'", zip)).rejects.toMatchObject({ code: '42501' });
    expect((await insert('status', "'too_large'", zip)).rowCount).toBe(1);
    expect((await insert('status', "'received'", zip)).rowCount).toBe(1);
  });

  it('scans and queues for parse only a clean document, never clears a malware finding, and keeps quarantined and duplicate documents so', async () => {
    const job = (sql: string, values: unknown[]) => withJobScope(app, { jobId: randomUUID(), practiceId: north.practiceId }, (scope) => scope.client.query(sql, values));
    const pending = await upload();
    for (const status of ['scanned', 'parse_queued']) {
      await expect(job('UPDATE source_document SET status = $2 WHERE id = $1', [pending, status]), status).rejects.toMatchObject({ code: '23514', message: expect.stringMatching(/clean/) });
    }
    // A failed scan is no verdict: it can still come back clean.
    await job("UPDATE source_document SET scan_status = 'failed', scan_at = now(), status = 'received' WHERE id = $1", [pending]);
    await expect(job("UPDATE source_document SET status = 'scanned' WHERE id = $1", [pending])).rejects.toMatchObject({ code: '23514' });
    await job("UPDATE source_document SET scan_status = 'clean', status = 'scanned' WHERE id = $1", [pending]);
    for (const finding of ['flagged', 'unscannable']) {
      const id = await upload();
      await job("UPDATE source_document SET scan_status = $2, scan_at = now(), status = 'quarantined' WHERE id = $1", [id, finding]);
      await expect(asApp(manager, [north.practiceId], "UPDATE source_document SET scan_status = 'clean' WHERE id = $1", [id]), finding).rejects.toMatchObject({
        code: '23514',
        message: expect.stringMatching(/never cleared/),
      });
      await expect(job("UPDATE source_document SET scan_status = 'clean', status = 'scanned' WHERE id = $1", [id]), finding).rejects.toMatchObject({ code: '23514' });
      await expect(job("UPDATE source_document SET status = 'received' WHERE id = $1", [id]), finding).rejects.toMatchObject({ code: '23514', message: expect.stringMatching(/stays so/) });
    }
    // A clean document the sniff finds to be an executable is quarantined, and stays so.
    const sniffed = await upload();
    await job("UPDATE source_document SET scan_status = 'clean', scan_at = now(), status = 'received' WHERE id = $1", [sniffed]);
    await job("UPDATE source_document SET scan_status = 'flagged', status = 'quarantined' WHERE id = $1", [sniffed]);
    await expect(job("UPDATE source_document SET status = 'stored' WHERE id = $1", [sniffed])).rejects.toMatchObject({ code: '23514' });
    const duplicate = await upload();
    await job("UPDATE source_document SET scan_status = 'clean', scan_at = now(), status = 'duplicate' WHERE id = $1", [duplicate]);
    await expect(job("UPDATE source_document SET status = 'scanned' WHERE id = $1", [duplicate])).rejects.toMatchObject({ code: '23514', message: expect.stringMatching(/stays so/) });
  });

  it('makes a zip entry clean only when its zip’s malware scan is clean', async () => {
    const job = (sql: string, values: unknown[]) => withJobScope(app, { jobId: randomUUID(), practiceId: north.practiceId }, (scope) => scope.client.query(sql, values));
    const zip = await upload();
    const entry = randomUUID();
    await job(INSERT, [entry, north.practiceId, manager, zip]);
    await expect(job("UPDATE source_document SET scan_status = 'clean', scan_at = now(), status = 'received' WHERE id = $1", [entry])).rejects.toMatchObject({
      code: '23514',
      message: expect.stringMatching(/zip's malware scan/),
    });
    await job("UPDATE source_document SET scan_status = 'clean', scan_at = now(), status = 'scanned' WHERE id = $1", [zip]);
    await job("UPDATE source_document SET scan_status = 'clean', scan_at = now(), status = 'scanned' WHERE id = $1", [entry]);
  });

  it('keeps one first document per practice and bytes; every later one with the same bytes is a duplicate (PAR-06, PAR-30)', async () => {
    const hash = sha();
    const [first, second] = [await upload(), await upload()];
    const claim = (id: string, status: string) =>
      withJobScope(app, { jobId: randomUUID(), practiceId: north.practiceId }, (scope) =>
        scope.client.query("UPDATE source_document SET sha256 = $2, status = $3, scan_status = 'clean', scan_at = now() WHERE id = $1", [id, hash, status]),
      );
    await claim(first, 'scanned');
    await expect(claim(second, 'scanned')).rejects.toMatchObject({ code: '23505' });
    await claim(second, 'duplicate');
    // Another practice's document with the same bytes is its own first.
    const theirs = randomUUID();
    await withPracticeScope(app, { actorId: other.adminUserId, practiceIds: [other.practiceId] }, (scope) => scope.client.query(INSERT, [theirs, other.practiceId, other.adminUserId, null]));
    await withJobScope(app, { jobId: randomUUID(), practiceId: other.practiceId }, (scope) =>
      scope.client.query("UPDATE source_document SET sha256 = $2, status = 'scanned', scan_status = 'clean', scan_at = now() WHERE id = $1", [theirs, hash]),
    );
  });
});

/** The literals of a CHECK of the form `column = ANY (ARRAY[...])`, in order. */
async function checkList(constraint: string): Promise<string[]> {
  const { rows } = await owner.query<{ definition: string }>('SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = $1 AND conrelid = $2::regclass', [
    constraint,
    'source_document',
  ]);
  return [...(rows[0]?.definition ?? '').matchAll(/'([^']*)'::text/g)].map((match) => match[1] as string);
}

const EMR = path.resolve(import.meta.dirname, '../../../fixtures/synthetic/emr');

describe('source_document: the ERA export kind and its vendor format (migration 20261102090000; docs/adr/0060)', () => {
  const insertAs = (kind: string, formatId: string | null, parent: string | null = null) =>
    asApp(manager, [north.practiceId], `INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by, parent_document_id, format_id) VALUES ($1, $2, $3, 1200, 'text/csv', $4, $5, $6) RETURNING format_id`, [
      randomUUID(),
      north.practiceId,
      kind,
      manager,
      parent,
      formatId,
    ]);

  it('keeps the kind CHECK in DOCUMENT_KINDS’ order, x12_835 first, and the format CHECK equal to ERA_FORMAT_IDS and the registry’s ERA formats', async () => {
    expect(await checkList('source_document_kind_check')).toEqual([...DOCUMENT_KINDS]);
    expect(DOCUMENT_KINDS[0]).toBe('x12_835');
    expect(await checkList('source_document_format_id_check')).toEqual([...ERA_FORMAT_IDS]);
    // packages/synth's registry writes each format's manifest; its ERA formats are exactly these IDs.
    const eraFormats = readdirSync(EMR)
      .map((id) => JSON.parse(readFileSync(path.join(EMR, id, 'manifest.json'), 'utf8')) as { format: string; kind: string })
      .filter((manifest) => manifest.kind === 'era_export')
      .map((manifest) => manifest.format)
      .sort();
    expect(eraFormats).toEqual([...ERA_FORMAT_IDS].sort());
  });

  it('takes an ERA export only with one of the registry’s formats, and a format on no other kind', async () => {
    for (const formatId of ERA_FORMAT_IDS) {
      expect((await insertAs('era_export', formatId)).rows).toEqual([{ format_id: formatId }]);
    }
    await expect(insertAs('era_export', null)).rejects.toMatchObject({ code: '23514', constraint: 'source_document_format_of_era_export' });
    await expect(insertAs('era_export', 'webpt_billing_posting_v0')).rejects.toMatchObject({ code: '23514', constraint: 'source_document_format_id_check' });
    await expect(insertAs('era_export', 'webpt_billing_era_v1')).rejects.toMatchObject({ code: '23514' });
    for (const kind of DOCUMENT_KINDS.filter((item) => item !== 'era_export')) {
      await expect(insertAs(kind, 'prompt_era_v0'), kind).rejects.toMatchObject({ code: '23514', constraint: 'source_document_format_of_era_export' });
      expect((await insertAs(kind, null)).rows, kind).toEqual([{ format_id: null }]);
    }
  });

  it('never changes a document’s format once inserted', async () => {
    const id = randomUUID();
    await withPracticeScope(app, { actorId: manager, practiceIds: [north.practiceId] }, (scope) =>
      scope.client.query("INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by, format_id) VALUES ($1, $2, 'era_export', 1200, 'text/csv', $3, 'spry_era_v0')", [
        id,
        north.practiceId,
        manager,
      ]),
    );
    await expect(asApp(manager, [north.practiceId], "UPDATE source_document SET format_id = 'prompt_era_v0' WHERE id = $1", [id])).rejects.toMatchObject({ code: '42501' });
    await expect(
      withJobScope(app, { jobId: randomUUID(), practiceId: north.practiceId }, (scope) => scope.client.query('UPDATE source_document SET format_id = NULL WHERE id = $1', [id])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('gives a zip’s entries the zip’s format, and no other', async () => {
    const zip = randomUUID();
    await withPracticeScope(app, { actorId: manager, practiceIds: [north.practiceId] }, (scope) =>
      scope.client.query("INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by, format_id) VALUES ($1, $2, 'era_export', 1200, 'application/zip', $3, 'raintree_era_v0')", [
        zip,
        north.practiceId,
        manager,
      ]),
    );
    const entry = (formatId: string | null) =>
      withJobScope(app, { jobId: randomUUID(), practiceId: north.practiceId }, (scope) =>
        scope.client.query(
          "INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by, parent_document_id, format_id) VALUES ($1, $2, 'era_export', 10, 'application/octet-stream', $3, $4, $5)",
          [randomUUID(), north.practiceId, manager, zip, formatId],
        ),
      );
    expect((await entry('raintree_era_v0')).rowCount).toBe(1);
    await expect(entry('prompt_era_v0')).rejects.toMatchObject({ code: '23514', message: expect.stringMatching(/zip's export format/) });
    await expect(entry(null)).rejects.toMatchObject({ code: '23514' });
    // An 835 zip's entries carry no format, as before.
    const x12 = await upload();
    expect((await withJobScope(app, { jobId: randomUUID(), practiceId: north.practiceId }, (scope) => scope.client.query(INSERT, [randomUUID(), north.practiceId, manager, x12]))).rowCount).toBe(1);
  });
});

describe('payer and plan', () => {
  it('ties a plan to a payer of its own practice, and a contracted Medicare Advantage flag to Medicare Advantage', async () => {
    const payerId = randomUUID();
    const job = (practiceId: string, sql: string, values: unknown[]) => withJobScope(app, { jobId: randomUUID(), practiceId }, (scope) => scope.client.query(sql, values));
    await job(north.practiceId, "INSERT INTO payer (id, practice_id, payer_id_raw, name_raw) VALUES ($1, $2, 'SYNPAYERA', 'SYNTHETIC PAYER A')", [payerId, north.practiceId]);
    await expect(job(north.practiceId, "INSERT INTO payer (practice_id, payer_id_raw, name_raw) VALUES ($1, 'SYNPAYERA', 'SYNTHETIC PAYER A AGAIN')", [north.practiceId])).rejects.toMatchObject({ code: '23505' });
    await job(north.practiceId, "INSERT INTO plan (practice_id, payer_id, plan_key, is_medicare_advantage, ma_contracted) VALUES ($1, $2, 'SYNPLAN-MA-01', true, true)", [north.practiceId, payerId]);
    await expect(job(north.practiceId, "INSERT INTO plan (practice_id, payer_id, plan_key, ma_contracted) VALUES ($1, $2, 'SYNPLAN-COMM-01', true)", [north.practiceId, payerId])).rejects.toMatchObject({
      code: '23514',
    });
    await expect(job(other.practiceId, "INSERT INTO plan (practice_id, payer_id, plan_key) VALUES ($1, $2, 'SYNPLAN-COMM-01')", [other.practiceId, payerId])).rejects.toMatchObject({ code: '23514' });
    await expect(job(north.practiceId, 'DELETE FROM payer WHERE id = $1', [payerId])).rejects.toMatchObject({ code: '42501' });
  });
});
