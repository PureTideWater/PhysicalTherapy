import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { readDatabaseUrl, withJobScope } from '@tp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FIXTURES, type Practice } from '../price/test-support/pricing-world';
import type { Scope } from './ledger';
import { practiceLedgerTotals } from './statements';
import { LedgerWorld, ledSettings } from './test-support/ledger-world';

/**
 * Each case line on its own line of a reprocessing (PRD 13, Matching steps 1, 2 and 4; CLAUDE.md rule 1;
 * docs/adr/0046), against PostgreSQL through the reconcile step: two case lines of one code and date are
 * each compared with, and posted from, their own line of the correction (LED-04's same-day scenario); a
 * posting row with line detail posts only the line it posts (LED-09's line-level scenario); and no row
 * proves more than its own amount, which the database holds too.
 */

let w: LedgerWorld;

beforeAll(async () => {
  w = await LedgerWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

interface Outcome {
  readonly sameDay: { readonly checkCents: string; readonly lines: readonly { readonly line: number; readonly entries: readonly { readonly stage: string; readonly amountCents: string }[] }[] };
  readonly lineLevel: { readonly lines: readonly { readonly serviceDate: string; readonly entries: readonly { readonly stage: string; readonly amountCents: string }[] }[] };
}

const outcomeOf = (id: string): Outcome => (JSON.parse(readFileSync(path.join(FIXTURES, id, 'expected.json'), 'utf8')) as { outcome: Outcome }).outcome;

interface CaseLineRow {
  readonly service_line_id: string;
  readonly line_no: number;
  readonly service_date: string;
}

async function caseLinesOf(practice: Practice): Promise<CaseLineRow[]> {
  return w.rows<CaseLineRow>(practice, 'SELECT cl.service_line_id, l.line_no, l.service_date::text AS service_date FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id ORDER BY l.service_date, l.line_no');
}

async function lineEntries(practice: Practice, serviceLineId: string): Promise<{ stage: string; amountCents: string }[]> {
  return (await w.entries(practice)).filter((entry) => entry.service_line_id === serviceLineId).map((entry) => ({ stage: entry.stage, amountCents: entry.amount_cents }));
}

async function totals(practice: Practice) {
  return withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => practiceLedgerTotals(scope as Scope, practice.practiceId));
}

/** A posted entry of `amount` written as the reconcile job would, for the match and line named. */
function postedByJob(practice: Practice, values: { readonly caseId: string; readonly serviceLineId: string; readonly evidenceId: string; readonly matchId: string; readonly amount: string }) {
  return withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) =>
    scope.client.query(
      "INSERT INTO ledger_entry (practice_id, case_id, service_line_id, stage, amount_cents, evidence_kind, evidence_id, match_id) VALUES ($1, $2, $3, 'posted', $4, 'posting_row', $5, $6)",
      [practice.practiceId, values.caseId, values.serviceLineId, values.amount, values.evidenceId, values.matchId],
    ),
  );
}

describe('two case lines of one code and date (97110 and 97110-59; LED-04’s same-day scenario)', () => {
  it('compares each with its own line of the correction, posts the check’s 30.00 once, and the database refuses a second proof of it', async () => {
    const practice = await w.practice(`same day ${randomUUID().slice(0, 8)}`, ledSettings('posted'));
    const { caseId } = await w.caseFor(practice, 'LED-04/same-day-original.835');
    const lines = await caseLinesOf(practice);
    expect(lines.map((line) => line.line_no)).toEqual([1, 2]);
    const [first, second] = lines as [CaseLineRow, CaseLineRow];
    await w.load(practice, 'LED-04/same-day-adjusted.835');
    const summary = await w.reconcile(practice);
    expect(summary.remittances).toMatchObject({ approved: 1, noChange: 1, decreased: 0, recoupments: 0 });
    expect(await w.rows(practice, "SELECT service_line_id, outcome FROM ledger_match WHERE kind = 'claim' ORDER BY outcome")).toEqual([
      { service_line_id: first.service_line_id, outcome: 'approved' },
      { service_line_id: second.service_line_id, outcome: 'no_change' },
    ]);
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-04/same-day-posting-export.csv', 'posting_export') });
    const expected = outcomeOf('LED-04').sameDay;
    expect(await lineEntries(practice, first.service_line_id)).toEqual(expected.lines[0]?.entries);
    expect(await lineEntries(practice, second.service_line_id)).toEqual(expected.lines[1]?.entries);
    expect(await totals(practice)).toMatchObject({ approvedCents: 3000n, postedCents: BigInt(expected.checkCents), recoveredCents: 3000n, payerApprovedCents: 3000n });
    expect(await w.lineStage(practice, first.service_line_id)).toBe('recovered');
    expect(await w.lineStage(practice, second.service_line_id)).toBe('actionable');
    // Whoever writes it, a second proof of the 30.00 row is refused: a row never proves more than its amount.
    const [match] = await w.rows<{ id: string; posting_row_id: string }>(practice, "SELECT id, posting_row_id FROM ledger_match WHERE kind = 'posting'");
    await expect(postedByJob(practice, { caseId, serviceLineId: second.service_line_id, evidenceId: match?.posting_row_id ?? '', matchId: match?.id ?? '', amount: '1' })).rejects.toThrow(/never sum past the row's amount/);
    // A replay writes nothing twice.
    const before = await w.entries(practice);
    await w.reconcile(practice);
    expect(await w.entries(practice)).toEqual(before);
  });
});

describe('a posting export with line detail (LED-09’s line-level scenario; PRD 13, Matching step 2)', () => {
  it('posts only the case line its row posts, and leaves the other line approved, waiting for its own row', async () => {
    const practice = await w.practice(`line level ${randomUUID().slice(0, 8)}`, ledSettings('posted'));
    const { caseId } = await w.caseFor(practice, 'LED-09/lines-original.835');
    const [first, second] = (await caseLinesOf(practice)) as [CaseLineRow, CaseLineRow];
    expect([first.service_date, second.service_date]).toEqual(['2026-03-09', '2026-03-10']);
    await w.load(practice, 'LED-09/lines-adjusted.835');
    await w.reconcile(practice);
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-09/lines-posting-export.csv', 'posting_export') });
    const expected = outcomeOf('LED-09').lineLevel;
    expect(await lineEntries(practice, first.service_line_id)).toEqual(expected.lines[0]?.entries);
    expect(await lineEntries(practice, second.service_line_id)).toEqual(expected.lines[1]?.entries);
    expect(await w.rows(practice, "SELECT level FROM ledger_match WHERE kind = 'posting'")).toEqual([{ level: 'claim' }]);
    expect(await w.lineStage(practice, first.service_line_id)).toBe('recovered');
    expect(await w.lineStage(practice, second.service_line_id)).toBe('payer_approved');
    expect(await totals(practice)).toMatchObject({ approvedCents: 6000n, postedCents: 3000n, recoveredCents: 3000n });
    // The database holds the line-level rule too: the 03-09 row never posts the 03-10 line.
    const [match] = await w.rows<{ id: string; posting_row_id: string }>(practice, "SELECT id, posting_row_id FROM ledger_match WHERE kind = 'posting'");
    await expect(postedByJob(practice, { caseId, serviceLineId: second.service_line_id, evidenceId: match?.posting_row_id ?? '', matchId: match?.id ?? '', amount: '100' })).rejects.toThrow(
      /posts only the lines of its row's code and date of service/,
    );
  });
});
