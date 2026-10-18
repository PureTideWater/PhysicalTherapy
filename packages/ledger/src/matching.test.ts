import { cents, negateCents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { batchMatches, checkPosting, depositMatches, linePosting, postsLine, preferredCandidates, reprocessing } from './matching';
import { LedgerError } from './stages';

describe('remittance to case line (PRD 13, Matching step 1; LED-02, LED-03)', () => {
  it('prefers the candidates found by payer claim control number', () => {
    const byControl = { claimId: 'a', key: 'payer_claim_control_number' as const };
    const byPatient = { claimId: 'b', key: 'patient_control_number' as const };
    expect(preferredCandidates([byPatient, byControl])).toEqual([byControl]);
    expect(preferredCandidates([byPatient])).toEqual([byPatient]);
    expect(preferredCandidates([])).toEqual([]);
  });

  const compare = (baseline: bigint, next: bigint, remaining: bigint, unpaid = 0n) =>
    reprocessing({ remittanceAllowedCents: cents(baseline), unpaidApprovalCents: cents(unpaid), newAllowedCents: cents(next), approvedRemainingCents: cents(remaining) });

  it('approves the difference of a higher observed allowed (LED-02: 100.00 against 70.00 is 30.00)', () => {
    expect(compare(7000n, 10000n, 0n)).toEqual({ kind: 'approved', amountCents: 3000n });
  });

  it('records the same or a lower amount as reprocessed with no change, unless an approval stands to be taken back', () => {
    expect(compare(7000n, 7000n, 0n)).toEqual({ kind: 'no_change' });
    expect(compare(7000n, 6000n, 0n)).toEqual({ kind: 'no_change' });
    expect(compare(10000n, 9000n, 3000n)).toEqual({ kind: 'decreased', amountCents: -1000n });
    expect(compare(10000n, 5000n, 3000n)).toEqual({ kind: 'decreased', amountCents: -3000n });
  });

  it('confirms what a payer response accepted and no remittance paid, in full or in part, and approves only what goes past it', () => {
    // The payer accepted 30.00 against an original 70.00: a reprocessing paying 100.00 pays it all.
    expect(compare(7000n, 10000n, 3000n, 3000n)).toEqual({ kind: 'confirmed', paidCents: 3000n, shortfallCents: 0n });
    // Paying 85.00 pays 15.00 of it and leaves 15.00 short, never a take-back.
    expect(compare(7000n, 8500n, 3000n, 3000n)).toEqual({ kind: 'confirmed', paidCents: 1500n, shortfallCents: 1500n });
    // Paying 110.00 pays the acceptance and approves 10.00 more.
    expect(compare(7000n, 11000n, 3000n, 3000n)).toEqual({ kind: 'approved', amountCents: 1000n });
    // The original amount again is no change; less than it takes back what the remittances paid less.
    expect(compare(7000n, 7000n, 3000n, 3000n)).toEqual({ kind: 'no_change' });
    expect(compare(8500n, 8000n, 3000n, 1500n)).toEqual({ kind: 'decreased', amountCents: -500n });
  });

  it('refuses a negative unpaid approval or approval remaining', () => {
    expect(() => compare(7000n, 10000n, -1n)).toThrow(LedgerError);
    expect(() => compare(7000n, 10000n, 0n, -1n)).toThrow(LedgerError);
  });

  it('never takes back more than was approved, never below what the remittances paid, and approves exactly the increase past every unpaid acceptance (property)', () => {
    const value = fc.bigInt({ min: 0n, max: 1_000_000n });
    fc.assert(
      fc.property(value, value, value, value, (baseline, next, remaining, unpaid) => {
        const outcome = compare(baseline, next, remaining, unpaid);
        if (outcome.kind === 'approved') {
          expect(outcome.amountCents).toBe(next - baseline - unpaid);
        } else if (outcome.kind === 'confirmed') {
          expect([outcome.paidCents + outcome.shortfallCents, outcome.paidCents > 0n, outcome.shortfallCents >= 0n]).toEqual([unpaid, true, true]);
        } else if (outcome.kind === 'decreased') {
          expect(outcome.amountCents < 0n && negateCents(outcome.amountCents) <= remaining && negateCents(outcome.amountCents) <= baseline - next).toBe(true);
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

  it('posts only the lines of a line-level row: its code, its date when it has one, its amount exactly (PRD 13, Matching step 2)', () => {
    const line = { procedureCode: '97110', serviceDate: '2026-03-09', paidCents: cents(10000n) };
    expect(postsLine({ amountCents: cents(10000n), procedureCode: '97110', serviceDate: '2026-03-09' }, line)).toBe(true);
    expect(postsLine({ amountCents: cents(10000n), procedureCode: '97110', serviceDate: null }, line)).toBe(true);
    expect(postsLine({ amountCents: cents(10000n), procedureCode: '97110', serviceDate: '2026-03-10' }, line)).toBe(false);
    expect(postsLine({ amountCents: cents(9999n), procedureCode: '97110', serviceDate: '2026-03-09' }, line)).toBe(false);
    expect(postsLine({ amountCents: cents(10000n), procedureCode: '97140', serviceDate: '2026-03-09' }, line)).toBe(false);
    // A row without a code posts the claim whole.
    expect(postsLine({ amountCents: cents(1n), procedureCode: null, serviceDate: '2026-03-10' }, line)).toBe(true);
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
