import { randomBytes, randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from './config';
import { type MigratedDatabase, RowFactory, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser } from './testing';

/**
 * Schema PR 4, items 1, 2 and 5 (design lane-a-schema-pr4-payer-response-db-rules): a person's "window passed"
 * only on a window that has ended (case_line_rules), the contract queue's documents_awaiting leaving out a response's
 * letter and a letter filed for a submission (console_contract_queue), and the upload-time link
 * source_document.filed_for_submission_id with its rules (source_document_rules). The payer_response trigger and
 * the response-letter rule of contract_version_documents_ok are document-use-rules.db.test.ts. Synthetic data only.
 */

let database: MigratedDatabase;
let owner: pg.Client;
let app: pg.Pool;
let factory: RowFactory;
let north: TenantWorld;
let other: TenantWorld;
/** A billing manager of north: works cases, logs submissions. */
let manager: string;
/** An analyst of north: works cases, does not log submissions. */
let analyst: string;
/** A contract specialist of the internal organization: holds contract.review. */
let specialist: string;
/** A person with no membership at all. */
let nobody: string;

const REASON = 'enc:v1:U1lOVEhFVElDLVJFQVNPTg';
const sha = () => randomBytes(32).toString('hex');

interface Failure {
  readonly code: string;
  readonly message: string;
}

function settle(attempt: Promise<unknown>): Promise<'accepted' | Failure> {
  return attempt.then(
    () => 'accepted' as const,
    (error: unknown) => {
      const { code, message } = error as { code?: string; message?: string };
      return { code: code ?? 'error', message: message ?? '' };
    },
  );
}

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  app = new pg.Pool({ connectionString: database.appUrl, max: 4 });
  factory = await RowFactory.load(owner);
  north = await createTenantWorld(owner, 'north');
  other = await createTenantWorld(owner, 'other');
  manager = await createUser(owner);
  await addMembership(owner, north.organizationId, manager, 'billing_manager');
  analyst = await createUser(owner);
  await addMembership(owner, north.organizationId, analyst, 'analyst');
  specialist = await createUser(owner);
  await addMembership(owner, await createOrganization(owner, 'internal'), specialist, 'contract_specialist');
  nobody = await createUser(owner);
});

afterAll(async () => {
  await app.end();
  await owner.end();
  await database.drop();
});

/**
 * Runs `run` as the application role in one transaction (actor, scope as the request path sets them), rolled back.
 * An actor that is no user is a job.
 */
async function asApp<T>(actorId: string, practiceIds: readonly string[], run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await app.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [actorId, `{${practiceIds.join(',')}}`]);
    return await run(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

const asJob = <T>(practiceIds: readonly string[], run: (client: pg.PoolClient) => Promise<T>) => asApp(randomUUID(), practiceIds, run);

/** Applies `change` as a superuser with triggers off, committed: a state the rules make hard to reach. */
async function forced(sql: string, values: unknown[]): Promise<void> {
  await owner.query('BEGIN');
  try {
    await owner.query('SET LOCAL session_replication_role = replica');
    await owner.query(sql, values);
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }
}

// ---- Item 1: case_line_rules ------------------------------------------------------------------------------------

const WINDOW_REFUSAL = 'a person writes a line off as window passed only once its window has ended';

/** A case line of north (factory) whose priced line's window ends `endsOn` (a date, or null for none). */
async function caseLine(endsOn: string | null): Promise<string> {
  const row = await factory.create(owner, 'case_line', north);
  // Priced, so a window is allowed (priced_line_unpriced_amounts); only the window is the test's choice.
  await forced(
    `UPDATE priced_line SET expected_allowed_cents = 100, expected_unrounded = 100, variance_cents = 100 - coalesce(observed_allowed_cents, 0), observed_allowed_cents = coalesce(observed_allowed_cents, 0),
            unpriced_reason = NULL, method = 'FIXED_SCHEDULE', window_ends_on = $2 WHERE id = $1`,
    [row.priced_line_id, endsOn],
  );
  return row.id as string;
}

const daysFromToday = async (days: number): Promise<string> => (await owner.query<{ d: string }>("SELECT ((now() AT TIME ZONE 'UTC')::date + $1::int)::text AS d", [days])).rows[0]?.d ?? '';

const WRITE_OFF = 'UPDATE case_line SET written_off_reason = $2, written_off_by = $3, written_off_text = $4 WHERE id = $1 RETURNING written_off_reason, actionable';

function personWritesOff(line: string, reason: string, text: string | null = null) {
  return asApp(manager, [north.practiceId], (client) => client.query(WRITE_OFF, [line, reason, manager, text]));
}

describe('a person writes a line off as window passed only once its window has ended (item 1)', () => {
  it('refuses a person on a window with no end date, 23514 and its message', async () => {
    const line = await caseLine(null);
    expect(await settle(personWritesOff(line, 'window_passed'))).toEqual({ code: '23514', message: WINDOW_REFUSAL });
  });

  it('refuses a person on a window that ends today (UTC)', async () => {
    const line = await caseLine(await daysFromToday(0));
    expect(await settle(personWritesOff(line, 'window_passed'))).toEqual({ code: '23514', message: WINDOW_REFUSAL });
  });

  it('refuses a person on a window that ends tomorrow, and on a window far ahead', async () => {
    expect(await settle(personWritesOff(await caseLine(await daysFromToday(1)), 'window_passed'))).toEqual({ code: '23514', message: WINDOW_REFUSAL });
    expect(await settle(personWritesOff(await caseLine(await daysFromToday(400)), 'window_passed'))).toEqual({ code: '23514', message: WINDOW_REFUSAL });
  });

  it('records a person’s window_passed once the window ended yesterday (the boundary), a day-old or older window too', async () => {
    for (const days of [-1, -30]) {
      const line = await caseLine(await daysFromToday(days));
      const { rows } = await personWritesOff(line, 'window_passed');
      expect(rows).toEqual([{ written_off_reason: 'window_passed', actionable: false }]);
    }
  });

  it('leaves a person’s other reasons alone on an open window and on no window', async () => {
    for (const [endsOn, reason, text] of [
      [await daysFromToday(30), 'payer_correct_on_review', null],
      [null, 'not_worth_pursuit', null],
      [await daysFromToday(0), 'duplicate', null],
      [await daysFromToday(30), 'other', REASON],
    ] as const) {
      const { rows } = await personWritesOff(await caseLine(endsOn), reason, text);
      expect(rows).toEqual([{ written_off_reason: reason, actionable: false }]);
    }
  });

  it('keeps the unchanged refusals: a person writes off in their own name, and triage strikes only an ended window', async () => {
    const line = await caseLine(await daysFromToday(-5));
    const wrongName = asApp(manager, [north.practiceId], (client) => client.query(WRITE_OFF, [line, 'window_passed', analyst, null]));
    expect(await settle(wrongName)).toMatchObject({ code: '42501' });
    // Triage (a job, no written_off_by) strikes an ended window, and is refused on an open one.
    const { rows } = await asJob([north.practiceId], (client) => client.query(WRITE_OFF, [line, 'window_passed', null, null]));
    expect(rows).toEqual([{ written_off_reason: 'window_passed', actionable: false }]);
    const open = await caseLine(await daysFromToday(10));
    const refused = await settle(asJob([north.practiceId], (client) => client.query(WRITE_OFF, [open, 'window_passed', null, null])));
    expect(refused).toMatchObject({ code: '23514', message: 'triage writes off only a line whose window has passed; a person writes off in their own name' });
  });
});

// ---- Items 2 and 5: fixtures ------------------------------------------------------------------------------------

/** An unlinked top-level payer letter, written to public by the superuser with the practice in scope. */
const DOC_INSERT_AS_OWNER = `WITH scope AS (SELECT set_config('app.practice_ids', '{' || $2::text || '}', true))
  INSERT INTO public.source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by) SELECT $1::uuid, $2::uuid, 'payer_letter', 10, 'application/pdf', $3::uuid FROM scope`;
const DOC_INSERT = `INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by, parent_document_id, filed_for_submission_id)
                    VALUES ($1, $2, $3, 1200, 'application/pdf', $4, $5, $6) RETURNING id, filed_for_submission_id`;

/** A committed, clean, stored document of north, written as the owner role in the manager's name. */
async function storedDocument(kind: string, options: { filedFor?: string | null; parent?: string | null; practice?: TenantWorld; uploader?: string } = {}): Promise<string> {
  const id = randomUUID();
  const world = options.practice ?? north;
  const uploader = options.uploader ?? (world === north ? manager : world.adminUserId);
  await forced(
    `INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by, parent_document_id, sha256, scan_status, scan_at, status, filed_for_submission_id)
     VALUES ($1, $2, $3, 1200, 'application/pdf', $4, $5, $6, 'clean', now(), 'stored', $7)`,
    [id, world.practiceId, kind, uploader, options.parent ?? null, sha(), options.filedFor ?? null],
  );
  return id;
}

/** A submission of north with its case, from the house row factory. */
async function submission(world: TenantWorld = north): Promise<{ id: string; caseId: string }> {
  const row = await factory.create(owner, 'submission', world);
  return { id: row.id as string, caseId: row.case_id as string };
}

/** A later submission of the same case (a copy of the first with a later creation time). */
async function laterSubmission(first: { id: string; caseId: string }): Promise<string> {
  const id = randomUUID();
  const by = (await owner.query<{ submitted_by: string }>('SELECT submitted_by FROM submission WHERE id = $1', [first.id])).rows[0]?.submitted_by ?? manager;
  await asOwner(
    owner,
    [north.practiceId],
    () =>
      owner.query(
        `INSERT INTO submission SELECT (jsonb_populate_record(null::submission, to_jsonb(s) || jsonb_build_object('id', $2::text, 'created_at', (now() + interval '1 minute')))).* FROM submission s WHERE s.id = $1`,
        [first.id, id],
      ),
    by,
  );
  return id;
}

const FILE_REFUSAL_KIND = 'a letter is filed for a submission as a payer letter';
const FILE_REFUSAL_PERSON = 'a letter is filed for a submission by a person who logs submissions, in their own name';
const FILE_REFUSAL_LATEST = 'a letter is filed for the latest submission of a case of its practice';
const ZIP_REFUSAL = 'a zip entry carries its zip\'s submission';
const NEVER_CHANGES = 'the submission a document was filed for never changes';

/** A top-level upload by `actor` linking `filedFor`. */
function upload(actor: string, kind: string, filedFor: string | null, uploader = actor, practice: TenantWorld = north) {
  return asApp(actor, [practice.practiceId], (client) => client.query(DOC_INSERT, [randomUUID(), practice.practiceId, kind, uploader, null, filedFor]));
}

// ---- Item 5: the column, its index, grants, rules -----------------------------------------------------------------

describe('source_document.filed_for_submission_id (item 5)', () => {
  it('is a nullable uuid column referencing submission, with a partial index on practice and the link', async () => {
    const { rows } = await owner.query(
      `SELECT c.data_type, c.is_nullable, (SELECT pg_get_constraintdef(k.oid) FROM pg_constraint k WHERE k.conrelid = 'source_document'::regclass AND k.contype = 'f' AND pg_get_constraintdef(k.oid) LIKE '%(filed_for_submission_id)%') AS fk
         FROM information_schema.columns c WHERE c.table_name = 'source_document' AND c.column_name = 'filed_for_submission_id'`,
    );
    expect(rows).toEqual([{ data_type: 'uuid', is_nullable: 'YES', fk: 'FOREIGN KEY (filed_for_submission_id) REFERENCES submission(id)' }]);
    const index = await owner.query<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE indexname = 'source_document_by_filed_submission'");
    expect(index.rows).toHaveLength(1);
    expect(index.rows[0]?.indexdef).toMatch(/\(practice_id, filed_for_submission_id\)/);
    expect(index.rows[0]?.indexdef).toMatch(/WHERE \(?filed_for_submission_id IS NOT NULL\)?/);
  });

  it('grants the application role INSERT on the column and no UPDATE', async () => {
    const { rows } = await owner.query(
      `SELECT has_column_privilege('tp_app', 'source_document', 'filed_for_submission_id', 'INSERT') AS can_insert,
              has_column_privilege('tp_app', 'source_document', 'filed_for_submission_id', 'UPDATE') AS can_update`,
    );
    expect(rows).toEqual([{ can_insert: true, can_update: false }]);
  });

  it('records a payer letter filed by a person who logs submissions, in their own name, for the latest submission of their case', async () => {
    const sent = await submission();
    const { rows } = await upload(manager, 'payer_letter', sent.id);
    expect(rows).toMatchObject([{ filed_for_submission_id: sent.id }]);
  });

  it('records a document with no link as before (a contract, a letter, an upload by anyone who uploads)', async () => {
    expect((await upload(manager, 'payer_letter', null)).rows).toMatchObject([{ filed_for_submission_id: null }]);
    expect((await upload(manager, 'contract', null)).rows).toMatchObject([{ filed_for_submission_id: null }]);
  });

  it('refuses a link on any other kind of top-level document, 23514', async () => {
    const sent = await submission();
    for (const kind of ['contract', 'exhibit', 'other', 'x12_835', 'posting_export', 'eft_export']) {
      expect(await settle(upload(manager, kind, sent.id)), kind).toEqual({ code: '23514', message: FILE_REFUSAL_KIND });
    }
  });

  it('refuses a person without submission.log (an analyst, a person with no role), 42501', async () => {
    const sent = await submission();
    expect(await settle(upload(analyst, 'payer_letter', sent.id))).toEqual({ code: '42501', message: FILE_REFUSAL_PERSON });
    expect(await settle(upload(nobody, 'payer_letter', sent.id))).toMatchObject({ code: '42501' });
  });

  it('refuses a link in another person’s name, 42501', async () => {
    const sent = await submission();
    // The manager acts but names the analyst as uploader: refused by the link's rule (or the uploader rule before it).
    const result = await settle(asApp(manager, [north.practiceId], (client) => client.query(DOC_INSERT, [randomUUID(), north.practiceId, 'payer_letter', analyst, null, sent.id])));
    expect(result).toMatchObject({ code: '42501' });
  });

  it('refuses a job linking a top-level letter, with the same message, 42501', async () => {
    const sent = await submission();
    const result = await settle(asJob([north.practiceId], (client) => client.query(DOC_INSERT, [randomUUID(), north.practiceId, 'payer_letter', manager, null, sent.id])));
    expect(result).toEqual({ code: '42501', message: FILE_REFUSAL_PERSON });
  });

  it('refuses another practice’s submission (cross-tenant), 23514', async () => {
    const theirs = await submission(other);
    expect(await settle(upload(manager, 'payer_letter', theirs.id))).toEqual({ code: '23514', message: FILE_REFUSAL_LATEST });
    // And a submission id that does not exist.
    expect(await settle(upload(manager, 'payer_letter', randomUUID()))).toMatchObject({ code: expect.stringMatching(/^(23514|23503)$/) });
  });

  it('refuses an earlier submission of a case that has a later one, and records the later one', async () => {
    const first = await submission();
    const later = await laterSubmission(first);
    expect(await settle(upload(manager, 'payer_letter', first.id))).toEqual({ code: '23514', message: FILE_REFUSAL_LATEST });
    expect((await upload(manager, 'payer_letter', later)).rows).toMatchObject([{ filed_for_submission_id: later }]);
  });

  it('gives a zip entry its zip’s link when inserted without the column', async () => {
    const sent = await submission();
    const zip = randomUUID();
    const entry = randomUUID();
    const { rows } = await asApp(manager, [north.practiceId], async (client) => {
      await client.query(DOC_INSERT, [zip, north.practiceId, 'payer_letter', manager, null, sent.id]);
      // The worker's insert (a job in the practice's scope) names no link.
      return client.query(
        `INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by, parent_document_id)
         VALUES ($1, $2, 'payer_letter', 10, 'application/pdf', $3, $4) RETURNING filed_for_submission_id`,
        [entry, north.practiceId, manager, zip],
      );
    });
    expect(rows).toEqual([{ filed_for_submission_id: sent.id }]);
  });

  it('reads the zip’s row from the practice’s documents, never from a temporary table of the same name', async () => {
    // The application role cannot create a temporary table in a migrated database (TEMP is revoked), so the table is a
    // superuser's here: what a database with that right left on would allow. An unqualified name finds a session's
    // temporary table before public's, unless the function sets its own search path.
    const sent = await submission();
    const zip = randomUUID();
    await owner.query('BEGIN');
    try {
      await owner.query(DOC_INSERT_AS_OWNER, [zip, north.practiceId, manager]);
      await owner.query('CREATE TEMP TABLE source_document (id uuid, practice_id uuid, parent_document_id uuid, uploaded_by uuid, scan_status text, format_id text, filed_for_submission_id uuid) ON COMMIT DROP');
      await owner.query("INSERT INTO pg_temp.source_document VALUES ($1, $2, NULL, $3, 'clean', NULL, $4)", [zip, north.practiceId, manager, sent.id]);
      await owner.query('GRANT SELECT ON pg_temp.source_document TO tp_app');
      await owner.query('SET LOCAL ROLE tp_app');
      await owner.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [manager, `{${north.practiceId}}`]);
      const { rows } = await owner.query(
        `INSERT INTO public.source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by, parent_document_id)
         VALUES ($1, $2, 'payer_letter', 10, 'application/pdf', $3, $4) RETURNING filed_for_submission_id`,
        [randomUUID(), north.practiceId, manager, zip],
      );
      expect(rows).toEqual([{ filed_for_submission_id: null }]);
    } finally {
      await owner.query('ROLLBACK');
    }
  });

  it('gives an entry of an unlinked zip no link, and refuses an entry that names another submission than its zip', async () => {
    const sent = await submission();
    const second = await submission();
    const result = await settle(
      asApp(manager, [north.practiceId], async (client) => {
        const zip = randomUUID();
        await client.query(DOC_INSERT, [zip, north.practiceId, 'payer_letter', manager, null, sent.id]);
        await client.query(DOC_INSERT, [randomUUID(), north.practiceId, 'payer_letter', manager, zip, second.id]);
      }),
    );
    expect(result).toEqual({ code: '23514', message: ZIP_REFUSAL });
    // An unlinked zip: its entry naming a submission is refused too.
    const unlinked = await settle(
      asApp(manager, [north.practiceId], async (client) => {
        const zip = randomUUID();
        await client.query(DOC_INSERT, [zip, north.practiceId, 'payer_letter', manager, null, null]);
        await client.query(DOC_INSERT, [randomUUID(), north.practiceId, 'payer_letter', manager, zip, sent.id]);
      }),
    );
    expect(unlinked).toEqual({ code: '23514', message: ZIP_REFUSAL });
    const clean = await asApp(manager, [north.practiceId], async (client) => {
      const zip = randomUUID();
      await client.query(DOC_INSERT, [zip, north.practiceId, 'payer_letter', manager, null, null]);
      return client.query(DOC_INSERT, [randomUUID(), north.practiceId, 'payer_letter', manager, zip, null]);
    });
    expect(clean.rows).toMatchObject([{ filed_for_submission_id: null }]);
  });

  it('never changes: tp_app lacks the privilege (42501), the owner role is refused by the trigger (23514)', async () => {
    const sent = await submission();
    const other2 = await submission();
    const id = randomUUID();
    await asOwner(owner, [north.practiceId], () => owner.query(DOC_INSERT, [id, north.practiceId, 'payer_letter', manager, null, sent.id]), manager);
    const asTpApp = settle(asApp(manager, [north.practiceId], (client) => client.query('UPDATE source_document SET filed_for_submission_id = $2 WHERE id = $1', [id, other2.id])));
    expect(await asTpApp).toMatchObject({ code: '42501' });
    const asRoleOwner = settle(asOwner(owner, [north.practiceId], () => owner.query('UPDATE source_document SET filed_for_submission_id = $2 WHERE id = $1', [id, other2.id]), manager));
    expect(await asRoleOwner).toEqual({ code: '23514', message: NEVER_CHANGES });
    // Clearing it is a change too.
    const cleared = settle(asOwner(owner, [north.practiceId], () => owner.query('UPDATE source_document SET filed_for_submission_id = NULL WHERE id = $1', [id]), manager));
    expect(await cleared).toEqual({ code: '23514', message: NEVER_CHANGES });
    // Setting it on a document that had none is a change as well.
    const plain = randomUUID();
    await asOwner(owner, [north.practiceId], () => owner.query(DOC_INSERT, [plain, north.practiceId, 'payer_letter', manager, null, null]), manager);
    const set = settle(asOwner(owner, [north.practiceId], () => owner.query('UPDATE source_document SET filed_for_submission_id = $2 WHERE id = $1', [plain, sent.id]), manager));
    expect(await set).toEqual({ code: '23514', message: NEVER_CHANGES });
  });

  it('leaves other updates of a linked document alone (the scan verdict by a job)', async () => {
    const sent = await submission();
    const id = randomUUID();
    await asOwner(owner, [north.practiceId], () => owner.query(DOC_INSERT, [id, north.practiceId, 'payer_letter', manager, null, sent.id]), manager);
    const hash = sha();
    const { rowCount } = await asJob([north.practiceId], (client) =>
      client.query("UPDATE source_document SET sha256 = $2, scan_status = 'clean', scan_at = now(), status = 'scanned' WHERE id = $1", [id, hash]),
    );
    expect(rowCount).toBe(1);
  });

  it('is refused as a contract version’s source: a clean stored payer letter with the link set, 23514', async () => {
    const sent = await submission();
    const letter = await storedDocument('payer_letter', { filedFor: sent.id });
    const contract = (await factory.create(owner, 'contract', north)).id as string;
    const insert = (documents: string[]) =>
      asApp(manager, [north.practiceId], (client) =>
        client.query("INSERT INTO contract_version (practice_id, contract_id, version_no, source_document_ids, effective_from) VALUES ($1, $2, 1, $3::uuid[], '2027-01-01')", [north.practiceId, contract, documents]),
      );
    expect(await settle(insert([letter]))).toEqual({ code: '23514', message: 'a version\'s documents are never a payer response\'s letter or a letter filed for a submission' });
    // An unlinked clean stored payer letter is still a source (control: the rule is the link's).
    expect(await settle(insert([await storedDocument('payer_letter')]))).toBe('accepted');
  });
});

// ---- Item 2: console_contract_queue -----------------------------------------------------------------------------

async function awaiting(actor: string, practiceId: string): Promise<number | undefined> {
  const { rows } = await asApp(actor, [], (client) => client.query<{ practice_id: string; documents_awaiting: string }>('SELECT practice_id, documents_awaiting FROM console_contract_queue()'));
  const mine = rows.find((row) => row.practice_id === practiceId);
  return mine === undefined ? undefined : Number(mine.documents_awaiting);
}

/** Records a payer response of a new submission naming `documentId`, as the person who logged that submission. */
async function respondWith(documentId: string): Promise<void> {
  const sent = await submission();
  const by = (await owner.query<{ submitted_by: string }>('SELECT submitted_by FROM submission WHERE id = $1', [sent.id])).rows[0]?.submitted_by ?? manager;
  await asOwner(
    owner,
    [north.practiceId],
    () =>
      owner.query("INSERT INTO payer_response (practice_id, submission_id, kind, document_id, received_on, recorded_by) VALUES ($1, $2, 'info_requested', $3, (now() AT TIME ZONE 'UTC')::date, $4)", [
        north.practiceId,
        sent.id,
        documentId,
        by,
      ]),
    by,
  );
}

describe('console_contract_queue documents_awaiting (item 2)', () => {
  it('counts a clean stored payer letter, and not one a payer response names, nor one filed for a submission', async () => {
    const before = (await awaiting(specialist, north.practiceId)) ?? -1;
    expect(before).toBeGreaterThanOrEqual(0);
    await storedDocument('payer_letter');
    expect(await awaiting(specialist, north.practiceId)).toBe(before + 1);
    const answered = await storedDocument('payer_letter');
    await respondWith(answered);
    expect(await awaiting(specialist, north.practiceId)).toBe(before + 1);
    const sent = await submission();
    await storedDocument('payer_letter', { filedFor: sent.id });
    expect(await awaiting(specialist, north.practiceId)).toBe(before + 1);
    await storedDocument('contract');
    expect(await awaiting(specialist, north.practiceId)).toBe(before + 2);
  });

  it('does not count a response’s letter of the other practice against this one, and keeps the other practice’s count its own', async () => {
    const theirsBefore = (await awaiting(specialist, other.practiceId)) ?? -1;
    await storedDocument('payer_letter', { practice: other });
    expect(await awaiting(specialist, other.practiceId)).toBe(theirsBefore + 1);
  });

  it('returns no row to a caller with neither platform permission', async () => {
    for (const actor of [manager, analyst, nobody, north.adminUserId]) {
      expect(await asApp(actor, [north.practiceId], (client) => client.query<Record<string, unknown>>('SELECT * FROM console_contract_queue()')).then((r) => r.rows)).toEqual([]);
    }
  });

  it('leaves the caller’s app.practice_ids as it was', async () => {
    const scope = `{${north.practiceId}}`;
    const { rows } = await asApp(specialist, [north.practiceId], async (client) => {
      await client.query('SELECT count(*) FROM console_contract_queue()');
      return client.query<{ scope: string }>("SELECT current_setting('app.practice_ids', true) AS scope");
    });
    expect(rows).toEqual([{ scope }]);
  });

  it('is backed by an index payer_response_by_document on (practice_id, document_id) where document_id is not null', async () => {
    const { rows } = await owner.query<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE tablename = 'payer_response' AND indexname = 'payer_response_by_document'");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toMatch(/\(practice_id, document_id\)/);
    expect(rows[0]?.indexdef).toMatch(/WHERE \(?document_id IS NOT NULL\)?/);
  });
});
