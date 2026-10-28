import { SCREENING_MAIL_PAUSED_CODE } from '@tp/worker/runtime';
import { describe, expect, it } from 'vitest';

import { environmentSettings } from '../../infra/lib/environments';
import { HARNESS_RUNS_SCREENING_CONSUMER, MIB, RUNNER_TO_FARGATE, TIME_ALLOWANCE_MS, TIME_METRIC_BELOW_MS, TIME_PROMISE_MS } from './limits';
import {
  ADDRESS_CHECK_CHARGE_MS,
  MEASURED_SCENARIOS,
  SCREENING_MAIL_HELD_CODE,
  type Measurements,
  type ScenarioMeasure,
  ORACLE_UPLOADS,
  REPEATED_SCENARIO,
  REPETITIONS,
  REPORT_FORMAT,
  SIZING_QUESTION_MS,
  TIME_MODES,
  type TimeMode,
  type TimeRule,
  type UploadMeasure,
  addressCheckSpan,
  jobResult,
  limitProblems,
  mailHeldLines,
  markdown,
  oracleKind,
  repeatedScenario,
  repeatedSummary,
  report,
  sizingQuestion,
  timeLabel,
  timeMetricProblems,
  timeRule,
  timeVerdict,
  uploadStart,
  verdict,
  workflowRun,
  worstTime,
} from './report';
import {
  ADVISORY,
  ENFORCED,
  OPEN,
  type S4Times,
  SYNTHETIC_RUN,
  applied,
  eightCpus,
  expected,
  measured,
  onOwnCpus,
  scenario,
  scenarios,
  upload,
  withS1,
  withScenario,
  withUpload,
  withoutConsumer,
} from './test-support/measurements';

/**
 * The capacity test's verdict (audit #53 part 1; the founder's rulings of 2026-10-20, decisions 13 to 16, and of
 * 2026-10-21, Q1 (a) and Q7): environments.ts declares the screening consumer (PR 6b-3) and the harness runs it, so time
 * is enforced, at 48 s on the runner until the runner-to-Fargate factor is measured and at 60 s scaled by it after;
 * settings with no consumer still read as "open, PR 6b". Everything the build controls fails the run: the consumer's
 * size, slots, the platform pricing none, the waiting tier, the time metric's bounds and the static origin among them.
 * A worst time above 44 s is a sizing question for the founder, never a pass to rely on. S4 runs three times and its
 * time is judged on the middle run, every other check in all three (the founder's ruling of 2026-10-23). A binding run
 * (a release's) fails on time; an advisory run (every other) reports each time verdict as a warning and fails on every
 * other check (the founder's third ruling of 2026-10-23, "Free: time advisory"). The report carries no link or token.
 */

describe('the time verdict', () => {
  it('is enforced by production’s own settings, which declare the consumer, and open for settings that declare none', () => {
    // PR 6b-3: compute.screening is declared and the harness runs it, so time is enforced; the switch works both ways.
    expect(HARNESS_RUNS_SCREENING_CONSUMER).toBe(true);
    expect(timeRule(environmentSettings('production'), RUNNER_TO_FARGATE, 'binding')).toEqual(ENFORCED);
    expect(timeRule(environmentSettings('production'), RUNNER_TO_FARGATE, 'advisory')).toEqual(ADVISORY);
    expect(timeRule(withoutConsumer(), RUNNER_TO_FARGATE, 'binding')).toEqual({ consumerDeclared: false, consumerRun: true, runnerToFargate: null, mode: 'binding' });
    expect(timeVerdict(120_000, timeRule(withoutConsumer(), RUNNER_TO_FARGATE, 'binding'))).toEqual({ status: 'open' });
    expect(RUNNER_TO_FARGATE).toBeNull();
  });

  it('fails a run with the consumer declared while the harness does not run it as production will', () => {
    // The capacity review of PR #31: declaring compute.screening must not switch time on over the wrong topology.
    const rule = timeRule(environmentSettings('production'), RUNNER_TO_FARGATE, 'binding', false);
    expect(rule).toEqual({ consumerDeclared: true, consumerRun: false, runnerToFargate: null, mode: 'binding' });
    expect(verdict(measured(), rule)).toEqual({
      pass: false,
      time: 'enforced',
      reasons: ['consumer not run: environments.ts declares the screening consumer, and the harness still prices screenings in the platform container one at a time'],
      timeWarnings: [],
    });
    // Advisory too: the time mode decides only whether time fails the run.
    expect(verdict(measured(), { ...rule, mode: 'advisory' }).pass).toBe(false);
    expect(verdict(measured({ consumer: null }), ENFORCED).reasons).toContain('consumer not measured: environments.ts declares the screening consumer, and the report names none');
  });

  it('reports 120 s as "open, PR 6b" where no consumer is declared, and fails it where one is', () => {
    expect(timeVerdict(120_000, OPEN)).toEqual({ status: 'open' });
    expect(timeLabel(timeVerdict(120_000, OPEN))).toBe('open, PR 6b');
    const slow = measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 120_000 })])) });
    expect(verdict(slow, OPEN)).toEqual({ pass: true, time: 'open, PR 6b', reasons: [], timeWarnings: [] });
    expect(verdict(slow, ENFORCED)).toEqual({ pass: false, time: 'enforced', reasons: ['time: S1-1 120.0 s, fail (promise broken: above 60 s)'], timeWarnings: [] });
  });

  it('with the consumer declared: 47.9 s passes, 48.1 s fails as the allowance, 60.1 s fails as the promise', () => {
    expect([TIME_ALLOWANCE_MS, TIME_PROMISE_MS]).toEqual([48_000, 60_000]);
    expect(timeVerdict(47_900, ENFORCED)).toEqual({ status: 'pass' });
    expect(timeVerdict(48_100, ENFORCED)).toEqual({ status: 'fail', reason: 'allowance' });
    expect(timeVerdict(60_100, ENFORCED)).toEqual({ status: 'fail', reason: 'promise' });
    const at = (ms: number) => verdict(measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + ms })])) }), ENFORCED);
    expect(at(47_900)).toEqual({ pass: true, time: 'enforced', reasons: [], timeWarnings: [] });
    expect(at(48_100).reasons).toEqual(['time: S1-1 48.1 s, fail (allowance: above 48 s on the runner)']);
    expect(at(60_100).reasons).toEqual(['time: S1-1 60.1 s, fail (promise broken: above 60 s)']);
  });

  it('judges every upload, the small ones behind the large included', () => {
    // S4's small upload, in its middle run (S4#2 when the three runs tie), is judged like the large ones.
    const s4 = scenarios([
      { large: [30_000, 30_000, 30_000], small: 48_100 },
      { large: [30_000, 30_000, 30_000], small: 48_100 },
      { large: [30_000, 30_000, 30_000], small: 48_100 },
    ]);
    expect(verdict(measured({ scenarios: s4 }), ENFORCED).reasons).toEqual(["time: S4#2 S4-4 48.1 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner)"]);
  });

  it('once the runner-to-Fargate factor is measured, fails above 60 s scaled by it', () => {
    const scaled: TimeRule = { consumerDeclared: true, consumerRun: true, runnerToFargate: 1.5, mode: 'binding' };
    expect(timeVerdict(40_000, scaled)).toEqual({ status: 'pass' });
    expect(timeVerdict(40_100, scaled)).toEqual({ status: 'fail', reason: 'promise' });
  });
});

describe('a worst time above 44 s', () => {
  it('passes the verdict and is reported as a sizing question for the founder, never as a wider limit (O9)', () => {
    expect(SIZING_QUESTION_MS).toBe(44_000);
    const near = measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 45_200 })])) });
    const full = report(near, ENFORCED);
    expect(full.verdict.pass).toBe(true);
    expect(full.sizing).toEqual({ worstUpload: 'S1-1', worstMs: 45_200, question: true });
    expect(markdown(full, ENFORCED)).toContain('Sizing question for the founder (open item O9): the worst time, S1-1’s 45.2 s, is above 44 s');
    expect(report(measured(), ENFORCED).sizing).toEqual({ worstUpload: 'S1-1', worstMs: 30_000, question: false });
    expect(worstTime({ scenarios: [] })).toBeNull();
  });
});

/** S4's runs on CI, the same code: 19aa09c's (job 120180616884) and 54ec890's (job 120209964043), with runs between and above. */
const FAST: S4Times = { large: [38_300, 37_600, 35_300], small: 26_000 };
const SLOW: S4Times = { large: [51_400, 51_400, 45_200], small: 32_300 };
const BETWEEN: S4Times = { large: [42_000, 41_500, 40_100], small: 29_000 };
const NEAR: S4Times = { large: [45_200, 44_100, 43_000], small: 30_000 };
const OVER: S4Times = { large: [48_100, 47_000, 46_500], small: 31_000 };

describe('S4 three times, its time judged on the middle run (the founder’s ruling of 2026-10-23)', () => {
  it('measures S4 three times in every run, as S4#1 to S4#3 with uploads S4-1 to S4-4 in each', () => {
    expect([REPEATED_SCENARIO, REPETITIONS]).toEqual(['S4', 3]);
    expect(MEASURED_SCENARIOS).toEqual(['S1', 'S2', 'S3', 'S4#1', 'S4#2', 'S4#3', 'S5']);
    expect(verdict(measured(), ENFORCED)).toEqual({ pass: true, time: 'enforced', reasons: [], timeWarnings: [] });
  });

  it('passes when only the slowest run is above 48 s: the middle run is judged, not the slowest', () => {
    const runs = scenarios([FAST, SLOW, BETWEEN]);
    expect(verdict(measured({ scenarios: runs }), ENFORCED)).toEqual({ pass: true, time: 'enforced', reasons: [], timeWarnings: [] });
    const repeated = repeatedScenario(runs);
    expect(repeated).toEqual({
      scenario: 'S4',
      middle: 'S4#3',
      runs: [
        { id: 'S4#1', worstUpload: 'S4-1', worstMs: 38_300, uploads: [{ id: 'S4-1', ms: 38_300 }, { id: 'S4-2', ms: 37_600 }, { id: 'S4-3', ms: 35_300 }, { id: 'S4-4', ms: 26_000 }] },
        { id: 'S4#2', worstUpload: 'S4-1', worstMs: 51_400, uploads: [{ id: 'S4-1', ms: 51_400 }, { id: 'S4-2', ms: 51_400 }, { id: 'S4-3', ms: 45_200 }, { id: 'S4-4', ms: 32_300 }] },
        { id: 'S4#3', worstUpload: 'S4-1', worstMs: 42_000, uploads: [{ id: 'S4-1', ms: 42_000 }, { id: 'S4-2', ms: 41_500 }, { id: 'S4-3', ms: 40_100 }, { id: 'S4-4', ms: 29_000 }] },
      ],
    });
    const full = report(measured({ scenarios: runs }), ENFORCED);
    expect(full.repeated).toEqual(repeated);
    // The sizing question reads the middle run's worst time too: S4#2's 51.4 s raises nothing.
    expect(full.sizing).toEqual({ worstUpload: 'S4#3 S4-1', worstMs: 42_000, question: false });
  });

  it('fails when the middle run is above 48 s, naming the middle run’s uploads and no other run’s', () => {
    const runs = scenarios([SLOW, OVER, FAST]);
    expect(repeatedScenario(runs).middle).toBe('S4#2');
    expect(verdict(measured({ scenarios: runs }), ENFORCED)).toEqual({
      pass: false,
      time: 'enforced',
      reasons: ["time: S4#2 S4-1 48.1 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner)"],
      timeWarnings: [],
    });
  });

  it('raises the sizing question when the middle run is between 44 and 48 s, and passes', () => {
    const full = report(measured({ scenarios: scenarios([FAST, SLOW, NEAR]) }), ENFORCED);
    expect(full.verdict).toEqual({ pass: true, time: 'enforced', reasons: [], timeWarnings: [] });
    expect(full.repeated.middle).toBe('S4#3');
    expect(full.sizing).toEqual({ worstUpload: 'S4#3 S4-1', worstMs: 45_200, question: true });
    expect(sizingQuestion(full.sizing, full.repeated.middle)).toBe("the worst time, S4#3 S4-1's 45.2 s (the middle of S4's three runs), is above 44 s: the consumer's size goes to the founder before merge");
    expect(markdown(full, ENFORCED)).toContain('Sizing question for the founder (open item O9): the worst time, S4#3 S4-1’s 45.2 s (the middle of S4’s three runs), is above 44 s');
  });

  it('orders the runs by their worst upload, the small one included, and judges all four of the middle run’s uploads', () => {
    const runs = scenarios([{ large: [35_000, 35_000, 35_000], small: 50_000 }, SLOW, { large: [40_000, 40_000, 40_000], small: 48_100 }]);
    // S4#3's worst is its small upload's 48.1 s, S4#1's its small upload's 50.0 s, S4#2's 51.4 s: S4#1 is the middle.
    expect(repeatedScenario(runs).middle).toBe('S4#1');
    expect(repeatedScenario(runs).runs.map((run) => [run.id, run.worstUpload, run.worstMs])).toEqual([
      ['S4#1', 'S4-4', 50_000],
      ['S4#2', 'S4-1', 51_400],
      ['S4#3', 'S4-4', 48_100],
    ]);
    expect(verdict(measured({ scenarios: runs }), ENFORCED).reasons).toEqual(["time: S4#1 S4-4 50.0 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner)"]);
  });

  it('fails two of three runs with an upload above 48 s even when the slow uploads are the small ones (the verification of PR 6b-3’s capacity changes)', () => {
    // The verifier's probe: ordered by the worst large upload, S4#2 was the middle and the run passed.
    const runs = scenarios([
      { large: [30_000, 30_000, 30_000], small: 50_000 },
      { large: [35_000, 35_000, 35_000], small: 30_000 },
      { large: [40_000, 40_000, 40_000], small: 50_000 },
    ]);
    expect(repeatedScenario(runs).middle).toBe('S4#1');
    const result = verdict(measured({ scenarios: runs }), ENFORCED);
    expect(result.pass).toBe(false);
    expect(result.reasons).toEqual(["time: S4#1 S4-4 50.0 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner)"]);
    // Advisory, the same verdict warns.
    expect(verdict(measured({ scenarios: runs }), ADVISORY).timeWarnings).toEqual(result.reasons);
  });

  it('judges on time every scenario that is not one of S4’s three runs, whatever repetition it carries (the verification of PR 6b-3’s capacity changes)', () => {
    const slowS1 = (change: Partial<ScenarioMeasure>) => withScenario('S1', (item) => ({ ...item, ...change, uploads: [upload({ emailedMs: 1_000 + 60_100 })] }));
    // S1 recorded as a first run: before, only a repetition of null was judged outside S4's middle run.
    expect(verdict(measured({ scenarios: slowS1({ repetition: 1 }) }), ENFORCED).reasons).toEqual(['time: S1 S1-1 60.1 s, fail (promise broken: above 60 s)']);
    // S1 recorded as S4's first run, and S4#1 as a scenario run once: neither is one of S4's three runs, so both are
    // judged and no middle run is taken from the two left.
    const relabelled = withScenario('S4#1', (item) => ({ ...item, repetition: null }), slowS1({ scenario: 'S4', repetition: 1 }));
    expect(repeatedScenario(relabelled).runs.map((run) => run.id)).toEqual(['S4#2', 'S4#3']);
    expect(repeatedScenario(relabelled).middle).toBeNull();
    expect(verdict(measured({ scenarios: relabelled }), ENFORCED).reasons).toContain('time: S1 S1-1 60.1 s, fail (promise broken: above 60 s)');
    expect(worstTime({ scenarios: slowS1({ repetition: 2 }) })).toEqual({ id: 'S1 S1-1', ms: 60_100 });
  });

  it('counts a run with a large upload never emailed as the slowest, and fails the run for it', () => {
    const runs = withUpload('S4-2', { emailedMs: null, resultStatus: null, lastPageStatus: null, runStatus: 'pricing', pendingRows: 10_000 }, 'S4#1', scenarios([FAST, SLOW, BETWEEN]));
    const repeated = repeatedScenario(runs);
    expect(repeated.runs[0]).toEqual({ id: 'S4#1', worstUpload: 'S4-2', worstMs: null, uploads: [{ id: 'S4-1', ms: 38_300 }, { id: 'S4-2', ms: null }, { id: 'S4-3', ms: 35_300 }, { id: 'S4-4', ms: 26_000 }] });
    expect(repeated.middle).toBe('S4#2');
    const result = verdict(measured({ scenarios: runs }), ENFORCED);
    expect(result.pass).toBe(false);
    expect(result.reasons).toContain("not emailed when the scenario's cap ended: S4#1 S4-2");
    expect(result.reasons).toContain("time: S4#2 S4-1 51.4 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner)");
  });

  it('fails on any other check in any of the three runs, whatever the times: the middle run excuses none', () => {
    // A run that passes as a whole: only its slowest S4 run is above 48 s.
    const fast = scenarios([FAST, SLOW, BETWEEN]);
    const container = (name: string, change: object) => (item: ScenarioMeasure): ScenarioMeasure => ({ ...item, containers: item.containers.map((entry) => (entry.name === name ? { ...entry, ...change } : entry)) });
    const cases: readonly [string, readonly ScenarioMeasure[], string, Partial<Measurements>?][] = [
      ['an oracle difference', fast, 'oracle mismatch: S1-1', { oracle: measured().oracle.map((item) => (item.upload === 'S1-1' ? { ...item, oracleSha256: 'e'.repeat(64) } : item)) }],
      ['a stalled run in the fastest run', withUpload('S4-2', { stalled: true }, 'S4#1', fast), 'stalled: S4#1 S4-2 recorded no batch for five minutes'],
      ['rows left pending in the slowest run', withUpload('S4-1', { pendingRows: 12 }, 'S4#2', fast), 'rows still pending: S4#2 S4-1 (12)'],
      ['an ENGINE_ERROR row in the middle run', withUpload('S4-3', { engineErrorRows: 3 }, 'S4#3', fast), 'ENGINE_ERROR rows: S4#3 S4-3 (3)'],
      ['a wrong row count', withUpload('S4-1', { storedRows: 49_999 }, 'S4#1', fast), 'row count: S4#1 S4-1 stored 49999 of 50000'],
      ['a result link that does not open', withUpload('S4-3', { resultStatus: 500, lastPageStatus: null }, 'S4#2', fast), 'result link did not open: S4#2 S4-3 (HTTP 500)'],
      ['the slots not used in the fastest run', withUpload('S4-3', { jobStartedMs: 45_000 }, 'S4#1', fast), "slots not used: S4#1's first 3 large uploads were not priced at once (3 declared; S4-3 waited)"],
      [
        'a time metric out of bounds in the slowest run',
        withUpload('S4-1', { logged: { elapsedMs: 52_000, atMs: 52_410, tier: 'normal' } }, 'S4#2', fast),
        "time metric out of bounds: S4#2 S4-1 logged 52.000 s against the harness's 51.400 s (at most 51.410 s, at least 49.400 s)",
      ],
      ['an upload in the waiting tier', withUpload('S4-1', { waitReason: 'daily_cap', queuePriority: -1 }, 'S4#1', fast), 'waiting tier: S4#1 S4-1 (daily_cap, priority -1)'],
      ['the platform pricing a screening', withScenario('S4#1', (item) => ({ ...item, platformPricedRuns: 1 }), fast), 'platform priced a screening: S4#1 (1 run)'],
      ['the consumer killed for memory', withScenario('S4#2', container('screening-1', { oomKilled: true }), fast), 'OOM kill: S4#2 screening-1'],
      ['the web restarting', withScenario('S4#3', container('web', { restarts: 1 }), fast), 'restart or exit: S4#3 web'],
      ['Postgres restarting', withScenario('S4#1', (item) => ({ ...item, postgres: { oomKills: 0, restarts: 1, running: true } }), fast), 'restart or exit: S4#1 postgres'],
      ['a cold start not applied', withScenario('S4#2', (item) => ({ ...item, coldStart: { restarted: true, cacheDropped: false } }), fast), 'cold start not applied: S4#2 (Postgres restarted: yes, page cache dropped: no)'],
    ];
    for (const [what, runs, reason, overrides] of cases) {
      // Binding and advisory alike: the time mode excuses no other check (the founder's ruling of 2026-10-23, time advisory).
      for (const rule of [ENFORCED, ADVISORY]) {
        const result = verdict(measured({ scenarios: runs, ...overrides }), rule);
        expect(result.pass, what).toBe(false);
        expect(result.reasons, what).toContain(reason);
        expect(result.reasons.filter((line) => line.startsWith('time:')), what).toEqual([]);
      }
    }
  });

  it('judges every run on time when fewer than three were measured, a partial run that fails anyway', () => {
    const two = scenarios([SLOW, FAST, FAST]).filter((item) => item.id !== 'S4#3');
    expect(repeatedScenario(two).middle).toBeNull();
    const result = verdict(measured({ scenarios: two }), ENFORCED);
    expect(result.reasons).toContain('time: S4#1 S4-1 51.4 s, fail (allowance: above 48 s on the runner)');
    expect(result.reasons).toContain('partial run: measured S1, S2, S3, S4#1, S4#2, S5; a verdict needs S1, S2, S3, S4#1, S4#2, S4#3, S5');
    // The sizing question reads every run then, and names no middle run.
    const full = report(measured({ scenarios: two }), ENFORCED);
    expect(full.sizing).toEqual({ worstUpload: 'S4#1 S4-1', worstMs: 51_400, question: true });
    expect(sizingQuestion(full.sizing, full.repeated.middle)).toBe("the worst time, S4#1 S4-1's 51.4 s, is above 44 s: the consumer's size goes to the founder before merge");
  });

  it('says which run was the middle one, with every run’s times, in the summary and the harness’s log line', () => {
    const runs = scenarios([FAST, SLOW, BETWEEN]);
    const line = repeatedSummary(repeatedScenario(runs));
    expect(line).toBe(
      "S4 ran three times (the founder's ruling of 2026-10-23): S4#1 38.3, 37.6, 35.3 and 26.0 s; S4#2 51.4, 51.4, 45.2 and 32.3 s; S4#3 42.0, 41.5, 40.1 and 29.0 s. Ordered by each run's worst upload, the small one included, the middle run is S4#3 (42.0 s): its four uploads are judged against the 48-s line and the 44-s question, and every other check holds in all three runs.",
    );
    expect(repeatedSummary(repeatedScenario(runs.filter((item) => item.id !== 'S4#3')))).toBe(
      "S4 ran 2 of three times (the founder's ruling of 2026-10-23): S4#1 38.3, 37.6, 35.3 and 26.0 s; S4#2 51.4, 51.4, 45.2 and 32.3 s. With fewer than three runs no middle run is taken: every run's uploads are judged on time.",
    );
    const summary = markdown(report(measured({ scenarios: runs }), ENFORCED), ENFORCED);
    expect(summary).toContain(line);
    expect(summary).toContain('| S4#3 S4-1 | worst | 50000 | 42.0 | 41.8 | normal | 0.9 | 4.0 (150000) | 20.0 | 3.0 | 0.2 | 1.1, 1.2 | pass |');
    expect(summary).toContain('| S4#2 S4-1 | worst | 50000 | 51.4 | 51.2 | normal | 0.9 | 4.0 (150000) | 20.0 | 3.0 | 0.2 | 1.1, 1.2 | not judged (S4#3 is the middle run) |');
    expect(summary).toContain('| S4#2 | screening-1 | 1150.0 | 4096 | 1300.0 | 0 | 0 | — |');
  });
});

describe('the time mode (the founder’s third ruling of 2026-10-23, “Free: time advisory”)', () => {
  const ADVISORY_LINE =
    "Time mode: advisory. The time verdicts are warnings on this run and do not fail it (a pull request's, the build branch's or the weekly run; the founder's ruling of 2026-10-23, time advisory). A release's capacity run is binding, and production's screening opens only on its pass (decision 13).";
  const BINDING_LINE = "Time mode: binding. Time fails this run as every other check does (a release's capacity run, whose pass alone opens production's screening: decision 13).";
  const SLOW_S1 = 'time: S1-1 48.1 s, fail (allowance: above 48 s on the runner)';
  const SIZING_S1 = "the worst time, S1-1's 48.1 s, is above 44 s: the consumer's size goes to the founder before merge";
  const slow = () => measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 48_100 })])) });

  it('is advisory or binding, set by the workflow and recorded in the report', () => {
    expect(TIME_MODES).toEqual(['advisory', 'binding']);
    expect(report(measured(), ADVISORY).timeMode).toBe('advisory');
    expect(report(measured(), ENFORCED).timeMode).toBe('binding');
  });

  it('passes an advisory run failing only on time, each time verdict a warning the job annotates and hands to the gate', () => {
    const full = report(slow(), ADVISORY);
    expect(full.verdict).toEqual({ pass: true, time: 'advisory', reasons: [], timeWarnings: [SLOW_S1] });
    expect(jobResult(full)).toEqual({
      exitCode: 0,
      annotations: [`::warning title=Time (advisory)::${SLOW_S1}`, `::warning title=Sizing question (O9)::${SIZING_S1}`],
      outputs: { 'time-warnings': SLOW_S1, sizing: SIZING_S1 },
    });
    const summary = markdown(full, ADVISORY);
    expect(summary).toContain('## Screening capacity: pass (time advisory)');
    expect(summary).toContain(ADVISORY_LINE);
    expect(summary).toContain('| S1-1 | worst | 50000 | 48.1 | 47.9 | normal | 0.9 | 4.0 (150000) | 20.0 | 3.0 | 0.2 | 1.1, 1.2 | fail (allowance: above 48 s on the runner) |');
    expect(summary).toContain(`Every check the build controls passed but time, which is advisory on this run.\n\nTime warnings (advisory: they do not fail this run; a binding run fails on each):\n- ${SLOW_S1}\n`);
  });

  it('judges S4 on its middle run in both modes, and warns on the middle run alone in an advisory one', () => {
    expect(verdict(measured({ scenarios: scenarios([SLOW, OVER, FAST]) }), ADVISORY)).toEqual({
      pass: true,
      time: 'advisory',
      reasons: [],
      timeWarnings: ["time: S4#2 S4-1 48.1 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner)"],
    });
    // Only the slowest run above 48 s: no warning, as no failure in a binding run.
    expect(verdict(measured({ scenarios: scenarios([FAST, SLOW, BETWEEN]) }), ADVISORY)).toEqual({ pass: true, time: 'advisory', reasons: [], timeWarnings: [] });
    // The 44-s question reads the middle run in both modes, and is a warning in both.
    const near = report(measured({ scenarios: scenarios([FAST, SLOW, NEAR]) }), ADVISORY);
    expect(near.sizing).toEqual({ worstUpload: 'S4#3 S4-1', worstMs: 45_200, question: true });
    expect(jobResult(near).annotations).toEqual(["::warning title=Sizing question (O9)::the worst time, S4#3 S4-1's 45.2 s (the middle of S4's three runs), is above 44 s: the consumer's size goes to the founder before merge"]);
  });

  it('fails an advisory run on any check but time, the time warnings kept beside the failure', () => {
    const both = measured({ scenarios: withUpload('S1-1', { emailedMs: 1_000 + 48_100, pendingRows: 3 }) });
    const full = report(both, ADVISORY);
    expect(full.verdict).toEqual({ pass: false, time: 'advisory', reasons: ['rows still pending: S1-1 (3)'], timeWarnings: [SLOW_S1] });
    expect(jobResult(full).exitCode).toBe(1);
    expect(markdown(full, ADVISORY)).toContain('Failing checks:\n- rows still pending: S1-1 (3)\n\nTime warnings (advisory: they do not fail this run; a binding run fails on each):\n- ');
    // The time metric's 2-s bound is a correctness check, never a time warning.
    const metric = verdict(measured({ scenarios: withUpload('S1-1', { logged: { elapsedMs: 30_011, atMs: 31_010, tier: 'normal' } }) }), ADVISORY);
    expect([metric.pass, metric.timeWarnings]).toEqual([false, []]);
  });

  it('fails a binding run on time, as every run did before the ruling, with no time warning', () => {
    const full = report(slow(), ENFORCED);
    expect(full.verdict).toEqual({ pass: false, time: 'enforced', reasons: [SLOW_S1], timeWarnings: [] });
    expect(jobResult(full)).toEqual({ exitCode: 1, annotations: [`::warning title=Sizing question (O9)::${SIZING_S1}`], outputs: { sizing: SIZING_S1 } });
    const summary = markdown(full, ENFORCED);
    expect(summary).toContain('## Screening capacity: fail (time enforced)');
    expect(summary).toContain(BINDING_LINE);
    expect(summary).not.toContain('Time warnings');
  });

  it('reads any mode but advisory as binding, so a run that names none is never excused its time', () => {
    const unnamed = verdict(slow(), { ...ENFORCED, mode: undefined as unknown as TimeMode });
    expect(unnamed).toEqual({ pass: false, time: 'enforced', reasons: [SLOW_S1], timeWarnings: [] });
  });

  it('gives a run with nothing to warn of no annotation and no output', () => {
    expect(jobResult(report(measured(), ADVISORY))).toEqual({ exitCode: 0, annotations: [], outputs: {} });
    expect(jobResult(report(measured(), ENFORCED))).toEqual({ exitCode: 0, annotations: [], outputs: {} });
    expect(markdown(report(measured(), ADVISORY), ADVISORY)).toContain('Every check the build controls passed.\n');
  });
});

describe('when an upload’s time starts', () => {
  it('starts at the harness’s click, never after the web’s receipt, and is not captured when no POST was sent', () => {
    expect(uploadStart(1_000, true)).toBe(1_000);
    expect(uploadStart(1_000, false)).toBeNull();
    expect(uploadStart(null, true)).toBeNull();
  });

  it('keeps the logged time within its ceiling when the web receives the POST before Playwright reports it (S1-1, 81 ms)', () => {
    // The local smoke run of 2026-10-22: the click at 0, the web's receipt (the proxy's stamp) at 120 ms, Playwright's
    // request event at 201 ms, the consumer's line at 35,748 ms with 35,628 ms logged from the receipt.
    const line = { elapsedMs: 35_628, atMs: 35_748, tier: 'normal' as const };
    const fromClick = upload({ id: 'S1-1', submittedMs: uploadStart(0, true), emailedMs: 35_749, logged: line });
    expect(timeMetricProblems(fromClick, 35_749)).toEqual([]);
    // Timed from the request event instead, as the harness was, the ceiling is 81 ms short of what the web logged.
    const fromEvent = upload({ id: 'S1-1', submittedMs: 201, emailedMs: 35_749, logged: line });
    expect(timeMetricProblems(fromEvent, 35_548)).toEqual(['time metric out of bounds: S1-1 logged 35.628 s against the harness\'s 35.548 s (at most 35.547 s, at least 33.548 s)']);
  });
});

describe('the checks the build controls fail the run', () => {
  it('pass when everything holds, with time enforced', () => {
    expect(verdict(measured(), ENFORCED)).toEqual({ pass: true, time: 'enforced', reasons: [], timeWarnings: [] });
    expect(verdict(measured(), OPEN)).toEqual({ pass: true, time: 'open, PR 6b', reasons: [], timeWarnings: [] });
    expect(limitProblems(applied(), expected)).toEqual([]);
  });

  const failing: readonly [string, Measurements, RegExp][] = [
    ['an OOM kill', measured({ scenarios: withS1(scenario({ containers: [{ ...scenario().containers[1]!, oomKilled: true }] })) }), /^OOM kill: S1 platform$/],
    ['an oom_kill event', measured({ scenarios: withS1(scenario({ containers: [{ ...scenario().containers[1]!, events: { max: 3, oomKill: 1 } }] })) }), /^OOM kill: S1 platform$/],
    ['a restart', measured({ scenarios: withS1(scenario({ containers: [{ ...scenario().containers[0]!, restarts: 1 }] })) }), /^restart or exit: S1 web$/],
    ['an exit the harness did not cause', measured({ scenarios: withS1(scenario({ containers: [{ ...scenario().containers[1]!, exitedUnexpectedly: true }] })) }), /^restart or exit: S1 platform$/],
    ['a 91% anonymous memory sample', measured({ scenarios: withS1(scenario({ containers: [{ ...scenario().containers[1]!, anonPeakBytes: Math.ceil(512 * MIB * 0.91) }] })) }), /^memory above 90% of the limit: S1 platform/],
    ['the consumer above 90% of its 4 GiB', measured({ scenarios: withS1(scenario({ containers: [{ ...scenario().containers[2]!, anonPeakBytes: Math.ceil(4096 * MIB * 0.91) }] })) }), /^memory above 90% of the limit: S1 screening-1 \(3727\.4 MiB of 4096 MiB\)$/],
    ['the consumer killed for memory', measured({ scenarios: withS1(scenario({ containers: [{ ...scenario().containers[2]!, events: { max: 1, oomKill: 1 } }] })) }), /^OOM kill: S1 screening-1$/],
    ['the consumer exiting', measured({ scenarios: withS1(scenario({ containers: [{ ...scenario().containers[2]!, exitedUnexpectedly: true }] })) }), /^restart or exit: S1 screening-1$/],
    [
      'the consumer measured at a size other than the one declared',
      measured({ applied: applied({ containers: applied().containers.map((item) => (item.name === 'screening-1' ? { ...item, nanoCpus: 1e9, memoryBytes: 2048 * MIB, memorySwapBytes: 2048 * MIB } : item)) }) }),
      /^limit not applied: screening-1: CPU quota 1000000000, not 2000000000$/,
    ],
    ['the consumer on the wrong CPUs', measured({ applied: applied({ containers: applied().containers.map((item) => (item.name === 'screening-1' ? { ...item, cpuset: '3' } : item)) }) }), /^limit not applied: screening-1: cpuset 3, not 2-3$/],
    ['the consumer not started', measured({ applied: applied({ containers: applied().containers.filter((item) => item.name !== 'screening-1') }) }), /^limit not applied: screening-1: no limits read$/],
    // Each service where the runner's layout puts it: the free runner's shared layout here, CPUs of their own on eight.
    ['the web off the consumer’s last CPU', measured({ applied: applied({ containers: applied().containers.map((item) => (item.name === 'web' ? { ...item, cpuset: '2' } : item)) }) }), /^limit not applied: web: cpuset 2, not 3$/],
    ['the platform on Postgres’s CPUs', measured({ applied: applied({ containers: applied().containers.map((item) => (item.name === 'platform' ? { ...item, cpuset: '0-1' } : item)) }) }), /^limit not applied: platform: cpuset 0-1, not 3$/],
    ['the harness not pinned to Postgres’s CPUs', measured({ harnessAffinity: '0-3' }), /^limit not applied: harness: CPU affinity 0-3, not 0-1$/],
    ['the harness’s affinity not read', measured({ harnessAffinity: null }), /^limit not applied: harness: CPU affinity null, not 0-1$/],
    ['the harness not on its own CPUs on an 8-CPU runner', onOwnCpus({ harnessAffinity: '0-1' }), /^limit not applied: harness: CPU affinity 0-1, not 6-7$/],
    ['the web on the consumer’s CPU on an 8-CPU runner', onOwnCpus({ applied: { ...onOwnCpus().applied, containers: onOwnCpus().applied.containers.map((item) => (item.name === 'web' ? { ...item, cpuset: '3' } : item)) } }), /^limit not applied: web: cpuset 3, not 4$/],
    [
      'a layout other than the one the harness gives the runner (CPUs of their own recorded on the free runner)',
      measured({ expected: { ...expected, layout: onOwnCpus().expected.layout } }),
      /^layout: measured on CPUs of their own: Postgres on CPUs 0-1, the screening consumer on 2-3, the web on 4, the platform on 5 and the harness with Chromium on 6-7, and the layout the harness gives a runner of 4 CPUs is shared CPUs: /,
    ],

    [
      'a process whose affinity collapsed to the overlap with the harness’s CPUs (cgroup v1)',
      measured({ applied: applied({ containers: applied().containers.map((item) => (item.name === 'screening-1' ? { ...item, affinity: '2' } : item)) }) }),
      /^limit not applied: screening-1: CPU affinity 2, not 2-3$/,
    ],
    ['a container the run does not declare', measured({ applied: applied({ containers: [...applied().containers, { ...applied().containers[2]!, name: 'screening-2' }] }) }), /^limit not applied: screening-2: a container the run does not declare$/],
    ['the platform pricing a screening', measured({ scenarios: withS1(scenario({ platformPricedRuns: 1 })) }), /^platform priced a screening: S1 \(1 run\)$/],
    ['an upload in the account-share tier', measured({ scenarios: withUpload('S4-3', { waitReason: 'account_share', queuePriority: -1 }, 'S4#1') }), /^waiting tier: S4#1 S4-3 \(account_share, priority -1\)$/],
    ['an upload in the daily-cap tier', measured({ scenarios: withUpload('S5-1', { waitReason: 'daily_cap', queuePriority: -1 }) }), /^waiting tier: S5-1 \(daily_cap, priority -1\)$/],
    ['an upload the consumer logged as waiting', measured({ scenarios: withUpload('S2-1', { logged: { elapsedMs: 29_800, atMs: 31_010, tier: 'waiting' } }) }), /^waiting tier: S2-1 \(logged as waiting, priority 0\)$/],
    ['no time-to-email line for an emailed upload', measured({ scenarios: withUpload('S2-1', { logged: null }) }), /^time metric not logged: S2-1$/],
    [
      'a logged time above the time from the harness’s click to its line',
      measured({ scenarios: withUpload('S1-1', { logged: { elapsedMs: 30_011, atMs: 31_010, tier: 'normal' } }) }),
      /^time metric out of bounds: S1-1 logged 30\.011 s against the harness's 30\.000 s \(at most 30\.010 s, at least 28\.000 s\)$/,
    ],
    [
      'a logged time more than 2 s below the harness’s (the web’s share left out)',
      measured({ scenarios: withUpload('S1-1', { logged: { elapsedMs: 30_000 - TIME_METRIC_BELOW_MS - 1, atMs: 31_010, tier: 'normal' } }) }),
      /^time metric out of bounds: S1-1 logged 27\.999 s/,
    ],
    [
      'the consumer’s three slots not priced at once',
      measured({ scenarios: withUpload('S4-3', { jobStartedMs: 31_500 }, 'S4#3') }),
      /^slots not used: S4#3's first 3 large uploads were not priced at once \(3 declared; S4-3 waited\)$/,
    ],
    ['a request that left for the static origin', measured({ staticAssetOrigin: 'https://static.capacity.invalid', scenarios: withS1(scenario({ staticOrigin: { routed: 12, left: 1 } })) }), /^request left for the static origin: S1 \(1\)$/],
    ['a CPU quota not applied', measured({ applied: applied({ containers: applied().containers.map((item) => (item.name === 'platform' ? { ...item, nanoCpus: null } : item)) }) }), /^limit not applied: platform: CPU quota none/],
    ['a memory limit not applied', measured({ applied: applied({ containers: applied().containers.map((item) => (item.name === 'web' ? { ...item, memorySwapBytes: (item.memoryBytes ?? 0) * 2 } : item)) }) }), /^limit not applied: web: memory/],
    ['io.max not applied', measured({ applied: applied({ ioMax: null }) }), /^limit not applied: postgres: io\.max not set/],
    // The screening's mail (PR 6b-4): the address checks' worst case charged to every upload as the web measured it (G1;
    // review M4: never the delay the harness configured), no run held by the gate.
    [
      'an upload whose address checks the web did not measure (no line for its run)',
      measured({ scenarios: withUpload('S2-1', { addressCheckMs: null }) }),
      /^address checks not measured: S2-1 has no line of the web's measured address checks for its run, so its time to email may not carry their worst case \(G1\)$/,
    ],
    [
      'an upload of S4\'s run that is not the middle one whose address checks the web did not measure',
      measured({ scenarios: withUpload('S4-4', { addressCheckMs: null }, 'S4#3') }),
      /^address checks not measured: S4#3 S4-4 has no line/,
    ],
    [
      'an upload whose address checks answered under their worst case (a stand-in skipped or shortened)',
      measured({ scenarios: withUpload('S1-1', { addressCheckMs: ADDRESS_CHECK_CHARGE_MS - 1 }) }),
      /^address checks not charged: S1-1's DNS check and address validation took 1999 ms on the web; every upload is charged their worst case, 2000 ms, inside its time to email \(G1\)$/,
    ],
    ['the screening stream not seeded ready', measured({ mail: { screeningReady: false, heldLines: 0 } }), /^screening mail not ready: /],
    ['a report written before the mail streams', measured({ mail: undefined }), /^screening mail not ready: /],
    ['a run held by the mail gate', measured({ mail: { screeningReady: true, heldLines: 1 } }), /^screening mail held runs: the consumer logged 1 line of a run waiting while the screening's mail was not sending$/],
    ['a round trip under 2 ms', measured({ applied: applied({ roundTripMedianMs: 0.4 }) }), /^limit not applied: postgres: median round trip 0\.40 ms, under 2 ms$/],
    ['a runner too small', measured({ runnerProblems: ['the runner has 1 CPU; the test needs 2'] }), /^runner too small: the runner has 1 CPU/],
    ['a wrong row count', measured({ scenarios: withS1(scenario({}, [upload({ storedRows: 49_999 })])) }), /^row count: S1-1 stored 49999 of 50000$/],
    ['an unfinished upload', measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: null, resultStatus: null, lastPageStatus: null, runStatus: 'pricing', pendingRows: 5_000 })])) }), /^not emailed when the scenario's cap ended: S1-1$/],
    ['a result link that does not open', measured({ scenarios: withS1(scenario({}, [upload({ resultStatus: 404, lastPageStatus: null })])) }), /^result link did not open: S1-1 \(HTTP 404\)$/],
    ['a last page of groups that does not open', measured({ scenarios: withS1(scenario({}, [upload({ lastPageStatus: null })])) }), /^result's last page of groups did not open: S1-1 \(HTTP null\)$/],
    ['an ENGINE_ERROR row', measured({ scenarios: withS1(scenario({}, [upload({ engineErrorRows: 1 })])) }), /^ENGINE_ERROR rows: S1-1 \(1\)$/],
    ['a stalled run', measured({ scenarios: withS1(scenario({}, [upload({ stalled: true })])) }), /^stalled: S1-1/],
    ['a hash mismatch', measured({ oracle: measured().oracle.map((item) => (item.upload === 'S1-1' ? { ...item, oracleSha256: 'e'.repeat(64) } : item)) }), /^oracle mismatch: S1-1$/],
    ['an oracle that compared nothing (two empty sets hash alike)', measured({ oracle: measured().oracle.map((item) => (item.upload === 'S2-1' ? { ...item, rows: 0 } : item)) }), /^oracle compared 0 rows of S2-1, not its 50000 Medicare rows$/],
    ['an oracle that compared fewer rows than the upload’s Medicare rows', measured({ oracle: measured().oracle.map((item) => (item.upload === 'S3-1' ? { ...item, rows: 49_000 } : item)) }), /^oracle compared 49000 rows of S3-1/],
    ['an upload left out of the oracle (its run not found)', measured({ oracle: measured().oracle.filter((item) => item.upload !== 'S1-1') }), /^oracle not compared: S1-1$/],
    ['the held entry’s run not compared', measured({ oracle: measured().oracle.filter((item) => item.upload !== 'S3-1') }), /^oracle not compared: S3-1$/],
    ['the split ZIP’s run not compared', measured({ oracle: measured().oracle.filter((item) => item.upload !== 'S1-2') }), /^oracle not compared: S1-2$/],
    [
      'the split ZIP’s run compared with the frozen oracle, which cannot price it',
      measured({ oracle: measured().oracle.map((item) => (item.upload === 'S1-2' ? { ...item, oracle: 'frozen_3c1b289' as const } : item)) }),
      /^oracle: S1-2 compared with frozen_3c1b289, not whole_release$/,
    ],
    ['a run of only some scenarios', measured({ scenarios: scenarios().filter((item) => item.id === 'S2' || item.id === 'S3'), only: ['S2', 'S3'] }), /^partial run: measured S2, S3; a verdict needs S1, S2, S3, S4#1, S4#2, S4#3, S5 \(asked for S2, S3\)$/],
    ['a run of S4 once (a report from before the founder’s ruling of 2026-10-23)', measured({ scenarios: scenarios().filter((item) => item.id !== 'S4#2' && item.id !== 'S4#3').map((item) => (item.id === 'S4#1' ? { ...item, id: 'S4', repetition: null } : item)) }), /^partial run: measured S1, S2, S3, S4, S5; a verdict needs S1, S2, S3, S4#1, S4#2, S4#3, S5$/],
    ['scenarios the deadline left unstarted', measured({ scenarios: scenarios().slice(0, 3), notStarted: ['S4#1', 'S4#2', 'S4#3', 'S5'] }), /^deadline: S4#1, S4#2, S4#3, S5 not started/],
    ['a small upload priced before the large ones it was sent behind', measured({ scenarios: withScenario('S4#3', (item) => ({ ...item, uploads: item.uploads.map((entry) => (entry.behind ? { ...entry, jobStartedMs: 15_000 } : entry)) })) }), /^queue order: S4#3 S4-4 was not queued and started behind/],
    ['a small upload whose job was not found', measured({ scenarios: withScenario('S4#1', (item) => ({ ...item, uploads: item.uploads.map((entry) => (entry.id === 'S4-2' ? { ...entry, jobStartedMs: null } : entry)) })) }), /^queue order not recorded: S4#1 S4-4$/],
    ['an email whose submission time was not captured', measured({ scenarios: withS1(scenario({}, [upload({ submittedMs: null })])) }), /^submission time not captured: S1-1$/],
    ['a page cache not dropped before a cold scenario', measured({ scenarios: withS1(scenario({ coldStart: { restarted: true, cacheDropped: false } })) }), /^cold start not applied: S1 \(Postgres restarted: yes, page cache dropped: no\)$/],
    ['a Postgres backend killed for memory', measured({ scenarios: withS1(scenario({ postgres: { oomKills: 1, restarts: 0, running: true } })) }), /^OOM kill: S1 postgres$/],
    ['a Postgres container that restarted', measured({ scenarios: withS1(scenario({ postgres: { oomKills: 0, restarts: 1, running: true } })) }), /^restart or exit: S1 postgres$/],
    ['Postgres’s state not read on Docker', measured({ scenarios: withS1(scenario({ postgres: { oomKills: null, restarts: 0, running: true } })) }), /^postgres's state not read: S1$/],
    ['a step that did not finish', measured({ aborted: 'RELEASE_LOAD_FAILED' }), /^run not finished: RELEASE_LOAD_FAILED$/],
  ];

  it.each(failing)('fail on %s, with its reason', (_, input, reason) => {
    // Binding, advisory and open alike: the time mode decides only whether time fails the run.
    for (const rule of [ENFORCED, ADVISORY, OPEN]) {
      const result = verdict(input, rule);
      expect(result.pass).toBe(false);
      expect(result.reasons.some((line) => reason.test(line)), result.reasons.join('\n')).toBe(true);
    }
  });

  it('count no slot unused for a large upload queued only after another had been emailed', () => {
    // A slow web queued S5's third upload after the first was emailed: it waited for no thread.
    const late = withUpload('S4-3', { jobCreatedMs: 31_200, jobStartedMs: 31_400, submittedMs: 30_000, emailedMs: 55_000 });
    expect(verdict(measured({ scenarios: late }), ENFORCED).reasons.filter((reason) => reason.startsWith('slots not used'))).toEqual([]);
  });

  it('read a waiting-tier upload as failing even where its time would pass, since no scenario upload may wait', () => {
    const waiting = verdict(measured({ scenarios: withUpload('S4-3', { waitReason: 'account_share', queuePriority: -1 }, 'S4#2') }), ENFORCED);
    expect(waiting.reasons).toEqual(['waiting tier: S4#2 S4-3 (account_share, priority -1)']);
  });
});

describe('the report', () => {
  it('names its format, carries the verdict, and holds no link or token', () => {
    const full = report(measured(), ENFORCED);
    expect(full.format).toBe('tp-screening-capacity/8');
    expect(REPORT_FORMAT).toBe('tp-screening-capacity/8');
    expect(full.verdict).toEqual({ pass: true, time: 'enforced', reasons: [], timeWarnings: [] });
    const text = `${JSON.stringify(full)}\n${markdown(full, ENFORCED)}`;
    expect(text).not.toMatch(/\/screening\/results\//);
    expect(text).not.toMatch(/(?<![a-z0-9])[a-z]{32}(?![a-z0-9])/);
    expect(markdown(full, ENFORCED)).toContain('| S1-1 | worst | 50000 | 30.0 | 29.8 | normal | 0.9 | 4.0 (150000) | 20.0 | 3.0 | 0.2 | 1.1, 1.2 | pass |');
  });

  it('records the GitHub Actions run that measured, from the runner’s own variables, which the launch check holds to the tag’s release.yml (the verification of PR 6b-3’s capacity changes)', () => {
    const env = {
      GITHUB_WORKFLOW_REF: 'PureTideWater/PhysicalTherapy/.github/workflows/release.yml@refs/tags/v1.4.0',
      GITHUB_RUN_ID: '18000000001',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_TOKEN: 'never read',
    };
    expect(workflowRun(env)).toEqual(SYNTHETIC_RUN);
    // Outside Actions (a local run), nothing: an empty variable is no run either.
    expect(workflowRun({})).toEqual({ ref: null, runId: null, runAttempt: null });
    expect(workflowRun({ GITHUB_WORKFLOW_REF: '', GITHUB_RUN_ID: '', GITHUB_RUN_ATTEMPT: '' })).toEqual({ ref: null, runId: null, runAttempt: null });
    const full = report(measured(), ENFORCED);
    expect(full.workflow).toEqual(SYNTHETIC_RUN);
    expect(markdown(full, ENFORCED)).toContain(`Measured by ${SYNTHETIC_RUN.ref}, run ${SYNTHETIC_RUN.runId}, attempt 1.`);
    // The screening's mail as the harness ran it (PR 6b-4): the address checks as the web measured them, the stream seeded ready.
    expect(markdown(full, ENFORCED)).toContain(
      'Screening mail: the web measured the address checks of 16 of 16 uploads at 2.0 to 2.0 s, inside each time to email (G1); the screening stream was seeded sending and ready, and 0 run lines waited on the mail gate.',
    );
    expect(ADDRESS_CHECK_CHARGE_MS).toBe(2_000);
  });

  it('judges the address checks by the time the web measured on each upload, never the delay the harness set (review M4)', () => {
    // Exactly the worst case passes; the summary gives the span measured and how many uploads had a line.
    const atLine = measured({ scenarios: withUpload('S1-1', { addressCheckMs: ADDRESS_CHECK_CHARGE_MS }) });
    expect(verdict(atLine, ENFORCED).reasons).toEqual([]);
    const spread = measured({ scenarios: withUpload('S3-1', { addressCheckMs: 2_456 }, null, withUpload('S1-1', { addressCheckMs: ADDRESS_CHECK_CHARGE_MS })) });
    expect(addressCheckSpan(spread.scenarios)).toEqual({ measured: 16, uploads: 16, leastMs: 2_000, mostMs: 2_456 });
    expect(markdown(report(spread, ENFORCED), ENFORCED)).toContain('Screening mail: the web measured the address checks of 16 of 16 uploads at 2.0 to 2.5 s, inside each time to email (G1);');
    // No line on any upload (a web that skips the checks on the harness's path, or no longer logs them): every upload
    // fails, whatever the harness gave the stand-ins, and the summary says none was measured.
    const none = measured({ scenarios: measured().scenarios.map((item) => ({ ...item, uploads: item.uploads.map((entry) => ({ ...entry, addressCheckMs: null })) })) });
    const reasons = verdict(none, ADVISORY).reasons;
    expect(reasons.filter((reason) => reason.startsWith('address checks not measured: '))).toHaveLength(16);
    expect(verdict(none, ADVISORY).pass).toBe(false);
    expect(markdown(report(none, ADVISORY), ADVISORY)).toContain("Screening mail: the web measured no upload's address checks (16 uploads);");
    // A report written before this round has no field on its uploads: read as no line.
    const before = measured({ scenarios: withUpload('S5-1', {}, null, measured().scenarios).map((item) => ({ ...item, uploads: item.uploads.map(({ addressCheckMs: _ms, ...rest }) => rest as UploadMeasure) })) });
    expect(verdict(before, ENFORCED).reasons).toContain("address checks not measured: S5-1 has no line of the web's measured address checks for its run, so its time to email may not carry their worst case (G1)");
  });

  it('counts the consumers’ lines of a run the mail gate held, by the worker’s own code', () => {
    expect(SCREENING_MAIL_HELD_CODE).toBe(SCREENING_MAIL_PAUSED_CODE);
    const lines = [
      JSON.stringify({ msg: 'screening run waits: email paused', screening_run_id: 'r-1', error_code: 'SCREENING_MAIL_PAUSED' }),
      JSON.stringify({ msg: 'screening result emailed after waiting', screening_run_id: 'r-2', error_code: 'SCREENING_ACCOUNT_SHARE' }),
      JSON.stringify({ msg: 'screening result emailed', screening_run_id: 'r-3', elapsed_ms: 1 }),
      'not a log line',
      '{ not json',
    ];
    expect(mailHeldLines(lines)).toBe(1);
    expect(mailHeldLines([])).toBe(0);
    expect(markdown(report(measured({ workflow: { ref: null, runId: null, runAttempt: null } }), ADVISORY), ADVISORY)).toContain('Measured outside GitHub Actions (no GITHUB_WORKFLOW_REF).');
  });

  it('names the consumer as measured and both image IDs, which the launch check compares (decision 13)', () => {
    const full = report(measured(), ENFORCED);
    expect(full.consumer).toEqual({ tasks: 1, cpus: 2, memoryMiB: 4096, concurrency: 3 });
    expect(full.images).toEqual({ web: `sha256:${'a'.repeat(64)}`, worker: `sha256:${'b'.repeat(64)}` });
    const summary = markdown(full, ENFORCED);
    expect(summary).toContain('## Screening capacity: pass (time enforced)');
    expect(summary).toContain('Screening consumer: 1 task of 2 vCPU and 4096 MiB, 3 screenings at once each.');
    expect(summary).toContain(`Images: web \`sha256:${'a'.repeat(64)}\`, worker \`sha256:${'b'.repeat(64)}\`.`);
    expect(summary).toContain('| S1 | screening-1 | 1150.0 | 4096 | 1300.0 | 0 | 0 | — |');
  });

  it('records which layout ran: the free 4-CPU runner’s shared CPUs, which pass, and an 8-CPU runner’s CPUs of their own (the founder’s ruling of 2026-10-23, time advisory)', () => {
    const full = report(measured(), ENFORCED);
    expect(full.expected.layout).toEqual({ kind: 'shared', postgres: '0-1', consumer: '2-3', web: '3', platform: '3', harness: '0-1' });
    expect(full.harnessAffinity).toBe('0-1');
    expect(full.runner.cpus).toBe(4);
    // A shared CPU is no failure on the free runner: the layout is the one the harness gives it.
    expect(full.verdict).toEqual({ pass: true, time: 'enforced', reasons: [], timeWarnings: [] });
    expect(markdown(full, ENFORCED)).toContain(
      'Layout: shared CPUs: Postgres on CPUs 0-1, the screening consumer on 2-3, the web on 3, the platform on 3 and the harness with Chromium on 0-1 (Postgres and the harness share CPUs 0-1; the screening consumer, the web and the platform share CPU 3); the harness ran on CPUs 0-1.',
    );
    const own = report(onOwnCpus(), ENFORCED);
    expect(own.runner.cpus).toBe(eightCpus.cpus);
    expect(own.expected.layout).toEqual({ kind: 'own', postgres: '0-1', consumer: '2-3', web: '4', platform: '5', harness: '6-7' });
    expect(own.verdict).toEqual({ pass: true, time: 'enforced', reasons: [], timeWarnings: [] });
    expect(markdown(own, ENFORCED)).toContain(
      'Layout: CPUs of their own: Postgres on CPUs 0-1, the screening consumer on 2-3, the web on 4, the platform on 5 and the harness with Chromium on 6-7; the harness ran on CPUs 6-7.',
    );
    // The free runner's layout recorded on eight CPUs is not the one the harness gives them, and fails.
    const misplaced = verdict(onOwnCpus({ expected: { ...onOwnCpus().expected, layout: expected.layout } }), ENFORCED);
    expect(misplaced.reasons.filter((reason) => reason.startsWith('layout: '))).toEqual([
      "layout: measured on shared CPUs: Postgres on CPUs 0-1, the screening consumer on 2-3, the web on 3, the platform on 3 and the harness with Chromium on 0-1 (Postgres and the harness share CPUs 0-1; the screening consumer, the web and the platform share CPU 3), and the layout the harness gives a runner of 8 CPUs is CPUs of their own: Postgres on CPUs 0-1, the screening consumer on 2-3, the web on 4, the platform on 5 and the harness with Chromium on 6-7",
    ]);
  });

  it('compares the five-digit uploads with the frozen read path and the split ZIP’s with the whole release (PR 6b)', () => {
    expect(ORACLE_UPLOADS.map((upload) => [upload, oracleKind(upload)])).toEqual([
      ['S1-1', 'frozen_3c1b289'],
      ['S1-2', 'whole_release'],
      ['S2-1', 'frozen_3c1b289'],
      ['S3-1', 'frozen_3c1b289'],
    ]);
  });

  it('reports the ZIP9 file’s size beside the release (open item O8)', () => {
    const zip9 = { records: 2_546, rangesPerRecord: 40, linesPerYear: 101_840, bytesPerYear: 8_249_040 };
    const full = report(measured({ release: { releaseNo: 900_100, manifestSha256: 'c'.repeat(64), records: 2_247_791, zip9 } }), OPEN);
    expect(full.release.zip9).toEqual(zip9);
    expect(markdown(full, OPEN)).toContain('Release 900100 (2247791 records; ZIP9: 2546 records of 40 ranges, 101840 lines and 7.9 MiB a year).');
    expect(markdown(report(measured(), OPEN), OPEN)).toContain('Release 900100 (2245245 records).');
  });
});
