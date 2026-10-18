import { type PracticeCipher, type PracticeScope, type ScopeClient, loadPracticeCipher, rolesPermit } from '@tp/db/runtime';
import { z } from 'zod';

import { practiceRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import {
  type ClaimLinePage,
  type ClaimsView,
  LINE_STAGE_FILTERS,
  type LineDetail,
  type LineStage,
  type PayerOption,
  type RemittanceDetail,
  type RemittancePage,
  claimByPayerControlNumber,
  lineDetail,
  listClaimLines,
  listRemittances,
  payerOptions,
  remittanceDetail,
} from '../remittances/queries';
import { type LineRunOption, type PricedLineView, lineRuns, pricedLineOf } from '../pricing/queries';
import { type TraceStepView, traceSteps } from '../pricing/view';
import type { Services } from '../server/services';
import { opaqueId, optionalText, requiredText } from './schemas';

/**
 * The Remittances and Claims and lines screens (PRD 7; PRD 6, Canonical model and matching; PRD 15,
 * Request path for a PHI page; docs/adr/0027). Practice routes: reading needs the workspace
 * (practice.open); the PHI columns (patients, claim control numbers, service dates) are filled only for
 * roles that read PHI (phi.read), and searching by a payer claim control number needs it too; adding a
 * note to a line needs case.work. Filters ride in the URL as opaque IDs, codes and months, never a
 * claim number or a name; a claim number is searched for through a form post that redirects to the
 * claim's opaque ID.
 */

/** A service or payment month, YYYY-MM. */
const month = optionalText(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'a month, YYYY-MM'));
const page = z.coerce.number().int().min(1).max(100_000).default(1);
const id = optionalText(opaqueId);

async function phiCipher(scope: PracticeScope<ScopeClient>, services: Services, practiceId: string, roles: readonly string[]): Promise<PracticeCipher | null> {
  return rolesPermit(roles, 'phi.read') ? loadPracticeCipher(scope, services.keys, practiceId) : null;
}

export interface RemittanceFilters {
  readonly payer?: string;
  readonly from?: string;
  readonly to?: string;
}

export interface RemittancesPageData {
  readonly practiceId: string;
  readonly filters: RemittanceFilters;
  readonly payers: readonly PayerOption[];
  readonly list: RemittancePage;
}

export const remittancesPage = practiceRoute({
  id: 'practice.remittances',
  kind: 'page',
  path: '/p/[practiceId]/remittances',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, payer: id, from: month, to: month, page }),
  handle: async ({ scope, practiceId, params, request }): Promise<RemittancesPageData> => {
    const filters: RemittanceFilters = {
      ...(params.payer === undefined ? {} : { payer: params.payer }),
      ...(params.from === undefined ? {} : { from: params.from }),
      ...(params.to === undefined ? {} : { to: params.to }),
    };
    const list = await listRemittances(scope, {
      practiceId,
      page: params.page,
      requestId: request.requestId,
      ...(params.payer === undefined ? {} : { payerId: params.payer }),
      ...(params.from === undefined ? {} : { from: params.from }),
      ...(params.to === undefined ? {} : { to: params.to }),
    });
    return { practiceId, filters, payers: await payerOptions(scope, practiceId), list };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

export interface RemittancePageData {
  readonly practiceId: string;
  readonly detail: RemittanceDetail;
  readonly canReadPhi: boolean;
}

export const remittancePage = practiceRoute({
  id: 'practice.remittances.remittance',
  kind: 'page',
  path: '/p/[practiceId]/remittances/[remittanceId]',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, remittanceId: opaqueId }),
  handle: async ({ scope, practiceId, params, request, services, access }): Promise<RemittancePageData> => {
    const cipher = await phiCipher(scope, services, practiceId, access.roles);
    const detail = await remittanceDetail(scope, practiceId, params.remittanceId, request.requestId, cipher);
    if (detail === undefined) {
      throw new NotFoundError();
    }
    return { practiceId, detail, canReadPhi: cipher !== null };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, remittanceId: refs.remittanceId }) },
});

export interface ClaimFilters {
  readonly view: ClaimsView;
  readonly payer?: string;
  readonly remittance?: string;
  readonly claim?: string;
  readonly patient?: string;
  readonly code?: string;
  readonly from?: string;
  readonly to?: string;
  readonly stage?: LineStage;
}

export interface ClaimsPageData {
  readonly practiceId: string;
  readonly filters: ClaimFilters;
  readonly payers: readonly PayerOption[];
  readonly list: ClaimLinePage;
  readonly canReadPhi: boolean;
  readonly roles: readonly string[];
}

export const claimsPage = practiceRoute({
  id: 'practice.claims',
  kind: 'page',
  path: '/p/[practiceId]/claims',
  phi: true,
  permission: 'practice.open',
  params: z.object({
    practiceId: opaqueId,
    view: z.enum(['net', 'all']).default('net'),
    payer: id,
    remittance: id,
    claim: id,
    patient: id,
    code: optionalText(
      z
        .string()
        .transform((value) => value.toUpperCase())
        .pipe(z.string().regex(/^[A-Z0-9]{1,8}$/, 'a procedure or revenue code')),
    ),
    from: month,
    to: month,
    stage: optionalText(z.enum(LINE_STAGE_FILTERS)),
    page,
  }),
  handle: async ({ scope, practiceId, params, request, services, access }): Promise<ClaimsPageData> => {
    const { view, payer, remittance, claim, patient, code, from, to, stage } = params;
    const filters: ClaimFilters = {
      view,
      ...(payer === undefined ? {} : { payer }),
      ...(remittance === undefined ? {} : { remittance }),
      ...(claim === undefined ? {} : { claim }),
      ...(patient === undefined ? {} : { patient }),
      ...(code === undefined ? {} : { code }),
      ...(from === undefined ? {} : { from }),
      ...(to === undefined ? {} : { to }),
      ...(stage === undefined ? {} : { stage }),
    };
    const cipher = await phiCipher(scope, services, practiceId, access.roles);
    const list = await listClaimLines(
      scope,
      {
        practiceId,
        view,
        page: params.page,
        requestId: request.requestId,
        ...(payer === undefined ? {} : { payerId: payer }),
        ...(remittance === undefined ? {} : { remittanceId: remittance }),
        ...(claim === undefined ? {} : { claimId: claim }),
        ...(patient === undefined ? {} : { patientRefId: patient }),
        ...(code === undefined ? {} : { procedureCode: code }),
        ...(from === undefined ? {} : { from }),
        ...(to === undefined ? {} : { to }),
        ...(stage === undefined ? {} : { stage }),
      },
      cipher,
    );
    return { practiceId, filters, payers: await payerOptions(scope, practiceId), list, canReadPhi: cipher !== null, roles: access.roles };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

/** A payer claim control number every synthetic world of the route tests holds a claim under. */
export const SAMPLE_PAYER_CLAIM_CONTROL_NUMBER = 'SYNCCNROUTE0001';

export const findClaim = practiceRoute({
  id: 'practice.claims.find',
  kind: 'action',
  path: '/p/[practiceId]/claims/find',
  phi: true,
  permission: 'phi.read',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ payerClaimControlNumber: requiredText(50) }),
  audit: { action: 'claim_searched', objectType: 'claim' },
  handle: async ({ scope, practiceId, input, services }): Promise<MutationResult> => {
    const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
    const claimId = await claimByPayerControlNumber(scope, practiceId, cipher, input.payerClaimControlNumber);
    if (claimId === undefined) {
      throw new InputError([{ field: 'payerClaimControlNumber', message: 'no claim of this practice has that payer claim control number' }]);
    }
    // The claim's opaque ID goes in the URL; the number searched for never does.
    return { objectId: claimId, redirect: `/p/${practiceId}/claims?view=all&claim=${claimId}` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: () => ({ payerClaimControlNumber: SAMPLE_PAYER_CLAIM_CONTROL_NUMBER }) },
});

export interface LinePageData {
  readonly practiceId: string;
  readonly detail: LineDetail;
  readonly canReadPhi: boolean;
  readonly canNote: boolean;
  /** The line as the run asked for (or the latest complete run that priced it) priced it; null before any did. */
  readonly pricing: PricedLineView | null;
  /** The steps of that run's trace, in the engine's order (roles that read PHI; the trace carries the line's dates). */
  readonly steps: readonly TraceStepView[];
  /** Every complete run that priced the line, newest first. */
  readonly runs: readonly LineRunOption[];
}

/**
 * The line trace page (PRD 7, Claims and lines: "Open the line trace"; PRD 11 step 9): the line's
 * facts, adjustments and notes, and how a complete pricing run priced it: the expected allowed, the
 * unrounded amount, the variance or the unpriced reason, and every step of its trace in order with the
 * rule records and the release it read. `run` picks one of the runs that priced the line; without it,
 * the latest. Every row is an audited read.
 */
export const linePage = practiceRoute({
  id: 'practice.lines.line',
  kind: 'page',
  path: '/p/[practiceId]/lines/[lineId]',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, lineId: opaqueId, run: id }),
  handle: async ({ scope, practiceId, params, request, services, access }): Promise<LinePageData> => {
    const cipher = await phiCipher(scope, services, practiceId, access.roles);
    const detail = await lineDetail(scope, practiceId, params.lineId, request.requestId, cipher);
    if (detail === undefined) {
      throw new NotFoundError();
    }
    const pricing = await pricedLineOf(scope, practiceId, params.lineId, params.run ?? null, cipher !== null, request.requestId);
    if (params.run !== undefined && pricing === undefined) {
      throw new NotFoundError();
    }
    return {
      practiceId,
      detail,
      canReadPhi: cipher !== null,
      canNote: rolesPermit(access.roles, 'case.work'),
      pricing: pricing ?? null,
      steps: pricing === undefined || cipher === null ? [] : traceSteps(pricing.trace),
      runs: await lineRuns(scope, practiceId, params.lineId),
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, lineId: refs.serviceLineId, run: refs.pricingRunId }) },
});

export const addLineNote = practiceRoute({
  id: 'practice.lines.note',
  kind: 'action',
  path: '/p/[practiceId]/lines/[lineId]/notes',
  phi: true,
  permission: 'case.work',
  params: z.object({ practiceId: opaqueId, lineId: opaqueId }),
  input: z.object({ note: requiredText(2000) }),
  audit: { action: 'line_note_added', objectType: 'line_note' },
  handle: async ({ scope, practiceId, params, input, services, actor }): Promise<MutationResult> => {
    const { rows } = await scope.client.query<{ id: string }>('SELECT id FROM service_line WHERE id = $1 AND practice_id = $2', [params.lineId, practiceId]);
    if (rows.length === 0) {
      throw new NotFoundError();
    }
    const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
    const inserted = await scope.client.query<{ id: string }>('INSERT INTO line_note (practice_id, service_line_id, note, created_by) VALUES ($1, $2, $3, $4) RETURNING id', [
      practiceId,
      params.lineId,
      cipher.encrypt('line_note.note', input.note),
      actor.userId,
    ]);
    return { objectId: (inserted.rows[0] as { id: string }).id, redirect: `/p/${practiceId}/lines/${params.lineId}` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, lineId: refs.serviceLineId }), input: () => ({ note: 'SYNTHETIC NOTE: call the payer about this line' }) },
});

export const REMITTANCE_ROUTES = [remittancesPage, remittancePage, claimsPage, findClaim, linePage, addLineNote] as const;
