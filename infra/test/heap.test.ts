import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PAGE_READER_ISOLATION, PAGE_READ_LIMITS, READER_SEMI_SPACE_MB, readerArgv } from '../../packages/contracts/src/evidence/pages';
import { ENVIRONMENTS, type EnvironmentName, environmentSettings } from '../lib/environments';
import { HEAP_MIB, heapFlag } from '../lib/heap';
import { SYNTH_TIMEOUT_MS, logicalIdOf, propertiesOf, resourcesOf, synthesized } from './synth';

/** Audit #31's explicit heap limit (docs/adr/0071): every value leaves the task's other memory its room. */
describe.each(ENVIRONMENTS)('%s: the heap limits', (environment) => {
  const { compute } = environmentSettings(environment);

  it.each(Object.keys(HEAP_MIB) as (keyof typeof HEAP_MIB)[])('holds %s at or below 60% of its task memory', (service) => {
    expect(HEAP_MIB[service]).toBeLessThanOrEqual(compute[service].memoryMiB * 0.6);
  });
});

describe('the heap limits', () => {
  it("equal Node 24's automatic sizes at today's task sizes, so wiring them in changes nothing", () => {
    expect(HEAP_MIB).toEqual({ worker: 560, platform: 259, web: 560 });
    for (const environment of ENVIRONMENTS) {
      const { compute } = environmentSettings(environment);
      expect([compute.worker.memoryMiB, compute.platform.memoryMiB, compute.web.memoryMiB]).toEqual([1024, 512, 1024]);
    }
  });

  it('writes the node flag', () => {
    expect(heapFlag('worker')).toBe('--max-old-space-size=560');
    expect(heapFlag('platform')).toBe('--max-old-space-size=259');
    expect(heapFlag('web')).toBe('--max-old-space-size=560');
  });
});

const MIB = 1024 * 1024;
const REPO = path.resolve(import.meta.dirname, '../..');
const PROBE = path.join(REPO, 'packages/contracts/src/evidence/test-support/reader-heap.ts');

/** A V8 heap flag, in either spelling V8 takes: it sets every isolate's limit in the process, worker threads' too. */
const V8_HEAP_FLAG = /^--max[-_](?:old[-_]space|semi[-_]space|heap|young[-_]generation)[-_]size(?:=|$)/;

/** The V8 heap flags in a command line or a NODE_OPTIONS value. */
function heapFlagsIn(words: string): string[] {
  return words.split(/\s+/).filter((word) => V8_HEAP_FLAG.test(word));
}

interface Container {
  readonly Name: string;
  readonly Image: unknown;
  readonly Command?: string[];
  readonly Environment?: { Name: string; Value: unknown }[];
}

/** Every container the worker image runs in an environment's stack, with the heap flags its command and NODE_OPTIONS carry. */
function workerImageContainers(environment: EnvironmentName): { readonly name: string; readonly command: string; readonly flags: string[] }[] {
  const { stack, template } = synthesized(environment);
  const repository = logicalIdOf(stack, stack.images.repositories.worker);
  return resourcesOf(template, 'AWS::ECS::TaskDefinition')
    .flatMap(([, task]) => propertiesOf(task).ContainerDefinitions as Container[])
    .filter((container) => JSON.stringify(container.Image).includes(repository))
    .map((container) => {
      const command = (container.Command ?? []).join('\n');
      const options = (container.Environment ?? []).filter((entry) => entry.Name === 'NODE_OPTIONS').map((entry) => String(entry.Value));
      return { name: container.Name, command, flags: [...heapFlagsIn(command), ...options.flatMap(heapFlagsIn)] };
    });
}

/** The containers the guard refuses: any that carries a V8 heap flag while untrusted documents are read inside its process. */
function refused(containers: readonly { readonly name: string; readonly flags: readonly string[] }[], isolation: unknown): string[] {
  return isolation === 'process' ? [] : containers.filter((container) => container.flags.length > 0).map((container) => container.name);
}

/** V8's heap_size_limit for a process run with these flags. */
function heapLimitWith(flags: readonly string[]): number {
  return Number(execFileSync(process.execPath, [...flags, '-p', 'require("node:v8").getHeapStatistics().heap_size_limit'], { encoding: 'utf8', env: {} }));
}

/**
 * The page reader against the task's heap flags (docs/adr/0033, docs/adr/0071). A process-wide V8 heap flag overrides a
 * worker thread's resourceLimits on Node 24 (a thread asking 192 MiB got 608 under --max-old-space-size=560), so no
 * container of the worker image carries one unless the reader of untrusted documents runs in a process of its own
 * (PAGE_READER_ISOLATION, packages/contracts/src/evidence/pages.ts), whose heap its own flags set.
 */
describe('the page reader against the heap flags', () => {
  it('finds a V8 heap flag in either spelling, and nothing else', () => {
    expect(heapFlagsIn('set -eu\nexec node --max-old-space-size=560 --enable-source-maps dist/main.js')).toEqual(['--max-old-space-size=560']);
    expect(heapFlagsIn('--max_semi_space_size=16 --max-heap-size=900 --max-young-generation-size=32 --stack-size=984')).toEqual(['--max_semi_space_size=16', '--max-heap-size=900', '--max-young-generation-size=32']);
    expect(heapFlagsIn('exec node --enable-source-maps dist/main.js')).toEqual([]);
    expect(refused([{ name: 'worker', flags: [heapFlag('worker')] }, { name: 'platform', flags: [] }], 'thread')).toEqual(['worker']);
    expect(refused([{ name: 'worker', flags: [heapFlag('worker')] }], 'process')).toEqual([]);
  });

  it.each(ENVIRONMENTS)('%s: lets a worker-image container carry a heap flag only while the reader runs in its own process', (environment) => {
    const containers = workerImageContainers(environment);
    expect(containers.map((container) => container.name).sort()).toEqual(['migrate', 'platform', 'screening', 'worker']);
    expect(refused(containers, PAGE_READER_ISOLATION), `a heap flag on these containers needs PAGE_READER_ISOLATION 'process' (it is ${PAGE_READER_ISOLATION})`).toEqual([]);
  }, SYNTH_TIMEOUT_MS);

  it("gives the reader today's heap under the worker task's real command with heapFlag('worker')", () => {
    const worker = workerImageContainers(ENVIRONMENTS[0]).find((container) => container.name === 'worker');
    const exec = worker?.command.split('\n').find((line) => line.startsWith('exec node '));
    expect(exec, "the worker container's launch script ends by exec'ing node").toBeDefined();
    const words = (exec ?? '').split(' ').slice(1);
    // The flag after `node`, as the weekly real-size test runs it (tools/release-capacity/scenario.ts withHeapFlag).
    expect(heapFlagsIn(words.join(' '))).toEqual([]);
    const command = [words[0] ?? '', heapFlag('worker'), ...words.slice(1)];
    const nodeFlags = command.slice(1).filter((word) => word.startsWith('--'));
    expect(nodeFlags).toEqual([heapFlag('worker'), '--enable-source-maps']);
    const probe = spawnSync(process.execPath, [...nodeFlags, '--import', 'tsx', PROBE], { cwd: REPO, encoding: 'utf8', timeout: 120_000 });
    expect(probe.status, probe.stderr).toBe(0);
    const measured = JSON.parse(probe.stdout) as { parent: number; reader: number | null };
    expect(measured.parent).toBe(heapLimitWith([heapFlag('worker')]));
    // V8's answer for the reader's own heap flags, exactly as readerArgv gives them: 240 MiB at old 192, semi 16.
    const readerHeapFlags = readerArgv(PAGE_READ_LIMITS).filter((word) => V8_HEAP_FLAG.test(word));
    expect(readerHeapFlags).toEqual([`--max-old-space-size=${String(PAGE_READ_LIMITS.maxHeapMb)}`, `--max-semi-space-size=${String(READER_SEMI_SPACE_MB)}`]);
    expect(measured.reader).toBe(heapLimitWith(readerHeapFlags));
    expect(measured.reader).toBeLessThan((PAGE_READ_LIMITS.maxHeapMb + 64) * MIB);
  }, 120_000);
});
