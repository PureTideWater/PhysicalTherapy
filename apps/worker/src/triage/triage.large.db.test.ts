import { type ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { type DatabaseClient, type PracticeCipher, LocalKeyProvider, databaseClient, provisionPracticeKey, readDatabaseUrl } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Practice } from '../price/test-support/pricing-world';
import { generateAuditReport } from '../report/generate';
import type { LargeJobsInput, LargeJobsOutput } from './test-support/large-jobs';
import { TriageWorld } from './test-support/triage-world';

/**
 * CAS-42.1 and CAS-42.2 (SUITE-CAP-1b; docs/adr/0083, section 8.4's budgets): a real-size month triages and reports
 * alone, and beside another practice's large triage, within the worker's heap and holding at most one advisory lock.
 *
 * The harness's shape (tools/release-capacity), which the design's probes used: B's month (LINES / 5 lines) is priced,
 * triaged and reported first. A's month and Y's month (LINES lines each, 100,000 by default; TP_LARGE_TRIAGE_LINES sets
 * it) are priced. Each month is half Medicare Advantage non-contracted and half under a SYNTHETIC contract at 110% of
 * Medicare whose 365-day dispute window is cited and verified, in claims of four lines with SYNTHETIC claim numbers
 * sealed under the practice's key, bulk-inserted as the owner (as price.large.db.test.ts does) and priced by the price
 * job under SYNTHETIC release 900001.
 *
 * 1. Each job alone: A's triage (executeTriage), then A's audit report (generateAuditReport, its inline triage a
 *    re-triage), each in a child process of its own (test-support/large-jobs.ts, as era-export.large.db.test.ts runs
 *    its bound) under `--max-old-space-size` at 75% of the worker's heap (HEAP_MIB.worker, infra/lib/heap.ts: 420 of
 *    560 MiB), with Chromium where it is installed. Each child exits 0 with no heap error; every candidate's stage events
 *    are present; no backend holds more than one advisory lock at any sample (every 25 ms: the practice's `triage:`
 *    lock); A's triage takes under 120 s and its actionable write under 30 s; A's report under 180 s; and the live heap
 *    after major collections (D19's observer, apps/worker/src/heap.ts) stays under 75% of the flag in force.
 * 2. Together: A's second audit report and Y's triage at once in one child under the worker's own flag (560 MiB), as
 *    the worker runs two practices' jobs in one process. Both complete, the child exits 0, at most one advisory lock per
 *    backend, and the live heap stays under 75% of the limit (420 MiB).
 *
 * Fails first on SUITE-CAP-1a's merge (before 20261109090000_line_status_heads.sql): the per-line `line_status:` lock
 * runs the cluster's shared lock table out at a triage's validated insert (53200, out of shared memory), so B's,
 * A's and Y's triages fail.
 *
 * Synthetic data only. Run alone with Chromium (section 8.2): DATABASE_URL=postgres://postgres:test@localhost:5433/postgres
 * PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm exec vitest run --project db apps/worker/src/triage/triage.large.db.test.ts
 */

const LINES = Number.parseInt(process.env.TP_LARGE_TRIAGE_LINES ?? '100000', 10);
/** B's month, the harness's report practice: a fifth of A's (20,000 at full size). */
const B_LINES = Math.max(4, Math.round(LINES / 5));
const PER_CLAIM = 4;
const CODES = ['97110', '97112', '97140', '97530', '97116', '97161'];
/** The triage date: inside the contract's 365-day window from the remittances' payment date (2026-04-15). */
const AS_OF = '2026-10-26';
const REPO = path.resolve(import.meta.dirname, '../../../..');
const CHILD = path.join(REPO, 'apps/worker/src/triage/test-support/large-jobs.ts');

/** The worker's heap limit in MiB, read from infra/lib/heap.ts's HEAP_MIB (its text: no apps/worker file imports infra). */
const WORKER_HEAP_MIB = Number.parseInt(/worker:\s*(\d+)/.exec(readFileSync(path.join(REPO, 'infra/lib/heap.ts'), 'utf8'))?.[1] ?? '', 10);
/** The share of a heap limit a job's live heap stays under, and the alone flag's share of the worker's heap (75%). */
const LIVE_PERCENT = 75;
const ALONE_HEAP_MIB = Math.floor((WORKER_HEAP_MIB * LIVE_PERCENT) / 100);

/** Section 8.4's budgets: about two and a half times the probes (G2: 49.8 s, 5.0 s and 73.1 s; T: 52.4 s and 84.5 s). */
const TRIAGE_BUDGET_MS = 120_000;
const ACTIONABLE_WRITE_BUDGET_MS = 30_000;
const REPORT_BUDGET_MS = 180_000;
/** The most advisory locks any backend may hold while a measured job runs: the practice's `triage:` lock. */
const MOST_ADVISORY_LOCKS = 1;
const LOCK_SAMPLE_MS = 25;
/** A child that has not answered by then is stopped (the job's own attempt is 15 minutes). */
const CHILD_TIMEOUT_MS = 900_000;

interface Month {
  readonly practice: Practice;
  readonly runId: string;
}

let w: TriageWorld;
let locks: DatabaseClient;
let a: Month;
let y: Month;

/** The months' local master key, which the report jobs open the practices' data keys with (synthetic, this run's own). */
const MASTER_KEY = randomBytes(32);
const childKeys = new LocalKeyProvider(MASTER_KEY);

/**
 * A month of `lines` SYNTHETIC lines in a practice of its own, priced by the price job: the practice's data key sealed
 * under MASTER_KEY, so a child can open it.
 */
async function pricedMonth(label: string, lines: number): Promise<Month> {
  const practice = await w.practice(label);
  const { practiceId } = practice;
  const key = await provisionPracticeKey(childKeys, practiceId);
  await w.owner.query('UPDATE practice SET data_key_ref = $1 WHERE id = $2', [key.dataKeyRef, practiceId]);
  const cipher: PracticeCipher = key.cipher;
  const claims = Math.ceil(lines / PER_CLAIM);
  const { owner } = w;
  await asOwner(owner, [practiceId], async () => {
    const one = async (sql: string, values: unknown[]) => ((await owner.query<{ id: string }>(sql, values)).rows[0] as { id: string }).id;
    const document = await one(
      "INSERT INTO source_document (practice_id, kind, size_bytes, content_type, uploaded_by, sha256, scan_status, scan_at, status) VALUES ($1, 'x12_835', 1, 'application/octet-stream', $2, $3, 'clean', now(), 'loaded') RETURNING id",
      [practiceId, practice.manager, 'a'.repeat(64)],
    );
    const payer = await one("INSERT INTO payer (practice_id, payer_id_raw, name_raw) VALUES ($1, '2U:SYNLARGE', 'SYNTHETIC PAYER LARGE') RETURNING id", [practiceId]);
    const ma = await one("INSERT INTO plan (practice_id, payer_id, plan_key) VALUES ($1, $2, 'CE:SYNPLAN-LARGE-MA') RETURNING id", [practiceId, payer]);
    const commercial = await one("INSERT INTO plan (practice_id, payer_id, plan_key) VALUES ($1, $2, 'CE:SYNPLAN-LARGE-COMM') RETURNING id", [practiceId, payer]);
    const patient = await one('INSERT INTO patient_ref (practice_id, pseudonym) VALUES ($1, $2) RETURNING id', [practiceId, 'b'.repeat(64)]);
    const remittance = await one(
      `INSERT INTO remittance (practice_id, source_document_id, sender_id, receiver_id, isa13, gs06, st02, trn02, trn03, bpr02_cents, bpr_credit_debit, bpr_method, bpr16_date,
         payer_name, payer_id, payee_npi, payee_id_qualifier, claim_count, plb_total_cents)
       VALUES ($1, $2, 'SYNTHSENDER', 'SYNTHRECEIVER', '000000001', '1', '0001', 'SYNEFTLARGE0001', '1SYN00000L', 0, 'C', 'ACH', '2026-04-15', 'SYNTHETIC PAYER LARGE', $3, '9900000001', 'XX', $4, 0)
       RETURNING id`,
      [practiceId, document, payer, claims],
    );
    for (let from = 1; from <= claims; from += 5_000) {
      const numbers = Array.from({ length: Math.min(5_000, claims - from + 1) }, (_, index) => `SYNCCN${label.toUpperCase()}${String(from + index).padStart(7, '0')}`);
      await owner.query(
        `INSERT INTO claim (practice_id, remittance_id, claim_no, patient_control_number, payer_claim_control_number, payer_claim_control_number_hash, claim_status_code,
           charge_cents, paid_cents, patient_resp_cents, filing_indicator, patient_ref_id, service_from, service_to)
         SELECT $1, $2, t.n, 'enc:v1:SYNPCN' || t.n, t.number, t.hash, '1', 40000, 4000, 4000,
                CASE WHEN t.n % 2 = 0 THEN '16' ELSE '12' END, $3, '2026-03-01'::date + (t.n % 28), '2026-03-01'::date + (t.n % 28)
           FROM unnest($4::int[], $5::text[], $6::text[]) AS t (n, number, hash)`,
        [
          practiceId,
          remittance,
          patient,
          numbers.map((_, index) => from + index),
          numbers.map((number) => cipher.encrypt('claim.payer_claim_control_number', number)),
          numbers.map((number) => cipher.lookupHash('claim.payer_claim_control_number', number)),
        ],
      );
    }
    await owner.query(
      `INSERT INTO service_line (practice_id, claim_id, line_no, procedure_qualifier, procedure_code, modifiers, charge_cents, paid_cents, units, service_date, place_of_service,
         observed_allowed_cents, observed_allowed_basis, patient_share_cents, payer_plan_key)
       SELECT $1, c.id, n, 'HC', ($4::text[])[1 + ((c.claim_no + n) % cardinality($4::text[]))], CASE WHEN n = 3 THEN '{GP,CQ}'::text[] ELSE '{GP}'::text[] END,
              10000, 1000, 1 + ((c.claim_no + n) % 3), c.service_from, '11', 2000, 'paid_plus_pr', 1000, CASE WHEN c.claim_no % 2 = 0 THEN $2::uuid ELSE $3::uuid END
         FROM claim c CROSS JOIN generate_series(1, $5::int) n
        WHERE c.practice_id = $1 AND (c.claim_no - 1) * $5::int + n <= $6::int`,
      [practiceId, ma, commercial, CODES, PER_CLAIM, lines],
    );
    await owner.query(
      `INSERT INTO adjustment (practice_id, claim_id, service_line_id, group_code, reason_code, amount_cents, position)
       SELECT l.practice_id, l.claim_id, l.id, 'PR', '2', 1000, l.line_no FROM service_line l WHERE l.practice_id = $1`,
      [practiceId],
    );
  });
  // Statistics as autovacuum leaves them after a load of this size, so the planner sees the rows.
  await owner.query('ANALYZE claim, service_line, adjustment, plan, payer');
  const { pricing } = w;
  const signed = await pricing.signedContract(practice, '2026-01-01', { payerId: await pricing.payerOf(practice), disputeWindowDays: 365 });
  await pricing.mapped(practice, await pricing.planOf(practice, 'CE:SYNPLAN-LARGE-MA'), 'ma_noncontracted', '2026-01-01');
  await pricing.mapped(practice, await pricing.planOf(practice, 'CE:SYNPLAN-LARGE-COMM'), 'contract', '2026-01-01', signed.versionId);
  const runId = await pricing.createRun(practice, '2026-03-01', '2026-03-31');
  await pricing.execute(practice, runId);
  return { practice, runId };
}

/** Samples, every LOCK_SAMPLE_MS until stopped, the most advisory locks any one backend of this database holds. */
function lockSampler(): { stop(): Promise<{ readonly peak: number; readonly samples: number }> } {
  let sampling = true;
  let peak = 0;
  let samples = 0;
  const running = (async () => {
    while (sampling) {
      const { rows } = await locks.query<{ n: number }>(
        `SELECT coalesce(max(n), 0)::int AS n FROM (SELECT pid, count(*) AS n FROM pg_locks
          WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database()) GROUP BY pid) held`,
      );
      peak = Math.max(peak, rows[0]?.n ?? 0);
      samples += 1;
      await new Promise((resolve) => setTimeout(resolve, LOCK_SAMPLE_MS));
    }
  })();
  return {
    stop: async () => {
      sampling = false;
      await running;
      return { peak, samples };
    },
  };
}

interface ChildRun {
  readonly status: number | null;
  readonly stderr: string;
  readonly output: LargeJobsOutput | undefined;
  readonly lockPeak: number;
  readonly lockSamples: number;
}

/** Runs the jobs at once in a child process under `--max-old-space-size=heapMib`, sampling the locks meanwhile. */
async function inChild(heapMib: number, jobs: LargeJobsInput['jobs']): Promise<ChildRun> {
  const input: LargeJobsInput = { workerUrl: w.pricing.database.workerUrl, masterKeyHex: MASTER_KEY.toString('hex'), asOf: AS_OF, jobs };
  const sampler = lockSampler();
  const child: ChildProcess = spawn(process.execPath, [`--max-old-space-size=${String(heapMib)}`, '--import', 'tsx', CHILD], {
    cwd: REPO,
    env: { ...process.env, TP_LARGE_JOBS: JSON.stringify(input) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
  const timer = setTimeout(() => child.kill('SIGKILL'), CHILD_TIMEOUT_MS);
  const status = await new Promise<number | null>((resolve) => child.on('close', (code) => resolve(code)));
  clearTimeout(timer);
  const sampled = await sampler.stop();
  const last = stdout.trim().split('\n').at(-1) ?? '';
  const output = last.startsWith('{') ? (JSON.parse(last) as LargeJobsOutput) : undefined;
  if (output !== undefined) {
    process.stdout.write(`CAS-42 child (heap flag ${String(heapMib)} MiB, ${String(LINES)} lines): ${JSON.stringify({ ...output, lockPeak: sampled.peak, lockSamples: sampled.samples })}\n`);
  }
  return { status, stderr, output, lockPeak: sampled.peak, lockSamples: sampled.samples };
}

/** The child exited 0, logged no heap error and answered; each job's answer. */
function answered(run: ChildRun): LargeJobsOutput {
  const failure = /large job failed: .*|.*heap out of memory.*/i.exec(run.stderr)?.[0] ?? run.stderr.slice(-2000);
  expect(run.stderr, failure).not.toMatch(/heap out of memory|JavaScript heap|allocation failed/i);
  expect(run.status, failure).toBe(0);
  expect(run.output, failure).toBeDefined();
  return run.output as LargeJobsOutput;
}

/** The locks were sampled while the jobs ran, seen held, and never more than MOST_ADVISORY_LOCKS by any backend. */
function lockBound(run: ChildRun): void {
  expect(run.lockSamples).toBeGreaterThan(3);
  expect(run.lockPeak).toBeGreaterThan(0);
  expect(run.lockPeak).toBeLessThanOrEqual(MOST_ADVISORY_LOCKS);
}

/** Every candidate's stage events: the summary's flagged and validated lines, and every case line not written off, actionable. */
async function stageEventsPresent(month: Month, summary: { readonly flaggedLines: number; readonly validatedLines: number }): Promise<void> {
  const { practiceId } = month.practice;
  const staged = await asOwner(w.owner, [practiceId], async () =>
    (
      await w.owner.query<{ flagged: number; validated: number; actionable: number; attached: number }>(
        `SELECT (SELECT count(DISTINCT service_line_id) FROM line_status WHERE practice_id = $1 AND stage = 'flagged')::int AS flagged,
                (SELECT count(DISTINCT service_line_id) FROM line_status WHERE practice_id = $1 AND stage = 'validated')::int AS validated,
                (SELECT count(DISTINCT service_line_id) FROM line_status WHERE practice_id = $1 AND stage = 'actionable')::int AS actionable,
                (SELECT count(DISTINCT service_line_id) FROM case_line WHERE practice_id = $1 AND written_off_reason IS NULL)::int AS attached`,
        [practiceId],
      )
    ).rows[0],
  );
  expect(staged?.flagged).toBe(summary.flaggedLines);
  expect(staged?.validated).toBe(summary.validatedLines);
  expect(staged?.validated).toBeGreaterThan(0);
  expect(staged?.actionable).toBe(staged?.attached);
  expect(staged?.actionable).toBeGreaterThan(0);
}

const triageSummary = (job: LargeJobsOutput['jobs'][number] | undefined) => job?.summary as { readonly flaggedLines: number; readonly validatedLines: number; readonly linesAdded: number };

beforeAll(async () => {
  expect(WORKER_HEAP_MIB).toBeGreaterThan(0);
  w = await TriageWorld.open(readDatabaseUrl());
  locks = databaseClient(w.pricing.database.url);
  await locks.connect();
  const started = performance.now();
  // B's month priced, triaged and reported first, as the harness runs it; then A's and Y's months priced.
  const b = await pricedMonth('large b', B_LINES);
  const triaged = await w.triage(b.practice, b.runId, AS_OF);
  expect(triaged.outcome).toBe('triaged');
  const report = await generateAuditReport(w.pricing.jobContext(b.practice.practiceId), { ...w.services, keys: childKeys }, b.practice.practiceId, await w.requestReport(b.practice, b.runId), { asOf: AS_OF });
  expect(report.outcome).toBe('ready');
  a = await pricedMonth('large a', LINES);
  y = await pricedMonth('large y', LINES);
  await w.owner.query('ANALYZE');
  process.stdout.write(`CAS-42 setup: B ${String(B_LINES)}, A and Y ${String(LINES)} lines each priced, B triaged and reported, in ${((performance.now() - started) / 1000).toFixed(1)} s\n`);
}, 1_800_000);

afterAll(async () => {
  await locks.end();
  await w.close();
});

describe(`a ${String(LINES)}-line month triages and reports within the worker's heap (CAS-42)`, () => {
  it(`CAS-42.1: A's triage and audit report each alone under a ${String(ALONE_HEAP_MIB)} MiB heap, at most ${String(MOST_ADVISORY_LOCKS)} advisory lock, within the budgets`, async () => {
    const triage = await inChild(ALONE_HEAP_MIB, [{ kind: 'triage', practiceId: a.practice.practiceId, pricingRunId: a.runId }]);
    const triaged = answered(triage);
    const job = triaged.jobs[0];
    expect(job?.outcome).toBe('triaged');
    const summary = triageSummary(job);
    expect(summary.linesAdded).toBeGreaterThan(0);
    await stageEventsPresent(a, summary);
    lockBound(triage);
    expect(job?.ms, `A's triage took ${String(job?.ms)} ms`).toBeLessThan(TRIAGE_BUDGET_MS);
    expect(job?.actionableWriteMs).toBeGreaterThan(0);
    expect(job?.actionableWriteMs, `A's actionable write took ${String(job?.actionableWriteMs)} ms`).toBeLessThan(ACTIONABLE_WRITE_BUDGET_MS);
    // The flag is in force (V8's heap_size_limit is the old generation's limit plus the young generation's).
    expect(triaged.heapLimitMib).toBeGreaterThanOrEqual(ALONE_HEAP_MIB);
    expect(triaged.heapLivePeakMib).toBeLessThan((ALONE_HEAP_MIB * LIVE_PERCENT) / 100);

    const auditReportId = await w.requestReport(a.practice, a.runId);
    const report = await inChild(ALONE_HEAP_MIB, [{ kind: 'report', practiceId: a.practice.practiceId, auditReportId }]);
    const reported = answered(report);
    expect(reported.jobs[0]?.outcome).toBe('ready');
    expect((await w.pricing.one<{ status: string }>('SELECT status FROM audit_report WHERE id = $1', [auditReportId])).status).toBe('ready');
    lockBound(report);
    expect(reported.jobs[0]?.ms, `A's report took ${String(reported.jobs[0]?.ms)} ms`).toBeLessThan(REPORT_BUDGET_MS);
    expect(reported.heapLivePeakMib).toBeLessThan((ALONE_HEAP_MIB * LIVE_PERCENT) / 100);
  }, 1_200_000);

  it(`CAS-42.2: A's second audit report and Y's triage together under the worker's ${String(WORKER_HEAP_MIB)} MiB heap`, async () => {
    const auditReportId = await w.requestReport(a.practice, a.runId);
    const together = await inChild(WORKER_HEAP_MIB, [
      { kind: 'report', practiceId: a.practice.practiceId, auditReportId },
      { kind: 'triage', practiceId: y.practice.practiceId, pricingRunId: y.runId },
    ]);
    const both = answered(together);
    expect(both.jobs.map((job) => job.outcome)).toEqual(['ready', 'triaged']);
    expect((await w.pricing.one<{ status: string }>('SELECT status FROM audit_report WHERE id = $1', [auditReportId])).status).toBe('ready');
    await stageEventsPresent(y, triageSummary(both.jobs[1]));
    lockBound(together);
    expect(both.heapLivePeakMib).toBeLessThan((WORKER_HEAP_MIB * LIVE_PERCENT) / 100);
  }, 1_200_000);
});
