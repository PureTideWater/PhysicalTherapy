/**
 * Balancing and observed allowed (PRD sections 2 and 10; docs/adr/0021, which the writer in
 * packages/synth and the pyx12 oracle apply identically):
 *
 * - claim: CLP03 - every CAS amount in the claim (claim and line level) - CLP04 = 0;
 * - lines, where present: the SVC02 charges sum to CLP03;
 * - a line balances on its own (SVC02 - its CAS - SVC03 = 0) when it carries CAS, or when its claim
 *   carries no claim-level CAS;
 * - transaction: claims paid (sum of CLP04) - provider adjustments (sum of PLB amounts) - payment = 0,
 *   the payment being BPR02, negative when BPR03 is D.
 *
 * Observed allowed per line: AMT B6 when sent; otherwise SVC03 plus the line's PR adjustments; when
 * the claim carries PR adjustments and no line does, the claim's PR total is allocated over every
 * line in proportion to its charge (each share truncated toward zero, the remaining cents one at a
 * time in line order); a line with B6 keeps B6, which already includes its share, and the lines
 * without B6 take their shares and are flagged.
 */
import { type Cents, addCents, cents, negateCents, subtractCents, sumCents } from '@tp/money';

import { type Adjustment, type ObservedAllowed } from './types';

export function casTotal(adjustments: readonly Adjustment[]): Cents {
  return sumCents(adjustments.map((adjustment) => adjustment.cents));
}

export function patientShare(adjustments: readonly Adjustment[]): Cents {
  return sumCents(adjustments.filter((adjustment) => adjustment.group === 'PR').map((adjustment) => adjustment.cents));
}

/** Splits `total` in proportion to `weights` (their magnitudes); leftover cents go one each to the first. */
export function allocateProRata(total: Cents, weights: readonly Cents[]): Cents[] {
  if (weights.length === 0) {
    return [];
  }
  const magnitudes = weights.map((weight): bigint => (weight < 0n ? negateCents(weight) : weight));
  const sum = magnitudes.reduce((a, b) => a + b, 0n);
  const shares = magnitudes.map((weight) => (sum === 0n ? total / BigInt(weights.length) : (total * weight) / sum));
  let remainder = total - shares.reduce((a, b) => a + b, 0n);
  const step = remainder < 0n ? -1n : 1n;
  for (let index = 0; remainder !== 0n; index = (index + 1) % shares.length) {
    shares[index] = (shares[index] as bigint) + step;
    remainder -= step;
  }
  return shares.map((share) => cents(share));
}

export interface LineFigures {
  readonly chargeCents: Cents;
  readonly paidCents: Cents;
  readonly adjustments: readonly Adjustment[];
  readonly lineAllowedCents: Cents | null;
}

export interface ClaimFigures {
  readonly chargeCents: Cents;
  readonly paidCents: Cents;
  readonly adjustments: readonly Adjustment[];
  readonly lines: readonly LineFigures[];
}

export interface ClaimBalance {
  readonly claimDifferenceCents: Cents;
  readonly lineChargeDifferenceCents: Cents | null;
  /** Per line: SVC02 - its CAS - SVC03, or null when the line is reconciled by the claim alone. */
  readonly lineDifferences: readonly (Cents | null)[];
  readonly balanced: boolean;
}

export function balanceClaim(claim: ClaimFigures): ClaimBalance {
  const lineCas = sumCents(claim.lines.map((line) => casTotal(line.adjustments)));
  const claimDifferenceCents = subtractCents(subtractCents(subtractCents(claim.chargeCents, casTotal(claim.adjustments)), lineCas), claim.paidCents);
  const lineChargeDifferenceCents = claim.lines.length === 0 ? null : subtractCents(sumCents(claim.lines.map((line) => line.chargeCents)), claim.chargeCents);
  const claimLevelCas = claim.adjustments.length > 0;
  const lineDifferences = claim.lines.map((line) =>
    line.adjustments.length > 0 || !claimLevelCas ? subtractCents(subtractCents(line.chargeCents, casTotal(line.adjustments)), line.paidCents) : null,
  );
  const balanced = claimDifferenceCents === 0n && (lineChargeDifferenceCents ?? 0n) === 0n && lineDifferences.every((difference) => difference === null || difference === 0n);
  return { claimDifferenceCents, lineChargeDifferenceCents, lineDifferences, balanced };
}

export function observedAllowed(claim: ClaimFigures): ObservedAllowed[] {
  const claimShare = patientShare(claim.adjustments);
  const linesCarryShare = claim.lines.some((line) => line.adjustments.some((adjustment) => adjustment.group === 'PR'));
  const allocate = claimShare !== 0n && !linesCarryShare;
  // Over every line, B6 or not: a B6 line's allowed already holds its share, which no other line takes.
  const shares = allocate ? allocateProRata(claimShare, claim.lines.map((line) => line.chargeCents)) : [];
  return claim.lines.map((line, position) => {
    if (line.lineAllowedCents !== null) {
      return { cents: line.lineAllowedCents, basis: 'amt_b6', allocatedFromClaim: false, allocatedPatientShareCents: null };
    }
    if (allocate) {
      const share = shares[position] as Cents;
      return { cents: addCents(line.paidCents, share), basis: 'paid_plus_pr', allocatedFromClaim: true, allocatedPatientShareCents: share };
    }
    return { cents: addCents(line.paidCents, patientShare(line.adjustments)), basis: 'paid_plus_pr', allocatedFromClaim: false, allocatedPatientShareCents: null };
  });
}
