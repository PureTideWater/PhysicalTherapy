import {
  ContractWorkflowError,
  DISPUTE_WINDOW_STARTS,
  DISPUTE_WINDOW_UNITS,
  RATE_RECORD_FIELDS,
  type WorkflowContext,
  addRateRecord,
  amendVersion,
  approveRateRecordField,
  approveVersion,
  citeDisputeWindow,
  removeRateRecord,
  supersedeVersion,
  updateDraftVersion,
  verifyDisputeWindow,
} from '@tp/contracts';
import { type PracticeScope, QUESTION_TOPICS, type ScopeClient, loadPracticeCipher } from '@tp/db/runtime';
import { z } from 'zod';

import {
  type ContractOption,
  type DocumentSummary,
  type Paged,
  type QuestionView,
  type VersionSummary,
  contractOptions,
  listContractDocuments,
  listQuestions,
  versionsInProgress,
} from '../contracts/contract-queries';
import { EVIDENCE_PROBLEM_TEXT, exclusiveEnd } from '../contracts/display';
import { evidenceFor } from '../contracts/evidence';
import { type VersionReview, versionReview } from '../contracts/review';
import { refuseResponseLetter, tagDocument, tagInput } from '../contracts/tagging';
import { termsFromForm } from '../contracts/terms-form';
import { practiceRoute } from '../http/invoke';
import { type ProposalView, reviewVersionProposals, versionProposals } from '../models/contract-proposals';
import { modelFeatures } from '../models/path';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { type PayerOption, payerOptions } from '../remittances/queries';
import type { Services } from '../server/services';
import { pageSelection } from './contracts';
import { MODEL_NOTICES, type ModelNotice } from './models';
import { opaqueId, optionalText, requiredText } from './schemas';

/**
 * The contract specialist's workspace inside a practice (PRD 5, J5: "in v0 the specialist abstracts it
 * by hand into rate records with page references"; PRD 7, Rate record review: "specialist approves
 * field by field ... an unresolved field blocks publication"; PRD 7, Specialist queue: "abstract,
 * verify, approve, ask"; test matrix CON-01 to CON-05). A contract specialist reaches a practice only
 * under a support grant, where they hold the contract_specialist role and nothing else (docs/adr/0028):
 * every route here needs rate_record.edit, which only that role holds in a practice; approving a field
 * and a version also need the platform permission rate_record.approve, which packages/contracts and the
 * database check. The specialist enters each rate record by hand with its document, page and quote;
 * the citation is checked against the page before it is stored, and again before each approval. The
 * contract's own dispute window is cited and verified the same way (D17 a): only a verified window of
 * a signed-off version verifies its lines' deadlines.
 */

const page = z.coerce.number().int().min(1).max(100_000).default(1);
const date = z.iso.date('a date (YYYY-MM-DD)');
/** A number of days, or blank when the contract is silent. */
const days = z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.coerce.number().int('whole days').min(1).max(3650).optional());

/** The workflow's context in this request, with the practice's documents to resolve citations against. */
async function workflow(scope: PracticeScope<ScopeClient>, services: Services, practiceId: string, requestId: string): Promise<WorkflowContext> {
  const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
  return { scope, requestId, evidence: evidenceFor(scope, services.documents, cipher, practiceId, requestId) };
}

/** A line of the synthetic contract every route-test world holds (route-tests/world.ts). */
export const SAMPLE_QUOTE = '97140 Manual therapy $30.50 per unit';
/** Where that contract states its dispute window (page 1): what the window routes' samples cite. */
export const SAMPLE_WINDOW_QUOTE = 'Disputes are raised within 3650 days of the payment date.';

/** A citation that does not resolve becomes the problem in words, beside the field it belongs to. */
async function citing<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ContractWorkflowError && error.evidenceProblem !== undefined) {
      throw new InputError([{ field: 'quote', message: `${EVIDENCE_PROBLEM_TEXT[error.evidenceProblem]}; check the document, the page number and the quote` }]);
    }
    throw error;
  }
}

const versionPath = (practiceId: string, versionId: string, record?: string) => `/p/${practiceId}/abstraction/versions/${versionId}${record === undefined ? '' : `?record=${record}`}`;

export interface AbstractionPageData {
  readonly practiceId: string;
  readonly documents: Paged<DocumentSummary>;
  readonly versions: readonly VersionSummary[];
  readonly questions: readonly QuestionView[];
  readonly payers: readonly PayerOption[];
  readonly contracts: readonly ContractOption[];
}

export const abstractionPage = practiceRoute({
  id: 'practice.abstraction',
  kind: 'page',
  path: '/p/[practiceId]/abstraction',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId, page }),
  handle: async ({ scope, practiceId, params, request, services }): Promise<AbstractionPageData> => {
    const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
    return {
      practiceId,
      documents: await listContractDocuments(scope, practiceId, 'awaiting_abstraction', params.page, request.requestId),
      versions: await versionsInProgress(scope, practiceId, request.requestId),
      questions: await listQuestions(scope, practiceId, cipher, request.requestId, { openOnly: true }),
      payers: await payerOptions(scope, practiceId),
      contracts: await contractOptions(scope, practiceId, request.requestId),
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

export interface AbstractionVersionPageData {
  readonly practiceId: string;
  readonly review: VersionReview;
  readonly questions: readonly QuestionView[];
  /** The model's proposals of the version's terms, and whether a model may propose them now (the kill switch off: MOD-06). */
  readonly proposals: readonly ProposalView[];
  readonly canPropose: boolean;
  readonly modelNotice: ModelNotice | null;
}

export const abstractionVersionPage = practiceRoute({
  id: 'practice.abstraction.version',
  kind: 'page',
  path: '/p/[practiceId]/abstraction/versions/[versionId]',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId, versionId: opaqueId, ...pageSelection, model: z.enum(MODEL_NOTICES).optional().catch(undefined) }),
  handle: async ({ scope, practiceId, params, request, services }): Promise<AbstractionVersionPageData> => {
    const review = await versionReview(scope, services, practiceId, params.versionId, request.requestId, {
      ...(params.record === undefined ? {} : { record: params.record }),
      ...(params.document === undefined ? {} : { document: params.document }),
      ...(params.page === undefined ? {} : { page: params.page }),
    });
    if (review === undefined) {
      throw new NotFoundError();
    }
    const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
    return {
      practiceId,
      review,
      questions: await listQuestions(scope, practiceId, cipher, request.requestId, { contractId: review.version.contractId, openOnly: false }),
      proposals: await versionProposals(scope, practiceId, params.versionId),
      canPropose: (await modelFeatures(scope, services, practiceId)).proposeContractTerms,
      modelNotice: params.model ?? null,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, versionId: refs.draftVersionId }) },
});

export const startAbstraction = practiceRoute({
  id: 'practice.abstraction.tag',
  kind: 'action',
  path: '/p/[practiceId]/abstraction/tag',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId }),
  input: tagInput,
  audit: { action: 'contract_document_tagged', objectType: 'source_document' },
  handle: ({ scope, practiceId, input, request }): Promise<MutationResult> =>
    tagDocument({ scope, requestId: request.requestId }, practiceId, input, (versionId) => versionPath(practiceId, versionId)),
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    input: (refs) => ({ documentId: refs.untaggedDocumentId, payerId: refs.payerId, title: 'SYNTHETIC ABSTRACTED AGREEMENT', effectiveFrom: '2026-01-01' }),
  },
});

export const updateVersionAction = practiceRoute({
  id: 'practice.abstraction.update_version',
  kind: 'action',
  path: '/p/[practiceId]/abstraction/versions/update',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ versionId: opaqueId, effectiveFrom: date, lastDay: optionalText(date), timelyFilingDays: days, disputeWindowDays: days, noticeDays: days }),
  audit: { action: 'contract_version_edit_requested', objectType: 'contract_version' },
  handle: async ({ scope, practiceId, input, request }): Promise<MutationResult> => {
    if (input.lastDay !== undefined && input.lastDay < input.effectiveFrom) {
      throw new InputError([{ field: 'lastDay', message: 'on or after the date the version starts' }]);
    }
    await updateDraftVersion(
      { scope, requestId: request.requestId },
      {
        practiceId,
        versionId: input.versionId,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: exclusiveEnd(input.lastDay),
        timelyFilingDays: input.timelyFilingDays ?? null,
        disputeWindowDays: input.disputeWindowDays ?? null,
        noticeDays: input.noticeDays ?? null,
      },
    );
    return { objectId: input.versionId, redirect: versionPath(practiceId, input.versionId) };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    input: (refs) => ({ versionId: refs.draftVersionId, effectiveFrom: '2026-01-01', timelyFilingDays: '180', disputeWindowDays: '120', noticeDays: '90' }),
  },
});

/**
 * Cites where the contract states its dispute window (D17 a): the document, page and exact words, checked against
 * the page before they are stored with the page's hash, and the rule the quote states (best-option audit #5): the
 * unit it counts in and what it counts from, which the specialist chooses from the fixed lists (no default; nothing
 * parses the quote). A new citation, or a new unit or start, clears the window's verification.
 */
export const citeWindowAction = practiceRoute({
  id: 'practice.abstraction.cite_window',
  kind: 'action',
  path: '/p/[practiceId]/abstraction/versions/cite-window',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({
    versionId: opaqueId,
    documentId: opaqueId,
    page: z.coerce.number().int().min(1).max(999_999),
    quote: requiredText(2000),
    unit: z.enum(DISPUTE_WINDOW_UNITS, 'choose the unit the quote counts in: calendar days, business days or months'),
    measuredFrom: z.enum(DISPUTE_WINDOW_STARTS, 'choose what the quote counts from: the date of service, the remittance date, the payment date or the day the practice received it'),
  }),
  audit: { action: 'contract_window_citation_requested', objectType: 'contract_version' },
  handle: async ({ scope, practiceId, input, request, services }): Promise<MutationResult> => {
    await citing(async () =>
      citeDisputeWindow(await workflow(scope, services, practiceId, request.requestId), {
        practiceId,
        versionId: input.versionId,
        citation: { documentId: input.documentId, page: input.page, quote: input.quote },
        rule: { unit: input.unit, measuredFrom: input.measuredFrom },
      }),
    );
    return { objectId: input.versionId, redirect: versionPath(practiceId, input.versionId) };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    input: (refs) => ({ versionId: refs.draftVersionId, documentId: refs.contractDocumentId, page: '1', quote: SAMPLE_WINDOW_QUOTE, unit: 'calendar_days', measuredFrom: 'payment_date' }),
  },
});

/**
 * The contract specialist verifies the cited window against its page (rate_record.approve, which packages/contracts
 * and the database check): verified only while the citation resolves, and only when its cited rule is the one the
 * product computes (calendar days after the payment date; refused otherwise with the reason); a person does it,
 * never a model.
 */
export const verifyWindowAction = practiceRoute({
  id: 'practice.abstraction.verify_window',
  kind: 'action',
  path: '/p/[practiceId]/abstraction/versions/verify-window',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ versionId: opaqueId }),
  audit: { action: 'contract_window_verification_requested', objectType: 'contract_version' },
  handle: async ({ scope, practiceId, input, request, services }): Promise<MutationResult> => {
    const result = await verifyDisputeWindow(await workflow(scope, services, practiceId, request.requestId), { practiceId, versionId: input.versionId });
    if (!result.evidence.resolved) {
      throw new InputError([{ field: 'quote', message: `${EVIDENCE_PROBLEM_TEXT[result.evidence.problem]}; the window stays unverified until its citation resolves` }]);
    }
    return { objectId: input.versionId, redirect: versionPath(practiceId, input.versionId) };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ versionId: refs.draftVersionId }) },
});

const text = (max: number) => optionalText(z.string().max(max));

export const addRateRecordAction = practiceRoute({
  id: 'practice.abstraction.add_record',
  kind: 'action',
  path: '/p/[practiceId]/abstraction/records/add',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({
    versionId: opaqueId,
    method: z.string().max(40),
    codes: requiredText(4000),
    modifierSets: text(400),
    placesOfService: text(400),
    scopeFrom: text(10),
    scopeLastDay: text(10),
    amount: text(20),
    percentage: text(20),
    yearBasis: text(10),
    lockedYear: text(4),
    localityBasis: text(10),
    carrier: text(5),
    locality: text(2),
    conversionFactor: text(40),
    scheduleMethod: text(40),
    applyMppr: text(5),
    applyAssistantReduction: text(5),
    applySequestration: text(5),
    applyNcci: text(5),
    timedUnitsRule: text(40),
    rounding: text(40),
    documentId: opaqueId,
    page: z.coerce.number().int().min(1).max(999_999),
    quote: requiredText(2000),
  }),
  audit: { action: 'rate_record_entered', objectType: 'rate_record' },
  handle: async ({ scope, practiceId, input, request, services }): Promise<MutationResult> => {
    const built = termsFromForm(input);
    if (!built.ok) {
      throw new InputError(built.issues);
    }
    const { rateRecordId } = await citing(async () =>
      addRateRecord(await workflow(scope, services, practiceId, request.requestId), {
        practiceId,
        versionId: input.versionId,
        terms: built.terms,
        citation: { documentId: input.documentId, page: input.page, quote: input.quote },
      }),
    );
    return { objectId: rateRecordId, redirect: versionPath(practiceId, input.versionId, rateRecordId) };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    input: (refs) => ({
      versionId: refs.draftVersionId,
      method: 'FIXED_SCHEDULE',
      codes: '97140',
      amount: '30.50',
      documentId: refs.contractDocumentId,
      page: '2',
      quote: SAMPLE_QUOTE,
    }),
  },
});

export const removeRateRecordAction = practiceRoute({
  id: 'practice.abstraction.remove_record',
  kind: 'action',
  path: '/p/[practiceId]/abstraction/records/remove',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ rateRecordId: opaqueId, versionId: opaqueId }),
  audit: { action: 'rate_record_removal_requested', objectType: 'rate_record' },
  handle: async ({ scope, practiceId, input, request }): Promise<MutationResult> => {
    await removeRateRecord({ scope, requestId: request.requestId }, { practiceId, rateRecordId: input.rateRecordId });
    return { objectId: input.rateRecordId, redirect: versionPath(practiceId, input.versionId) };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ rateRecordId: refs.draftRateRecordId, versionId: refs.draftVersionId }) },
});

export const approveFieldAction = practiceRoute({
  id: 'practice.abstraction.approve_field',
  kind: 'action',
  path: '/p/[practiceId]/abstraction/records/approve-field',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ rateRecordId: opaqueId, versionId: opaqueId, field: z.enum(RATE_RECORD_FIELDS) }),
  audit: { action: 'rate_record_field_approval_requested', objectType: 'rate_record' },
  handle: async ({ scope, practiceId, input, request, services }): Promise<MutationResult> => {
    const result = await approveRateRecordField(await workflow(scope, services, practiceId, request.requestId), { practiceId, rateRecordId: input.rateRecordId, field: input.field });
    if (result.evidence !== null && !result.evidence.resolved) {
      // Every field is approved, but the record is not verified: its citation does not resolve (CON-05).
      throw new InputError([{ field: 'quote', message: `${EVIDENCE_PROBLEM_TEXT[result.evidence.problem]}; the record stays unverified until its citation resolves` }]);
    }
    return { objectId: input.rateRecordId, redirect: versionPath(practiceId, input.versionId, input.rateRecordId) };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ rateRecordId: refs.draftRateRecordId, versionId: refs.draftVersionId, field: 'scope' }) },
});

export const approveVersionAction = practiceRoute({
  id: 'practice.abstraction.approve_version',
  kind: 'action',
  path: '/p/[practiceId]/abstraction/versions/approve',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ versionId: opaqueId }),
  audit: { action: 'contract_version_approval_requested', objectType: 'contract_version' },
  handle: async ({ scope, practiceId, input, request, services }): Promise<MutationResult> => {
    await approveVersion(await workflow(scope, services, practiceId, request.requestId), { practiceId, versionId: input.versionId });
    // The specialist is done with the version: each model proposal's decision is what they did with it (docs/adr/0052).
    await reviewVersionProposals(scope, { practiceId, versionId: input.versionId, requestId: request.requestId });
    return { objectId: input.versionId, redirect: versionPath(practiceId, input.versionId) };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ versionId: refs.readyVersionId }) },
});

/**
 * An amendment or a correction of a version, from a further document when one is named. A document a payer response
 * names is its case's evidence, never a contract's source (docs/adr/0085, D4): both handlers refuse it on documentId,
 * under the document's lock, before the version is written.
 */
const successorInput = z.object({ versionId: opaqueId, effectiveFrom: optionalText(date), lastDay: optionalText(date), documentId: optionalText(opaqueId) });

export const amendVersionAction = practiceRoute({
  id: 'practice.abstraction.amend',
  kind: 'action',
  path: '/p/[practiceId]/abstraction/versions/amend',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId }),
  input: successorInput,
  audit: { action: 'contract_amendment_requested', objectType: 'contract_version' },
  handle: async ({ scope, practiceId, input, request }): Promise<MutationResult> => {
    if (input.effectiveFrom === undefined) {
      throw new InputError([{ field: 'effectiveFrom', message: 'the date the amendment takes effect' }]);
    }
    if (input.documentId !== undefined) {
      await refuseResponseLetter(scope, practiceId, input.documentId);
    }
    const created = await amendVersion(
      { scope, requestId: request.requestId },
      { practiceId, versionId: input.versionId, effectiveFrom: input.effectiveFrom, effectiveTo: exclusiveEnd(input.lastDay), sourceDocumentIds: input.documentId === undefined ? [] : [input.documentId] },
    );
    return { objectId: created.versionId, redirect: versionPath(practiceId, created.versionId) };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ versionId: refs.signedOffVersionId, effectiveFrom: '2026-07-01' }) },
});

export const supersedeVersionAction = practiceRoute({
  id: 'practice.abstraction.supersede',
  kind: 'action',
  path: '/p/[practiceId]/abstraction/versions/supersede',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId }),
  input: successorInput,
  audit: { action: 'contract_correction_requested', objectType: 'contract_version' },
  handle: async ({ scope, practiceId, input, request }): Promise<MutationResult> => {
    if (input.documentId !== undefined) {
      await refuseResponseLetter(scope, practiceId, input.documentId);
    }
    const created = await supersedeVersion(
      { scope, requestId: request.requestId },
      {
        practiceId,
        versionId: input.versionId,
        ...(input.effectiveFrom === undefined ? {} : { effectiveFrom: input.effectiveFrom }),
        ...(input.lastDay === undefined ? {} : { effectiveTo: exclusiveEnd(input.lastDay) }),
        sourceDocumentIds: input.documentId === undefined ? [] : [input.documentId],
      },
    );
    return { objectId: created.versionId, redirect: versionPath(practiceId, created.versionId) };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ versionId: refs.signedOffVersionId }) },
});

export const askQuestionAction = practiceRoute({
  id: 'practice.abstraction.ask',
  kind: 'action',
  path: '/p/[practiceId]/abstraction/questions/ask',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ contractId: opaqueId, versionId: optionalText(opaqueId), documentId: optionalText(opaqueId), topic: z.enum(QUESTION_TOPICS), question: requiredText(2000) }),
  audit: { action: 'contract_question_asked', objectType: 'contract_question' },
  handle: async ({ scope, practiceId, input, services }): Promise<MutationResult> => {
    const contract = await scope.client.query('SELECT 1 FROM contract WHERE id = $1 AND practice_id = $2', [input.contractId, practiceId]);
    if (contract.rowCount === 0) {
      throw new NotFoundError();
    }
    const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
    const { rows } = await scope.client.query<{ id: string }>(
      `INSERT INTO contract_question (practice_id, contract_id, contract_version_id, source_document_id, topic, question, asked_by)
       VALUES ($1, $2, $3, $4, $5, $6, app_actor_id()) RETURNING id`,
      [practiceId, input.contractId, input.versionId ?? null, input.documentId ?? null, input.topic, cipher.encrypt('contract_question.question', input.question)],
    );
    const questionId = rows[0]?.id ?? '';
    return { objectId: questionId, redirect: input.versionId === undefined ? `/p/${practiceId}/abstraction` : versionPath(practiceId, input.versionId) };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    input: (refs) => ({ contractId: refs.signedOffContractId, topic: 'missing_schedule', question: 'SYNTHETIC QUESTION: please send exhibit B' }),
  },
});

export const withdrawQuestionAction = practiceRoute({
  id: 'practice.abstraction.withdraw',
  kind: 'action',
  path: '/p/[practiceId]/abstraction/questions/withdraw',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ questionId: opaqueId }),
  audit: { action: 'contract_question_withdrawn', objectType: 'contract_question' },
  handle: async ({ scope, practiceId, input }): Promise<MutationResult> => {
    const { rowCount } = await scope.client.query("UPDATE contract_question SET status = 'withdrawn', closed_by = app_actor_id(), closed_at = now() WHERE id = $1 AND practice_id = $2 AND status = 'open'", [
      input.questionId,
      practiceId,
    ]);
    if (rowCount === 0) {
      const exists = await scope.client.query('SELECT 1 FROM contract_question WHERE id = $1 AND practice_id = $2', [input.questionId, practiceId]);
      if (exists.rowCount === 0) {
        throw new NotFoundError();
      }
      throw new InputError([{ field: 'questionId', message: 'the question is already answered or withdrawn' }]);
    }
    return { objectId: input.questionId, redirect: `/p/${practiceId}/abstraction` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ questionId: refs.withdrawableQuestionId }) },
});

export const ABSTRACTION_ROUTES = [
  abstractionPage,
  abstractionVersionPage,
  startAbstraction,
  updateVersionAction,
  citeWindowAction,
  verifyWindowAction,
  addRateRecordAction,
  removeRateRecordAction,
  approveFieldAction,
  approveVersionAction,
  amendVersionAction,
  supersedeVersionAction,
  askQuestionAction,
  withdrawQuestionAction,
] as const;
