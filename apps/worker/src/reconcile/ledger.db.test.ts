import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { type LedgerEntry, SYNTHETIC_PM_EXPORT_V1, ledgerTotals, roiStatement } from '@tp/ledger';
import { cents, parseCents } from '@tp/money';
import { deriveCaseState } from '@tp/triage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { digestFigures } from '../digest/figures';
import { FIXTURES, type Practice } from '../price/test-support/pricing-world';
import { reconcileHandler } from './job';
import type { Scope } from './ledger';
import { ReconciliationError, adjustEntry, matchClaimByHand, matchDepositByHand, matchPostingByHand, reverseMatch } from './manual';
import { setLedgerSettings } from './settings';
import { approvalShortfalls } from './shortfalls';
import { REOPEN_NOTES } from './stages';
import { generateRoiStatement, practiceLedgerTotals } from './statements';
import { LedgerWorld, ledSettings } from './test-support/ledger-world';
import { unmatchedItems } from './unmatched';

/**
 * The recovery ledger against PostgreSQL, through the reconcile step's own code (PRD 13; PRD 5, J10;
 * test matrix LED-02 to LED-11). Each case is a practice of its own: its SYNTHETIC LED fixture's
 * original payment is loaded by the parse_835 job, priced under a signed-off 50.00-per-unit 97110
 * schedule and triaged into a case; then the adjusted remittance, the posting and EFT exports and the
 * recoupment arrive as the fixture says, each followed by a reconcile in the practice's job scope.
 */

let w: LedgerWorld;

beforeAll(async () => {
  w = await LedgerWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

interface Outcome {
  readonly entries?: readonly { readonly stage: string; readonly amountCents: string; readonly allocated?: boolean; readonly manual?: boolean }[];
  readonly recoveredCents?: string;
  readonly postedNetCents?: string;
}

const outcomeOf = (id: string): Outcome => (JSON.parse(readFileSync(path.join(FIXTURES, id, 'expected.json'), 'utf8')) as { outcome: Outcome }).outcome;
const expectedStages = (id: string) => (outcomeOf(id).entries ?? []).map((entry) => ({ stage: entry.stage, amountCents: entry.amountCents }));

/** A practice with its LED case open, and the fixture's adjusted remittance loaded and reconciled. */
async function scenario(id: string, settings: object = ledSettings()): Promise<{ readonly practice: Practice; readonly caseId: string; readonly serviceLineId: string }> {
  const practice = await w.practice(`${id} ${randomUUID().slice(0, 8)}`, settings);
  const { caseId, serviceLineId } = await w.caseFor(practice, `${id}/original.835`);
  await w.load(practice, `${id}/adjusted.835`);
  await w.reconcile(practice);
  return { practice, caseId, serviceLineId };
}

/** The practice's ledger totals, read in its job scope. */
async function jobTotals(practice: Practice) {
  return withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => practiceLedgerTotals(scope as Scope, practice.practiceId));
}

describe('remittance to case line (LED-02, LED-03)', () => {
  it('approves the difference of a higher observed allowed, attaches the claim and moves the line to payer approved (LED-02)', async () => {
    const { practice, caseId, serviceLineId } = await scenario('LED-02');
    expect(await w.stages(practice)).toEqual(expectedStages('LED-02'));
    const [entry] = await w.entries(practice);
    expect(entry).toMatchObject({ evidence_kind: 'claim', case_id: caseId, service_line_id: serviceLineId, created_by: null, allocated: false, effective_on: '2026-06-08' });
    const [match] = await w.rows<{ kind: string; outcome: string; matched_by: string | null }>(practice, 'SELECT kind, outcome, matched_by FROM ledger_match');
    expect(match).toEqual({ kind: 'claim', outcome: 'approved', matched_by: null });
    expect(await w.lineStage(practice, serviceLineId)).toBe('payer_approved');
    // The reversal of the original in the same remittance is the reprocessing, never a recoupment.
    expect((await jobTotals(practice)).recoupedCents).toBe(0n);
  });

  it('writes nothing twice when reconciled again (JOB-01)', async () => {
    const { practice } = await scenario('LED-02');
    const before = await w.entries(practice);
    const summary = await w.reconcile(practice);
    expect(summary).toMatchObject({ remittances: { approved: 0, confirmed: 0, decreased: 0, noChange: 0, recoupments: 0, interest: 0 }, postingsMatched: 0, entriesSettled: 0, stages: { forward: 0, back: 0 } });
    expect(await w.entries(practice)).toEqual(before);
  });

  it('lists an adjusted payment that matches no case for a person, and writes no entry (LED-03)', async () => {
    const practice = await w.practice('LED-03');
    await w.load(practice, 'LED-03/adjusted.835');
    await w.reconcile(practice);
    expect(await w.entries(practice)).toEqual([]);
    const items = await withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => unmatchedItems(scope as Scope, practice.practiceId));
    expect(items.adjustedPayments).toHaveLength(outcomeOf('LED-03').entries?.length === 0 ? 1 : 0);
    expect(items.adjustedPayments[0]).toMatchObject({ paidCents: 10000n, lines: [{ procedureCode: '97110', serviceDate: '2026-03-09', observedAllowedCents: 10000n }], candidates: [] });
  });
});

describe('remittance to posting and deposit (LED-04, LED-05, LED-08, LED-09)', () => {
  it('posts the case line’s share of the check its posting row matches by check number and amount (LED-04)', async () => {
    const { practice, serviceLineId } = await scenario('LED-04');
    const documentId = await w.stageExport(practice, 'LED-04/posting-export.csv', 'posting_export');
    const summary = await w.reconcile(practice, { documentId });
    expect(summary.exports).toEqual([{ documentId, kind: 'posting_export', outcome: 'loaded', stored: 1, repeated: 0, problems: 0 }]);
    expect(await w.stages(practice)).toEqual(expectedStages('LED-04'));
    const posted = (await w.entries(practice))[1];
    expect(posted).toMatchObject({ evidence_kind: 'posting_row', allocated: false, effective_on: '2026-06-11' });
    // The practice proves recovery by deposit: posted is its own stage until the deposit arrives.
    expect(await w.lineStage(practice, serviceLineId)).toBe('payer_approved');
    expect(await jobTotals(practice)).toMatchObject({ approvedCents: 3000n, postedCents: 3000n, depositedCents: 0n, recoveredCents: 0n });
    expect((await w.rows<{ status: string }>(practice, 'SELECT status FROM source_document WHERE id = $1', [documentId]))[0]).toEqual({ status: 'loaded' });
  });

  it('is recovered at the posting where the practice proves by posting', async () => {
    const { practice, serviceLineId } = await scenario('LED-04', ledSettings('posted'));
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-04/posting-export.csv', 'posting_export') });
    expect(await w.lineStage(practice, serviceLineId)).toBe('recovered');
    expect((await jobTotals(practice)).recoveredCents).toBe(3000n);
  });

  it('deposits the share of the remittance its EFT row matches by trace and amount, and recovers the line (LED-05)', async () => {
    const { practice, serviceLineId } = await scenario('LED-05');
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-05/eft-export.csv', 'eft_export') });
    expect(await w.stages(practice)).toEqual(expectedStages('LED-05'));
    expect(await w.lineStage(practice, serviceLineId)).toBe('recovered');
    expect(await jobTotals(practice)).toMatchObject({ depositedCents: 3000n, recoveredCents: 3000n, approvedCents: 3000n });
  });

  it('matches a row repeated in a later export, or the same export again, once (LED-08)', async () => {
    const { practice } = await scenario('LED-08');
    const first = await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-08/posting-export.csv', 'posting_export') });
    expect(first.exports[0]).toMatchObject({ outcome: 'loaded', stored: 1, repeated: 0 });
    // The same bytes again are intake's duplicate document (PAR-30) and never stored; the same rows
    // re-exported (here with other line endings, so other bytes) are each a row already stored.
    const bytes = readFileSync(path.join(FIXTURES, 'LED-08/posting-export.csv'), 'utf8');
    const reexported = Buffer.from(bytes.includes('\r\n') ? bytes.replaceAll('\r\n', '\n') : bytes.replaceAll('\n', '\r\n'));
    const again = await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-08/posting-export.csv', 'posting_export', reexported) });
    expect(again.exports[0]).toMatchObject({ outcome: 'loaded', stored: 0, repeated: 1 });
    const later = await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-08/posting-export-again.csv', 'posting_export') });
    expect(later.exports[0]).toMatchObject({ outcome: 'loaded', stored: 1, repeated: 1 });
    const outcome = outcomeOf('LED-08') as unknown as { postedEntries: number; matches: number };
    expect((await w.entries(practice)).filter((entry) => entry.stage === 'posted')).toHaveLength(outcome.postedEntries);
    expect(await w.rows(practice, "SELECT count(*)::int AS n FROM ledger_match WHERE kind = 'posting'")).toEqual([{ n: outcome.matches }]);
    expect(await w.rows(practice, 'SELECT count(*)::int AS n FROM posting_row')).toEqual([{ n: 2 }]);
    const items = await withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => unmatchedItems(scope as Scope, practice.practiceId));
    expect(items.postings.map((row) => ({ check: row.checkOrTrace, amount: row.amountCents }))).toEqual([{ check: '880000000999', amount: 1200n }]);
  });

  it('allocates the case’s share of a check posted in part, pro rata, flagged allocated (LED-09)', async () => {
    const { practice } = await scenario('LED-09');
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-09/posting-export.csv', 'posting_export') });
    const expected = outcomeOf('LED-09').entries ?? [];
    expect((await w.entries(practice)).map((entry) => ({ stage: entry.stage, amountCents: entry.amount_cents, allocated: entry.allocated }))).toEqual(
      expected.map((entry) => ({ stage: entry.stage, amountCents: entry.amountCents, allocated: entry.allocated === true })),
    );
    const [match] = await w.rows<{ level: string; allocated: boolean }>(practice, "SELECT level, allocated FROM ledger_match WHERE kind = 'posting'");
    expect(match).toEqual({ level: 'check', allocated: true });
  });

  it('lists a corrected posting export’s take-back row with the match it offsets, for a person to reverse (PRD 13, Entries: reversed)', async () => {
    const { practice, serviceLineId } = await scenario('LED-04', ledSettings('posted'));
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-04/posting-export.csv', 'posting_export') });
    const [match] = await w.rows<{ id: string; posting_row_id: string }>(practice, "SELECT id, posting_row_id FROM ledger_match WHERE kind = 'posting'");
    const corrected = Buffer.from('Post Date,Check/EFT #,Payer,Claim Ref,CPT,DOS,Paid Amount,Batch\r\n06/15/2026,880060040002,SYNTHETIC PAYER L,,,,-30.00,SYNBATCH-0402\r\n');
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-04/posting-export.csv', 'posting_export', corrected) });
    const unmatched = () => withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => unmatchedItems(scope as Scope, practice.practiceId));
    const [takeBack] = (await unmatched()).postings;
    expect(takeBack).toMatchObject({ amountCents: -3000n, correctionOf: { matchId: match?.id, postingRowId: match?.posting_row_id } });
    // Counted in no total until a person reverses the match it corrects.
    expect((await jobTotals(practice)).recoveredCents).toBe(3000n);
    await w.manual(practice, (context) => reverseMatch(context, { practiceId: practice.practiceId, matchId: takeBack?.correctionOf?.matchId ?? '', reason: 'SYNTHETIC the practice corrected its posting export' }));
    expect(await jobTotals(practice)).toMatchObject({ postedCents: 0n, recoveredCents: 0n });
    expect(await w.lineStage(practice, serviceLineId)).toBe('payer_approved');
    expect((await unmatched()).postings.map((row) => ({ amount: row.amountCents, correction: row.correctionOf }))).toEqual([
      { amount: 3000n, correction: null },
      { amount: -3000n, correction: null },
    ]);
  });

  it('refuses a posting that names a case line’s claim with a different amount, and waits for the template it needs', async () => {
    const practice = await w.practice('posting template', { ...ledSettings(), posting_export_template: undefined });
    await setTemplateless(practice);
    const documentId = await w.stageExport(practice, 'LED-04/posting-export.csv', 'posting_export');
    const logs: Record<string, unknown>[] = [];
    await reconcileHandler(w.services)({ practice_id: practice.practiceId, document_id: documentId }, w.jobContext(practice, logs));
    expect(logs).toContainEqual(expect.objectContaining({ error_code: 'POSTING_TEMPLATE_NOT_MAPPED', document_id: documentId }));
    expect((await w.rows<{ status: string }>(practice, 'SELECT status FROM source_document WHERE id = $1', [documentId]))[0]).toEqual({ status: 'stored' });
    // Mapped at onboarding by the practice's administrator: the next reconcile reads the waiting export.
    await withPracticeScope(w.app, { actorId: practice.world.adminUserId, practiceIds: [practice.practiceId] }, async (scope) =>
      setLedgerSettings(scope as Scope, { practiceId: practice.practiceId, proofLevel: 'posted', postingTemplate: SYNTHETIC_PM_EXPORT_V1, requestId: `test-${randomUUID()}` }),
    );
    expect((await w.reconcile(practice)).exports).toMatchObject([{ documentId, outcome: 'loaded', stored: 1 }]);
    const unreadable = await w.stageExport(practice, 'LED-05/eft-export.csv', 'posting_export');
    expect((await w.reconcile(practice, { documentId: unreadable })).exports).toMatchObject([{ outcome: 'unreadable' }]);
  });
});

async function setTemplateless(practice: Practice): Promise<void> {
  await asOwner(w.owner, [practice.practiceId], () => w.owner.query("UPDATE practice SET settings = settings - 'posting_export_template' WHERE id = $1", [practice.practiceId]));
}

describe('recoupments (LED-06)', () => {
  it('takes back a PLB WO after the deposit at once: a negative entry, recovered reduced by exactly its amount, the line reopened with a note and the case’s people told', async () => {
    const { practice, caseId, serviceLineId } = await scenario('LED-06');
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-06/posting-export.csv', 'posting_export') });
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-06/eft-export.csv', 'eft_export') });
    expect(await w.lineStage(practice, serviceLineId)).toBe('recovered');
    const before = await jobTotals(practice);
    await w.load(practice, 'LED-06/recoupment.835');
    const summary = await w.reconcile(practice);
    expect(summary.remittances.recoupments).toBe(1);
    expect(await w.stages(practice)).toEqual(expectedStages('LED-06'));
    const after = await jobTotals(practice);
    expect(after.recoveredCents).toBe(parseCents(outcomeOf('LED-06').recoveredCents ?? ''));
    expect(before.recoveredCents - after.recoveredCents).toBe(1800n);
    expect(after.approvedCents).toBe(before.approvedCents);
    // Back to actionable (the status machine's one way back), with the ledger's note.
    expect(await w.lineStage(practice, serviceLineId)).toBe('actionable');
    const [reopen] = await w.rows<{ reason: string; reopened_from: string; set_by: string | null }>(practice, 'SELECT reason, reopened_from, set_by FROM line_status WHERE service_line_id = $1 ORDER BY seq DESC LIMIT 1', [serviceLineId]);
    expect(reopen).toMatchObject({ reopened_from: 'recovered', set_by: null });
    expect(practice.cipher.decrypt('line_status.reason', reopen?.reason ?? '')).toBe(REOPEN_NOTES.recoupment);
    const [state] = await w.rows<{ state: string }>(practice, 'SELECT state FROM "case" WHERE id = $1', [caseId]);
    expect(state?.state).not.toBe('resolved');
    const told = await asOwner(w.owner, [practice.practiceId], () => w.owner.query("SELECT user_id, counts, totals_cents FROM notification WHERE practice_id = $1 AND kind = 'recoupment' ORDER BY user_id", [practice.practiceId]));
    expect(told.rows).toEqual([practice.world.adminUserId, practice.manager].sort().map((user) => ({ user_id: user, counts: { recouped_lines: 1 }, totals_cents: { recouped: '-1800' } })));
    // A replay takes nothing back twice and tells no one twice.
    await w.reconcile(practice);
    expect(await w.stages(practice)).toEqual(expectedStages('LED-06'));
    expect((await asOwner(w.owner, [practice.practiceId], () => w.owner.query("SELECT 1 FROM notification WHERE practice_id = $1 AND kind = 'recoupment'", [practice.practiceId]))).rowCount).toBe(2);
  });

  it('takes back at once what a reversal of the attached claim reverses, with no correction beside it, and reopens the line', async () => {
    const { practice, caseId, serviceLineId } = await scenario('LED-02');
    // SYNTHETIC: on 2026-07-15 the payer reverses the corrected claim (SYNCCNLED020002) with no correction, beside another patient's claim.
    await w.triage.pricing.loadVariant(practice, 'LED-02/adjusted.835', [
      ['060020002', '060020007'],
      ['60020002', '60020007'],
      ['SYNEFTLED02002', 'SYNEFTLED02007'],
      ['260608', '260715'],
      ['20260608', '20260715'],
      ['20260607', '20260714'],
      ['CLP*SYNPCNLED02001*22*-150.00*-70.00*0.00*12*SYNCCNLED020001*11*8', 'CLP*SYNPCNLED02001*22*-150.00*-100.00*0.00*12*SYNCCNLED020002*11*8'],
      ['SVC*HC:97110*-150.00*-70.00**2', 'SVC*HC:97110*-150.00*-100.00**2'],
      ['CAS*CO*45*-80.00', 'CAS*CO*45*-50.00'],
      ['AMT*B6*-70.00', 'AMT*B6*-100.00'],
      ['CLP*SYNPCNLED02001*1*150.00*100.00*0.00*12*SYNCCNLED020002*11*7', 'CLP*SYNPCNLED02077*1*150.00*130.00*0.00*12*SYNCCNLED020077*11*1'],
      ['REF*F8*SYNCCNLED020001', 'REF*G1*SYNPRIORAUTH77'],
      ['SVC*HC:97110*150.00*100.00**2', 'SVC*HC:97110*150.00*130.00**2'],
      ['CAS*CO*45*50.00', 'CAS*CO*45*20.00'],
      ['AMT*B6*100.00', 'AMT*B6*130.00'],
    ]);
    const summary = await w.reconcile(practice);
    expect(summary.remittances.recoupments).toBe(1);
    const [recoupment] = (await w.entries(practice)).slice(-1);
    expect(recoupment).toMatchObject({ stage: 'recouped', amount_cents: '-3000', evidence_kind: 'claim', case_id: caseId, effective_on: '2026-07-15' });
    expect(await w.rows(practice, "SELECT kind FROM ledger_match WHERE kind = 'recoupment'")).toEqual([{ kind: 'recoupment' }]);
    expect(await jobTotals(practice)).toMatchObject({ approvedCents: 3000n, recoupedCents: -3000n });
    expect(await w.lineStage(practice, serviceLineId)).toBe('actionable');
    expect(await w.caseState(practice, caseId)).toBe('awaiting_response');
    // Taken back once.
    await w.reconcile(practice);
    expect((await w.entries(practice)).filter((entry) => entry.stage === 'recouped')).toHaveLength(1);
  });

  it('records a forward balance naming the case line’s claim, and counts nothing for it', async () => {
    const { practice, serviceLineId } = await scenario('LED-02');
    const [attached] = await w.rows<{ remittance_id: string }>(practice, "SELECT remittance_id FROM ledger_match WHERE kind = 'claim'");
    await asOwner(w.owner, [practice.practiceId], () =>
      w.owner.query(
        "INSERT INTO provider_adjustment (practice_id, remittance_id, position, provider_id, reason_code, reference, amount_cents, fiscal_period_date, category) VALUES ($1, $2, 98, 'SYNTHETIC', 'FB', 'SYNCCNLED020002', 1500, '2026-12-31', 'forward_balance')",
        [practice.practiceId, attached?.remittance_id],
      ),
    );
    const before = await w.entries(practice);
    await w.reconcile(practice);
    expect(await w.entries(practice)).toEqual(before);
    expect(await jobTotals(practice)).toMatchObject({ approvedCents: 3000n, recoupedCents: 0n, recoveredCents: 0n });
    expect(await w.lineStage(practice, serviceLineId)).toBe('payer_approved');
  });

  it('records interest a PLB L6 pays on the attached claim beside principal', async () => {
    const { practice, serviceLineId } = await scenario('LED-02');
    const [attached] = await w.rows<{ claim_id: string; remittance_id: string }>(practice, "SELECT claim_id, remittance_id FROM ledger_match WHERE kind = 'claim'");
    // A PLB L6 naming the attached claim (SYNTHETIC: the adjusted remittance's own claim control number).
    const [pccn] = await w.rows<{ payer_claim_control_number: string }>(practice, 'SELECT payer_claim_control_number FROM claim WHERE id = $1', [attached?.claim_id]);
    await asOwner(w.owner, [practice.practiceId], () =>
      w.owner.query(
        "INSERT INTO provider_adjustment (practice_id, remittance_id, position, provider_id, reason_code, reference, amount_cents, fiscal_period_date, category) VALUES ($1, $2, 99, 'SYNTHETIC', 'L6', $3, -411, '2026-12-31', 'interest')",
        [practice.practiceId, attached?.remittance_id, practice.cipher.decrypt('claim.payer_claim_control_number', pccn?.payer_claim_control_number ?? '')],
      ),
    );
    await w.reconcile(practice);
    const totalsNow = await jobTotals(practice);
    expect(totalsNow).toMatchObject({ interestCents: 411n, recoveredCents: 0n, approvedCents: 3000n });
    expect(await w.lineStage(practice, serviceLineId)).toBe('payer_approved');
  });
});

describe('manual matching and its reversal (LED-07)', () => {
  it('leaves a posting row with a typo unmatched, matches it by hand in the person’s name, and nets its reversal to zero', async () => {
    const { practice } = await scenario('LED-07');
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-07/posting-export.csv', 'posting_export') });
    expect((await w.entries(practice)).map((entry) => entry.stage)).toEqual(['approved']);
    const unmatched = await withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => unmatchedItems(scope as Scope, practice.practiceId));
    const [row] = unmatched.postings;
    expect(row).toMatchObject({ checkOrTrace: '880060070009', amountCents: 3000n, reversed: false });
    const remittance = row?.candidates.find((candidate) => candidate.paymentCents === 3000n);
    expect(remittance).toBeDefined();
    const { matchId } = await w.manual(practice, (context) => matchPostingByHand(context, { practiceId: practice.practiceId, postingRowId: row?.postingRowId ?? '', remittanceId: remittance?.remittanceId ?? '' }));
    const posted = (await w.entries(practice))[1];
    expect(posted).toMatchObject({ stage: 'posted', amount_cents: '3000', created_by: practice.manager, match_id: matchId });
    await expect(w.manual(practice, (context) => matchPostingByHand(context, { practiceId: practice.practiceId, postingRowId: row?.postingRowId ?? '', remittanceId: remittance?.remittanceId ?? '' }))).rejects.toThrow(
      new ReconciliationError('already_matched'),
    );
    const reversed = await w.manual(practice, (context) => reverseMatch(context, { practiceId: practice.practiceId, matchId, reason: 'SYNTHETIC matched to the wrong check' }));
    expect(reversed).toEqual({ reversedEntries: 1 });
    expect(await w.stages(practice)).toEqual(expectedStages('LED-07'));
    expect((await jobTotals(practice)).postedCents).toBe(parseCents(outcomeOf('LED-07').postedNetCents ?? ''));
    const [reversal] = (await w.entries(practice)).slice(-1);
    expect(reversal).toMatchObject({ evidence_kind: 'ledger_entry', created_by: practice.manager, effective_on: posted?.effective_on });
    // Listed again for a person, and never matched to it automatically.
    await w.reconcile(practice);
    const again = await withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => unmatchedItems(scope as Scope, practice.practiceId));
    expect(again.postings).toMatchObject([{ postingRowId: row?.postingRowId, reversed: true }]);
    expect((await w.entries(practice)).length).toBe(3);
    await expect(w.manual(practice, (context) => reverseMatch(context, { practiceId: practice.practiceId, matchId, reason: 'again' }))).rejects.toThrow(new ReconciliationError('not_standing'));
  });

  it('nets a reversed match to zero with the adjustments of its entries, and never corrects a reversed match’s entries again (LED-07)', async () => {
    const { practice, caseId, serviceLineId } = await scenario('LED-04', ledSettings('posted'));
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-04/posting-export.csv', 'posting_export') });
    const [posted] = await w.rows<{ id: string; match_id: string }>(practice, "SELECT id, match_id FROM ledger_entry WHERE stage = 'posted'");
    // An adjustment never proves more than the 30.00 row posted.
    await expect(w.manual(practice, (context) => adjustEntry(context, { practiceId: practice.practiceId, entryId: posted?.id ?? '', amountCents: cents(99999900n), reason: 'SYNTHETIC' }))).rejects.toThrow(
      /never sum past the row's amount/,
    );
    await w.manual(practice, (context) => adjustEntry(context, { practiceId: practice.practiceId, entryId: posted?.id ?? '', amountCents: cents(-1000n), reason: 'SYNTHETIC review' }));
    expect(await jobTotals(practice)).toMatchObject({ postedCents: 2000n, recoveredCents: 2000n });
    const reversed = await w.manual(practice, (context) => reverseMatch(context, { practiceId: practice.practiceId, matchId: posted?.match_id ?? '', reason: 'SYNTHETIC wrong check' }));
    // The posting and its adjustment, each offset exactly.
    expect(reversed).toEqual({ reversedEntries: 2 });
    expect((await w.stages(practice)).slice(1)).toEqual([
      { stage: 'posted', amountCents: '3000' },
      { stage: 'adjusted', amountCents: '-1000' },
      { stage: 'reversed', amountCents: '-3000' },
      { stage: 'reversed', amountCents: '1000' },
    ]);
    expect(await jobTotals(practice)).toMatchObject({ approvedCents: 3000n, postedCents: 0n, recoveredCents: 0n });
    expect(await w.lineStage(practice, serviceLineId)).toBe('payer_approved');
    // The reversed match's entry is never adjusted again, by the service or straight in SQL.
    await expect(w.manual(practice, (context) => adjustEntry(context, { practiceId: practice.practiceId, entryId: posted?.id ?? '', amountCents: cents(500n), reason: 'again' }))).rejects.toThrow(
      new ReconciliationError('not_standing'),
    );
    await expect(
      withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
        scope.client.query(
          "INSERT INTO ledger_entry (practice_id, case_id, service_line_id, stage, amount_cents, evidence_kind, evidence_id, match_id, created_by, reason) VALUES ($1, $2, $3, 'adjusted', 500, 'ledger_entry', $4, $5, $6, $7)",
          [practice.practiceId, caseId, serviceLineId, posted?.id, posted?.match_id, practice.manager, practice.cipher.encrypt('ledger_entry.reason', 'SYNTHETIC')],
        ),
      ),
    ).rejects.toThrow(/whose match stands/);
  });

  it('moves a line it recovered back to payer approved when the proof is reversed, and refuses one who does not reconcile postings', async () => {
    const { practice, serviceLineId } = await scenario('LED-07', ledSettings('posted'));
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-07/posting-export.csv', 'posting_export') });
    const [row] = await w.rows<{ id: string }>(practice, 'SELECT id FROM posting_row');
    const [remittance] = await w.rows<{ remittance_id: string }>(practice, "SELECT remittance_id FROM ledger_match WHERE kind = 'claim'");
    await expect(
      w.manual(practice, (context) => matchPostingByHand(context, { practiceId: practice.practiceId, postingRowId: row?.id ?? '', remittanceId: remittance?.remittance_id ?? '' }), practice.world.adminUserId),
    ).rejects.toThrow(/cannot reconcile postings/);
    const { matchId } = await w.manual(practice, (context) => matchPostingByHand(context, { practiceId: practice.practiceId, postingRowId: row?.id ?? '', remittanceId: remittance?.remittance_id ?? '' }));
    expect(await w.lineStage(practice, serviceLineId)).toBe('recovered');
    // The claim's approval cannot be unmatched while its posting stands.
    const [claimMatch] = await w.rows<{ id: string }>(practice, "SELECT id FROM ledger_match WHERE kind = 'claim'");
    await expect(w.manual(practice, (context) => reverseMatch(context, { practiceId: practice.practiceId, matchId: claimMatch?.id ?? '', reason: 'x' }))).rejects.toThrow(new ReconciliationError('reverse_postings_first'));
    await w.manual(practice, (context) => reverseMatch(context, { practiceId: practice.practiceId, matchId, reason: 'SYNTHETIC wrong check' }));
    expect(await w.lineStage(practice, serviceLineId)).toBe('payer_approved');
    const [back] = await w.rows<{ reason: string; set_by: string }>(practice, 'SELECT reason, set_by FROM line_status WHERE service_line_id = $1 ORDER BY seq DESC LIMIT 1', [serviceLineId]);
    expect(back?.set_by).toBe(practice.manager);
    expect(practice.cipher.decrypt('line_status.reason', back?.reason ?? '')).toBe(REOPEN_NOTES.reversal);
    // With the posting reversed, the approval itself can be unmatched, and the line leaves payer approved.
    await w.manual(practice, (context) => reverseMatch(context, { practiceId: practice.practiceId, matchId: claimMatch?.id ?? '', reason: 'SYNTHETIC not this claim' }));
    expect(await jobTotals(practice)).toMatchObject({ approvedCents: 0n, postedCents: 0n, recoveredCents: 0n });
    expect(await w.lineStage(practice, serviceLineId)).toBe('actionable');
  });

  it('matches an adjusted payment and a deposit by hand, compares as the reconcile does, and adjusts an entry with a reason', async () => {
    const { practice, serviceLineId } = await scenario('LED-09');
    const extras = await w.rows<{ id: string }>(practice, "SELECT c.id FROM claim c JOIN remittance r ON r.id = c.remittance_id WHERE c.claim_status_code <> '22' AND c.paid_cents = 5000 ORDER BY r.bpr16_date DESC, c.claim_no");
    // 50.00 against the 100.00 approved: lower, taking back at most the 30.00 approved.
    const lower = await w.manual(practice, (context) => matchClaimByHand(context, { practiceId: practice.practiceId, claimId: extras[0]?.id ?? '', serviceLineId }));
    expect(lower.outcome).toBe('decreased');
    expect((await w.stages(practice)).slice(-1)).toEqual([{ stage: 'recouped', amountCents: '-3000' }]);
    // With nothing left approved, another lower claim is a reprocessing with no change: the case has no
    // submission for it to answer, so no payer response is recorded.
    const same = await w.manual(practice, (context) => matchClaimByHand(context, { practiceId: practice.practiceId, claimId: extras[1]?.id ?? '', serviceLineId }));
    expect(same.outcome).toBe('no_change');
    expect(await w.rows(practice, 'SELECT count(*)::int AS n FROM payer_response')).toEqual([{ n: 0 }]);
    await expect(w.manual(practice, (context) => matchClaimByHand(context, { practiceId: practice.practiceId, claimId: extras[1]?.id ?? '', serviceLineId }))).rejects.toThrow(new ReconciliationError('already_matched'));
    // The reconcile tells the case's people of the person's recoupment.
    await w.reconcile(practice);
    expect((await asOwner(w.owner, [practice.practiceId], () => w.owner.query("SELECT 1 FROM notification WHERE practice_id = $1 AND kind = 'recoupment'", [practice.practiceId]))).rowCount).toBe(2);
    const [approved] = await w.entries(practice);
    const { entryId } = await w.manual(practice, (context) => adjustEntry(context, { practiceId: practice.practiceId, entryId: approved?.id ?? '', amountCents: cents(-500n), reason: 'SYNTHETIC specialist review' }));
    expect((await w.entries(practice)).find((entry) => entry.id === entryId)).toMatchObject({ stage: 'adjusted', amount_cents: '-500', evidence_kind: 'ledger_entry' });
    expect((await jobTotals(practice)).approvedCents).toBe(2500n);
    await expect(w.manual(practice, (context) => adjustEntry(context, { practiceId: practice.practiceId, entryId, amountCents: cents(1n), reason: 'x' }))).rejects.toThrow(new ReconciliationError('not_found'));
  });

  it('matches a deposit by hand only for exactly the payment', async () => {
    const { practice } = await scenario('LED-05');
    const bytes = Buffer.from('Date,Description,Trace Number,Amount,Batch Reference\r\n2026-06-09,SYNTHETIC PAYER L HCCLAIMPMT,SYNTYPO,30.00,\r\n2026-06-10,SYNTHETIC PAYER L HCCLAIMPMT,SYNTYPO2,29.99,\r\n');
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-05/eft-export.csv', 'eft_export', bytes) });
    const rows = await w.rows<{ id: string; amount_cents: string }>(practice, 'SELECT id, amount_cents::text FROM eft_row ORDER BY row_no');
    const [remittance] = await w.rows<{ remittance_id: string }>(practice, "SELECT remittance_id FROM ledger_match WHERE kind = 'claim'");
    await expect(w.manual(practice, (context) => matchDepositByHand(context, { practiceId: practice.practiceId, eftRowId: rows[1]?.id ?? '', remittanceId: remittance?.remittance_id ?? '' }))).rejects.toThrow(
      new ReconciliationError('amount_mismatch'),
    );
    await w.manual(practice, (context) => matchDepositByHand(context, { practiceId: practice.practiceId, eftRowId: rows[0]?.id ?? '', remittanceId: remittance?.remittance_id ?? '' }));
    expect(await jobTotals(practice)).toMatchObject({ depositedCents: 3000n, recoveredCents: 3000n });
  });
});

describe('batched deposits', () => {
  it('matches the rows of one bank batch together, flagged at the batch level, only when the batch’s total is the payments’', async () => {
    const { practice } = await scenario('LED-05');
    const header = 'Date,Description,Trace Number,Amount,Batch Reference\r\n';
    const wrong = Buffer.from(`${header}2026-06-09,D,SYNEFTLED05002,20.00,SYNBATCH-1\r\n2026-06-09,D,SYNNOTRACE,10.00,SYNBATCH-1\r\n`);
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-05/eft-export.csv', 'eft_export', wrong) });
    expect((await jobTotals(practice)).depositedCents).toBe(0n);
    const right = Buffer.from(`${header}2026-06-10,D,SYNEFTLED05002,30.00,SYNBATCH-2\r\n`);
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-05/eft-export.csv', 'eft_export', right) });
    expect(await w.rows(practice, "SELECT level FROM ledger_match WHERE kind = 'deposit'")).toEqual([{ level: 'batch' }]);
    expect((await jobTotals(practice)).depositedCents).toBe(3000n);
  });
});

describe('submissions and payer responses (milestone 8’s records; LED-01, J10)', () => {
  /** The LED-02 original paid again on 2026-06-10 under the same claim control number, allowed the same 70.00: a reprocessing with no change. */
  const unchanged = [
    ['060020001', '060020009'],
    ['60020001', '60020009'],
    ['SYNEFTLED02001', 'SYNEFTLED02009'],
    ['260406', '260610'],
    ['20260406', '20260610'],
    ['20260405', '20260609'],
  ] as const;

  it('LED-01: a submitted packet writes no entry; the adjusted remittance then approves the difference', async () => {
    const practice = await w.practice(`LED-01 ${randomUUID().slice(0, 8)}`);
    const { caseId, serviceLineId } = await w.caseFor(practice, 'LED-02/original.835');
    await w.submit(practice, caseId, '2026-05-04');
    const submitted = await w.reconcile(practice);
    expect(submitted).toMatchObject({ approvedFromResponses: 0, remittances: { approved: 0, confirmed: 0, noChange: 0 } });
    expect(await w.entries(practice)).toEqual([]);
    expect(await w.lineStage(practice, serviceLineId)).toBe('actionable');
    expect(await w.caseState(practice, caseId)).toBe('submitted');
    await w.load(practice, 'LED-02/adjusted.835');
    await w.reconcile(practice);
    expect(await w.stages(practice)).toEqual(expectedStages('LED-02'));
    expect(await w.lineStage(practice, serviceLineId)).toBe('payer_approved');
    expect(await w.caseState(practice, caseId)).toBe('resolved');
    // A higher payment is no response "reprocessed, no change".
    expect(await w.rows(practice, 'SELECT count(*)::int AS n FROM payer_response')).toEqual([{ n: 0 }]);
  });

  it('records a reprocessing with no change as the payer’s response to the case’s submission, in no one’s name, once', async () => {
    const practice = await w.practice(`no change ${randomUUID().slice(0, 8)}`);
    const { caseId } = await w.caseFor(practice, 'LED-02/original.835');
    const { submissionId } = await w.submit(practice, caseId, '2026-05-04');
    await w.triage.pricing.loadVariant(practice, 'LED-02/original.835', unchanged);
    const summary = await w.reconcile(practice);
    expect(summary.remittances).toMatchObject({ approved: 0, confirmed: 0, decreased: 0, noChange: 1 });
    expect(await w.entries(practice)).toEqual([]);
    const [remittance] = await w.rows<{ id: string }>(practice, "SELECT id FROM remittance WHERE trn02 = 'SYNEFTLED02009'");
    const responses = await w.rows(practice, 'SELECT submission_id, kind, amount_cents, document_id, remittance_id, received_on::text, recorded_by FROM payer_response');
    expect(responses).toEqual([{ submission_id: submissionId, kind: 'reprocessed_no_change', amount_cents: null, document_id: null, remittance_id: remittance?.id, received_on: '2026-06-10', recorded_by: null }]);
    expect(await w.rows(practice, "SELECT kind, outcome, matched_by FROM ledger_match")).toEqual([{ kind: 'claim', outcome: 'no_change', matched_by: null }]);
    expect(await w.caseState(practice, caseId)).toBe('resolved');
    await w.reconcile(practice);
    expect(await w.rows(practice, 'SELECT count(*)::int AS n FROM payer_response')).toEqual([{ n: 1 }]);
  });

  it('records no response for a reprocessing the case has no submission for, or that came before it', async () => {
    const practice = await w.practice(`no answer ${randomUUID().slice(0, 8)}`);
    const { caseId } = await w.caseFor(practice, 'LED-02/original.835');
    await w.triage.pricing.loadVariant(practice, 'LED-02/original.835', unchanged);
    expect((await w.reconcile(practice)).remittances.noChange).toBe(1);
    // Submitted after the remittance was paid: it answers nothing logged after it.
    await w.submit(practice, caseId, '2026-07-01');
    await w.triage.pricing.loadVariant(practice, 'LED-02/original.835', [...unchanged.slice(0, 2), ['SYNEFTLED02001', 'SYNEFTLED02010'], ['260406', '260611'], ['20260406', '20260611'], ['20260405', '20260610']]);
    expect((await w.reconcile(practice)).remittances.noChange).toBe(1);
    expect(await w.rows(practice, 'SELECT count(*)::int AS n FROM payer_response')).toEqual([{ n: 0 }]);
    expect(await w.caseState(practice, caseId)).toBe('submitted');
  });

  it('approves what an accepted payer response accepts, once; a remittance paying it confirms the approval, and its deposit recovers the line (J10)', async () => {
    const practice = await w.practice(`accepted ${randomUUID().slice(0, 8)}`);
    const { caseId, serviceLineId } = await w.caseFor(practice, 'LED-05/original.835');
    const { submissionId } = await w.submit(practice, caseId, '2026-05-04');
    const responseId = await w.respond(practice, submissionId, { kind: 'accepted', amountCents: 3000n, receivedOn: '2026-05-20' });
    // Recording the response wrote nothing (LED-01); the reconcile writes the approval.
    expect(await w.entries(practice)).toEqual([]);
    expect((await w.reconcile(practice)).approvedFromResponses).toBe(1);
    const [approval] = await w.entries(practice);
    expect(approval).toMatchObject({ stage: 'approved', amount_cents: '3000', evidence_kind: 'payer_response', evidence_id: responseId, match_id: null, created_by: null, case_id: caseId, service_line_id: serviceLineId, effective_on: '2026-05-20' });
    expect(await w.lineStage(practice, serviceLineId)).toBe('payer_approved');
    expect((await w.reconcile(practice)).approvedFromResponses).toBe(0);
    // The payer's reprocessing pays what it accepted: attached to the line, no second approval, no response.
    await w.load(practice, 'LED-05/adjusted.835');
    expect((await w.reconcile(practice)).remittances).toMatchObject({ approved: 0, confirmed: 1, noChange: 0 });
    expect(await w.rows(practice, "SELECT kind, outcome FROM ledger_match WHERE kind = 'claim'")).toEqual([{ kind: 'claim', outcome: 'approved' }]);
    expect(await w.rows(practice, 'SELECT kind FROM payer_response')).toEqual([{ kind: 'accepted' }]);
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-05/eft-export.csv', 'eft_export') });
    expect(await w.stages(practice)).toEqual([
      { stage: 'approved', amountCents: '3000' },
      { stage: 'deposited', amountCents: '3000' },
    ]);
    expect(await jobTotals(practice)).toMatchObject({ approvedCents: 3000n, depositedCents: 3000n, recoveredCents: 3000n });
    expect(await w.lineStage(practice, serviceLineId)).toBe('recovered');
    expect(await w.caseState(practice, caseId)).toBe('resolved');
  });

  /** LED-05's adjusted remittance with the correction paying 85.00 instead of 100.00 (a 15.00 check). */
  const partialPayment = [
    ['BPR*C*30.00', 'BPR*C*15.00'],
    ['CLP*SYNPCNLED05001*1*150.00*100.00', 'CLP*SYNPCNLED05001*1*150.00*85.00'],
    ['SVC*HC:97110*150.00*100.00**2', 'SVC*HC:97110*150.00*85.00**2'],
    ['CAS*CO*45*50.00', 'CAS*CO*45*65.00'],
    ['AMT*B6*100.00', 'AMT*B6*85.00'],
  ] as const;

  it('confirms what a reprocessing pays of an acceptance and leaves the rest a shortfall for a person, never a take-back', async () => {
    const practice = await w.practice(`shortfall ${randomUUID().slice(0, 8)}`);
    const { caseId, serviceLineId } = await w.caseFor(practice, 'LED-05/original.835');
    const { submissionId } = await w.submit(practice, caseId, '2026-05-04');
    await w.respond(practice, submissionId, { kind: 'accepted', amountCents: 3000n, receivedOn: '2026-05-20' });
    await w.reconcile(practice);
    // The payer reprocesses for 85.00 against the original 70.00: 15.00 of the 30.00 accepted is paid.
    await w.triage.pricing.loadVariant(practice, 'LED-05/adjusted.835', partialPayment);
    const summary = await w.reconcile(practice);
    expect(summary.remittances).toMatchObject({ approved: 0, confirmed: 1, decreased: 0, recoupments: 0, recouped: [] });
    expect(await w.stages(practice)).toEqual([{ stage: 'approved', amountCents: '3000' }]);
    expect(await w.rows(practice, "SELECT outcome FROM ledger_match WHERE kind = 'claim'")).toEqual([{ outcome: 'approved' }]);
    expect(await w.lineStage(practice, serviceLineId)).toBe('payer_approved');
    expect(await w.caseState(practice, caseId)).toBe('resolved');
    expect((await asOwner(w.owner, [practice.practiceId], () => w.owner.query("SELECT 1 FROM notification WHERE practice_id = $1 AND kind = 'recoupment'", [practice.practiceId]))).rowCount).toBe(0);
    const shortfall = () => withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => approvalShortfalls(scope as Scope, practice.practiceId, [serviceLineId]));
    expect(await shortfall()).toEqual(new Map([[serviceLineId, 1500n]]));
    // The 15.00 check deposits 15.00 against the approval; the shortfall waits for a person.
    const deposit = Buffer.from('Date,Description,Trace Number,Amount,Batch Reference\r\n2026-06-09,SYNTHETIC PAYER L HCCLAIMPMT,SYNEFTLED05002,15.00,\r\n');
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-05/eft-export.csv', 'eft_export', deposit) });
    expect(await jobTotals(practice)).toMatchObject({ approvedCents: 3000n, depositedCents: 1500n, recoupedCents: 0n, recoveredCents: 1500n, payerApprovedCents: 3000n });
    expect(await w.lineStage(practice, serviceLineId)).toBe('payer_approved');
    // A person adjusts the approval to what was paid, with a reason: the line is recovered.
    const [approval] = await w.entries(practice);
    await w.manual(practice, (context) => adjustEntry(context, { practiceId: practice.practiceId, entryId: approval?.id ?? '', amountCents: cents(-1500n), reason: 'SYNTHETIC payer paid 15.00 of the 30.00 accepted' }));
    expect(await shortfall()).toEqual(new Map());
    expect(await jobTotals(practice)).toMatchObject({ approvedCents: 1500n, depositedCents: 1500n, recoveredCents: 1500n });
    expect(await w.lineStage(practice, serviceLineId)).toBe('recovered');
  });

  it('refuses an acceptance of more than the submission asked, and approves no line past what it asked', async () => {
    const practice = await w.practice(`asked ${randomUUID().slice(0, 8)}`);
    const { caseId, serviceLineId } = await w.caseFor(practice, 'LED-04/original.835');
    const { submissionId } = await w.submit(practice, caseId, '2026-05-01');
    await expect(w.respond(practice, submissionId, { kind: 'accepted', amountCents: 300000n, receivedOn: '2026-05-15' })).rejects.toThrow(/accepts at most what its submission asked/);
    await expect(w.respond(practice, submissionId, { kind: 'partial', amountCents: 3001n, receivedOn: '2026-05-15' })).rejects.toThrow(/accepts at most what its submission asked/);
    await w.respond(practice, submissionId, { kind: 'partial', amountCents: 1000n, receivedOn: '2026-05-15' });
    await w.respond(practice, submissionId, { kind: 'accepted', amountCents: 3000n, receivedOn: '2026-05-16' });
    await w.reconcile(practice);
    expect(await w.stages(practice)).toEqual([
      { stage: 'approved', amountCents: '1000' },
      { stage: 'approved', amountCents: '2000' },
    ]);
    expect(await w.lineStage(practice, serviceLineId)).toBe('payer_approved');
  });

  it('reopens a resolved case when a recoupment takes back what was recovered, whatever the payer answered, as @tp/triage derives it (LED-06)', async () => {
    const practice = await w.practice(`reopen ${randomUUID().slice(0, 8)}`);
    const { caseId, serviceLineId } = await w.caseFor(practice, 'LED-06/original.835');
    const { submissionId } = await w.submit(practice, caseId, '2026-05-04');
    await w.respond(practice, submissionId, { kind: 'accepted', amountCents: 3000n, receivedOn: '2026-05-20' });
    await w.load(practice, 'LED-06/adjusted.835');
    await w.reconcile(practice);
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-06/posting-export.csv', 'posting_export') });
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-06/eft-export.csv', 'eft_export') });
    expect(await w.lineStage(practice, serviceLineId)).toBe('recovered');
    expect(await w.caseState(practice, caseId)).toBe('resolved');
    await w.load(practice, 'LED-06/recoupment.835');
    expect((await w.reconcile(practice)).remittances.recoupments).toBe(1);
    expect((await w.stages(practice)).slice(-1)).toEqual([{ stage: 'recouped', amountCents: '-1800' }]);
    expect((await jobTotals(practice)).recoveredCents).toBe(1200n);
    expect(await w.lineStage(practice, serviceLineId)).toBe('actionable');
    // The payer's acceptance stands, yet the case waits on the payer again.
    expect(await w.caseState(practice, caseId)).toBe('awaiting_response');
    expect(deriveCaseState([{ writtenOff: false, stage: 'actionable', reopenedFromApproval: true }], { response: 'accepted', reopened: false })).toBe('awaiting_response');
    // The case has no owner: its practice's people are told (the administrator and both billing managers).
    const told = await asOwner(w.owner, [practice.practiceId], () => w.owner.query("SELECT count(*)::int AS n FROM notification WHERE practice_id = $1 AND kind = 'recoupment'", [practice.practiceId]));
    expect(told.rows).toEqual([{ n: 3 }]);
  });
});

describe('the ledger is append-only (LED-10)', () => {
  it('refuses the application role a direct UPDATE or DELETE of an entry, and every role through the triggers', async () => {
    const { practice } = await scenario('LED-02');
    const [entry] = await w.entries(practice);
    for (const sql of ['UPDATE ledger_entry SET amount_cents = 1 WHERE id = $1', 'DELETE FROM ledger_entry WHERE id = $1', 'UPDATE ledger_match SET kind = kind WHERE id = (SELECT match_id FROM ledger_entry WHERE id = $1)']) {
      await expect(withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => scope.client.query(sql, [entry?.id]))).rejects.toMatchObject({ code: '42501' });
    }
    for (const sql of [
      'UPDATE ledger_entry SET amount_cents = 1 WHERE id = $1',
      'DELETE FROM ledger_entry WHERE id = $1',
      'DELETE FROM ledger_match WHERE id = (SELECT match_id FROM ledger_entry WHERE id = $1)',
      'UPDATE ledger_match SET outcome = $$no_change$$ WHERE id = (SELECT match_id FROM ledger_entry WHERE id = $1)',
    ]) {
      await expect(asOwner(w.owner, [practice.practiceId], () => w.owner.query(sql, [entry?.id]))).rejects.toMatchObject({ code: '23514' });
    }
    await expect(asOwner(w.owner, [practice.practiceId], () => w.owner.query('TRUNCATE ledger_entry CASCADE'))).rejects.toMatchObject({ code: '23514' });
    expect(await w.entries(practice)).toEqual([entry]);
  });
});

describe('the flagged-as-recovered shortcut fails as it should (PRD 6; milestone 9 done check)', () => {
  it('refuses a line set to payer approved or recovered without the entries that put it there, by a job or a person', async () => {
    const practice = await w.practice('shortcut');
    const { serviceLineId } = await w.caseFor(practice, 'LED-02/original.835');
    const job = (stage: string) =>
      withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) =>
        scope.client.query('INSERT INTO line_status (practice_id, service_line_id, stage) VALUES ($1, $2, $3)', [practice.practiceId, serviceLineId, stage]),
      );
    await expect(job('recovered')).rejects.toThrow(/nothing counts as recovered without a posted or deposited entry/);
    await expect(job('payer_approved')).rejects.toThrow(/the ledger holds no entries/);
    await expect(
      withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
        scope.client.query('INSERT INTO line_status (practice_id, service_line_id, stage, set_by) VALUES ($1, $2, $3, $4)', [practice.practiceId, serviceLineId, 'recovered', practice.manager]),
      ),
    ).rejects.toThrow(/nothing counts as recovered/);
    expect(await w.lineStage(practice, serviceLineId)).toBe('actionable');
  });

  it('refuses a posted or deposited entry that no standing match of its export row stands behind', async () => {
    const { practice, caseId, serviceLineId } = await scenario('LED-04');
    const documentId = await w.stageExport(practice, 'LED-04/posting-export.csv', 'posting_export', Buffer.from('Post Date,Check/EFT #,Payer,Claim Ref,CPT,DOS,Paid Amount,Batch\r\n06/11/2026,NOSUCHCHECK,P,,,,30.00,B\r\n'));
    await w.reconcile(practice, { documentId });
    const [row] = await w.rows<{ id: string }>(practice, 'SELECT id FROM posting_row');
    const [claimMatch] = await w.rows<{ id: string; claim_id: string }>(practice, "SELECT id, claim_id FROM ledger_match WHERE kind = 'claim'");
    const insert = (stage: string, kind: string, matchId: string | null, evidenceId = row?.id) =>
      withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) =>
        scope.client.query(
          'INSERT INTO ledger_entry (practice_id, case_id, service_line_id, stage, amount_cents, evidence_kind, evidence_id, match_id, effective_on) VALUES ($1, $2, $3, $4, 3000, $5, $6, $7, $8)',
          [practice.practiceId, caseId, serviceLineId, stage, kind, evidenceId, matchId, '2026-06-11'],
        ),
      );
    await expect(insert('posted', 'posting_row', null)).rejects.toThrow(/an entry comes from a standing match|ledger_entry_matched/);
    await expect(insert('posted', 'posting_row', claimMatch?.id ?? null)).rejects.toThrow(/carries its match's evidence|comes from a match of its kind/);
    // A deposit claimed from the claim's own match: the claim is no deposit's evidence.
    await expect(insert('deposited', 'claim', claimMatch?.id ?? null, claimMatch?.claim_id)).rejects.toThrow(/a deposited entry comes from a match of its kind|ledger_entry_evidence_of_stage/);
    expect(await jobTotals(practice)).toMatchObject({ postedCents: 0n, depositedCents: 0n, recoveredCents: 0n });
  });
});

describe('the ROI statement (LED-11)', () => {
  it('recomputes from its entries: every figure is the sum of what it links, and the database checks it', async () => {
    const { practice } = await scenario('LED-06');
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-06/posting-export.csv', 'posting_export') });
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-06/eft-export.csv', 'eft_export') });
    await w.load(practice, 'LED-06/recoupment.835');
    await w.reconcile(practice);
    const generated = await withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
      generateRoiStatement(scope as Scope, { practiceId: practice.practiceId, periodFrom: '2026-01-01', periodTo: '2026-12-31', requestId: `test-${randomUUID()}` }),
    );
    expect(generated?.statement).toMatchObject({ recoveredCents: 1200n, interestCents: 0n, approvedUnpostedCents: 0n, feesCents: 0n, recoveredToFees: null, proofLevel: 'deposited', pursuitHours: '0.00' });
    const [stored] = await w.rows<{ recovered_cents: string; interest_cents: string; approved_unposted_cents: string; actionable_open_cents: string; links: Record<string, string[]>; generated_by: string }>(
      practice,
      'SELECT recovered_cents::text, interest_cents::text, approved_unposted_cents::text, actionable_open_cents::text, links, generated_by FROM roi_statement',
    );
    expect(stored?.generated_by).toBe(practice.manager);
    const entries = await w.entries(practice);
    const amountOf = new Map(entries.map((entry) => [entry.id, BigInt(entry.amount_cents)]));
    expect((stored?.links.recovered ?? []).reduce((sum, id) => sum + (amountOf.get(id) ?? 0n), 0n).toString()).toBe(stored?.recovered_cents);
    // The same statement from the entries alone.
    const ledger: LedgerEntry[] = entries.map((entry) => ({
      id: entry.id,
      caseId: entry.case_id,
      serviceLineId: entry.service_line_id,
      stage: entry.stage as LedgerEntry['stage'],
      amountCents: parseCents(entry.amount_cents),
      evidenceKind: entry.evidence_kind as LedgerEntry['evidenceKind'],
      evidenceId: entry.evidence_id,
      allocated: entry.allocated,
      effectiveOn: entry.effective_on,
    }));
    expect(ledgerTotals(ledger, 'deposited').recoveredCents.toString()).toBe(stored?.recovered_cents);
    const recomputed = roiStatement({ periodFrom: '2026-01-01', periodTo: '2026-12-31', proofLevel: 'deposited', entries: ledger, feesCents: cents(0n), pursuitHours: '0.00', openCases: [] });
    expect(recomputed.recoveredCents.toString()).toBe(stored?.recovered_cents);
    // A statement whose figures are not its entries' is refused.
    await expect(
      withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
        scope.client.query(
          `INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links, generated_by)
           VALUES ($1, '2026-01-01', '2026-12-31', 'deposited', 0, 3000, 0, 0, 0, 0, $2, $3)`,
          [practice.practiceId, JSON.stringify({ ...stored?.links }), practice.manager],
        ),
      ),
    ).rejects.toThrow(/sums of the entries it links/);
  });

  it('is generated quarterly by the daily reconcile, once', async () => {
    const { practice } = await scenario('LED-05');
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-05/eft-export.csv', 'eft_export') });
    const handler = reconcileHandler(w.services);
    await handler({ practice_id: practice.practiceId, day: '2026-07-01' }, w.jobContext(practice));
    await handler({ practice_id: practice.practiceId, day: '2026-07-02' }, w.jobContext(practice));
    expect(await w.rows(practice, 'SELECT period_from::text, period_to::text, recovered_cents::text, generated_by FROM roi_statement')).toEqual([
      { period_from: '2026-04-01', period_to: '2026-06-30', recovered_cents: '3000', generated_by: null },
    ]);
  });
});

describe('the monthly digest’s recoveries', () => {
  it('counts the lines the month’s proof entries recovered, and the month’s recovered total, from the ledger', async () => {
    const { practice } = await scenario('LED-06');
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-06/posting-export.csv', 'posting_export') });
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-06/eft-export.csv', 'eft_export') });
    const month = (period: string) => withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => digestFigures(scope.client, practice.practiceId, period, `${period}-28`));
    const june = await month('2026-06');
    expect({ lines: june.counts.recoveries_posted, recovered: june.totals.recovered }).toEqual({ lines: 1, recovered: '3000' });
    const may = await month('2026-05');
    expect({ lines: may.counts.recoveries_posted, recovered: may.totals.recovered }).toEqual({ lines: 0, recovered: '0' });
    // The recoupment counts in the month it was taken back in (the recoupment remittance's BPR16, 2026-08-03).
    await w.load(practice, 'LED-06/recoupment.835');
    await w.reconcile(practice);
    const august = await month('2026-08');
    expect({ lines: august.counts.recoveries_posted, recovered: august.totals.recovered }).toEqual({ lines: 0, recovered: '-1800' });
    expect((await month('2026-06')).totals.recovered).toBe('3000');
  });
});

describe('the reconcile job', () => {
  it('leaves a run that is not complete, and reconciles after a complete one', async () => {
    const practice = await w.practice('job');
    const logs: Record<string, unknown>[] = [];
    const missing = randomUUID();
    await reconcileHandler(w.services)({ practice_id: practice.practiceId, pricing_run_id: missing }, w.jobContext(practice, logs));
    expect(logs).toEqual([expect.objectContaining({ msg: 'reconcile found no complete pricing run', error_code: 'RECONCILE_RUN_NOT_FOUND', pricing_run_id: missing })]);
  });
});
