import { createHash, randomUUID } from 'node:crypto';

import { EvidenceResolver, RATE_RECORD_FIELDS, type WorkflowContext, addRateRecord, approveRateRecordField, approveVersion, createContract, createDraftVersion, mapPlan, signOffVersion } from '@tp/contracts';
import { documentPages } from '@tp/contracts/pages';
import { syntheticPdf } from '@tp/contracts/testing';
import { LocalKeyProvider, appDevLoginUrl, developmentMasterKey, openPool, provisionPracticeKey, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { type JobPayload, type JobType, enqueue } from '@tp/worker/jobs';
import { createPricingRun } from '@tp/worker/pricing';
import { PgBoss } from 'pg-boss';

import { personaEmail } from '../scripts/synthetic-personas';
import { e2eDatabaseUrl } from './env';
import { withDatabase } from './helpers';

/**
 * The recovery journey's setup on the e2e database (synthetic data only): a practice of its own in the
 * other group (so no other spec's counts move), with its BAA, a deposit proof level and a single 30.00
 * line making a case; and, once its SYNTHETIC LED-06 original payment is loaded through the Uploads
 * screen, the case it opens: the payer's 50.00-per-unit 97110 schedule abstracted by the contract
 * specialist (under a support grant) and signed off by the billing manager through @tp/contracts, the
 * plan mapped, March priced and triaged by the worker's own jobs. The browser does the rest.
 */

export const LEDGER_PRACTICE = 'SYNTHETIC OTHER PRACTICE LEDGER';
const SETTINGS = { place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT', case_materiality_cents: '1000', proof_level: 'deposited' };
const QUOTE = '97110 is paid $50.00 per unit';

async function userId(key: string): Promise<string> {
  return withDatabase(async (client) => (await client.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [personaEmail(key)])).rows[0]?.id ?? '');
}

/** The journey's practice (created once per database): its ID. */
export async function ledgerPractice(): Promise<string> {
  return withDatabase(async (client) => {
    const existing = (await client.query<{ id: string }>('SELECT id FROM practice WHERE name = $1', [LEDGER_PRACTICE])).rows[0];
    if (existing !== undefined) {
      return existing.id;
    }
    const organization = (await client.query<{ organization_id: string }>("SELECT organization_id FROM practice WHERE name = 'SYNTHETIC OTHER PRACTICE'")).rows[0]?.organization_id ?? '';
    const id = randomUUID();
    const key = await provisionPracticeKey(new LocalKeyProvider(developmentMasterKey()), id);
    const specialist = await userId('contract-specialist');
    await asOwner(client, [id], async () => {
      await client.query("INSERT INTO practice (id, organization_id, name, zip, data_key_ref, settings) VALUES ($1, $2, $3, '27601', $4, $5)", [id, organization, LEDGER_PRACTICE, key.dataKeyRef, JSON.stringify(SETTINGS)]);
      for (const kind of ['baa', 'engagement'] as const) {
        await client.query(
          `INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
           VALUES ($1, $2, $3, '1', now() - interval '30 days', 'SYNTHETIC SIGNER', $4, $5)`,
          [organization, id, kind, `esign:synthetic-ledger-${kind}`, createHash('sha256').update(`ledger ${kind}`).digest('hex')],
        );
      }
      await client.query("INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'SYN-LEDGER', 'SYNTHETIC ABSTRACTION', now() + interval '4 hours')", [id, specialist]);
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

/** The practice's newest document of a kind (the one the browser just uploaded). */
export async function newestDocument(practiceId: string, kind: string): Promise<string> {
  return withDatabase(async (client) => (await client.query<{ id: string }>('SELECT id FROM source_document WHERE practice_id = $1 AND kind = $2 ORDER BY created_at DESC LIMIT 1', [practiceId, kind])).rows[0]?.id ?? '');
}

async function until(check: () => Promise<boolean>, what: string, timeoutMs = 90_000): Promise<void> {
  const ends = Date.now() + timeoutMs;
  while (Date.now() < ends) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/**
 * The case of the journey: the schedule signed off, the plan mapped, March priced and triaged by the
 * worker (which the caller keeps running). Returns the case's ID.
 */
export async function openLedgerCase(practiceId: string): Promise<string> {
  const pool = openPool(appDevLoginUrl(e2eDatabaseUrl()), 2);
  try {
    const manager = await userId('ledger-manager');
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
        const plan = (await client.query<{ id: string }>("SELECT id FROM plan WHERE practice_id = $1 AND plan_key = 'CE:SYNPLAN-FIX-LED'", [practiceId])).rows[0]?.id ?? '';
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
      return (await createDraftVersion(context, { practiceId, contractId: contract.contractId, effectiveFrom: '2026-01-01', effectiveTo: null, sourceDocumentIds: [documentId], disputeWindowDays: 3650 })).versionId;
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
    const { pricingRunId } = await withPracticeScope(pool, { actorId: manager, practiceIds: [practiceId] }, (scope) =>
      createPricingRun(scope, { practiceId, periodFrom: '2026-03-01', periodTo: '2026-03-31', releaseNo: 900001, requestId: `e2e-${randomUUID()}` }),
    );
    await queue('price', { practice_id: practiceId, pricing_run_id: pricingRunId });
    await until(
      () => withDatabase(async (client) => (await client.query<{ status: string }>('SELECT status FROM pricing_run WHERE id = $1', [pricingRunId])).rows[0]?.status === 'complete'),
      'the price job',
    );
    await queue('triage', { practice_id: practiceId, pricing_run_id: pricingRunId });
    let caseId = '';
    await until(async () => {
      caseId = await withDatabase(async (client) => (await client.query<{ case_id: string }>('SELECT case_id FROM case_line WHERE practice_id = $1 LIMIT 1', [practiceId])).rows[0]?.case_id ?? '');
      return caseId !== '';
    }, 'the triage job');
    return caseId;
  } finally {
    await pool.end();
  }
}
