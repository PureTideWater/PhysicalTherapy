import { createLogger } from '@tp/observability';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '../jobs/handlers';
import { ExportLoadFailed, reconcileHandler } from './job';
import { type ReconcileServices, reconcilePractice } from './pass';
import { queueUnprinted } from './print';
import { generateRoiStatement } from './statements';
import type * as Pass from './pass';
import type * as Print from './print';
import type * as Statements from './statements';

vi.mock('./pass', async (original) => ({ ...(await original<typeof Pass>()), reconcilePractice: vi.fn() }));
vi.mock('./statements', async (original) => ({ ...(await original<typeof Statements>()), generateRoiStatement: vi.fn() }));
vi.mock('./print', async (original) => ({ ...(await original<typeof Print>()), queueUnprinted: vi.fn() }));

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
    vi.mocked(reconcilePractice).mockReset().mockResolvedValue({ exports: [] } as never);
    vi.mocked(generateRoiStatement).mockReset();
    vi.mocked(queueUnprinted).mockReset().mockResolvedValue(0);
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
    expect(queueUnprinted).not.toHaveBeenCalled();
  });

  it('writes the quarterly ROI statement of the quarter before the day, says so only when it is new, and queues the prints not done', async () => {
    vi.mocked(generateRoiStatement).mockResolvedValueOnce({ statementId: DOCUMENT } as never).mockResolvedValueOnce(null);
    const first = context();
    await reconcileHandler(services)({ practice_id: PRACTICE, day: '2026-07-01' }, first.job);
    expect(generateRoiStatement).toHaveBeenLastCalledWith(expect.anything(), { practiceId: PRACTICE, periodFrom: '2026-04-01', periodTo: '2026-06-30', requestId: JOB }, expect.anything());
    expect(first.lines.map((line) => line.msg)).toEqual(['quarterly ROI statement generated', 'reconcile complete']);
    expect(first.lines[0]).toMatchObject({ roi_statement_id: DOCUMENT });
    expect(queueUnprinted).toHaveBeenLastCalledWith(first.job, PRACTICE);
    const again = context();
    await reconcileHandler(services)({ practice_id: PRACTICE, day: '2026-07-02' }, again.job);
    expect(again.lines.map((line) => line.msg)).toEqual(['reconcile complete']);
    expect(queueUnprinted).toHaveBeenCalledTimes(2);
  });

  it('fails the attempt after the rest of its work when an export failed to load, so it is retried', async () => {
    vi.mocked(reconcilePractice).mockResolvedValue({ exports: [{ documentId: DOCUMENT, kind: 'posting_export', outcome: 'failed', stored: 0, repeated: 0, problems: 0 }] } as never);
    vi.mocked(generateRoiStatement).mockResolvedValueOnce(null);
    const daily = context();
    await expect(reconcileHandler(services)({ practice_id: PRACTICE, day: '2026-07-01' }, daily.job)).rejects.toThrow(ExportLoadFailed);
    // The quarter's statement and the prints were still seen to first.
    expect(generateRoiStatement).toHaveBeenCalledTimes(1);
    expect(queueUnprinted).toHaveBeenCalledTimes(1);
    expect(daily.lines).toEqual([]);
  });
});
