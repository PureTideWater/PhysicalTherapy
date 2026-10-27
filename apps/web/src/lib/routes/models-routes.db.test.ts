import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RATE_RECORD_FIELDS, createContract, createDraftVersion } from '@tp/contracts';
import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createOrganization, createUser } from '@tp/db/testing';
import {
  LocalDeterministicProvider,
  type ModelProvider,
  type ModelPurpose,
  type ModelRequest,
  type ModelResponse,
  PROMPTS,
  type RequestInputs,
  type ServedKey,
  correctionSchema,
  gatewayServing,
  modelFor,
  requestFor,
  scoredFinals,
  setFeatureFlag,
} from '@tp/model-gateway';
import { createLogger } from '@tp/observability';
import { WORDS_VERSION, dollars, draftNarrative } from '@tp/packets';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { packetDraftInputs } from '@tp/worker/packets';
import type { Practice } from '@tp/worker/testing';
import { TriageWorld } from '@tp/worker/testing/triage';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import { evidenceFor } from '../contracts/evidence';
import type { CookieJar, MutationResult, Outcome, Route } from '../http/route';
import { seedScreenRecords } from '../../../../../packages/model-gateway/src/test-support/screen-world';
import { SCREEN_LIMITS, screenLimitSubject } from '../models/contract-proposals';
import { coverageGaps } from '../models/evidence-checklist';
import { assignModelPath } from '../models/path';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { abstractionVersionPage, addRateRecordAction, approveFieldAction, approveVersionAction, askQuestionAction } from './abstraction';
import { coveragePage } from './coverage';
import { draftNarrativeAction, proposeTermsAction, rejectProposalAction, reviewEvidenceAction, suggestEvidenceAction } from './models';
import { approvePacketVersionAction, packetPage, requestApprovalAction, writeVersionAction } from './packets';
import { ACCESS_LOG_PAGE_SIZE, accessLogPage } from './settings';
import { CONTRACT_PAGES, storeContractDocument } from './test-support/contract-world';
import { csrfTokenFor } from '../http/csrf';

// A production gateway on a real provider works out what it serves from the committed baseline, floors and prices
// (packages/model-gateway/src/evaluated.ts, docs/adr/0070, Part 2), and as the repository ships that is nothing. A test
// that needs a production stand-in to be served says so for the one gateway it builds (serveOnce), never through an
// option: no caller can widen what the gateway serves.
vi.mock('../../../../../packages/model-gateway/src/evaluated', async (importOriginal) => {
  const actual = await importOriginal<{ readonly gatewayServing: typeof gatewayServing }>();
  return { ...actual, gatewayServing: vi.fn(actual.gatewayServing) };
});
const serveOnce = (...keys: ServedKey[]) => vi.mocked(gatewayServing).mockReturnValueOnce({ keys: new Set(keys) });

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
function answer<K extends ModelPurpose>(purpose: K, input: RequestInputs[K], output: unknown): void {
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

/** What the gateway is given for the document (the version's contract, unless another of its documents is named): its pages as intake stored them. */
async function pagesInput(draft: DraftContract, documentId = draft.documentId, kind: 'contract' | 'exhibit' = 'contract'): Promise<RequestInputs['proposeContractTerms']> {
  const { practiceId } = draft.practice;
  return withPracticeScope(w.app, { actorId: draft.specialist, practiceIds: [practiceId] }, async (scope) => {
    const pages = await evidenceFor(scope, documents, draft.practice.cipher, practiceId, 'test').pages(documentId);
    if (!pages.ok) {
      throw new Error('the synthetic contract has no pages');
    }
    const [document] = (await scope.client.query<{ sha256: string }>('SELECT sha256 FROM source_document WHERE id = $1', [documentId])).rows;
    return { documentId, documentSha256: document?.sha256 ?? '', kind, pages: pages.pages };
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
    const examples = await rows<{ id: string; source: string; purpose: string; permission_ref: string; input_ref: string; expected: { format: string; changed_fields: string[]; records: { scope: { codes: string[] }; citation: { document_id: string; page: number } | null }[] } }>(
      practiceId,
      'SELECT id, source, purpose, permission_ref, input_ref, expected FROM eval_example WHERE practice_id = $1',
      [practiceId],
    );
    expect(examples.map((example) => [example.source, example.purpose, example.permission_ref, example.input_ref])).toEqual([['permitted', 'proposeContractTerms', agreementId, `model_call:${proposal?.modelCallId ?? ''}`]]);
    expect(examples[0]?.expected).toMatchObject({ format: 'tp-eval-correction/2', document_id: draft.documentId, contract_version_id: draft.versionId, decision: 'accepted_with_changes', changed_fields: ['candidates[1].amount'], uncited_finals: 0 });
    expect(examples[0]?.expected.records.map((record) => [record.scope.codes, record.citation?.document_id, record.citation?.page]).sort()).toEqual([
      [['97110'], draft.documentId, 2],
      [['97140'], draft.documentId, 2],
    ]);
    // The gateway's permitted run reads the expectation exactly as written.
    expect(correctionSchema.safeParse(examples[0]?.expected).success).toBe(true);
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

describe('a version of a contract and its exhibit: each proposal is decided on its own document’s records (docs/adr/0070)', () => {
  /** A SYNTHETIC exhibit beside the agreement, with a code the agreement does not hold. */
  const EXHIBIT_B: readonly (readonly string[])[] = [['SYNTHETIC EXHIBIT B - INVENTED TERMS', '97112 Neuromuscular reeducation $33.00 per unit']];
  const Q97112 = '97112 Neuromuscular reeducation $33.00 per unit';

  async function enterExhibit97112(draft: DraftContract & { readonly extraIds: readonly string[] }): Promise<void> {
    const redirect = redirectOf(
      await call(addRateRecordAction, draft.specialist, { practiceId: draft.practice.practiceId }, { versionId: draft.versionId, method: 'FIXED_SCHEDULE', codes: '97112', amount: '33.00', timedUnitsRule: 'UNKNOWN', documentId: draft.extraIds[0], page: '1', quote: Q97112 }),
    );
    await approveEveryField(draft, /record=([0-9a-f-]{36})/.exec(redirect)?.[1] ?? '');
  }

  async function withAgreement(draft: DraftContract): Promise<void> {
    await asOwner(w.owner, [draft.practice.practiceId], () =>
      w.owner.query(
        `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256) VALUES ($1, $2, $3, 'data_rights', '1', now() - interval '1 day', 'SYNTHETIC SIGNER', 'esign:synthetic-data-rights', $4)`,
        [randomUUID(), draft.practice.world.organizationId, draft.practice.practiceId, randomBytes(32).toString('hex')],
      ),
    );
  }

  it('accepts the contract’s proposal when its own records stand, though the version also holds the exhibit’s, and keeps no example of it', async () => {
    const draft = await draftContract('MODELS PAIR ACCEPT', [{ pages: EXHIBIT_B, kind: 'exhibit' }]);
    const { practiceId } = draft.practice;
    const P = { practiceId };
    await withAgreement(draft);
    answer('proposeContractTerms', await pagesInput(draft), { candidates: [fixed('97110', Q97110, '$32.00')] });
    ok(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: draft.documentId }));
    const [proposal] = ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId })).proposals;
    await approveEveryField(draft, proposal?.candidates[0]?.rateRecordId ?? '');
    // The exhibit's record, entered by hand from the exhibit, is not one the contract's proposal missed.
    await enterExhibit97112(draft);
    ok(await call(approveVersionAction, draft.specialist, P, { versionId: draft.versionId }));
    expect(await callOf(practiceId, proposal?.modelCallId ?? '')).toMatchObject({ reviewer_decision: 'accepted', reviewer_changed_fields: [] });
    expect(await rows(practiceId, 'SELECT 1 FROM eval_example WHERE practice_id = $1', [practiceId])).toEqual([]);
  });

  it('keeps a corrected contract proposal’s example with the contract’s records only: the exhibit’s are neither missed nor expected', async () => {
    const draft = await draftContract('MODELS PAIR CORRECT', [{ pages: EXHIBIT_B, kind: 'exhibit' }]);
    const { practiceId } = draft.practice;
    const P = { practiceId };
    await withAgreement(draft);
    // 97140's amount cites words page 2 does not hold, so it is held and entered by hand.
    answer('proposeContractTerms', await pagesInput(draft), { candidates: [fixed('97110', Q97110, '$32.00'), fixed('97140', Q97140, '$30.50', '97140 Manual therapy $31.50 per unit')] });
    ok(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: draft.documentId }));
    const [proposal] = ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId })).proposals;
    await approveEveryField(draft, proposal?.candidates[0]?.rateRecordId ?? '');
    await approveEveryField(draft, await enter97140(draft));
    await enterExhibit97112(draft);
    ok(await call(approveVersionAction, draft.specialist, P, { versionId: draft.versionId }));
    // Not missed[0] for the exhibit's 97112: only the held candidate changed.
    expect(await callOf(practiceId, proposal?.modelCallId ?? '')).toMatchObject({ reviewer_decision: 'accepted_with_changes', reviewer_changed_fields: ['candidates[1].amount'] });
    const [example] = await rows<{ expected: unknown }>(practiceId, 'SELECT expected FROM eval_example WHERE practice_id = $1', [practiceId]);
    const correction = correctionSchema.parse(example?.expected);
    expect(correction).toMatchObject({ format: 'tp-eval-correction/2', document_id: draft.documentId, decision: 'accepted_with_changes', uncited_finals: 0 });
    if (correction.format !== 'tp-eval-correction/2') {
      throw new Error('the example is not written as /2');
    }
    // The expectation holds the contract's two records, cited from it; the exhibit's record is left out, and the scorer scores both.
    expect(correction.records.map((record) => [record.scope.codes, record.citation?.document_id]).sort()).toEqual([
      [['97110'], draft.documentId],
      [['97140'], draft.documentId],
    ]);
    expect(scoredFinals(correction)).toHaveLength(2);
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
    // Only a production model path sends a practice's material to a provider other than the local one, and only for
    // what it serves: here both of the contract prompt's variants, for the one gateway the request builds.
    assignModelPath(services, { kind: 'available', production: true, provider: () => standIn, served: { keys: new Set(['proposeContractTerms/default', 'proposeContractTerms/ambiguous']) } });
    serveOnce('proposeContractTerms/default', 'proposeContractTerms/ambiguous');
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

/** A SYNTHETIC remittance note filed as an exhibit: it names the CAS-08 claim's patient control number, as an EOB would. */
const MISFILED_EXHIBIT: readonly (readonly string[])[] = [
  ['SYNTHETIC EXHIBIT B - INVENTED', '97110 Therapeutic exercise $32.00 per unit', `Patient account:${KNOWN[0] ?? ''} paid 97110 $32.00`],
];

/** The person's contract_screen_requested events in the practice, and the screen reads each one's request ID joins. */
async function screenTrail(practiceId: string) {
  const events = await rows<{ actor_id: string; actor_kind: string; object_id: string; purpose: string; request_id: string }>(
    practiceId,
    "SELECT actor_id, actor_kind, object_id, purpose, request_id FROM audit_event WHERE practice_id = $1 AND action = 'contract_screen_requested' AND object_type = 'source_document' ORDER BY at",
    [practiceId],
  );
  const reads = await rows<{ actor_id: string; actor_kind: string; object_type: string; request_id: string; n: string }>(
    practiceId,
    "SELECT actor_id, actor_kind, object_type, request_id, count(*)::text AS n FROM audit_event WHERE practice_id = $1 AND action = 'read' AND purpose = 'contract_screen' GROUP BY 1, 2, 3, 4 ORDER BY 3, 4",
    [practiceId],
  );
  return { events, reads };
}

describe('the practice records check before a contract is sent (docs/adr/0070, Part 3; MOD-12)', () => {
  it('refuses a document that names a patient of the practice before anything is sent, says so, and records who caused the screen and what it read, as the screen', async () => {
    const draft = await draftContract('MODELS NAMES PATIENT', [{ pages: MISFILED_EXHIBIT, kind: 'exhibit' }]);
    const { practiceId } = draft.practice;
    const P = { practiceId };
    const exhibitId = draft.extraIds[0] ?? '';
    // Were it sent, the model would answer: the refusal, not a missing answer, is what stops it.
    answer('proposeContractTerms', await pagesInput(draft, exhibitId, 'exhibit'), { candidates: [fixed('97110', Q97110, '$32.00')] });
    const sentBefore = provider.requests.length;
    logs.length = 0;

    expect(redirectOf(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: exhibitId }))).toBe(`/p/${practiceId}/abstraction/versions/${draft.versionId}?model=names_patient`);
    expect(provider.requests.length).toBe(sentBefore);
    expect(provider.requests.some((request) => KNOWN.some((identifier) => request.user.includes(identifier)))).toBe(false);
    expect(await rows(practiceId, 'SELECT 1 FROM model_call WHERE practice_id = $1', [practiceId])).toEqual([]);
    expect(await rows(practiceId, 'SELECT 1 FROM model_proposal WHERE practice_id = $1', [practiceId])).toEqual([]);
    expect(await rows(practiceId, 'SELECT 1 FROM rate_record WHERE contract_version_id = $1', [draft.versionId])).toEqual([]);

    // The screen says why and offers hand entry; the version stays a draft the specialist can still propose from.
    const page = ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId, model: 'names_patient' }));
    expect([page.modelNotice, page.canPropose, page.review.version.status, page.proposals]).toEqual(['names_patient', true, 'draft', []]);

    // The person's one event names the document; the reads are the screen's, a service actor, joined by request ID.
    const trail = await screenTrail(practiceId);
    expect(trail.events).toEqual([{ actor_id: draft.specialist, actor_kind: 'user', object_id: exhibitId, purpose: 'contract_screen', request_id: expect.stringMatching(/^test-[0-9a-f-]{36}:screen:[0-9a-f-]{36}$/) as string }]);
    const requestId = trail.events[0]?.request_id ?? '';
    const screenId = requestId.slice(requestId.lastIndexOf(':') + 1);
    expect(screenId).not.toBe(draft.specialist);
    expect(trail.reads.map(({ actor_id, actor_kind, object_type, request_id }) => ({ actor_id, actor_kind, object_type, request_id }))).toEqual([
      { actor_id: screenId, actor_kind: 'service', object_type: 'claim', request_id: requestId },
      { actor_id: screenId, actor_kind: 'service', object_type: 'patient_ref', request_id: requestId },
    ]);
    // One audited read per row: every claim and every patient with a member ID the practice holds, and nothing in the person's name.
    const [held] = await rows<{ claims: string; patients: string }>(
      practiceId,
      'SELECT (SELECT count(*) FROM claim WHERE practice_id = $1)::text AS claims, (SELECT count(*) FROM patient_ref WHERE practice_id = $1 AND member_id IS NOT NULL)::text AS patients',
      [practiceId],
    );
    expect(Object.fromEntries(trail.reads.map((read) => [read.object_type, read.n]))).toEqual({ claim: held?.claims, patient_ref: held?.patients });
    expect(await rows(practiceId, "SELECT 1 FROM audit_event WHERE actor_id = $1 AND purpose = 'contract_screen' AND action = 'read'", [draft.specialist])).toEqual([]);

    // One log line: the practice and the code, nothing of the match and no document text.
    expect(logs.filter((entry) => entry.error_code === 'MODEL_INPUT_NAMES_PATIENT').map((entry) => entry.practice_id)).toEqual([practiceId]);
    const logged = JSON.stringify(logs);
    expect(KNOWN.some((identifier) => logged.includes(identifier))).toBe(false);
    expect(logged).not.toContain('Patient account');

    // The contract beside it names no patient and is proposed as before, after a screen of its own.
    answer('proposeContractTerms', await pagesInput(draft), { candidates: [fixed('97110', Q97110, '$32.00')] });
    expect(redirectOf(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: draft.documentId }))).toBe(`/p/${practiceId}/abstraction/versions/${draft.versionId}?model=proposed`);
    expect((await screenTrail(practiceId)).events.map((event) => event.object_id)).toEqual([exhibitId, draft.documentId]);
  });

  it('refuses, as not checked, a document whose practice records could not be read, and sends nothing', async () => {
    const draft = await draftContract('MODELS SCREEN FAILED');
    const { practiceId } = draft.practice;
    const P = { practiceId };
    answer('proposeContractTerms', await pagesInput(draft), { candidates: [fixed('97110', Q97110, '$32.00')] });
    // One claim's patient control number no longer decrypts (a value sealed for another column): the check cannot
    // read the practice's records, so it refuses rather than answering that the document is clear.
    await asOwner(w.owner, [practiceId], () =>
      w.owner.query('UPDATE claim SET patient_control_number = $2 WHERE id = (SELECT id FROM claim WHERE practice_id = $1 ORDER BY id LIMIT 1)', [
        practiceId,
        draft.practice.cipher.encrypt('patient_ref.member_id', 'SYNSEALEDELSEWHERE01'),
      ]),
    );
    const sentBefore = provider.requests.length;
    logs.length = 0;

    expect(redirectOf(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: draft.documentId }))).toBe(`/p/${practiceId}/abstraction/versions/${draft.versionId}?model=screen_unavailable`);
    expect(provider.requests.length).toBe(sentBefore);
    expect(await rows(practiceId, 'SELECT 1 FROM model_call WHERE practice_id = $1', [practiceId])).toEqual([]);
    expect(await rows(practiceId, 'SELECT 1 FROM model_proposal WHERE practice_id = $1', [practiceId])).toEqual([]);
    expect(ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId, model: 'screen_unavailable' })).modelNotice).toBe('screen_unavailable');
    // The operator's log names the failed read apart from the bound (MODEL_INPUT_SCREEN_UNAVAILABLE); the person reads the same notice for both.
    expect(logs.filter((entry) => entry.error_code === 'MODEL_INPUT_SCREEN_FAILED').map((entry) => entry.practice_id)).toEqual([practiceId]);
    expect(JSON.stringify(logs)).not.toContain('SYNSEALEDELSEWHERE01');
    const trail = await screenTrail(practiceId);
    expect(trail.events).toHaveLength(1);
    // The screen's reads are kept though a value then failed to decrypt: one per row it read (combined audit item 120's review, F3).
    expect(Object.fromEntries(trail.reads.map((read) => [read.object_type, Number(read.n)]))).toEqual(await heldRows(practiceId));
  });
});

/** The rows of the practice the screen reads, by table: one audited read each. */
async function heldRows(practiceId: string): Promise<Readonly<Record<string, number>>> {
  const [held] = await rows<{ claims: number; patients: number }>(
    practiceId,
    'SELECT (SELECT count(*) FROM claim WHERE practice_id = $1)::int AS claims, (SELECT count(*) FROM patient_ref WHERE practice_id = $1 AND member_id IS NOT NULL)::int AS patients',
    [practiceId],
  );
  return { claim: held?.claims ?? 0, patient_ref: held?.patients ?? 0 };
}

/** What a practice's contract screens wrote: the person's events, the screens that read (one request ID each) and their audited reads. */
async function screenCounts(practiceId: string): Promise<{ readonly events: number; readonly screens: number; readonly reads: number }> {
  const trail = await screenTrail(practiceId);
  return { events: trail.events.length, screens: new Set(trail.reads.map((read) => read.request_id)).size, reads: trail.reads.reduce((sum, read) => sum + Number(read.n), 0) };
}

const total = (held: Readonly<Record<string, number>>) => Object.values(held).reduce((sum, n) => sum + n, 0);

describe('what a click costs the practice’s audit trail (combined audit item 120’s review, S1; docs/adr/0070, Part 3)', () => {
  it('refuses every click at a practice that has spent its daily budget before the screen: no read, and no person’s event', async () => {
    const draft = await draftContract('MODELS SCREEN BUDGET');
    const { practiceId } = draft.practice;
    answer('proposeContractTerms', await pagesInput(draft), { candidates: [fixed('97110', Q97110, '$32.00')] });
    await setFeatureFlag(w.app, platformAdmin, { key: 'model.daily_budget_cents', scope: 'practice', scopeId: practiceId, value: '0' });
    const sentBefore = provider.requests.length;
    for (let click = 0; click < 3; click += 1) {
      expect(redirectOf(await call(proposeTermsAction, draft.specialist, { practiceId }, { versionId: draft.versionId, documentId: draft.documentId }))).toBe(`/p/${practiceId}/abstraction/versions/${draft.versionId}?model=budget`);
    }
    // Each click once read and audited every identifier the practice holds, after the person's event, and only then
    // met the budget: now the budget refuses it first, and nothing is read or recorded but the route's own event.
    expect(await screenCounts(practiceId)).toEqual({ events: 0, screens: 0, reads: 0 });
    expect(await rows(practiceId, "SELECT 1 FROM audit_event WHERE practice_id = $1 AND action = 'model_proposal_requested'", [practiceId])).toHaveLength(3);
    expect(provider.requests.length).toBe(sentBefore);
  });

  it('screens a document that names a patient once: clicked again on the same server, it is refused at once, reading nothing', async () => {
    const draft = await draftContract('MODELS SCREEN REMEMBERED', [{ pages: MISFILED_EXHIBIT, kind: 'exhibit' }]);
    const { practiceId } = draft.practice;
    const P = { practiceId };
    const exhibitId = draft.extraIds[0] ?? '';
    const sentBefore = provider.requests.length;
    logs.length = 0;
    for (let click = 0; click < 3; click += 1) {
      expect(redirectOf(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: exhibitId }))).toBe(`/p/${practiceId}/abstraction/versions/${draft.versionId}?model=names_patient`);
    }
    // One screen's reads and the person's one event, where each click once wrote both again.
    expect(await screenCounts(practiceId)).toEqual({ events: 1, screens: 1, reads: total(await heldRows(practiceId)) });
    expect(logs.filter((entry) => entry.error_code === 'MODEL_INPUT_NAMES_PATIENT').map((entry) => entry.practice_id)).toEqual([practiceId]);
    expect(provider.requests.length).toBe(sentBefore);
    // What is remembered is that document's refusal alone: the version's contract is screened, and proposed.
    answer('proposeContractTerms', await pagesInput(draft), { candidates: [fixed('97110', Q97110, '$32.00')] });
    expect(redirectOf(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: draft.documentId }))).toBe(`/p/${practiceId}/abstraction/versions/${draft.versionId}?model=proposed`);
    expect(await screenCounts(practiceId)).toMatchObject({ events: 2, screens: 2 });
  });

  it('counts a screen against the practice’s and the person’s limits only when it is about to read, and refuses one past any limit with nothing read or sent', async () => {
    const draft = await draftContract('MODELS SCREEN LIMITS');
    const { practiceId } = draft.practice;
    const P = { practiceId };
    answer('proposeContractTerms', await pagesInput(draft), { candidates: [fixed('97110', Q97110, '$32.00')] });
    const subjects = SCREEN_LIMITS.map((limit) => ({ bucket: limit.bucket, subject: screenLimitSubject(services.sealer, limit.bucket, limit.subject, limit.subject === 'practice' ? practiceId : draft.specialist) }));
    const counters = async () =>
      (await rows<{ bucket: string; subject: string; hits: number }>(practiceId, 'SELECT bucket, subject, hits FROM rate_limit_counter WHERE subject = ANY($1)', [subjects.map((entry) => entry.subject)])).map((counter) => `${counter.bucket}:${counter.subject}:${String(counter.hits)}`).sort();
    // A click the gateway refuses anyway (the kill switch) counts against no limit, and records no person's event.
    await setFeatureFlag(w.app, platformAdmin, { key: 'model.kill_switch', scope: 'practice', scopeId: practiceId, value: true });
    expect(redirectOf(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: draft.documentId }))).toBe(`/p/${practiceId}/abstraction/versions/${draft.versionId}?model=off`);
    expect(await counters()).toEqual([]);
    // A screen about to read counts one hit against each limit.
    await setFeatureFlag(w.app, platformAdmin, { key: 'model.kill_switch', scope: 'practice', scopeId: practiceId, value: false });
    expect(redirectOf(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: draft.documentId }))).toBe(`/p/${practiceId}/abstraction/versions/${draft.versionId}?model=proposed`);
    expect(await counters()).toEqual(subjects.map((entry) => `${entry.bucket}:${entry.subject}:1`).sort());
    expect(await screenCounts(practiceId)).toMatchObject({ events: 1, screens: 1 });

    // Past any one of the limits (the practice's or the person's, in the hour or the day), the click is refused before
    // the screen: no read, no person's event, nothing sent, and one line for the operator.
    for (const [index, limit] of SCREEN_LIMITS.entries()) {
      const past = await draftContract(`MODELS SCREEN LIMIT ${String(index)}`);
      const at = past.practice.practiceId;
      answer('proposeContractTerms', await pagesInput(past), { candidates: [fixed('97110', Q97110, '$32.00')] });
      const subject = screenLimitSubject(services.sealer, limit.bucket, limit.subject, limit.subject === 'practice' ? at : past.specialist);
      for (let hit = 0; hit < limit.hits; hit += 1) {
        await w.app.query('SELECT * FROM rate_limit_take($1, $2, $3, $4)', [limit.bucket, subject, limit.hits, limit.windowSeconds]);
      }
      const sentBefore = provider.requests.length;
      logs.length = 0;
      expect(redirectOf(await call(proposeTermsAction, past.specialist, { practiceId: at }, { versionId: past.versionId, documentId: past.documentId })), limit.bucket).toBe(`/p/${at}/abstraction/versions/${past.versionId}?model=screen_unavailable`);
      expect(await screenCounts(at), limit.bucket).toEqual({ events: 0, screens: 0, reads: 0 });
      expect(provider.requests.length).toBe(sentBefore);
      expect(await rows(at, 'SELECT 1 FROM model_call WHERE practice_id = $1', [at])).toEqual([]);
      expect(logs.filter((entry) => entry.error_code === 'MODEL_SCREEN_LIMITED').map((entry) => entry.practice_id), limit.bucket).toEqual([at]);
    }
  });
});

describe('the practice’s access log after a contract screen (combined audit item 120’s review, S2)', () => {
  // A gap pinned, not a behaviour wanted: practice_access_log pages on `at` alone and returns no request ID, so the
  // reads one screen writes (all at its transaction's one `at`) show as a job of the practice, beside no person, and
  // only the first page of them is listed. This test flips when Lane A's change lands (practice_access_log paged on
  // (at, id), its request ID returned, a contract_screen read labelled from the event it joins; docs/adr/0070, Part 3):
  // then every read is listed, and labelled with the person who caused it.
  it('lists the first page of one screen’s reads, as a job of the practice beside no person; the record filter still finds each read', async () => {
    const draft = await draftContract('MODELS ACCESS LOG', [{ pages: MISFILED_EXHIBIT, kind: 'exhibit' }]);
    const { practiceId } = draft.practice;
    await seedScreenRecords(w.owner, { practiceId, uploaderId: draft.practice.manager }, draft.practice.cipher, { bulkClaims: 120 });
    expect(redirectOf(await call(proposeTermsAction, draft.specialist, { practiceId }, { versionId: draft.versionId, documentId: draft.extraIds[0] ?? '' }))).toContain('model=names_patient');
    const audited = total(await heldRows(practiceId));
    expect(await screenCounts(practiceId)).toEqual({ events: 1, screens: 1, reads: audited });

    // The practice administrator pages the log as its page does, `next` into `before`.
    const admin = draft.practice.world.adminUserId;
    const seen: { readonly action: string; readonly actor: string; readonly via: string; readonly ticket: string | null; readonly purpose: string | null; readonly objectId: string | null }[] = [];
    let before: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const data = ok(await call(accessLogPage, admin, { practiceId, ...(before === undefined ? {} : { before }) }));
      seen.push(...data.entries.map((entry) => ({ action: entry.action, actor: entry.actor, via: entry.via, ticket: entry.ticket, purpose: entry.purpose, objectId: entry.objectId })));
      if (data.next === null) {
        break;
      }
      before = data.next;
    }
    const shown = seen.filter((entry) => entry.action === 'read' && entry.purpose === 'contract_screen');
    expect(audited).toBeGreaterThan(ACCESS_LOG_PAGE_SIZE);
    expect(shown).toHaveLength(ACCESS_LOG_PAGE_SIZE);
    expect(new Set(shown.map((entry) => `${entry.actor}|${entry.via}|${String(entry.ticket)}`))).toEqual(new Set(['a job of the practice|system|null']));
    // The person's event is listed, under their support ticket, apart from the reads, and nothing on either joins them.
    expect(seen.filter((entry) => entry.action === 'contract_screen_requested').map((entry) => [entry.via, entry.ticket, entry.purpose])).toEqual([['support', 'SYN-MOD', 'contract_screen']]);
    // A claim the paged log skipped is found by the record filter: no read is lost, though its cause is not named.
    const [skipped] = await rows<{ object_id: string }>(
      practiceId,
      "SELECT object_id FROM audit_event WHERE practice_id = $1 AND action = 'read' AND purpose = 'contract_screen' AND object_type = 'claim' AND NOT (object_id = ANY($2::uuid[])) LIMIT 1",
      [practiceId, shown.flatMap((entry) => (entry.objectId === null ? [] : [entry.objectId]))],
    );
    const filtered = ok(await call(accessLogPage, admin, { practiceId, object_type: 'claim', object_id: skipped?.object_id }));
    expect(filtered.entries.filter((entry) => entry.purpose === 'contract_screen').map((entry) => [entry.action, entry.actor, entry.via])).toEqual([['read', 'a job of the practice', 'system']]);
  }, 120_000);
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
    expect(refused(await call(approvePacketVersionAction, drafter, P, { caseId, versionId: version?.id, versionSha256: sha, wordsVersion: WORDS_VERSION }))).toMatch(/cannot approve it/);
    ok(await call(approvePacketVersionAction, practice.manager, P, { caseId, versionId: version?.id, versionSha256: sha, wordsVersion: WORDS_VERSION }));

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

describe('a model feature not evaluated for the configured model (docs/adr/0070, Part 2; MOD-11)', () => {
  it('is not offered on its screen, sends nothing when asked for, says why, and leaves hand entry working', async () => {
    const draft = await draftContract('MODELS NOT EVALUATED');
    const { practiceId } = draft.practice;
    const P = { practiceId };
    const standIn = new RecordingStandIn({ candidates: [fixed('97110', Q97110, '$32.00')] });
    ok(await call(askQuestionAction, draft.specialist, P, { contractId: draft.contractId, versionId: draft.versionId, topic: 'missing_schedule', question: 'SYNTHETIC QUESTION: exhibit B' }));
    // A production path on a real provider with the committed baseline, floors and prices: nothing has passed, so the
    // path serves nothing and the gateway it builds serves nothing either (no option, no mock).
    assignModelPath(services, { kind: 'available', production: true, provider: () => standIn });
    try {
      expect(ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId })).canPropose).toBe(false);
      expect(ok(await call(coveragePage, draft.practice.manager, P)).canSuggest).toBe(false);
      expect(redirectOf(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: draft.documentId }))).toBe(`/p/${practiceId}/abstraction/versions/${draft.versionId}?model=not_evaluated`);
      expect(redirectOf(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: draft.documentId, ambiguous: 'on' }))).toBe(`/p/${practiceId}/abstraction/versions/${draft.versionId}?model=not_evaluated`);
      expect(redirectOf(await call(suggestEvidenceAction, draft.practice.manager, P, {}))).toBe(`/p/${practiceId}/coverage?model=not_evaluated`);
      expect(ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId, model: 'not_evaluated' })).modelNotice).toBe('not_evaluated');

      // Served for the default variant only (the contract prompt's default model passed, its larger one did not): the
      // screen offers the proposal, and an ambiguous request is refused with the same notice, before anything is sent.
      assignModelPath(services, { kind: 'available', production: true, provider: () => standIn, served: { keys: new Set(['proposeContractTerms/default']) } });
      expect(ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId })).canPropose).toBe(true);
      expect(ok(await call(coveragePage, draft.practice.manager, P)).canSuggest).toBe(false);
      serveOnce('proposeContractTerms/default');
      expect(redirectOf(await call(proposeTermsAction, draft.specialist, P, { versionId: draft.versionId, documentId: draft.documentId, ambiguous: 'on' }))).toBe(`/p/${practiceId}/abstraction/versions/${draft.versionId}?model=not_evaluated`);
    } finally {
      assignModelPath(services, { kind: 'available', production: false, provider: () => provider });
    }
    expect(standIn.requests).toEqual([]);
    expect(await rows(practiceId, 'SELECT 1 FROM model_call WHERE practice_id = $1', [practiceId])).toEqual([]);
    expect(await rows(practiceId, 'SELECT 1 FROM model_proposal WHERE practice_id = $1', [practiceId])).toEqual([]);
    // Refused before the screen, so no screen was caused: no person's contract_screen_requested event, and no read.
    expect(await screenCounts(practiceId)).toEqual({ events: 0, screens: 0, reads: 0 });

    // By hand: the record entered, approved field by field, the version approved.
    const hand = await enter97140(draft);
    await approveEveryField(draft, hand);
    ok(await call(approveVersionAction, draft.specialist, P, { versionId: draft.versionId }));
    expect(ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId })).review.version.status).toBe('approved');
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
    // Refused before the screen, so no screen was caused: no person's contract_screen_requested event, and no read.
    expect(await screenCounts(practiceId)).toEqual({ events: 0, screens: 0, reads: 0 });

    // By hand: the record entered, approved field by field, the version approved.
    const hand = await enter97140(draft);
    await approveEveryField(draft, hand);
    ok(await call(approveVersionAction, draft.specialist, P, { versionId: draft.versionId }));
    expect(ok(await call(abstractionVersionPage, draft.specialist, { ...P, versionId: draft.versionId })).review.version.status).toBe('approved');
    // The page's own data is unchanged by the switch: CONTRACT_PAGES still cite.
    expect(CONTRACT_PAGES[1]).toContain(Q97140);
  });
});
