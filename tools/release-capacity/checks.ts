import { TRACE_LOCK_BUCKETS } from '../../apps/worker/src/parse/loader';

/**
 * The weekly real-size test's verdict (audit #31; docs/adr/0071; docs/adr/0083; tools/release-capacity/run.ts): pure,
 * over what the harness read back, so every fail condition is unit-tested (checks.test.ts). It fails on any job not
 * finished complete, the concurrent phase's six and the large jobs together's seven included; a measured job that
 * completed on a later attempt than its first, or whose attempts could not be read; the run not complete; a priced-line
 * count other than the measured period's lines, parsed claims other than the 835s held, F's lines posted other than its
 * actionable lines or posted other than in full (step 7b's reconcile, on F, a practice of its own), F's triage making
 * other than each of its lines actionable, or none at all (a reconcile of nothing measures nothing); A's triage making
 * other than the lines the scenario makes actionable, or none (A keeps its full month for triage and reports); an OOM
 * kill or a restart of the worker, or any oom or oom_kill event memory.events counts between the worker's start and the
 * end; the worker's working set (memory.current less inactive_file, sampled each second) above 90% of its task's memory
 * over the whole run or in any phase or chain job (SAMPLED_PERIODS), or any of these sampled fewer than once each 2
 * seconds; a backend holding more than ADVISORY_LOCKS_PER_TRANSACTION advisory locks at any sample over the run; a
 * job's live heap above HEAP_LIVE_PERCENT of its heap limit, or a measured job that logged no `job heap` line (D19); a
 * worker log line with error_code RELEASE_READ_OUTSIDE_FETCH or JOB_FAILED; and any of these that could not be read
 * (fail closed). memory.peak and the memory by kind are reported beside the working set, never judged. Times are
 * recorded and advisory, as the founder ruled for the screening's test (2026-10-23, reconciliation-001.md).
 */

/**
 * The share of the worker task's memory its working set may reach (921.6 MiB of 1,024): memory.current less
 * inactive_file, the measure the kubelet and cAdvisor evict on and the one that predicts an OOM kill, since the kernel
 * reclaims inactive page cache first (Lane A's orchestrator, 2026-11-04; docs/adr/0083). The line is the design's and
 * ADR 0062's; memory.peak, page cache included, is reported beside it.
 */
export const MEMORY_PEAK_PERCENT = 90;

/** How a failing check and the summary name the working set and how it is computed. */
export const WORKING_SET = 'working set (memory.current less inactive_file, sampled each second)';

/**
 * The fixed line every summary prints (Lane A's orchestrator, 2026-11-04; test scope, not a founder ruling): step 7b
 * reconciles F, a practice of its own, until SUITE-CAP-3 lands and moves it back to A as its acceptance step.
 */
export const KNOWN_GAP =
  'Known gap: reconcile at full size is SUITE-CAP-3’s tracked item. Step 7b reconciles F, a practice of its own at CAS-42.3’s 2,000 lines (fewer at the smoke size), while A keeps its full month for triage and reports: the reconcile pass’s last measured figure at size is 10,000 lines in 3,412 s, far past a job’s 15-minute attempt. Revisit when SUITE-CAP-3 lands: moving step 7b back to A’s full month is its acceptance step (docs/adr/0083).';

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

/**
 * The heap limit a job's live heap is held to, in MiB: the worker's `--max-old-space-size` flag, the limit the alarm
 * reads (infra/lib/heap.ts), or the limit the job logged when that is lower or the command has no flag. V8's
 * heap_size_limit, which the line logs, adds the young generation to the flag (752 MiB under 560), so 75% of it alone
 * would hold the run to a looser line than production's alarm.
 */
export function heapLimitMib(command: readonly string[], loggedLimitMib: number): number {
  const flag = command.map((part) => /^--max-old-space-size=(\d+)$/.exec(part)?.[1]).find((value) => value !== undefined);
  return flag === undefined ? loggedLimitMib : Math.min(Number.parseInt(flag, 10), loggedLimitMib);
}

/** The jobs the harness queues in each phase: the concurrent phase's six, and the large jobs together's seven (D20). */
export const CONCURRENT_JOBS = 6;
export const TOGETHER_JOBS = 7;

/**
 * Where a job ran. Setup's jobs (B's, D's and F's price jobs, B's and F's triage) prepare the measurement and are not
 * measured; every other phase's are: the concurrent phase, the chain (A's triage, then A's audit report), F's reconcile
 * (step 7b: its reprocessing 835s parsed, then the reconcile job) and the large jobs together.
 */
export type JobPhase = 'setup' | 'concurrent' | 'chain' | 'reconcile' | 'together';

/** How a failing check and the summary's table name a job's phase (setup's jobs are not measured). */
const PHASE_NAMES: Readonly<Record<JobPhase, string>> = { setup: 'setup', concurrent: 'the concurrent phase', chain: 'the chain', reconcile: 'F’s reconcile', together: 'the large jobs together' };

/** How a failing check names a job: its label in the run, its type and its pg-boss ID (release-capacity.json's `jobs[].jobId`). */
const jobLabel = (job: JobOutcome) => `${job.what} (${job.name}${job.jobId === null ? '' : ` ${job.jobId}`})`;

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

/**
 * What the worker's cgroup held at one sample, by kind, from its memory.stat (cgroup v2: `anon`, `file`, `inactive_file`,
 * `shmem`, `kernel`; v1: `total_rss`, `total_cache`, `total_inactive_file` and `total_shmem`, or the same without
 * `total_`, and no kernel line). Anonymous memory is the worker's heap and native memory and Chromium's; the page cache
 * is the image's binaries the container faulted in and the files it wrote, and it counts shared memory (`shmem`,
 * Chromium's), which without swap the kernel cannot drop; its inactive part is what the kernel reclaims first.
 */
export interface MemoryKinds {
  readonly anonBytes: number;
  readonly fileBytes: number;
  /** The page cache's inactive part, which the working set leaves out. */
  readonly inactiveFileBytes: number;
  /** The part of fileBytes that is shared memory; 0 where memory.stat has no shmem line. */
  readonly shmemBytes: number;
  /** null where memory.stat has no `kernel` line (v1, or an older kernel). */
  readonly kernelBytes: number | null;
}

/** memory.stat's kinds (MemoryKinds), or null when it has no anonymous, file or inactive file line. */
export function memoryKinds(memoryStat: string, version: 1 | 2): MemoryKinds | null {
  const stat = new Map<string, number>();
  for (const line of memoryStat.split('\n')) {
    const [name, value] = line.trim().split(/\s+/);
    if (name !== undefined && value !== undefined && /^\d+$/.test(value)) {
      stat.set(name, Number.parseInt(value, 10));
    }
  }
  // v1's total_ lines count the cgroup's children too, as v2's lines do.
  const read = (v2: string, v1: string) => (version === 2 ? stat.get(v2) : (stat.get(`total_${v1}`) ?? stat.get(v1)));
  const anonBytes = read('anon', 'rss');
  const fileBytes = read('file', 'cache');
  const inactiveFileBytes = read('inactive_file', 'inactive_file');
  if (anonBytes === undefined || fileBytes === undefined || inactiveFileBytes === undefined) {
    return null;
  }
  return { anonBytes, fileBytes, inactiveFileBytes, shmemBytes: read('shmem', 'shmem') ?? 0, kernelBytes: version === 2 ? (stat.get('kernel') ?? null) : null };
}

/** One sample of the worker's memory: memory.current (v1: memory.usage_in_bytes) read beside memory.stat. */
export interface MemorySample {
  readonly currentBytes: number;
  /** memory.current less inactive_file, never below 0: what the 90% line judges. */
  readonly workingSetBytes: number;
  readonly kinds: MemoryKinds;
}

/** A sample from the two files' text, or null when either could not be read (a sample without its working set is none). */
export function memorySample(currentText: string | null, statText: string | null, version: 1 | 2): MemorySample | null {
  const current = currentText === null || !/^\d+$/.test(currentText.trim()) ? null : Number.parseInt(currentText.trim(), 10);
  const kinds = statText === null ? null : memoryKinds(statText, version);
  if (current === null || kinds === null) {
    return null;
  }
  return { currentBytes: current, workingSetBytes: Math.max(0, current - kinds.inactiveFileBytes), kinds };
}

/** The worker's memory sampled every second over the whole run, or over one phase or chain job. */
export interface SampledPeriod {
  /** What was sampled, as a failing check names it: `the whole run`, `the concurrent phase`, `A’s triage`. */
  readonly what: string;
  /** The highest working set of its samples; null when none could be read. */
  readonly workingSetPeakBytes: number | null;
  /** The sample the working set peaked at: memory.current there and memory.stat's kinds (reported). */
  readonly atPeak: MemorySample | null;
  /**
   * The highest memory.current of its samples, page cache included: what the line judged before 2026-11-04, kept in
   * release-capacity.json for comparison with earlier runs (reported, never judged); null when none could be read.
   */
  readonly peakBytes: number | null;
  /**
   * memory.peak (v2; v1: memory.max_usage_in_bytes) read at its end, page cache included: the container's highest since
   * it started, not the period's alone, since the harness cannot reset it (reported, never judged); null when unread.
   */
  readonly memoryPeakBytes: number | null;
  readonly samples: number;
  /** How long it was sampled for; null when unknown. */
  readonly ms: number | null;
}

/** A period with no sample yet. */
export const unsampled = (what: string): SampledPeriod => ({ what, workingSetPeakBytes: null, atPeak: null, peakBytes: null, memoryPeakBytes: null, samples: 0, ms: null });

/** The period with one more sample: one that could not be read is not counted, so the sample count shows the gap. */
export function withSample(period: SampledPeriod, sample: MemorySample | null): SampledPeriod {
  if (sample === null) {
    return period;
  }
  const higher = period.workingSetPeakBytes === null || sample.workingSetBytes > period.workingSetPeakBytes;
  return {
    ...period,
    workingSetPeakBytes: higher ? sample.workingSetBytes : period.workingSetPeakBytes,
    atPeak: higher ? sample : period.atPeak,
    peakBytes: Math.max(period.peakBytes ?? 0, sample.currentBytes),
    samples: period.samples + 1,
  };
}

/** How a failing check and the summary name the whole run's samples, from the worker's start to the read-back. */
export const THE_WHOLE_RUN = 'the whole run';

/** The periods every run samples (D10, D20, step 7b): each phase, and each chain job alone. */
export const SAMPLED_PERIODS = ['the concurrent phase', 'A’s triage', 'A’s audit report', 'F’s reconcile', 'the large jobs together'] as const;

/** The largest advisory-lock count any one backend held, sampled every second over the run. */
export interface AdvisoryLockSamples {
  readonly peak: number;
  readonly samples: number;
  /**
   * The sampled period (one of SAMPLED_PERIODS) open when the peak was first seen, or `setup or between phases`
   * (OUTSIDE_SAMPLED_PERIODS); null with no sample.
   */
  readonly peakDuring: string | null;
}

/** How the lock sampler names a moment no sampled period was open: seeding, setup, and the gaps between phases. */
export const OUTSIDE_SAMPLED_PERIODS = 'setup or between phases';

/**
 * The kernel's memory events in the worker's cgroup (v2 memory.events: `oom`, the times its usage reached the limit with
 * an allocation about to fail, and `oom_kill`, the processes it killed; v1 memory.oom_control: `oom_kill`, and no oom
 * count).
 */
export interface OomEvents {
  /** null on v1, which counts none. */
  readonly oom: number | null;
  readonly oomKill: number;
}

/** The counts from memory.events (v2) or memory.oom_control (v1), or null when unread or a count is missing (fail closed). */
export function oomEvents(text: string | null, version: 1 | 2): OomEvents | null {
  if (text === null) {
    return null;
  }
  const count = (name: string) => {
    const value = new RegExp(`^${name} (\\d+)$`, 'm').exec(text)?.[1];
    return value === undefined ? null : Number.parseInt(value, 10);
  };
  const oomKill = count('oom_kill');
  const oom = version === 2 ? count('oom') : null;
  return oomKill === null || (version === 2 && oom === null) ? null : { oom, oomKill };
}

export interface WorkerMemory {
  readonly limitBytes: number;
  /** The container's memory.peak at the end (v2; v1's max_usage_in_bytes): the whole run, page cache included (reported). */
  readonly peakBytes: number | null;
  /** The whole run (THE_WHOLE_RUN), from the worker's start to the read-back, each period's samples among its own. */
  readonly run: SampledPeriod;
  /** Each of SAMPLED_PERIODS, sampled every second (the harness cannot reset memory.peak). */
  readonly periods: readonly SampledPeriod[];
  /** The kernel's OOM kills in the container's cgroup at the end (memory.events), null when unread. */
  readonly oomKills: number | null;
  readonly oomKilled: boolean | null;
  /** memory.events' counts once the worker had started and at the end; null where they could not be read. */
  readonly oomEvents: { readonly start: OomEvents | null; readonly end: OomEvents | null };
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

/** A practice's actionable lines after its triage, the lines the scenario expects actionable, and how many of the first are among the second. */
export interface TriagedLines {
  readonly lines: number;
  readonly expected: number;
  readonly matched: number;
}

export interface CapacityMeasurements {
  readonly commit: string;
  readonly runtime: 'docker' | 'process';
  readonly small: boolean;
  readonly runner: { readonly cpus: number; readonly memoryMiB: number; readonly cpuModel: string; readonly kernel: string };
  /** The worker task's limits and the heap flag its command ran with. */
  readonly worker: { readonly cpus: number; readonly memoryMiB: number; readonly cpuset: string; readonly command: readonly string[] };
  readonly release: { readonly releaseNo: number; readonly records: number; readonly manifestSha256: string };
  /**
   * What the counts must be: A's lines, C's claims (both sets), each of F's actionable lines posted, and F's lines, each
   * seeded to be actionable (step 7b).
   */
  readonly expected: { readonly pricedLines: number; readonly parsedClaims: number; readonly postedLines: number; readonly reconcileLines: number };
  readonly jobs: readonly JobOutcome[];
  /** A's run as it ended; null when it could not be read. */
  readonly run: { readonly status: string; readonly failureCode: string | null } | null;
  readonly pricedLines: number | null;
  readonly parsedClaims: number | null;
  /**
   * F's lines posted after its reconcile (step 7b): those with a posted entry, and of them those posted in full (their posted
   * entries sum to their approved ones). Lines, not entries: a claim's two lines of one code, date and amount cannot be
   * told apart by a line-level posting row, so the ledger may post one of them from two rows, the first row's amount
   * past the first line's approval going to its twin (the amounts are the same). Null when they could not be counted.
   */
  readonly posted: { readonly lines: number; readonly inFull: number } | null;
  /**
   * A's lines its chain triage made actionable (in an open case), beside the scenario's expectation of them: each of A's
   * lines priced on the contract's plan at least the line materiality short, none of its Medicare Advantage lines
   * (scenario.ts, expectedActionableLines). A keeps its full month for triage and reports (Lane A's orchestrator,
   * 2026-11-04), so the chain's triage and A's reports measure that month's open cases. Null when they could not be counted.
   */
  readonly aActionable: TriagedLines | null;
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
    const measured = job.phase !== 'setup';
    const where = measured ? `, in ${PHASE_NAMES[job.phase]}` : '';
    const label = jobLabel(job);
    if (job.state !== 'completed') {
      reasons.push(`${label} ${job.state === null ? 'could not be read' : `ended ${job.state}, not completed`}${where}`);
    } else if (measured) {
      // A measured job a retry rescued: a person in production would have waited on the failed attempt (D10).
      if (job.attempts === null) {
        reasons.push(`${label} completed, but its attempts could not be read${where}`);
      } else if (job.attempts > 1) {
        reasons.push(`${label} completed on attempt ${String(job.attempts)}, not its first${where}`);
      }
      if (job.heap === null) {
        reasons.push(`${label} logged no \`job heap\` line${where}`);
      }
    }
    const limitMib = job.heap === null ? null : heapLimitMib(m.worker.command, job.heap.limitMib);
    if (job.heap !== null && limitMib !== null && job.heap.peakMib > (limitMib * HEAP_LIVE_PERCENT) / 100) {
      reasons.push(`${label} had a live heap of ${String(job.heap.peakMib)} MiB, above ${String(HEAP_LIVE_PERCENT)}% of its ${String(limitMib)} MiB limit (${String((limitMib * HEAP_LIVE_PERCENT) / 100)} MiB)${where}`);
    }
  }
  for (const [phase, wanted, names] of [
    ['concurrent', CONCURRENT_JOBS, 'six (A’s price job, B’s audit report and C’s four parses)'],
    ['together', TOGETHER_JOBS, 'seven (A’s second audit report, D’s triage, E’s price job and C’s second four parses)'],
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
  // Step 7b on F, a practice of its own (Lane A's orchestrator, 2026-11-04): each of F's lines is seeded to be
  // actionable, so its triage making fewer means its reconcile measured another size than the one it was seeded at.
  if (m.expected.postedLines === 0) {
    reasons.push('F’s reconcile had no actionable line to post: F’s triage made none actionable, so the reconcile measured nothing');
  } else if (m.expected.postedLines !== m.expected.reconcileLines) {
    reasons.push(`F’s triage made ${String(m.expected.postedLines)} of its ${String(m.expected.reconcileLines)} lines actionable, not each of them, so step 7b reconciled other than the lines it was seeded with`);
  }
  // A's full month for triage and reports (Lane A's orchestrator, 2026-11-04): its chain triage makes actionable each line
  // the scenario does, so its reports print that month's open cases; none, fewer or others would measure a lighter month
  // than the one it was seeded with, and nothing else would flag it.
  if (m.aActionable === null) {
    reasons.push('A’s actionable lines after its triage could not be counted');
  } else {
    const { lines, expected, matched } = m.aActionable;
    const scenario = `the ${String(expected)} the scenario expects (each of its contract lines priced at least the line materiality short, none of its Medicare Advantage lines)`;
    if (lines === 0) {
      reasons.push(`A’s triage made none of its lines actionable, of ${scenario}, so the chain’s triage and A’s reports measured no open case`);
    } else if (lines !== expected || matched !== expected) {
      reasons.push(`A’s triage made ${String(lines)} of its lines actionable, ${String(matched)} of them among ${scenario}, so the chain measured another month than the one A was seeded with`);
    }
  }
  if (m.posted === null) {
    reasons.push('F’s posted lines could not be counted');
  } else {
    if (m.posted.lines !== m.expected.postedLines) {
      reasons.push(`${String(m.posted.lines)} of F’s lines posted, not ${String(m.expected.postedLines)} (each actionable line)`);
    }
    if (m.posted.inFull !== m.posted.lines) {
      reasons.push(`${String(m.posted.lines - m.posted.inFull)} of F’s posted lines not posted in full (their posted entries do not sum to their approved ones)`);
    }
  }
  const { memory } = m;
  // memory.events between the worker's start and the end: an oom event is the limit reached with an allocation about to
  // fail, whether or not the kernel then killed a process (fail closed when unread).
  const { start, end } = memory.oomEvents;
  if (start === null || end === null) {
    reasons.push(`the worker’s memory.events could not be read ${start === null && end === null ? 'at its start or at the end' : start === null ? 'at its start' : 'at the end'}, so an OOM event could pass unseen`);
  }
  const oomUp = start === null || end === null || start.oom === null || end.oom === null ? 0 : end.oom - start.oom;
  const killUp = start === null || end === null ? 0 : end.oomKill - start.oomKill;
  const counted = oomUp > 0 || killUp > 0 ? `memory.events counted ${String(oomUp)} oom and ${String(killUp)} oom_kill between the worker’s start and the end` : null;
  const killed = memory.oomKilled === true || (memory.oomKills ?? 0) > 0;
  if (killed) {
    reasons.push(`the worker was killed for memory (${memory.oomKills === null ? 'unread' : String(memory.oomKills)} OOM kills in its cgroup)${counted === null ? '' : `; ${counted}`}`);
  } else if (counted !== null) {
    reasons.push(`the worker’s cgroup reached its memory limit: ${counted}`);
  }
  if (memory.oomKilled === null || memory.oomKills === null) {
    reasons.push('the worker’s OOM kills could not be read');
  }
  if (memory.restarts === null || memory.running === null) {
    reasons.push('the worker’s restarts could not be read');
  } else if (memory.restarts > 0 || !memory.running) {
    reasons.push(memory.restarts > 0 ? `the worker restarted ${String(memory.restarts)} times` : 'the worker had exited before the end');
  }
  // The 90% line judges the working set over the whole run and in each phase and chain job; memory.peak, page cache
  // included, is reported beside it (Lane A's orchestrator, 2026-11-04; docs/adr/0083).
  const ceiling = (memory.limitBytes * MEMORY_PEAK_PERCENT) / 100;
  const above = (value: number) => `${mib(value)}, above ${String(MEMORY_PEAK_PERCENT)}% of its ${mib(memory.limitBytes)} (${mib(ceiling)})`;
  for (const [what, period] of [[THE_WHOLE_RUN, memory.run], ...SAMPLED_PERIODS.map((name) => [name, memory.periods.find((entry) => entry.what === name)] as const)] as const) {
    if (period?.workingSetPeakBytes === null || period?.workingSetPeakBytes === undefined) {
      reasons.push(`the worker’s ${WORKING_SET} over ${what} could not be read`);
      continue;
    }
    if (period.workingSetPeakBytes > ceiling) {
      reasons.push(`the worker’s ${WORKING_SET} over ${what} is ${above(period.workingSetPeakBytes)}`);
    }
    // Sampled each second, a period with half its samples missing did not see its peak (int-surfaces improvement 5).
    const fewestSamples = period.ms === null ? 1 : Math.max(1, Math.floor(period.ms / PHASE_SAMPLE_GAP_MS));
    if (period.samples < fewestSamples) {
      reasons.push(`memory over ${what} was sampled ${String(period.samples)} times in ${seconds(period.ms)}, fewer than one each ${String(PHASE_SAMPLE_GAP_MS / 1000)} seconds (${String(fewestSamples)})`);
    }
  }
  if (m.advisoryLocks === null || m.advisoryLocks.samples === 0) {
    reasons.push('the advisory locks held could not be sampled');
  } else if (m.advisoryLocks.peak > ADVISORY_LOCKS_PER_TRANSACTION) {
    reasons.push(
      `a backend held ${String(m.advisoryLocks.peak)} advisory locks at once${m.advisoryLocks.peakDuring === null ? '' : ` during ${m.advisoryLocks.peakDuring}`}, above ${String(ADVISORY_LOCKS_PER_TRANSACTION)} (a lock per line or per row is back)`,
    );
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

/** The memory by kind at the working set's peak sample over the whole run and each period (reported; the line judges the working set). */
function memoryTable(memory: WorkerMemory): string[] {
  const value = (bytes: number | null | undefined) => (bytes === null || bytes === undefined ? '—' : mib(bytes));
  return [
    `Memory by kind at each period’s working-set peak (memory.stat; reported beside the working set, which the line judges): the page cache counts shared memory, and its inactive part is what the working set leaves out; memory.peak, read at each period’s end, counts the run so far, page cache included.`,
    '',
    '| Period | Working set | memory.current | Anonymous | Page cache | Inactive page cache | Shared memory | Kernel | memory.peak at its end | Samples |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...[memory.run, ...memory.periods].map((period) => {
      const kinds = period.atPeak?.kinds;
      return `| ${period.what} | ${value(period.workingSetPeakBytes)} | ${value(period.atPeak?.currentBytes)} | ${value(kinds?.anonBytes)} | ${value(kinds?.fileBytes)} | ${value(kinds?.inactiveFileBytes)} | ${value(kinds?.shmemBytes)} | ${value(kinds?.kernelBytes)} | ${value(period.memoryPeakBytes)} | ${String(period.samples)} |`;
    }),
    '',
  ];
}

/** memory.events' increments between the worker's start and the end, as the summary prints them. */
function eventsLine(memory: WorkerMemory): string {
  const { start, end } = memory.oomEvents;
  if (start === null || end === null) {
    return 'memory.events unread';
  }
  return `memory.events oom ${start.oom === null || end.oom === null ? 'not counted (cgroup v1)' : `+${String(end.oom - start.oom)}`}, oom_kill +${String(end.oomKill - start.oomKill)} between the worker’s start and the end`;
}

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
    KNOWN_GAP,
    '',
    '| Job | Phase | State | Attempts | Live heap | Time |',
    '| --- | --- | --- | --- | --- | --- |',
    ...full.jobs.map(
      (job) =>
        // The live heap beside the limit the check holds it to (heapLimitMib); V8's own limit stays in release-capacity.json.
        `| ${job.what} | ${PHASE_NAMES[job.phase]} | ${job.state ?? 'unread'} | ${job.attempts === null ? 'unread' : String(job.attempts)} | ${job.heap === null ? 'none' : `${String(job.heap.peakMib)} of ${String(heapLimitMib(full.worker.command, job.heap.limitMib))} MiB`} | ${seconds(job.elapsedMs)} |`,
    ),
    '',
    `Run: ${full.run === null ? 'unread' : `${full.run.status}${full.run.failureCode === null ? '' : ` (${full.run.failureCode})`}`}; priced lines ${full.pricedLines === null ? 'unread' : String(full.pricedLines)} of ${String(full.expected.pricedLines)}; A’s lines actionable after its triage ${full.aActionable === null ? 'unread' : `${String(full.aActionable.lines)} (${String(full.aActionable.matched)} of them expected) of ${String(full.aActionable.expected)} expected`}, of its ${String(full.expected.pricedLines)} lines; parsed claims ${full.parsedClaims === null ? 'unread' : String(full.parsedClaims)} of ${String(full.expected.parsedClaims)}; F’s lines posted ${full.posted === null ? 'unread' : `${String(full.posted.lines)} (${String(full.posted.inFull)} in full)`} of ${String(full.expected.postedLines)} actionable, of its ${String(full.expected.reconcileLines)} lines.`,
    '',
    `Memory: the ${String(MEMORY_PEAK_PERCENT)}% line (${mib((memory.limitBytes * MEMORY_PEAK_PERCENT) / 100)} of ${mib(memory.limitBytes)}) judges the worker’s ${WORKING_SET}, the measure the kubelet and cAdvisor evict on: at most ${memory.run.workingSetPeakBytes === null ? 'unread' : mib(memory.run.workingSetPeakBytes)} over the whole run (${String(memory.run.samples)} samples); memory.peak ${memory.peakBytes === null ? 'unread' : mib(memory.peakBytes)} over the run, page cache included (reported, not judged); OOM kills ${memory.oomKills === null ? 'unread' : String(memory.oomKills)}; ${eventsLine(memory)}; restarts ${memory.restarts === null ? 'unread' : String(memory.restarts)}.`,
    '',
    ...memoryTable(memory),
    `Advisory locks: at most ${full.advisoryLocks === null ? 'unread' : `${String(full.advisoryLocks.peak)} held by one backend (${full.advisoryLocks.peakDuring === null ? '' : `first during ${full.advisoryLocks.peakDuring}; `}${String(full.advisoryLocks.samples)} samples)`}, of ${String(ADVISORY_LOCKS_PER_TRANSACTION)}.`,
    '',
    `Windows query: ${full.windows === null ? 'not measured' : `${String(full.windows.coldMs)} ms cold${full.windows.cacheDropped ? ' (page cache dropped)' : ''}, ${String(full.windows.warmMs)} ms warm, ${String(full.windows.contents)} contents`}.`,
    '',
    'Times (advisory):',
    '',
    ...Object.entries(full.times).map(([what, ms]) => `- ${what}: ${seconds(ms)}`),
    '',
  ].join('\n');
}
