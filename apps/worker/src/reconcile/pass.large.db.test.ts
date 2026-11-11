import { readDatabaseUrl } from '@tp/db';
import { describe, expect, it } from 'vitest';

import { jobHeap, startHeapWatch } from '../heap';
import { LedgerWorld } from './test-support/ledger-world';
import { DIFFERENCE_CENTS, FAMILY, type Measured, type Seeded, type Shape, WORKER_HEAP_MIB, measuredPass, ownMs, seedStep7b } from './test-support/pass-at-size';

/**
 * CAS-51 (SUITE-CAP-3; docs/adr/0087; design sections 7 and 8.4): a reconcile pass at real size. Step 7b's shape (the
 * weekly run's: an 835 reprocessing every actionable line and a posting export, approved and posted in one pass;
 * CAS-42.3's seeding from LED-06's SYNTHETIC segments, test-support/pass-at-size.ts) at LINES lines, timed, with the
 * advisory-lock sampler, on three shapes, each at LINES and at a quarter of it:
 *
 * - spread R, one case per code, 16 lines of a code and date at every size;
 * - F's shape, every line in one case (the case refresh and the matched-pair exclusion bite hardest there; section
 *   1.7);
 * - spread A, 20 dates, so a code and date's lines grow with the size: the only shape that sees a term growing with
 *   them (review round 3). Its patient search's elements (statement (a)'s rows, (b)'s pairs sent and returned) per open
 *   line at LINES are at most 1.5 times those at a quarter, so a search returning every (claim, line) pair of a code
 *   and date, as round 2's form did, fails it.
 *
 * Each pass completes, writes LINES approved and LINES posted entries and 2 x LINES stage events, and every line
 * reaches recovered (the proof level posted); it stays under PASS_BUDGET_MS, and its own part (the pass less its
 * ledger_entry insert statements, timed by the statement proxy; the ledger triggers are Lane A's, section 14.1) under
 * OWN_BUDGET_MS; the own part's time a line at LINES is at most 1.5 times its time a line at a quarter, measured in the
 * same test, so a per-line query returning fails it without a slow runner flaking it, while the triggers' growth
 * cannot; the worker's live heap (D19's, apps/worker/src/heap.ts) stays under 75% of the worker's limit (HEAP_MIB's,
 * not the test process's own V8 limit): section 7's and 8.4's "peak heap" is read as D19's live-heap peak, the heap
 * left after each major collection, as the weekly run's memory line reads it (docs/adr/0083); and no backend
 * holds more than the practice's `ledger:` lock.
 *
 * LINES is 2,000 by default (TP_LARGE_RECONCILE_LINES sets it; the weekly run's step 7b, F at 10,000 lines, is its
 * full-size form; D14). Fails first on the base (the per-line reference, test-support/per-line.ts): on this file's
 * spread R it took 157.4 s at 2,000 lines against the 120 s budget, its own part 149.5 s against 40 s, and its own
 * part's time a line was 3.4 times its time at 500 (74.7 against 22.1 ms; the design measured 122.8 s of own part on
 * cc3dd7f6). Counts and times only are printed.
 */

/** The case lines of the larger pass of each shape; the smaller is a quarter of it. */
const LINES = Number.parseInt(process.env.TP_LARGE_RECONCILE_LINES ?? '2000', 10);
/** The whole pass's budget: 2.5 times spread R's 46 s at 2,000 lines on cc3dd7f6 (section 8.4; F measured 22 s). */
const PASS_BUDGET_MS = 120_000;
/** The own part's budget: two and a half times the 15 s measured at 83d71fd6 (11 to 13 s on cc3dd7f6; section 8.4). */
const OWN_BUDGET_MS = 40_000;
/** How much an own part's time a line, or a patient search's elements a line, may grow from a quarter of LINES. */
const MOST_GROWTH = 1.5;
/** The share of the worker's heap the pass's live heap stays under. */
const LIVE_PERCENT = 75;
/** The most advisory locks any backend may hold during the pass: the practice's `ledger:` lock. */
const MOST_ADVISORY_LOCKS = 1;

/** The largest number of advisory locks any one backend of the world's database holds, sampled every 25 ms. */
function sampleAdvisoryLocks(w: LedgerWorld): { stop: () => Promise<{ readonly peak: number; readonly samples: number }> } {
  let sampling = true;
  let peak = 0;
  let samples = 0;
  const loop = (async () => {
    while (sampling) {
      const { rows } = await w.owner.query<{ n: number }>(
        `SELECT coalesce(max(n), 0)::int AS n FROM (SELECT count(*) AS n FROM pg_locks
           WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database()) GROUP BY pid) x`,
      );
      peak = Math.max(peak, rows[0]?.n ?? 0);
      samples += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  })();
  return {
    stop: async () => {
      sampling = false;
      await loop;
      return { peak, samples };
    },
  };
}

interface Timed {
  readonly seeded: Seeded;
  readonly measured: Measured;
  readonly ownMs: number;
  readonly heapLivePeakMib: number;
  readonly locks: { readonly peak: number; readonly samples: number };
}

/** The patient search's elements: statement (a)'s rows, (b)'s pairs sent and its rows; and the lines it searched. */
function patientElements(measured: Measured): { readonly elements: number; readonly open: number } {
  const patients = measured.statements.filter((statement) => FAMILY.patient.test(statement.text));
  const pairs = measured.statements.filter((statement) => FAMILY.patientPairs.test(statement.text));
  expect(patients, 'one patient search (a) a pass').toHaveLength(1);
  const patient = patients[0] as Measured['statements'][number];
  const sent = pairs.reduce((sum, statement) => sum + (statement.values[11] as unknown[]).length, 0);
  const returned = pairs.reduce((sum, statement) => sum + statement.rowCount, 0);
  return { elements: patient.rowCount + sent + returned, open: (patient.values[1] as unknown[]).length };
}

/** One measured step-7b pass of a practice: its statements, its own part, the live heap and the advisory locks. */
async function timedPass(w: LedgerWorld, seeded: Seeded): Promise<Timed> {
  const locks = sampleAdvisoryLocks(w);
  const heap = jobHeap();
  const measured = await measuredPass(w, seeded.practice, seeded.exportId, (text) => FAMILY.patient.test(text) || FAMILY.patientPairs.test(text)).finally(() => locks.stop());
  const { heapLivePeakMib } = heap.end();
  return { seeded, measured, ownMs: ownMs(measured), heapLivePeakMib, locks: await locks.stop() };
}

async function count(w: LedgerWorld, seeded: Seeded, sql: string, values: unknown[] = []): Promise<number> {
  const [row] = await w.rows<{ n: number }>(seeded.practice, sql, [seeded.practice.practiceId, ...values]);
  return row?.n ?? -1;
}

/** What every pass must have written: each line approved and posted its difference, and recovered. */
async function expectApprovedAndPosted(w: LedgerWorld, run: Timed): Promise<void> {
  const { seeded, measured } = run;
  const lines = seeded.lines;
  expect(measured.summary.postingsMatched).toBe(lines);
  expect(measured.summary.stages.forward).toBe(2 * lines);
  expect(await count(w, seeded, "SELECT count(*)::int AS n FROM ledger_entry WHERE practice_id = $1 AND stage = 'approved' AND amount_cents = $2", [DIFFERENCE_CENTS])).toBe(lines);
  expect(await count(w, seeded, "SELECT count(*)::int AS n FROM ledger_entry WHERE practice_id = $1 AND stage = 'posted' AND amount_cents = $2", [DIFFERENCE_CENTS])).toBe(lines);
  expect(await count(w, seeded, "SELECT count(*)::int AS n FROM ledger_entry WHERE practice_id = $1 AND stage NOT IN ('approved', 'posted')")).toBe(0);
  expect(await count(w, seeded, "SELECT count(*)::int AS n FROM line_status_head h JOIN case_line cl ON cl.service_line_id = h.service_line_id WHERE h.practice_id = $1 AND h.stage = 'recovered'")).toBe(lines);
}

describe.each<{ readonly shape: Shape; readonly name: string }>([
  { shape: 'R', name: 'spread over cases (spread R)' },
  { shape: 'F', name: 'in one case (F’s shape)' },
  { shape: 'A', name: 'on few service dates (spread A)' },
])('a reconcile pass at real size, $name (CAS-51)', ({ shape }) => {
  it(`approves and posts ${String(LINES)} lines in one pass within the budgets, its own part a line at most ${String(MOST_GROWTH)} times its time a line at ${String(LINES / 4)}`, async () => {
    expect(LINES % 4).toBe(0);
    expect(WORKER_HEAP_MIB).toBeGreaterThan(0);
    const w = await LedgerWorld.open(readDatabaseUrl());
    const stopWatch = startHeapWatch();
    try {
      const small = await seedStep7b(w, shape, LINES / 4, 1);
      const large = await seedStep7b(w, shape, LINES, 2);
      if (shape === 'F') {
        expect([small.cases, large.cases]).toEqual([1, 1]);
      } else {
        expect([small.cases, large.cases]).toEqual([5, 5]);
      }
      const quarter = await timedPass(w, small);
      const full = await timedPass(w, large);
      const perLine = (run: Timed) => run.ownMs / run.seeded.lines;
      // Recorded for the pull request: counts and times only.
      for (const run of [quarter, full]) {
        process.stdout.write(
          `CAS-51 ${shape}: ${String(run.seeded.lines)} lines in ${String(run.seeded.cases)} case(s); setup ${(run.seeded.setupMs / 1000).toFixed(1)} s; pass ${(run.measured.passMs / 1000).toFixed(1)} s; own ${(run.ownMs / 1000).toFixed(1)} s (${perLine(run).toFixed(2)} ms a line); live heap ${String(run.heapLivePeakMib)} MiB; peak advisory locks ${String(run.locks.peak)} over ${String(run.locks.samples)} samples; ${String(run.measured.statements.length)} statements\n`,
        );
      }

      for (const run of [quarter, full]) {
        await expectApprovedAndPosted(w, run);
        expect(run.locks.samples).toBeGreaterThan(3);
        expect(run.locks.peak).toBeGreaterThan(0);
        expect(run.locks.peak).toBeLessThanOrEqual(MOST_ADVISORY_LOCKS);
        expect(run.heapLivePeakMib).toBeLessThan((WORKER_HEAP_MIB * LIVE_PERCENT) / 100);
      }
      expect(full.measured.passMs).toBeLessThan(PASS_BUDGET_MS);
      expect(full.ownMs).toBeLessThan(OWN_BUDGET_MS);
      expect(perLine(full)).toBeLessThanOrEqual(MOST_GROWTH * perLine(quarter));
      // The patient search's elements a searched line (every shape's are printed; spread A's are held).
      const search = [patientElements(quarter.measured), patientElements(full.measured)] as const;
      const perOpen = (item: (typeof search)[number]) => item.elements / item.open;
      process.stdout.write(`CAS-51 ${shape}: patient search elements a line ${perOpen(search[0]).toFixed(2)} at ${String(LINES / 4)}, ${perOpen(search[1]).toFixed(2)} at ${String(LINES)}\n`);
      expect(search[1].open).toBe(LINES);
      if (shape === 'A') {
        expect(perOpen(search[1])).toBeLessThanOrEqual(MOST_GROWTH * perOpen(search[0]));
      }
    } finally {
      stopWatch();
      await w.close();
    }
  }, 1_800_000);
});
