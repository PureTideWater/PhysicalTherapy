import type { EnvironmentSettings } from '../../infra/lib/environments';
import { type ContainerLimit, MEMORY_LIMIT_PERCENT, MIB, MIN_ROUND_TRIP_MS, type PostgresLimit, TIME_ALLOWANCE_MS, TIME_PROMISE_MS, screeningConsumer } from './limits';
import type { CpuThrottling, MemoryEvents, PhaseName } from './measure';

/**
 * The capacity test's verdict and report (audit #53 part 1; docs/adr/0062, "Capacity under production limits"; the
 * founder's rulings of 2026-10-20, decisions 13 to 16).
 *
 * The split verdict: the run fails on everything PR 6 controls (an OOM kill, a restart or exit the harness did not
 * cause, anonymous memory above 90% of a task's limit, a limit not applied, a runner too small, a wrong or unfinished
 * result, a stalled run, an oracle mismatch). Time is measured always and judged by timeVerdict(): "open, PR 6b"
 * while environments.ts declares no screening consumer, so it cannot fail the run; once PR 6b declares one, above 48 s
 * on the runner fails ("allowance") until the runner-to-Fargate factor is measured, then above 60 s scaled by it
 * ("promise"). The report holds counts, times and hashes only: no row, link, token or address.
 */

export const REPORT_FORMAT = 'tp-screening-capacity/2';

/** How the time is judged: whether the screening's consumer is declared, and the runner-to-Fargate factor once known. */
export interface TimeRule {
  readonly consumerDeclared: boolean;
  readonly runnerToFargate: number | null;
}

/** The rule production's settings give: the switch is environments.ts's compute.screening (PR 6b), nothing else. */
export function timeRule(settings: EnvironmentSettings, runnerToFargate: number | null): TimeRule {
  return { consumerDeclared: screeningConsumer(settings) !== null, runnerToFargate };
}

export type TimeVerdict = { readonly status: 'open' } | { readonly status: 'pass' } | { readonly status: 'fail'; readonly reason: 'allowance' | 'promise' };

/** One upload's time, from its submission to its email, judged by the rule (decisions 15 and 16). */
export function timeVerdict(elapsedMs: number, rule: TimeRule): TimeVerdict {
  if (!rule.consumerDeclared) {
    return { status: 'open' };
  }
  if (rule.runnerToFargate === null) {
    if (elapsedMs <= TIME_ALLOWANCE_MS) {
      return { status: 'pass' };
    }
    return { status: 'fail', reason: elapsedMs <= TIME_PROMISE_MS ? 'allowance' : 'promise' };
  }
  return elapsedMs * rule.runnerToFargate <= TIME_PROMISE_MS ? { status: 'pass' } : { status: 'fail', reason: 'promise' };
}

/** How a time verdict reads in the report. */
export function timeLabel(verdict: TimeVerdict): string {
  switch (verdict.status) {
    case 'open':
      return 'open, PR 6b';
    case 'pass':
      return 'pass';
    case 'fail':
      return verdict.reason === 'allowance' ? 'fail (allowance: above 48 s on the runner)' : 'fail (promise broken: above 60 s)';
  }
}

/** The limits as the containers report them (docker inspect, or the cgroup's own files). */
export interface AppliedContainer {
  readonly name: 'web' | 'platform' | 'postgres';
  /** CPU quota in billionths of a CPU (Docker's NanoCpus); null when none applies. */
  readonly nanoCpus: number | null;
  readonly memoryBytes: number | null;
  readonly memorySwapBytes: number | null;
  readonly cpuset: string | null;
}

export interface AppliedLimits {
  readonly containers: readonly AppliedContainer[];
  /** Postgres's io.max for the data root's device, as read back; null when it could not be read. */
  readonly ioMax: { readonly riops: number | null; readonly wiops: number | null; readonly rbps: number | null; readonly wbps: number | null } | null;
  /** The median of 50 SELECT 1 round trips from a client on the platform's network; null when not measured. */
  readonly roundTripMedianMs: number | null;
}

export interface ExpectedLimits {
  readonly web: ContainerLimit;
  readonly platform: ContainerLimit;
  readonly postgres: PostgresLimit;
  readonly storage: { readonly iops: number; readonly bytesPerSecond: number };
}

/** Each limit the run should have applied and did not ("limit not applied"); empty when all hold. */
export function limitProblems(applied: AppliedLimits, expected: ExpectedLimits): string[] {
  const problems: string[] = [];
  const want: Record<AppliedContainer['name'], { readonly cpus: number; readonly memoryMiB: number; readonly cpuset: string }> = {
    web: { ...expected.web, cpuset: expected.postgres.taskCpuset },
    platform: { ...expected.platform, cpuset: expected.postgres.taskCpuset },
    postgres: { cpus: expected.postgres.cpus, memoryMiB: expected.postgres.memoryMiB, cpuset: expected.postgres.cpuset },
  };
  for (const name of ['web', 'platform', 'postgres'] as const) {
    const container = applied.containers.find((item) => item.name === name);
    const target = want[name];
    if (container === undefined) {
      problems.push(`${name}: no limits read`);
      continue;
    }
    if (container.nanoCpus !== Math.round(target.cpus * 1e9)) {
      problems.push(`${name}: CPU quota ${container.nanoCpus === null ? 'none' : String(container.nanoCpus)}, not ${String(Math.round(target.cpus * 1e9))}`);
    }
    const bytes = target.memoryMiB * MIB;
    if (container.memoryBytes !== bytes || container.memorySwapBytes !== bytes) {
      problems.push(`${name}: memory ${String(container.memoryBytes)} and memory with swap ${String(container.memorySwapBytes)}, not both ${String(bytes)}`);
    }
    if (container.cpuset !== target.cpuset) {
      problems.push(`${name}: cpuset ${String(container.cpuset)}, not ${target.cpuset}`);
    }
  }
  const io = applied.ioMax;
  if (io === null || io.riops !== expected.storage.iops || io.wiops !== expected.storage.iops || io.rbps !== expected.storage.bytesPerSecond || io.wbps !== expected.storage.bytesPerSecond) {
    problems.push(`postgres: io.max ${io === null ? 'not set' : JSON.stringify(io)}, not ${String(expected.storage.iops)} IOPS and ${String(expected.storage.bytesPerSecond)} bytes a second each way`);
  }
  if (applied.roundTripMedianMs === null || applied.roundTripMedianMs < MIN_ROUND_TRIP_MS) {
    problems.push(`postgres: median round trip ${applied.roundTripMedianMs === null ? 'not measured' : `${applied.roundTripMedianMs.toFixed(2)} ms`}, under ${String(MIN_ROUND_TRIP_MS)} ms`);
  }
  return problems;
}

/** One upload's measurements: counts, times and the run's state, never a row or its link. */
export interface UploadMeasure {
  readonly id: string;
  readonly shape: 'practice' | 'worst' | 'small';
  readonly rows: number;
  /** Milliseconds from the scenario's start to the submission (the server action's request start), and to the email; null when none. */
  readonly submittedMs: number | null;
  readonly emailedMs: number | null;
  /** The queue wait: milliseconds from the submission to the job's first phase line. */
  readonly queueWaitMs: number | null;
  readonly phases: Partial<Record<PhaseName, { readonly elapsedMs: number; readonly recordCount: number }>>;
  /** The result link's HTTP status when opened; null when there was no email. */
  readonly resultStatus: number | null;
  /**
   * The HTTP status of the result's last page of groups (the link with ?groups= past the last page, which the page
   * shows as its last), opened after the link; null when there was no email or the link did not open.
   */
  readonly lastPageStatus: number | null;
  readonly storedRows: number | null;
  readonly pendingRows: number | null;
  readonly engineErrorRows: number | null;
  /** The run stayed in pricing with no batch recorded for five minutes. */
  readonly stalled: boolean;
  /** The run's status at the end (complete, failed, pricing, queued), or null when no run was found. */
  readonly runStatus: string | null;
}

export interface ContainerMeasure {
  readonly name: 'web' | 'platform';
  readonly limitBytes: number;
  readonly anonPeakBytes: number;
  readonly anonSamples: number;
  /** memory.peak (v2) or memory.max_usage_in_bytes (v1): page cache included. */
  readonly memoryPeakBytes: number | null;
  readonly events: MemoryEvents;
  readonly oomKilled: boolean;
  readonly restarts: number;
  /** The container exited without the harness stopping it. */
  readonly exitedUnexpectedly: boolean;
  readonly throttling: CpuThrottling | null;
}

export interface ScenarioMeasure {
  readonly id: string;
  readonly what: string;
  readonly uploads: readonly UploadMeasure[];
  readonly containers: readonly ContainerMeasure[];
  /** Platform jobs that ran during the scenario, from pg-boss's job table, with their seconds. */
  readonly platformJobs: readonly { readonly name: string; readonly count: number; readonly seconds: number }[];
}

export interface OracleComparison {
  readonly scenario: string;
  readonly upload: string;
  readonly rows: number;
  readonly storedSha256: string;
  readonly oracleSha256: string;
}

export interface Measurements {
  readonly commit: string;
  readonly runtime: 'docker' | 'process';
  readonly imageDigests: Readonly<Record<string, string>>;
  readonly runner: { readonly cpus: number; readonly memoryMiB: number; readonly cpuModel: string; readonly kernel: string; readonly loadAverage: readonly number[] };
  readonly expected: ExpectedLimits;
  readonly applied: AppliedLimits;
  readonly runnerProblems: readonly string[];
  readonly departures: readonly { readonly what: string; readonly direction: string }[];
  readonly release: { readonly releaseNo: number; readonly manifestSha256: string; readonly records: number };
  readonly shapes: Readonly<Record<string, unknown>>;
  readonly scenarios: readonly ScenarioMeasure[];
  readonly oracle: readonly OracleComparison[];
  /** A step that could not finish, with what stopped it (a code and a short reason of the harness's own). */
  readonly aborted: string | null;
}

export interface Verdict {
  readonly pass: boolean;
  readonly time: 'open, PR 6b' | 'enforced';
  readonly reasons: readonly string[];
}

/** The run's verdict under the rule (see the module comment). */
export function verdict(measured: Measurements, rule: TimeRule): Verdict {
  const reasons: string[] = [];
  if (measured.aborted !== null) {
    reasons.push(`run not finished: ${measured.aborted}`);
  }
  reasons.push(...measured.runnerProblems.map((problem) => `runner too small: ${problem}`));
  reasons.push(...limitProblems(measured.applied, measured.expected).map((problem) => `limit not applied: ${problem}`));
  for (const scenario of measured.scenarios) {
    for (const container of scenario.containers) {
      const where = `${scenario.id} ${container.name}`;
      if (container.oomKilled || container.events.oomKill > 0) {
        reasons.push(`OOM kill: ${where}`);
      }
      if (container.restarts > 0 || container.exitedUnexpectedly) {
        reasons.push(`restart or exit: ${where}`);
      }
      if (container.anonPeakBytes * 100 > container.limitBytes * MEMORY_LIMIT_PERCENT) {
        reasons.push(`memory above ${String(MEMORY_LIMIT_PERCENT)}% of the limit: ${where} (${(container.anonPeakBytes / MIB).toFixed(1)} MiB of ${(container.limitBytes / MIB).toFixed(0)} MiB)`);
      }
    }
    for (const upload of scenario.uploads) {
      const where = `${upload.id}`;
      if (upload.emailedMs === null) {
        reasons.push(`not emailed when the scenario's cap ended: ${where}`);
      } else if (upload.resultStatus !== 200) {
        reasons.push(`result link did not open: ${where} (HTTP ${String(upload.resultStatus)})`);
      } else if (upload.lastPageStatus !== 200) {
        reasons.push(`result's last page of groups did not open: ${where} (HTTP ${String(upload.lastPageStatus)})`);
      }
      if (upload.storedRows !== upload.rows) {
        reasons.push(`row count: ${where} stored ${String(upload.storedRows)} of ${String(upload.rows)}`);
      }
      if ((upload.pendingRows ?? 0) > 0) {
        reasons.push(`rows still pending: ${where} (${String(upload.pendingRows)})`);
      }
      if ((upload.engineErrorRows ?? 0) > 0) {
        reasons.push(`ENGINE_ERROR rows: ${where} (${String(upload.engineErrorRows)})`);
      }
      if (upload.stalled) {
        reasons.push(`stalled: ${where} recorded no batch for five minutes`);
      }
      if (upload.submittedMs !== null && upload.emailedMs !== null) {
        const time = timeVerdict(upload.emailedMs - upload.submittedMs, rule);
        if (time.status === 'fail') {
          reasons.push(`time: ${where} ${((upload.emailedMs - upload.submittedMs) / 1000).toFixed(1)} s, ${timeLabel(time)}`);
        }
      }
    }
  }
  for (const comparison of measured.oracle) {
    if (comparison.storedSha256 !== comparison.oracleSha256) {
      reasons.push(`oracle mismatch: ${comparison.upload}`);
    }
  }
  return { pass: reasons.length === 0, time: rule.consumerDeclared ? 'enforced' : 'open, PR 6b', reasons };
}

export interface Report extends Measurements {
  readonly format: typeof REPORT_FORMAT;
  readonly verdict: Verdict;
}

export function report(measured: Measurements, rule: TimeRule): Report {
  return { format: REPORT_FORMAT, ...measured, verdict: verdict(measured, rule) };
}

const seconds = (ms: number | null | undefined): string => (ms === null || ms === undefined ? '—' : (ms / 1000).toFixed(1));

/** The report as Markdown, for the job's summary: one table of uploads, one of containers, then the verdict. */
export function markdown(full: Report, rule: TimeRule): string {
  const lines = [
    `## Screening capacity: ${full.verdict.pass ? 'pass' : 'fail'} (time ${full.verdict.time})`,
    '',
    `Commit \`${full.commit}\`, ${full.runtime} runtime, runner ${String(full.runner.cpus)} CPUs and ${String(full.runner.memoryMiB)} MiB (${full.runner.cpuModel}), load average ${full.runner.loadAverage.map((value) => value.toFixed(2)).join(' ')}. Release ${String(full.release.releaseNo)} (${String(full.release.records)} records).`,
    '',
    '| Upload | Shape | Rows | Seconds to email | Shared load | Keyed read (records) | Pricing | Recording | Queue wait | Time |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const scenario of full.scenarios) {
    for (const upload of scenario.uploads) {
      const elapsed = upload.submittedMs !== null && upload.emailedMs !== null ? upload.emailedMs - upload.submittedMs : null;
      const shared = upload.phases.shared_load ?? upload.phases.shared_held;
      lines.push(
        `| ${upload.id} | ${upload.shape} | ${String(upload.rows)} | ${seconds(elapsed)} | ${seconds(shared?.elapsedMs)} | ${seconds(upload.phases.keyed_read?.elapsedMs)} (${String(upload.phases.keyed_read?.recordCount ?? '—')}) | ${seconds(upload.phases.pricing?.elapsedMs)} | ${seconds(upload.phases.recording?.elapsedMs)} | ${seconds(upload.queueWaitMs)} | ${elapsed === null ? '—' : timeLabel(timeVerdict(elapsed, rule))} |`,
      );
    }
  }
  lines.push('', '| Scenario | Container | Anonymous peak (MiB) | Limit (MiB) | memory.peak (MiB) | Limit reached | OOM kills | Throttled periods |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const scenario of full.scenarios) {
    for (const container of scenario.containers) {
      lines.push(
        `| ${scenario.id} | ${container.name} | ${(container.anonPeakBytes / MIB).toFixed(1)} | ${(container.limitBytes / MIB).toFixed(0)} | ${container.memoryPeakBytes === null ? '—' : (container.memoryPeakBytes / MIB).toFixed(1)} | ${String(container.events.max)} | ${String(container.events.oomKill)} | ${container.throttling === null ? '—' : `${String(container.throttling.throttledPeriods)} of ${String(container.throttling.periods)}`} |`,
      );
    }
  }
  lines.push('', full.verdict.reasons.length === 0 ? 'Every check PR 6 controls passed.' : 'Failing checks:', ...full.verdict.reasons.map((reason) => `- ${reason}`), '');
  return lines.join('\n');
}
