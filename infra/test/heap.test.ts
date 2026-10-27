import { describe, expect, it } from 'vitest';

import { ENVIRONMENTS, environmentSettings } from '../lib/environments';
import { HEAP_MIB, heapFlag } from '../lib/heap';

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
