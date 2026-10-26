import { type Cents, cents, negateCents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { reprocessing } from './matching';
import {
  type PaidLine,
  type PatientShare,
  type PaymentEvent,
  type ShareLine,
  originalBaselines,
  patientShareChange,
  paymentChain,
  paymentMatchOutcome,
  paymentOutcome,
  paymentStep,
  reversalTakeBack,
  unpaidPayment,
} from './payment';
import { LedgerError } from './stages';

// The class and the words of a refusal, so a refusal with other words is told apart.
const refuses = (refused: () => unknown, message: string): void => {
  expect(refused).toThrow(LedgerError);
  expect(refused).toThrow(message);
};

const line = (allowed: bigint, paid: bigint): PaidLine => ({ allowedCents: cents(allowed), paidCents: cents(paid) });

const outcome = (original: PaidLine, baselines: PaidLine, next: PaidLine, remaining: bigint) => paymentOutcome({ original, baselines, next, approvedRemainingCents: cents(remaining) });

const approvedClaim = (matchId: string, allowed: bigint, paid: bigint): PaymentEvent => ({ kind: 'claim', matchId, outcome: 'approved', allowedCents: cents(allowed), paidCents: cents(paid), recoupedCents: cents(0n) });

const takeBack = (original: bigint, reversed: bigint, earlier: bigint | null, remaining: bigint, laterClaimStands = false) =>
  reversalTakeBack({ originalPaidCents: cents(original), reversedPaidCents: cents(reversed), standingEarlierPaidCents: earlier === null ? null : cents(earlier), laterClaimStands, approvedRemainingCents: cents(remaining) });

// The coinsurance line of LED-14: allowed 70.00, the patient's 20% (14.00) leaves the payer's 56.00.
const COINSURANCE = line(7000n, 5600n);

describe('a reprocessing in payment terms (PRD 13, Matching step 1; combined audit #12; LED-14 to LED-16)', () => {
  it("approves the payer's payment increase, never the patient's share or a scaled allowed increase", () => {
    // Coinsurance 20%: allowed 70.00 to 100.00, paid 56.00 to 80.00: 24.00, not the allowed 30.00.
    expect(outcome(COINSURANCE, COINSURANCE, line(10000n, 8000n), 0n)).toEqual({ kind: 'approved', amountCents: 2400n, confirmedCents: 0n });
    // A copay of 20.00 either side: the payment rises by the allowed increase, 30.00 (a ratio would give 24.00).
    expect(outcome(line(7000n, 5000n), line(7000n, 5000n), line(10000n, 8000n), 0n)).toEqual({ kind: 'approved', amountCents: 3000n, confirmedCents: 0n });
    // A deductible that absorbs part: paid 20.00 to 30.00 is 10.00.
    expect(outcome(line(7000n, 2000n), line(7000n, 2000n), line(10000n, 3000n), 0n)).toEqual({ kind: 'approved', amountCents: 1000n, confirmedCents: 0n });
    // Denied, then paid: allowed 0.00 to 100.00 with 20.00 coinsurance is the payer's 80.00.
    expect(outcome(line(0n, 0n), line(0n, 0n), line(10000n, 8000n), 0n)).toEqual({ kind: 'approved', amountCents: 8000n, confirmedCents: 0n });
  });

  it('writes no entry when the patient share took the whole increase (LED-15)', () => {
    // Allowed 70.00 to 100.00, the deductible 30.00 to 60.00, paid 40.00 both times.
    expect(outcome(line(7000n, 4000n), line(7000n, 4000n), line(10000n, 4000n), 0n)).toEqual({ kind: 'no_payment_increase' });
    // The same with an approval standing: still no payment increase, never a take-back.
    expect(outcome(line(7000n, 4000n), line(8000n, 4000n), line(10000n, 4000n), 1000n)).toEqual({ kind: 'no_payment_increase' });
  });

  it("confirms what a payer response accepted in payment terms, and approves only the payment past it (LED-18)", () => {
    // Accepted 24.00 (the payer's payment), then paid 56.00 to 80.00: confirmed in full.
    expect(outcome(COINSURANCE, COINSURANCE, line(10000n, 8000n), 2400n)).toEqual({ kind: 'confirmed', paidCents: 2400n, shortfallCents: 0n });
    // Typed as the allowed 30.00: confirmed 24.00, 6.00 short (the patient's share, named beside it).
    expect(outcome(COINSURANCE, COINSURANCE, line(10000n, 8000n), 3000n)).toEqual({ kind: 'confirmed', paidCents: 2400n, shortfallCents: 600n });
    // Accepted 10.00: the payment confirms it and approves 14.00 more.
    expect(outcome(COINSURANCE, COINSURANCE, line(10000n, 8000n), 1000n)).toEqual({ kind: 'approved', amountCents: 1400n, confirmedCents: 1000n });
    // After a remittance paid part of it (P_b 64.00), the rest of the acceptance is what is unpaid.
    expect(outcome(COINSURANCE, line(8000n, 6400n), line(10000n, 8000n), 3000n)).toEqual({ kind: 'confirmed', paidCents: 1600n, shortfallCents: 600n });
  });

  it('takes back the payment decrease of a lower allowed amount, at most what is approved, and nothing when the payment did not fall', () => {
    const approved = line(10000n, 8000n);
    expect(outcome(COINSURANCE, approved, line(8750n, 7000n), 2400n)).toEqual({ kind: 'decreased', amountCents: -1000n, allowed: 'lower' });
    expect(outcome(COINSURANCE, approved, line(5000n, 4000n), 2400n)).toEqual({ kind: 'decreased', amountCents: -2400n, allowed: 'lower' });
    expect(outcome(COINSURANCE, approved, line(9000n, 8000n), 2400n)).toEqual({ kind: 'decreased', amountCents: 0n, allowed: 'lower' });
    expect(outcome(COINSURANCE, approved, line(9000n, 8500n), 2400n)).toEqual({ kind: 'decreased', amountCents: 0n, allowed: 'lower' });
    // A lower allowed amount with nothing approved is no change, whatever it pays.
    expect(outcome(COINSURANCE, COINSURANCE, line(6000n, 4800n), 0n)).toEqual({ kind: 'no_change' });
    expect(outcome(COINSURANCE, COINSURANCE, line(6000n, 6000n), 0n)).toEqual({ kind: 'no_change' });
  });

  it("follows the payment where the allowed amount rises or stays and the payment falls (the founder's ruling on Q2)", () => {
    const approved = line(10000n, 8000n);
    // Higher allowed, lower payment, an approval remaining: the decrease is taken back.
    expect(outcome(COINSURANCE, approved, line(10500n, 7000n), 2400n)).toEqual({ kind: 'decreased', amountCents: -1000n, allowed: 'higher' });
    expect(outcome(COINSURANCE, approved, line(10500n, 4000n), 2400n)).toEqual({ kind: 'decreased', amountCents: -2400n, allowed: 'higher' });
    // The same allowed amount paying less (LED-15's partial lowered: 30.00 to 15.00 with 10.00 approved): capped.
    expect(outcome(line(7000n, 2000n), line(10000n, 3000n), line(10000n, 1500n), 1000n)).toEqual({ kind: 'decreased', amountCents: -1000n, allowed: 'same' });
    expect(outcome(line(7000n, 2000n), line(10000n, 3000n), line(10000n, 2500n), 1000n)).toEqual({ kind: 'decreased', amountCents: -500n, allowed: 'same' });
    // The same allowed amount paying the same or more is no change, as "no change" is defined on the allowed amount.
    expect(outcome(COINSURANCE, approved, line(10000n, 8000n), 2400n)).toEqual({ kind: 'no_change' });
    expect(outcome(COINSURANCE, approved, line(10000n, 9000n), 2400n)).toEqual({ kind: 'no_change' });
    // Nothing approved and the same allowed amount paying less: no change.
    expect(outcome(COINSURANCE, COINSURANCE, line(7000n, 5000n), 0n)).toEqual({ kind: 'no_change' });
  });

  it('records a higher allowed amount paying less with nothing approved as decreased with no entry, and not as an anchor (B2)', () => {
    const lowered = outcome(COINSURANCE, COINSURANCE, line(10000n, 5000n), 0n);
    expect(lowered).toEqual({ kind: 'decreased', amountCents: 0n, allowed: 'higher' });
    const chain = paymentChain({ original: COINSURANCE, events: [{ kind: 'claim', matchId: 'm1', outcome: paymentMatchOutcome(lowered), allowedCents: cents(10000n), paidCents: cents(5000n), recoupedCents: cents(0n) }] });
    expect(chain.current).toEqual({ allowedCents: 7000n, paidCents: 5600n, anchorMatchId: null });
    // A later 80.00 at allowed 100.00 approves 24.00 against 56.00, not 30.00 against 50.00.
    expect(outcome(COINSURANCE, chain.current, line(10000n, 8000n), 0n)).toEqual({ kind: 'approved', amountCents: 2400n, confirmedCents: 0n });
  });

  it('refuses a negative approval remaining', () => {
    refuses(() => outcome(COINSURANCE, COINSURANCE, line(10000n, 8000n), -1n), 'a reprocessing is compared with an unpaid approval and an approval remaining of zero or more');
  });

  it('stores each outcome as the match outcome the ledger knows', () => {
    expect(paymentMatchOutcome({ kind: 'approved', amountCents: cents(1n), confirmedCents: cents(0n) })).toBe('approved');
    expect(paymentMatchOutcome({ kind: 'confirmed', paidCents: cents(1n), shortfallCents: cents(0n) })).toBe('approved');
    expect(paymentMatchOutcome({ kind: 'no_payment_increase' })).toBe('approved');
    expect(paymentMatchOutcome({ kind: 'decreased', amountCents: cents(0n), allowed: 'higher' })).toBe('decreased');
    expect(paymentMatchOutcome({ kind: 'no_change' })).toBe('no_change');
  });

  it('measures an unpaid acceptance in payment terms, at least zero', () => {
    const unpaid = (baselines: PaidLine, remaining: bigint) => unpaidPayment({ original: COINSURANCE, baselines, approvedRemainingCents: cents(remaining) });
    expect(unpaid(COINSURANCE, 2400n)).toBe(2400n);
    expect(unpaid(line(8000n, 6400n), 2400n)).toBe(1600n);
    expect(unpaid(line(10000n, 8000n), 2400n)).toBe(0n);
    expect(unpaid(line(10000n, 8000n), 1000n)).toBe(0n);
  });

  const value = fc.bigInt({ min: 0n, max: 1_000_000n });

  it("gives exactly reprocessing()'s kind and amounts on a line with no patient share (property; LED-01 to LED-13 unchanged)", () => {
    fc.assert(
      fc.property(value, value, value, value, (original, baseline, next, remaining) => {
        const unpaid = remaining - (baseline - original) > 0n ? remaining - (baseline - original) : 0n;
        const before = reprocessing({ remittanceAllowedCents: cents(baseline), unpaidApprovalCents: cents(unpaid), newAllowedCents: cents(next), approvedRemainingCents: cents(remaining) });
        const now = outcome(line(original, original), line(baseline, baseline), line(next, next), remaining);
        if (before.kind === 'approved') {
          expect(now).toEqual({ kind: 'approved', amountCents: before.amountCents, confirmedCents: unpaid });
        } else if (before.kind === 'decreased') {
          expect(now).toEqual({ kind: 'decreased', amountCents: before.amountCents, allowed: 'lower' });
        } else {
          expect(now).toEqual(before);
        }
      }),
    );
  });

  it('never approves more than the payment rose, never confirms more than is unpaid, and never takes back more than is approved or the payment fell (property)', () => {
    fc.assert(
      fc.property(value, value, value, value, value, value, value, (originalAllowed, originalPaid, allowed, paid, nextAllowed, nextPaid, remaining) => {
        const original = line(originalAllowed, originalPaid);
        const baselines = line(allowed, paid);
        const now = outcome(original, baselines, line(nextAllowed, nextPaid), remaining);
        const gain = nextPaid - paid;
        const unpaid = unpaidPayment({ original, baselines, approvedRemainingCents: cents(remaining) });
        if (now.kind === 'approved') {
          expect([now.amountCents + now.confirmedCents, now.amountCents > 0n, now.confirmedCents]).toEqual([gain, true, unpaid]);
        } else if (now.kind === 'confirmed') {
          expect([now.paidCents + now.shortfallCents, now.paidCents > 0n, now.shortfallCents >= 0n]).toEqual([unpaid, true, true]);
        } else if (now.kind === 'decreased') {
          expect(now.amountCents <= 0n && negateCents(now.amountCents) <= remaining && negateCents(now.amountCents) <= (gain < 0n ? -gain : 0n)).toBe(true);
        } else if (now.kind === 'no_payment_increase') {
          expect([gain, nextAllowed > allowed]).toEqual([0n, true]);
        } else {
          expect(nextAllowed <= allowed).toBe(true);
        }
      }),
    );
  });
});

describe("a case line's chain: the paid baseline and the allowed baseline beside it (combined audit #12, B1 and S3)", () => {
  it('starts from the original line', () => {
    expect(originalBaselines(COINSURANCE)).toEqual({ allowedCents: 7000n, paidCents: 5600n, anchorMatchId: null });
    expect(paymentChain({ original: COINSURANCE, events: [] })).toEqual({ before: new Map(), net: new Map(), current: { allowedCents: 7000n, paidCents: 5600n, anchorMatchId: null } });
  });

  it("anchors on each approving claim match, and a reversal's take-back returns the allowed baseline in allowed terms (LED-14 reversed, then reissued)", () => {
    const taken = takeBack(5600n, 8000n, null, 2400n);
    expect(taken).toEqual({ takenCents: 2400n, uncappedCents: 2400n, base: 'original' });
    const chain = paymentChain({
      original: COINSURANCE,
      events: [
        approvedClaim('m1', 10000n, 8000n),
        { kind: 'reversal', recoupedCents: negateCents(taken.takenCents), reversedAllowedCents: cents(10000n), baseAllowedCents: cents(7000n), baseMatchId: null, uncappedCents: taken.uncappedCents },
      ],
    });
    expect(chain.before.get('m1')).toEqual({ allowedCents: 7000n, paidCents: 5600n, anchorMatchId: null });
    expect(chain.net.get('m1')).toBe(2400n);
    // 70.00 and 56.00, never the 76.00 of the allowed less the cash taken back.
    expect(chain.current).toEqual({ allowedCents: 7000n, paidCents: 5600n, anchorMatchId: null });
    // The reissue at allowed 75.00, paid 60.00 approves its payment over the original, 4.00.
    expect(outcome(COINSURANCE, chain.current, line(7500n, 6000n), 0n)).toEqual({ kind: 'approved', amountCents: 400n, confirmedCents: 0n });
  });

  it('returns to the standing earlier claim after the reversal of the later one (LED-17 (b))', () => {
    const taken = takeBack(5600n, 8000n, 6400n, 2400n);
    const chain = paymentChain({
      original: COINSURANCE,
      events: [
        approvedClaim('a', 8000n, 6400n),
        approvedClaim('b', 10000n, 8000n),
        { kind: 'reversal', recoupedCents: negateCents(taken.takenCents), reversedAllowedCents: cents(10000n), baseAllowedCents: cents(8000n), baseMatchId: 'a', uncappedCents: taken.uncappedCents },
      ],
    });
    expect([chain.net.get('a'), chain.net.get('b')]).toEqual([800n, 1600n]);
    expect(chain.before.get('b')).toEqual({ allowedCents: 8000n, paidCents: 6400n, anchorMatchId: 'a' });
    expect(chain.current).toEqual({ allowedCents: 8000n, paidCents: 6400n, anchorMatchId: 'a' });
  });

  it('nets a claim against the payment an early reversal left: net(B) = 80.00 − (64.00 − 8.00)', () => {
    const chain = paymentChain({
      original: COINSURANCE,
      events: [
        approvedClaim('a', 8000n, 6400n),
        { kind: 'reversal', recoupedCents: cents(-800n), reversedAllowedCents: cents(8000n), baseAllowedCents: cents(7000n), baseMatchId: null, uncappedCents: cents(800n) },
        approvedClaim('b', 10000n, 8000n),
      ],
    });
    expect(chain.before.get('b')).toEqual({ allowedCents: 7000n, paidCents: 5600n, anchorMatchId: null });
    expect(chain.net.get('b')).toBe(2400n);
    expect(chain.current).toEqual({ allowedCents: 10000n, paidCents: 8000n, anchorMatchId: 'b' });
  });

  it('carries a withholding taken before a reversal, and what the cap by the approval left (share-free: the additive walk)', () => {
    const chain = paymentChain({
      original: line(7000n, 7000n),
      events: [
        approvedClaim('m1', 10000n, 10000n),
        { kind: 'withholding', recoupedCents: cents(-1000n) },
        // 30.00 removed, 20.00 approved remaining: 20.00 taken, 10.00 left by the cap.
        { kind: 'reversal', recoupedCents: cents(-2000n), reversedAllowedCents: cents(10000n), baseAllowedCents: cents(7000n), baseMatchId: null, uncappedCents: cents(3000n) },
      ],
    });
    expect(chain.current).toEqual({ allowedCents: 7000n, paidCents: 7000n, anchorMatchId: null });
  });

  it('lowers both baselines by a withholding and keeps the anchor', () => {
    expect(paymentStep({ allowedCents: cents(10000n), paidCents: cents(8000n), anchorMatchId: 'm1' }, { kind: 'withholding', recoupedCents: cents(-1000n) })).toEqual({ allowedCents: 9000n, paidCents: 7000n, anchorMatchId: 'm1' });
  });

  it('moves the allowed baseline of a decreased match to its allowed plus what the cap left, and lowers the paid baseline by the take-back', () => {
    const approved = { allowedCents: cents(10000n), paidCents: cents(8000n), anchorMatchId: 'm1' };
    const decreased = (allowed: bigint, paid: bigint, recouped: bigint): PaymentEvent => ({ kind: 'claim', matchId: 'm2', outcome: 'decreased', allowedCents: cents(allowed), paidCents: cents(paid), recoupedCents: cents(recouped) });
    // Uncapped: 87.50 paying 70.00 takes 10.00 back.
    expect(paymentStep(approved, decreased(8750n, 7000n, -1000n))).toEqual({ allowedCents: 8750n, paidCents: 7000n, anchorMatchId: 'm1' });
    // Capped: 50.00 paying 40.00 is a 40.00 decrease of which 24.00 is approved: 16.00 left, so 66.00.
    expect(paymentStep(approved, decreased(5000n, 4000n, -2400n))).toEqual({ allowedCents: 6600n, paidCents: 5600n, anchorMatchId: 'm1' });
  });

  it('leaves both baselines on a decreased match with no take-back and on a no change, which are never anchors', () => {
    const chain = paymentChain({
      original: COINSURANCE,
      events: [
        approvedClaim('m1', 10000n, 8000n),
        { kind: 'claim', matchId: 'm2', outcome: 'decreased', allowedCents: cents(9000n), paidCents: cents(8500n), recoupedCents: cents(0n) },
        { kind: 'claim', matchId: 'm3', outcome: 'no_change', allowedCents: cents(10000n), paidCents: cents(9000n), recoupedCents: cents(0n) },
      ],
    });
    const anchored = { allowedCents: 10000n, paidCents: 8000n, anchorMatchId: 'm1' };
    expect([chain.before.get('m2'), chain.before.get('m3'), chain.current]).toEqual([anchored, anchored, anchored]);
    expect([chain.net.get('m2'), chain.net.get('m3')]).toEqual([500n, 1000n]);
  });

  it('refuses a positive take-back, a negative removal, a take-back on a match that does not decrease, and a match walked twice', () => {
    const start = originalBaselines(COINSURANCE);
    refuses(() => paymentStep(start, { kind: 'withholding', recoupedCents: cents(1n) }), 'a take-back on a line is zero or less');
    refuses(() => paymentStep(start, { kind: 'reversal', recoupedCents: cents(0n), reversedAllowedCents: cents(7000n), baseAllowedCents: cents(7000n), baseMatchId: null, uncappedCents: cents(-1n) }), 'what a reversal removes before the cap is zero or more');
    refuses(() => paymentStep(start, { ...approvedClaim('m1', 10000n, 8000n), recoupedCents: cents(-1n) }), 'only a decreased claim match takes back');
    refuses(() => paymentStep(start, { kind: 'claim', matchId: 'm1', outcome: 'no_change', allowedCents: cents(7000n), paidCents: cents(5600n), recoupedCents: cents(-1n) }), 'only a decreased claim match takes back');
    refuses(() => paymentChain({ original: COINSURANCE, events: [approvedClaim('m1', 10000n, 8000n), approvedClaim('m1', 10000n, 8000n)] }), 'a claim match is walked once');
    // Zero is allowed for each.
    expect(paymentStep(start, { kind: 'withholding', recoupedCents: cents(0n) })).toEqual(start);
    expect(paymentStep(start, { kind: 'reversal', recoupedCents: cents(0n), reversedAllowedCents: cents(7000n), baseAllowedCents: cents(7000n), baseMatchId: null, uncappedCents: cents(0n) })).toEqual(start);
  });

  type Step = { readonly kind: 'claim'; readonly value: bigint } | { readonly kind: 'withholding'; readonly value: bigint } | { readonly kind: 'response'; readonly value: bigint } | { readonly kind: 'reversal'; readonly earlier: boolean };
  const step: fc.Arbitrary<Step> = fc.oneof(
    fc.record({ kind: fc.constant('claim' as const), value: fc.bigInt({ min: 0n, max: 40_000n }) }),
    fc.record({ kind: fc.constant('withholding' as const), value: fc.bigInt({ min: 1n, max: 10_000n }) }),
    fc.record({ kind: fc.constant('response' as const), value: fc.bigInt({ min: 1n, max: 10_000n }) }),
    fc.record({ kind: fc.constant('reversal' as const), earlier: fc.boolean() }),
  );

  it("walks, on a line with no patient share, exactly the additive allowed walk and reprocessing()'s amounts at every step (property; LED-01 to LED-13 unchanged)", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 20_000n }), fc.array(step, { maxLength: 14 }), (originalCents, steps) => {
        const original = line(originalCents, originalCents);
        const events: PaymentEvent[] = [];
        const claims: { readonly matchId: string; readonly value: bigint; readonly approving: boolean; reversed: boolean }[] = [];
        let approved = 0n;
        let recouped = 0n;
        // The walk the reconcile step kept before #12: the latest approving claim's allowed (or the original's)
        // plus every take-back after it.
        const additive = (): bigint => {
          const anchor = events.findLastIndex((event) => event.kind === 'claim' && event.outcome === 'approved');
          const from = anchor < 0 ? originalCents : (events[anchor] as { readonly allowedCents: Cents }).allowedCents;
          return events.slice(anchor + 1).reduce((sum, event) => sum + event.recoupedCents, from);
        };
        for (const [index, next] of steps.entries()) {
          const chain = paymentChain({ original, events });
          expect([chain.current.allowedCents, chain.current.paidCents]).toEqual([additive(), additive()]);
          const remaining = approved + recouped;
          if (next.kind === 'response') {
            approved += next.value;
          } else if (next.kind === 'withholding') {
            const taken = next.value < remaining ? next.value : remaining;
            if (taken > 0n) {
              events.push({ kind: 'withholding', recoupedCents: cents(-taken) });
              recouped -= taken;
            }
          } else if (next.kind === 'claim') {
            const baseline = additive();
            const unpaid = remaining - (baseline - originalCents) > 0n ? remaining - (baseline - originalCents) : 0n;
            const before = reprocessing({ remittanceAllowedCents: cents(baseline), unpaidApprovalCents: cents(unpaid), newAllowedCents: cents(next.value), approvedRemainingCents: cents(remaining) });
            const now = outcome(original, chain.current, line(next.value, next.value), remaining);
            expect(now.kind === 'approved' ? { kind: now.kind, amountCents: now.amountCents } : now.kind === 'decreased' ? { kind: now.kind, amountCents: now.amountCents } : now).toEqual(before);
            const matchId = `m${index}`;
            const take = now.kind === 'decreased' ? now.amountCents : 0n;
            events.push({ kind: 'claim', matchId, outcome: paymentMatchOutcome(now), allowedCents: cents(next.value), paidCents: cents(next.value), recoupedCents: cents(take) });
            expect(paymentChain({ original, events }).net.get(matchId)).toBe(next.value - chain.current.paidCents);
            approved += now.kind === 'approved' ? now.amountCents : 0n;
            recouped += take;
            claims.push({ matchId, value: next.value, approving: paymentMatchOutcome(now) === 'approved', reversed: false });
          } else {
            // The reversal of the latest claim, an approving one, alone; an earlier approving claim stands or none does.
            const reversed = claims.at(-1);
            if (reversed === undefined || !reversed.approving || reversed.reversed) {
              continue;
            }
            const earlier = next.earlier ? claims.slice(0, -1).findLast((claim) => claim.approving && !claim.reversed) : undefined;
            const base = earlier?.value ?? originalCents;
            const result = takeBack(originalCents, reversed.value, earlier === undefined ? null : base, remaining);
            reversed.reversed = true;
            // Today's walk and the translation agree where the reversal removes what its allowed rose above the base's.
            if (result.uncappedCents !== reversed.value - base) {
              continue;
            }
            if (result.takenCents > 0n) {
              events.push({ kind: 'reversal', recoupedCents: negateCents(result.takenCents), reversedAllowedCents: cents(reversed.value), baseAllowedCents: cents(base), baseMatchId: earlier?.matchId ?? null, uncappedCents: result.uncappedCents });
              recouped -= result.takenCents;
            }
          }
        }
        const chain = paymentChain({ original, events });
        expect([chain.current.allowedCents, chain.current.paidCents]).toEqual([additive(), additive()]);
      }),
    );
  });
});

describe('a reversal takes back the payment it removes above the original (PRD 13, Recoupments and reversals; LED-12, LED-17)', () => {
  // LED-17's chain: the original paid 56.00, A 64.00 (approved 8.00), B 80.00 (approved 16.00).
  it('(a) takes every approval its payment carried when nothing stands', () => {
    expect(takeBack(5600n, 8000n, null, 2400n)).toEqual({ takenCents: 2400n, uncappedCents: 2400n, base: 'original' });
  });

  it("(b) takes only its own claim's approval while the earlier payment stands", () => {
    expect(takeBack(5600n, 8000n, 6400n, 2400n)).toEqual({ takenCents: 1600n, uncappedCents: 1600n, base: 'standing_earlier' });
  });

  it('(c) takes nothing while a later claim stands', () => {
    expect(takeBack(5600n, 6400n, null, 2400n, true)).toEqual({ takenCents: 0n, uncappedCents: 0n, base: 'original' });
    expect(takeBack(5600n, 6400n, 5600n, 2400n, true)).toEqual({ takenCents: 0n, uncappedCents: 0n, base: 'standing_earlier' });
  });

  it("takes LED-12's 30.00, from the original standing as from none", () => {
    expect(takeBack(7000n, 10000n, null, 3000n)).toEqual({ takenCents: 3000n, uncappedCents: 3000n, base: 'original' });
    expect(takeBack(7000n, 10000n, 7000n, 3000n)).toEqual({ takenCents: 3000n, uncappedCents: 3000n, base: 'standing_earlier' });
  });

  it('takes at most what is approved, and never what an unpaid acceptance beside it adds', () => {
    expect(takeBack(5600n, 8000n, null, 1000n)).toEqual({ takenCents: 1000n, uncappedCents: 2400n, base: 'original' });
    // 100.00 approved and remaining (an acceptance beside it): still only the 24.00 the payment removed.
    expect(takeBack(5600n, 8000n, null, 10000n)).toEqual({ takenCents: 2400n, uncappedCents: 2400n, base: 'original' });
    expect(takeBack(5600n, 8000n, 6400n, 10000n)).toEqual({ takenCents: 1600n, uncappedCents: 1600n, base: 'standing_earlier' });
  });

  it('takes nothing when the reversed claim paid less than an earlier claim that stands (S2)', () => {
    // A claim paid 70.00 reversed alone while A paid 80.00 stands.
    expect(takeBack(5600n, 7000n, 8000n, 2400n)).toEqual({ takenCents: 0n, uncappedCents: 0n, base: 'standing_earlier' });
    // A deductible-absorbed correction reversed: it paid nothing above the original.
    expect(takeBack(4000n, 4000n, null, 0n)).toEqual({ takenCents: 0n, uncappedCents: 0n, base: 'original' });
  });

  it('refuses a negative approval remaining', () => {
    refuses(() => takeBack(5600n, 8000n, null, -1n), 'a reversal is compared with an approval remaining of zero or more');
    refuses(() => takeBack(5600n, 8000n, null, -1n, true), 'a reversal is compared with an approval remaining of zero or more');
  });
});

describe('billable to the patient beside the ledger, counted in no total (PRD 13; combined audit #12)', () => {
  const share = (deductible: bigint, coinsurance: bigint, copay: bigint, other: bigint): PatientShare => ({ deductibleCents: cents(deductible), coinsuranceCents: cents(coinsurance), copayCents: cents(copay), otherCents: cents(other) });
  const shareLine = (allowed: bigint, paid: bigint, pr: PatientShare, allocation: ShareLine['allocation'] = null): ShareLine => ({ ...line(allowed, paid), share: pr, allocation });
  const change = (before: ShareLine, after: ShareLine, payment: bigint) => patientShareChange({ before, after, paymentIncreaseCents: cents(payment) });
  const none = share(0n, 0n, 0n, 0n);
  const SHARE_REFUSAL = "a share allocated from the claim is a fraction of the claim's charges, which are more than zero";

  it("names the coinsurance of LED-14's correction: 30.00 allowed, 24.00 paid, 6.00 the patient's", () => {
    expect(change(shareLine(7000n, 5600n, share(0n, 1400n, 0n, 0n)), shareLine(10000n, 8000n, share(0n, 2000n, 0n, 0n)), 2400n)).toEqual({
      allowedIncreaseCents: 3000n,
      paymentIncreaseCents: 2400n,
      shareChange: share(0n, 600n, 0n, 0n),
      otherReductionCents: 0n,
      billableCents: 600n,
      allocatedFromClaim: false,
      allocations: { before: null, after: null },
    });
  });

  it('keeps each reason in its own bucket, signed, and bills their net (N1)', () => {
    // The deductible falls 10.00 and coinsurance rises 16.00: the patient owes 6.00 more.
    const mixed = change(shareLine(7000n, 3000n, share(3000n, 1000n, 0n, 0n)), shareLine(10000n, 5400n, share(2000n, 2600n, 0n, 0n)), 2400n);
    expect([mixed.shareChange, mixed.billableCents, mixed.otherReductionCents]).toEqual([share(-1000n, 1600n, 0n, 0n), 600n, 0n]);
    // Every reason moving by a different amount lands in its own bucket.
    const every = change(shareLine(7000n, 1000n, share(1000n, 2000n, 3000n, 0n)), shareLine(10000n, 1000n, share(1100n, 2200n, 3300n, 3400n)), 0n);
    expect([every.shareChange, every.billableCents, every.otherReductionCents]).toEqual([share(100n, 200n, 300n, 3400n), 4000n, -1000n]);
    // A copay unchanged bills nothing (LED-16).
    expect(change(shareLine(7000n, 5000n, share(0n, 0n, 2000n, 0n)), shareLine(10000n, 8000n, share(0n, 0n, 2000n, 0n)), 3000n).billableCents).toBe(0n);
    // A share that fell bills nothing.
    expect(change(shareLine(7000n, 4000n, share(3000n, 0n, 0n, 0n)), shareLine(7000n, 5000n, share(2000n, 0n, 0n, 0n)), 1000n).billableCents).toBe(0n);
  });

  it("names the deductible that took the whole increase (LED-15), and other reductions that are never the patient's (S13)", () => {
    const deductible = change(shareLine(7000n, 4000n, share(3000n, 0n, 0n, 0n)), shareLine(10000n, 4000n, share(6000n, 0n, 0n, 0n)), 0n);
    expect([deductible.allowedIncreaseCents, deductible.paymentIncreaseCents, deductible.shareChange.deductibleCents, deductible.billableCents]).toEqual([3000n, 0n, 3000n, 3000n]);
    const reduced = change(shareLine(7000n, 5600n, share(0n, 1400n, 0n, 0n)), shareLine(10000n, 5600n, share(0n, 1400n, 0n, 0n)), 0n);
    expect([reduced.otherReductionCents, reduced.billableCents]).toEqual([3000n, 0n]);
  });

  it('flags a share allocated from the claim and passes its exact fraction through', () => {
    const allocation = { lineChargeCents: cents(15000n), claimChargeCents: cents(45000n) };
    const after = change(shareLine(7000n, 5600n, none), shareLine(10000n, 8000n, none, allocation), 2400n);
    expect([after.allocatedFromClaim, after.allocations]).toEqual([true, { before: null, after: allocation }]);
    const before = change(shareLine(7000n, 5600n, none, allocation), shareLine(10000n, 8000n, none), 2400n);
    expect([before.allocatedFromClaim, before.allocations]).toEqual([true, { before: allocation, after: null }]);
  });

  it("refuses a claim allocation whose claim's charges are not more than zero", () => {
    for (const claimCharge of [0n, -1n]) {
      const allocation = { lineChargeCents: cents(0n), claimChargeCents: cents(claimCharge) };
      refuses(() => change(shareLine(7000n, 5600n, none, allocation), shareLine(10000n, 8000n, none), 2400n), SHARE_REFUSAL);
      refuses(() => change(shareLine(7000n, 5600n, none), shareLine(10000n, 8000n, none, allocation), 2400n), SHARE_REFUSAL);
    }
  });

  it('sums the patient share change and the other reductions to the allowed increase less the payment increase (property)', () => {
    const amount = fc.bigInt({ min: 0n, max: 100_000n });
    const pr = fc.tuple(amount, amount, amount, amount).map(([a, b, c, d]) => share(a, b, c, d));
    fc.assert(
      fc.property(amount, amount, pr, amount, amount, pr, fc.bigInt({ min: -100_000n, max: 100_000n }), (allowedBefore, paidBefore, prBefore, allowedAfter, paidAfter, prAfter, payment) => {
        const result = change(shareLine(allowedBefore, paidBefore, prBefore), shareLine(allowedAfter, paidAfter, prAfter), payment);
        const shared = Object.values(result.shareChange).reduce((sum: bigint, part: bigint) => sum + part, 0n);
        expect(shared + result.otherReductionCents).toBe(allowedAfter - allowedBefore - payment);
        expect(result.billableCents).toBe(shared > 0n ? shared : 0n);
        expect(result.allocatedFromClaim).toBe(false);
      }),
    );
  });
});
