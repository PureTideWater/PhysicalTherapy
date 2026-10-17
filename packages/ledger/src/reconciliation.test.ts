import { type Cents, cents, negateCents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { RECONCILIATION_REASONS, type ReconciledToCash, type ReportReconciliationInput, reconciliationSource, reportReconciliation } from './reconciliation';
import { type CountedStage, type LedgerEntry, type ProofLevel } from './stages';
import { entriesById } from './totals';

let counter = 0;
const id = (prefix: string) => {
  counter += 1;
  return `${prefix}-${String(counter)}`;
};

const EVIDENCE: Record<CountedStage, LedgerEntry['evidenceKind']> = { approved: 'claim', posted: 'posting_row', deposited: 'eft_row', recouped: 'provider_adjustment', interest: 'provider_adjustment' };

function make(stage: CountedStage, amount: bigint, options: { line?: string | null; caseId?: string } = {}): LedgerEntry {
  return {
    id: id(stage),
    caseId: options.caseId ?? 'case-1',
    serviceLineId: options.line === undefined ? 'line-1' : options.line,
    stage,
    amountCents: cents(stage === 'recouped' ? -amount : amount),
    evidenceKind: EVIDENCE[stage],
    evidenceId: id('evidence'),
    allocated: false,
    effectiveOn: '2026-08-14',
  };
}

function reverse(target: LedgerEntry): LedgerEntry {
  return { ...target, id: id('reversed'), stage: 'reversed', evidenceKind: 'ledger_entry', evidenceId: target.id, amountCents: negateCents(target.amountCents) };
}

function adjust(target: LedgerEntry, amount: bigint): LedgerEntry {
  return { ...target, id: id('adjusted'), stage: 'adjusted', evidenceKind: 'ledger_entry', evidenceId: target.id, amountCents: cents(amount) };
}

const REPORT = { kind: 'roi_statement', id: '7d1f0c52-3c3a-4f43-9d8e-0a6b2f9c1e01' };

function input(linked: readonly LedgerEntry[], stated: Cents | null, options: { proofLevel?: ProofLevel; ledger?: readonly LedgerEntry[] } = {}): ReportReconciliationInput {
  return {
    report: REPORT,
    proofLevel: options.proofLevel ?? 'posted',
    statedRecoveredCents: stated,
    recoveredEntryIds: linked.map((entry) => entry.id),
    ledger: entriesById(options.ledger ?? linked),
  };
}

describe('reportReconciliation: the Verified gate (docs/adr/0057)', () => {
  it('names its source: the function, the report kind and its opaque ID', () => {
    expect(reconciliationSource(REPORT)).toBe('ledger.reportReconciliation(roi_statement 7d1f0c52-3c3a-4f43-9d8e-0a6b2f9c1e01)');
    expect(reportReconciliation(input([], null)).source).toBe(reconciliationSource(REPORT));
  });

  it('earns the mark when every line in the stated total has posted cash standing, net of its recoupments and reversals', () => {
    const first = make('posted', 3000n, { line: 'line-1' });
    const second = make('posted', 1200n, { line: 'line-2' });
    const secondAgain = make('posted', 300n, { line: 'line-2' });
    const recouped = make('recouped', 500n, { line: 'line-2' });
    // A posting reversed in the period nets its line to zero: the line adds nothing and is not in the total.
    const undone = make('posted', 800n, { line: 'line-3' });
    // A payer response's amount posted against the case as a whole.
    const caseLevel = make('posted', 250n, { line: null, caseId: 'case-2' });
    const linked = [first, second, secondAgain, recouped, undone, reverse(undone), caseLevel];
    const result = reportReconciliation(input(linked, cents(4250n)));
    expect(result).toEqual({
      reconciledToCash: true,
      source: reconciliationSource(REPORT),
      reason: 'reconciled',
      proofLevel: 'posted',
      recoveredCents: 4250n,
      lines: 3,
    });
  });

  it('proves by deposit when the practice does: a deposit earns it, a posting alone does not', () => {
    const deposited = make('deposited', 2000n);
    expect(reportReconciliation(input([deposited], cents(2000n), { proofLevel: 'deposited' }))).toMatchObject({ reconciledToCash: true, reason: 'reconciled', proofLevel: 'deposited', lines: 1 });
    const posted = make('posted', 2000n);
    expect(reportReconciliation(input([posted], cents(2000n), { proofLevel: 'deposited' }))).toMatchObject({ reconciledToCash: false, reason: 'entry_not_cash', recoveredCents: 0n, lines: 0 });
  });

  it('is not earned by a report that states no recovered total, or nothing recovered', () => {
    expect(reportReconciliation(input([], null))).toEqual({ reconciledToCash: false, source: reconciliationSource(REPORT), reason: 'no_recovered_total', proofLevel: 'posted', recoveredCents: 0n, lines: 0 });
    expect(reportReconciliation(input([], cents(0n)))).toMatchObject({ reconciledToCash: false, reason: 'no_recovered_total' });
    const posted = make('posted', 900n);
    const recouped = make('recouped', 1400n, { line: 'line-1' });
    expect(reportReconciliation(input([posted, recouped], cents(-500n)))).toMatchObject({ reconciledToCash: false, reason: 'no_recovered_total', recoveredCents: -500n, lines: 1 });
  });

  it('is never earned by flagged, validated, actionable or approved amounts: an approval in the total refuses it', () => {
    const approved = make('approved', 3000n);
    const posted = make('posted', 3000n);
    expect(reportReconciliation(input([approved, posted], cents(3000n)))).toMatchObject({ reconciledToCash: false, reason: 'entry_not_cash' });
    expect(reportReconciliation(input([make('interest', 41n)], cents(41n)))).toMatchObject({ reconciledToCash: false, reason: 'entry_not_cash' });
  });

  it('refuses a total that links an entry the ledger does not hold', () => {
    const posted = make('posted', 3000n);
    const elsewhere = make('posted', 100n);
    expect(reportReconciliation(input([posted, elsewhere], cents(3100n), { ledger: [posted] }))).toEqual({
      reconciledToCash: false,
      source: reconciliationSource(REPORT),
      reason: 'entry_not_in_ledger',
      proofLevel: 'posted',
      recoveredCents: 0n,
      lines: 0,
    });
  });

  it('refuses a stated total its entries do not give', () => {
    const posted = make('posted', 3000n);
    expect(reportReconciliation(input([posted], cents(3100n)))).toMatchObject({ reconciledToCash: false, reason: 'total_differs', recoveredCents: 3000n, lines: 1 });
    // An adjustment of the posting counts toward it: the entries give 2800, not the 3000 stated.
    const adjustment = adjust(posted, -200n);
    expect(reportReconciliation(input([posted, adjustment], cents(3000n)))).toMatchObject({ reconciledToCash: false, reason: 'total_differs', recoveredCents: 2800n });
    expect(reportReconciliation(input([posted, adjustment], cents(2800n)))).toMatchObject({ reconciledToCash: true, reason: 'reconciled' });
  });

  it('refuses a line whose recoupments exceed its cash, or that has no cash standing at all', () => {
    const posted = make('posted', 5000n, { line: 'line-1' });
    // A recoupment of a line posted in an earlier period: the period's total nets it, but no remittance in it proves the line.
    const recoupedOnly = make('recouped', 700n, { line: 'line-2' });
    expect(reportReconciliation(input([posted, recoupedOnly], cents(4300n)))).toMatchObject({ reconciledToCash: false, reason: 'line_not_proved', recoveredCents: 4300n, lines: 2 });
    // A recoupment adjusted up past zero leaves the line positive with no cash behind it.
    const recouped = make('recouped', 100n, { line: 'line-3' });
    const overAdjusted = adjust(recouped, 250n);
    expect(reportReconciliation(input([posted, recouped, overAdjusted], cents(5150n)))).toMatchObject({ reconciledToCash: false, reason: 'line_not_proved', lines: 2 });
  });

  it('counts a reversal toward the entry it reverses, wherever the target sits in the ledger', () => {
    const earlier = make('posted', 600n, { line: 'line-1' });
    const reversal = reverse(earlier);
    const posted = make('posted', 1000n, { line: 'line-2' });
    // Only the reversal is linked (the posting it undoes was in an earlier period): its line nets negative.
    expect(reportReconciliation(input([reversal, posted], cents(400n), { ledger: [earlier, reversal, posted] }))).toMatchObject({ reconciledToCash: false, reason: 'line_not_proved' });
  });

  it('refuses a total that links an entry twice', () => {
    const posted = make('posted', 10000n);
    const doubled: ReportReconciliationInput = { ...input([posted], cents(20000n)), recoveredEntryIds: [posted.id, posted.id] };
    expect(reportReconciliation(doubled)).toMatchObject({ reconciledToCash: false, reason: 'duplicate_entry', recoveredCents: 0n, lines: 0 });
    // Linked once, the same entry gives what it holds.
    expect(reportReconciliation(input([posted], cents(10000n)))).toMatchObject({ reconciledToCash: true, reason: 'reconciled' });
  });

  it('refuses a total whose linked posting the ledger has since reversed (a wrong match undone, LED-07)', () => {
    const posted = make('posted', 10000n, { line: 'line-1' });
    const other = make('posted', 500n, { line: 'line-2' });
    const later = reverse(posted);
    // The statement linked the posting before the reversal existed; the reversal takes the posting's date, so it is in the period.
    const result = reportReconciliation(input([posted, other], cents(10500n), { ledger: [posted, other, later] }));
    expect(result).toEqual({ reconciledToCash: false, source: reconciliationSource(REPORT), reason: 'entry_corrected_since', proofLevel: 'posted', recoveredCents: 10500n, lines: 2 });
    // Linked with its reversal (the statement made after it), the line nets to zero and the rest is proved.
    expect(reportReconciliation(input([posted, later, other], cents(500n)))).toMatchObject({ reconciledToCash: true, reason: 'reconciled', lines: 1 });
  });

  it('refuses a total whose linked posting the ledger has since adjusted, or whose linked adjustment it has since reversed', () => {
    const posted = make('posted', 4000n);
    const lower = adjust(posted, -1500n);
    expect(reportReconciliation(input([posted], cents(4000n), { ledger: [posted, lower] }))).toMatchObject({ reconciledToCash: false, reason: 'entry_corrected_since' });
    expect(reportReconciliation(input([posted, lower], cents(2500n)))).toMatchObject({ reconciledToCash: true, reason: 'reconciled' });
    // The adjustment linked, its reversal made later: the cash is back to 4000, not the 2500 the links give.
    const undone = reverse(lower);
    expect(reportReconciliation(input([posted, lower], cents(2500n), { ledger: [posted, lower, undone] }))).toMatchObject({ reconciledToCash: false, reason: 'entry_corrected_since' });
    // A later recoupment's reversal counts the same way.
    const recouped = make('recouped', 300n);
    expect(reportReconciliation(input([posted, recouped], cents(3700n), { ledger: [posted, recouped, reverse(recouped)] }))).toMatchObject({ reconciledToCash: false, reason: 'entry_corrected_since' });
    // A correction of an entry the report does not link (another period's posting) is no reason to refuse.
    const elsewhere = make('posted', 900n, { line: 'line-9' });
    expect(reportReconciliation(input([posted], cents(4000n), { ledger: [posted, elsewhere, reverse(elsewhere)] }))).toMatchObject({ reconciledToCash: true, reason: 'reconciled' });
  });

  it('refuses a report whose other figures no longer recompute from their entries', () => {
    const posted = make('posted', 3000n);
    expect(reportReconciliation({ ...input([posted], cents(3000n)), figuresMatch: false })).toMatchObject({ reconciledToCash: false, reason: 'figures_differ', recoveredCents: 3000n, lines: 1 });
    expect(reportReconciliation({ ...input([posted], cents(3000n)), figuresMatch: true })).toMatchObject({ reconciledToCash: true, reason: 'reconciled' });
  });

  it('lists every reason it can give', () => {
    expect(RECONCILIATION_REASONS).toEqual([
      'reconciled',
      'no_recovered_total',
      'entry_not_in_ledger',
      'duplicate_entry',
      'entry_not_cash',
      'entry_corrected_since',
      'total_differs',
      'line_not_proved',
      'figures_differ',
    ]);
  });

  it('is refused exactly when a linked entry was corrected after the report was made (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ posted: fc.bigInt({ min: 1n, max: 500_000n }), later: fc.constantFrom('none', 'reversed', 'adjusted') }), { minLength: 1, maxLength: 8 }),
        fc.bigInt({ min: -400_000n, max: 400_000n }).filter((amount) => amount !== 0n),
        (lines, adjustment) => {
          const postings = lines.map((line, index) => make('posted', line.posted, { line: `line-${String(index)}` }));
          const corrections = lines.flatMap((line, index) => {
            const posting = postings[index] as LedgerEntry;
            return line.later === 'reversed' ? [reverse(posting)] : line.later === 'adjusted' ? [adjust(posting, adjustment)] : [];
          });
          const total = lines.reduce((sum, line) => sum + line.posted, 0n);
          const result = reportReconciliation(input(postings, cents(total), { ledger: [...postings, ...corrections] }));
          const corrected = lines.some((line) => line.later !== 'none');
          expect(result.reconciledToCash).toBe(!corrected);
          expect(result.reason).toBe(corrected ? 'entry_corrected_since' : 'reconciled');
        },
      ),
    );
  });

  it('is earned exactly when the stated total is positive and is what its proved lines give (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.record({ posted: fc.bigInt({ min: 1n, max: 500_000n }), recouped: fc.bigInt({ min: 0n, max: 500_000n }) }), { maxLength: 8 }), fc.bigInt({ min: -10n, max: 10n }), (lines, drift) => {
        const linked = lines.flatMap((line, index) => {
          const posted = make('posted', line.posted, { line: `line-${String(index)}` });
          return line.recouped === 0n ? [posted] : [posted, make('recouped', line.recouped, { line: `line-${String(index)}` })];
        });
        const total = lines.reduce((sum, line) => sum + line.posted - line.recouped, 0n);
        const result = reportReconciliation(input(linked, cents(total + drift)));
        const proved = lines.every((line) => line.posted >= line.recouped);
        expect(result.reconciledToCash).toBe(drift === 0n && total + drift > 0n && proved);
        expect(result.recoveredCents).toBe(total);
      }),
    );
  });

  it('cannot be handed a literal true: only the ledger produces the fact the marks take', () => {
    // @ts-expect-error a literal true is not the ledger's ReconciledToCash
    const literal: false | ReconciledToCash = true;
    expect(literal).toBe(true);
  });
});
