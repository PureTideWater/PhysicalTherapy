import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { type ScopeClient, documentObjectKey, readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { casePatientBalance as reportRule } from '@tp/worker/ledger';
import { type JobContext, printRoiStatement, reconcileHandler } from '@tp/worker/runtime';
import type { Practice } from '@tp/worker/testing';
import type { TriageWorld } from '@tp/worker/testing/triage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import type { CookieJar, Outcome, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import { LedgerWorld, ledSettings } from '../../../../worker/src/reconcile/test-support/ledger-world';
import { casePatientBalance, reconciliation } from '../reconciliation/queries';
import { MemoryQueue } from '../uploads/queue';
import { practiceHome } from './practice';
import { matchDepositAction, reconciliationPage, reverseMatchAction, saveTemplateAction, templatePage } from './reconciliation';
import { generateRoiAction, roiStatementCsv, roiStatementPage, roiStatementPdf, roiStatementsPage } from './roi';
import { adjustEntryAction, ledgerReviewPage } from './specialist';
import { casePage } from './triage';
import { csrfTokenFor } from '../http/csrf';

/**
 * The Reconciliation screen, the posting-template mapping and the ROI statements through their routes
 * against PostgreSQL (PRD 5, J10 and J12; PRD 7, Reconciliation and Reports; PRD 13; PRD 20; test
 * matrix LED-02, LED-04, LED-05, LED-06, LED-07, LED-11; docs/adr/0042, 0043). A practice's SYNTHETIC
 * LED-06 original payment is priced under a signed-off 50.00-per-unit 97110 schedule and triaged into a
 * case; its adjusted remittance, posting export, a bank export with a mistyped trace and the recoupment
 * then reach the ledger through the reconcile job's own handler; and the people of the practice work
 * it through the routes: the billing manager maps the template, matches the deposit by hand and
 * reverses it, generates an ROI statement; the viewer reads it all without the PHI columns. Practices of their own
 * hold SYNTHETIC LED-14, LED-15 and LED-18 (lines with a patient's share; docs/adr/0067): billable to the patient
 * beside the ledger, counted in no total, its reasons for the roles that read PHI only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic');
const SETTINGS = { case_materiality_cents: '1000', proof_level: 'deposited' };

let w: TriageWorld;
/** The same world, with the ledger's scenario steps (a case per LED fixture, a submission and the payer's response). */
let ledger: LedgerWorld;
let services: Services;
let queue: MemoryQueue;
let practice: Practice;
let viewer: string;
let caseId: string;
/** The deposit matched by hand (LED-05), for the statements' tests to reverse and match again. */
let depositMatch: { eftRowId: string | undefined; remittanceId: string | undefined };
/** The first statement generated on demand (LED-11). */
let firstStatement: string;

class Jar implements CookieJar {
  private readonly values = new Map<string, string>();
  constructor(token: string) {
    this.values.set(SESSION_COOKIE, token);
  }
  get(name: string) {
    return this.values.get(name);
  }
  set(name: string, value: string) {
    this.values.set(name, value);
  }
  delete(name: string) {
    this.values.delete(name);
  }
}

const tokens = new Map<string, string>();
async function sessionOf(userId: string): Promise<string> {
  let token = tokens.get(userId);
  if (token === undefined) {
    // An internal role signs in with a hardware key (the contract specialist, under the practice's support grant).
    const method = userId === w.pricing.specialist ? 'webauthn' : 'totp';
    token = (await openSession(w.app, { userId, method, deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
    tokens.set(userId, token);
  }
  return token;
}

async function call<R>(route: Route<R>, userId: string, params: Record<string, unknown>, input?: Record<string, unknown>, using: Services = services): Promise<Outcome<R>> {
  return route.invoke({ cookies: new Jar(await sessionOf(userId)), params, input: route.mutation ? { csrfToken: csrfTokenFor(services.sealer, await sessionOf(userId)), requestKey: randomUUID(), ...input } : input, requestId: `test-${randomUUID()}`, userAgent: null }, using);
}

/**
 * The routes' services with a pool whose connections run `between` once, right after the first statement whose text
 * holds `marker` has returned: a write that commits while a page is part way through its reads.
 */
function committingMidRead(marker: string, between: () => Promise<void>): Services {
  let fired = false;
  const pool: Services['pool'] = {
    connect: async () => {
      const client = await w.app.connect();
      const query = async (text: string, values?: unknown[]) => {
        const result = await client.query(text, values);
        if (!fired && text.includes(marker)) {
          fired = true;
          await between();
        }
        return result;
      };
      return { query: query as ScopeClient['query'], release: (destroy?: boolean | Error) => client.release(destroy) };
    },
  };
  return { ...services, pool };
}

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

function jobContext(): JobContext {
  const jobId = randomUUID();
  return { jobId, logger: createLogger({ sink: () => undefined }), transaction: (work) => withJobScope(w.app, { jobId, practiceId: practice.practiceId }, work), enqueue: () => Promise.resolve(null), lastAttempt: false };
}

const P = () => ({ practiceId: practice.practiceId });

/** The reconcile job's own handler, as the chain runs it after a document (one that is no export reads nothing first). */
async function reconcile(documentId: string = randomUUID()): Promise<void> {
  await reconcileHandler(w.pricing.parseServices)({ practice_id: practice.practiceId, document_id: documentId }, jobContext());
}

/** An export as intake leaves a clean one: stored, sealed under the practice's key. */
async function stageExport(kind: 'posting_export' | 'eft_export', content: Buffer): Promise<string> {
  const id = randomUUID();
  await withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
    scope.client.query("INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by) VALUES ($1, $2, $3, $4, 'text/csv', $5)", [
      id,
      practice.practiceId,
      kind,
      content.length,
      practice.manager,
    ]),
  );
  await w.pricing.parseServices.documents.write(practice.cipher, documentObjectKey(practice.practiceId, id), Readable.from([content]));
  await asOwner(w.owner, [practice.practiceId], () =>
    w.owner.query("UPDATE source_document SET sha256 = $2, scan_status = 'clean', scan_at = now(), status = 'stored' WHERE id = $1", [id, createHash('sha256').update(content).digest('hex')]),
  );
  return id;
}

beforeAll(async () => {
  ledger = await LedgerWorld.open(readDatabaseUrl());
  w = ledger.triage;
  const sealer = new Sealer(randomBytes(32));
  queue = new MemoryQueue();
  services = createServices({
    origin: 'http://localhost:3100',
    pool: w.app,
    provider: new DevAuthProvider({
      store: new MemoryDevStore(),
      sealer: sealer.derive('dev-provider'),
      webauthn: { rpId: 'localhost', rpName: 'Test', origin: 'http://localhost:3100' },
      deliverInvitation: () => Promise.resolve(),
      scryptCost: { n: 1024, r: 8, p: 1 },
    }),
    keys: w.keys,
    sealer,
    logger: createLogger({ sink: () => undefined }),
    queue,
    documents: w.pricing.parseServices.documents,
  });
  practice = await w.practice('RECONCILIATION ROUTES', SETTINGS);
  viewer = await createUser(w.owner);
  await addMembership(w.owner, practice.world.organizationId, viewer, 'viewer');
  await w.load(practice, 'LED-06/original.835');
  const contract = await w.fixedContract(practice, { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 });
  const runId = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-LED', versionId: contract.versionId }], from: '2026-03-01', to: '2026-03-31' });
  await w.triage(practice, runId);
  const [line] = (await w.owner.query<{ case_id: string }>('SELECT case_id FROM case_line WHERE practice_id = $1', [practice.practiceId])).rows;
  caseId = line?.case_id ?? '';
  await w.load(practice, 'LED-06/adjusted.835');
  await reconcile();
}, 120_000);

afterAll(async () => {
  await w.close();
});

describe('the Reconciliation screen (PRD 7)', () => {
  it('shows the approval of the adjusted remittance with its evidence, its line’s linkage and its entry, and the viewer no PHI column (LED-02)', async () => {
    const page = ok(await call(reconciliationPage, practice.manager, P()));
    expect(page.totals).toEqual({ proofLevel: 'deposited', approvedCents: '3000', payerApprovedCents: '3000', postedCents: '0', depositedCents: '0', recoupedCents: '0', interestCents: '0', recoveredCents: '0' });
    expect(page.linkage.items).toHaveLength(1);
    const [line] = page.linkage.items;
    expect(line).toMatchObject({ caseId, procedureCode: '97110', serviceDate: '2026-03-09', stage: 'payer_approved', postings: [], deposits: [] });
    expect(line?.era).toEqual([expect.objectContaining({ kind: 'claim', trace: 'SYNEFTLED06002', paidOn: '2026-06-08', outcome: 'approved', manual: false, matchedBy: null, standing: true })]);
    expect(line?.entries.map((entry) => [entry.stage, entry.amountCents, entry.byJob])).toEqual([['approved', '3000', true]]);
    expect(page.canReconcile).toBe(true);
    const seen = ok(await call(reconciliationPage, viewer, P()));
    expect(seen.phi).toBe(false);
    expect(seen.canReconcile).toBe(false);
    expect(seen.linkage.items[0]).toMatchObject({ procedureCode: null, serviceDate: null });
    // One case's ledger, and never a case of another practice.
    expect(ok(await call(reconciliationPage, viewer, { ...P(), case: caseId })).totals.approvedCents).toBe('3000');
    expect((await call(reconciliationPage, viewer, { ...P(), case: randomUUID() })).status).toBe('not_found');
  });

  it('keeps a posting export waiting for the template, which the billing manager maps once; the waiting export is reconciled (PRD 20, LED-04)', async () => {
    const documentId = await stageExport('posting_export', readFileSync(path.join(FIXTURES, 'LED-06/posting-export.csv')));
    await reconcile(documentId);
    const waiting = ok(await call(reconciliationPage, practice.manager, P()));
    expect(waiting.template).toEqual({ system: null, waiting: 1 });
    expect(waiting.exports.items[0]).toMatchObject({ id: documentId, kind: 'posting_export', status: 'stored', rows: 0 });
    expect(ok(await call(templatePage, viewer, P()))).toMatchObject({ current: null, waiting: 1, canMap: false, proofLevel: 'deposited' });
    // The administrator does not reconcile postings; an own mapping without its required columns is refused.
    expect((await call(saveTemplateAction, practice.world.adminUserId, P(), { template: 'synthetic_pm_export_v1' })).status).toBe('forbidden');
    const refused = await call(saveTemplateAction, practice.manager, P(), { template: 'practice', system: 'SYNTHETIC PM SYSTEM', date_format: 'MM/DD/YYYY', column_posted_on: 'Post Date' });
    expect(refused).toMatchObject({ status: 'invalid', issues: [{ field: 'column_check_or_trace' }, { field: 'column_amount' }] });
    // The practice's own mapping of the synthetic system's columns.
    const mapped = await call(saveTemplateAction, practice.manager, P(), {
      template: 'practice',
      system: 'SYNTHETIC PM SYSTEM',
      date_format: 'MM/DD/YYYY',
      column_posted_on: 'Post Date',
      column_check_or_trace: 'Check/EFT #',
      column_amount: 'Paid Amount',
      column_payer: 'Payer',
      column_batch: 'Batch',
    });
    expect(ok(mapped)).toEqual({ objectId: practice.practiceId, redirect: `/p/${practice.practiceId}/reconciliation/template?notice=saved` });
    expect(queue.jobs.filter((job) => job.type === 'reconcile')).toEqual([{ type: 'reconcile', payload: { practice_id: practice.practiceId, document_id: documentId } }]);
    expect(ok(await call(templatePage, practice.manager, P())).current).toEqual({
      id: 'practice',
      system: 'SYNTHETIC PM SYSTEM',
      columns: { posted_on: 'Post Date', check_or_trace: 'Check/EFT #', amount: 'Paid Amount', payer: 'Payer', batch: 'Batch' },
      dateFormat: 'MM/DD/YYYY',
    });
    await reconcile(documentId);
    const posted = ok(await call(reconciliationPage, practice.manager, P()));
    expect(posted.totals).toMatchObject({ postedCents: '3000', recoveredCents: '0' });
    expect(posted.linkage.items[0]?.postings).toEqual([expect.objectContaining({ kind: 'posting', level: 'check', evidence: { reference: 'SYNEFTLED06002', on: '2026-06-10', amountCents: '3000', batch: 'SYNBATCH-0601' } })]);
    expect(posted.exports.items[0]).toMatchObject({ id: documentId, status: 'loaded', rows: 1, matchedRows: 1 });
  });

  it('lists a deposit matching nothing beside its candidates; matched by hand in the person’s name it recovers the line, and its confirmed reversal nets to zero (LED-05, LED-07)', async () => {
    // SYNTHETIC: the bank export carries the trace mistyped; its amount is the remittance's.
    await reconcile(await stageExport('eft_export', Buffer.from('Date,Description,Trace Number,Amount,Batch Reference\n2026-06-09,SYNTHETIC PAYER L HCCLAIMPMT,SYNEFTLED06092,30.00,\n')));
    const listed = ok(await call(reconciliationPage, practice.manager, P()));
    const [row] = listed.unmatched.deposits;
    expect(row).toMatchObject({ trace: 'SYNEFTLED06092', amountCents: '3000', depositedOn: '2026-06-09', reversed: false });
    const candidate = row?.candidates.find((item) => item.trace === 'SYNEFTLED06002');
    expect(candidate).toMatchObject({ paymentCents: '3000' });
    expect(listed.totals.depositedCents).toBe('0');
    const input = { eftRowId: row?.eftRowId, remittanceId: candidate?.remittanceId };
    depositMatch = input;
    expect((await call(matchDepositAction, viewer, P(), input)).status).toBe('forbidden');
    const matched = ok(await call(matchDepositAction, practice.manager, P(), input));
    expect(matched.redirect).toBe(`/p/${practice.practiceId}/reconciliation?notice=matched`);
    // The same match again is the one standing.
    expect(ok(await call(matchDepositAction, practice.manager, P(), input))).toEqual({ objectId: matched.objectId, redirect: `/p/${practice.practiceId}/reconciliation?notice=already_matched` });
    const recovered = ok(await call(reconciliationPage, practice.manager, P()));
    expect(recovered.totals).toMatchObject({ depositedCents: '3000', recoveredCents: '3000' });
    expect(recovered.unmatched.deposits).toEqual([]);
    const [deposit] = recovered.linkage.items[0]?.deposits ?? [];
    expect(deposit).toMatchObject({ id: matched.objectId, manual: true, matchedBy: expect.stringContaining('@') as unknown, standing: true });
    expect(recovered.linkage.items[0]?.stage).toBe('recovered');
    // A reversal needs the person's reason and their confirmation of what it does.
    expect(await call(reverseMatchAction, practice.manager, P(), { matchId: matched.objectId, reason: 'SYNTHETIC matched by mistake' })).toMatchObject({ status: 'invalid', issues: [{ field: 'confirm' }] });
    ok(await call(reverseMatchAction, practice.manager, P(), { matchId: matched.objectId, reason: 'SYNTHETIC matched by mistake', confirm: 'on' }));
    expect(ok(await call(reverseMatchAction, practice.manager, P(), { matchId: matched.objectId, reason: 'again', confirm: 'on' })).redirect).toContain('notice=already_reversed');
    const reversed = ok(await call(reconciliationPage, practice.manager, P()));
    expect(reversed.totals).toMatchObject({ depositedCents: '0', recoveredCents: '0' });
    expect(reversed.unmatched.deposits).toMatchObject([{ eftRowId: row?.eftRowId, reversed: true }]);
    expect(reversed.entries.items.slice(0, 2).map((entry) => [entry.stage, entry.amountCents, entry.reason])).toEqual([
      ['reversed', '-3000', 'SYNTHETIC matched by mistake'],
      ['deposited', '3000', null],
    ]);
    // The viewer reads the entries without the person's words.
    expect(ok(await call(reconciliationPage, viewer, P())).entries.items[0]).toMatchObject({ stage: 'reversed', reason: null });
    // Matched again, by hand, for the statement below.
    ok(await call(matchDepositAction, practice.manager, P(), input));
  });

  it('generates an ROI statement on demand that recomputes from its entries, prints it, and downloads its PDF and CSV (LED-11)', async () => {
    expect((await call(generateRoiAction, practice.manager, P(), { periodFrom: '2026-06-30', periodTo: '2026-04-01' })).status).toBe('invalid');
    expect((await call(generateRoiAction, viewer, P(), { periodFrom: '2026-04-01', periodTo: '2026-06-30' })).status).toBe('forbidden');
    const generated = ok(await call(generateRoiAction, practice.manager, P(), { periodFrom: '2026-04-01', periodTo: '2026-06-30' }));
    const statementId = generated.objectId ?? '';
    firstStatement = statementId;
    expect(queue.jobs.at(-1)).toEqual({ type: 'roi_statement', payload: { practice_id: practice.practiceId, roi_statement_id: statementId } });
    const page = ok(await call(roiStatementPage, viewer, { ...P(), statementId }));
    // The Verified gate on the stored statement and the practice's ledger (docs/adr/0057): every linked entry is a
    // deposit or its reversal, the line has cash standing, and nothing linked was corrected since.
    expect(page.detail.verified).toEqual({
      reconciledToCash: true,
      source: `ledger.reportReconciliation(roi_statement ${statementId})`,
      reason: 'reconciled',
      proofLevel: 'deposited',
      recoveredCents: 3000n,
      lines: 1,
    });
    expect(page.detail).toMatchObject({
      periodFrom: '2026-04-01',
      periodTo: '2026-06-30',
      proofLevel: 'deposited',
      quarterly: false,
      print: 'printing',
      feesCents: '0',
      recoveredToFees: null,
      matches: true,
      recovered: { storedCents: '3000', recomputedCents: '3000', matches: true },
      approvedUnposted: { storedCents: '0', matches: true },
    });
    // The deposit, its reversal and the deposit matched again: 30.00 recovered.
    expect(page.detail.recovered.entries.map((entry) => [entry.stage, entry.amountCents])).toEqual([
      ['deposited', '3000'],
      ['reversed', '-3000'],
      ['deposited', '3000'],
    ]);
    expect((await call(roiStatementPdf, viewer, { ...P(), statementId })).status).toBe('not_found');
    const jobId = randomUUID();
    const pdf = new TextEncoder().encode('%PDF-1.7\n% SYNTHETIC stand-in\n');
    const printed: string[] = [];
    await printRoiStatement(
      { jobId, logger: createLogger({ sink: () => undefined }), transaction: (work) => withJobScope(w.app, { jobId, practiceId: practice.practiceId }, work), enqueue: () => Promise.resolve(null), lastAttempt: false },
      { documents: w.pricing.parseServices.documents, keys: w.keys, pdf: { render: (html: string) => Promise.resolve(printed.push(html)).then(() => pdf) } },
      practice.practiceId,
      statementId,
    );
    // Earned: the printed cover carries the seal, naming the ledger as its source.
    expect(printed).toHaveLength(1);
    expect(printed[0]).toContain(`data-verified="seal" data-source="ledger.reportReconciliation(roi_statement ${statementId})"`);
    expect(ok(await call(roiStatementPage, viewer, { ...P(), statementId })).detail).toMatchObject({ print: 'printed', pdfSha256: createHash('sha256').update(pdf).digest('hex') });
    const downloaded = ok(await call(roiStatementPdf, viewer, { ...P(), statementId }));
    expect(downloaded.download).toMatchObject({ filename: `roi-statement-${statementId}.pdf`, contentType: 'application/pdf' });
    expect(Buffer.from(downloaded.download.body).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const csv = ok(await call(roiStatementCsv, viewer, { ...P(), statementId })).download.body;
    expect(csv).toContain('recovered,total,30.00,usd,,,,,\r\n');
    expect(csv).toContain('proof_level,total,deposited,stage,,,,,\r\n');
    expect(csv.split('\r\n').filter((line) => line.startsWith('recovered,entry,'))).toHaveLength(3);
    const { rows } = await w.owner.query<{ purpose: string }>("SELECT purpose FROM audit_event WHERE practice_id = $1 AND action = 'roi_statement_downloaded' ORDER BY at", [practice.practiceId]);
    expect(rows.map((row) => row.purpose)).toEqual(['report_pdf', 'report_csv']);
    expect(ok(await call(roiStatementsPage, viewer, P())).statements.items).toEqual([expect.objectContaining({ id: statementId, recoveredCents: '3000', quarterly: false, print: 'printed' })]);
  });

  it('withdraws the seal from a statement whose linked deposit the ledger has since reversed, on the page and in print (docs/adr/0057)', async () => {
    const generated = ok(await call(generateRoiAction, practice.manager, P(), { periodFrom: '2026-04-01', periodTo: '2026-06-30' }));
    const statementId = generated.objectId ?? '';
    expect(ok(await call(roiStatementPage, viewer, { ...P(), statementId })).detail.verified).toMatchObject({ reconciledToCash: true, reason: 'reconciled' });
    // The deposit matched by hand is reversed after both statements were written: its reversal takes the deposit's date,
    // so it falls in their period, but neither statement links it.
    const listed = ok(await call(reconciliationPage, practice.manager, P()));
    const standing = listed.linkage.items[0]?.deposits.find((deposit) => deposit.standing);
    ok(await call(reverseMatchAction, practice.manager, P(), { matchId: standing?.id, reason: 'SYNTHETIC reversed after the statement', confirm: 'on' }));
    for (const id of [firstStatement, statementId]) {
      const detail = ok(await call(roiStatementPage, viewer, { ...P(), statementId: id })).detail;
      // The statement still recomputes from the entries it links; the seal is withdrawn, since the ledger no longer holds that cash.
      expect(detail.matches).toBe(true);
      expect(detail.verified).toMatchObject({ reconciledToCash: false, reason: 'entry_corrected_since', source: `ledger.reportReconciliation(roi_statement ${id})` });
    }
    // Printed now, its cover carries no seal and no definition line.
    const jobId = randomUUID();
    const printed: string[] = [];
    const pdf = new TextEncoder().encode('%PDF-1.7\n% SYNTHETIC stand-in\n');
    const outcome = await printRoiStatement(
      { jobId, logger: createLogger({ sink: () => undefined }), transaction: (work) => withJobScope(w.app, { jobId, practiceId: practice.practiceId }, work), enqueue: () => Promise.resolve(null), lastAttempt: false },
      { documents: w.pricing.parseServices.documents, keys: w.keys, pdf: { render: (html: string) => Promise.resolve(printed.push(html)).then(() => pdf) } },
      practice.practiceId,
      statementId,
    );
    expect(outcome.outcome).toBe('printed');
    expect(printed).toHaveLength(1);
    expect(printed[0]).not.toContain('data-verified');
    expect(printed[0]).not.toContain('Verified:');
    // Matched again, by hand, for the tests below.
    ok(await call(matchDepositAction, practice.manager, P(), depositMatch));
    expect(ok(await call(reconciliationPage, practice.manager, P())).totals).toMatchObject({ depositedCents: '3000', recoveredCents: '3000' });
  });

  it('takes back the PLB WO at once: recovered reduced by its amount, the recoupment shown with its evidence, the dashboard reading the ledger (LED-06)', async () => {
    await w.load(practice, 'LED-06/recoupment.835');
    // The reconcile commits while the screen reads: after its case lines and their stages, before its entries and totals.
    // The screen reads one snapshot, so what it shows agrees with itself, all of it from before the take-back; read at
    // READ COMMITTED it would show the line still Recovered beside recovered of 12.00.
    const during = ok(await call(reconciliationPage, practice.manager, P(), undefined, committingMidRead('FROM case_line cl JOIN service_line l', () => reconcile())));
    expect(during.totals).toMatchObject({ depositedCents: '3000', recoupedCents: '0', recoveredCents: '3000' });
    expect(during.linkage.items[0]).toMatchObject({ stage: 'recovered', recoupments: [] });
    expect(during.entries.items.map((entry) => entry.stage)).not.toContain('recouped');
    // The screen's reads refuse a scope that reads statement by statement.
    await expect(
      withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
        reconciliation(scope, services, practice.practiceId, { caseId: null, linesPage: 1, entriesPage: 1 }, true, `test-${randomUUID()}`),
      ),
    ).rejects.toThrow('the ledger is read in one snapshot');
    const page = ok(await call(reconciliationPage, practice.manager, P()));
    expect(page.totals).toMatchObject({ approvedCents: '3000', depositedCents: '3000', recoupedCents: '-1800', recoveredCents: '1200' });
    const [line] = page.linkage.items;
    expect(line?.recoupments).toEqual([expect.objectContaining({ kind: 'recoupment', source: 'plb', trace: 'SYNEFTLED06003', standing: true })]);
    expect(line?.stage).toBe('actionable');
    // The dashboard reads the ledger: recovered to date is the ledger's net of the recoupment, beside
    // payer approved as its own figure; recovered this quarter is zero, since nothing moved in this quarter.
    const home = ok(await call(practiceHome, viewer, P())).dashboard;
    expect(home.headline).toMatchObject({ payerApprovedCents: '3000', recoveredCents: '1200', proofLevel: 'deposited' });
    expect(home.recoveredQuarter.cents).toBe('0');
  });

  it('lets the contract specialist alone adjust an entry, with a reason and confirmation, within what its evidence shows, and never one that was reversed (PRD 13, Entries: adjusted)', async () => {
    const page = ok(await call(reconciliationPage, practice.manager, P()));
    expect(page.linkage.items[0]?.shortfallCents).toBeNull();
    const approval = page.entries.items.find((entry) => entry.stage === 'approved');
    const recoupment = page.entries.items.find((entry) => entry.stage === 'recouped');
    const undone = page.entries.items.find((entry) => entry.stage === 'deposited' && !entry.adjustable);
    expect(approval?.adjustable).toBe(true);
    expect(undone).toBeDefined();
    expect(page.entries.items.filter((entry) => entry.stage === 'reversed').every((entry) => !entry.adjustable)).toBe(true);
    const specialist = w.pricing.specialist;
    const input = { entryId: recoupment?.id, amount: '5.00', reason: 'SYNTHETIC specialist review of the take-back' };
    // The viewer and the billing manager reconcile, read or post; neither corrects an amount.
    expect((await call(adjustEntryAction, viewer, P(), { ...input, confirm: 'on' })).status).toBe('forbidden');
    expect((await call(adjustEntryAction, practice.manager, P(), { ...input, confirm: 'on' })).status).toBe('forbidden');
    expect(await call(adjustEntryAction, specialist, P(), input)).toMatchObject({ status: 'invalid', issues: [{ field: 'confirm' }] });
    expect(await call(adjustEntryAction, specialist, P(), { ...input, amount: '0.00', confirm: 'on' })).toMatchObject({ status: 'invalid', issues: [{ field: 'amount' }] });
    expect(await call(adjustEntryAction, specialist, P(), { ...input, confirm: 'on', entryId: undone?.id })).toMatchObject({ status: 'invalid', issues: [{ field: 'entryId' }] });
    // The approval of 30.00 was deposited in full: lowering it would leave more deposited than approved.
    expect(await call(adjustEntryAction, specialist, P(), { ...input, entryId: approval?.id, amount: '-5.00', confirm: 'on' })).toMatchObject({ status: 'invalid', issues: [{ field: 'amount' }] });
    // The 18.00 take-back may be corrected toward nothing, never past it.
    expect(await call(adjustEntryAction, specialist, P(), { ...input, amount: '18.01', confirm: 'on' })).toMatchObject({ status: 'invalid', issues: [{ field: 'amount' }] });
    const review = ok(await call(ledgerReviewPage, specialist, P()));
    expect(review).toMatchObject({ canAdjust: true, totals: { recoupedCents: '-1800' } });
    expect(review.entries.items.find((entry) => entry.id === recoupment?.id)?.reason ?? null).toBeNull();
    const adjusted = ok(await call(adjustEntryAction, specialist, P(), { ...input, confirm: 'on' }));
    expect(adjusted.redirect).toBe(`/p/${practice.practiceId}/abstraction/ledger?notice=adjusted`);
    const after = ok(await call(reconciliationPage, practice.manager, P()));
    expect(after.totals).toMatchObject({ approvedCents: '3000', recoupedCents: '-1300', recoveredCents: '1700' });
    expect(after.entries.items[0]).toMatchObject({ id: adjusted.objectId, stage: 'adjusted', amountCents: '500', reason: 'SYNTHETIC specialist review of the take-back', byJob: false, adjustable: false });
    // The billing manager cannot open the specialist's page.
    expect((await call(ledgerReviewPage, practice.manager, P())).status).toBe('forbidden');
  });
});

describe('billable to the patient beside the ledger (PRD 13; docs/adr/0067; test matrix LED-14, LED-15, LED-18)', () => {
  /** A practice of its own with its LED case open from the fixture's original payment, and a viewer. */
  async function ledPractice(id: string): Promise<{ readonly practice: Practice; readonly viewer: string; readonly caseId: string; readonly serviceLineId: string }> {
    const target = await ledger.practice(`RECONCILIATION ${id} ${randomUUID().slice(0, 8)}`, ledSettings());
    const reader = await createUser(w.owner);
    await addMembership(w.owner, target.world.organizationId, reader, 'viewer');
    return { practice: target, viewer: reader, ...(await ledger.caseFor(target, `${id}/original.835`)) };
  }

  it('shows a coinsurance line’s allowed increase, the payer’s payment and the patient’s share beside the figures, the reasons to PHI roles only (LED-14)', async () => {
    const led = await ledPractice('LED-14');
    await ledger.load(led.practice, 'LED-14/adjusted.835');
    await ledger.reconcile(led.practice);
    const at = { practiceId: led.practice.practiceId };
    const page = ok(await call(reconciliationPage, led.practice.manager, at));
    expect(page.totals).toMatchObject({ approvedCents: '2400', payerApprovedCents: '2400', recoveredCents: '0' });
    const [line] = page.linkage.items;
    expect(line?.correction).toEqual({
      kind: null,
      billable: { billableCents: '600', allowedIncreaseCents: '3000', paymentIncreaseCents: '2400', otherReductionCents: '0', reasons: { deductible: '0', coinsurance: '600', copay: '0', other: '0' }, allocation: null },
    });
    // The ERA match's words read its payment increase.
    expect(line?.era).toEqual([expect.objectContaining({ outcome: 'approved', reading: 'approved', allowed: 'higher', paymentIncreaseCents: '2400', standing: true })]);
    // Counted in no total: no figure holds the patient's 6.00.
    expect(Object.values(page.totals)).not.toContain('600');
    // A reader who does not read PHI sees the amounts, never the reasons.
    const seen = ok(await call(reconciliationPage, led.viewer, at));
    expect(seen.linkage.items[0]?.correction.billable).toMatchObject({ billableCents: '600', allowedIncreaseCents: '3000', paymentIncreaseCents: '2400', reasons: null });
    // The case page: the case's billable total and the line's words, beside payer approved.
    const shown = ok(await call(casePage, led.practice.manager, { ...at, caseId: led.caseId }));
    expect(shown.ledger).toEqual({ approvedCents: '2400', recoveredCents: '0', proofLevel: 'deposited' });
    expect(shown.corrections).toEqual({ billableCents: '600', patientBalance: false, lines: { [led.serviceLineId]: line?.correction } });
    expect(ok(await call(casePage, led.viewer, { ...at, caseId: led.caseId })).corrections.lines[led.serviceLineId]?.billable?.reasons).toBeNull();
  });

  it('shows a correction the deductible took whole as the patient’s balance, with no entry and the case’s stored state unchanged (LED-15)', async () => {
    const led = await ledPractice('LED-15');
    await ledger.submit(led.practice, led.caseId, '2026-05-04');
    await ledger.load(led.practice, 'LED-15/adjusted.835');
    await ledger.reconcile(led.practice);
    const at = { practiceId: led.practice.practiceId };
    const page = ok(await call(reconciliationPage, led.practice.manager, at));
    expect(page.totals).toMatchObject({ approvedCents: '0', payerApprovedCents: '0', recoveredCents: '0' });
    const [line] = page.linkage.items;
    expect(line).toMatchObject({ stage: 'actionable', entries: [], shortfallCents: null });
    expect(line?.correction).toEqual({
      kind: 'patient_balance',
      billable: { billableCents: '3000', allowedIncreaseCents: '3000', paymentIncreaseCents: '0', otherReductionCents: '0', reasons: { deductible: '3000', coinsurance: '0', copay: '0', other: '0' }, allocation: null },
    });
    expect(line?.era).toEqual([expect.objectContaining({ outcome: 'approved', reading: 'patient_balance', allowed: 'higher', paymentIncreaseCents: '0' })]);
    expect(ok(await call(reconciliationPage, led.viewer, at)).linkage.items[0]?.correction).toMatchObject({ kind: 'patient_balance', billable: { billableCents: '3000', reasons: null } });
    // The case reads "Payer corrected; balance is the patient's" beside its state, which case_rules derives as ever (Q1).
    const shown = ok(await call(casePage, led.practice.manager, { ...at, caseId: led.caseId }));
    expect(shown.case.state).toBe('submitted');
    expect(shown.ledger).toMatchObject({ approvedCents: '0', recoveredCents: '0' });
    expect(shown.corrections).toMatchObject({ billableCents: '3000', patientBalance: true });
  });

  it('reads the case’s "balance is the patient’s" by the one rule the audit report reads (S3)', () => {
    // One definition, @tp/worker/ledger's, never a copy that can drift from the report's.
    expect(casePatientBalance).toBe(reportRule);
    const line = (correction: 'patient_balance' | 'other_reductions' | null, stage: string | null, writtenOff = false) => ({ correction, writtenOff, stage });
    expect(casePatientBalance([line('patient_balance', 'actionable'), line(null, 'recovered'), line(null, 'payer_approved'), line(null, 'actionable', true)])).toBe(true);
    expect(casePatientBalance([line('patient_balance', 'actionable'), line(null, 'actionable')])).toBe(false);
    expect(casePatientBalance([line('other_reductions', 'actionable')])).toBe(false);
    expect(casePatientBalance([line('patient_balance', 'actionable', true), line(null, 'recovered')])).toBe(false);
  });

  it('names on the specialist’s review the patient’s share beside a shortfall of an acceptance typed as the allowed amount, in amounts only (LED-18, S7)', async () => {
    const led = await ledPractice('LED-18');
    const { submissionId } = await ledger.submit(led.practice, led.caseId, '2026-05-04');
    await ledger.respond(led.practice, submissionId, { kind: 'accepted', amountCents: 3000n, receivedOn: '2026-05-20' });
    await ledger.reconcile(led.practice);
    await ledger.load(led.practice, 'LED-18/adjusted.835');
    await ledger.reconcile(led.practice);
    const review = ok(await call(ledgerReviewPage, w.pricing.specialist, { practiceId: led.practice.practiceId }));
    expect(review.shortfalls).toEqual([expect.objectContaining({ serviceLineId: led.serviceLineId, shortfallCents: '600' })]);
    // The route reads without PHI: the share's amount, never its reason.
    expect(review.shortfalls[0]?.correction.billable).toMatchObject({ billableCents: '600', reasons: null });
    expect(review.totals).toMatchObject({ approvedCents: '3000', payerApprovedCents: '3000' });
  });
});
