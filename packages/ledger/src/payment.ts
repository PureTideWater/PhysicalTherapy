import { type Cents, ZERO_CENTS, cents, compareCents, maxCents, minCents, negateCents, sumCents } from '@tp/money';

import { reprocessing } from './matching';
import { LedgerError } from './stages';

/**
 * The ledger's amounts in payment terms (PRD 13, Matching step 1 and Recoupments and reversals; the combined
 * audit's item #12; docs/adr/0067). The outcome of a reprocessing is still decided on the allowed amount, by
 * `reprocessing()`, but every amount the ledger writes is the payer's cash: an approval is the payer's payment
 * increase on the line, a posting or deposit share is what a claim paid on the line net of the payment it
 * replaced, and a reversal takes back the payment it removes. The patient's share is worked out beside, as
 * billable to the patient, and counted in no total. Every amount is a difference of stored integer cents, but for
 * one division: a line's part of the claim-level adjustments its SVC03 leaves out (`claimLinePayments`), rounded
 * once with its exact fraction kept beside it. Nothing here reads a row, a clock or a model.
 */

/** What a line was allowed and what the payer paid on it: `paidCents` is the line's cash, its share of CLP04 (`claimLinePayments`). */
export interface PaidLine {
  readonly allowedCents: Cents;
  readonly paidCents: Cents;
}

/** A line of a claim as its claim's cash is split: its charge (SVC02), its payment (SVC03), and whether it carries CAS of its own. */
export interface ClaimPaymentLine {
  readonly chargeCents: Cents;
  readonly servicePaidCents: Cents;
  readonly carriesAdjustments: boolean;
}

/** A line's part of the claim-level adjustments its SVC03 leaves out, rounded once, with the exact fraction beside it. */
export interface ClaimAdjustmentPart {
  /** The part in cents, signed as the adjustments are (a reversal's is negative). */
  readonly partCents: Cents;
  /** The exact part before rounding: `exactNumerator / exactDenominator`, the denominator more than zero. */
  readonly exactNumerator: bigint;
  readonly exactDenominator: bigint;
}

export interface LinePayment {
  /** The line's cash: SVC03 less its part, so the claim's lines add up to CLP04 exactly. */
  readonly paidCents: Cents;
  /** Null when the line takes no part (SVC03 is its cash). */
  readonly claimAdjustment: ClaimAdjustmentPart | null;
}

/**
 * A claim's cash by line (docs/adr/0067; the combined audit's #12 on its claim-level path). The payer pays the
 * claim CLP04, which is the lines' SVC03 less the claim-level CAS (every group, signed) that no SVC03 already
 * holds: `D = Σ SVC03 − CLP04`. A line carrying CAS of its own balances alone (SVC02 − its CAS − SVC03 = 0), so
 * its SVC03 holds none of the claim-level CAS, while a line carrying none is balanced by the claim and its SVC03
 * may already hold its part; so D is split over the lines that carry CAS of their own (every line when none
 * does), in proportion to their charges' magnitudes, by the parser's own rule (@tp/edi835 allocateProRata, the
 * claim-level PR's split behind the observed allowed and the patient's share): each part truncated toward zero,
 * once, the cents left given one at a time in line order, each beside its exact fraction `D × charge / Σ charges`
 * (`D / n` when every such charge is zero). A line's cash is SVC03 less its part; the parts add up to D, so the
 * lines' cash adds up to CLP04 exactly. With no claim-level CAS, D is zero and each line's cash is its SVC03.
 */
export function claimLinePayments(input: { readonly claimPaidCents: Cents; readonly lines: readonly ClaimPaymentLine[] }): LinePayment[] {
  const { lines } = input;
  const left = sumCents(lines.map((line) => line.servicePaidCents)) - input.claimPaidCents;
  if (left === 0n || lines.length === 0) {
    return lines.map((line) => ({ paidCents: line.servicePaidCents, claimAdjustment: null }));
  }
  const own = lines.some((line) => line.carriesAdjustments);
  const takes = lines.map((line) => !own || line.carriesAdjustments);
  const weights = lines.map((line, index) => (takes[index] === true ? maxCents(line.chargeCents, negateCents(line.chargeCents)) : ZERO_CENTS));
  const sum = weights.reduce((total, weight) => total + weight, 0n);
  const count = BigInt(takes.filter(Boolean).length);
  const exact = weights.map((weight) => (sum === 0n ? { exactNumerator: left, exactDenominator: count } : { exactNumerator: left * weight, exactDenominator: sum }));
  const parts = exact.map((fraction, index) => (takes[index] === true ? fraction.exactNumerator / fraction.exactDenominator : 0n));
  let rest = left - parts.reduce((total, part) => total + part, 0n);
  const step = BigInt(compareCents(cents(rest), ZERO_CENTS));
  for (let index = 0; rest !== 0n; index += 1) {
    if (takes[index] === true) {
      parts[index] = (parts[index] as bigint) + step;
      rest -= step;
    }
  }
  return lines.map((line, index) => {
    const part = cents(parts[index] as bigint);
    if (takes[index] !== true) {
      return { paidCents: line.servicePaidCents, claimAdjustment: null };
    }
    return { paidCents: cents(line.servicePaidCents - part), claimAdjustment: { partCents: part, ...(exact[index] as Pick<ClaimAdjustmentPart, 'exactNumerator' | 'exactDenominator'>) } };
  });
}

/**
 * The two baselines a reprocessing is compared with: what the remittances have allowed the case line so far
 * (A_b, in allowed terms, which decides the outcome) and what they have paid it (P_b, in cash, which measures
 * the amount). `anchorMatchId` is the claim match the baselines stand on (null for the original): the latest
 * standing approving claim match, or a reversal's base after its take-back.
 */
export interface PaymentBaselines extends PaidLine {
  readonly anchorMatchId: string | null;
}

/**
 * One event of a case line's chain, in ledger order. `recoupedCents` is what the event's counted recouped
 * entries took back (zero or less):
 * - a standing claim match, with its stored outcome; only a decreased one has a take-back of its own;
 * - a recoupment match of a reversal, with the reversed claim's allowed, the allowed of its base (the claim
 *   match of the standing earlier claim, `baseMatchId`, or the original's when nothing stands or the original
 *   does, null) and what the reversal removed before the cap (`reversalTakeBack`'s `uncappedCents`);
 * - a provider-level withholding (PLB WO) taken from the line.
 */
export type PaymentEvent =
  | {
      readonly kind: 'claim';
      readonly matchId: string;
      readonly outcome: 'approved' | 'decreased' | 'no_change';
      readonly allowedCents: Cents;
      readonly paidCents: Cents;
      readonly recoupedCents: Cents;
    }
  | {
      readonly kind: 'reversal';
      readonly recoupedCents: Cents;
      readonly reversedAllowedCents: Cents;
      readonly baseAllowedCents: Cents;
      readonly baseMatchId: string | null;
      readonly uncappedCents: Cents;
    }
  | { readonly kind: 'withholding'; readonly recoupedCents: Cents };

/** The baselines at the start of a chain: the original claim's line. */
export function originalBaselines(original: PaidLine): PaymentBaselines {
  return { allowedCents: original.allowedCents, paidCents: original.paidCents, anchorMatchId: null };
}

/**
 * The baselines after one event (what a reconcile pass carries from one candidate to the next):
 * - a standing approving claim match (approved, confirmed, or no payment increase) is the new anchor: both
 *   baselines become its line's;
 * - a decreased claim match with a take-back lowers the paid baseline by it, and moves the allowed baseline to
 *   its line's allowed plus the part of the payment decrease the cap left; one with no take-back, and a no
 *   change, leave both;
 * - a reversal's take-back lowers the paid baseline by it, and translates the allowed baseline to its base's
 *   allowed, carrying the take-backs already applied after the reversed claim and what the cap left;
 * - a withholding lowers both by what it took (cash, which on a line with no patient share is its allowed).
 * On a line with no patient share every step equals the additive walk the reconcile step kept before (the
 * anchor's allowed plus every take-back after it).
 */
export function paymentStep(baselines: PaymentBaselines, event: PaymentEvent): PaymentBaselines {
  if (event.recoupedCents > ZERO_CENTS) {
    throw new LedgerError('a take-back on a line is zero or less');
  }
  const paidCents = cents(baselines.paidCents + event.recoupedCents);
  if (event.kind === 'withholding') {
    return { ...baselines, allowedCents: cents(baselines.allowedCents + event.recoupedCents), paidCents };
  }
  if (event.kind === 'reversal') {
    if (event.uncappedCents < ZERO_CENTS) {
      throw new LedgerError('what a reversal removes before the cap is zero or more');
    }
    const allowedCents = event.baseAllowedCents + (baselines.allowedCents - event.reversedAllowedCents) + (event.uncappedCents + event.recoupedCents);
    return { allowedCents: cents(allowedCents), paidCents, anchorMatchId: event.baseMatchId };
  }
  if (event.outcome !== 'decreased' && event.recoupedCents !== ZERO_CENTS) {
    throw new LedgerError('only a decreased claim match takes back');
  }
  if (event.outcome === 'approved') {
    return { allowedCents: event.allowedCents, paidCents: event.paidCents, anchorMatchId: event.matchId };
  }
  if (event.recoupedCents === ZERO_CENTS) {
    return baselines;
  }
  // r: the part of the payment decrease the cap by what was approved left (zero when it did not bind).
  const left = baselines.paidCents - event.paidCents + event.recoupedCents;
  return { ...baselines, allowedCents: cents(event.allowedCents + left), paidCents };
}

export interface PaymentChain {
  /** The baselines just before each claim match (P_b⁻(n) and A_b⁻(n)), by match. */
  readonly before: ReadonlyMap<string, PaymentBaselines>;
  /** What each claim match's line paid net of the payment it replaced, `paid(n) − P_b⁻(n)`: its posting and deposit share, and its payment increase. */
  readonly net: ReadonlyMap<string, Cents>;
  /** The baselines now. */
  readonly current: PaymentBaselines;
}

/** A case line's chain walked in ledger order from its original claim's line. */
export function paymentChain(input: { readonly original: PaidLine; readonly events: readonly PaymentEvent[] }): PaymentChain {
  const before = new Map<string, PaymentBaselines>();
  const net = new Map<string, Cents>();
  let current = originalBaselines(input.original);
  for (const event of input.events) {
    if (event.kind === 'claim') {
      if (before.has(event.matchId)) {
        throw new LedgerError('a claim match is walked once');
      }
      before.set(event.matchId, current);
      net.set(event.matchId, cents(event.paidCents - current.paidCents));
    }
    current = paymentStep(current, event);
  }
  return { before, net, current };
}

/**
 * What a payer response approved that no remittance has paid yet, in payment terms: what is approved and not
 * taken back, less what the remittances have paid above the original, at least zero (U).
 */
export function unpaidPayment(input: { readonly original: PaidLine; readonly baselines: PaidLine; readonly approvedRemainingCents: Cents }): Cents {
  return maxCents(cents(input.approvedRemainingCents - (input.baselines.paidCents - input.original.paidCents)), ZERO_CENTS);
}

export type PaymentOutcome =
  /** A higher allowed amount paying more than the remittances paid and every acceptance they have not paid yet: an approved entry for the rest, which confirms `confirmedCents` of the acceptance. */
  | { readonly kind: 'approved'; readonly amountCents: Cents; readonly confirmedCents: Cents }
  /** A higher allowed amount paying more, within what a payer response accepted and no remittance paid yet: no entry; what it leaves unpaid is a shortfall. */
  | { readonly kind: 'confirmed'; readonly paidCents: Cents; readonly shortfallCents: Cents }
  /** A higher allowed amount paying exactly what the remittances paid: the match is approved with no entry (the patient's share or other reductions took the increase). */
  | { readonly kind: 'no_payment_increase' }
  /**
   * A take-back of the payment decrease, at most what is approved (zero or less; zero writes no entry): a lower
   * allowed amount on an approved line, or a higher or the same allowed amount paying less (the founder's
   * ruling on Q2). `allowed` says which way the allowed amount moved, for the words.
   */
  | { readonly kind: 'decreased'; readonly amountCents: Cents; readonly allowed: 'higher' | 'same' | 'lower' }
  /** The same allowed amount paying no less, or a lower one with nothing approved: a payer response "reprocessed, no change". */
  | { readonly kind: 'no_change' };

/** The stored outcome of a claim match with this payment outcome. */
export function paymentMatchOutcome(outcome: PaymentOutcome): 'approved' | 'decreased' | 'no_change' {
  return outcome.kind === 'decreased' || outcome.kind === 'no_change' ? outcome.kind : 'approved';
}

/** The take-back of a payment decrease (a negative decrease is none), at most what is approved: zero or less. */
const takeBack = (decrease: Cents, remaining: Cents): Cents => negateCents(minCents(maxCents(decrease, ZERO_CENTS), remaining));

/**
 * A reprocessed claim's line against the case line, in payment terms. `reprocessing()` decides the direction on
 * the allowed amount exactly as before (higher, lower or no change); the amount is the payment's: the gain
 * `g = paid(n) − P_b` less what is accepted and unpaid (U) is approved, a gain within U confirms it, no gain
 * writes no entry, and a payment that falls takes the decrease back, at most what is approved. On a line with
 * no patient share (allowed equal to paid throughout) it gives exactly `reprocessing()`'s amounts.
 */
export function paymentOutcome(input: { readonly original: PaidLine; readonly baselines: PaidLine; readonly next: PaidLine; readonly approvedRemainingCents: Cents }): PaymentOutcome {
  const { original, baselines, next, approvedRemainingCents: remaining } = input;
  // Only the direction is read of it: whether a higher allowed amount approves or confirms is the payment's to
  // say, so the unpaid acceptance it would split by (in allowed terms) is not passed.
  const decided = reprocessing({ remittanceAllowedCents: baselines.allowedCents, unpaidApprovalCents: ZERO_CENTS, newAllowedCents: next.allowedCents, approvedRemainingCents: remaining });
  const gain = next.paidCents - baselines.paidCents;
  const decrease = cents(-gain);
  if (decided.kind === 'decreased') {
    return { kind: 'decreased', amountCents: takeBack(decrease, remaining), allowed: 'lower' };
  }
  if (decided.kind === 'no_change') {
    // The same allowed amount paying less, on an approved line (a lower one with nothing approved is no change).
    return gain < 0n && remaining > ZERO_CENTS ? { kind: 'decreased', amountCents: takeBack(decrease, remaining), allowed: 'same' } : decided;
  }
  if (gain < 0n) {
    return { kind: 'decreased', amountCents: takeBack(decrease, remaining), allowed: 'higher' };
  }
  if (gain === 0n) {
    return { kind: 'no_payment_increase' };
  }
  const unpaid = unpaidPayment({ original, baselines, approvedRemainingCents: remaining });
  if (gain > unpaid) {
    return { kind: 'approved', amountCents: cents(gain - unpaid), confirmedCents: unpaid };
  }
  return { kind: 'confirmed', paidCents: cents(gain), shortfallCents: cents(unpaid - gain) };
}

export interface ReversalTakeBack {
  /** What the reversal takes back (zero or more; zero writes no entry). */
  readonly takenCents: Cents;
  /** What it removes before the cap by what is approved, for the allowed baseline's translation. */
  readonly uncappedCents: Cents;
  /** The line the baselines return to: the standing earlier claim's, or the original's when none stands. */
  readonly base: 'standing_earlier' | 'original';
}

/**
 * A reversal of claim x of a case line, with no correction of x beside it (PRD 13, Recoupments and reversals):
 * nothing while a claim matched to the line after x stands; otherwise the payment it removes above the
 * original, less what a standing earlier claim (the latest before x with no loaded reversal, the original
 * included; null when every one is reversed) paid above the original, at most what is approved. So it takes
 * its own claim's approval while an earlier payment stands, and every approval its payment carried when
 * nothing stands.
 */
export function reversalTakeBack(input: {
  readonly originalPaidCents: Cents;
  readonly reversedPaidCents: Cents;
  readonly standingEarlierPaidCents: Cents | null;
  readonly laterClaimStands: boolean;
  readonly approvedRemainingCents: Cents;
}): ReversalTakeBack {
  const { originalPaidCents: original, reversedPaidCents: reversed, standingEarlierPaidCents: earlier, approvedRemainingCents: remaining } = input;
  if (remaining < ZERO_CENTS) {
    throw new LedgerError('a reversal is compared with an approval remaining of zero or more');
  }
  const base = earlier === null ? 'original' : 'standing_earlier';
  if (input.laterClaimStands) {
    return { takenCents: ZERO_CENTS, uncappedCents: ZERO_CENTS, base };
  }
  const stands = maxCents(cents((earlier ?? ZERO_CENTS) - original), ZERO_CENTS);
  const uncapped = maxCents(cents(reversed - original - stands), ZERO_CENTS);
  return { takenCents: minCents(uncapped, remaining), uncappedCents: uncapped, base };
}

/** A line's patient responsibility (CAS group PR) by reason: PR-1 deductible, PR-2 coinsurance, PR-3 copay, and any other PR reason. */
export interface PatientShare {
  readonly deductibleCents: Cents;
  readonly coinsuranceCents: Cents;
  readonly copayCents: Cents;
  readonly otherCents: Cents;
}

/** Where a line's patient share came from its claim's level: the line's charge over the claim's charges, the exact fraction of the claim's PR it was allocated. */
export interface ClaimAllocation {
  readonly lineChargeCents: Cents;
  readonly claimChargeCents: Cents;
}

export interface ShareLine extends PaidLine {
  readonly share: PatientShare;
  /** Null when the line's own PR rows gave its share. */
  readonly allocation: ClaimAllocation | null;
}

export interface PatientShareChange {
  readonly allowedIncreaseCents: Cents;
  /** The ledger's own payment increase, `net(n)`. */
  readonly paymentIncreaseCents: Cents;
  /** Each reason's change, after less before, signed. */
  readonly shareChange: PatientShare;
  /** What the payer reduced for reasons not the patient's (CO-253 and others): never billable. */
  readonly otherReductionCents: Cents;
  /** The net of the signed changes, at least zero: shown beside the ledger, counted in no total. */
  readonly billableCents: Cents;
  readonly allocatedFromClaim: boolean;
  readonly allocations: { readonly before: ClaimAllocation | null; readonly after: ClaimAllocation | null };
}

/**
 * "Billable to the patient" for a claim match (PRD 13): the allowed increase from the line the baselines stood on
 * (`before`) to the match's line (`after`), the payer's payment increase (the chain's `net`), and the patient's
 * share by reason, each signed; what is neither is the payer's other reductions. Display only: nothing here is
 * counted, and a share allocated from the claim's level is flagged with its exact fraction.
 */
export function patientShareChange(input: { readonly before: ShareLine; readonly after: ShareLine; readonly paymentIncreaseCents: Cents }): PatientShareChange {
  const { before, after, paymentIncreaseCents } = input;
  for (const allocation of [before.allocation, after.allocation]) {
    if (allocation !== null && allocation.claimChargeCents <= ZERO_CENTS) {
      throw new LedgerError("a share allocated from the claim is a fraction of the claim's charges, which are more than zero");
    }
  }
  const change = (key: keyof PatientShare): Cents => cents(after.share[key] - before.share[key]);
  const shareChange: PatientShare = { deductibleCents: change('deductibleCents'), coinsuranceCents: change('coinsuranceCents'), copayCents: change('copayCents'), otherCents: change('otherCents') };
  const allowedIncreaseCents = cents(after.allowedCents - before.allowedCents);
  const shared = sumCents(Object.values(shareChange) as Cents[]);
  return {
    allowedIncreaseCents,
    paymentIncreaseCents,
    shareChange,
    otherReductionCents: cents(allowedIncreaseCents - paymentIncreaseCents - shared),
    billableCents: maxCents(shared, ZERO_CENTS),
    allocatedFromClaim: before.allocation !== null || after.allocation !== null,
    allocations: { before: before.allocation, after: after.allocation },
  };
}
