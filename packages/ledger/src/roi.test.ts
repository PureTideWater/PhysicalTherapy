import { cents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { previousQuarter, quarterPeriod, ratioText, roiStatement } from './roi';
import { type CountedStage, type LedgerEntry, LedgerError } from './stages';

let counter = 0;
function make(stage: CountedStage | 'reversed', amount: bigint, options: { line?: string | null; on?: string; corrects?: LedgerEntry; caseId?: string } = {}): LedgerEntry {
  counter += 1;
  const evidence = { approved: 'claim', posted: 'posting_row', deposited: 'eft_row', recouped: 'claim', interest: 'provider_adjustment', reversed: 'ledger_entry' } as const;
  return {
    id: `${stage}-${String(counter)}`,
    caseId: options.caseId ?? 'case-1',
    serviceLineId: options.line === undefined ? 'line-1' : options.line,
    stage,
    amountCents: cents(amount),
    evidenceKind: evidence[stage],
    evidenceId: options.corrects?.id ?? `evidence-${String(counter)}`,
    allocated: false,
    effectiveOn: options.on ?? '2026-06-10',
  };
}

describe('the ROI statement (PRD 13, ROI statement; LED-11)', () => {
  it('reports each figure from its entries, never mixing stages', () => {
    const approved = make('approved', 3000n);
    const posted = make('posted', 1800n);
    const deposited = make('deposited', 1800n);
    const recouped = make('recouped', -500n, { on: '2026-08-03' });
    const interest = make('interest', 411n);
    const otherApproved = make('approved', 2000n, { line: 'line-2' });
    const otherPosted = make('posted', 2000n, { line: 'line-2' });
    // A payer response accepting an amount for case 2 as a whole.
    const caseLevel = make('approved', 900n, { caseId: 'case-2', line: null });
    const entries = [approved, posted, deposited, recouped, interest, otherApproved, otherPosted, caseLevel];
    const statement = roiStatement({
      periodFrom: '2026-04-01',
      periodTo: '2026-06-30',
      proofLevel: 'posted',
      entries,
      feesCents: cents(1500n),
      pursuitHours: '3.50',
      openCases: [{ caseId: 'case-1', actionableCents: cents(1200n) }, { caseId: 'case-2', actionableCents: cents(900n) }],
    });
    expect(statement).toMatchObject({
      recoveredCents: 3800n,
      interestCents: 411n,
      // line-1: 30.00 approved, 18.00 posted; case-2: 9.00 approved for the case, nothing posted.
      approvedUnpostedCents: 2100n,
      actionableOpenCents: 2100n,
      feesCents: 1500n,
      pursuitHours: '3.50',
      recoveredToFees: '2.53',
      proofLevel: 'posted',
    });
    expect(statement.links).toEqual({
      recovered: [posted.id, otherPosted.id],
      interest: [interest.id],
      approvedUnposted: [approved.id, posted.id, caseLevel.id],
      actionableOpen: ['case-1', 'case-2'],
    });
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const sum = (ids: readonly string[]) => ids.reduce((total, item) => total + (byId.get(item)?.amountCents ?? 0n), 0n);
    expect(sum(statement.links.recovered)).toBe(statement.recoveredCents);
    expect(sum(statement.links.interest)).toBe(statement.interestCents);
  });

  it('says when no fees were paid instead of dividing by them, and refuses a malformed period or input', () => {
    const input = { periodFrom: '2026-04-01', periodTo: '2026-06-30', proofLevel: 'deposited' as const, entries: [], feesCents: cents(0n), pursuitHours: '0.00', openCases: [] };
    expect(roiStatement(input)).toMatchObject({ recoveredCents: 0n, recoveredToFees: null, approvedUnpostedCents: 0n });
    expect(() => roiStatement({ ...input, periodFrom: '2026-07-01' })).toThrow(LedgerError);
    expect(() => roiStatement({ ...input, periodTo: '2026-6-30' })).toThrow(LedgerError);
    expect(() => roiStatement({ ...input, periodFrom: 'Q2' })).toThrow(LedgerError);
    expect(() => roiStatement({ ...input, feesCents: cents(-1n) })).toThrow(LedgerError);
    expect(() => roiStatement({ ...input, pursuitHours: '3.5' })).toThrow(LedgerError);
  });

  it('nets a reversal inside the period it reverses', () => {
    const posted = make('posted', 3000n);
    const reversal = make('reversed', -3000n, { corrects: posted });
    const statement = roiStatement({ periodFrom: '2026-04-01', periodTo: '2026-06-30', proofLevel: 'posted', entries: [make('approved', 3000n), posted, reversal], feesCents: cents(100n), pursuitHours: '0.00', openCases: [] });
    expect(statement).toMatchObject({ recoveredCents: 0n, approvedUnpostedCents: 3000n, recoveredToFees: '0.00' });
  });

  it('writes the ratio with two places, half up, whatever its sign', () => {
    expect(ratioText(cents(1n), cents(3n))).toBe('0.33');
    expect(ratioText(cents(2n), cents(3n))).toBe('0.67');
    expect(ratioText(cents(-2n), cents(3n))).toBe('-0.67');
    expect(ratioText(cents(-1n), cents(1000n))).toBe('0.00');
    expect(ratioText(cents(5n), cents(0n))).toBeNull();
  });

  it('recomputes from its entries: every recovered and interest figure is the sum of the entries it links (property)', () => {
    const stage = fc.constantFrom<CountedStage>('approved', 'posted', 'deposited', 'recouped', 'interest');
    fc.assert(
      fc.property(fc.array(fc.tuple(stage, fc.bigInt({ min: 1n, max: 1_000_000n }), fc.constantFrom('2026-03-31', '2026-04-01', '2026-06-30', '2026-07-01')), { maxLength: 12 }), (items) => {
        const entries = items.map(([kind, amount, on]) => make(kind, kind === 'recouped' ? -amount : amount, { on }));
        const statement = roiStatement({ periodFrom: '2026-04-01', periodTo: '2026-06-30', proofLevel: 'deposited', entries, feesCents: cents(0n), pursuitHours: '0.00', openCases: [] });
        const byId = new Map(entries.map((entry) => [entry.id, entry]));
        const sum = (ids: readonly string[]) => ids.reduce((total, item) => total + (byId.get(item)?.amountCents ?? 0n), 0n);
        expect(sum(statement.links.recovered)).toBe(statement.recoveredCents);
        expect(sum(statement.links.interest)).toBe(statement.interestCents);
        expect(statement.approvedUnpostedCents >= 0n).toBe(true);
      }),
    );
  });
});

describe('quarters', () => {
  it('names a quarter’s dates and the quarter a day reports', () => {
    expect(quarterPeriod('2026-Q1')).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(quarterPeriod('2026-Q2')).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(quarterPeriod('2026-Q3')).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(quarterPeriod('2026-Q4')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(() => quarterPeriod('2026-Q5')).toThrow(LedgerError);
    expect(previousQuarter('2026-07-01')).toBe('2026-Q2');
    expect(previousQuarter('2026-12-31')).toBe('2026-Q3');
    expect(previousQuarter('2026-01-01')).toBe('2025-Q4');
    expect(() => previousQuarter('2026-7-1')).toThrow(LedgerError);
  });
});
