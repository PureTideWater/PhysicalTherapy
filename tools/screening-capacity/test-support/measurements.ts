import { type EnvironmentSettings, environmentSettings } from '../../../infra/lib/environments';
import { MIB, type Runner, cpuLayout, postgresLimit, productionLimits } from '../limits';
import {
  ALL_SCENARIOS,
  type AppliedLimits,
  type ExpectedLimits,
  type Measurements,
  ORACLE_UPLOADS,
  REPEATED_SCENARIO,
  REPETITIONS,
  type ScenarioMeasure,
  type TimeRule,
  type UploadMeasure,
  oracleKind,
  scenarioLabel,
} from '../report';

/**
 * Synthetic capacity measurements for the report's and the launch check's tests (no row, link, token or address): a full
 * passing run of S1 to S5, S4 three times (S4#1 to S4#3, the founder's ruling of 2026-10-23), under production's limits,
 * the screening consumer at its declared size, on GitHub's free 4-CPU runner in its shared layout (the founder's third
 * ruling of 2026-10-23, "Free: time advisory", put both capacity jobs back on it), an 8-CPU runner's layout of CPUs of
 * their own beside it (onOwnCpus), and helpers that change one part of it.
 */

export const OPEN: TimeRule = { consumerDeclared: false, consumerRun: false, runnerToFargate: null, mode: 'binding' };
/** Time enforced and binding: the release's capacity run (release.yml), the only report the launch check accepts. */
export const ENFORCED: TimeRule = { consumerDeclared: true, consumerRun: true, runnerToFargate: null, mode: 'binding' };
/** The same rule, advisory: every other capacity run (screening-capacity.yml), whose time warns and does not fail it. */
export const ADVISORY: TimeRule = { ...ENFORCED, mode: 'advisory' };

/** Production's settings with the consumer taken out: what every checkout before PR 6b-3 declared. */
export function withoutConsumer(): EnvironmentSettings {
  const production = environmentSettings('production');
  const compute: Record<string, unknown> = { ...production.compute };
  delete compute.screening;
  return { ...production, compute } as unknown as EnvironmentSettings;
}

export const limits = productionLimits();
/** GitHub's free runner for a public repository (ubuntu-24.04): 4 CPUs and 16 GB. */
export const runner = { cpus: 4, memoryMiB: 16_000, cpuModel: 'synthetic', kernel: 'synthetic', loadAverage: [0.5, 0.4, 0.3] };
/** An 8-CPU runner (GitHub's 8-core larger runner, once an organization exists): 8 CPUs and 32 GB. */
export const eightCpus = { ...runner, cpus: 8, memoryMiB: 32_090 };

/** What the harness expects on a runner: production's limits, Postgres's share of the runner, and the runner's layout. */
function expectedOn(on: Runner): ExpectedLimits {
  return {
    web: limits.web,
    platform: limits.platform,
    screening: limits.screening,
    screeningTasks: limits.screeningTasks,
    postgres: postgresLimit(on, limits),
    storage: { iops: limits.database.iops, bytesPerSecond: limits.database.bytesPerSecond },
    layout: cpuLayout(limits.cpuNeeds, on.cpus),
  };
}

/** The free runner's: Postgres, the harness and Chromium on 0-1, the consumer on 2-3, the web and the platform on 3. */
export const expected: ExpectedLimits = expectedOn(runner);
export const postgres = expected.postgres;
export const layout = expected.layout;

/** The limits the containers report on a runner, every one applied in its layout. */
function appliedOn(on: ExpectedLimits, overrides: Partial<AppliedLimits> = {}): AppliedLimits {
  const container = (name: string, cpus: number, memoryMiB: number, cpuset: string) => ({ name, nanoCpus: Math.round(cpus * 1e9), memoryBytes: memoryMiB * MIB, memorySwapBytes: memoryMiB * MIB, cpuset });
  return {
    containers: [
      // The web as production declares it (environments.ts; half a vCPU and 1,024 MiB since the founder's ruling of 2026-10-22).
      container('web', limits.web.cpus, limits.web.memoryMiB, on.layout.web),
      container('platform', 0.25, 512, on.layout.platform),
      container('screening-1', 2, 4096, on.layout.consumer),
      container('postgres', on.postgres.cpus, on.postgres.memoryMiB, on.postgres.cpuset),
    ],
    ioMax: { riops: 3000, wiops: 3000, rbps: 125 * MIB, wbps: 125 * MIB },
    roundTripMedianMs: 2.3,
    ...overrides,
  };
}

export function applied(overrides: Partial<AppliedLimits> = {}): AppliedLimits {
  return appliedOn(expected, overrides);
}

/**
 * The consumer's line for an upload as the worker logs it: received 200 ms after the browser's POST, the line written
 * 10 ms after the mail file (the completion's commit).
 */
export function consistentLog(item: Pick<UploadMeasure, 'submittedMs' | 'emailedMs'>): UploadMeasure['logged'] {
  return item.submittedMs === null || item.emailedMs === null ? null : { elapsedMs: item.emailedMs - item.submittedMs - 200, atMs: item.emailedMs + 10, tier: 'normal' };
}

export function upload(overrides: Partial<UploadMeasure> = {}): UploadMeasure {
  const base = uploadBase(overrides);
  return { ...base, logged: 'logged' in overrides ? (overrides.logged ?? null) : consistentLog(base) };
}

export function uploadBase(overrides: Partial<UploadMeasure>): UploadMeasure {
  return {
    id: 'S1-1',
    shape: 'worst',
    rows: 50_000,
    behind: false,
    jobCreatedMs: 1_100,
    jobStartedMs: 1_200,
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
    waitReason: null,
    queuePriority: 0,
    logged: null,
    ...overrides,
  };
}

export function scenario(overrides: Partial<ScenarioMeasure> = {}, uploads: readonly UploadMeasure[] = [upload()]): ScenarioMeasure {
  return {
    id: 'S1',
    scenario: 'S1',
    repetition: null,
    what: 'worst shape alone',
    coldStart: null,
    postgres: { oomKills: 0, restarts: 0, running: true },
    uploads,
    containers: [
      { name: 'web', limitBytes: limits.web.memoryMiB * MIB, anonPeakBytes: 200 * MIB, anonSamples: 120, memoryPeakBytes: 260 * MIB, events: { max: 0, oomKill: 0 }, oomKilled: false, restarts: 0, exitedUnexpectedly: false, throttling: { periods: 10, throttledPeriods: 4, throttledUs: 1000 } },
      { name: 'platform', limitBytes: 512 * MIB, anonPeakBytes: 150 * MIB, anonSamples: 120, memoryPeakBytes: 200 * MIB, events: { max: 0, oomKill: 0 }, oomKilled: false, restarts: 0, exitedUnexpectedly: false, throttling: null },
      { name: 'screening-1', limitBytes: 4096 * MIB, anonPeakBytes: 1_150 * MIB, anonSamples: 120, memoryPeakBytes: 1_300 * MIB, events: { max: 0, oomKill: 0 }, oomKilled: false, restarts: 0, exitedUnexpectedly: false, throttling: null },
    ],
    jobs: [{ name: 'screening_price', count: 1, seconds: 30 }],
    platformPricedRuns: 0,
    staticOrigin: null,
    ...overrides,
  };
}

/** One S4 run's times to email, in milliseconds: its three large uploads' (S4-1 to S4-3) and the small one's behind them (S4-4). */
export interface S4Times {
  readonly large: readonly [number, number, number];
  readonly small: number;
}

/** Every S4 run at 30 s, as every other upload. */
export const S4_AT_30: S4Times = { large: [30_000, 30_000, 30_000], small: 30_000 };

/**
 * One of S4's runs (S4#1 to S4#3): from a cold Postgres, its three worst uploads queued at once and priced in the
 * consumer's three slots, each submitted at 1 s, and the small one submitted at 9 s, queued and started behind them.
 */
export function s4Run(repetition: number, times: S4Times = S4_AT_30): ScenarioMeasure {
  const [first, second, third] = times.large;
  return scenario({ id: scenarioLabel(REPEATED_SCENARIO, repetition), scenario: REPEATED_SCENARIO, repetition, what: 'worst shape, three at once', coldStart: { restarted: true, cacheDropped: true } }, [
    upload({ id: 'S4-1', jobCreatedMs: 1_100, jobStartedMs: 1_200, emailedMs: 1_000 + first }),
    upload({ id: 'S4-2', jobCreatedMs: 1_200, jobStartedMs: 10_000, emailedMs: 1_000 + second }),
    upload({ id: 'S4-3', jobCreatedMs: 1_300, jobStartedMs: 20_000, emailedMs: 1_000 + third }),
    upload({ id: 'S4-4', shape: 'small', rows: 25, behind: true, storedRows: 25, submittedMs: 9_000, emailedMs: 9_000 + times.small, jobCreatedMs: 9_100, jobStartedMs: 30_000 }),
  ]);
}

/** S1 to S5, each one upload, S4 three times (S4#1 to S4#3) with three large uploads and a small one queued behind them. */
export function scenarios(s4: readonly S4Times[] = Array.from({ length: REPETITIONS }, () => S4_AT_30)): ScenarioMeasure[] {
  return ALL_SCENARIOS.flatMap((id) =>
    id === REPEATED_SCENARIO
      ? s4.map((times, at) => s4Run(at + 1, times))
      : [scenario({ id, scenario: id, coldStart: id === 'S1' ? { restarted: true, cacheDropped: true } : null }, [upload({ id: `${id}-1` })])],
  );
}

/** The full run's scenarios with S1 replaced. */
export function withS1(s1: ScenarioMeasure): ScenarioMeasure[] {
  return [s1, ...scenarios().slice(1)];
}

/**
 * The same passing run on an 8-CPU runner, each service on CPUs of its own (Postgres 0-1, the consumer 2-3, the web 4, the
 * platform 5, the harness 6-7): the layout an 8-core larger runner would measure.
 */
export function onOwnCpus(overrides: Partial<Measurements> = {}): Measurements {
  const own = expectedOn(eightCpus);
  return measured({ runner: eightCpus, expected: own, applied: appliedOn(own), harnessAffinity: own.layout.harness, ...overrides });
}

export function measured(overrides: Partial<Measurements> = {}): Measurements {
  return {
    commit: 'f'.repeat(40),
    runtime: 'docker',
    images: { web: `sha256:${'a'.repeat(64)}`, worker: `sha256:${'b'.repeat(64)}` },
    consumer: { tasks: 1, cpus: 2, memoryMiB: 4096, concurrency: 3 },
    staticAssetOrigin: null,
    runner,
    harnessAffinity: layout.harness,
    expected,
    applied: applied(),
    runnerProblems: [],
    departures: [],
    release: { releaseNo: 900_100, manifestSha256: 'c'.repeat(64), records: 2_245_245 },
    shapes: {},
    scenarios: scenarios(),
    oracle: ORACLE_UPLOADS.map((item) => ({ scenario: item.slice(0, 2), upload: item, oracle: oracleKind(item), rows: 50_000, expectedRows: 50_000, storedSha256: 'd'.repeat(64), oracleSha256: 'd'.repeat(64) })),
    only: [],
    notStarted: [],
    aborted: null,
    ...overrides,
  };
}

/**
 * The full run's scenarios with one upload changed (its time-to-email line recomputed unless given): in the scenario named
 * (S4#2, say), or in every scenario that sends it when none is named.
 */
export function withUpload(id: string, overrides: Partial<UploadMeasure>, scenarioId: string | null = null, from: readonly ScenarioMeasure[] = scenarios()): ScenarioMeasure[] {
  return from.map((item) => ({
    ...item,
    uploads: item.uploads.map((entry) => {
      if (entry.id !== id || (scenarioId !== null && item.id !== scenarioId)) {
        return entry;
      }
      const { logged: _logged, ...rest } = entry;
      return upload({ ...rest, ...overrides });
    }),
  }));
}

/** The full run's scenarios with one scenario changed (S4#3, say). */
export function withScenario(scenarioId: string, change: (item: ScenarioMeasure) => ScenarioMeasure, from: readonly ScenarioMeasure[] = scenarios()): ScenarioMeasure[] {
  return from.map((item) => (item.id === scenarioId ? change(item) : item));
}
