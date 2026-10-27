import {
  ContractWorkflowError,
  type EvidenceResolver,
  RATE_RECORD_FIELDS,
  type RateRecord,
  type RateRecordField,
  loadRateRecords,
  proposeVersion,
  rateTermsToJson,
  removeRateRecord,
} from '@tp/contracts';
import { createHash, randomUUID } from 'node:crypto';

import { type PracticeScope, type ScopeClient, loadPracticeCipher, readWithAudit } from '@tp/db/runtime';
import {
  CONTRACT_KINDS,
  CORRECTION_FORMAT,
  type CandidateReview,
  type Correction,
  type ContractTermsProposal,
  InputRefusedError,
  type ProposedRateRecord,
  practiceRecordsCheck,
  recordContractScreenRequested,
  recordPermittedExampleIn,
  recordReviewerDecisionIn,
} from '@tp/model-gateway';
import type { DocumentStore } from '@tp/worker/documents';

import type { Sealer } from '../auth/seal';
import { evidenceFor } from '../contracts/evidence';
import { type ModelProblem, type ModelServices, gatewayFor, modelProblem } from './path';

/**
 * The specialist queue's model proposals (PRD 5, J5 in v1: "the model proposes the abstraction and
 * the specialist verifies each field against the cited page"; PRD 7, Rate record review and Specialist
 * queue; PRD 14, proposeContractTerms; docs/adr/0052).
 *
 * - propose: the contract specialist asks the gateway to read a draft version's contract or exhibit (its
 *   pages as intake stored them; a payer letter the version names is PHI and is never sent here). Every candidate whose fields all verified becomes a rate record proposed by the
 *   model (contracts' proposeVersion, which moves the version to proposed: "proposals awaiting
 *   verification" in the specialist queue); a candidate with a rejected field becomes none, and its
 *   fields stay on the review screen with their problems for the specialist to enter by hand. The model
 *   never approves anything: each proposed record still needs every field approved against its cited
 *   page, and the version its approval and the customer's sign-off.
 *   Before anything is sent, the gateway checks the pages against the practice's own records (docs/adr/0070,
 *   Part 3; test matrix MOD-12): a "contract" that holds one of the practice's member IDs, patient control
 *   numbers or payer claim numbers is an EOB or a letter filed as the wrong kind, and is refused
 *   (`names_patient`), as is one that could not be checked (`screen_unavailable`): nothing is sent, no
 *   model_call row is written, and the screen offers hand entry. The check is built here, after the role check
 *   (the route's), the kind check and the pages, from the request's own scope as proof that it reaches the
 *   practice and never read through: the contract specialist holds no phi.read, so the records are read in the
 *   check's own job scope as a service actor, the screen, a fresh ID per request. The gateway requires the
 *   check (ContractPagesInput.patientRecords) and accepts only one it issued for this practice, so no caller
 *   can send a contract unchecked.
 *   Until the lookup hashes land (F3), a screen reads, decrypts and audits every identifier the practice holds,
 *   so a screen runs only when it must (combined audit item 120's review, S1). The gateway refuses first every
 *   call it can refuse without one (the kill switch, a variant not served, a completed call under the key, a
 *   spent budget), and only then runs this module's step before the screen (CallContext.beforeScreen): the
 *   screen's limits (SCREEN_LIMITS: per practice and per person, in Postgres), then the person's
 *   `contract_screen_requested` event, in the request's transaction, naming the document and carrying the
 *   screen's request ID, so the audit trail says who caused the screen and joins it to every read the screen
 *   made, without saying the person read every patient, and the event is written exactly when a screen is
 *   about to read, never for a call refused before one. A document this server found naming a patient is
 *   refused again at once, unscreened, for an hour (remembered names_patient refusals, below).
 * - reject: the specialist discards a proposal: its model records not yet verified are removed, and
 *   the decision is recorded on the call as rejected.
 * - review: when the version is approved, each proposal not yet reviewed is decided from what the
 *   specialist did: accepted when every proposed record stands as proposed, otherwise accepted with the
 *   changed fields named (candidates[i].<field> for a field entered by hand or changed, candidates[i]
 *   for a candidate dropped, missed[j] for a record the model did not propose). A proposal is decided
 *   against its own document's final records only (those whose citation names the document it read): a
 *   version of a contract and its exhibit holds the exhibit's records too, which the contract's proposal
 *   was never asked for, so a contract proposal whose own records stand is accepted (docs/adr/0070). A
 *   proposal the specialist corrected or rejected becomes an evaluation example (eval_example,
 *   permitted) when the practice has a signed data-rights agreement, its own document's corrected
 *   records as its expectation (PRD 14: "Reviewer corrections become evaluation examples under the
 *   data-rights terms"); without one, none. The expectation (tp-eval-correction/2) records the decision,
 *   each record's citation with its document, and how many of the version's finals were entered with no
 *   citation: those were entered with no evidence, belong to no document's expectation, and are counted,
 *   not kept.
 */

export const CONTRACT_PROPOSAL_FORMAT = 'tp-contract-proposal/1';
/** The permitted example's expectation (tp-eval-correction/2), as the evaluation inside the PHI boundary reads it (the gateway's permitted.ts). */
export { CORRECTION_FORMAT };

/** A candidate as the proposal stores it: the verifier's review, and the rate record it was proposed as. */
export interface StoredCandidate extends Omit<CandidateReview, 'rateRecord'> {
  readonly rateRecord: CandidateReview['rateRecord'];
  readonly rateRecordId: string | null;
}

export interface StoredContractProposal {
  readonly format: typeof CONTRACT_PROPOSAL_FORMAT;
  readonly documentId: string;
  /** The specialist marked the contract ambiguous: the prompt's larger model read it (PRD 14). Absent on proposals written before it was recorded. */
  readonly ambiguous?: boolean;
  readonly candidates: readonly StoredCandidate[];
}

export type ProposeOutcome = { readonly kind: 'proposed'; readonly proposalId: string; readonly proposed: number; readonly held: number } | { readonly kind: 'not_proposed'; readonly problem: ModelProblem };

export interface ProposeInput {
  readonly practiceId: string;
  readonly versionId: string;
  readonly documentId: string;
  /** The specialist marked the contract ambiguous: the prompt's larger model reads it (PRD 14, Provider and data path). */
  readonly ambiguous: boolean;
  readonly userId: string;
  /** The form's request key: the same key never pays for a second call. */
  readonly requestKey: string;
  readonly requestId: string;
}

interface ProposeServices extends ModelServices {
  readonly keys: Parameters<typeof loadPracticeCipher>[1];
  readonly documents: DocumentStore;
  /** The server's key: the screen limits' subjects are HMACs under it, as every rate limit's are (src/lib/http/rate-limit.ts). */
  readonly sealer: Sealer;
}

// ---------------------------------------------------------------------------------------------------
// When a proposal may screen the practice's records (combined audit item 120's review, S1)

/** One of the contract screen's limits: hits per fixed window, per practice or per person. */
export interface ScreenLimit {
  readonly bucket: 'model_screen' | 'model_screen_day';
  readonly subject: 'practice' | 'user';
  readonly hits: number;
  readonly windowSeconds: number;
}

/**
 * How often one practice's records are screened, and how often one person causes a screen (docs/adr/0070, Part 3).
 * Until the lookup hashes land (F3, Lane A's), each screen reads, decrypts and audits every identifier the practice
 * holds: up to SCREEN_MAX_IDENTIFIERS audit_event rows a screen, which no role can remove. So the screens are counted
 * in Postgres (rate_limit_take: fixed windows every web task shares; the hour and the day in buckets of their own,
 * since the function keeps one window per bucket and subject), each subject an HMAC under the server's key as
 * src/lib/http/rate-limit.ts stores them, and a screen past any limit is not run: the person is told the document
 * could not be checked, and enters the terms by hand. A limit is taken only in the gateway's step before the screen
 * (CallContext.beforeScreen), so only a screen about to read counts: a click the gateway refuses anyway, or a document
 * this server remembers naming a patient, counts against none. A version's terms are proposed once (a proposal that
 * records anything moves the version out of draft), so a specialist's day of abstraction meets none of them, and a
 * scripted loop stops within the hour: at most 60 screens of one practice a day, where the review measured a loop
 * writing 1 to 6 million audit rows a minute.
 */
export const SCREEN_LIMITS: readonly ScreenLimit[] = [
  { bucket: 'model_screen', subject: 'practice', hits: 20, windowSeconds: 3_600 },
  { bucket: 'model_screen', subject: 'user', hits: 20, windowSeconds: 3_600 },
  { bucket: 'model_screen_day', subject: 'practice', hits: 60, windowSeconds: 86_400 },
  { bucket: 'model_screen_day', subject: 'user', hits: 100, windowSeconds: 86_400 },
];

/** A limit's subject as rate_limit_counter stores it: an HMAC of the bucket, the kind of subject and its ID (rate-limit.ts rateSubjectHash's form). */
export function screenLimitSubject(sealer: Sealer, bucket: ScreenLimit['bucket'], subject: ScreenLimit['subject'], id: string): string {
  return sealer.sign('rate-limit', `${bucket}:${subject}:${id}`).toString('hex');
}

/** A screen past one of SCREEN_LIMITS: refused before it read anything (the person's event is not written either). */
class ScreenLimitedError extends Error {
  override readonly name = 'ScreenLimitedError';
}

/**
 * The screen limits, a hit each, on the gateway's own pool (never the request's, whose connection the request's
 * transaction holds: docs/adr/0055), each statement its own transaction, so a hit counts whatever the request does
 * next. The first limit reached stops the count: the rest are not charged for a screen that will not run. A failure
 * of the count itself is thrown as it is, so the call is refused unscreened (fail closed).
 */
async function takeScreenLimits(services: ProposeServices, practiceId: string, userId: string): Promise<void> {
  const ids: Readonly<Record<ScreenLimit['subject'], string>> = { practice: practiceId, user: userId };
  const client = await services.modelPool.connect();
  let allowed = true;
  try {
    for (const limit of SCREEN_LIMITS) {
      const { rows } = await client.query<{ allowed: boolean }>('SELECT allowed FROM rate_limit_take($1, $2, $3, $4)', [
        limit.bucket,
        screenLimitSubject(services.sealer, limit.bucket, limit.subject, ids[limit.subject]),
        limit.hits,
        limit.windowSeconds,
      ]);
      if (rows[0]?.allowed !== true) {
        allowed = false;
        break;
      }
    }
  } finally {
    client.release();
  }
  if (!allowed) {
    services.logger.warn('a contract proposal was refused before its screen: the practice or the person has had as many screens as the limits allow', { practice_id: practiceId, error_code: 'MODEL_SCREEN_LIMITED' });
    throw new ScreenLimitedError('the contract screen’s limit was reached; nothing was read or sent');
  }
}

/**
 * What a person reads for a screen past its limits: the document could not be checked, so it was not sent, and the
 * terms are entered by hand. (A notice of its own, saying when to try again, is the notices' to add.)
 */
const SCREEN_LIMITED_PROBLEM: ModelProblem = 'screen_unavailable';

/**
 * The documents this server found naming a patient of their practice: clicked again within the hour, one is refused
 * as `names_patient` at once, unscreened (nothing read, decrypted or audited again) and uncounted by the limits.
 * Only the refusal is held, under the practice, the document and a SHA-256 of the pages screened: nothing of the
 * match (not which identifier, its kind, its row or how many), no identifier and no page text. A remembered refusal
 * can go stale only toward refusing (the practice's records no longer hold the patient), never toward sending, so it
 * needs no version of the practice's records; a screen's `clear` is never remembered, since records loaded meanwhile
 * could make the same pages name a patient, and no record version exists to tell (one would be a migration). One map
 * per server (per services, as path.ts keeps its limiter), at most REMEMBERED_MAX entries, the oldest out first.
 */
const remembered = new WeakMap<object, Map<string, number>>();
const REMEMBERED_MS = 3_600_000;
const REMEMBERED_MAX = 1_000;

const screenedKey = (practiceId: string, documentId: string, pages: readonly string[]) => `${practiceId}:${documentId}:${createHash('sha256').update(JSON.stringify(pages)).digest('hex')}`;

function rememberedNamesPatient(services: ProposeServices, key: string): boolean {
  const until = remembered.get(services)?.get(key);
  if (until === undefined) {
    return false;
  }
  if (until > services.now().getTime()) {
    return true;
  }
  remembered.get(services)?.delete(key);
  return false;
}

function rememberNamesPatient(services: ProposeServices, key: string): void {
  let documents = remembered.get(services);
  if (documents === undefined) {
    documents = new Map();
    remembered.set(services, documents);
  }
  documents.delete(key);
  documents.set(key, services.now().getTime() + REMEMBERED_MS);
  for (const oldest of documents.keys()) {
    if (documents.size <= REMEMBERED_MAX) {
      break;
    }
    documents.delete(oldest);
  }
}

export class ProposalRefusedError extends Error {
  override readonly name = 'ProposalRefusedError';
  constructor(
    readonly reason: 'not_found' | 'not_draft' | 'document_not_in_version' | 'document_kind' | 'pages_unavailable' | 'already_reviewed',
    message: string,
  ) {
    super(message);
  }
}

interface VersionRow {
  readonly status: string;
  readonly source_document_ids: string[];
}

async function versionRow(scope: PracticeScope<ScopeClient>, practiceId: string, versionId: string): Promise<VersionRow> {
  const { rows } = await scope.client.query<VersionRow>('SELECT status, source_document_ids FROM contract_version WHERE id = $1 AND practice_id = $2', [versionId, practiceId]);
  const [row] = rows;
  if (row === undefined) {
    throw new ProposalRefusedError('not_found', 'no such contract version in this practice');
  }
  return row;
}

function resolver(scope: PracticeScope<ScopeClient>, services: ProposeServices, cipher: Awaited<ReturnType<typeof loadPracticeCipher>>, practiceId: string, requestId: string): EvidenceResolver {
  return evidenceFor(scope, services.documents, cipher, practiceId, requestId);
}

/** Asks the gateway to propose the version's terms from one of its documents, and records what verified. */
export async function proposeTerms(scope: PracticeScope<ScopeClient>, services: ProposeServices, input: ProposeInput): Promise<ProposeOutcome> {
  const version = await versionRow(scope, input.practiceId, input.versionId);
  if (version.status !== 'draft') {
    throw new ProposalRefusedError('not_draft', 'a model proposes the terms of a draft version, once');
  }
  if (!version.source_document_ids.includes(input.documentId)) {
    throw new ProposalRefusedError('document_not_in_version', 'the document is not one of the version’s');
  }
  const [document] = await readWithAudit(
    scope,
    { objectType: 'source_document', purpose: 'contract_proposal', requestId: input.requestId },
    async (client) => (await client.query<{ id: string; practice_id: string; kind: string; sha256: string }>('SELECT id, practice_id, kind, sha256 FROM source_document WHERE id = $1 AND practice_id = $2', [input.documentId, input.practiceId])).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  if (document === undefined) {
    throw new ProposalRefusedError('not_found', 'no such document in this practice');
  }
  // A version may name a payer letter beside its contract; a letter is PHI and is read only through
  // readDenialLetter, with its minimization (PRD 14). Only a contract or an exhibit is proposed from.
  const kind = CONTRACT_KINDS.find((candidate) => candidate === document.kind);
  if (kind === undefined) {
    throw new ProposalRefusedError('document_kind', 'the model proposes terms from a contract or an exhibit only; enter terms from this document by hand');
  }
  const cipher = await loadPracticeCipher(scope, services.keys, input.practiceId);
  const evidence = resolver(scope, services, cipher, input.practiceId, input.requestId);
  const pages = await evidence.pages(input.documentId);
  if (!pages.ok) {
    throw new ProposalRefusedError('pages_unavailable', 'the document’s pages have not been read');
  }
  const gateway = gatewayFor(services, input.userId);
  if (gateway === null) {
    return { kind: 'not_proposed', problem: 'unavailable' };
  }
  const screened = screenedKey(input.practiceId, input.documentId, pages.pages);
  if (rememberedNamesPatient(services, screened)) {
    return { kind: 'not_proposed', problem: 'names_patient' };
  }
  // The practice records check (docs/adr/0070, Part 3): built from the request's scope as proof only, it reads
  // in its own job scope on the model pool as the screen, under a request ID that joins its reads to the
  // person's event, which the step before the screen records in the request's transaction, naming the document.
  const screenId = randomUUID();
  const patientRecords = practiceRecordsCheck({ authorizedBy: scope, pool: services.modelPool, cipher, practiceId: input.practiceId, screenId, requestId: input.requestId });
  // Run by the gateway once it has refused everything it can without the screen, right before the screen reads:
  // the screen's limits, then the person's event, through the gateway's own writer under the request ID its
  // screen's reads carry (screenAuditRequestId), so the two IDs cannot drift apart.
  const beforeScreen = async () => {
    await takeScreenLimits(services, input.practiceId, input.userId);
    await recordContractScreenRequested(scope, { practiceId: input.practiceId, documentId: input.documentId, requestId: input.requestId, screenId });
  };
  let result;
  try {
    result = await gateway.proposeContractTerms(
      { practiceId: input.practiceId, requestKey: input.requestKey, beforeScreen },
      { documentId: input.documentId, documentSha256: document.sha256, kind, pages: pages.pages, ambiguous: input.ambiguous, patientRecords },
    );
  } catch (error) {
    if (error instanceof ScreenLimitedError) {
      return { kind: 'not_proposed', problem: SCREEN_LIMITED_PROBLEM };
    }
    const problem = modelProblem(error);
    if (problem === null) {
      throw error;
    }
    if (error instanceof InputRefusedError && error.code === 'names_patient') {
      rememberNamesPatient(services, screened);
    }
    return { kind: 'not_proposed', problem };
  }
  if (result.proposal === null) {
    return { kind: 'not_proposed', problem: 'invalid_output' };
  }
  const proposed = result.proposal.candidates.filter((candidate) => candidate.rateRecord !== null);
  const ids: string[] = [];
  if (proposed.length > 0) {
    const { checks } = await proposeVersion(
      { scope, requestId: input.requestId, evidence },
      {
        practiceId: input.practiceId,
        versionId: input.versionId,
        rateRecords: proposed.map((candidate) => {
          const record = candidate.rateRecord as NonNullable<CandidateReview['rateRecord']>;
          const { evidence: cited, proposed_by: _by, ...terms } = record;
          return { terms, citation: { documentId: cited.document_id, page: cited.page, quote: cited.quote, hash: cited.hash } };
        }),
      },
    );
    ids.push(...checks.map((check) => check.rateRecordId));
  }
  const stored: StoredContractProposal = { format: CONTRACT_PROPOSAL_FORMAT, documentId: input.documentId, ambiguous: input.ambiguous, candidates: storedCandidates(result.proposal, ids) };
  const { rows } = await scope.client.query<{ id: string }>(
    `INSERT INTO model_proposal (practice_id, model_call_id, purpose, contract_version_id, source_document_id, proposal, verifier_passed, proposed_by)
     VALUES ($1, $2, 'proposeContractTerms', $3, $4, $5::jsonb, $6, app_actor_id()) RETURNING id`,
    [input.practiceId, result.modelCallId, input.versionId, input.documentId, JSON.stringify(stored), result.passed],
  );
  return { kind: 'proposed', proposalId: (rows[0] as { id: string }).id, proposed: proposed.length, held: result.proposal.candidates.length - proposed.length };
}

function storedCandidates(proposal: ContractTermsProposal, ids: readonly string[]): StoredCandidate[] {
  let next = 0;
  return proposal.candidates.map((candidate) => {
    const rateRecordId = candidate.rateRecord === null ? null : (ids[next++] ?? null);
    return { ...candidate, rateRecordId };
  });
}

// ---------------------------------------------------------------------------------------------------
// Reading proposals

export interface ProposalView {
  readonly id: string;
  readonly modelCallId: string;
  readonly documentId: string;
  /** Whether the specialist marked the contract ambiguous, so the prompt's larger model read it. */
  readonly ambiguous: boolean;
  /** The model the call was made to (model_call.model_id). */
  readonly modelId: string;
  readonly createdAt: string;
  readonly passed: boolean;
  readonly candidates: readonly StoredCandidate[];
  readonly decision: { readonly decision: string; readonly changedFields: readonly string[] } | null;
  readonly reviewedAt: string | null;
}

interface ProposalRow {
  readonly id: string;
  readonly model_call_id: string;
  readonly source_document_id: string;
  readonly created_at: Date;
  readonly verifier_passed: boolean;
  readonly proposal: StoredContractProposal;
  readonly reviewed_at: Date | null;
  readonly eval_example_id: string | null;
  readonly reviewer_decision: string | null;
  readonly reviewer_changed_fields: string[] | null;
  readonly model_id: string;
}

async function proposalRows(scope: PracticeScope<ScopeClient>, practiceId: string, versionId: string): Promise<ProposalRow[]> {
  const { rows } = await scope.client.query<ProposalRow>(
    `SELECT p.id, p.model_call_id, p.source_document_id, p.created_at, p.verifier_passed, p.proposal, p.reviewed_at, p.eval_example_id, c.reviewer_decision, c.reviewer_changed_fields, c.model_id
       FROM model_proposal p JOIN model_call c ON c.id = p.model_call_id
      WHERE p.practice_id = $1 AND p.contract_version_id = $2 AND p.purpose = 'proposeContractTerms'
      ORDER BY p.created_at, p.id`,
    [practiceId, versionId],
  );
  return rows;
}

/** The version's model proposals, oldest first, with what was decided about each. */
export async function versionProposals(scope: PracticeScope<ScopeClient>, practiceId: string, versionId: string): Promise<ProposalView[]> {
  return (await proposalRows(scope, practiceId, versionId)).map((row) => ({
    id: row.id,
    modelCallId: row.model_call_id,
    documentId: row.source_document_id,
    ambiguous: row.proposal.ambiguous === true,
    modelId: row.model_id,
    createdAt: row.created_at.toISOString(),
    passed: row.verifier_passed,
    candidates: row.proposal.candidates,
    decision: row.reviewer_decision === null ? null : { decision: row.reviewer_decision, changedFields: row.reviewer_changed_fields ?? [] },
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
  }));
}

// ---------------------------------------------------------------------------------------------------
// Rejecting and reviewing

const read = (practiceId: string, requestId: string) => ({ practiceId, requestId, purpose: 'contract_proposal_review' });

/** Discards a proposal: its model records not yet verified are removed, and the call is recorded as rejected. */
export async function rejectProposal(scope: PracticeScope<ScopeClient>, input: { readonly practiceId: string; readonly versionId: string; readonly proposalId: string; readonly requestId: string }): Promise<void> {
  const row = (await proposalRows(scope, input.practiceId, input.versionId)).find((candidate) => candidate.id === input.proposalId);
  if (row === undefined) {
    throw new ProposalRefusedError('not_found', 'no such proposal of this version');
  }
  if (row.reviewed_at !== null) {
    throw new ProposalRefusedError('already_reviewed', 'the proposal was reviewed already');
  }
  const version = await versionRow(scope, input.practiceId, input.versionId);
  if (version.status !== 'draft' && version.status !== 'proposed') {
    throw new ProposalRefusedError('not_draft', 'an approved version’s proposals were reviewed when it was approved');
  }
  const ids = new Set(row.proposal.candidates.flatMap((candidate) => (candidate.rateRecordId === null ? [] : [candidate.rateRecordId])));
  const standing = await loadRateRecords(scope, read(input.practiceId, input.requestId), [input.versionId]);
  for (const record of standing.filter((candidate) => ids.has(candidate.id) && candidate.proposedBy === 'model' && candidate.verifiedBy === null)) {
    await removeRateRecord({ scope, requestId: input.requestId }, { practiceId: input.practiceId, rateRecordId: record.id });
  }
  await recordReviewerDecisionIn(scope, { practiceId: input.practiceId, modelCallId: row.model_call_id, decision: 'rejected', changedFields: [], requestId: input.requestId });
  await scope.client.query('UPDATE model_proposal SET reviewed_at = now() WHERE id = $1 AND practice_id = $2', [row.id, input.practiceId]);
}

const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => (item !== null && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item));

/** The rate-record fields (and the citation) in which a final record differs from the terms proposed. */
function differing(proposed: ProposedRateRecord, final: RateRecord): (RateRecordField | 'citation')[] {
  const json = rateTermsToJson(final.terms);
  const fields: (RateRecordField | 'citation')[] = RATE_RECORD_FIELDS.filter((field) => canonical(json[field]) !== canonical(proposed[field]));
  const cited = final.citation;
  if (cited === null || cited.document_id !== proposed.evidence.document_id || cited.page !== proposed.evidence.page || cited.quote !== proposed.evidence.quote) {
    fields.push('citation');
  }
  return fields;
}

const codesOf = (candidate: StoredCandidate): string[] => {
  const field = candidate.fields.find((entry) => entry.field === 'codes');
  return Array.isArray(field?.written) ? [...(field.written as readonly string[])].map((code) => code.toUpperCase()).sort() : [];
};
const sameCodes = (a: readonly string[], b: readonly string[] | undefined) => b !== undefined && a.length > 0 && a.join(' ') === [...b].sort().join(' ');

/** Whether a final record cites the document a proposal read: one of that document's own records. */
const citedFrom = (documentId: string) => (record: RateRecord) => record.citation !== null && record.citation.document_id === documentId;

/**
 * What the specialist changed from the proposal of the document documentId, as field paths (see the
 * module's comment). A record proposed as one of the candidates is found among all the version's finals
 * (one whose citation the specialist moved to another document reads as candidates[i].citation); a record
 * entered by hand counts as replacing a held candidate, or as missed, only when it cites this document: an
 * exhibit's records, and records entered with no citation, are not this proposal's to have proposed.
 */
export function changedFields(candidates: readonly StoredCandidate[], allFinals: readonly RateRecord[], documentId: string): string[] {
  const finals = allFinals.filter(citedFrom(documentId));
  const proposalIds = new Set(candidates.flatMap((candidate) => (candidate.rateRecordId === null ? [] : [candidate.rateRecordId])));
  const used = new Set<string>();
  const changed: string[] = [];
  candidates.forEach((candidate, index) => {
    const own = candidate.rateRecordId === null ? undefined : allFinals.find((record) => record.id === candidate.rateRecordId);
    if (own !== undefined && candidate.rateRecord !== null) {
      used.add(own.id);
      changed.push(...differing(candidate.rateRecord, own).map((field) => `candidates[${String(index)}].${field}`));
      return;
    }
    const codes = codesOf(candidate);
    const replacement = finals.find((record) => !used.has(record.id) && !proposalIds.has(record.id) && sameCodes(codes, record.terms.scope.codes));
    if (replacement === undefined) {
      changed.push(`candidates[${String(index)}]`);
      return;
    }
    used.add(replacement.id);
    if (candidate.rateRecord !== null) {
      changed.push(...differing(candidate.rateRecord, replacement).map((field) => `candidates[${String(index)}].${field}`));
    } else {
      changed.push(...candidate.fields.filter((field) => !field.verified).map((field) => `candidates[${String(index)}].${field.field}`));
      if (candidate.problems.includes('terms_invalid') && candidate.fields.every((field) => field.verified)) {
        changed.push(`candidates[${String(index)}].parameters`);
      }
    }
  });
  finals
    .filter((record) => !used.has(record.id) && !proposalIds.has(record.id))
    .forEach((_record, index) => {
      changed.push(`missed[${String(index)}]`);
    });
  return [...new Set(changed)];
}

/**
 * The practice's signed data-rights agreement, the one a permitted example rests on; null without one. Read
 * through practice_data_rights_agreement (its ID only): the specialist approving a version reads no agreement.
 */
async function dataRightsAgreement(scope: PracticeScope<ScopeClient>, practiceId: string): Promise<string | null> {
  const { rows } = await scope.client.query<{ id: string | null }>('SELECT practice_data_rights_agreement($1) AS id', [practiceId]);
  return rows[0]?.id ?? null;
}

export interface ReviewedProposal {
  readonly proposalId: string;
  readonly decision: 'accepted' | 'accepted_with_changes' | 'rejected';
  readonly changedFields: readonly string[];
  readonly exampleId: string | null;
}

/**
 * Once the version is approved (in the same transaction): records each unreviewed proposal's decision
 * from its own document's final records, and keeps each corrected or rejected proposal as an evaluation
 * example under the practice's data-rights agreement, with those records as its expectation.
 */
export async function reviewVersionProposals(scope: PracticeScope<ScopeClient>, input: { readonly practiceId: string; readonly versionId: string; readonly requestId: string }): Promise<ReviewedProposal[]> {
  const rows = await proposalRows(scope, input.practiceId, input.versionId);
  if (rows.length === 0) {
    return [];
  }
  const finals = await loadRateRecords(scope, read(input.practiceId, input.requestId), [input.versionId]);
  const agreement = await dataRightsAgreement(scope, input.practiceId);
  const reviewed: ReviewedProposal[] = [];
  for (const row of rows) {
    let decision = row.reviewer_decision as ReviewedProposal['decision'] | null;
    let changed = row.reviewer_changed_fields ?? [];
    if (row.reviewed_at === null) {
      changed = changedFields(row.proposal.candidates, finals, row.source_document_id);
      decision = changed.length === 0 ? 'accepted' : 'accepted_with_changes';
      await recordReviewerDecisionIn(scope, { practiceId: input.practiceId, modelCallId: row.model_call_id, decision, changedFields: changed, requestId: input.requestId });
      await scope.client.query('UPDATE model_proposal SET reviewed_at = now() WHERE id = $1 AND practice_id = $2', [row.id, input.practiceId]);
    }
    let exampleId = row.eval_example_id;
    if (decision !== null && decision !== 'accepted' && exampleId === null && agreement !== null) {
      exampleId = await recordPermittedExampleIn(scope, {
        practiceId: input.practiceId,
        purpose: 'proposeContractTerms',
        inputRef: `model_call:${row.model_call_id}`,
        permissionRef: agreement,
        expected: {
          format: CORRECTION_FORMAT,
          document_id: row.source_document_id,
          contract_version_id: input.versionId,
          decision,
          changed_fields: changed,
          uncited_finals: finals.filter((record) => record.citation === null).length,
          // Only the records cited from the document the call read: another document's are not its expectation.
          records: finals.flatMap((record) => {
            const cited = record.citation;
            return cited === null || cited.document_id !== row.source_document_id ? [] : [{ ...rateTermsToJson(record.terms), citation: { document_id: cited.document_id, page: cited.page, quote: cited.quote, hash: cited.hash } }];
          }),
        } satisfies Extract<Correction, { readonly format: typeof CORRECTION_FORMAT }>,
      });
      await scope.client.query('UPDATE model_proposal SET eval_example_id = $3 WHERE id = $1 AND practice_id = $2', [row.id, input.practiceId, exampleId]);
    }
    if (decision !== null) {
      reviewed.push({ proposalId: row.id, decision, changedFields: changed, exampleId });
    }
  }
  return reviewed;
}

/** Whether a workflow error is a contract rule a person can act on (shown beside the form). */
export function isWorkflowRefusal(error: unknown): error is ContractWorkflowError {
  return error instanceof ContractWorkflowError;
}
