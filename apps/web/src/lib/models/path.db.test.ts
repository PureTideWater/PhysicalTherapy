import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl, withPracticeScope } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, createMigratedDatabase, createTenantWorld } from '@tp/db/testing';
import { ModelBusyError, type ModelProvider, type ModelResponse } from '@tp/model-gateway';
import { syntheticEvidenceInput, syntheticEvidenceOutput } from '@tp/model-gateway/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type ModelServices, assignModelPath, gatewayFor, modelLimiterOf } from './path';

/**
 * A model call made from a request never waits on the pool the request's own transaction holds (docs/adr/0055).
 * The request keeps its connection while the model answers; the gateway's flag read, budget hold and model_call
 * row go through the services' model pool. With one pool for both, as many requests as the pool has connections
 * would each hold one and wait for another, for ever. Synthetic data only.
 */

let database: MigratedDatabase;
let owner: DatabaseClient;
let world: TenantWorld;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  world = await createTenantWorld(owner, 'model pool');
}, 60_000);

afterAll(async () => {
  await owner.end();
  await database.drop();
});

/** A local model that answers the evidence checklist after a moment, as a real one would after many. */
class SlowProvider implements ModelProvider {
  readonly kind = 'local' as const;
  calls = 0;

  async complete(): Promise<ModelResponse> {
    this.calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { text: JSON.stringify(syntheticEvidenceOutput()), tokensIn: 10, tokensOut: 10, stopReason: 'end' };
  }
}

function pool(max: number, connectionTimeoutMillis: number): DatabasePool {
  return openPool(database.appUrl, max, { connectionTimeoutMillis });
}

/** `count` requests at once, each holding its transaction's connection of `requests` while it asks the model. */
function requestsAtOnce(requests: DatabasePool, services: ModelServices, count: number, practiceId: string = world.practiceId): Promise<PromiseSettledResult<unknown>[]> {
  const gateway = () => gatewayFor(services, world.adminUserId);
  return Promise.allSettled(
    Array.from({ length: count }, (_, index) =>
      withPracticeScope(requests, { actorId: world.adminUserId, practiceIds: [practiceId] }, async (scope) => {
        await scope.client.query('SELECT 1');
        const made = gateway();
        if (made === null) {
          throw new Error('no model path');
        }
        return made.suggestEvidenceRequests({ practiceId, requestKey: `pool-${String(index)}-${String(Date.now())}` }, syntheticEvidenceInput());
      }),
    ),
  );
}

describe('the model path’s own pool (docs/adr/0055)', () => {
  it('lets as many requests as the request pool has connections each call the model, because the gateway never draws on that pool', async () => {
    const requests = pool(2, 2_000);
    const models = pool(5, 2_000);
    const provider = new SlowProvider();
    const services: ModelServices = { modelPool: models, logger: createLogger({ sink: () => undefined }), now: () => new Date() };
    assignModelPath(services, { kind: 'available', production: false, provider: () => provider });
    try {
      const settled = await requestsAtOnce(requests, services, 2);
      expect(settled.map((outcome) => outcome.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(provider.calls).toBe(2);
      const logged = await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM model_call WHERE practice_id = $1', [world.practiceId]);
      expect(logged.rows[0]?.n).toBe(2);
    } finally {
      await requests.end();
      await models.end();
    }
  });

  it('caps the calls in flight, two per practice: a third at once is refused before anything is read', async () => {
    const requests = pool(4, 2_000);
    const models = pool(5, 2_000);
    const provider = new SlowProvider();
    const services: ModelServices = { modelPool: models, logger: createLogger({ sink: () => undefined }), now: () => new Date() };
    assignModelPath(services, { kind: 'available', production: false, provider: () => provider });
    try {
      const settled = await requestsAtOnce(requests, services, 3);
      expect(settled.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(2);
      const refused = settled.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
      expect(refused).toHaveLength(1);
      expect(refused[0]?.reason).toBeInstanceOf(ModelBusyError);
      expect(provider.calls).toBe(2);
      expect(modelLimiterOf(services).current(world.practiceId)).toEqual({ total: 0, practice: 0 });
    } finally {
      await requests.end();
      await models.end();
    }
  });

  it('with one pool for both, gives up at the connection timeout instead of waiting for ever (the reviewed deadlock)', async () => {
    const shared = pool(2, 500);
    const provider = new SlowProvider();
    const services: ModelServices = { modelPool: shared, logger: createLogger({ sink: () => undefined }), now: () => new Date() };
    assignModelPath(services, { kind: 'available', production: false, provider: () => provider });
    try {
      const started = Date.now();
      const settled = await requestsAtOnce(shared, services, 2);
      // Each request held one of the two connections and waited for a second: one gave up at the timeout, which
      // let the other through. Nothing waits for ever.
      const refused = settled.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
      expect(refused.length).toBeGreaterThanOrEqual(1);
      expect(String(refused[0]?.reason)).toMatch(/timeout/i);
      expect(Date.now() - started).toBeLessThan(5_000);
    } finally {
      await shared.end();
    }
  });
});
