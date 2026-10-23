import type { EnvironmentSettings } from '../../infra/lib/environments';
import {
  type ContainerLimit,
  HARNESS_RUNS_SCREENING_CONSUMER,
  MEMORY_LIMIT_PERCENT,
  MIB,
  MIN_ROUND_TRIP_MS,
  type PostgresLimit,
  TIME_ALLOWANCE_MS,
  TIME_METRIC_BELOW_MS,
  TIME_PROMISE_MS,
  screeningConsumer,
} from './limits';
import type { CpuThrottling, MemoryEvents, PhaseName } from './measure';
import { MEASURED_SCENARIOS, REPEATED_SCENARIO, REPETITIONS } from './scenario-runs';

/**
 * The capacity test's verdict and report (audit #53 part 1; docs/adr/0062, "Capacity under production limits"; the
 * founder's rulings of 2026-10-20, decisions 13 to 16, and of 2026-10-21, Q1 (a) and Q7).
 *
 * The verdict: the run fails on everything the build controls (an OOM kill, a restart or exit the harness did not cause,
 * Postgres's included, anonymous memory above 90% of a task's limit, the consumer's included, a limit or a cold start
 * not applied, the consumer measured at a size other than the one declared, a runner too small, a wrong or unfinished
 * result, a stalled run, a small upload not queued behind the large ones, the consumer's slots not used at once, the
 * platform pricing a screening, an upload in the waiting tier, a time metric missing or outside its bounds, a request
 * that left for the static origin, a submission time not captured, an oracle mismatch or an oracle that compared fewer
 * rows than the upload's Medicare rows, a partial run: every one of S1 to S5 must be measured, S4 three times, and a
 * declared screening consumer the harness does not run as production will). Time is judged by timeVerdict(): "open, PR 6b" while
 * environments.ts declares no screening consumer; with it declared (PR 6b-3), above 48 s on the runner fails
 * ("allowance") until the runner-to-Fargate factor is measured, then above 60 s scaled by it ("promise"). S4 runs three
 * times (S4#1 to S4#3) and its time is judged on the middle run alone, ordered by each run's worst large upload; every
 * other check holds in all three, and every other scenario's time is judged as measured, once (the founder's ruling of
 * 2026-10-23, "Stay free: median of 3"). The report holds counts, times, hashes and image IDs only: no row, link, token
 * or address.
 */

/** tp-screening-capacity/5: S4 three times, each run its own scenario with its repetition, and the middle run named. */
export const REPORT_FORMAT = 'tp-screening-capacity/5';

// The scenarios, S4's three runs and their names (scenario-runs.ts, which the uploads share).
export { ALL_SCENARIOS, MEASURED_SCENARIOS, REPEATED_SCENARIO, REPETITIONS, type ScenarioId, scenarioLabel } from './scenario-runs';

/**
 * The uploads compared with an oracle: the worst shape priced from a fresh platform's first read (S1-1), the practice
 * shape the same way (S2-1), and the practice shape priced from the shared types the platform held from S2 (S3-1), each
 * with the frozen 3c1b289 read path; and the small upload from a ZIP split across localities with its ZIP+4 (S1-2),
 * with the whole release, since the frozen pricer takes a five-digit ZIP alone (PR 6b, docs/adr/0064; oracle.ts).
 */
export const ORACLE_UPLOADS = ['S1-1', 'S1-2', 'S2-1', 'S3-1'] as const;

/** Which oracle an upload is compared with (oracle.ts). */
export type OracleKind = 'frozen_3c1b289' | 'whole_release';

/** The oracle an upload of ORACLE_UPLOADS is compared with: the whole release for S1-2's split ZIP, the frozen path otherwise. */
export function oracleKind(upload: string): OracleKind {
  return upload === 'S1-2' ? 'whole_release' : 'frozen_3c1b289';
}

/**
 * How the time is judged: whether the screening's consumer is declared, whether the harness runs it as production
 * will (HARNESS_RUNS_SCREENING_CONSUMER), and the runner-to-Fargate factor once known.
 */
export interface TimeRule {
  readonly consumerDeclared: boolean;
  readonly consumerRun: boolean;
  readonly runnerToFargate: number | null;
}

/** The rule production's settings give: the switch is environments.ts's compute.screening (PR 6b), nothing else. */
export function timeRule(settings: EnvironmentSettings, runnerToFargate: number | null, consumerRun: boolean = HARNESS_RUNS_SCREENING_CONSUMER): TimeRule {
  return { consumerDeclared: screeningConsumer(settings) !== null, consumerRun, runnerToFargate };
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
  /** web, platform, screening-1 to screening-N, or postgres. */
  readonly name: string;
  /** CPU quota in billionths of a CPU (Docker's NanoCpus); null when none applies. */
  readonly nanoCpus: number | null;
  readonly memoryBytes: number | null;
  readonly memorySwapBytes: number | null;
  readonly cpuset: string | null;
  /**
   * The process's CPU affinity as the kernel reports it (the process runtime, which execs each service under taskset;
   * absent for Docker, whose cpuset is the container's own); null when it could not be read.
   */
  readonly affinity?: string | null;
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
  /** One consumer task's limits, and how many tasks (screening-1 to screening-N); null and 0 without a consumer. */
  readonly screening: ContainerLimit | null;
  readonly screeningTasks: number;
  readonly postgres: PostgresLimit;
  readonly storage: { readonly iops: number; readonly bytesPerSecond: number };
}

/** The consumer as measured (the design's §5.1): its tasks, each task's size, and the screenings each prices at once. */
export interface ConsumerMeasure {
  readonly tasks: number;
  readonly cpus: number;
  readonly memoryMiB: number;
  readonly concurrency: number;
}

/** The containers a run measures with the limits each must have: web, platform, every consumer task, Postgres. */
export function expectedContainers(expected: ExpectedLimits): { readonly name: string; readonly cpus: number; readonly memoryMiB: number; readonly cpuset: string }[] {
  const screening = expected.screening;
  return [
    { name: 'web', ...expected.web, cpuset: expected.postgres.taskCpuset },
    { name: 'platform', ...expected.platform, cpuset: expected.postgres.taskCpuset },
    ...(screening === null ? [] : Array.from({ length: expected.screeningTasks }, (_, index) => ({ name: `screening-${String(index + 1)}`, ...screening, cpuset: expected.postgres.consumerCpuset }))),
    { name: 'postgres', cpus: expected.postgres.cpus, memoryMiB: expected.postgres.memoryMiB, cpuset: expected.postgres.cpuset },
  ];
}

/** Each limit the run should have applied and did not ("limit not applied"); empty when all hold. */
export function limitProblems(applied: AppliedLimits, expected: ExpectedLimits): string[] {
  const problems: string[] = [];
  for (const target of expectedContainers(expected)) {
    const name = target.name;
    const container = applied.containers.find((item) => item.name === name);
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
    // The process runtime's services run under taskset; an affinity narrower than the cpuset is the cgroup-v1 collapse.
    if (container.affinity !== undefined && container.affinity !== target.cpuset) {
      problems.push(`${name}: CPU affinity ${String(container.affinity)}, not ${target.cpuset}`);
    }
  }
  const extra = applied.containers.filter((container) => !expectedContainers(expected).some((target) => target.name === container.name));
  for (const container of extra) {
    problems.push(`${container.name}: a container the run does not declare`);
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
  /** Sent behind the scenario's large uploads, once their runs exist. */
  readonly behind: boolean;
  /** Milliseconds from the scenario's start to its pricing job's creation and start (pg-boss's created_on, started_on): its place in the queue. */
  readonly jobCreatedMs: number | null;
  readonly jobStartedMs: number | null;
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
  /** The run's tier as submit_screening set it (Q7): its wait reason (null in the normal tier) and pg-boss priority. */
  readonly waitReason: string | null;
  readonly queuePriority: number | null;
  /**
   * The consumer's time-to-email line for the run (TimeToEmailMs): its elapsed_ms (from the web's received_at until the
   * send returned and the completion committed), the line's own time from the scenario's start, and whether it was the
   * normal line or the waiting tier's; null when no consumer logged one.
   */
  readonly logged: { readonly elapsedMs: number; readonly atMs: number; readonly tier: 'normal' | 'waiting' } | null;
}

export interface ContainerMeasure {
  /** web, platform, or a consumer task (screening-1 to screening-N). */
  readonly name: string;
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
  /** The scenario as the report and the log name it: S1, or S4#2 for the repeated scenario's second run. */
  readonly id: string;
  /** The scenario it runs (S1 to S5). */
  readonly scenario: string;
  /** Which run of the repeated scenario (1 to REPETITIONS), or null for a scenario run once. */
  readonly repetition: number | null;
  readonly what: string;
  /** The cold start asked for before it (null when none was): whether Postgres was restarted and the page cache dropped. */
  readonly coldStart: { readonly restarted: boolean; readonly cacheDropped: boolean } | null;
  readonly uploads: readonly UploadMeasure[];
  readonly containers: readonly ContainerMeasure[];
  /** Postgres's OOM kills during the scenario, its restarts and whether it ran at the end (null where not read). */
  readonly postgres: { readonly oomKills: number | null; readonly restarts: number | null; readonly running: boolean | null };
  /** Jobs that ran during the scenario, from pg-boss's job table, by queue, with their seconds. */
  readonly jobs: readonly { readonly name: string; readonly count: number; readonly seconds: number }[];
  /** The scenario's runs the platform's log shows it pricing or emailing (none since PR 6b-3: the consumer prices them). */
  readonly platformPricedRuns: number;
  /**
   * With a static asset origin: requests the pages made to it that the harness served from the web container's own
   * /_next/static/, and those that would have left for it (anything else, or a fetch that failed); null without one.
   */
  readonly staticOrigin: { readonly routed: number; readonly left: number } | null;
}

export interface OracleComparison {
  readonly scenario: string;
  readonly upload: string;
  /** The oracle it was compared with. */
  readonly oracle: OracleKind;
  readonly rows: number;
  /** The upload's Medicare rows (original Medicare and Medicare Advantage without a contract): what the oracle must compare. */
  readonly expectedRows: number;
  readonly storedSha256: string;
  readonly oracleSha256: string;
}

export interface Measurements {
  readonly commit: string;
  readonly runtime: 'docker' | 'process';
  /**
   * The measured images' IDs (`docker image inspect -f {{.Id}}`): on the runner's classic (overlay2) image store, each
   * image's config digest, which the launch check compares with the config digest of the image ECR holds
   * (launch-check.ts, registryImageId); null on the process runtime, which runs no image.
   */
  readonly images: { readonly web: string | null; readonly worker: string | null };
  /** The consumer as measured; null when the settings declare none (the harness then stops). */
  readonly consumer: ConsumerMeasure | null;
  /** The static host the web image was built for, which the harness routed to the web container; null for none. */
  readonly staticAssetOrigin: string | null;
  readonly runner: { readonly cpus: number; readonly memoryMiB: number; readonly cpuModel: string; readonly kernel: string; readonly loadAverage: readonly number[] };
  readonly expected: ExpectedLimits;
  readonly applied: AppliedLimits;
  readonly runnerProblems: readonly string[];
  readonly departures: readonly { readonly what: string; readonly direction: string }[];
  readonly release: {
    readonly releaseNo: number;
    readonly manifestSha256: string;
    readonly records: number;
    /**
     * The ZIP9 file's size (open item O8, PR 6b): its records (one per split ZIP and year), the ranges each holds, and its
     * lines and bytes a year. Absent from a report written before PR 6b.
     */
    readonly zip9?: { readonly records: number; readonly rangesPerRecord: number; readonly linesPerYear: number; readonly bytesPerYear: number };
  };
  readonly shapes: Readonly<Record<string, unknown>>;
  readonly scenarios: readonly ScenarioMeasure[];
  readonly oracle: readonly OracleComparison[];
  /** The scenarios asked for with --scenarios (empty: all). */
  readonly only: readonly string[];
  /** The scenarios the harness's own deadline left unstarted (limits.ts, SCENARIO_START_DEADLINE_MS). */
  readonly notStarted: readonly string[];
  /** A step that could not finish, with what stopped it (a code and a short reason of the harness's own). */
  readonly aborted: string | null;
}

export interface Verdict {
  readonly pass: boolean;
  readonly time: 'open, PR 6b' | 'enforced';
  readonly reasons: readonly string[];
}

/** One run of the repeated scenario: its uploads' times to email and its worst large upload's (null when one has none). */
export interface RepetitionTimes {
  readonly id: string;
  readonly worstLargeUpload: string | null;
  readonly worstLargeMs: number | null;
  readonly uploads: readonly { readonly id: string; readonly ms: number | null }[];
}

/** The repeated scenario's runs as measured and its middle run, the one its time is judged on (null without all three). */
export interface RepeatedScenario {
  readonly scenario: string;
  readonly middle: string | null;
  readonly runs: readonly RepetitionTimes[];
}

/** An upload's time from its submission to its email, or null when it has no submission or no email. */
function elapsedMs(upload: Pick<UploadMeasure, 'submittedMs' | 'emailedMs'>): number | null {
  return upload.submittedMs === null || upload.emailedMs === null ? null : upload.emailedMs - upload.submittedMs;
}

/**
 * The repeated scenario's runs and its middle run (the founder's ruling of 2026-10-23): the runs ordered by their worst
 * large upload's time to email, a run with a large upload never emailed (or never submitted) as the slowest, ties in
 * the order they ran; the middle of the three is the one whose four uploads, the small one included, the time verdict
 * and the sizing question judge. With fewer or more than REPETITIONS runs no middle is taken, and every run's time is
 * judged (such a run fails as partial anyway).
 */
export function repeatedScenario(scenarios: readonly ScenarioMeasure[]): RepeatedScenario {
  const runs = scenarios
    .filter((scenario) => scenario.scenario === REPEATED_SCENARIO && scenario.repetition !== null)
    .map((scenario): RepetitionTimes => {
      let worst: { readonly id: string; readonly ms: number | null } | null = null;
      for (const upload of scenario.uploads.filter((item) => !item.behind)) {
        const ms = elapsedMs(upload);
        if (worst === null || (worst.ms !== null && (ms === null || ms > worst.ms))) {
          worst = { id: upload.id, ms };
        }
      }
      return { id: scenario.id, worstLargeUpload: worst?.id ?? null, worstLargeMs: worst?.ms ?? null, uploads: scenario.uploads.map((upload) => ({ id: upload.id, ms: elapsedMs(upload) })) };
    });
  // A stable sort: runs that tie keep the order they ran in (two never-emailed runs compare equal).
  const slowness = (run: RepetitionTimes) => run.worstLargeMs ?? Number.POSITIVE_INFINITY;
  const ordered = [...runs].sort((a, b) => (slowness(a) === slowness(b) ? 0 : slowness(a) - slowness(b)));
  const middle = runs.length === REPETITIONS ? (ordered[(REPETITIONS - 1) / 2]?.id ?? null) : null;
  return { scenario: REPEATED_SCENARIO, middle, runs };
}

/** Whether a scenario's uploads are judged on time: every scenario run once, and the repeated one's middle run alone. */
function judgedOnTime(scenario: ScenarioMeasure, middle: string | null): boolean {
  return scenario.repetition === null || middle === null || scenario.id === middle;
}

/** An upload as the report and the log name it: S1-1, or S4#2 S4-1 in a run of the repeated scenario. */
export function uploadLabel(scenario: Pick<ScenarioMeasure, 'id' | 'repetition'>, upload: Pick<UploadMeasure, 'id'>): string {
  return scenario.repetition === null ? upload.id : `${scenario.id} ${upload.id}`;
}

/**
 * What an upload's label says when it is of S4's middle run (S4#2 S4-1 with S4#2 the middle, say), with the apostrophe
 * of the sentence it goes in; nothing for any other upload, or when no middle run was taken.
 */
export function middleRunNote(label: string, middle: string | null, apostrophe: "'" | '’'): string {
  return middle !== null && label.startsWith(`${middle} `) ? ` (the middle of ${REPEATED_SCENARIO}${apostrophe}s three runs)` : '';
}

/** The repeated scenario's runs in one line, for the job's log and the summary: every run's times and which was the middle. */
export function repeatedSummary(repeated: RepeatedScenario): string {
  const count = repeated.runs.length === REPETITIONS ? 'three times' : `${String(repeated.runs.length)} of three times`;
  const runs = repeated.runs.map((run) => {
    const times = run.uploads.map((upload) => seconds(upload.ms));
    return `${run.id} ${times.length > 1 ? `${times.slice(0, -1).join(', ')} and ${times.at(-1) ?? ''}` : (times[0] ?? 'no upload')} s`;
  });
  const head = `${repeated.scenario} ran ${count} (the founder's ruling of 2026-10-23): ${runs.length === 0 ? 'no run measured' : runs.join('; ')}.`;
  const middle = repeated.runs.find((run) => run.id === repeated.middle);
  if (middle === undefined) {
    return `${head} With fewer than three runs no middle run is taken: every run's uploads are judged on time.`;
  }
  return `${head} Ordered by each run's worst large upload, the middle run is ${middle.id} (${seconds(middle.worstLargeMs)} s): its four uploads are judged against the 48-s line and the 44-s question, and every other check holds in all three runs.`;
}

/** The run's verdict under the rule (see the module comment). */
export function verdict(measured: Measurements, rule: TimeRule): Verdict {
  const reasons: string[] = [];
  if (measured.aborted !== null) {
    reasons.push(`run not finished: ${measured.aborted}`);
  }
  if (rule.consumerDeclared && !rule.consumerRun) {
    reasons.push('consumer not run: environments.ts declares the screening consumer, and the harness still prices screenings in the platform container one at a time');
  }
  if (rule.consumerDeclared && measured.consumer === null) {
    reasons.push('consumer not measured: environments.ts declares the screening consumer, and the report names none');
  }
  const ids = measured.scenarios.map((scenario) => scenario.id);
  if (ids.join(',') !== MEASURED_SCENARIOS.join(',')) {
    reasons.push(`partial run: measured ${ids.length === 0 ? 'no scenario' : ids.join(', ')}; a verdict needs ${MEASURED_SCENARIOS.join(', ')}${measured.only.length === 0 ? '' : ` (asked for ${measured.only.join(', ')})`}`);
  }
  // S4's time is judged on its middle run; every other check below holds in each of its runs.
  const { middle } = repeatedScenario(measured.scenarios);
  if (measured.notStarted.length > 0) {
    reasons.push(`deadline: ${measured.notStarted.join(', ')} not started inside the harness's budget`);
  }
  reasons.push(...measured.runnerProblems.map((problem) => `runner too small: ${problem}`));
  reasons.push(...limitProblems(measured.applied, measured.expected).map((problem) => `limit not applied: ${problem}`));
  for (const scenario of measured.scenarios) {
    if (scenario.coldStart !== null && (!scenario.coldStart.restarted || !scenario.coldStart.cacheDropped)) {
      reasons.push(`cold start not applied: ${scenario.id} (Postgres restarted: ${scenario.coldStart.restarted ? 'yes' : 'no'}, page cache dropped: ${scenario.coldStart.cacheDropped ? 'yes' : 'no'})`);
    }
    const database = scenario.postgres;
    if ((database.oomKills ?? 0) > 0) {
      reasons.push(`OOM kill: ${scenario.id} postgres`);
    }
    if ((database.restarts ?? 0) > 0 || database.running === false) {
      reasons.push(`restart or exit: ${scenario.id} postgres`);
    }
    if (measured.runtime === 'docker' && (database.oomKills === null || database.restarts === null || database.running === null)) {
      reasons.push(`postgres's state not read: ${scenario.id}`);
    }
    const large = scenario.uploads.filter((item) => !item.behind);
    for (const small of scenario.uploads.filter((item) => item.behind)) {
      const times = [small, ...large].map((item) => [item.jobCreatedMs, item.jobStartedMs]);
      if (times.some(([created, started]) => created === null || started === null)) {
        reasons.push(`queue order not recorded: ${uploadLabel(scenario, small)}`);
      } else if (large.some((item) => (item.jobCreatedMs ?? 0) > (small.jobCreatedMs ?? 0) || (item.jobStartedMs ?? 0) > (small.jobStartedMs ?? 0))) {
        // pg-boss takes jobs by priority, then age: the small one, queued last at the same priority, starts last.
        reasons.push(`queue order: ${uploadLabel(scenario, small)} was not queued and started behind the scenario's large uploads`);
      }
    }
    const slots = measured.consumer === null ? 0 : measured.consumer.tasks * measured.consumer.concurrency;
    const atOnce = Math.min(large.length, slots);
    if (atOnce > 1) {
      // The consumer's slots, used at once (the design's binding case: three worst uploads priced in parallel): none of
      // the first `atOnce` large uploads waits for another to finish, so each starts before the next email of the
      // scenario's other large uploads after its job was queued. One queued after another had finished waited for none.
      const first = [...large].sort((a, b) => (a.jobCreatedMs ?? Number.POSITIVE_INFINITY) - (b.jobCreatedMs ?? Number.POSITIVE_INFINITY)).slice(0, atOnce);
      const waited = first.filter((item) => {
        if (item.jobCreatedMs === null || item.jobStartedMs === null) {
          return true;
        }
        const queued = item.jobCreatedMs;
        const nextEmail = Math.min(...large.filter((other) => other !== item && other.emailedMs !== null && other.emailedMs >= queued).map((other) => other.emailedMs ?? Number.POSITIVE_INFINITY));
        return item.jobStartedMs >= nextEmail;
      });
      if (waited.length > 0) {
        reasons.push(`slots not used: ${scenario.id}'s first ${String(atOnce)} large uploads were not priced at once (${String(slots)} declared; ${waited.map((item) => item.id).join(', ')} waited)`);
      }
    }
    if (scenario.platformPricedRuns > 0) {
      reasons.push(`platform priced a screening: ${scenario.id} (${String(scenario.platformPricedRuns)} run${scenario.platformPricedRuns === 1 ? '' : 's'})`);
    }
    if (scenario.staticOrigin !== null && scenario.staticOrigin.left > 0) {
      reasons.push(`request left for the static origin: ${scenario.id} (${String(scenario.staticOrigin.left)})`);
    }
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
      const where = uploadLabel(scenario, upload);
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
      if (upload.emailedMs !== null && upload.submittedMs === null) {
        reasons.push(`submission time not captured: ${where}`);
      }
      if (upload.waitReason !== null || upload.logged?.tier === 'waiting') {
        // Every scenario upload is a different prospect's (one account each) inside the day's cap: none may wait (Q7).
        reasons.push(`waiting tier: ${where} (${upload.waitReason ?? 'logged as waiting'}, priority ${String(upload.queuePriority)})`);
      }
      if (upload.submittedMs !== null && upload.emailedMs !== null) {
        const elapsed = upload.emailedMs - upload.submittedMs;
        const time = timeVerdict(elapsed, rule);
        if (time.status === 'fail' && judgedOnTime(scenario, middle)) {
          reasons.push(`time: ${where} ${(elapsed / 1000).toFixed(1)} s${middleRunNote(where, middle, "'")}, ${timeLabel(time)}`);
        }
        reasons.push(...timeMetricProblems(upload, elapsed, where));
      }
    }
  }
  for (const upload of ORACLE_UPLOADS) {
    const comparison = measured.oracle.find((item) => item.upload === upload);
    if (comparison === undefined) {
      reasons.push(`oracle not compared: ${upload}`);
      continue;
    }
    if (comparison.rows <= 0 || comparison.rows !== comparison.expectedRows) {
      reasons.push(`oracle compared ${String(comparison.rows)} rows of ${upload}, not its ${String(comparison.expectedRows)} Medicare rows`);
    }
    if (comparison.oracle !== oracleKind(upload)) {
      reasons.push(`oracle: ${upload} compared with ${comparison.oracle}, not ${oracleKind(upload)}`);
    }
    if (comparison.storedSha256 !== comparison.oracleSha256) {
      reasons.push(`oracle mismatch: ${upload}`);
    }
  }
  return { pass: reasons.length === 0, time: rule.consumerDeclared ? 'enforced' : 'open, PR 6b', reasons };
}

/**
 * When an upload's time starts for the harness: the moment it clicked "Screen the file", once the page has sent its POST
 * (null when it never did: the submission was not captured). The click comes before the POST leaves the browser, so the
 * start is never later than the web's receipt, which the proxy stamps when the POST's headers arrive. The request event
 * Playwright raises is not: it reaches the harness after the POST has left, and the web received S1-1's 81 ms before
 * the harness heard of it.
 */
export function uploadStart(clickedAt: number | null, posted: boolean): number | null {
  return posted ? clickedAt : null;
}

/**
 * The time metric's bounds (the design's §5.3): the consumer's logged elapsed_ms for the upload's run is never above the
 * time from the harness's click to the line itself (the metric starts at the web's received_at, after the click and the
 * POST, and ends before its line is written), and never more than TIME_METRIC_BELOW_MS below the harness's time (the
 * browser's send and the transfer before received_at), so the metric covers the web's share and the send.
 */
export function timeMetricProblems(upload: UploadMeasure, harnessMs: number, where: string = upload.id): string[] {
  if (upload.logged === null) {
    return [`time metric not logged: ${where}`];
  }
  const ceiling = upload.submittedMs === null ? null : upload.logged.atMs - upload.submittedMs;
  if ((ceiling !== null && upload.logged.elapsedMs > ceiling) || upload.logged.elapsedMs < harnessMs - TIME_METRIC_BELOW_MS) {
    return [
      `time metric out of bounds: ${where} logged ${(upload.logged.elapsedMs / 1000).toFixed(3)} s against the harness's ${(harnessMs / 1000).toFixed(3)} s (at most ${ceiling === null ? '—' : (ceiling / 1000).toFixed(3)} s, at least ${((harnessMs - TIME_METRIC_BELOW_MS) / 1000).toFixed(3)} s)`,
    ];
  }
  return [];
}

export interface Report extends Measurements {
  readonly format: typeof REPORT_FORMAT;
  readonly verdict: Verdict;
  /** S4's three runs and the middle one, which its time is judged on (the founder's ruling of 2026-10-23). */
  readonly repeated: RepeatedScenario;
  /**
   * The slowest time the verdict judges (S4's middle run's, not its other runs'), and whether it is above
   * SIZING_QUESTION_MS: a sizing question for the founder before merge (open item O9), which never changes the verdict.
   */
  readonly sizing: Sizing;
}

export interface Sizing {
  readonly worstUpload: string | null;
  readonly worstMs: number | null;
  readonly question: boolean;
}

/** The sizing question as the measurements give it (report() records it; the launch check reads it again). */
export function sizing(measured: Pick<Measurements, 'scenarios'>): Sizing {
  const worst = worstTime(measured);
  return { worstUpload: worst?.id ?? null, worstMs: worst?.ms ?? null, question: worst !== null && worst.ms > SIZING_QUESTION_MS };
}

export function report(measured: Measurements, rule: TimeRule): Report {
  return {
    format: REPORT_FORMAT,
    ...measured,
    verdict: verdict(measured, rule),
    repeated: repeatedScenario(measured.scenarios),
    sizing: sizing(measured),
  };
}

function seconds(ms: number | null | undefined): string {
  return ms === null || ms === undefined ? '—' : (ms / 1000).toFixed(1);
}

/** The report as Markdown, for the job's summary: one table of uploads, one of containers, then the verdict. */
export function markdown(full: Report, rule: TimeRule): string {
  const lines = [
    `## Screening capacity: ${full.verdict.pass ? 'pass' : 'fail'} (time ${full.verdict.time})`,
    '',
    `Commit \`${full.commit}\`, ${full.runtime} runtime, runner ${String(full.runner.cpus)} CPUs and ${String(full.runner.memoryMiB)} MiB (${full.runner.cpuModel}), load average ${full.runner.loadAverage.map((value) => value.toFixed(2)).join(' ')}. ${consumerLine(full)} Images: web \`${full.images.web ?? 'none (process runtime)'}\`, worker \`${full.images.worker ?? 'none (process runtime)'}\`${full.staticAssetOrigin === null ? '' : `; static origin ${full.staticAssetOrigin} routed to the web container`}. Release ${String(full.release.releaseNo)} (${String(full.release.records)} records${
      full.release.zip9 === undefined
        ? ''
        : `; ZIP9: ${String(full.release.zip9.records)} records of ${String(full.release.zip9.rangesPerRecord)} ranges, ${String(full.release.zip9.linesPerYear)} lines and ${(full.release.zip9.bytesPerYear / MIB).toFixed(1)} MiB a year`
    }).`,
    '',
    '| Upload | Shape | Rows | Seconds to email | Logged (TimeToEmailMs) | Tier | Shared load | Keyed read (records) | Pricing | Recording | Queue wait | Job queued, started | Time |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  // S4's time is judged on its middle run, read from the measurements as the verdict reads them.
  const repeated = repeatedScenario(full.scenarios);
  for (const scenario of full.scenarios) {
    for (const upload of scenario.uploads) {
      const elapsed = elapsedMs(upload);
      const shared = upload.phases.shared_load ?? upload.phases.shared_held;
      const time = elapsed === null ? '—' : judgedOnTime(scenario, repeated.middle) ? timeLabel(timeVerdict(elapsed, rule)) : `not judged (${String(repeated.middle)} is the middle run)`;
      lines.push(
        `| ${uploadLabel(scenario, upload)} | ${upload.shape} | ${String(upload.rows)} | ${seconds(elapsed)} | ${seconds(upload.logged?.elapsedMs)} | ${upload.waitReason ?? upload.logged?.tier ?? '—'} | ${seconds(shared?.elapsedMs)} | ${seconds(upload.phases.keyed_read?.elapsedMs)} (${String(upload.phases.keyed_read?.recordCount ?? '—')}) | ${seconds(upload.phases.pricing?.elapsedMs)} | ${seconds(upload.phases.recording?.elapsedMs)} | ${seconds(upload.queueWaitMs)} | ${seconds(upload.jobCreatedMs)}, ${seconds(upload.jobStartedMs)} | ${time} |`,
      );
    }
  }
  if (repeated.runs.length > 0) {
    lines.push('', repeatedSummary(repeated));
  }
  lines.push('', '| Scenario | Container | Anonymous peak (MiB) | Limit (MiB) | memory.peak (MiB) | Limit reached | OOM kills | Throttled periods |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const scenario of full.scenarios) {
    for (const container of scenario.containers) {
      lines.push(
        `| ${scenario.id} | ${container.name} | ${(container.anonPeakBytes / MIB).toFixed(1)} | ${(container.limitBytes / MIB).toFixed(0)} | ${container.memoryPeakBytes === null ? '—' : (container.memoryPeakBytes / MIB).toFixed(1)} | ${String(container.events.max)} | ${String(container.events.oomKill)} | ${container.throttling === null ? '—' : `${String(container.throttling.throttledPeriods)} of ${String(container.throttling.periods)}`} |`,
      );
    }
  }
  const worst = worstTime(full);
  if (worst !== null && worst.ms > SIZING_QUESTION_MS) {
    lines.push(
      '',
      `Sizing question for the founder (open item O9): the worst time, ${worst.id}’s ${(worst.ms / 1000).toFixed(1)} s${middleRunNote(worst.id, repeated.middle, '’')}, is above ${String(SIZING_QUESTION_MS / 1000)} s, within 8% of the 48-s line. This is reported before merge as a question of the consumer's size, not a pass to rely on or a limit to widen.`,
    );
  }
  lines.push('', full.verdict.reasons.length === 0 ? 'Every check the build controls passed.' : 'Failing checks:', ...full.verdict.reasons.map((reason) => `- ${reason}`), '');
  return lines.join('\n');
}

/** The consumer as the summary states it. */
function consumerLine(full: Report): string {
  const consumer = full.consumer;
  return consumer === null
    ? 'No screening consumer measured.'
    : `Screening consumer: ${String(consumer.tasks)} task${consumer.tasks === 1 ? '' : 's'} of ${String(consumer.cpus)} vCPU and ${String(consumer.memoryMiB)} MiB, ${String(consumer.concurrency)} screenings at once each.`;
}

/**
 * Above this, a passing worst time is within 8% of the 48-s allowance: the design's §2.4 and open item O9 send it to the
 * founder as a sizing question before merge, never as a tuning or a wider limit.
 */
export const SIZING_QUESTION_MS = 44_000;

/**
 * The slowest time to email the verdict judges, or null when none was emailed: every scenario's uploads but S4's, and
 * S4's middle run's (S4#2 S4-1, say), never its other runs' (the founder's ruling of 2026-10-23).
 */
export function worstTime(full: Pick<Measurements, 'scenarios'>): { readonly id: string; readonly ms: number } | null {
  const { middle } = repeatedScenario(full.scenarios);
  let worst: { readonly id: string; readonly ms: number } | null = null;
  for (const scenario of full.scenarios.filter((item) => judgedOnTime(item, middle))) {
    for (const upload of scenario.uploads) {
      const ms = elapsedMs(upload);
      if (ms !== null && (worst === null || ms > worst.ms)) {
        worst = { id: uploadLabel(scenario, upload), ms };
      }
    }
  }
  return worst;
}

/**
 * The sizing question's one line (O9; the design's §2.4): the worst upload the verdict judges and its time (S4's from its
 * middle run), above the 44-s line, numbers and an upload's label only. run.ts says it in the job's log, annotates the job with it as a warning and hands it to the
 * gate, so it reaches the pull request's checks and not the log alone.
 */
export function sizingQuestion(worst: { readonly worstUpload: string | null; readonly worstMs: number | null }, middle: string | null = null): string {
  const upload = worst.worstUpload ?? 'an upload';
  return `the worst time, ${upload}'s ${((worst.worstMs ?? 0) / 1000).toFixed(1)} s${middleRunNote(upload, middle, "'")}, is above 44 s: the consumer's size goes to the founder before merge`;
}
