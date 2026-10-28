import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Page, expect, test } from '@playwright/test';

import {
  EvidenceResolver,
  RATE_RECORD_FIELDS,
  type WorkflowContext,
  addRateRecord,
  approveRateRecordField,
  approveVersion,
  citeDisputeWindow,
  createContract,
  createDraftVersion,
  mapPlan,
  signOffVersion,
  verifyDisputeWindow,
} from '@tp/contracts';
import { documentPages } from '@tp/contracts/pages';
import { syntheticPdf } from '@tp/contracts/testing';
import { LocalKeyProvider, appDevLoginUrl, developmentMasterKey, openPool, provisionPracticeKey, withPracticeScope } from '@tp/db';
import { asOwner, createPracticeWithLocation } from '@tp/db/testing';
import { type JobPayload, type JobType, enqueue, singletonKey } from '@tp/worker/jobs';
import { createPricingRun } from '@tp/worker/pricing';
import { PgBoss } from 'pg-boss';

import { personaEmail } from '../scripts/synthetic-personas';
import { FileDevStore } from '../src/lib/auth/dev-store';
import { E2E_DEV_AUTH_DIR, e2eDatabaseUrl } from './env';
import { registerKeyAndSignIn, withDatabase } from './helpers';

/**
 * The journeys' shared setup on the e2e database (synthetic data only). Each journey works in a
 * practice of its own in the other group, so no other spec's counts move: created once per database
 * with its BAA and engagement letter on file, the settings the journey names, and support grants for
 * the internal people it needs (the contract specialist always, who abstracts its payer's schedule).
 * Beside the browser, a journey's payer schedule is abstracted by the specialist and signed off by a
 * billing manager through @tp/contracts, its plan mapped, and its months priced and triaged by the
 * worker's own jobs (the caller keeps the worker running), as PRD 5's J5 to J7 do on screen in their
 * own specs. The browser does the journey's own steps.
 *
 * CI retries a failed test once, and a retry finds its practice (kept by name) holding what the attempt before it did. So
 * on a retry each step here, and each upload a journey makes (uploadedEarlier), first reads what that attempt already
 * did and does only the rest, each step being one transaction or one job: the retry reaches the state a first attempt
 * does, with nothing done twice (a remittance uploaded again would be held as a duplicate of itself, a schedule's plan
 * cannot be mapped twice, and a second pricing run would price the period again). A first attempt does every step.
 */

/** Whether the running test is a retry (test.info().retry > 0), whose practice holds the attempt before it. */
function retrying(): boolean {
  return test.info().retry > 0;
}

export async function userId(key: string): Promise<string> {
  return withDatabase(async (client) => (await client.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [personaEmail(key)])).rows[0]?.id ?? '');
}

/**
 * The practice administrator persona of the journeys' practices (the other group's, which owns them by ownership): the
 * one who sets a practice's correspondence contact (audit item #37 part 1, D6; the packets journey's E2). Every
 * practice administrator of the other group administers them, so a spec that may run beside the packets journey signs
 * in one of its own instead (tables-phone.spec.ts, tables-practice-admin): two sign-ins of one persona in one 30 s TOTP
 * step can be refused as a replay.
 */
export const JOURNEY_PRACTICE_ADMIN = 'other-admin';

export interface JourneyPracticeOptions {
  readonly name: string;
  readonly settings: object;
  /** Internal personas who reach the practice under a support grant, beside the contract specialist. */
  readonly supportFor?: readonly string[];
}

/** The journey's practice (created once per database): its ID. */
export async function journeyPractice(options: JourneyPracticeOptions): Promise<string> {
  return withDatabase(async (client) => {
    const existing = (await client.query<{ id: string }>('SELECT id FROM practice WHERE name = $1', [options.name])).rows[0];
    if (existing !== undefined) {
      return existing.id;
    }
    const organization = (await client.query<{ organization_id: string }>("SELECT organization_id FROM practice WHERE name = 'SYNTHETIC OTHER PRACTICE'")).rows[0]?.organization_id ?? '';
    const id = randomUUID();
    const key = await provisionPracticeKey(new LocalKeyProvider(developmentMasterKey()), id);
    const internal = await Promise.all(['contract-specialist', ...(options.supportFor ?? [])].map((persona) => userId(persona)));
    await asOwner(client, [id], async () => {
      // With its pricing location (practice_site, PR 6b): ZIP 27601, as practice.zip was.
      await createPracticeWithLocation(client, { id, organizationId: organization, name: options.name, dataKeyRef: key.dataKeyRef, zip: '27601', settings: options.settings as Readonly<Record<string, unknown>> });
      for (const kind of ['baa', 'engagement'] as const) {
        await client.query(
          `INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
           VALUES ($1, $2, $3, '1', now() - interval '30 days', 'SYNTHETIC SIGNER', $4, $5)`,
          [organization, id, kind, `esign:synthetic-${id}-${kind}`, createHash('sha256').update(`${options.name} ${kind}`).digest('hex')],
        );
      }
      for (const [index, person] of internal.entries()) {
        await client.query("INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, $3, 'SYNTHETIC JOURNEY ACCESS', now() + interval '4 hours')", [id, person, `SYN-JOURNEY-${String(index + 1)}`]);
      }
    });
    return id;
  });
}

/**
 * A support grant on the practice for an internal persona, as a ticket opens one (four hours), when the persona holds
 * none in force: for a journey's practice that was created before the persona needed it.
 */
export async function supportGrant(practiceId: string, key: string): Promise<void> {
  const person = await userId(key);
  await withDatabase((client) =>
    asOwner(client, [practiceId], () =>
      client.query(
        `INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at)
         SELECT $1, $2, 'SYN-JOURNEY-GRANT', 'SYNTHETIC JOURNEY ACCESS', now() + interval '4 hours'
          WHERE NOT EXISTS (SELECT 1 FROM support_grant WHERE practice_id = $1 AND user_id = $2 AND expires_at > now())`,
        [practiceId, person],
      ),
    ),
  );
}

/**
 * An internal persona's first sign-in (e2e/helpers.ts, registerKeyAndSignIn) that a retry can repeat: on a retry the
 * hardware key the attempt before registered, in a browser that is gone, is first taken out of the local identity
 * provider's store (the key is never in the database), so the persona registers a key again. A first attempt has none.
 */
export async function registerKeyAndSignInAgain(page: Page, key: string): Promise<void> {
  if (retrying()) {
    const store = new FileDevStore(path.join(E2E_DEV_AUTH_DIR, 'store.json'));
    const record = await store.byEmail(personaEmail(key));
    if (record !== undefined) {
      await store.update(record.sub, (current) => ({ ...current, credentials: [] }));
    }
  }
  await registerKeyAndSignIn(page, key);
}

/** Queues a job on the e2e queue, as the web app or the monitoring chain does. */
export async function queue<T extends JobType>(type: T, payload: JobPayload<T>): Promise<void> {
  const boss = new PgBoss(e2eDatabaseUrl());
  boss.on('error', () => undefined);
  await boss.start();
  try {
    await enqueue(boss, type, payload);
  } finally {
    await boss.stop({ graceful: false, close: true });
  }
}

export async function until(check: () => Promise<boolean>, what: string, timeoutMs = 90_000): Promise<void> {
  const ends = Date.now() + timeoutMs;
  while (Date.now() < ends) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** The chain's steps after a parse: a job of these of the practice still queued or running means the chain has not run out. */
const CHAIN_STEPS = ['monitor', 'price', 'triage', 'reconcile'];

/**
 * The monitoring chain from a parsed 835 (PRD 5, J11; docs/adr/0039 and 0043), for a practice whose
 * monitor step the e2e worker runs (e2e/worker.ts, CHAINED_PRACTICES). The parse queued the monitor job
 * keyed by the document to start after MONITOR_DELAY_SECONDS, the wait for the rest of an upload batch,
 * which the e2e does not sit out: the job is started now (test setup only, as the monitoring journey
 * dates its events back; its key and payload stay the parse's). The worker then runs the chain's own
 * steps: monitor plans the month, price and triage follow, and the reconcile after them (or after the
 * document, when nothing was priced). Returns once the chain has run out: the monitor job done and no
 * step of the practice left in the queue.
 */
export async function chainFrom(practiceId: string, documentId: string): Promise<void> {
  const key = singletonKey('monitor', { practice_id: practiceId, document_id: documentId });
  await until(
    () =>
      withDatabase(async (client) => {
        const queued = await client.query("SELECT 1 FROM pgboss.job WHERE name = 'monitor' AND singleton_key = $1", [key]);
        if ((queued.rowCount ?? 0) === 0) {
          return false;
        }
        await client.query("UPDATE pgboss.job SET start_after = now() WHERE name = 'monitor' AND singleton_key = $1 AND state = 'created'", [key]);
        return true;
      }),
    'the parse to queue the monitoring step',
  );
  await until(
    () =>
      withDatabase(async (client) => {
        const { rows } = await client.query<{ done: boolean; waiting: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM pgboss.job WHERE name = 'monitor' AND singleton_key = $1 AND state = 'completed') AS done,
                  EXISTS (SELECT 1 FROM pgboss.job WHERE name = ANY($2::text[]) AND data ->> 'practice_id' = $3 AND state IN ('created', 'retry', 'active')) AS waiting`,
          [key, CHAIN_STEPS, practiceId],
        );
        return rows[0]?.done === true && !rows[0].waiting;
      }),
    'the monitoring chain',
  );
}

/** The months the monitoring chain priced for the practice (its runs, created in no person's name), in order. */
export async function chainPricedMonths(practiceId: string): Promise<string[]> {
  return withDatabase(async (client) =>
    (await client.query<{ period_from: string }>('SELECT period_from::text FROM pricing_run WHERE practice_id = $1 AND created_by_job_id IS NOT NULL ORDER BY period_from', [practiceId])).rows.map(
      (row) => row.period_from,
    ),
  );
}

/** A file a journey uploads in the browser. */
export interface JourneyFile {
  readonly name: string;
  readonly buffer: Buffer;
}

/**
 * On a retry, the files an earlier attempt already uploaded to the practice as 835s, by name, each with its document:
 * the first of its bytes (or, before intake has hashed it, of its size), neither held as a duplicate nor still waiting
 * for its bytes. Uploaded again, each would be held as a duplicate of itself; the journey waits for it to load instead
 * (untilLoaded). On a first attempt, none.
 */
export async function uploadedEarlier(practiceId: string, files: readonly JourneyFile[]): Promise<ReadonlyMap<string, string>> {
  const found = new Map<string, string>();
  if (!retrying()) {
    return found;
  }
  await withDatabase(async (client) => {
    for (const file of files) {
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM source_document
          WHERE practice_id = $1 AND kind = 'x12_835' AND parent_document_id IS NULL AND status NOT IN ('awaiting_upload', 'duplicate')
            AND (sha256 = $2 OR (sha256 IS NULL AND size_bytes = $3))
          ORDER BY created_at, id LIMIT 1`,
        [practiceId, createHash('sha256').update(file.buffer).digest('hex'), file.buffer.length],
      );
      if (rows[0] !== undefined) {
        found.set(file.name, rows[0].id);
      }
    }
  });
  return found;
}

/** Waits for an uploaded document to be loaded (the receipt's "Loaded"). */
export async function untilLoaded(documentId: string): Promise<void> {
  await until(
    () => withDatabase(async (client) => (await client.query<{ status: string }>('SELECT status FROM source_document WHERE id = $1', [documentId])).rows[0]?.status === 'loaded'),
    'an upload of the attempt before to load',
  );
}

/** The practice's newest document of a kind (the one the browser just uploaded). */
export async function newestDocument(practiceId: string, kind: string): Promise<string> {
  return withDatabase(async (client) => (await client.query<{ id: string }>('SELECT id FROM source_document WHERE practice_id = $1 AND kind = $2 ORDER BY created_at DESC LIMIT 1', [practiceId, kind])).rows[0]?.id ?? '');
}

export interface ScheduleOptions {
  readonly practiceId: string;
  /** The billing manager persona who creates and signs off the contract and maps the plan. */
  readonly managerKey: string;
  /** The plan the 835 names (REF CE), mapped to the contract from 2026-01-01. */
  readonly planKey: string;
  /** Calendar days from the payment date (BPR16) the payer's dispute window runs, as its quote says ("of the payment date"). */
  readonly disputeWindowDays?: number;
}

const QUOTE = '97110 is paid $50.00 per unit';

/** The schedule's document for one plan of a practice: the same ID on every attempt, so a retry finds the attempt before it. */
function scheduleDocumentId(practiceId: string, planKey: string): string {
  const hex = createHash('sha256').update(`SYNTHETIC fixed schedule ${practiceId} ${planKey}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * On a retry, how far an earlier attempt took the plan's schedule: the version it drafted from the schedule's document,
 * that version's status, and whether the plan is mapped to it. Null on a first attempt, or when no version was drafted.
 */
async function scheduleEarlier(practiceId: string, documentId: string, planId: string): Promise<{ readonly versionId: string; readonly status: string; readonly mapped: boolean } | null> {
  if (!retrying()) {
    return null;
  }
  return withDatabase(async (client) => {
    const { rows } = await client.query<{ id: string; status: string; mapped: boolean }>(
      `SELECT v.id, v.status,
              EXISTS (SELECT 1 FROM payer_plan_mapping m WHERE m.practice_id = v.practice_id AND m.plan_id = $3 AND m.contract_version_id = v.id) AS mapped
         FROM contract_version v
        WHERE v.practice_id = $1 AND $2::uuid = ANY (v.source_document_ids)`,
      [practiceId, documentId, planId],
    );
    const row = rows[0];
    return row === undefined ? null : { versionId: row.id, status: row.status, mapped: row.mapped };
  });
}

/**
 * The payer's SYNTHETIC fixed schedule (97110 at 50.00 a unit, timed units per code, its dispute window cited on
 * page 1 and verified) abstracted by the contract specialist and signed off by the billing manager, and the plan
 * mapped to it. The payer is
 * the practice's first (its first 835's). On a retry, only the steps the attempt before left undone.
 */
export async function signedOffSchedule(options: ScheduleOptions): Promise<void> {
  const { practiceId } = options;
  const pool = openPool(appDevLoginUrl(e2eDatabaseUrl()), 2);
  try {
    const manager = await userId(options.managerKey);
    const specialist = await userId('contract-specialist');
    const documentId = scheduleDocumentId(practiceId, options.planKey);
    const { payerId, planId } = await withDatabase(async (client) =>
      asOwner(client, [practiceId], async () => {
        // An attempt before this one may have stored it already.
        await client.query(
          `INSERT INTO source_document (id, practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status)
           VALUES ($1, $2, 'contract', $3, 1000, 'application/pdf', $4, 'clean', now(), 'stored') ON CONFLICT DO NOTHING`,
          [documentId, practiceId, createHash('sha256').update(documentId).digest('hex'), manager],
        );
        const payer = (await client.query<{ id: string }>('SELECT id FROM payer WHERE practice_id = $1 ORDER BY created_at LIMIT 1', [practiceId])).rows[0]?.id ?? '';
        const plan = (await client.query<{ id: string }>('SELECT id FROM plan WHERE practice_id = $1 AND plan_key = $2', [practiceId, options.planKey])).rows[0]?.id ?? '';
        return { payerId: payer, planId: plan };
      }),
    );
    const disputeWindowDays = options.disputeWindowDays ?? 3650;
    const windowQuote = `Disputes are raised within ${String(disputeWindowDays)} days of the payment date.`;
    const pdf = syntheticPdf([
      ['SYNTHETIC PROVIDER AGREEMENT - INVENTED TERMS', 'Compensation is set out in Exhibit A.', windowQuote],
      ['SYNTHETIC EXHIBIT A FEE SCHEDULE', QUOTE],
    ]);
    const as = <T>(actorId: string, run: (context: WorkflowContext) => Promise<T>) =>
      withPracticeScope(pool, { actorId, practiceIds: [practiceId] }, (scope) =>
        run({ scope, requestId: `e2e-${randomUUID()}`, evidence: new EvidenceResolver({ pages: documentPages({ read: () => Promise.resolve({ bytes: pdf, contentType: 'application/pdf' }) }) }) }),
      );
    const earlier = await scheduleEarlier(practiceId, documentId, planId);
    const versionId =
      earlier?.versionId ??
      (await as(manager, async (context) => {
        const contract = await createContract(context, { practiceId, payerId, title: 'SYNTHETIC FIXED SCHEDULE AGREEMENT' });
        return (await createDraftVersion(context, { practiceId, contractId: contract.contractId, effectiveFrom: '2026-01-01', effectiveTo: null, sourceDocumentIds: [documentId], disputeWindowDays })).versionId;
      }));
    // The specialist's abstraction ends approved; a draft is one the attempt before left before it.
    if (earlier === null || earlier.status === 'draft') {
      await as(specialist, async (context) => {
        const { rateRecordId } = await addRateRecord(context, {
          practiceId,
          versionId,
          terms: { scope: { codes: ['97110'] }, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '5000' }, flags: { timed_units_rule: 'PER_CODE' } },
          citation: { documentId, page: 2, quote: QUOTE },
        });
        for (const field of RATE_RECORD_FIELDS) {
          await approveRateRecordField(context, { practiceId, rateRecordId, field });
        }
        // The window as the contract states it, cited on page 1 and verified, so the lines' deadlines are (D17 a).
        await citeDisputeWindow(context, { practiceId, versionId, citation: { documentId, page: 1, quote: windowQuote }, rule: { unit: 'calendar_days', measuredFrom: 'payment_date' } });
        await verifyDisputeWindow(context, { practiceId, versionId });
        await approveVersion(context, { practiceId, versionId });
      });
    }
    if (earlier?.status !== 'signed_off') {
      await as(manager, (context) => signOffVersion(context, { practiceId, versionId }));
    }
    if (earlier?.mapped !== true) {
      await as(manager, (context) => mapPlan(context, { practiceId, planId, kind: 'contract', contractVersionId: versionId, effectiveFrom: '2026-01-01' }));
    }
  } finally {
    await pool.end();
  }
}

interface PeriodOptions {
  readonly practiceId: string;
  readonly managerKey: string;
  readonly periodFrom: string;
  readonly periodTo: string;
}

/**
 * On a retry, the run an earlier attempt created for the period in the manager's name, whether it is priced, and
 * whether it is triaged. Null on a first attempt, or when no run was created.
 */
async function runEarlier(options: PeriodOptions, manager: string): Promise<{ readonly id: string; readonly status: string; readonly triaged: boolean } | null> {
  if (!retrying()) {
    return null;
  }
  return withDatabase(async (client) => {
    const { rows } = await client.query<{ id: string; status: string; triaged: boolean }>(
      `SELECT r.id, r.status,
              EXISTS (SELECT 1 FROM job_run j WHERE j.practice_id = r.practice_id AND j.job_type = 'triage' AND j.idempotency_key = r.id::text AND j.outcome = 'succeeded') AS triaged
         FROM pricing_run r
        WHERE r.practice_id = $1 AND r.created_by = $2 AND r.period_from = $3 AND r.period_to = $4 AND r.release_no = 900001 AND r.rerun_of_id IS NULL
        ORDER BY r.created_at, r.id LIMIT 1`,
      [options.practiceId, manager, options.periodFrom, options.periodTo],
    );
    const row = rows[0];
    return row === undefined ? null : { id: row.id, status: row.status, triaged: row.triaged };
  });
}

/**
 * A pricing run of the period in the billing manager's name under SYNTHETIC release 900001, priced by
 * the worker's price job and triaged by its triage job (the worker the caller keeps running). Returns
 * the run's ID once triage has finished. On a retry, the run the attempt before created, priced and
 * triaged where it was not yet.
 */
export async function pricedAndTriaged(options: PeriodOptions): Promise<string> {
  const { practiceId } = options;
  const pool = openPool(appDevLoginUrl(e2eDatabaseUrl()), 2);
  try {
    const manager = await userId(options.managerKey);
    const earlier = await runEarlier(options, manager);
    const pricingRunId =
      earlier?.id ??
      (
        await withPracticeScope(pool, { actorId: manager, practiceIds: [practiceId] }, (scope) =>
          createPricingRun(scope, { practiceId, periodFrom: options.periodFrom, periodTo: options.periodTo, releaseNo: 900001, requestId: `e2e-${randomUUID()}` }),
        )
      ).pricingRunId;
    if (earlier?.status !== 'complete') {
      await queue('price', { practice_id: practiceId, pricing_run_id: pricingRunId });
      await until(
        () => withDatabase(async (client) => (await client.query<{ status: string }>('SELECT status FROM pricing_run WHERE id = $1', [pricingRunId])).rows[0]?.status === 'complete'),
        'the price job',
      );
    }
    if (earlier?.triaged !== true) {
      await queue('triage', { practice_id: practiceId, pricing_run_id: pricingRunId });
      await until(
        () =>
          withDatabase(
            async (client) =>
              ((await client.query("SELECT 1 FROM job_run WHERE practice_id = $1 AND job_type = 'triage' AND idempotency_key = $2 AND outcome = 'succeeded'", [practiceId, pricingRunId])).rowCount ?? 0) > 0,
          ),
        'the triage job',
      );
    }
    return pricingRunId;
  } finally {
    await pool.end();
  }
}

/** The screen tour's settings: places of service 11 and 22, rounding half up to the cent, cases from $10.00 short. */
const TOUR_SETTINGS = { place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT', case_materiality_cents: '1000' };

const TOUR_FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');

/** The tour's two remittances: SYNTHETIC CAS-08 (payer Q) and CAS-02 (payer N). */
const TOUR_FILES = [
  { name: 'era-payer-q.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(TOUR_FIXTURES, 'CAS-08/remit.835')) },
  { name: 'era-payer-n.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(TOUR_FIXTURES, 'CAS-02/remit.835')) },
];

export interface TourPracticeOptions {
  readonly name: string;
  /** The billing manager persona the page is signed in as: who uploads, maps and signs off. */
  readonly manager: string;
  /** Internal personas who reach the practice under a support grant, beside the contract specialist. */
  readonly supportFor?: readonly string[];
}

/**
 * The screen tour's practice and its shape of data (the 1280 px tour, e2e/layout-1280.spec.ts, and the tables at a
 * phone's width, e2e/tables-phone.spec.ts), in a practice of its own in the other group: the billing manager uploads
 * SYNTHETIC CAS-08 (payer Q, three 97110 lines in March, each 30.00 short) and CAS-02 (payer N, 32 lines in April);
 * payer Q's schedule is abstracted by the contract specialist and signed off beside the browser; payer N's plan is
 * mapped as no agreement on screen; and March and April are priced and triaged by the worker, which the caller keeps
 * running (a case of payer Q's three lines; payer N's lines to anomaly screening). The page is signed in as the
 * manager. On a retry, only what the attempt before left undone. Returns the practice's ID.
 */
export async function tourPractice(page: Page, options: TourPracticeOptions): Promise<string> {
  const practiceId = await journeyPractice({ name: options.name, settings: TOUR_SETTINGS, supportFor: options.supportFor });
  const at = (screen: string) => `/p/${practiceId}${screen}`;
  await test.step('CAS-08 and CAS-02 load; payer Q’s schedule is signed off and payer N’s plan mapped as no agreement; March and April are priced and triaged', async () => {
    // A retry finds the attempt before's uploads: each is waited for, not uploaded again (it would be a duplicate of itself).
    const earlier = await uploadedEarlier(practiceId, TOUR_FILES);
    const fresh = TOUR_FILES.filter((file) => !earlier.has(file.name));
    if (fresh.length > 0) {
      await page.goto(at('/uploads'));
      await page.getByLabel('Choose files to upload').setInputFiles(fresh);
      const batch = page.getByRole('region', { name: 'This batch' });
      for (const file of fresh) {
        await expect(batch.getByRole('listitem').filter({ hasText: file.name })).toContainText('Loaded 1 remittance', { timeout: 120_000 });
      }
    }
    for (const documentId of earlier.values()) {
      await untilLoaded(documentId);
    }
    await signedOffSchedule({ practiceId, managerKey: options.manager, planKey: 'CE:SYNPLAN-FIX-ONE', disputeWindowDays: 365 });
    const mapped = await withDatabase(
      async (client) =>
        ((await client.query("SELECT 1 FROM payer_plan_mapping m JOIN plan p ON p.id = m.plan_id WHERE m.practice_id = $1 AND p.plan_key = 'CE:SYNPLAN-OON-CAS'", [practiceId])).rowCount ?? 0) > 0,
    );
    if (!mapped) {
      await page.goto(at('/mapping'));
      await page.getByRole('table', { name: 'Payers and plans' }).getByRole('row').filter({ hasText: 'SYNPLAN-OON-CAS' }).getByRole('link', { name: 'CE:SYNPLAN-OON-CAS' }).click();
      await page.getByLabel('Agreement', { exact: true }).selectOption({ label: 'No agreement (out of network)' });
      await page.getByLabel('Effective from', { exact: true }).fill('2026-01-01');
      await page.getByRole('button', { name: 'Save the mapping' }).click();
      await expect(page.locator('[data-notice="mapped"]')).toBeVisible();
    }
    await pricedAndTriaged({ practiceId, managerKey: options.manager, periodFrom: '2026-03-01', periodTo: '2026-03-31' });
    await pricedAndTriaged({ practiceId, managerKey: options.manager, periodFrom: '2026-04-01', periodTo: '2026-04-30' });
  });
  return practiceId;
}
