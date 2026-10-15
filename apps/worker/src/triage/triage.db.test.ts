import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import { addMembership, createUser } from '@tp/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Practice } from '../price/test-support/pricing-world';
import { type TriageOutcome, todayUtc } from './execute';
import { TriageWorld } from './test-support/triage-world';

/**
 * Triage against PostgreSQL, through the triage job's own code (PRD 12; PRD 5, J8; PRD 8, The status
 * machine; test matrix CAS-01 to CAS-07, PRC-14, PRC-15). Each case is a practice of its own: its
 * SYNTHETIC CAS fixture is parsed and loaded by the parse_835 job, its plans mapped and fixed-schedule
 * contracts signed off through @tp/contracts' services, a run priced by the price job, and triage run in
 * the practice's job scope under SYNTHETIC release 900001.
 */

let w: TriageWorld;

beforeAll(async () => {
  w = await TriageWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

const FIXED = { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 };

function summary(outcome: TriageOutcome) {
  if (outcome.outcome !== 'triaged') {
    throw new Error(`triage did not run: ${outcome.outcome}`);
  }
  return outcome.summary;
}

async function rows<T>(target: Practice, sql: string, values: unknown[] = []): Promise<T[]> {
  return withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, async (scope) => (await scope.client.query<T & object>(sql, values)).rows);
}

/** Each service line's current stage, by procedure code and stage. */
const stages = (target: Practice) =>
  rows<{ stage: string; lines: string }>(
    target,
    `SELECT s.stage, count(*)::text AS lines FROM (SELECT DISTINCT ON (service_line_id) service_line_id, stage FROM line_status ORDER BY service_line_id, seq DESC) s GROUP BY s.stage ORDER BY s.stage`,
  );

const cases = (target: Practice) =>
  rows<{ id: string; plan_key: string; state: string; actionable_cents: string; deadline_on: string | null; lines: string; open_lines: string; pattern_key: Record<string, unknown> }>(
    target,
    `SELECT c.id, pl.plan_key, c.state, c.actionable_cents::text, c.deadline_on::text, c.pattern_key,
            (SELECT count(*) FROM case_line cl WHERE cl.case_id = c.id)::text AS lines,
            (SELECT count(*) FROM case_line cl WHERE cl.case_id = c.id AND cl.written_off_reason IS NULL)::text AS open_lines
       FROM "case" c JOIN plan pl ON pl.id = c.plan_id ORDER BY pl.plan_key`,
  );

describe('anomaly screening (CAS-01, CAS-02; MAP-04: no agreement goes to screening only)', () => {
  it('produces no anomaly for a cohort one line short of the minimum (CAS-01)', async () => {
    const practice = await w.practice('CAS-01', { anomaly_threshold_cents: '1000' });
    await w.load(practice, 'CAS-01/remit.835');
    const runId = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-OON-CAS', versionId: null, kind: 'no_agreement' }], from: '2026-04-01', to: '2026-06-30' });
    expect(summary(await w.triage(practice, runId))).toMatchObject({ anomalies: 0, flaggedLines: 0, validatedLines: 0, casesOpened: 0 });
    expect(await rows(practice, 'SELECT id FROM anomaly')).toEqual([]);
    expect(await stages(practice)).toEqual([]);
  });

  it('records the cohort, its mode and the four lines short of it, flagged and investigatory, in no case (CAS-02)', async () => {
    const practice = await w.practice('CAS-02', { anomaly_threshold_cents: '1000' });
    await w.load(practice, 'CAS-02/remit.835');
    const runId = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-OON-CAS', versionId: null, kind: 'no_agreement' }], from: '2026-04-01', to: '2026-06-30' });
    expect(summary(await w.triage(practice, runId))).toMatchObject({ anomalies: 1, flaggedLines: 4, validatedLines: 0, casesOpened: 0 });
    const [anomaly, ...others] = await rows<{ cohort_size: number; modal_allowed_cents: string; stats: Record<string, unknown>; line_ids: string[]; cohort_key: Record<string, unknown> }>(
      practice,
      'SELECT cohort_size, modal_allowed_cents::text, stats, line_ids, cohort_key FROM anomaly',
    );
    expect(others).toEqual([]);
    expect(anomaly).toMatchObject({ cohort_size: 32, modal_allowed_cents: '9000' });
    expect(anomaly?.line_ids).toHaveLength(4);
    expect(anomaly?.stats).toMatchObject({ label: 'investigatory', flagged_lines: 4, below_mode_lines: 4, range_high_cents: '8000', range_low_cents: '4000' });
    expect(anomaly?.cohort_key).toMatchObject({ procedure_code: '97110', place_of_service: '11', quarter: '2026-Q2', modifiers: [] });
    expect(await stages(practice)).toEqual([{ stage: 'flagged', lines: '4' }]);
    expect(await cases(practice)).toEqual([]);
    // Written once per run: a second triage finds it and adds nothing.
    expect(summary(await w.triage(practice, runId))).toMatchObject({ anomalies: 0, flaggedLines: 4 });
    expect(await rows(practice, 'SELECT id FROM anomaly')).toHaveLength(1);
    expect(await stages(practice)).toEqual([{ stage: 'flagged', lines: '4' }]);
  });
});

describe('cases by payer pattern (CAS-03, CAS-04, CAS-05, PRC-14, PRC-15)', () => {
  it('opens one case per pattern, each the sum of its lines, its lines actionable (CAS-03)', async () => {
    const practice = await w.practice('CAS-03');
    await w.load(practice, 'CAS-03/remit.835');
    const one = await w.fixedContract(practice, FIXED);
    const two = await w.fixedContract(practice, { ...FIXED, schedule: [{ code: '97530', amountCents: '5200' }] });
    const runId = await w.pricedRun(practice, {
      plans: [
        { key: 'CE:SYNPLAN-FIX-ONE', versionId: one.versionId },
        { key: 'CE:SYNPLAN-FIX-TWO', versionId: two.versionId },
      ],
      from: '2026-03-01',
      to: '2026-03-31',
    });
    expect(summary(await w.triage(practice, runId))).toMatchObject({ validatedLines: 16, casesOpened: 2, linesAdded: 16, heldPatterns: 0 });
    const found = await cases(practice);
    expect(found.map((item) => [item.plan_key, item.state, item.lines, item.open_lines, item.actionable_cents])).toEqual([
      ['CE:SYNPLAN-FIX-ONE', 'open', '8', '8', '28000'],
      ['CE:SYNPLAN-FIX-TWO', 'open', '8', '8', '27200'],
    ]);
    expect(found[0]?.pattern_key).toMatchObject({ rate_record_id: one.rateRecordIds[0], contract_version_id: one.versionId, mapping_kind: 'contract', behavior: 'BELOW_CONTRACT_RATE' });
    expect(found[0]?.deadline_on).toBe('2036-03-29');
    // A case's total equals the sum of its actionable lines.
    const sums = await rows<{ case_id: string; total: string }>(practice, 'SELECT cl.case_id, sum(p.variance_cents)::text AS total FROM case_line cl JOIN priced_line p ON p.id = cl.priced_line_id GROUP BY cl.case_id');
    for (const item of found) {
      expect(sums.find((entry) => entry.case_id === item.id)?.total).toBe(item.actionable_cents);
    }
    expect(await stages(practice)).toEqual([{ stage: 'actionable', lines: '16' }]);
    // Idempotent: a second triage changes nothing.
    expect(summary(await w.triage(practice, runId))).toMatchObject({ casesOpened: 0, linesAdded: 0 });
    expect((await cases(practice)).map((item) => item.lines)).toEqual(['8', '8']);
    const events = await rows<{ events: string }>(practice, 'SELECT count(*)::text AS events FROM line_status');
    expect(events[0]?.events).toBe('32');
  });

  it('does not create a case below the case materiality; the pattern accumulates until a later run carries it across (CAS-04)', async () => {
    const practice = await w.practice('CAS-04');
    await w.load(practice, 'CAS-04/remit.835');
    const contract = await w.fixedContract(practice, FIXED);
    const may = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: contract.versionId }], from: '2026-05-01', to: '2026-05-31' });
    expect(summary(await w.triage(practice, may))).toMatchObject({ validatedLines: 3, casesOpened: 0, heldPatterns: 1 });
    expect(await cases(practice)).toEqual([]);
    expect(await stages(practice)).toEqual([{ stage: 'validated', lines: '3' }]);
    // March's lines of the same pattern (the same payer, plan and rate record) carry it across: 60.00 + 280.00.
    await w.load(practice, 'CAS-03/remit.835');
    const march = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: contract.versionId }, { key: 'CE:SYNPLAN-FIX-TWO', versionId: null, kind: 'no_agreement' }], from: '2026-03-01', to: '2026-03-31' });
    expect(summary(await w.triage(practice, march))).toMatchObject({ validatedLines: 11, casesOpened: 1, linesAdded: 11 });
    expect((await cases(practice)).map((item) => [item.plan_key, item.lines, item.actionable_cents])).toEqual([['CE:SYNPLAN-FIX-ONE', '11', '34000']]);
  });

  it('keeps a line below the line materiality validated and in no case (CAS-05), and an overpaid line in neither (PRC-15)', async () => {
    const practice = await w.practice('CAS-05');
    await w.load(practice, 'CAS-05/remit.835');
    const contract = await w.fixedContract(practice, FIXED);
    const runId = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: contract.versionId }], from: '2026-03-01', to: '2026-03-31' });
    expect(summary(await w.triage(practice, runId))).toMatchObject({ validatedLines: 1, casesOpened: 0, heldPatterns: 0 });
    expect(await rows(practice, 'SELECT variance_cents::text FROM priced_line')).toEqual([{ variance_cents: '300' }]);
    expect(await stages(practice)).toEqual([{ stage: 'validated', lines: '1' }]);

    const overpaid = await w.practice('PRC-15');
    await w.load(overpaid, 'CAS-05/remit.835');
    const low = await w.fixedContract(overpaid, { ...FIXED, schedule: [{ code: '97110', amountCents: '4000' }] });
    const overRun = await w.pricedRun(overpaid, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: low.versionId }], from: '2026-03-01', to: '2026-03-31' });
    expect(summary(await w.triage(overpaid, overRun))).toMatchObject({ validatedLines: 0, casesOpened: 0 });
    expect(await rows(overpaid, 'SELECT variance_cents::text FROM priced_line')).toEqual([{ variance_cents: '-700' }]);
    expect(await stages(overpaid)).toEqual([]);
    expect(await cases(overpaid)).toEqual([]);
  });

  it('keeps lines whose window passed on the triage date validated, not actionable (PRC-14), and strikes them from a case when their window closes', async () => {
    const practice = await w.practice('PRC-14');
    await w.load(practice, 'CAS-03/remit.835');
    const one = await w.fixedContract(practice, FIXED);
    // Plan two's contract allows 30 days from the remittance (2026-04-01): its window closed on 2026-05-01.
    const two = await w.fixedContract(practice, { schedule: [{ code: '97530', amountCents: '5200' }], effectiveFrom: '2026-01-01', disputeWindowDays: 30 });
    const runId = await w.pricedRun(practice, {
      plans: [
        { key: 'CE:SYNPLAN-FIX-ONE', versionId: one.versionId },
        { key: 'CE:SYNPLAN-FIX-TWO', versionId: two.versionId },
      ],
      from: '2026-03-01',
      to: '2026-03-31',
    });
    // Judged on 2026-04-15, both windows are open: two cases.
    expect(summary(await w.triage(practice, runId, '2026-04-15'))).toMatchObject({ casesOpened: 2, linesAdded: 16 });
    // Judged today, plan two's lines are past their window: written off by triage, struck through, out of the total; the case closes.
    expect(summary(await w.triage(practice, runId, todayUtc()))).toMatchObject({ windowsClosed: 8, casesOpened: 0 });
    const found = await cases(practice);
    expect(found.map((item) => [item.plan_key, item.state, item.lines, item.open_lines, item.actionable_cents, item.deadline_on])).toEqual([
      ['CE:SYNPLAN-FIX-ONE', 'open', '8', '8', '28000', '2036-03-29'],
      ['CE:SYNPLAN-FIX-TWO', 'closed_written_off', '8', '0', '0', null],
    ]);
    const struck = await rows<{ written_off_reason: string; written_off_by: string | null; actionable: boolean }>(
      practice,
      "SELECT DISTINCT cl.written_off_reason, cl.written_off_by, cl.actionable FROM case_line cl JOIN \"case\" c ON c.id = cl.case_id JOIN plan pl ON pl.id = c.plan_id WHERE pl.plan_key = 'CE:SYNPLAN-FIX-TWO'",
    );
    expect(struck).toEqual([{ written_off_reason: 'window_passed', written_off_by: null, actionable: false }]);

    // In a practice triaged only today, plan two's lines never join a case: validated, WINDOW_PASSED.
    const later = await w.practice('PRC-14 later');
    await w.load(later, 'CAS-03/remit.835');
    const laterOne = await w.fixedContract(later, FIXED);
    const laterTwo = await w.fixedContract(later, { schedule: [{ code: '97530', amountCents: '5200' }], effectiveFrom: '2026-01-01', disputeWindowDays: 30 });
    const laterRun = await w.pricedRun(later, {
      plans: [
        { key: 'CE:SYNPLAN-FIX-ONE', versionId: laterOne.versionId },
        { key: 'CE:SYNPLAN-FIX-TWO', versionId: laterTwo.versionId },
      ],
      from: '2026-03-01',
      to: '2026-03-31',
    });
    expect(summary(await w.triage(later, laterRun))).toMatchObject({ validatedLines: 16, casesOpened: 1, heldPatterns: 1 });
    expect((await cases(later)).map((item) => item.plan_key)).toEqual(['CE:SYNPLAN-FIX-ONE']);
    expect(await stages(later)).toEqual([
      { stage: 'actionable', lines: '8' },
      { stage: 'validated', lines: '8' },
    ]);
  });
});

describe('write-offs and reopening (CAS-06, CAS-07)', () => {
  it('takes a written-off line out of the total and keeps it visible; reopens it with a reason; never for a viewer, nor past its window', async () => {
    const practice = await w.practice('CAS-06');
    await w.load(practice, 'CAS-03/remit.835');
    const one = await w.fixedContract(practice, FIXED);
    const runId = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: one.versionId }, { key: 'CE:SYNPLAN-FIX-TWO', versionId: null, kind: 'no_agreement' }], from: '2026-03-01', to: '2026-03-31' });
    summary(await w.triage(practice, runId));
    const [line] = await rows<{ id: string }>(practice, 'SELECT id FROM case_line ORDER BY service_line_id LIMIT 1');
    const lineId = line?.id ?? '';
    const writeOff = (actorId: string, reason: string, text: string | null = null) =>
      withPracticeScope(w.app, { actorId, practiceIds: [practice.practiceId] }, (scope) =>
        scope.client.query('UPDATE case_line SET written_off_reason = $2, written_off_text = $3, written_off_by = $4 WHERE id = $1', [lineId, reason, text, actorId]),
      );
    const reopen = (actorId: string, reason: string) =>
      withPracticeScope(w.app, { actorId, practiceIds: [practice.practiceId] }, (scope) =>
        scope.client.query('UPDATE case_line SET written_off_reason = NULL, written_off_text = NULL, written_off_by = NULL, reopen_reason = $2, reopened_by = $3 WHERE id = $1', [lineId, reason, actorId]),
      );
    const viewer = await createUser(w.owner);
    await addMembership(w.owner, practice.world.organizationId, viewer, 'viewer');
    await expect(writeOff(viewer, 'not_worth_pursuit')).rejects.toMatchObject({ code: '42501' });
    // "Other" says why; the other reasons say nothing more.
    await expect(writeOff(practice.manager, 'other')).rejects.toMatchObject({ code: '23514' });
    // Triage's own reason, in a person's name, is a person's write-off: allowed; in no one's name it is refused.
    await expect(
      withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) => scope.client.query("UPDATE case_line SET written_off_reason = 'window_passed' WHERE id = $1", [lineId])),
    ).rejects.toMatchObject({ code: '23514' });
    await writeOff(practice.manager, 'not_worth_pursuit');
    expect((await cases(practice)).map((item) => [item.lines, item.open_lines, item.actionable_cents])).toEqual([['8', '7', '24500']]);
    const [struck] = await rows<{ written_off_reason: string; actionable: boolean; written_off_at: Date | null }>(practice, 'SELECT written_off_reason, actionable, written_off_at FROM case_line WHERE id = $1', [lineId]);
    expect(struck).toMatchObject({ written_off_reason: 'not_worth_pursuit', actionable: false });
    expect(struck?.written_off_at).toBeInstanceOf(Date);
    // A reopen says why, in the reopener's own name, by a role that works cases.
    await expect(reopen(viewer, 'enc:v1:SYNTHETIC')).rejects.toMatchObject({ code: '42501' });
    await expect(
      withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
        scope.client.query('UPDATE case_line SET written_off_reason = NULL, written_off_by = NULL, reopened_by = $2 WHERE id = $1', [lineId, practice.manager]),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await reopen(practice.manager, 'enc:v1:SYNTHETIC-REASON');
    expect((await cases(practice)).map((item) => [item.open_lines, item.actionable_cents])).toEqual([['8', '28000']]);
    // A case line changes only by a write-off or a reopen, and is never deleted.
    await expect(
      withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) => scope.client.query('DELETE FROM case_line WHERE id = $1', [lineId])),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) => scope.client.query('UPDATE "case" SET actionable_cents = 1 WHERE practice_id = $1', [practice.practiceId])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('refuses to reopen a line whose window has passed (a line past its window cannot be actionable)', async () => {
    const practice = await w.practice('CAS-07 window');
    await w.load(practice, 'CAS-03/remit.835');
    const two = await w.fixedContract(practice, { schedule: [{ code: '97530', amountCents: '5200' }], effectiveFrom: '2026-01-01', disputeWindowDays: 30 });
    const runId = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-TWO', versionId: two.versionId }, { key: 'CE:SYNPLAN-FIX-ONE', versionId: null, kind: 'no_agreement' }], from: '2026-03-01', to: '2026-03-31' });
    summary(await w.triage(practice, runId, '2026-04-15'));
    summary(await w.triage(practice, runId));
    const [line] = await rows<{ id: string }>(practice, "SELECT id FROM case_line WHERE written_off_reason = 'window_passed' LIMIT 1");
    await expect(
      withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
        scope.client.query('UPDATE case_line SET written_off_reason = NULL, reopen_reason = $2, reopened_by = $3 WHERE id = $1', [line?.id, 'enc:v1:SYNTHETIC', practice.manager]),
      ),
    ).rejects.toThrow(/past its window/);
  });
});

describe('the stage rules in SQL (PRD 8: monotonic forward, reopen explicit)', () => {
  it('refuses a move back, a repeat, the ledger stages, an event in another person’s name and a reopen without a reason or from the wrong stage', async () => {
    const practice = await w.practice('stages');
    await w.load(practice, 'CAS-05/remit.835');
    const contract = await w.fixedContract(practice, FIXED);
    const runId = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: contract.versionId }], from: '2026-03-01', to: '2026-03-31' });
    summary(await w.triage(practice, runId));
    const [line] = await rows<{ service_line_id: string }>(practice, 'SELECT service_line_id FROM priced_line LIMIT 1');
    const lineId = line?.service_line_id ?? '';
    const insert = (stage: string, reopenedFrom: string | null, reason: string | null, setBy: string | null = practice.manager, actorId = practice.manager) =>
      withPracticeScope(w.app, { actorId, practiceIds: [practice.practiceId] }, (scope) =>
        scope.client.query('INSERT INTO line_status (practice_id, service_line_id, stage, reopened_from, reason, set_by) VALUES ($1, $2, $3, $4, $5, $6)', [practice.practiceId, lineId, stage, reopenedFrom, reason, setBy]),
      );
    await expect(insert('flagged', null, null)).rejects.toThrow(/move forward only/);
    await expect(insert('validated', null, null)).rejects.toThrow(/move forward only/);
    await expect(insert('payer_approved', null, null)).rejects.toThrow(/recovery ledger/);
    await expect(insert('recovered', null, null)).rejects.toThrow(/recovery ledger/);
    await expect(insert('actionable', null, null, randomUUID())).rejects.toThrow(/own name/);
    const other = await createUser(w.owner);
    await addMembership(w.owner, practice.world.organizationId, other, 'billing_manager');
    await expect(insert('actionable', null, null, other)).rejects.toThrow(/own name/);
    await expect(insert('validated', 'actionable', 'enc:v1:SYNTHETIC')).rejects.toThrow(/stage the line is at/);
    await expect(insert('actionable', 'validated', 'enc:v1:SYNTHETIC')).rejects.toThrow(/not a reopen/);
    await expect(insert('flagged', 'validated', null)).rejects.toMatchObject({ code: '23514' });
    await expect(insert('flagged', 'validated', 'enc:v1:SYNTHETIC', null)).rejects.toThrow(/person/);
    // Forward with no reason; a reopen back with one; then forward again.
    await insert('actionable', null, null);
    await insert('validated', 'actionable', 'enc:v1:SYNTHETIC');
    await insert('actionable', null, null);
    const events = await rows<{ stage: string; reopened_from: string | null }>(practice, 'SELECT stage, reopened_from FROM line_status WHERE service_line_id = $1 ORDER BY seq', [lineId]);
    expect(events).toEqual([
      { stage: 'validated', reopened_from: null },
      { stage: 'actionable', reopened_from: null },
      { stage: 'validated', reopened_from: 'actionable' },
      { stage: 'actionable', reopened_from: null },
    ]);
    await expect(withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) => scope.client.query("UPDATE line_status SET stage = 'flagged'"))).rejects.toMatchObject({
      code: '42501',
    });
    await expect(w.owner.query('TRUNCATE line_status')).rejects.toThrow(/cannot be truncated/);
  });
});
