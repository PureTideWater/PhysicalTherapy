/**
 * Explicit V8 heap limits per task (audit #31; docs/adr/0071): today's automatic sizes, made deliberate and tested
 * weekly. Node 24 sizes the old generation from the container's memory limit, 560 MiB at 1,024 MiB and 259 MiB at 512,
 * measured (infra/lib/environments.ts), so these equal what each task runs with now and wiring them into the task
 * commands changes no behaviour. The weekly real-size test runs the worker under heapFlag('worker') now
 * (tools/release-capacity/run.ts); the task commands take them in the later pull request (infra/lib/constructs/compute.ts).
 * Imported by no file the screening-capacity closure reaches (tools/screening-capacity/watched.ts).
 */
export const HEAP_MIB = { worker: 560, platform: 259, web: 560 } as const;

/** The node flag that sets a task's heap limit on its command. */
export function heapFlag(service: keyof typeof HEAP_MIB): string {
  return `--max-old-space-size=${String(HEAP_MIB[service])}`;
}
