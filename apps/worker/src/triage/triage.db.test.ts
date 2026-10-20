import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createOrganization, createUser } from '@tp/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { judgeLine } from '@tp/triage';
import { parseCents } from '@tp/money';

import { monitorHandler } from '../monitor/job';
import { acceptRun, createRerun } from '../price/rerun';
import { type Practice, RELEASE, RERUN_RELEASE } from '../price/test-support/pricing-world';
import { RATE_RECORD_FIELDS, amendVersion, approveRateRecordField, approveVersion, correctMapping, signOffVersion, supersedeVersion, verifyDisputeWindow } from '@tp/contracts';
import { type TriageOutcome, candidateLines, candidateRows, todayUtc } from './execute';
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
    // Payer approved and recovered come from the recovery ledger's entries only (docs/adr/0042).
    await expect(insert('payer_approved', null, null)).rejects.toThrow(/the ledger holds no entries that put the line at payer_approved/);
    await expect(insert('recovered', null, null)).rejects.toThrow(/the ledger holds no entries that put the line at recovered/);
    // In another's name, or in no one's (as triage, a job, sets it): refused for a person by the policy.
    await expect(insert('actionable', null, null, randomUUID())).rejects.toThrow(/row-level security/);
    const other = await createUser(w.owner);
    await addMembership(w.owner, practice.world.organizationId, other, 'billing_manager');
    await expect(insert('actionable', null, null, other)).rejects.toThrow(/row-level security/);
    await expect(insert('actionable', null, null, null)).rejects.toThrow(/row-level security/);
    // The owner, whom no policy narrows, meets the rule itself.
    await expect(
      asOwner(w.owner, [practice.practiceId], () => w.owner.query('INSERT INTO line_status (practice_id, service_line_id, stage, set_by) VALUES ($1, $2, $3, $4)', [practice.practiceId, lineId, 'actionable', other]), practice.manager),
    ).rejects.toThrow(/own name/);
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

describe('every line is judged from its pricing in effect (PRD 5, J6 and J17; docs/adr/0037)', () => {
  it('keeps a held line whose accepted re-run finds no shortfall out of a later case, and never names the replaced run’s priced line', async () => {
    const practice = await w.practice('in effect', { case_materiality_cents: '4000' });
    await w.load(practice, 'CAS-04/remit.835');
    const first = await w.fixedContract(practice, { ...FIXED, schedule: [{ code: '97110', amountCents: '5000' }] });
    const sixteenth = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: first.versionId }], from: '2026-05-16', to: '2026-05-16' });
    expect(summary(await w.triage(practice, sixteenth))).toMatchObject({ validatedLines: 1, casesOpened: 0, heldPatterns: 1 });
    const seventeenth = await w.pricing.createRun(practice, '2026-05-17', '2026-05-17');
    await w.pricing.execute(practice, seventeenth);
    // The mapping was wrong: corrected to a contract that pays what the payer paid, and the first run re-run and accepted.
    const right = await w.fixedContract(practice, { ...FIXED, schedule: [{ code: '97110', amountCents: '3000' }] });
    const planId = await w.pricing.planOf(practice, 'CE:SYNPLAN-FIX-ONE');
    const old = await w.pricing.one<{ id: string }>('SELECT id FROM payer_plan_mapping WHERE plan_id = $1', [planId]);
    await w.as(practice, practice.manager, (context) => correctMapping(context, { practiceId: practice.practiceId, planId, kind: 'contract', contractVersionId: right.versionId, effectiveFrom: '2026-01-01', supersedesId: old.id }));
    const manager = <T>(run: (scope: Parameters<Parameters<typeof withPracticeScope>[2]>[0]) => Promise<T>) => withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, run);
    const rerun = await manager((scope) => createRerun(scope, { practiceId: practice.practiceId, pricingRunId: sixteenth, releaseNo: RELEASE, requestId: `test-${randomUUID()}` }));
    await w.pricing.execute(practice, rerun.pricingRunId);
    await manager((scope) => acceptRun(scope, { practiceId: practice.practiceId, pricingRunId: rerun.pricingRunId }));
    expect(await rows(practice, 'SELECT variance_cents::text FROM priced_line WHERE pricing_run_id = $1', [rerun.pricingRunId])).toEqual([{ variance_cents: '0' }]);
    expect(summary(await w.triage(practice, rerun.pricingRunId))).toMatchObject({ validatedLines: 0, casesOpened: 0, linesAdded: 0 });
    // The 17th's line was priced under the mapping since corrected and not priced again: validated, it waits with
    // MAPPING_NOT_IN_FORCE (audit item #4) rather than being held as a pattern, and the 16th's old pricing is not added to anything.
    expect(summary(await w.triage(practice, seventeenth))).toMatchObject({ validatedLines: 1, casesOpened: 0, linesAdded: 0, heldPatterns: 0 });
    const seventeenthLines = await withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, async (scope) =>
      candidateLines(scope.client, await candidateRows(scope, practice.practiceId, seventeenth, `test-${randomUUID()}`)),
    );
    expect(seventeenthLines.map((line) => judgeLine(line, parseCents('500'), todayUtc()).reasons)).toEqual([['MAPPING_NOT_IN_FORCE']]);
    expect(await cases(practice)).toEqual([]);
    // The replaced run is never triaged again.
    expect((await w.triage(practice, sixteenth)).outcome).toBe('not_in_effect');
  });
});

describe('anomaly cohorts are the quarter’s, across the month runs (PRD 12, Anomaly screening)', () => {
  it('screens April’s lines with May’s: two months of 29 lines each make a cohort neither makes alone', async () => {
    const practice = await w.practice('quarter cohort', { anomaly_threshold_cents: '1000' });
    await w.load(practice, 'CAS-01/remit.835');
    const april = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-OON-CAS', versionId: null, kind: 'no_agreement' }], from: '2026-04-01', to: '2026-04-30' });
    expect(summary(await w.triage(practice, april))).toMatchObject({ anomalies: 0, flaggedLines: 0 });
    // The same file for May: its own payment, claims and interchange.
    await w.pricing.loadVariant(practice, 'CAS-01/remit.835', [
      ['DTM*472*202604', 'DTM*472*202605'],
      ['SYNEFTCAS01001', 'SYNEFTCAS01MAY'],
      ['SYNCCNCAS01', 'SYNCCNCAS0M'],
      ['SYNPCNCAS01', 'SYNPCNCAS0M'],
      ['050010001', '050010002'],
    ]);
    const may = await w.pricedRun(practice, { plans: [], from: '2026-05-01', to: '2026-05-31' });
    expect(summary(await w.triage(practice, may))).toMatchObject({ anomalies: 1, flaggedLines: 8 });
    const [anomaly, ...others] = await rows<{ pricing_run_id: string; cohort_size: number; cohort_key: Record<string, unknown>; line_ids: string[] }>(practice, 'SELECT pricing_run_id, cohort_size, cohort_key, line_ids FROM anomaly');
    expect(others).toEqual([]);
    expect(anomaly).toMatchObject({ pricing_run_id: may, cohort_size: 58, cohort_key: { quarter: '2026-Q2', procedure_code: '97110' } });
    expect(anomaly?.line_ids).toHaveLength(8);
    expect(await stages(practice)).toEqual([{ stage: 'flagged', lines: '8' }]);
  });
});

describe('per-visit lines are judged with their visit (PRD 11 step 2; QUESTIONS Q44; PRC-07)', () => {
  // PRC-07: one visit of three lines on 2026-05-31, paid 45.88, 59.04 and 60.04 (164.96 in all).
  const visit = async (label: string, amountCents: string) => {
    const practice = await w.practice(label, { case_materiality_cents: '1' });
    await w.load(practice, 'PRC-07/remit.835');
    const contract = await w.perVisitContract(practice, { codes: ['97110', '97140', '97530'], amountCents, effectiveFrom: '2026-01-01', disputeWindowDays: 3650 });
    const runId = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-COMM-VISIT', versionId: contract.versionId }], from: '2026-05-01', to: '2026-05-31' });
    const lines = await rows<{ id: string; variance_cents: string; visit: string | null; shortfall: string | null; flags: { flag: string }[] }>(
      practice,
      `SELECT p.id, p.variance_cents::text, priced_line_visit_variance_cents(p.id)::text AS visit, priced_line_shortfall_cents(p.id)::text AS shortfall, coalesce(p.trace #> '{outcome,review_flags}', '[]') AS flags
         FROM priced_line p JOIN service_line l ON l.id = p.service_line_id WHERE p.pricing_run_id = $1 ORDER BY l.line_no`,
      [runId],
    );
    // The database's shortfall is @tp/triage's judgement of the same line.
    for (const line of lines) {
      const judged = judgeLine(
        { varianceCents: parseCents(line.variance_cents), visitVarianceCents: line.visit === null ? null : parseCents(line.visit), reviewFlags: line.flags.map((flag) => flag.flag), windowEndsOn: '2036-01-01', deadlineStatus: 'verified', windowRuleComputed: true, claimReversed: false, claimSuperseded: false, mappingKind: 'contract', mappingInForce: true, contractVersionStatus: 'signed_off', contractVersionCoversService: true, releaseWithdrawn: false, writtenOff: false },
        parseCents('500'),
        '2026-06-01',
      );
      expect(judged.validatedCents === null ? null : judged.validatedCents.toString()).toBe(line.shortfall);
    }
    return { practice, runId, lines };
  };

  it('validates nothing of a visit the payer paid in full across its lines, however short the carrying line looks', async () => {
    const { practice, runId, lines } = await visit('PRC-07 paid in full', '15000');
    expect(lines.map((line) => [line.variance_cents, line.visit, line.shortfall])).toEqual([
      ['10412', '-1496', null],
      ['-5904', '-1496', null],
      ['-6004', '-1496', null],
    ]);
    expect(summary(await w.triage(practice, runId))).toMatchObject({ validatedLines: 0, casesOpened: 0 });
    expect(await stages(practice)).toEqual([]);
  });

  it('validates the visit’s net shortfall on the carrying line and holds it for review, out of every case', async () => {
    const { practice, runId, lines } = await visit('PRC-07 short', '20000');
    expect(lines.map((line) => [line.variance_cents, line.visit, line.shortfall])).toEqual([
      ['15412', '3504', '3504'],
      ['-5904', '3504', null],
      ['-6004', '3504', null],
    ]);
    expect(summary(await w.triage(practice, runId))).toMatchObject({ validatedLines: 1, casesOpened: 0, heldPatterns: 0 });
    expect(await stages(practice)).toEqual([{ stage: 'validated', lines: '1' }]);
    expect(await cases(practice)).toEqual([]);
  });
});

describe('the closing of windows follows the calendar (PRD 12, Deadlines)', () => {
  it('writes off, on the daily monitor, the lines of an open case whose windows closed since its triage', async () => {
    const practice = await w.practice('daily windows');
    await w.load(practice, 'CAS-03/remit.835');
    const two = await w.fixedContract(practice, { schedule: [{ code: '97530', amountCents: '5200' }], effectiveFrom: '2026-01-01', disputeWindowDays: 30 });
    const runId = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-TWO', versionId: two.versionId }, { key: 'CE:SYNPLAN-FIX-ONE', versionId: null, kind: 'no_agreement' }], from: '2026-03-01', to: '2026-03-31' });
    // Triaged while the windows were open; nobody triages again.
    expect(summary(await w.triage(practice, runId, '2026-04-10'))).toMatchObject({ casesOpened: 1, linesAdded: 8 });
    expect((await cases(practice)).map((item) => [item.state, item.open_lines, item.actionable_cents])).toEqual([['open', '8', '27200']]);
    // The daily schedule's monitor job of the practice.
    const logs: Record<string, unknown>[] = [];
    await monitorHandler()({ practice_id: practice.practiceId, day: todayUtc() }, w.pricing.jobContext(practice.practiceId, logs));
    expect((await cases(practice)).map((item) => [item.state, item.open_lines, item.actionable_cents, item.deadline_on])).toEqual([['closed_written_off', '0', '0', null]]);
    expect(logs.map((line) => line.msg)).toContain('monitoring wrote off case lines whose windows closed');
    // Again the same day: nothing more.
    const again: Record<string, unknown>[] = [];
    await monitorHandler()({ practice_id: practice.practiceId, day: todayUtc() }, w.pricing.jobContext(practice.practiceId, again));
    expect(again.map((line) => line.msg)).not.toContain('monitoring wrote off case lines whose windows closed');
  });
});

describe('who writes stages, runs and report requests, in SQL as in the routes (PRD 3; docs/adr/0040)', () => {
  it('refuses the reviewer and the viewer every one of them, and lets a person who works cases and maps plans', async () => {
    const practice = await w.practice('writers');
    await w.load(practice, 'CAS-05/remit.835');
    const contract = await w.fixedContract(practice, FIXED);
    const runId = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: contract.versionId }], from: '2026-03-01', to: '2026-03-31' });
    summary(await w.triage(practice, runId));
    const [line] = await rows<{ service_line_id: string }>(practice, 'SELECT service_line_id FROM priced_line LIMIT 1');
    const viewer = await createUser(w.owner);
    await addMembership(w.owner, practice.world.organizationId, viewer, 'viewer');
    const internal = await createOrganization(w.owner, 'internal', 'writers');
    const reviewer = await createUser(w.owner, { hardwareKeyRequired: true });
    await addMembership(w.owner, internal, reviewer, 'reviewer');
    await asOwner(w.owner, [practice.practiceId], () =>
      w.owner.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'REV-1', 'SYNTHETIC REVIEW', now() + interval '4 hours')`, [practice.practiceId, reviewer]),
    );
    const as = (actorId: string, sql: string, values: unknown[]) => withPracticeScope(w.app, { actorId, practiceIds: [practice.practiceId] }, (scope) => scope.client.query(sql, values));
    const stage = (actorId: string, stageName: string, reopenedFrom: string | null = null) =>
      as(actorId, 'INSERT INTO line_status (practice_id, service_line_id, stage, set_by, reopened_from, reason) VALUES ($1, $2, $3, $4, $5, $6)', [
        practice.practiceId,
        line?.service_line_id,
        stageName,
        actorId,
        reopenedFrom,
        reopenedFrom === null ? null : 'enc:v1:SYNTHETIC',
      ]);
    const run = (actorId: string) =>
      as(actorId, "INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by) VALUES ($1, '2026-03-01', '2026-03-31', $2, 'phase-two/1', $3)", [practice.practiceId, RELEASE, actorId]);
    const report = (actorId: string) => as(actorId, 'INSERT INTO audit_report (practice_id, pricing_run_id, requested_by) VALUES ($1, $2, $3)', [practice.practiceId, runId, actorId]);
    for (const outsider of [reviewer, viewer]) {
      await expect(stage(outsider, 'actionable')).rejects.toThrow(/row-level security/);
      await expect(stage(outsider, 'validated', 'validated')).rejects.toThrow(/row-level security/);
      await expect(run(outsider)).rejects.toThrow(/row-level security/);
      await expect(report(outsider)).rejects.toThrow(/row-level security/);
    }
    await expect(report(practice.manager)).resolves.toMatchObject({ rowCount: 1 });
    await expect(stage(practice.manager, 'validated', 'validated')).resolves.toMatchObject({ rowCount: 1 });
  });
});

describe('an NCCI procedure-to-procedure flag holds a line for review (PRD 2 point 6; QUESTIONS Q41; PRC-11)', () => {
  it('validates the flagged line from its trace and keeps it out of every case', async () => {
    const practice = await w.practice('PRC-11 flagged', { case_materiality_cents: '1' });
    await w.load(practice, 'PRC-11/remit.835');
    // A contract that writes the NCCI edits in, paying more than the payer paid for both codes.
    const contract = await w.fixedContract(practice, { ...FIXED, schedule: [{ code: '97140', amountCents: '8000' }, { code: '97530', amountCents: '8000' }], flags: { apply_ncci: true } });
    const runId = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-MA-NC', versionId: contract.versionId }], from: '2026-02-01', to: '2026-02-28' });
    const lines = await rows<{ procedure_code: string; variance_cents: string; flags: { flag: string; column1_line_no: number }[] }>(
      practice,
      `SELECT l.procedure_code, p.variance_cents::text, coalesce(p.trace #> '{outcome,review_flags}', '[]') AS flags FROM priced_line p JOIN service_line l ON l.id = p.service_line_id WHERE p.pricing_run_id = $1 ORDER BY l.line_no`,
      [runId],
    );
    expect(lines).toEqual([
      { procedure_code: '97140', variance_cents: '1084', flags: [] },
      { procedure_code: '97530', variance_cents: '3212', flags: [{ flag: 'NCCI_PTP', column1_line_no: 1 }] },
    ]);
    // Both validated; the unflagged line opens its case, the flagged one waits for a person's review.
    expect(summary(await w.triage(practice, runId))).toMatchObject({ validatedLines: 2, casesOpened: 1, linesAdded: 1 });
    const inCases = await rows<{ procedure_code: string }>(practice, 'SELECT l.procedure_code FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id');
    expect(inCases).toEqual([{ procedure_code: '97140' }]);
    expect(await stages(practice)).toEqual([
      { stage: 'actionable', lines: '1' },
      { stage: 'validated', lines: '1' },
    ]);
  });
});

/** The triage reasons that say a line's pricing is no longer current, as @tp/triage names them (audit item #4). */
const PRICING_REASONS = ['MAPPING_NOT_IN_FORCE', 'VERSION_NOT_SIGNED_OFF', 'VERSION_NOT_IN_FORCE', 'RELEASE_WITHDRAWN'] as const;

/** A contract version's successor (a correction, or an amendment from `amendFrom`), verified by the specialist and signed off: the prior version is superseded, or closed at `amendFrom`. */
async function signedSuccessor(target: Practice, versionId: string, amendFrom: string | null): Promise<string> {
  const successor = await w.as(target, w.pricing.specialist, async (context) => {
    const created =
      amendFrom === null ? await supersedeVersion(context, { practiceId: target.practiceId, versionId }) : await amendVersion(context, { practiceId: target.practiceId, versionId, effectiveFrom: amendFrom });
    const { rows: records } = await context.scope.client.query<{ id: string }>('SELECT id FROM rate_record WHERE contract_version_id = $1', [created.versionId]);
    for (const record of records) {
      for (const field of RATE_RECORD_FIELDS) {
        await approveRateRecordField(context, { practiceId: target.practiceId, rateRecordId: record.id, field });
      }
    }
    await verifyDisputeWindow(context, { practiceId: target.practiceId, versionId: created.versionId });
    await approveVersion(context, { practiceId: target.practiceId, versionId: created.versionId });
    return created.versionId;
  });
  await w.as(target, target.manager, (context) => signOffVersion(context, { practiceId: target.practiceId, versionId: successor }));
  return successor;
}

/**
 * Every candidate line of the run as triage judges it (its pricing reasons, in @tp/triage's order) beside the
 * database's priced_line_pricing_check() of the same priced line, in the billing manager's scope.
 */
async function judgedBeside(target: Practice, runId: string): Promise<readonly { readonly mapping: string | null; readonly reasons: readonly string[]; readonly check: string | undefined }[]> {
  return withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, async (scope) => {
    const lines = await candidateLines(scope.client, await candidateRows(scope, target.practiceId, runId, `test-${randomUUID()}`));
    const { rows: checks } = await scope.client.query<{ id: string; check: string }>('SELECT t.id::text, priced_line_pricing_check(t.id) AS check FROM unnest($1::uuid[]) AS t (id)', [
      lines.map((line) => line.pricedLineId),
    ]);
    const byLine = new Map(checks.map((row) => [row.id, row.check]));
    return lines.map((line) => ({
      mapping: line.mappingKind,
      reasons: judgeLine(line, parseCents('1'), todayUtc()).reasons.filter((reason) => (PRICING_REASONS as readonly string[]).includes(reason)),
      check: byLine.get(line.pricedLineId),
    }));
  });
}

/** For lines on their pricing in effect, the database's verdict is 'current' exactly when triage names none of the pricing reasons, and each cause is its reason. */
function expectAgreement(judged: Awaited<ReturnType<typeof judgedBeside>>): void {
  expect(judged.length).toBeGreaterThan(0);
  for (const line of judged) {
    expect(line.check === 'current', JSON.stringify(line)).toBe(line.reasons.length === 0);
  }
  const CAUSE_OF: Readonly<Record<string, string>> = {
    RELEASE_WITHDRAWN: 'RELEASE_WITHDRAWN',
    MAPPING_NOT_IN_FORCE: 'MAPPING_NOT_IN_FORCE',
    VERSION_NOT_SIGNED_OFF: 'CONTRACT_VERSION_NOT_SIGNED_OFF',
    VERSION_NOT_IN_FORCE: 'CONTRACT_VERSION_NOT_IN_FORCE',
  };
  // The database names the first cause in its own order: a withdrawal, then the mapping, then the version, sign-off before cover.
  const ORDER = ['RELEASE_WITHDRAWN', 'MAPPING_NOT_IN_FORCE', 'VERSION_NOT_SIGNED_OFF', 'VERSION_NOT_IN_FORCE'];
  for (const line of judged.filter((item) => item.reasons.length > 0)) {
    const first = ORDER.find((reason) => line.reasons.includes(reason)) as string;
    expect(line.check, JSON.stringify(line)).toBe(CAUSE_OF[first]);
  }
}

describe('whether a line’s pricing is still current, in triage and in the database (audit item #4; docs/adr/0061)', () => {
  it('agrees line by line through a correction that superseded the version and a back-dated amendment that closed it, and for Medicare Advantage lines', async () => {
    // A correction: the March lines' version superseded since the run.
    const corrected = await w.practice('pricing current: correction');
    await w.load(corrected, 'CAS-03/remit.835');
    const one = await w.fixedContract(corrected, FIXED);
    const two = await w.fixedContract(corrected, { ...FIXED, schedule: [{ code: '97530', amountCents: '5200' }] });
    const run = await w.pricedRun(corrected, {
      plans: [
        { key: 'CE:SYNPLAN-FIX-ONE', versionId: one.versionId },
        { key: 'CE:SYNPLAN-FIX-TWO', versionId: two.versionId },
      ],
      from: '2026-03-01',
      to: '2026-03-31',
    });
    const before = await judgedBeside(corrected, run);
    expectAgreement(before);
    expect(before.every((line) => line.check === 'current')).toBe(true);
    await signedSuccessor(corrected, one.versionId, null);
    const afterCorrection = await judgedBeside(corrected, run);
    expectAgreement(afterCorrection);
    expect(new Set(afterCorrection.map((line) => line.check))).toEqual(new Set(['current', 'CONTRACT_VERSION_NOT_SIGNED_OFF']));

    // A back-dated amendment: the second version is still signed off, but closed at February 1, before its March lines.
    await signedSuccessor(corrected, two.versionId, '2026-02-01');
    const afterAmendment = await judgedBeside(corrected, run);
    expectAgreement(afterAmendment);
    expect(new Set(afterAmendment.map((line) => line.check))).toEqual(new Set(['CONTRACT_VERSION_NOT_SIGNED_OFF', 'CONTRACT_VERSION_NOT_IN_FORCE']));
    expect(afterAmendment.filter((line) => line.check === 'CONTRACT_VERSION_NOT_IN_FORCE').every((line) => line.reasons.join() === 'VERSION_NOT_IN_FORCE')).toBe(true);
    // Triaged now, neither pattern opens a case: every line waits with its reason.
    expect(summary(await w.triage(corrected, run))).toMatchObject({ validatedLines: 16, casesOpened: 0, linesAdded: 0 });
    expect(await cases(corrected)).toEqual([]);

    // A Medicare Advantage non-contracted line names no contract version: only a withdrawal could make it stale. (The
    // SYNTHETIC locality's MA lines are all paid at or above the fee schedule, so none is a candidate: the same facts
    // triage would read are judged here from the priced lines themselves.)
    const ma = await w.practice('pricing current: Medicare Advantage');
    await w.load(ma, 'PRC-19/remit.835');
    await w.pricing.mapped(ma, await w.pricing.planOf(ma, 'CE:SYNPLAN-MA-NC'), 'ma_noncontracted', '2026-01-01');
    const maRun = await w.pricing.createRun(ma, '2026-02-01', '2026-02-28');
    await w.pricing.execute(ma, maRun);
    const maLines = await rows<{ mapping_kind: string; contract_version_id: string | null; check: string }>(
      ma,
      `SELECT m.mapping_kind, p.contract_version_id, priced_line_pricing_check(p.id) AS check
         FROM priced_line p JOIN payer_plan_mapping m ON m.id = p.mapping_id WHERE p.pricing_run_id = $1`,
      [maRun],
    );
    expect(maLines.length).toBeGreaterThan(0);
    for (const line of maLines) {
      expect(line).toEqual({ mapping_kind: 'ma_noncontracted', contract_version_id: null, check: 'current' });
      const judged = judgeLine(
        {
          varianceCents: parseCents('1000'),
          visitVarianceCents: null,
          reviewFlags: [],
          windowEndsOn: '2036-01-01',
          deadlineStatus: 'verified',
          windowRuleComputed: true,
          claimReversed: false,
          claimSuperseded: false,
          mappingKind: line.mapping_kind,
          mappingInForce: true,
          contractVersionStatus: null,
          contractVersionCoversService: true,
          releaseWithdrawn: false,
          writtenOff: false,
        },
        parseCents('1'),
        todayUtc(),
      );
      expect(judged.reasons).toEqual([]);
    }
  }, 180_000);

  it('agrees line by line through a correction of the plan’s mapping (MAP-03): to another contract, to Medicare Advantage non-contracted, and from a later date only', async () => {
    const practice = await w.practice('pricing current: mapping correction');
    await w.load(practice, 'CAS-03/remit.835');
    const one = await w.fixedContract(practice, FIXED);
    const two = await w.fixedContract(practice, { ...FIXED, schedule: [{ code: '97530', amountCents: '5200' }] });
    const run = await w.pricedRun(practice, {
      plans: [
        { key: 'CE:SYNPLAN-FIX-ONE', versionId: one.versionId },
        { key: 'CE:SYNPLAN-FIX-TWO', versionId: two.versionId },
      ],
      from: '2026-03-01',
      to: '2026-03-31',
    });
    expectAgreement(await judgedBeside(practice, run));
    const planOne = await w.pricing.planOf(practice, 'CE:SYNPLAN-FIX-ONE');
    const planTwo = await w.pricing.planOf(practice, 'CE:SYNPLAN-FIX-TWO');
    const mappingOne = await w.pricing.one<{ id: string }>('SELECT id FROM payer_plan_mapping WHERE plan_id = $1', [planOne]);
    const mappingTwo = await w.pricing.one<{ id: string }>('SELECT id FROM payer_plan_mapping WHERE plan_id = $1', [planTwo]);
    // A correction from April onwards supersedes the second plan's mapping, but not on its March lines: they stay current.
    await w.as(practice, practice.manager, (context) =>
      correctMapping(context, { practiceId: practice.practiceId, planId: planTwo, kind: 'ma_noncontracted', effectiveFrom: '2026-04-01', supersedesId: mappingTwo.id }),
    );
    const afterLater = await judgedBeside(practice, run);
    expectAgreement(afterLater);
    expect(afterLater.every((line) => line.check === 'current')).toBe(true);
    // The first plan corrected from January to another contract: its lines' mapping is no longer in force on their dates, though
    // their contract version is still signed off and covers them.
    const other = await w.fixedContract(practice, { ...FIXED, schedule: [{ code: '97110', amountCents: '2800' }] });
    await w.as(practice, practice.manager, (context) =>
      correctMapping(context, { practiceId: practice.practiceId, planId: planOne, kind: 'contract', contractVersionId: other.versionId, effectiveFrom: '2026-01-01', supersedesId: mappingOne.id }),
    );
    const afterCorrection = await judgedBeside(practice, run);
    expectAgreement(afterCorrection);
    expect(new Set(afterCorrection.map((line) => line.check))).toEqual(new Set(['current', 'MAPPING_NOT_IN_FORCE']));
    expect(afterCorrection.filter((line) => line.check === 'MAPPING_NOT_IN_FORCE').every((line) => line.reasons.join() === 'MAPPING_NOT_IN_FORCE')).toBe(true);
    // The second plan corrected again from January, to Medicare Advantage non-contracted, through the April correction it supersedes.
    const april = await w.pricing.one<{ id: string }>('SELECT id FROM payer_plan_mapping WHERE plan_id = $1 AND supersedes_id IS NOT NULL', [planTwo]);
    await w.as(practice, practice.manager, (context) =>
      correctMapping(context, { practiceId: practice.practiceId, planId: planTwo, kind: 'ma_noncontracted', effectiveFrom: '2026-01-01', supersedesId: april.id }),
    );
    const afterChain = await judgedBeside(practice, run);
    expectAgreement(afterChain);
    expect(afterChain.map((line) => line.check)).toEqual(afterChain.map(() => 'MAPPING_NOT_IN_FORCE'));
    // Triaged now, neither pattern opens a case: every line waits with its reason.
    expect(summary(await w.triage(practice, run))).toMatchObject({ validatedLines: 16, casesOpened: 0, linesAdded: 0 });
    expect(await cases(practice)).toEqual([]);
  }, 180_000);

  // Last: the release in force is global, and a withdrawal is permanent.
  it('drops every line of a run whose rule release was withdrawn since out of the cases (RELEASE_WITHDRAWN), on both sides', async () => {
    await w.pricing.loadRerunRelease();
    const practice = await w.practice('pricing current: withdrawn');
    await w.load(practice, 'CAS-03/remit.835');
    const one = await w.fixedContract(practice, FIXED);
    const two = await w.fixedContract(practice, { ...FIXED, schedule: [{ code: '97530', amountCents: '5200' }] });
    for (const [key, versionId] of [
      ['CE:SYNPLAN-FIX-ONE', one.versionId],
      ['CE:SYNPLAN-FIX-TWO', two.versionId],
    ] as const) {
      await w.pricing.mapped(practice, await w.pricing.planOf(practice, key), 'contract', '2026-01-01', versionId);
    }
    const run = await w.pricing.createRun(practice, '2026-03-01', '2026-03-31', RERUN_RELEASE);
    await w.pricing.execute(practice, run);
    expectAgreement(await judgedBeside(practice, run));

    await w.pricing.withdraw(RERUN_RELEASE, 'SYNTHETIC: release 2 content was wrong');
    const withdrawn = await judgedBeside(practice, run);
    expectAgreement(withdrawn);
    expect(withdrawn.map((line) => [line.check, line.reasons.join()])).toEqual(withdrawn.map(() => ['RELEASE_WITHDRAWN', 'RELEASE_WITHDRAWN']));
    // The run is still the run in effect, so triage runs: every line validated, none actionable, no case.
    expect(summary(await w.triage(practice, run))).toMatchObject({ validatedLines: 16, casesOpened: 0, linesAdded: 0 });
    expect(await cases(practice)).toEqual([]);
    expect(await stages(practice)).toEqual([{ stage: 'validated', lines: '16' }]);
  }, 180_000);
});
