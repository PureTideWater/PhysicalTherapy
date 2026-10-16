import { cents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { type LedgerEntry, LedgerError, correctedEntry, countedStage, entryProblems, isCorrecting, isLedgerStage, isProofLevel } from './stages';

const entry = (overrides: Partial<LedgerEntry>): LedgerEntry => ({
  id: 'e1',
  caseId: 'case-1',
  serviceLineId: 'line-1',
  stage: 'approved',
  amountCents: cents(3000n),
  evidenceKind: 'claim',
  evidenceId: 'claim-1',
  allocated: false,
  effectiveOn: '2026-06-08',
  ...overrides,
});

describe('entry rules (PRD 13, Entries)', () => {
  it('accepts an entry of each counted stage with its evidence and sign', () => {
    expect(entryProblems(entry({}))).toEqual([]);
    expect(entryProblems(entry({ stage: 'approved', evidenceKind: 'payer_response' }))).toEqual([]);
    expect(entryProblems(entry({ stage: 'posted', evidenceKind: 'posting_row', allocated: true }))).toEqual([]);
    expect(entryProblems(entry({ stage: 'deposited', evidenceKind: 'eft_row' }))).toEqual([]);
    expect(entryProblems(entry({ stage: 'recouped', evidenceKind: 'provider_adjustment', amountCents: cents(-1800n) }))).toEqual([]);
    expect(entryProblems(entry({ stage: 'recouped', evidenceKind: 'claim', amountCents: cents(-1800n) }))).toEqual([]);
    expect(entryProblems(entry({ stage: 'interest', evidenceKind: 'provider_adjustment', amountCents: cents(411n) }))).toEqual([]);
  });

  it('refuses the wrong evidence, the wrong sign and an allocation outside postings, deposits and interest', () => {
    expect(entryProblems(entry({ stage: 'posted', evidenceKind: 'claim' }))).toEqual(["a posted entry's evidence is a posting_row"]);
    expect(entryProblems(entry({ amountCents: cents(0n) }))).toEqual(['a approved entry is positive']);
    expect(entryProblems(entry({ stage: 'deposited', evidenceKind: 'eft_row', amountCents: cents(-1n) }))).toEqual(['a deposited entry is positive']);
    expect(entryProblems(entry({ stage: 'recouped', evidenceKind: 'claim', amountCents: cents(1800n) }))).toEqual(['a recouped entry is negative']);
    expect(entryProblems(entry({ stage: 'recouped', evidenceKind: 'claim', amountCents: cents(-1n), allocated: true }))).toEqual(['a recouped entry is never allocated']);
    expect(entryProblems(entry({ allocated: true, evidenceKind: 'payer_response' }))).toEqual([]);
  });

  it('holds a reversal to exactly offsetting its entry, of its case and line, and never a correction of a correction', () => {
    const posted = entry({ id: 'p', stage: 'posted', evidenceKind: 'posting_row' });
    const reversal = entry({ id: 'r', stage: 'reversed', evidenceKind: 'ledger_entry', evidenceId: 'p', amountCents: cents(-3000n) });
    expect(entryProblems(reversal, posted)).toEqual([]);
    expect(entryProblems({ ...reversal, amountCents: cents(-2999n) }, posted)).toEqual(['a reversal offsets its entry exactly']);
    expect(entryProblems(reversal)).toEqual(['a reversed entry names the entry it corrects']);
    expect(entryProblems(reversal, { ...posted, id: 'other' })).toEqual(['a reversed entry names the entry it corrects']);
    expect(entryProblems(reversal, { ...posted, serviceLineId: 'line-2' })).toEqual(['a correction is of its own case and line']);
    expect(entryProblems(reversal, { ...posted, caseId: 'case-2' })).toEqual(['a correction is of its own case and line']);
    const doubled = entry({ id: 'x', stage: 'reversed', evidenceKind: 'ledger_entry', evidenceId: 'r', amountCents: cents(3000n) });
    expect(entryProblems(doubled, reversal)).toEqual(['a correction corrects an entry of a counted stage, or a reversal an adjustment']);
    // A reversal may offset an adjustment exactly (a reversed match nets its adjustments to zero); an adjustment of one may not.
    const adjustment = entry({ id: 'a', stage: 'adjusted', evidenceKind: 'ledger_entry', evidenceId: 'p', amountCents: cents(-1000n) });
    expect(entryProblems(entry({ id: 'ra', stage: 'reversed', evidenceKind: 'ledger_entry', evidenceId: 'a', amountCents: cents(1000n) }), adjustment)).toEqual([]);
    expect(entryProblems(entry({ id: 'aa', stage: 'adjusted', evidenceKind: 'ledger_entry', evidenceId: 'a', amountCents: cents(5n) }), adjustment)).toEqual([
      'a correction corrects an entry of a counted stage, or a reversal an adjustment',
    ]);
  });

  it('lets an adjustment change an amount either way, never by nothing', () => {
    const posted = entry({ id: 'p', stage: 'posted', evidenceKind: 'posting_row' });
    expect(entryProblems(entry({ stage: 'adjusted', evidenceKind: 'ledger_entry', evidenceId: 'p', amountCents: cents(-100n) }), posted)).toEqual([]);
    expect(entryProblems(entry({ stage: 'adjusted', evidenceKind: 'ledger_entry', evidenceId: 'p', amountCents: cents(100n) }), posted)).toEqual([]);
    expect(entryProblems(entry({ stage: 'adjusted', evidenceKind: 'ledger_entry', evidenceId: 'p', amountCents: cents(0n) }), posted)).toEqual(['an adjustment changes an amount']);
  });

  it('counts a correction toward the stage of the entry it corrects', () => {
    const posted = entry({ id: 'p', stage: 'posted', evidenceKind: 'posting_row' });
    const reversal = entry({ id: 'r', stage: 'reversed', evidenceKind: 'ledger_entry', evidenceId: 'p', amountCents: cents(-3000n) });
    const ledger = new Map([posted, reversal].map((item) => [item.id, item]));
    expect(countedStage(posted, ledger)).toBe('posted');
    expect(countedStage(reversal, ledger)).toBe('posted');
    expect(() => countedStage(reversal, new Map())).toThrow(LedgerError);
    expect(() => countedStage(entry({ stage: 'reversed', evidenceKind: 'ledger_entry', evidenceId: 'r' }), ledger)).toThrow(LedgerError);
  });

  it('counts a reversal of an adjustment toward the stage the adjustment corrects', () => {
    const posted = entry({ id: 'p', stage: 'posted', evidenceKind: 'posting_row' });
    const adjustment = entry({ id: 'a', stage: 'adjusted', evidenceKind: 'ledger_entry', evidenceId: 'p', amountCents: cents(-1000n) });
    const undo = entry({ id: 'u', stage: 'reversed', evidenceKind: 'ledger_entry', evidenceId: 'a', amountCents: cents(1000n) });
    const ledger = new Map([posted, adjustment, undo].map((item) => [item.id, item]));
    expect(countedStage(undo, ledger)).toBe('posted');
    expect(correctedEntry(undo, ledger)).toBe(posted);
    expect(correctedEntry(posted, ledger)).toBe(posted);
    // An adjustment of an adjustment, or a reversal whose adjustment's target is gone, counts toward nothing.
    expect(() => countedStage(entry({ id: 'x', stage: 'adjusted', evidenceKind: 'ledger_entry', evidenceId: 'a', amountCents: cents(1n) }), ledger)).toThrow(LedgerError);
    expect(() => countedStage(undo, new Map([[adjustment.id, adjustment]]))).toThrow(LedgerError);
  });

  it('names its stages and proof levels', () => {
    expect(isLedgerStage('interest')).toBe(true);
    expect(isLedgerStage('recovered')).toBe(false);
    expect(isLedgerStage(3)).toBe(false);
    expect(isProofLevel('deposited')).toBe(true);
    expect(isProofLevel('approved')).toBe(false);
    expect(isProofLevel(null)).toBe(false);
    expect(isCorrecting('adjusted')).toBe(true);
    expect(isCorrecting('posted')).toBe(false);
  });
});
