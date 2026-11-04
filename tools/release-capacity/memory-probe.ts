import { execFile } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

/**
 * WIP instrumentation (co-001/wip-sc1b-mem-1; never merged): what the worker's cgroup holds, beside memory.current, so a
 * memory.peak above the line can be split into anonymous memory, page cache and kernel memory, and the anonymous part
 * into the worker's node process and Chromium's. It reads the worker's cgroup directory directly (resolved once, not a
 * `docker inspect` per read) and /proc/<pid>/status of each process in it, and prints `[memprobe]` lines to stdout, which
 * the CI log keeps (the run's artifact may not be downloadable). Synthetic data only: nothing it reads or prints is a row.
 */

const exec = promisify(execFile);
const MIB = 1024 * 1024;

type Version = 1 | 2;

/** memory.stat's numeric fields. */
export function statFields(text: string): Map<string, number> {
  const found = new Map<string, number>();
  for (const line of text.split("\n")) {
    const [name, value] = line.trim().split(/\s+/);
    if (name !== undefined && value !== undefined && /^\d+$/.test(value)) {
      found.set(name, Number.parseInt(value, 10));
    }
  }
  return found;
}

/** The fields printed each second: v2's split, or v1's nearest names. */
export const KEYS: Readonly<Record<Version, readonly string[]>> = {
  2: [
    "anon",
    "file",
    "kernel",
    "sock",
    "shmem",
    "file_mapped",
    "file_dirty",
    "file_writeback",
    "slab",
    "pagetables",
    "kernel_stack",
    "active_file",
    "inactive_file",
    "active_anon",
    "inactive_anon",
  ],
  1: [
    "rss",
    "cache",
    "shmem",
    "mapped_file",
    "dirty",
    "writeback",
    "active_file",
    "inactive_file",
    "active_anon",
    "inactive_anon",
  ],
};

/** One process's resident memory from /proc/<pid>/status, in kB. */
export interface ProcMemory {
  readonly comm: string;
  readonly rssKb: number;
  readonly anonKb: number;
  readonly fileKb: number;
  readonly shmemKb: number;
}

export function procStatus(text: string): ProcMemory {
  const kb = (name: string) =>
    Number.parseInt(
      new RegExp(`^${name}:\\s+(\\d+) kB$`, "m").exec(text)?.[1] ?? "0",
      10,
    );
  return {
    comm: /^Name:\s+(.*)$/m.exec(text)?.[1]?.trim() ?? "?",
    rssKb: kb("VmRSS"),
    anonKb: kb("RssAnon"),
    fileKb: kb("RssFile"),
    shmemKb: kb("RssShmem"),
  };
}

/** Processes grouped by kind: the worker's node, Chromium's processes, anything else. */
export function groupProcs(procs: readonly ProcMemory[]): string {
  const groups = new Map<
    string,
    { n: number; rss: number; anon: number; file: number; shmem: number }
  >();
  for (const proc of procs) {
    const kind =
      proc.comm === "node" || proc.comm === "MainThread"
        ? "node"
        : /chrom|headless/i.test(proc.comm)
          ? "chrome"
          : `other:${proc.comm}`;
    const group = groups.get(kind) ?? {
      n: 0,
      rss: 0,
      anon: 0,
      file: 0,
      shmem: 0,
    };
    groups.set(kind, {
      n: group.n + 1,
      rss: group.rss + proc.rssKb,
      anon: group.anon + proc.anonKb,
      file: group.file + proc.fileKb,
      shmem: group.shmem + proc.shmemKb,
    });
  }
  const mib = (kb: number) => (kb / 1024).toFixed(1);
  return [...groups.entries()]
    .map(
      ([kind, g]) =>
        `${kind}x${String(g.n)} rss=${mib(g.rss)} anon=${mib(g.anon)} file=${mib(g.file)} shmem=${mib(g.shmem)}`,
    )
    .join(" | ");
}

function read(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Every file's size under a directory, by its first-level subdirectory, in MiB. */
function treeSizes(root: string): string {
  const sizes = new Map<string, number>();
  const walk = (dir: string, top: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const at = path.join(dir, entry);
      try {
        const st = statSync(at);
        if (st.isDirectory()) {
          walk(at, top === "" ? entry : top);
        } else {
          sizes.set(top, (sizes.get(top) ?? 0) + st.size);
        }
      } catch {
        // gone meanwhile
      }
    }
  };
  walk(root, "");
  return [...sizes.entries()]
    .map(([dir, bytes]) => `${dir || "."}=${(bytes / MIB).toFixed(1)}`)
    .join(" ");
}

interface Maximum {
  readonly current: number;
  readonly at: string;
  readonly stat: string;
  readonly procs: string;
}

export interface MemoryProbe {
  /** Names the part of the run the next samples belong to, printing memory.peak and memory.events as the last part ends. */
  phase(label: string): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Samples the worker's cgroup every 250 ms (memory.current, keeping each phase's largest with its memory.stat and the
 * processes' split) and prints one line each second. `docker` names the container whose cgroup it reads (the docker
 * runtime); otherwise `dirs` are the process runtime's cgroup directories (v1: memory's; v2: the one).
 */
export async function startMemoryProbe(options: {
  readonly version: Version;
  readonly docker: string | null;
  readonly dirs: readonly string[];
  readonly dataDir: string;
  readonly say: (line: string) => void;
}): Promise<MemoryProbe> {
  const { version, say } = options;
  let dir: string | null = null;
  if (options.docker !== null) {
    const pid = (
      await exec("docker", [
        "inspect",
        "-f",
        "{{.State.Pid}}",
        options.docker,
      ]).catch(() => ({ stdout: "" }))
    ).stdout.trim();
    const line = read(`/proc/${pid}/cgroup`)
      ?.split("\n")
      .find((entry) => entry.startsWith("0::"));
    dir =
      line === undefined ? null : path.join("/sys/fs/cgroup", line.slice(3));
  } else {
    dir =
      (version === 1
        ? options.dirs.find((entry) => entry.includes("/memory/"))
        : options.dirs[0]) ?? null;
  }
  say(`[memprobe] cgroup ${dir ?? "unresolved"} (v${String(version)})`);
  const file = (name: string) =>
    dir === null ? null : read(path.join(dir, name));
  const currentName =
    version === 2 ? "memory.current" : "memory.usage_in_bytes";
  const peakName = version === 2 ? "memory.peak" : "memory.max_usage_in_bytes";
  const procs = (): string => {
    const pids = (file("cgroup.procs") ?? "")
      .split("\n")
      .filter((entry) => /^\d+$/.test(entry.trim()));
    const found: ProcMemory[] = [];
    for (const pid of pids) {
      const text = read(`/proc/${pid.trim()}/status`);
      if (text !== null) {
        found.push(procStatus(text));
      }
    }
    return groupProcs(found);
  };
  const statLine = (text: string | null): string => {
    if (text === null) {
      return "stat=unread";
    }
    const stat = statFields(text);
    return KEYS[version]
      .map(
        (key) =>
          `${key}=${stat.has(key) ? ((stat.get(key) ?? 0) / MIB).toFixed(1) : "-"}`,
      )
      .join(" ");
  };
  const hostLine = (): string => {
    const text = read("/proc/meminfo") ?? "";
    const kb = (name: string) =>
      Number.parseInt(
        new RegExp(`^${name}:\\s+(\\d+) kB$`, "m").exec(text)?.[1] ?? "0",
        10,
      );
    return ["MemFree", "MemAvailable", "Cached", "Dirty", "Shmem"]
      .map((name) => `${name}=${(kb(name) / 1024).toFixed(0)}`)
      .join(" ");
  };
  let label = "start";
  const maxima = new Map<string, Maximum>();
  const order: string[] = [];
  let running = true;
  let tick = 0;
  const started = Date.now();
  const loop = (async () => {
    while (running) {
      try {
        sample();
      } catch {
        // a sample that cannot be read is skipped
      }
      tick += 1;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  })();
  function sample(): void {
    const current = Number.parseInt(file(currentName) ?? "NaN", 10);
    if (!Number.isNaN(current)) {
      const best = maxima.get(label);
      const printNow = tick % 4 === 0;
      if (best === undefined || current > best.current || printNow) {
        const stat = file("memory.stat");
        const split = procs();
        if (best === undefined || current > best.current) {
          if (!maxima.has(label)) {
            order.push(label);
          }
          maxima.set(label, {
            current,
            at: new Date().toISOString(),
            stat: stat ?? "",
            procs: split,
          });
        }
        if (printNow) {
          const peakNow = Number.parseInt(file(peakName) ?? "NaN", 10);
          say(
            `[memprobe] ${label} t=${((Date.now() - started) / 1000).toFixed(1)} cur=${(current / MIB).toFixed(1)} peak=${Number.isNaN(peakNow) ? "-" : (peakNow / MIB).toFixed(1)} ${statLine(stat)} || ${split}`,
          );
        }
      }
    }
  }
  const boundary = (ending: string) => {
    try {
      boundaryLine(ending);
    } catch {
      say(`[memprobe] end of ${ending}: unread`);
    }
  };
  const boundaryLine = (ending: string) => {
    const peak = Number.parseInt(file(peakName) ?? "NaN", 10);
    const events = (
      file(version === 2 ? "memory.events" : "memory.failcnt") ?? ""
    )
      .trim()
      .replace(/\s+/g, " ");
    say(
      `[memprobe] end of ${ending}: ${peakName}=${Number.isNaN(peak) ? "unread" : (peak / MIB).toFixed(1)} events: ${events} || host ${hostLine()} || data ${treeSizes(options.dataDir)}`,
    );
  };
  return {
    phase: (next: string) => {
      boundary(label);
      label = next;
      return Promise.resolve();
    },
    stop: async () => {
      if (!running) {
        return;
      }
      running = false;
      await loop.catch(() => undefined);
      boundary(label);
      for (const name of order) {
        const best = maxima.get(name);
        if (best !== undefined) {
          say(
            `[memprobe] MAX ${name} cur=${(best.current / MIB).toFixed(1)} at ${best.at} ${statLine(best.stat)} || ${best.procs}`,
          );
          say(
            `[memprobe] MAXSTAT ${name} ${best.stat.trim().replace(/\n/g, "; ")}`,
          );
        }
      }
    },
  };
}
