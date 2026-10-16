import { createLogger } from '@tp/observability';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '../jobs/handlers';
import { monitorHandler } from './job';
import type * as Plan from './plan';
import { type MonitorPlan, planMonitoring } from './plan';
import { queueMonitoring } from './trigger';

vi.mock('./plan', async (original) => ({ ...(await original<typeof Plan>()), planMonitoring: vi.fn() }));

const PRACTICE = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
const DOCUMENT = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';
const RUN = '1e4b8f8a-2c1d-4f7e-8b3a-5d6c7e8f9a02';

function context(answer: unknown = undefined, enqueue: JobContext['enqueue'] = () => Promise.resolve('job')) {
  const lines: Record<string, unknown>[] = [];
  const queued: { type: string; payload: unknown; options: unknown }[] = [];
  const job: JobContext = {
    jobId: '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382701',
    logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }),
    transaction: (run) => run({ client: { query: () => Promise.resolve({ rows: answer === undefined ? [] : [answer] }) } } as never),
    enqueue: (type, payload, options) => {
      queued.push({ type, payload, options });
      return enqueue(type, payload, options);
    },
    lastAttempt: false,
  };
  return { job, lines, queued };
}

describe('the monitor job', () => {
  beforeEach(() => {
    vi.mocked(planMonitoring).mockReset();
  });

  const run = async (plan: MonitorPlan) => {
    vi.mocked(planMonitoring).mockResolvedValue(plan);
    const { job, lines, queued } = context();
    await monitorHandler()({ practice_id: PRACTICE, day: '2026-11-01' }, job);
    return { lines, queued };
  };

  it('waits while a batch is still loading, and prices nothing without a rule release', async () => {
    expect(await run({ outcome: 'batch_loading', pendingDocuments: 2 })).toEqual({ lines: [expect.objectContaining({ msg: 'monitoring waits for the rest of the upload batch' })], queued: [] });
    const none = await run({ outcome: 'no_release' });
    expect(none.queued).toEqual([]);
    expect(none.lines).toEqual([expect.objectContaining({ msg: 'monitoring found no rule release in force; nothing was priced', error_code: 'NO_RULE_RELEASE' })]);
  });

  it('queues the price job of every run still queued, and says when months wait on a mapping', async () => {
    const planned = await run({ outcome: 'planned', releaseNo: 900001, created: [], waitingOnMapping: [{ periodFrom: '2026-03-01', periodTo: '2026-03-31' }], queued: [RUN] });
    expect(planned.queued).toEqual([{ type: 'price', payload: { practice_id: PRACTICE, pricing_run_id: RUN }, options: undefined }]);
    expect(planned.lines.map((line) => line.msg)).toEqual(['monitoring left months waiting on a plan mapping', 'monitoring planned the practice’s months']);
    const quiet = await run({ outcome: 'planned', releaseNo: 900001, created: [], waitingOnMapping: [], queued: [] });
    expect(quiet.lines.map((line) => line.msg)).toEqual(['monitoring planned the practice’s months']);
  });
});

describe('queueing the monitoring chain after a document', () => {
  it('waits for the rest of the batch, and never fails the parse that is done when the queue refuses', async () => {
    const ok = context();
    await queueMonitoring(ok.job, PRACTICE, DOCUMENT);
    expect(ok.queued).toEqual([{ type: 'monitor', payload: { practice_id: PRACTICE, document_id: DOCUMENT }, options: { startAfterSeconds: 120 } }]);
    const down = context(undefined, () => Promise.reject(new Error('queue down')));
    await expect(queueMonitoring(down.job, PRACTICE, DOCUMENT)).resolves.toBeUndefined();
    expect(down.lines).toEqual([expect.objectContaining({ error_code: 'MONITOR_NOT_QUEUED', document_id: DOCUMENT })]);
  });
});
