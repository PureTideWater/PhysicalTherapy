import { type Cents, ZERO_CENTS, addCents, cents } from '@tp/money';

import { type CountedStage, type LedgerEntry, type ProofLevel, countedStage, isCorrecting } from './stages';

/**
 * Totals from entries, never typed (PRD 13, Entries: "recovered is a derived total, never a typed
 * number"; .claude/rules/money-and-contracts.md: "Recovered = sum(posted or deposited) - recouped -
 * reversed"). With signed amounts that reads:
 *
 * - recovered = the proof level's stage (posted or deposited, the practice's setting), net of the
 *   reversals and adjustments of its entries, plus the recouped entries (negative) net of theirs;
 * - approved is its own stage and is never summed into recovered; nor is the stage that is not the
 *   proof level (a practice proving by posting shows its deposits as their own stage);
 * - interest is its own category beside recovered principal;
 * - a forward balance (PLB FB) is never an entry: it is shown pending and counts nothing until a
 *   recoupment resolves it.
 *
 * A reversal counts toward the stage of the entry it reverses, so a reversed posting nets the posted
 * total to zero and a reversed approval nets the approved total; neither touches another stage.
 */

export interface StageTotals {
  readonly approvedCents: Cents;
  readonly postedCents: Cents;
  readonly depositedCents: Cents;
  /** Zero or negative. */
  readonly recoupedCents: Cents;
  readonly interestCents: Cents;
}

export interface LedgerTotals extends StageTotals {
  readonly proofLevel: ProofLevel;
  /** The proof level's stage plus the recoupments: the only "recovered". */
  readonly recoveredCents: Cents;
  /** The entries each figure sums, in ledger order (every figure links to its entries, PRD 13, ROI statement). */
  readonly entryIds: { readonly recovered: readonly string[]; readonly approved: readonly string[]; readonly interest: readonly string[] };
}

const EMPTY: Record<CountedStage, Cents> = { approved: ZERO_CENTS, posted: ZERO_CENTS, deposited: ZERO_CENTS, recouped: ZERO_CENTS, interest: ZERO_CENTS };

/** Every entry the ledger holds by ID: the targets of corrections are looked up here. */
export function entriesById(entries: readonly LedgerEntry[]): Map<string, LedgerEntry> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

/**
 * The totals of `entries`, whose corrections' targets are in `ledger` (by default the entries
 * themselves; pass the whole ledger when totalling a period or a case whose corrections name earlier
 * entries).
 */
export function ledgerTotals(entries: readonly LedgerEntry[], proofLevel: ProofLevel, ledger: ReadonlyMap<string, LedgerEntry> = entriesById(entries)): LedgerTotals {
  const sums: Record<CountedStage, Cents> = { ...EMPTY };
  const recovered: string[] = [];
  const approved: string[] = [];
  const interest: string[] = [];
  for (const entry of entries) {
    const stage = countedStage(entry, ledger);
    sums[stage] = addCents(sums[stage], entry.amountCents);
    if (stage === proofLevel || stage === 'recouped') {
      recovered.push(entry.id);
    } else if (stage === 'approved') {
      approved.push(entry.id);
    } else if (stage === 'interest') {
      interest.push(entry.id);
    }
  }
  return {
    proofLevel,
    approvedCents: sums.approved,
    postedCents: sums.posted,
    depositedCents: sums.deposited,
    recoupedCents: sums.recouped,
    interestCents: sums.interest,
    recoveredCents: addCents(sums[proofLevel], sums.recouped),
    entryIds: { recovered, approved, interest },
  };
}

/** Recovered for the entries: the proof level's stage plus recoupments, net of their corrections. */
export function recoveredCents(entries: readonly LedgerEntry[], proofLevel: ProofLevel, ledger?: ReadonlyMap<string, LedgerEntry>): Cents {
  return ledgerTotals(entries, proofLevel, ledger).recoveredCents;
}

/** The entries of a case. */
export function caseEntries(entries: readonly LedgerEntry[], caseId: string): LedgerEntry[] {
  return entries.filter((entry) => entry.caseId === caseId);
}

/** The entries of a service line. */
export function lineEntries(entries: readonly LedgerEntry[], serviceLineId: string): LedgerEntry[] {
  return entries.filter((entry) => entry.serviceLineId === serviceLineId);
}

/** The entries whose money moved inside the period (both ends included; calendar dates). */
export function periodEntries(entries: readonly LedgerEntry[], from: string, to: string): LedgerEntry[] {
  return entries.filter((entry) => entry.effectiveOn >= from && entry.effectiveOn <= to);
}

/** A forward balance against a case (PLB FB): recorded, shown pending, never counted (PRD 13). */
export interface ForwardBalance {
  readonly providerAdjustmentId: string;
  /** As the PLB carries it: positive withholds from the payment, negative releases. */
  readonly amountCents: Cents;
}

/** What forward balances hold pending: their sum, which no total includes. */
export function pendingForwardBalanceCents(balances: readonly ForwardBalance[]): Cents {
  return cents(balances.reduce((total, balance) => total + balance.amountCents, 0n));
}

/**
 * The stage the ledger puts a service line at (PRD 8, The status machine): nothing (no approval
 * stands, or a recoupment came after the latest approval: the line is reopened, back to actionable, with
 * the negative entry behind it), payer approved, or recovered. A line is recovered when its proof
 * level's stage covers everything approved for it and its latest proof entry came after any recoupment
 * (PRD 13, Recoupments and reversals: "Lines move to recovered only when the proof level is met and back
 * ... on recoupment"). An entry a reversal undid does not stand. `entries` are the line's, in ledger
 * order.
 */
export function lineLedgerStage(entries: readonly LedgerEntry[], proofLevel: ProofLevel, ledger: ReadonlyMap<string, LedgerEntry> = entriesById(entries)): 'payer_approved' | 'recovered' | null {
  const totals = ledgerTotals(entries, proofLevel, ledger);
  if (totals.approvedCents <= ZERO_CENTS) {
    return null;
  }
  const undone = new Set(entries.filter((entry) => entry.stage === 'reversed').map((entry) => entry.evidenceId));
  const latest: Record<CountedStage, number> = { approved: -1, posted: -1, deposited: -1, recouped: -1, interest: -1 };
  entries.forEach((entry, index) => {
    if (!isCorrecting(entry.stage) && !undone.has(entry.id)) {
      latest[entry.stage as CountedStage] = index;
    }
  });
  if (latest.recouped > latest.approved) {
    return null;
  }
  const proof = proofLevel === 'posted' ? totals.postedCents : totals.depositedCents;
  return proof >= totals.approvedCents && latest[proofLevel] > latest.recouped ? 'recovered' : 'payer_approved';
}
