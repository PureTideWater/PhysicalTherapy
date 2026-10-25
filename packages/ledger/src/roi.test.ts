import { cents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { previousQuarter, quarterOf, quarterPeriod, ratioText, roiStatement } from './roi';
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

  it('nets what a recoupment took back of an approval that never posted out of approved but not posted', () => {
    const approved = make('approved', 3000n);
    const taken = make('recouped', -3000n);
    const input = { periodFrom: '2026-04-01', periodTo: '2026-06-30', proofLevel: 'posted' as const, feesCents: cents(0n), pursuitHours: '0.00', openCases: [] };
    expect(roiStatement({ ...input, entries: [approved, taken] })).toMatchObject({ approvedUnpostedCents: 0n, recoveredCents: -3000n, links: { approvedUnposted: [] } });
    const part = make('recouped', -1800n);
    expect(roiStatement({ ...input, entries: [approved, part] })).toMatchObject({ approvedUnpostedCents: 1200n, links: { approvedUnposted: [approved.id, part.id] } });
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
    expect(quarterOf('2026-10-16')).toBe('2026-Q4');
    expect(quarterOf('2026-03-31')).toBe('2026-Q1');
    expect(quarterPeriod(quarterOf('2026-05-15'))).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(() => quarterOf('16 October 2026')).toThrow(LedgerError);
  });
});

describe('the ROI statement’s inputs and quarters, each held whole', () => {
  const input = { periodFrom: '2026-04-01', periodTo: '2026-06-30', proofLevel: 'posted' as const, entries: [], feesCents: cents(0n), pursuitHours: '0.00', openCases: [] };

  it('reads a period’s dates only as whole calendar dates', () => {
    expect(() => roiStatement({ ...input, periodTo: 'x2026-06-30' })).toThrow(LedgerError);
    expect(() => roiStatement({ ...input, periodFrom: '2026-04-01T00:00' })).toThrow(LedgerError);
  });

  it('covers a period of one day', () => {
    const posted = make('posted', 3000n, { on: '2026-06-30' });
    expect(roiStatement({ ...input, periodFrom: '2026-06-30', entries: [posted] })).toMatchObject({ periodFrom: '2026-06-30', periodTo: '2026-06-30', recoveredCents: 3000n });
  });

  it('takes pursuit hours of one to seven whole digits and two places, and nothing else', () => {
    for (const hours of ['12.50', '1234567.00', '0.25']) {
      expect(roiStatement({ ...input, pursuitHours: hours }).pursuitHours).toBe(hours);
    }
    for (const hours of ['x3.50', '3.505', '12345678.00', '01.50', '1x.50', '.50']) {
      expect(() => roiStatement({ ...input, pursuitHours: hours }), hours).toThrow(LedgerError);
    }
  });

  it('counts an approval made on the period’s last day as approved but not yet posted', () => {
    const approved = make('approved', 3000n, { on: '2026-06-30' });
    expect(roiStatement({ ...input, entries: [approved] })).toMatchObject({ approvedUnpostedCents: 3000n, links: { approvedUnposted: [approved.id] } });
  });

  it('writes nothing recovered as a ratio of zero', () => {
    expect(ratioText(cents(0n), cents(1500n))).toBe('0.00');
  });

  it('reads a quarter and a day only as the whole text', () => {
    for (const quarter of ['x2026-Q2', '2026-Q23']) {
      expect(() => quarterPeriod(quarter), quarter).toThrow(LedgerError);
    }
    for (const day of ['x2026-07-01', '2026-07-011']) {
      expect(() => quarterOf(day), day).toThrow(LedgerError);
      expect(() => previousQuarter(day), day).toThrow(LedgerError);
    }
  });
});
