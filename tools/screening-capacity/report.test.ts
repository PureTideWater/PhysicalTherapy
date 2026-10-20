import { describe, expect, it } from 'vitest';

import { type EnvironmentSettings, environmentSettings } from '../../infra/lib/environments';
import { MIB, RUNNER_TO_FARGATE, TIME_ALLOWANCE_MS, TIME_PROMISE_MS, postgresLimit, productionLimits } from './limits';
import { type AppliedLimits, type Measurements, type ScenarioMeasure, type TimeRule, type UploadMeasure, limitProblems, markdown, report, timeLabel, timeRule, timeVerdict, verdict } from './report';

/**
 * The capacity test's split verdict (audit #53 part 1; the founder's rulings of 2026-10-20, decisions 13 to 16): time
 * is "open, PR 6b" until environments.ts declares the screening consumer and fails the run from then on, at 48 s on the
 * runner until the runner-to-Fargate factor is measured and at 60 s scaled by it after; everything PR 6 controls fails
 * the run whatever the time rule; the report carries no link or token.
 */

const OPEN: TimeRule = { consumerDeclared: false, runnerToFargate: null };
const ENFORCED: TimeRule = { consumerDeclared: true, runnerToFargate: null };

/** Production's settings with a screening consumer declared, as PR 6b will declare it. */
function withConsumer(): EnvironmentSettings {
  const production = environmentSettings('production');
  return { ...production, compute: { ...production.compute, screening: { cpu: 1024, memoryMiB: 2048, desiredCount: 1, concurrency: 2 } } as EnvironmentSettings['compute'] };
}

const limits = productionLimits();
const runner = { cpus: 4, memoryMiB: 16_000, cpuModel: 'synthetic', kernel: 'synthetic', loadAverage: [0.5, 0.4, 0.3] };
const postgres = postgresLimit(runner, limits);
const expected = { web: limits.web, platform: limits.platform, postgres, storage: { iops: limits.database.iops, bytesPerSecond: limits.database.bytesPerSecond } };

function applied(overrides: Partial<AppliedLimits> = {}): AppliedLimits {
  const container = (name: 'web' | 'platform' | 'postgres', cpus: number, memoryMiB: number, cpuset: string) => ({ name, nanoCpus: Math.round(cpus * 1e9), memoryBytes: memoryMiB * MIB, memorySwapBytes: memoryMiB * MIB, cpuset });
  return {
    containers: [container('web', 0.25, 512, postgres.taskCpuset), container('platform', 0.25, 512, postgres.taskCpuset), container('postgres', postgres.cpus, postgres.memoryMiB, postgres.cpuset)],
    ioMax: { riops: 3000, wiops: 3000, rbps: 125 * MIB, wbps: 125 * MIB },
    roundTripMedianMs: 2.3,
    ...overrides,
  };
}

function upload(overrides: Partial<UploadMeasure> = {}): UploadMeasure {
  return {
    id: 'S1-1',
    shape: 'worst',
    rows: 50_000,
    submittedMs: 1_000,
    emailedMs: 1_000 + 30_000,
    queueWaitMs: 200,
    phases: { shared_load: { elapsedMs: 900, recordCount: 2_000 }, keyed_read: { elapsedMs: 4_000, recordCount: 150_000 }, pricing: { elapsedMs: 20_000, recordCount: 50_000 }, recording: { elapsedMs: 3_000, recordCount: 50_000 } },
    resultStatus: 200,
    lastPageStatus: 200,
    storedRows: 50_000,
    pendingRows: 0,
    engineErrorRows: 0,
    stalled: false,
    runStatus: 'complete',
    ...overrides,
  };
}

function scenario(overrides: Partial<ScenarioMeasure> = {}, uploads: readonly UploadMeasure[] = [upload()]): ScenarioMeasure {
  return {
    id: 'S1',
    what: 'worst shape alone',
    uploads,
    containers: [
      { name: 'web', limitBytes: 512 * MIB, anonPeakBytes: 200 * MIB, anonSamples: 120, memoryPeakBytes: 260 * MIB, events: { max: 0, oomKill: 0 }, oomKilled: false, restarts: 0, exitedUnexpectedly: false, throttling: { periods: 10, throttledPeriods: 4, throttledUs: 1000 } },
      { name: 'platform', limitBytes: 512 * MIB, anonPeakBytes: 300 * MIB, anonSamples: 120, memoryPeakBytes: 340 * MIB, events: { max: 0, oomKill: 0 }, oomKilled: false, restarts: 0, exitedUnexpectedly: false, throttling: null },
    ],
    platformJobs: [{ name: 'screening_price', count: 1, seconds: 30 }],
    ...overrides,
  };
}

function measured(overrides: Partial<Measurements> = {}): Measurements {
  return {
    commit: 'f'.repeat(40),
    runtime: 'docker',
    imageDigests: { web: `sha256:${'a'.repeat(64)}`, worker: `sha256:${'b'.repeat(64)}` },
    runner,
    expected,
    applied: applied(),
    runnerProblems: [],
    departures: [],
    release: { releaseNo: 900_100, manifestSha256: 'c'.repeat(64), records: 2_245_245 },
    shapes: {},
    scenarios: [scenario()],
    oracle: [{ scenario: 'S1', upload: 'S1-1', rows: 50_000, storedSha256: 'd'.repeat(64), oracleSha256: 'd'.repeat(64) }],
    aborted: null,
    ...overrides,
  };
}

describe('the time verdict', () => {
  it('is open until environments.ts declares the screening consumer, and enforced from then on: the switch is the settings', () => {
    // Today production declares no screening consumer: PR 6b's declaration is what turns time on.
    expect(timeRule(environmentSettings('production'), RUNNER_TO_FARGATE)).toEqual(OPEN);
    expect(timeRule(withConsumer(), RUNNER_TO_FARGATE)).toEqual(ENFORCED);
    expect(productionLimits(withConsumer()).platform).toEqual({ cpus: 1, memoryMiB: 2048 });
    expect(RUNNER_TO_FARGATE).toBeNull();
  });

  it('reports 120 s as "open, PR 6b" and passes the run while time is open', () => {
    expect(timeVerdict(120_000, OPEN)).toEqual({ status: 'open' });
    expect(timeLabel(timeVerdict(120_000, OPEN))).toBe('open, PR 6b');
    const slow = measured({ scenarios: [scenario({}, [upload({ emailedMs: 1_000 + 120_000 })])] });
    expect(verdict(slow, OPEN)).toEqual({ pass: true, time: 'open, PR 6b', reasons: [] });
  });

  it('with the consumer declared: 47.9 s passes, 48.1 s fails as the allowance, 60.1 s fails as the promise', () => {
    expect([TIME_ALLOWANCE_MS, TIME_PROMISE_MS]).toEqual([48_000, 60_000]);
    expect(timeVerdict(47_900, ENFORCED)).toEqual({ status: 'pass' });
    expect(timeVerdict(48_100, ENFORCED)).toEqual({ status: 'fail', reason: 'allowance' });
    expect(timeVerdict(60_100, ENFORCED)).toEqual({ status: 'fail', reason: 'promise' });
    const at = (ms: number) => verdict(measured({ scenarios: [scenario({}, [upload({ emailedMs: 1_000 + ms })])] }), ENFORCED);
    expect(at(47_900)).toEqual({ pass: true, time: 'enforced', reasons: [] });
    expect(at(48_100).reasons).toEqual(['time: S1-1 48.1 s, fail (allowance: above 48 s on the runner)']);
    expect(at(60_100).reasons).toEqual(['time: S1-1 60.1 s, fail (promise broken: above 60 s)']);
  });

  it('once the runner-to-Fargate factor is measured, fails above 60 s scaled by it', () => {
    const scaled: TimeRule = { consumerDeclared: true, runnerToFargate: 1.5 };
    expect(timeVerdict(40_000, scaled)).toEqual({ status: 'pass' });
    expect(timeVerdict(40_100, scaled)).toEqual({ status: 'fail', reason: 'promise' });
  });
});

describe('the checks PR 6 controls fail the run whatever the time rule', () => {
  it('pass when everything holds', () => {
    expect(verdict(measured(), OPEN)).toEqual({ pass: true, time: 'open, PR 6b', reasons: [] });
    expect(limitProblems(applied(), expected)).toEqual([]);
  });

  const failing: readonly [string, Measurements, RegExp][] = [
    ['an OOM kill', measured({ scenarios: [scenario({ containers: [{ ...scenario().containers[1]!, oomKilled: true }] })] }), /^OOM kill: S1 platform$/],
    ['an oom_kill event', measured({ scenarios: [scenario({ containers: [{ ...scenario().containers[1]!, events: { max: 3, oomKill: 1 } }] })] }), /^OOM kill: S1 platform$/],
    ['a restart', measured({ scenarios: [scenario({ containers: [{ ...scenario().containers[0]!, restarts: 1 }] })] }), /^restart or exit: S1 web$/],
    ['an exit the harness did not cause', measured({ scenarios: [scenario({ containers: [{ ...scenario().containers[1]!, exitedUnexpectedly: true }] })] }), /^restart or exit: S1 platform$/],
    ['a 91% anonymous memory sample', measured({ scenarios: [scenario({ containers: [{ ...scenario().containers[1]!, anonPeakBytes: Math.ceil(512 * MIB * 0.91) }] })] }), /^memory above 90% of the limit: S1 platform/],
    ['a CPU quota not applied', measured({ applied: applied({ containers: applied().containers.map((item) => (item.name === 'platform' ? { ...item, nanoCpus: null } : item)) }) }), /^limit not applied: platform: CPU quota none/],
    ['a memory limit not applied', measured({ applied: applied({ containers: applied().containers.map((item) => (item.name === 'web' ? { ...item, memorySwapBytes: 1024 * MIB } : item)) }) }), /^limit not applied: web: memory/],
    ['io.max not applied', measured({ applied: applied({ ioMax: null }) }), /^limit not applied: postgres: io\.max not set/],
    ['a round trip under 2 ms', measured({ applied: applied({ roundTripMedianMs: 0.4 }) }), /^limit not applied: postgres: median round trip 0\.40 ms, under 2 ms$/],
    ['a runner too small', measured({ runnerProblems: ['the runner has 1 CPU; the test needs 2'] }), /^runner too small: the runner has 1 CPU/],
    ['a wrong row count', measured({ scenarios: [scenario({}, [upload({ storedRows: 49_999 })])] }), /^row count: S1-1 stored 49999 of 50000$/],
    ['an unfinished upload', measured({ scenarios: [scenario({}, [upload({ emailedMs: null, resultStatus: null, lastPageStatus: null, runStatus: 'pricing', pendingRows: 5_000 })])] }), /^not emailed when the scenario's cap ended: S1-1$/],
    ['a result link that does not open', measured({ scenarios: [scenario({}, [upload({ resultStatus: 404, lastPageStatus: null })])] }), /^result link did not open: S1-1 \(HTTP 404\)$/],
    ['a last page of groups that does not open', measured({ scenarios: [scenario({}, [upload({ lastPageStatus: null })])] }), /^result's last page of groups did not open: S1-1 \(HTTP null\)$/],
    ['an ENGINE_ERROR row', measured({ scenarios: [scenario({}, [upload({ engineErrorRows: 1 })])] }), /^ENGINE_ERROR rows: S1-1 \(1\)$/],
    ['a stalled run', measured({ scenarios: [scenario({}, [upload({ stalled: true })])] }), /^stalled: S1-1/],
    ['a hash mismatch', measured({ oracle: [{ scenario: 'S1', upload: 'S1-1', rows: 50_000, storedSha256: 'd'.repeat(64), oracleSha256: 'e'.repeat(64) }] }), /^oracle mismatch: S1-1$/],
    ['a step that did not finish', measured({ aborted: 'RELEASE_LOAD_FAILED' }), /^run not finished: RELEASE_LOAD_FAILED$/],
  ];

  it.each(failing)('fail on %s, with its reason, while time is open', (_, input, reason) => {
    const result = verdict(input, OPEN);
    expect(result.pass).toBe(false);
    expect(result.time).toBe('open, PR 6b');
    expect(result.reasons.some((line) => reason.test(line)), result.reasons.join('\n')).toBe(true);
  });
});

describe('the report', () => {
  it('names its format, carries the verdict, and holds no link or token', () => {
    const full = report(measured(), OPEN);
    expect(full.format).toBe('tp-screening-capacity/2');
    expect(full.verdict.pass).toBe(true);
    const text = `${JSON.stringify(full)}\n${markdown(full, OPEN)}`;
    expect(text).not.toMatch(/\/screening\/results\//);
    expect(text).not.toMatch(/(?<![a-z0-9])[a-z]{32}(?![a-z0-9])/);
    expect(markdown(full, OPEN)).toContain('| S1-1 | worst | 50000 | 30.0 | 0.9 | 4.0 (150000) | 20.0 | 3.0 | 0.2 | open, PR 6b |');
  });
});
