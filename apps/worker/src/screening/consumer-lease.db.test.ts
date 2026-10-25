import { type ChildProcess, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';

import { enqueueScreeningRun } from '../jobs/enqueue';
import { ORIGIN, manyRows, until, screeningDatabaseForThisFile } from './test-support/consumer';

/**
 * SCR-19 against PostgreSQL (docs/adr/0062; PR 6b-3), with SYNTHETIC release 900001 loaded and a split a contract
 * specialist approved: a consumer killed mid-run (after a recorded batch) leaves the run to another, which claims it
 * again at attempt 2 and emails it within 4 minutes of the kill, the batches recorded before the kill kept.
 *
 * Its own file, beside consumer.db.test.ts, because most of its time is the killed consumer's lease running out: in a
 * file of its own that wait runs beside the other database files in CI's shards instead of after them (audit #109;
 * docs/adr/0066).
 */

const MAIN = path.resolve(import.meta.dirname, '../main.ts');
const TSX = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;

const screening = screeningDatabaseForThisFile();

/** A consumer process, as the screening service runs it: WORKER_JOBS=screening, its two logins, its output collected. */
function consumerProcess(): { readonly child: ChildProcess; readonly lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];
  const child = spawn(process.execPath, ['--import', TSX, MAIN], {
    env: {
      PATH: process.env.PATH ?? '',
      NODE_ENV: 'test',
      WORKER_JOBS: 'screening',
      SCREENING_DATABASE_URL: screening.database.screeningUrl,
      QUEUE_DATABASE_URL: screening.database.url,
      MAIL_OUTBOX_DIR: screening.outbox,
      APP_ORIGIN: ORIGIN,
      SCREENING_CONCURRENCY: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let pending = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    pending += chunk.toString('utf8');
    const complete = pending.split('\n');
    pending = complete.pop() ?? '';
    for (const line of complete) {
      try {
        lines.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // Not a log line.
      }
    }
  });
  child.stderr?.resume();
  return { child, lines };
}

describe('SCR-19: a run whose consumer died is priced again within minutes, nothing lost', () => {
  it('claims a killed consumer’s run again at attempt 2, keeps the batches it recorded, and emails it within 4 minutes of the kill', { timeout: 420_000 }, async () => {
    const first = consumerProcess();
    let second: ReturnType<typeof consumerProcess> | undefined;
    try {
      await until(() => Promise.resolve(first.lines.some((line) => line.msg === 'worker started')), (started) => started, 60_000, 100);
      expect(first.lines.some((line) => line.msg === 'worker started')).toBe(true);
      const runId = await screening.submit(manyRows(50_000));
      const boss = new PgBoss(screening.database.url);
      boss.on('error', () => undefined);
      await boss.start();
      try {
        expect(await enqueueScreeningRun(boss, runId)).not.toBeNull();
      } finally {
        await boss.stop({ graceful: false });
      }
      // Killed once its first batch is recorded and before the run completes.
      const midway = await until(() => screening.runOf(runId), (run) => run.recorded > 0, 120_000, 20);
      first.child.kill('SIGKILL');
      const killedAt = Date.now();
      expect(midway.recorded).toBeGreaterThan(0);
      const kept = (await screening.owner.query<{ row_no: number; trace_sha256: string }>("SELECT row_no, trace_sha256 FROM screening_result WHERE run_id = $1 AND disposition <> 'pending' AND trace_sha256 IS NOT NULL ORDER BY row_no", [runId])).rows;
      const atKill = await screening.runOf(runId);
      expect(atKill).toMatchObject({ status: 'pricing', attempts: 1 });
      expect(atKill.pending).toBeGreaterThan(0);

      // The task ECS starts in its place.
      second = consumerProcess();
      const done = await until(() => screening.runOf(runId), (run) => run.status === 'complete', 300_000, 1_000);
      const recoveredIn = Date.now() - killedAt;
      expect(done).toMatchObject({ status: 'complete', attempts: 2, pending: 0 });
      expect(recoveredIn).toBeLessThan(240_000);
      expect(screening.emailsTo(await screening.contactOf(runId)).map((message) => message.subject)).toEqual([expect.stringContaining('Your screening is ready') as string]);
      // What the killed attempt recorded is kept as it recorded it.
      const after = (await screening.owner.query<{ row_no: number; trace_sha256: string }>('SELECT row_no, trace_sha256 FROM screening_result WHERE run_id = $1 AND row_no = ANY ($2) ORDER BY row_no', [
        runId,
        kept.map((row) => row.row_no),
      ])).rows;
      expect(after).toEqual(kept);
      expect(second.lines.filter((line) => line.msg === 'screening result emailed' && line.screening_run_id === runId)).toHaveLength(1);
    } finally {
      first.child.kill('SIGKILL');
      if (second !== undefined) {
        second.child.kill('SIGTERM');
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 20_000);
          second?.child.once('exit', () => {
            clearTimeout(timer);
            resolve(undefined);
          });
        });
      }
    }
  });
});
