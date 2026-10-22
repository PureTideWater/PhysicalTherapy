import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, provisionPracticeKey, readDatabaseUrl, withJobScope } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import type { JobPayload, JobType } from '@tp/worker/jobs';
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
let queue: SeenAtSend;
let world: TenantWorld;
let manager: string;
let analyst: string;
let viewer: string;
let firmPrincipal: string;
let practiceId: string;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  await loadRouteRelease(owner);
  app = openPool(database.appUrl, 6);
  const sealer = new Sealer(randomBytes(32));
  queue = new SeenAtSend();
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
  // A billing firm's principal, under an engagement grant in force that admits the role.
  const firmId = await createOrganization(owner, 'firm', 'pricing settings firm');
  firmPrincipal = await createUser(owner);
  await addMembership(owner, firmId, firmPrincipal, 'firm_principal');
  const engagement = randomUUID();
  await asOwner(owner, [practiceId], async () => {
    await owner.query(
      `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
       VALUES ($1, $2, $3, 'engagement', '1', now(), 'SYNTHETIC SIGNER', 'agreements/engagement', $4)`,
      [engagement, firmId, practiceId, randomBytes(32).toString('hex')],
    );
    await owner.query(
      `INSERT INTO "grant" (organization_id, practice_id, scope, ends_at, approved_by_user_id, agreement_id) VALUES ($1, $2, '{"roles":["firm_principal"]}', now() + interval '30 days', $3, $4)`,
      [firmId, practiceId, world.adminUserId, engagement],
    );
  });
  await send('MAP-05/remit.835');
}, 120_000);

/**
 * The queue in memory, recording for each monitor job the ZIP another connection reads when the job is sent: a job
 * sent before the save commits would be planned by an idle worker against the old location.
 */
class SeenAtSend extends MemoryQueue {
  readonly zipsSeen: string[] = [];

  override async enqueue<T extends JobType>(type: T, payload: JobPayload<T>): Promise<string | null> {
    if (type === 'monitor') {
      this.zipsSeen.push((await owner.query<{ zip: string }>('SELECT zip FROM practice_site WHERE practice_id = $1', [practiceId])).rows[0]?.zip ?? '');
    }
    return super.enqueue(type, payload);
  }
}

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

/** The confirm form as Pricing settings posts it: the box, and the ZIP and ZIP+4 the page showed (blank: none). */
const confirmForm = (shownZip: string, shownZipPlusFour = '') => ({ confirm: 'on', shownZip, shownZipPlusFour });

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
      expect((await call(confirmPricingLocationAction, refused, P(), confirmForm('00011'))).status).toBe('forbidden');
    }
    expect((await owner.query('SELECT zip FROM practice_site WHERE practice_id = $1', [practiceId])).rows).toEqual([{ zip: '00011' }]);
    expect(queue.jobs).toEqual([]);
  });

  it('refuses a ZIP that is not five digits or ZIP+4, by its field, and the database refuses one sent around the handler', async () => {
    for (const zip of ['', '2760', '27601-12', '27601 1234', 'ZIP 00011']) {
      expect(await call(setPricingLocationAction, manager, P(), { zip }), zip).toEqual({ status: 'invalid', issues: [{ field: 'zip', message: 'five digits, or ZIP+4 such as 27601-1234' }] });
    }
    expect(await call(confirmPricingLocationAction, manager, P(), { shownZip: '00011', shownZipPlusFour: '' })).toMatchObject({ status: 'invalid', issues: [{ field: 'confirm' }] });
    // The location the page showed travels with the confirmation, in its shapes (a tampered form names its field).
    expect(await call(confirmPricingLocationAction, manager, P(), { confirm: 'on' })).toMatchObject({ status: 'invalid', issues: [{ field: 'shownZip' }] });
    expect(await call(confirmPricingLocationAction, manager, P(), confirmForm('0001', '12a4'))).toMatchObject({ status: 'invalid', issues: [{ field: 'shownZip' }, { field: 'shownZipPlusFour' }] });
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
    const confirmed = ok(await call(confirmPricingLocationAction, world.adminUserId, P(), confirmForm('00011')));
    expect(confirmed).toEqual({ objectId: practiceId, redirect: `/p/${practiceId}/settings/pricing?notice=confirmed` });
    expect(await billingZipStep()).toBe(true);
    expect((await owner.query("SELECT actor_id, object_type, object_id FROM audit_event WHERE action = 'pricing_location_confirmed'")).rows).toEqual([
      { actor_id: world.adminUserId, object_type: 'practice', object_id: practiceId },
    ]);
    // Changed by the platform (the console's setter, or here the owner, there and back): it waits for the practice's
    // confirmation again. A write of the same ZIP changes nothing, so it would leave the confirmation standing.
    await owner.query("UPDATE practice_site SET zip = '00011' WHERE practice_id = $1", [practiceId]);
    expect(await billingZipStep()).toBe(true);
    await changedByThePlatform();
    expect(await billingZipStep()).toBe(false);
  });
});

/** The owner changes the location and sets it back, as the console could: a change since any confirmation. */
async function changedByThePlatform(): Promise<void> {
  await owner.query("UPDATE practice_site SET zip = '00012' WHERE practice_id = $1", [practiceId]);
  await owner.query("UPDATE practice_site SET zip = '00011' WHERE practice_id = $1", [practiceId]);
}

describe('the confirmation, as every role that may give it (review of PR 6b-2, findings 1 and 8)', () => {
  it('is recorded on the location for the billing manager and the firm principal, who then see it, as everyone who opens the practice does', async () => {
    expect(ok(await call(pricingSettingsPage, manager, P())).confirmed).toBe(false);
    expect(ok(await call(confirmPricingLocationAction, manager, P(), confirmForm('00011')))).toEqual({ objectId: practiceId, redirect: `/p/${practiceId}/settings/pricing?notice=confirmed` });
    for (const person of [manager, viewer, analyst, world.adminUserId]) {
      expect(ok(await call(pricingSettingsPage, person, P())).confirmed, person).toBe(true);
    }
    expect(await billingZipStep()).toBe(true);
    expect((await owner.query('SELECT confirmed_by FROM practice_site WHERE practice_id = $1', [practiceId])).rows).toEqual([{ confirmed_by: manager }]);
    await changedByThePlatform();
    expect(ok(await call(pricingSettingsPage, firmPrincipal, P()))).toMatchObject({ canEdit: true, confirmed: false });
    ok(await call(confirmPricingLocationAction, firmPrincipal, P(), confirmForm('00011')));
    expect(ok(await call(pricingSettingsPage, firmPrincipal, P())).confirmed).toBe(true);
    expect(ok(await call(pricingSettingsPage, manager, P())).confirmed).toBe(true);
    expect((await owner.query('SELECT confirmed_by FROM practice_site WHERE practice_id = $1', [practiceId])).rows).toEqual([{ confirmed_by: firmPrincipal }]);
    // Each confirmation is still an audit event, by the person who gave it.
    expect((await owner.query("SELECT actor_id FROM audit_event WHERE action = 'pricing_location_confirmed' ORDER BY at, id")).rows.slice(-2)).toEqual([
      { actor_id: manager },
      { actor_id: firmPrincipal },
    ]);
  });
});

describe('a confirmation from a page that showed another location (verification of PR 6b-2, finding 1)', () => {
  const CHANGED = { status: 'invalid', issues: [{ field: 'shownZip', message: 'The billing ZIP changed since this page loaded. Review it, then confirm.' }] };
  const confirmations = async () => (await owner.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_event WHERE action = 'pricing_location_confirmed'")).rows[0]?.n;
  const site = async () =>
    (
      await owner.query<{ zip: string; zip_plus_four: string | null; confirmed_by: string | null }>('SELECT zip, zip_plus_four, confirmed_by FROM practice_site WHERE practice_id = $1', [
        practiceId,
      ])
    ).rows[0];

  it('confirms nothing from a page read before the location changed, says so, and the page read again shows the location as it stands, which is then confirmed', async () => {
    // The billing manager's page shows 00011, confirmed; the platform then sets 00012-5000 (as the console would).
    expect(ok(await call(pricingSettingsPage, manager, P()))).toMatchObject({ location: { zip: '00011', zipPlusFour: null }, confirmed: true });
    await owner.query("UPDATE practice_site SET zip = '00012', zip_plus_four = '5000' WHERE practice_id = $1", [practiceId]);
    const before = { confirmations: await confirmations(), site: await site() };
    expect(await call(confirmPricingLocationAction, manager, P(), confirmForm('00011'))).toEqual(CHANGED);
    // A page that showed the ZIP without the ZIP+4 it now has showed another location too.
    expect(await call(confirmPricingLocationAction, manager, P(), confirmForm('00012'))).toEqual(CHANGED);
    expect({ confirmations: await confirmations(), site: await site() }).toEqual(before);
    // The page read again, with the notice: the location as it stands, waiting for the practice's confirmation.
    expect(ok(await call(pricingSettingsPage, manager, { ...P(), notice: 'changed' }))).toMatchObject({
      notice: 'changed',
      locationText: '00012-5000',
      reading: { status: 'locality_not_loaded' },
      confirmed: false,
    });
    expect(await billingZipStep()).toBe(false);
    expect(ok(await call(confirmPricingLocationAction, manager, P(), confirmForm('00012', '5000')))).toEqual({ objectId: practiceId, redirect: `/p/${practiceId}/settings/pricing?notice=confirmed` });
    expect(ok(await call(pricingSettingsPage, manager, P())).confirmed).toBe(true);
    expect(await confirmations()).toBe((before.confirmations ?? 0) + 1);
  });

  it('refuses through the database one that read the location before a change committed while it waited (practice_site_changed), in the same words', async () => {
    // A change of the location holds its row, uncommitted, when the billing manager confirms what the page showed.
    const watcher = databaseClient(database.url);
    await watcher.connect();
    await owner.query('BEGIN');
    try {
      await owner.query("UPDATE practice_site SET zip = '00011', zip_plus_four = NULL WHERE practice_id = $1", [practiceId]);
      const holder = (await owner.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid;
      const before = await confirmations();
      // The handler reads 00012-5000 as committed, and the database's confirmation waits on the change's lock.
      const confirming = call(confirmPricingLocationAction, manager, P(), confirmForm('00012', '5000'));
      let waiting = false;
      for (let attempt = 0; attempt < 400 && !waiting; attempt += 1) {
        waiting =
          (await watcher.query<{ waiting: boolean }>('SELECT EXISTS (SELECT 1 FROM pg_stat_activity a WHERE $1 = ANY (pg_blocking_pids(a.pid))) AS waiting', [holder])).rows[0]?.waiting === true;
        if (!waiting) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
      expect(waiting).toBe(true);
      await owner.query('COMMIT');
      expect(await confirming).toEqual(CHANGED);
      expect(await confirmations()).toBe(before);
    } catch (error) {
      await owner.query('ROLLBACK');
      throw error;
    } finally {
      await watcher.end();
    }
    expect(await site()).toMatchObject({ zip: '00011', zip_plus_four: null });
    expect(ok(await call(pricingSettingsPage, manager, P())).confirmed).toBe(false);
    // Confirmed as it stands, so the tests below start from a confirmed 00011.
    ok(await call(confirmPricingLocationAction, world.adminUserId, P(), confirmForm('00011')));
  });
});

describe('saving the location (audit #33)', () => {
  it('saves it, audits it, queues the monitoring chain by the request, and says a ZIP needs its ZIP+4 without refusing it', async () => {
    // The worker's own sends while the upload loaded are not this save's.
    queue.zipsSeen.splice(0);
    const saved = ok(await call(setPricingLocationAction, manager, P(), { zip: ' 00012 ' }));
    expect(saved).toEqual({ objectId: practiceId, redirect: `/p/${practiceId}/settings/pricing?notice=saved` });
    expect((await owner.query('SELECT zip, zip_plus_four, updated_by FROM practice_site WHERE practice_id = $1', [practiceId])).rows).toEqual([{ zip: '00012', zip_plus_four: null, updated_by: manager }]);
    const audit = await owner.query<{ actor_id: string; object_type: string; object_id: string; request_id: string }>(
      "SELECT actor_id, object_type, object_id, request_id FROM audit_event WHERE action = 'pricing_location_set'",
    );
    expect(audit.rows).toEqual([{ actor_id: manager, object_type: 'practice', object_id: practiceId, request_id: expect.stringMatching(/^test-/) }]);
    expect(queue.jobs.splice(0)).toEqual([{ type: 'monitor', payload: { practice_id: practiceId, request_id: audit.rows[0]?.request_id } }]);
    // Sent once the save had committed: another connection already read the saved ZIP.
    expect(queue.zipsSeen.splice(0)).toEqual(['00012']);
    const page = ok(await call(pricingSettingsPage, viewer, { ...P(), notice: 'saved' }));
    expect(page).toMatchObject({
      locationText: '00012',
      reading: { status: 'zip_plus_four_needed', text: 'Medicare splits ZIP 00012 between payment localities. Add its ZIP+4.', carrier: null, locality: null },
      notice: 'saved',
    });
    // Set by a person of the practice, but there is something left for the customer to change: not done, and the step
    // asks for that, not for a confirmation.
    expect(await billingZipStep()).toBe(false);
    const step = ok(await call(settingsPage, world.adminUserId, P())).checklist?.find((entry) => entry.key === 'billing_zip');
    expect(step).toMatchObject({ title: 'Add your billing ZIP+4', detail: 'Medicare splits ZIP 00012 between payment localities. Add its ZIP+4.' });
    // A location that still asks for its ZIP+4 is not confirmed as it stands, whoever sends the confirmation.
    const confirmations = async () => (await owner.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_event WHERE action = 'pricing_location_confirmed'")).rows[0]?.n;
    const before = await confirmations();
    expect(await call(confirmPricingLocationAction, world.adminUserId, P(), confirmForm('00012'))).toEqual({
      status: 'invalid',
      issues: [{ field: 'zip', message: 'Medicare splits ZIP 00012 between payment localities. Add its ZIP+4.' }],
    });
    expect(await confirmations()).toBe(before);
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
    // Set by a person of the practice: the save is their confirmation, which everyone who opens the practice reads.
    expect(ok(await call(pricingSettingsPage, viewer, P()))).toMatchObject({
      locationText: '00012-0001',
      reading: { status: 'locality_not_loaded', text: 'PaidWhole has not loaded Medicare’s ZIP+4 list for ZIP 00012 yet. There is nothing for you to change.' },
      confirmed: true,
    });
    // February's run stopped on the old location; the location now leaves the customer nothing to change, so the month
    // is being priced with it, never listed under a status sentence it no longer has.
    expect(ok(await call(pricingSettingsPage, viewer, P())).waiting).toEqual([
      expect.objectContaining({ periodFrom: '2026-02-01', kind: 'repricing', status: 'locality_not_loaded', text: 'Being priced with the new location.' }),
    ]);
    expect(ok(await call(pricingSettingsPage, world.adminUserId, P())).confirmed).toBe(true);
    expect(await billingZipStep()).toBe(true);
    // Content PaidWhole loads leaves the customer nothing to change: the billing manager's confirmation is taken too.
    ok(await call(confirmPricingLocationAction, manager, P(), confirmForm('00012', '0001')));
    expect((await owner.query('SELECT confirmed_by FROM practice_site WHERE practice_id = $1', [practiceId])).rows).toEqual([{ confirmed_by: manager }]);
    expect(ok(await call(practiceHome, viewer, P())).practice).toMatchObject({ zip: '00012', zipPlusFour: '0001' });
    expect(queue.jobs.splice(0)).toEqual([{ type: 'monitor', payload: { practice_id: practiceId, request_id: expect.stringMatching(/^test-/) } }]);
  });
});

describe('months priced before the location changed', () => {
  it('lists a complete run by the location it was priced at, never by the time of a save that changed nothing', async () => {
    const pricedElsewhere = async () => ok(await call(pricingSettingsPage, viewer, P())).pricedBefore.map((run) => run.runId);
    ok(await call(setPricingLocationAction, manager, P(), { zip: '00011' }));
    // February priced at 00011 (the location now): nothing to list.
    const created = ok(await call(createPricingRunAction, manager, P(), { fromMonth: '2026-02', releaseNo: '900001' }));
    const runId = /pricing-runs\/([0-9a-f-]{36})$/.exec(created.redirect ?? '')?.[1] ?? '';
    await runQueue();
    expect(ok(await call(pricingRunPage, manager, { ...P(), runId })).run).toMatchObject({ status: 'complete' });
    expect(await pricedElsewhere()).toEqual([]);
    // The same ZIP saved again changes no price: still nothing to list.
    ok(await call(setPricingLocationAction, manager, P(), { zip: '00011' }));
    expect(await pricedElsewhere()).toEqual([]);
    // Another location: the run keeps 00011's prices until it is re-run.
    ok(await call(setPricingLocationAction, manager, P(), { zip: '00012-0001' }));
    expect(await pricedElsewhere()).toEqual([runId]);
    // And back to 00011: the run's prices are the location's again.
    ok(await call(setPricingLocationAction, manager, P(), { zip: '00011' }));
    expect(await pricedElsewhere()).toEqual([]);
    queue.jobs.splice(0);
  });
});
