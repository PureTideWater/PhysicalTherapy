/**
 * Explicit V8 heap limits per task (audit #31; docs/adr/0071): today's automatic sizes, made deliberate and tested
 * weekly. Node 24 sizes the old generation from the container's memory limit, 560 MiB at 1,024 MiB and 259 MiB at 512,
 * measured (infra/lib/environments.ts), so these equal what each task runs with now and wiring them into the task
 * commands changes no behaviour. The weekly real-size test runs the worker under heapFlag('worker') now
 * (tools/release-capacity/run.ts); the task commands take them in the later pull request (infra/lib/constructs/compute.ts).
 * The worker task's flag lands only after the page reader runs in a process of its own (docs/adr/0033): a process-wide
 * heap flag overrides a worker thread's resourceLimits on Node 24 (a page thread asking 192 MiB measured 608 under
 * --max-old-space-size=560), so infra/test/heap.test.ts refuses a heap flag on any container of the worker image unless
 * PAGE_READER_ISOLATION (packages/contracts/src/evidence/pages.ts) is 'process'.
 * Imported by no file the screening-capacity closure reaches (tools/screening-capacity/watched.ts).
 */
export const HEAP_MIB = { worker: 560, platform: 259, web: 560 } as const;

/** The node flag that sets a task's heap limit on its command. */
export function heapFlag(service: keyof typeof HEAP_MIB): string {
  return `--max-old-space-size=${String(HEAP_MIB[service])}`;
}

/**
 * A node command with a heap flag after `node`, the one spelling the weekly real-size test (tools/release-capacity) and
 * infra/test/heap.test.ts's measurement use; a command that already carries a heap flag, or does not run node, is refused.
 */
export function withHeapFlag(command: readonly string[], flag: string): string[] {
  if (command[0] !== 'node') {
    throw new RangeError('the command runs node');
  }
  if (!/^--max-old-space-size=\d+$/.test(flag) || command.some((word) => word.startsWith('--max-old-space-size'))) {
    throw new RangeError('one heap flag, --max-old-space-size=<MiB>');
  }
  return [command[0], flag, ...command.slice(1)];
}
