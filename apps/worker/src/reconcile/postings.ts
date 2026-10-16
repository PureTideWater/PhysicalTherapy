import type { PracticeCipher } from '@tp/db/runtime';
import { type PostedClaim, batchMatches, checkPosting, countedStage, depositMatches, entriesById, linePosting, partialShare } from '@tp/ledger';
import { type Cents, ZERO_CENTS, cents, parseCents } from '@tp/money';

import { type Scope, type StoredMatch, insertEntry, insertMatch, ledgerEntries, ledgerMatches } from './ledger';

/**
 * Posting and EFT rows against remittances, and the posted and deposited entries their matches make
 * (PRD 13, Matching steps 2 and 3; test matrix LED-04, LED-05, LED-08, LED-09). Tolerance zero:
 *
 * - A posting row is matched to the remittance whose check or trace number (TRN02) it carries. With a
 *   claim reference (the export has lines), to the one claim of that check with that patient control
 *   number whose payment, or whose line of the row's code and date, is the row's amount exactly. Without
 *   one, at the check level: the whole check at once, or a part of it that keeps the check's check-level
 *   postings within it (partial, allocated pro rata).
 * - An EFT row is matched to the remittance whose TRN02 is its trace and whose payment is its amount; the
 *   rows a bank batched into one deposit (one batch reference) match together, flagged at the batch
 *   level, when every row found its remittance and the totals agree. A remittance is deposited once.
 * - Each standing match then posts (or deposits) each case line's share of its remittance: the cash the
 *   remittance paid on the line's reprocessing (its line paid on the claims matched to the case line,
 *   less what its reversals of the line's claims took back; at the claim level, the claim's own line).
 *   A partial check-level posting allocates the share pro rata: what the check's postings up to it
 *   allocate, less what those before it did, flagged allocated; the parts add up to the share. A line
 *   never posts (or deposits) more than the ledger approved for it, from a remittance or a payer
 *   response, so the original payment a reprocessing replaced is never counted.
 *
 * A row matching nothing, more than one remittance, or more than the check is left for a person
 * (unmatched.ts), and so is a row whose match a person reversed. Nothing unmatched counts.
 */

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

export type PostingDecision =
  | { readonly kind: 'claim'; readonly remittanceId: string; readonly claimId: string }
  | { readonly kind: 'check'; readonly remittanceId: string; readonly allocated: boolean }
  | { readonly kind: 'unmatched' };

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

export async function postingRow(scope: Scope, practiceId: string, postingRowId: string): Promise<PostingRowRow | undefined> {
  const { rows } = await scope.client.query<PostingRowRow>(`SELECT ${POSTING_ROW_COLUMNS} FROM posting_row p WHERE p.practice_id = $1 AND p.id = $2`, [practiceId, postingRowId]);
  return rows[0];
}

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

/** Where a single EFT row belongs: its trace's remittance paying exactly its amount, not yet deposited (among `candidates` when a person names one). */
export async function depositDecision(scope: Scope, practiceId: string, row: { readonly trace: string; readonly amount_cents: string }, candidates?: readonly { readonly id: string; readonly paymentCents: Cents }[]): Promise<string | null> {
  const amount = parseCents(row.amount_cents);
  const remittances = (candidates ?? (await remittancesOf(scope, practiceId, row.trace))).filter((candidate) => depositMatches({ amountCents: amount, paymentCents: candidate.paymentCents }));
  const [only] = remittances;
  return remittances.length === 1 && only !== undefined && !(await deposited(scope, only.id)) ? only.id : null;
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
  readonly procedure_code: string;
  readonly service_date: string | null;
}

interface ClaimLineRow {
  readonly claim_id: string;
  readonly procedure_code: string;
  readonly service_date: string | null;
  readonly paid_cents: string;
}

/**
 * Each case line's cash share of each remittance, and of each claim: what the claims matched to the line
 * paid on its line (its code and date), plus what the remittance's reversals of the line's own claim or
 * of a claim matched to it took back. Only lines a claim was matched to have a share.
 */
async function shares(scope: Scope, practiceId: string, matches: readonly StoredMatch[], lines: readonly CaseLineRow[]): Promise<{ readonly byRemittance: Map<string, Map<string, Cents>>; readonly byClaim: Map<string, Map<string, Cents>> }> {
  const attached = matches.filter((match) => match.kind === 'claim' && match.standing);
  const byRemittance = new Map<string, Map<string, Cents>>();
  const byClaim = new Map<string, Map<string, Cents>>();
  if (attached.length === 0) {
    return { byRemittance, byClaim };
  }
  const lineOf = new Map(lines.map((line) => [line.service_line_id, line]));
  const known = [...new Set([...attached.map((match) => match.claimId as string), ...attached.map((match) => lineOf.get(match.serviceLineId as string)?.claim_id).filter((id): id is string => id !== undefined)])];
  const { rows: reversals } = await scope.client.query<{ id: string; remittance_id: string; reversed: string }>(
    "SELECT v.id, v.remittance_id, v.reversal_of_claim_id AS reversed FROM claim v WHERE v.practice_id = $1 AND v.claim_status_code = '22' AND v.reversal_of_claim_id = ANY ($2::uuid[])",
    [practiceId, known],
  );
  const { rows: claimLines } = await scope.client.query<ClaimLineRow>(
    'SELECT s.claim_id, s.procedure_code, s.service_date::text AS service_date, s.paid_cents::text AS paid_cents FROM service_line s WHERE s.claim_id = ANY ($1::uuid[]) ORDER BY s.line_no',
    [[...attached.map((match) => match.claimId as string), ...reversals.map((row) => row.id)]],
  );
  const paidOn = (claimId: string, line: CaseLineRow): Cents =>
    parseCents(claimLines.find((row) => row.claim_id === claimId && row.procedure_code === line.procedure_code && row.service_date === line.service_date)?.paid_cents ?? '0');
  const add = (map: Map<string, Map<string, Cents>>, key: string, lineId: string, amount: Cents) => {
    const inner = map.get(key) ?? new Map<string, Cents>();
    inner.set(lineId, cents((inner.get(lineId) ?? ZERO_CENTS) + amount));
    map.set(key, inner);
  };
  for (const lineId of new Set(attached.map((match) => match.serviceLineId as string))) {
    const line = lineOf.get(lineId);
    if (line === undefined) {
      continue;
    }
    const claims = attached.filter((match) => match.serviceLineId === lineId);
    for (const match of claims) {
      add(byRemittance, match.remittanceId, lineId, paidOn(match.claimId as string, line));
      add(byClaim, match.claimId as string, lineId, paidOn(match.claimId as string, line));
    }
    const lineClaims = new Set([line.claim_id, ...claims.map((match) => match.claimId as string)]);
    for (const reversal of reversals.filter((row) => lineClaims.has(row.reversed))) {
      add(byRemittance, reversal.remittance_id, lineId, paidOn(reversal.id, line));
    }
  }
  return { byRemittance, byClaim };
}

interface MatchedRow {
  readonly match_id: string;
  readonly amount_cents: string;
  readonly payment_cents: string;
}

/**
 * Writes the posted and deposited entries every standing posting and deposit match owes (or only the
 * one named), in no one's name or the person's who matched by hand. A replay writes nothing twice.
 */
export async function settleMatches(scope: Scope, practiceId: string, createdBy: string | null, only?: string): Promise<number> {
  const entries = await ledgerEntries(scope, practiceId);
  const matches = await ledgerMatches(scope, practiceId);
  const { rows: lines } = await scope.client.query<CaseLineRow>(
    `SELECT cl.service_line_id, cl.case_id, l.claim_id, l.procedure_code, l.service_date::text AS service_date
       FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id WHERE cl.practice_id = $1`,
    [practiceId],
  );
  const { byRemittance, byClaim } = await shares(scope, practiceId, matches, lines);
  const caseOf = new Map(lines.map((row) => [row.service_line_id, row.case_id]));
  const { rows: amounts } = await scope.client.query<MatchedRow>(
    `SELECT m.id AS match_id, coalesce(p.amount_cents, e.amount_cents)::text AS amount_cents, r.bpr02_cents::text AS payment_cents
       FROM ledger_match m JOIN remittance r ON r.id = m.remittance_id LEFT JOIN posting_row p ON p.id = m.posting_row_id LEFT JOIN eft_row e ON e.id = m.eft_row_id
      WHERE m.practice_id = $1 AND m.kind IN ('posting', 'deposit') AND m.reversed_at IS NULL`,
    [practiceId],
  );
  const amountOf = new Map(amounts.map((row) => [row.match_id, { amount: parseCents(row.amount_cents), payment: parseCents(row.payment_cents) }]));
  // What each line may still post and deposit: what is approved for it, less what is already proved.
  const ledger = entriesById(entries);
  const room = new Map<string, bigint>();
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
      if (entry.matchId !== null && entry.stage === stage) {
        written.add(`${entry.matchId} ${entry.serviceLineId}`);
      }
    }
  }
  const standing = matches.filter((match) => match.standing && (match.kind === 'posting' || match.kind === 'deposit'));
  let count = 0;
  for (const [position, match] of standing.entries()) {
    const { amount, payment } = amountOf.get(match.id) as { amount: Cents; payment: Cents };
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
    for (const [serviceLineId, share] of owed) {
      const caseId = caseOf.get(serviceLineId);
      const key = `${serviceLineId} ${stage}`;
      if (caseId === undefined || share <= ZERO_CENTS || written.has(`${match.id} ${serviceLineId}`)) {
        continue;
      }
      const part = match.allocated ? partialShare(share, before, amount, payment) : share;
      const left = room.get(key) ?? 0n;
      const amountCents = cents(part < left ? part : left);
      if (amountCents <= ZERO_CENTS) {
        continue;
      }
      const id = await insertEntry(scope, practiceId, {
        caseId,
        serviceLineId,
        stage,
        amountCents,
        evidenceKind: stage === 'posted' ? 'posting_row' : 'eft_row',
        evidenceId: (stage === 'posted' ? match.postingRowId : match.eftRowId) as string,
        matchId: match.id,
        allocated: match.allocated,
        createdBy,
      });
      if (id !== null) {
        room.set(key, left - amountCents);
        count += 1;
      }
    }
  }
  return count;
}
