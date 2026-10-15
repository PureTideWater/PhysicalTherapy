import { PricingRefusedError } from '@tp/contracts';
import { rolesPermit } from '@tp/db/runtime';
import { UNPRICED_REASONS } from '@tp/pricing';
import {
  DIFF_KINDS,
  PricingRunInputError,
  type RunDiff,
  RunComparisonError,
  RerunRefusedError,
  RuleReleaseMismatchError,
  acceptRun,
  compareRuns,
  createPricingRun,
  createRerun,
  currentReleaseNo,
  releaseHeader,
} from '@tp/worker/pricing';
import { z } from 'zod';

import { type PricingReadiness, pricingReadiness } from '../contracts/mapping-queries';
import { practiceRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import {
  type RunLineFilter,
  type RunLinePage,
  type RunNames,
  type RunOption,
  type RunPage,
  type RunSummary,
  completeRunOptions,
  listRuns,
  rerunsOf,
  runLines,
  runNames,
  runSummary,
  runsInEffect,
} from '../pricing/queries';
import { opaqueId, optionalText } from './schemas';

/**
 * The Pricing runs screen (PRD 7: "Runs with period, release, versions, coverage, variance by payer
 * pattern ... Create a run ... A run never changes once complete"; PRD 5, J7; PRD 8, pricing_run).
 * Reading needs the workspace (practice.open). Creating a run is the billing manager's (J7: "Pricing
 * run (system, billing manager)"), under the permission that maps the plans a run needs (mapping.edit,
 * which the billing manager and the firm principal hold; docs/adr/0035): the creator names a period
 * by months and the release the screen showed as current; the run is recorded pinned to that release
 * (refused when it is no longer the current one: a rule-release mismatch) and the price job queued.
 * A run over a plan with no mapping is refused (MAP-01).
 *
 * Re-runs and comparisons (PRD 7: "compare two runs; re-run under a new release with a diff"; PRD 5, J6
 * and J17; PRD 9, step 4; docs/adr/0037): a complete run is priced again under the release in force
 * (the same roles, mapping.edit), never changing it; the re-run's page shows its diff against the run
 * it prices again, and it is in effect only once one of those roles accepts it. Any two complete runs
 * compare, line for line.
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
  /** The rule release in force, which a run created now pins; null when none is published. */
  readonly release: CurrentRelease | null;
  readonly readiness: PricingReadiness;
  readonly canCreate: boolean;
  readonly roles: readonly string[];
  /** The complete runs, for choosing two to compare. */
  readonly options: readonly RunOption[];
  /** Runs in effect pinned to a release other than the one in force (the release note lists what would change). */
  readonly pinnedElsewhere: number;
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
      options: await completeRunOptions(scope, practiceId),
      pinnedElsewhere: current === null ? 0 : (await runsInEffect(scope, practiceId, request.requestId)).filter((run) => run.releaseNo !== current).length,
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
  /** The runs that price this one again, newest first. */
  readonly reruns: readonly RunSummary[];
  /** For a complete re-run: its diff against the run it prices again (the first page of lines). */
  readonly diff: RunDiff | null;
  /** The release in force, which a re-run pins; null when none is published. */
  readonly release: CurrentRelease | null;
  /** Whether the actor may price runs again and accept re-runs (mapping.edit). */
  readonly canRerun: boolean;
}

export const pricingRunPage = practiceRoute({
  id: 'practice.pricing_runs.run',
  kind: 'page',
  path: '/p/[practiceId]/pricing-runs/[runId]',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, runId: opaqueId, lines: z.enum(RUN_LINE_FILTERS).default('all').catch('all'), page }),
  handle: async ({ scope, practiceId, params, request, access }): Promise<PricingRunPageData> => {
    const run = await runSummary(scope, practiceId, params.runId, request.requestId);
    if (run === undefined) {
      throw new NotFoundError();
    }
    const original = run.rerunOfId === null || run.status !== 'complete' ? undefined : await runSummary(scope, practiceId, run.rerunOfId, request.requestId);
    const current = await currentReleaseNo(scope.client);
    return {
      practiceId,
      run,
      names: await runNames(scope, practiceId, run.coverage),
      filter: params.lines,
      lines: await runLines(scope, practiceId, run.id, params.lines, params.page, request.requestId),
      reruns: await rerunsOf(scope, practiceId, run.id, request.requestId),
      diff:
        original?.status === 'complete'
          ? await compareRuns(scope, { practiceId, beforeRunId: original.id, afterRunId: run.id, requestId: request.requestId, filter: 'all', page: 1 })
          : null,
      release: current === null ? null : await releaseHeader(scope.client, current),
      canRerun: rolesPermit(access.roles, 'mapping.edit'),
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, runId: refs.rerunId }) },
});

export const DIFF_FILTERS = ['all', ...DIFF_KINDS] as const;

export interface RunComparisonPageData {
  readonly practiceId: string;
  readonly before: RunSummary;
  readonly after: RunSummary;
  /** Null while either run is still being priced (there are no lines to compare yet). */
  readonly diff: RunDiff | null;
  readonly canAccept: boolean;
}

/**
 * Two complete runs of the practice compared (PRD 7, Pricing runs: "compare two runs"): exactly the lines
 * whose expected allowed, unpriced reason or adjustments differ, each with both sides and its causes
 * from the traces, and the lines only one of them priced. When the second is a re-run of the first not
 * yet accepted, the roles that map plans accept it here.
 */
export const comparePricingRunsPage = practiceRoute({
  id: 'practice.pricing_runs.compare',
  kind: 'page',
  path: '/p/[practiceId]/pricing-runs/compare',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, before: opaqueId, after: opaqueId, lines: z.enum(DIFF_FILTERS).default('all').catch('all'), page }),
  handle: async ({ scope, practiceId, params, request, access }): Promise<RunComparisonPageData> => {
    const before = await runSummary(scope, practiceId, params.before, request.requestId);
    const after = await runSummary(scope, practiceId, params.after, request.requestId);
    if (before === undefined || after === undefined) {
      throw new NotFoundError();
    }
    let diff: RunDiff | null = null;
    try {
      diff = await compareRuns(scope, { practiceId, beforeRunId: before.id, afterRunId: after.id, requestId: request.requestId, filter: params.lines, page: params.page });
    } catch (error) {
      // Both runs are the practice's (read above): the one refusal left is a run still being priced.
      if (!(error instanceof RunComparisonError)) {
        throw error;
      }
    }
    return {
      practiceId,
      before,
      after,
      diff,
      canAccept: diff !== null && rolesPermit(access.roles, 'mapping.edit') && after.rerunOfId === before.id && after.acceptedAt === null && after.withdrawal === null,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, before: refs.pricingRunId, after: refs.rerunId }) },
});

/** A refusal of the re-run services, as the field a form shows it against. */
function refusal(error: unknown): InputError | undefined {
  if (error instanceof RuleReleaseMismatchError) {
    return new InputError([{ field: 'releaseNo', message: `${error.message}; reload the page to price under the release in force` }]);
  }
  if (error instanceof RerunRefusedError) {
    return new InputError([{ field: 'runId', message: error.message }]);
  }
  return undefined;
}

/**
 * Prices a complete run again under the release in force (J17; MAP-03), for the same period and the
 * same lines, and queues its price job; the run itself never changes. The new run's page shows the diff.
 */
export const rerunPricingRunAction = practiceRoute({
  id: 'practice.pricing_runs.rerun',
  kind: 'action',
  path: '/p/[practiceId]/pricing-runs/rerun',
  phi: true,
  permission: 'mapping.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({
    runId: opaqueId,
    /** The release the screen showed as in force. */
    releaseNo: z.coerce.number().int().min(1),
  }),
  audit: { action: 'pricing_run_rerun_created', objectType: 'pricing_run' },
  handle: async ({ scope, practiceId, input, request, services }): Promise<MutationResult> => {
    let created;
    try {
      created = await createRerun(scope, { practiceId, pricingRunId: input.runId, releaseNo: input.releaseNo, requestId: request.requestId });
    } catch (error) {
      throw refusal(error) ?? error;
    }
    // Queued in the request: a failure to queue undoes the re-run, as for a new run.
    await services.queue.enqueue('price', { practice_id: practiceId, pricing_run_id: created.pricingRunId });
    return { objectId: created.pricingRunId, redirect: `/p/${practiceId}/pricing-runs/${created.pricingRunId}` };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    input: (refs) => ({ runId: refs.pricingRunId, releaseNo: '900001' }),
  },
});

/**
 * Accepts a complete re-run after its diff (J17: "before anyone accepts it"): from then on it is the run
 * in effect for its period. Accepting it again changes nothing; a first run, an open re-run and one
 * pinned to a withdrawn release are refused (the database refuses them too).
 */
export const acceptPricingRunAction = practiceRoute({
  id: 'practice.pricing_runs.accept',
  kind: 'action',
  path: '/p/[practiceId]/pricing-runs/accept',
  phi: true,
  permission: 'mapping.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ runId: opaqueId }),
  audit: { action: 'pricing_run_accepted', objectType: 'pricing_run' },
  handle: async ({ scope, practiceId, input }): Promise<MutationResult> => {
    try {
      await acceptRun(scope, { practiceId, pricingRunId: input.runId });
    } catch (error) {
      throw refusal(error) ?? error;
    }
    return { objectId: input.runId, redirect: `/p/${practiceId}/pricing-runs/${input.runId}` };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    input: (refs) => ({ runId: refs.rerunId }),
  },
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

export const PRICING_ROUTES = [pricingRunsPage, pricingRunPage, comparePricingRunsPage, createPricingRunAction, rerunPricingRunAction, acceptPricingRunAction] as const;
