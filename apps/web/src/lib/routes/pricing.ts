import { PricingRefusedError, locationStatusText } from '@tp/contracts';
import { rolesPermit } from '@tp/db/runtime';
import { UNPRICED_REASONS } from '@tp/pricing';
import {
  DIFF_KINDS,
  type DiffRun,
  PricingLocationWaiting,
  PricingRunInputError,
  type RunDiff,
  RunComparisonError,
  RerunRefusedError,
  RuleReleaseMismatchError,
  acceptRun,
  compareAcceptance,
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
  type RerunAcceptanceView,
  type RunLineFilter,
  type RunLinePage,
  type RunNames,
  type RunOption,
  type RunPage,
  type RunSummary,
  completeRunOptions,
  listRuns,
  pendingFirstRuns,
  periodRunInEffect,
  rerunAcceptance,
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
 * and J17; PRD 9, step 4; docs/adr/0037): the run in effect for its period is priced again under the
 * release in force (the same roles, mapping.edit), never changing it; the re-run's page shows exactly what
 * accepting it would change (each line's pricing in effect now, whichever run of any period holds it, against
 * the re-run's), and it is in effect only once one of those roles accepts it, against that same diff. A re-run is accepted only while nothing in effect for overlapping service dates is newer
 * than it (priced after it, pinned to a later release not withdrawn, or holding lines loaded since) and
 * no first run of those dates is being priced (combined audit #10; docs/adr/0037, amendment of
 * 2026-10-26; test matrix PRC-25 to PRC-28): its page and the comparison say why not and link to the
 * run to use instead. Any two complete runs compare, line for line.
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
  /**
   * For a complete re-run: its diff (the first page of lines). When it can be accepted, exactly what accepting it
   * changes (compareAcceptance): against the run its acceptance replaces, the run in effect for its period, and on
   * lines a run of other service dates holds, against that run; otherwise against the run it prices again.
   */
  readonly diff: RunDiff | null;
  /** When the diff is what accepting changes: the runs of other service dates it reads (none when it is the replaced run's alone), which the Accept form posts. Null otherwise. */
  readonly heldBy: readonly DiffRun[] | null;
  /** For a complete re-run nobody accepted, not pinned to a withdrawn release: whether it can be accepted now, and the runs to name. */
  readonly acceptance: RerunAcceptanceView | null;
  /** For a complete run that is not the run in effect for its period: the one that is, which is re-run instead (null when none is). */
  readonly periodInEffect: RunSummary | null;
  /** For a complete run in effect: the first runs of overlapping periods queued or being priced, which it waits for before it is re-run. */
  readonly rerunPending: readonly RunSummary[];
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
    const acceptance = original !== undefined && run.acceptedAt === null && run.withdrawal === null ? await rerunAcceptance(scope, practiceId, run, request.requestId) : null;
    // What accepting changes, when it can be accepted (J17): against the run it replaces, a later run of the period may have taken effect since the re-run was created, and on other runs' lines.
    const accepting =
      acceptance?.state === 'acceptable'
        ? await compareAcceptance(scope, { practiceId, rerunId: run.id, replacesId: acceptance.replaces.id, requestId: request.requestId, filter: 'all', page: 1 })
        : null;
    const current = await currentReleaseNo(scope.client);
    return {
      practiceId,
      run,
      names: await runNames(scope, practiceId, run.coverage),
      filter: params.lines,
      lines: await runLines(scope, practiceId, run.id, params.lines, params.page, request.requestId),
      reruns: await rerunsOf(scope, practiceId, run.id, request.requestId),
      diff:
        accepting ??
        (original?.status === 'complete' ? await compareRuns(scope, { practiceId, beforeRunId: original.id, afterRunId: run.id, requestId: request.requestId, filter: 'all', page: 1 }) : null),
      heldBy: accepting?.heldBy ?? null,
      acceptance,
      periodInEffect: run.status === 'complete' && !run.inEffect ? await periodRunInEffect(scope, practiceId, run.periodFrom, run.periodTo, request.requestId) : null,
      rerunPending: run.status === 'complete' && run.inEffect ? await pendingFirstRuns(scope, practiceId, run.id, request.requestId) : [],
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
  /**
   * Null while either run is still being priced (there are no lines to compare yet). Where the second run is accepted
   * here, exactly what accepting it changes (compareAcceptance), so lines a run of other service dates holds are
   * compared with that run.
   */
  readonly diff: RunDiff | null;
  /** Where the second run is accepted here: the runs of other service dates the diff reads, which the Accept form posts. Null otherwise. */
  readonly heldBy: readonly DiffRun[] | null;
  /** Whether the actor may accept the second run here: an acceptable re-run, compared with exactly the run its acceptance replaces. */
  readonly canAccept: boolean;
  /**
   * For a second run that is a complete re-run nobody accepted, not pinned to a withdrawn release, compared with its
   * original or with the run its acceptance would replace: whether it can be accepted now, and the runs to name.
   */
  readonly acceptance: RerunAcceptanceView | null;
}

/**
 * Two complete runs of the practice compared (PRD 7, Pricing runs: "compare two runs"): exactly the lines
 * whose expected allowed, unpriced reason or adjustments differ, each with both sides and its causes
 * from the traces, and the lines only one of them priced. When the second is a re-run not yet accepted
 * and the first is exactly what its acceptance would replace (the run in effect for its period), the
 * roles that map plans accept it here, and the diff is exactly what accepting changes (J17): on lines a run
 * of other service dates holds in effect, against that run, which the page names.
 * Compared with its original after a later run took effect, it names the run to compare with instead;
 * superseded, or waiting for a first run being priced, it says why it cannot be accepted (combined audit
 * #10; docs/adr/0037, amendment of 2026-10-26).
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
    const judged =
      after.rerunOfId !== null && after.status === 'complete' && after.acceptedAt === null && after.withdrawal === null ? await rerunAcceptance(scope, practiceId, after, request.requestId) : null;
    // Shown beside its original, or beside the run its acceptance replaces; beside any other run the comparison is just a comparison.
    const acceptance = judged !== null && (after.rerunOfId === before.id || (judged.state === 'acceptable' && judged.replaces.id === before.id)) ? judged : null;
    const accepting = acceptance?.state === 'acceptable' && acceptance.replaces.id === before.id;
    let diff: RunDiff | null = null;
    let heldBy: readonly DiffRun[] | null = null;
    try {
      if (accepting) {
        const changes = await compareAcceptance(scope, { practiceId, rerunId: after.id, replacesId: before.id, requestId: request.requestId, filter: params.lines, page: params.page });
        diff = changes;
        heldBy = changes.heldBy;
      } else {
        diff = await compareRuns(scope, { practiceId, beforeRunId: before.id, afterRunId: after.id, requestId: request.requestId, filter: params.lines, page: params.page });
      }
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
      heldBy,
      canAccept: diff !== null && rolesPermit(access.roles, 'mapping.edit') && accepting,
      acceptance,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, before: refs.pricingRunId, after: refs.rerunId }) },
});

/** A run of a practice with no pricing location (audit #33): no run is created until its billing ZIP is set. */
const LOCATION_WAITING = `${locationStatusText('zip_missing')} A run waits until it is set in Pricing settings.`;

/**
 * A refusal of the re-run services, as the field a form shows it against. Every RerunRefusedError reason maps to
 * the run's field with the service's message, which names a state and never a value: the acceptance rule's
 * (superseded, newer_run_pending, changed_meanwhile, diff_changed) and the re-run rule's (not_in_effect,
 * newer_run_pending) are worded to read after the form's label, "This re-run: ..." on the Accept forms and "This
 * run: ..." (or "The run in effect: ...", for the run a superseded re-run's page offers instead) on the Re-run forms
 * (docs/adr/0037, amendment of 2026-10-26). The release mismatch reads after "Rule release".
 */
function refusal(error: unknown): InputError | undefined {
  if (error instanceof PricingLocationWaiting) {
    return new InputError([{ field: 'releaseNo', message: LOCATION_WAITING }]);
  }
  if (error instanceof RuleReleaseMismatchError) {
    return new InputError([{ field: 'releaseNo', message: `${error.message}; reload the page to price under the release in force` }]);
  }
  if (error instanceof RerunRefusedError) {
    return new InputError([{ field: 'runId', message: error.message }]);
  }
  return undefined;
}

/**
 * Prices the run in effect for its period again under the release in force (J17; MAP-03), for the same
 * period and the same lines, and queues its price job; the run itself never changes. The new run's page
 * shows the diff. A run already replaced, or a re-run nobody accepted, is refused (the run in effect is
 * re-run instead), and so is any run while a first run of overlapping dates is queued or being priced
 * (PRC-27, PRC-28).
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

/** The runs of other service dates an Accept form's diff read, each a hidden heldByIds[] field (form.ts joins them). */
const heldByIds = z
  .string()
  .default('')
  .transform((value) => value.split(',').filter((part) => part !== ''))
  .pipe(z.array(opaqueId).max(200));

/**
 * Accepts a complete re-run after its diff (J17: "before anyone accepts it"): from then on it is the run
 * in effect for its period. The form posts what its diff was against, the run acceptance replaces and the
 * runs of other service dates holding some of its lines, and acceptRun refuses when either has changed
 * since (diff_changed), so a person accepts only the change they were shown (security review of PR #50, F1). Accepting it again changes nothing; a first run, an open re-run and one
 * pinned to a withdrawn release are refused (the database refuses them too). So is a re-run something
 * in effect for overlapping service dates is newer than (superseded), one waiting while a first run of
 * those dates is being priced, and one a run of those dates took effect beside while it was accepted
 * (combined audit #10, PRC-25 to PRC-28): acceptRun judges under the practice's pricing_current lock, and
 * a refusal rolls the request back, audit event and all.
 */
export const acceptPricingRunAction = practiceRoute({
  id: 'practice.pricing_runs.accept',
  kind: 'action',
  path: '/p/[practiceId]/pricing-runs/accept',
  phi: true,
  permission: 'mapping.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({
    runId: opaqueId,
    /** The run the page's diff was against, which acceptance replaces. */
    replacesId: opaqueId,
    heldByIds,
  }),
  audit: { action: 'pricing_run_accepted', objectType: 'pricing_run' },
  handle: async ({ scope, practiceId, input }): Promise<MutationResult> => {
    try {
      await acceptRun(scope, { practiceId, pricingRunId: input.runId, replacesId: input.replacesId, heldByIds: input.heldByIds });
    } catch (error) {
      throw refusal(error) ?? error;
    }
    return { objectId: input.runId, redirect: `/p/${practiceId}/pricing-runs/${input.runId}` };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    input: (refs) => ({ runId: refs.rerunId, replacesId: refs.pricingRunId }),
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
      if (error instanceof PricingLocationWaiting) {
        throw new InputError([{ field: 'fromMonth', message: LOCATION_WAITING }]);
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
