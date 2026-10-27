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
    const planned = await run({ outcome: 'planned', releaseNo: 900001, created: [], waitingOnMapping: [{ periodFrom: '2026-03-01', periodTo: '2026-03-31' }], waitingOnLocation: [], waitingOnContent: [], queued: [RUN] });
    expect(planned.queued).toEqual([{ type: 'price', payload: { practice_id: PRACTICE, pricing_run_id: RUN }, options: undefined }]);
    expect(planned.lines.map((line) => line.msg)).toEqual(['monitoring left months waiting on a plan mapping', 'monitoring planned the practice’s months']);
    const quiet = await run({ outcome: 'planned', releaseNo: 900001, created: [], waitingOnMapping: [], waitingOnLocation: [], waitingOnContent: [], queued: [] });
    expect(quiet.lines.map((line) => line.msg)).toEqual(['monitoring planned the practice’s months']);
    // On the daily schedule the day's own reconcile follows; nothing more is queued here.
    expect(quiet.queued).toEqual([]);
  });

  it('says how many months wait on the practice’s pricing location, as information, never the operator’s alert (audit #33)', async () => {
    const waiting = await run({
      outcome: 'planned',
      releaseNo: 900001,
      created: [],
      waitingOnMapping: [],
      waitingOnLocation: [
        { periodFrom: '2026-03-01', periodTo: '2026-03-31', status: 'zip_plus_four_needed' },
        { periodFrom: '2026-04-01', periodTo: '2026-04-30', status: 'zip_plus_four_needed' },
      ],
      waitingOnContent: [],
      queued: [],
    });
    expect(waiting.queued).toEqual([]);
    expect(waiting.lines).toEqual([
      expect.objectContaining({ level: 'info', msg: 'monitoring left months waiting on the practice’s pricing location', error_code: 'LOCATION_NOT_READY', record_count: 2, release_no: 900001 }),
      expect.objectContaining({ msg: 'monitoring planned the practice’s months' }),
    ]);
  });

  it('warns how many months wait on Medicare content PaidWhole has not loaded, by count and release only (audit #7)', async () => {
    const waiting = await run({
      outcome: 'planned',
      releaseNo: 900007,
      created: [],
      waitingOnMapping: [],
      waitingOnLocation: [{ periodFrom: '2026-09-01', periodTo: '2026-09-30', status: 'zip_plus_four_needed' }],
      waitingOnContent: [
        { periodFrom: '2026-10-01', periodTo: '2026-10-31', failureCode: 'waiting_on_content_mppr_mue', failedReleaseNo: 900007 },
        { periodFrom: '2026-11-01', periodTo: '2026-11-30', failureCode: 'waiting_on_content_mue', failedReleaseNo: 900007 },
      ],
      queued: [],
    });
    expect(waiting.queued).toEqual([]);
    expect(waiting.lines).toEqual([
      expect.objectContaining({ level: 'info', error_code: 'LOCATION_NOT_READY', record_count: 1 }),
      expect.objectContaining({ level: 'warn', msg: 'monitoring left months waiting on rule content PaidWhole has not loaded', release_no: 900007, error_code: 'WAITING_ON_CONTENT', record_count: 2 }),
      expect.objectContaining({ msg: 'monitoring planned the practice’s months' }),
    ]);
    // No code, family, month or quarter is logged.
    expect(JSON.stringify(waiting.lines)).not.toMatch(/waiting_on_content|mppr|2026-10-01|2026-10-31|2026-11-30/);
    // No month waiting, no warning.
    const quiet = await run({ outcome: 'planned', releaseNo: 900007, created: [], waitingOnMapping: [], waitingOnLocation: [], waitingOnContent: [], queued: [] });
    expect(quiet.lines.filter((line) => line.error_code === 'WAITING_ON_CONTENT')).toEqual([]);
  });

  it('plans after a save of the practice’s location, by the save’s request, and queues no reconcile for it', async () => {
    vi.mocked(planMonitoring).mockResolvedValue({ outcome: 'planned', releaseNo: 900001, created: [], waitingOnMapping: [], waitingOnLocation: [], waitingOnContent: [], queued: [RUN] });
    const { job, queued } = context();
    await monitorHandler()({ practice_id: PRACTICE, request_id: 'test-6f1d2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b' }, job);
    expect(vi.mocked(planMonitoring)).toHaveBeenCalledWith(expect.anything(), PRACTICE, job.jobId);
    expect(queued.map((item) => [item.type, item.payload])).toEqual([['price', { practice_id: PRACTICE, pricing_run_id: RUN }]]);
  });

  const afterDocument = async (plan: MonitorPlan) => {
    vi.mocked(planMonitoring).mockResolvedValue(plan);
    const { job, queued } = context();
    await monitorHandler()({ practice_id: PRACTICE, document_id: DOCUMENT }, job);
    return queued.map((item) => [item.type, item.payload]);
  };

  it('reconciles after a document whose plan prices nothing, and leaves the reconcile to triage when it prices a run (docs/adr/0043)', async () => {
    const reconcile = ['reconcile', { practice_id: PRACTICE, document_id: DOCUMENT }];
    expect(await afterDocument({ outcome: 'planned', releaseNo: 900001, created: [], waitingOnMapping: [], waitingOnLocation: [], waitingOnContent: [], queued: [] })).toEqual([reconcile]);
    expect(await afterDocument({ outcome: 'planned', releaseNo: 900001, created: [], waitingOnMapping: [{ periodFrom: '2026-03-01', periodTo: '2026-03-31' }], waitingOnLocation: [], waitingOnContent: [], queued: [] })).toEqual([reconcile]);
    expect(await afterDocument({ outcome: 'no_release' })).toEqual([reconcile]);
    expect(await afterDocument({ outcome: 'planned', releaseNo: 900001, created: [], waitingOnMapping: [], waitingOnLocation: [], waitingOnContent: [], queued: [RUN] })).toEqual([['price', { practice_id: PRACTICE, pricing_run_id: RUN }]]);
    expect(await afterDocument({ outcome: 'batch_loading', pendingDocuments: 1 })).toEqual([]);
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
