import type * as DbRuntime from '@tp/db/runtime';
import type * as ModelGatewayModule from '@tp/model-gateway';
import type { GatewayOptions } from '@tp/model-gateway';
import { capturingLogger } from '@tp/model-gateway/testing';
import { describe, expect, it, vi } from 'vitest';

import { DocumentStore } from '../storage/documents';
import { MemorySealedBytes } from '../intake/test-support/memory-bytes';
import { evaluatePracticeExamples } from './permitted';

/**
 * The permitted run's gateway (docs/adr/0070, Part 2; F5 (a)): it is built for the run's job with the
 * evaluable set, so a contract entry waiting only on this run can be evaluated, and the gateway refuses
 * that set to any actor but a job. The database is stood in for (one example whose expectation does not
 * parse, so nothing is read or called); the run against Postgres is permitted.db.test.ts. SYNTHETIC IDs.
 */

const built: GatewayOptions[] = [];

vi.mock('@tp/model-gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof ModelGatewayModule>();
  class RecordingGateway extends actual.ModelGateway {
    constructor(options: GatewayOptions) {
      super(options);
      built.push(options);
    }
  }
  return { ...actual, ModelGateway: RecordingGateway };
});

vi.mock('@tp/db/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof DbRuntime>();
  return {
    ...actual,
    withJobScope: (_pool: unknown, _job: unknown, work: (scope: unknown) => Promise<unknown>) => work({}),
    readWithAudit: () => Promise.resolve([{ id: EXAMPLE, practice_id: PRACTICE, expected: { format: 'not-a-correction' }, ambiguous: false }]),
  };
});

const PRACTICE = '00000000-0000-4000-8000-0000000000a1';
const EXAMPLE = '00000000-0000-4000-8000-0000000000e1';
const RUN = '00000000-0000-4000-8000-0000000000c1';

describe('the permitted run’s gateway', () => {
  it('is built for the run’s job with the evaluable set, and serves it in production on a real provider', async () => {
    const { ModelGateway, PostgresModelCallStore } = await import('@tp/model-gateway');
    const provider = { kind: 'bedrock' as const, complete: () => Promise.reject(new Error('no call is made here')) };
    const services = { pool: {} as never, documents: new DocumentStore(new MemorySealedBytes()), keys: {} as never, provider, production: true, logger: capturingLogger() };
    const results = await evaluatePracticeExamples(services, { runId: RUN, practiceId: PRACTICE });
    expect(results.map((result) => [result.exampleId, result.problem])).toEqual([[EXAMPLE, 'expected_invalid']]);
    expect(built).toHaveLength(1);
    expect(built[0]).toMatchObject({ serving: 'evaluable', production: true });
    expect(built[0]?.store.actor).toEqual({ kind: 'job', jobId: RUN });
    // The same set for a person's store is refused: no request path can ask for it.
    expect(() => new ModelGateway({ ...(built[0] as GatewayOptions), store: new PostgresModelCallStore({} as never, { kind: 'user', userId: PRACTICE }) })).toThrow(expect.objectContaining({ code: 'serving_invalid' }) as Error);
  });
});
