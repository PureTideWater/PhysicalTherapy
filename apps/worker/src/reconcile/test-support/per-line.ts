import { loadPracticeCipher } from '@tp/db/runtime';
import type { PracticeCipher } from '@tp/db/runtime';
import {
  type ClaimCandidate,
  type PaidLine,
  type PaymentBaselines,
  type PaymentEvent,
  type PostedClaim,
  type ReversalTakeBack,
  batchMatches,
  checkPosting,
  correctedEntry,
  countedStage,
  entriesById,
  linePosting,
  partialShare,
  paymentChain,
  paymentMatchOutcome,
  paymentOutcome,
  postsLine,
  preferredCandidates,
  reversalTakeBack,
} from '@tp/ledger';
import { type Cents, ZERO_CENTS, cents, negateCents, parseCents } from '@tp/money';

import type { JobContext } from '../../jobs/handlers';
import { loadExports } from '../exports';
import { EMPTY_LINE_LEDGER, type LineLedger, type Scope, type StoredEntry, type StoredMatch, approvedRemaining, insertEntry, insertMatch, ledgerEntries, ledgerMatches, lineLedgers, lockLedger } from '../ledger';
import type { ReconcileServices, ReconcileSummary } from '../pass';
import { type PostingDecision, depositDecision } from '../postings';
import {
  type CaseLine,
  type ChainClaim,
  type ChainContext,
  type ChainLine,
  type ClaimLine,
  type LineChain,
  type RecordReprocessedNoChange,
  type RemittanceOutcome,
  type Reprocessed,
  afterReprocessing,
  caseLinePair,
  caseLines,
  chainContext,
  claimLines,
  everMatched,
  paidLine,
  providerAdjustments,
  recordReprocessing,
} from '../remittances';
import { acceptedResponses, approveFromResponses, recordReprocessedNoChange } from '../responses';
import { REOPEN_NOTES, type StageSync, manualRecoupments, notifyRecoupments } from '../stages';

/**
 * The per-line reconcile pass, kept as the reference the pass-level pass is proved against (SUITE-CAP-3 D13; test matrix
 * CAS-49; docs/adr/0087). Below is today's text, word for word, of every function SUITE-CAP-3 changes (remittances.ts:
 * candidatesFor, candidateClosure, chainOrdered, matchClaims, matchCandidate, reprocessingOf and lineChain's filter form;
 * stages.ts: syncLineStages with insertStage; postings.ts: matchPostings, matchDeposits, postingDecision,
 * claimsWithReference and settleMatches with its prefix filter), as the base it merges into has it, each calling the
 * copies, never the new functions. The private helpers those functions call are copied with them, unchanged, because a
 * copy cannot reach a module's private function (reversalRule, moveBackNote, shares, recoupReversals and the rest), and
 * so is reconcileRemittances, whose text SUITE-CAP-3 keeps but which calls matchClaims and lineChain. Every function the
 * item does not change and a module exports is imported, not copied: the interest step among them (providerAdjustments,
 * docs/adr/0084), which calls none of the functions SUITE-CAP-3 changes and which remittances.ts exports for this
 * reference alone, so interest is credited by one text in both passes and the two can differ only in what the item changed.
 *
 * referencePass is reconcilePractice (pass.ts) with these copies in its order: what CAS-49 runs on one clone of a
 * generated practice while the shipped pass runs on the other. Only tests import this module: eslint.config.js refuses it
 * in any other file (per-line-import.test.ts). The interest fix (pull request 126) merged after this item: reconcileRemittances
 * and Counts below are its text, and its interest step is imported as above.
 */

/** A loaded reversal as the chain context holds it (remittances.ts keeps the interface to itself). */
type LoadedReversal = ChainContext['reversals'][number];

// ---------------------------------------------------------------------------------------------------------------------
// remittances.ts (base text)
// ---------------------------------------------------------------------------------------------------------------------

interface CandidateRow {
  readonly id: string;
  readonly remittance_id: string;
  readonly paid_on: string;
  readonly patient_control_number: string;
}

const CANDIDATE_FILTERS = `
       c.practice_id = $1 AND r.status = 'loaded' AND c.claim_status_code <> '22'
   AND c.id <> ALL ($2::uuid[]) AND c.remittance_id <> $3 AND c.created_at >= (SELECT o.created_at FROM claim o WHERE o.id = $4)
   AND NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.kind = 'claim' AND m.claim_id = c.id AND m.service_line_id = $5)
   AND NOT EXISTS (SELECT 1 FROM case_line x JOIN service_line xl ON xl.id = x.service_line_id WHERE xl.claim_id = c.id)`;

/** A case line's new claims: by payer claim control number first, else by patient control number, service date and code. */
async function candidatesFor(scope: Scope, cipher: PracticeCipher, practiceId: string, line: CaseLine, known: readonly string[]): Promise<(ClaimCandidate & { readonly remittanceId: string; readonly paidOn: string })[]> {
  const base = [practiceId, known, line.remittanceId, line.claimId, line.serviceLineId];
  const byControl = await scope.client.query<CandidateRow>(
    `SELECT c.id, c.remittance_id, r.bpr16_date::text AS paid_on, c.patient_control_number
       FROM claim c JOIN remittance r ON r.id = c.remittance_id
      WHERE ${CANDIDATE_FILTERS}
        AND (c.id IN (SELECT k.superseded_by_claim_id FROM claim k WHERE k.id = ANY ($2::uuid[]))
             OR c.payer_claim_control_number_hash IN (SELECT k.payer_claim_control_number_hash FROM claim k WHERE k.id = ANY ($2::uuid[])))
      ORDER BY r.bpr16_date, c.created_at, c.id`,
    base,
  );
  const byPatient = await scope.client.query<CandidateRow>(
    `SELECT c.id, c.remittance_id, r.bpr16_date::text AS paid_on, c.patient_control_number
       FROM claim c JOIN remittance r ON r.id = c.remittance_id
      WHERE ${CANDIDATE_FILTERS}
        AND EXISTS (SELECT 1 FROM service_line s WHERE s.claim_id = c.id AND s.procedure_code = $6 AND s.service_date IS NOT DISTINCT FROM $7::date)
      ORDER BY r.bpr16_date, c.created_at, c.id`,
    [...base, line.procedureCode, line.serviceDate],
  );
  return preferredCandidates([
    ...byControl.rows.map((row) => ({ claimId: row.id, key: 'payer_claim_control_number' as const, remittanceId: row.remittance_id, paidOn: row.paid_on })),
    ...byPatient.rows
      .filter((row) => cipher.decrypt('claim.patient_control_number', row.patient_control_number) === line.patientControlNumber)
      .map((row) => ({ claimId: row.id, key: 'patient_control_number' as const, remittanceId: row.remittance_id, paidOn: row.paid_on })),
  ]);
}

/** Where a take-back is judged from: a place in the chain and when (null: now, every loaded reversal counting). */
interface AsOf {
  readonly position: number;
  readonly at: bigint | null;
}

const NOW: AsOf = { position: Number.POSITIVE_INFINITY, at: null };

/**
 * A reversal of claim `reversed` of the chain (PRD 13, Recoupments and reversals; @tp/ledger
 * reversalTakeBack): whether a claim of the chain after it stands, which claim before it stands (the
 * latest with no loaded reversal, the original included), and so what it takes back and the claim the
 * baselines return to (the original when none stands). Judged as of the reversal's own recoupment match,
 * so the chain walks the same way after later reversals arrive.
 */
function reversalRule(chain: Pick<LineChain, 'original' | 'claims'>, reversed: ChainClaim, reversals: readonly LoadedReversal[], asOf: AsOf, remaining: Cents): { readonly take: ReversalTakeBack; readonly base: ChainClaim } {
  const stands = (claim: ChainClaim) => !reversals.some((reversal) => reversal.reversedClaimId === claim.claimId && (asOf.at === null || reversal.loadedAt <= asOf.at));
  const laterClaimStands = chain.claims.some((claim) => claim.position > reversed.position && claim.position < asOf.position && stands(claim));
  const earlier = chain.claims.filter((claim) => claim.position < reversed.position && stands(claim)).at(-1) ?? null;
  const take = reversalTakeBack({
    originalPaidCents: chain.original.paidCents,
    reversedPaidCents: reversed.line.paidCents,
    standingEarlierPaidCents: earlier?.line.paidCents ?? null,
    laterClaimStands,
    approvedRemainingCents: remaining,
  });
  return { take, base: earlier ?? (chain.claims[0] as ChainClaim) };
}

/**
 * A case line's chain from the context: its standing claim matches with their paired lines, and the
 * baselines walked over every event in chain order (@tp/ledger paymentChain): each standing claim match
 * with its stored outcome and its own take-back, each standing recoupment of a reversal with its rule
 * judged as of that recoupment, and each other standing recoupment (a PLB WO) as cash. Undefined when the
 * line's claim is not loaded.
 */
export function lineChain(context: ChainContext, line: ChainLine): LineChain | undefined {
  const original = caseLinePair(context.lines, line, line.claimId);
  if (original === undefined) {
    return undefined;
  }
  const own = context.matches.filter((match) => match.serviceLineId === line.serviceLineId && match.standing);
  const claims: ChainClaim[] = [{ match: null, claimId: line.claimId, position: -1, line: original }];
  for (const [position, match] of own.entries()) {
    const pair = match.kind === 'claim' ? caseLinePair(context.lines, line, match.claimId as string) : undefined;
    if (pair !== undefined) {
      claims.push({ match, claimId: match.claimId as string, position, line: pair });
    }
  }
  const events: PaymentEvent[] = [];
  for (const [position, match] of own.entries()) {
    const recoupedCents = context.recouped.get(match.id) ?? ZERO_CENTS;
    if (match.kind === 'claim') {
      const claim = claims.find((item) => item.match?.id === match.id);
      if (claim !== undefined) {
        events.push({ kind: 'claim', matchId: match.id, outcome: match.outcome ?? 'no_change', ...paidLine(claim.line), recoupedCents });
      }
      continue;
    }
    const reversal = match.claimId === null ? undefined : context.reversals.find((item) => item.id === match.claimId);
    const reversed = reversal === undefined ? undefined : claims.find((claim) => claim.match !== null && claim.claimId === reversal.reversedClaimId && claim.position < position);
    if (reversed === undefined) {
      events.push({ kind: 'withholding', recoupedCents });
      continue;
    }
    const { take, base } = reversalRule({ original, claims }, reversed, context.reversals, { position, at: context.matchedAt.get(match.id) ?? null }, ZERO_CENTS);
    events.push({
      kind: 'reversal',
      recoupedCents,
      reversedAllowedCents: reversed.line.observedAllowedCents,
      baseAllowedCents: base.line.observedAllowedCents,
      baseMatchId: base.match?.id ?? null,
      uncappedCents: take.uncappedCents,
    });
  }
  return { original, claims, chain: paymentChain({ original: paidLine(original), events }) };
}

/**
 * A claim compared with the case line against its baselines (the chain's, as the pass has carried them)
 * and what is approved for it: the one comparison the reconcile and a person's match by hand both make.
 * Null when the claim has no line paired with the case line.
 */
export async function reprocessingOf(
  scope: Scope,
  line: ChainLine,
  claimId: string,
  against: { readonly original: PaidLine; readonly baselines: PaymentBaselines; readonly ledger: LineLedger },
): Promise<Reprocessed | null> {
  const next = caseLinePair(await claimLines(scope, [line.claimId, claimId]), line, claimId);
  if (next === undefined) {
    return null;
  }
  const outcome = paymentOutcome({ original: against.original, baselines: against.baselines, next: paidLine(next), approvedRemainingCents: approvedRemaining(against.ledger) });
  return { claimId, next, outcome, matchOutcome: paymentMatchOutcome(outcome) };
}

/** The line's ledger after an entry: what the next comparison of the same pass reads. */
function after(line: LineLedger, stage: 'approved' | 'recouped', amount: Cents, matchId: string): LineLedger {
  if (stage === 'recouped') {
    return { ...line, recoupedCents: cents(line.recoupedCents + amount) };
  }
  return { ...line, approvedCents: cents(line.approvedCents + amount), approvedByMatch: new Map([...line.approvedByMatch, [matchId, amount]]) };
}

interface Counts {
  approved: number;
  confirmed: number;
  noPaymentIncrease: number;
  decreased: number;
  decreasedNoEntry: number;
  noChange: number;
  recoupments: number;
  interest: number;
  interestTakenBack: number;
  interestWalks: number;
}

interface Recouped {
  readonly caseId: string;
  readonly entryId: string;
  readonly serviceLineId: string;
  readonly amountCents: Cents;
}

/** What one pass of step 1 carries: where it writes, what it counts, and each line's ledger as it approves and takes back. */
interface ClaimPass {
  readonly scope: Scope;
  readonly practiceId: string;
  readonly ledgers: Map<string, LineLedger>;
  readonly recordNoChange: RecordReprocessedNoChange;
  readonly counts: Counts;
  readonly recouped: Recouped[];
}

/**
 * Step 1: each open case line's new claims. The candidates are found first, to a fixpoint: a correction
 * of a candidate the line pairs with is a candidate too (whether a claim extends the search depends on its
 * pairing only, never on its outcome). Then they are compared in the stored chain's own claim order (by
 * payment date, then load, then id; CHAIN_ORDER), so what the pass writes is what every later walk of the
 * chain reads. The line's baselines are walked from its stored chain once, then carried through the pass
 * as each candidate is matched.
 */
async function matchClaims(pass: ClaimPass, cipher: PracticeCipher, lines: readonly CaseLine[]): Promise<void> {
  const { scope, practiceId } = pass;
  const context = await chainContext(scope, practiceId, lines.map((line) => line.claimId), await ledgerEntries(scope, practiceId));
  for (const line of lines.filter((item) => item.open)) {
    const chain = lineChain(context, line);
    if (chain === undefined) {
      continue;
    }
    const state = { original: paidLine(chain.original), baselines: chain.chain.current };
    for (const candidate of await chainOrdered(scope, await candidateClosure(scope, cipher, practiceId, line, chain))) {
      await matchCandidate(pass, line, state, candidate);
    }
  }
}

type Candidate = Awaited<ReturnType<typeof candidatesFor>>[number];

/** A case line's candidates to a fixpoint: each one paired with the line extends the search by its own control numbers. */
async function candidateClosure(scope: Scope, cipher: PracticeCipher, practiceId: string, line: CaseLine, chain: LineChain): Promise<Candidate[]> {
  const known = new Set(chain.claims.map((claim) => claim.claimId));
  const seen = new Set<string>();
  const found: Candidate[] = [];
  for (;;) {
    const candidates = (await candidatesFor(scope, cipher, practiceId, line, [...known])).filter((candidate) => !seen.has(candidate.claimId));
    if (candidates.length === 0) {
      return found;
    }
    const lines = await claimLines(scope, [line.claimId, ...candidates.map((candidate) => candidate.claimId)]);
    for (const candidate of candidates) {
      seen.add(candidate.claimId);
      if (caseLinePair(lines, line, candidate.claimId) !== undefined) {
        known.add(candidate.claimId);
        found.push(candidate);
      }
    }
  }
}

/** The candidates in the chain's claim order: by payment date (BPR16), then when each was loaded, then id. */
async function chainOrdered(scope: Scope, candidates: readonly Candidate[]): Promise<Candidate[]> {
  if (candidates.length < 2) {
    return [...candidates];
  }
  const { rows } = await scope.client.query<{ id: string }>(
    'SELECT c.id FROM claim c JOIN remittance r ON r.id = c.remittance_id WHERE c.id = ANY ($1::uuid[]) ORDER BY r.bpr16_date, c.created_at, c.id',
    [candidates.map((candidate) => candidate.claimId)],
  );
  return rows.map((row) => candidates.find((candidate) => candidate.claimId === row.id) as Candidate);
}

/** Compares one candidate with the line, records it, and carries the line's baselines past it. */
async function matchCandidate(
  pass: ClaimPass,
  line: CaseLine,
  state: { readonly original: PaidLine; baselines: PaymentBaselines },
  candidate: { readonly claimId: string; readonly remittanceId: string; readonly paidOn: string },
): Promise<void> {
  const { scope, practiceId, ledgers, counts } = pass;
  const ledger = ledgers.get(line.serviceLineId) ?? EMPTY_LINE_LEDGER;
  const reprocessed = await reprocessingOf(scope, line, candidate.claimId, { original: state.original, baselines: state.baselines, ledger });
  if (reprocessed === null) {
    return;
  }
  const written = await recordReprocessing(scope, practiceId, line, candidate, reprocessed, null);
  if (written === null) {
    return;
  }
  state.baselines = afterReprocessing(state.baselines, written.matchId, reprocessed);
  const { outcome } = reprocessed;
  if (outcome.kind === 'confirmed') {
    // It pays (part of) what a payer response accepted: no entry of its own, no take-back of the rest.
    counts.confirmed += 1;
  } else if (outcome.kind === 'no_payment_increase') {
    // The patient's share (or other reductions) took the whole increase: no entry, never no change.
    counts.noPaymentIncrease += 1;
  } else if (outcome.kind === 'no_change') {
    counts.noChange += 1;
    await pass.recordNoChange(scope, { practiceId, caseId: line.caseId, remittanceId: candidate.remittanceId, receivedOn: candidate.paidOn });
  } else if (outcome.kind === 'approved') {
    ledgers.set(line.serviceLineId, after(ledger, 'approved', outcome.amountCents, written.matchId));
    counts.approved += 1;
  } else if (outcome.amountCents < ZERO_CENTS) {
    ledgers.set(line.serviceLineId, after(ledger, 'recouped', outcome.amountCents, written.matchId));
    counts.decreased += 1;
    pass.recouped.push({ caseId: line.caseId, entryId: written.entryId as string, serviceLineId: line.serviceLineId, amountCents: outcome.amountCents });
  } else {
    // Decreased with nothing to take back: no entry, no payer response, and neither baseline moves.
    counts.decreasedNoEntry += 1;
  }
}

/**
 * A reversal of a claim attached to a case line, with no correction of it in the same remittance: the
 * payment it removes above the original is taken back (@tp/ledger reversalTakeBack), at most what is
 * approved and not yet taken back.
 */
async function recoupReversals(scope: Scope, practiceId: string, lines: readonly CaseLine[], ledgers: Map<string, LineLedger>, matches: readonly StoredMatch[], counts: Counts, recouped: Recouped[]): Promise<void> {
  const approving = matches.filter((match) => match.kind === 'claim' && match.standing && match.outcome === 'approved');
  if (approving.length === 0) {
    return;
  }
  const context = await chainContext(scope, practiceId, lines.map((line) => line.claimId), await ledgerEntries(scope, practiceId));
  const reversed = new Set(approving.map((match) => match.claimId as string));
  for (const reversal of context.reversals.filter((item) => !item.beside && reversed.has(item.reversedClaimId))) {
    for (const match of approving.filter((item) => item.claimId === reversal.reversedClaimId)) {
      const line = lines.find((item) => item.serviceLineId === match.serviceLineId);
      if (line === undefined || everMatched(matches, 'recoupment', reversal.id, line.serviceLineId)) {
        continue;
      }
      const chain = lineChain(context, line);
      const claim = chain?.claims.find((item) => item.match?.id === match.id);
      if (chain === undefined || claim === undefined) {
        continue;
      }
      const ledger = ledgers.get(line.serviceLineId) ?? EMPTY_LINE_LEDGER;
      const { takenCents } = reversalRule(chain, claim, context.reversals, NOW, approvedRemaining(ledger)).take;
      if (takenCents <= ZERO_CENTS) {
        continue;
      }
      const matchId = await insertMatch(scope, practiceId, { kind: 'recoupment', claimId: reversal.id, remittanceId: reversal.remittanceId, serviceLineId: line.serviceLineId, matchedBy: null });
      if (matchId === null) {
        continue;
      }
      const amount = negateCents(takenCents);
      const entryId = await insertEntry(scope, practiceId, { caseId: line.caseId, serviceLineId: line.serviceLineId, stage: 'recouped', amountCents: amount, evidenceKind: 'claim', evidenceId: reversal.id, matchId, effectiveOn: reversal.paidOn, createdBy: null });
      ledgers.set(line.serviceLineId, after(ledger, 'recouped', amount, matchId));
      counts.recoupments += 1;
      recouped.push({ caseId: line.caseId, entryId: entryId as string, serviceLineId: line.serviceLineId, amountCents: amount });
    }
  }
}

/** Step 1, recoupments and interest (credited from each PLB L6 only, docs/adr/0084), for the practice (inside the reconcile step's locked transaction). */
export async function reconcileRemittances(scope: Scope, cipher: PracticeCipher, practiceId: string, recordNoChange: RecordReprocessedNoChange): Promise<RemittanceOutcome> {
  const lines = await caseLines(scope, cipher, practiceId);
  const counts: Counts = { approved: 0, confirmed: 0, noPaymentIncrease: 0, decreased: 0, decreasedNoEntry: 0, noChange: 0, recoupments: 0, interest: 0, interestTakenBack: 0, interestWalks: 0 };
  const recouped: Recouped[] = [];
  if (lines.length === 0) {
    return { ...counts, recouped };
  }
  const ledgers = lineLedgers(await ledgerEntries(scope, practiceId));
  await matchClaims({ scope, practiceId, ledgers, recordNoChange, counts, recouped }, cipher, lines);
  const matches = await ledgerMatches(scope, practiceId);
  await recoupReversals(scope, practiceId, lines, ledgers, matches, counts, recouped);
  await providerAdjustments(scope, cipher, practiceId, lines, ledgers, await ledgerMatches(scope, practiceId), counts, recouped);
  return { ...counts, recouped };
}

// ---------------------------------------------------------------------------------------------------------------------
// stages.ts (base text)
// ---------------------------------------------------------------------------------------------------------------------

const RANK = { flagged: 1, validated: 2, actionable: 3, payer_approved: 4, recovered: 5 } as const;
type Stage = keyof typeof RANK;

/**
 * Why a recovered line's entries now leave it payer approved: a reversal written since it reached recovered, or
 * else the practice's proof level, raised from posted to deposited (docs/adr/0053: the rule for lines already
 * recovered when the level changes).
 */
async function moveBackNote(scope: Scope, serviceLineId: string): Promise<string> {
  const { rows } = await scope.client.query<{ reversed: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM ledger_entry e
        WHERE e.service_line_id = $1 AND e.stage = 'reversed'
          AND e.created_at >= (SELECT max(s.set_at) FROM line_status s WHERE s.service_line_id = $1 AND s.stage = 'recovered')
     ) AS reversed`,
    [serviceLineId],
  );
  return rows[0]?.reversed === true ? REOPEN_NOTES.reversal : REOPEN_NOTES.proofLevel;
}

interface LineRow {
  readonly service_line_id: string;
  readonly ledger_stage: 'payer_approved' | 'recovered' | null;
  readonly current_stage: Stage | null;
}

async function insertStage(scope: Scope, practiceId: string, serviceLineId: string, stage: Stage, setBy: string | null, reopen?: { readonly from: Stage; readonly reason: string }): Promise<void> {
  await scope.client.query('INSERT INTO line_status (practice_id, service_line_id, stage, set_by, reason, reopened_from) VALUES ($1, $2, $3, $4, $5, $6)', [
    practiceId,
    serviceLineId,
    stage,
    setBy,
    reopen?.reason ?? null,
    reopen?.from ?? null,
  ]);
}

/** Brings every case line with ledger entries to the stage its entries put it at. */
export async function syncLineStages(scope: Scope, cipher: PracticeCipher, practiceId: string, setBy: string | null): Promise<StageSync> {
  const { rows } = await scope.client.query<LineRow>(
    `SELECT cl.service_line_id, ledger_line_stage(cl.service_line_id) AS ledger_stage,
            (SELECT s.stage FROM line_status s WHERE s.service_line_id = cl.service_line_id ORDER BY s.seq DESC LIMIT 1) AS current_stage
       FROM case_line cl
      WHERE cl.practice_id = $1 AND EXISTS (SELECT 1 FROM ledger_entry e WHERE e.service_line_id = cl.service_line_id)
      ORDER BY cl.service_line_id`,
    [practiceId],
  );
  let forward = 0;
  let back = 0;
  for (const row of rows) {
    const target = row.ledger_stage;
    const current = row.current_stage;
    if (target !== null && (current === null || RANK[target] > RANK[current])) {
      if (target === 'recovered' && (current === null || RANK[current] < RANK.payer_approved)) {
        await insertStage(scope, practiceId, row.service_line_id, 'payer_approved', setBy);
        forward += 1;
      }
      await insertStage(scope, practiceId, row.service_line_id, target, setBy);
      forward += 1;
      continue;
    }
    if ((current === 'payer_approved' || current === 'recovered') && (target === null || RANK[target] < RANK[current])) {
      const note = target === null ? REOPEN_NOTES.recoupment : current === 'recovered' ? await moveBackNote(scope, row.service_line_id) : REOPEN_NOTES.reversal;
      await insertStage(scope, practiceId, row.service_line_id, target ?? 'actionable', setBy, { from: current, reason: cipher.encrypt('line_status.reason', note) });
      back += 1;
    }
  }
  return { forward, back };
}

// ---------------------------------------------------------------------------------------------------------------------
// postings.ts (base text)
// ---------------------------------------------------------------------------------------------------------------------

interface RemittanceRow {
  readonly id: string;
  readonly payment_cents: string;
}

/** The loaded credit remittances of a check or trace number. */
async function remittancesOf(scope: Scope, practiceId: string, trace: string): Promise<{ readonly id: string; readonly paymentCents: Cents }[]> {
  const { rows } = await scope.client.query<RemittanceRow>(
    "SELECT r.id, r.bpr02_cents::text AS payment_cents FROM remittance r WHERE r.practice_id = $1 AND r.trn02 = $2 AND r.status = 'loaded' AND r.bpr_credit_debit = 'C' ORDER BY r.bpr16_date, r.id",
    [practiceId, trace],
  );
  return rows.map((row) => ({ id: row.id, paymentCents: parseCents(row.payment_cents) }));
}

/** The one remittance of a trace, or of its candidates the one whose payment is the amount. */
function oneOf(candidates: readonly { readonly id: string; readonly paymentCents: Cents }[], amount: Cents): { readonly id: string; readonly paymentCents: Cents } | null {
  if (candidates.length === 1) {
    return candidates[0] ?? null;
  }
  const exact = candidates.filter((candidate) => candidate.paymentCents === amount);
  return exact.length === 1 ? (exact[0] ?? null) : null;
}

interface PostingRowRow {
  readonly id: string;
  readonly check_or_trace: string;
  readonly amount_cents: string;
  readonly claim_reference: string | null;
  readonly procedure_code: string | null;
  readonly service_date: string | null;
}

/** The claims of a remittance carrying a claim reference, with their payments and lines. */
async function claimsWithReference(scope: Scope, cipher: PracticeCipher, remittanceId: string, reference: string): Promise<PostedClaim[]> {
  const claims = await scope.client.query<{ id: string; paid_cents: string; patient_control_number: string }>(
    'SELECT c.id, c.paid_cents::text AS paid_cents, c.patient_control_number FROM claim c WHERE c.remittance_id = $1 ORDER BY c.claim_no',
    [remittanceId],
  );
  const named = claims.rows.filter((claim) => cipher.decrypt('claim.patient_control_number', claim.patient_control_number) === reference);
  if (named.length === 0) {
    return [];
  }
  const lines = await scope.client.query<{ claim_id: string; procedure_code: string; service_date: string | null; paid_cents: string }>(
    'SELECT s.claim_id, s.procedure_code, s.service_date::text AS service_date, s.paid_cents::text AS paid_cents FROM service_line s WHERE s.claim_id = ANY ($1::uuid[]) ORDER BY s.line_no',
    [named.map((claim) => claim.id)],
  );
  return named.map((claim) => ({
    claimId: claim.id,
    paidCents: parseCents(claim.paid_cents),
    lines: lines.rows.filter((line) => line.claim_id === claim.id).map((line) => ({ procedureCode: line.procedure_code, serviceDate: line.service_date, paidCents: parseCents(line.paid_cents) })),
  }));
}

/** What the check's standing check-level postings have posted so far. */
async function postedSoFar(scope: Scope, remittanceId: string): Promise<Cents> {
  const { rows } = await scope.client.query<{ posted: string }>(
    `SELECT coalesce(sum(p.amount_cents), 0)::text AS posted FROM ledger_match m JOIN posting_row p ON p.id = m.posting_row_id
      WHERE m.remittance_id = $1 AND m.kind = 'posting' AND m.level = 'check' AND m.reversed_at IS NULL`,
    [remittanceId],
  );
  return parseCents(rows[0]?.posted ?? '0');
}


/**
 * Where a posting row belongs: among `candidates` (by default the remittances of its check or trace
 * number; a person names one when matching by hand).
 */
export async function postingDecision(scope: Scope, cipher: PracticeCipher, practiceId: string, row: PostingRowRow, candidates?: readonly { readonly id: string; readonly paymentCents: Cents }[]): Promise<PostingDecision> {
  const remittances = candidates ?? (await remittancesOf(scope, practiceId, row.check_or_trace));
  const amount = parseCents(row.amount_cents);
  if (row.claim_reference !== null) {
    const reference = cipher.decrypt('posting_row.claim_reference', row.claim_reference);
    const found: { remittanceId: string; claimId: string }[] = [];
    for (const remittance of remittances) {
      const claimId = linePosting({ amountCents: amount, procedureCode: row.procedure_code, serviceDate: row.service_date, claims: await claimsWithReference(scope, cipher, remittance.id, reference) });
      if (claimId !== null) {
        found.push({ remittanceId: remittance.id, claimId });
      }
    }
    const [only] = found;
    return found.length === 1 && only !== undefined ? { kind: 'claim', ...only } : { kind: 'unmatched' };
  }
  const remittance = oneOf(remittances, amount);
  if (remittance === null) {
    return { kind: 'unmatched' };
  }
  const decision = checkPosting({ amountCents: amount, checkTotalCents: remittance.paymentCents, postedBeforeCents: await postedSoFar(scope, remittance.id) });
  return decision.kind === 'unmatched' ? { kind: 'unmatched' } : { kind: 'check', remittanceId: remittance.id, allocated: decision.kind === 'partial' };
}

const POSTING_ROW_COLUMNS = 'p.id, p.check_or_trace, p.amount_cents::text AS amount_cents, p.claim_reference, p.procedure_code, p.service_date::text AS service_date';

/** Matches the practice's posting rows no match was ever made for, in the order they posted. */
export async function matchPostings(scope: Scope, cipher: PracticeCipher, practiceId: string): Promise<number> {
  const { rows } = await scope.client.query<PostingRowRow>(
    `SELECT ${POSTING_ROW_COLUMNS} FROM posting_row p
      WHERE p.practice_id = $1 AND NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.posting_row_id = p.id)
      ORDER BY p.posted_on, p.created_at, p.row_no`,
    [practiceId],
  );
  let matched = 0;
  for (const row of rows) {
    const decision = await postingDecision(scope, cipher, practiceId, row);
    if (decision.kind === 'unmatched') {
      continue;
    }
    const id = await insertMatch(scope, practiceId, {
      kind: 'posting',
      postingRowId: row.id,
      remittanceId: decision.remittanceId,
      ...(decision.kind === 'claim' ? { claimId: decision.claimId, level: 'claim' as const } : { level: 'check' as const, allocated: decision.allocated }),
      matchedBy: null,
    });
    matched += id === null ? 0 : 1;
  }
  return matched;
}

interface EftRowRow {
  readonly id: string;
  readonly source_document_id: string;
  readonly trace: string;
  readonly amount_cents: string;
  readonly batch_reference: string | null;
}

/** Whether a remittance already has a standing deposit. */
async function deposited(scope: Scope, remittanceId: string): Promise<boolean> {
  const { rowCount } = await scope.client.query("SELECT 1 FROM ledger_match m WHERE m.remittance_id = $1 AND m.kind = 'deposit' AND m.reversed_at IS NULL", [remittanceId]);
  return (rowCount ?? 0) > 0;
}

/** Matches the practice's EFT rows no match was ever made for: each alone, or each batch together. */
export async function matchDeposits(scope: Scope, practiceId: string): Promise<number> {
  const { rows } = await scope.client.query<EftRowRow>(
    `SELECT e.id, e.source_document_id, e.trace, e.amount_cents::text AS amount_cents, e.batch_reference FROM eft_row e
      WHERE e.practice_id = $1 AND NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.eft_row_id = e.id)
      ORDER BY e.deposited_on, e.created_at, e.row_no`,
    [practiceId],
  );
  let matched = 0;
  const batches = new Map<string, EftRowRow[]>();
  for (const row of rows) {
    if (row.batch_reference !== null) {
      const key = `${row.source_document_id} ${row.batch_reference}`;
      batches.set(key, [...(batches.get(key) ?? []), row]);
      continue;
    }
    const remittanceId = await depositDecision(scope, practiceId, row);
    if (remittanceId !== null) {
      matched += (await insertMatch(scope, practiceId, { kind: 'deposit', eftRowId: row.id, remittanceId, level: 'check', matchedBy: null })) === null ? 0 : 1;
    }
  }
  for (const batch of batches.values()) {
    const found: ({ readonly id: string; readonly paymentCents: Cents } | null)[] = [];
    for (const row of batch) {
      const remittance = oneOf(await remittancesOf(scope, practiceId, row.trace), parseCents(row.amount_cents));
      found.push(remittance !== null && !(await deposited(scope, remittance.id)) ? remittance : null);
    }
    if (!batchMatches({ rowAmounts: batch.map((row) => parseCents(row.amount_cents)), paymentCents: found.map((remittance) => remittance?.paymentCents ?? null) })) {
      continue;
    }
    for (const [index, row] of batch.entries()) {
      const remittance = found[index] as { readonly id: string };
      matched += (await insertMatch(scope, practiceId, { kind: 'deposit', eftRowId: row.id, remittanceId: remittance.id, level: 'batch', matchedBy: null })) === null ? 0 : 1;
    }
  }
  return matched;
}

interface CaseLineRow {
  readonly service_line_id: string;
  readonly case_id: string;
  readonly claim_id: string;
}

interface Shares {
  /** Each case line's share of each remittance. */
  readonly byRemittance: Map<string, Map<string, Cents>>;
  /** Each case line's share of each claim matched to it: its paired line's payment net of the payment it replaced. */
  readonly byClaim: Map<string, Map<string, Cents>>;
  /** The line of each claim matched to a case line that is paired with it, by claim and case line. */
  readonly paired: Map<string, Map<string, ClaimLine>>;
}

/**
 * Each case line's cash share of each remittance, and of each claim: what each claim matched to the line
 * paid on the line paired with it, net of what the remittances had paid the line just before it (the
 * chain's `net`), so a reversal is netted once, against the claim that replaced it. Only lines a claim
 * was matched to have a share.
 */
async function shares(scope: Scope, practiceId: string, entries: readonly StoredEntry[], lines: readonly CaseLineRow[]): Promise<Shares> {
  const byRemittance = new Map<string, Map<string, Cents>>();
  const byClaim = new Map<string, Map<string, Cents>>();
  const paired = new Map<string, Map<string, ClaimLine>>();
  const context = await chainContext(scope, practiceId, lines.map((line) => line.claim_id), entries);
  if (!context.matches.some((match) => match.kind === 'claim' && match.standing)) {
    return { byRemittance, byClaim, paired };
  }
  const add = (map: Map<string, Map<string, Cents>>, key: string, lineId: string, amount: Cents) => {
    const inner = map.get(key) ?? new Map<string, Cents>();
    inner.set(lineId, cents((inner.get(lineId) ?? ZERO_CENTS) + amount));
    map.set(key, inner);
  };
  for (const line of lines) {
    const chain = lineChain(context, { serviceLineId: line.service_line_id, claimId: line.claim_id });
    if (chain === undefined) {
      continue;
    }
    for (const claim of chain.claims) {
      if (claim.match === null) {
        continue;
      }
      const net = chain.chain.net.get(claim.match.id) ?? ZERO_CENTS;
      add(byRemittance, claim.match.remittanceId, line.service_line_id, net);
      add(byClaim, claim.claimId, line.service_line_id, net);
      const inner = paired.get(claim.claimId) ?? new Map<string, ClaimLine>();
      inner.set(line.service_line_id, claim.line);
      paired.set(claim.claimId, inner);
    }
  }
  return { byRemittance, byClaim, paired };
}

interface MatchedRow {
  readonly match_id: string;
  readonly amount_cents: string;
  readonly payment_cents: string;
  readonly procedure_code: string | null;
  readonly service_date: string | null;
}

/**
 * Writes the posted and deposited entries every standing posting and deposit match owes (or only the
 * one named), in no one's name or the person's who matched by hand. A replay writes nothing twice.
 */
export async function settleMatches(scope: Scope, practiceId: string, createdBy: string | null, only?: string): Promise<number> {
  const entries = await ledgerEntries(scope, practiceId);
  const matches = await ledgerMatches(scope, practiceId);
  const { rows: lines } = await scope.client.query<CaseLineRow>(
    // In claim and line order, so a row too short for every line proves the same lines first on every pass (RR2).
    `SELECT cl.service_line_id, cl.case_id, l.claim_id FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id WHERE cl.practice_id = $1
      ORDER BY l.claim_id, l.line_no, cl.service_line_id`,
    [practiceId],
  );
  const { byRemittance, byClaim, paired } = await shares(scope, practiceId, entries, lines);
  const caseOf = new Map(lines.map((row) => [row.service_line_id, row.case_id]));
  const { rows: amounts } = await scope.client.query<MatchedRow>(
    `SELECT m.id AS match_id, coalesce(p.amount_cents, e.amount_cents)::text AS amount_cents, r.bpr02_cents::text AS payment_cents, p.procedure_code, p.service_date::text AS service_date
       FROM ledger_match m JOIN remittance r ON r.id = m.remittance_id LEFT JOIN posting_row p ON p.id = m.posting_row_id LEFT JOIN eft_row e ON e.id = m.eft_row_id
      WHERE m.practice_id = $1 AND m.kind IN ('posting', 'deposit') AND m.reversed_at IS NULL`,
    [practiceId],
  );
  const amountOf = new Map(amounts.map((row) => [row.match_id, { amount: parseCents(row.amount_cents), payment: parseCents(row.payment_cents), code: row.procedure_code, date: row.service_date }]));
  // What each line may still post and deposit: what is approved for it, less what is already proved;
  // and what each posting or EFT row may still prove: its amount, less what its entries already prove.
  const ledger = entriesById(entries);
  const room = new Map<string, bigint>();
  const provedByRow = new Map<string, bigint>();
  const written = new Set<string>();
  for (const entry of entries) {
    if (entry.serviceLineId === null) {
      continue;
    }
    const stage = countedStage(entry, ledger);
    if (stage === 'approved') {
      for (const proof of ['posted', 'deposited']) {
        room.set(`${entry.serviceLineId} ${proof}`, (room.get(`${entry.serviceLineId} ${proof}`) ?? 0n) + entry.amountCents);
      }
    } else if (stage === 'posted' || stage === 'deposited') {
      room.set(`${entry.serviceLineId} ${stage}`, (room.get(`${entry.serviceLineId} ${stage}`) ?? 0n) - entry.amountCents);
      const row = correctedEntry(entry, ledger).evidenceId;
      provedByRow.set(row, (provedByRow.get(row) ?? 0n) + entry.amountCents);
      if (entry.matchId !== null && entry.stage === stage) {
        written.add(`${entry.matchId} ${entry.serviceLineId}`);
      }
    }
  }
  const standing = matches.filter((match) => match.standing && (match.kind === 'posting' || match.kind === 'deposit'));
  let count = 0;
  for (const [position, match] of standing.entries()) {
    const { amount, payment, code, date } = amountOf.get(match.id) as { amount: Cents; payment: Cents; code: string | null; date: string | null };
    // The check's check-level postings before this one: a partial posting's share is what they leave.
    const before = cents(
      standing
        .slice(0, position)
        .filter((other) => other.kind === 'posting' && other.level === 'check' && other.remittanceId === match.remittanceId)
        .reduce((sum, other) => sum + (amountOf.get(other.id)?.amount ?? ZERO_CENTS), 0n),
    );
    const owed = match.level === 'claim' ? byClaim.get(match.claimId as string) : byRemittance.get(match.remittanceId);
    if (owed === undefined || (only !== undefined && match.id !== only)) {
      continue;
    }
    const stage = match.kind === 'posting' ? 'posted' : 'deposited';
    const evidenceId = (stage === 'posted' ? match.postingRowId : match.eftRowId) as string;
    // A line-level row posts only the case lines paired with the claim's lines it posts.
    const posts = (serviceLineId: string): boolean => {
      if (match.level !== 'claim' || code === null) {
        return true;
      }
      const line = paired.get(match.claimId as string)?.get(serviceLineId);
      // Matched on SVC03 as sent, as the row was (claimsWithReference); what it proves is the line's cash share.
      return line !== undefined && postsLine({ amountCents: amount, procedureCode: code, serviceDate: date }, { ...line, paidCents: line.servicePaidCents });
    };
    for (const [serviceLineId, share] of owed) {
      const caseId = caseOf.get(serviceLineId);
      const key = `${serviceLineId} ${stage}`;
      if (caseId === undefined || share <= ZERO_CENTS || written.has(`${match.id} ${serviceLineId}`) || !posts(serviceLineId)) {
        continue;
      }
      const part = match.allocated ? partialShare(share, before, amount, payment) : share;
      const left = room.get(key) ?? 0n;
      const rowLeft = amount - (provedByRow.get(evidenceId) ?? 0n);
      const capped = part < left ? part : left;
      const amountCents = cents(capped < rowLeft ? capped : rowLeft);
      if (amountCents <= ZERO_CENTS) {
        continue;
      }
      const id = await insertEntry(scope, practiceId, {
        caseId,
        serviceLineId,
        stage,
        amountCents,
        evidenceKind: stage === 'posted' ? 'posting_row' : 'eft_row',
        evidenceId,
        matchId: match.id,
        allocated: match.allocated,
        createdBy,
      });
      if (id !== null) {
        room.set(key, left - amountCents);
        provedByRow.set(evidenceId, (provedByRow.get(evidenceId) ?? 0n) + amountCents);
        count += 1;
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------------------------------------------------------------
// pass.ts: reconcilePractice's body, with the copies above in its order
// ---------------------------------------------------------------------------------------------------------------------

/**
 * One reconcile of a practice as the base runs it (pass.ts, reconcilePractice): the waiting exports read into rows, then,
 * in one transaction locked for the practice, the payer responses, the remittances (the copies above), posting and EFT
 * rows, the posted and deposited entries, the stages and the recoupment notices, in the same order with the same
 * arguments. The steps SUITE-CAP-3 leaves alone (the exports, the lock, the payer responses, the notices) are the
 * shipped functions.
 */
export async function referencePass(context: JobContext, services: ReconcileServices, practiceId: string, options: { readonly documentId?: string } = {}): Promise<ReconcileSummary> {
  const cipher = await context.transaction((scope) => loadPracticeCipher(scope, services.keys, practiceId));
  const exports = await loadExports(context, services, cipher, practiceId, options.documentId);
  return context.transaction(async (scope) => {
    await lockLedger(scope, practiceId);
    const approvedFromResponses = await approveFromResponses(scope, practiceId, await acceptedResponses(scope, practiceId));
    const remittances = await reconcileRemittances(scope, cipher, practiceId, (inner, response) => recordReprocessedNoChange(inner, services.keys, { ...response, requestId: context.jobId }));
    const postingsMatched = await matchPostings(scope, cipher, practiceId);
    const depositsMatched = await matchDeposits(scope, practiceId);
    const entriesSettled = await settleMatches(scope, practiceId, null);
    const stages = await syncLineStages(scope, cipher, practiceId, null);
    let notified = await notifyRecoupments(scope, practiceId, remittances.recouped);
    for (const entry of await manualRecoupments(scope, practiceId)) {
      notified += await notifyRecoupments(scope, practiceId, [entry]);
    }
    return { exports, approvedFromResponses, remittances, postingsMatched, depositsMatched, entriesSettled, stages, notified };
  });
}

export { candidateClosure, candidatesFor, chainOrdered, claimsWithReference, insertStage, matchCandidate, matchClaims };
