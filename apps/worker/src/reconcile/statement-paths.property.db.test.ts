import { randomUUID } from 'node:crypto';

import { readDatabaseUrl } from '@tp/db';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { acceptRun, createRerun } from '../price/rerun';
import { type Practice, RELEASE } from '../price/test-support/pricing-world';
import { ACTIONABLE_NOW } from '../triage/actionable-now';
import { CAS_AS_OF, CAS_RUNS } from '../triage/test-support/cas-runs';
import { TriageWorld } from '../triage/test-support/triage-world';
import { OPEN_CASES_ACTIONABLE } from './statements';
import { type OpenCasePathRow, PLAIN_PATH_OPEN_CASES } from './test-support/plain-path-writer';

/**
 * The statement writer's one-pass figure and list, as a property over small worlds (schema PR 5; the design note's 4.1;
 * LED-26): in a transaction rolled back, whatever the lines' states, each case's figure is what ACTIONABLE_NOW gives
 * run as a query of its own, it is the sum of the variance of the lines listed for it (BigInt, from text), no line is
 * listed for two cases, and the plain path answers the same rows. The states: actionable now, priced again (stale),
 * written off, left at flagged or validated (moved on never reached actionable), no stage event, a line whose variance is zero, negative or null.
 * Not expressed, because no builder here makes one and no schema is invented: a case with no case_line at all.
 * The writes and the reads share one owner transaction (the app role may not write most of these rows), so the read
 * sees the world as the owner's scope does. SYNTHETIC rows only. Seed 20261113; a failure prints it and its path.
 */

const SEED = 20261113;
const FIXED = { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 } as const;
const OTHER = (amountCents: string) => ({ ...FIXED, schedule: [{ code: '97530', amountCents }] });

let w: TriageWorld;
const worlds: { readonly name: string; readonly practice: Practice }[] = [];

async function besideACase(name: string, amountCents: string): Promise<void> {
  const practice = await w.practice(`${name} ${randomUUID().slice(0, 8)}`);
  await w.load(practice, 'CAS-03/remit.835');
  const one = await w.fixedContract(practice, FIXED);
  const two = await w.fixedContract(practice, OTHER(amountCents));
  const runId = await w.pricedRun(practice, {
    plans: [
      { key: 'CE:SYNPLAN-FIX-ONE', versionId: one.versionId },
      { key: 'CE:SYNPLAN-FIX-TWO', versionId: two.versionId },
    ],
    from: '2026-03-01',
    to: '2026-03-31',
  });
  await w.triage(practice, runId, CAS_AS_OF);
  worlds.push({ name, practice });
}

beforeAll(async () => {
  w = await TriageWorld.open(readDatabaseUrl());
  const twoCases = await (CAS_RUNS[0] as (typeof CAS_RUNS)[number]).setup(w, `property two cases ${randomUUID().slice(0, 8)}`);
  await w.triage(twoCases.practice, twoCases.runId, CAS_AS_OF);
  worlds.push({ name: 'two cases', practice: twoCases.practice });
  await besideACase('zero variance beside a case', '3500');
  await besideACase('negative variance beside a case', '3400');
  // One case of three lines whose run is priced again: every line of the case is off its pricing in effect (stale).
  const practice = await w.practice(`property stale ${randomUUID().slice(0, 8)}`, { case_materiality_cents: '1000' });
  await w.load(practice, 'CAS-08/remit.835');
  const contract = await w.fixedContract(practice, FIXED);
  await w.pricing.mapped(practice, await w.pricing.planOf(practice, 'CE:SYNPLAN-FIX-ONE'), 'contract', '2026-01-01', contract.versionId);
  const runId = await w.pricing.createRun(practice, '2026-03-01', '2026-03-31', RELEASE);
  await w.pricing.execute(practice, runId);
  await w.triage(practice, runId);
  const { pricingRunId } = await w.as(practice, practice.manager, ({ scope }) =>
    createRerun(scope, { practiceId: practice.practiceId, pricingRunId: runId, releaseNo: RELEASE, requestId: `test-${randomUUID()}` }),
  );
  await w.pricing.execute(practice, pricingRunId);
  await w.as(practice, practice.manager, ({ scope }) => acceptRun(scope, { practiceId: practice.practiceId, pricingRunId, replacesId: runId, heldByIds: [] }));
  worlds.push({ name: 'priced again', practice });
}, 900_000);

afterAll(async () => {
  await w.close();
});

/** What a case line becomes: untouched or written off. */
const FATES = ['actionable', 'written_off'] as const;
/**
 * Lines that were in no case, joined to the first case: not joined, with no stage event, left at flagged or validated
 * (never actionable: a line that moved on), or at actionable as triage leaves one. A line at payer approved or recovered,
 * and a reopened one, need ledger entries (line_status_ledger_rules()): LED-06 in statement-lines.db.test.ts (T5, T11)
 * covers those; this property does not.
 */
const JOINS = ['none', 'no_stage', 'flagged', 'validated', 'actionable'] as const;

const seen = { examples: 0, listed: 0, emptyCasesWithLines: 0, writtenOff: 0, movedOn: 0, noStage: 0, stale: 0, zero: 0, negative: 0, severalCases: 0 };

interface Read {
  readonly onePass: readonly OpenCasePathRow[];
  readonly plain: readonly OpenCasePathRow[];
  readonly alone: ReadonlyMap<string, string>;
  readonly variance: ReadonlyMap<string, string>;
}

/** One example: the world's lines put in their fates, read three ways, and rolled back. */
async function readWorld(world: { readonly practice: Practice }, fates: readonly number[], join: (typeof JOINS)[number]): Promise<Read> {
  const { practice } = world;
  const { practiceId, manager } = practice;
  const db = w.owner;
  const one = async <T extends object>(sql: string, values: unknown[] = []): Promise<T[]> => (await db.query<T>(sql, values)).rows;
  await db.query('BEGIN');
  try {
    await db.query('SET LOCAL ROLE tp_owner');
    await db.query("SELECT set_config('app.practice_ids', $1, true), set_config('app.actor_id', $2, true)", [`{${practiceId}}`, manager]);
    const lines = await one<{ id: string; service_line_id: string; priced_line_id: string }>(
      'SELECT id, service_line_id, priced_line_id FROM case_line WHERE practice_id = $1 AND written_off_reason IS NULL ORDER BY id',
      [practiceId],
    );
    for (const [index, line] of lines.entries()) {
      if (FATES[fates[index] ?? 0] === 'written_off') {
        await db.query("UPDATE case_line SET written_off_reason = 'duplicate', written_off_by = $2 WHERE id = $1", [line.id, manager]);
        seen.writtenOff += 1;
      }
    }
    if (join !== 'none') {
      const [first] = await one<{ id: string }>(`SELECT id FROM "case" WHERE practice_id = $1 AND state NOT IN ('resolved', 'closed_written_off') ORDER BY opened_at, id LIMIT 1`, [practiceId]);
      const odd = await one<{ id: string; service_line_id: string; stage: string | null }>(
        `SELECT p.id, p.service_line_id, (SELECT s.stage FROM line_status s WHERE s.service_line_id = p.service_line_id ORDER BY s.seq DESC LIMIT 1) AS stage
           FROM priced_line p
          WHERE p.practice_id = $1 AND priced_line_pricing_check(p.id) = 'current' AND NOT EXISTS (SELECT 1 FROM case_line l WHERE l.service_line_id = p.service_line_id)
          ORDER BY p.id`,
        [practiceId],
      );
      const order = ['flagged', 'validated', 'actionable'];
      // A line the database refuses (a total below zero) is tried again after the others, so a negative one can follow positive ones.
      const queue = [...odd, ...odd];
      const joined = new Set<string>();
      for (const line of queue) {
        if (first === undefined) {
          break;
        }
        if (joined.has(line.id)) {
          continue;
        }
        await db.query('SAVEPOINT odd');
        try {
          if (join !== 'no_stage') {
            const upTo = order.indexOf(join);
            for (const name of order.slice(line.stage === null ? 0 : order.indexOf(line.stage) + 1, upTo + 1)) {
              await db.query('INSERT INTO line_status (practice_id, service_line_id, stage, priced_line_id) VALUES ($1, $2, $3, $4)', [practiceId, line.service_line_id, name, line.id]);
            }
          }
          await db.query('INSERT INTO case_line (practice_id, case_id, service_line_id, priced_line_id) VALUES ($1, $2, $3, $4)', [practiceId, first.id, line.service_line_id, line.id]);
          await db.query('RELEASE SAVEPOINT odd');
          joined.add(line.id);
          seen.noStage += join === 'no_stage' && line.stage === null ? 1 : 0;
          seen.movedOn += join === 'flagged' || join === 'validated' ? 1 : 0;
        } catch (error) {
          // The database lets no case's total go below zero (case_actionable_cents_check): that line stays out.
          if ((error as { code?: string }).code !== '23514') {
            throw error;
          }
          await db.query('ROLLBACK TO SAVEPOINT odd');
        }
      }
    }
    const onePass = (await db.query<OpenCasePathRow>(OPEN_CASES_ACTIONABLE, [practiceId])).rows;
    const plain = (await db.query<OpenCasePathRow>(PLAIN_PATH_OPEN_CASES, [practiceId])).rows;
    const alone = new Map((await one<{ id: string; cents: string }>(`SELECT c.id, ${ACTIONABLE_NOW('c')}::text AS cents FROM "case" c WHERE c.practice_id = $1`, [practiceId])).map((row) => [row.id, row.cents]));
    const variance = new Map(
      (await one<{ id: string; variance_cents: string | null }>('SELECT id, variance_cents::text FROM priced_line WHERE practice_id = $1', [practiceId])).map((row) => [row.id, row.variance_cents ?? '0']),
    );
    const stale = await one<{ n: string }>(
      "SELECT count(*)::text AS n FROM case_line x WHERE x.practice_id = $1 AND priced_line_pricing_check(x.priced_line_id) IS DISTINCT FROM 'current'",
      [practiceId],
    );
    seen.stale += Number(stale[0]?.n ?? '0') > 0 ? 1 : 0;
    return { onePass, plain, alone, variance };
  } finally {
    await db.query('ROLLBACK');
  }
}

describe('the writer’s one pass over arbitrary small worlds (the note’s 4.1; LED-26)', () => {
  it('lists, for every case, the lines its figure sums, as ACTIONABLE_NOW alone gives it, with the plain path’s rows', async () => {
    await fc.assert(
      fc.asyncProperty(fc.nat(worlds.length - 1), fc.array(fc.integer({ min: 0, max: FATES.length - 1 }), { maxLength: 8 }), fc.constantFrom(...JOINS), async (which, fates, join) => {
        const read = await readWorld(worlds[which] as (typeof worlds)[number], fates, join);
        seen.examples += 1;
        // (4) the plain path returns identical rows, in the same order.
        expect(read.onePass).toEqual(read.plain);
        const seenLines = new Set<string>();
        for (const row of read.onePass) {
          // (1) the figure is ACTIONABLE_NOW run as its own query, as exact text.
          expect(row.actionable_cents).toBe(read.alone.get(row.id));
          // (2) it is the sum, in BigInt, of the variance of the lines listed.
          expect(row.line_ids.reduce((sum, id) => sum + BigInt(read.variance.get(id) ?? 'MISSING'), 0n).toString()).toBe(row.actionable_cents);
          // (3) a line is listed once, for one case.
          for (const id of row.line_ids) {
            expect(seenLines.has(id)).toBe(false);
            seenLines.add(id);
            const cents = read.variance.get(id) ?? '0';
            seen.zero += cents === '0' ? 1 : 0;
            seen.negative += cents.startsWith('-') ? 1 : 0;
          }
          seen.listed += row.line_ids.length;
          seen.emptyCasesWithLines += row.line_ids.length === 0 ? 1 : 0;
        }
        seen.severalCases += read.onePass.length > 1 ? 1 : 0;
      }),
      // Worlds 1 and 2 are the zero and the negative variance ones: named examples, run before the random ones.
      { seed: SEED, numRuns: 50, examples: [[1, [], 'actionable'], [2, [1, 0, 1], 'actionable']] },
    );
    // The examples reached the states the property is about (a count of zero would mean it never looked).
    for (const [kind, count] of Object.entries(seen)) {
      expect(count, `${kind} (seed ${String(SEED)}, seen ${JSON.stringify(seen)})`).toBeGreaterThan(0);
    }
  }, 300_000);
});
