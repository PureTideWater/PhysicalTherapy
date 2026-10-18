import { randomUUID } from 'node:crypto';

import { RATE_RECORD_FIELDS, approveRateRecordField, approveVersion, signOffVersion, supersedeVersion, verifyDisputeWindow } from '@tp/contracts';
import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import { type DeadlineMinimumLevel, type DeadlineStatus, packetDeadlineStatus } from '@tp/triage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEADLINE_RELEASE, type Practice } from '../price/test-support/pricing-world';
import { lineDeadlines, nextLevelDeadline } from './deadline';
import { TriageWorld } from './test-support/triage-world';

/**
 * D17 (a) twice, on the same lines (reconciliation-001; docs/adr/0061): @tp/triage's deadlineVerification(), through
 * the worker's loader (lineDeadlines, nextLevelDeadline), against the database's priced_line_deadline_status(),
 * case_next_window_deadline_status() and packet_version_deadline_status() (migration 20261103090000), over lines the
 * price job priced: a contract whose window the specialist cited and verified, one whose window is uncited, a
 * version superseded since, and Medicare Advantage lines under release 900001 (its windows at L1) and 900005 (at L2),
 * and under 900005 once it is withdrawn (its records then verify nothing). Synthetic data only.
 */

let w: TriageWorld;

beforeAll(async () => {
  w = await TriageWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

const FIXED = { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 };

/** Both derivations of every priced line of a run, at a minimum level: the database's and @tp/triage's. */
async function both(target: Practice, runId: string, minimumLevel: DeadlineMinimumLevel = 'L2') {
  return withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, async (scope) => {
    const { rows } = await scope.client.query<{ id: string; plan_key: string; sql: DeadlineStatus }>(
      `SELECT p.id, pl.plan_key, priced_line_deadline_status(p.id, $2) AS sql
         FROM priced_line p JOIN service_line l ON l.id = p.service_line_id JOIN plan pl ON pl.id = l.payer_plan_key
        WHERE p.pricing_run_id = $1 ORDER BY p.id`,
      [runId, minimumLevel],
    );
    const loaded = await lineDeadlines(
      scope.client,
      rows.map((row) => row.id),
      minimumLevel,
    );
    return rows.map((row) => ({ id: row.id, plan: row.plan_key, sql: row.sql, ts: loaded.get(row.id) }));
  });
}

function agree(lines: Awaited<ReturnType<typeof both>>): void {
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    expect(line.ts?.status, `${line.plan} ${line.id}`).toBe(line.sql);
  }
}

describe('a contract’s own window', () => {
  it('is verified on both sides when cited and verified, unverified when uncited, and unverified once its version is superseded', async () => {
    const practice = await w.practice('DEADLINE-CONTRACT');
    await w.load(practice, 'CAS-03/remit.835');
    const cited = await w.fixedContract(practice, FIXED);
    const uncited = await w.fixedContract(practice, { ...FIXED, schedule: [{ code: '97530', amountCents: '5200' }], windowCited: false });
    const runId = await w.pricedRun(practice, {
      plans: [
        { key: 'CE:SYNPLAN-FIX-ONE', versionId: cited.versionId },
        { key: 'CE:SYNPLAN-FIX-TWO', versionId: uncited.versionId },
      ],
      from: '2026-03-01',
      to: '2026-03-31',
    });
    const lines = await both(practice, runId);
    agree(lines);
    expect(new Set(lines.filter((line) => line.plan === 'CE:SYNPLAN-FIX-ONE').map((line) => `${String(line.ts?.status)} ${String(line.ts?.source)}`))).toEqual(new Set(['verified contract']));
    expect(new Set(lines.filter((line) => line.plan === 'CE:SYNPLAN-FIX-TWO').map((line) => `${String(line.ts?.status)} ${String(line.ts?.cause)}`))).toEqual(new Set(['unverified CONTRACT_WINDOW_UNCITED']));
    // The contract window's level is no question: L3 asks nothing more of it.
    agree(await both(practice, runId, 'L3'));
    expect((await both(practice, runId, 'L3')).filter((line) => line.plan === 'CE:SYNPLAN-FIX-ONE').every((line) => line.sql === 'verified')).toBe(true);

    // Triage opens a case on the verified window's pattern only; the uncited one waits with DEADLINE_UNVERIFIED.
    const triaged = await w.triage(practice, runId);
    expect(triaged).toMatchObject({ outcome: 'triaged', summary: { validatedLines: 16, casesOpened: 1 } });

    // A packet's deadline over the lines, as packet_version_deadline_status() and packetDeadlineStatus() read it.
    const fixOne = lines.filter((line) => line.plan === 'CE:SYNPLAN-FIX-ONE');
    const mixed = [...fixOne.slice(0, 2), ...lines.filter((line) => line.plan === 'CE:SYNPLAN-FIX-TWO').slice(0, 1)];
    const caseId = await withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, async (scope) => {
      const { rows } = await scope.client.query<{ id: string }>('SELECT id FROM "case"');
      return rows[0]?.id ?? '';
    });
    const packetStatus = (content: object) =>
      withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, async (scope) =>
        (await scope.client.query<{ status: DeadlineStatus }>('SELECT packet_version_deadline_status($1, $2::jsonb) AS status', [caseId, JSON.stringify(content)])).rows[0]?.status,
      );
    const content = (picked: typeof lines, extra: object = {}) => ({ format: 'tp-packet/2', dispute_level: 1, lines: picked.map((line) => ({ priced_line_id: line.id })), ...extra });
    for (const picked of [fixOne, mixed, []]) {
      expect(await packetStatus(content(picked))).toBe(packetDeadlineStatus(picked.map((line) => ({ status: line.ts?.status ?? 'unverified' }))));
    }
    expect(await packetStatus(content(fixOne))).toBe('verified');
    expect(await packetStatus(content(mixed))).toBe('unverified');
    expect(await packetStatus(content([]))).toBe('not_applicable');
    // A tp-packet/1 version is never verified; a second level's deadline is the next window's, and a contract's appeal levels carry no evidence.
    expect(await packetStatus({ ...content(fixOne), format: 'tp-packet/1' })).toBe('unverified');
    expect(await packetStatus(content(fixOne, { dispute_level: 2 }))).toBe('unverified');
    const next = await withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) => nextLevelDeadline(scope.client, caseId));
    expect(next).toMatchObject({ endsOn: null, verification: { status: 'unverified', cause: 'NEXT_LEVEL_UNCITED' } });

    // Superseded by a correction since the run: no longer a signed-off window, on both sides.
    // The correction copies the window's citation (the days are the same), which the specialist verifies again.
    const correction = await w.as(practice, w.pricing.specialist, async (context) => {
      const { versionId } = await supersedeVersion(context, { practiceId: practice.practiceId, versionId: cited.versionId });
      const { rows } = await context.scope.client.query<{ id: string }>('SELECT id FROM rate_record WHERE contract_version_id = $1', [versionId]);
      for (const row of rows) {
        for (const field of RATE_RECORD_FIELDS) {
          await approveRateRecordField(context, { practiceId: practice.practiceId, rateRecordId: row.id, field });
        }
      }
      expect(await verifyDisputeWindow(context, { practiceId: practice.practiceId, versionId })).toMatchObject({ verified: true });
      await approveVersion(context, { practiceId: practice.practiceId, versionId });
      return versionId;
    });
    await w.as(practice, practice.manager, (context) => signOffVersion(context, { practiceId: practice.practiceId, versionId: correction }));
    const after = await both(practice, runId);
    agree(after);
    expect(new Set(after.filter((line) => line.plan === 'CE:SYNPLAN-FIX-ONE').map((line) => `${String(line.ts?.status)} ${String(line.ts?.cause)}`))).toEqual(new Set(['unverified CONTRACT_VERSION_NOT_SIGNED_OFF']));
  }, 120_000);

  it('reads a line it cannot see as unverified in SQL, and leaves it out of the loader’s map (fail closed)', async () => {
    const north = await w.practice('DEADLINE-NORTH');
    await w.load(north, 'CAS-03/remit.835');
    const contract = await w.fixedContract(north, FIXED);
    const runId = await w.pricedRun(north, {
      plans: [
        { key: 'CE:SYNPLAN-FIX-ONE', versionId: contract.versionId },
        { key: 'CE:SYNPLAN-FIX-TWO', versionId: null, kind: 'no_agreement' },
      ],
      from: '2026-03-01',
      to: '2026-03-31',
    });
    const priced = await both(north, runId);
    agree(priced);
    // An unpriced line has no window: not applicable on both sides.
    expect(new Set(priced.filter((entry) => entry.plan === 'CE:SYNPLAN-FIX-TWO').map((entry) => entry.sql))).toEqual(new Set(['not_applicable']));
    const line = priced.find((entry) => entry.plan === 'CE:SYNPLAN-FIX-ONE');
    expect(line?.sql).toBe('verified');
    const south = await w.practice('DEADLINE-SOUTH');
    const seen = await withPracticeScope(w.app, { actorId: south.manager, practiceIds: [south.practiceId] }, async (scope) => ({
      sql: (await scope.client.query<{ status: string }>('SELECT priced_line_deadline_status($1) AS status', [line?.id])).rows[0]?.status,
      ts: (await lineDeadlines(scope.client, [line?.id ?? ''])).size,
      next: await nextLevelDeadline(scope.client, randomUUID()),
      unknown: (await scope.client.query<{ status: string }>('SELECT priced_line_deadline_status($1) AS status, case_next_window_deadline_status($1)', [randomUUID()])).rows[0]?.status,
    }));
    expect(seen).toMatchObject({ sql: 'unverified', ts: 0, next: { verification: { status: 'unverified' } }, unknown: 'unverified' });
    // A level outside L2 and L3 is refused, never read as a pass.
    await expect(
      withPracticeScope(w.app, { actorId: north.manager, practiceIds: [north.practiceId] }, (scope) => scope.client.query("SELECT priced_line_deadline_status($1, 'L1')", [line?.id])),
    ).rejects.toMatchObject({ code: '22023' });
  }, 120_000);
});

describe('a release window (Medicare Advantage non-contracted, Medicare redetermination)', () => {
  it('is unverified under 900001’s L1 records, verified at L2 (not at L3) under 900005’s, and unverified once 900005 is withdrawn, on both sides', async () => {
    const practice = await w.practice('DEADLINE-MA');
    await w.load(practice, 'MAP-05/remit.835');
    await w.pricing.mapped(practice, await w.pricing.planOf(practice, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    const firstRun = await w.pricing.createRun(practice, '2026-02-01', '2026-02-28');
    await w.pricing.execute(practice, firstRun);
    const first = await both(practice, firstRun);
    agree(first);
    expect(new Set(first.map((line) => `${String(line.ts?.status)} ${String(line.ts?.source)} ${String(line.ts?.level)} ${String(line.ts?.cause)}`))).toEqual(new Set(['unverified release L1 RECORD_BELOW_LEVEL']));

    await w.pricing.loadDeadlineRelease();
    const secondRun = await w.pricing.createRun(practice, '2026-02-01', '2026-02-28', DEADLINE_RELEASE);
    await w.pricing.execute(practice, secondRun);
    const second = await both(practice, secondRun);
    agree(second);
    expect(new Set(second.map((line) => `${String(line.ts?.status)} ${String(line.ts?.level)}`))).toEqual(new Set(['verified L2']));
    const strict = await both(practice, secondRun, 'L3');
    agree(strict);
    expect(new Set(strict.map((line) => `${String(line.ts?.status)} ${String(line.ts?.cause)}`))).toEqual(new Set(['unverified RECORD_BELOW_LEVEL']));
    // The first run's lines name 900001's records: a later release does not verify them.
    agree(await both(practice, firstRun));
    expect((await both(practice, firstRun)).every((line) => line.sql === 'unverified')).toBe(true);

    // 900005 withdrawn (its content was wrong): the second run stays pinned to it, and its L2 records verify nothing now, on both sides.
    await w.pricing.withdraw(DEADLINE_RELEASE);
    const withdrawn = await both(practice, secondRun);
    agree(withdrawn);
    expect(new Set(withdrawn.map((line) => `${String(line.ts?.status)} ${String(line.ts?.level)} ${String(line.ts?.cause)}`))).toEqual(new Set(['unverified L2 RELEASE_WITHDRAWN']));
    agree(await both(practice, secondRun, 'L3'));
  }, 120_000);
});
