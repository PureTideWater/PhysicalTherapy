import { randomUUID } from 'node:crypto';

import { readDatabaseUrl } from '@tp/db';
import { type NotActionableReason, judgeLine, triageSettings } from '@tp/triage';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as ReleaseModule from '../price/release';
import { candidateLines, candidateRows, executeTriage, judgedCandidates } from './execute';
import { CAS_AS_OF, CAS_RUNS } from './test-support/cas-runs';
import { GENERATED_AS_OF, GENERATED_FULL_LINES, GENERATED_SETTINGS, type GeneratedMonth, generatedMonth, inJobScope } from './test-support/generated-month';
import { measure, perAdded } from './test-support/memory';
import { recordingContext, rolledBack, snapshot, sortedEvents, storedEvents } from './test-support/recorded';
import { TriageWorld } from './test-support/triage-world';
import { wholeTriageInScope } from './test-support/whole-triage';

/**
 * Triage reads its candidates in batches and keeps only what it judges (CAS-41.1, SUITE-CAP-1a D13; docs/adr/0083), and
 * answers as the whole read did. Through the job on the CAS fixtures: executeTriage leaves the same stage events, cases,
 * case lines and anomalies, returns the same summary and records the same audit events (one per row read) as the
 * whole-read triage of 085299bd (test-support/whole-triage.ts), run first on the same rows and rolled back. Through the
 * reader on a generated month (test-support/generated-month.ts, priced under SYNTHETIC release 900007): judgedCandidates
 * returns candidateLines(candidateRows(…))'s candidates in the same order, for the run, for no run (the workbench's
 * waiting patterns) and for another run, with the same audit events, and reads each release's facts once per call
 * however many batches it fetches. And in bounded memory (CAS-41.2): from that month to one twice its size, the heap
 * judgedCandidates holds, while it reads and with its candidates in hand, grows by at most CANDIDATE_HEAP_BYTES per
 * added candidate (test-support/memory.ts measures it).
 */

/** While set, the price job reads every content as loaded: a run priced as it was before the content refusal (audit #7). Counts the release reads triage makes. */
const pricing = vi.hoisted(() => ({ beforeRefusal: false, typedReleaseReads: 0 }));

vi.mock('../price/release', async (importOriginal) => {
  const actual = await importOriginal<typeof ReleaseModule>();
  const loaded = [{ from: null, until: null }];
  return {
    ...actual,
    releaseContentSpans: async (...args: Parameters<typeof actual.releaseContentSpans>) =>
      pricing.beforeRefusal ? { mppr_code: loaded, mppr_general: loaded, ncci_mue: loaded } : actual.releaseContentSpans(...args),
    typedRelease: async (...args: Parameters<typeof actual.typedRelease>) => {
      pricing.typedReleaseReads += 1;
      return actual.typedRelease(...args);
    },
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

/**
 * CAS-41.2's bound on the heap per added candidate (SUITE-CAP-1a section 7). Measured on Node 24 between the months of
 * 10,000 and 20,000 lines (5,228 and 10,436 candidates): judgedCandidates 802 bytes per added candidate (peaks of
 * 18.4 MB and 22.6 MB; the candidates themselves about 680 bytes each, the rest the batch in hand at its peak), the
 * whole read of 085299bd (candidateLines(candidateRows(…)), the same test pointed at it) 5,477 (28.6 MB and 57.2 MB),
 * so this test fails on it. The sizes are the smallest at which the reader's batches are in their steady state: below
 * about 4,000 candidates no second full batch is read, and a 2,000-line month (1,060 candidates) fills none, so between
 * 2,000 and 10,000 lines the batch filling up counts as growth (3,020 bytes per added candidate). Every heap sample is
 * taken after two full collections, at each query as it is sent and answered and every 250 ms, so the peak does not
 * hang on the runner's speed: two runs agreed within 0.1 MB, and sampling every 5 ms instead found peaks within
 * 0.04 MB (807 bytes per added candidate). The margin, about 200 bytes per added candidate (1 MB over the 5,208 added),
 * is 25 times that.
 */
const CANDIDATE_HEAP_BYTES = 1_000;

let w: TriageWorld;

beforeAll(async () => {
  w = await TriageWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

describe('triage through the job reads in batches and leaves what the whole read left (CAS-41.1)', () => {
  for (const run of CAS_RUNS) {
    it(`on ${run.label}, a first triage and a second`, async () => {
      const { practice, runId } = await run.setup(w, `batched ${run.label}`);
      for (const pass of ['first', 'second']) {
        const reference = await rolledBack(w, practice.practiceId, async (scope, requestId) => {
          const outcome = await wholeTriageInScope(scope, practice.practiceId, runId, requestId, CAS_AS_OF);
          return { outcome, state: await snapshot(scope.client, practice.practiceId) };
        });
        const events: Parameters<typeof recordingContext>[2] = [];
        const context = recordingContext(w, practice.practiceId, events);
        const outcome = await executeTriage(context, practice.practiceId, runId, { asOf: CAS_AS_OF });
        expect(reference.result.outcome.outcome, `${pass} triage`).toBe('triaged');
        expect(outcome, `${pass} triage`).toEqual(reference.result.outcome);
        expect(await context.transaction((scope) => snapshot(scope.client, practice.practiceId)), `${pass} triage`).toEqual(reference.result.state);
        // The same reads, each row audited once, as stored.
        expect(sortedEvents(events), `${pass} triage`).toEqual(sortedEvents(reference.events));
        expect(await storedEvents(w, context.jobId)).toEqual(sortedEvents(events));
      }
    }, 180_000);
  }
});

describe('the candidate reader on a generated month (CAS-41.1)', () => {
  let month: GeneratedMonth;

  beforeAll(async () => {
    month = await generatedMonth(w, { label: 'batched generated month', contentLoaded });
  }, 900_000);

  it('returns the whole read’s candidates in the same order, with the same audit events, for the run, no run and another run', async () => {
    const { practiceId } = month.practice;
    for (const runId of [month.runId, null, month.septemberRunId]) {
      const whole = await rolledBack(w, practiceId, async (scope, requestId) => candidateLines(scope.client, await candidateRows(scope, practiceId, runId, requestId)));
      const batched = await rolledBack(w, practiceId, (scope, requestId) => judgedCandidates(scope, practiceId, runId, requestId));
      expect(batched.result.length, String(runId)).toBe(whole.result.length);
      expect(batched.result, String(runId)).toEqual(whole.result);
      expect(sortedEvents(batched.events), String(runId)).toEqual(sortedEvents(whole.events));
      // One event per row read: a candidate is a row.
      expect(batched.events).toHaveLength(whole.result.length);
    }
  }, 300_000);

  it('holds the kinds of line it is built to hold, across more than one batch', async () => {
    const { practiceId } = month.practice;
    const { result: lines } = await rolledBack(w, practiceId, (scope, requestId) => judgedCandidates(scope, practiceId, month.runId, requestId));
    const { lineMaterialityCents } = triageSettings(GENERATED_SETTINGS);
    const judged = lines.map((line) => judgeLine(line, lineMaterialityCents, GENERATED_AS_OF));
    expect(lines.length).toBeGreaterThan(2_000);
    const reasons: readonly NotActionableReason[] = ['DEADLINE_UNVERIFIED', 'NO_WINDOW', 'CONTENT_NOT_LOADED', 'BELOW_LINE_MATERIALITY', 'PER_VISIT_REVIEW'];
    for (const reason of reasons) {
      expect(
        judged.some((item) => item.reasons.includes(reason)),
        reason,
      ).toBe(true);
    }
    expect(lines.some((line) => line.visitVarianceCents !== null)).toBe(true);
    // A verified window, an unverified one (the uncited window) and none at all (the silent contract).
    expect(new Set(lines.map((line) => line.deadlineStatus))).toEqual(new Set(['verified', 'unverified', 'not_applicable']));
  }, 300_000);

  it('reads each release’s facts once per call, however many batches it fetches', async () => {
    const { practiceId } = month.practice;
    for (const runId of [month.runId, null]) {
      pricing.typedReleaseReads = 0;
      const { result } = await rolledBack(w, practiceId, (scope, requestId) => judgedCandidates(scope, practiceId, runId, requestId));
      expect(result.length).toBeGreaterThan(2_000);
      // Every candidate of the month was priced under release 900007, so one read.
      expect(pricing.typedReleaseReads, String(runId)).toBe(1);
    }
  }, 300_000);

  describe('in bounded memory (CAS-41.2)', () => {
    let doubled: GeneratedMonth;

    beforeAll(async () => {
      doubled = await generatedMonth(w, { label: 'batched doubled month', lines: 2 * GENERATED_FULL_LINES, contentLoaded });
    }, 900_000);

    /** The heap judgedCandidates holds at most on a month's run, while it reads and with its candidates in hand, and how many it returns. */
    const measured = async (target: GeneratedMonth) => {
      const { summary, peakBytes } = await measure(
        (watch) => inJobScope(w, target.practice, (scope) => judgedCandidates(watch(scope), target.practice.practiceId, target.runId, randomUUID())),
        (candidates) => candidates.length,
      );
      return { units: summary, bytes: peakBytes };
    };

    it(`holds at most ${String(CANDIDATE_HEAP_BYTES)} bytes of heap per added candidate, from a month of 10,000 lines to one of 20,000`, async () => {
      // Once unmeasured, so the code the read compiles and the pool's connection are not counted as the first month's.
      await measured(month);
      const at10k = await measured(month);
      const at20k = await measured(doubled);
      expect(at20k.units - at10k.units).toBeGreaterThan(5_000);
      const growth = perAdded(at10k, at20k);
      expect(growth, `${String(at10k.units)} candidates ${String(at10k.bytes)} B, ${String(at20k.units)} candidates ${String(at20k.bytes)} B`).toBeLessThanOrEqual(CANDIDATE_HEAP_BYTES);
    }, 600_000);
  });
});
