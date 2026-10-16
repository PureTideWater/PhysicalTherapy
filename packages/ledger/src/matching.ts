import { type Cents, ZERO_CENTS, cents, sumCents } from '@tp/money';

import { LedgerError } from './stages';

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
  /** Higher than the remittances paid and every acceptance they have not paid yet: an approved entry for the rest. */
  | { readonly kind: 'approved'; readonly amountCents: Cents }
  /**
   * More than the remittances paid, within what a payer response accepted and no remittance paid yet:
   * it pays (part of) that acceptance, which the response already approved, so it writes no entry; what
   * it leaves unpaid of the acceptance is a shortfall a person adjusts or disputes.
   */
  | { readonly kind: 'confirmed'; readonly paidCents: Cents; readonly shortfallCents: Cents }
  /** Lower than the remittances paid, on a line already approved: a recouped entry, at most what was approved. */
  | { readonly kind: 'decreased'; readonly amountCents: Cents }
  /** The same as the remittances paid, or lower with nothing approved to take back: a payer response "reprocessed, no change". */
  | { readonly kind: 'no_change' };

/**
 * A reprocessed claim's line against the case line (PRD 13, Matching step 1 and Recoupments and
 * reversals). The baseline is what the remittances have allowed the line so far: the original's observed
 * allowed as the reprocessings since changed it (their approvals and decreases) less what recoupments
 * took back; never an approval a payer response made that no remittance has paid. `unpaidApproval` is
 * that part of the approvals (zero or more); `approvedRemaining` is what is approved and not yet taken
 * back (zero or more). Only a payment below the baseline takes money back.
 */
export function reprocessing(input: { readonly remittanceAllowedCents: Cents; readonly unpaidApprovalCents: Cents; readonly newAllowedCents: Cents; readonly approvedRemainingCents: Cents }): Reprocessing {
  const { remittanceAllowedCents: baseline, unpaidApprovalCents: unpaid, newAllowedCents: next, approvedRemainingCents: remaining } = input;
  if (unpaid < ZERO_CENTS || remaining < ZERO_CENTS) {
    throw new LedgerError('a reprocessing is compared with an unpaid approval and an approval remaining of zero or more');
  }
  if (next > baseline + unpaid) {
    return { kind: 'approved', amountCents: cents(next - baseline - unpaid) };
  }
  if (next > baseline) {
    return { kind: 'confirmed', paidCents: cents(next - baseline), shortfallCents: cents(baseline + unpaid - next) };
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
 * Whether a line-level posting row posts this line of its claim (PRD 13, Matching step 2: "matched line
 * by line where the export has lines"): the line of the row's code and, when the row has one, its date
 * of service, paid exactly the row's amount. A row without a code posts its claim as a whole.
 */
export function postsLine(row: { readonly amountCents: Cents; readonly procedureCode: string | null; readonly serviceDate: string | null }, line: PostedClaimLine): boolean {
  return row.procedureCode === null || (line.procedureCode === row.procedureCode && (row.serviceDate === null || line.serviceDate === row.serviceDate) && line.paidCents === row.amountCents);
}

/**
 * A line-level posting row against the claims of its check that carry its claim reference (PRD 13,
 * Matching step 2): the one claim whose payment (a row without a code), or one of whose lines (postsLine),
 * is the row's amount exactly. None, or more than one, matches nothing.
 */
export function linePosting(input: { readonly amountCents: Cents; readonly procedureCode: string | null; readonly serviceDate: string | null; readonly claims: readonly PostedClaim[] }): string | null {
  const found = input.claims.filter((claim) => (input.procedureCode === null ? claim.paidCents === input.amountCents : claim.lines.some((line) => postsLine(input, line))));
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
