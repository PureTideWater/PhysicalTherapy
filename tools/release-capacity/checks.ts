import { TRACE_LOCK_BUCKETS } from '../../apps/worker/src/parse/loader';

/**
 * The weekly real-size test's verdict (audit #31; docs/adr/0071; docs/adr/0083; tools/release-capacity/run.ts): pure,
 * over what the harness read back, so every fail condition is unit-tested (checks.test.ts). It fails on any job not
 * finished complete, the concurrent phase's six and the large jobs together's seven included; a measured job that
 * completed on a later attempt than its first, or whose attempts could not be read; the run not complete; a priced-line
 * count other than the measured period's lines, parsed claims other than the 835s held, or posted entries other than
 * A's actionable lines (A's reconcile); an OOM kill or a restart of the worker; the worker's memory.peak above 90% of
 * its task's memory over the whole run, or memory.current sampled above it in any phase or chain job (SAMPLED_PERIODS),
 * or any of these sampled fewer than once each 2 seconds; a backend holding more than ADVISORY_LOCKS_PER_TRANSACTION
 * advisory locks at any sample over the run; a job's live heap above HEAP_LIVE_PERCENT of its heap limit, or a measured
 * job that logged no `job heap` line (D19); a worker log line with error_code RELEASE_READ_OUTSIDE_FETCH or JOB_FAILED;
 * and any of these that could not be read (fail closed). Times are recorded and advisory, as the founder ruled for the
 * screening's test (2026-10-23, reconciliation-001.md).
 */

/** The share of the worker task's memory its memory.peak may reach (921.6 MiB of 1,024). */
export const MEMORY_PEAK_PERCENT = 90;

/** The worker log's error codes that fail the run: a read outside the keyed fetch, and a job's last failed attempt. */
export const FAILING_ERROR_CODES = ['RELEASE_READ_OUTSIDE_FETCH', 'JOB_FAILED'] as const;

/** The longest a sampled period's memory may go unsampled on average: each is sampled each second. */
export const PHASE_SAMPLE_GAP_MS = 2_000;

/** The windows query's advisory budget, cold (docs/adr/0071; 5.9). */
export const WINDOWS_COLD_BUDGET_MS = 5_000;

/**
 * The most advisory locks one backend may hold at any sample (D10): the loader's bound, one per bucket of trace forms
 * (apps/worker/src/parse/loader.ts), imported so the two never drift. Triage, the report and reconcile hold one each
 * (the practice's lock), since a line's stage lock is its head row (docs/adr/0083).
 */
export const ADVISORY_LOCKS_PER_TRANSACTION: number = TRACE_LOCK_BUCKETS;

/** The share of its heap limit a job's live heap may reach (D19's `job heap` line; 420 of 560 MiB). */
export const HEAP_LIVE_PERCENT = 75;

/** The jobs the harness queues in each phase: the concurrent phase's six, and the large jobs together's seven (D20). */
export const CONCURRENT_JOBS = 6;
export const TOGETHER_JOBS = 7;

/**
 * Where a job ran. Setup's jobs (B's and D's price jobs, B's triage) prepare the measurement and are not measured; every
 * other phase's are: the concurrent phase, the chain (A's triage, then A's audit report), A's reconcile (its reprocessing
 * 835s parsed, then the reconcile job) and the large jobs together.
 */
export type JobPhase = 'setup' | 'concurrent' | 'chain' | 'reconcile' | 'together';

/** How a failing check names a measured job's phase. */
const PHASE_NAMES: Readonly<Record<JobPhase, string | null>> = { setup: null, concurrent: 'concurrent phase', chain: 'the chain', reconcile: 'A’s reconcile', together: 'the large jobs together' };

/** One job's `job heap` lines (D19), the largest of its attempts': its live heap peak and its heap limit, in MiB. */
export interface JobHeap {
  readonly peakMib: number;
  readonly limitMib: number;
}

/** One job the harness queued, and how it ended (pg-boss's state; null when it could not be read). */
export interface JobOutcome {
  /** What the job is, as the summary names it: `A price`, `B audit_report`, `C parse_835 2`. */
  readonly what: string;
  readonly name: string;
  readonly phase: JobPhase;
  readonly jobId: string | null;
  readonly state: string | null;
  /** From its start to its end, by pg-boss's own times (advisory); null when not finished. */
  readonly elapsedMs: number | null;
  /** The attempt it ended on (pg-boss's retry_count, plus one); null when it could not be read. */
  readonly attempts: number | null;
  /** Its `job heap` lines from the worker's log; null when it logged none or the log could not be read. */
  readonly heap: JobHeap | null;
}

/** memory.current sampled every second over one phase or chain job. */
export interface SampledPeriod {
  /** What was sampled, as a failing check names it: `the concurrent phase`, `A’s triage`. */
  readonly what: string;
  /** The highest sample; null when none could be read. */
  readonly peakBytes: number | null;
  readonly samples: number;
  /** How long it was sampled for; null when unknown. */
  readonly ms: number | null;
}

/** The periods every run samples (D10, D20, step 7b): each phase, and each chain job alone. */
export const SAMPLED_PERIODS = ['the concurrent phase', 'A’s triage', 'A’s audit report', 'A’s reconcile', 'the large jobs together'] as const;

/** The largest advisory-lock count any one backend held, sampled every second over the run. */
export interface AdvisoryLockSamples {
  readonly peak: number;
  readonly samples: number;
}

export interface WorkerMemory {
  readonly limitBytes: number;
  /** The container's memory.peak at the end (v2; v1's max_usage_in_bytes): the whole run. */
  readonly peakBytes: number | null;
  /** Each of SAMPLED_PERIODS, memory.current sampled every second (the harness cannot reset memory.peak). */
  readonly periods: readonly SampledPeriod[];
  /** The kernel's OOM kills in the container's cgroup (memory.events), null when unread. */
  readonly oomKills: number | null;
  readonly oomKilled: boolean | null;
  readonly restarts: number | null;
  /** Whether the worker was still running when the harness read it, before stopping it. */
  readonly running: boolean | null;
}

/** The web's windows query on the release (5.9), cold and warm; advisory. */
export interface WindowsQuery {
  readonly coldMs: number;
  readonly warmMs: number;
  readonly coldRestarted: boolean;
  readonly cacheDropped: boolean;
  readonly contents: number;
  /** Its EXPLAIN (ANALYZE, BUFFERS) on the warm cache: plan nodes and counts only (rule_record holds no PHI). */
  readonly plan: string | null;
}

export interface CapacityMeasurements {
  readonly commit: string;
  readonly runtime: 'docker' | 'process';
  readonly small: boolean;
  readonly runner: { readonly cpus: number; readonly memoryMiB: number; readonly cpuModel: string; readonly kernel: string };
  /** The worker task's limits and the heap flag its command ran with. */
  readonly worker: { readonly cpus: number; readonly memoryMiB: number; readonly cpuset: string; readonly command: readonly string[] };
  readonly release: { readonly releaseNo: number; readonly records: number; readonly manifestSha256: string };
  /** What the counts must be: A's lines, C's claims (both sets), and a posted entry for each of A's actionable lines. */
  readonly expected: { readonly pricedLines: number; readonly parsedClaims: number; readonly postedEntries: number };
  readonly jobs: readonly JobOutcome[];
  /** A's run as it ended; null when it could not be read. */
  readonly run: { readonly status: string; readonly failureCode: string | null } | null;
  readonly pricedLines: number | null;
  readonly parsedClaims: number | null;
  /** A's posted entries after its reconcile; null when they could not be counted. */
  readonly postedEntries: number | null;
  readonly memory: WorkerMemory;
  /** null when the sampler could not run. */
  readonly advisoryLocks: AdvisoryLockSamples | null;
  /** The worker log's lines by error_code; null when the log could not be read. */
  readonly errorCodes: Readonly<Record<string, number>> | null;
  readonly windows: WindowsQuery | null;
  /** Setup and phase times (advisory). */
  readonly times: Readonly<Record<string, number>>;
  /** Why the run stopped before it read everything back, or null. */
  readonly aborted: string | null;
}

export interface Verdict {
  readonly pass: boolean;
  readonly reasons: readonly string[];
  /** Advisory findings: a time above its budget. They fail nothing. */
  readonly advisories: readonly string[];
}

/** The worker log's lines by error_code (JSON lines; anything else is skipped). */
export function errorCodes(lines: Iterable<string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const line of lines) {
    const start = line.indexOf('{');
    if (start === -1) {
      continue;
    }
    try {
      const entry = JSON.parse(line.slice(start)) as { error_code?: unknown };
      if (typeof entry.error_code === 'string') {
        counts[entry.error_code] = (counts[entry.error_code] ?? 0) + 1;
      }
    } catch {
      // Not a log line of the worker's.
    }
  }
  return counts;
}

/** The worker log's `job heap` lines (D19) by job ID: the largest live heap peak of the job's attempts, with its limit. */
export function jobHeaps(lines: Iterable<string>): Map<string, JobHeap> {
  const heaps = new Map<string, JobHeap>();
  for (const line of lines) {
    const start = line.indexOf('{');
    if (start === -1 || !line.includes('"job heap"')) {
      continue;
    }
    try {
      const entry = JSON.parse(line.slice(start)) as { msg?: unknown; job_id?: unknown; heap_live_peak_mib?: unknown; heap_limit_mib?: unknown };
      const { job_id: jobId, heap_live_peak_mib: peakMib, heap_limit_mib: limitMib } = entry;
      if (entry.msg !== 'job heap' || typeof jobId !== 'string' || typeof peakMib !== 'number' || typeof limitMib !== 'number' || !Number.isFinite(peakMib) || !(limitMib > 0)) {
        continue;
      }
      const seen = heaps.get(jobId);
      if (seen === undefined || peakMib > seen.peakMib) {
        heaps.set(jobId, { peakMib, limitMib });
      }
    } catch {
      // Not a log line of the worker's.
    }
  }
  return heaps;
}

/** Bytes as MiB, to a tenth where it is not whole (90% of 1,024 MiB is 921.6). */
const mib = (bytes: number) => `${String(Number((bytes / 1024 / 1024).toFixed(1)))} MiB`;

/** The verdict: every reason the run fails, and the advisories. */
export function verdict(m: CapacityMeasurements): Verdict {
  const reasons: string[] = [];
  if (m.aborted !== null) {
    reasons.push(`the run stopped before it was read back: ${m.aborted}`);
  }
  for (const job of m.jobs) {
    const phase = PHASE_NAMES[job.phase];
    const where = phase === null ? '' : ` (${phase})`;
    if (job.state !== 'completed') {
      reasons.push(`${job.what} (${job.name}) ${job.state === null ? 'could not be read' : `ended ${job.state}, not completed`}${where}`);
    } else if (phase !== null) {
      // A measured job a retry rescued: a person in production would have waited on the failed attempt (D10).
      if (job.attempts === null) {
        reasons.push(`${job.what} (${job.name}) completed, but its attempts could not be read${where}`);
      } else if (job.attempts > 1) {
        reasons.push(`${job.what} (${job.name}) completed on attempt ${String(job.attempts)}, not its first${where}`);
      }
      if (job.heap === null) {
        reasons.push(`${job.what} (${job.name}) logged no job heap line${where}`);
      }
    }
    if (job.heap !== null && job.heap.peakMib > (job.heap.limitMib * HEAP_LIVE_PERCENT) / 100) {
      reasons.push(`${job.what} (${job.name}${job.jobId === null ? '' : ` ${job.jobId}`}) had a live heap of ${String(job.heap.peakMib)} MiB, above ${String(HEAP_LIVE_PERCENT)}% of its ${String(job.heap.limitMib)} MiB limit (${String((job.heap.limitMib * HEAP_LIVE_PERCENT) / 100)} MiB)${where}`);
    }
  }
  for (const [phase, wanted, names] of [
    ['concurrent', CONCURRENT_JOBS, 'six (A’s price job, B’s audit report and C’s four parses)'],
    ['together', TOGETHER_JOBS, 'seven (A’s second audit report, D’s triage, E’s price job and C’s four parses)'],
  ] as const) {
    const queued = m.jobs.filter((job) => job.phase === phase).length;
    if (queued !== wanted) {
      reasons.push(`${phase === 'concurrent' ? 'the concurrent phase' : 'the large jobs together'} queued ${String(queued)} jobs, not ${names}`);
    }
  }
  if (m.run === null) {
    reasons.push('the measured run could not be read');
  } else if (m.run.status !== 'complete') {
    reasons.push(`the measured run is ${m.run.status}${m.run.failureCode === null ? '' : ` (${m.run.failureCode})`}, not complete`);
  }
  if (m.pricedLines !== m.expected.pricedLines) {
    reasons.push(m.pricedLines === null ? 'the priced lines could not be counted' : `${String(m.pricedLines)} priced lines, not ${String(m.expected.pricedLines)}`);
  }
  if (m.parsedClaims !== m.expected.parsedClaims) {
    reasons.push(m.parsedClaims === null ? 'the parsed claims could not be counted' : `${String(m.parsedClaims)} parsed claims, not ${String(m.expected.parsedClaims)}`);
  }
  if (m.postedEntries !== m.expected.postedEntries) {
    reasons.push(m.postedEntries === null ? 'A’s posted entries could not be counted' : `${String(m.postedEntries)} posted entries for A, not ${String(m.expected.postedEntries)} (one for each actionable line)`);
  }
  const { memory } = m;
  if (memory.oomKilled === null || memory.oomKills === null) {
    reasons.push('the worker’s OOM kills could not be read');
  } else if (memory.oomKilled || memory.oomKills > 0) {
    reasons.push(`the worker was killed for memory (${String(memory.oomKills)} OOM kills in its cgroup)`);
  }
  if (memory.restarts === null || memory.running === null) {
    reasons.push('the worker’s restarts could not be read');
  } else if (memory.restarts > 0 || !memory.running) {
    reasons.push(memory.restarts > 0 ? `the worker restarted ${String(memory.restarts)} times` : 'the worker had exited before the end');
  }
  const ceiling = (memory.limitBytes * MEMORY_PEAK_PERCENT) / 100;
  const above = (value: number) => `${mib(value)}, above ${String(MEMORY_PEAK_PERCENT)}% of its ${mib(memory.limitBytes)} (${mib(ceiling)})`;
  if (memory.peakBytes === null) {
    reasons.push('the worker’s memory peak over the whole run could not be read');
  } else if (memory.peakBytes > ceiling) {
    reasons.push(`the worker’s memory peak over the whole run is ${above(memory.peakBytes)}`);
  }
  for (const what of SAMPLED_PERIODS) {
    const period = memory.periods.find((entry) => entry.what === what);
    if (period?.peakBytes === null || period?.peakBytes === undefined) {
      reasons.push(`the worker’s memory peak over ${what} could not be read`);
      continue;
    }
    if (period.peakBytes > ceiling) {
      reasons.push(`the worker’s memory peak over ${what} is ${above(period.peakBytes)}`);
    }
    // Sampled each second, a period with half its samples missing did not see its peak (int-surfaces improvement 5).
    const fewestSamples = period.ms === null ? 1 : Math.max(1, Math.floor(period.ms / PHASE_SAMPLE_GAP_MS));
    if (period.samples < fewestSamples) {
      reasons.push(`${what}’s memory was sampled ${String(period.samples)} times in ${seconds(period.ms)}, fewer than one each ${String(PHASE_SAMPLE_GAP_MS / 1000)} seconds (${String(fewestSamples)})`);
    }
  }
  if (m.advisoryLocks === null || m.advisoryLocks.samples === 0) {
    reasons.push('the advisory locks held could not be sampled');
  } else if (m.advisoryLocks.peak > ADVISORY_LOCKS_PER_TRANSACTION) {
    reasons.push(`a backend held ${String(m.advisoryLocks.peak)} advisory locks at once, above ${String(ADVISORY_LOCKS_PER_TRANSACTION)} (a lock per line or per row is back)`);
  }
  if (m.errorCodes === null) {
    reasons.push('the worker’s log could not be read');
  } else {
    for (const code of FAILING_ERROR_CODES) {
      const count = m.errorCodes[code] ?? 0;
      if (count > 0) {
        reasons.push(`the worker logged ${code} ${String(count)} times`);
      }
    }
  }
  const advisories: string[] = [];
  if (m.windows === null) {
    advisories.push('the windows query was not measured');
  } else if (m.windows.coldMs > WINDOWS_COLD_BUDGET_MS) {
    advisories.push(`the windows query took ${String(m.windows.coldMs)} ms cold, above its ${String(WINDOWS_COLD_BUDGET_MS)} ms budget (advisory)`);
  }
  return { pass: reasons.length === 0, reasons, advisories };
}

/**
 * The advisory lines as the capacity job's `advisories` output: base64 of the lines, one per line, so no line can end
 * the output early; empty when there are none, which keeps the notify job from running on a pass (fix round S3).
 */
export function advisoriesOutput(advisories: readonly string[]): string {
  return advisories.length === 0 ? '' : Buffer.from(advisories.join('\n'), 'utf8').toString('base64');
}

/** release-capacity.json: the measurements and their verdict. */
export function report(m: CapacityMeasurements): CapacityMeasurements & { readonly verdict: Verdict } {
  return { ...m, verdict: verdict(m) };
}

const seconds = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`);

/** summary.md: the verdict, the jobs, the counts, memory and the advisory times. */
export function markdown(full: ReturnType<typeof report>): string {
  const { verdict: result, memory } = full;
  return [
    `# Release capacity: ${result.pass ? 'pass' : 'fail'}${full.small ? ' (smoke size)' : ''}`,
    '',
    `Commit \`${full.commit}\`, release ${String(full.release.releaseNo)} (${String(full.release.records)} records), the worker at ${String(full.worker.cpus)} vCPU and ${String(full.worker.memoryMiB)} MiB running \`${full.worker.command.join(' ')}\` on CPUs ${full.worker.cpuset}; ${full.runtime} runtime on ${String(full.runner.cpus)} CPUs.`,
    '',
    ...(result.reasons.length === 0 ? ['Every check passed.'] : ['Failing checks:', '', ...result.reasons.map((reason) => `- ${reason}`)]),
    ...(result.advisories.length === 0 ? [] : ['', 'Advisory:', '', ...result.advisories.map((advisory) => `- ${advisory}`)]),
    '',
    '| Job | Phase | State | Attempts | Live heap | Time |',
    '| --- | --- | --- | --- | --- | --- |',
    ...full.jobs.map(
      (job) =>
        `| ${job.what} | ${job.phase} | ${job.state ?? 'unread'} | ${job.attempts === null ? 'unread' : String(job.attempts)} | ${job.heap === null ? 'none' : `${String(job.heap.peakMib)} of ${String(job.heap.limitMib)} MiB`} | ${seconds(job.elapsedMs)} |`,
    ),
    '',
    `Run: ${full.run === null ? 'unread' : `${full.run.status}${full.run.failureCode === null ? '' : ` (${full.run.failureCode})`}`}; priced lines ${full.pricedLines === null ? 'unread' : String(full.pricedLines)} of ${String(full.expected.pricedLines)}; parsed claims ${full.parsedClaims === null ? 'unread' : String(full.parsedClaims)} of ${String(full.expected.parsedClaims)}; A’s posted entries ${full.postedEntries === null ? 'unread' : String(full.postedEntries)} of ${String(full.expected.postedEntries)}.`,
    '',
    `Memory: peak ${memory.peakBytes === null ? 'unread' : mib(memory.peakBytes)} over the run, of ${mib(memory.limitBytes)}; ${memory.periods.map((period) => `${period.peakBytes === null ? 'unread' : mib(period.peakBytes)} over ${period.what} (${String(period.samples)} samples)`).join(', ')}; OOM kills ${memory.oomKills === null ? 'unread' : String(memory.oomKills)}, restarts ${memory.restarts === null ? 'unread' : String(memory.restarts)}.`,
    '',
    `Advisory locks: at most ${full.advisoryLocks === null ? 'unread' : `${String(full.advisoryLocks.peak)} held by one backend (${String(full.advisoryLocks.samples)} samples)`}, of ${String(ADVISORY_LOCKS_PER_TRANSACTION)}.`,
    '',
    `Windows query: ${full.windows === null ? 'not measured' : `${String(full.windows.coldMs)} ms cold${full.windows.cacheDropped ? ' (page cache dropped)' : ''}, ${String(full.windows.warmMs)} ms warm, ${String(full.windows.contents)} contents`}.`,
    '',
    'Times (advisory):',
    '',
    ...Object.entries(full.times).map(([what, ms]) => `- ${what}: ${seconds(ms)}`),
    '',
  ].join('\n');
}
