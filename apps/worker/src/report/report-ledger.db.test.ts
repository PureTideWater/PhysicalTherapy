import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withJobScope } from '@tp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Practice } from '../price/test-support/pricing-world';
import type { Scope } from '../reconcile/ledger';
import { practiceLedgerTotals } from '../reconcile/statements';
import { LED_PLAN, LedgerWorld, ledSettings } from '../reconcile/test-support/ledger-world';
import type { AuditReportContent } from './content';
import { CSV_COLUMNS } from './csv';
import { auditHtml } from './html';

/**
 * An audit report generated after a recovery (the screen tour's N4), against PostgreSQL, on the tour's
 * SYNTHETIC shape: CAS-08 (payer Q, three 97110 lines short 30.00 each) and LED-06's original (payer L, one
 * line short 30.00) priced for March under two signed-off 50.00-per-unit schedules and triaged into two
 * cases; Q's packet submitted (no answer yet); L's adjusted remittance approving 30.00, its posting and its
 * deposit reconciled (the practice proves by deposit). The report of March, generated then, must read its
 * headline from the same lines as its cases table: actionable only what is still actionable (Q's 90.00),
 * payer approved and recovered from the recovery ledger's entries for those cases' lines (L's 30.00 each),
 * recovered only from entries at the proof level, never a fixed zero.
 */

let w: LedgerWorld;

beforeAll(async () => {
  w = await LedgerWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

const SCHEDULE = { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 };

interface Stored {
  readonly content: AuditReportContent;
  readonly csv_key: string;
}

async function generated(practice: Practice, runId: string): Promise<Stored> {
  const id = await w.triage.requestReport(practice, runId);
  expect((await w.triage.generate(practice, id)).outcome).toBe('ready');
  const [row] = await w.rows<Stored>(practice, 'SELECT content, csv_key FROM audit_report WHERE id = $1', [id]);
  if (row === undefined) {
    throw new Error('no such report');
  }
  return row;
}

const column = (name: (typeof CSV_COLUMNS)[number]) => CSV_COLUMNS.indexOf(name);
const cents = (text: string | undefined) => BigInt((text ?? '').replace('.', '') || '0');

describe('an audit report generated after a recovery (N4)', () => {
  it('reads its headline from its cases’ lines: actionable still actionable, payer approved and recovered from the ledger at the proof level', async () => {
    const practice = await w.practice(`report after recovery ${randomUUID().slice(0, 8)}`, ledSettings('deposited'));
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
    await w.triage.triage(practice, march);
    const cases = await w.rows<{ id: string; plan_key: string }>(practice, 'SELECT c.id, pl.plan_key FROM "case" c JOIN plan pl ON pl.id = c.plan_id ORDER BY pl.plan_key');
    const caseL = cases.find((item) => item.plan_key === LED_PLAN)?.id ?? '';
    const caseQ = cases.find((item) => item.plan_key === 'CE:SYNPLAN-FIX-ONE')?.id ?? '';
    const [lineL] = await w.rows<{ service_line_id: string }>(practice, 'SELECT service_line_id FROM case_line WHERE case_id = $1', [caseL]);

    // Q's packet goes out; L's payer reprocesses, the practice posts it and the bank deposits it.
    await w.submit(practice, caseQ, '2026-05-04');
    await w.load(practice, 'LED-06/adjusted.835');
    await w.reconcile(practice);
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-06/posting-export.csv', 'posting_export') });

    // Posted but not yet deposited: the practice proves by deposit, so nothing is recovered yet; approved is.
    const posted = (await generated(practice, march)).content;
    expect(posted.headline).toMatchObject({ actionable_cents: '9000', actionable_lines: 3, payer_approved_cents: '3000', recovered_cents: '0' });

    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-06/eft-export.csv', 'eft_export') });
    expect(await w.lineStage(practice, lineL?.service_line_id ?? '')).toBe('recovered');
    expect(await w.caseState(practice, caseL)).toBe('resolved');
    expect(await w.caseState(practice, caseQ)).toBe('submitted');

    const { content, csv_key } = await generated(practice, march);
    // The headline: Q's three lines still actionable; L's line approved and deposited, from the ledger.
    expect(content.headline).toMatchObject({
      actionable_cents: '9000',
      actionable_lines: 3,
      payer_approved_cents: '3000',
      recovered_cents: '3000',
      validated_lines: 4,
      validated_cents: '12000',
    });
    // The cases table: each case's share of this run, at each stage, from the same lines.
    expect(content.cases.map((item) => [item.plan, item.state, item.lines, item.actionable_cents, item.actionable_now_lines, item.actionable_now_cents, item.payer_approved_cents, item.recovered_cents])).toEqual([
      ['CE:SYNPLAN-FIX-LED', 'resolved', 1, '3000', 0, '0', '3000', '3000'],
      ['CE:SYNPLAN-FIX-ONE', 'submitted', 3, '9000', 3, '9000', '0', '0'],
    ]);
    const total = (pick: (item: AuditReportContent['cases'][number]) => string | undefined) => content.cases.reduce((sum, item) => sum + BigInt(pick(item) ?? '0'), 0n).toString();
    expect(total((item) => item.actionable_now_cents)).toBe(content.headline.actionable_cents);
    expect(total((item) => item.payer_approved_cents)).toBe(content.headline.payer_approved_cents);
    expect(total((item) => item.recovered_cents)).toBe(content.headline.recovered_cents);
    expect(content.cases.reduce((sum, item) => sum + (item.actionable_now_lines ?? 0), 0)).toBe(content.headline.actionable_lines);

    // The ledger holds exactly what the headline says, for these cases.
    const ledger = await withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => practiceLedgerTotals(scope as Scope, practice.practiceId, { caseIds: [caseQ, caseL] }));
    expect([ledger.payerApprovedCents.toString(), ledger.recoveredCents.toString()]).toEqual([content.headline.payer_approved_cents, content.headline.recovered_cents]);

    // The line CSV counts the same lines: actionable is Q's three, L's line is counted as recovered.
    const [, ...rows] = (await w.triage.stored(practice, csv_key)).toString('utf8').slice(0, -2).split('\r\n').map((row) => row.split(','));
    const actionable = rows.filter((row) => row[column('counted_as')] === 'actionable');
    expect(actionable).toHaveLength(content.headline.actionable_lines);
    expect(actionable.reduce((sum, row) => sum + cents(row[column('variance')]), 0n).toString()).toBe(content.headline.actionable_cents);
    expect(rows.filter((row) => row[column('counted_as')] === 'recovered').map((row) => [row[column('stage')], row[column('case_ref')]])).toEqual([['recovered', caseL]]);

    // The printed report says what the ledger holds: no "nothing yet" beside a recovered figure.
    const html = auditHtml(content);
    expect(html).not.toContain('is recorded yet');
    expect(html).not.toContain('nothing has been deposited yet');
    expect(html).not.toContain('closed (written off)');
    expect(html).toContain('submitted');
    // Its printed cases table counts the headline's lines: L's one line is no longer actionable, Q's three are.
    const printed = html.slice(html.indexOf('<caption>Cases</caption>'));
    const caseRows = [...printed.slice(0, printed.indexOf('</table>')).matchAll(/<tr>(.*?)<\/tr>/g)]
      .map((row) => [...(row[1] ?? '').matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((cell) => cell[1] ?? ''))
      .filter((cells) => cells.length > 0);
    expect(caseRows.map((cells) => [cells[1], cells[3]])).toEqual([
      ['CE:SYNPLAN-FIX-LED', '0 of 1'],
      ['CE:SYNPLAN-FIX-ONE', '3 of 3'],
    ]);
    expect(caseRows.reduce((sum, cells) => sum + Number.parseInt(cells[3] ?? '', 10), 0)).toBe(content.headline.actionable_lines);
  }, 300_000);
});

describe('an audit report of a case whose correction the patient’s share took whole (LED-15; docs/adr/0067)', () => {
  it('says after the case’s stored state that the payer corrected and the balance is the patient’s, and counts nothing for it', async () => {
    const practice = await w.practice(`report patient balance ${randomUUID().slice(0, 8)}`, ledSettings('deposited'));
    await w.load(practice, 'LED-15/original.835');
    const contract = await w.triage.fixedContract(practice, SCHEDULE);
    const march = await w.triage.pricedRun(practice, { plans: [{ key: LED_PLAN, versionId: contract.versionId }], from: '2026-03-01', to: '2026-03-31' });
    await w.triage.triage(practice, march);
    const [line] = await w.rows<{ case_id: string; service_line_id: string }>(practice, 'SELECT case_id, service_line_id FROM case_line');
    const caseId = line?.case_id ?? '';
    await w.submit(practice, caseId, '2026-05-04');
    await w.load(practice, 'LED-15/adjusted.835');
    await w.reconcile(practice);
    // The correction wrote no entry, and the line is still actionable (Q1: the stored close is Lane A's).
    expect(await w.entries(practice)).toEqual([]);
    expect(await w.lineStage(practice, line?.service_line_id ?? '')).toBe('actionable');
    const stored = await w.caseState(practice, caseId);
    expect(stored).toBe('submitted');

    const { content } = await generated(practice, march);
    // The state stays as stored; the words come beside it, in a field of their own.
    expect(content.cases).toEqual([expect.objectContaining({ case_id: caseId, state: stored, patient_balance: true, payer_approved_cents: '0', recovered_cents: '0' })]);
    expect(content.headline).toMatchObject({ payer_approved_cents: '0', recovered_cents: '0' });
    const html = auditHtml(content);
    expect(html).toContain(`<td>${stored}; payer corrected, balance is the patient’s</td>`);
    // Billable to the patient is in no figure of the report.
    expect(JSON.stringify(content)).not.toMatch(/billable/i);
  }, 300_000);
});
