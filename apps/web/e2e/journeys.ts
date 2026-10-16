import { createHash, randomUUID } from 'node:crypto';

import { EvidenceResolver, RATE_RECORD_FIELDS, type WorkflowContext, addRateRecord, approveRateRecordField, approveVersion, createContract, createDraftVersion, mapPlan, signOffVersion } from '@tp/contracts';
import { documentPages } from '@tp/contracts/pages';
import { syntheticPdf } from '@tp/contracts/testing';
import { LocalKeyProvider, appDevLoginUrl, developmentMasterKey, openPool, provisionPracticeKey, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { type JobPayload, type JobType, enqueue, singletonKey } from '@tp/worker/jobs';
import { createPricingRun } from '@tp/worker/pricing';
import { PgBoss } from 'pg-boss';

import { personaEmail } from '../scripts/synthetic-personas';
import { e2eDatabaseUrl } from './env';
import { withDatabase } from './helpers';

/**
 * The journeys' shared setup on the e2e database (synthetic data only). Each journey works in a
 * practice of its own in the other group, so no other spec's counts move: created once per database
 * with its BAA and engagement letter on file, the settings the journey names, and support grants for
 * the internal people it needs (the contract specialist always, who abstracts its payer's schedule).
 * Beside the browser, a journey's payer schedule is abstracted by the specialist and signed off by a
 * billing manager through @tp/contracts, its plan mapped, and its months priced and triaged by the
 * worker's own jobs (the caller keeps the worker running), as PRD 5's J5 to J7 do on screen in their
 * own specs. The browser does the journey's own steps.
 */

export async function userId(key: string): Promise<string> {
  return withDatabase(async (client) => (await client.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [personaEmail(key)])).rows[0]?.id ?? '');
}

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
      await client.query("INSERT INTO practice (id, organization_id, name, zip, data_key_ref, settings) VALUES ($1, $2, $3, '27601', $4, $5)", [id, organization, options.name, key.dataKeyRef, JSON.stringify(options.settings)]);
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
  /** Days from the remittance date the payer's dispute window runs. */
  readonly disputeWindowDays?: number;
}

const QUOTE = '97110 is paid $50.00 per unit';

/**
 * The payer's SYNTHETIC fixed schedule (97110 at 50.00 a unit, timed units per code) abstracted by the
 * contract specialist and signed off by the billing manager, and the plan mapped to it. The payer is
 * the practice's first (its first 835's).
 */
export async function signedOffSchedule(options: ScheduleOptions): Promise<void> {
  const { practiceId } = options;
  const pool = openPool(appDevLoginUrl(e2eDatabaseUrl()), 2);
  try {
    const manager = await userId(options.managerKey);
    const specialist = await userId('contract-specialist');
    const documentId = randomUUID();
    const { payerId, planId } = await withDatabase(async (client) =>
      asOwner(client, [practiceId], async () => {
        await client.query(
          `INSERT INTO source_document (id, practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status)
           VALUES ($1, $2, 'contract', $3, 1000, 'application/pdf', $4, 'clean', now(), 'stored')`,
          [documentId, practiceId, createHash('sha256').update(documentId).digest('hex'), manager],
        );
        const payer = (await client.query<{ id: string }>('SELECT id FROM payer WHERE practice_id = $1 ORDER BY created_at LIMIT 1', [practiceId])).rows[0]?.id ?? '';
        const plan = (await client.query<{ id: string }>('SELECT id FROM plan WHERE practice_id = $1 AND plan_key = $2', [practiceId, options.planKey])).rows[0]?.id ?? '';
        return { payerId: payer, planId: plan };
      }),
    );
    const pdf = syntheticPdf([
      ['SYNTHETIC PROVIDER AGREEMENT - INVENTED TERMS', 'Compensation is set out in Exhibit A.'],
      ['SYNTHETIC EXHIBIT A FEE SCHEDULE', QUOTE],
    ]);
    const as = <T>(actorId: string, run: (context: WorkflowContext) => Promise<T>) =>
      withPracticeScope(pool, { actorId, practiceIds: [practiceId] }, (scope) =>
        run({ scope, requestId: `e2e-${randomUUID()}`, evidence: new EvidenceResolver({ pages: documentPages({ read: () => Promise.resolve({ bytes: pdf, contentType: 'application/pdf' }) }) }) }),
      );
    const versionId = await as(manager, async (context) => {
      const contract = await createContract(context, { practiceId, payerId, title: 'SYNTHETIC FIXED SCHEDULE AGREEMENT' });
      return (await createDraftVersion(context, { practiceId, contractId: contract.contractId, effectiveFrom: '2026-01-01', effectiveTo: null, sourceDocumentIds: [documentId], disputeWindowDays: options.disputeWindowDays ?? 3650 }))
        .versionId;
    });
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
      await approveVersion(context, { practiceId, versionId });
    });
    await as(manager, (context) => signOffVersion(context, { practiceId, versionId }));
    await as(manager, (context) => mapPlan(context, { practiceId, planId, kind: 'contract', contractVersionId: versionId, effectiveFrom: '2026-01-01' }));
  } finally {
    await pool.end();
  }
}

/**
 * A pricing run of the period in the billing manager's name under SYNTHETIC release 900001, priced by
 * the worker's price job and triaged by its triage job (the worker the caller keeps running). Returns
 * the run's ID once triage has finished.
 */
export async function pricedAndTriaged(options: { readonly practiceId: string; readonly managerKey: string; readonly periodFrom: string; readonly periodTo: string }): Promise<string> {
  const { practiceId } = options;
  const pool = openPool(appDevLoginUrl(e2eDatabaseUrl()), 2);
  try {
    const manager = await userId(options.managerKey);
    const { pricingRunId } = await withPracticeScope(pool, { actorId: manager, practiceIds: [practiceId] }, (scope) =>
      createPricingRun(scope, { practiceId, periodFrom: options.periodFrom, periodTo: options.periodTo, releaseNo: 900001, requestId: `e2e-${randomUUID()}` }),
    );
    await queue('price', { practice_id: practiceId, pricing_run_id: pricingRunId });
    await until(
      () => withDatabase(async (client) => (await client.query<{ status: string }>('SELECT status FROM pricing_run WHERE id = $1', [pricingRunId])).rows[0]?.status === 'complete'),
      'the price job',
    );
    await queue('triage', { practice_id: practiceId, pricing_run_id: pricingRunId });
    await until(
      () =>
        withDatabase(
          async (client) =>
            ((await client.query("SELECT 1 FROM job_run WHERE practice_id = $1 AND job_type = 'triage' AND idempotency_key = $2 AND outcome = 'succeeded'", [practiceId, pricingRunId])).rowCount ?? 0) > 0,
        ),
      'the triage job',
    );
    return pricingRunId;
  } finally {
    await pool.end();
  }
}
