import { readDatabaseUrl } from '@tp/db';
import { withScratchDatabase } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';

import { enqueue } from './jobs/enqueue';
import { placeholderHandlers } from './jobs/handlers';
import { startWorker } from './worker';

const PRACTICE = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
const OTHER_PRACTICE = '1e4b8f8a-2c1d-4f7e-8b3a-5d6c7e8f9a02';
const DOCUMENT = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';
const OTHER_DOCUMENT = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c04';

const silent = createLogger({ sink: () => undefined });

describe('worker against PostgreSQL', () => {
  it('refuses a duplicate singleton key while the first job is queued', async () => {
    await withScratchDatabase(readDatabaseUrl(), async (url) => {
      const boss = new PgBoss(url);
      boss.on('error', () => undefined);
      // Start without subscribing handlers so the jobs stay queued.
      await boss.start();
      try {
        await boss.createQueue('parse_835', { policy: 'exclusive' });
        const first = await enqueue(boss, 'parse_835', { practice_id: PRACTICE, document_id: DOCUMENT });
        const replay = await enqueue(boss, 'parse_835', { practice_id: PRACTICE, document_id: DOCUMENT });
        const otherDocument = await enqueue(boss, 'parse_835', { practice_id: PRACTICE, document_id: OTHER_DOCUMENT });
        const otherPractice = await enqueue(boss, 'parse_835', { practice_id: OTHER_PRACTICE, document_id: DOCUMENT });
        expect(first).toEqual(expect.any(String));
        expect(replay).toBeNull();
        expect(otherDocument).toEqual(expect.any(String));
        expect(otherPractice).toEqual(expect.any(String));
      } finally {
        await boss.stop({ graceful: false, close: true });
      }
    });
  });

  it('runs a queued job through its handler and shuts down gracefully', async () => {
    await withScratchDatabase(readDatabaseUrl(), async (url) => {
      const boss = new PgBoss(url);
      boss.on('error', () => undefined);
      let resolveSeen: (jobId: string) => void = () => undefined;
      const seen = new Promise<string>((resolve) => {
        resolveSeen = resolve;
      });
      const worker = await startWorker({
        boss,
        logger: silent,
        heartbeatMs: 60_000,
        handlers: {
          ...placeholderHandlers,
          digest: (payload, context) => {
            expect(payload).toEqual({ practice_id: PRACTICE, period: '2026-10' });
            resolveSeen(context.jobId);
            return Promise.resolve();
          },
        },
      });
      try {
        const id = await enqueue(boss, 'digest', { practice_id: PRACTICE, period: '2026-10' });
        expect(await seen).toBe(id);
      } finally {
        await worker.stop();
      }
    });
  }, 30_000);
});
