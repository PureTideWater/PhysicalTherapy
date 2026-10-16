import { type Cents, ZERO_CENTS, cents, sumCents } from '@tp/money';

/**
 * The matching rules as pure decisions (PRD 13, Matching; PRD 5, J10). The worker reads the
 * candidates from the database and writes what these decide; nothing here reads a row, a clock or a
 * model, and every amount is compared with a tolerance of zero.
 */

/** How a new claim was found for a case line: by payer claim control number first, else by patient control number, service date and code. */
export type ClaimMatchKey = 'payer_claim_control_number' | 'patient_control_number';

export interface ClaimCandidate {
  readonly claimId: string;
  readonly key: ClaimMatchKey;
}

/** Step 1's order: the candidates found by payer claim control number, else those found by patient control number. */
export function preferredCandidates<T extends ClaimCandidate>(candidates: readonly T[]): T[] {
  const byControlNumber = candidates.filter((candidate) => candidate.key === 'payer_claim_control_number');
  return byControlNumber.length > 0 ? byControlNumber : [...candidates];
}

export type Reprocessing =
  /** A higher observed allowed: an approved entry for the difference. */
  | { readonly kind: 'approved'; readonly amountCents: Cents }
  /** A lower observed allowed on a line already approved: a recouped entry, at most what was approved. */
  | { readonly kind: 'decreased'; readonly amountCents: Cents }
  /** The same, or lower with nothing approved to take back: a payer response "reprocessed, no change". */
  | { readonly kind: 'no_change' };

/**
 * A reprocessed claim's line against the case line (PRD 13, Matching step 1). The baseline is what the
 * line was allowed before: the original's observed allowed plus what the ledger already approved for it,
 * less what was taken back. `approvedRemaining` is what is approved and not yet taken back (zero or
 * more).
 */
export function reprocessing(input: { readonly baselineAllowedCents: Cents; readonly newAllowedCents: Cents; readonly approvedRemainingCents: Cents }): Reprocessing {
  const { baselineAllowedCents: baseline, newAllowedCents: next, approvedRemainingCents: remaining } = input;
  if (next > baseline) {
    return { kind: 'approved', amountCents: cents(next - baseline) };
  }
  if (next < baseline && remaining > ZERO_CENTS) {
    const decrease = baseline - next;
    return { kind: 'decreased', amountCents: cents(-(decrease < remaining ? decrease : remaining)) };
  }
  return { kind: 'no_change' };
}

export type CheckPosting =
  | { readonly kind: 'full' }
  | { readonly kind: 'partial' }
  | { readonly kind: 'unmatched'; readonly reason: 'check_not_positive' | 'amount_not_positive' | 'more_than_the_check' };

/**
 * A check-level posting row against the remittance whose check or trace number it carries (PRD 13,
 * Matching step 2, tolerance zero): the whole check at once is a full match; a positive part that keeps
 * every check-level posting of the check within it is a partial one, allocated pro rata; anything else
 * matches nothing and waits for a person.
 */
export function checkPosting(input: { readonly amountCents: Cents; readonly checkTotalCents: Cents; readonly postedBeforeCents: Cents }): CheckPosting {
  const { amountCents: amount, checkTotalCents: check, postedBeforeCents: before } = input;
  if (check <= ZERO_CENTS) {
    return { kind: 'unmatched', reason: 'check_not_positive' };
  }
  if (amount <= ZERO_CENTS) {
    return { kind: 'unmatched', reason: 'amount_not_positive' };
  }
  if (before + amount > check) {
    return { kind: 'unmatched', reason: 'more_than_the_check' };
  }
  return before === ZERO_CENTS && amount === check ? { kind: 'full' } : { kind: 'partial' };
}

export interface PostedClaimLine {
  readonly procedureCode: string;
  readonly serviceDate: string | null;
  readonly paidCents: Cents;
}

export interface PostedClaim {
  readonly claimId: string;
  readonly paidCents: Cents;
  readonly lines: readonly PostedClaimLine[];
}

/**
 * A line-level posting row against the claims of its check that carry its claim reference (PRD 13,
 * Matching step 2: "matched line by line where the export has lines"): the one claim whose payment, or
 * whose line of the row's code and service date, equals the row's amount exactly. None, or more than
 * one, matches nothing.
 */
export function linePosting(input: { readonly amountCents: Cents; readonly procedureCode: string | null; readonly serviceDate: string | null; readonly claims: readonly PostedClaim[] }): string | null {
  const { amountCents: amount, procedureCode: code, serviceDate: date } = input;
  const found = input.claims.filter((claim) =>
    code === null
      ? claim.paidCents === amount
      : claim.lines.some((line) => line.procedureCode === code && (date === null || line.serviceDate === date) && line.paidCents === amount),
  );
  return found.length === 1 ? (found[0] as PostedClaim).claimId : null;
}

/** A deposit row against its remittance (PRD 13, Matching step 3): the trace number found it; the amount is BPR02 exactly. */
export function depositMatches(input: { readonly amountCents: Cents; readonly paymentCents: Cents }): boolean {
  return input.paymentCents > ZERO_CENTS && input.amountCents === input.paymentCents;
}

/**
 * A batched deposit (PRD 13, Matching step 3: "where a bank batches several EFTs into one deposit, the
 * match is at the batch level and flagged"): the rows of one batch, each found its remittance by trace,
 * and the batch's total equals their payments' total exactly. A row whose trace found nothing leaves
 * the batch unmatched.
 */
export function batchMatches(input: { readonly rowAmounts: readonly Cents[]; readonly paymentCents: readonly (Cents | null)[] }): boolean {
  const { rowAmounts, paymentCents } = input;
  if (rowAmounts.length === 0 || rowAmounts.length !== paymentCents.length || paymentCents.some((payment) => payment === null || payment <= ZERO_CENTS)) {
    return false;
  }
  return sumCents(rowAmounts) === sumCents(paymentCents as readonly Cents[]);
}
