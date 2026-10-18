import type { PracticeCipher } from '@tp/db/runtime';
import { type ClaimCandidate, type PairableLine, type Reprocessing, allocateByWeight, countedStage, entriesById, pairedLine, preferredCandidates, reprocessing, takeInOrder } from '@tp/ledger';
import { type Cents, ZERO_CENTS, cents, negateCents, parseCents } from '@tp/money';

import { EMPTY_LINE_LEDGER, type LineLedger, type Scope, type StoredEntry, type StoredMatch, approvedRemaining, insertEntry, insertMatch, ledgerEntries, ledgerMatches, lineLedgers } from './ledger';
import type { NoChangeOutcome, ReprocessedNoChange } from './responses';

/**
 * Remittances against case lines (PRD 13, Matching step 1, and Recoupments and reversals; PRD 5, J10;
 * test matrix LED-02, LED-03, LED-06). Inside the reconcile step's transaction, for the job's one
 * practice:
 *
 * - Each new claim is checked against the open case lines (not written off, in a case not closed) by
 *   payer claim control number first (the claim supersedes the line's claim, or one matched to it since,
 *   or carries its control number) and by patient control number, service date and code second. The
 *   case line is compared with its own line of the claim (@tp/ledger pairLines: the same code,
 *   modifiers, units and date of service, else the same code and date, each line of the claim paired with
 *   one case line at most) against what the remittances have allowed it so far (remittanceBaseline: the
 *   original's observed allowed as later reprocessings changed it, less what recoupments took back; never
 *   an approval a payer response made that no remittance has paid): higher than that and every
 *   acceptance no remittance has paid creates an approved entry for the rest and attaches the claim;
 *   higher within such an acceptance confirms (the part of) it the claim pays, attached with no entry of
 *   its own, the rest left as a shortfall for a person to adjust or dispute; lower on a line with an
 *   approval standing takes back what the remittances paid less (a recouped entry, at most what was
 *   approved); the same, or lower with nothing approved, is a payer response "reprocessed, no change"
 *   (the submissions' record).
 * - A reversal of a claim attached to a case line, with no correction of it in the same remittance,
 *   takes back what that claim approved (a recouped entry, at once). A PLB WO naming the line's claim
 *   takes back what it names, from the lines with an approval standing, in order, never more than each
 *   has.
 * - Interest the payer paid on a claim attached to a case line, a PLB L6 naming it or the claim's own
 *   AMT I, is an interest entry, split by the lines' approvals when it covers several (allocated).
 * - A forward balance (PLB FB) is never an entry: it counts nothing until a recoupment resolves it.
 *
 * A claim that cannot be compared (no line of the case line's code and date) is left for a person: it
 * is listed with the adjusted payments that match nothing (unmatched.ts). A claim a person unmatched
 * from a line is never matched to it again automatically.
 */

/**
 * Records a payer response "reprocessed, no change" for the case through the submissions' own function
 * (responses.ts, recordReprocessedNoChange): the reconcile job's in no one's name, a manual match's in
 * the person's.
 */
export type RecordReprocessedNoChange = (scope: Scope, response: Omit<ReprocessedNoChange, 'requestId'>) => Promise<NoChangeOutcome>;

/** What a reconcile of the remittances did, in counts. */
export interface RemittanceOutcome {
  readonly approved: number;
  /** Claims that paid what a payer response had accepted: attached to the line, no entry of their own. */
  readonly confirmed: number;
  readonly decreased: number;
  readonly noChange: number;
  readonly recoupments: number;
  readonly interest: number;
  /** The recouped entries this pass wrote, by case: each tells the case's owner. */
  readonly recouped: readonly { readonly caseId: string; readonly entryId: string; readonly serviceLineId: string; readonly amountCents: Cents }[];
}

interface CaseLineRow {
  readonly case_id: string;
  readonly service_line_id: string;
  readonly claim_id: string;
  readonly remittance_id: string;
  readonly line_no: number;
  readonly procedure_code: string;
  readonly modifiers: string[];
  readonly units: string | null;
  readonly service_date: string | null;
  readonly observed_allowed_cents: string;
  readonly claim_hash: string;
  readonly patient_control_number: string;
  readonly open: boolean;
}

export interface CaseLine {
  readonly caseId: string;
  readonly serviceLineId: string;
  readonly claimId: string;
  readonly remittanceId: string;
  /** Its place in its claim (SVC order, from 1): which of the claim's lines it is when several are alike. */
  readonly lineNo: number;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly units: string | null;
  readonly serviceDate: string | null;
  readonly observedAllowedCents: Cents;
  readonly claimHash: string;
  readonly patientControlNumber: string;
  /** Not written off, in a case not closed: new claims are matched to it. */
  readonly open: boolean;
}

/** Every case line of the practice, its claim's identifiers decrypted for matching (never logged). */
export async function caseLines(scope: Scope, cipher: PracticeCipher, practiceId: string): Promise<CaseLine[]> {
  const { rows } = await scope.client.query<CaseLineRow>(
    `SELECT cl.case_id, cl.service_line_id, l.claim_id, c.remittance_id, l.line_no, l.procedure_code, l.modifiers, l.units::text AS units, l.service_date::text AS service_date,
            l.observed_allowed_cents::text AS observed_allowed_cents,
            c.payer_claim_control_number_hash AS claim_hash, c.patient_control_number, (cl.written_off_reason IS NULL AND k.state <> 'closed_written_off') AS open
       FROM case_line cl JOIN "case" k ON k.id = cl.case_id JOIN service_line l ON l.id = cl.service_line_id JOIN claim c ON c.id = l.claim_id
      WHERE cl.practice_id = $1
      ORDER BY cl.case_id, l.claim_id, l.line_no`,
    [practiceId],
  );
  return rows.map((row) => ({
    caseId: row.case_id,
    serviceLineId: row.service_line_id,
    claimId: row.claim_id,
    remittanceId: row.remittance_id,
    lineNo: row.line_no,
    procedureCode: row.procedure_code,
    modifiers: row.modifiers,
    units: row.units,
    serviceDate: row.service_date,
    observedAllowedCents: parseCents(row.observed_allowed_cents),
    claimHash: row.claim_hash,
    patientControlNumber: cipher.decrypt('claim.patient_control_number', row.patient_control_number),
    open: row.open,
  }));
}

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

/** A line of a claim as the pairing and the shares read it. */
export interface ClaimLine extends PairableLine {
  readonly serviceLineId: string;
  readonly claimId: string;
  readonly lineNo: number;
  readonly observedAllowedCents: Cents;
  readonly paidCents: Cents;
}

/** The lines of the claims named, in line order, by claim. */
export async function claimLines(scope: Scope, claimIds: readonly string[]): Promise<Map<string, ClaimLine[]>> {
  const { rows } = await scope.client.query<{
    id: string;
    claim_id: string;
    line_no: number;
    procedure_code: string;
    modifiers: string[];
    units: string | null;
    service_date: string | null;
    observed_allowed_cents: string;
    paid_cents: string;
  }>(
    `SELECT s.id, s.claim_id, s.line_no, s.procedure_code, s.modifiers, s.units::text AS units, s.service_date::text AS service_date,
            s.observed_allowed_cents::text AS observed_allowed_cents, s.paid_cents::text AS paid_cents
       FROM service_line s WHERE s.claim_id = ANY ($1::uuid[]) ORDER BY s.claim_id, s.line_no`,
    [[...new Set(claimIds)]],
  );
  const byClaim = new Map<string, ClaimLine[]>();
  for (const row of rows) {
    const line: ClaimLine = {
      serviceLineId: row.id,
      claimId: row.claim_id,
      lineNo: row.line_no,
      procedureCode: row.procedure_code,
      modifiers: row.modifiers,
      units: row.units,
      serviceDate: row.service_date,
      observedAllowedCents: parseCents(row.observed_allowed_cents),
      paidCents: parseCents(row.paid_cents),
    };
    byClaim.set(row.claim_id, [...(byClaim.get(row.claim_id) ?? []), line]);
  }
  return byClaim;
}

/**
 * The line of `claimId` paired with the case line (@tp/ledger pairLines, against every line of the case
 * line's own claim), or undefined when the claim has none: what the case line is compared with, and
 * posted and deposited from.
 */
export function caseLinePair(lines: ReadonlyMap<string, readonly ClaimLine[]>, caseLine: { readonly claimId: string; readonly serviceLineId: string }, claimId: string): ClaimLine | undefined {
  const original = lines.get(caseLine.claimId) ?? [];
  const index = original.findIndex((line) => line.serviceLineId === caseLine.serviceLineId);
  return index < 0 ? undefined : pairedLine(original, index, lines.get(claimId) ?? []);
}

/** What the comparisons read of a case line: which line of which claim it is, and what it was allowed. */
export type LineIdentity = Pick<CaseLine, 'serviceLineId' | 'claimId' | 'observedAllowedCents'>;

/** The observed allowed of the claim's line paired with the case line, or null when it has none. */
export async function comparableAllowed(scope: Scope, claimId: string, line: LineIdentity): Promise<Cents | null> {
  return caseLinePair(await claimLines(scope, [line.claimId, claimId]), line, claimId)?.observedAllowedCents ?? null;
}

/**
 * What the remittances have allowed a case line so far, the baseline a reprocessing is compared with
 * (PRD 13, Matching step 1 and Recoupments and reversals): the allowed of its latest standing approving
 * claim match's line (a reprocessing that approved more, or paid what a response accepted), less what
 * recoupments matched after it took back; with none, the original's observed allowed less every
 * recoupment. An approval a payer response made counts only once a remittance pays it.
 */
export async function remittanceBaseline(scope: Scope, line: LineIdentity, matches: readonly StoredMatch[], entries: readonly StoredEntry[]): Promise<Cents> {
  const order = new Map(matches.map((match, index) => [match.id, index]));
  const anchor = matches.filter((match) => match.kind === 'claim' && match.standing && match.outcome === 'approved' && match.serviceLineId === line.serviceLineId).at(-1);
  const anchorAllowed = anchor === undefined ? null : await comparableAllowed(scope, anchor.claimId as string, line);
  const from = anchor === undefined || anchorAllowed === null ? -1 : (order.get(anchor.id) as number);
  const byId = entriesById(entries);
  const takenBack = entries
    .filter((entry) => entry.serviceLineId === line.serviceLineId && entry.matchId !== null && (order.get(entry.matchId) ?? -1) > from && countedStage(entry, byId) === 'recouped')
    .reduce((sum, entry) => sum + entry.amountCents, 0n);
  return cents((anchorAllowed ?? line.observedAllowedCents) + takenBack);
}

/** What is approved for the line beyond what the remittances paid: an acceptance no remittance has paid yet (zero or more). */
export function unpaidApproval(line: LineIdentity, ledger: LineLedger, baseline: Cents): Cents {
  const unpaid = approvedRemaining(ledger) - (baseline - line.observedAllowedCents);
  return cents(unpaid > 0n ? unpaid : 0n);
}

/** A reprocessing's outcome for the case line, against what the remittances allowed it and what is approved. */
export function compareWithLine(line: LineIdentity, ledger: LineLedger, baseline: Cents, allowed: Cents): Reprocessing {
  return reprocessing({ remittanceAllowedCents: baseline, unpaidApprovalCents: unpaidApproval(line, ledger, baseline), newAllowedCents: allowed, approvedRemainingCents: approvedRemaining(ledger) });
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
  decreased: number;
  noChange: number;
  recoupments: number;
  interest: number;
}

interface Recouped {
  readonly caseId: string;
  readonly entryId: string;
  readonly serviceLineId: string;
  readonly amountCents: Cents;
}

/** Step 1: each open case line's new claims, in the order they were paid. */
async function matchClaims(
  scope: Scope,
  cipher: PracticeCipher,
  practiceId: string,
  lines: readonly CaseLine[],
  ledgers: Map<string, LineLedger>,
  matches: readonly StoredMatch[],
  recordNoChange: RecordReprocessedNoChange,
  counts: Counts,
  recouped: Recouped[],
): Promise<void> {
  const entries = await ledgerEntries(scope, practiceId);
  for (const line of lines.filter((item) => item.open)) {
    const known = [line.claimId, ...matches.filter((match) => match.kind === 'claim' && match.standing && match.serviceLineId === line.serviceLineId).map((match) => match.claimId as string)];
    let baseline: Cents | null = null;
    for (const candidate of await candidatesFor(scope, cipher, practiceId, line, known)) {
      const allowed = await comparableAllowed(scope, candidate.claimId, line);
      if (allowed === null) {
        continue;
      }
      const ledger = ledgers.get(line.serviceLineId) ?? EMPTY_LINE_LEDGER;
      baseline ??= await remittanceBaseline(scope, line, matches, entries);
      const outcome = compareWithLine(line, ledger, baseline, allowed);
      const matchId = await insertMatch(scope, practiceId, {
        kind: 'claim',
        claimId: candidate.claimId,
        remittanceId: candidate.remittanceId,
        serviceLineId: line.serviceLineId,
        outcome: outcome.kind === 'confirmed' ? 'approved' : outcome.kind,
        matchedBy: null,
      });
      if (matchId === null) {
        continue;
      }
      if (outcome.kind === 'confirmed') {
        // It pays (part of) what a payer response accepted: no entry of its own, no take-back of the rest.
        baseline = allowed;
        counts.confirmed += 1;
        continue;
      }
      if (outcome.kind === 'no_change') {
        counts.noChange += 1;
        await recordNoChange(scope, { practiceId, caseId: line.caseId, remittanceId: candidate.remittanceId, receivedOn: candidate.paidOn });
        continue;
      }
      const stage = outcome.kind === 'approved' ? 'approved' : 'recouped';
      const entryId = await insertEntry(scope, practiceId, {
        caseId: line.caseId,
        serviceLineId: line.serviceLineId,
        stage,
        amountCents: outcome.amountCents,
        evidenceKind: 'claim',
        evidenceId: candidate.claimId,
        matchId,
        effectiveOn: candidate.paidOn,
        createdBy: null,
      });
      ledgers.set(line.serviceLineId, after(ledger, stage, outcome.amountCents, matchId));
      if (stage === 'approved') {
        baseline = allowed;
        counts.approved += 1;
      } else {
        baseline = cents(baseline + outcome.amountCents);
        counts.decreased += 1;
        recouped.push({ caseId: line.caseId, entryId: entryId as string, serviceLineId: line.serviceLineId, amountCents: outcome.amountCents });
      }
    }
  }
}

const min = (a: Cents, b: Cents): Cents => (a < b ? a : b);

/**
 * What a claim that confirmed a payer response's approval paid of it (it wrote no entry of its own): what
 * its line allowed above the original, at most what the responses approved. Its reversal takes that back.
 */
async function confirmedBy(scope: Scope, line: CaseLine, claimId: string, ledger: LineLedger): Promise<Cents> {
  const allowed = await comparableAllowed(scope, claimId, line);
  const paid = allowed === null ? ZERO_CENTS : cents(allowed - line.observedAllowedCents);
  return paid > ZERO_CENTS ? min(paid, ledger.approvedByResponsesCents) : ZERO_CENTS;
}

interface ReversalRow {
  readonly id: string;
  readonly remittance_id: string;
  readonly reversed_claim_id: string;
  readonly paid_on: string;
}

/** A reversal of a claim attached to a case line, with no correction of it in the same remittance: what that claim approved is taken back. */
async function recoupReversals(scope: Scope, practiceId: string, lines: readonly CaseLine[], ledgers: Map<string, LineLedger>, matches: readonly StoredMatch[], counts: Counts, recouped: Recouped[]): Promise<void> {
  const approving = matches.filter((match) => match.kind === 'claim' && match.standing && match.outcome === 'approved');
  if (approving.length === 0) {
    return;
  }
  const { rows } = await scope.client.query<ReversalRow>(
    `SELECT v.id, v.remittance_id, v.reversal_of_claim_id AS reversed_claim_id, r.bpr16_date::text AS paid_on
       FROM claim v JOIN remittance r ON r.id = v.remittance_id JOIN claim x ON x.id = v.reversal_of_claim_id
      WHERE v.practice_id = $1 AND r.status = 'loaded' AND v.claim_status_code = '22' AND v.reversal_of_claim_id = ANY ($2::uuid[])
        AND NOT EXISTS (SELECT 1 FROM claim n WHERE n.id = x.superseded_by_claim_id AND n.remittance_id = v.remittance_id)
      ORDER BY r.bpr16_date, v.created_at, v.id`,
    [practiceId, [...new Set(approving.map((match) => match.claimId as string))]],
  );
  for (const reversal of rows) {
    for (const match of approving.filter((item) => item.claimId === reversal.reversed_claim_id)) {
      const line = lines.find((item) => item.serviceLineId === match.serviceLineId);
      const ledger = ledgers.get(match.serviceLineId as string) ?? EMPTY_LINE_LEDGER;
      if (line === undefined || everMatched(matches, 'recoupment', reversal.id, line.serviceLineId)) {
        continue;
      }
      const remaining = approvedRemaining(ledger);
      const taken = min(ledger.approvedByMatch.get(match.id) ?? (await confirmedBy(scope, line, match.claimId as string, ledger)), remaining);
      if (taken <= ZERO_CENTS) {
        continue;
      }
      const matchId = await insertMatch(scope, practiceId, { kind: 'recoupment', claimId: reversal.id, remittanceId: reversal.remittance_id, serviceLineId: line.serviceLineId, matchedBy: null });
      if (matchId === null) {
        continue;
      }
      const amount = negateCents(taken);
      const entryId = await insertEntry(scope, practiceId, { caseId: line.caseId, serviceLineId: line.serviceLineId, stage: 'recouped', amountCents: amount, evidenceKind: 'claim', evidenceId: reversal.id, matchId, effectiveOn: reversal.paid_on, createdBy: null });
      ledgers.set(line.serviceLineId, after(ledger, 'recouped', amount, matchId));
      counts.recoupments += 1;
      recouped.push({ caseId: line.caseId, entryId: entryId as string, serviceLineId: line.serviceLineId, amountCents: amount });
    }
  }
}

interface AdjustmentRow {
  readonly id: string;
  readonly remittance_id: string;
  readonly reference: string;
  readonly amount_cents: string;
  readonly paid_on: string;
  readonly category: 'recoupment' | 'interest';
}

/** The case lines a claim control number names: by the line's own claim or a claim matched to it with an approval. */
function namedLines(hash: string, lines: readonly CaseLine[], claimHashes: ReadonlyMap<string, string>, matches: readonly StoredMatch[], approvedOnly: boolean): CaseLine[] {
  return lines.filter(
    (line) =>
      (!approvedOnly && line.claimHash === hash) ||
      matches.some((match) => match.kind === 'claim' && match.standing && match.outcome === 'approved' && match.serviceLineId === line.serviceLineId && claimHashes.get(match.claimId as string) === hash),
  );
}

/** PLB WO and L6 naming a claim of a case line: recoupments (in line order, at most what each has approved) and interest (split by the lines' approvals). */
async function providerAdjustments(
  scope: Scope,
  cipher: PracticeCipher,
  practiceId: string,
  lines: readonly CaseLine[],
  ledgers: Map<string, LineLedger>,
  matches: readonly StoredMatch[],
  counts: Counts,
  recouped: Recouped[],
): Promise<void> {
  const { rows } = await scope.client.query<AdjustmentRow>(
    `SELECT a.id, a.remittance_id, a.reference, a.amount_cents::text AS amount_cents, r.bpr16_date::text AS paid_on, a.category
       FROM provider_adjustment a JOIN remittance r ON r.id = a.remittance_id
      WHERE a.practice_id = $1 AND r.status = 'loaded' AND a.category IN ('recoupment', 'interest') AND a.reference IS NOT NULL
      ORDER BY r.bpr16_date, a.created_at, a.position`,
    [practiceId],
  );
  if (rows.length === 0) {
    return;
  }
  const claimHashes = await hashesOf(scope, matches);
  for (const adjustment of rows) {
    const hash = cipher.lookupHash('claim.payer_claim_control_number', adjustment.reference);
    const amount = parseCents(adjustment.amount_cents);
    if (adjustment.category === 'recoupment') {
      const named = namedLines(hash, lines, claimHashes, matches, false).filter((line) => !everMatched(matches, 'recoupment', adjustment.id, line.serviceLineId));
      const takenBefore = cents(-sumEntries(await entriesOfEvidence(scope, practiceId, adjustment.id)));
      const left = cents(amount - takenBefore);
      if (named.length === 0 || left <= ZERO_CENTS) {
        continue;
      }
      const { parts } = takeInOrder(left, named.map((line) => approvedRemaining(ledgers.get(line.serviceLineId) ?? EMPTY_LINE_LEDGER)));
      for (const [index, line] of named.entries()) {
        const part = parts[index] as Cents;
        if (part <= ZERO_CENTS) {
          continue;
        }
        const matchId = await insertMatch(scope, practiceId, { kind: 'recoupment', providerAdjustmentId: adjustment.id, remittanceId: adjustment.remittance_id, serviceLineId: line.serviceLineId, matchedBy: null });
        if (matchId === null) {
          continue;
        }
        const entryAmount = negateCents(part);
        const entryId = await insertEntry(scope, practiceId, {
          caseId: line.caseId,
          serviceLineId: line.serviceLineId,
          stage: 'recouped',
          amountCents: entryAmount,
          evidenceKind: 'provider_adjustment',
          evidenceId: adjustment.id,
          matchId,
          effectiveOn: adjustment.paid_on,
          createdBy: null,
        });
        ledgers.set(line.serviceLineId, after(ledgers.get(line.serviceLineId) ?? EMPTY_LINE_LEDGER, 'recouped', entryAmount, matchId));
        counts.recoupments += 1;
        recouped.push({ caseId: line.caseId, entryId: entryId as string, serviceLineId: line.serviceLineId, amountCents: entryAmount });
      }
      continue;
    }
    // L6: a negative adjustment pays the provider; the interest is its opposite.
    const interest = negateCents(amount);
    const named = namedLines(hash, lines, claimHashes, matches, true);
    await recordInterest(scope, practiceId, matches, named, ledgers, interest, { kind: 'provider_adjustment', id: adjustment.id, remittanceId: adjustment.remittance_id, paidOn: adjustment.paid_on }, counts);
  }
}

/** A claim's own interest (AMT I), for the lines it approved. */
async function claimInterest(scope: Scope, practiceId: string, lines: readonly CaseLine[], ledgers: Map<string, LineLedger>, matches: readonly StoredMatch[], counts: Counts): Promise<void> {
  const approving = matches.filter((match) => match.kind === 'claim' && match.standing && match.outcome === 'approved');
  if (approving.length === 0) {
    return;
  }
  const { rows } = await scope.client.query<{ id: string; remittance_id: string; interest_cents: string; paid_on: string }>(
    `SELECT c.id, c.remittance_id, c.interest_cents::text AS interest_cents, r.bpr16_date::text AS paid_on
       FROM claim c JOIN remittance r ON r.id = c.remittance_id
      WHERE c.practice_id = $1 AND c.id = ANY ($2::uuid[]) AND c.interest_cents > 0 ORDER BY r.bpr16_date, c.id`,
    [practiceId, [...new Set(approving.map((match) => match.claimId as string))]],
  );
  for (const claim of rows) {
    const named = lines.filter((line) => approving.some((match) => match.claimId === claim.id && match.serviceLineId === line.serviceLineId));
    await recordInterest(scope, practiceId, matches, named, ledgers, parseCents(claim.interest_cents), { kind: 'claim', id: claim.id, remittanceId: claim.remittance_id, paidOn: claim.paid_on }, counts);
  }
}

/** Interest across the lines it covers, split by their approvals and flagged allocated when it covers more than one. */
async function recordInterest(
  scope: Scope,
  practiceId: string,
  matches: readonly StoredMatch[],
  named: readonly CaseLine[],
  ledgers: ReadonlyMap<string, LineLedger>,
  interest: Cents,
  evidence: { readonly kind: 'provider_adjustment' | 'claim'; readonly id: string; readonly remittanceId: string; readonly paidOn: string },
  counts: Counts,
): Promise<void> {
  const weights = named.map((line) => approvedRemaining(ledgers.get(line.serviceLineId) ?? EMPTY_LINE_LEDGER));
  if (interest <= ZERO_CENTS || !weights.some((weight) => weight > ZERO_CENTS)) {
    return;
  }
  const parts = allocateByWeight(interest, weights);
  const allocated = named.length > 1;
  for (const [index, line] of named.entries()) {
    const part = parts[index] as Cents;
    if (part <= ZERO_CENTS || everMatched(matches, 'interest', evidence.id, line.serviceLineId)) {
      continue;
    }
    const matchId = await insertMatch(scope, practiceId, {
      kind: 'interest',
      ...(evidence.kind === 'claim' ? { claimId: evidence.id } : { providerAdjustmentId: evidence.id }),
      remittanceId: evidence.remittanceId,
      serviceLineId: line.serviceLineId,
      allocated,
      matchedBy: null,
    });
    if (matchId === null) {
      continue;
    }
    await insertEntry(scope, practiceId, {
      caseId: line.caseId,
      serviceLineId: line.serviceLineId,
      stage: 'interest',
      amountCents: part,
      evidenceKind: evidence.kind,
      evidenceId: evidence.id,
      matchId,
      allocated,
      effectiveOn: evidence.paidOn,
      createdBy: null,
    });
    counts.interest += 1;
  }
}

/** Whether the evidence was ever matched to the line, standing or since reversed: a match a person reversed is never made again automatically. */
export function everMatched(matches: readonly StoredMatch[], kind: StoredMatch['kind'], evidenceId: string, serviceLineId: string | null): boolean {
  return matches.some((match) => match.kind === kind && (match.postingRowId ?? match.eftRowId ?? match.providerAdjustmentId ?? match.claimId) === evidenceId && match.serviceLineId === serviceLineId);
}

async function entriesOfEvidence(scope: Scope, practiceId: string, evidenceId: string): Promise<Cents[]> {
  const { rows } = await scope.client.query<{ amount_cents: string }>('SELECT amount_cents::text AS amount_cents FROM ledger_entry WHERE practice_id = $1 AND evidence_id = $2', [practiceId, evidenceId]);
  return rows.map((row) => parseCents(row.amount_cents));
}

function sumEntries(amounts: readonly Cents[]): bigint {
  return amounts.reduce((sum, amount) => sum + amount, 0n);
}

async function hashesOf(scope: Scope, matches: readonly StoredMatch[]): Promise<Map<string, string>> {
  const ids = [...new Set(matches.filter((match) => match.kind === 'claim').map((match) => match.claimId as string))];
  const { rows } = await scope.client.query<{ id: string; hash: string }>('SELECT id, payer_claim_control_number_hash AS hash FROM claim WHERE id = ANY ($1::uuid[])', [ids]);
  return new Map(rows.map((row) => [row.id, row.hash]));
}

/** Step 1, recoupments and interest, for the practice (inside the reconcile step's locked transaction). */
export async function reconcileRemittances(scope: Scope, cipher: PracticeCipher, practiceId: string, recordNoChange: RecordReprocessedNoChange): Promise<RemittanceOutcome> {
  const lines = await caseLines(scope, cipher, practiceId);
  const counts: Counts = { approved: 0, confirmed: 0, decreased: 0, noChange: 0, recoupments: 0, interest: 0 };
  const recouped: Recouped[] = [];
  if (lines.length === 0) {
    return { ...counts, recouped };
  }
  const ledgers = lineLedgers(await ledgerEntries(scope, practiceId));
  await matchClaims(scope, cipher, practiceId, lines, ledgers, await ledgerMatches(scope, practiceId), recordNoChange, counts, recouped);
  const matches = await ledgerMatches(scope, practiceId);
  await recoupReversals(scope, practiceId, lines, ledgers, matches, counts, recouped);
  await providerAdjustments(scope, cipher, practiceId, lines, ledgers, await ledgerMatches(scope, practiceId), counts, recouped);
  await claimInterest(scope, practiceId, lines, ledgers, await ledgerMatches(scope, practiceId), counts);
  return { ...counts, recouped };
}
