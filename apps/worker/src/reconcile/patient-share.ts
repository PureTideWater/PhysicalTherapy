import { type PatientShare, type PatientShareChange, type ShareLine, claimAllocations, claimLevelShares, countedStage, entriesById, patientShareChange } from '@tp/ledger';
import { type Cents, ZERO_CENTS, cents, parseCents } from '@tp/money';

import { type Scope, type StoredEntry, ledgerEntries } from './ledger';
import { type ChainClaim, type ClaimLine, type LineChain, chainContext, claimLines, lineChain } from './remittances';

/**
 * "Billable to the patient" and the payer's corrections that pay nothing more (PRD 13, Matching step 1;
 * docs/adr/0067), read from stored rows for the screens and the audit report: never written, and counted
 * in no total, statement, link, CSV, digest or headline.
 *
 * - The patient's share of a claim's line is its own CAS group PR rows by reason (PR-1 deductible, PR-2
 *   coinsurance, PR-3 copay, any other PR reason), plus, when its claim carries CAS at the claim's level,
 *   the PR reasons of its part of it: the part its cash is short of SVC03 (remittances.ts claimLines;
 *   @tp/ledger claimLevelShares), taken by the same lines (those carrying CAS of their own, every line when
 *   none does) by the same weights (each one's allowed amount before the claim-level CAS), rounded once and
 *   split over the claim's reasons, flagged with the weights (its own over the claim's). Allowed less paid is
 *   never read as the patient's share: it can hold the payer's other reductions.
 * - Each standing claim match of a case line is read against the line its baselines stood on just
 *   before it (@tp/ledger paymentChain): the allowed increase, the payer's payment increase (the
 *   chain's own `net`, the figure the ledger posts), the patient's share by reason, signed, and the rest,
 *   the payer's other reductions (@tp/ledger patientShareChange). A line's payment is its cash, its share
 *   of CLP04 (remittances.ts claimLines), so a claim-level PR is taken off the payment by the same rule, the
 *   same lines and the same rounded part that give it to the share: shown once, as billable to the patient,
 *   never as other reductions, whether or not the line carries PR of its own.
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

interface AdjustmentRow {
  readonly claim_id: string;
  readonly service_line_id: string | null;
  readonly group_code: string;
  readonly reason_code: string;
  readonly amount_cents: string;
}

type ShareCents = Record<keyof PatientShare, bigint>;

const shareKey = (reasonCode: string): keyof PatientShare => REASON_KEY[reasonCode] ?? 'otherCents';

const asShare = (share: ShareCents): PatientShare => ({
  deductibleCents: cents(share.deductibleCents),
  coinsuranceCents: cents(share.coinsuranceCents),
  copayCents: cents(share.copayCents),
  otherCents: cents(share.otherCents),
});

/**
 * The patient's share of every line of the claims named, by service line: its own PR rows by reason, and its part of
 * the claim's CAS at the claim's level by the cash's own rule (remittances.ts claimLines, @tp/ledger claimLevelShares:
 * the same lines take a part, by the same weights, keeping the same parts, the line's one rounded part split over
 * the claim's reasons), its PR reasons the patient's and flagged with the weights it was split by. The adjustments are
 * grouped once, the claim-level ones by claim and the line-level ones by line, each group in the query's order, so each
 * line reads its own and its claim's in the order a filter of them all would give (SUITE-CAP-1a D16; docs/adr/0083).
 */
export async function lineShares(scope: Scope, practiceId: string, claimIds: readonly string[]): Promise<Map<string, Pick<ShareLine, 'share' | 'allocation'>>> {
  const ids = [...new Set(claimIds)];
  const { rows: adjustments } = await scope.client.query<AdjustmentRow>(
    "SELECT a.claim_id, a.service_line_id, a.group_code, a.reason_code, a.amount_cents::text AS amount_cents FROM adjustment a WHERE a.practice_id = $1 AND a.claim_id = ANY ($2::uuid[]) AND (a.service_line_id IS NULL OR a.group_code = 'PR') ORDER BY a.claim_id, a.position",
    [practiceId, ids],
  );
  const claimLevelOf = new Map<string, AdjustmentRow[]>();
  const lineLevelOf = new Map<string, AdjustmentRow[]>();
  for (const row of adjustments) {
    const [groups, key] = row.service_line_id === null ? [claimLevelOf, row.claim_id] : [lineLevelOf, row.service_line_id];
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [row]);
    } else {
      group.push(row);
    }
  }
  const lines = await claimLines(scope, ids);
  const shares = new Map<string, Pick<ShareLine, 'share' | 'allocation'>>();
  for (const [claimId, claimLinesOf] of lines) {
    const atClaim = claimLevelOf.get(claimId) ?? [];
    const splits = claimLinesOf.map((line) => line.split);
    const parts = claimLevelShares({ lines: splits, reasonCents: atClaim.map((row) => parseCents(row.amount_cents)) });
    const allocations = atClaim.some((row) => row.group_code === 'PR') ? claimAllocations(splits) : splits.map(() => null);
    for (const [index, line] of claimLinesOf.entries()) {
      const share: ShareCents = { ...NO_SHARE };
      for (const row of lineLevelOf.get(line.serviceLineId) ?? []) {
        share[shareKey(row.reason_code)] += parseCents(row.amount_cents);
      }
      for (const [position, row] of atClaim.entries()) {
        if (row.group_code === 'PR') {
          share[shareKey(row.reason_code)] += (parts[index] as Cents[])[position] as Cents;
        }
      }
      shares.set(line.serviceLineId, { share: asShare(share), allocation: allocations[index] ?? null });
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

/**
 * The case lines named, each with its claim matches read in payment terms, its correction and its billable to the patient.
 * A line's answer reads its own claim's chain and shares alone, so it is the same whichever other lines share the call.
 * `entries` are the practice's ledger entries when the caller has read them already (the audit report reads them once
 * for its cases and every batch of their lines, SUITE-CAP-1a D18); otherwise they are read here.
 */
export async function lineCorrections(scope: Scope, practiceId: string, serviceLineIds: readonly string[], entries?: readonly StoredEntry[]): Promise<Map<string, LineCorrection>> {
  const corrections = new Map<string, LineCorrection>();
  if (serviceLineIds.length === 0) {
    return corrections;
  }
  const { rows } = await scope.client.query<{ case_id: string; service_line_id: string; claim_id: string }>(
    'SELECT cl.case_id, cl.service_line_id, l.claim_id FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id WHERE cl.practice_id = $1 AND cl.service_line_id = ANY ($2::uuid[])',
    [practiceId, serviceLineIds],
  );
  const ledger = entries ?? (await ledgerEntries(scope, practiceId));
  const byId = entriesById(ledger);
  // What each match's own entries approved (net of their corrections).
  const approvedBy = new Map<string, bigint>();
  for (const entry of ledger) {
    if (entry.matchId !== null && countedStage(entry, byId) === 'approved') {
      approvedBy.set(entry.matchId, (approvedBy.get(entry.matchId) ?? 0n) + entry.amountCents);
    }
  }
  const context = await chainContext(scope, practiceId, rows.map((row) => row.claim_id), ledger);
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
