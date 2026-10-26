/**
 * The weekly real-size test's verdict (audit #31; docs/adr/0071; tools/release-capacity/run.ts): pure, over what the
 * harness read back, so every fail condition is unit-tested (checks.test.ts). It fails on any job not finished
 * complete, the concurrent phase's six included; the run not complete; a priced-line count other than the measured
 * period's lines, or parsed claims other than the 835s held; an OOM kill or a restart of the worker; the worker's
 * memory.peak above 90% of its task's memory, over the whole run or the concurrent phase; a worker log line with
 * error_code RELEASE_READ_OUTSIDE_FETCH or JOB_FAILED; a concurrent phase sampled fewer than once each 2 seconds; and
 * any of these that could not be read (fail closed). Times are
 * recorded and advisory, as the founder ruled for the screening's test (2026-10-23, reconciliation-001.md).
 */

/** The share of the worker task's memory its memory.peak may reach (921.6 MiB of 1,024). */
export const MEMORY_PEAK_PERCENT = 90;

/** The worker log's error codes that fail the run: a read outside the keyed fetch, and a job's last failed attempt. */
export const FAILING_ERROR_CODES = ['RELEASE_READ_OUTSIDE_FETCH', 'JOB_FAILED'] as const;

/** The longest the concurrent phase's memory may go unsampled on average: it is sampled each second. */
export const PHASE_SAMPLE_GAP_MS = 2_000;

/** The windows query's advisory budget, cold (docs/adr/0071; 5.9). */
export const WINDOWS_COLD_BUDGET_MS = 5_000;

/** One job the harness queued, and how it ended (pg-boss's state; null when it could not be read). */
export interface JobOutcome {
  /** What the job is, as the summary names it: `A price`, `B audit_report`, `C parse_835 2`. */
  readonly what: string;
  readonly name: string;
  /** Queued in the concurrent phase (A's price job, B's report, C's four parses). */
  readonly concurrent: boolean;
  readonly jobId: string | null;
  readonly state: string | null;
  /** From its start to its end, by pg-boss's own times (advisory); null when not finished. */
  readonly elapsedMs: number | null;
}

export interface WorkerMemory {
  readonly limitBytes: number;
  /** The container's memory.peak at the end (v2; v1's max_usage_in_bytes): the whole run. */
  readonly peakBytes: number | null;
  /** The highest memory.current sampled every second over the concurrent phase. */
  readonly phasePeakBytes: number | null;
  readonly phaseSamples: number;
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
  /** What the counts must be: A's lines, and C's claims. */
  readonly expected: { readonly pricedLines: number; readonly parsedClaims: number };
  readonly jobs: readonly JobOutcome[];
  /** A's run as it ended; null when it could not be read. */
  readonly run: { readonly status: string; readonly failureCode: string | null } | null;
  readonly pricedLines: number | null;
  readonly parsedClaims: number | null;
  readonly memory: WorkerMemory;
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

/** Bytes as MiB, to a tenth where it is not whole (90% of 1,024 MiB is 921.6). */
const mib = (bytes: number) => `${String(Number((bytes / 1024 / 1024).toFixed(1)))} MiB`;

/** The verdict: every reason the run fails, and the advisories. */
export function verdict(m: CapacityMeasurements): Verdict {
  const reasons: string[] = [];
  if (m.aborted !== null) {
    reasons.push(`the run stopped before it was read back: ${m.aborted}`);
  }
  for (const job of m.jobs) {
    if (job.state !== 'completed') {
      reasons.push(`${job.what} (${job.name}) ${job.state === null ? 'could not be read' : `ended ${job.state}, not completed`}${job.concurrent ? ' (concurrent phase)' : ''}`);
    }
  }
  if (m.jobs.filter((job) => job.concurrent).length !== 6) {
    reasons.push(`the concurrent phase queued ${String(m.jobs.filter((job) => job.concurrent).length)} jobs, not six (A's price job, B's audit report and C's four parses)`);
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
  for (const [what, value] of [
    ['over the whole run', memory.peakBytes],
    ['over the concurrent phase', memory.phasePeakBytes],
  ] as const) {
    if (value === null) {
      reasons.push(`the worker’s memory peak ${what} could not be read`);
    } else if (value > ceiling) {
      reasons.push(`the worker’s memory peak ${what} is ${mib(value)}, above ${String(MEMORY_PEAK_PERCENT)}% of its ${mib(memory.limitBytes)} (${mib(ceiling)})`);
    }
  }
  // Sampled each second, a phase with half its samples missing did not see its peak (int-surfaces improvement 5).
  const phaseMs = m.times['concurrent phase'] ?? null;
  const fewestSamples = phaseMs === null ? 1 : Math.max(1, Math.floor(phaseMs / PHASE_SAMPLE_GAP_MS));
  if (memory.phasePeakBytes !== null && memory.phaseSamples < fewestSamples) {
    reasons.push(`the concurrent phase’s memory was sampled ${String(memory.phaseSamples)} times in ${seconds(phaseMs)}, fewer than one each ${String(PHASE_SAMPLE_GAP_MS / 1000)} seconds (${String(fewestSamples)})`);
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
    '| Job | Phase | State | Time |',
    '| --- | --- | --- | --- |',
    ...full.jobs.map((job) => `| ${job.what} | ${job.concurrent ? 'concurrent' : 'setup or chain'} | ${job.state ?? 'unread'} | ${seconds(job.elapsedMs)} |`),
    '',
    `Run: ${full.run === null ? 'unread' : `${full.run.status}${full.run.failureCode === null ? '' : ` (${full.run.failureCode})`}`}; priced lines ${full.pricedLines === null ? 'unread' : String(full.pricedLines)} of ${String(full.expected.pricedLines)}; parsed claims ${full.parsedClaims === null ? 'unread' : String(full.parsedClaims)} of ${String(full.expected.parsedClaims)}.`,
    '',
    `Memory: peak ${memory.peakBytes === null ? 'unread' : mib(memory.peakBytes)} over the run, ${memory.phasePeakBytes === null ? 'unread' : mib(memory.phasePeakBytes)} over the concurrent phase (${String(memory.phaseSamples)} samples), of ${mib(memory.limitBytes)}; OOM kills ${memory.oomKills === null ? 'unread' : String(memory.oomKills)}, restarts ${memory.restarts === null ? 'unread' : String(memory.restarts)}.`,
    '',
    `Windows query: ${full.windows === null ? 'not measured' : `${String(full.windows.coldMs)} ms cold${full.windows.cacheDropped ? ' (page cache dropped)' : ''}, ${String(full.windows.warmMs)} ms warm, ${String(full.windows.contents)} contents`}.`,
    '',
    'Times (advisory):',
    '',
    ...Object.entries(full.times).map(([what, ms]) => `- ${what}: ${seconds(ms)}`),
    '',
  ].join('\n');
}
