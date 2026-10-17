import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { S3Client } from '@aws-sdk/client-s3';
import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, documentObjectKey, openPool, provisionPracticeKey, readDatabaseUrl, withJobScope } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createTenantWorld, createUser, placeholderDataKeyRef } from '@tp/db/testing';
import { assertNoPhi, createLogger } from '@tp/observability';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { type JobContext, intakeHandler, intakeServices, parseHandler } from '@tp/worker/runtime';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import type { CookieJar, Outcome, Route, UploadBody } from '../http/route';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import type { Receipt } from '../uploads/receipt-labels';
import { LocalUploadTargets, S3UploadTargets } from '../uploads/targets';
import { completeUpload, requestUploads, retryUpload, uploadContent, uploadDocumentPage, uploadReceipts, uploadReport, uploadsPage } from './uploads';
import { csrfTokenFor } from '../http/csrf';

/**
 * The Uploads API end to end against PostgreSQL, with the worker's intake job behind it (PRD 5, J1 and
 * J4; PRD 6, Intake and documents; PRD 7, Uploads; PRD 10, Pipeline steps 1 and 2; test matrix PAR-06,
 * PAR-27, SEC-08). route-tests.db.test.ts covers who may call each route; this covers what they do.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic');
const masterKey = randomBytes(32);
const keys = new LocalKeyProvider(masterKey);
const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-uploads-test-'));

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let services: Services;
let queue: MemoryQueue;
let clock = new Date();
let world: TenantWorld;
/** A practice of the same group with no BAA on file yet. */
let unsigned: string;
let manager: string;
let viewer: string;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 6);
  const sealer = new Sealer(randomBytes(32));
  queue = new MemoryQueue();
  services = createServices({
    origin: 'http://localhost:3100',
    pool: app,
    provider: new DevAuthProvider({
      store: new MemoryDevStore(),
      sealer: sealer.derive('dev-provider'),
      webauthn: { rpId: 'localhost', rpName: 'Test', origin: 'http://localhost:3100' },
      deliverInvitation: () => Promise.resolve(),
      scryptCost: { n: 1024, r: 8, p: 1 },
    }),
    keys,
    sealer,
    logger: createLogger({ sink: () => undefined }),
    now: () => clock,
    uploads: new LocalUploadTargets('http://localhost:3100', new DocumentStore(new LocalSealedBytes(documentsDir)), sealer),
    queue,
  });
  world = await createTenantWorld(owner, 'uploads');
  const key = await provisionPracticeKey(keys, world.practiceId);
  await owner.query('UPDATE practice SET data_key_ref = $1 WHERE id = $2', [key.dataKeyRef, world.practiceId]);
  unsigned = randomUUID();
  await asOwner(owner, [unsigned], () =>
    owner.query('INSERT INTO practice (id, organization_id, name, data_key_ref) VALUES ($1, $2, $3, $4)', [unsigned, world.organizationId, 'SYNTHETIC UNSIGNED PRACTICE', placeholderDataKeyRef()]),
  );
  manager = await createUser(owner);
  await addMembership(owner, world.organizationId, manager, 'billing_manager');
  viewer = await createUser(owner);
  await addMembership(owner, world.organizationId, viewer, 'viewer');
}, 60_000);

afterAll(async () => {
  await app.end();
  await owner.end();
  await database.drop();
  rmSync(documentsDir, { recursive: true, force: true });
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

const tokens = new Map<string, string>();
async function sessionOf(userId: string): Promise<string> {
  let token = tokens.get(userId);
  if (token === undefined) {
    token = (await openSession(app, { userId, method: 'totp', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
    tokens.set(userId, token);
  }
  return token;
}

async function call<R>(route: Route<R>, userId: string, params: Record<string, unknown>, input?: Record<string, unknown>, upload?: UploadBody, using: Services = services): Promise<Outcome<R>> {
  return route.invoke(
    {
      cookies: new Jar(await sessionOf(userId)),
      params,
      input: route.mutation ? { requestKey: randomUUID(), csrfToken: csrfTokenFor(using.sealer, await sessionOf(userId)), ...input } : input,
      ...(upload === undefined ? {} : { upload }),
      requestId: `test-${randomUUID()}`,
      userAgent: null,
    },
    using,
  );
}

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

function body(bytes: Buffer, contentType = 'application/octet-stream'): UploadBody {
  return {
    contentType,
    contentLength: bytes.length,
    body: Readable.from(
      (function* () {
        for (let at = 0; at < bytes.length; at += 64 * 1024) {
          yield bytes.subarray(at, at + 64 * 1024);
        }
      })(),
    ),
  };
}

const practice = () => ({ practiceId: world.practiceId });

/** Asks for one upload URL, PUTs the bytes to the local receiver and reports the upload complete. */
async function upload(bytes: Buffer, contentType = 'application/octet-stream'): Promise<string> {
  const requested = ok(await call(requestUploads, manager, practice(), { files: [{ kind: 'x12_835', contentType, sizeBytes: bytes.length }] }));
  const [document] = requested.documents;
  if (document === undefined) {
    throw new Error('no upload URL');
  }
  const token = new URL(document.upload.url).searchParams.get('token') ?? '';
  ok(await call(uploadContent, manager, { ...practice(), documentId: document.documentId }, { token }, body(bytes, contentType)));
  ok(await call(completeUpload, manager, practice(), { documentId: document.documentId }));
  return document.documentId;
}

/** Runs every queued job, as the worker would: intake, then the parse jobs it queues, which parse and load. */
async function runQueue(): Promise<void> {
  const worker = intakeServices({ documents: { kind: 'local', dir: documentsDir }, keys: { kind: 'local', masterKey }, scanWaitMs: 1000 });
  for (let job = queue.jobs.shift(); job !== undefined; job = queue.jobs.shift()) {
    const payload = job.payload as { practice_id: string; document_id: string };
    const jobId = randomUUID();
    const context: JobContext = {
      jobId,
      logger: createLogger({ sink: () => undefined }),
      transaction: (work) => withJobScope(app, { jobId, practiceId: payload.practice_id }, work),
      enqueue: (type, next) => queue.enqueue(type, next),
      lastAttempt: false,
    };
    if (job.type === 'intake') {
      await intakeHandler(worker)(payload, context);
    } else if (job.type === 'parse_835') {
      await parseHandler(worker)(payload, context);
    }
  }
}

async function receipt(documentId: string): Promise<Receipt> {
  return ok(await call(uploadDocumentPage, manager, { ...practice(), documentId })).receipt;
}

describe('the Uploads page', () => {
  it('opens uploads to the roles that may upload once the BAA is on file, and says why it is closed otherwise (J1)', async () => {
    expect(ok(await call(uploadsPage, manager, practice()))).toMatchObject({ canUpload: true, gate: { open: true, reason: null }, limits: { maxFiles: 100, maxBytes: 2 * 1024 ** 3 } });
    expect(ok(await call(uploadsPage, viewer, practice()))).toMatchObject({ canUpload: false, roles: ['viewer'] });
    const closed = ok(await call(uploadsPage, manager, { practiceId: unsigned }));
    expect(closed.gate).toEqual({ open: false, reason: expect.stringContaining('business associate agreement') });
  });
});

describe('asking for upload URLs', () => {
  it('records one document per file, awaiting its bytes, in the uploader’s name, and gives each an opaque URL', async () => {
    const requested = ok(
      await call(requestUploads, manager, practice(), {
        files: [
          { kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: 1200 },
          { kind: 'x12_835', contentType: 'application/zip', sizeBytes: 2 * 1024 ** 3 },
        ],
      }),
    );
    expect(requested.documents).toHaveLength(2);
    for (const document of requested.documents) {
      expect(() => {
        assertNoPhi('url', document.upload.url);
      }).not.toThrow();
      expect(new URL(document.upload.url).pathname).toBe(`/p/${world.practiceId}/uploads/${document.documentId}/content`);
      const { rows } = await owner.query('SELECT status, uploaded_by, size_bytes::text AS size, content_type, retention_class, s3_key FROM source_document WHERE id = $1', [document.documentId]);
      expect(rows[0]).toMatchObject({ status: 'awaiting_upload', uploaded_by: manager, retention_class: 'records', s3_key: documentObjectKey(world.practiceId, document.documentId) });
    }
    const { rows: events } = await owner.query("SELECT action, count(*)::int AS n FROM audit_event WHERE actor_id = $1 AND action LIKE 'upload_%requested' GROUP BY 1 ORDER BY 1", [manager]);
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'upload_requested' }), expect.objectContaining({ action: 'upload_batch_requested' })]));
  });

  it('refuses before the BAA, past the limits, a type the kind does not accept, and a role that cannot upload', async () => {
    const file = { kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: 100 };
    expect(await call(requestUploads, manager, { practiceId: unsigned }, { files: [file] })).toEqual({ status: 'invalid', issues: [{ field: 'files', message: expect.stringContaining('business associate agreement') }] });
    expect(await call(requestUploads, manager, practice(), { files: Array.from({ length: 101 }, () => file) })).toMatchObject({ status: 'invalid', issues: [{ field: 'files' }] });
    expect(await call(requestUploads, manager, practice(), { files: [] })).toMatchObject({ status: 'invalid' });
    expect(await call(requestUploads, manager, practice(), { files: [{ ...file, sizeBytes: 0 }] })).toMatchObject({ status: 'invalid', issues: [{ field: 'files.0.sizeBytes', message: 'an empty file' }] });
    expect(await call(requestUploads, manager, practice(), { files: [{ ...file, sizeBytes: 2 * 1024 ** 3 + 1 }] })).toMatchObject({ status: 'invalid', issues: [{ field: 'files.0.sizeBytes' }] });
    expect(await call(requestUploads, manager, practice(), { files: [{ ...file, contentType: 'application/pdf' }] })).toMatchObject({ status: 'invalid', issues: [{ field: 'files.0.contentType' }] });
    expect(await call(requestUploads, manager, practice(), { files: [{ ...file, kind: 'contract', contentType: 'application/pdf' }] })).toMatchObject({ status: 'ok' });
    // An .xlsx posting export (the uploader declares a type the kind does not accept generically) is named by its place in
    // the batch, with what to do: exports are read as CSV only (docs/adr/0059). The CSVs beside it are not the problem.
    const csv = { kind: 'posting_export', contentType: 'text/csv', sizeBytes: 100 };
    const save = 'posting and EFT exports are read as CSV only. Save it as CSV (comma-separated) and upload it again.';
    for (const contentType of ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream']) {
      expect(await call(requestUploads, manager, practice(), { files: [csv, { ...csv, contentType }, csv] })).toEqual({ status: 'invalid', issues: [{ field: 'files.1.contentType', message: `File 2 is not a CSV: ${save}` }] });
    }
    expect(await call(requestUploads, manager, practice(), { files: [{ ...csv, kind: 'eft_export', contentType: 'application/octet-stream' }] })).toEqual({ status: 'invalid', issues: [{ field: 'files.0.contentType', message: `File 1 is not a CSV: ${save}` }] });
    expect(await call(requestUploads, manager, practice(), { files: [csv, { ...csv, contentType: 'application/vnd.ms-excel' }] })).toMatchObject({ status: 'ok' });
    expect(await call(requestUploads, viewer, practice(), { files: [file] })).toMatchObject({ status: 'forbidden', permission: 'file.upload' });
  });
});

describe('the local receiver', () => {
  it('seals the declared bytes once, refusing a stale link, another file’s link, the wrong type or size', async () => {
    const bytes = readFileSync(path.join(FIXTURES, 'PAR-01/remit.835'));
    const [document] = ok(await call(requestUploads, manager, practice(), { files: [{ kind: 'x12_835', contentType: 'text/plain', sizeBytes: bytes.length }] })).documents;
    const [other] = ok(await call(requestUploads, manager, practice(), { files: [{ kind: 'x12_835', contentType: 'text/plain', sizeBytes: bytes.length }] })).documents;
    if (document === undefined || other === undefined) {
      throw new Error('no upload URLs');
    }
    const token = new URL(document.upload.url).searchParams.get('token') ?? '';
    const params = { ...practice(), documentId: document.documentId };
    expect(await call(uploadContent, manager, params, { token: new URL(other.upload.url).searchParams.get('token') ?? '' }, body(bytes, 'text/plain'))).toMatchObject({ status: 'invalid', issues: [{ field: 'token' }] });
    expect(await call(uploadContent, manager, params, { token: 'x' }, body(bytes, 'text/plain'))).toMatchObject({ status: 'invalid', issues: [{ field: 'token' }] });
    expect(await call(uploadContent, manager, params, { token }, body(bytes, 'application/pdf'))).toMatchObject({ status: 'invalid', issues: [{ field: 'upload' }] });
    expect(await call(uploadContent, manager, params, { token })).toMatchObject({ status: 'invalid', issues: [{ field: 'upload' }] });
    expect(await call(uploadContent, manager, params, { token }, { ...body(bytes.subarray(1), 'text/plain'), contentLength: null })).toMatchObject({ status: 'invalid', issues: [{ field: 'upload' }] });
    expect(await call(uploadContent, manager, params, { token }, { ...body(bytes, 'text/plain'), contentLength: 3 })).toMatchObject({ status: 'invalid', issues: [{ field: 'upload' }] });
    expect(await call(uploadContent, viewer, params, { token }, body(bytes, 'text/plain'))).toMatchObject({ status: 'forbidden' });
    expect(ok(await call(uploadContent, manager, params, { token }, body(bytes, 'text/plain')))).toEqual({ objectId: document.documentId, stored: 'stored' });
    expect(ok(await call(uploadContent, manager, params, { token }, body(bytes, 'text/plain')))).toEqual({ objectId: document.documentId, stored: 'already' });
    const sealed = readFileSync(path.join(documentsDir, documentObjectKey(world.practiceId, document.documentId)));
    expect(sealed.subarray(0, 4).toString('ascii')).toBe('TPO2');
    expect(sealed.includes(Buffer.from('SYNTHSENDER'))).toBe(false);
    // Fifteen minutes later the link no longer works.
    clock = new Date(Date.now() + 16 * 60_000);
    try {
      const otherToken = new URL(other.upload.url).searchParams.get('token') ?? '';
      expect(await call(uploadContent, manager, { ...practice(), documentId: other.documentId }, { token: otherToken }, body(bytes, 'text/plain'))).toMatchObject({ status: 'invalid', issues: [{ field: 'token' }] });
    } finally {
      clock = new Date();
    }
  });
});

describe('completing, intake and receipts', () => {
  it('queues intake once the bytes have arrived, and takes the 835 in: scanned, parsed and loaded (PRD 10, steps 1 to 10)', async () => {
    const bytes = readFileSync(path.join(FIXTURES, 'PAR-01/remit.835'));
    const [document] = ok(await call(requestUploads, manager, practice(), { files: [{ kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: bytes.length }] })).documents;
    if (document === undefined) {
      throw new Error('no upload URL');
    }
    // Before the bytes: nothing to complete.
    const early = ok(await call(completeUpload, manager, practice(), { documentId: document.documentId }));
    expect(early.receipt.status).toBe('awaiting_upload');
    expect(queue.jobs).toEqual([]);
    const token = new URL(document.upload.url).searchParams.get('token') ?? '';
    ok(await call(uploadContent, manager, { ...practice(), documentId: document.documentId }, { token }, body(bytes)));
    expect(ok(await call(completeUpload, manager, practice(), { documentId: document.documentId })).receipt.status).toBe('received');
    expect(queue.jobs).toEqual([{ type: 'intake', payload: { practice_id: world.practiceId, document_id: document.documentId } }]);
    expect(() => {
      assertNoPhi('job_payload', queue.jobs[0]?.payload, { known: ['SYNTHETIC PAYER A', 'SYNPCNPAR01001'] });
    }).not.toThrow();
    // Completing again queues nothing more.
    ok(await call(completeUpload, manager, practice(), { documentId: document.documentId }));
    expect(queue.jobs).toHaveLength(1);
    await runQueue();
    expect(await receipt(document.documentId)).toMatchObject({
      status: 'loaded',
      scanStatus: 'clean',
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      parse: { outcome: 'loaded', transactions: 1, loaded: { transactions: 1, claims: 1, lines: 1 } },
    });
  });

  it('records a second upload of the same bytes as a duplicate of the first, naming it (PAR-06)', async () => {
    const bytes = readFileSync(path.join(FIXTURES, 'PAR-06/remit.835'));
    const first = await upload(bytes);
    const second = await upload(bytes);
    await runQueue();
    expect(await receipt(second)).toMatchObject({ status: 'duplicate', duplicateOf: { documentId: first } });
    expect((await receipt(first)).status).toBe('loaded');
  });

  it('expands a zip into a receipt per file and a batch receipt, with a report that lists every file (PAR-27)', async () => {
    const zip = readFileSync(path.join(FIXTURES, 'PAR-27/batch.zip'));
    const id = await upload(zip, 'application/zip');
    await runQueue();
    const batch = await receipt(id);
    // 499 load; the truncated one is held (PAR-27).
    expect(batch).toMatchObject({ status: 'expanded', entries: { total: 500, byStatus: { loaded: 499, held: 1 } } });
    const entries = ok(await call(uploadReceipts, manager, { ...practice(), parent_id: id, page: '2' }));
    expect(entries).toMatchObject({ page: 2, pages: 20, total: 500 });
    expect(entries.receipts).toHaveLength(25);
    expect(entries.receipts.every((entry) => entry.parentDocumentId === id)).toBe(true);
    const report = ok(await call(uploadReport, manager, { ...practice(), documentId: id }));
    expect(report.download.filename).toBe(`receipt-${id}.csv`);
    expect(() => {
      assertNoPhi('s3_key', report.download.filename);
    }).not.toThrow();
    const lines = report.download.body.trim().split('\r\n');
    expect(lines[0]?.startsWith('record,document_id,parent_document_id,kind,stage,status,reason,size_bytes,sha256,received_at,duplicate_of,transactions,')).toBe(true);
    expect(lines[1]?.startsWith(`document,${id},,x12_835,expanded,expanded,`)).toBe(true);
    // A line per file, a line per transaction set, and the held file's error with its position.
    expect(lines.filter((line) => line.startsWith('document,'))).toHaveLength(501);
    expect(lines.filter((line) => line.startsWith('transaction,'))).toHaveLength(499);
    expect(lines.filter((line) => line.startsWith('error,') && line.includes(',EDI_SYNTAX,'))).toHaveLength(1);
    expect(report.download.body).not.toContain('SYNTHETIC PAYER');
    // 500 intake-expanded files parsed and loaded one after another, as one worker would.
  }, 120_000);

  it('quarantines a zip holding a renamed executable, and shows it in the receipts (PAR-28)', async () => {
    const id = await upload(readFileSync(path.join(FIXTURES, 'PAR-28/upload.zip')), 'application/zip');
    await runQueue();
    expect(await receipt(id)).toMatchObject({ status: 'quarantined', entries: { total: 2, byStatus: { quarantined: 2 } } });
  });

  it('pages the receipts newest first, filters a batch by its documents, and audits every receipt read', async () => {
    const before = (await owner.query("SELECT count(*)::int AS n FROM audit_event WHERE action = 'read' AND object_type = 'source_document' AND actor_id = $1", [viewer])).rows[0] as { n: number };
    const first = ok(await call(uploadReceipts, viewer, practice()));
    expect(first.receipts).toHaveLength(Math.min(25, first.total));
    const times = first.receipts.map((item) => item.receivedAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(first.receipts.every((item) => item.parentDocumentId === null)).toBe(true);
    const after = (await owner.query("SELECT count(*)::int AS n FROM audit_event WHERE action = 'read' AND object_type = 'source_document' AND actor_id = $1", [viewer])).rows[0] as { n: number };
    expect(after.n - before.n).toBe(first.receipts.length);
    const picked = first.receipts.slice(0, 2).map((item) => item.documentId);
    const batch = ok(await call(uploadReceipts, viewer, { ...practice(), document_ids: picked.join(',') }));
    expect(batch.receipts.map((item) => item.documentId).sort()).toEqual([...picked].sort());
    expect(await call(uploadReceipts, viewer, { ...practice(), document_ids: 'not-an-id' })).toEqual({ status: 'not_found' });
    expect(ok(await call(uploadReceipts, viewer, { ...practice(), page: '999' })).page).toBe(first.pages);
    expect(await call(uploadReport, viewer, { ...practice(), documentId: randomUUID() })).toEqual({ status: 'not_found' });
    expect(await call(uploadDocumentPage, viewer, { ...practice(), documentId: randomUUID() })).toEqual({ status: 'not_found' });
  });
});

describe('retrying', () => {
  it('gives a new URL for bytes that never arrived, and runs intake again for an upload that failed', async () => {
    const [document] = ok(await call(requestUploads, manager, practice(), { files: [{ kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: 50 }] })).documents;
    if (document === undefined) {
      throw new Error('no upload URL');
    }
    const again = ok(await call(retryUpload, manager, practice(), { documentId: document.documentId }));
    expect(again.upload?.url).toContain(`/uploads/${document.documentId}/content?token=`);
    await owner.query("UPDATE source_document SET status = 'failed' WHERE id = $1", [document.documentId]);
    const retried = ok(await call(retryUpload, manager, practice(), { documentId: document.documentId }));
    expect(retried.upload).toBeUndefined();
    expect(queue.jobs.splice(0)).toEqual([{ type: 'intake', payload: { practice_id: world.practiceId, document_id: document.documentId } }]);
    await owner.query("UPDATE source_document SET status = 'stored' WHERE id = $1", [document.documentId]);
    ok(await call(retryUpload, manager, practice(), { documentId: document.documentId }));
    expect(queue.jobs).toEqual([]);
    expect(await call(retryUpload, manager, practice(), { documentId: randomUUID() })).toEqual({ status: 'not_found' });
  });
});

describe('with S3', () => {
  it('presigns the browser’s PUT to the intake key, and this server receives no bytes', async () => {
    const s3 = createServices({
      ...services,
      uploads: new S3UploadTargets({
        client: new S3Client({ region: 'us-east-1', credentials: { accessKeyId: 'AKIASYNTHETICEXAMPLE', secretAccessKey: 'synthetic' }, requestChecksumCalculation: 'WHEN_REQUIRED' }),
        bucket: 'tp-staging-documents',
        kmsKeyId: 'alias/tp-staging',
      }),
      queue,
    });
    const [document] = ok(await call(requestUploads, manager, practice(), { files: [{ kind: 'x12_835', contentType: 'application/zip', sizeBytes: 1000 }] }, undefined, s3)).documents;
    if (document === undefined) {
      throw new Error('no upload URL');
    }
    expect(new URL(document.upload.url).pathname).toBe(`/intake/${world.practiceId}/${document.documentId}`);
    expect(document.upload.headers).toMatchObject({ 'content-type': 'application/zip', 'if-none-match': '*', 'x-amz-server-side-encryption': 'aws:kms' });
    expect(await call(uploadContent, manager, { ...practice(), documentId: document.documentId }, { token: 'a'.repeat(72) }, body(Buffer.alloc(1000)), s3)).toEqual({ status: 'not_found' });
  });
});
