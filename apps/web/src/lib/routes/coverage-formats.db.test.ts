import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, provisionPracticeKey, readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, createMigratedDatabase, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { ERA_EXPORT_FORMATS, unconfirmedEraFormatIds } from '@tp/worker/era-formats';
import { type JobContext, intakeHandler, intakeServices, parseHandler } from '@tp/worker/runtime';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import { unconfirmedFormatExplanation, unconfirmedFormatSources } from '../contracts/format-sources';
import { csrfTokenFor } from '../http/csrf';
import type { CookieJar, Outcome, Route, UploadBody } from '../http/route';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { LocalUploadTargets } from '../uploads/targets';
import { coveragePage } from './coverage';
import { completeUpload, requestUploads, uploadContent } from './uploads';

/**
 * The Coverage screen's flag for lines read from an unconfirmed ERA export format (Change Order 001, CO-03: "an
 * unconfirmed format is flagged in the Coverage screen"; docs/adr/0060), against PostgreSQL with the worker's intake
 * and parse behind the upload routes: a SYNTHETIC export uploaded as its format loads, and the Coverage page names
 * the format with its remittances, lines, payers and billed dollars as the fixture's manifest gives them. An 835
 * is never flagged, an export that repeats loaded payments adds nothing, each practice sees its own, and a format
 * once confirmed is no longer flagged. Synthetic data only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic');
const masterKey = randomBytes(32);
const keys = new LocalKeyProvider(masterKey);
const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-coverage-formats-test-'));

interface Manifest {
  readonly vendor: string;
  readonly checks: readonly unknown[];
  readonly rows: readonly { readonly trace: string; readonly payerName: string; readonly chargeCents: string }[];
}

function manifest(format: string): Manifest {
  return JSON.parse(readFileSync(path.join(FIXTURES, 'emr', format, 'manifest.json'), 'utf8')) as Manifest;
}

function exportBytes(format: string): Buffer {
  return readFileSync(path.join(FIXTURES, 'emr', format, 'era-export.csv'));
}

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let services: Services;
let queue: MemoryQueue;
let north: TenantWorld;
let south: TenantWorld;
let northManager: string;
let southManager: string;

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
    now: () => new Date(),
    uploads: new LocalUploadTargets('http://localhost:3100', new DocumentStore(new LocalSealedBytes(documentsDir)), sealer),
    queue,
  });
  north = await createTenantWorld(owner, 'coverage-formats-north');
  south = await createTenantWorld(owner, 'coverage-formats-south');
  for (const world of [north, south]) {
    const key = await provisionPracticeKey(keys, world.practiceId);
    await owner.query('UPDATE practice SET data_key_ref = $1 WHERE id = $2', [key.dataKeyRef, world.practiceId]);
  }
  northManager = await createUser(owner);
  await addMembership(owner, north.organizationId, northManager, 'billing_manager');
  southManager = await createUser(owner);
  await addMembership(owner, south.organizationId, southManager, 'billing_manager');
}, 60_000);

afterAll(async () => {
  await endPool(app);
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

async function call<R>(route: Route<R>, userId: string, params: Record<string, unknown>, input?: Record<string, unknown>, upload?: UploadBody): Promise<Outcome<R>> {
  return route.invoke(
    {
      cookies: new Jar(await sessionOf(userId)),
      params,
      input: route.mutation ? { requestKey: randomUUID(), csrfToken: csrfTokenFor(services.sealer, await sessionOf(userId)), ...input } : input,
      ...(upload === undefined ? {} : { upload }),
      requestId: `test-${randomUUID()}`,
      userAgent: null,
    },
    services,
  );
}

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

function body(bytes: Buffer, contentType: string): UploadBody {
  return { contentType, contentLength: bytes.length, body: Readable.from([bytes]) };
}

/** Uploads one file as the kind (and, for an ERA export, the format) a person chose, then runs the worker's jobs. */
async function upload(world: TenantWorld, manager: string, bytes: Buffer, file: { kind: string; contentType: string; formatId?: string }): Promise<string> {
  const params = { practiceId: world.practiceId };
  const requested = ok(await call(requestUploads, manager, params, { files: [{ ...file, sizeBytes: bytes.length }] }));
  const [document] = requested.documents;
  if (document === undefined) {
    throw new Error('no upload URL');
  }
  const token = new URL(document.upload.url).searchParams.get('token') ?? '';
  ok(await call(uploadContent, manager, { ...params, documentId: document.documentId }, { token }, body(bytes, file.contentType)));
  ok(await call(completeUpload, manager, params, { documentId: document.documentId }));
  await runQueue();
  return document.documentId;
}

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

async function status(documentId: string): Promise<string | undefined> {
  return (await owner.query<{ status: string }>('SELECT status FROM source_document WHERE id = $1', [documentId])).rows[0]?.status;
}

async function flagged(world: TenantWorld, manager: string) {
  return ok(await call(coveragePage, manager, { practiceId: world.practiceId })).unconfirmedFormats;
}

describe('the Coverage flag for an unconfirmed ERA export format (CO-03)', () => {
  it('flags nothing while only 835s are loaded', async () => {
    const id = await upload(north, northManager, readFileSync(path.join(FIXTURES, 'PAR-22/remit.835')), { kind: 'x12_835', contentType: 'application/octet-stream' });
    expect(await status(id)).toBe('loaded');
    expect(await flagged(north, northManager)).toEqual([]);
  }, 60_000);

  it('names the format, with the remittances, lines, payers and billed dollars read from it, as its manifest gives them', async () => {
    // Every format of the registry is unconfirmed until its description arrives.
    expect(unconfirmedEraFormatIds()).toEqual(ERA_EXPORT_FORMATS.map((format) => format.id));
    const raintree = manifest('raintree_era_v0');
    const id = await upload(north, northManager, exportBytes('raintree_era_v0'), { kind: 'era_export', contentType: 'text/csv', formatId: 'raintree_era_v0' });
    // PAR-22's payment was loaded from its 835 above, so the export loads every other payment and that one not again.
    expect(await status(id)).toBe('loaded');
    const par22 = raintree.rows.filter((row) => row.trace === 'SYNEFTPAR22001');
    expect(par22.length).toBeGreaterThan(0);
    const rows = raintree.rows.filter((row) => !par22.includes(row));
    const [source, ...others] = await flagged(north, northManager);
    expect(others).toEqual([]);
    expect(source).toEqual({
      formatId: 'raintree_era_v0',
      name: 'Raintree ERA export',
      remittances: raintree.checks.length - 1,
      payers: new Set(rows.map((row) => row.payerName)).size,
      lines: rows.length,
      chargeCents: rows.reduce((sum, row) => sum + BigInt(row.chargeCents), 0n).toString(),
      payerNames: [...new Set(rows.map((row) => row.payerName))].sort(),
    });
    expect(unconfirmedFormatExplanation(source?.name ?? '')).toBe(
      'PaidWhole reads the Raintree ERA export with a placeholder layout, because no description of the format has been received from its vendor. Check these lines against the export before relying on their amounts. The flag clears when the format is confirmed.',
    );
  }, 60_000);

  it('adds nothing for an export whose payments were already loaded, and keeps each practice to its own', async () => {
    const before = await flagged(north, northManager);
    // The SPRY export holds the same payments: all of them are already loaded, so it loads nothing and adds no source.
    const id = await upload(north, northManager, exportBytes('spry_era_v0'), { kind: 'era_export', contentType: 'text/csv', formatId: 'spry_era_v0' });
    expect(await status(id)).toBe('duplicate');
    expect(await flagged(north, northManager)).toEqual(before);
    // South's own export is South's alone; North still sees Raintree only.
    expect(await flagged(south, southManager)).toEqual([]);
    await upload(south, southManager, exportBytes('spry_era_v0'), { kind: 'era_export', contentType: 'text/csv', formatId: 'spry_era_v0' });
    const spry = manifest('spry_era_v0');
    expect(await flagged(south, southManager)).toEqual([expect.objectContaining({ formatId: 'spry_era_v0', name: 'SPRY ERA export', remittances: spry.checks.length, lines: spry.rows.length })]);
    expect(await flagged(north, northManager)).toEqual(before);
    // The app role reads under the practice's policies: North's scope counts nothing of South's.
    const crossed = await withPracticeScope(app, { practiceIds: [north.practiceId], actorId: northManager }, (scope) => unconfirmedFormatSources(scope, south.practiceId));
    expect(crossed).toEqual([]);
  }, 60_000);

  it('clears once the format is confirmed: only unconfirmed formats are flagged', async () => {
    const confirmed = unconfirmedEraFormatIds().filter((id) => id !== 'raintree_era_v0');
    const shown = await withPracticeScope(app, { practiceIds: [north.practiceId], actorId: northManager }, (scope) => unconfirmedFormatSources(scope, north.practiceId, confirmed));
    expect(shown).toEqual([]);
    expect(await withPracticeScope(app, { practiceIds: [north.practiceId], actorId: northManager }, (scope) => unconfirmedFormatSources(scope, north.practiceId, []))).toEqual([]);
  });
});
