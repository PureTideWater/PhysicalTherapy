import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTENT_NOT_LOADED_MESSAGE, CONTENT_NOT_LOADED_METRIC, PRICING_ENGINE_ERRORS_METRIC } from '../lib/jobs';

/** Audit #7's one content alert per run (docs/adr/0071); its alarm comes in the later pull request. */
describe('the content alert contract with the worker (CONTENT_NOT_LOADED)', () => {
  const worker = readFileSync(path.resolve(import.meta.dirname, '../../apps/worker/src/price/execute.ts'), 'utf8');

  it('matches the line apps/worker logs when a run meets rule content PaidWhole has not loaded', () => {
    expect(worker).toContain(`export const CONTENT_NOT_LOADED_MESSAGE = '${CONTENT_NOT_LOADED_MESSAGE}';`);
    // Every log call writes the fixed text, with the error code the later metric filter reads.
    const calls = worker.split(`context.logger.warn('${CONTENT_NOT_LOADED_MESSAGE}'`).slice(1);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call.slice(0, call.indexOf('\n'))).toContain("error_code: 'CONTENT_NOT_LOADED'");
    expect(worker.split(CONTENT_NOT_LOADED_MESSAGE).length - 1).toBe(calls.length + 1);
  });

  it("counts in the worker's namespace, apart from the engine-error page", () => {
    expect(CONTENT_NOT_LOADED_METRIC.namespace).toBe(PRICING_ENGINE_ERRORS_METRIC.namespace);
    expect(CONTENT_NOT_LOADED_METRIC.metricName).not.toBe(PRICING_ENGINE_ERRORS_METRIC.metricName);
  });
});
