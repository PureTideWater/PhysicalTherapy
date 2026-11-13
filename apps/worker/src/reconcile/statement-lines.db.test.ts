import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withJobScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { acceptRun, createRerun } from '../price/rerun';
import { type Practice, RELEASE } from '../price/test-support/pricing-world';
import { ACTIONABLE_NOW } from '../triage/actionable-now';
import { CAS_AS_OF, CAS_RUNS, type CasRun } from '../triage/test-support/cas-runs';
import { TriageWorld } from '../triage/test-support/triage-world';
import type { Scope } from './ledger';
import { NO_BILLING, NO_TIME_LOG, OPEN_CASES_ACTIONABLE, generateRoiStatement } from './statements';
import { attemptErrorCode } from '../worker';
import { STATEMENT_COLUMNS, storedStatement } from './print';
import { generateFourKeyStatement } from './test-support/four-key-writer';
import { LedgerWorld } from './test-support/ledger-world';
import { type OpenCasePathRow, PLAIN_PATH_OPEN_CASES } from './test-support/plain-path-writer';
import { FOUR_KEYS, PREVIOUS_STATEMENT_COLUMNS, printWatched, recoupedLedSix, statementTwins } from './test-support/statement-twins';

/**
 * An ROI statement lists the priced lines its actionable figure counted (schema PR 5; docs/adr/0082 Decision 7; test
 * matrix LED-26 to LED-28; the design note's T5 to T8, T11 and T15). The writer reads the figure and the list from the
 * same rows in one statement and one pass, and the database's roi_statement_rules() refuses a statement whose figure is
 * not the variance of the lines it lists, each once and each a line of a case it lists. SYNTHETIC fixtures only.
 */

let w: TriageWorld;
let led: LedgerWorld;

beforeAll(async () => {
  w = await TriageWorld.open(readDatabaseUrl());
  led = await LedgerWorld.open(readDatabaseUrl());
}, 120_000);

afterAll(async () => {
  await led.close();
  await w.close();
});

const FIXED = {
  schedule: [{ code: '97110', amountCents: '5000' }],
  effectiveFrom: '2026-01-01',
  disputeWindowDays: 3650,
} as const;
const SOURCES = { fees: NO_BILLING, pursuitHours: NO_TIME_LOG };
const LINES_RULE = 'an ROI statement’s actionable figure is the variance of the priced lines it links, each once and each a line of a case it links'.replace('’', "'");

class RolledBack extends Error {}

interface Pools {
  readonly app: TriageWorld['app'];
}

/** Runs `work` in the practice's job scope and rolls it back. */
async function rolledBack<T>(pools: Pools, practiceId: string, work: (scope: Scope) => Promise<T>): Promise<T> {
  let result: { readonly value: T } | undefined;
  try {
    await withJobScope(pools.app, { jobId: randomUUID(), practiceId }, async (scope) => {
      result = { value: await work(scope) };
      throw new RolledBack();
    });
  } catch (error) {
    if (!(error instanceof RolledBack)) {
      throw error;
    }
  }
  return (result as { readonly value: T }).value;
}

const inJob = <T>(practice: Practice, run: (scope: Scope) => Promise<T>) => withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, run);
const owner = <T extends object>(practice: Practice, sql: string, values: unknown[] = []) => asOwner(w.owner, [practice.practiceId], async () => (await w.owner.query<T>(sql, values)).rows);

interface StoredRow {
  readonly id: string;
  readonly actionable_open_cents: string;
  readonly links: Record<string, string[]>;
  /** The whole row but its ID and its three timestamps. */
  readonly rest: Record<string, unknown>;
}

const STORED = `SELECT s.id, s.actionable_open_cents::text, s.links, to_jsonb(s) - 'id' - 'generated_at' - 'created_at' - 'updated_at' AS rest FROM roi_statement s WHERE s.id = $1`;

async function storedRow(scope: Scope, statementId: string | undefined): Promise<StoredRow> {
  const row = (await scope.client.query<StoredRow>(STORED, [statementId])).rows[0];
  if (row === undefined) {
    throw new Error('the statement was not written');
  }
  return row;
}

const QUARTER = { periodFrom: '2026-07-01', periodTo: '2026-09-30' } as const;

/** Today's writer and the writer before the list, each on the same state and rolled back. */
async function bothWriters(pools: Pools, practice: Practice): Promise<{ readonly now: StoredRow; readonly before: StoredRow }> {
  const now = await rolledBack(pools, practice.practiceId, async (scope) =>
    storedRow(
      scope,
      (
        await generateRoiStatement(
          scope,
          {
            practiceId: practice.practiceId,
            ...QUARTER,
            requestId: `test-${randomUUID()}`,
          },
          SOURCES,
        )
      )?.statementId,
    ),
  );
  const before = await rolledBack(pools, practice.practiceId, async (scope) => storedRow(scope, (await generateFourKeyStatement(scope, { practiceId: practice.practiceId, ...QUARTER }, SOURCES))?.statementId));
  return { now, before };
}

/**
 * The note's 4.1: the writer's one-pass query and the plain path's (the figure ACTIONABLE_NOW gives and the list as a
 * second subquery), in one transaction as the job, answer the same rows: each open case in the same order, its figure
 * to the cent and its lines ID for ID.
 */
async function expectBothPathsEqual(pools: Pools, practice: Practice): Promise<readonly OpenCasePathRow[]> {
  expect(OPEN_CASES_ACTIONABLE).not.toBe(PLAIN_PATH_OPEN_CASES);
  expect(OPEN_CASES_ACTIONABLE.match(/priced_line_pricing_check\(/g)).toHaveLength(1);
  expect(PLAIN_PATH_OPEN_CASES.match(/priced_line_pricing_check\(/g)).toHaveLength(2);
  const { onePass, plain } = await rolledBack(pools, practice.practiceId, async (scope) => ({
    onePass: (await scope.client.query<OpenCasePathRow>(OPEN_CASES_ACTIONABLE, [practice.practiceId])).rows,
    plain: (await scope.client.query<OpenCasePathRow>(PLAIN_PATH_OPEN_CASES, [practice.practiceId])).rows,
  }));
  expect(onePass).toEqual(plain);
  return onePass;
}

/** T11: the two rows are equal but for the fifth key. */
function expectEqualButTheList(rows: { readonly now: StoredRow; readonly before: StoredRow }): void {
  expect(Object.keys(rows.before.links).sort()).toEqual(['actionable_open', 'approved_unposted', 'interest', 'recovered']);
  expect(Object.keys(rows.now.links).sort()).toEqual(['actionable_open', 'actionable_open_lines', 'approved_unposted', 'interest', 'recovered']);
  const { actionable_open_lines: _lines, ...fourKeys } = rows.now.links;
  expect({ ...rows.now.rest, links: fourKeys }).toEqual(rows.before.rest);
}

interface ListedLine {
  readonly id: string;
  readonly case_id: string | null;
  readonly variance_cents: string | null;
}

/** T5: the stored list against the figure, and against today's ACTIONABLE_NOW run as its own query for every case. */
async function expectListIsTheFigure(
  practice: Practice,
  row: StoredRow,
  read: <T extends object>(practice: Practice, sql: string, values: unknown[]) => Promise<T[]> = owner,
): Promise<{
  readonly listed: readonly ListedLine[];
  readonly perCase: ReadonlyMap<string, bigint>;
}> {
  const ids = row.links.actionable_open_lines ?? ['the statement lists no lines'];
  expect(new Set(ids).size).toBe(ids.length);
  const listed = await read<ListedLine>(
    practice,
    `SELECT p.id, (SELECT l.case_id FROM case_line l WHERE l.priced_line_id = p.id AND l.service_line_id = p.service_line_id) AS case_id, p.variance_cents::text
       FROM priced_line p WHERE p.practice_id = $1 AND p.id = ANY($2::uuid[]) ORDER BY p.id`,
    [practice.practiceId, ids],
  );
  expect(listed.map((line) => line.id)).toEqual([...ids].sort());
  const cases = row.links.actionable_open ?? [];
  const perCase = new Map<string, bigint>(cases.map((caseId) => [caseId, 0n]));
  for (const line of listed) {
    expect(cases).toContain(line.case_id);
    perCase.set(line.case_id ?? '', (perCase.get(line.case_id ?? '') ?? 0n) + BigInt(line.variance_cents ?? '0'));
  }
  expect([...perCase.values()].reduce((sum, cents) => sum + cents, 0n).toString()).toBe(row.actionable_open_cents);
  // The list follows the cases' order, each case's lines by ID.
  const order = new Map(cases.map((caseId, index) => [caseId, index]));
  const byId = new Map(listed.map((line) => [line.id, line]));
  const expectedOrder = [...ids].sort((a, b) => (order.get(byId.get(a)?.case_id ?? '') ?? 0) - (order.get(byId.get(b)?.case_id ?? '') ?? 0) || (a < b ? -1 : 1));
  expect(ids).toEqual(expectedOrder);
  for (const caseId of cases) {
    const [alone] = await read<{ cents: string }>(practice, `SELECT ${ACTIONABLE_NOW('c')}::text AS cents FROM "case" c WHERE c.id = $1`, [caseId]);
    expect(perCase.get(caseId)?.toString()).toBe(alone?.cents);
  }
  return { listed, perCase };
}

/** A small seeded generator (mulberry32), so a failing world can be run again. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CaseLineRow {
  readonly id: string;
  readonly service_line_id: string;
  readonly priced_line_id: string;
}

const openCaseLines = (practice: Practice) => owner<CaseLineRow>(practice, 'SELECT id, service_line_id, priced_line_id FROM case_line WHERE practice_id = $1 AND written_off_reason IS NULL ORDER BY id', [practice.practiceId]);

/** A billing manager writes the case line off as a duplicate, in their own name. */
const writeOff = (practice: Practice, caseLineId: string) =>
  w.as(practice, practice.manager, ({ scope }) => scope.client.query("UPDATE case_line SET written_off_reason = 'duplicate', written_off_by = $2 WHERE id = $1", [caseLineId, practice.manager]));

/**
 * Lines of the practice's run that triage left in no case (unpriced, overpaid, below a materiality) join its first
 * open case at actionable, written as the owner: the figure then reads lines whose variance is null, zero or negative.
 */
async function oddLinesJoin(practice: Practice): Promise<number> {
  const [first] = await owner<{ id: string }>(practice, `SELECT id FROM "case" WHERE practice_id = $1 AND state NOT IN ('resolved', 'closed_written_off') ORDER BY opened_at, id LIMIT 1`, [practice.practiceId]);
  const odd = await owner<{
    id: string;
    service_line_id: string;
    stage: string | null;
  }>(
    practice,
    `SELECT p.id, p.service_line_id,
            (SELECT s.stage FROM line_status s WHERE s.service_line_id = p.service_line_id ORDER BY s.seq DESC LIMIT 1) AS stage
       FROM priced_line p
      WHERE p.practice_id = $1 AND priced_line_pricing_check(p.id) = 'current' AND NOT EXISTS (SELECT 1 FROM case_line l WHERE l.service_line_id = p.service_line_id)
      ORDER BY p.id`,
    [practice.practiceId],
  );
  const STAGES = ['flagged', 'validated', 'actionable'];
  // A practice whose lines triage left in no case at all (PRC-15: every line overpaid) keeps none: the database lets
  // no case's total go below zero (case_actionable_cents_check).
  const caseId = first?.id;
  if (caseId === undefined) {
    return 0;
  }
  for (const line of odd) {
    await asOwner(w.owner, [practice.practiceId], async () => {
      for (const stage of STAGES.slice(line.stage === null ? 0 : STAGES.indexOf(line.stage) + 1)) {
        await w.owner.query('INSERT INTO line_status (practice_id, service_line_id, stage, priced_line_id) VALUES ($1, $2, $3, $4)', [practice.practiceId, line.service_line_id, stage, line.id]);
      }
      await w.owner.query('INSERT INTO case_line (practice_id, case_id, service_line_id, priced_line_id) VALUES ($1, $2, $3, $4)', [practice.practiceId, caseId, line.service_line_id, line.id]);
    });
  }
  return odd.length;
}

/** The run priced again and the re-run accepted: every line of the run is off its pricing in effect. */
async function pricedAgain(practice: Practice, runId: string): Promise<string> {
  const { pricingRunId } = await w.as(practice, practice.manager, ({ scope }) =>
    createRerun(scope, {
      practiceId: practice.practiceId,
      pricingRunId: runId,
      releaseNo: RELEASE,
      requestId: `test-${randomUUID()}`,
    }),
  );
  await w.pricing.execute(practice, pricingRunId);
  await w.as(practice, practice.manager, ({ scope }) =>
    acceptRun(scope, {
      practiceId: practice.practiceId,
      pricingRunId,
      replacesId: runId,
      heldByIds: [],
    }),
  );
  return pricingRunId;
}

/** SYNTHETIC CAS-08, as HOM-01 sets it up: three 97110 x 2, each 30.00 short, one case. */
async function threeLines(label: string): Promise<{
  readonly practice: Practice;
  readonly runId: string;
  readonly caseId: string;
  readonly lineIds: readonly string[];
}> {
  const practice = await w.practice(label, { case_materiality_cents: '1000' });
  await w.load(practice, 'CAS-08/remit.835');
  const contract = await w.fixedContract(practice, FIXED);
  await w.pricing.mapped(practice, await w.pricing.planOf(practice, 'CE:SYNPLAN-FIX-ONE'), 'contract', '2026-01-01', contract.versionId);
  const runId = await w.pricing.createRun(practice, '2026-03-01', '2026-03-31', RELEASE);
  await w.pricing.execute(practice, runId);
  await w.triage(practice, runId);
  const lines = await owner<{ case_id: string; priced_line_id: string }>(practice, 'SELECT case_id, priced_line_id FROM case_line WHERE practice_id = $1 ORDER BY priced_line_id', [practice.practiceId]);
  return {
    practice,
    runId,
    caseId: lines[0]?.case_id ?? '',
    lineIds: lines.map((line) => line.priced_line_id),
  };
}

/**
 * SYNTHETIC CAS-03 with its second plan's contract at or below what was paid: a case for the first plan, and beside it
 * lines whose variance is zero (97530 at 35.00) or negative (at 34.00).
 */
const besideACase = (label: string, amountCents: string): CasRun => ({
  label,
  setup: async (world, name) => {
    const practice = await world.practice(name);
    await world.load(practice, 'CAS-03/remit.835');
    const one = await world.fixedContract(practice, FIXED);
    const second = await world.fixedContract(practice, {
      ...FIXED,
      schedule: [{ code: '97530', amountCents }],
    });
    const plans = [
      { key: 'CE:SYNPLAN-FIX-ONE', versionId: one.versionId },
      { key: 'CE:SYNPLAN-FIX-TWO', versionId: second.versionId },
    ];
    return {
      practice,
      runId: await world.pricedRun(practice, {
        plans,
        from: '2026-03-01',
        to: '2026-03-31',
      }),
    };
  },
});
const WORLDS: readonly CasRun[] = [...CAS_RUNS, besideACase('CAS-03 one plan short, one paid in full', '3500'), besideACase('CAS-03 one plan short, one overpaid', '3400')];

let months = 0;

/** A job's statement of a period of its own, with the figure and links given; the refusal's code and message, or 'stored'. */
async function insertStatement(practice: Practice, figure: string, cases: readonly string[], lines: readonly string[] | undefined): Promise<string> {
  months += 1;
  const year = 2100 + months;
  const links = {
    recovered: [],
    interest: [],
    approved_unposted: [],
    actionable_open: cases,
    ...(lines === undefined ? {} : { actionable_open_lines: lines }),
  };
  try {
    await inJob(practice, (scope) =>
      scope.client.query(
        `INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links, generated_by)
         VALUES ($1, $2, $3, 'posted', 0, 0, 0, 0, $4, '0.00', $5, NULL)`,
        [practice.practiceId, `${String(year)}-01-01`, `${String(year)}-03-31`, figure, JSON.stringify(links)],
      ),
    );
    return 'stored';
  } catch (error) {
    const refusal = error as { code?: string; message: string };
    return `${refusal.code ?? ''}: ${refusal.message}`;
  }
}

const REFUSED = `23514: ${LINES_RULE}`;

describe('the writer lists the lines its figure counted (T5, T11)', () => {
  it('on generated worlds the listed lines add up to the figure, case by case as ACTIONABLE_NOW gives it, and the stored row is the one before but for the list', async () => {
    const seen = {
      worlds: 0,
      writtenOff: 0,
      stale: 0,
      listedNull: 0,
      listedZero: 0,
      listedNegative: 0,
      emptyCases: 0,
      severalCases: 0,
    };
    for (const [index, run] of WORLDS.entries()) {
      const random = seeded(20261112 + index);
      const { practice, runId } = await run.setup(w, `statement lines ${run.label} ${randomUUID().slice(0, 8)}`);
      await w.triage(practice, runId, CAS_AS_OF);
      const check = async (): Promise<void> => {
        const rows = await bothWriters(w, practice);
        expectEqualButTheList(rows);
        const paths = await expectBothPathsEqual(w, practice);
        expect(rows.now.links.actionable_open_lines).toEqual(paths.flatMap((row) => row.line_ids));
        const { listed, perCase } = await expectListIsTheFigure(practice, rows.now);
        seen.listedNull += listed.filter((line) => line.variance_cents === null).length;
        seen.listedZero += listed.filter((line) => line.variance_cents === '0').length;
        seen.listedNegative += listed.filter((line) => line.variance_cents?.startsWith('-')).length;
        seen.emptyCases += [...perCase.keys()].filter((caseId) => !listed.some((line) => line.case_id === caseId)).length;
        seen.severalCases += perCase.size > 1 ? 1 : 0;
      };
      await check();
      await oddLinesJoin(practice);
      await check();
      for (const line of await openCaseLines(practice)) {
        if (random() < 0.4) {
          await writeOff(practice, line.id);
          seen.writtenOff += 1;
        }
      }
      await check();
      if (index % 2 === 0) {
        await pricedAgain(practice, runId);
        seen.stale += 1;
        await check();
      }
      seen.worlds += 1;
    }
    // The worlds held every kind of line the property is about.
    expect(seen.worlds).toBe(WORLDS.length);
    for (const [kind, count] of Object.entries(seen)) {
      expect(count, kind).toBeGreaterThan(0);
    }
  }, 900_000);

  it('T5, T11: on a ledger whose line moves on to payer approved and recovered and is reopened by a recoupment (LED-06), the same; a line that moved on is not listed', async () => {
    const practice = await led.practice(`statement lines LED-06 ${randomUUID().slice(0, 8)}`);
    await led.caseFor(practice, 'LED-06/original.835');
    await led.load(practice, 'LED-06/adjusted.835');
    const stages: (string | null)[] = [];
    const listed: number[] = [];
    const check = async (): Promise<StoredRow> => {
      const rows = await bothWriters(led, practice);
      expectEqualButTheList(rows);
      expect(rows.now.links.actionable_open_lines).toEqual((await expectBothPathsEqual(led, practice)).flatMap((row) => row.line_ids));
      await expectListIsTheFigure(practice, rows.now, (target, sql, values) => led.rows(target, sql, values));
      stages.push((await led.rows<{ stage: string }>(practice, 'SELECT stage FROM line_status WHERE practice_id = $1 ORDER BY seq DESC LIMIT 1', [practice.practiceId]))[0]?.stage ?? null);
      listed.push(rows.now.links.actionable_open_lines?.length ?? -1);
      return rows.now;
    };
    await check();
    await led.reconcile(practice);
    await check();
    await led.reconcile(practice, {
      documentId: await led.stageExport(practice, 'LED-06/posting-export.csv', 'posting_export'),
    });
    await led.reconcile(practice, {
      documentId: await led.stageExport(practice, 'LED-06/eft-export.csv', 'eft_export'),
    });
    await check();
    await led.load(practice, 'LED-06/recoupment.835');
    await led.reconcile(practice);
    expect((await check()).rest.recovered_cents).not.toBe(0);
    // The case's line is listed while it is actionable, not once it has moved on to payer approved or recovered, and
    // again once the recoupment has reopened it.
    expect(stages).toEqual(['actionable', 'payer_approved', 'recovered', 'actionable']);
    expect(listed).toEqual([1, 0, 0, 1]);
  }, 240_000);
});

describe('the database checks the figure against the lines listed (T6, T7, T8)', () => {
  it('T6, T7: refuses each wrong statement with the one rule, and accepts a figure that matches its own list', async () => {
    const { practice, runId, caseId, lineIds } = await threeLines('statement lines refusals');
    const other = await threeLines('statement lines another practice');
    const [a, b, c] = lineIds as [string, string, string];
    // Its own lines, and today's rule for a statement without the key.
    expect(await insertStatement(practice, '9000', [caseId], lineIds)).toBe('stored');
    expect(await insertStatement(practice, '1', [caseId], undefined)).toBe('stored');
    expect(await insertStatement(practice, '9001', [caseId], lineIds)).toBe(REFUSED);
    expect(await insertStatement(practice, '8999', [caseId], lineIds)).toBe(REFUSED);
    expect(await insertStatement(practice, '9000', [caseId], [a, a, b, c])).toBe(REFUSED);
    expect(await insertStatement(practice, '12000', [caseId], [a, a, b, c])).toBe(REFUSED);
    expect(await insertStatement(practice, '9000', [caseId], [])).toBe(REFUSED);
    expect(await insertStatement(practice, '0', [caseId], [a])).toBe(REFUSED);
    // A line of a case the statement does not list.
    expect(await insertStatement(practice, '9000', [], lineIds)).toBe(REFUSED);
    expect(await insertStatement(practice, '9000', [randomUUID()], lineIds)).toBe(REFUSED);
    // T7: another practice's lines, alone or beside its own, with the other's case or its own: refused, and the
    // message is the rule alone (no ID, figure or count of the other practice).
    for (const refusal of [
      await insertStatement(practice, '9000', [caseId], other.lineIds),
      await insertStatement(practice, '9000', [other.caseId], other.lineIds),
      await insertStatement(practice, '18000', [caseId, other.caseId], [...lineIds, ...other.lineIds]),
      await insertStatement(practice, '9000', [caseId], [a, b, other.lineIds[0] as string]),
    ]) {
      expect(refusal).toBe(REFUSED);
      expect(refusal).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    }
    // An ID that is no priced line.
    expect(await insertStatement(practice, '9000', [caseId], [a, b, randomUUID()])).toBe(REFUSED);

    // Priced again, not yet accepted: each service line now has a second priced line, on no case.
    const { pricingRunId } = await w.as(practice, practice.manager, ({ scope }) =>
      createRerun(scope, {
        practiceId: practice.practiceId,
        pricingRunId: runId,
        releaseNo: RELEASE,
        requestId: `test-${randomUUID()}`,
      }),
    );
    await w.pricing.execute(practice, pricingRunId);
    const again = await owner<{ id: string; variance_cents: string }>(practice, 'SELECT id, variance_cents::text FROM priced_line WHERE pricing_run_id = $1 ORDER BY id', [pricingRunId]);
    expect(again.map((line) => line.variance_cents)).toEqual(['3000', '3000', '3000']);
    // A priced line on no case; the other priced line of a service line the case holds.
    expect(
      await insertStatement(
        practice,
        '9000',
        [caseId],
        again.map((line) => line.id),
      ),
    ).toBe(REFUSED);
    expect(await insertStatement(practice, '9000', [caseId], [a, b, again[0]?.id ?? ''])).toBe(REFUSED);
    await w.as(practice, practice.manager, ({ scope }) =>
      acceptRun(scope, {
        practiceId: practice.practiceId,
        pricingRunId,
        replacesId: runId,
        heldByIds: [],
      }),
    );
    expect(
      await insertStatement(
        practice,
        '9000',
        [caseId],
        again.map((line) => line.id),
      ),
    ).toBe(REFUSED);

    // What the database does not check, on record: the case's lines are now stale and one is written off, yet a
    // statement that lists them with the figure they add up to is accepted. It checks the sum and the cases, not that
    // the lines were the right ones (the ask's Why says so); the writer's query is what picks them.
    const [first] = await openCaseLines(practice);
    await writeOff(practice, first?.id ?? '');
    expect(await insertStatement(practice, '9000', [caseId], lineIds)).toBe('stored');
    expect(await insertStatement(practice, '3000', [caseId], [first?.priced_line_id ?? ''])).toBe('stored');
    // And the writer itself now lists none of them.
    const row = await rolledBack(w, practice.practiceId, async (scope) =>
      storedRow(
        scope,
        (
          await generateRoiStatement(
            scope,
            {
              practiceId: practice.practiceId,
              ...QUARTER,
              requestId: `test-${randomUUID()}`,
            },
            SOURCES,
          )
        )?.statementId,
      ),
    );
    expect({
      cents: row.actionable_open_cents,
      cases: row.links.actionable_open,
      lines: row.links.actionable_open_lines,
    }).toEqual({ cents: '0', cases: [caseId], lines: [] });
  }, 240_000);

  it('T8: yesterday’s statement stays as written, and the daily repeat for a quarter already stored passes the check, stores nothing and changes nothing', async () => {
    const { practice, runId, caseId, lineIds } = await threeLines('statement lines a second day');
    const quarter = {
      practiceId: practice.practiceId,
      periodFrom: '2026-01-01',
      periodTo: '2026-03-31',
    };
    const generate = () => inJob(practice, (scope) => generateRoiStatement(scope, { ...quarter, requestId: `test-${randomUUID()}` }, SOURCES));
    const yesterday = await generate();
    const all = () => owner<{ row: Record<string, unknown> }>(practice, 'SELECT to_jsonb(s) AS row FROM roi_statement s WHERE s.practice_id = $1 ORDER BY s.created_at, s.id', [practice.practiceId]);
    const before = await all();
    expect(before.map(({ row }) => [row.id, row.actionable_open_cents, (row.links as Record<string, unknown>).actionable_open_lines])).toEqual([[yesterday?.statementId, 9000, lineIds]]);
    // The same day again: the fresh statement passes the check before the conflict is found, and nothing is stored.
    expect(await generate()).toBeNull();
    expect(await all()).toEqual(before);

    // A line is written off and the run is priced again: the daily repeat's fresh statement (0.00, no lines) still passes.
    const [first] = await openCaseLines(practice);
    await writeOff(practice, first?.id ?? '');
    await pricedAgain(practice, runId);
    expect(await generate()).toBeNull();
    expect(await all()).toEqual(before);
    // The next quarter's statement is checked on today's rows.
    const today = await inJob(practice, async (scope) =>
      storedRow(
        scope,
        (
          await generateRoiStatement(
            scope,
            {
              ...quarter,
              periodFrom: '2026-04-01',
              periodTo: '2026-06-30',
              requestId: `test-${randomUUID()}`,
            },
            SOURCES,
          )
        )?.statementId,
      ),
    );
    expect({
      cents: today.actionable_open_cents,
      lines: today.links.actionable_open_lines,
    }).toEqual({ cents: '0', lines: [] });
    expect((await all()).slice(0, 1)).toEqual(before);
    // A repeat with yesterday's list is refused only when its figure no longer matches its own list: never because a
    // line is no longer actionable.
    expect(await insertStatement(practice, '9000', [caseId], lineIds)).toBe('stored');
    expect(await insertStatement(practice, '6000', [caseId], lineIds)).toBe(REFUSED);
  }, 240_000);
});

describe('what roi_statement_rules() leans on (T15 b, c)', () => {
  const guard = (what: string) =>
    `${what}: roi_statement_rules() joins a listed priced line to its case through case_line (service line, priced line and practice); changing this needs a new ledger freeze exception that replaces roi_statement_rules()`;
  const catalog = async <T extends object>(sql: string) => (await w.owner.query<T>(sql)).rows;

  it('T15 b: the line a case counts is case_line.priced_line_id, the only link from a case line to a priced line', async () => {
    expect(await catalog("SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'case_line_pricing'"), guard('a case_line_pricing table')).toEqual([]);
    expect(
      await catalog(
        `SELECT a.attname FROM pg_constraint k JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY(k.conkey)
          WHERE k.conrelid = 'case_line'::regclass AND k.contype = 'f' AND k.confrelid = 'priced_line'::regclass`,
      ),
      guard('a second priced-line column on case_line'),
    ).toEqual([{ attname: 'priced_line_id' }]);
    expect(await catalog("SELECT a.attname FROM pg_attribute a WHERE a.attrelid = 'case_line'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attname LIKE '%priced%'"), guard('a second priced-line column on case_line')).toEqual([
      { attname: 'priced_line_id' },
    ]);
  });

  it('T15 c: a case line is a priced line of its own service line and practice, once, and it never changes or goes', async () => {
    expect(
      await catalog(
        `SELECT t.tgname, p.proname, t.tgenabled::text AS enabled FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE t.tgrelid = 'case_line'::regclass AND NOT t.tgisinternal AND t.tgname IN ('case_line_belongs', 'case_line_rules', 'case_line_never_deleted', 'case_line_no_truncate') ORDER BY t.tgname`,
      ),
      guard('case_line’s triggers'),
    ).toEqual([
      {
        tgname: 'case_line_belongs',
        proname: 'case_line_belongs',
        enabled: 'O',
      },
      {
        tgname: 'case_line_never_deleted',
        proname: 'triage_never_deleted',
        enabled: 'O',
      },
      {
        tgname: 'case_line_no_truncate',
        proname: 'triage_no_truncate',
        enabled: 'O',
      },
      { tgname: 'case_line_rules', proname: 'case_line_rules', enabled: 'O' },
    ]);
    expect(await catalog("SELECT pg_get_constraintdef(k.oid) AS def FROM pg_constraint k WHERE k.conrelid = 'case_line'::regclass AND k.conname = 'case_line_once'"), guard('case_line_once')).toEqual([{ def: 'UNIQUE (service_line_id)' }]);

    const { practice, lineIds } = await threeLines('statement lines case line rules');
    const other = await threeLines('statement lines case line rules, another practice');
    const [line] = await openCaseLines(practice);
    const refusal = async (sql: string, values: unknown[]): Promise<string> => {
      try {
        await owner(practice, sql, values);
        return 'done';
      } catch (error) {
        return (error as { code?: string }).code ?? (error as Error).message;
      }
    };
    // case_line_rules: the case, service line and priced line never change.
    expect(await refusal('UPDATE case_line SET priced_line_id = $2 WHERE id = $1', [line?.id, lineIds.find((id) => id !== line?.priced_line_id)]), guard('case_line_rules')).toBe('23514');
    expect(await refusal('UPDATE case_line SET service_line_id = gen_random_uuid() WHERE id = $1', [line?.id]), guard('case_line_rules')).toBe('23514');
    expect(await refusal('UPDATE case_line SET case_id = gen_random_uuid() WHERE id = $1', [line?.id]), guard('case_line_rules')).toBe('23514');
    // The no-delete and no-truncate triggers.
    expect(await refusal('DELETE FROM case_line WHERE id = $1', [line?.id]), guard('case_line_never_deleted')).not.toBe('done');
    expect(await refusal('TRUNCATE case_line', []), guard('case_line_no_truncate')).not.toBe('done');
    // case_line_once and case_line_belongs: a second case line of the service line; a priced line of another service
    // line; a priced line of another practice.
    const [caseRow] = await owner<{ case_id: string }>(practice, 'SELECT case_id FROM case_line WHERE id = $1', [line?.id]);
    const insert = 'INSERT INTO case_line (practice_id, case_id, service_line_id, priced_line_id) VALUES ($1, $2, $3, $4)';
    expect(await refusal(insert, [practice.practiceId, caseRow?.case_id, line?.service_line_id, line?.priced_line_id]), guard('case_line_once')).toBe('23505');
    const free = await owner<{ id: string; service_line_id: string }>(
      practice,
      `SELECT p.id, p.service_line_id FROM priced_line p WHERE p.practice_id = $1 AND NOT EXISTS (SELECT 1 FROM case_line l WHERE l.service_line_id = p.service_line_id) LIMIT 1`,
      [practice.practiceId],
    );
    expect(free).toEqual([]);
    await pricedAgain(practice, (await owner<{ pricing_run_id: string }>(practice, 'SELECT pricing_run_id FROM priced_line WHERE id = $1', [lineIds[0]]))[0]?.pricing_run_id ?? '');
    expect(await refusal('UPDATE case_line SET priced_line_id = (SELECT p.id FROM priced_line p WHERE p.service_line_id = case_line.service_line_id AND p.id <> case_line.priced_line_id) WHERE id = $1', [line?.id]), guard('case_line_rules')).toBe(
      '23514',
    );
    expect(other.lineIds).toHaveLength(3);
  }, 240_000);
});

describe('the readers and the PDF record (T9, T10, T12), and what a refusal shows (T3b)', () => {
  it('T12, T9: the print job receives four keys for a statement that lists its lines, prints what it prints for the same statement without the list, and records the PDF on both', async () => {
    const practice = await recoupedLedSix(led, `statement readers print ${randomUUID().slice(0, 8)}`);
    const twins = await statementTwins(led, practice, QUARTER);
    expect(twins.lines).toBe(1);
    const five = await printWatched(led.app, led.services, practice.practiceId, twins.five);
    const four = await printWatched(led.app, led.services, practice.practiceId, twins.four);
    // The list is never sent to the job: the row it reads carries today's four keys, whichever statement it is.
    expect(five.received.map((row) => Object.keys(row.links).sort())).toEqual([[...FOUR_KEYS]]);
    expect(four.received.map((row) => Object.keys(row.links).sort())).toEqual([[...FOUR_KEYS]]);
    expect(five.received[0]?.links).toEqual(four.received[0]?.links);
    // The bytes printed are the four-key statement's, but for the statement's own ID.
    expect(five.html).toHaveLength(1);
    expect(five.html[0]?.replaceAll(twins.five, twins.four)).toBe(four.html[0]);
    expect(five.html[0]).not.toContain('actionable_open_lines');
    // T9: the PDF's record (the UPDATE) passes on both, once.
    expect([five.outcome.outcome, four.outcome.outcome]).toEqual(['printed', 'printed']);
    const recorded = await led.rows<{ id: string; printed: boolean; keys: number }>(
      practice,
      'SELECT s.id, s.document_key IS NOT NULL AND s.pdf_sha256 IS NOT NULL AS printed, (SELECT count(*)::int FROM jsonb_object_keys(s.links)) AS keys FROM roi_statement s WHERE s.id = ANY($1::uuid[]) ORDER BY keys',
      [[twins.five, twins.four]],
    );
    expect(recorded).toEqual([
      { id: twins.four, printed: true, keys: 4 },
      { id: twins.five, printed: true, keys: 5 },
    ]);
    expect((await printWatched(led.app, led.services, practice.practiceId, twins.five)).outcome).toEqual({ outcome: 'already_printed' });
  }, 240_000);

  it('T9: a statement whose listed lines were since written off and priced again still records its PDF, and stays as written', async () => {
    const { practice, runId, lineIds } = await threeLines('statement readers a stored statement');
    const quarter = { practiceId: practice.practiceId, periodFrom: '2026-01-01', periodTo: '2026-03-31' };
    const generated = await inJob(practice, (scope) => generateRoiStatement(scope, { ...quarter, requestId: `test-${randomUUID()}` }, SOURCES));
    const stored = () => inJob(practice, (scope) => storedRow(scope, generated?.statementId));
    const before = await stored();
    expect(before.links.actionable_open_lines).toEqual(lineIds);
    const [first] = await openCaseLines(practice);
    await writeOff(practice, first?.id ?? '');
    await pricedAgain(practice, runId);
    const print = await printWatched(w.app, w.pricing.parseServices, practice.practiceId, generated?.statementId ?? '');
    expect(print.outcome.outcome).toBe('printed');
    expect(print.received.map((row) => Object.keys(row.links).sort())).toEqual([[...FOUR_KEYS]]);
    // The UPDATE checked nothing again and changed only the PDF's two columns.
    const after = await stored();
    expect({ ...after.rest, document_key: null, pdf_sha256: null }).toEqual(before.rest);
    expect(after.links).toEqual(before.links);
  }, 240_000);

  it('T10: the previous image against this database: its writer stores four keys and its PDF is recorded, and its reader reads a statement that lists its lines as today’s reader does', async () => {
    const { practice } = await threeLines('statement readers the previous image');
    const quarter = { practiceId: practice.practiceId, periodFrom: '2026-01-01', periodTo: '2026-03-31' };
    // The previous image's writer, then the PDF's record (the UPDATE is the same text in both images).
    const old = await inJob(practice, (scope) => generateFourKeyStatement(scope, quarter, SOURCES));
    expect(Object.keys((await inJob(practice, (scope) => storedRow(scope, old?.statementId))).links).sort()).toEqual([...FOUR_KEYS]);
    expect((await printWatched(w.app, w.pricing.parseServices, practice.practiceId, old?.statementId ?? '')).outcome.outcome).toBe('printed');
    // Today's writer's row, read by the previous image's select (`s.links` whole) and by today's.
    const now = await inJob(practice, (scope) => generateRoiStatement(scope, { ...quarter, periodFrom: '2026-04-01', periodTo: '2026-06-30', requestId: `test-${randomUUID()}` }, SOURCES));
    type Row = Parameters<typeof storedStatement>[0];
    const read = (columns: string) => inJob(practice, async (scope) => (await scope.client.query<Row>(`SELECT ${columns} FROM roi_statement s WHERE s.id = $1`, [now?.statementId])).rows[0] as Row);
    const previous = await read(PREVIOUS_STATEMENT_COLUMNS);
    const today = await read(STATEMENT_COLUMNS);
    expect(Object.keys(previous.links)).toHaveLength(5);
    expect(Object.keys(today.links).sort()).toEqual([...FOUR_KEYS]);
    expect(storedStatement(previous)).toEqual(storedStatement(today));
    expect({ ...previous, links: today.links }).toEqual(today);
    // The new writer against the unmigrated database is refused: the migration's own test holds that (T3: the old
    // roi_links_valid answers false for five keys; packages/db/src/roi-statement-actionable-lines-migration.db.test.ts).
  }, 240_000);

  it('T3b, its last clause: a refusal that quotes a value reaches a log as its code alone, and the rule’s refusal names no value', async () => {
    const { practice, caseId, lineIds } = await threeLines('statement readers a refusal');
    const SENT = 'SYNTHETIC-not-an-id';
    const refused = async (lines: unknown): Promise<{ readonly code?: string; readonly message: string }> => {
      months += 1;
      const year = 2100 + months;
      const links = { recovered: [], interest: [], approved_unposted: [], actionable_open: [caseId], actionable_open_lines: lines };
      return inJob(practice, (scope) =>
        scope.client.query(
          `INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links, generated_by)
           VALUES ($1, $2, $3, 'posted', 0, 0, 0, 0, 9000, '0.00', $4, NULL)`,
          [practice.practiceId, `${String(year)}-01-01`, `${String(year)}-03-31`, JSON.stringify(links)],
        ),
      ).then(
        () => {
          throw new Error('the statement was stored');
        },
        (error: unknown) => error as { readonly code?: string; readonly message: string },
      );
    };
    // A malformed ID is refused by the trigger's cast, and PostgreSQL's words quote it.
    const malformed = await refused([...lineIds.slice(0, 2), SENT]);
    expect(malformed.code).toBe('22P02');
    expect(malformed.message).toContain(SENT);
    // The job's log line for a failed attempt is the code, never the words (worker.ts, logFailedAttempt).
    expect(attemptErrorCode(malformed)).toBe('DB_22P02');
    // A value that is not a list of IDs: refused, and logged the same way.
    const notAList = await refused(SENT);
    expect(notAList.code).not.toBe('23514');
    expect(attemptErrorCode(notAList)).toBe(`DB_${String(notAList.code)}`);
    expect(attemptErrorCode(notAList)).not.toContain(SENT);
    // A well-formed ID that is no line of the case: the rule's own words, which a person may be shown (the web's 23514
    // branch), name no ID and no figure.
    const stranger = randomUUID();
    const wrong = await refused([...lineIds.slice(0, 2), stranger]);
    expect(`${String(wrong.code)}: ${wrong.message}`).toBe(REFUSED);
    expect(wrong.message).not.toContain(stranger);
    expect(wrong.message).not.toMatch(/[0-9]/);
    expect(attemptErrorCode(wrong)).toBe('DB_23514');
  }, 240_000);
});
