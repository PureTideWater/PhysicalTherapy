import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { CorrectionView, MatchView } from '../../lib/reconciliation/queries';
import { LedgerTotals, LineCorrectionWords, correctionWords, outcomeWords } from './display';

/**
 * The Reconciliation screen's words in payment terms (PRD 13, Matching step 1; docs/adr/0067; design review S5): a
 * claim match's outcome names the payer's payment beside the allowed amount where the two differ, and a case line's
 * corrections say what they leave billable to the patient, counted in no total. SYNTHETIC amounts.
 */

const text = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node).replace(/<[^>]+>/g, '').replaceAll('&#x27;', '’').replaceAll('&amp;', '&');

type Reading = Pick<MatchView, 'outcome' | 'reading' | 'allowed' | 'paymentIncreaseCents'>;
const words = (match: Reading) => text(<>{correctionWords(match)}</>);

describe('a claim match’s outcome in words', () => {
  it('keeps “higher allowed: approved” for an ordinary approval and says what the payer pays more', () => {
    expect(words({ outcome: 'approved', reading: 'approved', allowed: 'higher', paymentIncreaseCents: '2400' })).toBe('higher allowed: approved; the payer pays $24.00 more');
    // A confirmation of a payer response's acceptance is an approval the remittance paid.
    expect(words({ outcome: 'approved', reading: 'confirmed', allowed: 'higher', paymentIncreaseCents: '2400' })).toBe('higher allowed: approved; the payer pays $24.00 more');
    expect(outcomeWords('approved')).toBe('higher allowed: approved');
  });

  it('says whose the balance is when a correction pays nothing more', () => {
    expect(words({ outcome: 'approved', reading: 'patient_balance', allowed: 'higher', paymentIncreaseCents: '0' })).toBe('higher allowed: payer corrected; balance is the patient’s');
    expect(words({ outcome: 'approved', reading: 'other_reductions', allowed: 'higher', paymentIncreaseCents: '0' })).toBe('higher allowed: payer corrected; it pays nothing more (other reductions)');
  });

  it('names the allowed amount and the payment of a decrease, and whether anything was taken back (Q2, B2)', () => {
    expect(words({ outcome: 'decreased', reading: 'taken_back', allowed: 'higher', paymentIncreaseCents: '-1000' })).toBe('higher allowed, lower payment: approval taken back');
    expect(words({ outcome: 'decreased', reading: 'taken_back', allowed: 'same', paymentIncreaseCents: '-1000' })).toBe('same allowed, lower payment: approval taken back');
    expect(words({ outcome: 'decreased', reading: 'taken_back', allowed: 'lower', paymentIncreaseCents: '-1000' })).toBe('lower allowed: approval taken back');
    expect(words({ outcome: 'decreased', reading: 'nothing_to_take_back', allowed: 'higher', paymentIncreaseCents: '-600' })).toBe('higher allowed, lower payment: nothing approved to take back');
    expect(words({ outcome: 'decreased', reading: 'payment_did_not_fall', allowed: 'lower', paymentIncreaseCents: '0' })).toBe('lower allowed: nothing taken back, the payment did not fall');
    expect(words({ outcome: 'no_change', reading: 'no_change', allowed: 'same', paymentIncreaseCents: '0' })).toBe('no change');
  });

  it('keeps its outcome’s words for a match the payment reading does not cover (a reversed one)', () => {
    expect(words({ outcome: 'approved', reading: null, allowed: null, paymentIncreaseCents: null })).toBe('higher allowed: approved');
    expect(words({ outcome: 'decreased', reading: null, allowed: null, paymentIncreaseCents: null })).toBe('lower allowed: approval taken back');
  });
});

const COINSURANCE: CorrectionView = {
  kind: null,
  billable: { billableCents: '600', allowedIncreaseCents: '3000', paymentIncreaseCents: '2400', otherReductionCents: '0', reasons: { deductible: '0', coinsurance: '600', copay: '0', other: '0' }, allocation: null },
};

describe('a case line’s corrections beside the ledger', () => {
  it('says what is billable to the patient by reason, the allowed amount, then the payer’s payment, counted in no total', () => {
    const shown = text(<LineCorrectionWords correction={COINSURANCE} />);
    expect(shown).toBe('Billable to the patient: $6.00 (coinsurance +$6.00). The payer raised the allowed amount by $30.00 and pays $24.00 of it; the rest is the patient’s share, counted in no total.');
    expect(renderToStaticMarkup(<LineCorrectionWords correction={COINSURANCE} />)).toContain('data-billable="600"');
    expect(shown).not.toMatch(/recovered/i);
  });

  it('lists each signed change with their net, and names the patient’s share alone to a reader who does not read PHI (N1)', () => {
    const mixed: CorrectionView = { kind: null, billable: { ...(COINSURANCE.billable as NonNullable<CorrectionView['billable']>), billableCents: '600', reasons: { deductible: '-1000', coinsurance: '1600', copay: '0', other: '0' } } };
    expect(text(<LineCorrectionWords correction={mixed} />)).toContain('Billable to the patient: $6.00 (deductible −$10.00, coinsurance +$16.00).');
    const hidden: CorrectionView = { kind: null, billable: { ...(COINSURANCE.billable as NonNullable<CorrectionView['billable']>), reasons: null } };
    const shown = text(<LineCorrectionWords correction={hidden} />);
    expect(shown).toContain('Billable to the patient: $6.00 (the patient’s share).');
    expect(shown).not.toMatch(/coinsurance|deductible|copay/);
  });

  it('says the payer’s other reductions apart from the patient’s share, never billable', () => {
    const reduced: CorrectionView = { kind: null, billable: { ...(COINSURANCE.billable as NonNullable<CorrectionView['billable']>), paymentIncreaseCents: '1400', otherReductionCents: '1000' } };
    expect(text(<LineCorrectionWords correction={reduced} />)).toContain('pays $14.00 of it; of the rest, $6.00 is the patient’s share, counted in no total, and $10.00 was reduced by the payer for other reasons, not billable.');
  });

  it('says a correction the deductible took whole is the patient’s balance, with no entry, never recovered and never no change', () => {
    const balance: CorrectionView = {
      kind: 'patient_balance',
      billable: { billableCents: '3000', allowedIncreaseCents: '3000', paymentIncreaseCents: '0', otherReductionCents: '0', reasons: { deductible: '3000', coinsurance: '0', copay: '0', other: '0' }, allocation: null },
    };
    const shown = text(<LineCorrectionWords correction={balance} />);
    expect(shown).toBe('Payer corrected; balance is the patient’s. The payer raised the allowed amount by $30.00 and pays nothing more: the patient’s deductible took all of it. No ledger entry is written; counted in no total.');
    expect(text(<LineCorrectionWords correction={{ ...balance, billable: { ...(balance.billable as NonNullable<CorrectionView['billable']>), reasons: null } }} />)).toContain('the patient’s share took all of it');
    expect(shown).not.toMatch(/recovered|no change/i);
  });

  it('says a correction other reductions took whole pays nothing more, not billable to the patient (S13)', () => {
    const other: CorrectionView = {
      kind: 'other_reductions',
      billable: { billableCents: '0', allowedIncreaseCents: '3000', paymentIncreaseCents: '0', otherReductionCents: '3000', reasons: { deductible: '0', coinsurance: '0', copay: '0', other: '0' }, allocation: null },
    };
    expect(text(<LineCorrectionWords correction={other} />)).toBe(
      'Payer corrected; it pays nothing more (other reductions). The payer raised the allowed amount by $30.00 and reduced its payment by the same for other reasons, not billable to the patient. No ledger entry is written; counted in no total.',
    );
  });

  it('says nothing when the corrections leave the patient nothing to bill, or the line stands on its original payment', () => {
    expect(renderToStaticMarkup(<LineCorrectionWords correction={{ kind: null, billable: { ...(COINSURANCE.billable as NonNullable<CorrectionView['billable']>), billableCents: '0', reasons: { deductible: '0', coinsurance: '0', copay: '0', other: '0' } } }} />)).toBe('');
    expect(renderToStaticMarkup(<LineCorrectionWords correction={{ kind: null, billable: null }} />)).toBe('');
    expect(renderToStaticMarkup(<LineCorrectionWords correction={undefined} />)).toBe('');
  });

  it('names a share allocated from the claim’s level with its exact fraction', () => {
    const allocated: CorrectionView = { kind: null, billable: { ...(COINSURANCE.billable as NonNullable<CorrectionView['billable']>), allocation: { lineChargeCents: '15000', claimChargeCents: '30000' } } };
    expect(text(<LineCorrectionWords correction={allocated} />)).toContain('The patient’s share is the claim’s, allocated to the line by charge ($150.00 of $300.00).');
  });
});

describe('the ledger’s totals', () => {
  it('notes payer approved as what payers have agreed to pay, never the patient’s share', () => {
    const shown = text(
      <LedgerTotals
        totals={{ proofLevel: 'deposited', approvedCents: '2400', payerApprovedCents: '2400', postedCents: '0', depositedCents: '2400', recoupedCents: '0', interestCents: '0', recoveredCents: '2400' }}
        title="Ledger totals"
        description="By stage."
      />,
    );
    expect(shown).toContain(
      'Payer approved$24.00what payers have agreed to pay on the lines they corrected, never the patient’s share, net of reversals and of what was taken back before it posted; recovered only once it is posted or deposited',
    );
  });
});
