import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { type ScopeClient, databaseClient, documentObjectKey, readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { practiceLedgerTotals, practiceRecoveredPeriods, casePatientBalance as reportRule } from '@tp/worker/ledger';
import { type JobContext, printRoiStatement, reconcileHandler } from '@tp/worker/runtime';
import type { Practice } from '@tp/worker/testing';
import type { TriageWorld } from '@tp/worker/testing/triage';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { LineCorrectionWords } from '../../components/reconciliation/display';
import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import { practiceRoute, selfRoute } from '../http/invoke';
import type { CookieJar, Outcome, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import { WEB_LOCK_TIMEOUT_MS } from '../server/lock-timeout';
import { lockLedger } from '../../../../worker/src/reconcile/ledger';
import { LedgerWorld, ledSettings } from '../../../../worker/src/reconcile/test-support/ledger-world';
import { casePatientBalance, reconciliation } from '../reconciliation/queries';
import { MemoryQueue } from '../uploads/queue';
import { practiceHome } from './practice';
import { matchClaimAction, matchDepositAction, matchPostingAction, reconciliationPage, reverseMatchAction, saveTemplateAction, templatePage } from './reconciliation';
import { generateRoiAction, roiStatementCsv, roiStatementPage, roiStatementPdf, roiStatementsPage } from './roi';
import { adjustEntryAction, ledgerReviewPage } from './specialist';
import { assignCaseAction } from './workbench';
import { casePage, casesPage, reopenLineAction, writeOffLineAction } from './triage';
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
    // Uploads open; while the organization is suspended its panel says they are paused, the database's sentence whole beneath (ux85-1, n7; docs/adr/0080).
    expect(page.upload.gate).toEqual({ open: true, title: null, reason: null });
    await w.owner.query("UPDATE organization SET status = 'suspended' WHERE id = $1", [practice.world.organizationId]);
    try {
      expect(ok(await call(reconciliationPage, practice.manager, P())).upload.gate).toEqual({
        open: false,
        title: 'Uploads are paused',
        reason: 'PaidWhole has suspended your organization, so no new work starts at this practice until PaidWhole reinstates your organization; everything here stays readable.',
      });
    } finally {
      await w.owner.query("UPDATE organization SET status = 'active' WHERE id = $1", [practice.world.organizationId]);
    }
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
    // HOM-01: to date since the first entry it sums, from the same read of the ledger as the quarter, each equal to
    // practiceLedgerTotals' own for all time and for the quarter. The line the recoupment reopened is back at
    // actionable on its pricing in effect: in the figure, on the home, on Cases and in a statement generated now.
    expect(home.headline.recoveredSince).toBe('2026-06-09');
    const { from, to } = home.recoveredQuarter;
    const [periods, toDate, quarter] = await withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, async (scope) => [
      await practiceRecoveredPeriods(scope, practice.practiceId, { from, to }),
      await practiceLedgerTotals(scope, practice.practiceId),
      await practiceLedgerTotals(scope, practice.practiceId, { from, to }),
    ] as const);
    expect([periods.toDate, periods.period]).toEqual([toDate, quarter]);
    // 3000 is the line's full variance, which is also what a packet built now asks; 1200 of it stands as recovered
    // (the remaining-ask follow-up in ADR 0082). Every surface carries the same figure.
    expect(home.headline.actionable).toEqual({ cents: '3000', lines: 1, outOfFigure: { movedOn: 0, stale: 0 } });
    expect(ok(await call(casesPage, practice.manager, P())).cases.map((item) => [item.actionableNowCents, item.actionableNowLines, item.openLines])).toEqual([['3000', 1, 1]]);
    // An ROI statement generated now carries the same figure for the cases still being worked, never the stored total.
    const statement = ok(await call(generateRoiAction, practice.manager, P(), { periodFrom: from, periodTo: to }));
    const { detail } = ok(await call(roiStatementPage, viewer, { ...P(), statementId: statement.objectId ?? '' }));
    expect([detail.actionableOpenCents, detail.actionableCases.length, detail.matches]).toEqual([home.headline.actionable.cents, 1, true]);
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
      billable: { billableCents: '600', allowedIncreaseCents: '3000', paymentIncreaseCents: '2400', otherReductionCents: '0', shareChangeCents: '600', reasons: { deductible: '0', coinsurance: '600', copay: '0', other: '0' }, allocation: null },
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
      billable: { billableCents: '3000', allowedIncreaseCents: '3000', paymentIncreaseCents: '0', otherReductionCents: '0', shareChangeCents: '3000', reasons: { deductible: '3000', coinsurance: '0', copay: '0', other: '0' }, allocation: null },
    });
    expect(line?.era).toEqual([expect.objectContaining({ outcome: 'approved', reading: 'patient_balance', allowed: 'higher', paymentIncreaseCents: '0' })]);
    expect(ok(await call(reconciliationPage, led.viewer, at)).linkage.items[0]?.correction).toMatchObject({ kind: 'patient_balance', billable: { billableCents: '3000', reasons: null } });
    // The case reads "Payer corrected; balance is the patient's" beside its state, which case_rules derives as ever (Q1).
    const shown = ok(await call(casePage, led.practice.manager, { ...at, caseId: led.caseId }));
    expect(shown.case.state).toBe('submitted');
    expect(shown.ledger).toMatchObject({ approvedCents: '0', recoveredCents: '0' });
    expect(shown.corrections).toMatchObject({ billableCents: '3000', patientBalance: true });
  });

  it('reads a correction the deductible took only in part as the patient’s 20.00 beside the payer’s own 10.00 reduction, never the whole 30.00 (LED-15 mixed, UX-1)', async () => {
    const led = await ledPractice('LED-15');
    await ledger.load(led.practice, 'LED-15/mixed-adjusted.835');
    await ledger.reconcile(led.practice);
    const at = { practiceId: led.practice.practiceId };
    const page = ok(await call(reconciliationPage, led.practice.manager, at));
    expect(page.totals).toMatchObject({ approvedCents: '0', payerApprovedCents: '0', recoveredCents: '0' });
    const [line] = page.linkage.items;
    expect(line).toMatchObject({ entries: [], shortfallCents: null });
    expect(line?.correction).toEqual({
      kind: 'patient_balance',
      billable: { billableCents: '2000', allowedIncreaseCents: '3000', paymentIncreaseCents: '0', otherReductionCents: '1000', shareChangeCents: '2000', reasons: { deductible: '2000', coinsurance: '0', copay: '0', other: '0' }, allocation: null },
    });
    // The words a billing manager reads: the patient's 20.00, and the payer's 10.00 apart from it, not billable.
    const shown = renderToStaticMarkup(createElement(LineCorrectionWords, { correction: line?.correction })).replace(/<[^>]+>/g, '').replaceAll('&#x27;', '’');
    expect(shown).toContain('Billable to the patient: $20.00 (deductible\u00a0+$20.00).');
    expect(shown).toContain('pays nothing more: $20.00 is the patient’s share, and $10.00 was reduced by the payer for other reasons, not billable.');
    expect(shown).not.toContain('took all of it');
    const shownCase = ok(await call(casePage, led.practice.manager, { ...at, caseId: led.caseId }));
    expect(shownCase.corrections).toMatchObject({ billableCents: '2000', patientBalance: true });
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

/**
 * CAS-56 (docs/adr/0092): no web request waits on the practice's ledger lock. A reconcile pass holds the lock for its
 * whole transaction (minutes at real size), and so does another person's ledger action for its own; the write-off, the
 * reopen and the five manual reconciliation actions take it only if it is free. Here a second session holds the lock as
 * a pass does (the worker's own lockLedger, in a job scope) while each of the seven actions is sent with input its
 * schema accepts, by a person allowed to send it: each answers `busy` at once, names nothing, and writes nothing (no
 * row of the practice, no audit event, no request key: the same key sent again once the lock is free is taken as new).
 * With the lock free the same people's actions go through and write what they always wrote. A person's own action in
 * flight holds the lock the same way: a second person's action sent meanwhile is refused, never queued behind it.
 * Synthetic data only.
 */
describe('no web request waits on the ledger lock (CAS-56)', () => {
  /** Holds the practice's ledger lock in a job scope, as a pass holds it, until released. */
  async function holdLedger(): Promise<{ readonly release: () => Promise<void> }> {
    let release = (): void => undefined;
    const until = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = (): void => undefined;
    const taken = new Promise<void>((resolve) => {
      held = resolve;
    });
    const holding = withJobScope(w.pricing.worker, { jobId: randomUUID(), practiceId: practice.practiceId }, async (scope) => {
      await lockLedger(scope, practice.practiceId);
      held();
      await until;
    });
    // A holder that fails before it holds fails the test with its own error, never by a silent wait.
    await Promise.race([taken, holding]);
    return {
      release: async () => {
        release();
        await holding;
      },
    };
  }

  /** Every row of the practice a ledger action can write, and the audit events and request keys of its requests, as counts. */
  async function written(): Promise<Record<string, string>> {
    const counts: Record<string, string> = {};
    for (const table of ['ledger_match', 'ledger_entry', 'line_status', 'payer_response', 'notification', 'audit_event']) {
      const { rows } = await w.owner.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table} WHERE practice_id = $1`, [practice.practiceId]);
      counts[table] = rows[0]?.n ?? '';
    }
    // The request keys of the two people who send the actions (the table is per person, not per practice).
    const keys = await w.owner.query<{ n: string }>('SELECT count(*)::text AS n FROM mutation_request WHERE user_id = ANY ($1::uuid[])', [[practice.manager, w.pricing.specialist]]);
    counts.mutation_request = keys.rows[0]?.n ?? '';
    // The cases' own rows, which the refreshes of a case line, a stage event and a response rewrite.
    const cases = await w.owner.query<{ state: string }>(`SELECT string_agg(id::text || ':' || updated_at::text, ',' ORDER BY id) AS state FROM "case" WHERE practice_id = $1`, [practice.practiceId]);
    counts.case = cases.rows[0]?.state ?? '';
    const { rows } = await w.owner.query<{ state: string }>(
      "SELECT string_agg(id::text || ':' || coalesce(written_off_reason, '') || ':' || (reopen_reason IS NOT NULL)::text, ',' ORDER BY id) AS state FROM case_line WHERE practice_id = $1",
      [practice.practiceId],
    );
    counts.case_line = rows[0]?.state ?? '';
    const reversed = await w.owner.query<{ n: string }>('SELECT count(*)::text AS n FROM ledger_match WHERE practice_id = $1 AND reversed_at IS NOT NULL', [practice.practiceId]);
    counts.reversed = reversed.rows[0]?.n ?? '';
    return counts;
  }

  it('refuses each of the seven actions at once while the lock is held, writing nothing, and lets them through once it is free', async () => {
    const page = ok(await call(reconciliationPage, practice.manager, P()));
    const standing = page.linkage.items.flatMap((item) => item.deposits).find((deposit) => deposit.standing);
    expect(standing).toBeDefined();
    const [caseLine] = (await w.owner.query<{ id: string }>('SELECT id FROM case_line WHERE practice_id = $1 AND written_off_reason IS NULL ORDER BY id', [practice.practiceId])).rows;
    expect(caseLine).toBeDefined();
    const specialist = w.pricing.specialist;
    // The reversal carries one request key throughout: refused under the lock, the same key is still unused afterwards.
    const reverse = { matchId: standing?.id, reason: 'SYNTHETIC matched by mistake', confirm: 'on', requestKey: randomUUID() };
    const writeOff = { caseLineId: caseLine?.id, reason: 'not_worth_pursuit', text: '', confirm: 'on' };
    const reopen = { caseLineId: caseLine?.id, reason: 'SYNTHETIC reopen: the payer asked for it again' };
    const actions: readonly (readonly [string, () => Promise<Outcome<unknown>>])[] = [
      ['match a posting', () => call(matchPostingAction, practice.manager, P(), { postingRowId: randomUUID(), remittanceId: randomUUID() })],
      ['match a deposit', () => call(matchDepositAction, practice.manager, P(), { eftRowId: randomUUID(), remittanceId: randomUUID() })],
      ['match a claim', () => call(matchClaimAction, practice.manager, P(), { claimId: randomUUID(), serviceLineId: randomUUID() })],
      ['reverse a match', () => call(reverseMatchAction, practice.manager, P(), reverse)],
      ['adjust an entry', () => call(adjustEntryAction, specialist, P(), { entryId: randomUUID(), amount: '5.00', reason: 'SYNTHETIC specialist review', confirm: 'on' })],
      ['write a line off', () => call(writeOffLineAction, practice.manager, P(), writeOff)],
      ['reopen a line', () => call(reopenLineAction, practice.manager, P(), reopen)],
    ];
    const before = await written();
    const holder = await holdLedger();
    try {
      for (const [name, send] of actions) {
        const started = performance.now();
        const outcome = await send();
        // The whole outcome: a status and its closed word, so no identifier and no word of what holds the lock.
        expect(outcome, name).toEqual({ status: 'busy', what: 'ledger' });
        // The whole request (session, keys, the lock, the rollback), on a loaded runner too; a wait on the lock would
        // last until the holder lets go, which it does only after this loop.
        expect(performance.now() - started, `${name}: answered at once, never after a wait`).toBeLessThan(2_000);
      }
      expect(await written()).toEqual(before);
    } finally {
      await holder.release();
    }
    // The lock free: the reversal, the write-off and the reopen that were refused now go through, as sent. The
    // reversal's request key is the one its refused attempt carried: taken as new (a refusal that had kept the key
    // would answer `duplicate` here), and written now.
    const lineOf = async () =>
      (await w.owner.query<{ written_off_reason: string | null; reopened: boolean }>('SELECT written_off_reason, reopen_reason IS NOT NULL AS reopened FROM case_line WHERE id = $1', [caseLine?.id])).rows[0];
    const depositedBefore = ok(await call(reconciliationPage, practice.manager, P())).totals.depositedCents;
    expect(depositedBefore).not.toBe('0');
    expect(ok(await call(reverseMatchAction, practice.manager, P(), reverse)).redirect).toBe(`/p/${practice.practiceId}/reconciliation?notice=reversed`);
    const reversed = await written();
    expect(Number(reversed.reversed)).toBe(Number(before.reversed) + 1);
    expect(Number(reversed.mutation_request)).toBe(Number(before.mutation_request) + 1);
    // The reversal's entries net the deposit to zero, as LED-07's reversal does.
    expect(Number(reversed.ledger_entry)).toBeGreaterThan(Number(before.ledger_entry));
    expect(ok(await call(reconciliationPage, practice.manager, P())).totals.depositedCents).toBe('0');
    expect(ok(await call(writeOffLineAction, practice.manager, P(), writeOff)).objectId).toBe(caseLine?.id);
    expect(await lineOf()).toEqual({ written_off_reason: 'not_worth_pursuit', reopened: false });
    expect(ok(await call(reopenLineAction, practice.manager, P(), reopen)).objectId).toBe(caseLine?.id);
    expect(await lineOf()).toEqual({ written_off_reason: null, reopened: true });
    const after = await written();
    // The reopen's stage event, in the person's name, from the stage the line was at.
    const reopenEvents = await w.owner.query<{ n: string }>('SELECT count(*)::text AS n FROM line_status WHERE practice_id = $1 AND reopened_from IS NOT NULL AND set_by = $2', [practice.practiceId, practice.manager]);
    expect(Number(after.line_status)).toBeGreaterThan(Number(reversed.line_status));
    expect(Number(reopenEvents.rows[0]?.n)).toBeGreaterThanOrEqual(1);
    expect(Number(after.audit_event)).toBeGreaterThanOrEqual(Number(before.audit_event) + 3);
    expect(Number(after.mutation_request)).toBe(Number(before.mutation_request) + 3);
    // And the ones sent with ids that name nothing are refused for that, no longer for the lock.
    expect((await call(matchDepositAction, practice.manager, P(), { eftRowId: randomUUID(), remittanceId: randomUUID() })).status).toBe('not_found');
  }, 60_000);

  it('holds the lock to the action’s commit: a second person’s action sent while the first is in flight is refused, not queued', async () => {
    // The first person's action, held right after its request's transaction took the lock (the statement begin() issues)
    // and before it commits: the second person's action is sent from there, on the plain services.
    let second: Outcome<unknown> | undefined;
    const inFlight = committingMidRead('pg_try_advisory_xact_lock', async () => {
      second = await call(matchPostingAction, practice.manager, P(), { postingRowId: randomUUID(), remittanceId: randomUUID() });
    });
    const first = await call(matchDepositAction, practice.manager, P(), { eftRowId: randomUUID(), remittanceId: randomUUID() }, inFlight);
    // The first held the lock and went on to its own answer (its ids name nothing); the second met the lock.
    expect(first.status).toBe('not_found');
    expect(second).toEqual({ status: 'busy', what: 'ledger' });
    // The first committed or rolled back, so the lock is free again.
    expect((await call(matchPostingAction, practice.manager, P(), { postingRowId: randomUUID(), remittanceId: randomUUID() })).status).toBe('not_found');
  }, 30_000);
});

/**
 * CAS-57 (docs/adr/0092, the amendment of 2026-11-11): no web mutation waits on a row a reconcile pass holds. A pass
 * keeps, to its commit, the case rows of the lines it writes for, and a request that rewrites such a row (assigning the
 * case here: its activity's trigger sets the case's owner) used to wait for the whole pass on one of the web's
 * connections. Every transaction the routes' wrapper opens now bounds its lock waits (invoke.ts, gates;
 * server/lock-timeout.ts), so the wait ends after three seconds and the request is answered `busy`, with the closed
 * word `records`, writing nothing. Here a second session holds what a pass, a first request or a schema change would,
 * and the request is refused in about the timeout; with the lock free the same request, under the same request key,
 * goes through. Synthetic data only.
 */
describe('no web mutation waits on a row a reconcile pass holds (CAS-57)', () => {
  /** What the routes logged as a warning: a refusal is logged by its code and the request's own ID alone. */
  const logged: { readonly message: string; readonly fields: unknown }[] = [];
  let web: Services;

  beforeAll(() => {
    const quiet = createLogger();
    web = {
      ...services,
      logger: {
        debug: (message, fields) => quiet.debug(message, fields),
        info: (message, fields) => quiet.info(message, fields),
        warn: (message, fields) => {
          logged.push({ message, fields });
        },
        error: (message, fields) => quiet.error(message, fields),
        child: (fields) => quiet.child(fields),
      },
    };
  });

  /**
   * Holds what the statements lock in an open transaction of a session of its own (the owner's login: only the lock
   * matters here, not who holds it), until released by a rollback or a commit. It lets go by itself five seconds after
   * the timeouts it must outlast, so a regression that waits for the holder fails its assertions instead of hanging
   * the file with the transaction open.
   */
  async function holding(statements: readonly (readonly [string, readonly unknown[]])[], timeouts = 1): Promise<{ readonly release: (how?: 'ROLLBACK' | 'COMMIT') => Promise<void> }> {
    const client = databaseClient(w.pricing.database.url);
    await client.connect();
    try {
      await client.query('BEGIN');
      for (const [statement, values] of statements) {
        const held = await client.query(statement, [...values]);
        // A row locked or written, or a statement that returns none (LOCK TABLE).
        expect(held.rowCount ?? 1).toBeGreaterThanOrEqual(1);
      }
    } catch (error) {
      await client.end();
      throw error;
    }
    let released = false;
    const release = async (how: 'ROLLBACK' | 'COMMIT' = 'ROLLBACK'): Promise<void> => {
      if (released) {
        return;
      }
      released = true;
      clearTimeout(failSafe);
      await client.query(how);
      await client.end();
    };
    const failSafe = setTimeout(
      () => {
        release().catch(() => undefined);
      },
      timeouts * WEB_LOCK_TIMEOUT_MS + 5_000,
    );
    return { release };
  }

  /**
   * The case's row as a pass holds it: a pass that wrote a stage event for one of the case's lines updated the row
   * without changing its key, which is the lock FOR NO KEY UPDATE takes. No column changes here, so nothing to undo
   * and nothing for the counts below to see. (FOR UPDATE would be a stronger lock than a pass's, and would stop the
   * request one statement earlier, at its activity's foreign key.)
   */
  const holdCase = () => holding([['SELECT 1 FROM "case" WHERE id = $1 FOR NO KEY UPDATE', [caseId]]]);

  /**
   * A first request with this key, part way through: the key's lock taken as claimRequestKey takes it (the request
   * keys' own class, "REQK", and the person's ID with the key as a uuid's text) and the key written, its transaction
   * still open.
   */
  const firstRequest = (requestKey: string) =>
    holding([
      ["SELECT pg_advisory_xact_lock($1, hashtext($2::text || ':' || $3::uuid::text))", [0x5245514b, practice.manager, requestKey]],
      ['INSERT INTO mutation_request (user_id, request_key, route_id) VALUES ($1, $2, $3)', [practice.manager, requestKey, assignCaseAction.id]],
    ]);

  /** How long a call took, with what it answered. */
  async function timed<R>(run: () => Promise<R>): Promise<{ readonly answer: R; readonly waited: number }> {
    const started = performance.now();
    const answer = await run();
    return { answer, waited: performance.now() - started };
  }

  /** It waited for the timeout (the lock really was held) and no longer (the holder lets go only after this). */
  const waitedTheTimeout = (waited: number): void => {
    expect(waited).toBeGreaterThanOrEqual(WEB_LOCK_TIMEOUT_MS - 250);
    expect(waited).toBeLessThan(WEB_LOCK_TIMEOUT_MS + 4_000);
  };

  const state = async () => {
    const activity = await w.owner.query<{ n: string }>('SELECT count(*)::text AS n FROM case_activity WHERE practice_id = $1', [practice.practiceId]);
    const audit = await w.owner.query<{ n: string }>('SELECT count(*)::text AS n FROM audit_event WHERE practice_id = $1', [practice.practiceId]);
    const keys = await w.owner.query<{ n: string }>('SELECT count(*)::text AS n FROM mutation_request WHERE user_id = $1', [practice.manager]);
    const owner = await w.owner.query<{ owner_user_id: string | null }>('SELECT owner_user_id FROM "case" WHERE id = $1', [caseId]);
    return { activity: activity.rows[0]?.n, audit: audit.rows[0]?.n, keys: keys.rows[0]?.n, owner: owner.rows[0]?.owner_user_id ?? null };
  };

  /** The one line a refusal logs: its code and the request's own ID, and nothing of pg's words. */
  const loggedOnce = (code: string): void => {
    expect(logged).toHaveLength(1);
    expect(Object.keys(logged[0]?.fields as object).sort()).toEqual(['error_code', 'request_id']);
    expect(logged[0]?.fields).toMatchObject({ error_code: code });
    expect(logged[0]?.message).not.toMatch(/relation|tuple|statement|canceling/);
    logged.length = 0;
  };

  it('bounds the lock waits of every transaction a route runs in, and of that transaction only', async () => {
    const shown = async ({ scope }: { readonly scope: { readonly client: ScopeClient } }) => (await scope.client.query<{ lock_timeout: string }>('SHOW lock_timeout')).rows[0]?.lock_timeout;
    const ofPractice = practiceRoute({ id: 'test.cas57.practice', kind: 'page', path: '/p/[practiceId]/test', phi: true, permission: 'practice.open', params: z.object({ practiceId: z.uuid() }), handle: shown });
    const ofPerson = selfRoute({ id: 'test.cas57.self', kind: 'page', path: '/test', phi: false, params: z.object({}), handle: shown });
    const timeout = `${String(WEB_LOCK_TIMEOUT_MS / 1000)}s`;
    expect(ok(await call(ofPractice, practice.manager, P(), undefined, web))).toBe(timeout);
    expect(ok(await call(ofPerson, practice.manager, {}, undefined, web))).toBe(timeout);
    // Not a setting of the pool's connections: outside a route's transaction (sign-in, the session's read, the rate
    // limit, a job) a statement on the same pool waits as it always has.
    const clients = await Promise.all([w.app.connect(), w.app.connect(), w.app.connect()]);
    try {
      for (const client of clients) {
        expect((await client.query<{ lock_timeout: string }>('SHOW lock_timeout')).rows[0]?.lock_timeout).toBe('0');
      }
    } finally {
      for (const client of clients) {
        client.release();
      }
    }
  });

  it('answers busy after the timeout, never after the holder, writes nothing, and goes through once the row is free', async () => {
    const assign = { caseId, ownerUserId: practice.manager, requestKey: randomUUID() };
    const before = await state();
    logged.length = 0;
    const holder = await holdCase();
    try {
      const { answer, waited } = await timed(() => call(assignCaseAction, practice.manager, P(), assign, web));
      // A status and its closed word: no identifier, and no word of what holds the row.
      expect(answer).toEqual({ status: 'busy', what: 'records' });
      waitedTheTimeout(waited);
      expect(await state()).toEqual(before);
      loggedOnce('LOCK_TIMEOUT');
    } finally {
      await holder.release();
    }
    // The row free: the same assignment under the same request key goes through (the refusal kept no key).
    expect(ok(await call(assignCaseAction, practice.manager, P(), assign, web)).objectId).toBe(caseId);
    const after = await state();
    expect(after.owner).toBe(practice.manager);
    expect(Number(after.activity)).toBe(Number(before.activity) + 1);
    expect(Number(after.keys)).toBe(Number(before.keys) + 1);
    expect(logged).toEqual([]);
  }, 60_000);

  it('answers the same request key sent while its first request is still running as already sent and still being processed, and as already sent once the first has saved', async () => {
    const assign = { caseId, ownerUserId: '', requestKey: randomUUID() };
    const before = await state();
    logged.length = 0;
    // The first request, part way through: its key's lock taken and its key written, its transaction still open.
    const first = await firstRequest(assign.requestKey);
    try {
      const { answer, waited } = await timed(() => call(assignCaseAction, practice.manager, P(), assign, web));
      // Never "nothing was saved": the first may yet save. The closed word alone, and nothing written by this one.
      expect(answer).toEqual({ status: 'busy', what: 'request' });
      waitedTheTimeout(waited);
      expect(await state()).toEqual(before);
      loggedOnce('REQUEST_STILL_RUNNING');
    } finally {
      // The first request saves.
      await first.release('COMMIT');
    }
    expect(await call(assignCaseAction, practice.manager, P(), assign, web)).toEqual({ status: 'duplicate' });
    const after = await state();
    expect({ ...after, keys: before.keys }).toEqual(before);
    expect(Number(after.keys)).toBe(Number(before.keys) + 1);
  }, 60_000);

  it('calls only the same key still running "already sent": another lock met as the key is written (the table, behind a schema change) is the records’ refusal', async () => {
    const assign = { caseId, ownerUserId: '', requestKey: randomUUID() };
    const before = await state();
    logged.length = 0;
    // What a schema change queued behind a long request amounts to for every later one: the table cannot be written.
    const holder = await holding([['LOCK TABLE mutation_request IN SHARE MODE', []]]);
    try {
      const { answer, waited } = await timed(() => call(assignCaseAction, practice.manager, P(), assign, web));
      expect(answer).toEqual({ status: 'busy', what: 'records' });
      waitedTheTimeout(waited);
      expect(await state()).toEqual(before);
      loggedOnce('LOCK_TIMEOUT');
    } finally {
      await holder.release();
    }
    // The table free: the same request under the same key goes through.
    expect(ok(await call(assignCaseAction, practice.manager, P(), assign, web)).objectId).toBe(caseId);
  }, 60_000);

  it('refuses a page’s read the same way when it waits on a lock (a table behind a schema change): its adapter shows the error state, never "not found"', async () => {
    logged.length = 0;
    expect((await call(casePage, practice.manager, { ...P(), caseId }, undefined, web)).status).toBe('ok');
    const holder = await holding([['LOCK TABLE "case" IN ACCESS EXCLUSIVE MODE', []]]);
    try {
      const { answer, waited } = await timed(() => call(casePage, practice.manager, { ...P(), caseId }, undefined, web));
      expect(answer).toEqual({ status: 'busy', what: 'records' });
      waitedTheTimeout(waited);
      loggedOnce('LOCK_TIMEOUT');
    } finally {
      await holder.release();
    }
    expect((await call(casePage, practice.manager, { ...P(), caseId }, undefined, web)).status).toBe('ok');
  }, 60_000);

  it('waits for a first request that ends inside the timeout, and answers by how it ended: already sent where it saved, done where it was rolled back', async () => {
    logged.length = 0;
    for (const [end, expected] of [
      ['COMMIT', 'duplicate'],
      ['ROLLBACK', 'ok'],
    ] as const) {
      const assign = { caseId, ownerUserId: '', requestKey: randomUUID() };
      const first = await firstRequest(assign.requestKey);
      // The first request ends half a second in.
      const ending = setTimeout(() => {
        first.release(end).catch(() => undefined);
      }, 500);
      try {
        const { answer, waited } = await timed(() => call(assignCaseAction, practice.manager, P(), assign, web));
        expect(answer.status).toBe(expected);
        // It waited for the first, and not for the timeout.
        expect(waited).toBeGreaterThanOrEqual(400);
        expect(waited).toBeLessThan(WEB_LOCK_TIMEOUT_MS);
      } finally {
        clearTimeout(ending);
        await first.release(end);
      }
    }
    // Neither was refused: nothing is logged.
    expect(logged).toEqual([]);
  }, 60_000);

  it('bounds the scope’s own opening read too: a request that waits there (a table of the permission read behind a schema change) is refused the same way', async () => {
    const assign = { caseId, ownerUserId: '', requestKey: randomUUID() };
    const before = await state();
    logged.length = 0;
    const holder = await holding([['LOCK TABLE practice IN ACCESS EXCLUSIVE MODE', []]]);
    try {
      const { answer, waited } = await timed(() => call(assignCaseAction, practice.manager, P(), assign, web));
      expect(answer).toEqual({ status: 'busy', what: 'records' });
      waitedTheTimeout(waited);
      loggedOnce('LOCK_TIMEOUT');
    } finally {
      await holder.release();
    }
    expect(await state()).toEqual(before);
    expect(ok(await call(assignCaseAction, practice.manager, P(), assign, web)).objectId).toBe(caseId);
  }, 60_000);
});
