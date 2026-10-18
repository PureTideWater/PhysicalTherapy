import { type PracticeScope, type ScopeClient, loadPracticeCipher, rolesPermit } from '@tp/db/runtime';
import { BUILT_IN_POSTING_TEMPLATES, LedgerSettingsError, type PostingTemplate } from '@tp/ledger';
import { type ManualContext, ReconciliationError, type ReconciliationRefusal, matchClaimByHand, matchDepositByHand, matchPostingByHand, reverseMatch, setPostingTemplate } from '@tp/worker/ledger';
import { z } from 'zod';

import { practiceRoute } from '../http/invoke';
import { pageParam, type ListPage } from '../http/paging';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { type EntryView, type ExportView, type LinkageLine, type TotalsView, type UnmatchedView, matchState, practiceExports, reconciliation, standingMatch, templateState } from '../reconciliation/queries';
import { templateForm, templateOf } from '../reconciliation/template';
import type { Services } from '../server/services';
import { CONTENT_TYPES, MAX_FILES_PER_BATCH, MAX_UPLOAD_BYTES } from '../uploads/limits';
import { opaqueId } from './schemas';
import { NO_BAA, baaOnFile } from './uploads';

/**
 * The Reconciliation screen and the posting-template mapping (PRD 7, Reconciliation: "ERA to posting
 * to EFT linkage per case line; unmatched adjusted payments; recoupments; ledger entries | Upload posting
 * and EFT exports; match manually; reverse a match | Unmatched items never count; every match shows its
 * evidence"; PRD 5, J10; PRD 13, Matching; PRD 20, Posting-export templates; docs/adr/0042 and 0043).
 *
 * Reading the ledger is report.read (the viewer reads it too, without PHI columns). Matching by hand,
 * reversing a match and mapping the posting template are posting.reconcile, checked here, in
 * @tp/worker/ledger and again by the database, and each is in the person's own name: a manual match
 * records the person, with a tolerance of zero still; a reversal needs a reason and the person's
 * confirmation of what it does, and writes an exactly offsetting entry. An adjustment of an entry is a
 * contract specialist's (ledger.adjust; PRD 13: "A specialist corrects an amount after review"), on the
 * specialist's own ledger page (./specialist.ts, docs/adr/0047). Uploading the exports is the
 * Uploads screen's own (file.upload), embedded here; the worker's intake scans and sniffs each one and
 * queues the reconcile. The template is previewed on a sample in the browser, which never leaves it.
 */

type Scope = PracticeScope<ScopeClient>;

export interface UploadPanel {
  readonly canUpload: boolean;
  readonly gate: { readonly open: boolean; readonly reason: string | null };
  readonly limits: { readonly maxFiles: number; readonly maxBytes: number };
  readonly kinds: readonly { readonly kind: 'posting_export' | 'eft_export'; readonly contentTypes: readonly string[] }[];
}

export interface ReconciliationPageData {
  readonly practiceId: string;
  readonly caseId: string | null;
  readonly totals: TotalsView;
  readonly linkage: ListPage<LinkageLine>;
  readonly entries: ListPage<EntryView>;
  readonly unmatched: UnmatchedView;
  readonly exports: ListPage<ExportView>;
  readonly template: { readonly system: string | null; readonly waiting: number };
  readonly canReconcile: boolean;
  /** Whether the reader sees PHI columns (dates of service, codes, the people's reasons). */
  readonly phi: boolean;
  readonly upload: UploadPanel;
  readonly roles: readonly string[];
  readonly notice: ReconciliationNotice | null;
}

export const RECONCILIATION_NOTICES = ['matched', 'reversed', 'already_matched', 'already_reversed'] as const;
export type ReconciliationNotice = (typeof RECONCILIATION_NOTICES)[number];

async function caseOfPractice(scope: Scope, practiceId: string, caseId: string): Promise<void> {
  const { rows } = await scope.client.query('SELECT 1 FROM "case" WHERE id = $1 AND practice_id = $2', [caseId, practiceId]);
  if (rows.length === 0) {
    throw new NotFoundError();
  }
}

export const reconciliationPage = practiceRoute({
  id: 'practice.reconciliation',
  kind: 'page',
  path: '/p/[practiceId]/reconciliation',
  phi: true,
  permission: 'report.read',
  params: z.object({
    practiceId: opaqueId,
    case: opaqueId.optional(),
    lines: pageParam,
    entries: pageParam,
    exports: pageParam,
    notice: z.enum(RECONCILIATION_NOTICES).optional().catch(undefined),
  }),
  handle: async ({ scope, practiceId, params, access, request, services }): Promise<ReconciliationPageData> => {
    const caseId = params.case ?? null;
    if (caseId !== null) {
      await caseOfPractice(scope, practiceId, caseId);
    }
    const phi = rolesPermit(access.roles, 'phi.read');
    const data = await reconciliation(scope, services, practiceId, { caseId, linesPage: params.lines, entriesPage: params.entries }, phi, request.requestId);
    const template = await templateState(scope, practiceId);
    const open = await baaOnFile(scope, practiceId);
    return {
      practiceId,
      caseId,
      ...data,
      exports: await practiceExports(scope, practiceId, params.exports, request.requestId),
      template: { system: template.settings.postingTemplate?.system ?? null, waiting: template.waiting },
      canReconcile: rolesPermit(access.roles, 'posting.reconcile'),
      phi,
      upload: {
        canUpload: rolesPermit(access.roles, 'file.upload'),
        gate: { open, reason: open ? null : NO_BAA },
        limits: { maxFiles: MAX_FILES_PER_BATCH, maxBytes: MAX_UPLOAD_BYTES },
        kinds: [
          { kind: 'posting_export', contentTypes: CONTENT_TYPES.posting_export },
          { kind: 'eft_export', contentTypes: CONTENT_TYPES.eft_export },
        ],
      },
      roles: access.roles,
      notice: params.notice ?? null,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

/** What a refusal of @tp/worker/ledger says on the form: the field, never a value. */
export const REFUSALS: Readonly<Record<Exclude<ReconciliationRefusal, 'not_found'>, { readonly field: string; readonly message: string }>> = {
  already_matched: { field: 'match', message: 'this evidence is already matched to something else; reverse that match first' },
  not_open: { field: 'serviceLineId', message: 'the case line is not open: it was written off, or its case is closed' },
  not_comparable: { field: 'claimId', message: 'the payment has no line of the case line’s code and date of service' },
  amount_mismatch: { field: 'remittanceId', message: 'the amounts do not agree to the cent; a match has a tolerance of zero' },
  not_standing: { field: 'matchId', message: 'the match was already reversed' },
  reverse_postings_first: { field: 'matchId', message: 'the payment’s posting or deposit matches stand on this approval; reverse them first' },
  no_change_in_amount: { field: 'amount', message: 'an adjustment changes the amount' },
};

/** Runs a step of @tp/worker/ledger in the request's scope, its refusals said on the form (field and words, never a value). */
export async function manual<T>(
  scope: Scope,
  services: Services,
  practiceId: string,
  requestId: string,
  run: (context: ManualContext) => Promise<T>,
  refusals: Partial<typeof REFUSALS> = {},
): Promise<T> {
  const context: ManualContext = { scope, cipher: await loadPracticeCipher(scope, services.keys, practiceId), keys: services.keys, requestId };
  try {
    return await run(context);
  } catch (error) {
    if (error instanceof ReconciliationError) {
      if (error.code === 'not_found') {
        throw new NotFoundError();
      }
      throw new InputError([refusals[error.code] ?? REFUSALS[error.code]]);
    }
    throw error;
  }
}

const back = (practiceId: string, notice: ReconciliationNotice) => `/p/${practiceId}/reconciliation?notice=${notice}`;

/**
 * Matches an unmatched posting row to the remittance a person names (its check or trace number, or an
 * amount the person vouches for: the amounts still agree to the cent). The same match made again is
 * the one already standing.
 */
export const matchPostingAction = practiceRoute({
  id: 'practice.reconciliation.match_posting',
  kind: 'action',
  path: '/p/[practiceId]/reconciliation/match-posting',
  phi: true,
  permission: 'posting.reconcile',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ postingRowId: opaqueId, remittanceId: opaqueId }),
  audit: { action: 'reconciliation_match', objectType: 'ledger_match' },
  handle: async ({ scope, practiceId, input, services, request }): Promise<MutationResult> => {
    const existing = await standingMatch(scope, practiceId, { kind: 'posting', evidenceId: input.postingRowId, remittanceId: input.remittanceId });
    if (existing !== null) {
      return { objectId: existing, redirect: back(practiceId, 'already_matched') };
    }
    const { matchId } = await manual(scope, services, practiceId, request.requestId, (context) => matchPostingByHand(context, { practiceId, ...input }));
    return { objectId: matchId, redirect: back(practiceId, 'matched') };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ postingRowId: refs.postingRowId, remittanceId: refs.remittanceId }) },
});

/** Matches an unmatched EFT or bank row to the remittance a person names: its payment exactly. */
export const matchDepositAction = practiceRoute({
  id: 'practice.reconciliation.match_deposit',
  kind: 'action',
  path: '/p/[practiceId]/reconciliation/match-deposit',
  phi: true,
  permission: 'posting.reconcile',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ eftRowId: opaqueId, remittanceId: opaqueId }),
  audit: { action: 'reconciliation_match', objectType: 'ledger_match' },
  handle: async ({ scope, practiceId, input, services, request }): Promise<MutationResult> => {
    const existing = await standingMatch(scope, practiceId, { kind: 'deposit', evidenceId: input.eftRowId, remittanceId: input.remittanceId });
    if (existing !== null) {
      return { objectId: existing, redirect: back(practiceId, 'already_matched') };
    }
    const { matchId } = await manual(scope, services, practiceId, request.requestId, (context) => matchDepositByHand(context, { practiceId, ...input }));
    return { objectId: matchId, redirect: back(practiceId, 'matched') };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ eftRowId: refs.eftRowId, remittanceId: refs.remittanceId }) },
});

/**
 * Matches an adjusted payment no case line was found for to the open case line a person names: compared
 * as the reconcile step compares it (a higher allowed approves the difference; a lower takes back an
 * approval; otherwise a payer response "reprocessed, no change" in the person's name).
 */
export const matchClaimAction = practiceRoute({
  id: 'practice.reconciliation.match_claim',
  kind: 'action',
  path: '/p/[practiceId]/reconciliation/match-claim',
  phi: true,
  permission: 'posting.reconcile',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ claimId: opaqueId, serviceLineId: opaqueId }),
  audit: { action: 'reconciliation_match', objectType: 'ledger_match' },
  handle: async ({ scope, practiceId, input, services, request }): Promise<MutationResult> => {
    const existing = await standingMatch(scope, practiceId, { kind: 'claim', evidenceId: input.claimId, serviceLineId: input.serviceLineId });
    if (existing !== null) {
      return { objectId: existing, redirect: back(practiceId, 'already_matched') };
    }
    const { matchId } = await manual(scope, services, practiceId, request.requestId, (context) => matchClaimByHand(context, { practiceId, ...input }));
    return { objectId: matchId, redirect: back(practiceId, 'matched') };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ claimId: refs.adjustedClaimId, serviceLineId: refs.caseServiceLineId }) },
});

/** What a reversal does, stated before it is confirmed (PRD 7: "every destructive action ... confirms with the consequence stated"). */
export const REVERSAL_CONSEQUENCE =
  'Reversing writes an entry that offsets each of this match’s entries, and each adjustment of them, exactly, in your name with your reason; the match stays in the ledger as reversed, its evidence is listed unmatched again, and the reconcile job never matches it the same way again. Recovered (posted or deposited) and the line’s stage move back with it.';

/** Reverses a standing match with the person's reason; a match already reversed is left as it is. */
export const reverseMatchAction = practiceRoute({
  id: 'practice.reconciliation.reverse',
  kind: 'action',
  path: '/p/[practiceId]/reconciliation/reverse',
  phi: true,
  permission: 'posting.reconcile',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({
    matchId: opaqueId,
    reason: z.string().trim().min(1, 'say why the match is reversed').max(2000, 'at most 2,000 characters'),
    confirm: z.literal('on', 'confirm what a reversal does'),
  }),
  audit: { action: 'reconciliation_reversal', objectType: 'ledger_match' },
  handle: async ({ scope, practiceId, input, services, request }): Promise<MutationResult> => {
    const state = await matchState(scope, practiceId, input.matchId);
    if (state === 'missing') {
      throw new NotFoundError();
    }
    if (state === 'reversed') {
      return { objectId: input.matchId, redirect: back(practiceId, 'already_reversed') };
    }
    await manual(scope, services, practiceId, request.requestId, (context) => reverseMatch(context, { practiceId, matchId: input.matchId, reason: input.reason }));
    return { objectId: input.matchId, redirect: back(practiceId, 'reversed') };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ matchId: refs.reversibleMatchId, reason: 'SYNTHETIC matched to the wrong check', confirm: 'on' }) },
});

export interface TemplatePageData {
  readonly practiceId: string;
  /** The practice's template: a built-in one, its own mapping, or none yet. */
  readonly current: PostingTemplate | null;
  readonly builtIn: readonly PostingTemplate[];
  /** Posting exports stored and waiting for a template. */
  readonly waiting: number;
  readonly proofLevel: 'posted' | 'deposited';
  readonly canMap: boolean;
  readonly roles: readonly string[];
  readonly saved: boolean;
}

/** The posting-template mapping screen, used once at onboarding (PRD 20). */
export const templatePage = practiceRoute({
  id: 'practice.reconciliation.template',
  kind: 'page',
  path: '/p/[practiceId]/reconciliation/template',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, notice: z.literal('saved').optional().catch(undefined) }),
  handle: async ({ scope, practiceId, params, access }): Promise<TemplatePageData> => {
    const state = await templateState(scope, practiceId);
    return {
      practiceId,
      current: state.settings.postingTemplate,
      builtIn: BUILT_IN_POSTING_TEMPLATES,
      waiting: state.waiting,
      proofLevel: state.settings.proofLevel,
      canMap: rolesPermit(access.roles, 'posting.reconcile'),
      roles: access.roles,
      saved: params.notice === 'saved',
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

/**
 * Saves the practice's posting template, once per practice-management system: a built-in template or
 * the practice's own mapping. The posting exports waiting for it are reconciled at once (the reconcile
 * keyed by each export).
 */
export const saveTemplateAction = practiceRoute({
  id: 'practice.reconciliation.save_template',
  kind: 'action',
  path: '/p/[practiceId]/reconciliation/template/save',
  phi: true,
  permission: 'posting.reconcile',
  params: z.object({ practiceId: opaqueId }),
  input: templateForm,
  audit: { action: 'posting_template_saved', objectType: 'practice' },
  handle: async ({ scope, practiceId, input, services, request }): Promise<MutationResult> => {
    const read = templateOf(input);
    if ('issues' in read) {
      throw new InputError(read.issues);
    }
    let waiting: readonly string[];
    try {
      ({ waiting } = await setPostingTemplate(scope, { practiceId, template: read.template, requestId: request.requestId }));
    } catch (error) {
      if (error instanceof LedgerSettingsError) {
        throw new InputError([{ field: 'template', message: 'the ledger cannot read this template back; check its columns and date format' }]);
      }
      throw error;
    }
    for (const documentId of waiting) {
      // Queued in the request: a failure to queue undoes the mapping, so no export waits on a job never sent.
      await services.queue.enqueue('reconcile', { practice_id: practiceId, document_id: documentId });
    }
    return { objectId: practiceId, redirect: `/p/${practiceId}/reconciliation/template?notice=saved` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: () => ({ template: 'synthetic_pm_export_v1' }) },
});

export const RECONCILIATION_ROUTES = [reconciliationPage, matchPostingAction, matchDepositAction, matchClaimAction, reverseMatchAction, templatePage, saveTemplateAction] as const;
