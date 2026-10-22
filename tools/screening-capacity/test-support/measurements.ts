import { type EnvironmentSettings, environmentSettings } from '../../../infra/lib/environments';
import { MIB, postgresLimit, productionLimits } from '../limits';
import { ALL_SCENARIOS, type AppliedLimits, type ExpectedLimits, type Measurements, ORACLE_UPLOADS, type ScenarioMeasure, type TimeRule, type UploadMeasure, oracleKind } from '../report';

/**
 * Synthetic capacity measurements for the report's and the launch check's tests (no row, link, token or address): a full
 * passing run of S1 to S5 under production's limits, the screening consumer at its declared size, and helpers that
 * change one part of it.
 */

export const OPEN: TimeRule = { consumerDeclared: false, consumerRun: false, runnerToFargate: null };
export const ENFORCED: TimeRule = { consumerDeclared: true, consumerRun: true, runnerToFargate: null };

/** Production's settings with the consumer taken out: what every checkout before PR 6b-3 declared. */
export function withoutConsumer(): EnvironmentSettings {
  const production = environmentSettings('production');
  const compute: Record<string, unknown> = { ...production.compute };
  delete compute.screening;
  return { ...production, compute } as unknown as EnvironmentSettings;
}

export const limits = productionLimits();
export const runner = { cpus: 4, memoryMiB: 16_000, cpuModel: 'synthetic', kernel: 'synthetic', loadAverage: [0.5, 0.4, 0.3] };
export const postgres = postgresLimit(runner, limits);
export const expected: ExpectedLimits = {
  web: limits.web,
  platform: limits.platform,
  screening: limits.screening,
  screeningTasks: limits.screeningTasks,
  postgres,
  storage: { iops: limits.database.iops, bytesPerSecond: limits.database.bytesPerSecond },
};

export function applied(overrides: Partial<AppliedLimits> = {}): AppliedLimits {
  const container = (name: string, cpus: number, memoryMiB: number, cpuset: string) => ({ name, nanoCpus: Math.round(cpus * 1e9), memoryBytes: memoryMiB * MIB, memorySwapBytes: memoryMiB * MIB, cpuset });
  return {
    containers: [
      // The web as production declares it (environments.ts; half a vCPU and 1,024 MiB since the founder's ruling of 2026-10-22).
      container('web', limits.web.cpus, limits.web.memoryMiB, postgres.taskCpuset),
      container('platform', 0.25, 512, postgres.taskCpuset),
      container('screening-1', 2, 4096, postgres.consumerCpuset),
      container('postgres', postgres.cpus, postgres.memoryMiB, postgres.cpuset),
    ],
    ioMax: { riops: 3000, wiops: 3000, rbps: 125 * MIB, wbps: 125 * MIB },
    roundTripMedianMs: 2.3,
    ...overrides,
  };
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

/** S1 to S5, each one upload, S4 with three large ones and a small one queued behind them. */
export function scenarios(): ScenarioMeasure[] {
  return ALL_SCENARIOS.map((id) =>
    id === 'S4'
      ? scenario({ id, coldStart: { restarted: true, cacheDropped: true } }, [
          upload({ id: 'S4-1', jobCreatedMs: 1_100, jobStartedMs: 1_200 }),
          upload({ id: 'S4-2', jobCreatedMs: 1_200, jobStartedMs: 10_000 }),
          upload({ id: 'S4-3', jobCreatedMs: 1_300, jobStartedMs: 20_000 }),
          upload({ id: 'S4-4', shape: 'small', rows: 25, behind: true, storedRows: 25, submittedMs: 9_000, emailedMs: 39_000, jobCreatedMs: 9_100, jobStartedMs: 30_000 }),
        ])
      : scenario({ id, coldStart: id === 'S1' ? { restarted: true, cacheDropped: true } : null }, [upload({ id: `${id}-1` })]),
  );
}

/** The full run's scenarios with S1 replaced. */
export function withS1(s1: ScenarioMeasure): ScenarioMeasure[] {
  return [s1, ...scenarios().slice(1)];
}

export function measured(overrides: Partial<Measurements> = {}): Measurements {
  return {
    commit: 'f'.repeat(40),
    runtime: 'docker',
    images: { web: `sha256:${'a'.repeat(64)}`, worker: `sha256:${'b'.repeat(64)}` },
    consumer: { tasks: 1, cpus: 2, memoryMiB: 4096, concurrency: 3 },
    staticAssetOrigin: null,
    runner,
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

/** The full run's scenarios with one upload of one scenario changed (its time-to-email line recomputed unless given). */
export function withUpload(id: string, overrides: Partial<UploadMeasure>): ScenarioMeasure[] {
  return scenarios().map((item) => ({
    ...item,
    uploads: item.uploads.map((entry) => {
      if (entry.id !== id) {
        return entry;
      }
      const { logged: _logged, ...rest } = entry;
      return upload({ ...rest, ...overrides });
    }),
  }));
}
