import { type Cents, ZERO_CENTS, cents } from '@tp/money';

import { LedgerError } from './stages';

/**
 * Pro-rata shares in integer cents (PRD 13, Matching step 2: "otherwise at the check level with the
 * case's share allocated pro rata and flagged as allocated"). Every division rounds half up once, in
 * bigint arithmetic; nothing passes through a float.
 */

/** n / d rounded half up, for n >= 0 and d > 0. */
function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

/**
 * What the check-level postings of a check allocate to one case line, cumulatively: the share times
 * the amount posted so far over the check total, rounded half up. A partial posting's entry is what
 * the postings up to and including it allocate minus what those before it did, so the entries of a
 * check posted in parts add up to exactly the share once the whole check has posted.
 */
export function cumulativeShare(share: Cents, postedSoFar: Cents, checkTotal: Cents): Cents {
  if (checkTotal <= ZERO_CENTS || share < ZERO_CENTS || postedSoFar < ZERO_CENTS || postedSoFar > checkTotal) {
    throw new LedgerError('a share is allocated from a positive check, a share of zero or more, and postings within the check');
  }
  return cents(divideHalfUp(share * postedSoFar, checkTotal));
}

/** The share of one partial posting: cumulativeShare after it minus cumulativeShare before it. */
export function partialShare(share: Cents, postedBefore: Cents, posted: Cents, checkTotal: Cents): Cents {
  if (posted <= ZERO_CENTS) {
    throw new LedgerError('a partial posting posts a positive amount');
  }
  return cents(cumulativeShare(share, cents(postedBefore + posted), checkTotal) - cumulativeShare(share, postedBefore, checkTotal));
}

/**
 * Splits `total` (zero or more) across `weights` (each zero or more, at least one positive) in
 * proportion, by largest remainder: each part is within a cent of its exact share and the parts add up
 * to exactly the total. Ties in the remainder go to the earlier weight.
 */
export function allocateByWeight(total: Cents, weights: readonly Cents[]): Cents[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0n);
  if (total < ZERO_CENTS || weights.some((weight) => weight < ZERO_CENTS) || sum <= 0n) {
    throw new LedgerError('an amount is allocated by weights of zero or more that are not all zero');
  }
  const floors = weights.map((weight) => (total * weight) / sum);
  const remainders = weights.map((weight, index) => ({ index, remainder: (total * weight) % sum }));
  let left = total - floors.reduce((acc, part) => acc + part, 0n);
  const order = [...remainders].sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));
  const parts = [...floors];
  for (const { index } of order) {
    if (left === 0n) {
      break;
    }
    parts[index] = (parts[index] as bigint) + 1n;
    left -= 1n;
  }
  return parts.map((part) => cents(part));
}

/**
 * Takes `total` (zero or more) from capacities in order, each at most its capacity: what a recoupment
 * takes back from the lines it names, never more than each line has to give. The rest is what nothing
 * could absorb.
 */
export function takeInOrder(total: Cents, capacities: readonly Cents[]): { readonly parts: Cents[]; readonly rest: Cents } {
  if (total < ZERO_CENTS || capacities.some((capacity) => capacity < ZERO_CENTS)) {
    throw new LedgerError('an amount is taken from capacities of zero or more');
  }
  let left: bigint = total;
  const parts = capacities.map((capacity) => {
    const part = left < capacity ? left : capacity;
    left -= part;
    return cents(part);
  });
  return { parts, rest: cents(left) };
}
