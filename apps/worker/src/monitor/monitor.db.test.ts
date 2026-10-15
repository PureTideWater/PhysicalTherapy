import { ENCRYPTED_COLUMNS, LOOKUP_COLUMNS, type PracticeScope, type ScopeClient, readDatabaseUrl, withActor, withJobScope } from '@tp/db';
import { formatUsd, parseCents } from '@tp/money';
import { createLogger } from '@tp/observability';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DIGEST_QUERIES } from '../digest/figures';
import { digestHandler, prepareDigest } from '../digest/job';
import { monthName, previousMonth } from '../digest/view';
import { enqueue } from '../jobs/enqueue';
import { type JobHandlers, placeholderHandlers } from '../jobs/handlers';
import { databaseJobRuns } from '../jobs/runs';
import { type MailMessage, MemoryMailSender } from '../mail/mail';
import { parseHandler } from '../parse/job';
import { priceHandler } from '../price/job';
import { type Practice, RELEASE } from '../price/test-support/pricing-world';
import { reconcileHandler } from '../reconcile/job';
import { todayUtc } from '../triage/execute';
import { triageHandler } from '../triage/job';
import { TriageWorld } from '../triage/test-support/triage-world';
import { JOB_FAILED_MESSAGE, type RunningWorker, startWorker } from '../worker';
import { notifyRun } from './chain';
import { monitorHandler } from './job';
import { MONITOR_DELAY_SECONDS } from './plan';
import { MemoryQueue } from './test-support/memory-queue';

/**
 * The monitoring chain end to end against PostgreSQL on SYNTHETIC files (PRD 5, J11; PRD 6, Monitoring
 * jobs and notifications; PRD 18, Layers: "Integration: jobs end to end on synthetic files: parse,
 * price, triage, reconcile, digest; idempotency under replay; retries and alerts"; test matrix JOB-01,
 * JOB-02, JOB-03; docs/adr/0039). The real worker loop (startWorker: payload checks, one practice per
 * job, job_run, the last-attempt alert) runs every job from a queue in memory with pg-boss's singleton
 * keys and three attempts; the SYNTHETIC CAS fixtures are parsed and loaded by parse_835, their plans
 * mapped and fixed-schedule contracts signed off through @tp/contracts' services, under SYNTHETIC
 * release 900001.
 */

const ORIGIN = 'http://localhost:3000';
const FIXED = { effectiveFrom: '2026-01-01', disputeWindowDays: 3650 };

let w: TriageWorld;

beforeAll(async () => {
  w = await TriageWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

interface Chain {
  readonly queue: MemoryQueue;
  readonly worker: RunningWorker;
  readonly logs: Record<string, unknown>[];
  readonly mail: MemoryMailSender;
}

/** The worker loop over a queue in memory, with the chain's real handlers (any of them replaced). */
async function chain(replace: Partial<JobHandlers> = {}, now?: () => Date): Promise<Chain> {
  const queue = new MemoryQueue();
  const logs: Record<string, unknown>[] = [];
  const mail = new MemoryMailSender();
  const worker = await startWorker({
    boss: queue.client,
    pool: w.app,
    logger: createLogger({ sink: (line) => logs.push(JSON.parse(line) as Record<string, unknown>) }),
    handlers: {
      ...placeholderHandlers,
      parse_835: parseHandler(w.pricing.parseServices),
      monitor: monitorHandler(),
      price: priceHandler(),
      triage: triageHandler(),
      reconcile: reconcileHandler(),
      digest: digestHandler({ mail, appOrigin: ORIGIN, ...(now === undefined ? {} : { now }) }),
      ...replace,
    },
    runs: databaseJobRuns(w.app),
    heartbeatMs: 3_600_000,
  });
  return { queue, worker, logs, mail };
}

async function rows<T>(sql: string, values: unknown[]): Promise<T[]> {
  // The test's own connection is the superuser's: it reads every practice's rows to check them.
  return (await w.owner.query<T & object>(sql, values)).rows;
}

/** Everything the chain writes for a practice, counted: a replay must leave every count as it was (JOB-01). */
async function effects(practiceId: string): Promise<Record<string, number>> {
  const [row] = await rows<Record<string, number>>(
    `SELECT (SELECT count(*)::int FROM remittance WHERE practice_id = $1) AS remittances,
            (SELECT count(*)::int FROM service_line WHERE practice_id = $1) AS lines,
            (SELECT count(*)::int FROM pricing_run WHERE practice_id = $1) AS runs,
            (SELECT count(*)::int FROM priced_line WHERE practice_id = $1) AS priced_lines,
            (SELECT count(*)::int FROM anomaly WHERE practice_id = $1) AS anomalies,
            (SELECT count(*)::int FROM line_status WHERE practice_id = $1) AS stage_events,
            (SELECT count(*)::int FROM "case" WHERE practice_id = $1) AS cases,
            (SELECT count(*)::int FROM case_line WHERE practice_id = $1) AS case_lines,
            (SELECT count(*)::int FROM notification WHERE practice_id = $1) AS notifications,
            (SELECT count(*)::int FROM digest WHERE practice_id = $1) AS digests,
            (SELECT count(*)::int FROM digest WHERE practice_id = $1 AND sent_at IS NOT NULL) AS digests_sent`,
    [practiceId],
  );
  return row ?? {};
}

const parse = (target: Practice, documentId: string) => (queue: MemoryQueue) => enqueue(queue.client, 'parse_835', { practice_id: target.practiceId, document_id: documentId });

/** The practice home's run-failed banner: the latest run that failed on its last attempt, unless one with its key succeeded since (apps/web practice.ts). */
async function failedRun(practiceId: string): Promise<{ job_id: string; job_type: string } | undefined> {
  const [row] = await rows<{ job_id: string; job_type: string }>(
    `SELECT f.job_id, f.job_type FROM job_run f
      WHERE f.practice_id = $1 AND f.outcome = 'failed'
        AND NOT EXISTS (SELECT 1 FROM job_run s WHERE s.practice_id = f.practice_id AND s.singleton_key = f.singleton_key AND s.outcome = 'succeeded' AND s.started_at > f.started_at)
      ORDER BY f.finished_at DESC, f.id DESC LIMIT 1`,
    [practiceId],
  );
  return row;
}

/** The first day of the month after today's, early in the morning (UTC): when the operator's schedule queues the month's digest. */
function firstOfNextMonth(): Date {
  const today = new Date(`${todayUtc()}T00:00:00Z`);
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1, 5, 10));
}

async function contracts(target: Practice): Promise<void> {
  const one = await w.fixedContract(target, { ...FIXED, schedule: [{ code: '97110', amountCents: '5000' }] });
  const two = await w.fixedContract(target, { ...FIXED, schedule: [{ code: '97530', amountCents: '5200' }] });
  await w.pricing.mapped(target, await w.pricing.planOf(target, 'CE:SYNPLAN-FIX-ONE'), 'contract', '2026-01-01', one.versionId);
  await w.pricing.mapped(target, await w.pricing.planOf(target, 'CE:SYNPLAN-FIX-TWO'), 'contract', '2026-01-01', two.versionId);
}

describe('the monitoring chain on an upload batch (J11)', () => {
  let practice: Practice;
  let runId: string;

  it('waits for the rest of the batch, then for the mappings, then parses, prices, triages and reconciles under the release in force', async () => {
    practice = await w.practice('CHAIN');
    const first = await w.pricing.stage(practice, 'CAS-03/remit.835');
    const second = await w.pricing.stage(practice, 'CAS-05/remit.835');
    const c = await chain();
    try {
      // The first file of the batch is parsed; the second is still waiting for its parse.
      await parse(practice, first)(c.queue);
      expect((await c.queue.drain()).map((job) => [job.name, job.outcome])).toEqual([
        ['parse_835', 'succeeded'],
        ['monitor', 'succeeded'],
      ]);
      expect(c.queue.sent.find((job) => job.name === 'monitor')).toMatchObject({ data: { practice_id: practice.practiceId, document_id: first }, startAfter: MONITOR_DELAY_SECONDS });
      expect(c.logs.filter((line) => line.msg === 'monitoring waits for the rest of the upload batch')).toHaveLength(1);
      expect((await effects(practice.practiceId)).runs).toBe(0);

      // The last file of the batch: now the month is planned, and refused while its plans are unmapped (MAP-01).
      await parse(practice, second)(c.queue);
      expect((await c.queue.drain()).map((job) => [job.name, job.outcome])).toEqual([
        ['parse_835', 'succeeded'],
        ['monitor', 'succeeded'],
      ]);
      expect(c.logs.find((line) => line.error_code === 'UNMAPPED_PLAN')).toMatchObject({ msg: 'monitoring left months waiting on a plan mapping', release_no: RELEASE });
      expect((await effects(practice.practiceId)).runs).toBe(0);

      // Mapped and signed off, the month is priced on the next trigger: the operator's daily schedule.
      await contracts(practice);
      await enqueue(c.queue.client, 'monitor', { practice_id: practice.practiceId, day: todayUtc() });
      const ran = await c.queue.drain();
      expect(ran.map((job) => [job.name, job.outcome])).toEqual([
        ['monitor', 'succeeded'],
        ['price', 'succeeded'],
        ['triage', 'succeeded'],
        ['reconcile', 'succeeded'],
      ]);
      const monitorJob = ran[0]?.id;
      const runs = await rows<Record<string, unknown>>(
        'SELECT id, period_from::text, period_to::text, release_no, status, created_by, created_by_job_id, rerun_of_id FROM pricing_run WHERE practice_id = $1',
        [practice.practiceId],
      );
      expect(runs).toEqual([
        { id: expect.any(String), period_from: '2026-03-01', period_to: '2026-03-31', release_no: RELEASE, status: 'complete', created_by: null, created_by_job_id: monitorJob, rerun_of_id: null },
      ]);
      runId = String(runs[0]?.id);
      expect(ran.slice(1).map((job) => job.data)).toEqual([
        { practice_id: practice.practiceId, pricing_run_id: runId },
        { practice_id: practice.practiceId, pricing_run_id: runId },
        { practice_id: practice.practiceId, pricing_run_id: runId },
      ]);
      expect(await effects(practice.practiceId)).toMatchObject({ remittances: 2, lines: 17, runs: 1, priced_lines: 17, cases: 2, case_lines: 16 });
      expect(await rows('SELECT actionable_cents::text AS cents FROM "case" WHERE practice_id = $1 ORDER BY actionable_cents DESC', [practice.practiceId])).toEqual([{ cents: '28000' }, { cents: '27200' }]);

      // Each person who reaches the practice is told in the app, once: counts and totals only.
      const [billed] = await rows<{ cents: string }>('SELECT sum(charge_cents)::text AS cents FROM service_line WHERE practice_id = $1', [practice.practiceId]);
      const notifications = await rows<{ user_id: string; kind: string; subject_id: string; counts: unknown; totals_cents: unknown; read_at: Date | null }>(
        'SELECT user_id, kind, subject_id, counts, totals_cents, read_at FROM notification WHERE practice_id = $1 ORDER BY user_id',
        [practice.practiceId],
      );
      const told = {
        kind: 'monitoring_run',
        subject_id: runId,
        counts: { lines: 17, priced_lines: 17, unpriced_lines: 0, validated_lines: 17, flagged_lines: 0, cases: 2 },
        totals_cents: { billed: billed?.cents, priced_billed: billed?.cents, validated_variance: '55500' },
        read_at: null,
      };
      expect(notifications).toEqual([practice.world.adminUserId, practice.manager].sort().map((user) => ({ user_id: user, ...told })));

      // Every step is recorded in job_run with its key (type, practice, subject) and its idempotency key.
      const recorded = await rows<{ job_type: string; singleton_key: string; idempotency_key: string; attempts: number; outcome: string }>(
        'SELECT job_type, singleton_key, idempotency_key, attempts, outcome FROM job_run WHERE practice_id = $1 ORDER BY started_at, id',
        [practice.practiceId],
      );
      const key = (type: string, subject: string) => ({ job_type: type, singleton_key: `${type}:${practice.practiceId}:${subject}`, idempotency_key: subject, attempts: 1, outcome: 'succeeded' });
      expect(recorded).toEqual([
        key('parse_835', first),
        key('monitor', first),
        key('parse_835', second),
        key('monitor', second),
        key('monitor', todayUtc()),
        key('price', runId),
        key('triage', runId),
        key('reconcile', runId),
      ]);
      expect(c.logs.find((line) => line.msg === 'reconcile ran; the recovery ledger has no entries to post yet')).toMatchObject({ job_type: 'reconcile', pricing_run_id: runId });
      expect(c.logs.filter((line) => line.msg === JOB_FAILED_MESSAGE)).toEqual([]);
    } finally {
      await c.worker.stop();
    }
  });

  it('has no duplicate effect when every job is replayed with its key (JOB-01)', async () => {
    const before = await effects(practice.practiceId);
    const documents = await rows<{ id: string }>("SELECT id FROM source_document WHERE practice_id = $1 AND kind = 'x12_835' ORDER BY created_at", [practice.practiceId]);
    const c = await chain();
    try {
      const id = { practice_id: practice.practiceId };
      for (const document of documents) {
        await enqueue(c.queue.client, 'parse_835', { ...id, document_id: document.id });
        await enqueue(c.queue.client, 'monitor', { ...id, document_id: document.id });
      }
      await enqueue(c.queue.client, 'monitor', { ...id, day: todayUtc() });
      await enqueue(c.queue.client, 'price', { ...id, pricing_run_id: runId });
      await enqueue(c.queue.client, 'triage', { ...id, pricing_run_id: runId });
      await enqueue(c.queue.client, 'reconcile', { ...id, pricing_run_id: runId });
      // A replay while the same key is queued is refused by the queue itself.
      expect(await enqueue(c.queue.client, 'price', { ...id, pricing_run_id: runId })).toBeNull();
      const ran = await c.queue.drain();
      expect(ran.every((job) => job.outcome === 'succeeded')).toBe(true);
    } finally {
      await c.worker.stop();
    }
    expect(await effects(practice.practiceId)).toEqual(before);
    expect(await rows("SELECT count(*)::int AS n FROM job_run WHERE practice_id = $1 AND outcome <> 'succeeded'", [practice.practiceId])).toEqual([{ n: 0 }]);
  });

  it('sends the month’s digest once, by each person’s preferences: counts and dollar totals only (JOB-03, JOB-01)', async () => {
    const period = todayUtc().slice(0, 7);
    // The billing manager keeps the app's notifications and turns the digest email off, in their own settings.
    await withActor(w.app, practice.manager, (scope) => scope.client.query('UPDATE "user" SET settings = $2 WHERE id = $1', [practice.manager, JSON.stringify({ notifications: { digest_email: false } })]));

    // Not while the month is open: a digest reports on a whole month.
    const early = await chain();
    try {
      await enqueue(early.queue.client, 'digest', { practice_id: practice.practiceId, period });
      expect((await early.queue.drain()).map((job) => job.outcome)).toEqual(['succeeded']);
      expect(early.logs.find((line) => line.error_code === 'DIGEST_MONTH_OPEN')).toBeDefined();
      expect((await effects(practice.practiceId)).digests).toBe(0);
    } finally {
      await early.worker.stop();
    }

    const c = await chain({}, firstOfNextMonth);
    try {
      await enqueue(c.queue.client, 'digest', { practice_id: practice.practiceId, period });
      expect((await c.queue.drain()).map((job) => job.outcome)).toEqual(['succeeded']);
      const [digest] = await rows<{ id: string; period: string; counts: unknown; totals_cents: unknown; sent: boolean }>(
        'SELECT id, period, counts, totals_cents, sent_at IS NOT NULL AS sent FROM digest WHERE practice_id = $1',
        [practice.practiceId],
      );
      const payer = await w.pricing.payerOf(practice);
      const [billed] = await rows<{ cents: string }>('SELECT sum(charge_cents)::text AS cents FROM service_line WHERE practice_id = $1', [practice.practiceId]);
      expect(digest).toEqual({
        id: expect.any(String),
        period,
        counts: {
          validated_lines: 17,
          validated_payers: 1,
          validated_lines_by_payer: { [payer]: 17 },
          cases_nearing_deadline: 0,
          recoveries_posted: 0,
          coverage_lines: 17,
          coverage_priced_lines: 17,
          contracts_expiring: 0,
        },
        totals_cents: {
          validated_variance: '55500',
          validated_variance_by_payer: { [payer]: '55500' },
          cases_nearing_deadline_actionable: '0',
          recovered: '0',
          coverage_billed: billed?.cents,
          coverage_priced_billed: billed?.cents,
        },
        sent: true,
      });
      // One email, to the administrator only: fixed sentences, counts, dollar totals and one link of opaque IDs.
      const [admin] = await rows<{ email: string }>('SELECT email FROM "user" WHERE id = $1', [practice.world.adminUserId]);
      const usd = formatUsd(parseCents(billed?.cents ?? '0'));
      const link = `${ORIGIN}/p/${practice.practiceId}/digests/${digest?.id ?? ''}`;
      expect(c.mail.sent.map((message: MailMessage & { body: string }) => ({ to: message.to, subject: message.subject, body: message.body }))).toEqual([
        {
          to: [admin?.email],
          subject: `Monitoring digest for ${monthName(period)}`,
          body: [
            `Monitoring digest for ${monthName(period)}: counts and dollar totals only.`,
            'New validated variance: $555.00 on 17 lines across 1 payer.',
            'Payer 1: $555.00 validated on 17 lines.',
            'Cases nearing their deadline (within 14 days): 0, actionable $0.00.',
            'Recoveries posted: 0, recovered $0.00.',
            `Coverage: 17 of 17 lines priced (100.0%); ${usd} of ${usd} billed (100.0%). There is no earlier digest to compare it with.`,
            'Contracts expiring within 90 days: 0.',
            'Open the digest in the application for the detail:',
            '',
            link,
          ].join('\n'),
        },
      ]);
      // No patient, claim or payer identifier from the SYNTHETIC files reaches the email.
      expect(c.mail.sent[0]?.body).not.toMatch(/SYNTH(LAST|FIRST)|SYNPCN|SYNCCN|SYNMBR|SYNPAYER|SYNPLAN|SYNTHETIC PAYER/);
      // Both keep the app's notifications on: each is told once, with the same figures.
      expect(await rows("SELECT user_id, counts = $2::jsonb AS same FROM notification WHERE practice_id = $1 AND kind = 'digest' ORDER BY user_id", [practice.practiceId, JSON.stringify(digest?.counts)])).toEqual(
        [practice.world.adminUserId, practice.manager].sort().map((user) => ({ user_id: user, same: true })),
      );

      // Replayed the next day by the schedule: nothing is sent again (JOB-01).
      const before = await effects(practice.practiceId);
      await enqueue(c.queue.client, 'digest', { practice_id: practice.practiceId, period });
      await c.queue.drain();
      expect(c.mail.sent).toHaveLength(1);
      expect(await effects(practice.practiceId)).toEqual(before);
      expect(c.logs.find((line) => line.msg === 'digest already sent')).toMatchObject({ digest_id: digest?.id });
    } finally {
      await c.worker.stop();
    }
  });
});

describe('retries and alerts (JOB-02)', () => {
  it('retries a failed digest three times, alerts the operator once, shows the run failed, and a replay with its key clears it', async () => {
    const practice = await w.practice('CHAIN-MAIL');
    const period = previousMonth(todayUtc());
    let failing = true;
    const flaky = new MemoryMailSender();
    const c = await chain({
      digest: digestHandler({
        mail: { send: (message) => (failing ? Promise.reject(new Error('SYNTHETIC mail outage')) : flaky.send(message)) },
        appOrigin: ORIGIN,
      }),
    });
    try {
      await enqueue(c.queue.client, 'digest', { practice_id: practice.practiceId, period });
      const ran = await c.queue.drain();
      expect(ran.map((job) => [job.attempt, job.outcome])).toEqual([
        [1, 'retrying'],
        [2, 'retrying'],
        [3, 'failed'],
      ]);
      const jobId = ran[0]?.id;
      expect(c.logs.filter((line) => line.msg === JOB_FAILED_MESSAGE)).toEqual([expect.objectContaining({ job_id: jobId, job_type: 'digest', error_code: 'JOB_FAILED' })]);
      expect(await rows('SELECT job_type, idempotency_key, attempts, outcome, error_code FROM job_run WHERE job_id = $1', [jobId])).toEqual([
        { job_type: 'digest', idempotency_key: period, attempts: 3, outcome: 'failed', error_code: 'JOB_FAILED' },
      ]);
      expect(await failedRun(practice.practiceId)).toEqual({ job_id: jobId, job_type: 'digest' });
      // Its figures were recorded once and the app told once, whatever the attempts.
      expect(await effects(practice.practiceId)).toMatchObject({ digests: 1, digests_sent: 0, notifications: 2 });

      // The operator replays it with the same key (PRD 19, Job failure runbook): sent once, and the banner clears.
      failing = false;
      await enqueue(c.queue.client, 'digest', { practice_id: practice.practiceId, period });
      expect((await c.queue.drain()).map((job) => job.outcome)).toEqual(['succeeded']);
      expect(flaky.sent).toHaveLength(2);
      expect(await effects(practice.practiceId)).toMatchObject({ digests: 1, digests_sent: 1, notifications: 2 });
      expect(await failedRun(practice.practiceId)).toBeUndefined();
    } finally {
      await c.worker.stop();
    }
  });

  it('marks a run failed when its price job fails three times, and the next trigger prices the month again', async () => {
    const practice = await w.practice('CHAIN-PRICE');
    const document = await w.pricing.stage(practice, 'CAS-05/remit.835');
    // A price job that fails inside the real handler on every attempt (a negative batch size is refused by SQL).
    const broken = await chain({ price: priceHandler({ claimsPerBatch: -1 }) });
    try {
      await parse(practice, document)(broken.queue);
      await broken.queue.drain();
      const one = await w.fixedContract(practice, { ...FIXED, schedule: [{ code: '97110', amountCents: '5000' }] });
      await w.pricing.mapped(practice, await w.pricing.planOf(practice, 'CE:SYNPLAN-FIX-ONE'), 'contract', '2026-01-01', one.versionId);
      await enqueue(broken.queue.client, 'monitor', { practice_id: practice.practiceId, day: todayUtc() });
      expect((await broken.queue.drain()).map((job) => [job.name, job.outcome])).toEqual([
        ['monitor', 'succeeded'],
        ['price', 'retrying'],
        ['price', 'retrying'],
        ['price', 'failed'],
      ]);
      expect(broken.logs.filter((line) => line.msg === JOB_FAILED_MESSAGE)).toEqual([expect.objectContaining({ job_type: 'price' })]);
      expect(await rows('SELECT status, failure_code FROM pricing_run WHERE practice_id = $1', [practice.practiceId])).toEqual([{ status: 'failed', failure_code: 'job_failed' }]);
      expect(await failedRun(practice.practiceId)).toMatchObject({ job_type: 'price' });
    } finally {
      await broken.worker.stop();
    }
    // A failed run holds no lines and covers nothing: the day's schedule prices the month again.
    const c = await chain();
    try {
      await enqueue(c.queue.client, 'monitor', { practice_id: practice.practiceId, day: todayUtc() });
      expect((await c.queue.drain()).map((job) => [job.name, job.outcome])).toEqual([
        ['monitor', 'succeeded'],
        ['price', 'succeeded'],
        ['triage', 'succeeded'],
        ['reconcile', 'succeeded'],
      ]);
    } finally {
      await c.worker.stop();
    }
    expect(await rows('SELECT status, failure_code FROM pricing_run WHERE practice_id = $1 ORDER BY created_at', [practice.practiceId])).toEqual([
      { status: 'failed', failure_code: 'job_failed' },
      { status: 'complete', failure_code: null },
    ]);
    expect(await failedRun(practice.practiceId)).toMatchObject({ job_type: 'price' });
  });

  it('plans nothing while a batch’s files are still on their way, unless one has been on its way past the batch window', async () => {
    const practice = await w.practice('CHAIN-PENDING');
    await w.pricing.stage(practice, 'CAS-04/remit.835');
    const c = await chain();
    try {
      await enqueue(c.queue.client, 'monitor', { practice_id: practice.practiceId, day: todayUtc() });
      await c.queue.drain();
      expect(c.logs.find((line) => line.msg === 'monitoring waits for the rest of the upload batch')).toBeDefined();
      // A file stuck on its way for more than the batch window no longer holds the plan back.
      await w.owner.query("UPDATE source_document SET created_at = now() - interval '2 hours' WHERE practice_id = $1", [practice.practiceId]);
      await enqueue(c.queue.client, 'monitor', { practice_id: practice.practiceId, day: '2026-01-01' });
      await c.queue.drain();
      expect(c.logs.find((line) => line.msg === 'monitoring planned the practice’s months')).toBeDefined();
    } finally {
      await c.worker.stop();
    }
  });
});

describe('digests and notifications carry counts and totals only (JOB-03)', () => {
  it('has no column on either table that a name, an identifier or a document’s text could be put in', async () => {
    const columns = await rows<{ table_name: string; column_name: string; data_type: string }>(
      "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('notification', 'digest') ORDER BY table_name, ordinal_position",
      [],
    );
    expect(columns.map((column) => `${column.table_name}.${column.column_name}:${column.data_type}`)).toEqual([
      'digest.id:uuid',
      'digest.practice_id:uuid',
      'digest.period:text',
      'digest.counts:jsonb',
      'digest.totals_cents:jsonb',
      'digest.sent_at:timestamp with time zone',
      'digest.created_at:timestamp with time zone',
      'digest.updated_at:timestamp with time zone',
      'notification.id:uuid',
      'notification.practice_id:uuid',
      'notification.user_id:uuid',
      'notification.kind:text',
      'notification.subject_id:uuid',
      'notification.counts:jsonb',
      'notification.totals_cents:jsonb',
      'notification.read_at:timestamp with time zone',
      'notification.created_at:timestamp with time zone',
      'notification.updated_at:timestamp with time zone',
    ]);
  });

  it('refuses any figure that is not a count or integer cents, keyed by a code or an opaque ID', async () => {
    const practice = await w.practice('FIGURES');
    const attempt = (counts: unknown, totals: unknown) =>
      w.owner
        .query("INSERT INTO digest (practice_id, period, counts, totals_cents) VALUES ($1, '2025-01', $2, $3)", [practice.practiceId, JSON.stringify(counts), JSON.stringify(totals)])
        .then(
          () => 'accepted',
          (error: { code?: string; constraint?: string }) => `${error.code ?? ''} ${error.constraint ?? ''}`,
        );
    expect(await attempt({ lines: 1, by_payer: { [randomUUID()]: 2 } }, { variance: '-1250', by_payer: { [randomUUID()]: '300' } })).toBe('accepted');
    for (const [counts, totals] of [
      [{ patient: 'SYNTHETIC NAME' }, {}],
      [{ lines: 1.5 }, {}],
      [{ lines: -1 }, {}],
      [{ 'SYNTHLAST SYNTHFIRST': 1 }, {}],
      [{ by_payer: { 'SYNTHETIC PAYER Q': 1 } }, {}],
      [{ deeper: { a: { b: 1 } } }, {}],
      [[1, 2], {}],
    ] as const) {
      expect(await attempt(counts, totals), JSON.stringify(counts)).toBe('23514 digest_counts_only');
    }
    for (const totals of [{ variance: 1250 }, { variance: '12.50' }, { variance: 'SYNPCNCAS03001' }, { note: { a: 'SYNTHETIC' } }]) {
      expect(await attempt({}, totals), JSON.stringify(totals)).toBe('23514 digest_totals_only');
    }
  });

  it('reads no PHI column to build a digest or a run’s notification', async () => {
    const [practice] = await rows<{ id: string }>("SELECT p.id FROM practice p WHERE p.name = 'SYNTHETIC PRACTICE CHAIN'", []);
    const practiceId = practice?.id ?? '';
    const [run] = await rows<{ id: string }>("SELECT id FROM pricing_run WHERE practice_id = $1 AND status = 'complete'", [practiceId]);
    const statements: string[] = [];
    const jobId = randomUUID();
    await withJobScope(w.app, { jobId, practiceId }, async (scope) => {
      const recording: PracticeScope<ScopeClient> = {
        ...scope,
        client: {
          query: (text: string, values?: unknown[]) => {
            statements.push(text);
            return scope.client.query(text, values);
          },
          release: () => undefined,
        } as ScopeClient,
      };
      // A month with no digest yet, so every figure is read.
      await prepareDigest(recording, practiceId, '2026-01', '2026-02-01');
      await notifyRun(recording, practiceId, run?.id ?? '');
    });
    for (const query of Object.values(DIGEST_QUERIES)) {
      expect(statements).toContain(query);
    }
    const phi = [...ENCRYPTED_COLUMNS, ...LOOKUP_COLUMNS].map((column) => column.split('.')[1] ?? column);
    const forbidden = [...new Set([...phi, 'patient_ref', 'patient_ref_id', 'insured_ref_id', 'trace', 'raw', 'page_text'])];
    for (const statement of statements) {
      for (const name of forbidden) {
        expect(new RegExp(`\\b${name}\\b`).test(statement), `${name} in: ${statement.slice(0, 80)}`).toBe(false);
      }
    }
  });
});

describe('notification preferences in the user’s own settings', () => {
  it('are set by the user alone, in the shape the database admits', async () => {
    const practice = await w.practice('PREFERENCES');
    const set = (actor: string, target: string, settings: unknown) =>
      withActor(w.app, actor, async (scope) => (await scope.client.query('UPDATE "user" SET settings = $2 WHERE id = $1', [target, JSON.stringify(settings)])).rowCount).then(
        (count) => count,
        (error: { code?: string }) => error.code,
      );
    expect(await set(practice.manager, practice.manager, { notifications: { in_app: false, digest_email: true } })).toBe(1);
    // Nobody sets another person's preferences.
    expect(await set(practice.manager, practice.world.adminUserId, { notifications: { in_app: false } })).toBe(0);
    for (const wrong of [{ notifications: { in_app: 'no' } }, { notifications: { sms: true } }, { theme: 'dark' }]) {
      expect(await set(practice.manager, practice.manager, wrong)).toBe('23514');
    }
    // A person cannot read the practice's recipients and their addresses; only a practice job can.
    await expect(
      withActor(w.app, practice.manager, (scope) => scope.client.query("SELECT set_config('app.practice_ids', $1, true)", [`{${practice.practiceId}}`]).then(() => scope.client.query('SELECT * FROM practice_notification_recipients()'))),
    ).rejects.toMatchObject({ code: '42501' });
    const recipients = await withJobScope(
      w.app,
      { jobId: randomUUID(), practiceId: practice.practiceId },
      async (scope) => (await scope.client.query<{ user_id: string; digest_email: boolean; in_app: boolean }>('SELECT user_id, digest_email, in_app FROM practice_notification_recipients() ORDER BY user_id')).rows,
    );
    expect(recipients).toEqual(
      [
        { user_id: practice.world.adminUserId, digest_email: true, in_app: true },
        { user_id: practice.manager, digest_email: true, in_app: false },
      ].sort((a, b) => (a.user_id < b.user_id ? -1 : 1)),
    );
  });
});
