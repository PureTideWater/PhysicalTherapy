import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { mapPlan } from '@tp/contracts';
import { type DatabaseClient, type DatabasePool, withJobScope, withPracticeScope } from '@tp/db';
import { createLogger } from '@tp/observability';
import { loadRelease } from '@tp/rules/loader';
import { priceHandler } from '@tp/worker/runtime';
import { createPricingRun, createRerun } from '@tp/worker/pricing';

/**
 * Test support: a complete pricing run of a route-test world's practice, made the way the plan makes
 * one (the billing manager maps the plan to the signed-off version and creates the run; the price job
 * executes it in the practice's job scope) under SYNTHETIC release 900001, and a complete re-run of it
 * that no one has accepted (docs/adr/0037). Synthetic data only.
 */

const RELEASE_DIR = path.resolve(import.meta.dirname, '../../../../../../fixtures/synthetic/rules/release-synth-900001');
export const ROUTE_RELEASE = 900001;

/** Loads the SYNTHETIC release into the scratch database (once per database). */
export async function loadRouteRelease(owner: DatabaseClient): Promise<void> {
  await loadRelease(owner, RELEASE_DIR, { release: ROUTE_RELEASE, allowSyntheticFixtureForTests: true });
}

export interface PricingWorldOptions {
  readonly owner: DatabaseClient;
  readonly app: DatabasePool;
  readonly practiceId: string;
  readonly planId: string;
  /** The version the mapping route's sample maps the plan to, so that sample changes nothing. */
  readonly signedOffVersionId: string;
  /** A billing manager of the practice. */
  readonly managerId: string;
}

/** A complete run of the practice, and a complete re-run of it that no one has accepted. */
export interface SeededRuns {
  readonly pricingRunId: string;
  readonly rerunId: string;
}

async function execute(app: DatabasePool, practiceId: string, pricingRunId: string): Promise<void> {
  const jobId = randomUUID();
  await priceHandler()(
    { practice_id: practiceId, pricing_run_id: pricingRunId },
    {
      jobId,
      logger: createLogger({ sink: () => undefined }),
      transaction: (work) => withJobScope(app, { jobId, practiceId }, work),
      enqueue: () => Promise.resolve(null),
      lastAttempt: false,
    },
  );
}

export async function seedPricingRun(options: PricingWorldOptions): Promise<SeededRuns> {
  const { owner, app, practiceId, managerId } = options;
  await owner.query("UPDATE practice SET zip = '00011', settings = settings || $2::jsonb WHERE id = $1", [
    practiceId,
    JSON.stringify({ place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT' }),
  ]);
  const created = await withPracticeScope(app, { actorId: managerId, practiceIds: [practiceId] }, async (scope) => {
    await mapPlan({ scope, requestId: `seed-${randomUUID()}` }, { practiceId, planId: options.planId, kind: 'contract', contractVersionId: options.signedOffVersionId, effectiveFrom: '2026-01-01' });
    return createPricingRun(scope, { practiceId, periodFrom: '2026-03-01', periodTo: '2026-03-31', releaseNo: ROUTE_RELEASE, requestId: `seed-${randomUUID()}` });
  });
  await execute(app, practiceId, created.pricingRunId);
  const rerun = await withPracticeScope(app, { actorId: managerId, practiceIds: [practiceId] }, (scope) =>
    createRerun(scope, { practiceId, pricingRunId: created.pricingRunId, releaseNo: ROUTE_RELEASE, requestId: `seed-${randomUUID()}` }),
  );
  await execute(app, practiceId, rerun.pricingRunId);
  const { rows } = await owner.query<{ status: string }>('SELECT status FROM pricing_run WHERE id = ANY ($1::uuid[])', [[created.pricingRunId, rerun.pricingRunId]]);
  if (rows.length !== 2 || rows.some((row) => row.status !== 'complete')) {
    throw new Error('the seeded pricing runs did not complete');
  }
  return { pricingRunId: created.pricingRunId, rerunId: rerun.pricingRunId };
}
