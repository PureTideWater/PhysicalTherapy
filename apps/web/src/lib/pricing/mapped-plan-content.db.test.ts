import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { createRerun } from '@tp/worker/pricing';
import { CONTENT_GAP_RELEASE, type Practice, PricingWorld, RELEASE } from '@tp/worker/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { forgetContentThrough } from '../releases/content-through';
import { monthsToPriceAgain } from './mapped-plan';

/**
 * A re-run that waited on Medicare content is offered again when a release loads more of that content (combined audit
 * #32, docs/adr/0075; test matrix MAP-08; design §4.2 R3-3; review finding C-5). mapped-plan.db.test.ts reopens such a
 * month through a change of the terms only; here no term changes, so only the release branch of stateOf can reopen it:
 * a release in force other than the re-run's own (inForce !== failed_release_no) that covers more of the month's
 * content than the re-run's release did (coversMore). Its own scratch database, since it publishes releases: 900007
 * (MPPR and MUE through 2026-09-30) is loaded first, then a copy of it under a newer number (no more content), then a
 * copy of 900001 (all of 2026) under a newer number again. Loaded from MAP-06's SYNTHETIC 835 moved to October 2026.
 */

/** 900007's records under a newer number: in force, it loads no more of October. */
const SAME_GAP_RELEASE = 900_097;
/** 900001's records under a newer number: in force, it loads all of 2026's MPPR and MUE. */
const MORE_CONTENT_RELEASE = 900_098;

let w: PricingWorld;

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
  forgetContentThrough();
  await w.loadContentGapRelease();
}, 60_000);

afterAll(async () => {
  await w.close();
});

const FIXED_FEE = { scope: {}, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '5000' }, flags: { timed_units_rule: 'PER_CODE' } };
const inScope = <T>(target: Practice, read: (scope: PracticeScope<ScopeClient>) => Promise<T>) => withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, read);
const requestId = () => `test-${randomUUID()}`;
const stateOfMonth = async (practice: Practice) => (await inScope(practice, (scope) => monthsToPriceAgain(scope, practice.practiceId, null, requestId())))[0]?.state;

/** Publishes `from`'s records again under `releaseNo`, as the release in force (the test's owner role). */
async function republished(releaseNo: number, from: number): Promise<void> {
  await w.owner.query("INSERT INTO rule_release (release_no, manifest_sha256, notes) VALUES ($1, $2, 'SYNTHETIC')", [releaseNo, String(releaseNo % 10).repeat(64)]);
  await w.owner.query(
    `INSERT INTO rule_record (release_no, record_type, key, value, effective_from, effective_to, source, verification, sha256)
     SELECT $1, record_type, key, value, effective_from, effective_to, source, verification, sha256 FROM rule_record WHERE release_no = $2`,
    [releaseNo, from],
  );
  await w.owner.query('UPDATE rule_release SET published_at = now() WHERE release_no = $1', [releaseNo]);
  expect(await w.one<{ release_no: number }>('SELECT current_rule_release() AS release_no', [])).toEqual({ release_no: releaseNo });
}

describe('a re-run that waited on Medicare content, offered again when a release loads more of it (MAP-08; C-5)', () => {
  it('stays rerun_failed under its own release and under a newer one that loads no more, and is ready once a release in force loads more, with no change of terms', async () => {
    const practice = await w.practice('content-rerun-release');
    // MAP-06's February moved to October 2026 (paid in November).
    await w.loadVariant(practice, 'MAP-06/remit.835', [
      ['20260221', '20261021'],
      ['20260329', '20261129'],
      ['20260328', '20261128'],
      ['260329', '261129'],
    ]);
    const [a, b] = [await w.planOf(practice, 'CE:SYNPLAN-COMM-06'), await w.planOf(practice, 'CE:SYNPLAN-UNMAPPED-06')];
    const fixed = await w.signedContract(practice, '2026-01-01', { terms: FIXED_FEE });
    await w.mapped(practice, a, 'contract', '2026-01-01', fixed.versionId);
    const first = await w.createRun(practice, '2026-10-01', '2026-10-31', CONTENT_GAP_RELEASE);
    await w.execute(practice, first);
    expect(await w.one('SELECT status FROM pricing_run WHERE id = $1', [first])).toEqual({ status: 'complete' });
    // B mapped MA non-contracted: its lines read MPPR and MUE for October, which 900007 does not load.
    await w.mapped(practice, b, 'ma_noncontracted', '2026-01-01');
    const rerun = (await inScope(practice, (scope) => createRerun(scope, { practiceId: practice.practiceId, pricingRunId: first, releaseNo: CONTENT_GAP_RELEASE, requestId: requestId() }))).pricingRunId;
    await w.execute(practice, rerun);
    const { failure_code: failureCode } = await w.one<{ failure_code: string }>('SELECT failure_code FROM pricing_run WHERE id = $1', [rerun]);
    expect(failureCode).toMatch(/^waiting_on_content_/);
    const held = { kind: 'rerun_failed', rerunId: rerun, failureCode, wait: 'content' };
    // The re-run's own release in force: held.
    expect(await stateOfMonth(practice)).toEqual(held);
    // A newer release in force that loads no more of October: still held (coversMore is false).
    await republished(SAME_GAP_RELEASE, CONTENT_GAP_RELEASE);
    expect(await stateOfMonth(practice)).toEqual(held);
    // A newer release in force that loads October's MPPR and MUE: ready again, its last failure the content wait.
    await republished(MORE_CONTENT_RELEASE, RELEASE);
    expect(await stateOfMonth(practice)).toEqual({ kind: 'ready', lastFailure: { rerunId: rerun, failureCode, reason: 'content' } });
  }, 120_000);
});
