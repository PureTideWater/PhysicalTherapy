import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RATE_RECORD_FIELDS, createContract, createDraftVersion } from '@tp/contracts';
import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createOrganization, createUser } from '@tp/db/testing';
import { LocalDeterministicProvider, type ModelProvider, type ModelPurpose, type ModelRequest, type ModelResponse, PROMPTS, type PurposeInputs, modelFor, requestFor, setFeatureFlag } from '@tp/model-gateway';
import { createLogger } from '@tp/observability';
import { dollars, draftNarrative } from '@tp/packets';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { packetDraftInputs } from '@tp/worker/packets';
import type { Practice } from '@tp/worker/testing';
import { TriageWorld } from '@tp/worker/testing/triage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import { evidenceFor } from '../contracts/evidence';
import type { CookieJar, MutationResult, Outcome, Route } from '../http/route';
import { coverageGaps } from '../models/evidence-checklist';
import { assignModelPath } from '../models/path';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { abstractionVersionPage, addRateRecordAction, approveFieldAction, approveVersionAction, askQuestionAction } from './abstraction';
import { coveragePage } from './coverage';
import { draftNarrativeAction, proposeTermsAction, rejectProposalAction, reviewEvidenceAction, suggestEvidenceAction } from './models';
import { approvePacketVersionAction, packetPage, requestApprovalAction, writeVersionAction } from './packets';
import { CONTRACT_PAGES, storeContractDocument } from './test-support/contract-world';
import { csrfTokenFor } from '../http/csrf';

/**
 * The model features on their screens, through the routes against PostgreSQL (PRD 14; PRD 5, J5 in v1
 * and J9; test matrix MOD-01 to MOD-06; docs/adr/0052), with the local deterministic provider: each
 * output is registered under the request the gateway sends, so a test also proves what was sent.
 *
 * - The contract specialist's proposal: candidates whose every field checks against its page become
 *   model rate records, still approved field by field; a held one is entered by hand; the version's
 *   approval records the decision on the call and, under a data-rights agreement, the correction as an
 *   evaluation example; a discarded proposal removes its unverified records.
 * - The packet narrative: the model's narrative is written as a version and verified as any; the
 *   approval rules do not change; sending it for approval records the decision.
 * - The coverage checklist: items that name no gap are left out; the person keeps or dismisses them.
 * - The kill switch and the budget: nothing is sent, the screens say why, and hand entry works.
 *
 * Synthetic data only.
 */

let w: TriageWorld;
let services: Services;
const logs: Record<string, unknown>[] = [];
const provider = new LocalDeterministicProvider();
const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-model-routes-'));
const documents = new DocumentStore(new LocalSealedBytes(documentsDir));
let internal = '';
let platformAdmin = '';
const internalUsers = new Set<string>();

const CAS08 = 'CAS-08/remit.835';
const CAS08_FAILING = readFileSync(fileURLToPath(new URL('../../../../../fixtures/synthetic/CAS-08/narrative-draft.txt', import.meta.url)), 'utf8').trim();
/** The CAS-08 fixture's identifiers, which no request may carry. */
const KNOWN = ['SYNPCNCAS08001', 'SYNCCNCAS080001', 'SYNCCNCAS080002', 'SYNCCNCAS080003'];
const FIXED = { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 } as const;
const Q97110 = '97110 Therapeutic exercise $32.00 per unit';
const Q97140 = '97140 Manual therapy $30.50 per unit';

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
    token = (await openSession(w.app, { userId, method: internalUsers.has(userId) ? 'webauthn' : 'totp', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
    tokens.set(userId, token);
  }
  return token;
}

async function call<R>(route: Route<R>, userId: string, params: Record<string, unknown>, input?: Record<string, unknown>, requestKey: string = randomUUID()): Promise<Outcome<R>> {
  return route.invoke({ cookies: new Jar(await sessionOf(userId)), params, input: route.mutation ? { csrfToken: csrfTokenFor(services.sealer, await sessionOf(userId)), requestKey, ...input } : input, requestId: `test-${randomUUID()}`, userAgent: null }, services);
}

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

const redirectOf = (outcome: Outcome<MutationResult>) => ok(outcome).redirect ?? '';

function refused(outcome: Outcome<unknown>): string {
  if (outcome.status !== 'invalid') {
    throw new Error(`expected a refusal, got ${JSON.stringify(outcome)}`);
  }
  return outcome.issues.map((issue) => issue.message).join('; ');
}

/** Registers the model's answer to the request the gateway will send for this input. */
function answer<K extends ModelPurpose>(purpose: K, input: PurposeInputs[K], output: unknown): void {
  provider.register(requestFor(purpose, input), output);
}

async function rows<T>(practiceId: string, sql: string, values: unknown[] = []): Promise<T[]> {
  return asOwner(w.owner, [practiceId], async () => (await w.owner.query<T & Record<string, unknown>>(sql, values)).rows);
}

beforeAll(async () => {
  w = await TriageWorld.open(readDatabaseUrl());
  const sealer = new Sealer(randomBytes(32));
  services = createServices({
    origin: 'http://localhost:3100',
    pool: w.app,
    provider: new DevAuthProvider({
      store: new MemoryDevStore(),
      sealer: sealer.derive('dev-provider'),
      webauthn: { rpId: 'localhost', rpName: 'Test', origin: 'http://localhost:3100' },
      deliverInvitation: () => Promise.resolve(),
      scryptCost: { n: 1024, r: 8, p: 1 },
    }),
    keys: w.keys,
    sealer,
    logger: createLogger({ sink: (line) => logs.push(JSON.parse(line) as Record<string, unknown>) }),
    queue: new MemoryQueue(),
    documents,
  });
  assignModelPath(services, { kind: 'available', production: false, provider: () => provider });
  internal = await createOrganization(w.owner, 'internal', 'models internal');
  platformAdmin = await createUser(w.owner, { hardwareKeyRequired: true });
  await addMembership(w.owner, internal, platformAdmin, 'platform_admin');
  internalUsers.add(platformAdmin);
}, 120_000);

afterAll(async () => {
  await w.close();
  rmSync(documentsDir, { recursive: true, force: true });
});

async function person(target: Practice, role: 'billing_manager' | 'analyst' | 'viewer'): Promise<string> {
  const id = await createUser(w.owner);
  await addMembership(w.owner, target.world.organizationId, id, role);
  return id;
}

/** A contract specialist reaching the practice under a support grant. */
async function specialistOf(target: Practice): Promise<string> {
  const id = await createUser(w.owner, { hardwareKeyRequired: true });
  await addMembership(w.owner, internal, id, 'contract_specialist');
  internalUsers.add(id);
  await asOwner(w.owner, [target.practiceId], () =>
    w.owner.query("INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'SYN-MOD', 'SYNTHETIC ABSTRACTION', now() + interval '4 hours')", [target.practiceId, id]),
  );
  return id;
}

interface DraftContract {
  readonly practice: Practice;
  readonly specialist: string;
  readonly documentId: string;
  readonly contractId: string;
  readonly versionId: string;
}

/** A SYNTHETIC payer letter naming two invented patients: PHI-shaped text that must never reach a contract proposal. */
const SYNTHETIC_PAYER_LETTER: readonly (readonly string[])[] = [
  [
    'SYNTHETIC PAYER Q - NOTICE OF ADJUSTMENT',
    'RE: SYNTHETIC PATIENT QUILLAN VORTA, DOB 01/02/1960, MEMBER ID SYNLETTERMEMBER01',
    'RE: SYNTHETIC PATIENT ZEPHYRA MOLT, DOB 03/04/1970, MEMBER ID SYNLETTERMEMBER02',
    'Effective March 1, 2026, CPT 97110 is paid at $32.00 per unit.',
  ],
];

/** A practice (its CAS-08 remittance loaded, for its payer) with a draft version naming a stored SYNTHETIC contract whose pages intake read, and any further documents given. */
async function draftContract(label: string, extra: readonly { readonly pages: readonly (readonly string[])[]; readonly kind: 'exhibit' | 'payer_letter' }[] = []): Promise<DraftContract & { readonly extraIds: readonly string[] }> {
  const practice = await w.practice(label);
  await w.load(practice, CAS08);
  const specialist = await specialistOf(practice);
  const payerId = await w.pricing.payerOf(practice);
  const options = { owner: w.owner, app: w.app, documents, cipher: practice.cipher, practiceId: practice.practiceId, payerId, customerId: practice.manager, specialistId: specialist };
  const documentId = await storeContractDocument(options);
  const extraIds: string[] = [];
  for (const document of extra) {
    extraIds.push(await storeContractDocument(options, document.pages, document.kind));
  }
  const { contractId, versionId } = await withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, async (scope) => {
    const context = { scope, requestId: `test-${randomUUID()}` };
    const contract = await createContract(context, { practiceId: practice.practiceId, payerId, title: `SYNTHETIC ${label} AGREEMENT` });
    const version = await createDraftVersion(context, { practiceId: practice.practiceId, contractId: contract.contractId, effectiveFrom: '2026-01-01', effectiveTo: null, sourceDocumentIds: [documentId, ...extraIds] });
    return { contractId: contract.contractId, versionId: version.versionId };
  });
  return { practice, specialist, documentId, contractId, versionId, extraIds };
}

/** Stands in for Bedrock in one test: not a model and not the SDK; it records each request and answers with a fixed output. */
class RecordingStandIn implements ModelProvider {
  readonly kind = 'bedrock' as const;
  readonly requests: ModelRequest[] = [];
  constructor(private readonly output: unknown) {}
  complete(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    return Promise.resolve({ text: JSON.stringify(this.output), tokensIn: 1000, tokensOut: 200, stopReason: 'end' });
  }
}

/** What the gateway is given for the document: its pages as intake stored them. */
async function pagesInput(draft: DraftContract): Promise<PurposeInputs['proposeContractTerms']> {
  const { practiceId } = draft.practice;
  return withPracticeScope(w.app, { actorId: draft.specialist, practiceIds: [practiceId] }, async (scope) => {
    const pages = await evidenceFor(scope, documents, draft.practice.cipher, practiceId, 'test').pages(draft.documentId);
    if (!pages.ok) {
      throw new Error('the synthetic contract has no pages');
    }
    const [document] = (await scope.client.query<{ sha256: string }>('SELECT sha256 FROM source_document WHERE id = $1', [draft.documentId])).rows;
    return { documentId: draft.documentId, documentSha256: document?.sha256 ?? '', kind: 'contract', pages: pages.pages };
  });
}

const fixed = (code: string, quote: string, amount: string, amountQuote = quote) => ({
  label: `SYNTHETIC ${code}`,
  method: { value: 'FIXED_SCHEDULE', page: 2, quote },
  codes: { written: [code], page: 2, quote },
  modifiers: null,
  places_of_service: null,
  amount: { written: amount, page: 2, quote: amountQuote },
  percentage: null,
  fee_schedule_year: null,
  lesser_of_schedule: null,
  flags: null,
  rounding: null,
  effective_from: null,
  effective_to: null,
});

async function approveEveryField(draft: DraftContract, rateRecordId: string): Promise<void> {
  for (const field of RATE_RECORD_FIELDS) {
    ok(await call(approveFieldAction, draft.specialist, { practiceId: draft.practice.practiceId }, { rateRecordId, versionId: draft.versionId, field }));
  }
}

async function enter97140(draft: DraftContract): Promise<string> {
  const redirect = redirectOf(
    await call(addRateRecordAction, draft.specialist, { practiceId: draft.practice.practiceId }, { versionId: draft.versionId, method: 'FIXED_SCHEDULE', codes: '97140', amount: '30.50', timedUnitsRule: 'UNKNOWN', documentId: draft.documentId, page: '2', quote: Q97140 }),
  );
  return /record=([0-9a-f-]{36})/.exec(redirect)?.[1] ?? '';
}

async function callOf(practiceId: string, modelCallId: string) {
  const [row] = await rows<{ purpose: string; outcome: string; verifier_passed: boolean | null; reviewer_decision: string | null; reviewer_changed_fields: string[] | null; actor_id: string | null }>(
    practiceId,
    'SELECT purpose, outcome, verifier_passed, reviewer_decision, reviewer_changed_fields, actor_id FROM model_call WHERE id = $1',
    [modelCallId],
  );
  return row;
}

describe('the specialist’s proposal of a draft version’s terms (MOD-01, MOD-02)', () => {
  it('proposes the candidates that check against their pages, holds the one that does not, and records the decision and the correction when the version is approved', async () => {
    const draft = await draftContract('MODELS PROPOSE');
    const { practiceId } = draft.practice;
    const P = { practiceId };
    const agreementId = randomUUID();
    await asOwner(w.owner, [practiceId], () =>
      w.owner.query(
        `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256) VALUES ($1, $2, $3, 'data_rights', '1', now() - interval '1 day', 'SYNTHETIC SIGNER', 'esign:synthetic-data-rights', $4)`,
        [agreementId, draft.practice.world.organizationId, practiceId, randomBytes(32).toString('hex')],
      ),
    );
    // 97110 checks on page 2; 97140's amount cites words page 2 does not hold.
    answer('proposeContractTerms', await pagesInput(draft), { candidates: [fixed('97110', Q97110, '$32.00'), fixed('97140', Q97140, '$30.50', '97140 Manual therapy $31.50 per unit')] });

    const before = ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId }));
    expect([before.canPropose, before.proposals, before.modelNotice]).toEqual([true, [], null]);
    // Only the contract specialist proposes; the practice's people do not reach the abstraction screens.
    expect((await call(proposeTermsAction, draft.practice.manager, P, { versionId: draft.versionId, documentId: draft.documentId })).status).toBe('forbidden');
    expect(redirectOf(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: draft.documentId }))).toBe(`/p/${practiceId}/abstraction/versions/${draft.versionId}?model=proposed`);

    const page = ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId, model: 'proposed' }));
    expect(page.modelNotice).toBe('proposed');
    expect(page.review.version.status).toBe('proposed');
    const [proposal] = page.proposals;
    expect(page.proposals).toHaveLength(1);
    expect(proposal?.passed).toBe(false);
    expect(proposal?.decision).toBeNull();
    const [first, second] = proposal?.candidates ?? [];
    expect(first?.rateRecordId).not.toBeNull();
    expect(first?.fields.every((field) => field.verified)).toBe(true);
    expect(second).toMatchObject({ rateRecordId: null, problems: ['fields_rejected'] });
    expect(second?.fields.find((field) => field.field === 'amount')).toMatchObject({ verified: false, problems: ['quote_not_on_page', 'not_in_quote'] });
    // The proposed record is the model's, cites its page, and is not verified until the specialist approves each field.
    expect(page.review.records.map((record) => [record.id, record.proposedBy, record.verifiedBy, record.citation?.page, record.citation?.quote])).toEqual([[first?.rateRecordId, 'model', null, 2, Q97110]]);
    const call0 = await callOf(practiceId, proposal?.modelCallId ?? '');
    expect(call0).toMatchObject({ purpose: 'proposeContractTerms', outcome: 'completed', verifier_passed: false, reviewer_decision: null, actor_id: draft.specialist });
    // A version proposed once is not proposed again.
    expect(refused(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: draft.documentId }))).toMatch(/draft version, once/);

    // The specialist approves the proposed record field by field, enters the held one by hand, and approves the version.
    expect(refused(await call(approveVersionAction, draft.specialist, P, { versionId: draft.versionId }))).toMatch(/verified/);
    await approveEveryField(draft, first?.rateRecordId ?? '');
    const hand = await enter97140(draft);
    await approveEveryField(draft, hand);
    ok(await call(approveVersionAction, draft.specialist, P, { versionId: draft.versionId }));

    const after = ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId }));
    expect(after.review.version.status).toBe('approved');
    expect(after.proposals[0]?.decision).toEqual({ decision: 'accepted_with_changes', changedFields: ['candidates[1].amount'] });
    expect(await callOf(practiceId, proposal?.modelCallId ?? '')).toMatchObject({ reviewer_decision: 'accepted_with_changes', reviewer_changed_fields: ['candidates[1].amount'] });
    // The correction is an evaluation example under the practice's data-rights agreement, with the final records as its expectation.
    const examples = await rows<{ id: string; source: string; purpose: string; permission_ref: string; input_ref: string; expected: { format: string; changed_fields: string[]; records: { scope: { codes: string[] } }[] } }>(
      practiceId,
      'SELECT id, source, purpose, permission_ref, input_ref, expected FROM eval_example WHERE practice_id = $1',
      [practiceId],
    );
    expect(examples.map((example) => [example.source, example.purpose, example.permission_ref, example.input_ref])).toEqual([['permitted', 'proposeContractTerms', agreementId, `model_call:${proposal?.modelCallId ?? ''}`]]);
    expect(examples[0]?.expected).toMatchObject({ format: 'tp-eval-correction/1', changed_fields: ['candidates[1].amount'] });
    expect(examples[0]?.expected.records.map((record) => record.scope.codes).sort()).toEqual([['97110'], ['97140']]);
    expect(await rows(practiceId, 'SELECT 1 FROM model_proposal WHERE practice_id = $1 AND eval_example_id = $2', [practiceId, examples[0]?.id])).toHaveLength(1);
    // The specialist reads the agreement's ID through the function, for a practice in the request's scope only, and never the agreement.
    const agreementOf = (practiceIds: string[]) =>
      withPracticeScope(w.app, { actorId: draft.specialist, practiceIds }, async (scope) => ({
        id: (await scope.client.query<{ id: string | null }>('SELECT practice_data_rights_agreement($1) AS id', [practiceId])).rows[0]?.id,
        rows: (await scope.client.query('SELECT 1 FROM agreement WHERE id = $1', [agreementId])).rowCount,
      }));
    expect(await agreementOf([practiceId])).toEqual({ id: agreementId, rows: 0 });
    expect(await agreementOf([])).toEqual({ id: null, rows: 0 });
    // The model never approved anything: every field approval is the specialist's.
    const approvals = await rows<{ by: string; verified_by: string }>(
      practiceId,
      "SELECT DISTINCT f.value ->> 'by' AS by, r.verified_by FROM rate_record r, jsonb_each(r.evidence -> 'approved_fields') f WHERE r.contract_version_id = $1",
      [draft.versionId],
    );
    expect(approvals).toEqual([{ by: draft.specialist, verified_by: draft.specialist }]);
  });

  it('accepts a proposal approved as proposed, keeps no example of it, and discards another whose records go with it; without a data-rights agreement nothing becomes an example', async () => {
    const draft = await draftContract('MODELS REJECT');
    const { practiceId } = draft.practice;
    const P = { practiceId };
    const input = await pagesInput(draft);
    answer('proposeContractTerms', input, { candidates: [fixed('97110', Q97110, '$32.00')] });
    ok(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: draft.documentId }));
    const [proposal] = ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId })).proposals;
    const recordId = proposal?.candidates[0]?.rateRecordId ?? '';
    expect(proposal?.passed).toBe(true);

    // Another practice's specialist cannot reach it, and this practice's path does not name another's proposal.
    const other = await draftContract('MODELS REJECT OTHER');
    expect((await call(rejectProposalAction, other.specialist, P, { versionId: draft.versionId, proposalId: proposal?.id })).status).toBe('not_found');
    expect((await call(rejectProposalAction, other.specialist, { practiceId: other.practice.practiceId }, { versionId: other.versionId, proposalId: proposal?.id })).status).toBe('not_found');

    expect(redirectOf(await call(rejectProposalAction, draft.specialist, P, { versionId: draft.versionId, proposalId: proposal?.id }))).toBe(`/p/${practiceId}/abstraction/versions/${draft.versionId}?model=rejected`);
    expect(redirectOf(await call(rejectProposalAction, draft.specialist, P, { versionId: draft.versionId, proposalId: proposal?.id }))).toBe(`/p/${practiceId}/abstraction/versions/${draft.versionId}?model=reviewed_already`);
    const page = ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId }));
    expect(page.review.records).toEqual([]);
    expect(page.proposals[0]?.decision).toEqual({ decision: 'rejected', changedFields: [] });
    expect(await rows(practiceId, 'SELECT 1 FROM rate_record WHERE id = $1', [recordId])).toEqual([]);

    // By hand, then approved: the rejected proposal stays rejected, and no example is kept without the agreement.
    const hand = await enter97140(draft);
    await approveEveryField(draft, hand);
    ok(await call(approveVersionAction, draft.specialist, P, { versionId: draft.versionId }));
    expect(await callOf(practiceId, proposal?.modelCallId ?? '')).toMatchObject({ reviewer_decision: 'rejected', reviewer_changed_fields: [] });
    expect(await rows(practiceId, 'SELECT 1 FROM eval_example WHERE practice_id = $1', [practiceId])).toEqual([]);

    // A proposal approved as the model proposed it is accepted.
    const accepted = await draftContract('MODELS ACCEPT');
    answer('proposeContractTerms', await pagesInput(accepted), { candidates: [fixed('97110', Q97110, '$32.00')] });
    ok(await call(proposeTermsAction, accepted.specialist, { practiceId: accepted.practice.practiceId }, { versionId: accepted.versionId, documentId: accepted.documentId }));
    const [made] = ok(await call(abstractionVersionPage, accepted.specialist, { practiceId: accepted.practice.practiceId, versionId: accepted.versionId })).proposals;
    await approveEveryField(accepted, made?.candidates[0]?.rateRecordId ?? '');
    ok(await call(approveVersionAction, accepted.specialist, { practiceId: accepted.practice.practiceId }, { versionId: accepted.versionId }));
    expect(await callOf(accepted.practice.practiceId, made?.modelCallId ?? '')).toMatchObject({ reviewer_decision: 'accepted', reviewer_changed_fields: [] });
  });
});

describe('what a contract proposal reads (PRD 14, PHI minimization; Provider and data path)', () => {
  it('refuses a payer letter the version names before anything is sent or logged: a letter is PHI, read only through readDenialLetter', async () => {
    const draft = await draftContract('MODELS LETTER', [{ pages: SYNTHETIC_PAYER_LETTER, kind: 'payer_letter' }]);
    const { practiceId } = draft.practice;
    const P = { practiceId };
    const [letterId] = draft.extraIds;
    const sentBefore = provider.requests.length;
    // The database lets a version name the letter beside its contract; the model never reads it.
    const page = ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId }));
    expect(page.review.documents.map((document) => document.kind).sort()).toEqual(['contract', 'payer_letter']);
    expect(refused(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: letterId }))).toMatch(/contract or an exhibit only/);
    expect(provider.requests.length).toBe(sentBefore);
    expect(provider.requests.some((request) => request.user.includes('SYNLETTERMEMBER'))).toBe(false);
    expect(await rows(practiceId, 'SELECT 1 FROM model_call WHERE practice_id = $1', [practiceId])).toEqual([]);
    expect(await rows(practiceId, 'SELECT 1 FROM model_proposal WHERE practice_id = $1', [practiceId])).toEqual([]);
    expect(ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId })).review.version.status).toBe('draft');
  });

  it('sends a contract the specialist marks ambiguous to the larger model the prompt pins, logs that model, and shows which read it', async () => {
    const draft = await draftContract('MODELS AMBIGUOUS');
    const { practiceId } = draft.practice;
    const P = { practiceId };
    const standIn = new RecordingStandIn({ candidates: [fixed('97110', Q97110, '$32.00')] });
    // Only a production model path sends a practice's material to a provider other than the local one.
    assignModelPath(services, { kind: 'available', production: true, provider: () => standIn });
    try {
      ok(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: draft.documentId, ambiguous: 'on' }));
    } finally {
      assignModelPath(services, { kind: 'available', production: false, provider: () => provider });
    }
    const larger = modelFor(PROMPTS.proposeContractTerms, 'bedrock', 'ambiguous');
    expect(larger).not.toBe(modelFor(PROMPTS.proposeContractTerms, 'bedrock'));
    expect(standIn.requests.map((request) => request.modelId)).toEqual([larger]);
    const [proposal] = ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId })).proposals;
    expect(proposal).toMatchObject({ ambiguous: true, modelId: larger, passed: true });
    expect(await rows(practiceId, 'SELECT provider, model_id FROM model_call WHERE id = $1', [proposal?.modelCallId])).toEqual([{ provider: 'bedrock', model_id: larger }]);

    // Unmarked, the default model reads it.
    const plain = await draftContract('MODELS NOT AMBIGUOUS');
    answer('proposeContractTerms', await pagesInput(plain), { candidates: [fixed('97110', Q97110, '$32.00')] });
    ok(await call(proposeTermsAction, plain.specialist, { practiceId: plain.practice.practiceId }, { versionId: plain.versionId, documentId: plain.documentId }));
    const [unmarked] = ok(await call(abstractionVersionPage, plain.specialist, { practiceId: plain.practice.practiceId, versionId: plain.versionId })).proposals;
    expect(unmarked).toMatchObject({ ambiguous: false, modelId: modelFor(PROMPTS.proposeContractTerms, 'local') });
  });
});

describe('the packet builder’s narrative draft (MOD-03)', () => {
  it('writes the model’s narrative as a verified version in the drafter’s name, sends no identifier, and keeps the approval rules', async () => {
    const practice = await w.practice('MODELS NARRATIVE', { case_materiality_cents: '1000' });
    // Two billing managers: one drafts, the other approves (CAS-09, CAS-10).
    const drafter = await person(practice, 'billing_manager');
    await w.load(practice, CAS08);
    const contract = await w.fixedContract(practice, FIXED);
    const runId = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: contract.versionId }], from: '2026-03-01', to: '2026-03-31' });
    expect(await w.triage(practice, runId)).toMatchObject({ outcome: 'triaged', summary: { casesOpened: 1 } });
    const [found] = await rows<{ id: string }>(practice.practiceId, 'SELECT id FROM "case" WHERE practice_id = $1', [practice.practiceId]);
    const caseId = found?.id ?? '';
    const P = { practiceId: practice.practiceId };
    const inputs = () =>
      withPracticeScope(w.app, { actorId: drafter, practiceIds: [practice.practiceId] }, (scope) =>
        packetDraftInputs(scope, w.keys, { practiceId: practice.practiceId, caseId, promptPayState: null, attachedDocumentIds: [], requestId: 'test' }),
      );
    const draft = await inputs();
    const written = draftNarrative(draft.content);
    answer('draftPacketNarrative', draft, { paragraphs: written.split('\n\n') });

    expect(ok(await call(packetPage, drafter, { ...P, caseId })).canDraftWithModel).toBe(true);
    // A viewer neither drafts nor is offered the model.
    const viewer = await person(practice, 'viewer');
    expect((await call(draftNarrativeAction, viewer, P, { caseId, attachments: [] })).status).toBe('forbidden');
    const drafted = ok(await call(draftNarrativeAction, drafter, P, { caseId, basedOnVersionId: '' }));
    expect(drafted.redirect).toBe(`/p/${practice.practiceId}/cases/${caseId}/packet?model=drafted`);
    const builder = ok(await call(packetPage, drafter, { ...P, caseId, model: 'drafted' }));
    expect(builder.modelNotice).toBe('drafted');
    const version = builder.builder.version;
    expect(version).toMatchObject({ versionNo: 1, narrative: written, verifier: { passed: true } });
    expect(builder.drafts).toEqual([{ versionId: version?.id, passed: true, decision: null }]);
    expect(drafted.objectId).toBe(version?.id);
    // What was sent: pattern-level facts, no identifier of the case.
    const sent = provider.requests.filter((request) => request.promptVersion.startsWith('draft-packet-narrative/'));
    expect(sent.length).toBeGreaterThan(0);
    for (const request of sent) {
      for (const identifier of KNOWN) {
        expect(request.user).not.toContain(identifier);
      }
    }
    const [written1] = await rows<{ drafted_by: string }>(practice.practiceId, 'SELECT drafted_by FROM packet_version WHERE id = $1', [version?.id]);
    expect(written1?.drafted_by).toBe(drafter);

    // The drafter sends it for approval: the model's narrative stood word for word.
    ok(await call(requestApprovalAction, drafter, P, { caseId, versionId: version?.id, message: '' }));
    const [proposal] = await rows<{ model_call_id: string; reviewed_at: Date | null }>(practice.practiceId, "SELECT model_call_id, reviewed_at FROM model_proposal WHERE packet_version_id = $1 AND purpose = 'draftPacketNarrative'", [version?.id]);
    expect(proposal?.reviewed_at).not.toBeNull();
    expect(await callOf(practice.practiceId, proposal?.model_call_id ?? '')).toMatchObject({ purpose: 'draftPacketNarrative', reviewer_decision: 'accepted', reviewer_changed_fields: [], actor_id: drafter });
    // The approval rules do not change: the drafter cannot approve it; a second person does.
    const sha = version?.contentSha256 ?? '';
    expect(refused(await call(approvePacketVersionAction, drafter, P, { caseId, versionId: version?.id, versionSha256: sha }))).toMatch(/cannot approve it/);
    ok(await call(approvePacketVersionAction, practice.manager, P, { caseId, versionId: version?.id, versionSha256: sha }));

    // A narrative with a figure in no input record is stored as the version it is and cannot be approved; the version sent instead records the change.
    const next = await inputs();
    answer('draftPacketNarrative', next, { paragraphs: CAS08_FAILING.split('\n\n') });
    ok(await call(draftNarrativeAction, drafter, P, { caseId, basedOnVersionId: version?.id }));
    const failing = ok(await call(packetPage, drafter, { ...P, caseId })).builder.version;
    expect(failing).toMatchObject({ versionNo: 2, verifier: { passed: false } });
    expect(ok(await call(packetPage, drafter, { ...P, caseId })).drafts.map((entry) => [entry.versionId, entry.passed])).toEqual([
      [version?.id, true],
      [failing?.id, false],
    ]);
    ok(await call(writeVersionAction, drafter, P, { caseId, basedOnVersionId: failing?.id, useDraft: 'on' }));
    const third = ok(await call(packetPage, drafter, { ...P, caseId })).builder.version;
    expect(third).toMatchObject({ versionNo: 3, verifier: { passed: true } });
    ok(await call(requestApprovalAction, drafter, P, { caseId, versionId: third?.id, message: '' }));
    const [second] = await rows<{ model_call_id: string }>(practice.practiceId, "SELECT model_call_id FROM model_proposal WHERE packet_version_id = $1 AND purpose = 'draftPacketNarrative'", [failing?.id]);
    expect(await callOf(practice.practiceId, second?.model_call_id ?? '')).toMatchObject({ reviewer_decision: 'accepted_with_changes', reviewer_changed_fields: ['narrative'] });
    // No narrative becomes an evaluation example.
    expect(await rows(practice.practiceId, 'SELECT 1 FROM eval_example WHERE practice_id = $1', [practice.practiceId])).toEqual([]);

    // A narrative that swaps what the contract requires and what the remittances show passes the packets verifier but
    // states the dispute backwards: the gateway's role check fails it, and no version is written from it.
    const swappedInputs = await inputs();
    const { pattern } = swappedInputs.content;
    const [expectedText, observedText] = [dollars(pattern.expected_cents), dollars(pattern.observed_cents)];
    const swapped = draftNarrative(swappedInputs.content).replaceAll(expectedText, '\u0000').replaceAll(observedText, expectedText).replaceAll('\u0000', observedText);
    expect(swapped).not.toBe(draftNarrative(swappedInputs.content));
    answer('draftPacketNarrative', swappedInputs, { paragraphs: [swapped] });
    expect(redirectOf(await call(draftNarrativeAction, drafter, P, { caseId, basedOnVersionId: third?.id }))).toBe(`/p/${practice.practiceId}/cases/${caseId}/packet?model=misstated`);
    expect(ok(await call(packetPage, drafter, { ...P, caseId })).builder.version).toMatchObject({ id: third?.id, versionNo: 3 });
    const [misstated] = await rows<{ verifier_passed: boolean; n: string }>(
      practice.practiceId,
      "SELECT verifier_passed, (SELECT count(*) FROM model_proposal p WHERE p.model_call_id = c.id)::text AS n FROM model_call c WHERE c.practice_id = $1 AND c.purpose = 'draftPacketNarrative' ORDER BY c.created_at DESC LIMIT 1",
      [practice.practiceId],
    );
    expect(misstated).toEqual({ verifier_passed: false, n: '0' });

    // The budget: a practice that has spent it today is refused before anything is sent, and the screen says so (MOD-05).
    await setFeatureFlag(w.app, platformAdmin, { key: 'model.daily_budget_cents', scope: 'practice', scopeId: practice.practiceId, value: '0' });
    const sentBefore = provider.requests.length;
    logs.length = 0;
    expect(redirectOf(await call(draftNarrativeAction, drafter, P, { caseId, basedOnVersionId: third?.id }))).toBe(`/p/${practice.practiceId}/cases/${caseId}/packet?model=budget`);
    expect(provider.requests.length).toBe(sentBefore);
    expect(logs.filter((entry) => entry.error_code === 'MODEL_BUDGET_EXCEEDED').map((entry) => entry.practice_id)).toEqual([practice.practiceId]);

    // The kill switch: the screen offers no model, the step sends nothing, and the narrative is written by hand (MOD-06).
    await setFeatureFlag(w.app, platformAdmin, { key: 'model.kill_switch', scope: 'practice', scopeId: practice.practiceId, value: true });
    expect(ok(await call(packetPage, drafter, { ...P, caseId })).canDraftWithModel).toBe(false);
    expect(redirectOf(await call(draftNarrativeAction, drafter, P, { caseId, basedOnVersionId: third?.id }))).toBe(`/p/${practice.practiceId}/cases/${caseId}/packet?model=off`);
    expect(provider.requests.length).toBe(sentBefore);
    const byHand = `${third?.narrative ?? ''} This version was written by hand [1].`;
    ok(await call(writeVersionAction, drafter, P, { caseId, basedOnVersionId: third?.id, narrative: byHand }));
    expect(ok(await call(packetPage, drafter, { ...P, caseId })).builder.version).toMatchObject({ versionNo: 4, narrative: byHand, verifier: { passed: true } });
  });
});

describe('the coverage screen’s evidence checklist (MOD-04)', () => {
  it('suggests what to obtain for the gaps, leaves out what names none, and keeps what the person keeps', async () => {
    const draft = await draftContract('MODELS COVERAGE');
    const { practiceId } = draft.practice;
    const P = { practiceId };
    const caseWorker = draft.practice.manager;
    // No gap yet: nothing to ask the model about.
    expect(redirectOf(await call(suggestEvidenceAction, caseWorker, P, {}))).toBe(`/p/${practiceId}/coverage?model=no_gaps`);
    ok(await call(askQuestionAction, draft.specialist, P, { contractId: draft.contractId, versionId: draft.versionId, topic: 'missing_schedule', question: 'SYNTHETIC QUESTION: please send exhibit B' }));
    const gaps = await withPracticeScope(w.app, { actorId: caseWorker, practiceIds: [practiceId] }, (scope) => coverageGaps(scope, practiceId, 'test'));
    expect(gaps).toEqual([{ reason: 'contract_missing_schedule', count: 1, payer: null, codes: [] }]);
    const items = [
      { reason: 'contract_missing_schedule', document: 'SYNTHETIC: exhibit B, the fee schedule', why: 'SYNTHETIC: the specialist cannot abstract the rates without it.' },
      { reason: 'contract_missing_schedule', document: 'SYNTHETIC: the signature page', why: 'SYNTHETIC: to confirm the dates.' },
      { reason: 'NO_MAPPING', document: 'SYNTHETIC: a plan list', why: 'SYNTHETIC: a reason the gaps did not name.' },
    ];
    answer('suggestEvidenceRequests', { gaps }, { items });
    const viewer = await person(draft.practice, 'viewer');
    expect((await call(suggestEvidenceAction, viewer, P, {})).status).toBe('forbidden');
    expect(ok(await call(coveragePage, viewer, P)).canSuggest).toBe(false);
    expect(ok(await call(coveragePage, caseWorker, P)).canSuggest).toBe(true);
    const suggested = ok(await call(suggestEvidenceAction, caseWorker, P, {}));
    expect(suggested.redirect).toBe(`/p/${practiceId}/coverage?model=suggested`);
    const shown = ok(await call(coveragePage, caseWorker, { ...P, model: 'suggested' }));
    expect(shown.modelNotice).toBe('suggested');
    expect(shown.checklist).toMatchObject({ id: suggested.objectId, rejected: 1, decision: null });
    expect(shown.checklist?.items.map((item) => [item.document, item.kept])).toEqual([
      [items[0]?.document, true],
      [items[1]?.document, true],
    ]);

    // The person keeps the first item.
    expect(redirectOf(await call(reviewEvidenceAction, caseWorker, P, { proposalId: suggested.objectId, 'keep:0': 'on' }))).toBe(`/p/${practiceId}/coverage?model=kept`);
    expect(redirectOf(await call(reviewEvidenceAction, caseWorker, P, { proposalId: suggested.objectId, 'keep:0': 'on' }))).toBe(`/p/${practiceId}/coverage?model=reviewed_already`);
    const kept = ok(await call(coveragePage, viewer, P)).checklist;
    expect(kept).toMatchObject({ decision: 'accepted_with_changes' });
    expect(kept?.items.map((item) => item.kept)).toEqual([true, false]);
    const [first] = await rows<{ model_call_id: string }>(practiceId, 'SELECT model_call_id FROM model_proposal WHERE id = $1', [suggested.objectId]);
    expect(await callOf(practiceId, first?.model_call_id ?? '')).toMatchObject({ purpose: 'suggestEvidenceRequests', reviewer_decision: 'accepted_with_changes', reviewer_changed_fields: ['items[1]'] });

    // A second checklist, dismissed: the kept one stays on the screen.
    const again = ok(await call(suggestEvidenceAction, caseWorker, P, {}));
    expect(again.objectId).not.toBe(suggested.objectId);
    expect(redirectOf(await call(reviewEvidenceAction, caseWorker, P, { proposalId: again.objectId, 'keep:0': 'on', dismiss: 'on' }))).toBe(`/p/${practiceId}/coverage?model=dismissed`);
    expect(ok(await call(coveragePage, caseWorker, P)).checklist?.id).toBe(suggested.objectId);
    // Another practice's person does not reach it.
    const elsewhere = await w.practice('MODELS COVERAGE ELSEWHERE');
    expect((await call(reviewEvidenceAction, elsewhere.manager, { practiceId: elsewhere.practiceId }, { proposalId: again.objectId })).status).toBe('not_found');
    expect((await call(reviewEvidenceAction, elsewhere.manager, P, { proposalId: again.objectId })).status).toBe('not_found');
  });
});

describe('the kill switch (MOD-06)', () => {
  it('turns every model feature off on the screens, sends nothing, and leaves hand entry working', async () => {
    const draft = await draftContract('MODELS KILL SWITCH');
    const { practiceId } = draft.practice;
    const P = { practiceId };
    answer('proposeContractTerms', await pagesInput(draft), { candidates: [fixed('97110', Q97110, '$32.00')] });
    await setFeatureFlag(w.app, platformAdmin, { key: 'model.kill_switch', scope: 'practice', scopeId: practiceId, value: true });
    const sentBefore = provider.requests.length;

    expect(ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId })).canPropose).toBe(false);
    expect(ok(await call(coveragePage, draft.practice.manager, P)).canSuggest).toBe(false);
    expect(redirectOf(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: draft.documentId }))).toBe(`/p/${practiceId}/abstraction/versions/${draft.versionId}?model=off`);
    ok(await call(askQuestionAction, draft.specialist, P, { contractId: draft.contractId, versionId: draft.versionId, topic: 'missing_schedule', question: 'SYNTHETIC QUESTION: exhibit B' }));
    expect(redirectOf(await call(suggestEvidenceAction, draft.practice.manager, P, {}))).toBe(`/p/${practiceId}/coverage?model=off`);
    expect(provider.requests.length).toBe(sentBefore);
    expect(await rows(practiceId, 'SELECT 1 FROM model_call WHERE practice_id = $1', [practiceId])).toEqual([]);
    expect(await rows(practiceId, 'SELECT 1 FROM model_proposal WHERE practice_id = $1', [practiceId])).toEqual([]);

    // By hand: the record entered, approved field by field, the version approved.
    const hand = await enter97140(draft);
    await approveEveryField(draft, hand);
    ok(await call(approveVersionAction, draft.specialist, P, { versionId: draft.versionId }));
    expect(ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId })).review.version.status).toBe('approved');
    // The page's own data is unchanged by the switch: CONTRACT_PAGES still cite.
    expect(CONTRACT_PAGES[1]).toContain(Q97140);
  });
});
