/**
 * What the capacity test reads off the containers and the platform's log (audit #53 part 1; docs/adr/0062): pure
 * readers of the cgroup files (v2, the runner's; v1 kept for a local machine), the platform job's phase lines, and the
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

/** The platform job's phase lines (apps/worker/src/screening/job.ts) and what each measures. */
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
    if (!line.startsWith('{')) {
      continue;
    }
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const phase = typeof entry.msg === 'string' ? PHASE_MESSAGES[entry.msg] : undefined;
    if (phase !== undefined && typeof entry.screening_run_id === 'string' && typeof entry.elapsed_ms === 'number' && typeof entry.record_count === 'number' && typeof entry.time === 'string') {
      found.push({ runId: entry.screening_run_id, phase, elapsedMs: entry.elapsed_ms, recordCount: entry.record_count, at: entry.time });
    }
  }
  return found;
}

/** The worker's start line: the platform container is ready. */
export function workerStarted(lines: Iterable<string>): boolean {
  for (const line of lines) {
    if (line.includes('"msg":"worker started"')) {
      return true;
    }
  }
  return false;
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
