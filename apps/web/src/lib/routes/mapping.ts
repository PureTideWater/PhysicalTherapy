import { mapPlan } from '@tp/contracts';
import { MAPPING_KINDS, rolesPermit } from '@tp/db/runtime';
import { z } from 'zod';

import { exclusiveEnd } from '../contracts/display';
import { type PlanDetail, type PlanPage, type PlanView, type Totals, listPlans, planDetail, waitingTotals } from '../contracts/mapping-queries';
import { practiceRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { type PayerOption, payerOptions } from '../remittances/queries';
import { opaqueId, optionalText } from './schemas';

/**
 * The Payer and plan mapping screen (PRD 5, J6; PRD 6, Payer and plan mapping; PRD 7: "unmapped
 * combinations with claim counts and dollars; mapped ones with their contract version ... map to a
 * version or 'no agreement'; set effective date ... dollars waiting on mapping shown at the top"; test
 * matrix MAP-01 to MAP-05). Reading needs the workspace (practice.open); mapping needs mapping.edit
 * (the billing manager and the firm principal). A plan maps to a signed-off version of one of its
 * payer's contracts, or as no agreement, Medicare Advantage non-contracted, government or other, from
 * a date. A correction is a new mapping that supersedes one; the one it corrects and every run priced
 * under it stay as they were (MAP-03). Mapping is idempotent: the same mapping submitted again changes
 * nothing.
 */

const page = z.coerce.number().int().min(1).max(100_000).default(1);
const id = optionalText(opaqueId);
const date = z.iso.date('a date (YYYY-MM-DD)');

export interface MappingFilters {
  readonly view: PlanView;
  readonly payer?: string;
}

export interface MappingPageData {
  readonly practiceId: string;
  readonly filters: MappingFilters;
  readonly payers: readonly PayerOption[];
  /** Dollars waiting on mapping, for the whole practice (shown at the top). */
  readonly waiting: Totals;
  readonly list: PlanPage;
  readonly canMap: boolean;
  readonly roles: readonly string[];
}

export const mappingPage = practiceRoute({
  id: 'practice.mapping',
  kind: 'page',
  path: '/p/[practiceId]/mapping',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, view: z.enum(['unmapped', 'mapped', 'all']).default('unmapped'), payer: id, page }),
  handle: async ({ scope, practiceId, params, request, access }): Promise<MappingPageData> => {
    const filters: MappingFilters = { view: params.view, ...(params.payer === undefined ? {} : { payer: params.payer }) };
    return {
      practiceId,
      filters,
      payers: await payerOptions(scope, practiceId),
      waiting: await waitingTotals(scope, practiceId),
      list: await listPlans(scope, { practiceId, view: params.view, page: params.page, requestId: request.requestId, ...(params.payer === undefined ? {} : { payerId: params.payer }) }),
      canMap: rolesPermit(access.roles, 'mapping.edit'),
      roles: access.roles,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

export type MappingNotice = 'mapped' | 'corrected' | 'unchanged';

export interface PlanPageData {
  readonly practiceId: string;
  readonly detail: PlanDetail;
  readonly canMap: boolean;
  readonly roles: readonly string[];
  readonly notice: MappingNotice | null;
}

export const planPage = practiceRoute({
  id: 'practice.mapping.plan',
  kind: 'page',
  path: '/p/[practiceId]/mapping/[planId]',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, planId: opaqueId, notice: z.enum(['mapped', 'corrected', 'unchanged']).optional().catch(undefined) }),
  handle: async ({ scope, practiceId, params, request, access }): Promise<PlanPageData> => {
    const detail = await planDetail(scope, practiceId, params.planId, request.requestId);
    if (detail === undefined) {
      throw new NotFoundError();
    }
    return { practiceId, detail, canMap: rolesPermit(access.roles, 'mapping.edit'), roles: access.roles, notice: params.notice ?? null };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, planId: refs.planId }) },
});

export const mapPlanAction = practiceRoute({
  id: 'practice.mapping.map',
  kind: 'action',
  path: '/p/[practiceId]/mapping/map',
  phi: true,
  permission: 'mapping.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({
    planId: opaqueId,
    kind: z.enum(MAPPING_KINDS),
    contractVersionId: optionalText(opaqueId),
    effectiveFrom: date,
    /** The last day the mapping covers; blank while it is open-ended. */
    lastDay: optionalText(date),
    /** The mapping this one corrects. */
    supersedesId: optionalText(opaqueId),
  }),
  audit: { action: 'plan_mapping_requested', objectType: 'payer_plan_mapping' },
  handle: async ({ scope, practiceId, input, request }): Promise<MutationResult> => {
    const plans = await scope.client.query<{ payer_id: string }>('SELECT payer_id FROM plan WHERE id = $1 AND practice_id = $2', [input.planId, practiceId]);
    const plan = plans.rows[0];
    if (plan === undefined) {
      throw new NotFoundError();
    }
    if (input.kind === 'contract') {
      if (input.contractVersionId === undefined) {
        throw new InputError([{ field: 'contractVersionId', message: 'choose the signed-off contract version the plan is paid under' }]);
      }
      const version = await scope.client.query(
        "SELECT 1 FROM contract_version v JOIN contract c ON c.id = v.contract_id WHERE v.id = $1 AND v.practice_id = $2 AND v.status = 'signed_off' AND c.payer_id = $3",
        [input.contractVersionId, practiceId, plan.payer_id],
      );
      if (version.rowCount === 0) {
        throw new InputError([{ field: 'contractVersionId', message: 'a signed-off version of one of this payer’s contracts' }]);
      }
    } else if (input.contractVersionId !== undefined) {
      throw new InputError([{ field: 'contractVersionId', message: 'only a contract mapping names a contract version' }]);
    }
    if (input.lastDay !== undefined && input.lastDay < input.effectiveFrom) {
      throw new InputError([{ field: 'lastDay', message: 'on or after the date the mapping starts' }]);
    }
    const effectiveTo = exclusiveEnd(input.lastDay);
    const contractVersionId = input.kind === 'contract' ? (input.contractVersionId ?? null) : null;
    const supersedesId = input.supersedesId ?? null;
    const planPath = `/p/${practiceId}/mapping/${input.planId}`;
    // The same mapping again (a form sent twice, or by two people): nothing to change.
    const same = await scope.client.query<{ id: string }>(
      `SELECT id FROM payer_plan_mapping
        WHERE practice_id = $1 AND plan_id = $2 AND mapping_kind = $3 AND contract_version_id IS NOT DISTINCT FROM $4::uuid
          AND effective_from = $5::date AND effective_to IS NOT DISTINCT FROM $6::date AND supersedes_id IS NOT DISTINCT FROM $7::uuid
        LIMIT 1`,
      [practiceId, input.planId, input.kind, contractVersionId, input.effectiveFrom, effectiveTo, supersedesId],
    );
    const existing = same.rows[0];
    if (existing !== undefined) {
      return { objectId: existing.id, redirect: `${planPath}?notice=unchanged` };
    }
    const { mappingId } = await mapPlan(
      { scope, requestId: request.requestId },
      { practiceId, planId: input.planId, kind: input.kind, contractVersionId, effectiveFrom: input.effectiveFrom, effectiveTo, supersedesId },
    );
    return { objectId: mappingId, redirect: `${planPath}?notice=${supersedesId === null ? 'mapped' : 'corrected'}` };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    input: (refs) => ({ planId: refs.planId, kind: 'contract', contractVersionId: refs.signedOffVersionId, effectiveFrom: '2026-01-01' }),
  },
});

export const MAPPING_ROUTES = [mappingPage, planPage, mapPlanAction] as const;
