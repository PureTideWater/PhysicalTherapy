import { createLogger } from '@tp/observability';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '../jobs/handlers';
import { reconcileHandler } from './job';
import { type ReconcileServices, reconcilePractice } from './pass';
import { generateRoiStatement } from './statements';
import type * as Pass from './pass';
import type * as Statements from './statements';

vi.mock('./pass', async (original) => ({ ...(await original<typeof Pass>()), reconcilePractice: vi.fn() }));
vi.mock('./statements', async (original) => ({ ...(await original<typeof Statements>()), generateRoiStatement: vi.fn() }));

const PRACTICE = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
const RUN = '1e4b8f8a-2c1d-4f7e-8b3a-5d6c7e8f9a02';
const DOCUMENT = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';
const JOB = '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382701';

const services = { documents: {}, keys: {} } as unknown as ReconcileServices;

function context(answer: unknown = undefined) {
  const lines: Record<string, unknown>[] = [];
  const job: JobContext = {
    jobId: JOB,
    logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }),
    transaction: (run) => run({ client: { query: () => Promise.resolve({ rows: answer === undefined ? [] : [answer] }) } } as never),
    enqueue: () => Promise.resolve('job'),
    lastAttempt: false,
  };
  return { job, lines };
}

describe('the reconcile job', () => {
  beforeEach(() => {
    vi.mocked(reconcilePractice).mockReset().mockResolvedValue({} as never);
    vi.mocked(generateRoiStatement).mockReset();
  });

  it.each([
    [undefined, 'RECONCILE_RUN_NOT_FOUND'],
    [{ status: 'running' }, 'RECONCILE_RUN_NOT_COMPLETE'],
  ])('leaves a pricing run that is not complete (%j)', async (answer, code) => {
    const { job, lines } = context(answer);
    await reconcileHandler(services)({ practice_id: PRACTICE, pricing_run_id: RUN }, job);
    expect(lines).toEqual([expect.objectContaining({ msg: 'reconcile found no complete pricing run', error_code: code, pricing_run_id: RUN })]);
    expect(reconcilePractice).not.toHaveBeenCalled();
  });

  it('reconciles the practice after a complete run, and after a stored export with the export read first', async () => {
    const run = context({ status: 'complete' });
    await reconcileHandler(services)({ practice_id: PRACTICE, pricing_run_id: RUN }, run.job);
    expect(reconcilePractice).toHaveBeenLastCalledWith(run.job, services, PRACTICE, {});
    expect(run.lines).toEqual([expect.objectContaining({ msg: 'reconcile complete', pricing_run_id: RUN })]);
    const exported = context();
    await reconcileHandler(services)({ practice_id: PRACTICE, document_id: DOCUMENT }, exported.job);
    expect(reconcilePractice).toHaveBeenLastCalledWith(exported.job, services, PRACTICE, { documentId: DOCUMENT });
    expect(exported.lines).toEqual([expect.objectContaining({ msg: 'reconcile complete', document_id: DOCUMENT })]);
    expect(generateRoiStatement).not.toHaveBeenCalled();
  });

  it('writes the quarterly ROI statement of the quarter before the day, and says so only when it is new', async () => {
    vi.mocked(generateRoiStatement).mockResolvedValueOnce({ id: 'statement' } as never).mockResolvedValueOnce(null);
    const first = context();
    await reconcileHandler(services)({ practice_id: PRACTICE, day: '2026-07-01' }, first.job);
    expect(generateRoiStatement).toHaveBeenLastCalledWith(expect.anything(), { practiceId: PRACTICE, periodFrom: '2026-04-01', periodTo: '2026-06-30', requestId: JOB }, expect.anything());
    expect(first.lines.map((line) => line.msg)).toEqual(['quarterly ROI statement generated', 'reconcile complete']);
    const again = context();
    await reconcileHandler(services)({ practice_id: PRACTICE, day: '2026-07-02' }, again.job);
    expect(again.lines.map((line) => line.msg)).toEqual(['reconcile complete']);
  });
});
