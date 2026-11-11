import { createHash, randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from './config';
import { DOCUMENT_KINDS, ERA_FORMAT_IDS, VERSION_STATUSES } from './schema';
import { type MigratedDatabase, type OwnerClient, RowFactory, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createTenantWorld, createUser } from './testing';

/**
 * The database half of "a payer's answer and a contract's source are never the same document" (design: schema PR 4,
 * items 3 and 4 and the races; docs/adr/0085): payer_response_belongs() refuses a response whose document is not a
 * clean, stored, top-level payer letter or other document of its practice that no contract version names, and
 * contract_version_documents_ok() refuses a version whose document a payer response names. Both run at READ COMMITTED
 * only and take the document's advisory lock (`document_use:<id>`). Synthetic data only.
 */

const LETTER_REFUSED = "a payer response's document is a clean, stored payer letter or other document of its practice that no contract version names";
const RESPONSE_AT_READ_COMMITTED = 'a payer response naming a document is recorded at READ COMMITTED';
const VERSION_AT_READ_COMMITTED = "a contract version's documents are checked at READ COMMITTED";
const VERSION_REFUSED = "a version's documents are never a payer response's letter or a letter filed for a submission";

let database: MigratedDatabase;
let owner: pg.Client;
let factory: RowFactory;
let north: TenantWorld;
let other: TenantWorld;
let manager: string;
const clients: pg.Client[] = [];

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  factory = await RowFactory.load(owner);
  north = await createTenantWorld(owner, 'north');
  other = await createTenantWorld(owner, 'other');
  manager = await createUser(owner);
  await addMembership(owner, north.organizationId, manager, 'billing_manager');
}, 120_000);

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end().catch(() => undefined)));
  await owner.end();
  await database.drop();
});

interface Failure {
  readonly code: string;
  readonly message: string;
}

/** What a statement came to, settled at once so a refusal never surfaces as an unhandled rejection. */
function settle(attempt: Promise<unknown>): Promise<'accepted' | Failure> {
  return attempt.then(
    () => 'accepted' as const,
    (error: unknown) => {
      const { code, message } = error as { code?: string; message?: string };
      return { code: code ?? 'error', message: message ?? '' };
    },
  );
}

const refusal = (code: string, message: string): Failure => ({ code, message });

const today = (): string => new Date().toISOString().slice(0, 10);

/** A practice-scoped transaction of the owner role, in the manager's name, at the isolation level asked for; committed on success. */
async function transact<T>(work: (client: pg.Client) => Promise<T>, isolation = 'READ COMMITTED', practice: TenantWorld = north): Promise<T> {
  await owner.query(`BEGIN ISOLATION LEVEL ${isolation}`);
  try {
    await owner.query('SET LOCAL ROLE tp_owner');
    await owner.query("SELECT set_config('app.practice_ids', $1, true), set_config('app.actor_id', $2, true)", [`{${practice.practiceId}}`, manager]);
    const result = await work(owner);
    await owner.query('COMMIT');
    return result;
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }
}

interface DocumentFields {
  readonly practice?: TenantWorld;
  readonly kind?: string;
  readonly scan?: string;
  readonly status?: string;
  readonly parentId?: string;
}

/** A document row as intake leaves it: a clean, stored, top-level payer letter unless told otherwise (the row only; no bytes). */
async function documentOf(fields: DocumentFields = {}): Promise<string> {
  const id = randomUUID();
  const practice = fields.practice ?? north;
  const scan = fields.scan ?? 'clean';
  await asOwner(owner, [practice.practiceId], () =>
    owner.query(
      `INSERT INTO source_document (id, practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status, parent_document_id, format_id)
       VALUES ($1, $2, $3, $4, 100, 'application/pdf', $5, $6, $7, $8, $9, $10)`,
      [id, practice.practiceId, fields.kind ?? 'payer_letter', createHash('sha256').update(`document ${id}`).digest('hex'), practice === north ? manager : practice.adminUserId, scan, scan === 'pending' ? null : new Date(), fields.status ?? 'stored', fields.parentId ?? null, fields.kind === 'era_export' ? ERA_FORMAT_IDS[0] : null],
    ),
  );
  return id;
}

interface Sent {
  readonly submissionId: string;
  readonly receivedOn: string;
}

/** A submission of the north practice, its case's latest, built by the house row factory. */
async function submissionOf(): Promise<Sent> {
  const row = await factory.create(owner, 'submission', north);
  const submitted = row.submitted_on as Date | string;
  const receivedOn = typeof submitted === 'string' ? submitted.slice(0, 10) : submitted.toISOString().slice(0, 10);
  return { submissionId: row.id as string, receivedOn: receivedOn > today() ? today() : receivedOn };
}

const RESPONSE = `INSERT INTO payer_response (practice_id, submission_id, kind, document_id, received_on, recorded_by)
                  VALUES ($1, $2, 'info_requested', $3, $4, $5) RETURNING id`;

/** Records a response of the sent submission naming `documentId` (or none), as the manager, at the isolation level asked for. */
function respond(sent: Sent, documentId: string | null, isolation = 'READ COMMITTED'): Promise<'accepted' | Failure> {
  return settle(transact((client) => client.query(RESPONSE, [north.practiceId, sent.submissionId, documentId, sent.receivedOn, manager]), isolation));
}

/** A contract of the north practice, built by the house row factory. */
async function contractId(): Promise<string> {
  return (await factory.create(owner, 'contract', north)).id as string;
}

const VERSION = `INSERT INTO contract_version (practice_id, contract_id, version_no, source_document_ids, effective_from)
                 VALUES ($1, $2, $3, $4::uuid[], '2027-01-01') RETURNING id`;

/** Writes a draft version of a new contract naming `documents`, as the manager. */
async function version(documents: readonly string[], isolation = 'READ COMMITTED'): Promise<'accepted' | Failure> {
  const contract = await contractId();
  return settle(transact((client) => client.query(VERSION, [north.practiceId, contract, 1, documents]), isolation));
}

/** A version of the given status naming `documents`, written as a superuser with triggers off (a state the later rules make hard to reach). */
async function versionWithStatus(status: string, documents: readonly string[]): Promise<void> {
  const contract = await contractId();
  await owner.query('BEGIN');
  try {
    await owner.query('SET LOCAL session_replication_role = replica');
    const approved = status !== 'draft' && status !== 'proposed';
    const signedOff = status === 'signed_off' || status === 'superseded';
    await owner.query(
      `INSERT INTO contract_version (practice_id, contract_id, version_no, source_document_ids, effective_from, status, approved_by, approved_at, signed_off_by, signed_off_at)
       VALUES ($1, $2, 1, $3::uuid[], '2027-01-01', $4, $5, $6, $7, $8)`,
      [north.practiceId, contract, documents, status, approved ? manager : null, approved ? new Date() : null, signedOff ? manager : null, signedOff ? new Date() : null],
    );
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }
}

async function counts(documentId: string): Promise<{ responses: number; versions: number }> {
  const { rows } = await asOwner(owner, [north.practiceId], () =>
    owner.query(
      `SELECT (SELECT count(*)::int FROM payer_response WHERE practice_id = $1 AND document_id = $2) AS responses,
              (SELECT count(*)::int FROM contract_version WHERE practice_id = $1 AND $2::uuid = ANY (source_document_ids)) AS versions`,
      [north.practiceId, documentId],
    ),
  );
  return rows[0] as { responses: number; versions: number };
}

describe('item 3: the document a payer response names', () => {
  it('refuses a document of another practice', async () => {
    const sent = await submissionOf();
    expect(await respond(sent, await documentOf({ practice: other }))).toEqual(refusal('23514', LETTER_REFUSED));
  });

  it('refuses a zip entry (a document with a parent)', async () => {
    const sent = await submissionOf();
    const zip = await documentOf({ kind: 'other' });
    const entry = await documentOf({ kind: 'payer_letter', parentId: zip });
    expect(await respond(sent, entry)).toEqual(refusal('23514', LETTER_REFUSED));
  });

  for (const kind of DOCUMENT_KINDS.filter((k) => k !== 'payer_letter' && k !== 'other')) {
    it(`refuses a document of kind ${kind}`, async () => {
      const sent = await submissionOf();
      expect(await respond(sent, await documentOf({ kind }))).toEqual(refusal('23514', LETTER_REFUSED));
    });
  }

  it('refuses a document whose scan is not clean', async () => {
    const sent = await submissionOf();
    expect(await respond(sent, await documentOf({ scan: 'pending', status: 'awaiting_upload' }))).toEqual(refusal('23514', LETTER_REFUSED));
  });

  it('refuses a document that is not stored', async () => {
    const sent = await submissionOf();
    expect(await respond(sent, await documentOf({ status: 'scanned' }))).toEqual(refusal('23514', LETTER_REFUSED));
  });

  for (const status of VERSION_STATUSES) {
    it(`refuses a document a ${status} contract version names`, async () => {
      const sent = await submissionOf();
      const letter = await documentOf();
      await versionWithStatus(status, [letter]);
      expect(await respond(sent, letter)).toEqual(refusal('23514', LETTER_REFUSED));
    });
  }

  it('records a clean, stored payer letter', async () => {
    const sent = await submissionOf();
    expect(await respond(sent, await documentOf())).toBe('accepted');
  });

  it('records an other document', async () => {
    const sent = await submissionOf();
    expect(await respond(sent, await documentOf({ kind: 'other' }))).toBe('accepted');
  });

  it('records one letter named by two responses', async () => {
    const letter = await documentOf();
    expect(await respond(await submissionOf(), letter)).toBe('accepted');
    expect(await respond(await submissionOf(), letter)).toBe('accepted');
    expect((await counts(letter)).responses).toBe(2);
  });

  it('does not refuse, by the new guard, a response with no document at REPEATABLE READ', async () => {
    // A response with no document is a job's "reprocessed, no change", naming the loaded remittance that shows it.
    const sent = await submissionOf();
    const remittance = (await factory.create(owner, 'remittance', north)).id as string;
    const insert = `INSERT INTO payer_response (practice_id, submission_id, kind, remittance_id, received_on, recorded_by) VALUES ($1, $2, 'reprocessed_no_change', $3, $4, $5)`;
    const failure = await settle(transact((client) => client.query(insert, [north.practiceId, sent.submissionId, remittance, sent.receivedOn, manager]), 'REPEATABLE READ'));
    expect(failure === 'accepted' ? failure : failure.code).not.toBe('0A000');
    expect(failure).toBe('accepted');
  });

  it('refuses a response naming a document at REPEATABLE READ', async () => {
    const sent = await submissionOf();
    expect(await respond(sent, await documentOf(), 'REPEATABLE READ')).toEqual(refusal('0A000', RESPONSE_AT_READ_COMMITTED));
  });
});

describe('item 4: contract_version_documents_ok', () => {
  it('refuses a version naming a response’s letter on insert', async () => {
    const letter = await documentOf();
    expect(await respond(await submissionOf(), letter)).toBe('accepted');
    expect(await version([letter])).toEqual(refusal('23514', VERSION_REFUSED));
  });

  it('refuses a terms change of a draft that would name a response’s letter', async () => {
    const letter = await documentOf();
    const clean = await documentOf();
    expect(await respond(await submissionOf(), letter)).toBe('accepted');
    const contract = await contractId();
    const created = await transact((client) => client.query(VERSION, [north.practiceId, contract, 1, [clean]]));
    const id = (created.rows[0] as { id: string }).id;
    const change = await settle(transact((client) => client.query('UPDATE contract_version SET source_document_ids = $2::uuid[] WHERE id = $1', [id, [letter]])));
    expect(change).toEqual(refusal('23514', VERSION_REFUSED));
  });

  it('still passes a version naming an unrelated clean payer letter', async () => {
    const letter = await documentOf();
    expect(await respond(await submissionOf(), await documentOf())).toBe('accepted');
    expect(await version([letter])).toBe('accepted');
  });

  it('is volatile', async () => {
    const { rows } = await owner.query("SELECT provolatile, prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') AS plpgsql FROM pg_proc WHERE proname = 'contract_version_documents_ok'");
    expect(rows).toEqual([{ provolatile: 'v', plpgsql: true }]);
  });

  it('keeps its grants: the owner and the application role only, PUBLIC none', async () => {
    const { rows } = await owner.query(
      `SELECT coalesce((SELECT rolname FROM pg_roles WHERE oid = a.grantee), 'PUBLIC') AS grantee, a.privilege_type
         FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE p.proname = 'contract_version_documents_ok' ORDER BY 1, 2`,
    );
    expect(rows).toEqual([
      { grantee: 'tp_app', privilege_type: 'EXECUTE' },
      { grantee: 'tp_owner', privilege_type: 'EXECUTE' },
    ]);
  });

  it('refuses an insert of a version at REPEATABLE READ', async () => {
    expect(await version([await documentOf()], 'REPEATABLE READ')).toEqual(refusal('0A000', VERSION_AT_READ_COMMITTED));
  });
});

/** Opens a transaction of the owner role on its own connection, in the manager's name, and returns it with its backend pid. */
async function connection(): Promise<{ client: pg.Client; pid: number }> {
  const client = new pg.Client({ connectionString: database.url });
  client.on('error', () => undefined);
  await client.connect();
  clients.push(client);
  const { rows } = await client.query('SELECT pg_backend_pid() AS pid');
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE tp_owner');
  await client.query("SELECT set_config('app.practice_ids', $1, true), set_config('app.actor_id', $2, true)", [`{${north.practiceId}}`, manager]);
  return { client, pid: (rows[0] as { pid: number }).pid };
}

/** Resolves once backend `pid` has an advisory lock request that is not granted; a bounded poll. */
async function waitsForAdvisoryLock(pid: number): Promise<void> {
  for (let tries = 0; tries < 1500; tries += 1) {
    const { rows } = await owner.query("SELECT 1 FROM pg_locks WHERE pid = $1 AND locktype = 'advisory' AND NOT granted", [pid]);
    if (rows.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`backend ${String(pid)} never waited for an advisory lock`);
}

describe('the races of a response and a version naming one letter', () => {
  it('makes a response wait for an uncommitted version naming the letter, then refuses it; one row remains', async () => {
    const letter = await documentOf();
    const sent = await submissionOf();
    const contract = await contractId();
    const first = await connection();
    const second = await connection();
    await first.client.query(VERSION, [north.practiceId, contract, 1, [letter]]);
    const responding = settle(second.client.query(RESPONSE, [north.practiceId, sent.submissionId, letter, sent.receivedOn, manager]));
    await waitsForAdvisoryLock(second.pid);
    await first.client.query('COMMIT');
    expect(await responding).toEqual(refusal('23514', LETTER_REFUSED));
    await second.client.query('ROLLBACK');
    expect(await counts(letter)).toEqual({ responses: 0, versions: 1 });
  });

  it('makes a version wait for an uncommitted response naming the letter, then refuses it; one row remains', async () => {
    const letter = await documentOf();
    const sent = await submissionOf();
    const contract = await contractId();
    const first = await connection();
    const second = await connection();
    await first.client.query(RESPONSE, [north.practiceId, sent.submissionId, letter, sent.receivedOn, manager]);
    const writing = settle(second.client.query(VERSION, [north.practiceId, contract, 1, [letter]]));
    await waitsForAdvisoryLock(second.pid);
    await first.client.query('COMMIT');
    expect(await writing).toEqual(refusal('23514', VERSION_REFUSED));
    await second.client.query('ROLLBACK');
    expect(await counts(letter)).toEqual({ responses: 1, versions: 0 });
  });
});

export type { OwnerClient };
