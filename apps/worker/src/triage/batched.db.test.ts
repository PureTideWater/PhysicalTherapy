import { readDatabaseUrl } from '@tp/db';
import { type NotActionableReason, judgeLine, triageSettings } from '@tp/triage';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as ReleaseModule from '../price/release';
import { candidateLines, candidateRows, executeTriage, judgedCandidates } from './execute';
import { CAS_AS_OF, CAS_RUNS } from './test-support/cas-runs';
import { GENERATED_AS_OF, GENERATED_SETTINGS, type GeneratedMonth, generatedMonth } from './test-support/generated-month';
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
 * however many batches it fetches.
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
});
