import { availableParallelism, totalmem } from 'node:os';

/**
 * `pnpm lint`'s groups and its memory-bounded scheduler (docs/adr/0066 Part 1; test matrix CI-08). One ESLint process
 * over the whole repository peaks at about 6 GB; apart, apps/web peaks at 3.3 to 4.8 GB and packages and the rest at
 * about 2.6 GB each, and web takes about as long as the other two together (each process's maxRSS, measured). apps/web
 * sets the floor whatever the split, because typescript-eslint's project service builds web's program, which compiles
 * every workspace package's source, so more groups would only add processes. The last group is the complement, "."
 * with the other roots ignored, so every file ESLint would lint in one run is linted in exactly one group.
 *
 * The scheduler starts groups, largest heap first, while the running heaps fit the host's memory less 2 GiB and the
 * running count fits its cores, and always starts one when none runs, so no group waits forever. Each heap is the
 * smaller of its nominal heap and that budget, so a small host runs web alone with all of it rather than never.
 */

/** Memory the scheduler leaves to the operating system and everything else on the host. */
export const RESERVED_MB = 2_048;

/** The smallest heap a process is given, on a host whose budget is smaller still (it can then lint nothing large). */
export const MIN_HEAP_MB = 1_024;

/** One ESLint process: what it is given to lint, what it leaves to the other groups, and the heap it asks for. */
export interface LintGroup {
  /** How the report names it. */
  readonly name: string;
  /** The directory ESLint is given, relative to the repository root. */
  readonly target: string;
  /** Directories this group leaves to the others (--ignore-pattern, relative to the root); the complement's only. */
  readonly ignorePatterns: readonly string[];
  /** The old-space heap it asks for in MB, before the host's budget caps it. */
  readonly nominalHeapMb: number;
}

/** The groups with a root of their own: web, whose program is the floor, and the workspace packages. */
const ROOTED = [
  { root: 'apps/web', nominalHeapMb: 6_144 },
  { root: 'packages', nominalHeapMb: 4_096 },
] as const;

export const LINT_GROUPS: readonly LintGroup[] = [
  ...ROOTED.map(({ root, nominalHeapMb }): LintGroup => ({ name: root, target: root, ignorePatterns: [], nominalHeapMb })),
  // The worker, the tools, infra and the root's own files: everything the groups above do not lint.
  { name: '.', target: '.', ignorePatterns: ROOTED.map(({ root }) => `${root}/`), nominalHeapMb: 4_096 },
];

const PLAIN_DIRECTORY = /^(?!\.{1,2}(?:\/|$))(?:[^/]+\/)*[^/]+$/;

/**
 * Why a set of groups would not lint each file exactly once: one complement "." that ignores exactly the other
 * groups' roots (so nothing escapes and nothing runs twice), and rooted groups that neither repeat nor nest.
 */
export function groupProblems(groups: readonly LintGroup[]): string[] {
  const problems: string[] = [];
  const complements = groups.filter((group) => group.target === '.');
  const rooted = groups.filter((group) => group.target !== '.');
  if (complements.length !== 1) {
    problems.push(`exactly one group must be the complement "." (found ${String(complements.length)})`);
  }
  for (const group of rooted) {
    if (!PLAIN_DIRECTORY.test(group.target) || group.target.split('/').some((part) => part === '.' || part === '..')) {
      problems.push(`group root ${group.target} must be a plain relative directory (no ".", "..", leading or trailing "/")`);
    }
    if (group.ignorePatterns.length > 0) {
      problems.push(`group ${group.name} ignores ${group.ignorePatterns.join(', ')}, but only the complement may ignore anything`);
    }
  }
  for (const [index, group] of rooted.entries()) {
    for (const other of rooted.slice(index + 1)) {
      const [a, b] = [`${group.target}/`, `${other.target}/`];
      if (a.startsWith(b) || b.startsWith(a)) {
        problems.push(`group roots ${group.target} and ${other.target} overlap, so a file would be linted twice`);
      }
    }
  }
  for (const complement of complements) {
    const expected = rooted.map((group) => `${group.target}/`);
    const found = [...complement.ignorePatterns];
    if (expected.length !== found.length || expected.some((pattern, index) => pattern !== found[index])) {
      problems.push(`the complement "." must ignore exactly the other groups' roots (${expected.join(', ')}), not (${found.join(', ')})`);
    }
  }
  return problems;
}

/**
 * The node arguments that run one group: its heap, ESLint's own CLI, the group's directory, an --ignore-pattern for
 * each root the complement leaves out, and --max-warnings=0, so a warning fails the group as it failed the one run.
 */
export function eslintArgs(group: LintGroup, heapMb: number, eslintBin: string, extra: readonly string[] = []): string[] {
  return [
    `--max-old-space-size=${String(heapMb)}`,
    eslintBin,
    group.target,
    ...group.ignorePatterns.flatMap((pattern) => ['--ignore-pattern', pattern]),
    '--max-warnings=0',
    ...extra,
  ];
}

/** What the scheduler may use: memory in MB and the number of processes that can run at once. */
export interface Host {
  readonly memoryMb: number;
  readonly parallelism: number;
}

/**
 * This machine: its memory, or the limit the process runs under when that is smaller (a container's cgroup, which
 * os.totalmem() does not see), and os.availableParallelism().
 */
export function currentHost(): Host {
  const limit = process.constrainedMemory();
  const memory = limit > 0 ? Math.min(totalmem(), limit) : totalmem();
  return { memoryMb: Math.floor(memory / (1024 * 1024)), parallelism: Math.max(1, availableParallelism()) };
}

/** The memory the running processes' heaps may sum to: the host's less RESERVED_MB. */
export function budgetMb(host: Host): number {
  return Math.max(0, host.memoryMb - RESERVED_MB);
}

/** A process's heap on a host: the smaller of its nominal heap and the budget, and never under MIN_HEAP_MB. */
export function heapFor(nominalHeapMb: number, host: Host): number {
  return Math.max(MIN_HEAP_MB, Math.min(nominalHeapMb, budgetMb(host)));
}

/** Largest heap first; equal heaps keep their order. */
export function largestFirst<T extends { readonly heapMb: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.heapMb - a.heapMb);
}

/**
 * The pending items (in the order given) to start now beside the running heaps: first fit while the count stays
 * within the host's parallelism and the heaps within its budget, and the first pending item whenever none runs.
 */
export function startable<T extends { readonly heapMb: number }>(pending: readonly T[], runningHeapsMb: readonly number[], host: Host): T[] {
  const budget = budgetMb(host);
  let count = runningHeapsMb.length;
  let used = runningHeapsMb.reduce((sum, heap) => sum + heap, 0);
  const start: T[] = [];
  for (const item of pending) {
    if (count >= host.parallelism) {
      break;
    }
    if (count === 0 || used + item.heapMb <= budget) {
      start.push(item);
      count += 1;
      used += item.heapMb;
    }
  }
  return start;
}

/**
 * Runs every item through `start` under the scheduler: what `startable` admits starts at once, and each finish
 * admits more. Resolves with the results in the items' order; `finished` hears each one as it ends.
 */
export async function runScheduled<T extends { readonly heapMb: number }, R>(
  ordered: readonly T[],
  host: Host,
  start: (item: T) => Promise<R>,
  finished?: (item: T, result: R) => void,
): Promise<R[]> {
  const pending = ordered.map((item, index) => ({ item, index, heapMb: item.heapMb }));
  const running = new Map<number, Promise<{ index: number; result: R }>>();
  const results = new Map<number, R>();
  while (pending.length > 0 || running.size > 0) {
    const admitted = startable(pending, [...running.keys()].map((index) => ordered[index]?.heapMb ?? 0), host);
    if (admitted.length === 0 && running.size === 0) {
      throw new Error('the scheduler admitted nothing with nothing running');
    }
    for (const entry of admitted) {
      pending.splice(pending.indexOf(entry), 1);
      running.set(entry.index, start(entry.item).then((result) => ({ index: entry.index, result })));
    }
    const { index, result } = await Promise.race(running.values());
    running.delete(index);
    results.set(index, result);
    finished?.(ordered[index] as T, result);
  }
  return ordered.map((_, index) => results.get(index) as R);
}
