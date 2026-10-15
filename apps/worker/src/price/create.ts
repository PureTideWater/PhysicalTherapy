import { assertPracticePricingAllowed } from '@tp/contracts';
import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { ENGINE_VERSION, isIsoDate } from '@tp/pricing';

import { runPlans } from './lines';
import { RuleReleaseMismatchError, currentReleaseNo } from './release';

/**
 * Creating a pricing run (PRD 5, J7: "A run is created for a practice and a period, pinned to the
 * current rule release and the contract versions in force on each service date ... a run with a
 * rule-release mismatch is refused"; PRD 5, J6 and test matrix MAP-01: "pricing never runs on an
 * unmapped combination"). In the creator's own scope (a person's request): the period is checked, the
 * release asked for must be the newest published one, the period must hold lines, and the guard of
 * @tp/contracts refuses a run while any of its plans has no mapping at all. The run is recorded queued,
 * pinned to that release and to this engine's version; the caller queues the price job for it. The
 * database refuses the same mismatch itself, and a run in another person's name.
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
  const { rows: clock } = await scope.client.query<{ now: Date }>('SELECT now() AS now');
  const loadedBy = clock[0]?.now ?? new Date(0);
  const plans = await runPlans(scope.client, { practiceId: input.practiceId, periodFrom: input.periodFrom, periodTo: input.periodTo, loadedBy });
  if (plans.length === 0) {
    throw new PricingRunInputError('period', 'a period that holds at least one service line');
  }
  // MAP-01: refused while any plan of the run's lines has no mapping (PricingRefusedError).
  await assertPracticePricingAllowed(scope, { practiceId: input.practiceId, requestId: input.requestId, purpose: 'pricing' }, plans);
  try {
    // A savepoint, so the database's own refusal leaves the request's transaction usable for its answer.
    await scope.client.query('SAVEPOINT create_pricing_run');
    const { rows } = await scope.client.query<{ id: string }>(
      `INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by)
       VALUES ($1, $2::date, $3::date, $4, $5, $6) RETURNING id`,
      [input.practiceId, input.periodFrom, input.periodTo, input.releaseNo, ENGINE_VERSION, scope.actorId],
    );
    await scope.client.query('RELEASE SAVEPOINT create_pricing_run');
    const id = rows[0]?.id;
    if (id === undefined) {
      throw new Error('the pricing run was not recorded');
    }
    return { pricingRunId: id, releaseNo: input.releaseNo, engineVersion: ENGINE_VERSION };
  } catch (error) {
    if (isMismatch(error)) {
      await scope.client.query('ROLLBACK TO SAVEPOINT create_pricing_run');
      throw new RuleReleaseMismatchError(input.releaseNo, await currentReleaseNo(scope.client));
    }
    throw error;
  }
}
