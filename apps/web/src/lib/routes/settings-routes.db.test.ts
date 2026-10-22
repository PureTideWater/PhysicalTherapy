import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, provisionPracticeKey, readDatabaseUrl, withJobScope } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { type JobContext, intakeHandler, intakeServices, parseHandler, priceHandler } from '@tp/worker/runtime';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import { csrfTokenFor } from '../http/csrf';
import type { CookieJar, Outcome, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { LocalUploadTargets } from '../uploads/targets';
import { coveragePage } from './coverage';
import { mapPlanAction } from './mapping';
import { practiceHome } from './practice';
import { createPricingRunAction, pricingRunPage } from './pricing';
import { confirmPricingLocationAction, pricingSettingsPage, setPricingLocationAction, settingsPage } from './settings';
import { loadRouteRelease } from './test-support/pricing-world';
import { completeUpload, requestUploads, uploadContent } from './uploads';

/**
 * Pricing settings through their routes (audit #33; #16's minimal record; the founder's answers of 2026-10-21 to PR
 * 6b's Q2 (a) and Q5 (a); docs/adr/0064; test matrix PRC-23): the location and its status in plain words for everyone
 * who opens the practice, set and confirmed by the practice administrator, the billing manager and the firm principal
 * (a viewer and an analyst are refused), each change audited and the monitoring chain queued by its request; Getting
 * started's "Confirm your billing ZIP"; and a month whose Medicare line needs the ZIP+4 waiting, named with its dollars
 * on Pricing settings and Coverage. SYNTHETIC release 900001 (00011 is known; 00012 needs its ZIP+4, and 900001 has no
 * ZIP+4 list) and the SYNTHETIC 835 of MAP-05 (one Medicare Advantage claim of three February 2026 lines).
 */

const masterKey = randomBytes(32);
const keys = new LocalKeyProvider(masterKey);
const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-settings-routes-'));
const documents = new DocumentStore(new LocalSealedBytes(documentsDir));
const FIXTURES = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic');

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let services: Services;
let queue: MemoryQueue;
let world: TenantWorld;
let manager: string;
let analyst: string;
let viewer: string;
let practiceId: string;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  await loadRouteRelease(owner);
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
    uploads: new LocalUploadTargets('http://localhost:3100', documents, sealer),
    queue,
    documents,
  });
  world = await createTenantWorld(owner, 'pricing settings');
  practiceId = world.practiceId;
  const key = await provisionPracticeKey(keys, practiceId);
  await owner.query('UPDATE practice SET data_key_ref = $1, settings = $3 WHERE id = $2', [key.dataKeyRef, practiceId, JSON.stringify({ place_of_service_settings: { '11': 'non_facility' } })]);
  manager = await createUser(owner);
  await addMembership(owner, world.organizationId, manager, 'billing_manager');
  analyst = await createUser(owner);
  await addMembership(owner, world.organizationId, analyst, 'analyst');
  viewer = await createUser(owner);
  await addMembership(owner, world.organizationId, viewer, 'viewer');
  await asOwner(owner, [practiceId], () =>
    owner.query(
      `INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256) VALUES ($1, $2, 'baa', '1', now(), 'SYNTHETIC SIGNER', 'esign:synthetic-baa', $3)`,
      [world.organizationId, practiceId, randomBytes(32).toString('hex')],
    ),
  );
  await send('MAP-05/remit.835');
}, 120_000);

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

async function call<R>(route: Route<R>, userId: string, params: Record<string, unknown>, input?: Record<string, unknown>): Promise<Outcome<R>> {
  return route.invoke(
    { cookies: new Jar(await sessionOf(userId)), params, input: route.mutation ? { csrfToken: csrfTokenFor(services.sealer, await sessionOf(userId)), requestKey: randomUUID(), ...input } : input, requestId: `test-${randomUUID()}`, userAgent: null },
    services,
  );
}

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

const P = () => ({ practiceId });

function jobContext(): JobContext {
  const jobId = randomUUID();
  return {
    jobId,
    logger: createLogger({ sink: () => undefined }),
    transaction: (work) => withJobScope(app, { jobId, practiceId }, work),
    enqueue: (type, next) => queue.enqueue(type, next),
    lastAttempt: false,
  };
}

/** Runs the queued intake, parse and price jobs as the worker would; the monitor's are left in the queue for the test to read. */
async function runQueue(): Promise<void> {
  const jobs = intakeServices({ documents: { kind: 'local', dir: documentsDir }, keys: { kind: 'local', masterKey }, scanWaitMs: 1000 });
  for (let batch = queue.jobs.splice(0); batch.length > 0; batch = queue.jobs.splice(0)) {
    for (const job of batch) {
      if (job.type === 'intake') {
        await intakeHandler(jobs)(job.payload as { practice_id: string; document_id: string }, jobContext());
      } else if (job.type === 'parse_835') {
        await parseHandler(jobs)(job.payload as { practice_id: string; document_id: string }, jobContext());
      } else if (job.type === 'price') {
        await priceHandler()(job.payload as { practice_id: string; pricing_run_id: string }, jobContext());
      }
    }
  }
}

/** Uploads a SYNTHETIC 835 through the upload routes, and lets the worker load it. */
async function send(file: string): Promise<void> {
  const bytes = readFileSync(path.join(FIXTURES, file));
  const [document] = ok(await call(requestUploads, manager, P(), { files: [{ kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: bytes.length }] })).documents;
  if (document === undefined) {
    throw new Error('no upload URL');
  }
  const token = new URL(document.upload.url).searchParams.get('token') ?? '';
  ok(
    await uploadContent.invoke(
      {
        cookies: new Jar(await sessionOf(manager)),
        params: { ...P(), documentId: document.documentId },
        input: { requestKey: randomUUID(), csrfToken: csrfTokenFor(services.sealer, await sessionOf(manager)), token },
        upload: { contentType: 'application/octet-stream', contentLength: bytes.length, body: Readable.from([bytes]) },
        requestId: `test-${randomUUID()}`,
        userAgent: null,
      },
      services,
    ),
  );
  ok(await call(completeUpload, manager, P(), { documentId: document.documentId }));
  await runQueue();
}

/** Getting started's "Confirm your billing ZIP", as the practice administrator's Settings screen shows it. */
async function billingZipStep(): Promise<boolean | undefined> {
  return ok(await call(settingsPage, world.adminUserId, P())).checklist?.find((step) => step.key === 'billing_zip')?.done;
}

describe('the location and its status, for everyone who opens the practice', () => {
  it('reads the ZIP and the status in plain words; only pricing_settings.set may change it', async () => {
    const asViewer = ok(await call(pricingSettingsPage, viewer, P()));
    expect(asViewer).toMatchObject({
      locationText: '00011',
      location: { zip: '00011', zipPlusFour: null },
      reading: { status: 'ready', text: 'Medicare prices this location in locality 99999-01 under rule release 900001.', carrier: '99999', locality: '01', releaseNo: 900001 },
      canEdit: false,
      waiting: [],
      pricedBefore: [],
      notice: null,
    });
    // The practice's own place, and no split approved yet (only the practice's places apply).
    expect(asViewer.places).toEqual([{ code: '11', setting: 'non_facility', source: 'practice' }]);
    expect(asViewer.split).toBe('none');
    for (const editor of [manager, world.adminUserId]) {
      expect(ok(await call(pricingSettingsPage, editor, P())).canEdit).toBe(true);
    }
    // The practice overview shows the location's ZIP.
    expect(ok(await call(practiceHome, viewer, P())).practice).toMatchObject({ zip: '00011', zipPlusFour: null });
    // A viewer and an analyst are refused both actions, and nothing is written.
    for (const refused of [viewer, analyst]) {
      expect((await call(setPricingLocationAction, refused, P(), { zip: '00012' })).status).toBe('forbidden');
      expect((await call(confirmPricingLocationAction, refused, P(), { confirm: 'on' })).status).toBe('forbidden');
    }
    expect((await owner.query('SELECT zip FROM practice_site WHERE practice_id = $1', [practiceId])).rows).toEqual([{ zip: '00011' }]);
    expect(queue.jobs).toEqual([]);
  });

  it('refuses a ZIP that is not five digits or ZIP+4, by its field, and the database refuses one sent around the handler', async () => {
    for (const zip of ['', '2760', '27601-12', '27601 1234', 'ZIP 00011']) {
      expect(await call(setPricingLocationAction, manager, P(), { zip }), zip).toEqual({ status: 'invalid', issues: [{ field: 'zip', message: 'five digits, or ZIP+4 such as 27601-1234' }] });
    }
    expect(await call(confirmPricingLocationAction, manager, P(), {})).toMatchObject({ status: 'invalid', issues: [{ field: 'confirm' }] });
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [manager, `{${practiceId}}`]);
      await expect(client.query("SELECT practice_set_location($1, '2760', NULL)", [practiceId])).rejects.toMatchObject({ code: '23514', constraint: 'practice_site_zip' });
      await client.query('ROLLBACK');
      // An analyst, as the application, is refused by Postgres's own check of pricing_settings.set.
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [analyst, `{${practiceId}}`]);
      await expect(client.query("SELECT practice_set_location($1, '00012', NULL)", [practiceId])).rejects.toMatchObject({ code: '42501' });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});

describe('Getting started: "Confirm your billing ZIP"', () => {
  it('waits for a person of the practice to confirm a location they did not set, and again after it changes elsewhere', async () => {
    // Created with the practice, by no person of it: not confirmed yet.
    expect(await billingZipStep()).toBe(false);
    expect(ok(await call(pricingSettingsPage, world.adminUserId, P())).confirmed).toBe(false);
    const confirmed = ok(await call(confirmPricingLocationAction, world.adminUserId, P(), { confirm: 'on' }));
    expect(confirmed).toEqual({ objectId: practiceId, redirect: `/p/${practiceId}/settings/pricing?notice=confirmed` });
    expect(await billingZipStep()).toBe(true);
    expect((await owner.query("SELECT actor_id, object_type, object_id FROM audit_event WHERE action = 'pricing_location_confirmed'")).rows).toEqual([
      { actor_id: world.adminUserId, object_type: 'practice', object_id: practiceId },
    ]);
    // Changed by the platform (the console's setter, or here the owner): it waits for the practice's confirmation again.
    await owner.query("UPDATE practice_site SET zip = '00011' WHERE practice_id = $1", [practiceId]);
    expect(await billingZipStep()).toBe(false);
  });
});

describe('saving the location (audit #33)', () => {
  it('saves it, audits it, queues the monitoring chain by the request, and says a ZIP needs its ZIP+4 without refusing it', async () => {
    const saved = ok(await call(setPricingLocationAction, manager, P(), { zip: ' 00012 ' }));
    expect(saved).toEqual({ objectId: practiceId, redirect: `/p/${practiceId}/settings/pricing?notice=saved` });
    expect((await owner.query('SELECT zip, zip_plus_four, updated_by FROM practice_site WHERE practice_id = $1', [practiceId])).rows).toEqual([{ zip: '00012', zip_plus_four: null, updated_by: manager }]);
    const audit = await owner.query<{ actor_id: string; object_type: string; object_id: string; request_id: string }>(
      "SELECT actor_id, object_type, object_id, request_id FROM audit_event WHERE action = 'pricing_location_set'",
    );
    expect(audit.rows).toEqual([{ actor_id: manager, object_type: 'practice', object_id: practiceId, request_id: expect.stringMatching(/^test-/) }]);
    expect(queue.jobs.splice(0)).toEqual([{ type: 'monitor', payload: { practice_id: practiceId, request_id: audit.rows[0]?.request_id } }]);
    const page = ok(await call(pricingSettingsPage, viewer, { ...P(), notice: 'saved' }));
    expect(page).toMatchObject({
      locationText: '00012',
      reading: { status: 'zip_plus_four_needed', text: 'Medicare splits ZIP 00012 between payment localities. Add its ZIP+4.', carrier: null, locality: null },
      notice: 'saved',
    });
    // Set by a person of the practice, but there is something left for the customer to change: not done.
    expect(await billingZipStep()).toBe(false);
  });

  it('holds a month whose Medicare line needs the ZIP+4, with no line kept, and names it with its dollars on Pricing settings and Coverage', async () => {
    // A contract specialist approves the place-of-service split: every place the practice has not set takes its setting.
    const internal = await createOrganization(owner, 'internal');
    const specialist = await createUser(owner, { hardwareKeyRequired: true });
    await addMembership(owner, internal, specialist, 'contract_specialist');
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [specialist]);
      await client.query('SELECT console_approve_place_of_service_split($1::jsonb)', [JSON.stringify({ '11': 'facility', '12': 'non_facility' })]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    expect(ok(await call(pricingSettingsPage, viewer, P())).split).toBe('not_read');
    const plan = ((await owner.query<{ id: string }>('SELECT id FROM plan WHERE practice_id = $1 AND plan_key = $2', [practiceId, 'CE:SYNPLAN-MA-05'])).rows[0] ?? { id: '' }).id;
    ok(await call(mapPlanAction, manager, P(), { planId: plan, kind: 'ma_noncontracted', effectiveFrom: '2026-01-01' }));
    const created = ok(await call(createPricingRunAction, manager, P(), { fromMonth: '2026-02', releaseNo: '900001' }));
    const runId = /pricing-runs\/([0-9a-f-]{36})$/.exec(created.redirect ?? '')?.[1] ?? '';
    await runQueue();
    const run = ok(await call(pricingRunPage, manager, { ...P(), runId })).run;
    expect(run).toMatchObject({ status: 'failed', failureCode: 'location_not_ready' });
    expect((await owner.query('SELECT count(*)::int AS n FROM priced_line WHERE pricing_run_id = $1', [runId])).rows).toEqual([{ n: 0 }]);
    const waiting = [
      {
        periodFrom: '2026-02-01',
        periodTo: '2026-02-28',
        kind: 'location_not_ready',
        status: 'zip_plus_four_needed',
        text: 'Medicare splits ZIP 00012 between payment localities. Add its ZIP+4.',
        totals: { lines: 3, claims: 1, chargeCents: '32600', paidCents: '17641' },
      },
    ];
    const page = ok(await call(pricingSettingsPage, viewer, P()));
    expect(page.waiting).toEqual(waiting);
    // The run pinned the split: its places show, the practice's own setting first (11 stays non-facility).
    expect(page.split).toBe('shown');
    expect(page.places).toEqual([
      { code: '11', setting: 'non_facility', source: 'practice' },
      { code: '12', setting: 'non_facility', source: 'split' },
    ]);
    expect(ok(await call(coveragePage, manager, P())).waitingOnLocation).toEqual(waiting);
  });

  it('reads a ZIP+4 under a release with no ZIP+4 list as content not loaded, never as wrong digits; nothing is left to change, so the step is done', async () => {
    ok(await call(setPricingLocationAction, world.adminUserId, P(), { zip: '000120001' }));
    expect((await owner.query('SELECT zip, zip_plus_four FROM practice_site WHERE practice_id = $1', [practiceId])).rows).toEqual([{ zip: '00012', zip_plus_four: '0001' }]);
    expect(ok(await call(pricingSettingsPage, viewer, P()))).toMatchObject({
      locationText: '00012-0001',
      reading: { status: 'locality_not_loaded', text: 'PaidWhole has not loaded Medicare’s locality list for these dates yet. There is nothing to change here.' },
      confirmed: false,
    });
    // Set by the practice administrator, who reads the audit events: confirmed by the save itself.
    expect(ok(await call(pricingSettingsPage, world.adminUserId, P())).confirmed).toBe(true);
    expect(await billingZipStep()).toBe(true);
    expect(ok(await call(practiceHome, viewer, P())).practice).toMatchObject({ zip: '00012', zipPlusFour: '0001' });
    expect(queue.jobs.splice(0)).toEqual([{ type: 'monitor', payload: { practice_id: practiceId, request_id: expect.stringMatching(/^test-/) } }]);
  });
});
