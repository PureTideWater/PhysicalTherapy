import { type CountedStage, type LedgerEntry, type ProofLevel, countedStage, entriesById, ledgerTotals, periodEntries, quarterPeriod } from '@tp/ledger';
import { cents, centsToString, negateCents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { recoveredPeriods } from './statements';

/**
 * recoveredPeriods (the practice home's Recovered tile, to date and this quarter; docs/adr/0082; test matrix HOM-01):
 * on SYNTHETIC ledgers whose reversals and adjustments may fall either side of the quarter's boundary from the entries
 * they correct, it gives exactly what practiceLedgerTotals gives for all time and for the quarter (the period's entries
 * totalled against the whole ledger), and the earliest date of the entries recovered to date sums.
 */

const QUARTER = quarterPeriod('2026-Q4');
/** Days either side of the quarter's start, and inside and past its end. */
const DAYS = ['2026-06-09', '2026-08-15', '2026-09-30', '2026-10-01', '2026-11-15', '2026-12-31', '2027-01-01'] as const;
const COUNTED: readonly CountedStage[] = ['approved', 'posted', 'deposited', 'recouped', 'interest'];

interface Step {
  readonly kind: 'entry' | 'reversal' | 'adjustment';
  readonly stage: number;
  readonly amount: number;
  readonly day: number;
  /** Which earlier entry a correction names (modulo the entries it may correct). */
  readonly target: number;
}

const step = fc.record({
  kind: fc.constantFrom<Step['kind']>('entry', 'entry', 'entry', 'reversal', 'adjustment'),
  stage: fc.nat({ max: COUNTED.length - 1 }),
  amount: fc.integer({ min: 1, max: 500_000 }),
  day: fc.nat({ max: DAYS.length - 1 }),
  target: fc.nat(),
});

/** A ledger that keeps the ledger's rules: a reversal offsets its entry exactly, an adjustment is non-zero, each names an earlier entry. */
function ledgerOf(steps: readonly Step[]): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  const reversed = new Set<string>();
  for (const [index, item] of steps.entries()) {
    const id = `entry-${String(index)}`;
    const day = DAYS[item.day] as string;
    const base = { id, caseId: 'case-1', serviceLineId: `line-${String(item.target % 3)}`, evidenceKind: 'ledger_entry' as const, allocated: false, effectiveOn: day };
    const correctable = entries.filter((entry) => !reversed.has(entry.id) && (item.kind === 'reversal' ? entry.stage !== 'reversed' : COUNTED.includes(entry.stage as CountedStage)));
    const target = correctable[item.target % Math.max(correctable.length, 1)];
    if (item.kind === 'entry' || target === undefined) {
      const stage = COUNTED[item.stage] as CountedStage;
      entries.push({ ...base, stage, amountCents: cents(BigInt(stage === 'recouped' ? -item.amount : item.amount)), evidenceKind: 'claim', evidenceId: `evidence-${String(index)}` });
    } else if (item.kind === 'reversal') {
      reversed.add(target.id);
      entries.push({ ...base, caseId: target.caseId, serviceLineId: target.serviceLineId, stage: 'reversed', amountCents: negateCents(target.amountCents), evidenceId: target.id });
    } else {
      entries.push({ ...base, caseId: target.caseId, serviceLineId: target.serviceLineId, stage: 'adjusted', amountCents: cents(BigInt(item.amount % 2 === 0 ? item.amount : -item.amount)), evidenceId: target.id });
    }
  }
  return entries;
}

/** practiceLedgerTotals' composition for a period, from entries already read. */
const totalsOver = (all: readonly LedgerEntry[], proofLevel: ProofLevel, from: string, to: string) => ledgerTotals(periodEntries(all, from, to), proofLevel, entriesById(all));

/** The earliest date of the entries counted toward the proof level or recouped, read on its own. */
function firstRecovered(all: readonly LedgerEntry[], proofLevel: ProofLevel): string | null {
  const byId = entriesById(all);
  const days = all.filter((entry) => [proofLevel, 'recouped'].includes(countedStage(entry, byId))).map((entry) => entry.effectiveOn);
  return days.length === 0 ? null : [...days].sort()[0] ?? null;
}

/** Totals as text (amounts through centsToString only) and their entries. */
const shown = (totals: ReturnType<typeof ledgerTotals>) => ({
  recovered: centsToString(totals.recoveredCents),
  payerApproved: centsToString(totals.payerApprovedCents),
  approved: centsToString(totals.approvedCents),
  interest: centsToString(totals.interestCents),
  proofLevel: totals.proofLevel,
  entryIds: totals.entryIds,
});

describe('recoveredPeriods: to date and this quarter from one ledger (HOM-01)', () => {
  it('equals practiceLedgerTotals for all time and for the quarter, corrections crossing the boundary included, with the first recovered date', () => {
    fc.assert(
      fc.property(fc.array(step, { maxLength: 40 }), fc.constantFrom<ProofLevel>('posted', 'deposited'), (steps, proofLevel) => {
        const all = ledgerOf(steps);
        const periods = recoveredPeriods(all, proofLevel, QUARTER);
        expect(shown(periods.toDate)).toEqual(shown(totalsOver(all, proofLevel, '0001-01-01', '9999-12-31')));
        expect(shown(periods.period)).toEqual(shown(totalsOver(all, proofLevel, QUARTER.from, QUARTER.to)));
        expect(periods.firstOn).toBe(firstRecovered(all, proofLevel));
        expect(periods.firstOn === null).toBe(periods.toDate.entryIds.recovered.length === 0);
      }),
      { numRuns: 500 },
    );
  });

  it('nets a reversal dated in the quarter against a posting before it, where totalling the quarter alone would throw', () => {
    const posted: LedgerEntry = { id: 'p', caseId: 'c', serviceLineId: 'l', stage: 'posted', amountCents: cents(1200n), evidenceKind: 'posting_row', evidenceId: 'row', allocated: false, effectiveOn: '2026-09-30' };
    const reversal: LedgerEntry = { ...posted, id: 'r', stage: 'reversed', amountCents: cents(-1200n), evidenceKind: 'ledger_entry', evidenceId: 'p', effectiveOn: '2026-10-02' };
    const all = [posted, reversal];
    expect(() => ledgerTotals(periodEntries(all, QUARTER.from, QUARTER.to), 'posted')).toThrow();
    const periods = recoveredPeriods(all, 'posted', QUARTER);
    expect([centsToString(periods.toDate.recoveredCents), centsToString(periods.period.recoveredCents), periods.firstOn]).toEqual(['0', '-1200', '2026-09-30']);
  });

  it('reads nothing recovered, and no first date, from approvals and interest alone', () => {
    const approved: LedgerEntry = { id: 'a', caseId: 'c', serviceLineId: 'l', stage: 'approved', amountCents: cents(3000n), evidenceKind: 'payer_response', evidenceId: 'response', allocated: false, effectiveOn: '2026-06-09' };
    const interest: LedgerEntry = { ...approved, id: 'i', stage: 'interest', amountCents: cents(50n), evidenceKind: 'claim', evidenceId: 'claim' };
    const periods = recoveredPeriods([approved, interest], 'deposited', QUARTER);
    expect([centsToString(periods.toDate.recoveredCents), centsToString(periods.toDate.payerApprovedCents), periods.firstOn]).toEqual(['0', '3000', null]);
  });
});
