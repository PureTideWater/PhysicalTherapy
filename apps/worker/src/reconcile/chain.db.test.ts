import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { documentObjectKey, readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { entriesById, ledgerTotals, recomputeStatement, roiStatementCsv } from '@tp/ledger';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { digestHandler } from '../digest/job';
import { intakeHandler } from '../intake/intake';
import { LocalLanding } from '../intake/landing';
import { LocalScanService } from '../intake/scan';
import { enqueue } from '../jobs/enqueue';
import { placeholderHandlers } from '../jobs/handlers';
import type { JobPayload } from '../jobs/registry';
import { databaseJobRuns } from '../jobs/runs';
import { MemoryMailSender } from '../mail/mail';
import { monitorHandler } from '../monitor/job';
import { MemoryQueue } from '../monitor/test-support/memory-queue';
import { parseHandler } from '../parse/job';
import { priceHandler } from '../price/job';
import { FIXTURES, type Practice } from '../price/test-support/pricing-world';
import { collect } from '../storage/documents';
import { todayUtc } from '../triage/execute';
import { triageHandler } from '../triage/job';
import { type RunningWorker, startWorker } from '../worker';
import { type Scope, ledgerEntries } from './ledger';
import { matchPostingByHand, reverseMatch } from './manual';
import { STATEMENT_COLUMNS, roiStatementHandler, storedStatement } from './print';
import { reconcileHandler } from './job';
import { generateRoiStatement } from './statements';
import { LED_PLAN, LedgerWorld, ledSettings } from './test-support/ledger-world';
import { unmatchedItems } from './unmatched';

/**
 * Every LED case of the test matrix through the job chain on SYNTHETIC files (PRD 18, Layers:
 * "Integration: jobs end to end on synthetic files: parse, price, triage, reconcile, digest; idempotency
 * under replay; retries and alerts"; PRD 5, J10 and J11; PRD 13; test matrix LED-01 to LED-11, JOB-01;
 * docs/adr/0042 and 0043). The real worker loop (startWorker: payload checks, one practice per job,
 * job_run, three attempts) runs each job from a queue in memory with pg-boss's singleton keys: every 835
 * and every posting or EFT export is uploaded as the browser leaves it and taken in by the intake job,
 * which queues parse_835 (and the monitoring chain after it) or, for an export, the reconcile; the
 * monitoring chain prices and triages the original payment into a case; the adjusted remittance, the
 * exports and the recoupment then reach the ledger through the chain's own reconcile; the daily
 * reconcile writes the quarter before's ROI statement and the statement job prints it.
 */

let w: LedgerWorld;

beforeAll(async () => {
  w = await LedgerWorld.open(readDatabaseUrl());
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

async function chain(): Promise<Chain> {
  const queue = new MemoryQueue();
  const logs: Record<string, unknown>[] = [];
  const mail = new MemoryMailSender();
  const { documents, keys } = w.services;
  const worker = await startWorker({
    boss: queue.client,
    pool: w.app,
    logger: createLogger({ sink: (line) => logs.push(JSON.parse(line) as Record<string, unknown>) }),
    handlers: {
      ...placeholderHandlers,
      intake: intakeHandler({ documents, landing: new LocalLanding(documents), scan: new LocalScanService(), keys, scanWait: { pollMs: 1, timeoutMs: 50 } }),
      parse_835: parseHandler({ documents, keys }),
      monitor: monitorHandler(),
      price: priceHandler(),
      triage: triageHandler(),
      reconcile: reconcileHandler({ documents, keys }),
      digest: digestHandler({ mail, appOrigin: 'http://localhost:3000' }),
      roi_statement: roiStatementHandler({ documents, keys, pdf: w.triage.pdf }),
    },
    runs: databaseJobRuns(w.app),
    heartbeatMs: 3_600_000,
  });
  return { queue, worker, logs, mail };
}

let running: Chain;

beforeAll(async () => {
  running = await chain();
});

afterAll(async () => {
  await running.worker.stop();
});

type Kind = 'x12_835' | 'posting_export' | 'eft_export';

/** Uploads a file as the browser leaves it (the row awaiting its bytes, the bytes sealed under its key) and queues intake; returns the document and the jobs that ran. */
async function upload(target: Practice, fixture: string, kind: Kind = 'x12_835', bytes?: Buffer): Promise<{ readonly documentId: string; readonly ran: readonly string[] }> {
  const content = bytes ?? readFileSync(path.join(FIXTURES, fixture));
  const documentId = randomUUID();
  await withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, (scope) =>
    scope.client.query('INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6)', [
      documentId,
      target.practiceId,
      kind,
      content.length,
      kind === 'x12_835' ? 'application/octet-stream' : 'text/csv',
      target.manager,
    ]),
  );
  await w.services.documents.write(target.cipher, documentObjectKey(target.practiceId, documentId), Readable.from([content]));
  await enqueue(running.queue.client, 'intake', { practice_id: target.practiceId, document_id: documentId });
  return { documentId, ran: await drain() };
}

/** Works the queue; every job must succeed. Returns the jobs that ran, by type, in order. */
async function drain(): Promise<string[]> {
  const ran = await running.queue.drain();
  expect(ran.filter((job) => job.outcome !== 'succeeded').map((job) => job.name)).toEqual([]);
  return ran.map((job) => job.name);
}

async function run<T extends 'reconcile' | 'monitor' | 'digest'>(type: T, payload: JobPayload<T>): Promise<string[]> {
  await enqueue(running.queue.client, type, payload);
  return drain();
}

/**
 * A practice with its LED case open through the chain: the original payment uploaded (its plan waits on
 * a mapping, so nothing is priced and the ledger reconciles the document), the 50.00-per-unit 97110
 * schedule signed off and mapped, and the daily monitor pricing and triaging the month into the case.
 */
async function caseOf(id: string, settings: object = ledSettings()): Promise<{ readonly practice: Practice; readonly caseId: string; readonly serviceLineId: string }> {
  const practice = await w.practice(`${id} chain ${randomUUID().slice(0, 8)}`, settings);
  const original = await upload(practice, `${id}/original.835`);
  expect(original.ran).toEqual(['intake', 'parse_835', 'monitor', 'reconcile']);
  const contract = await w.triage.fixedContract(practice, { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 });
  await w.triage.pricing.mapped(practice, await w.triage.pricing.planOf(practice, LED_PLAN), 'contract', '2026-01-01', contract.versionId);
  expect(await run('monitor', { practice_id: practice.practiceId, day: todayUtc() })).toEqual(['monitor', 'price', 'triage', 'reconcile']);
  const [line] = await w.rows<{ case_id: string; service_line_id: string }>(practice, 'SELECT case_id, service_line_id FROM case_line ORDER BY created_at LIMIT 1');
  if (line === undefined) {
    throw new Error('the chain opened no case for the scenario');
  }
  return { practice, caseId: line.case_id, serviceLineId: line.service_line_id };
}

/** The case's adjusted remittance through the chain: a new run of its month, priced, triaged and reconciled. */
async function adjusted(target: Practice, id: string): Promise<void> {
  expect((await upload(target, `${id}/adjusted.835`)).ran).toEqual(['intake', 'parse_835', 'monitor', 'price', 'triage', 'reconcile']);
}

async function exported(target: Practice, fixture: string, kind: 'posting_export' | 'eft_export', bytes?: Buffer): Promise<string> {
  const { documentId, ran } = await upload(target, fixture, kind, bytes);
  expect(ran).toEqual(['intake', 'reconcile']);
  return documentId;
}

interface Outcome {
  readonly entries?: readonly { readonly stage: string; readonly amountCents: string; readonly allocated?: boolean }[];
  readonly recoveredCents?: string;
}

const outcomeOf = (id: string): Outcome => (JSON.parse(readFileSync(path.join(FIXTURES, id, 'expected.json'), 'utf8')) as { outcome: Outcome }).outcome;
const expectedStages = (id: string) => (outcomeOf(id).entries ?? []).map((entry) => ({ stage: entry.stage, amountCents: entry.amountCents }));

async function totals(target: Practice, proofLevel: 'posted' | 'deposited' = 'deposited') {
  return withJobScope(w.app, { jobId: randomUUID(), practiceId: target.practiceId }, async (scope) => {
    const entries = await ledgerEntries(scope, target.practiceId);
    return ledgerTotals(entries, proofLevel, entriesById(entries));
  });
}

describe('the ledger through the job chain (J10, J11)', () => {
  it('records no entry for a submitted packet (LED-01), and none on the daily reconcile after it', async () => {
    const { practice, caseId } = await caseOf('LED-02');
    await w.submit(practice, caseId, '2026-05-01');
    // The daily reconcile, which also writes (and prints) the quarter before's statement: still no entry.
    expect(await run('reconcile', { practice_id: practice.practiceId, day: todayUtc() })).toEqual(['reconcile', 'roi_statement']);
    expect(await w.entries(practice)).toEqual([]);
  });

  it('approves the difference an adjusted remittance pays on a case line, after its parse (LED-02), and nothing twice on replay (JOB-01)', async () => {
    const { practice, caseId, serviceLineId } = await caseOf('LED-02');
    await adjusted(practice, 'LED-02');
    expect(await w.stages(practice)).toEqual(expectedStages('LED-02'));
    expect((await w.entries(practice))[0]).toMatchObject({ case_id: caseId, service_line_id: serviceLineId, evidence_kind: 'claim', created_by: null });
    expect(await w.lineStage(practice, serviceLineId)).toBe('payer_approved');
    const before = await w.entries(practice);
    const [runId] = await w.rows<{ id: string }>(practice, 'SELECT id FROM pricing_run ORDER BY created_at DESC LIMIT 1');
    expect(await run('reconcile', { practice_id: practice.practiceId, pricing_run_id: runId?.id ?? '' })).toEqual(['reconcile']);
    expect(await run('reconcile', { practice_id: practice.practiceId, day: todayUtc() })).toEqual(['reconcile', 'roi_statement']);
    expect(await run('reconcile', { practice_id: practice.practiceId, day: todayUtc() })).toEqual(['reconcile']);
    expect(await w.entries(practice)).toEqual(before);
  });

  it('lists an adjusted remittance matching no case for a person, reconciled after its parse with nothing priced, and writes no entry (LED-03)', async () => {
    const practice = await w.practice(`LED-03 chain ${randomUUID().slice(0, 8)}`);
    expect((await upload(practice, 'LED-03/adjusted.835')).ran).toEqual(['intake', 'parse_835', 'monitor', 'reconcile']);
    expect(await w.entries(practice)).toEqual([]);
    const items = await withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => unmatchedItems(scope as Scope, practice.practiceId));
    expect(items.adjustedPayments).toHaveLength(1);
  });

  it('posts a posting export uploaded through intake by check number (LED-04), and deposits an EFT export by trace (LED-05)', async () => {
    const posting = await caseOf('LED-04');
    await adjusted(posting.practice, 'LED-04');
    await exported(posting.practice, 'LED-04/posting-export.csv', 'posting_export');
    expect(await w.stages(posting.practice)).toEqual(expectedStages('LED-04'));
    expect(await w.lineStage(posting.practice, posting.serviceLineId)).toBe('payer_approved');

    const deposit = await caseOf('LED-05');
    await adjusted(deposit.practice, 'LED-05');
    await exported(deposit.practice, 'LED-05/eft-export.csv', 'eft_export');
    expect(await w.stages(deposit.practice)).toEqual(expectedStages('LED-05'));
    expect(await w.lineStage(deposit.practice, deposit.serviceLineId)).toBe('recovered');
    expect(await totals(deposit.practice)).toMatchObject({ depositedCents: 3000n, recoveredCents: 3000n });
  });

  it('takes back a PLB WO after the deposit at once through the chain: recovered reduced by its amount, the case reopened, its people told, the digest counting the recoveries (LED-06)', async () => {
    const { practice, caseId, serviceLineId } = await caseOf('LED-06');
    await adjusted(practice, 'LED-06');
    await exported(practice, 'LED-06/posting-export.csv', 'posting_export');
    await exported(practice, 'LED-06/eft-export.csv', 'eft_export');
    expect(await w.lineStage(practice, serviceLineId)).toBe('recovered');
    // The recoupment's own claim is in July: the chain prices and triages July, and the reconcile after it takes the money back.
    expect((await upload(practice, 'LED-06/recoupment.835')).ran).toEqual(['intake', 'parse_835', 'monitor', 'price', 'triage', 'reconcile']);
    expect(await w.stages(practice)).toEqual(expectedStages('LED-06'));
    expect((await totals(practice)).recoveredCents.toString()).toBe(outcomeOf('LED-06').recoveredCents);
    expect(await w.lineStage(practice, serviceLineId)).toBe('actionable');
    expect(await w.caseState(practice, caseId)).not.toBe('resolved');
    const told = await asOwner(w.owner, [practice.practiceId], () =>
      w.owner.query<{ user_id: string; counts: unknown; totals_cents: unknown }>("SELECT user_id, counts, totals_cents FROM notification WHERE practice_id = $1 AND kind = 'recoupment' ORDER BY user_id", [practice.practiceId]),
    );
    expect(told.rows).toEqual([practice.world.adminUserId, practice.manager].sort().map((user) => ({ user_id: user, counts: { recouped_lines: 1 }, totals_cents: { recouped: '-1800' } })));
    // The month's digests count the recoveries from the ledger: June's deposit, and August's take-back (counts and totals only).
    expect(await run('digest', { practice_id: practice.practiceId, period: '2026-06' })).toEqual(['digest']);
    expect(await run('digest', { practice_id: practice.practiceId, period: '2026-08' })).toEqual(['digest']);
    const digests = await asOwner(w.owner, [practice.practiceId], () =>
      w.owner.query<{ period: string; recoveries: number; recovered: string }>(
        "SELECT period, (counts ->> 'recoveries_posted')::int AS recoveries, totals_cents ->> 'recovered' AS recovered FROM digest WHERE practice_id = $1 ORDER BY period",
        [practice.practiceId],
      ),
    );
    expect(digests.rows).toEqual([
      { period: '2026-06', recoveries: 1, recovered: '3000' },
      { period: '2026-08', recoveries: 0, recovered: '-1800' },
    ]);
  });

  it('nets a manual match and its reversal to zero, and the chain never matches the reversed row again (LED-07)', async () => {
    const { practice } = await caseOf('LED-07');
    await adjusted(practice, 'LED-07');
    await exported(practice, 'LED-07/posting-export.csv', 'posting_export');
    const items = await withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => unmatchedItems(scope as Scope, practice.practiceId));
    const [row] = items.postings;
    const remittance = row?.candidates.find((candidate) => candidate.paymentCents === row.amountCents);
    const { matchId } = await w.manual(practice, (context) => matchPostingByHand(context, { practiceId: practice.practiceId, postingRowId: row?.postingRowId ?? '', remittanceId: remittance?.remittanceId ?? '' }));
    await w.manual(practice, (context) => reverseMatch(context, { practiceId: practice.practiceId, matchId, reason: 'SYNTHETIC matched to the wrong check' }));
    expect(await run('reconcile', { practice_id: practice.practiceId, document_id: row?.documentId ?? '' })).toEqual(['reconcile']);
    expect(await w.stages(practice)).toEqual(expectedStages('LED-07'));
    expect((await totals(practice)).postedCents).toBe(0n);
  });

  it('matches a posting export uploaded twice, and its rows re-exported, once (LED-08)', async () => {
    const { practice } = await caseOf('LED-08');
    await adjusted(practice, 'LED-08');
    await exported(practice, 'LED-08/posting-export.csv', 'posting_export');
    // The same bytes again: intake's duplicate document, never read (PAR-30).
    const again = await upload(practice, 'LED-08/posting-export.csv', 'posting_export');
    expect(again.ran).toEqual(['intake']);
    expect((await w.rows<{ status: string }>(practice, 'SELECT status FROM source_document WHERE id = $1', [again.documentId]))[0]).toEqual({ status: 'duplicate' });
    await exported(practice, 'LED-08/posting-export-again.csv', 'posting_export');
    const outcome = JSON.parse(readFileSync(path.join(FIXTURES, 'LED-08', 'expected.json'), 'utf8')) as { outcome: { postedEntries: number; matches: number } };
    expect((await w.entries(practice)).filter((entry) => entry.stage === 'posted')).toHaveLength(outcome.outcome.postedEntries);
    expect(await w.rows(practice, "SELECT count(*)::int AS n FROM ledger_match WHERE kind = 'posting'")).toEqual([{ n: outcome.outcome.matches }]);
  });

  it('allocates a check posted in part pro rata, flagged allocated (LED-09)', async () => {
    const { practice } = await caseOf('LED-09');
    await adjusted(practice, 'LED-09');
    await exported(practice, 'LED-09/posting-export.csv', 'posting_export');
    expect((await w.entries(practice)).map((entry) => ({ stage: entry.stage, amountCents: entry.amount_cents, allocated: entry.allocated }))).toEqual(
      (outcomeOf('LED-09').entries ?? []).map((entry) => ({ stage: entry.stage, amountCents: entry.amountCents, allocated: entry.allocated === true })),
    );
  });

  it('refuses the application role an UPDATE or DELETE of an entry the chain wrote (LED-10)', async () => {
    const { practice } = await caseOf('LED-02');
    await adjusted(practice, 'LED-02');
    const [entry] = await w.entries(practice);
    for (const sql of ['UPDATE ledger_entry SET amount_cents = 1 WHERE id = $1', 'DELETE FROM ledger_entry WHERE id = $1']) {
      await expect(withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => scope.client.query(sql, [entry?.id]))).rejects.toMatchObject({ code: expect.stringMatching(/^(42501|23514)$/) });
    }
    expect(await w.entries(practice)).toHaveLength(1);
  });

  it('writes the quarter before’s ROI statement once on the daily reconcile, prints it, and the statement recomputes from its entries (LED-11)', async () => {
    const { practice } = await caseOf('LED-06');
    await adjusted(practice, 'LED-06');
    await exported(practice, 'LED-06/posting-export.csv', 'posting_export');
    await exported(practice, 'LED-06/eft-export.csv', 'eft_export');
    await upload(practice, 'LED-06/recoupment.835');
    // The schedule's run on 1 October: the third quarter's statement (the recoupment of 3 August), and its print.
    expect(await run('reconcile', { practice_id: practice.practiceId, day: '2026-10-01' })).toEqual(['reconcile', 'roi_statement']);
    expect(await run('reconcile', { practice_id: practice.practiceId, day: '2026-10-02' })).toEqual(['reconcile']);
    // On demand, by the billing manager, for the second and third quarters together.
    const demanded = await withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
      generateRoiStatement(scope as Scope, { practiceId: practice.practiceId, periodFrom: '2026-04-01', periodTo: '2026-09-30', requestId: `test-${randomUUID()}` }),
    );
    expect(demanded?.statement.recoveredCents).toBe(1200n);
    // A person may not record a print, even of a statement not printed yet: only the statement job does.
    await expect(
      withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
        scope.client.query('UPDATE roi_statement SET document_key = $2, pdf_sha256 = $3 WHERE id = $1', [
          demanded?.statementId,
          `practices/${practice.practiceId}/reports/${demanded?.statementId ?? ''}/${randomUUID()}.pdf`,
          'a'.repeat(64),
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    expect(await run('reconcile', { practice_id: practice.practiceId, day: '2026-10-03' })).toEqual(['reconcile', 'roi_statement']);
    const statements = await w.rows<Parameters<typeof storedStatement>[0] & { id: string; document_key: string | null; pdf_sha256: string | null; generated_by: string | null }>(
      practice,
      `SELECT ${STATEMENT_COLUMNS}, s.pdf_sha256 FROM roi_statement s ORDER BY s.generated_at`,
    );
    expect(statements.map((row) => ({ from: row.period_from, to: row.period_to, recovered: row.recovered_cents, by: row.generated_by }))).toEqual([
      { from: '2026-07-01', to: '2026-09-30', recovered: '-1800', by: null },
      { from: '2026-04-01', to: '2026-09-30', recovered: '1200', by: practice.manager },
    ]);
    const ledger = await withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, async (scope) => entriesById(await ledgerEntries(scope as Scope, practice.practiceId)));
    for (const row of statements) {
      const statement = storedStatement(row);
      const check = recomputeStatement(statement, ledger);
      expect(check.matches).toBe(true);
      expect(check.recovered.recomputedCents).toBe(BigInt(row.recovered_cents));
      expect(roiStatementCsv(statement, ledger)).toContain(`recovered,total,${(Number(row.recovered_cents) / 100).toFixed(2)},usd`);
      // Printed once, sealed under the practice's key, its SHA-256 recorded.
      expect(row.document_key).toMatch(new RegExp(`^practices/${practice.practiceId}/reports/${row.id}/[0-9a-f-]{36}\\.pdf$`));
      const pdf = await collect(w.services.documents.read(practice.cipher, row.document_key ?? ''));
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(row.pdf_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    // A print replayed leaves the statement as it is; a person may not record a print.
    const [first] = statements;
    await enqueue(running.queue.client, 'roi_statement', { practice_id: practice.practiceId, roi_statement_id: first?.id ?? '' });
    expect(await drain()).toEqual(['roi_statement']);
    expect((await w.rows<{ document_key: string }>(practice, 'SELECT document_key FROM roi_statement WHERE id = $1', [first?.id]))[0]?.document_key).toBe(first?.document_key);
    const asManager = (sql: string) => withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) => scope.client.query(sql, [first?.id]));
    await expect(asManager('UPDATE roi_statement SET recovered_cents = 0 WHERE id = $1')).rejects.toMatchObject({ code: '42501' });
    await expect(asManager("UPDATE roi_statement SET document_key = document_key || 'x' WHERE id = $1")).rejects.toMatchObject({ code: '23514' });
    await expect(asManager('DELETE FROM roi_statement WHERE id = $1')).rejects.toMatchObject({ code: '42501' });
  });
});
