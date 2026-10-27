/**
 * What the capacity test reads off the containers and the services' logs (audit #53 part 1; docs/adr/0062): pure
 * readers of the cgroup files (v2, the runner's; v1 kept for a local machine), the screening job's phase lines and its
 * time-to-email lines (the consumer's since PR 6b-3; on the platform's log, a screening the platform priced), and the
 * figures a report shows. No row, link, token or address is read here: the log lines carry IDs and numbers only.
 */

export type CgroupVersion = 1 | 2;

function fields(text: string): Map<string, number> {
  const found = new Map<string, number>();
  for (const line of text.split('\n')) {
    const [name, value] = line.trim().split(/\s+/);
    if (name !== undefined && value !== undefined && /^\d+$/.test(value)) {
      found.set(name, Number.parseInt(value, 10));
    }
  }
  return found;
}

/** Anonymous memory (the heap and stacks, page cache excluded) from memory.stat: v2's `anon`, v1's `total_rss` or `rss`. */
export function anonBytes(memoryStat: string, version: CgroupVersion): number {
  const stat = fields(memoryStat);
  const value = version === 2 ? stat.get('anon') : (stat.get('total_rss') ?? stat.get('rss'));
  if (value === undefined) {
    throw new RangeError(`memory.stat has no ${version === 2 ? 'anon' : 'rss'} line`);
  }
  return value;
}

export interface MemoryEvents {
  /** Times the limit was reached (v2 `max`; v1 memory.failcnt). */
  readonly max: number;
  /** Processes the kernel killed for memory (v2 `oom_kill`; v1 oom_control's `oom_kill`). */
  readonly oomKill: number;
}

/** v2: memory.events; v1: memory.oom_control with memory.failcnt's count as `max`. */
export function memoryEvents(text: string, version: CgroupVersion, failcnt = '0'): MemoryEvents {
  const events = fields(text);
  return version === 2 ? { max: events.get('max') ?? 0, oomKill: events.get('oom_kill') ?? 0 } : { max: Number.parseInt(failcnt.trim() || '0', 10), oomKill: events.get('oom_kill') ?? 0 };
}

export interface CpuThrottling {
  readonly periods: number;
  readonly throttledPeriods: number;
  readonly throttledUs: number;
}

/** v2: cpu.stat's nr_periods, nr_throttled, throttled_usec; v1: cpu.stat's throttled_time in nanoseconds. */
export function cpuThrottling(text: string, version: CgroupVersion): CpuThrottling {
  const stat = fields(text);
  return {
    periods: stat.get('nr_periods') ?? 0,
    throttledPeriods: stat.get('nr_throttled') ?? 0,
    throttledUs: version === 2 ? (stat.get('throttled_usec') ?? 0) : Math.round((stat.get('throttled_time') ?? 0) / 1000),
  };
}

/** The screening job's phase lines (apps/worker/src/screening/job.ts) and what each measures. */
export const PHASE_MESSAGES: Readonly<Record<string, PhaseName>> = {
  'screening release shared types read': 'shared_load',
  'screening release shared types held from an earlier run': 'shared_held',
  'screening release keyed records read': 'keyed_read',
  'screening run rows priced': 'pricing',
  'screening run rows recorded': 'recording',
};

export type PhaseName = 'shared_load' | 'shared_held' | 'keyed_read' | 'pricing' | 'recording';

export interface PhaseLine {
  readonly runId: string;
  readonly phase: PhaseName;
  readonly elapsedMs: number;
  readonly recordCount: number;
  /** The line's time (ISO). */
  readonly at: string;
}

/** The phase lines among a container's log lines (JSON lines; anything else is skipped). */
export function phaseLines(lines: Iterable<string>): PhaseLine[] {
  const found: PhaseLine[] = [];
  for (const line of lines) {
    const entry = jsonLine(line);
    if (entry === null) {
      continue;
    }
    const phase = typeof entry.msg === 'string' ? PHASE_MESSAGES[entry.msg] : undefined;
    if (phase !== undefined && typeof entry.screening_run_id === 'string' && typeof entry.elapsed_ms === 'number' && typeof entry.record_count === 'number' && typeof entry.time === 'string') {
      found.push({ runId: entry.screening_run_id, phase, elapsedMs: entry.elapsed_ms, recordCount: entry.record_count, at: entry.time });
    }
  }
  return found;
}

/** The worker's start line: the platform or consumer container is ready. */
export function workerStarted(lines: Iterable<string>): boolean {
  for (const line of lines) {
    if (line.includes('"msg":"worker started"')) {
      return true;
    }
  }
  return false;
}

/**
 * The time-to-email lines (apps/worker/src/screening/job.ts; TimeToEmailMs): `screening result emailed` for a run in the
 * normal tier, `screening result emailed after waiting` for one in the waiting tier (Q7), each with the run, elapsed_ms
 * from the web's received_at, and the line's time.
 */
export const EMAILED_MESSAGES: Readonly<Record<string, 'normal' | 'waiting'>> = {
  'screening result emailed': 'normal',
  'screening result emailed after waiting': 'waiting',
};

export interface EmailedLine {
  readonly runId: string;
  readonly elapsedMs: number;
  readonly tier: 'normal' | 'waiting';
  /** The line's time (ISO). */
  readonly at: string;
}

function jsonLine(line: string): Record<string, unknown> | null {
  if (!line.startsWith('{')) {
    return null;
  }
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The time-to-email lines among a container's log lines (JSON lines; anything else is skipped). */
export function emailedLines(lines: Iterable<string>): EmailedLine[] {
  const found: EmailedLine[] = [];
  for (const line of lines) {
    const entry = jsonLine(line);
    const tier = entry !== null && typeof entry.msg === 'string' ? EMAILED_MESSAGES[entry.msg] : undefined;
    if (entry !== null && tier !== undefined && typeof entry.screening_run_id === 'string' && typeof entry.elapsed_ms === 'number' && typeof entry.time === 'string') {
      found.push({ runId: entry.screening_run_id, elapsedMs: entry.elapsed_ms, tier, at: entry.time });
    }
  }
  return found;
}

/**
 * Waits until each upload's run reads `complete`, at most `waitMs` for them all, and returns the uploads whose run did
 * not (in the order given). The consumer sends a result's email inside its completion's transaction and commits after
 * the send returns (apps/worker/src/screening/job.ts), so the local outbox's file, which the harness reads its link
 * from, can be there a moment before the run commits, and the link opens nothing until it does. The harness opens a
 * link only once its run reads complete, so a link that does not open is a broken link, not one opened too early; a
 * run still not complete after the wait is opened anyway, and its link's status says what a person would have seen.
 * `status` reads a run's status (null for no run); `sleep` and `now` are the clock (the tests give their own).
 */
export async function untilComplete(
  uploads: readonly string[],
  status: (upload: string) => Promise<string | null>,
  options: { readonly waitMs: number; readonly pollMs?: number; readonly now?: () => number; readonly sleep?: (ms: number) => Promise<void> },
): Promise<string[]> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const until = now() + options.waitMs;
  let waiting = [...uploads];
  for (;;) {
    const read = await Promise.all(waiting.map(async (upload) => ((await status(upload).catch(() => null)) === 'complete' ? null : upload)));
    waiting = read.filter((upload): upload is string => upload !== null);
    if (waiting.length === 0 || now() >= until) {
      return waiting;
    }
    await sleep(options.pollMs ?? 250);
  }
}

/** The runs a container's log shows it pricing or emailing: any phase line or time-to-email line names the run. */
export function pricedRuns(lines: readonly string[]): Set<string> {
  return new Set([...phaseLines(lines).map((line) => line.runId), ...emailedLines(lines).map((line) => line.runId)]);
}

/** Each run's phases, by run: elapsed milliseconds and records per phase. */
export function phasesByRun(lines: readonly PhaseLine[]): Map<string, Partial<Record<PhaseName, { readonly elapsedMs: number; readonly recordCount: number }>>> {
  const runs = new Map<string, Partial<Record<PhaseName, { readonly elapsedMs: number; readonly recordCount: number }>>>();
  for (const line of lines) {
    const run = runs.get(line.runId) ?? {};
    run[line.phase] = { elapsedMs: line.elapsedMs, recordCount: line.recordCount };
    runs.set(line.runId, run);
  }
  return runs;
}

/** The median of some numbers (the mean of the middle two for an even count); null for none. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] as number) : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/** psql's `\timing` lines ("Time: 2.104 ms"): each statement's round trip, in milliseconds. */
export function psqlTimings(output: string): number[] {
  return [...output.matchAll(/^Time: (\d+(?:\.\d+)?) ms/gm)].map((match) => Number.parseFloat(match[1] ?? '0'));
}

/** An io.max line's limits for a device ("8:0 rbps=131072000 wbps=131072000 riops=3000 wiops=3000"). */
export function ioMax(text: string): { readonly device: string; readonly rbps: number | null; readonly wbps: number | null; readonly riops: number | null; readonly wiops: number | null }[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [device, ...settings] = line.trim().split(/\s+/);
      const read = (name: string): number | null => {
        const value = settings.find((setting) => setting.startsWith(`${name}=`))?.slice(name.length + 1);
        return value === undefined || value === 'max' ? null : Number.parseInt(value, 10);
      };
      return { device: device ?? '', rbps: read('rbps'), wbps: read('wbps'), riops: read('riops'), wiops: read('wiops') };
    });
}

/** The largest of some samples, or zero. */
export function peak(values: readonly number[]): number {
  return values.reduce((most, value) => (value > most ? value : most), 0);
}
