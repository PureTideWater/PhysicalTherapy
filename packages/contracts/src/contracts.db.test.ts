import { randomBytes, randomUUID } from 'node:crypto';

import { PermissionDeniedError, readDatabaseUrl, withPracticeScope } from '@tp/db';
import { type MigratedDatabase, RowFactory, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { documentPages } from './evidence/pages';
import { EvidenceResolver } from './evidence/resolve';
import { assertPracticePricingAllowed, dollarsWaitingOnMapping, loadAgreementRecords, loadMappings } from './load';
import { PricingRefusedError } from './coverage';
import { type AgreementLine, VersionNotSignedOffError, assertSignedOff, resolveAgreement } from './resolver';
import {
  ContractWorkflowError,
  type WorkflowContext,
  addRateRecord,
  amendVersion,
  approveRateRecordField,
  approveVersion,
  attachDocument,
  checkEvidence,
  citeDisputeWindow,
  correctMapping,
  createContract,
  createDraftVersion,
  mapPlan,
  proposeVersion,
  removeRateRecord,
  signOffVersion,
  supersedeVersion,
  updateDraftVersion,
  updateRateRecord,
  verifyDisputeWindow,
} from './services';
import { RATE_RECORD_FIELDS } from './terms';
import { syntheticPdf } from './testing/synthetic-pdf';
import { COMPUTED_CONTRACT_WINDOW_RULE, DISPUTE_WINDOW_STARTS, DISPUTE_WINDOW_UNITS, type DisputeWindowRule } from './window-rule';

/**
 * The contract repository against the database (PRD 6, Contract repository and Payer and plan
 * mapping; test matrix CON-01 to CON-07 and MAP-01 to MAP-05): the workflow services as the people the
 * plan names (a billing manager tags and signs off, a contract specialist under a support grant
 * abstracts and approves), the database's own refusals tried directly as the application role, and
 * agreement resolution over the records loaded back. Synthetic documents and terms only.
 */

let database: MigratedDatabase;
let owner: pg.Client;
let app: pg.Pool;
let north: TenantWorld;
let manager: string;
let viewer: string;
let specialist: string;
let outsideSpecialist: string;
let payer: string;
const documents = new Map<string, Uint8Array>();
let contractDoc: string;
let amendmentDoc: string;
let exhibitDoc: string;
/** Whether the remittance tables the Coverage query reads exist (migration 20261016120000). */
let serviceLines = false;

const CONTRACT_PAGES = [
  [
    'SYNTHETIC PROVIDER AGREEMENT',
    'Effective January 1, 2026. Compensation is set out in Exhibit A.',
    'Either party gives 90 days notice before an anniversary.',
    'Disputes are raised within 30 days of the payment date.',
  ],
  ['SYNTHETIC EXHIBIT A FEE SCHEDULE', '97110 Therapeutic exercise $32.00 per unit', '97140 Manual therapy $30.50 per unit', '97530 Therapeutic activities at 110% of the Medicare fee schedule'],
];
const QUOTE_97110 = '97110 Therapeutic exercise $32.00 per unit';
const WINDOW_QUOTE = 'Disputes are raised within 30 days of the payment date.';
/** A window counted from the date of service (best-option audit #5): never the payment-date window the product computes. */
const SERVICE_WINDOW_QUOTE = 'Disputes are raised within 180 days of the date of service.';
const QUOTE_97140 = '97140 Manual therapy $30.50 per unit';
const FIXED_97110 = { scope: { codes: ['97110'] }, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '3200' } };
const FIXED_97140 = { scope: { codes: ['97140'] }, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '3050' } };

async function document(kind: 'contract' | 'exhibit' | 'payer_letter', pages: readonly (readonly string[])[], scan: 'clean' | 'pending' = 'clean'): Promise<string> {
  const id = randomUUID();
  await asOwner(owner, [north.practiceId], () =>
    owner.query(
      `INSERT INTO source_document (id, practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status)
       VALUES ($1, $2, $3, $4, 1000, 'application/pdf', $5, $6, CASE WHEN $6 = 'pending' THEN NULL ELSE now() END, 'stored')`,
      [id, north.practiceId, kind, randomBytes(32).toString('hex'), manager, scan],
    ),
  );
  documents.set(id, syntheticPdf(pages));
  return id;
}

async function plan(key: string): Promise<string> {
  const id = randomUUID();
  await asOwner(owner, [north.practiceId], () => owner.query('INSERT INTO plan (id, practice_id, payer_id, plan_key) VALUES ($1, $2, $3, $4)', [id, north.practiceId, payer, key]));
  return id;
}

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  serviceLines = (await owner.query<{ found: boolean }>("SELECT to_regclass('public.service_line') IS NOT NULL AS found")).rows[0]?.found === true;
  app = new pg.Pool({ connectionString: database.appUrl, max: 4 });
  north = await createTenantWorld(owner, 'north');
  manager = await createUser(owner);
  await addMembership(owner, north.organizationId, manager, 'billing_manager');
  viewer = await createUser(owner);
  await addMembership(owner, north.organizationId, viewer, 'viewer');
  const internal = await createOrganization(owner, 'internal', 'contracts');
  specialist = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, specialist, 'contract_specialist');
  outsideSpecialist = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, outsideSpecialist, 'contract_specialist');
  // The specialist's way into the practice: a support grant (docs/adr/0028).
  await asOwner(owner, [north.practiceId], () =>
    owner.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'SQ-1', 'SYNTHETIC ABSTRACTION', now() + interval '4 hours')`, [north.practiceId, specialist]),
  );
  payer = randomUUID();
  await asOwner(owner, [north.practiceId], () => owner.query("INSERT INTO payer (id, practice_id, payer_id_raw, name_raw) VALUES ($1, $2, 'SYNTH-PAYER-1', 'SYNTHETIC PAYER')", [payer, north.practiceId]));
  contractDoc = await document('contract', CONTRACT_PAGES);
  amendmentDoc = await document('payer_letter', [['SYNTHETIC AMENDMENT ONE', 'From July 1, 2026, 97110 Therapeutic exercise pays $34.00 per unit']]);
  exhibitDoc = await document('exhibit', [['SYNTHETIC EXHIBIT B', '97110 Therapeutic exercise $29.00 per unit']]);
});

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

/** Runs `run` as `actorId` in north's scope, committed, with a resolver over the synthetic documents. */
function as<T>(actorId: string, run: (context: WorkflowContext) => Promise<T>): Promise<T> {
  return withPracticeScope(app, { actorId, practiceIds: [north.practiceId] }, (scope) =>
    run({
      scope,
      requestId: `test-${randomUUID()}`,
      evidence: new EvidenceResolver({
        pages: documentPages({
          read: (id) => {
            const bytes = documents.get(id);
            return bytes === undefined ? Promise.reject(new Error('no such synthetic document')) : Promise.resolve({ bytes, contentType: 'application/pdf' });
          },
        }),
      }),
    }),
  );
}

/** Runs one statement as the application role for `actorId` in north's scope, rolled back. */
async function asApp(actorId: string, sql: string, values: unknown[] = []): Promise<pg.QueryResult> {
  const client = await app.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [actorId, `{${north.practiceId}}`]);
    return await client.query(sql, values);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function errorOf(attempt: Promise<unknown>): Promise<unknown> {
  return attempt.then(
    () => undefined,
    (error: unknown) => error,
  );
}

/** Runs one statement as the superuser with every trigger off, rolled back: what a CHECK holds on its own. */
async function triggersOff(sql: string, values: unknown[] = []): Promise<void> {
  await owner.query('BEGIN');
  try {
    await owner.query('SET LOCAL session_replication_role = replica');
    await owner.query(sql, values);
  } finally {
    await owner.query('ROLLBACK');
  }
}

const versionRow = async (id: string) => (await asOwner(owner, [north.practiceId], () => owner.query('SELECT * FROM contract_version WHERE id = $1', [id]))).rows[0] as Record<string, unknown>;
const recordRows = async (versionId: string) =>
  (await asOwner(owner, [north.practiceId], () => owner.query('SELECT * FROM rate_record WHERE contract_version_id = $1 ORDER BY id', [versionId]))).rows as Record<string, unknown>[];

interface Draft {
  readonly contractId: string;
  readonly versionId: string;
}

async function draft(effectiveFrom = '2026-01-01', effectiveTo: string | null = null, contractId?: string, sourceDocumentIds = [contractDoc]): Promise<Draft> {
  return as(manager, async (context) => {
    const contract = contractId ?? (await createContract(context, { practiceId: north.practiceId, payerId: payer, title: 'SYNTHETIC COMMERCIAL AGREEMENT' })).contractId;
    const { versionId } = await createDraftVersion(context, { practiceId: north.practiceId, contractId: contract, effectiveFrom, effectiveTo, sourceDocumentIds, noticeDays: 90, timelyFilingDays: 180 });
    return { contractId: contract, versionId };
  });
}

/** The specialist approves every field of the records, which verifies those whose evidence resolves. */
async function approveAll(recordIds: readonly string[]): Promise<boolean[]> {
  return as(specialist, async (context) => {
    const verified: boolean[] = [];
    for (const rateRecordId of recordIds) {
      let last = false;
      for (const field of RATE_RECORD_FIELDS) {
        last = (await approveRateRecordField(context, { practiceId: north.practiceId, rateRecordId, field })).verified;
      }
      verified.push(last);
    }
    return verified;
  });
}

async function addRecords(versionId: string, records: readonly { terms: unknown; quote: string; page?: number; documentId?: string }[]): Promise<string[]> {
  return as(specialist, async (context) => {
    const ids: string[] = [];
    for (const record of records) {
      ids.push((await addRateRecord(context, { practiceId: north.practiceId, versionId, terms: record.terms, citation: { documentId: record.documentId ?? contractDoc, page: record.page ?? 2, quote: record.quote } })).rateRecordId);
    }
    return ids;
  });
}

async function approveAndSignOff(versionId: string): Promise<Awaited<ReturnType<typeof signOffVersion>>> {
  await as(specialist, (context) => approveVersion(context, { practiceId: north.practiceId, versionId }));
  return as(manager, (context) => signOffVersion(context, { practiceId: north.practiceId, versionId }));
}

/** A signed-off version of a new contract with 97110 at $32.00 and 97140 at $30.50. */
async function signedContract(effectiveFrom = '2026-01-01', effectiveTo: string | null = null): Promise<Draft & { recordIds: string[] }> {
  const created = await draft(effectiveFrom, effectiveTo);
  const recordIds = await addRecords(created.versionId, [
    { terms: FIXED_97110, quote: QUOTE_97110 },
    { terms: FIXED_97140, quote: QUOTE_97140 },
  ]);
  expect(await approveAll(recordIds)).toEqual([true, true]);
  await approveAndSignOff(created.versionId);
  return { ...created, recordIds };
}

async function mapped(planId: string, kind: 'contract' | 'no_agreement' | 'ma_noncontracted' | 'government' | 'other', effectiveFrom: string, contractVersionId: string | null = null, supersedesId: string | null = null) {
  return as(manager, (context) => mapPlan(context, { practiceId: north.practiceId, planId, kind, contractVersionId, effectiveFrom, supersedesId }));
}

async function resolveLine(line: Partial<AgreementLine> & { planId: string; serviceDate: string }) {
  const records = await as(manager, (context) => loadAgreementRecords(context.scope, { practiceId: north.practiceId, requestId: context.requestId, purpose: 'pricing' }));
  return resolveAgreement({ procedureCode: '97110', modifiers: ['GP'], placeOfService: '11', ...line }, records);
}

describe('the workflow from a tagged document to a signed-off version', () => {
  it('drafts, abstracts with citations, approves field by field, approves, signs off and prices', async () => {
    const created = await signedContract();
    const row = await versionRow(created.versionId);
    expect(row).toMatchObject({ status: 'signed_off', approved_by: specialist, signed_off_by: manager, version_no: 1 });
    expect(row.approved_at).toBeInstanceOf(Date);
    expect(row.signed_off_at).toBeInstanceOf(Date);
    for (const record of await recordRows(created.versionId)) {
      expect(record).toMatchObject({ verified_by: specialist, proposed_by: 'specialist' });
      expect(Object.keys((record.evidence as { approved_fields: object }).approved_fields).sort()).toEqual([...RATE_RECORD_FIELDS].sort());
      expect(Object.values((record.evidence as { approved_fields: Record<string, { by: string }> }).approved_fields).every((approval) => approval.by === specialist)).toBe(true);
    }
    const planId = await plan('SYNTH-PLAN-HAPPY');
    await mapped(planId, 'contract', '2026-01-01', created.versionId);
    const resolved = await resolveLine({ planId, serviceDate: '2026-05-04' });
    expect(resolved.outcome).toBe('CONTRACT_RATE');
    expect(resolved.outcome === 'CONTRACT_RATE' && resolved.rate.windows.timely_filing_days).toBe(180);
    expect(resolved.outcome === 'CONTRACT_RATE' && resolved.rate.terms.flags).toEqual({ apply_mppr: false, apply_assistant_reduction: false, apply_sequestration: false, apply_ncci: false, timed_units_rule: 'UNKNOWN' });
    // Every step is in the audit log with its actor.
    const { rows } = await asOwner(owner, [north.practiceId], () =>
      owner.query<{ action: string; actor_id: string }>("SELECT action, actor_id FROM audit_event WHERE practice_id = $1 AND object_id = $2 AND action <> 'read' ORDER BY at, action", [north.practiceId, created.versionId]),
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { action: 'contract_version_drafted', actor_id: manager },
        { action: 'contract_version_approved', actor_id: specialist },
        { action: 'contract_version_signed_off', actor_id: manager },
      ]),
    );
  });

  it('derives the contract calendar at sign-off', async () => {
    const created = await draft('2025-03-01');
    const ids = await addRecords(created.versionId, [
      { terms: { scope: { codes: ['97530'] }, method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '110', year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' } }, quote: '97530 Therapeutic activities at 110% of the Medicare fee schedule' },
    ]);
    await approveAll(ids);
    const { calendarEvents } = await approveAndSignOff(created.versionId);
    expect(calendarEvents.map((event) => event.kind)).toEqual(['anniversary', 'notice_deadline', 'fee_schedule_year']);
    const { rows } = await asOwner(owner, [north.practiceId], () => owner.query<{ kind: string; on_date: string }>('SELECT kind, on_date::text FROM contract_calendar_event WHERE contract_id = $1 ORDER BY kind', [created.contractId]));
    expect(rows).toHaveLength(3);
    // Only someone who signs off records calendar events, and nobody changes one.
    await expect(asApp(viewer, "INSERT INTO contract_calendar_event (practice_id, contract_id, kind, on_date) VALUES ($1, $2, 'anniversary', '2030-01-01')", [north.practiceId, created.contractId])).rejects.toMatchObject({ code: '42501' });
    await expect(asApp(manager, "UPDATE contract_calendar_event SET note = 'x' WHERE contract_id = $1", [created.contractId])).rejects.toMatchObject({ code: '42501' });
  });

  it('reaches a practice’s contracts only through a support grant, and approves only as a contract specialist', async () => {
    const created = await draft('2031-01-01');
    expect(await errorOf(as(outsideSpecialist, (context) => addRateRecord(context, { practiceId: north.practiceId, versionId: created.versionId, terms: FIXED_97110 })))).toBeInstanceOf(PermissionDeniedError);
    expect(await errorOf(as(outsideSpecialist, (context) => approveVersion(context, { practiceId: north.practiceId, versionId: created.versionId })))).toBeInstanceOf(PermissionDeniedError);
    const [id = ''] = await addRecords(created.versionId, [{ terms: FIXED_97110, quote: QUOTE_97110 }]);
    // A billing manager, a practice administrator and a viewer neither abstract nor approve.
    for (const person of [manager, north.adminUserId, viewer]) {
      expect(await errorOf(as(person, (context) => approveRateRecordField(context, { practiceId: north.practiceId, rateRecordId: id, field: 'scope' })))).toBeInstanceOf(PermissionDeniedError);
      expect(await errorOf(as(person, (context) => addRateRecord(context, { practiceId: north.practiceId, versionId: created.versionId, terms: FIXED_97140 })))).toBeInstanceOf(PermissionDeniedError);
    }
    // And the database refuses them the approval itself.
    await expect(
      asApp(manager, "UPDATE rate_record SET evidence = evidence || jsonb_build_object('approved_fields', jsonb_build_object('scope', jsonb_build_object('by', app_actor_id(), 'at', now()))) WHERE id = $1", [id]),
    ).rejects.toMatchObject({ code: '42501' });
    // A specialist cannot record another person's approval.
    await expect(
      withPracticeScope(app, { actorId: specialist, practiceIds: [north.practiceId] }, (scope) =>
        scope.client.query("UPDATE rate_record SET evidence = evidence || jsonb_build_object('approved_fields', jsonb_build_object('scope', jsonb_build_object('by', $2::text, 'at', now()))) WHERE id = $1", [id, manager]),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await approveAll([id]);
    await expect(asApp(manager, "UPDATE contract_version SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1", [created.versionId, manager])).rejects.toMatchObject({ code: '42501' });
    await expect(
      withPracticeScope(app, { actorId: specialist, practiceIds: [north.practiceId] }, (scope) =>
        scope.client.query("UPDATE contract_version SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1", [created.versionId, manager]),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await as(specialist, (context) => approveVersion(context, { practiceId: north.practiceId, versionId: created.versionId }));
    // Sign-off is the customer's: the specialist and a viewer are refused, in the handler and in the database.
    for (const person of [specialist, viewer]) {
      expect(await errorOf(as(person, (context) => signOffVersion(context, { practiceId: north.practiceId, versionId: created.versionId })))).toBeInstanceOf(PermissionDeniedError);
      await expect(asApp(person, "UPDATE contract_version SET status = 'signed_off', signed_off_by = app_actor_id(), signed_off_at = now() WHERE id = $1", [created.versionId])).rejects.toMatchObject({ code: '42501' });
    }
    await as(north.adminUserId, (context) => signOffVersion(context, { practiceId: north.practiceId, versionId: created.versionId }));
    expect(await versionRow(created.versionId)).toMatchObject({ status: 'signed_off', signed_off_by: north.adminUserId });
  });

  it('moves versions only forward, through legal transitions', async () => {
    const created = await draft('2032-01-01');
    await expect(asApp(manager, "UPDATE contract_version SET status = 'signed_off' WHERE id = $1", [created.versionId])).rejects.toMatchObject({ code: '23514' });
    await expect(asApp(manager, "UPDATE contract_version SET status = 'superseded' WHERE id = $1", [created.versionId])).rejects.toMatchObject({ code: '23514' });
    // An empty draft is neither proposed nor approved.
    await expect(asApp(specialist, "UPDATE contract_version SET status = 'proposed' WHERE id = $1", [created.versionId])).rejects.toMatchObject({ code: '23514' });
    expect(await errorOf(as(specialist, (context) => approveVersion(context, { practiceId: north.practiceId, versionId: created.versionId })))).toBeInstanceOf(ContractWorkflowError);
    expect(await errorOf(as(manager, (context) => signOffVersion(context, { practiceId: north.practiceId, versionId: created.versionId })))).toMatchObject({ reason: 'invalid' });
    // A version starts as a draft.
    await expect(
      asApp(manager, "INSERT INTO contract_version (practice_id, contract_id, version_no, effective_from, status) VALUES ($1, $2, 9, '2040-01-01', 'signed_off')", [north.practiceId, created.contractId]),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('names only clean contract, exhibit and payer-letter documents of the practice', async () => {
    const pending = await document('contract', [['SYNTHETIC UNSCANNED']], 'pending');
    expect(await errorOf(draft('2033-01-01', null, undefined, [pending]))).toMatchObject({ code: '23514' });
    expect(await errorOf(draft('2033-01-01', null, undefined, [contractDoc, contractDoc]))).toMatchObject({ reason: 'invalid' });
    expect(await errorOf(draft('2033-01-01', null, undefined, [randomUUID()]))).toMatchObject({ code: '23514' });
    const created = await draft('2033-01-01', null, undefined, []);
    expect(await errorOf(as(specialist, (context) => addRateRecord(context, { practiceId: north.practiceId, versionId: created.versionId, terms: FIXED_97110, citation: { documentId: contractDoc, page: 2, quote: QUOTE_97110 } })))).toMatchObject({
      reason: 'invalid',
      evidenceProblem: 'document_not_in_version',
    });
    await as(specialist, (context) => updateDraftVersion(context, { practiceId: north.practiceId, versionId: created.versionId, sourceDocumentIds: [contractDoc, exhibitDoc] }));
    expect((await versionRow(created.versionId)).source_document_ids).toEqual([contractDoc, exhibitDoc]);
  });

  it('adds a tagged document to a draft as whoever uploads files, once, and never to an approved version', async () => {
    const created = await draft('2034-01-01', null, undefined, [contractDoc]);
    const attach = (actor: string, versionId: string, documentId: string) => as(actor, (context) => attachDocument(context, { practiceId: north.practiceId, versionId, documentId }));
    expect(await errorOf(attach(viewer, created.versionId, exhibitDoc))).toBeInstanceOf(PermissionDeniedError);
    expect(await attach(manager, created.versionId, exhibitDoc)).toEqual({ attached: true });
    expect(await attach(specialist, created.versionId, exhibitDoc)).toEqual({ attached: false });
    expect((await versionRow(created.versionId)).source_document_ids).toEqual([contractDoc, exhibitDoc]);
    const unscanned = await document('exhibit', [['SYNTHETIC UNSCANNED EXHIBIT']], 'pending');
    expect(await errorOf(attach(manager, created.versionId, unscanned))).toMatchObject({ code: '23514' });
    const [id] = await addRecords(created.versionId, [{ terms: FIXED_97110, quote: QUOTE_97110 }]);
    await approveAll([id ?? '']);
    await as(specialist, (context) => approveVersion(context, { practiceId: north.practiceId, versionId: created.versionId }));
    expect(await errorOf(attach(manager, created.versionId, amendmentDoc))).toMatchObject({ reason: 'invalid' });
    expect(await errorOf(attach(manager, randomUUID(), amendmentDoc))).toMatchObject({ reason: 'not_found' });
  });
});

describe('the contract’s own dispute window: cited, verified by a contract specialist, frozen from approval (D17 a)', () => {
  /** A draft whose window is 30 days, with one rate record verified, ready to approve but for its window. */
  async function windowDraft(effectiveFrom: string, days: number | null = 30, sourceDocumentIds: readonly string[] = [contractDoc]): Promise<Draft & { recordIds: string[] }> {
    const created = await as(manager, async (context) => {
      const { contractId } = await createContract(context, { practiceId: north.practiceId, payerId: payer, title: 'SYNTHETIC WINDOW AGREEMENT' });
      const { versionId } = await createDraftVersion(context, { practiceId: north.practiceId, contractId, effectiveFrom, sourceDocumentIds: [...sourceDocumentIds], disputeWindowDays: days });
      return { contractId, versionId };
    });
    const recordIds = await addRecords(created.versionId, [{ terms: FIXED_97110, quote: QUOTE_97110 }]);
    expect(await approveAll(recordIds)).toEqual([true]);
    return { ...created, recordIds };
  }
  /** Cites the window with the rule its quote states: calendar days after the payment date unless named (best-option audit #5). */
  const cite = (
    versionId: string,
    citation: { documentId: string; page: number; quote: string } | null = { documentId: contractDoc, page: 1, quote: WINDOW_QUOTE },
    actor = specialist,
    rule: DisputeWindowRule = COMPUTED_CONTRACT_WINDOW_RULE,
  ) => as(actor, (context) => citeDisputeWindow(context, { practiceId: north.practiceId, versionId, citation, rule: citation === null ? null : rule }));
  const verify = (versionId: string, actor = specialist) => as(actor, (context) => verifyDisputeWindow(context, { practiceId: north.practiceId, versionId }));

  it('cites the window on its page with the page’s hash, refuses approval until a specialist verifies it, and keeps both through sign-off', async () => {
    const created = await windowDraft('2060-01-01');
    expect(await cite(created.versionId)).toEqual({ cited: true });
    const cited = await versionRow(created.versionId);
    expect(cited).toMatchObject({ dispute_window_days: 30, dispute_window_verified_by: null, dispute_window_verified_at: null });
    expect(cited.dispute_window_evidence).toEqual({ document_id: contractDoc, page: 1, quote: WINDOW_QUOTE, hash: expect.stringMatching(/^[0-9a-f]{64}$/) as string });
    expect(cited).toMatchObject({ dispute_window_unit: 'calendar_days', dispute_window_measured_from: 'payment_date' });
    // Cited, not verified: the service and the database refuse approval.
    expect(await errorOf(as(specialist, (context) => approveVersion(context, { practiceId: north.practiceId, versionId: created.versionId })))).toMatchObject({ reason: 'invalid', message: expect.stringMatching(/window is verified/) });
    await expect(asApp(specialist, "UPDATE contract_version SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1", [created.versionId, specialist])).rejects.toThrow(/cited is approved once a contract specialist has verified/);
    // Only a contract specialist verifies, and a manager's attempt changes nothing.
    expect(await errorOf(verify(created.versionId, manager))).toBeInstanceOf(PermissionDeniedError);
    expect(await verify(created.versionId)).toMatchObject({ verified: true, evidence: { resolved: true } });
    const verified = await versionRow(created.versionId);
    expect(verified.dispute_window_verified_by).toBe(specialist);
    expect(verified.dispute_window_verified_at).toBeInstanceOf(Date);
    // Verifying again leaves the verification as it was.
    expect(await verify(created.versionId)).toMatchObject({ verified: true });
    expect((await versionRow(created.versionId)).dispute_window_verified_at).toEqual(verified.dispute_window_verified_at);
    await approveAndSignOff(created.versionId);
    const signed = await versionRow(created.versionId);
    expect(signed).toMatchObject({
      status: 'signed_off',
      dispute_window_evidence: cited.dispute_window_evidence,
      dispute_window_unit: 'calendar_days',
      dispute_window_measured_from: 'payment_date',
      dispute_window_verified_by: specialist,
      dispute_window_verified_at: verified.dispute_window_verified_at,
    });
    // Frozen: neither the evidence, the rule it states nor its verification changes once signed off, for anyone.
    for (const sql of [
      'UPDATE contract_version SET dispute_window_evidence = NULL, dispute_window_unit = NULL, dispute_window_measured_from = NULL, dispute_window_verified_by = NULL, dispute_window_verified_at = NULL WHERE id = $1',
      "UPDATE contract_version SET dispute_window_unit = 'business_days' WHERE id = $1",
      "UPDATE contract_version SET dispute_window_measured_from = 'date_of_service' WHERE id = $1",
      `UPDATE contract_version SET dispute_window_evidence = jsonb_set(dispute_window_evidence, '{page}', '2') WHERE id = $1`,
      'UPDATE contract_version SET dispute_window_verified_at = now() WHERE id = $1',
    ]) {
      await expect(asApp(specialist, sql, [created.versionId]), sql).rejects.toMatchObject({ code: '23514' });
      await expect(asApp(manager, sql, [created.versionId]), sql).rejects.toMatchObject({ code: '23514' });
    }
    expect(await errorOf(cite(created.versionId))).toMatchObject({ reason: 'invalid', message: expect.stringMatching(/supersede/) });
    const { rows } = await asOwner(owner, [north.practiceId], () =>
      owner.query<{ action: string; actor_id: string }>("SELECT action, actor_id FROM audit_event WHERE object_id = $1 AND action LIKE 'contract_window_%' ORDER BY at", [created.versionId]),
    );
    expect(rows).toEqual([
      { action: 'contract_window_cited', actor_id: specialist },
      { action: 'contract_window_verified', actor_id: specialist },
    ]);
  });

  it('approves an uncited window as the contract’s days (its lines’ deadlines stay unverified), and freezes an approved version’s window too', async () => {
    const uncited = await windowDraft('2061-01-01');
    await as(specialist, (context) => approveVersion(context, { practiceId: north.practiceId, versionId: uncited.versionId }));
    expect(await versionRow(uncited.versionId)).toMatchObject({ status: 'approved', dispute_window_days: 30, dispute_window_evidence: null, dispute_window_verified_by: null });
    // Approved: citing it now is an edit, refused in the service and in the database.
    expect(await errorOf(cite(uncited.versionId))).toMatchObject({ reason: 'invalid' });
    await expect(
      asApp(specialist, `UPDATE contract_version SET dispute_window_evidence = jsonb_build_object('document_id', $2::text, 'page', 1, 'quote', 'Q', 'hash', repeat('a', 64)) WHERE id = $1`, [uncited.versionId, contractDoc]),
    ).rejects.toThrow(/never changes/);
  });

  it('clears the verification on any edit of the window, its evidence or the documents, and a silent window loses its citation', async () => {
    const created = await windowDraft('2062-01-01');
    await cite(created.versionId);
    await verify(created.versionId);
    await as(specialist, (context) => updateDraftVersion(context, { practiceId: north.practiceId, versionId: created.versionId, disputeWindowDays: 31 }));
    expect(await versionRow(created.versionId)).toMatchObject({ dispute_window_days: 31, dispute_window_verified_by: null, dispute_window_verified_at: null, dispute_window_evidence: expect.objectContaining({ quote: WINDOW_QUOTE }) as object });
    await as(specialist, (context) => updateDraftVersion(context, { practiceId: north.practiceId, versionId: created.versionId, disputeWindowDays: 30 }));
    await verify(created.versionId);
    // A document attached is an edit of the documents the evidence is read from.
    await as(manager, (context) => attachDocument(context, { practiceId: north.practiceId, versionId: created.versionId, documentId: exhibitDoc }));
    expect((await versionRow(created.versionId)).dispute_window_verified_by).toBeNull();
    await verify(created.versionId);
    // A new citation clears it; so does removing the citation.
    await cite(created.versionId, { documentId: contractDoc, page: 1, quote: 'Disputes are raised within 30 days' });
    expect((await versionRow(created.versionId)).dispute_window_verified_by).toBeNull();
    await verify(created.versionId);
    expect(await cite(created.versionId, null)).toEqual({ cited: false });
    expect(await versionRow(created.versionId)).toMatchObject({ dispute_window_evidence: null, dispute_window_unit: null, dispute_window_measured_from: null, dispute_window_verified_by: null });
    // A new rule with the same quote is a new citation: it clears the verification too.
    await cite(created.versionId);
    await verify(created.versionId);
    await cite(created.versionId, undefined, specialist, { unit: 'calendar_days', measuredFrom: 'date_of_service' });
    expect(await versionRow(created.versionId)).toMatchObject({ dispute_window_measured_from: 'date_of_service', dispute_window_verified_by: null, dispute_window_verified_at: null });
    // A window made silent takes its citation and its rule with it (a citation is of a window the version states).
    await cite(created.versionId);
    await as(specialist, (context) => updateDraftVersion(context, { practiceId: north.practiceId, versionId: created.versionId, disputeWindowDays: null }));
    expect(await versionRow(created.versionId)).toMatchObject({ dispute_window_days: null, dispute_window_evidence: null, dispute_window_unit: null, dispute_window_measured_from: null, dispute_window_verified_by: null });
    // A silent window is not cited at all, and an unverified one is not verified without a citation.
    expect(await errorOf(cite(created.versionId))).toMatchObject({ reason: 'invalid', message: expect.stringMatching(/states its days/) });
    expect(await errorOf(verify(created.versionId))).toMatchObject({ reason: 'invalid', message: expect.stringMatching(/once it is cited/) });
  });

  it('refuses a citation that does not resolve to its page, and verifies none whose evidence is not on one of the version’s documents', async () => {
    const created = await windowDraft('2063-01-01');
    expect(await errorOf(cite(created.versionId, { documentId: contractDoc, page: 1, quote: 'Disputes are raised within 3650 days of the payment date.' }))).toMatchObject({ reason: 'invalid', evidenceProblem: expect.any(String) as string });
    expect(await errorOf(cite(created.versionId, { documentId: amendmentDoc, page: 1, quote: WINDOW_QUOTE }))).toMatchObject({ reason: 'invalid' });
    expect(await errorOf(cite(created.versionId, undefined, viewer))).toBeInstanceOf(PermissionDeniedError);
    expect((await versionRow(created.versionId)).dispute_window_evidence).toBeNull();
    // Written directly, evidence on another document of the practice stays unverifiable, in the service and the database.
    const stray = { document_id: amendmentDoc, page: 1, quote: WINDOW_QUOTE, hash: 'b'.repeat(64) };
    await asOwner(
      owner,
      [north.practiceId],
      () =>
        owner.query("UPDATE contract_version SET dispute_window_evidence = $2, dispute_window_unit = 'calendar_days', dispute_window_measured_from = 'payment_date' WHERE id = $1", [
          created.versionId,
          JSON.stringify(stray),
        ]),
      specialist,
    );
    expect(await verify(created.versionId)).toMatchObject({ verified: false, evidence: { resolved: false } });
    await expect(asApp(specialist, 'UPDATE contract_version SET dispute_window_verified_by = $2, dispute_window_verified_at = now() WHERE id = $1', [created.versionId, specialist])).rejects.toThrow(/evidence is a document of its version/);
  });

  it('holds the verification in the database: a specialist’s, in their own name, now, once, over complete evidence, the window and status as they stand', async () => {
    const created = await windowDraft('2064-01-01');
    await cite(created.versionId);
    const set = (actor: string, by: string, at = 'now()') => asApp(actor, `UPDATE contract_version SET dispute_window_verified_by = $2, dispute_window_verified_at = ${at} WHERE id = $1`, [created.versionId, by]);
    await expect(set(manager, manager)).rejects.toMatchObject({ code: '42501' });
    await expect(set(specialist, outsideSpecialist)).rejects.toThrow(/records the verifying specialist and the time/);
    await expect(set(specialist, specialist, "now() - interval '1 day'")).rejects.toThrow(/records the verifying specialist and the time/);
    await expect(asApp(specialist, 'UPDATE contract_version SET dispute_window_verified_by = $2, dispute_window_verified_at = now(), dispute_window_days = 31 WHERE id = $1', [created.versionId, specialist])).rejects.toThrow(/verified as it stands/);
    await expect(asApp(specialist, "UPDATE contract_version SET dispute_window_verified_by = $2, dispute_window_verified_at = now(), status = 'proposed' WHERE id = $1", [created.versionId, specialist])).rejects.toThrow(/verified as it stands/);
    // Shapes the CHECKs hold: complete evidence of exactly four keys, only with the window's days, verified only with evidence.
    for (const [sql, constraint] of [
      [`UPDATE contract_version SET dispute_window_evidence = dispute_window_evidence - 'hash' WHERE id = $1`, 'contract_version_window_evidence_complete'],
      [`UPDATE contract_version SET dispute_window_evidence = dispute_window_evidence || '{"note": "x"}' WHERE id = $1`, 'contract_version_window_evidence_complete'],
      [`UPDATE contract_version SET dispute_window_evidence = jsonb_set(dispute_window_evidence, '{quote}', '"  "') WHERE id = $1`, 'contract_version_window_evidence_complete'],
      ['UPDATE contract_version SET dispute_window_days = NULL WHERE id = $1', 'contract_version_window_evidence_needs_window'],
    ] as const) {
      await expect(asApp(specialist, sql, [created.versionId]), sql).rejects.toMatchObject({ code: '23514', constraint });
    }
    await set(specialist, specialist);
    // Recorded once: never another specialist's or another time over it.
    const verifiedOnce = async () => {
      const client = await app.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [specialist, `{${north.practiceId}}`]);
        await client.query('UPDATE contract_version SET dispute_window_verified_by = $2, dispute_window_verified_at = now() WHERE id = $1', [created.versionId, specialist]);
        await client.query('SAVEPOINT again');
        await expect(client.query('UPDATE contract_version SET dispute_window_verified_by = $2 WHERE id = $1', [created.versionId, outsideSpecialist])).rejects.toThrow(/recorded once/);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    };
    await verifiedOnce();
    // Written with the version: never verified, and never citing a document the version does not name.
    await expect(
      asApp(
        specialist,
        `INSERT INTO contract_version (practice_id, contract_id, version_no, source_document_ids, effective_from, dispute_window_days, dispute_window_evidence, dispute_window_unit, dispute_window_measured_from)
         VALUES ($1, $2, 9, $3::uuid[], '2099-01-01', 30, $4::jsonb, 'calendar_days', 'payment_date')`,
        [north.practiceId, created.contractId, [contractDoc], JSON.stringify({ document_id: amendmentDoc, page: 1, quote: WINDOW_QUOTE, hash: 'c'.repeat(64) })],
      ),
    ).rejects.toThrow(/evidence is a document of its version/);
    // The application role cannot write a verification with the version at all (its column grants); the database
    // refuses one from any role, the owner's included.
    const verifiedInsert = `INSERT INTO contract_version (practice_id, contract_id, version_no, source_document_ids, effective_from, dispute_window_days, dispute_window_evidence,
                                                          dispute_window_unit, dispute_window_measured_from, dispute_window_verified_by, dispute_window_verified_at)
                            VALUES ($1, $2, 9, $3::uuid[], '2099-01-01', 30, $4::jsonb, 'calendar_days', 'payment_date', $5, now())`;
    const values = [north.practiceId, created.contractId, [contractDoc], JSON.stringify({ document_id: contractDoc, page: 1, quote: WINDOW_QUOTE, hash: 'c'.repeat(64) }), specialist];
    await expect(asApp(specialist, verifiedInsert, values)).rejects.toMatchObject({ code: '42501' });
    await expect(asOwner(owner, [north.practiceId], () => owner.query(verifiedInsert, values), specialist)).rejects.toThrow(/written with its dispute window unverified/);
  });

  it('copies the citation into a correction and an amendment while the days stay, never the verification', async () => {
    const created = await windowDraft('2065-01-01');
    await cite(created.versionId);
    await verify(created.versionId);
    await approveAndSignOff(created.versionId);
    const evidence = (await versionRow(created.versionId)).dispute_window_evidence;
    const correction = await as(specialist, (context) => supersedeVersion(context, { practiceId: north.practiceId, versionId: created.versionId }));
    expect(await versionRow(correction.versionId)).toMatchObject({
      dispute_window_days: 30,
      dispute_window_evidence: evidence,
      dispute_window_unit: 'calendar_days',
      dispute_window_measured_from: 'payment_date',
      dispute_window_verified_by: null,
      dispute_window_verified_at: null,
    });
    const amendment = await as(specialist, (context) => amendVersion(context, { practiceId: north.practiceId, versionId: created.versionId, effectiveFrom: '2065-07-01', disputeWindowDays: 45 }));
    // A window of other days is not the cited one: the amendment's is uncited until the specialist cites it, with no rule.
    expect(await versionRow(amendment.versionId)).toMatchObject({ dispute_window_days: 45, dispute_window_evidence: null, dispute_window_unit: null, dispute_window_measured_from: null, dispute_window_verified_by: null });
    // The copy is verified against the successor's documents before the successor is approved.
    await approveAll((await recordRows(correction.versionId)).map((row) => String(row.id)));
    expect(await errorOf(as(specialist, (context) => approveVersion(context, { practiceId: north.practiceId, versionId: correction.versionId })))).toMatchObject({ reason: 'invalid' });
    await verify(correction.versionId);
    expect((await approveAndSignOff(correction.versionId)).retired).toEqual({ versionId: created.versionId, as: 'superseded' });
    // The superseded version keeps its verified window as it was.
    expect(await versionRow(created.versionId)).toMatchObject({ status: 'superseded', dispute_window_evidence: evidence, dispute_window_verified_by: specialist });
  });

  it('records the rule the quote states with its citation, chosen from the fixed lists, and the database holds it to the citation (best-option audit #5)', async () => {
    const created = await windowDraft('2066-01-01');
    const citation = { documentId: contractDoc, page: 1, quote: WINDOW_QUOTE };
    const citeWith = (input: { citation: typeof citation | null; rule?: unknown }) =>
      as(specialist, (context) => citeDisputeWindow(context, { practiceId: north.practiceId, versionId: created.versionId, ...input } as Parameters<typeof citeDisputeWindow>[1]));
    // A citation states its rule; no rule stands without a citation; nothing outside the lists is a rule.
    expect(await errorOf(citeWith({ citation }))).toMatchObject({ reason: 'invalid', issues: [expect.objectContaining({ field: 'rule' })] });
    expect(await errorOf(citeWith({ citation: null, rule: COMPUTED_CONTRACT_WINDOW_RULE }))).toMatchObject({ reason: 'invalid', issues: [expect.objectContaining({ field: 'rule' })] });
    for (const rule of [{ unit: 'days', measuredFrom: 'remittance_date' }, { unit: 'calendar_days', measuredFrom: 'claim_date' }, { unit: 'calendar_days' }, { ...COMPUTED_CONTRACT_WINDOW_RULE, note: 'x' }]) {
      expect(await errorOf(citeWith({ citation, rule })), JSON.stringify(rule)).toMatchObject({ reason: 'invalid' });
    }
    expect(await versionRow(created.versionId)).toMatchObject({ dispute_window_evidence: null, dispute_window_unit: null, dispute_window_measured_from: null });
    // Each unit and start the lists name is recorded as the specialist chose it.
    for (const unit of DISPUTE_WINDOW_UNITS) {
      for (const measuredFrom of DISPUTE_WINDOW_STARTS) {
        await cite(created.versionId, citation, specialist, { unit, measuredFrom });
        expect(await versionRow(created.versionId)).toMatchObject({ dispute_window_unit: unit, dispute_window_measured_from: measuredFrom });
      }
    }
    // In the database: a value outside the lists, a rule without its citation and a citation without its rule.
    await cite(created.versionId);
    for (const [sql, constraint] of [
      ["UPDATE contract_version SET dispute_window_unit = 'days' WHERE id = $1", 'contract_version_dispute_window_unit_check'],
      ["UPDATE contract_version SET dispute_window_measured_from = 'claim_date' WHERE id = $1", 'contract_version_dispute_window_measured_from_check'],
      ['UPDATE contract_version SET dispute_window_unit = NULL WHERE id = $1', 'contract_version_window_rule_with_citation'],
      ['UPDATE contract_version SET dispute_window_measured_from = NULL WHERE id = $1', 'contract_version_window_rule_with_citation'],
      ['UPDATE contract_version SET dispute_window_evidence = NULL WHERE id = $1', 'contract_version_window_rule_with_citation'],
    ] as const) {
      await expect(asApp(specialist, sql, [created.versionId]), sql).rejects.toMatchObject({ code: '23514', constraint });
    }
    const uncited = await windowDraft('2066-07-01');
    await expect(
      asApp(specialist, "UPDATE contract_version SET dispute_window_unit = 'calendar_days', dispute_window_measured_from = 'payment_date' WHERE id = $1", [uncited.versionId]),
    ).rejects.toMatchObject({ code: '23514', constraint: 'contract_version_window_rule_with_citation' });
  });

  it('never verifies “within 180 days of the date of service” as a payment-date window: refused in the service and in Postgres, and the version is approved with it unverified (best-option audit #5)', async () => {
    const serviceDoc = await document('contract', [['SYNTHETIC PROVIDER AGREEMENT', 'Effective January 1, 2026. Compensation is set out in Exhibit A.', SERVICE_WINDOW_QUOTE]]);
    const created = await windowDraft('2067-01-01', 180, [contractDoc, serviceDoc]);
    const fromService = { unit: 'calendar_days', measuredFrom: 'date_of_service' } as const;
    expect(await cite(created.versionId, { documentId: serviceDoc, page: 1, quote: SERVICE_WINDOW_QUOTE }, specialist, fromService)).toEqual({ cited: true });
    expect(await versionRow(created.versionId)).toMatchObject({ dispute_window_days: 180, dispute_window_unit: 'calendar_days', dispute_window_measured_from: 'date_of_service' });
    // The service refuses to verify it, with the reason, before it reads the page.
    expect(await errorOf(verify(created.versionId))).toMatchObject({
      reason: 'invalid',
      message: expect.stringMatching(/only when the rule it cites is the rule the product computes/) as string,
      issues: [expect.objectContaining({ field: 'disputeWindowRule' })],
    });
    // So does Postgres, though the specialist verifies in their own name, now, over complete evidence on the version's document.
    const verifyInSql = 'UPDATE contract_version SET dispute_window_verified_by = $2, dispute_window_verified_at = now() WHERE id = $1';
    await expect(asApp(specialist, verifyInSql, [created.versionId, specialist])).rejects.toThrow(/a dispute window is verified only when the rule it cites is the rule the product computes/);
    // And the CHECK holds it on its own, with every trigger off.
    await expect(triggersOff(verifyInSql, [created.versionId, specialist])).rejects.toMatchObject({ code: '23514', constraint: 'contract_version_window_verified_as_computed' });
    // Every rule but the computed one is refused alike; the computed one is verified.
    for (const unit of DISPUTE_WINDOW_UNITS) {
      for (const measuredFrom of DISPUTE_WINDOW_STARTS) {
        await cite(created.versionId, { documentId: serviceDoc, page: 1, quote: SERVICE_WINDOW_QUOTE }, specialist, { unit, measuredFrom });
        const computed = unit === COMPUTED_CONTRACT_WINDOW_RULE.unit && measuredFrom === COMPUTED_CONTRACT_WINDOW_RULE.measuredFrom;
        if (computed) {
          await expect(asApp(specialist, verifyInSql, [created.versionId, specialist])).resolves.toMatchObject({ rowCount: 1 });
        } else {
          expect(await errorOf(verify(created.versionId)), `${unit} ${measuredFrom}`).toMatchObject({ reason: 'invalid', issues: [expect.objectContaining({ field: 'disputeWindowRule' })] });
          await expect(asApp(specialist, verifyInSql, [created.versionId, specialist]), `${unit} ${measuredFrom}`).rejects.toMatchObject({ code: '23514' });
        }
      }
    }
    // Cited as the quote states it, the window stays unverified, and the version is approved and signed off with it so: its lines' deadlines
    // stay unverified (CONTRACT_WINDOW_RULE_NOT_COMPUTED) until the product computes that rule.
    await cite(created.versionId, { documentId: serviceDoc, page: 1, quote: SERVICE_WINDOW_QUOTE }, specialist, fromService);
    await approveAndSignOff(created.versionId);
    expect(await versionRow(created.versionId)).toMatchObject({ status: 'signed_off', dispute_window_measured_from: 'date_of_service', dispute_window_verified_by: null, dispute_window_verified_at: null });
    // Its correction copies the citation with its rule, still unverified, and is approved the same way.
    const correction = await as(specialist, (context) => supersedeVersion(context, { practiceId: north.practiceId, versionId: created.versionId }));
    expect(await versionRow(correction.versionId)).toMatchObject({ dispute_window_days: 180, dispute_window_unit: 'calendar_days', dispute_window_measured_from: 'date_of_service', dispute_window_verified_by: null });
    await approveAll((await recordRows(correction.versionId)).map((row) => String(row.id)));
    await as(specialist, (context) => approveVersion(context, { practiceId: north.practiceId, versionId: correction.versionId }));
    expect((await versionRow(correction.versionId)).status).toBe('approved');
  });
});

describe('CON-01: two versions with overlapping windows are refused', () => {
  it('refuses a second version whose window overlaps, at once and in the database', async () => {
    const first = await draft('2026-01-01', '2027-01-01');
    expect(await errorOf(draft('2026-06-01', null, first.contractId))).toMatchObject({ reason: 'invalid', message: expect.stringMatching(/never overlap/) });
    await expect(
      asApp(manager, "INSERT INTO contract_version (practice_id, contract_id, version_no, effective_from, effective_to, source_document_ids) VALUES ($1, $2, 7, '2026-12-31', '2027-02-01', '{}')", [north.practiceId, first.contractId]),
    ).rejects.toMatchObject({ code: '23P01' });
    // Adjacent windows do not overlap; another contract's window is its own.
    await draft('2027-01-01', '2028-01-01', first.contractId);
    await draft('2026-06-01');
    // Editing a draft's window into another version's is refused too.
    const later = await draft('2028-01-01', '2029-01-01', first.contractId);
    expect(await errorOf(as(specialist, (context) => updateDraftVersion(context, { practiceId: north.practiceId, versionId: later.versionId, effectiveFrom: '2026-06-01' })))).toMatchObject({ reason: 'invalid' });
  });

  it('refuses the sign-off of a successor whose window overlaps a signed-off version it does not name', async () => {
    const first = await signedContract('2026-01-01', '2026-07-01');
    const second = await draft('2026-07-01', null, first.contractId);
    const secondRecords = await addRecords(second.versionId, [{ terms: FIXED_97110, quote: QUOTE_97110 }]);
    await approveAll(secondRecords);
    await approveAndSignOff(second.versionId);
    // A correction of the first version that runs past its end would overlap the second.
    const correction = await as(specialist, (context) => supersedeVersion(context, { practiceId: north.practiceId, versionId: first.versionId, effectiveTo: '2026-09-01' }));
    await approveAll((await recordRows(correction.versionId)).map((row) => String(row.id)));
    await as(specialist, (context) => approveVersion(context, { practiceId: north.practiceId, versionId: correction.versionId }));
    expect(await errorOf(as(manager, (context) => signOffVersion(context, { practiceId: north.practiceId, versionId: correction.versionId })))).toMatchObject({ reason: 'invalid', message: expect.stringMatching(/never overlap/) });
    expect(await versionRow(first.versionId)).toMatchObject({ status: 'signed_off' });
  });
});

describe('CON-02: an amendment closes the prior window', () => {
  it('sets the prior version’s effective_to to the amendment’s start and changes nothing else about it', async () => {
    const prior = await signedContract('2026-01-01');
    const before = await versionRow(prior.versionId);
    const recordsBefore = await recordRows(prior.versionId);
    const amendment = await as(specialist, (context) => amendVersion(context, { practiceId: north.practiceId, versionId: prior.versionId, effectiveFrom: '2026-07-01', sourceDocumentIds: [amendmentDoc] }));
    expect(amendment.copied).toBe(2);
    // The amendment's 97110 term is the amendment letter's.
    const copies = await recordRows(amendment.versionId);
    const copy97110 = copies.find((row) => (row.scope as { codes: string[] }).codes[0] === '97110');
    await as(specialist, (context) =>
      updateRateRecord(context, {
        practiceId: north.practiceId,
        rateRecordId: String(copy97110?.id),
        terms: { ...FIXED_97110, parameters: { amount_cents: '3400' } },
        citation: { documentId: amendmentDoc, page: 1, quote: '97110 Therapeutic exercise pays $34.00 per unit' },
      }),
    );
    // Until it is signed off, the prior version still prices every date.
    expect((await versionRow(prior.versionId)).effective_to).toBeNull();
    expect(await approveAll(copies.map((row) => String(row.id)))).toEqual([true, true]);
    const result = await approveAndSignOff(amendment.versionId);
    expect(result.retired).toEqual({ versionId: prior.versionId, as: 'closed' });
    expect(result.calendarEvents).toContainEqual(expect.objectContaining({ kind: 'amendment', onDate: '2026-07-01' }));
    const after = await versionRow(prior.versionId);
    const { effective_to: closed, updated_at: _updatedAt, ...rest } = after;
    const { effective_to: open, updated_at: _before, ...restBefore } = before;
    expect([open, rest]).toEqual([null, restBefore]);
    expect((closed as Date | string).toString()).toMatch(/2026|Jul/);
    expect((await asOwner(owner, [north.practiceId], () => owner.query('SELECT effective_to::text AS e FROM contract_version WHERE id = $1', [prior.versionId]))).rows).toEqual([{ e: '2026-07-01' }]);
    expect(await recordRows(prior.versionId)).toEqual(recordsBefore);
    // Lines before the amendment price under the prior version, lines from it under the amendment.
    const planId = await plan('SYNTH-PLAN-AMENDED');
    await mapped(planId, 'contract', '2026-01-01', prior.versionId);
    const june = await resolveLine({ planId, serviceDate: '2026-06-30' });
    const july = await resolveLine({ planId, serviceDate: '2026-07-01' });
    expect(june.outcome === 'CONTRACT_RATE' && [june.version.id, june.rate.terms.method === 'FIXED_SCHEDULE' && june.rate.terms.parameters.amount_cents]).toEqual([prior.versionId, 3200n]);
    expect(july.outcome === 'CONTRACT_RATE' && [july.version.id, july.rate.terms.method === 'FIXED_SCHEDULE' && july.rate.terms.parameters.amount_cents]).toEqual([amendment.versionId, 3400n]);
  });

  it('refuses an amendment that does not start inside a signed-off version, and a closing without the amendment’s sign-off', async () => {
    const prior = await signedContract('2026-01-01', '2027-01-01');
    for (const effectiveFrom of ['2026-01-01', '2025-06-01', '2027-01-01']) {
      expect(await errorOf(as(specialist, (context) => amendVersion(context, { practiceId: north.practiceId, versionId: prior.versionId, effectiveFrom })))).toMatchObject({ reason: 'invalid' });
    }
    const pending = await draft('2030-01-01');
    expect(await errorOf(as(specialist, (context) => amendVersion(context, { practiceId: north.practiceId, versionId: pending.versionId, effectiveFrom: '2030-06-01' })))).toMatchObject({ reason: 'invalid' });
    // An approved amendment exists, but closing the prior version by hand is refused at commit.
    const amendment = await as(specialist, (context) => amendVersion(context, { practiceId: north.practiceId, versionId: prior.versionId, effectiveFrom: '2026-09-01' }));
    await approveAll((await recordRows(amendment.versionId)).map((row) => String(row.id)));
    await as(specialist, (context) => approveVersion(context, { practiceId: north.practiceId, versionId: amendment.versionId }));
    await expect(
      withPracticeScope(app, { actorId: manager, practiceIds: [north.practiceId] }, (scope) => scope.client.query("UPDATE contract_version SET effective_to = '2026-09-01' WHERE id = $1", [prior.versionId])),
    ).rejects.toMatchObject({ code: '23514', message: expect.stringMatching(/only by the sign-off of its successor/) });
    await expect(asApp(manager, "UPDATE contract_version SET effective_to = '2026-10-01' WHERE id = $1", [prior.versionId])).rejects.toMatchObject({ code: '23514' });
    expect((await versionRow(prior.versionId)).status).toBe('signed_off');
  });
});

describe('CON-03: a signed-off version cannot be edited; supersession is required', () => {
  it('refuses every edit of a signed-off version and its rate records, in the services and in the database', async () => {
    const signed = await signedContract('2034-01-01');
    const before = await versionRow(signed.versionId);
    const records = await recordRows(signed.versionId);
    for (const sql of [
      "UPDATE contract_version SET effective_from = '2034-02-01' WHERE id = $1",
      "UPDATE contract_version SET effective_to = '2035-01-01' WHERE id = $1",
      'UPDATE contract_version SET timely_filing_days = 365 WHERE id = $1',
      "UPDATE contract_version SET status = 'draft', approved_by = NULL, approved_at = NULL, signed_off_by = NULL, signed_off_at = NULL WHERE id = $1",
      "UPDATE contract_version SET source_document_ids = '{}' WHERE id = $1",
    ]) {
      await expect(asApp(manager, sql, [signed.versionId]), sql).rejects.toMatchObject({ code: '23514' });
      await expect(asApp(specialist, sql, [signed.versionId]), sql).rejects.toMatchObject({ code: expect.stringMatching(/23514|42501/) });
    }
    const [recordId = ''] = signed.recordIds;
    for (const sql of [
      `UPDATE rate_record SET parameters = '{"amount_cents": "1"}' WHERE id = $1`,
      'UPDATE rate_record SET verified_by = NULL, verified_at = NULL WHERE id = $1',
      'DELETE FROM rate_record WHERE id = $1',
    ]) {
      await expect(asApp(specialist, sql, [recordId]), sql).rejects.toMatchObject({ code: '23514' });
    }
    await expect(
      asApp(specialist, "INSERT INTO rate_record (practice_id, contract_version_id, scope, method, parameters, flags, proposed_by) VALUES ($1, $2, '{}', 'UNSUPPORTED', '{}', '{}', 'specialist')", [north.practiceId, signed.versionId]),
    ).rejects.toMatchObject({ code: '23514' });
    expect(await errorOf(as(specialist, (context) => updateRateRecord(context, { practiceId: north.practiceId, rateRecordId: recordId, terms: FIXED_97140 })))).toMatchObject({ reason: 'invalid', message: expect.stringMatching(/supersede/) });
    expect(await errorOf(as(specialist, (context) => removeRateRecord(context, { practiceId: north.practiceId, rateRecordId: recordId })))).toMatchObject({ reason: 'invalid' });
    expect(await errorOf(as(specialist, (context) => updateDraftVersion(context, { practiceId: north.practiceId, versionId: signed.versionId, timelyFilingDays: 30 })))).toMatchObject({ reason: 'invalid' });
    expect(await versionRow(signed.versionId)).toEqual(before);
    expect(await recordRows(signed.versionId)).toEqual(records);
  });

  it('supersedes a signed-off version with a correction, leaving it and its records exactly as they were but superseded', async () => {
    const signed = await signedContract('2035-01-01');
    const before = await versionRow(signed.versionId);
    const records = await recordRows(signed.versionId);
    const correction = await as(specialist, (context) => supersedeVersion(context, { practiceId: north.practiceId, versionId: signed.versionId }));
    expect((await versionRow(correction.versionId)).effective_from).toEqual(before.effective_from);
    const copies = await recordRows(correction.versionId);
    // Copies keep the citation and lose the approvals: the specialist verifies them again.
    expect(copies.map((row) => [row.verified_by, (row.evidence as Record<string, unknown>).approved_fields])).toEqual([
      [null, undefined],
      [null, undefined],
    ]);
    await approveAll(copies.map((row) => String(row.id)));
    expect((await approveAndSignOff(correction.versionId)).retired).toEqual({ versionId: signed.versionId, as: 'superseded' });
    const { status, updated_at: _updated, ...after } = await versionRow(signed.versionId);
    const { status: was, updated_at: _was, ...unchanged } = before;
    expect([was, status, after]).toEqual(['signed_off', 'superseded', unchanged]);
    expect(await recordRows(signed.versionId)).toEqual(records);
    // A superseded version never changes again.
    await expect(asApp(manager, "UPDATE contract_version SET status = 'signed_off' WHERE id = $1", [signed.versionId])).rejects.toMatchObject({ code: '23514' });
  });

  it('freezes an approved version too, until it is signed off or superseded', async () => {
    const created = await draft('2036-01-01');
    const ids = await addRecords(created.versionId, [{ terms: FIXED_97110, quote: QUOTE_97110 }]);
    await approveAll(ids);
    await as(specialist, (context) => approveVersion(context, { practiceId: north.practiceId, versionId: created.versionId }));
    await expect(asApp(specialist, 'UPDATE contract_version SET notice_days = 30 WHERE id = $1', [created.versionId])).rejects.toMatchObject({ code: '23514' });
    await expect(asApp(specialist, "UPDATE rate_record SET rounding = 'TRUNCATE' WHERE id = $1", [ids[0]])).rejects.toMatchObject({ code: '23514' });
    // An approved version that is never signed off is superseded by its correction.
    const correction = await as(specialist, (context) => supersedeVersion(context, { practiceId: north.practiceId, versionId: created.versionId }));
    await approveAll((await recordRows(correction.versionId)).map((row) => String(row.id)));
    expect((await approveAndSignOff(correction.versionId)).retired).toEqual({ versionId: created.versionId, as: 'superseded' });
  });
});

describe('successors', () => {
  it('signs off one of two competing corrections, and refuses the other once its version is superseded', async () => {
    const signed = await signedContract('2044-01-01');
    const first = await as(specialist, (context) => supersedeVersion(context, { practiceId: north.practiceId, versionId: signed.versionId }));
    const second = await as(specialist, (context) => supersedeVersion(context, { practiceId: north.practiceId, versionId: signed.versionId }));
    for (const correction of [first, second]) {
      await approveAll((await recordRows(correction.versionId)).map((row) => String(row.id)));
      await as(specialist, (context) => approveVersion(context, { practiceId: north.practiceId, versionId: correction.versionId }));
    }
    expect((await as(manager, (context) => signOffVersion(context, { practiceId: north.practiceId, versionId: second.versionId }))).retired).toEqual({ versionId: signed.versionId, as: 'superseded' });
    expect(await errorOf(as(manager, (context) => signOffVersion(context, { practiceId: north.practiceId, versionId: first.versionId })))).toMatchObject({ code: '23514' });
    // Nor is a new successor of a superseded version drafted.
    expect(await errorOf(as(specialist, (context) => supersedeVersion(context, { practiceId: north.practiceId, versionId: signed.versionId })))).toMatchObject({ reason: 'invalid' });
    await expect(
      asApp(specialist, "INSERT INTO contract_version (practice_id, contract_id, version_no, effective_from, supersedes_id) VALUES ($1, $2, 99, '2044-01-01', $3)", [north.practiceId, signed.contractId, signed.versionId]),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('CON-04: a rate record without a page reference cannot be approved', () => {
  it('leaves a record with no citation unverified however many fields are approved, and the database refuses its verification', async () => {
    const created = await draft('2037-01-01');
    const id = await as(specialist, async (context) => (await addRateRecord(context, { practiceId: north.practiceId, versionId: created.versionId, terms: FIXED_97110 })).rateRecordId);
    const result = await as(specialist, async (context) => {
      let last;
      for (const field of RATE_RECORD_FIELDS) {
        last = await approveRateRecordField(context, { practiceId: north.practiceId, rateRecordId: id, field });
      }
      return last;
    });
    expect(result).toMatchObject({ verified: false, evidence: { resolved: false, problem: 'not_cited' } });
    await expect(asApp(specialist, 'UPDATE rate_record SET verified_by = app_actor_id(), verified_at = now() WHERE id = $1', [id])).rejects.toMatchObject({
      code: '23514',
      message: expect.stringMatching(/without evidence naming a document, a page, a quote and a hash/),
    });
    for (const partial of [
      { document_id: contractDoc, page: 2, quote: QUOTE_97110 },
      { document_id: contractDoc, quote: QUOTE_97110, hash: 'a'.repeat(64) },
      { page: 2, quote: QUOTE_97110, hash: 'a'.repeat(64) },
      { document_id: contractDoc, page: 2, quote: ' ', hash: 'a'.repeat(64) },
    ]) {
      await expect(
        withPracticeScope(app, { actorId: specialist, practiceIds: [north.practiceId] }, async (scope) => {
          await scope.client.query("UPDATE rate_record SET evidence = $2::jsonb || jsonb_build_object('approved_fields', evidence -> 'approved_fields') WHERE id = $1", [id, JSON.stringify(partial)]);
          await scope.client.query('UPDATE rate_record SET verified_by = app_actor_id(), verified_at = now() WHERE id = $1', [id]);
        }),
      ).rejects.toMatchObject({ code: '23514' });
    }
    // Nor is the version approved while a record is unverified.
    expect(await errorOf(as(specialist, (context) => approveVersion(context, { practiceId: north.practiceId, versionId: created.versionId })))).toMatchObject({ reason: 'invalid' });
    await expect(asApp(specialist, "UPDATE contract_version SET status = 'approved', approved_by = app_actor_id(), approved_at = now() WHERE id = $1", [created.versionId])).rejects.toMatchObject({ code: '23514' });
  });

  it('verifies only evidence that cites a document of the record’s own version', async () => {
    const created = await draft('2045-01-01');
    const [id = ''] = await addRecords(created.versionId, [{ terms: FIXED_97110, quote: QUOTE_97110 }]);
    const elsewhere = { document_id: exhibitDoc, page: 1, quote: '97110 Therapeutic exercise $29.00 per unit', hash: 'c'.repeat(64) };
    await expect(
      withPracticeScope(app, { actorId: specialist, practiceIds: [north.practiceId] }, async (scope) => {
        await scope.client.query('UPDATE rate_record SET evidence = $2::jsonb WHERE id = $1', [id, JSON.stringify(elsewhere)]);
        for (const field of RATE_RECORD_FIELDS) {
          await scope.client.query(
            "UPDATE rate_record SET evidence = evidence || jsonb_build_object('approved_fields', coalesce(evidence -> 'approved_fields', '{}') || jsonb_build_object($2::text, jsonb_build_object('by', app_actor_id(), 'at', now()))) WHERE id = $1",
            [id, field],
          );
        }
        await scope.client.query('UPDATE rate_record SET verified_by = app_actor_id(), verified_at = now() WHERE id = $1', [id]);
      }),
    ).rejects.toMatchObject({ code: '23514', message: expect.stringMatching(/evidence is a document of its version/) });
  });

  it('refuses at entry a hand-made citation that does not resolve, and clears approvals when a field or the citation changes', async () => {
    const created = await draft('2038-01-01');
    for (const citation of [
      { documentId: contractDoc, page: 2, quote: '97110 Therapeutic exercise $33.00 per unit' },
      { documentId: contractDoc, page: 9, quote: QUOTE_97110 },
    ]) {
      expect(await errorOf(as(specialist, (context) => addRateRecord(context, { practiceId: north.practiceId, versionId: created.versionId, terms: FIXED_97110, citation })))).toMatchObject({ reason: 'invalid' });
    }
    const [id = ''] = await addRecords(created.versionId, [{ terms: FIXED_97110, quote: QUOTE_97110 }]);
    await approveAll([id]);
    expect((await recordRows(created.versionId))[0]).toMatchObject({ verified_by: specialist });
    await as(specialist, (context) => updateRateRecord(context, { practiceId: north.practiceId, rateRecordId: id, terms: { ...FIXED_97110, rounding: 'TRUNCATE' } }));
    const [edited] = await recordRows(created.versionId);
    expect(edited?.verified_by).toBeNull();
    expect(Object.keys((edited?.evidence as { approved_fields: object }).approved_fields).sort()).toEqual(['flags', 'method', 'parameters', 'scope']);
    await as(specialist, (context) => updateRateRecord(context, { practiceId: north.practiceId, rateRecordId: id, citation: { documentId: contractDoc, page: 2, quote: '97110 Therapeutic exercise' } }));
    expect(((await recordRows(created.versionId))[0]?.evidence as Record<string, unknown>).approved_fields).toBeUndefined();
    expect(await as(specialist, (context) => checkEvidence(context, { practiceId: north.practiceId, rateRecordId: id }))).toMatchObject({ resolved: true, page: 2 });
    expect(await as(manager, (context) => checkEvidence(context, { practiceId: north.practiceId, rateRecordId: id }))).toMatchObject({ resolved: true });
    expect(await errorOf(as(viewer, (context) => checkEvidence(context, { practiceId: north.practiceId, rateRecordId: id })))).toBeInstanceOf(PermissionDeniedError);
  });

  it('refuses entered terms that are not valid, naming the field', async () => {
    const created = await draft('2039-01-01');
    expect(await errorOf(as(specialist, (context) => addRateRecord(context, { practiceId: north.practiceId, versionId: created.versionId, terms: { ...FIXED_97110, parameters: { amount_cents: '32.00' } } })))).toMatchObject({
      reason: 'invalid',
      issues: [expect.objectContaining({ field: 'terms.parameters.amount_cents' })],
    });
    expect(await errorOf(as(specialist, (context) => addRateRecord(context, { practiceId: north.practiceId, versionId: randomUUID(), terms: FIXED_97110 })))).toMatchObject({ reason: 'not_found' });
    expect(await errorOf(as(specialist, (context) => removeRateRecord(context, { practiceId: north.practiceId, rateRecordId: randomUUID() })))).toMatchObject({ reason: 'not_found' });
    expect(await errorOf(as(manager, (context) => createDraftVersion(context, { practiceId: north.practiceId, contractId: randomUUID(), effectiveFrom: '2039-01-01' })))).toMatchObject({ reason: 'not_found' });
    expect(await errorOf(as(manager, (context) => createContract(context, { practiceId: north.practiceId, payerId: payer, title: ' ' })))).toMatchObject({ reason: 'invalid' });
  });
});

describe('CON-05: a model proposal with a quote not on its page fails the verifier, and the specialist sees it', () => {
  it('records the proposal, reports the failing citation, and refuses to verify or approve it', async () => {
    const created = await draft('2040-01-01');
    // The proposer read page 2 and gives that page's hash with each citation.
    const pageHash = await as(specialist, async (context) => {
      const cited = await context.evidence?.cite(contractDoc, 2, QUOTE_97110, [contractDoc]);
      return cited?.cited === true ? cited.citation.hash : '';
    });
    const { checks } = await as(specialist, (context) =>
      proposeVersion(context, {
        practiceId: north.practiceId,
        versionId: created.versionId,
        rateRecords: [
          { terms: FIXED_97110, citation: { documentId: contractDoc, page: 2, quote: QUOTE_97110, hash: pageHash } },
          { terms: FIXED_97140, citation: { documentId: contractDoc, page: 2, quote: '97140 Manual therapy $35.00 per unit', hash: pageHash } },
        ],
      }),
    );
    expect(checks.map((check) => check.evidence)).toEqual([
      { resolved: true, page: 2, pageCount: 2, hash: pageHash },
      { resolved: false, problem: 'quote_not_on_page', pageCount: 2 },
    ]);
    expect((await versionRow(created.versionId)).status).toBe('proposed');
    expect((await recordRows(created.versionId)).map((row) => row.proposed_by)).toEqual(['model', 'model']);
    const verified = await approveAll(checks.map((check) => check.rateRecordId));
    expect(verified.sort()).toEqual([false, true]);
    expect(await errorOf(as(specialist, (context) => approveVersion(context, { practiceId: north.practiceId, versionId: created.versionId })))).toMatchObject({ reason: 'invalid' });
    // The specialist corrects the quote; the record then verifies and the version is approved.
    const failing = checks[1]?.rateRecordId ?? '';
    await as(specialist, (context) => updateRateRecord(context, { practiceId: north.practiceId, rateRecordId: failing, citation: { documentId: contractDoc, page: 2, quote: QUOTE_97140 } }));
    expect(await approveAll([failing])).toEqual([true]);
    await as(specialist, (context) => approveVersion(context, { practiceId: north.practiceId, versionId: created.versionId }));
    // A proposal goes into a draft only.
    expect(await errorOf(as(specialist, (context) => proposeVersion(context, { practiceId: north.practiceId, versionId: created.versionId, rateRecords: [{ terms: FIXED_97110, citation: { documentId: contractDoc, page: 2, quote: QUOTE_97110, hash: pageHash } }] })))).toMatchObject({
      reason: 'invalid',
    });
  });
});

describe('CON-06: conflicting exhibits for one code are AMBIGUOUS_RATE until resolved', () => {
  it('prices neither term until a correction removes the conflict', async () => {
    const created = await draft('2026-01-01', null, undefined, [contractDoc, exhibitDoc]);
    const ids = await addRecords(created.versionId, [
      { terms: FIXED_97110, quote: QUOTE_97110 },
      { terms: { ...FIXED_97110, parameters: { amount_cents: '2900' } }, quote: '97110 Therapeutic exercise $29.00 per unit', page: 1, documentId: exhibitDoc },
    ]);
    await approveAll(ids);
    await approveAndSignOff(created.versionId);
    const planId = await plan('SYNTH-PLAN-CONFLICT');
    await mapped(planId, 'contract', '2026-01-01', created.versionId);
    const ambiguous = await resolveLine({ planId, serviceDate: '2026-04-01' });
    expect(ambiguous.outcome === 'AMBIGUOUS_RATE' && ambiguous.rateRecordIds).toEqual([...ids].sort());
    const correction = await as(specialist, (context) => supersedeVersion(context, { practiceId: north.practiceId, versionId: created.versionId }));
    const copies = await recordRows(correction.versionId);
    const exhibitCopy = copies.find((row) => (row.parameters as { amount_cents: string }).amount_cents === '2900');
    await as(specialist, (context) => removeRateRecord(context, { practiceId: north.practiceId, rateRecordId: String(exhibitCopy?.id) }));
    await approveAll(copies.filter((row) => row !== exhibitCopy).map((row) => String(row.id)));
    await approveAndSignOff(correction.versionId);
    const resolved = await resolveLine({ planId, serviceDate: '2026-04-01' });
    expect(resolved.outcome === 'CONTRACT_RATE' && resolved.version.id).toBe(correction.versionId);
  });
});

describe('CON-07: a draft version used in pricing is refused; only signed off prices', () => {
  it('loads no rate record of an unsigned version for pricing, resolves its dates to DATE_OUTSIDE_VERSIONS, and refuses it as a pinned version', async () => {
    const created = await draft('2026-01-01');
    await addRecords(created.versionId, [{ terms: FIXED_97110, quote: QUOTE_97110 }]);
    const planId = await plan('SYNTH-PLAN-DRAFT');
    await mapped(planId, 'contract', '2026-01-01', created.versionId);
    const records = await as(manager, (context) => loadAgreementRecords(context.scope, { practiceId: north.practiceId, requestId: context.requestId, purpose: 'pricing' }));
    expect(records.rateRecords.filter((record) => record.contractVersionId === created.versionId)).toEqual([]);
    expect((await resolveLine({ planId, serviceDate: '2026-04-01' })).outcome).toBe('DATE_OUTSIDE_VERSIONS');
    const loaded = records.versions.find((candidate) => candidate.id === created.versionId);
    expect(loaded?.status).toBe('draft');
    expect(() => {
      assertSignedOff(loaded ?? { status: 'draft' });
    }).toThrow(VersionNotSignedOffError);
  });
});

describe('payer and plan mapping', () => {
  it('MAP-01: an unmapped plan resolves NO_MAPPING on every line, and pricing over it is refused', async () => {
    const signed = await signedContract('2041-01-01');
    const unmapped = await plan('SYNTH-PLAN-UNMAPPED');
    const mappedPlan = await plan('SYNTH-PLAN-MAPPED');
    await mapped(mappedPlan, 'contract', '2041-03-01', signed.versionId);
    for (const serviceDate of ['2041-01-02', '2041-06-01']) {
      expect(await resolveLine({ planId: unmapped, serviceDate })).toEqual({ outcome: 'NO_MAPPING' });
    }
    const mappedLine = { planId: mappedPlan, serviceDate: '2041-06-01' };
    const lines = [{ planId: unmapped, serviceDate: '2041-06-01' }, mappedLine];
    const refused = await errorOf(as(manager, (context) => assertPracticePricingAllowed(context.scope, { practiceId: north.practiceId, requestId: context.requestId, purpose: 'pricing' }, lines)));
    expect(refused).toBeInstanceOf(PricingRefusedError);
    expect(refused).toMatchObject({ unmappedPlanIds: [unmapped] });
    await as(manager, (context) => assertPracticePricingAllowed(context.scope, { practiceId: north.practiceId, requestId: context.requestId, purpose: 'pricing' }, [mappedLine]));
  });

  it('MAP-01: the Coverage query totals the dollars waiting on mappings', async ({ skip }) => {
    skip(!serviceLines, 'the Coverage query reads service_line, which migration 20261016120000 (remittances) adds');
    const unmapped = await plan('SYNTH-PLAN-WAITING');
    const mappedPlan = await plan('SYNTH-PLAN-PARTLY');
    await mapped(mappedPlan, 'no_agreement', '2041-03-01');
    // Lines of the unmapped plan, and of the mapped plan before its mapping or without a date, wait.
    const factory = await RowFactory.load(owner);
    const line = async (planId: string, serviceDate: string | null, charge: bigint, paid: bigint) => {
      const row = await factory.create(owner, 'service_line', north);
      await asOwner(owner, [north.practiceId], () =>
        owner.query('UPDATE service_line SET payer_plan_key = $2, service_date = $3, charge_cents = $4, paid_cents = $5 WHERE id = $1', [row.id, planId, serviceDate, charge.toString(), paid.toString()]),
      );
    };
    await line(unmapped, '2041-06-01', 20_000n, 9000n);
    await line(unmapped, '2041-06-02', 10_000n, 0n);
    await line(mappedPlan, '2041-02-01', 5000n, 4000n);
    await line(mappedPlan, '2041-03-01', 7000n, 7000n);
    await line(mappedPlan, null, 100n, 0n);
    const waiting = await as(manager, (context) => dollarsWaitingOnMapping(context.scope, north.practiceId));
    expect(waiting.filter((entry) => entry.planId === unmapped || entry.planId === mappedPlan)).toEqual([
      { planId: unmapped, payerId: payer, lines: 2, claims: 2, chargeCents: 30_000n, paidCents: 9000n },
      { planId: mappedPlan, payerId: payer, lines: 2, claims: 2, chargeCents: 5100n, paidCents: 4000n },
    ]);
  });

  it('MAP-02: lines before a mapping’s effective date are NO_MAPPING, later ones price', async () => {
    const signed = await signedContract('2042-01-01');
    const planId = await plan('SYNTH-PLAN-LATE');
    await mapped(planId, 'contract', '2042-05-01', signed.versionId);
    expect((await resolveLine({ planId, serviceDate: '2042-04-30' })).outcome).toBe('NO_MAPPING');
    expect((await resolveLine({ planId, serviceDate: '2042-05-01' })).outcome).toBe('CONTRACT_RATE');
  });

  it('MAP-03: a correction is a new mapping that supersedes the old one, which stays exactly as it was', async () => {
    const signed = await signedContract('2043-01-01');
    const planId = await plan('SYNTH-PLAN-CORRECTED');
    const { mappingId: wrong } = await mapped(planId, 'no_agreement', '2043-01-01');
    const before = (await asOwner(owner, [north.practiceId], () => owner.query('SELECT * FROM payer_plan_mapping WHERE id = $1', [wrong]))).rows;
    // An overlapping mapping that does not supersede is refused.
    expect(await errorOf(mapped(planId, 'contract', '2043-02-01', signed.versionId))).toMatchObject({ reason: 'invalid', message: expect.stringMatching(/never overlap/) });
    const { mappingId: right } = await as(manager, (context) =>
      correctMapping(context, { practiceId: north.practiceId, planId, kind: 'contract', contractVersionId: signed.versionId, effectiveFrom: '2043-01-01', supersedesId: wrong }),
    );
    expect((await asOwner(owner, [north.practiceId], () => owner.query('SELECT * FROM payer_plan_mapping WHERE id = $1', [wrong]))).rows).toEqual(before);
    const resolved = await resolveLine({ planId, serviceDate: '2043-02-01' });
    expect(resolved.outcome === 'CONTRACT_RATE' && resolved.mapping.id).toBe(right);
    // Mappings never change: no privilege for the application, and a trigger for everyone else.
    await expect(asApp(manager, "UPDATE payer_plan_mapping SET effective_from = '2043-02-01' WHERE id = $1", [wrong])).rejects.toMatchObject({ code: '42501' });
    await expect(asApp(manager, 'DELETE FROM payer_plan_mapping WHERE id = $1', [wrong])).rejects.toMatchObject({ code: '42501' });
    await expect(asOwner(owner, [north.practiceId], () => owner.query("UPDATE payer_plan_mapping SET effective_from = '2043-02-01' WHERE id = $1", [wrong]))).rejects.toMatchObject({ code: '23514' });
    // A correction corrects a mapping of the same plan; a mapping is recorded in its author's name only.
    const otherPlan = await plan('SYNTH-PLAN-OTHER');
    expect(await errorOf(mapped(otherPlan, 'other', '2043-01-01', null, right))).toMatchObject({ code: '23514' });
    await expect(asApp(manager, "INSERT INTO payer_plan_mapping (practice_id, plan_id, mapping_kind, effective_from, mapped_by) VALUES ($1, $2, 'other', '2050-01-01', $3)", [north.practiceId, otherPlan, viewer])).rejects.toMatchObject({
      code: '42501',
    });
    const mappings = await as(manager, (context) => loadMappings(context.scope, { practiceId: north.practiceId, requestId: context.requestId, purpose: 'mapping' }, [planId]));
    expect(mappings.map((entry) => [entry.id, entry.supersedesId])).toEqual([
      [wrong, null],
      [right, wrong],
    ]);
  });

  it('MAP-04: a plan mapped as no agreement goes to anomaly screening only', async () => {
    const planId = await plan('SYNTH-PLAN-OON');
    await mapped(planId, 'no_agreement', '2026-01-01');
    expect((await resolveLine({ planId, serviceDate: '2026-04-01' })).outcome).toBe('NO_AGREEMENT');
  });

  it('MAP-05: a plan mapped as Medicare Advantage non-contracted prices from the fee schedule with every flag on', async () => {
    const planId = await plan('SYNTH-PLAN-MA');
    await mapped(planId, 'ma_noncontracted', '2026-01-01');
    const resolved = await resolveLine({ planId, serviceDate: '2026-04-01' });
    expect(resolved.outcome).toBe('MA_NONCONTRACTED');
    expect(resolved.outcome === 'MA_NONCONTRACTED' && resolved.terms.flags).toEqual({ apply_mppr: true, apply_assistant_reduction: true, apply_sequestration: true, apply_ncci: true, timed_units_rule: 'MEDICARE_POOLED' });
  });

  it('maps only as someone who maps plans, and names a version exactly for a contract mapping', async () => {
    const planId = await plan('SYNTH-PLAN-ROLES');
    for (const person of [viewer, north.adminUserId, specialist]) {
      expect(await errorOf(as(person, (context) => mapPlan(context, { practiceId: north.practiceId, planId, kind: 'other', effectiveFrom: '2026-01-01' })))).toBeInstanceOf(PermissionDeniedError);
    }
    expect(await errorOf(mapped(planId, 'contract', '2026-01-01'))).toMatchObject({ reason: 'invalid' });
    expect(await errorOf(mapped(planId, 'other', '2026-01-01', randomUUID()))).toMatchObject({ reason: 'invalid' });
    expect(await errorOf(mapped(planId, 'contract', '2026-01-01', randomUUID()))).toMatchObject({ code: '23514' });
  });
});
