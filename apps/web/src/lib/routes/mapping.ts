import { mapPlan } from '@tp/contracts';
import { MAPPING_KINDS, type PracticeScope, type ScopeClient, recordAuditEvent, rolesPermit } from '@tp/db/runtime';
import { PricingLocationWaiting, RerunRefusedError, RuleReleaseMismatchError, createRerun, currentReleaseNo } from '@tp/worker/pricing';
import { z } from 'zod';

import { ownerHolds, workPause } from '../billing/hold';
import type { WorkPause } from '../billing/suspension-words';
import { exclusiveEnd } from '../contracts/display';
import {
  type PlanDetail,
  type PlanPage,
  type PlanView,
  type Totals,
  type UnmappedPlanTotals,
  listPlans,
  planDetail,
  unmappedPlanTotals,
  waitingTotals,
} from '../contracts/mapping-queries';
import { practiceRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import {
  type MappedNotPricedTotals,
  type MonthToPriceAgain,
  type MonthToTriage,
  type MonthsWaiting,
  PRICE_AGAIN_LIMIT,
  lockPlanMonths,
  mappedNotPricedTotals,
  monthsAwaitingMappings,
  monthsToPriceAgain,
  monthsToQueue,
  monthsToTriage,
  monthsWaitingForMappings,
  priceAgainSets,
} from '../pricing/mapped-plan';
import { type PayerOption, payerOptions } from '../remittances/queries';
import { LOCATION_WAITING } from './pricing';
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
 *
 * A plan with no mapping never freezes a month (combined audit #32; docs/adr/0075; MAP-06 to MAP-09, PRC-29, PRC-31):
 * a run prices every other line and leaves the plan's own lines unpriced. So the screens also say what a mapping leaves
 * to price (lib/pricing/mapped-plan.ts). A mapping that leaves a month no run covers with every plan mapped, and not
 * held on the billing ZIP or on Medicare content, queues monitoring of exactly those months (D2b, D20): onboarding
 * stays at first runs with no hand acceptance, in any order of mappings. Months still waiting on other plans' mappings
 * are offered "Price them now" (practice.mapping.price_waiting: monitoring of every month no run covers). Months
 * already priced whose pricing in effect leaves lines of a mapped plan NO_MAPPING are offered "Price these months
 * again" (practice.mapping.price_again): one re-run of each run in effect, in the person's name under #50's rule
 * (createRerun; docs/adr/0037), each accepted by hand on its page after its diff (J17), never a second re-run of a
 * month already being priced again since its newest mapping. The mapping and the press take the practice's months
 * lock first (D22), so two people at once queue monitoring once and create one re-run per month. Both new routes
 * start work and are refused while the practice is suspended (RUN_STARTING_ROUTES); the mapping itself stays allowed
 * while suspended, but queues nothing while the practice's own organization holds it and says why (mapped_held,
 * corrected_held; PR #95 review security F1): the worker would refuse its monitoring job, so "being priced" would be
 * false. The mapping's own monitoring is the practice's work, in neither of SS-01's lists: a grantee's hold on the
 * person who maps never stops it, since the worker's gate applies the owner's hold alone to the practice's jobs
 * (docs/adr/0080, Known limits; SS-01 review security F1).
 */

const page = z.coerce.number().int().min(1).max(100_000).default(1);
const id = optionalText(opaqueId);
const date = z.iso.date('a date (YYYY-MM-DD)');
const VIEWS = ['unmapped', 'mapped', 'all'] as const;

export interface MappingFilters {
  readonly view: PlanView;
  readonly payer?: string;
}

/**
 * The notices the mapping list shows after its own actions (design 5.3): re-runs created (priced_again), none created
 * because every posted month was already being priced again by someone else's press (already_pricing, PR #95 review
 * R2-5), and monitoring requested (pricing_requested).
 */
export const MAPPING_LIST_NOTICES = ['priced_again', 'already_pricing', 'pricing_requested'] as const;
export type MappingListNotice = (typeof MAPPING_LIST_NOTICES)[number];

/**
 * What a mapping leaves to price, for the practice or for one plan (design 4.1 to 4.3): the months no run covers that
 * wait for other plans' mappings ("Price them now"), the runs in effect holding lines of mapped plans still NO_MAPPING
 * with each one's state ("Price these months again"), the ready runs the form posts (oldest first, at most
 * PRICE_AGAIN_LIMIT), and the accepted re-runs whose newly priced lines wait for triage on Cases.
 */
export interface MonthsToPrice {
  readonly waiting: MonthsWaiting;
  readonly priceAgain: readonly MonthToPriceAgain[];
  /** The ready runs' IDs the form posts as runIds[], oldest first, at most PRICE_AGAIN_LIMIT. */
  readonly readyRunIds: readonly string[];
  readonly toTriage: readonly MonthToTriage[];
  /** The rule release in force, which a re-run pins (the form posts it); null when none is. */
  readonly releaseNo: number | null;
}

async function monthsToPrice(scope: PracticeScope<ScopeClient>, practiceId: string, planId: string | null, requestId: string): Promise<MonthsToPrice> {
  const priceAgain = await monthsToPriceAgain(scope, practiceId, planId, requestId);
  return {
    waiting: monthsWaitingForMappings(await monthsAwaitingMappings(scope, practiceId), planId),
    priceAgain,
    readyRunIds: priceAgainSets(priceAgain).ready.map((month) => month.pricingRunId),
    toTriage: await monthsToTriage(scope, practiceId, planId, requestId),
    releaseNo: await currentReleaseNo(scope.client),
  };
}

export interface MappingPageData {
  readonly practiceId: string;
  readonly filters: MappingFilters;
  readonly payers: readonly PayerOption[];
  /** Dollars waiting on mapping, for the whole practice (shown at the top). */
  readonly waiting: Totals;
  readonly list: PlanPage;
  /** The plans with no mapping in force on their lines' dates, whose lines no run prices (MAP-06; R3N-1), and the lines of mapped plans still NO_MAPPING in effect (PRC-31). */
  readonly unmappedPlans: UnmappedPlanTotals;
  readonly mappedNotPriced: MappedNotPricedTotals;
  /** The practice's months to price, for the two regions below the card. */
  readonly months: MonthsToPrice;
  readonly notice: MappingListNotice | null;
  /**
   * Why the person starts no pricing here now (lib/billing/hold.ts workPause with mapping.edit, the price buttons'
   * permission: the route wrapper's question), whose hold it is and whether lifting it restarts the work, or null.
   * "Price them now" and "Price these months again" are refused while it holds (RUN_STARTING_ROUTES); the screens say
   * so with this reason, as Uploads does (security F1). Only the owner's hold also stops the practice's own monitoring.
   */
  readonly suspension: WorkPause | null;
  readonly canMap: boolean;
  /** Whether the person may triage on Cases (case.work), which an accepted re-run's row links to. */
  readonly canWorkCases: boolean;
  readonly roles: readonly string[];
}

export const mappingPage = practiceRoute({
  id: 'practice.mapping',
  kind: 'page',
  path: '/p/[practiceId]/mapping',
  phi: true,
  permission: 'practice.open',
  params: z.object({
    practiceId: opaqueId,
    view: z.enum(VIEWS).default('unmapped'),
    payer: id,
    page,
    notice: z.enum(MAPPING_LIST_NOTICES).optional().catch(undefined),
  }),
  handle: async ({ scope, practiceId, params, request, access }): Promise<MappingPageData> => {
    const filters: MappingFilters = { view: params.view, ...(params.payer === undefined ? {} : { payer: params.payer }) };
    return {
      practiceId,
      filters,
      payers: await payerOptions(scope, practiceId),
      waiting: await waitingTotals(scope, practiceId),
      list: await listPlans(scope, { practiceId, view: params.view, page: params.page, requestId: request.requestId, ...(params.payer === undefined ? {} : { payerId: params.payer }) }),
      unmappedPlans: await unmappedPlanTotals(scope, practiceId),
      mappedNotPriced: await mappedNotPricedTotals(scope.client, practiceId),
      months: await monthsToPrice(scope, practiceId, null, request.requestId),
      notice: params.notice ?? null,
      suspension: await workPause(scope, practiceId, 'mapping.edit'),
      canMap: rolesPermit(access.roles, 'mapping.edit'),
      canWorkCases: rolesPermit(access.roles, 'case.work'),
      roles: access.roles,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

/**
 * The plan page's notices (design 5.3): today's three, and after a mapping that queued monitoring of the months it
 * completed (mapped_pricing, corrected_pricing), after a mapping that completed months while the practice's own
 * organization held new work, so nothing was queued (mapped_held, corrected_held; the page shows `suspension`),
 * after "Price these months again" (priced_again, or already_pricing when every posted month was already being priced
 * again) and after "Price them now" (pricing_requested).
 */
export const MAPPING_NOTICES = [
  'mapped',
  'corrected',
  'unchanged',
  'mapped_pricing',
  'corrected_pricing',
  'mapped_held',
  'corrected_held',
  'priced_again',
  'already_pricing',
  'pricing_requested',
] as const;
export type MappingNotice = (typeof MAPPING_NOTICES)[number];

export interface PlanPageData {
  readonly practiceId: string;
  readonly detail: PlanDetail;
  /** The plan's months to price: those holding its lines that wait for other plans' mappings, and the priced months holding its lines still NO_MAPPING. */
  readonly months: MonthsToPrice;
  readonly canMap: boolean;
  /** Whether the person may triage on Cases (case.work), which an accepted re-run's row links to. */
  readonly canWorkCases: boolean;
  readonly roles: readonly string[];
  readonly notice: MappingNotice | null;
  /** Why the person starts no pricing here now (workPause with mapping.edit), or null: see MappingPageData.suspension. */
  readonly suspension: WorkPause | null;
}

export const planPage = practiceRoute({
  id: 'practice.mapping.plan',
  kind: 'page',
  path: '/p/[practiceId]/mapping/[planId]',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, planId: opaqueId, notice: z.enum(MAPPING_NOTICES).optional().catch(undefined) }),
  handle: async ({ scope, practiceId, params, request, access }): Promise<PlanPageData> => {
    const detail = await planDetail(scope, practiceId, params.planId, request.requestId);
    if (detail === undefined) {
      throw new NotFoundError();
    }
    return {
      practiceId,
      detail,
      months: await monthsToPrice(scope, practiceId, params.planId, request.requestId),
      canMap: rolesPermit(access.roles, 'mapping.edit'),
      canWorkCases: rolesPermit(access.roles, 'case.work'),
      roles: access.roles,
      notice: params.notice ?? null,
      suspension: await workPause(scope, practiceId, 'mapping.edit'),
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, planId: refs.planId }) },
});

/**
 * Maps a plan (or corrects a mapping) from a date. Under the practice's months lock, taken before any read (D22), and
 * in the same transaction after the mapping, it reads the months no run covers (monthsAwaitingMappings sees the new
 * mapping): when a release is in force and the mapping leaves a month holding this plan's lines with every plan mapped
 * and not held on the billing ZIP or on Medicare content, it queues monitoring once the mapping commits, keyed by the
 * request and naming every such complete month (D2b, D20), and says so (mapped_pricing, corrected_pricing); otherwise
 * nothing is queued and the notice is today's. A month's plans count as mapped by the mapping in force on their lines'
 * dates (R3N-1), so a mapping only for other dates completes nothing. While the practice's own organization holds new
 * work (practice_run_hold's owner row, asked in the same transaction: the hold the worker's gate applies to the
 * practice's jobs) the mapping is kept and nothing is queued, since the worker would refuse the job: the notice says so
 * (mapped_held, corrected_held; security F1), and the daily monitor prices the months once the hold lifts. A grantee's
 * hold on the person who maps stops only their own work, so the practice's monitoring is queued as under no hold (SS-01
 * review security F1; docs/adr/0080). The same mapping again changes nothing and queues nothing.
 */
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
  handle: async ({ scope, practiceId, input, request, services, afterCommit }): Promise<MutationResult> => {
    await lockPlanMonths(scope.client, practiceId);
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
    // The months this mapping completes (D2b), and with them every complete month (D20): planned once the mapping
    // commits, so the plan the job starts reads it. Dates only in the payload.
    const months = monthsToQueue(await monthsAwaitingMappings(scope, practiceId), input.planId);
    const held = months.length > 0 && (await ownerHolds(scope, practiceId));
    if (months.length > 0 && !held) {
      afterCommit(() => services.queue.enqueue('monitor', { practice_id: practiceId, request_id: request.requestId, months }));
    }
    const notice: MappingNotice =
      supersedesId === null
        ? months.length === 0
          ? 'mapped'
          : held
            ? 'mapped_held'
            : 'mapped_pricing'
        : months.length === 0
          ? 'corrected'
          : held
            ? 'corrected_held'
            : 'corrected_pricing';
    return { objectId: mappingId, redirect: `${planPath}?notice=${notice}` };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    input: (refs) => ({ planId: refs.planId, kind: 'contract', contractVersionId: refs.signedOffVersionId, effectiveFrom: '2026-01-01' }),
  },
});

/**
 * The mapping list's filters a form of the list posts back (UX-7: "filters in the URL"), each optional and dropped when
 * it is not a valid value, as the list page reads them.
 */
const listFilters = {
  view: z.enum(VIEWS).optional().catch(undefined),
  payer: id.catch(undefined),
};

/**
 * Where an action of the mapping screens returns: the plan's page it came from, or the mapping list with the filters it
 * was showing (view, payer), then the notice.
 */
function returnPath(practiceId: string, planId: string | undefined, notice: MappingNotice, filters: { readonly view?: string | undefined; readonly payer?: string | undefined } = {}): string {
  if (planId !== undefined) {
    return `/p/${practiceId}/mapping/${planId}?notice=${notice}`;
  }
  const query = new URLSearchParams();
  if (filters.view !== undefined) {
    query.set('view', filters.view);
  }
  if (filters.payer !== undefined) {
    query.set('payer', filters.payer);
  }
  query.set('notice', notice);
  return `/p/${practiceId}/mapping?${query.toString()}`;
}

/** The plan a form of a plan's page names, the practice's own (another practice's is invisible under RLS anyway). */
async function requirePlan(scope: PracticeScope<ScopeClient>, practiceId: string, planId: string | undefined): Promise<void> {
  if (planId === undefined) {
    return;
  }
  const { rowCount } = await scope.client.query('SELECT 1 FROM plan WHERE id = $1 AND practice_id = $2', [planId, practiceId]);
  if (rowCount === 0) {
    throw new NotFoundError();
  }
}

/**
 * "Price them now" (design 4.1; MAP-07): queues monitoring of every month no run covers, mixed months included (their
 * plans with no mapping stay NO_MAPPING), once the request commits, keyed by the request so one press queues one job.
 * It creates no run itself, and never a re-run (the monitor creates first runs only). It starts work, so a suspended
 * practice is refused with the database's reason before it runs (RUN_STARTING_ROUTES), and the job is refused again in
 * the worker. The plan is posted only to return to its page.
 */
export const priceWaitingAction = practiceRoute({
  id: 'practice.mapping.price_waiting',
  kind: 'action',
  path: '/p/[practiceId]/mapping/price-waiting',
  phi: true,
  permission: 'mapping.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ planId: optionalText(opaqueId), ...listFilters }),
  audit: { action: 'monitoring_requested', objectType: 'practice' },
  handle: async ({ scope, practiceId, input, request, services, afterCommit }): Promise<MutationResult> => {
    await requirePlan(scope, practiceId, input.planId);
    afterCommit(() => services.queue.enqueue('monitor', { practice_id: practiceId, request_id: request.requestId }));
    return { objectId: practiceId, redirect: returnPath(practiceId, input.planId, 'pricing_requested', input) };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: () => ({}) },
});

/** The months the form posts, each a hidden runIds[] field (form.ts joins them): one to PRICE_AGAIN_LIMIT runs. */
const runIds = z
  .string()
  .default('')
  .transform((value) => value.split(',').filter((part) => part !== ''))
  .pipe(z.array(opaqueId).min(1).max(PRICE_AGAIN_LIMIT));

/** What the form says when its months are not the months now (design 4.2 step 3, months_changed): nothing was created. */
export const MONTHS_CHANGED = 'the months changed since this page was shown: review them below and try again';

/**
 * A refusal of a month's re-run, as the field the form names it against (finding 7): createRerun's refusals on runIds,
 * naming the month by its dates (the service's messages read after "This run:" and read the same after the dates), the
 * release mismatch and the location's wait on releaseNo. Dates and states only, never PHI.
 */
export function priceAgainRefusal(error: unknown, month: { readonly periodFrom: string; readonly periodTo: string }): InputError | undefined {
  if (error instanceof RerunRefusedError) {
    return new InputError([{ field: 'runIds', message: `${month.periodFrom} to ${month.periodTo}: ${error.message}.` }]);
  }
  if (error instanceof RuleReleaseMismatchError) {
    return new InputError([{ field: 'releaseNo', message: `${error.message}; reload the page to price under the release in force.` }]);
  }
  if (error instanceof PricingLocationWaiting) {
    return new InputError([{ field: 'releaseNo', message: LOCATION_WAITING }]);
  }
  return undefined;
}

/**
 * "Price these months again" (design 4.2; MAP-08, MAP-09, PRC-29): one re-run of each posted run in effect holding lines
 * of mapped plans still NO_MAPPING, for the practice or one plan, in the person's name (createRerun, #50's rule and
 * refusals), each queued in the request (a failure to queue undoes them all) and audited on its own
 * (pricing_run_rerun_created). Nothing is accepted: each re-run is accepted by hand on its page after its diff (J17).
 * Under the practice's months lock, taken first (D22), the months are read again: when a ready month was not posted,
 * or a posted month is neither ready nor already being priced again since its newest mapping (it left the list, waits
 * for a newer run, its last re-run failed on what has not changed, or it is not the practice's), nothing is created
 * (months_changed); a posted month already being priced again is skipped, so a second press, by anyone, at any moment,
 * creates no second re-run (D4), and a press that creates none says so (already_pricing, R2-5; its audit event is
 * kept, the record that the press happened). Any refusal rolls the whole request back.
 */
export const priceAgainAction = practiceRoute({
  id: 'practice.mapping.price_again',
  kind: 'action',
  path: '/p/[practiceId]/mapping/price-again',
  phi: true,
  permission: 'mapping.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({
    planId: optionalText(opaqueId),
    runIds,
    /** The release the screen showed as in force. */
    releaseNo: z.coerce.number().int().min(1),
    ...listFilters,
  }),
  audit: { action: 'plan_months_priced_again', objectType: 'practice' },
  handle: async ({ scope, practiceId, input, request, services }): Promise<MutationResult> => {
    await lockPlanMonths(scope.client, practiceId);
    await requirePlan(scope, practiceId, input.planId);
    const { ready, already } = priceAgainSets(await monthsToPriceAgain(scope, practiceId, input.planId ?? null, request.requestId));
    const posted = new Set(input.runIds);
    const readyIds = new Set(ready.map((month) => month.pricingRunId));
    if (ready.some((month) => !posted.has(month.pricingRunId)) || [...posted].some((runId) => !readyIds.has(runId) && !already.has(runId))) {
      throw new InputError([{ field: 'runIds', message: MONTHS_CHANGED }]);
    }
    for (const month of ready) {
      let created;
      try {
        created = await createRerun(scope, { practiceId, pricingRunId: month.pricingRunId, releaseNo: input.releaseNo, requestId: request.requestId });
      } catch (error) {
        throw priceAgainRefusal(error, month) ?? error;
      }
      // Queued in the request, as the single re-run: a failure to queue undoes every re-run of the press.
      await services.queue.enqueue('price', { practice_id: practiceId, pricing_run_id: created.pricingRunId });
      await recordAuditEvent(scope, { action: 'pricing_run_rerun_created', objectType: 'pricing_run', objectId: created.pricingRunId, practiceId, requestId: request.requestId });
    }
    return { objectId: practiceId, redirect: returnPath(practiceId, input.planId, ready.length === 0 ? 'already_pricing' : 'priced_again', input) };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    input: (refs) => ({ runIds: refs.mappedNotPricedRunId, releaseNo: '900001' }),
  },
});

export const MAPPING_ROUTES = [mappingPage, planPage, mapPlanAction, priceAgainAction, priceWaitingAction] as const;
