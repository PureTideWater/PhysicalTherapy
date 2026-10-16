import { cents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { batchMatches, checkPosting, depositMatches, linePosting, preferredCandidates, reprocessing } from './matching';

describe('remittance to case line (PRD 13, Matching step 1; LED-02, LED-03)', () => {
  it('prefers the candidates found by payer claim control number', () => {
    const byControl = { claimId: 'a', key: 'payer_claim_control_number' as const };
    const byPatient = { claimId: 'b', key: 'patient_control_number' as const };
    expect(preferredCandidates([byPatient, byControl])).toEqual([byControl]);
    expect(preferredCandidates([byPatient])).toEqual([byPatient]);
    expect(preferredCandidates([])).toEqual([]);
  });

  it('approves the difference of a higher observed allowed (LED-02: 100.00 against 70.00 is 30.00)', () => {
    expect(reprocessing({ baselineAllowedCents: cents(7000n), newAllowedCents: cents(10000n), approvedRemainingCents: cents(0n) })).toEqual({ kind: 'approved', amountCents: 3000n });
  });

  it('records the same or a lower amount as reprocessed with no change, unless an approval stands to be taken back', () => {
    expect(reprocessing({ baselineAllowedCents: cents(7000n), newAllowedCents: cents(7000n), approvedRemainingCents: cents(0n) })).toEqual({ kind: 'no_change' });
    expect(reprocessing({ baselineAllowedCents: cents(7000n), newAllowedCents: cents(6000n), approvedRemainingCents: cents(0n) })).toEqual({ kind: 'no_change' });
    expect(reprocessing({ baselineAllowedCents: cents(10000n), newAllowedCents: cents(9000n), approvedRemainingCents: cents(3000n) })).toEqual({ kind: 'decreased', amountCents: -1000n });
    expect(reprocessing({ baselineAllowedCents: cents(10000n), newAllowedCents: cents(5000n), approvedRemainingCents: cents(3000n) })).toEqual({ kind: 'decreased', amountCents: -3000n });
  });

  it('never takes back more than was approved, and approves exactly the increase (property)', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 1_000_000n }), fc.bigInt({ min: 0n, max: 1_000_000n }), fc.bigInt({ min: 0n, max: 1_000_000n }), (baseline, next, remaining) => {
        const outcome = reprocessing({ baselineAllowedCents: cents(baseline), newAllowedCents: cents(next), approvedRemainingCents: cents(remaining) });
        if (outcome.kind === 'approved') {
          expect(outcome.amountCents).toBe(next - baseline);
        } else if (outcome.kind === 'decreased') {
          expect(outcome.amountCents < 0n && -outcome.amountCents <= remaining && -outcome.amountCents <= baseline - next).toBe(true);
        } else {
          expect(next <= baseline).toBe(true);
        }
      }),
    );
  });
});

describe('remittance to posting (PRD 13, Matching step 2; LED-04, LED-09)', () => {
  it('matches the whole check in full, and a part of it as a partial posting', () => {
    expect(checkPosting({ amountCents: cents(3000n), checkTotalCents: cents(3000n), postedBeforeCents: cents(0n) })).toEqual({ kind: 'full' });
    expect(checkPosting({ amountCents: cents(7800n), checkTotalCents: cents(13000n), postedBeforeCents: cents(0n) })).toEqual({ kind: 'partial' });
    expect(checkPosting({ amountCents: cents(5200n), checkTotalCents: cents(13000n), postedBeforeCents: cents(7800n) })).toEqual({ kind: 'partial' });
  });

  it('matches nothing past the check, nothing that is not a payment, and nothing on a check that paid nothing', () => {
    expect(checkPosting({ amountCents: cents(3000n), checkTotalCents: cents(3000n), postedBeforeCents: cents(3000n) })).toEqual({ kind: 'unmatched', reason: 'more_than_the_check' });
    expect(checkPosting({ amountCents: cents(-7000n), checkTotalCents: cents(3000n), postedBeforeCents: cents(0n) })).toEqual({ kind: 'unmatched', reason: 'amount_not_positive' });
    expect(checkPosting({ amountCents: cents(100n), checkTotalCents: cents(0n), postedBeforeCents: cents(0n) })).toEqual({ kind: 'unmatched', reason: 'check_not_positive' });
  });

  it('matches a line-level row to the one claim, or claim line, it pays exactly', () => {
    const claims = [
      { claimId: 'reversal', paidCents: cents(-7000n), lines: [{ procedureCode: '97110', serviceDate: '2026-03-09', paidCents: cents(-7000n) }] },
      { claimId: 'corrected', paidCents: cents(10000n), lines: [{ procedureCode: '97110', serviceDate: '2026-03-09', paidCents: cents(10000n) }] },
    ];
    expect(linePosting({ amountCents: cents(10000n), procedureCode: null, serviceDate: null, claims })).toBe('corrected');
    expect(linePosting({ amountCents: cents(-7000n), procedureCode: '97110', serviceDate: '2026-03-09', claims })).toBe('reversal');
    expect(linePosting({ amountCents: cents(10000n), procedureCode: '97110', serviceDate: null, claims })).toBe('corrected');
    expect(linePosting({ amountCents: cents(10000n), procedureCode: '97110', serviceDate: '2026-03-10', claims })).toBeNull();
    expect(linePosting({ amountCents: cents(10000n), procedureCode: '97140', serviceDate: null, claims })).toBeNull();
    expect(linePosting({ amountCents: cents(9999n), procedureCode: null, serviceDate: null, claims })).toBeNull();
    expect(linePosting({ amountCents: cents(10000n), procedureCode: null, serviceDate: null, claims: [...claims, { ...claims[1], claimId: 'twin' } as (typeof claims)[number]] })).toBeNull();
  });
});

describe('remittance to deposit (PRD 13, Matching step 3; LED-05)', () => {
  it('matches a deposit of exactly the payment', () => {
    expect(depositMatches({ amountCents: cents(3000n), paymentCents: cents(3000n) })).toBe(true);
    expect(depositMatches({ amountCents: cents(2999n), paymentCents: cents(3000n) })).toBe(false);
    expect(depositMatches({ amountCents: cents(0n), paymentCents: cents(0n) })).toBe(false);
  });

  it('matches a batch when every row found its payment and the totals agree', () => {
    expect(batchMatches({ rowAmounts: [cents(3000n), cents(1200n)], paymentCents: [cents(3000n), cents(1200n)] })).toBe(true);
    expect(batchMatches({ rowAmounts: [cents(4200n), cents(0n)], paymentCents: [cents(3000n), cents(1200n)] })).toBe(true);
    expect(batchMatches({ rowAmounts: [cents(3000n), cents(1200n)], paymentCents: [cents(3000n), null] })).toBe(false);
    expect(batchMatches({ rowAmounts: [cents(3000n), cents(1200n)], paymentCents: [cents(3000n), cents(1100n)] })).toBe(false);
    expect(batchMatches({ rowAmounts: [cents(0n)], paymentCents: [cents(0n)] })).toBe(false);
    expect(batchMatches({ rowAmounts: [], paymentCents: [] })).toBe(false);
    expect(batchMatches({ rowAmounts: [cents(1n)], paymentCents: [] })).toBe(false);
  });
});
