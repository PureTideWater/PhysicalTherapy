import { createHash, randomUUID } from 'node:crypto';

import { readDatabaseUrl } from '@tp/db';
import { type PracticeScope, type ScopeClient, loadPracticeCipher } from '@tp/db/runtime';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as ReleaseModule from '../price/release';
import type { Practice } from '../price/test-support/pricing-world';
import { ledgerEntries, practiceLedgerSettings } from '../reconcile/ledger';
import { type LineCorrection, lineCorrections, lineShares, practiceCorrections } from '../reconcile/patient-share';
import { LED_PLAN, LedgerWorld, ledSettings } from '../reconcile/test-support/ledger-world';
import { collect } from '../storage/documents';
import { CAS_AS_OF, CAS_RUNS } from '../triage/test-support/cas-runs';
import { GENERATED_AS_OF, GENERATED_FULL_LINES, type GeneratedMonth, generatedMonth, inJobScope } from '../triage/test-support/generated-month';
import { measure, perAdded } from '../triage/test-support/memory';
import { type ReadEvent, recordingContext, rolledBack, sortedEvents, storedEvents } from '../triage/test-support/recorded';
import { type AuditReportContent, type GatherInput, type ReportBatches, gatherReport, patientBalanceCases } from './content';
import { CSV_ARENA_CHUNK_BYTES, CsvArena } from './csv-arena';
import { CSV_COLUMNS, auditCsv, csvText } from './csv';
import { generateAuditReport } from './generate';
import { auditHtml, auditReconciliation } from './html';
import type { PdfRenderer } from './pdf';
import { wholeGatherReport, wholeLineCorrections, wholeLineShares, wholePatientBalanceCases, wholeReport } from './test-support/whole-read';

/**
 * The audit report streams and gives the same answers as the whole read (CAS-41.1, SUITE-CAP-1a D14 to D18;
 * docs/adr/0083). Through the job, on the CAS fixtures and on two recovery scenarios (LED-06's posting and deposit,
 * LED-15's correction the patient's share took): generateAuditReport stores the same content, the same CSV bytes
 * under the same SHA-256, hands the same HTML to the PDF renderer (a recording one) and records the same audit
 * events (one per row read) as the whole-read report of 085299bd (test-support/whole-read.ts), run first on the same
 * rows and rolled back, with the report's ID and date the same (each run triaged once before, so both name the same
 * cases). Through the readers, on a generated month of 10,000 lines (test-support/generated-month.ts): the streamed
 * gatherReport's content deep-equals the whole read's, its arena streams auditCsv() of the whole read's lines byte for
 * byte, the PDF's HTML is the same, and so are the audit events; lineShares and patientBalanceCases give the filtering
 * versions' answers, and lineCorrections answers a line the same whichever lines share its call. And in bounded
 * memory (CAS-41.2): from that month to one twice its size, the heap gatherReport holds, while it reads and with its
 * content and arena in hand before the CSV is written, grows by at most REPORT_HEAP_BYTES per added line, and the CSV's
 * rows are held outside the heap, in arena chunks that hold their bytes within one chunk (test-support/memory.ts
 * measures it). Across batch boundaries: every comparison through the job runs again with batches of one line and
 * 61-byte arena chunks (ACROSS), so each line of a fixture is its own batch of triage's candidates, the report's lines
 * and its case lines, and every CSV row and multi-byte name falls across chunks; with recovery and the patient's share
 * non-zero (LED-06, LED-15, and LED-15's two lines on two claims). lineCorrections over batches that share the
 * practice's part read once (practiceCorrections) answers each line as one call over every line, and that part
 * (the chain order, the matches, the matched claims' lines and reversals) is read once per report, not once per batch.
 * And the arena is released when gatherReport fails after its line loop.
 */

/** Batches of one line and 61-byte chunks: a fixture's few lines and rows cross every batch and chunk boundary. */
const ACROSS: ReportBatches = { candidateLines: 1, reportLines: 1, caseLines: 1, csvChunkBytes: 61 };

/** While set, the price job reads every content as loaded: a run priced as it was before the content refusal (audit #7). */
const pricing = vi.hoisted(() => ({ beforeRefusal: false }));

vi.mock('../price/release', async (importOriginal) => {
  const actual = await importOriginal<typeof ReleaseModule>();
  const loaded = [{ from: null, until: null }];
  return {
    ...actual,
    releaseContentSpans: async (...args: Parameters<typeof actual.releaseContentSpans>) =>
      pricing.beforeRefusal ? { mppr_code: loaded, mppr_general: loaded, ncci_mue: loaded } : actual.releaseContentSpans(...args),
  };
});

async function contentLoaded<T>(run: () => Promise<T>): Promise<T> {
  pricing.beforeRefusal = true;
  try {
    return await run();
  } finally {
    pricing.beforeRefusal = false;
  }
}

/**
 * CAS-41.2's bound on the heap per added line (SUITE-CAP-1a section 7). Measured on Node 24 between the months of
 * 10,000 and 20,000 lines: gatherReport's peak fell by 230 bytes per added line (20.3 MB and 18.0 MB: a batch of
 * lines or of case lines in hand, whichever is larger; what it keeps once read, its figures and the arena's sort keys,
 * about 110 bytes a line), the whole read of 085299bd (wholeGatherReport, the same test pointed at it) grew by 5,350
 * (54.7 MB and 108.2 MB; its ReportLines alone 965 a line), so this test fails on it. The sizes are the smallest at
 * which every batch is in its steady state: a 2,000-line month has 428 case lines, and patientBalanceCases' batch of
 * 2,000 fills only from about 9,700 lines, so between 2,000 and 10,000 lines the batch filling up counts as growth
 * (1,283 bytes per added line). Every heap sample is taken after two full collections, at each query as it is sent and
 * answered and every 250 ms, so the peak does not hang on the runner's speed: two runs agreed within 0.1 MB, and
 * sampling every 5 ms instead gave -336 bytes per added line. The margin, over 600 bytes per added line (6 MB over the
 * 10,000 added), is several times the 1 MB the 20,000-line peak moved between runs.
 */
const REPORT_HEAP_BYTES = 400;

let w: LedgerWorld;

beforeAll(async () => {
  w = await LedgerWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const PDF = new TextEncoder().encode('%PDF-1.7 SYNTHETIC RECORDED');
const SCHEDULE = { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 };

/** A renderer that keeps the HTML it is handed and prints a fixed stand-in. */
function recordingRenderer(): PdfRenderer & { readonly html: string[] } {
  const html: string[] = [];
  return { html, render: (page) => (html.push(page), Promise.resolve(PDF)) };
}

/** A content as the database stores it (jsonb): the comparison is of the stored document. */
const stored = (content: AuditReportContent): unknown => JSON.parse(JSON.stringify(content));

/**
 * Generates the queued report twice from the same rows: the whole-read reference, rolled back, then the job; and
 * checks that the job stored and printed what the reference made, with the same audit events.
 */
async function sameReport(practice: Practice, auditReportId: string, asOf: string, batches?: ReportBatches): Promise<AuditReportContent> {
  const reference = await rolledBack(w.triage, practice.practiceId, (scope, requestId) => wholeReport(scope, w.keys, practice.practiceId, auditReportId, asOf, requestId));
  const whole = reference.result;
  if (whole.outcome !== 'ready') {
    throw new Error(`the reference made no report: ${whole.reason}`);
  }
  const events: ReadEvent[] = [];
  const context = recordingContext(w.triage, practice.practiceId, events);
  const pdf = recordingRenderer();
  const outcome = await generateAuditReport(context, { documents: w.triage.reports, keys: w.keys, pdf }, practice.practiceId, auditReportId, batches === undefined ? { asOf } : { asOf, batches });
  const [row] = await w.rows<{ content: unknown; csv_key: string; csv_sha256: string; pdf_sha256: string }>(practice, 'SELECT content, csv_key, csv_sha256, pdf_sha256 FROM audit_report WHERE id = $1', [auditReportId]);
  expect(outcome).toEqual({ outcome: 'ready', pdfSha256: sha256(PDF), csvSha256: sha256(whole.csv) });
  expect(row?.content).toEqual(stored(whole.content));
  expect(row?.csv_sha256).toBe(sha256(whole.csv));
  expect(await w.triage.stored(practice, row?.csv_key ?? '')).toEqual(whole.csv);
  expect(pdf.html).toEqual([whole.html]);
  expect(sortedEvents(events)).toEqual(sortedEvents(reference.events));
  expect(await storedEvents(w.triage, context.jobId)).toEqual(sortedEvents(events));
  return whole.content;
}

/** One query a scope's client sent: its text and its parameters. */
interface SentQuery {
  readonly text: string;
  readonly values: readonly unknown[];
}

const forward = <T extends object>(target: T, key: string | symbol): unknown => {
  const value: unknown = Reflect.get(target, key, target);
  return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
};

/**
 * The scope with every query its client sends recorded into `sent` (as test-support/memory.ts watches a reader), and
 * the first whose text includes `failAt`, if named, refused before it is sent: an injected failure.
 */
function loggingScope(scope: PracticeScope<ScopeClient>, sent: SentQuery[], failAt?: string): PracticeScope<ScopeClient> {
  const client = new Proxy(scope.client, {
    get(target, key) {
      if (key !== 'query') {
        return forward(target, key);
      }
      return (...args: unknown[]) => {
        const [text, values] = args;
        const sql = typeof text === 'string' ? text : '';
        if (failAt !== undefined && sql.includes(failAt)) {
          return Promise.reject(new Error('SYNTHETIC injected failure'));
        }
        sent.push({ text: sql, values: Array.isArray(values) ? values : [] });
        return (target.query as (...query: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return new Proxy(scope, { get: (target, key) => (key === 'client' ? client : forward(target, key)) });
}

/** The chain readers' practice-wide queries, by a phrase of their text (reconcile/remittances.ts and ledger.ts). */
const CHAIN_ORDER_SENT = "m.kind IN ('claim', 'recoupment')";
const LEDGER_MATCHES_SENT = 'FROM ledger_match m WHERE m.practice_id = $1 ORDER BY m.matched_at, m.id';
const CLAIM_LINES_SENT = 'WITH RECURSIVE named';
const REVERSALS_SENT = "v.claim_status_code = '22' AND v.reversal_of_claim_id";

const sentWith = (sent: readonly SentQuery[], phrase: string) => sent.filter((query) => query.text.includes(phrase));
/** The claim IDs a claimLines or reversals query was sent with. */
const claimsSent = (query: SentQuery): string[] => (query.values.find((value): value is string[] => Array.isArray(value)) ?? []).map(String);

/**
 * The new readers' answers beside the filtering versions' for the practice's case lines and their claims. The case lines
 * are also read in batches of `batchLines` (patientBalanceCases, and lineCorrections over batches that share the
 * practice's part read once), each line answered as by one call for every line; the queries the batched
 * patientBalanceCases sends are returned, so a test can count the practice-wide ones.
 */
async function samePatientShares(practice: Practice, batchLines: number): Promise<{ readonly patientBalance: readonly string[]; readonly corrections: number; readonly sent: readonly SentQuery[]; readonly matchedClaims: readonly string[] }> {
  const { practiceId } = practice;
  const found = await inJobScope(w.triage, practice, async (scope: PracticeScope<ScopeClient>) => {
    const { rows } = await scope.client.query<{ case_id: string; service_line_id: string; claim_id: string }>(
      'SELECT cl.case_id, cl.service_line_id, l.claim_id FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id WHERE cl.practice_id = $1 ORDER BY cl.service_line_id',
      [practiceId],
    );
    const caseIds = [...new Set(rows.map((row) => row.case_id))];
    const lineIds = rows.map((row) => row.service_line_id);
    const claimIds = [...new Set(rows.map((row) => row.claim_id))];
    const entries = await ledgerEntries(scope, practiceId);
    const whole = await wholeLineCorrections(scope, practiceId, lineIds);
    // A line's correction reads its own claim's chain and shares alone: one call for every line, or one per line, agree.
    const alone = new Map();
    for (const lineId of lineIds.slice(0, 200)) {
      for (const [key, value] of await lineCorrections(scope, practiceId, [lineId], entries)) {
        alone.set(key, value);
      }
    }
    // In batches that share the practice's part, read once: every line as the one call over every line answers it.
    const shared = await practiceCorrections(scope, practiceId, entries);
    const batched = new Map<string, LineCorrection>();
    for (let from = 0; from < lineIds.length; from += batchLines) {
      for (const [key, value] of await lineCorrections(scope, practiceId, lineIds.slice(from, from + batchLines), shared)) {
        batched.set(key, value);
      }
    }
    const sent: SentQuery[] = [];
    const balanceInBatches = await patientBalanceCases(loggingScope(scope, sent), practiceId, caseIds, entries, batchLines);
    const { rows: matched } = await scope.client.query<{ claim_id: string }>("SELECT DISTINCT claim_id FROM ledger_match WHERE practice_id = $1 AND kind = 'claim' ORDER BY claim_id", [practiceId]);
    return {
      shares: await lineShares(scope, practiceId, claimIds),
      wholeShares: await wholeLineShares(scope, practiceId, claimIds),
      balance: await patientBalanceCases(scope, practiceId, caseIds, entries),
      balanceInBatches,
      wholeBalance: await wholePatientBalanceCases(scope, practiceId, caseIds),
      corrections: await lineCorrections(scope, practiceId, lineIds),
      correctionsFromEntries: await lineCorrections(scope, practiceId, lineIds, entries),
      batched,
      whole,
      alone,
      sample: lineIds.slice(0, 200),
      sent,
      matchedClaims: matched.map((row) => row.claim_id),
      caseLines: rows.length,
    };
  });
  expect(found.shares).toEqual(found.wholeShares);
  expect(found.balance).toEqual(found.wholeBalance);
  expect(found.balanceInBatches).toEqual(found.wholeBalance);
  expect(found.corrections).toEqual(found.whole);
  expect(found.correctionsFromEntries).toEqual(found.whole);
  expect(found.batched).toEqual(found.whole);
  expect(found.alone).toEqual(new Map(found.sample.flatMap((id) => (found.whole.has(id) ? [[id, found.whole.get(id)]] : []))));
  // The practice-wide part of the chains is read once per report, however many batches the case lines take.
  if (found.caseLines > 0) {
    expect(sentWith(found.sent, CHAIN_ORDER_SENT)).toHaveLength(1);
    expect(sentWith(found.sent, LEDGER_MATCHES_SENT)).toHaveLength(1);
  }
  if (found.matchedClaims.length > 0) {
    // The matched claims' reversals are read once, with every matched claim; no batch reads them again.
    const reversals = sentWith(found.sent, REVERSALS_SENT).filter((query) => claimsSent(query).some((id) => found.matchedClaims.includes(id)));
    expect(reversals).toHaveLength(1);
    expect(new Set(claimsSent(reversals[0] as SentQuery))).toEqual(new Set(found.matchedClaims));
  }
  return { patientBalance: [...found.wholeBalance].sort(), corrections: found.whole.size, sent: found.sent, matchedClaims: found.matchedClaims };
}

describe('the audit report through the job streams and stores what the whole read stored (CAS-41.1)', () => {
  for (const run of CAS_RUNS) {
    describe(run.label, () => {
      let practice: Practice;
      let runId: string;

      it('the job stores and prints what the whole read did', async () => {
        const setup = await run.setup(w.triage, `streamed ${run.label}`);
        practice = setup.practice;
        runId = setup.runId;
        // Triaged first by the job, so the cases and anomalies both reports name are the same rows (the reference's own
        // triage, rolled back, would draw other IDs); the report's inline triage is then a re-triage, and the batched
        // triage's first pass is compared in triage/batched.db.test.ts.
        await w.triage.triage(practice, setup.runId, CAS_AS_OF);
        const id = await w.triage.requestReport(practice, setup.runId);
        const content = await sameReport(practice, id, CAS_AS_OF);
        expect(content.report_id).toBe(id);
      }, 240_000);

      it('at batches of one line and 61-byte chunks, the job stores and prints what the whole read did', async () => {
        const id = await w.triage.requestReport(practice, runId);
        expect((await sameReport(practice, id, CAS_AS_OF, ACROSS)).report_id).toBe(id);
      }, 240_000);

      it('the patient shares and balances are the filtering versions’', async () => {
        await samePatientShares(practice, 1);
      }, 120_000);
    });
  }

  let recovered: { readonly practice: Practice; readonly runId: string };
  let corrected: { readonly practice: Practice; readonly caseId: string; readonly runId: string };

  it('after a recovery (LED-06, CAS-08): the job stores and prints what the whole read did, payer approved and recovered from the ledger', async () => {
    const practice = await w.practice(`streamed after recovery ${randomUUID().slice(0, 8)}`, ledSettings('deposited'));
    await w.load(practice, 'CAS-08/remit.835');
    await w.load(practice, 'LED-06/original.835');
    const payerOf = async (planKey: string) => (await w.rows<{ payer_id: string }>(practice, 'SELECT payer_id FROM plan WHERE plan_key = $1', [planKey]))[0]?.payer_id ?? '';
    const q = await w.triage.fixedContract(practice, { ...SCHEDULE, payerId: await payerOf('CE:SYNPLAN-FIX-ONE') });
    const l = await w.triage.fixedContract(practice, { ...SCHEDULE, payerId: await payerOf(LED_PLAN) });
    const march = await w.triage.pricedRun(practice, {
      plans: [
        { key: 'CE:SYNPLAN-FIX-ONE', versionId: q.versionId },
        { key: LED_PLAN, versionId: l.versionId },
      ],
      from: '2026-03-01',
      to: '2026-03-31',
    });
    await w.triage.triage(practice, march, CAS_AS_OF);
    const cases = await w.rows<{ id: string; plan_key: string }>(practice, 'SELECT c.id, pl.plan_key FROM "case" c JOIN plan pl ON pl.id = c.plan_id ORDER BY pl.plan_key');
    await w.submit(practice, cases.find((item) => item.plan_key === 'CE:SYNPLAN-FIX-ONE')?.id ?? '', '2026-05-04');
    await w.load(practice, 'LED-06/adjusted.835');
    await w.reconcile(practice);
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-06/posting-export.csv', 'posting_export') });
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-06/eft-export.csv', 'eft_export') });
    const content = await sameReport(practice, await w.triage.requestReport(practice, march), CAS_AS_OF);
    expect(content.headline).toMatchObject({ actionable_cents: '9000', payer_approved_cents: '3000', recovered_cents: '3000' });
    recovered = { practice, runId: march };
  }, 300_000);

  it('after a recovery, at batches of one line and 61-byte chunks: the same report, payer approved and recovered folded across batches', async () => {
    const content = await sameReport(recovered.practice, await w.triage.requestReport(recovered.practice, recovered.runId), CAS_AS_OF, ACROSS);
    expect(content.headline).toMatchObject({ actionable_cents: '9000', payer_approved_cents: '3000', recovered_cents: '3000' });
  }, 300_000);

  it('after a recovery, the patient shares and balances are the filtering versions’', async () => {
    expect((await samePatientShares(recovered.practice, 1)).corrections).toBe(4);
  }, 120_000);

  it('of a case whose correction the patient’s share took whole (LED-15): the job stores and prints what the whole read did', async () => {
    const practice = await w.practice(`streamed patient balance ${randomUUID().slice(0, 8)}`, ledSettings('deposited'));
    await w.load(practice, 'LED-15/original.835');
    const contract = await w.triage.fixedContract(practice, SCHEDULE);
    const march = await w.triage.pricedRun(practice, { plans: [{ key: LED_PLAN, versionId: contract.versionId }], from: '2026-03-01', to: '2026-03-31' });
    await w.triage.triage(practice, march, CAS_AS_OF);
    const [line] = await w.rows<{ case_id: string }>(practice, 'SELECT case_id FROM case_line');
    await w.submit(practice, line?.case_id ?? '', '2026-05-04');
    await w.load(practice, 'LED-15/adjusted.835');
    await w.reconcile(practice);
    const content = await sameReport(practice, await w.triage.requestReport(practice, march), CAS_AS_OF);
    expect(content.cases).toEqual([expect.objectContaining({ case_id: line?.case_id, patient_balance: true })]);
    corrected = { practice, caseId: line?.case_id ?? '', runId: march };
  }, 300_000);

  it('of a case whose correction the patient’s share took whole, at batches of one line and 61-byte chunks: the same report, its patient balance folded across batches', async () => {
    const content = await sameReport(corrected.practice, await w.triage.requestReport(corrected.practice, corrected.runId), CAS_AS_OF, ACROSS);
    expect(content.cases).toEqual([expect.objectContaining({ case_id: corrected.caseId, patient_balance: true })]);
  }, 300_000);

  it('of a case whose correction the patient’s share took whole, the patient balances are the filtering versions’', async () => {
    expect((await samePatientShares(corrected.practice, 1)).patientBalance).toEqual([corrected.caseId]);
  }, 120_000);

  let split: { readonly practice: Practice; readonly caseId: string; readonly runId: string };

  it('of a two-line case on two claims (LED-15 and its partial claim), each line its own batch: the same report, payer approved, recovered and the patient balance folded across batches', async () => {
    const practice = await w.practice(`streamed two claims ${randomUUID().slice(0, 8)}`, ledSettings('deposited'));
    await w.load(practice, 'LED-15/original.835');
    await w.load(practice, 'LED-15/partial-original.835');
    const contract = await w.triage.fixedContract(practice, SCHEDULE);
    const march = await w.triage.pricedRun(practice, { plans: [{ key: LED_PLAN, versionId: contract.versionId }], from: '2026-03-01', to: '2026-03-31' });
    await w.triage.triage(practice, march, CAS_AS_OF);
    const lines = await w.rows<{ case_id: string; claim_id: string }>(practice, 'SELECT cl.case_id, l.claim_id FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id');
    // One case, its two lines on two claims: at batches of one, each line and each claim is a batch of its own.
    expect(lines).toHaveLength(2);
    expect(new Set(lines.map((line) => line.case_id)).size).toBe(1);
    expect(new Set(lines.map((line) => line.claim_id)).size).toBe(2);
    const caseId = lines[0]?.case_id ?? '';
    await w.submit(practice, caseId, '2026-05-04');
    await w.load(practice, 'LED-15/adjusted.835');
    await w.load(practice, 'LED-15/partial-adjusted.835');
    await w.reconcile(practice);
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-15/partial-eft-export.csv', 'eft_export') });
    const content = await sameReport(practice, await w.triage.requestReport(practice, march), CAS_AS_OF, ACROSS);
    expect(content.cases).toEqual([
      expect.objectContaining({ case_id: caseId, lines: 2, actionable_now_cents: '3000', payer_approved_cents: '1000', recovered_cents: '1000', patient_balance: true }),
    ]);
    expect(content.headline).toMatchObject({ actionable_cents: '3000', payer_approved_cents: '1000', recovered_cents: '1000' });
    // And at the default batch sizes, the same report again.
    await sameReport(practice, await w.triage.requestReport(practice, march), CAS_AS_OF);
    split = { practice, caseId, runId: march };
  }, 300_000);

  it('of a two-line case on two claims, lineCorrections in batches of one with the practice’s part read once answers each line as one call; that part is read once, not per batch', async () => {
    const found = await samePatientShares(split.practice, 1);
    expect(found.patientBalance).toEqual([split.caseId]);
    // Both claims' corrections are matched, one to each line.
    expect(found.matchedClaims).toHaveLength(2);
    // The matched claims' lines are read once, all together; a batch reads its own claim and its own line's chain alone.
    const withEvery = sentWith(found.sent, CLAIM_LINES_SENT).filter((query) => found.matchedClaims.every((id) => claimsSent(query).includes(id)));
    expect(withEvery).toHaveLength(1);
  }, 120_000);

  it('releases the arena once when gatherReport fails after its line loop, at the ledger or at the patient balance', async () => {
    for (const failAt of ['FROM ledger_entry e WHERE e.practice_id = $1', 'DECLARE report_case_lines']) {
      const release = vi.spyOn(CsvArena.prototype, 'release');
      const sent: SentQuery[] = [];
      try {
        await expect(
          inJobScope(w.triage, split.practice, async (scope) =>
            gatherReport(loggingScope(scope, sent, failAt), {
              practiceId: split.practice.practiceId,
              auditReportId: randomUUID(),
              pricingRunId: split.runId,
              asOf: CAS_AS_OF,
              requestId: randomUUID(),
              cipher: await loadPracticeCipher(scope, w.keys, split.practice.practiceId),
              batches: ACROSS,
            }),
          ),
          failAt,
        ).rejects.toThrow('SYNTHETIC injected failure');
        // The line loop had ended (its cursor closed) and its rows were in the arena when the failure came.
        expect(sentWith(sent, 'CLOSE report_lines'), failAt).toHaveLength(1);
        expect(release, failAt).toHaveBeenCalledTimes(1);
        const arena = release.mock.contexts[0] as CsvArena;
        expect(arena.heldBytes, failAt).toBe(0);
        await expect(collect(arena.rows()), failAt).rejects.toThrow('released');
      } finally {
        release.mockRestore();
      }
    }
  }, 120_000);
});

describe('the audit report’s readers on a generated month (CAS-41.1)', () => {
  let month: GeneratedMonth;
  const auditReportId = randomUUID();

  beforeAll(async () => {
    month = await generatedMonth(w.triage, { label: 'streamed generated month', contentLoaded });
  }, 900_000);

  const input = async (scope: PracticeScope<ScopeClient>, requestId: string, target: GeneratedMonth = month, batches?: ReportBatches): Promise<GatherInput> => ({
    practiceId: target.practice.practiceId,
    auditReportId,
    pricingRunId: target.runId,
    asOf: GENERATED_AS_OF,
    requestId,
    cipher: await loadPracticeCipher(scope, w.keys, target.practice.practiceId),
    ...(batches === undefined ? {} : { batches }),
  });

  it('the reader folds the whole read’s content, streams its CSV byte for byte, prints its HTML and audits the same reads', async () => {
    const { practiceId } = month.practice;
    const whole = await rolledBack(w.triage, practiceId, async (scope, requestId) => {
      const { content, lines } = await wholeGatherReport(scope, await input(scope, requestId));
      const reconciliation = auditReconciliation(content, (await practiceLedgerSettings(scope, practiceId)).proofLevel);
      return { content, lines, csv: Buffer.from(auditCsv(lines), 'utf8'), html: auditHtml(content, reconciliation) };
    });
    const streamedAt = (batches?: ReportBatches) =>
      rolledBack(w.triage, practiceId, async (scope, requestId) => {
        const { content, arena } = await gatherReport(scope, await input(scope, requestId, month, batches));
        const csv = await collect(arena.rows());
        arena.release();
        const reconciliation = auditReconciliation(content, (await practiceLedgerSettings(scope, practiceId)).proofLevel);
        return { content, csv, html: auditHtml(content, reconciliation) };
      });
    const streamed = await streamedAt();
    expect(whole.result.lines).toHaveLength(month.lines);
    // At the default sizes, and in batches of seven lines and case lines with 61-byte chunks (which split the
    // month's multi-byte payer names across chunks): the same content, CSV bytes, HTML and audit events.
    for (const [label, each] of [
      ['default', streamed],
      ['sevens', await streamedAt({ reportLines: 7, caseLines: 7, csvChunkBytes: 61 })],
    ] as const) {
      expect(each.result.content, label).toEqual(whole.result.content);
      expect(stored(each.result.content), label).toEqual(stored(whole.result.content));
      expect(each.result.csv.equals(whole.result.csv), label).toBe(true);
      expect(each.result.html === whole.result.html, label).toBe(true);
      expect(sortedEvents(each.events), label).toEqual(sortedEvents(whole.events));
    }
    // One event per row read: each of the run's priced lines once, and nothing else.
    expect(streamed.events.filter((event) => event.object_type === 'priced_line' && event.purpose === 'audit_report')).toHaveLength(month.lines);
    expect(new Set(streamed.events.map((event) => event.object_id)).size).toBe(month.lines);

    // The month holds what it is built to hold, so the comparison covers every figure.
    const { content, lines } = whole.result;
    const statuses = new Set(lines.map((line) => line.status));
    for (const status of ['actionable', 'held', 'not_actionable', 'written_off', 'in_case_other_run', 'overpaid', 'paid_as_expected', 'with_visit', 'unpriced']) {
      expect(statuses, status).toContain(status);
    }
    const reasons = content.validated.not_actionable.map((entry) => entry.reason);
    for (const reason of ['BELOW_LINE_MATERIALITY', 'NO_WINDOW', 'DEADLINE_UNVERIFIED', 'PER_VISIT_REVIEW', 'CONTENT_NOT_LOADED:mue', 'CONTENT_NOT_LOADED:mppr_mue', 'BELOW_CASE_MATERIALITY', 'CASE_LINE_FROM_OTHER_RUN', 'written_off:window_passed', 'written_off:duplicate', 'written_off:not_worth_pursuit']) {
      expect(reasons, reason).toContain(reason);
    }
    expect(content.evidence_gaps.map((gap) => gap.kind)).toEqual(expect.arrayContaining(['unpriced', 'no_window', 'deadline_unverified']));
    expect(content.evidence_gaps.find((gap) => gap.kind === 'deadline_unverified')?.remedy.split('. ').length).toBeGreaterThan(1);
    expect(content.anomalies).toHaveLength(1);
    expect(content.cases.length).toBeGreaterThan(2);
    expect(content.cases.some((item) => item.case_lines > item.lines)).toBe(true);
    expect(content.pursuit.estimated).toBe(true);
    // Two patterns tie on every key the report sorts them by (the DELTA payers' shared plan, one with a version named).
    const sortKey = (pattern: AuditReportContent['validated']['patterns'][number]) => JSON.stringify([pattern.payer, pattern.plan, pattern.behavior, pattern.rate_record_id]);
    const keys = content.validated.patterns.map(sortKey);
    expect(new Set(keys).size).toBeLessThan(keys.length);
    // Claim numbers tie on payer and plan, and a tie on the line number too is broken by the line's ID.
    const column = (name: (typeof CSV_COLUMNS)[number]) => CSV_COLUMNS.indexOf(name);
    const csvRows = whole.result.csv.toString('utf8').slice(0, -2).split('\r\n').slice(1);
    const claimKeys = csvRows.map((row) => row.split(',').slice(0, 4).join('|'));
    expect(new Set(claimKeys).size).toBeLessThan(claimKeys.length);
    expect(column('line_ref')).toBe(CSV_COLUMNS.length - 1);
  }, 600_000);

  it('the patient shares and balances are the filtering versions’, and lineCorrections answers a line alike in any call', async () => {
    const found = await samePatientShares(month.practice, 7);
    expect(found.corrections).toBeGreaterThan(2_000);
  }, 600_000);

  describe('in bounded memory (CAS-41.2)', () => {
    let doubled: GeneratedMonth;

    beforeAll(async () => {
      doubled = await generatedMonth(w.triage, { label: 'streamed doubled month', lines: 2 * GENERATED_FULL_LINES, contentLoaded });
    }, 900_000);

    /**
     * The heap gatherReport holds at most on a month's run, while it reads and with its content and arena in hand (before
     * the CSV is written); the buffers outside the heap then; the arena's chunk bytes and its rows' bytes (the CSV less
     * its header).
     */
    const measured = async (target: GeneratedMonth) => {
      const { summary, peakBytes, answeredBuffers } = await measure(
        (watch) => inJobScope(w.triage, target.practice, async (scope) => gatherReport(watch(scope), await input(scope, randomUUID(), target))),
        async ({ arena }) => {
          const arenaBytes = arena.heldBytes;
          const rowBytes = (await collect(arena.rows())).length - Buffer.byteLength(`${CSV_COLUMNS.map(csvText).join(',')}\r\n`, 'utf8');
          const lines = arena.lines;
          arena.release();
          return { lines, arenaBytes, rowBytes };
        },
      );
      return { units: summary.lines, bytes: peakBytes, buffers: answeredBuffers, ...summary };
    };

    it(`holds at most ${String(REPORT_HEAP_BYTES)} bytes of heap per added line, from a month of 10,000 lines to one of 20,000, its CSV rows outside the heap`, async () => {
      // Once unmeasured, so the code the read compiles and the pool's connection are not counted as the first month's.
      await measured(month);
      const at10k = await measured(month);
      const at20k = await measured(doubled);
      expect(at10k.units).toBe(month.lines);
      expect(at20k.units).toBe(doubled.lines);
      const growth = perAdded(at10k, at20k);
      expect(growth, `${String(at10k.units)} lines ${String(at10k.bytes)} B, ${String(at20k.units)} lines ${String(at20k.bytes)} B`).toBeLessThanOrEqual(REPORT_HEAP_BYTES);
      for (const size of [at10k, at20k]) {
        // The arena's chunks hold the rows' bytes and at most one chunk's tail besides; outside the heap the report holds
        // the chunks and, within one chunk more, its typed sort keys.
        expect(size.arenaBytes).toBeGreaterThanOrEqual(size.rowBytes);
        expect(size.arenaBytes - size.rowBytes).toBeLessThan(CSV_ARENA_CHUNK_BYTES);
        expect(size.buffers).toBeGreaterThanOrEqual(size.arenaBytes);
        expect(size.buffers - size.arenaBytes).toBeLessThan(CSV_ARENA_CHUNK_BYTES);
      }
    }, 600_000);
  });
});
