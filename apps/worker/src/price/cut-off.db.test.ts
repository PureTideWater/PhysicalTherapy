import { randomUUID } from "node:crypto";

import type { MappedLine } from "@tp/contracts";
import { readDatabaseUrl, withPracticeScope } from "@tp/db";
import type { PracticeScope, ScopeClient } from "@tp/db/runtime";
import { asOwner } from "@tp/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { type CreatedPricingRun, createPricingRun } from "./create";
import {
  type Practice,
  PricingWorld,
  RELEASE,
} from "./test-support/pricing-world";

/**
 * A run's cut-off, to the microsecond, at its creation and in its price job alike (test matrix PRC-32): a service line
 * loaded at the very instant of the transaction that creates the run (created_at equal to that transaction's now(),
 * which is the run's created_at) is the run's. Creation does not refuse its period as holding no line, nor as having
 * nothing mapped (MAP-07), and the plans and dates creation judges are those the price job prices. The line is
 * committed by another connection while the creating transaction is open, its created_at set to that transaction's
 * now() as text, so the instant is exact whatever its microseconds. SYNTHETIC 835s (PRC-19: Medicare Advantage
 * non-contracted lines of 2026-02-20) in one scratch database.
 */

let w: PricingWorld;

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
}, 120_000);

afterAll(async () => {
  await w.close();
});

const MA_PLAN = "CE:SYNPLAN-MA-NC";

/** A practice with PRC-19's 835 loaded, its plan mapped as Medicare Advantage non-contracted from 2026-01-01 unless `mapped` is false. */
async function prc19(label: string, mapped = true): Promise<Practice> {
  const target = await w.practice(label);
  await w.load(target, "PRC-19/remit.835");
  if (mapped) {
    await w.mapped(
      target,
      await w.planOf(target, MA_PLAN),
      "ma_noncontracted",
      "2026-01-01",
    );
  }
  return target;
}

/** Another plan of the practice's payer, as the owner writes it. */
async function newPlan(target: Practice, key: string): Promise<string> {
  const payerId = await w.payerOf(target);
  return asOwner(w.owner, [target.practiceId], async () => {
    const { rows } = await w.owner.query<{ id: string }>(
      "INSERT INTO plan (practice_id, payer_id, plan_key) VALUES ($1, $2, $3) RETURNING id",
      [target.practiceId, payerId, key],
    );
    return (rows[0] as { id: string }).id;
  });
}

/**
 * Commits, on the owner's own connection, one SYNTHETIC 97110 line of PRC-19's first claim (by claim number) on `serviceDate` of the plan,
 * its created_at `at` (a timestamptz as text, to the microsecond). Returns its ID.
 */
async function lineAt(
  target: Practice,
  planId: string,
  serviceDate: string,
  at: string,
): Promise<string> {
  return asOwner(w.owner, [target.practiceId], async () => {
    const { rows: claims } = await w.owner.query<{ id: string }>(
      "SELECT id FROM claim WHERE practice_id = $1 ORDER BY claim_no LIMIT 1",
      [target.practiceId],
    );
    const claim = claims[0] as { id: string };
    const { rows } = await w.owner.query<{ id: string }>(
      `INSERT INTO service_line (practice_id, claim_id, line_no, procedure_qualifier, procedure_code, modifiers, charge_cents, paid_cents, units, service_date,
         observed_allowed_cents, observed_allowed_basis, patient_share_cents, payer_plan_key, created_at)
       VALUES ($1, $2, (SELECT coalesce(max(line_no), 0) + 1 FROM service_line WHERE claim_id = $2), 'HC', '97110', '{GP}', 8000, 1500, 1, $3::date,
         1900, 'paid_plus_pr', 400, $4, $5::timestamptz) RETURNING id`,
      [target.practiceId, claim.id, serviceDate, planId, at],
    );
    return (rows[0] as { id: string }).id;
  });
}

interface Created {
  readonly created: CreatedPricingRun;
  /** The creating transaction's now(), as text. */
  readonly instant: string;
  /** The plans and dates creation's check judged, as runPlans read them. */
  readonly judged: readonly MappedLine[];
  /** Whether the cut-off creation sent equals the run's own cut-off (created_at), compared by Postgres. */
  readonly sameCutOff: boolean;
}

/**
 * Creates the run of the period in the billing manager's scope after `before` (given the transaction's now() as text)
 * commits a line at that instant on another connection, recording what creation's runPlans query sent and read.
 */
async function createAtInstant(
  target: Practice,
  periodFrom: string,
  periodTo: string,
  before: (instant: string) => Promise<unknown>,
): Promise<Created> {
  return withPracticeScope(
    w.app,
    { actorId: target.manager, practiceIds: [target.practiceId] },
    async (scope: PracticeScope<ScopeClient>) => {
      const { rows: clock } = await scope.client.query<{ instant: string }>(
        "SELECT now()::text AS instant",
      );
      const instant = (clock[0] as { instant: string }).instant;
      await before(instant);
      const spy = vi.spyOn(scope.client, "query");
      let created: CreatedPricingRun;
      // Kept before the spy is restored, which clears what it recorded.
      let calls: (typeof spy.mock.calls)[number][];
      let results: (typeof spy.mock.results)[number][];
      try {
        created = await createPricingRun(scope, {
          practiceId: target.practiceId,
          periodFrom,
          periodTo,
          releaseNo: RELEASE,
          requestId: `test-${randomUUID()}`,
        });
      } finally {
        calls = [...spy.mock.calls];
        results = [...spy.mock.results];
        spy.mockRestore();
      }
      const at = calls.findIndex(([text]) =>
        text.includes("SELECT DISTINCT l.payer_plan_key"),
      );
      expect(at).toBeGreaterThanOrEqual(0);
      const sent = (calls[at]?.[1] ?? [])[3];
      const read = (
        await (results[at]?.value as Promise<{
          rows: { plan_id: string; service_date: string }[];
        }>)
      ).rows;
      const { rows: same } = await scope.client.query<{ same: boolean }>(
        "SELECT $1::timestamptz = coalesce(lines_loaded_by, created_at) AS same FROM pricing_run WHERE id = $2",
        [sent, created.pricingRunId],
      );
      return {
        created,
        instant,
        judged: read.map((row) => ({
          planId: row.plan_id,
          serviceDate: row.service_date,
        })),
        sameCutOff: same[0]?.same === true,
      };
    },
  );
}

/** The plans and dates of the lines the price job priced for the run, as runPlans orders them. */
async function pricedPlans(pricingRunId: string): Promise<MappedLine[]> {
  const { rows } = await w.owner.query<{
    plan_id: string;
    service_date: string;
  }>(
    `SELECT DISTINCT l.payer_plan_key AS plan_id, coalesce(l.service_date, c.service_from)::text AS service_date
       FROM priced_line p JOIN service_line l ON l.id = p.service_line_id JOIN claim c ON c.id = l.claim_id
      WHERE p.pricing_run_id = $1 ORDER BY 1, 2`,
    [pricingRunId],
  );
  return rows.map((row) => ({
    planId: row.plan_id,
    serviceDate: row.service_date,
  }));
}

describe("a run’s cut-off at its creation (PRC-32)", () => {
  it("counts a line loaded at the creating transaction’s instant: a period holding only that line gets its run, which prices it", async () => {
    const target = await prc19("cut-off-only-line");
    const planId = await w.planOf(target, MA_PLAN);
    let lineId = "";
    const { created, instant } = await createAtInstant(
      target,
      "2026-03-01",
      "2026-03-31",
      async (at) => {
        lineId = await lineAt(target, planId, "2026-03-10", at);
      },
    );
    expect(
      await w.one(
        "SELECT created_at::text AS created FROM pricing_run WHERE id = $1",
        [created.pricingRunId],
      ),
    ).toEqual({ created: instant });
    await w.execute(target, created.pricingRunId);
    expect(
      await w.one("SELECT status FROM pricing_run WHERE id = $1", [
        created.pricingRunId,
      ]),
    ).toEqual({ status: "complete" });
    const { rows } = await w.owner.query<{ service_line_id: string }>(
      "SELECT service_line_id FROM priced_line WHERE pricing_run_id = $1",
      [created.pricingRunId],
    );
    expect(rows.map((row) => row.service_line_id)).toEqual([lineId]);
  });

  it("counts it for MAP-07: the only mapped plan’s line, loaded at that instant, is not refused as nothing mapped", async () => {
    const target = await prc19("cut-off-map-07", false);
    const planId = await newPlan(target, "CE:SYNPLAN-CUTOFF-NEW");
    await w.mapped(target, planId, "no_agreement", "2026-01-01");
    const { created } = await createAtInstant(
      target,
      "2026-02-01",
      "2026-02-28",
      (at) => lineAt(target, planId, "2026-02-21", at),
    );
    await w.execute(target, created.pricingRunId);
    const { rows } = await w.owner.query<{
      reason: string | null;
      plan: string;
    }>(
      `SELECT p.unpriced_reason AS reason, l.payer_plan_key AS plan FROM priced_line p JOIN service_line l ON l.id = p.service_line_id
        WHERE p.pricing_run_id = $1 AND l.payer_plan_key = $2`,
      [created.pricingRunId, planId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).not.toBe("NO_MAPPING");
  });

  it("judges exactly the plans and dates the price job prices, sending the run’s own cut-off", async () => {
    const target = await prc19("cut-off-same-view");
    const planId = await w.planOf(target, MA_PLAN);
    const { created, judged, sameCutOff } = await createAtInstant(
      target,
      "2026-02-01",
      "2026-02-28",
      (at) => lineAt(target, planId, "2026-02-21", at),
    );
    expect(sameCutOff).toBe(true);
    expect(judged).toEqual([
      { planId, serviceDate: "2026-02-20" },
      { planId, serviceDate: "2026-02-21" },
    ]);
    await w.execute(target, created.pricingRunId);
    expect(await pricedPlans(created.pricingRunId)).toEqual(judged);
  });
});
