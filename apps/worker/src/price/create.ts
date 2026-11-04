import { type LocationStatus, practiceUnmappedPlanIds } from '@tp/contracts';
import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { ENGINE_VERSION, isIsoDate } from '@tp/pricing';

import { runPlans } from './lines';
import { RuleReleaseMismatchError, currentReleaseNo } from './release';

/**
 * Creating a pricing run (PRD 5, J7: "A run is created for a practice and a period, pinned to the
 * current rule release and the contract versions in force on each service date ... a run with a
 * rule-release mismatch is refused"; PRD 5, J6 and test matrix MAP-01: a line of an unmapped
 * combination is never priced). In the creator's own scope (a person's request): the period is checked,
 * the release asked for must be the newest published one, the period must hold lines, and some line of
 * the period must have a mapping of its plan in force on its service date (PricingRunNothingMapped,
 * MAP-07; decided on the line's date, as the resolver decides, PR #95 review R3N-1). A plan with no
 * mapping no longer refuses the run (combined audit #32, docs/adr/0075): its lines are left NO_MAPPING
 * one by one and every other line of the period prices (MAP-06). The run is recorded queued,
 * pinned to that release and to this engine's version; the caller queues the price job for it. The
 * database refuses the same mismatch itself, and a run in another person's name. A re-run of a complete
 * run (rerun.ts) is recorded the same way. The monitoring chain (../monitor) creates a month's run the
 * same way in its job's scope: the run is then the job's (created_by_job_id), not a person's.
 *
 * No run is created for a practice that has no pricing location (audit #33; docs/adr/0064): every line
 * would stop as ENGINE_ERROR invalid_settings, fixed fees included. The location is checked here
 * (PricingLocationWaiting), after the check that some line is mapped, and Postgres refuses the same run itself
 * (pricing_run_location_missing, re-runs included), which recordRun reports the same way. A location a
 * line cannot be priced at (a ZIP Medicare's list lacks, or one that needs its ZIP+4) still gets its run:
 * the run fails as location_not_ready only when a line stops on it (execute.ts).
 */

/** The request is not a run the plan allows (a period backwards, or with no lines). Messages name fields, never values. */
export class PricingRunInputError extends Error {
  override readonly name = 'PricingRunInputError';

  constructor(
    readonly field: 'period' | 'periodFrom' | 'periodTo',
    message: string,
  ) {
    super(message);
  }
}

/**
 * The practice has no pricing location (no billing ZIP): the period waits for it with no run. The status is the
 * closed list's (practice_location_status()); nothing else is said.
 */
export class PricingLocationWaiting extends Error {
  override readonly name = 'PricingLocationWaiting';

  constructor(readonly status: Extract<LocationStatus, 'zip_missing'> = 'zip_missing') {
    super('the practice has no pricing location (its billing ZIP): the period waits for it');
  }
}

/**
 * No line of the period has a mapping of its plan in force on its service date (MAP-07): its plans have
 * no mapping, or only mappings for other dates (PR #95 review R3N-1), so a run would price nothing:
 * every line would stop as NO_MAPPING, and pricing it later would need a re-run and a hand acceptance
 * per month. No run is recorded. The month is priced once a mapping in force on its dates completes it
 * (the mapping queues monitoring of the months it leaves complete, D2b), or by the daily monitoring once
 * any of its plans has one. Counts only: no plan is named.
 */
export class PricingRunNothingMapped extends Error {
  override readonly name = 'PricingRunNothingMapped';

  constructor(
    /** The plans of the period's lines, none of which has a mapping in force on its lines' dates. */
    readonly plans: number,
  ) {
    super(`none of the period's ${String(plans)} plan(s) has a mapping in force on its lines' dates: a run would price nothing`);
  }
}

/** Whether the practice has a location in the caller's scope (practice_location_status() under the caller's row-level security). */
async function assertLocation(client: ScopeClient, practiceId: string, releaseNo: number, periodFrom: string, periodTo: string): Promise<void> {
  const { rows } = await client.query<{ status: string }>('SELECT practice_location_status($1, $2, $3::date, $4::date) AS status', [practiceId, releaseNo, periodFrom, periodTo]);
  if (rows[0]?.status === 'zip_missing') {
    throw new PricingLocationWaiting();
  }
}

export interface CreatePricingRunInput {
  readonly practiceId: string;
  /** First and last service dates, both included. */
  readonly periodFrom: string;
  readonly periodTo: string;
  /** The release the creator saw as current; anything else is a rule-release mismatch. */
  readonly releaseNo: number;
  readonly requestId: string;
}

export interface CreatedPricingRun {
  readonly pricingRunId: string;
  readonly releaseNo: number;
  readonly engineVersion: string;
}

function isMismatch(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23514' && error instanceof Error && /rule-release mismatch/.test(error.message);
}

/** Postgres refused a run of a practice with no location (pricing_run_rules(), pricing_run_location_missing). */
function isLocationMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23514' && 'constraint' in error && error.constraint === 'pricing_run_location_missing';
}

export async function createPricingRun(scope: PracticeScope<ScopeClient>, input: CreatePricingRunInput): Promise<CreatedPricingRun> {
  if (!isIsoDate(input.periodFrom)) {
    throw new PricingRunInputError('periodFrom', 'the first service date of the period, as a date');
  }
  if (!isIsoDate(input.periodTo)) {
    throw new PricingRunInputError('periodTo', 'the last service date of the period, as a date');
  }
  if (input.periodTo < input.periodFrom) {
    throw new PricingRunInputError('periodTo', 'on or after the first day of the period');
  }
  const current = await currentReleaseNo(scope.client);
  if (current === null || current !== input.releaseNo) {
    throw new RuleReleaseMismatchError(input.releaseNo, current);
  }
  // The run's cut-off is this transaction's now(), the created_at recordRun gives the run and the price job reads
  // back as text: read as text here too, to the microsecond, so this check and the job send the same cut-off. A JS
  // Date keeps milliseconds only, and would leave out a line loaded in the run's own millisecond (PRC-32). The two
  // judge the same lines unless a load commits between them (lines.ts, the known limit).
  const { rows: clock } = await scope.client.query<{ now: string }>('SELECT now()::text AS now');
  const loadedBy = clock[0]?.now;
  if (loadedBy === undefined) {
    throw new Error('the database did not answer its clock');
  }
  const lines = await runPlans(scope.client, { practiceId: input.practiceId, periodFrom: input.periodFrom, periodTo: input.periodTo, loadedBy });
  if (lines.length === 0) {
    throw new PricingRunInputError('period', 'a period that holds at least one service line');
  }
  // MAP-07: refused when no line of the run has a mapping of its plan in force on its date (it would price
  // nothing), judged per line date as the resolver judges it (PR #95 review R3N-1, security F2). Any other plan
  // with no mapping in force leaves its own lines NO_MAPPING while the rest price (MAP-01, MAP-06; audit #32).
  const plans = new Set(lines.map((line) => line.planId)).size;
  const unmapped = await practiceUnmappedPlanIds(scope, { practiceId: input.practiceId, requestId: input.requestId, purpose: 'pricing' }, lines);
  if (unmapped.length === plans) {
    throw new PricingRunNothingMapped(plans);
  }
  // After the mapping check, so a month both all-unmapped and missing its ZIP is reported as waiting on a mapping.
  // Audit #33: no run while the practice has no location (PricingLocationWaiting); Postgres refuses it too.
  await assertLocation(scope.client, input.practiceId, input.releaseNo, input.periodFrom, input.periodTo);
  return recordRun(scope, { practiceId: input.practiceId, periodFrom: input.periodFrom, periodTo: input.periodTo, releaseNo: input.releaseNo, rerunOf: null });
}

/** What a new run row pins: its practice, period, release, and for a re-run the run and cut-off it prices again. */
export interface RunPins {
  readonly practiceId: string;
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly releaseNo: number;
  /** For a re-run, the complete run it prices again; the database copies that run's cut-off. */
  readonly rerunOf: string | null;
}

/**
 * Records the run queued, pinned to the release and to this engine, in the actor's name (a person's,
 * or for a job's scope the job's; the database refuses a job's re-run). The database pins the
 * place-of-service split in force on it (pricing_run_rules()), and refuses a release that is not the one
 * in force (RuleReleaseMismatchError here), a run of a practice with no location (PricingLocationWaiting
 * here), and a re-run that does not price the period and lines of a complete run of the practice.
 */
export async function recordRun(scope: PracticeScope<ScopeClient>, pins: RunPins): Promise<CreatedPricingRun> {
  try {
    // A savepoint, so the database's own refusal leaves the request's transaction usable for its answer.
    await scope.client.query('SAVEPOINT create_pricing_run');
    const values = [pins.practiceId, pins.periodFrom, pins.periodTo, pins.releaseNo, ENGINE_VERSION, scope.actorId];
    // A job (the monitoring chain) creates a run in its own name, as created_by_job_id; a person in theirs.
    const creator = scope.kind === 'job' ? 'created_by_job_id' : 'created_by';
    const { rows } =
      pins.rerunOf === null
        ? await scope.client.query<{ id: string }>(
            `INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, ${creator})
             VALUES ($1, $2::date, $3::date, $4, $5, $6) RETURNING id`,
            values,
          )
        : // A re-run's cut-off is copied from the run it prices again by the statement itself, to the microsecond.
          await scope.client.query<{ id: string }>(
            `INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by, rerun_of_id, lines_loaded_by)
             SELECT $1, $2::date, $3::date, $4, $5, $6, o.id, coalesce(o.lines_loaded_by, o.created_at) FROM pricing_run o WHERE o.id = $7
             RETURNING id`,
            [...values, pins.rerunOf],
          );
    await scope.client.query('RELEASE SAVEPOINT create_pricing_run');
    const id = rows[0]?.id;
    if (id === undefined) {
      throw new Error('the pricing run was not recorded');
    }
    return { pricingRunId: id, releaseNo: pins.releaseNo, engineVersion: ENGINE_VERSION };
  } catch (error) {
    if (isMismatch(error)) {
      await scope.client.query('ROLLBACK TO SAVEPOINT create_pricing_run');
      throw new RuleReleaseMismatchError(pins.releaseNo, await currentReleaseNo(scope.client));
    }
    if (isLocationMissing(error)) {
      await scope.client.query('ROLLBACK TO SAVEPOINT create_pricing_run');
      throw new PricingLocationWaiting();
    }
    throw error;
  }
}
