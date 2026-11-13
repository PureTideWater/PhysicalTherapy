import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withJobScope } from '@tp/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as ReleaseModule from '../price/release';
import { ACTIONABLE_NOW } from '../triage/actionable-now';
import { GENERATED_FULL_LINES, type GeneratedMonth, generatedMonth } from '../triage/test-support/generated-month';
import { TriageWorld } from '../triage/test-support/triage-world';
import type { Scope } from './ledger';
import { NO_BILLING, NO_TIME_LOG, OPEN_CASES_ACTIONABLE, generateRoiStatement } from './statements';
import { generateFourKeyStatement } from './test-support/four-key-writer';
import { type OpenCasePathRow, PLAIN_PATH_OPEN_CASES } from './test-support/plain-path-writer';
import { EXACT_SCALARS } from './test-support/statement-twins';

/**
 * The statement writer reads each case line once (schema PR 5; the design note's 4.1; test matrix LED-26): on a
 * generated month (test-support/generated-month.ts: lines short, overpaid, unpriced, written off, priced again, in a
 * case through another run), its query answers what the plain path answers (the figure ACTIONABLE_NOW gives and the
 * list as a second subquery), case for case, cent for cent and line for line, and the statement it stores is the plain
 * path's. SYNTHETIC rows only. STATEMENT_PATHS_LINES sets the month's size (the default, the generated month's 10,000;
 * the build ran it once at 31,000, above the 30,795 lines the writer's cost was measured at).
 */

const pricing = vi.hoisted(() => ({ beforeRefusal: false }));

vi.mock('../price/release', async (importOriginal) => {
  const actual = await importOriginal<typeof ReleaseModule>();
  const loaded = [{ from: null, until: null }];
  return {
    ...actual,
    releaseContentSpans: async (...args: Parameters<typeof actual.releaseContentSpans>) =>
      pricing.beforeRefusal ? { mppr_code: loaded, mppr_general: loaded, ncci_mue: loaded } : actual.releaseContentSpans(...args),
  };
});

async function contentLoaded<T>(run: () => Promise<T>): Promise<T> {
  pricing.beforeRefusal = true;
  try {
    return await run();
  } finally {
    pricing.beforeRefusal = false;
  }
}

const LINES = Number(process.env.STATEMENT_PATHS_LINES ?? GENERATED_FULL_LINES);
const SOURCES = { fees: NO_BILLING, pursuitHours: NO_TIME_LOG };
const QUARTER = { periodFrom: '2026-10-01', periodTo: '2026-12-31' } as const;

class RolledBack extends Error {}

let w: TriageWorld;
let month: GeneratedMonth;

beforeAll(async () => {
  w = await TriageWorld.open(readDatabaseUrl());
  month = await generatedMonth(w, { label: `statement paths ${randomUUID().slice(0, 8)}`, lines: LINES, contentLoaded });
}, 3_600_000);

afterAll(async () => {
  await w.close();
});

async function rolledBack<T>(work: (scope: Scope) => Promise<T>): Promise<T> {
  let result: { readonly value: T } | undefined;
  try {
    await withJobScope(w.app, { jobId: randomUUID(), practiceId: month.practice.practiceId }, async (scope) => {
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

const STORED = `SELECT s.links, ${EXACT_SCALARS("to_jsonb(s) - 'id' - 'generated_at' - 'created_at' - 'updated_at' - 'links'")} AS rest FROM roi_statement s WHERE s.id = $1`;

interface Stored {
  readonly links: Record<string, string[]>;
  /** Every value as exact text. */
  readonly rest: Record<string, string | null>;
}

describe('the writer’s one pass and the plain path on a generated month (the note’s 4.1)', () => {
  it('answer the same open cases in the same order, each figure to the cent and each list line for line', async () => {
    const practiceId = month.practice.practiceId;
    const read = await rolledBack(async (scope) => ({
      onePass: (await scope.client.query<OpenCasePathRow>(OPEN_CASES_ACTIONABLE, [practiceId])).rows,
      plain: (await scope.client.query<OpenCasePathRow>(PLAIN_PATH_OPEN_CASES, [practiceId])).rows,
      alone: (await scope.client.query<{ id: string; cents: string }>(`SELECT c.id, ${ACTIONABLE_NOW('c')}::text AS cents FROM "case" c WHERE c.practice_id = $1`, [practiceId])).rows,
      caseLines: Number((await scope.client.query<{ n: string }>('SELECT count(*)::text AS n FROM case_line WHERE practice_id = $1', [practiceId])).rows[0]?.n),
    }));
    expect(read.onePass).toEqual(read.plain);
    // T5's independent comparison: today's ACTIONABLE_NOW, a query of its own, for every case.
    const alone = new Map(read.alone.map((row) => [row.id, row.cents]));
    for (const row of read.onePass) {
      expect(row.actionable_cents).toBe(alone.get(row.id));
    }
    // The month is worth the comparison: several cases, lines listed and lines left out, cases with none.
    const listed = read.onePass.reduce((count, row) => count + row.line_ids.length, 0);
    expect(read.onePass.length).toBeGreaterThan(3);
    expect(listed).toBeGreaterThan(LINES / 20);
    expect(read.caseLines).toBeGreaterThan(listed);
    expect(new Set(read.onePass.flatMap((row) => row.line_ids)).size).toBe(listed);
    expect(read.onePass.reduce((sum, row) => sum + BigInt(row.actionable_cents), 0n)).toBeGreaterThan(0n);
  }, 600_000);

  it('the statement the writer stores is the plain path’s: every column of the four-key statement, and the list the plain path reads', async () => {
    const practiceId = month.practice.practiceId;
    const stored = async (scope: Scope, statementId: string | undefined): Promise<Stored> => {
      const row = (await scope.client.query<Stored>(STORED, [statementId])).rows[0];
      if (row === undefined) {
        throw new Error('the statement was not written');
      }
      return row;
    };
    const now = await rolledBack(async (scope) => ({
      plain: (await scope.client.query<OpenCasePathRow>(PLAIN_PATH_OPEN_CASES, [practiceId])).rows,
      row: await stored(scope, (await generateRoiStatement(scope, { practiceId, ...QUARTER, requestId: `test-${randomUUID()}` }, SOURCES))?.statementId),
    }));
    const before = await rolledBack(async (scope) => stored(scope, (await generateFourKeyStatement(scope, { practiceId, ...QUARTER }, SOURCES))?.statementId));
    const { actionable_open_lines: lines, ...fourKeys } = now.row.links;
    expect(now.row.rest).toEqual(before.rest);
    expect(fourKeys).toEqual(before.links);
    expect(fourKeys.actionable_open).toEqual(now.plain.map((row) => row.id));
    expect(lines).toEqual(now.plain.flatMap((row) => row.line_ids));
    expect(now.row.rest.actionable_open_cents).toBe(now.plain.reduce((sum, row) => sum + BigInt(row.actionable_cents), 0n).toString());
  }, 600_000);
});
