import { PricingRefusedError } from '@tp/contracts';
import { rolesPermit } from '@tp/db/runtime';
import { UNPRICED_REASONS } from '@tp/pricing';
import { PricingRunInputError, RuleReleaseMismatchError, createPricingRun, currentReleaseNo, releaseHeader } from '@tp/worker/pricing';
import { z } from 'zod';

import { type PricingReadiness, pricingReadiness } from '../contracts/mapping-queries';
import { practiceRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { type RunLineFilter, type RunLinePage, type RunNames, type RunPage, type RunSummary, listRuns, runLines, runNames, runSummary } from '../pricing/queries';
import { opaqueId, optionalText } from './schemas';

/**
 * The Pricing runs screen (PRD 7: "Runs with period, release, versions, coverage, variance by payer
 * pattern ... Create a run ... A run never changes once complete"; PRD 5, J7; PRD 8, pricing_run).
 * Reading needs the workspace (practice.open). Creating a run is the billing manager's (J7: "Pricing
 * run (system, billing manager)"), under the permission that maps the plans a run needs (mapping.edit,
 * which the billing manager and the firm principal hold; docs/adr/0035): the creator names a period
 * by months and the release the screen showed as current; the run is recorded pinned to that release
 * (refused when it is no longer the current one: a rule-release mismatch) and the price job queued.
 * A run over a plan with no mapping is refused (MAP-01). Comparing two runs and re-running under a new
 * release with a diff of the lines that change belong to the release pipeline's re-run diffs.
 */

const page = z.coerce.number().int().min(1).max(100_000).default(1);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'a month, YYYY-MM');

/** The first day of a month, YYYY-MM-DD. */
export function firstDayOf(value: string): string {
  return `${value}-01`;
}

/** The last day of a month, YYYY-MM-DD. */
export function lastDayOf(value: string): string {
  const [year, number] = value.split('-').map((part) => Number.parseInt(part, 10)) as [number, number];
  const next = number === 12 ? Date.UTC(year + 1, 0, 1) : Date.UTC(year, number, 1);
  return new Date(next - 86_400_000).toISOString().slice(0, 10);
}

export interface CurrentRelease {
  readonly releaseNo: number;
  readonly manifestSha256: string;
}

export interface PricingRunsPageData {
  readonly practiceId: string;
  readonly list: RunPage;
  /** The newest published rule release, which a run created now pins; null when none is published. */
  readonly release: CurrentRelease | null;
  readonly readiness: PricingReadiness;
  readonly canCreate: boolean;
  readonly roles: readonly string[];
}

export const pricingRunsPage = practiceRoute({
  id: 'practice.pricing_runs',
  kind: 'page',
  path: '/p/[practiceId]/pricing-runs',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, page }),
  handle: async ({ scope, practiceId, params, request, access }): Promise<PricingRunsPageData> => {
    const current = await currentReleaseNo(scope.client);
    const header = current === null ? null : await releaseHeader(scope.client, current);
    return {
      practiceId,
      list: await listRuns(scope, practiceId, params.page, request.requestId),
      release: header,
      readiness: await pricingReadiness(scope, practiceId, request.requestId),
      canCreate: rolesPermit(access.roles, 'mapping.edit'),
      roles: access.roles,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

export const RUN_LINE_FILTERS = ['all', 'priced', 'unpriced', ...UNPRICED_REASONS] as const;

export interface PricingRunPageData {
  readonly practiceId: string;
  readonly run: RunSummary;
  readonly names: RunNames;
  readonly filter: RunLineFilter;
  readonly lines: RunLinePage;
}

export const pricingRunPage = practiceRoute({
  id: 'practice.pricing_runs.run',
  kind: 'page',
  path: '/p/[practiceId]/pricing-runs/[runId]',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, runId: opaqueId, lines: z.enum(RUN_LINE_FILTERS).default('all').catch('all'), page }),
  handle: async ({ scope, practiceId, params, request }): Promise<PricingRunPageData> => {
    const run = await runSummary(scope, practiceId, params.runId, request.requestId);
    if (run === undefined) {
      throw new NotFoundError();
    }
    return {
      practiceId,
      run,
      names: await runNames(scope, practiceId, run.coverage),
      filter: params.lines,
      lines: await runLines(scope, practiceId, run.id, params.lines, params.page, request.requestId),
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, runId: refs.pricingRunId }) },
});

const PERIOD_FIELDS = { period: 'fromMonth', periodFrom: 'fromMonth', periodTo: 'toMonth' } as const;

export const createPricingRunAction = practiceRoute({
  id: 'practice.pricing_runs.create',
  kind: 'action',
  path: '/p/[practiceId]/pricing-runs/create',
  phi: true,
  permission: 'mapping.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({
    fromMonth: month,
    /** The period's last month; blank for a one-month run. */
    toMonth: optionalText(month),
    /** The release the screen showed as current. */
    releaseNo: z.coerce.number().int().min(1),
  }),
  audit: { action: 'pricing_run_created', objectType: 'pricing_run' },
  handle: async ({ scope, practiceId, input, request, services }): Promise<MutationResult> => {
    const toMonth = input.toMonth ?? input.fromMonth;
    if (toMonth < input.fromMonth) {
      throw new InputError([{ field: 'toMonth', message: 'the same month as the first, or later' }]);
    }
    let created;
    try {
      created = await createPricingRun(scope, { practiceId, periodFrom: firstDayOf(input.fromMonth), periodTo: lastDayOf(toMonth), releaseNo: input.releaseNo, requestId: request.requestId });
    } catch (error) {
      if (error instanceof RuleReleaseMismatchError) {
        throw new InputError([{ field: 'releaseNo', message: `${error.message}; reload the page to price under the current release` }]);
      }
      if (error instanceof PricingRefusedError) {
        throw new InputError([{ field: 'fromMonth', message: `${error.message}; map them on the Payer and plan mapping screen` }]);
      }
      if (error instanceof PricingRunInputError) {
        throw new InputError([{ field: PERIOD_FIELDS[error.field], message: error.message }]);
      }
      throw error;
    }
    // Queued in the request: a failure to queue undoes the run, so no run waits on a job that was never sent.
    await services.queue.enqueue('price', { practice_id: practiceId, pricing_run_id: created.pricingRunId });
    return { objectId: created.pricingRunId, redirect: `/p/${practiceId}/pricing-runs/${created.pricingRunId}` };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    input: () => ({ fromMonth: '2026-03', toMonth: '2026-03', releaseNo: '900001' }),
  },
});

export const PRICING_ROUTES = [pricingRunsPage, pricingRunPage, createPricingRunAction] as const;
