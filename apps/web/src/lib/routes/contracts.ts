import { signOffVersion } from '@tp/contracts';
import { type VersionStatus, VERSION_STATUSES, loadPracticeCipher, rolesPermit } from '@tp/db/runtime';
import { z } from 'zod';

import {
  type CalendarEntry,
  type ContractDetail,
  type ContractOption,
  type ContractSummary,
  type DocumentSummary,
  type Paged,
  type QuestionView,
  contractDetail,
  contractOptions,
  listCalendar,
  listContractDocuments,
  listContracts,
  listQuestions,
} from '../contracts/contract-queries';
import { type VersionReview, versionReview } from '../contracts/review';
import { tagDocument, tagInput } from '../contracts/tagging';
import { practiceRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { type PayerOption, payerOptions } from '../remittances/queries';
import type { Services } from '../server/services';
import { CONTENT_TYPES, MAX_FILES_PER_BATCH, MAX_UPLOAD_BYTES } from '../uploads/limits';
import { opaqueId, optionalText, requiredText } from './schemas';
import { NO_BAA, baaOnFile } from './uploads';

/**
 * The Contracts screens of the customer workspace (PRD 5, J5; PRD 6, Contract repository; PRD 7,
 * Contracts: "payer, plan, version, effective window, method, status (draft, under review, approved,
 * signed off, superseded), coverage share; the calendar ... upload a document; view pages and rate
 * records; sign off a version; open the specialist's questions ... a superseded version is read-only
 * and still opens from old runs"; PRD 7, Rate record review: "customer signs off"). Reading needs the
 * workspace (practice.open); uploading and tagging a document need file.upload (the upload itself is
 * the Uploads flow with the kind contract, exhibit or payer letter); signing off and answering the
 * specialist's questions need contract.sign_off (the practice administrator, the billing manager and
 * the firm principal). Signing off a version already signed off, or answering a question again with
 * the same answer, changes nothing.
 */

const page = z.coerce.number().int().min(1).max(100_000).default(1);
const id = optionalText(opaqueId);

export const CONTRACT_DOCUMENT_KINDS = ['contract', 'exhibit', 'payer_letter'] as const;

/** What the contract upload panel accepts (the Uploads flow's limits, for the contract kinds). */
export interface ContractUploadSettings {
  readonly canUpload: boolean;
  readonly gate: { readonly open: boolean; readonly reason: string | null };
  readonly limits: { readonly maxFiles: number; readonly maxBytes: number };
  readonly kinds: readonly { readonly kind: (typeof CONTRACT_DOCUMENT_KINDS)[number]; readonly contentTypes: readonly string[] }[];
}

function todayOf(services: Services): string {
  return services.now().toISOString().slice(0, 10);
}

export interface ContractFilters {
  readonly payer?: string;
  readonly status?: VersionStatus;
}

export interface ContractsPageData {
  readonly practiceId: string;
  readonly today: string;
  readonly filters: ContractFilters;
  readonly payers: readonly PayerOption[];
  readonly list: Paged<ContractSummary>;
  readonly calendar: readonly CalendarEntry[];
  readonly untagged: Paged<DocumentSummary>;
  readonly contracts: readonly ContractOption[];
  readonly questions: readonly QuestionView[];
  readonly upload: ContractUploadSettings;
  readonly canSignOff: boolean;
  readonly roles: readonly string[];
}

export const contractsPage = practiceRoute({
  id: 'practice.contracts',
  kind: 'page',
  path: '/p/[practiceId]/contracts',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, payer: id, status: optionalText(z.enum(VERSION_STATUSES)), page, documents: page }),
  handle: async ({ scope, practiceId, params, request, services, access }): Promise<ContractsPageData> => {
    const today = todayOf(services);
    const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
    const open = await baaOnFile(scope, practiceId);
    const filters: ContractFilters = { ...(params.payer === undefined ? {} : { payer: params.payer }), ...(params.status === undefined ? {} : { status: params.status }) };
    return {
      practiceId,
      today,
      filters,
      payers: await payerOptions(scope, practiceId),
      list: await listContracts(scope, { practiceId, today, page: params.page, requestId: request.requestId, ...(params.payer === undefined ? {} : { payerId: params.payer }), ...(params.status === undefined ? {} : { status: params.status }) }),
      calendar: await listCalendar(scope, practiceId, today, request.requestId),
      untagged: await listContractDocuments(scope, practiceId, 'untagged', params.documents, request.requestId),
      contracts: await contractOptions(scope, practiceId, request.requestId),
      questions: await listQuestions(scope, practiceId, cipher, request.requestId, { openOnly: true }),
      upload: {
        canUpload: rolesPermit(access.roles, 'file.upload'),
        gate: { open, reason: open ? null : NO_BAA },
        limits: { maxFiles: MAX_FILES_PER_BATCH, maxBytes: MAX_UPLOAD_BYTES },
        kinds: CONTRACT_DOCUMENT_KINDS.map((kind) => ({ kind, contentTypes: CONTENT_TYPES[kind] })),
      },
      canSignOff: rolesPermit(access.roles, 'contract.sign_off'),
      roles: access.roles,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

export interface ContractPageData {
  readonly practiceId: string;
  readonly detail: ContractDetail;
  readonly calendar: readonly CalendarEntry[];
  readonly questions: readonly QuestionView[];
  readonly untagged: readonly DocumentSummary[];
  readonly canUpload: boolean;
  readonly canSignOff: boolean;
  readonly roles: readonly string[];
}

export const contractPage = practiceRoute({
  id: 'practice.contracts.contract',
  kind: 'page',
  path: '/p/[practiceId]/contracts/[contractId]',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, contractId: opaqueId }),
  handle: async ({ scope, practiceId, params, request, services, access }): Promise<ContractPageData> => {
    const detail = await contractDetail(scope, practiceId, params.contractId, request.requestId);
    if (detail === undefined) {
      throw new NotFoundError();
    }
    const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
    return {
      practiceId,
      detail,
      calendar: await listCalendar(scope, practiceId, todayOf(services), request.requestId, params.contractId),
      questions: await listQuestions(scope, practiceId, cipher, request.requestId, { contractId: params.contractId, openOnly: false }),
      untagged: (await listContractDocuments(scope, practiceId, 'untagged', 1, request.requestId)).items,
      canUpload: rolesPermit(access.roles, 'file.upload'),
      canSignOff: rolesPermit(access.roles, 'contract.sign_off'),
      roles: access.roles,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, contractId: refs.signedOffContractId }) },
});

/** Which record's cited page, or which document page, the review shows (opaque IDs and a page number). */
export const pageSelection = {
  record: id,
  document: id,
  page: z.coerce.number().int().min(1).max(999_999).optional().catch(undefined),
};

export interface VersionPageData {
  readonly practiceId: string;
  readonly review: VersionReview;
  readonly questions: readonly QuestionView[];
  readonly canSignOff: boolean;
  readonly roles: readonly string[];
  readonly notice: 'signed_off' | null;
}

export const versionPage = practiceRoute({
  id: 'practice.contracts.version',
  kind: 'page',
  path: '/p/[practiceId]/contracts/versions/[versionId]',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, versionId: opaqueId, ...pageSelection, notice: z.enum(['signed_off']).optional().catch(undefined) }),
  handle: async ({ scope, practiceId, params, request, services, access }): Promise<VersionPageData> => {
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
      questions: await listQuestions(scope, practiceId, cipher, request.requestId, { versionId: params.versionId, openOnly: false }),
      canSignOff: rolesPermit(access.roles, 'contract.sign_off'),
      roles: access.roles,
      notice: params.notice ?? null,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, versionId: refs.signedOffVersionId }) },
});

export const tagContractDocument = practiceRoute({
  id: 'practice.contracts.tag',
  kind: 'action',
  path: '/p/[practiceId]/contracts/tag',
  phi: true,
  permission: 'file.upload',
  params: z.object({ practiceId: opaqueId }),
  input: tagInput,
  audit: { action: 'contract_document_tagged', objectType: 'source_document' },
  handle: ({ scope, practiceId, input, request }): Promise<MutationResult> =>
    tagDocument({ scope, requestId: request.requestId }, practiceId, input, (versionId) => `/p/${practiceId}/contracts/versions/${versionId}`),
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    input: (refs) => ({ documentId: refs.untaggedDocumentId, payerId: refs.payerId, title: 'SYNTHETIC TAGGED AGREEMENT', effectiveFrom: '2026-01-01' }),
  },
});

export const signOffAction = practiceRoute({
  id: 'practice.contracts.sign_off',
  kind: 'action',
  path: '/p/[practiceId]/contracts/sign-off',
  phi: true,
  permission: 'contract.sign_off',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ versionId: opaqueId }),
  audit: { action: 'contract_sign_off_requested', objectType: 'contract_version' },
  handle: async ({ scope, practiceId, input, request }): Promise<MutationResult> => {
    const found = await scope.client.query<{ status: VersionStatus }>('SELECT status FROM contract_version WHERE id = $1 AND practice_id = $2', [input.versionId, practiceId]);
    const status = found.rows[0]?.status;
    if (status === undefined) {
      throw new NotFoundError();
    }
    const versionPath = `/p/${practiceId}/contracts/versions/${input.versionId}`;
    if (status === 'signed_off') {
      // Signed off already (by this person or another): nothing to change.
      return { objectId: input.versionId, redirect: versionPath };
    }
    await signOffVersion({ scope, requestId: request.requestId }, { practiceId, versionId: input.versionId });
    return { objectId: input.versionId, redirect: `${versionPath}?notice=signed_off` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ versionId: refs.approvedVersionId }) },
});

export const answerQuestionAction = practiceRoute({
  id: 'practice.contracts.answer',
  kind: 'action',
  path: '/p/[practiceId]/contracts/answer',
  phi: true,
  permission: 'contract.sign_off',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ questionId: opaqueId, answer: requiredText(2000) }),
  audit: { action: 'contract_question_answered', objectType: 'contract_question' },
  handle: async ({ scope, practiceId, input, services }): Promise<MutationResult> => {
    const found = await scope.client.query<{ contract_id: string; status: string; answer: string | null }>('SELECT contract_id, status, answer FROM contract_question WHERE id = $1 AND practice_id = $2', [
      input.questionId,
      practiceId,
    ]);
    const question = found.rows[0];
    if (question === undefined) {
      throw new NotFoundError();
    }
    const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
    const redirect = `/p/${practiceId}/contracts/${question.contract_id}`;
    if (question.status === 'answered' && question.answer !== null && cipher.decrypt('contract_question.answer', question.answer) === input.answer) {
      return { objectId: input.questionId, redirect };
    }
    if (question.status !== 'open') {
      throw new InputError([{ field: 'answer', message: question.status === 'answered' ? 'this question was already answered' : 'the specialist withdrew this question' }]);
    }
    await scope.client.query("UPDATE contract_question SET status = 'answered', answer = $3, closed_by = app_actor_id(), closed_at = now() WHERE id = $1 AND practice_id = $2", [
      input.questionId,
      practiceId,
      cipher.encrypt('contract_question.answer', input.answer),
    ]);
    return { objectId: input.questionId, redirect };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ questionId: refs.questionId, answer: 'SYNTHETIC ANSWER: the exhibit is attached' }) },
});

export const CONTRACT_ROUTES = [contractsPage, contractPage, versionPage, tagContractDocument, signOffAction, answerQuestionAction] as const;
