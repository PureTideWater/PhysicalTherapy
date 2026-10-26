import { allocateProRata } from '@tp/edi835';
import { type ClaimAllocation, type PatientShare, type PatientShareChange, type ShareLine, countedStage, entriesById, patientShareChange } from '@tp/ledger';
import { type Cents, ZERO_CENTS, cents, negateCents, parseCents, sumCents } from '@tp/money';

import { type Scope, ledgerEntries } from './ledger';
import { type ChainClaim, type ClaimLine, type LineChain, chainContext, lineChain } from './remittances';

/**
 * "Billable to the patient" and the payer's corrections that pay nothing more (PRD 13, Matching step 1;
 * docs/adr/0067), read from stored rows for the screens and the audit report: never written, and counted
 * in no total, statement, link, CSV, digest or headline.
 *
 * - The patient's share of a claim's line is its own CAS group PR rows by reason (PR-1 deductible, PR-2
 *   coinsurance, PR-3 copay, any other PR reason); a line with none whose claim carries PR at the claim
 *   level, while no line of the claim carries any, takes its part of the claim's by charge (@tp/edi835
 *   allocateProRata, the parser's own rule), flagged with the exact fraction (its charge over the
 *   claim's). Allowed less paid is never read as the patient's share: it can hold the payer's other
 *   reductions.
 * - Each standing claim match of a case line is read against the line its baselines stood on just
 *   before it (@tp/ledger paymentChain): the allowed increase, the payer's payment increase (the
 *   chain's own `net`, the figure the ledger posts), the patient's share by reason, signed, and the rest,
 *   the payer's other reductions (@tp/ledger patientShareChange). A line's payment is its cash, its share
 *   of CLP04 (remittances.ts claimLines), so a claim-level PR is taken off the payment by the same rule
 *   that allocates it to the share: shown once, as billable to the patient, never as other reductions.
 * - A line's correction pays nothing more when its latest standing approving claim match wrote no entry
 *   and its payment increase is zero: "patient_balance" when the patient's share rose ("Payer
 *   corrected; balance is the patient's"), else "other_reductions". Never recovered, never no change.
 * - A line's billable to the patient is the patient's share from its original claim's line to the line
 *   its baselines stand on now (null while they stand on the original).
 */

/** How a standing claim match reads on the ERA list, beside its stored outcome. */
export type MatchReading =
  /** An approved entry for the payer's payment increase. */
  | 'approved'
  /** It paid (part of) what a payer response accepted: no entry of its own. */
  | 'confirmed'
  /** The patient's share took the whole increase: no entry. */
  | 'patient_balance'
  /** The payer's other reductions took the whole increase: no entry, nothing billable. */
  | 'other_reductions'
  /** A take-back of the payment decrease. */
  | 'taken_back'
  /** The payment fell with nothing approved to take back: no entry. */
  | 'nothing_to_take_back'
  /** The allowed amount fell and the payment did not: no entry. */
  | 'payment_did_not_fall'
  | 'no_change';

export interface MatchCorrection {
  readonly matchId: string;
  readonly claimId: string;
  readonly remittanceId: string;
  readonly outcome: 'approved' | 'decreased' | 'no_change';
  /** Which way the allowed amount moved from the baseline the outcome was decided against. */
  readonly allowed: 'higher' | 'same' | 'lower';
  readonly reading: MatchReading;
  /** The entry the match wrote itself: approved (above zero), recouped (below zero), or none (zero). */
  readonly entryCents: Cents;
  /** The match's line against the line the baselines stood on just before it. */
  readonly change: PatientShareChange;
}

export type CorrectionKind = 'patient_balance' | 'other_reductions';

export interface LineCorrection {
  readonly caseId: string;
  readonly serviceLineId: string;
  /** Set when the line's latest standing approving claim match paid nothing more. */
  readonly correction: CorrectionKind | null;
  /** The patient's share from the original claim's line to the line the baselines stand on now; null while they stand on the original. */
  readonly billable: PatientShareChange | null;
  /** The standing claim matches, in chain order. */
  readonly matches: readonly MatchCorrection[];
}

const NO_SHARE: PatientShare = { deductibleCents: ZERO_CENTS, coinsuranceCents: ZERO_CENTS, copayCents: ZERO_CENTS, otherCents: ZERO_CENTS };

const REASON_KEY: Readonly<Record<string, keyof PatientShare>> = { '1': 'deductibleCents', '2': 'coinsuranceCents', '3': 'copayCents' };

interface PrRow {
  readonly claim_id: string;
  readonly service_line_id: string | null;
  readonly reason_code: string;
  readonly amount_cents: string;
}

/** A share by reason from PR adjustments. */
function shareOf(rows: readonly PrRow[]): PatientShare {
  const share: Record<keyof PatientShare, bigint> = { ...NO_SHARE };
  for (const row of rows) {
    share[REASON_KEY[row.reason_code] ?? 'otherCents'] += parseCents(row.amount_cents);
  }
  return { deductibleCents: cents(share.deductibleCents), coinsuranceCents: cents(share.coinsuranceCents), copayCents: cents(share.copayCents), otherCents: cents(share.otherCents) };
}

/** The patient's share of every line of the claims named, by service line, with the claim-level allocation where it applies. */
async function lineShares(scope: Scope, practiceId: string, claimIds: readonly string[]): Promise<Map<string, Pick<ShareLine, 'share' | 'allocation'>>> {
  const ids = [...new Set(claimIds)];
  const { rows: adjustments } = await scope.client.query<PrRow>(
    "SELECT a.claim_id, a.service_line_id, a.reason_code, a.amount_cents::text AS amount_cents FROM adjustment a WHERE a.practice_id = $1 AND a.claim_id = ANY ($2::uuid[]) AND a.group_code = 'PR' ORDER BY a.claim_id, a.position",
    [practiceId, ids],
  );
  const { rows: lines } = await scope.client.query<{ id: string; claim_id: string; charge_cents: string }>(
    'SELECT s.id, s.claim_id, s.charge_cents::text AS charge_cents FROM service_line s WHERE s.practice_id = $1 AND s.claim_id = ANY ($2::uuid[]) ORDER BY s.claim_id, s.line_no',
    [practiceId, ids],
  );
  const shares = new Map<string, Pick<ShareLine, 'share' | 'allocation'>>();
  for (const claimId of ids) {
    const claimLines = lines.filter((line) => line.claim_id === claimId);
    const atClaim = adjustments.filter((row) => row.claim_id === claimId && row.service_line_id === null);
    const allocate = atClaim.length > 0 && !adjustments.some((row) => row.claim_id === claimId && row.service_line_id !== null);
    const charges = claimLines.map((line) => parseCents(line.charge_cents));
    const claimChargeCents = sumCents(charges.map((charge) => (charge < ZERO_CENTS ? negateCents(charge) : charge)));
    // Each reason of the claim's PR split over its lines by charge, as the parser split the total.
    const byReason = allocate ? (Object.keys(NO_SHARE) as (keyof PatientShare)[]).map((key) => allocateProRata(shareOf(atClaim)[key], charges)) : [];
    for (const [index, line] of claimLines.entries()) {
      if (!allocate) {
        shares.set(line.id, { share: shareOf(adjustments.filter((row) => row.service_line_id === line.id)), allocation: null });
        continue;
      }
      const [deductibleCents, coinsuranceCents, copayCents, otherCents] = byReason.map((parts) => parts[index] as Cents) as [Cents, Cents, Cents, Cents];
      const allocation: ClaimAllocation = { lineChargeCents: charges[index] as Cents, claimChargeCents };
      shares.set(line.id, { share: { deductibleCents, coinsuranceCents, copayCents, otherCents }, allocation });
    }
  }
  return shares;
}

const direction = (next: Cents, baseline: Cents): MatchCorrection['allowed'] => (next > baseline ? 'higher' : next < baseline ? 'lower' : 'same');

function readingOf(outcome: MatchCorrection['outcome'], allowed: MatchCorrection['allowed'], entryCents: Cents, change: PatientShareChange): MatchReading {
  if (outcome === 'no_change') {
    return 'no_change';
  }
  if (outcome === 'decreased') {
    return entryCents < ZERO_CENTS ? 'taken_back' : allowed === 'lower' ? 'payment_did_not_fall' : 'nothing_to_take_back';
  }
  if (entryCents > ZERO_CENTS) {
    return 'approved';
  }
  if (change.paymentIncreaseCents > ZERO_CENTS) {
    return 'confirmed';
  }
  return change.billableCents > ZERO_CENTS ? 'patient_balance' : 'other_reductions';
}

/**
 * Whether a case shows "Payer corrected; balance is the patient's" (docs/adr/0067; design 2.3), the one rule the
 * case and Reconciliation screens and the audit report read: one of its lines not written off is a correction the
 * patient's share took whole, and every other such line is one too or is payer approved or recovered (its latest
 * line_status stage). The case's stored state is case_rules' as ever; this is said beside it until the stored close
 * lands.
 */
export function casePatientBalance(lines: readonly { readonly correction: CorrectionKind | null; readonly writtenOff: boolean; readonly stage: string | null }[]): boolean {
  const open = lines.filter((line) => !line.writtenOff);
  return (
    open.some((line) => line.correction === 'patient_balance') &&
    open.every((line) => line.correction === 'patient_balance' || line.stage === 'payer_approved' || line.stage === 'recovered')
  );
}

/** The case lines named, each with its claim matches read in payment terms, its correction and its billable to the patient. */
export async function lineCorrections(scope: Scope, practiceId: string, serviceLineIds: readonly string[]): Promise<Map<string, LineCorrection>> {
  const corrections = new Map<string, LineCorrection>();
  if (serviceLineIds.length === 0) {
    return corrections;
  }
  const { rows } = await scope.client.query<{ case_id: string; service_line_id: string; claim_id: string }>(
    'SELECT cl.case_id, cl.service_line_id, l.claim_id FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id WHERE cl.practice_id = $1 AND cl.service_line_id = ANY ($2::uuid[])',
    [practiceId, serviceLineIds],
  );
  const entries = await ledgerEntries(scope, practiceId);
  const byId = entriesById(entries);
  // What each match's own entries approved (net of their corrections).
  const approvedBy = new Map<string, bigint>();
  for (const entry of entries) {
    if (entry.matchId !== null && countedStage(entry, byId) === 'approved') {
      approvedBy.set(entry.matchId, (approvedBy.get(entry.matchId) ?? 0n) + entry.amountCents);
    }
  }
  const context = await chainContext(scope, practiceId, rows.map((row) => row.claim_id), entries);
  const chains = rows.map((row) => ({ row, chain: lineChain(context, { serviceLineId: row.service_line_id, claimId: row.claim_id }) }));
  const shares = await lineShares(
    scope,
    practiceId,
    chains.flatMap(({ chain }) => (chain === undefined ? [] : chain.claims.map((claim) => claim.claimId))),
  );
  const shareLine = (line: ClaimLine): ShareLine => ({ allowedCents: line.observedAllowedCents, paidCents: line.paidCents, ...(shares.get(line.serviceLineId) ?? { share: NO_SHARE, allocation: null }) });
  for (const { row, chain } of chains) {
    if (chain === undefined) {
      continue;
    }
    const lineOf = (matchId: string | null): ClaimLine => chain.claims.find((claim) => (claim.match?.id ?? null) === matchId)?.line ?? chain.original;
    const matches = chain.claims.flatMap((claim): MatchCorrection[] => (claim.match === null ? [] : [matchCorrection(chain, { ...claim, match: claim.match }, approvedBy, context.recouped, lineOf, shareLine)]));
    const latest = matches.filter((match) => match.outcome === 'approved').at(-1);
    const correction = latest !== undefined && (latest.reading === 'patient_balance' || latest.reading === 'other_reductions') ? latest.reading : null;
    const anchor = chain.chain.current.anchorMatchId;
    const billable =
      anchor === null
        ? null
        : patientShareChange({ before: shareLine(chain.original), after: shareLine(lineOf(anchor)), paymentIncreaseCents: cents(lineOf(anchor).paidCents - chain.original.paidCents) });
    corrections.set(row.service_line_id, { caseId: row.case_id, serviceLineId: row.service_line_id, correction, billable, matches });
  }
  return corrections;
}

/** A standing claim match read against the line its baselines stood on just before it. */
function matchCorrection(
  chain: LineChain,
  claim: ChainClaim & { readonly match: NonNullable<ChainClaim['match']> },
  approvedBy: ReadonlyMap<string, bigint>,
  recouped: ReadonlyMap<string, Cents>,
  lineOf: (matchId: string | null) => ClaimLine,
  shareLine: (line: ClaimLine) => ShareLine,
): MatchCorrection {
  const { match } = claim;
  const matchId = match.id;
  const before = chain.chain.before.get(matchId);
  const baselineAllowed = before?.allowedCents ?? chain.original.observedAllowedCents;
  const change = patientShareChange({ before: shareLine(lineOf(before?.anchorMatchId ?? null)), after: shareLine(claim.line), paymentIncreaseCents: chain.chain.net.get(matchId) ?? ZERO_CENTS });
  const outcome = match.outcome ?? 'no_change';
  const allowed = direction(claim.line.observedAllowedCents, baselineAllowed);
  const entryCents = cents((approvedBy.get(matchId) ?? 0n) + (recouped.get(matchId) ?? ZERO_CENTS));
  return { matchId, claimId: claim.claimId, remittanceId: match.remittanceId, outcome, allowed, reading: readingOf(outcome, allowed, entryCents, change), entryCents, change };
}
