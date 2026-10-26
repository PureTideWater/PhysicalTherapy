import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { CorrectionView, MatchView } from '../../lib/reconciliation/queries';
import { LEDGER_TOTALS_HELP, LedgerTotals, LineCorrectionWords, PATIENT_BALANCE_NEXT_STEP, correctionWords, lineEntriesEmptyText, outcomeWords, showsBillableFact } from './display';

/**
 * The Reconciliation screen's words in payment terms (PRD 13, Matching step 1; docs/adr/0067; design review S5): a
 * claim match's outcome names the payer's payment beside the allowed amount where the two differ, and a case line's
 * corrections say what they leave billable to the patient, counted in no total. SYNTHETIC amounts.
 */

const text = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node).replace(/<[^>]+>/g, '').replaceAll('&#x27;', '’').replaceAll('&amp;', '&');

/** The non-breaking space between a reason and its amount (UX-6). */
const NB = '\u00a0';

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
  billable: {
    billableCents: '600',
    allowedIncreaseCents: '3000',
    paymentIncreaseCents: '2400',
    otherReductionCents: '0',
    shareChangeCents: '600',
    reasons: { deductible: '0', coinsurance: '600', copay: '0', other: '0' },
    allocation: null,
  },
};
type Billable = NonNullable<CorrectionView['billable']>;
const BALANCE: CorrectionView = {
  kind: 'patient_balance',
  billable: {
    billableCents: '3000',
    allowedIncreaseCents: '3000',
    paymentIncreaseCents: '0',
    otherReductionCents: '0',
    shareChangeCents: '3000',
    reasons: { deductible: '3000', coinsurance: '0', copay: '0', other: '0' },
    allocation: null,
  },
};
const balance = (billable: Partial<Billable>): CorrectionView => ({ ...BALANCE, billable: { ...(BALANCE.billable as Billable), ...billable } });

describe('a case line’s corrections beside the ledger', () => {
  it('says what is billable to the patient by reason, the allowed amount, then the payer’s payment, counted in no total', () => {
    const shown = text(<LineCorrectionWords correction={COINSURANCE} />);
    expect(shown).toBe(`Billable to the patient: $6.00 (coinsurance${NB}+$6.00). The payer raised the allowed amount by $30.00 and pays $24.00 of it; the rest is the patient’s share, counted in no total.`);
    expect(renderToStaticMarkup(<LineCorrectionWords correction={COINSURANCE} />)).toContain('data-billable="600"');
    expect(shown).not.toMatch(/recovered/i);
  });

  it('lists each signed change with their net, and names the patient’s share alone to a reader who does not read PHI (N1)', () => {
    const mixed: CorrectionView = { kind: null, billable: { ...(COINSURANCE.billable as NonNullable<CorrectionView['billable']>), billableCents: '600', reasons: { deductible: '-1000', coinsurance: '1600', copay: '0', other: '0' } } };
    expect(text(<LineCorrectionWords correction={mixed} />)).toContain(`Billable to the patient: $6.00 (deductible${NB}−$10.00, coinsurance${NB}+$16.00).`);
    const hidden: CorrectionView = { kind: null, billable: { ...(COINSURANCE.billable as NonNullable<CorrectionView['billable']>), reasons: null } };
    const shown = text(<LineCorrectionWords correction={hidden} />);
    expect(shown).toContain('Billable to the patient: $6.00 (the patient’s share).');
    expect(shown).not.toMatch(/coinsurance|deductible|copay/);
  });

  it('says the payer’s other reductions apart from the patient’s share, never billable', () => {
    const reduced: CorrectionView = { kind: null, billable: { ...(COINSURANCE.billable as NonNullable<CorrectionView['billable']>), paymentIncreaseCents: '1400', otherReductionCents: '1000' } };
    expect(text(<LineCorrectionWords correction={reduced} />)).toContain('pays $14.00 of it; of the rest, $6.00 is the patient’s share, counted in no total, and $10.00 was reduced by the payer for other reasons, not billable.');
  });

  it('says a correction the deductible took whole is the patient’s balance, billable first, with no entry and the next step, never recovered and never no change', () => {
    const shown = text(<LineCorrectionWords correction={BALANCE} />);
    expect(shown).toBe(
      `Billable to the patient: $30.00 (deductible${NB}+$30.00). Payer corrected; balance is the patient’s. The payer raised the allowed amount by $30.00 and pays nothing more: the patient’s deductible took all of it. No ledger entry is written; counted in no total. Bill the balance to the patient in the practice-management system; a packet would ask the payer for what it has already allowed.`,
    );
    expect(text(<LineCorrectionWords correction={balance({ reasons: null })} />)).toContain('Billable to the patient: $30.00 (the patient’s share). Payer corrected; balance is the patient’s.');
    expect(text(<LineCorrectionWords correction={balance({ reasons: null })} />)).toContain('the patient’s share took all of it');
    expect(shown).not.toMatch(/recovered|no change/i);
  });

  it('says “took all of it” only when the patient’s share is the whole increase, and names the payer’s other reductions apart (UX-1, probe LED-15 ux-mixed)', () => {
    // Allowed +30.00, paid nothing more, deductible +20.00, CO-253 10.00: the patient's balance is 20.00, never 30.00.
    const mixed = text(<LineCorrectionWords correction={balance({ billableCents: '2000', otherReductionCents: '1000', shareChangeCents: '2000', reasons: { deductible: '2000', coinsurance: '0', copay: '0', other: '0' } })} />);
    expect(mixed).toContain(
      `Billable to the patient: $20.00 (deductible${NB}+$20.00). Payer corrected; balance is the patient’s. The payer raised the allowed amount by $30.00 and pays nothing more: $20.00 is the patient’s share, and $10.00 was reduced by the payer for other reasons, not billable. No ledger entry is written; counted in no total.`,
    );
    expect(mixed).not.toContain('took all of it');
    // Deductible +40.00 and coinsurance −10.00: the share took it all, but not the deductible alone.
    const fell = text(<LineCorrectionWords correction={balance({ reasons: { deductible: '4000', coinsurance: '-1000', copay: '0', other: '0' } })} />);
    expect(fell).toContain(`Billable to the patient: $30.00 (deductible${NB}+$40.00, coinsurance${NB}−$10.00).`);
    expect(fell).toContain('pays nothing more: the patient’s share took all of it.');
    expect(fell).not.toContain('deductible took');
    // Other reductions that fell: the share is more than the allowed increase.
    expect(text(<LineCorrectionWords correction={balance({ billableCents: '4000', otherReductionCents: '-1000', shareChangeCents: '4000', reasons: { deductible: '4000', coinsurance: '0', copay: '0', other: '0' } })} />)).toContain(
      'pays nothing more: $40.00 is the patient’s share, and the payer’s other reductions fell by $10.00.',
    );
    // An earlier correction the payer paid part of: what it pays, never "nothing more".
    expect(text(<LineCorrectionWords correction={balance({ paymentIncreaseCents: '1000', billableCents: '2000', shareChangeCents: '2000', reasons: { deductible: '2000', coinsurance: '0', copay: '0', other: '0' } })} />)).toContain(
      'The payer raised the allowed amount by $30.00 and pays $10.00 of it: $20.00 is the patient’s share.',
    );
  });

  it('says a correction other reductions took whole pays nothing more, not billable to the patient, with the amount the payer reduced (S13, UX-2)', () => {
    const other: CorrectionView = {
      kind: 'other_reductions',
      billable: {
        billableCents: '0',
        allowedIncreaseCents: '3000',
        paymentIncreaseCents: '0',
        otherReductionCents: '3000',
        shareChangeCents: '0',
        reasons: { deductible: '0', coinsurance: '0', copay: '0', other: '0' },
        allocation: null,
      },
    };
    expect(text(<LineCorrectionWords correction={other} />)).toBe(
      'Payer corrected; it pays nothing more (other reductions). The payer raised the allowed amount by $30.00 and reduced its payment by $30.00 for other reasons, not billable to the patient. No ledger entry is written; counted in no total.',
    );
    // Allowed +30.00 and the deductible −10.00: the payer reduced 40.00, and the patient's share fell by 10.00.
    const fell: CorrectionView = { kind: 'other_reductions', billable: { ...(other.billable as Billable), otherReductionCents: '4000', shareChangeCents: '-1000', reasons: { deductible: '-1000', coinsurance: '0', copay: '0', other: '0' } } };
    expect(text(<LineCorrectionWords correction={fell} />)).toBe(
      'Payer corrected; it pays nothing more (other reductions). The payer raised the allowed amount by $30.00 and reduced its payment by $40.00 for other reasons, not billable to the patient; the patient’s share fell by $10.00. No ledger entry is written; counted in no total.',
    );
    expect(text(<LineCorrectionWords correction={fell} />)).not.toContain('the same');
  });

  it('puts each signed amount’s sign inside its mono figure, a non-breaking space before it (UX-6)', () => {
    const markup = renderToStaticMarkup(<LineCorrectionWords correction={COINSURANCE} />);
    expect(markup).toContain(`coinsurance${NB}<span class="font-mono tabular-nums">+$6.00</span>`);
    const minus = renderToStaticMarkup(<LineCorrectionWords correction={{ kind: null, billable: { ...(COINSURANCE.billable as Billable), reasons: { deductible: '-1000', coinsurance: '1600', copay: '0', other: '0' } } }} />);
    expect(minus).toContain(`deductible${NB}<span class="font-mono tabular-nums">−$10.00</span>`);
  });

  it('says nothing when the corrections leave the patient nothing to bill, or the line stands on its original payment', () => {
    expect(renderToStaticMarkup(<LineCorrectionWords correction={{ kind: null, billable: { ...(COINSURANCE.billable as Billable), billableCents: '0', reasons: { deductible: '0', coinsurance: '0', copay: '0', other: '0' } } }} />)).toBe('');
    expect(renderToStaticMarkup(<LineCorrectionWords correction={{ kind: null, billable: null }} />)).toBe('');
    expect(renderToStaticMarkup(<LineCorrectionWords correction={undefined} />)).toBe('');
  });

  it('names a share allocated from the claim’s level with its exact fraction', () => {
    const allocated = (basis: 'allowed' | 'charge'): CorrectionView => ({
      kind: null,
      billable: { ...(COINSURANCE.billable as NonNullable<CorrectionView['billable']>), allocation: { basis, lineWeightCents: '10000', claimWeightCents: '24000' } },
    });
    expect(text(<LineCorrectionWords correction={allocated('allowed')} />)).toContain('The payer reported the patient’s share for the whole claim; it is split to this line by allowed amount ($100.00 of $240.00).');
    expect(text(<LineCorrectionWords correction={allocated('charge')} />)).toContain('The payer reported the patient’s share for the whole claim; it is split to this line by charge ($100.00 of $240.00).');
  });
});

describe('the next step and the empty states around a correction', () => {
  it('names the next step of a patient’s balance once, as the case’s Packet and dispute card says it (UX-3)', () => {
    expect(PATIENT_BALANCE_NEXT_STEP).toBe('Bill the balance to the patient in the practice-management system; a packet would ask the payer for what it has already allowed.');
    expect(text(<LineCorrectionWords correction={COINSURANCE} />)).not.toContain(PATIENT_BALANCE_NEXT_STEP);
  });

  it('says why a line has no entry when its correction paid nothing more (UX-8)', () => {
    expect(lineEntriesEmptyText('patient_balance')).toBe('No entry on this line: the correction paid nothing more.');
    expect(lineEntriesEmptyText('other_reductions')).toBe('No entry on this line: the correction paid nothing more.');
    expect(lineEntriesEmptyText(null)).toBe('No entry on this line yet.');
  });

  it('shows the case’s Billable to the patient only when there is something to show (UX-5)', () => {
    expect(showsBillableFact({ billableCents: '0', lines: { a: { kind: null, billable: null } } })).toBe(false);
    expect(showsBillableFact({ billableCents: '0', lines: {} })).toBe(false);
    expect(showsBillableFact({ billableCents: '600', lines: { a: COINSURANCE } })).toBe(true);
    expect(showsBillableFact({ billableCents: '0', lines: { a: { kind: 'other_reductions', billable: null } } })).toBe(true);
  });
});

describe('the ledger’s totals', () => {
  it('notes payer approved as what payers agreed to pay, never the patient’s share, its reversal detail in the help (UX-9)', () => {
    const shown = text(
      <LedgerTotals
        totals={{ proofLevel: 'deposited', approvedCents: '2400', payerApprovedCents: '2400', postedCents: '0', depositedCents: '2400', recoupedCents: '0', interestCents: '0', recoveredCents: '2400' }}
        title="Ledger totals"
        description="By stage."
      />,
    );
    expect(shown).toContain(
      'Payer approved$24.00what payers agreed to pay, never the patient’s share; recovered only once posted or deposited',
    );
    expect(shown).toContain(`By stage. ${LEDGER_TOTALS_HELP}`);
    expect(LEDGER_TOTALS_HELP).toBe('Payer approved is net of reversals and of what was taken back before it posted.');
  });
});
