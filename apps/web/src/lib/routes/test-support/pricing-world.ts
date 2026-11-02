import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { mapPlan } from '@tp/contracts';
import { type DatabaseClient, type DatabasePool, withJobScope, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { loadRelease } from '@tp/rules/loader';
import { priceHandler } from '@tp/worker/runtime';
import { createPricingRun, createRerun } from '@tp/worker/pricing';

/**
 * Test support: a complete pricing run of a route-test world's practice, made the way the plan makes
 * one (the billing manager maps the plan to the signed-off version and creates the run; the price job
 * executes it in the practice's job scope) under SYNTHETIC release 900001, and a complete re-run of it
 * that no one has accepted (docs/adr/0037); and a month priced around a plan with no mapping, the plan
 * mapped since, so the mapping screens offer it to price again (combined audit #32; MAP-08). Synthetic
 * data only.
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
  // The pricing location (practice_site, PR 6b) the lines price at: ZIP 00011, no ZIP+4.
  await owner.query("UPDATE practice_site SET zip = '00011', zip_plus_four = NULL WHERE practice_id = $1", [practiceId]);
  await owner.query('UPDATE practice SET settings = settings || $2::jsonb WHERE id = $1', [
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

export interface MappedNotPricedOptions {
  readonly owner: DatabaseClient;
  readonly app: DatabasePool;
  readonly practiceId: string;
  /** The world's claim, its payer, and its plan (mapped by seedPricingRun from 2026-01-01). */
  readonly claimId: string;
  readonly payerId: string;
  readonly planId: string;
  /** A billing manager of the practice. */
  readonly managerId: string;
}

/**
 * A month ready to price again (design 4.2; the sample of practice.mapping.price_again): a second plan of the world's
 * payer, CE:SYNPLAN-ROUTE-LATE, with one line in April 2026 beside one line of the world's mapped plan (both on the
 * world's claim, lines 5 and 6), a run of April created by the billing manager and priced while that plan has no
 * mapping (its line NO_MAPPING, the other priced), then the plan mapped as no agreement from 2026-01-01. Returns the
 * April run, in effect and holding a line of a mapped plan still NO_MAPPING. Call after seedPricingRun (the location
 * and the settings it sets).
 */
export async function seedMappedNotPriced(options: MappedNotPricedOptions): Promise<{ readonly mappedNotPricedRunId: string }> {
  const { owner, app, practiceId, managerId } = options;
  const latePlanId = await asOwner(owner, [practiceId], async () => {
    const plan = await owner.query<{ id: string }>("INSERT INTO plan (practice_id, payer_id, plan_key) VALUES ($1, $2, 'CE:SYNPLAN-ROUTE-LATE') RETURNING id", [practiceId, options.payerId]);
    const id = (plan.rows[0] as { id: string }).id;
    await owner.query(
      `INSERT INTO service_line (practice_id, claim_id, line_no, procedure_qualifier, procedure_code, modifiers, charge_cents, paid_cents, units, service_date,
         observed_allowed_cents, observed_allowed_basis, patient_share_cents, payer_plan_key)
       VALUES ($1, $2, 5, 'HC', '97110', '{GP}', 8000, 1500, 1, '2026-04-07', 1900, 'paid_plus_pr', 400, $3),
              ($1, $2, 6, 'HC', '97110', '{GP}', 8000, 1500, 1, '2026-04-07', 1900, 'paid_plus_pr', 400, $4)`,
      [practiceId, options.claimId, options.planId, id],
    );
    return id;
  });
  const created = await withPracticeScope(app, { actorId: managerId, practiceIds: [practiceId] }, (scope) =>
    createPricingRun(scope, { practiceId, periodFrom: '2026-04-01', periodTo: '2026-04-30', releaseNo: ROUTE_RELEASE, requestId: `seed-${randomUUID()}` }),
  );
  await execute(app, practiceId, created.pricingRunId);
  await withPracticeScope(app, { actorId: managerId, practiceIds: [practiceId] }, (scope) =>
    mapPlan({ scope, requestId: `seed-${randomUUID()}` }, { practiceId, planId: latePlanId, kind: 'no_agreement', contractVersionId: null, effectiveFrom: '2026-01-01' }),
  );
  const { rows } = await owner.query<{ status: string; no_mapping: number }>(
    "SELECT r.status, (SELECT count(*)::int FROM priced_line p WHERE p.pricing_run_id = r.id AND p.unpriced_reason = 'NO_MAPPING') AS no_mapping FROM pricing_run r WHERE r.id = $1",
    [created.pricingRunId],
  );
  if (rows[0]?.status !== 'complete' || rows[0].no_mapping !== 1) {
    throw new Error('the seeded month to price again did not price around its unmapped plan');
  }
  return { mappedNotPricedRunId: created.pricingRunId };
}
