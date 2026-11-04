import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import { type Practice, PricingWorld } from '@tp/worker/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { practiceLocation, runsPricedElsewhere } from './location';
import { runsInEffect } from './queries';

/**
 * The runs the Pricing settings page lists as priced before the location changed (runsPricedElsewhere), for a complete
 * run with no line, which keeps no trace and is compared by time (test matrix PRC-32): created before the location's
 * last save, to the microsecond, as Postgres orders the two, even within one millisecond. Read as the page reads it:
 * the runs in effect, then the practice's location, in the billing manager's scope. The run and the save's times are
 * set by the test's superuser connection with triggers off for the one statement, as no role can (its priced lines
 * removed the same way), so the two fall in one millisecond in a known order. SYNTHETIC 835s (PRC-19) in one scratch database.
 */

let w: PricingWorld;

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
}, 120_000);

afterAll(async () => {
  await w.close();
});

/** Runs `statement` on the superuser connection with triggers off for it (pricing_run and practice_site refuse such changes). */
async function asSuperuser(statement: string, values: unknown[]): Promise<void> {
  await w.owner.query('BEGIN');
  try {
    await w.owner.query("SET LOCAL session_replication_role = 'replica'");
    await w.owner.query(statement, values);
    await w.owner.query('COMMIT');
  } catch (error) {
    await w.owner.query('ROLLBACK');
    throw error;
  }
}

/** The practice's runs the page lists as priced before the location changed. */
const pricedElsewhere = (target: Practice) =>
  withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, async (scope) => {
    const location = await practiceLocation(scope.client, target.practiceId);
    const inEffect = await runsInEffect(scope, target.practiceId, `test-${randomUUID()}`);
    return location === null ? [] : [...(await runsPricedElsewhere(scope.client, target.practiceId, inEffect, location))];
  });

/** A complete run of February with no priced line, created at `createdAt`; the location last saved at `savedAt`. */
async function runWithNoLine(label: string, createdAt: string, savedAt: string): Promise<{ readonly target: Practice; readonly runId: string }> {
  const target = await w.practice(label);
  await w.load(target, 'PRC-19/remit.835');
  await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-NC'), 'ma_noncontracted', '2026-01-01');
  const runId = await w.createRun(target, '2026-02-01', '2026-02-28');
  await w.execute(target, runId);
  // Its lines left out, as a run whose lines a correction superseded before it was priced keeps none.
  await asSuperuser('DELETE FROM priced_line WHERE pricing_run_id = $1', [runId]);
  await asSuperuser('UPDATE pricing_run SET created_at = $2::timestamptz WHERE id = $1', [runId, createdAt]);
  await asSuperuser('UPDATE practice_site SET updated_at = $2::timestamptz WHERE practice_id = $1', [target.practiceId, savedAt]);
  return { target, runId };
}

describe('a complete run with no line, against the location’s last save (PRC-32)', () => {
  it('is listed when created before the save in an earlier millisecond', async () => {
    const { target, runId } = await runWithNoLine('elsewhere-earlier-ms', '2026-03-02 10:00:00.000100+00', '2026-03-02 10:00:00.002100+00');
    expect(await pricedElsewhere(target)).toEqual([runId]);
  });

  it('is listed when created before the save in the same millisecond', async () => {
    const { target, runId } = await runWithNoLine('elsewhere-same-ms-before', '2026-03-02 10:00:00.000100+00', '2026-03-02 10:00:00.000900+00');
    expect(await pricedElsewhere(target)).toEqual([runId]);
  });

  it('is not listed when created after the save in the same millisecond, nor at its very instant', async () => {
    const after = await runWithNoLine('elsewhere-same-ms-after', '2026-03-02 10:00:00.000900+00', '2026-03-02 10:00:00.000100+00');
    expect(await pricedElsewhere(after.target)).toEqual([]);
    const same = await runWithNoLine('elsewhere-same-instant', '2026-03-02 10:00:00.000500+00', '2026-03-02 10:00:00.000500+00');
    expect(await pricedElsewhere(same.target)).toEqual([]);
  });
});
