import { type KeyProvider, type PracticeCipher, recordAuditEvent, requirePracticePermission } from '@tp/db/runtime';
import { type Cents, ZERO_CENTS, negateCents, parseCents } from '@tp/money';

import { EMPTY_LINE_LEDGER, type Scope, insertEntry, insertMatch, ledgerEntries, ledgerMatches, lineLedgers, lockLedger } from './ledger';
import { depositDecision, postingDecision, postingRow, settleMatches } from './postings';
import { caseLines, comparableAllowed, compareWithLine, remittanceBaseline } from './remittances';
import { recordReprocessedNoChange } from './responses';
import { syncLineStages } from './stages';

/**
 * Manual matching and its reversal (PRD 13, Matching step 4: "listed for manual matching with the
 * evidence side by side; a manual match records the user"; Entries: reversed and adjusted; PRD 7,
 * Reconciliation: "match manually; reverse a match"; test matrix LED-07). Each runs in the person's
 * request scope and needs posting.reconcile, checked here and again by the database; each match, entry
 * and stage event is in the person's own name, and each action is audited. The amounts still match with
 * a tolerance of zero: a person vouches for which remittance or case line the evidence belongs to, never
 * for a different amount. The recoupment notice of a manual match is the next reconcile's.
 */

export type ReconciliationRefusal =
  | 'not_found'
  | 'already_matched'
  | 'not_open'
  | 'not_comparable'
  | 'amount_mismatch'
  | 'not_standing'
  | 'reverse_postings_first'
  | 'no_change_in_amount';

export class ReconciliationError extends Error {
  override readonly name = 'ReconciliationError';

  constructor(readonly code: ReconciliationRefusal) {
    super(`reconciliation refused: ${code}`);
  }
}

export interface ManualContext {
  readonly scope: Scope;
  readonly cipher: PracticeCipher;
  /** The practices' keys: a reprocessing with no change is recorded as a payer response through the submissions' function. */
  readonly keys: KeyProvider;
  readonly requestId: string;
}

async function begin(context: ManualContext, practiceId: string): Promise<string> {
  requirePracticePermission(context.scope, practiceId, 'posting.reconcile');
  await lockLedger(context.scope, practiceId);
  return context.scope.actorId;
}

async function remittanceOf(scope: Scope, practiceId: string, remittanceId: string): Promise<{ readonly id: string; readonly paymentCents: Cents }> {
  const { rows } = await scope.client.query<{ id: string; payment_cents: string }>(
    "SELECT r.id, r.bpr02_cents::text AS payment_cents FROM remittance r WHERE r.id = $1 AND r.practice_id = $2 AND r.status = 'loaded' AND r.bpr_credit_debit = 'C'",
    [remittanceId, practiceId],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new ReconciliationError('not_found');
  }
  return { id: row.id, paymentCents: parseCents(row.payment_cents) };
}

async function finish(context: ManualContext, practiceId: string, actor: string, action: string, matchId: string): Promise<void> {
  await syncLineStages(context.scope, context.cipher, practiceId, actor);
  await recordAuditEvent(context.scope, { action, objectType: 'ledger_match', objectId: matchId, practiceId, requestId: context.requestId });
}

/** Matches a posting row nothing stands for to the remittance a person names; its posted entries follow. */
export async function matchPostingByHand(context: ManualContext, input: { readonly practiceId: string; readonly postingRowId: string; readonly remittanceId: string }): Promise<{ readonly matchId: string }> {
  const actor = await begin(context, input.practiceId);
  const { scope } = context;
  const row = await postingRow(scope, input.practiceId, input.postingRowId);
  if (row === undefined) {
    throw new ReconciliationError('not_found');
  }
  if ((await ledgerMatches(scope, input.practiceId)).some((match) => match.postingRowId === row.id && match.standing)) {
    throw new ReconciliationError('already_matched');
  }
  const decision = await postingDecision(scope, context.cipher, input.practiceId, row, [await remittanceOf(scope, input.practiceId, input.remittanceId)]);
  if (decision.kind === 'unmatched') {
    throw new ReconciliationError('amount_mismatch');
  }
  const matchId = await insertMatch(scope, input.practiceId, {
    kind: 'posting',
    postingRowId: row.id,
    remittanceId: decision.remittanceId,
    ...(decision.kind === 'claim' ? { claimId: decision.claimId, level: 'claim' as const } : { level: 'check' as const, allocated: decision.allocated }),
    matchedBy: actor,
  });
  if (matchId === null) {
    throw new ReconciliationError('already_matched');
  }
  await settleMatches(scope, input.practiceId, actor, matchId);
  await finish(context, input.practiceId, actor, 'ledger_match_recorded', matchId);
  return { matchId };
}

/** Matches an EFT row nothing stands for to the remittance a person names (its payment exactly); its deposited entries follow. */
export async function matchDepositByHand(context: ManualContext, input: { readonly practiceId: string; readonly eftRowId: string; readonly remittanceId: string }): Promise<{ readonly matchId: string }> {
  const actor = await begin(context, input.practiceId);
  const { scope } = context;
  const { rows } = await scope.client.query<{ id: string; trace: string; amount_cents: string }>('SELECT e.id, e.trace, e.amount_cents::text AS amount_cents FROM eft_row e WHERE e.practice_id = $1 AND e.id = $2', [
    input.practiceId,
    input.eftRowId,
  ]);
  const row = rows[0];
  if (row === undefined) {
    throw new ReconciliationError('not_found');
  }
  if ((await ledgerMatches(scope, input.practiceId)).some((match) => match.eftRowId === row.id && match.standing)) {
    throw new ReconciliationError('already_matched');
  }
  const remittanceId = await depositDecision(scope, input.practiceId, row, [await remittanceOf(scope, input.practiceId, input.remittanceId)]);
  if (remittanceId === null) {
    throw new ReconciliationError('amount_mismatch');
  }
  const matchId = (await insertMatch(scope, input.practiceId, { kind: 'deposit', eftRowId: row.id, remittanceId, level: 'check', matchedBy: actor })) as string;
  await settleMatches(scope, input.practiceId, actor, matchId);
  await finish(context, input.practiceId, actor, 'ledger_match_recorded', matchId);
  return { matchId };
}

/**
 * Matches an adjusted payment (a claim) to an open case line a person names: compared as the reconcile
 * step compares it (higher approves the difference, lower takes back an approval, a payment of what a
 * payer response accepted confirms it, otherwise a payer response "reprocessed, no change", recorded in
 * the person's name through the submissions' function).
 */
export async function matchClaimByHand(
  context: ManualContext,
  input: { readonly practiceId: string; readonly claimId: string; readonly serviceLineId: string },
): Promise<{ readonly matchId: string; readonly outcome: 'approved' | 'decreased' | 'no_change' }> {
  const actor = await begin(context, input.practiceId);
  const { scope, cipher } = context;
  const line = (await caseLines(scope, cipher, input.practiceId)).find((item) => item.serviceLineId === input.serviceLineId);
  if (line === undefined || !line.open) {
    throw new ReconciliationError('not_open');
  }
  const { rows } = await scope.client.query<{ remittance_id: string; paid_on: string }>(
    `SELECT c.remittance_id, r.bpr16_date::text AS paid_on FROM claim c JOIN remittance r ON r.id = c.remittance_id
      WHERE c.id = $1 AND c.practice_id = $2 AND r.status = 'loaded' AND c.claim_status_code <> '22' AND c.id <> $3`,
    [input.claimId, input.practiceId, line.claimId],
  );
  const claim = rows[0];
  if (claim === undefined) {
    throw new ReconciliationError('not_found');
  }
  if ((await ledgerMatches(scope, input.practiceId)).some((match) => match.kind === 'claim' && match.standing && match.claimId === input.claimId && match.serviceLineId === line.serviceLineId)) {
    throw new ReconciliationError('already_matched');
  }
  const allowed = await comparableAllowed(scope, input.claimId, line);
  if (allowed === null) {
    throw new ReconciliationError('not_comparable');
  }
  const entries = await ledgerEntries(scope, input.practiceId);
  const ledger = lineLedgers(entries).get(line.serviceLineId) ?? EMPTY_LINE_LEDGER;
  const baseline = await remittanceBaseline(scope, line, await ledgerMatches(scope, input.practiceId), entries);
  const outcome = compareWithLine(line, ledger, baseline, allowed);
  const outcomeCode = outcome.kind === 'confirmed' ? 'approved' : outcome.kind;
  const matchId = (await insertMatch(scope, input.practiceId, { kind: 'claim', claimId: input.claimId, remittanceId: claim.remittance_id, serviceLineId: line.serviceLineId, outcome: outcomeCode, matchedBy: actor })) as string;
  // A claim that confirms a payer response's approval writes nothing more: the response approved the amount.
  if (outcome.kind === 'no_change') {
    await recordReprocessedNoChange(scope, context.keys, { practiceId: input.practiceId, caseId: line.caseId, remittanceId: claim.remittance_id, receivedOn: claim.paid_on, requestId: context.requestId });
  } else if (outcome.kind !== 'confirmed') {
    await insertEntry(scope, input.practiceId, {
      caseId: line.caseId,
      serviceLineId: line.serviceLineId,
      stage: outcome.kind === 'approved' ? 'approved' : 'recouped',
      amountCents: outcome.amountCents,
      evidenceKind: 'claim',
      evidenceId: input.claimId,
      matchId,
      createdBy: actor,
    });
  }
  await finish(context, input.practiceId, actor, 'ledger_match_recorded', matchId);
  return { matchId, outcome: outcomeCode };
}

/**
 * Reverses a standing match with a reason: an exactly offsetting reversed entry for each of its entries
 * and each adjustment of them not yet reversed (a reversed manual match nets to zero, LED-07, its
 * adjustments included), and the match reversed, so its evidence is listed unmatched again and never
 * matched to the same thing automatically; its entries are never corrected again. A claim's approval
 * whose remittance has posted or deposited it is refused until those matches are reversed first.
 */
export async function reverseMatch(context: ManualContext, input: { readonly practiceId: string; readonly matchId: string; readonly reason: string }): Promise<{ readonly reversedEntries: number }> {
  const actor = await begin(context, input.practiceId);
  const { scope, cipher } = context;
  const matches = await ledgerMatches(scope, input.practiceId);
  const match = matches.find((item) => item.id === input.matchId);
  if (match === undefined || !match.standing) {
    throw new ReconciliationError('not_standing');
  }
  const entries = await ledgerEntries(scope, input.practiceId);
  if (match.kind === 'claim') {
    const proving = new Set(
      matches.filter((other) => other.standing && (other.kind === 'posting' || other.kind === 'deposit') && (other.level === 'claim' ? other.claimId === match.claimId : other.remittanceId === match.remittanceId)).map((other) => other.id),
    );
    const undone = new Set(entries.filter((entry) => entry.stage === 'reversed').map((entry) => entry.evidenceId));
    if (entries.some((entry) => entry.matchId !== null && proving.has(entry.matchId) && entry.serviceLineId === match.serviceLineId && !undone.has(entry.id) && entry.stage !== 'reversed')) {
      throw new ReconciliationError('reverse_postings_first');
    }
  }
  const reversedIds = new Set(entries.filter((entry) => entry.stage === 'reversed').map((entry) => entry.evidenceId));
  const reason = (column: 'ledger_entry.reason' | 'ledger_match.reversal_reason') => cipher.encrypt(column, input.reason);
  let reversedEntries = 0;
  for (const entry of entries.filter((item) => item.matchId === match.id && item.stage !== 'reversed' && !reversedIds.has(item.id))) {
    await insertEntry(scope, input.practiceId, {
      caseId: entry.caseId,
      serviceLineId: entry.serviceLineId,
      stage: 'reversed',
      amountCents: negateCents(entry.amountCents),
      evidenceKind: 'ledger_entry',
      evidenceId: entry.id,
      matchId: match.id,
      createdBy: actor,
      reason: reason('ledger_entry.reason'),
    });
    reversedEntries += 1;
  }
  await scope.client.query('UPDATE ledger_match SET reversed_by = $2, reversal_reason = $3 WHERE id = $1', [match.id, actor, reason('ledger_match.reversal_reason')]);
  await finish(context, input.practiceId, actor, 'ledger_match_reversed', match.id);
  return { reversedEntries };
}

/**
 * Corrects an entry's amount after review, with a reason (PRD 13, Entries: adjusted, signed): an entry of
 * a counted stage, not reversed, whose match (if it has one) still stands; for example an approval a payer
 * response made that the payer's remittance paid in part (the shortfall the Reconciliation screen shows).
 */
export async function adjustEntry(context: ManualContext, input: { readonly practiceId: string; readonly entryId: string; readonly amountCents: Cents; readonly reason: string }): Promise<{ readonly entryId: string }> {
  const actor = await begin(context, input.practiceId);
  const { scope, cipher } = context;
  const entries = await ledgerEntries(scope, input.practiceId);
  const target = entries.find((entry) => entry.id === input.entryId);
  if (target === undefined || target.stage === 'reversed' || target.stage === 'adjusted') {
    throw new ReconciliationError('not_found');
  }
  const reversed = entries.some((entry) => entry.stage === 'reversed' && entry.evidenceId === target.id);
  const standing = target.matchId === null || (await ledgerMatches(scope, input.practiceId)).some((match) => match.id === target.matchId && match.standing);
  if (reversed || !standing) {
    throw new ReconciliationError('not_standing');
  }
  if (input.amountCents === ZERO_CENTS) {
    throw new ReconciliationError('no_change_in_amount');
  }
  const entryId = (await insertEntry(scope, input.practiceId, {
    caseId: target.caseId,
    serviceLineId: target.serviceLineId,
    stage: 'adjusted',
    amountCents: input.amountCents,
    evidenceKind: 'ledger_entry',
    evidenceId: target.id,
    matchId: target.matchId,
    createdBy: actor,
    reason: cipher.encrypt('ledger_entry.reason', input.reason),
  })) as string;
  await syncLineStages(scope, cipher, input.practiceId, actor);
  await recordAuditEvent(scope, { action: 'ledger_entry_adjusted', objectType: 'ledger_entry', objectId: entryId, practiceId: input.practiceId, requestId: context.requestId });
  return { entryId };
}
