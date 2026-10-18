import { type Cents, cents, negateCents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type CountedStage, type LedgerEntry, type ProofLevel } from './stages';
import { approvedNotProved, caseEntries, entriesById, ledgerTotals, lineEntries, lineFigures, lineLedgerStage, payerApproved, pendingForwardBalanceCents, periodEntries, recoveredCents } from './totals';

let counter = 0;
const id = (prefix: string) => {
  counter += 1;
  return `${prefix}-${String(counter)}`;
};

const EVIDENCE: Record<CountedStage, LedgerEntry['evidenceKind']> = { approved: 'claim', posted: 'posting_row', deposited: 'eft_row', recouped: 'provider_adjustment', interest: 'provider_adjustment' };

function make(stage: CountedStage, amount: bigint, options: { line?: string; caseId?: string; on?: string } = {}): LedgerEntry {
  return {
    id: id(stage),
    caseId: options.caseId ?? 'case-1',
    serviceLineId: options.line ?? 'line-1',
    stage,
    amountCents: cents(stage === 'recouped' ? -amount : amount),
    evidenceKind: EVIDENCE[stage],
    evidenceId: id('evidence'),
    allocated: false,
    effectiveOn: options.on ?? '2026-06-08',
  };
}

function reverse(target: LedgerEntry): LedgerEntry {
  return { ...target, id: id('reversed'), stage: 'reversed', evidenceKind: 'ledger_entry', evidenceId: target.id, amountCents: negateCents(target.amountCents) };
}

describe('totals (PRD 13, Entries; LED-06, LED-07)', () => {
  it('recovers the deposit less the recoupment after it, and keeps approved and posted as their own stages (LED-06)', () => {
    const entries = [make('approved', 3000n), make('posted', 3000n), make('deposited', 3000n), make('recouped', 1800n)];
    const deposited = ledgerTotals(entries, 'deposited');
    expect(deposited).toMatchObject({ approvedCents: 3000n, postedCents: 3000n, depositedCents: 3000n, recoupedCents: -1800n, interestCents: 0n, recoveredCents: 1200n, proofLevel: 'deposited' });
    expect(deposited.entryIds.recovered).toEqual([entries[2]?.id, entries[3]?.id]);
    expect(deposited.entryIds.approved).toEqual([entries[0]?.id]);
    expect(ledgerTotals(entries, 'posted').recoveredCents).toBe(1200n);
    expect(recoveredCents(entries, 'deposited')).toBe(1200n);
  });

  it('nets a reversed manual posting to zero and leaves the approval standing (LED-07)', () => {
    const approved = make('approved', 3000n);
    const posted = make('posted', 3000n);
    const entries = [approved, posted, reverse(posted)];
    expect(ledgerTotals(entries, 'posted')).toMatchObject({ approvedCents: 3000n, postedCents: 0n, recoveredCents: 0n });
    expect(lineLedgerStage(entries, 'posted')).toBe('payer_approved');
  });

  it('keeps interest beside recovered principal, never in it', () => {
    const interest = make('interest', 411n);
    const totals = ledgerTotals([make('approved', 3000n), make('posted', 3000n), interest], 'posted');
    expect(totals).toMatchObject({ recoveredCents: 3000n, interestCents: 411n });
    expect(totals.entryIds.interest).toEqual([interest.id]);
  });

  it('totals a period, a case and a line, with corrections counted from the whole ledger', () => {
    const early = make('posted', 1000n, { on: '2026-03-31' });
    const inside = make('posted', 2000n, { on: '2026-04-15', caseId: 'case-2', line: 'line-2' });
    const reversal = { ...reverse(early), effectiveOn: '2026-04-02' };
    const ledger = [early, inside, reversal];
    const period = periodEntries(ledger, '2026-04-01', '2026-06-30');
    expect(period).toEqual([inside, reversal]);
    expect(ledgerTotals(period, 'posted', entriesById(ledger)).recoveredCents).toBe(1000n);
    expect(caseEntries(ledger, 'case-2')).toEqual([inside]);
    expect(lineEntries(ledger, 'line-1')).toEqual([early, reversal]);
  });

  it('holds forward balances pending, outside every total', () => {
    expect(pendingForwardBalanceCents([{ providerAdjustmentId: 'fb-1', amountCents: cents(2500n) }, { providerAdjustmentId: 'fb-2', amountCents: cents(-500n) }])).toBe(2000n);
    expect(pendingForwardBalanceCents([])).toBe(0n);
  });
});

describe('a line’s stage from the ledger (PRD 8, The status machine; PRD 13, Recoupments and reversals)', () => {
  it('is nothing without an approval, and payer approved until the proof level covers it', () => {
    expect(lineLedgerStage([], 'posted')).toBeNull();
    expect(lineLedgerStage([make('posted', 3000n)], 'posted')).toBeNull();
    const approved = make('approved', 3000n);
    expect(lineLedgerStage([approved, reverse(approved)], 'posted')).toBeNull();
    expect(lineLedgerStage([approved], 'posted')).toBe('payer_approved');
    expect(lineLedgerStage([approved, make('posted', 1800n)], 'posted')).toBe('payer_approved');
    expect(lineLedgerStage([approved, make('posted', 3000n)], 'posted')).toBe('recovered');
  });

  it('is recovered only at the practice’s proof level', () => {
    const entries = [make('approved', 3000n), make('posted', 3000n)];
    expect(lineLedgerStage(entries, 'posted')).toBe('recovered');
    expect(lineLedgerStage(entries, 'deposited')).toBe('payer_approved');
    expect(lineLedgerStage([...entries, make('deposited', 3000n)], 'deposited')).toBe('recovered');
  });

  it('reopens on a recoupment, back to actionable, until the payer approves again and the proof covers it (LED-06)', () => {
    const entries = [make('approved', 3000n), make('posted', 3000n), make('deposited', 3000n), make('recouped', 1800n)];
    expect(lineLedgerStage(entries, 'deposited')).toBeNull();
    const reapproved = [...entries, make('approved', 1800n)];
    expect(lineLedgerStage(reapproved, 'deposited')).toBe('payer_approved');
    expect(lineLedgerStage([...reapproved, make('deposited', 1800n)], 'deposited')).toBe('recovered');
    expect(lineLedgerStage([make('approved', 3000n), make('recouped', 1000n), make('posted', 3000n)], 'posted')).toBeNull();
  });

  it('does not count an entry a reversal undid', () => {
    const recoupment = make('recouped', 1000n);
    const entries = [make('approved', 3000n), make('posted', 3000n), recoupment, reverse(recoupment)];
    expect(lineLedgerStage(entries, 'posted')).toBe('recovered');
    const posted = make('posted', 3000n);
    expect(lineLedgerStage([make('approved', 3000n), posted, reverse(posted)], 'posted')).toBe('payer_approved');
  });
});

describe('payer approved as the headline shows it (PRD 12; PRD 13, ROI statement)', () => {
  const figures = (approved: bigint, proved: bigint, recouped: bigint) => ({ approvedCents: cents(approved), provedCents: cents(proved), recoupedCents: cents(-recouped), entryIds: [] });

  it('takes back from payer approved only what was recouped before it was proved', () => {
    // A recoupment after the proof reduces recovered; the approval stands (LED-06).
    expect(payerApproved(figures(3000n, 3000n, 1800n))).toBe(3000n);
    // Taken back before it posted: nothing is left approved, and nothing waits to post.
    expect(payerApproved(figures(3000n, 0n, 3000n))).toBe(0n);
    expect(approvedNotProved(figures(3000n, 0n, 3000n))).toBe(0n);
    expect(payerApproved(figures(3000n, 0n, 1800n))).toBe(1200n);
    expect(approvedNotProved(figures(3000n, 0n, 1800n))).toBe(1200n);
    expect(payerApproved(figures(3000n, 1000n, 3000n))).toBe(1000n);
    expect(approvedNotProved(figures(3000n, 1000n, 0n))).toBe(2000n);
    expect(payerApproved(figures(0n, 0n, 0n))).toBe(0n);
    expect(payerApproved(figures(-100n, 0n, 0n))).toBe(0n);
  });

  it('sums it per line in the totals, and groups a case’s own approval by its case', () => {
    const entries = [make('approved', 3000n), make('recouped', 3000n), make('approved', 2000n, { line: 'line-2' }), make('posted', 2000n, { line: 'line-2' }), make('recouped', 500n, { line: 'line-2' })];
    const totals = ledgerTotals(entries, 'posted');
    expect(totals).toMatchObject({ approvedCents: 5000n, payerApprovedCents: 2000n, recoveredCents: -1500n });
    const caseLevel: LedgerEntry = { ...make('approved', 900n), serviceLineId: null, caseId: 'case-2' };
    const groups = lineFigures([...entries, caseLevel, make('interest', 10n)], 'posted', entriesById([...entries, caseLevel]));
    expect([...groups.keys()]).toEqual(['line-1', 'line-2', 'case:case-2']);
    expect(groups.get('line-2')).toMatchObject({ approvedCents: 2000n, provedCents: 2000n, recoupedCents: -500n });
  });
});

// Properties ------------------------------------------------------------------------------------

const proofLevel = fc.constantFrom<ProofLevel>('posted', 'deposited');
const amount = fc.bigInt({ min: 1n, max: 10_000_000n });
const counted = fc.constantFrom<CountedStage>('approved', 'posted', 'deposited', 'recouped', 'interest');
const ledgerArbitrary = fc.array(fc.tuple(counted, amount, fc.constantFrom('line-1', 'line-2')), { maxLength: 12 }).map((items) => {
  const entries = items.map(([stage, value, line]) => make(stage, value, { line }));
  return entries;
});
const reversible = fc.constantFrom<CountedStage>('approved', 'posted', 'deposited', 'interest');

describe('ledger properties (PRD 18: property tests on every pure function)', () => {
  it('a reversed manual match nets to zero: the ledger’s totals are as if it had never been matched', () => {
    fc.assert(
      fc.property(ledgerArbitrary, fc.array(fc.tuple(reversible, amount), { minLength: 1, maxLength: 4 }), proofLevel, (base, matched, level) => {
        const match = matched.map(([stage, value]) => make(stage, value));
        const withReversal = [...base, ...match, ...match.map(reverse)];
        const before = ledgerTotals(base, level);
        const after = ledgerTotals(withReversal, level);
        expect({ ...after, entryIds: undefined }).toEqual({ ...before, entryIds: undefined });
      }),
    );
  });

  it('a recoupment reduces recovered by exactly its amount and changes no other stage', () => {
    fc.assert(
      fc.property(ledgerArbitrary, amount, proofLevel, (base, value, level) => {
        const before = ledgerTotals(base, level);
        const after = ledgerTotals([...base, make('recouped', value)], level);
        expect(after.recoveredCents).toBe(before.recoveredCents - value);
        expect([after.approvedCents, after.postedCents, after.depositedCents, after.interestCents]).toEqual([before.approvedCents, before.postedCents, before.depositedCents, before.interestCents]);
      }),
    );
  });

  it('totals never mix stages: approvals and interest never move recovered, and the proof level only chooses posted or deposited', () => {
    fc.assert(
      fc.property(ledgerArbitrary, fc.constantFrom<CountedStage>('approved', 'interest'), amount, proofLevel, (base, stage, value, level) => {
        expect(ledgerTotals([...base, make(stage, value)], level).recoveredCents).toBe(ledgerTotals(base, level).recoveredCents);
        const posted = ledgerTotals(base, 'posted');
        const deposited = ledgerTotals(base, 'deposited');
        expect(posted.recoveredCents - deposited.recoveredCents).toBe(posted.postedCents - deposited.depositedCents);
        const stages: Cents[] = [posted.approvedCents, posted.postedCents, posted.depositedCents, posted.recoupedCents, posted.interestCents];
        expect(stages.reduce((sum, item) => sum + item, 0n)).toBe(base.reduce((sum, item) => sum + item.amountCents, 0n));
      }),
    );
  });

  it('nothing is recovered without a posted or deposited entry (the flagged-as-recovered shortcut)', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom<CountedStage>('approved', 'recouped', 'interest'), amount), { maxLength: 10 }), proofLevel, (items, level) => {
        const entries = items.map(([stage, value]) => make(stage, value));
        expect(ledgerTotals(entries, level).recoveredCents <= 0n).toBe(true);
        expect(lineLedgerStage(entries, level)).not.toBe('recovered');
      }),
    );
  });
});
