import type { PracticeCipher } from '@tp/db/runtime';
import {
  type ClaimAdjustmentPart,
  type ClaimCandidate,
  type ClaimSplitLine,
  type PairableLine,
  type PaidLine,
  type PaymentBaselines,
  type PaymentChain,
  type PaymentEvent,
  type PaymentOutcome,
  type ChainInterestLines,
  type InterestWritten,
  type ReversalTakeBack,
  claimLinePayments,
  correctedEntry,
  countedStage,
  keptClaimPart,
  entriesById,
  pairLines,
  pairedLine,
  paymentChain,
  paymentMatchOutcome,
  paymentOutcome,
  paymentStep,
  preferredCandidates,
  reversalTakeBack,
  interestHeld,
  interestWrites,
  takeInOrder,
} from '@tp/ledger';
import { type Cents, ZERO_CENTS, cents, negateCents, parseCents } from '@tp/money';

import { type AdjustmentRow, type InterestReading, adjustmentMoment, interestAttribution } from './interest-chains';
import { EMPTY_LINE_LEDGER, type LineLedger, type Scope, type StoredEntry, type StoredMatch, approvedRemaining, insertEntry, insertMatch, ledgerEntries, ledgerMatches, lineLedgers } from './ledger';
import type { NoChangeOutcome, ReprocessedNoChange } from './responses';

/**
 * Remittances against case lines (PRD 13, Matching step 1, and Recoupments and reversals; PRD 5, J10;
 * test matrix LED-02, LED-03, LED-06, LED-14 to LED-17; docs/adr/0067). Inside the reconcile step's
 * transaction, for the job's one practice:
 *
 * - Each new claim is checked against the open case lines (not written off, in a case not closed) by
 *   payer claim control number first (the claim supersedes the line's claim, or one matched to it since,
 *   or carries its control number) and by patient control number, service date and code second. The
 *   case line is compared with its own line of the claim (@tp/ledger pairLines: the same code,
 *   modifiers, units and date of service, else the same code and date, each line of the claim paired with
 *   one case line at most) against what the remittances have allowed and paid it so far (the line's chain,
 *   @tp/ledger paymentChain: its latest standing approving claim match's line, as the take-backs since
 *   moved it; never an approval a payer response made that no remittance has paid). The outcome is
 *   decided on the allowed amount and every amount is the payer's cash (@tp/ledger paymentOutcome):
 *   higher, paying more than the remittances paid and every acceptance no remittance has paid, creates
 *   an approved entry for the rest of the payment increase and attaches the claim; higher, paying more
 *   within such an acceptance, confirms (the part of) it the claim pays, attached with no entry of its
 *   own, the rest left as a shortfall for a person to adjust or dispute; higher, paying exactly what the
 *   remittances paid (the patient's share or other reductions took the increase), attaches the claim with
 *   no entry and no payer response; lower on a line with an approval standing, or higher or the same
 *   paying less (the founder's ruling on Q2), takes back the payment decrease (a recouped entry, at most
 *   what was approved; none when the payment did not fall or nothing is approved); the same, or lower with
 *   nothing approved, is a payer response "reprocessed, no change" (the submissions' record).
 * - A line's cash, everywhere the chain reads it, is its share of its claim's CLP04 (claimLines, @tp/ledger
 *   claimLinePayments): SVC03 less its part of the claim-level CAS (every group, signed) that no SVC03 holds,
 *   split over the lines carrying CAS of their own (every line when none does) by each one's allowed amount before
 *   the claim-level CAS (SVC02 less its own CAS outside group PR), rounded once with the exact fraction beside
 *   it; SVC03 itself when the claim carries none. A line of a correction whose charge, own CAS and SVC03 are
 *   those of its paired line in the claim it corrects (claim.superseded_by_claim_id) keeps that line's part,
 *   and the rest is split over the lines that changed (@tp/ledger keptClaimPart), so a claim-level change is
 *   the changed lines' and never moves onto a line the payer did not change.
 * - A reversal of a claim attached to a case line, with no correction of it in the same remittance,
 *   takes back the payment it removes above the original (@tp/ledger reversalTakeBack: its own claim's
 *   approval while an earlier payment of the line stands, every approval its payment carried when nothing
 *   stands, nothing while a later claim of the line stands; a recouped entry, at once). A PLB WO naming
 *   the line's claim takes back what it names, from the lines with an approval standing, in order, never
 *   more than each has.
 * - Interest is credited only from a PLB L6, once (docs/adr/0084): whom each PLB L6 is for is read as of one
 *   moment (interest-chains.ts: the claim of its own payer its reference names, else its remittance's AMT I
 *   netted per chain), and @tp/ledger interestWrites decides what it writes now, never past what its
 *   attribution gives it of each sign however often the reconcile runs: interest paid on the lines matched to
 *   the claims it is for, split by their approvals remaining, and interest taken back, a negative entry, on
 *   the lines holding that chain's interest. A claim's AMT I alone credits nothing. An entry is allocated
 *   only when it is one of two or more parts of a pro-rata split.
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
  /** Claims of a higher allowed amount paying exactly what the remittances paid: attached, approved, no entry and no payer response. */
  readonly noPaymentIncrease: number;
  readonly decreased: number;
  /** Claims recorded decreased with nothing to take back: the payment fell with nothing approved, or the allowed amount fell and the payment did not. */
  readonly decreasedNoEntry: number;
  readonly noChange: number;
  readonly recoupments: number;
  /** Interest entries above zero this pass wrote: interest a PLB L6 paid. */
  readonly interest: number;
  /** Interest entries below zero this pass wrote: interest a PLB L6 took back (docs/adr/0084). */
  readonly interestTakenBack: number;
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
  /** The line's cash, its share of CLP04 (@tp/ledger claimLinePayments): what every amount of the chain reads. */
  readonly paidCents: Cents;
  /** SVC03 as sent: what a line-level posting row of the line posts. */
  readonly servicePaidCents: Cents;
  /** Its part of the claim-level CAS SVC03 leaves out, with the exact fraction beside the cents; null when it takes none. */
  readonly claimAdjustment: ClaimAdjustmentPart | null;
  /** The line as its claim's claim-level CAS is split (@tp/ledger claimAllocations): the cash and the patient's share read the same lines and weights. */
  readonly split: ClaimSplitLine;
}

interface ClaimLineRow {
  id: string;
  claim_id: string;
  line_no: number;
  procedure_code: string;
  modifiers: string[];
  units: string | null;
  service_date: string | null;
  observed_allowed_cents: string;
  charge_cents: string;
  paid_cents: string;
  claim_paid_cents: string;
  carries_adjustments: boolean;
  line_reduction_cents: string;
  corrects_claim_id: string | null;
}

/** What @tp/ledger pairLines reads of a line row. */
const pairable = (row: ClaimLineRow): PairableLine => ({ procedureCode: row.procedure_code, modifiers: row.modifiers, units: row.units, serviceDate: row.service_date });

/**
 * The lines of the claims named, in line order, by claim, each with its cash: SVC03 less its part of the
 * claim-level CAS that no SVC03 holds, so the claim's lines add up to its CLP04 (@tp/ledger
 * claimLinePayments; docs/adr/0067). A correction's line that the payer did not change keeps its part of the
 * claim it corrects (the claim whose superseded_by_claim_id names it, its lines paired by @tp/ledger pairLines;
 * @tp/ledger keptClaimPart), so the claims each corrects are read too, back to the first. Read from stored rows only.
 */
export async function claimLines(scope: Scope, claimIds: readonly string[]): Promise<Map<string, ClaimLine[]>> {
  const { rows } = await scope.client.query<ClaimLineRow>(
    `WITH RECURSIVE named (id) AS (
       SELECT unnest($1::uuid[])
        UNION
       SELECT k.id FROM claim k JOIN named n ON k.superseded_by_claim_id = n.id)
     SELECT s.id, s.claim_id, s.line_no, s.procedure_code, s.modifiers, s.units::text AS units, s.service_date::text AS service_date,
            s.observed_allowed_cents::text AS observed_allowed_cents, s.charge_cents::text AS charge_cents, s.paid_cents::text AS paid_cents,
            c.paid_cents::text AS claim_paid_cents, EXISTS (SELECT 1 FROM adjustment a WHERE a.service_line_id = s.id) AS carries_adjustments,
            (SELECT COALESCE(sum(a.amount_cents), 0) FROM adjustment a WHERE a.service_line_id = s.id AND a.group_code <> 'PR')::text AS line_reduction_cents,
            (SELECT k.id FROM claim k WHERE k.superseded_by_claim_id = s.claim_id ORDER BY k.created_at DESC, k.id LIMIT 1) AS corrects_claim_id
       FROM service_line s JOIN claim c ON c.id = s.claim_id WHERE s.claim_id IN (SELECT id FROM named) ORDER BY s.claim_id, s.line_no`,
    [[...new Set(claimIds)]],
  );
  const rowsOf = new Map<string, ClaimLineRow[]>();
  for (const row of rows) {
    rowsOf.set(row.claim_id, [...(rowsOf.get(row.claim_id) ?? []), row]);
  }
  const byClaim = new Map<string, ClaimLine[]>();
  const linesOf = (claimId: string, seen: ReadonlySet<string>): ClaimLine[] => {
    const known = byClaim.get(claimId);
    if (known !== undefined) {
      return known;
    }
    const own = rowsOf.get(claimId) ?? [];
    const corrects = own[0]?.corrects_claim_id ?? null;
    // The claim it corrects, split first (a loop, which the loader's links never make, is read as no claim corrected).
    const before = corrects === null || seen.has(corrects) ? [] : linesOf(corrects, new Set([...seen, claimId]));
    const pairs = pairLines(own.map(pairable), before);
    const lines = own.map((row) => ({
      chargeCents: parseCents(row.charge_cents),
      lineReductionCents: parseCents(row.line_reduction_cents),
      carriesAdjustments: row.carries_adjustments,
      servicePaidCents: parseCents(row.paid_cents),
    }));
    const splits = lines.map((line, index): ClaimSplitLine => {
      const at = pairs[index] ?? null;
      const was = at === null ? undefined : before[at];
      const keptCents = keptClaimPart(line, was === undefined ? undefined : { line: { ...was.split, servicePaidCents: was.servicePaidCents }, part: was.claimAdjustment });
      return { chargeCents: line.chargeCents, lineReductionCents: line.lineReductionCents, carriesAdjustments: line.carriesAdjustments, keptCents };
    });
    const payments = claimLinePayments({
      claimPaidCents: parseCents(own[0]?.claim_paid_cents ?? '0'),
      lines: lines.map((line, index) => ({ ...(splits[index] as ClaimSplitLine), servicePaidCents: line.servicePaidCents })),
    });
    const result = own.map((row, index): ClaimLine => {
      const payment = payments[index] as (typeof payments)[number];
      return {
        serviceLineId: row.id,
        claimId: row.claim_id,
        lineNo: row.line_no,
        ...pairable(row),
        observedAllowedCents: parseCents(row.observed_allowed_cents),
        paidCents: payment.paidCents,
        servicePaidCents: parseCents(row.paid_cents),
        claimAdjustment: payment.claimAdjustment,
        split: splits[index] as ClaimSplitLine,
      };
    });
    byClaim.set(claimId, result);
    return result;
  };
  const named = new Map<string, ClaimLine[]>();
  for (const claimId of [...new Set(claimIds)]) {
    if (rowsOf.has(claimId)) {
      named.set(claimId, linesOf(claimId, new Set()));
    }
  }
  return named;
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

/** What the chain reads of a case line: which line of which claim it is. */
export type ChainLine = Pick<CaseLine, 'serviceLineId' | 'claimId'>;

/** The cash and allowed amount of a claim's line, as @tp/ledger's payment terms read it. */
export const paidLine = (line: ClaimLine): PaidLine => ({ allowedCents: line.observedAllowedCents, paidCents: line.paidCents });

/** A loaded reversal (CLP02 22) of a claim, and when it was loaded. */
interface LoadedReversal {
  readonly id: string;
  readonly remittanceId: string;
  readonly reversedClaimId: string;
  readonly paidOn: string;
  /** When its remittance was loaded (claim.created_at, in microseconds since the epoch). */
  readonly loadedAt: bigint;
  /** Its remittance holds the correction that superseded the reversed claim: the reprocessing, never a take-back. */
  readonly beside: boolean;
}

/**
 * What the practice's chains are read from: its matches in chain order, when each was made, the lines of
 * every claim a case line or a match names, the loaded reversals of those claims, and what each match's
 * counted recouped entries took back.
 */
export interface ChainContext {
  /** The claim and recoupment matches in chain order. */
  readonly matches: readonly StoredMatch[];
  /** When each match was made (matched_at, in microseconds since the epoch). */
  readonly matchedAt: ReadonlyMap<string, bigint>;
  readonly lines: ReadonlyMap<string, readonly ClaimLine[]>;
  /** In the order they were paid: the reversal take-backs' order. */
  readonly reversals: readonly LoadedReversal[];
  /** Each match's counted recouped entries, summed (zero or less). */
  readonly recouped: ReadonlyMap<string, Cents>;
}

/**
 * The practice's claim and recoupment matches in chain order: the order the ledger made them (ledger_match.seq;
 * docs/adr/0084), within a reconcile and across reconciles, with when each was made (matched_at, the
 * transaction's time, which a reversal's load time is compared with).
 */
const CHAIN_ORDER = `
  SELECT m.id, (extract(epoch FROM m.matched_at) * 1000000)::bigint::text AS matched_at
    FROM ledger_match m
   WHERE m.practice_id = $1 AND m.kind IN ('claim', 'recoupment')
   ORDER BY m.seq`;

/** Reads what the chains of the case lines of `claimIds` (their own claims) are walked from. */
export async function chainContext(scope: Scope, practiceId: string, claimIds: readonly string[], entries: readonly StoredEntry[]): Promise<ChainContext> {
  const { rows: order } = await scope.client.query<{ id: string; matched_at: string }>(CHAIN_ORDER, [practiceId]);
  const position = new Map(order.map((row, index) => [row.id, index]));
  const matches = (await ledgerMatches(scope, practiceId)).filter((match) => position.has(match.id)).sort((a, b) => (position.get(a.id) as number) - (position.get(b.id) as number));
  const claims = [...new Set([...claimIds, ...matches.filter((match) => match.kind === 'claim').map((match) => match.claimId as string)])];
  const { rows: reversals } = await scope.client.query<{ id: string; remittance_id: string; reversed_claim_id: string; paid_on: string; loaded_at: string; beside: boolean }>(
    `SELECT v.id, v.remittance_id, v.reversal_of_claim_id AS reversed_claim_id, r.bpr16_date::text AS paid_on, (extract(epoch FROM v.created_at) * 1000000)::bigint::text AS loaded_at,
            EXISTS (SELECT 1 FROM claim n WHERE n.id = x.superseded_by_claim_id AND n.remittance_id = v.remittance_id) AS beside
       FROM claim v JOIN remittance r ON r.id = v.remittance_id JOIN claim x ON x.id = v.reversal_of_claim_id
      WHERE v.practice_id = $1 AND r.status = 'loaded' AND v.claim_status_code = '22' AND v.reversal_of_claim_id = ANY ($2::uuid[])
      ORDER BY r.bpr16_date, v.created_at, v.id`,
    [practiceId, claims],
  );
  const byId = entriesById(entries);
  const recouped = new Map<string, Cents>();
  for (const entry of entries) {
    if (entry.matchId !== null && entry.serviceLineId !== null && countedStage(entry, byId) === 'recouped') {
      recouped.set(entry.matchId, cents((recouped.get(entry.matchId) ?? ZERO_CENTS) + entry.amountCents));
    }
  }
  return {
    matches,
    matchedAt: new Map(order.map((row) => [row.id, BigInt(row.matched_at)])),
    lines: await claimLines(scope, claims),
    reversals: reversals.map((row) => ({ id: row.id, remittanceId: row.remittance_id, reversedClaimId: row.reversed_claim_id, paidOn: row.paid_on, loadedAt: BigInt(row.loaded_at), beside: row.beside })),
    recouped,
  };
}

/** A claim of a case line's chain: the line's own (no match) or one matched to it, with its line paired with the case line. */
export interface ChainClaim {
  readonly match: StoredMatch | null;
  readonly claimId: string;
  /** Its place in the chain's matches (the original's is -1). */
  readonly position: number;
  readonly line: ClaimLine;
}

/** A case line's chain: its own claim's line, its claims (the original first, then each standing claim match in order), and the baselines walked over it. */
export interface LineChain {
  readonly original: ClaimLine;
  readonly claims: readonly ChainClaim[];
  readonly chain: PaymentChain;
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

/** A reprocessing of a case line by a claim: the claim's line paired with it, and how it compares (@tp/ledger paymentOutcome). */
export interface Reprocessed {
  readonly claimId: string;
  readonly next: ClaimLine;
  readonly outcome: PaymentOutcome;
  /** The match's stored outcome. */
  readonly matchOutcome: 'approved' | 'decreased' | 'no_change';
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

/** The entry a reprocessing writes: an approval, a take-back, or none (a confirmation, no payment increase, a decrease of nothing, or no change). */
export function reprocessingEntry(outcome: PaymentOutcome): { readonly stage: 'approved' | 'recouped'; readonly amountCents: Cents } | null {
  if (outcome.kind === 'approved') {
    return { stage: 'approved', amountCents: outcome.amountCents };
  }
  return outcome.kind === 'decreased' && outcome.amountCents < ZERO_CENTS ? { stage: 'recouped', amountCents: outcome.amountCents } : null;
}

/** The baselines after a reprocessing is matched: what the next comparison of the same pass reads. */
export function afterReprocessing(baselines: PaymentBaselines, matchId: string, reprocessed: Reprocessed): PaymentBaselines {
  const entry = reprocessingEntry(reprocessed.outcome);
  return paymentStep(baselines, {
    kind: 'claim',
    matchId,
    outcome: reprocessed.matchOutcome,
    ...paidLine(reprocessed.next),
    recoupedCents: entry?.stage === 'recouped' ? entry.amountCents : ZERO_CENTS,
  });
}

/**
 * Records a reprocessing: the claim match with its outcome and the entry it writes, in no one's name or
 * the person's who matched by hand. Null when a match already stands for the claim and line.
 */
export async function recordReprocessing(
  scope: Scope,
  practiceId: string,
  line: Pick<CaseLine, 'caseId' | 'serviceLineId'>,
  claim: { readonly remittanceId: string; readonly paidOn?: string },
  reprocessed: Reprocessed,
  by: string | null,
): Promise<{ readonly matchId: string; readonly entryId: string | null } | null> {
  const matchId = await insertMatch(scope, practiceId, { kind: 'claim', claimId: reprocessed.claimId, remittanceId: claim.remittanceId, serviceLineId: line.serviceLineId, outcome: reprocessed.matchOutcome, matchedBy: by });
  if (matchId === null) {
    return null;
  }
  const entry = reprocessingEntry(reprocessed.outcome);
  const entryId =
    entry === null
      ? null
      : await insertEntry(scope, practiceId, {
          caseId: line.caseId,
          serviceLineId: line.serviceLineId,
          stage: entry.stage,
          amountCents: entry.amountCents,
          evidenceKind: 'claim',
          evidenceId: reprocessed.claimId,
          matchId,
          ...(claim.paidOn === undefined ? {} : { effectiveOn: claim.paidOn }),
          createdBy: by,
        });
  return { matchId, entryId };
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

/** The case lines a claim control number names: by the line's own claim or a claim matched to it with an approval. */
function namedLines(hash: string, lines: readonly CaseLine[], claimHashes: ReadonlyMap<string, string>, matches: readonly StoredMatch[]): CaseLine[] {
  return lines.filter(
    (line) =>
      line.claimHash === hash ||
      matches.some((match) => match.kind === 'claim' && match.standing && match.outcome === 'approved' && match.serviceLineId === line.serviceLineId && claimHashes.get(match.claimId as string) === hash),
  );
}

/**
 * PLB WO naming a claim of a case line (recoupments, in line order, at most what each has approved) and PLB L6
 * (interest credited once, docs/adr/0084), walked in today's order: by payment date, load and position (D13). The rows
 * and whom each PLB L6 is for are read as of one moment (interest-chains.ts, D17): the walk visits exactly the rows
 * statement 1 returned, and an L6 with no reference is read too, an L6 of zero is not.
 */
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
  const moment = await adjustmentMoment(scope, practiceId);
  if (moment.adjustments.length === 0) {
    return;
  }
  const reading = await interestAttribution(scope, cipher, practiceId, moment);
  const interest = await interestState(scope, practiceId, matches);
  const claimHashes = await hashesOf(scope, matches);
  for (const adjustment of moment.adjustments) {
    if (adjustment.category === 'recoupment') {
      // A WO is read only with a reference, which it names whole (unchanged; docs/adr/0084 D14).
      const hash = cipher.lookupHash('claim.payer_claim_control_number', adjustment.reference as string);
      const amount = parseCents(adjustment.amount_cents);
      const named = namedLines(hash, lines, claimHashes, matches).filter((line) => !everMatched(matches, 'recoupment', adjustment.id, line.serviceLineId));
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
    await recordInterest(scope, practiceId, adjustment, reading, { lines, ledgers, matches, counts, interest });
  }
}

/** An interest match as the interest path reads it: whom it names on which line, and whether it stands. */
interface InterestMatch {
  readonly id: string;
  readonly claimId: string | null;
  readonly serviceLineId: string | null;
  readonly standing: boolean;
}

/**
 * What the interest path carries through one pass: the practice's interest matches and the entries of the interest
 * they hold (every interest entry with its corrections, gross), read at the start and added to as the pass writes, so a
 * later PLB L6 of the same pass counts what an earlier one wrote.
 */
interface InterestState {
  readonly matches: InterestMatch[];
  readonly entries: StoredEntry[];
}

async function interestState(scope: Scope, practiceId: string, matches: readonly StoredMatch[]): Promise<InterestState> {
  const entries = await ledgerEntries(scope, practiceId);
  const byId = entriesById(entries);
  return {
    matches: matches.filter((match) => match.kind === 'interest').map((match) => ({ id: match.id, claimId: match.claimId, serviceLineId: match.serviceLineId, standing: match.standing })),
    entries: entries.filter((entry) => correctedEntry(entry, byId).stage === 'interest'),
  };
}

/**
 * A PLB L6 (designs/ledger-interest-once.md D5, D6, D10): its draws under the moment's attribution, what it has written
 * already (in earlier reconciles and earlier in this pass, reversed matches included) and, per chain, the lines its draws
 * may reach, handed to @tp/ledger interestWrites, which decides every amount; then each part it returns written as an
 * interest match carrying the PLB L6 and the claim, and its entry. The paid lines are those with a standing claim match
 * to a claim the draw is for (the latest such match, an approving one first), weighted by approvals remaining; the lines
 * a take-back may reach are those holding the chain's interest (@tp/ledger interestHeld), each through its latest
 * standing interest match of the chain.
 */
async function recordInterest(
  scope: Scope,
  practiceId: string,
  adjustment: AdjustmentRow,
  reading: InterestReading,
  pass: { readonly lines: readonly CaseLine[]; readonly ledgers: ReadonlyMap<string, LineLedger>; readonly matches: readonly StoredMatch[]; readonly counts: Counts; readonly interest: InterestState },
): Promise<void> {
  const draws = reading.draws.get(adjustment.id) ?? [];
  if (draws.length === 0) {
    return;
  }
  const { lines, ledgers, matches, counts, interest } = pass;
  const chainOfMatch = new Map(
    interest.matches.flatMap((match) => {
      const chain = match.claimId === null ? undefined : reading.chainOf.get(match.claimId);
      return chain === undefined ? [] : [[match.id, chain] as const];
    }),
  );
  const written: InterestWritten[] = interest.entries
    .filter((entry) => entry.stage === 'interest' && entry.evidenceId === adjustment.id && entry.serviceLineId !== null)
    .map((entry) => ({ chain: entry.matchId === null ? null : (chainOfMatch.get(entry.matchId) ?? null), serviceLineId: entry.serviceLineId as string, cents: entry.amountCents }));
  // A correction's own match is never read: interestHeld counts it under the entry it corrects.
  const held = interestHeld(
    interest.entries.map((entry) => ({ ...entry, matchId: entry.matchId ?? '' })),
    chainOfMatch,
  );
  const caseLineOf = new Map(lines.map((line) => [line.serviceLineId, line]));
  const chainLines = new Map<string, ChainInterestLines>();
  for (const draw of draws) {
    const paid = lines.flatMap((line) => {
      const standing = matches.filter((match) => match.kind === 'claim' && match.standing && match.serviceLineId === line.serviceLineId && draw.claimIds.includes(match.claimId as string));
      const match = standing.filter((item) => item.outcome === 'approved').at(-1) ?? standing.at(-1);
      return match === undefined
        ? []
        : [{ serviceLineId: line.serviceLineId, claimId: match.claimId as string, approved: match.outcome === 'approved', weightCents: approvedRemaining(ledgers.get(line.serviceLineId) ?? EMPTY_LINE_LEDGER) }];
    });
    const takenBack = held
      .filter((holding) => holding.chain === draw.chain && caseLineOf.has(holding.serviceLineId))
      .flatMap((holding) => {
        const match = interest.matches.filter((item) => item.standing && item.serviceLineId === holding.serviceLineId && chainOfMatch.get(item.id) === draw.chain).at(-1);
        return match === undefined ? [] : [{ serviceLineId: holding.serviceLineId, claimId: match.claimId as string, heldCents: holding.heldCents }];
      });
    chainLines.set(draw.chain, { paid, takenBack });
  }
  for (const part of interestWrites({ draws, written, lines: chainLines })) {
    const line = caseLineOf.get(part.serviceLineId) as CaseLine;
    const matchId = await insertMatch(scope, practiceId, {
      kind: 'interest',
      claimId: part.claimId,
      providerAdjustmentId: adjustment.id,
      remittanceId: adjustment.remittance_id,
      serviceLineId: part.serviceLineId,
      allocated: part.allocated,
      matchedBy: null,
    });
    if (matchId === null) {
      continue;
    }
    const entryId = await insertEntry(scope, practiceId, {
      caseId: line.caseId,
      serviceLineId: part.serviceLineId,
      stage: 'interest',
      amountCents: part.cents,
      evidenceKind: 'provider_adjustment',
      evidenceId: adjustment.id,
      matchId,
      allocated: part.allocated,
      effectiveOn: adjustment.paid_on,
      createdBy: null,
    });
    interest.matches.push({ id: matchId, claimId: part.claimId, serviceLineId: part.serviceLineId, standing: true });
    if (entryId !== null) {
      interest.entries.push({
        id: entryId,
        caseId: line.caseId,
        serviceLineId: part.serviceLineId,
        stage: 'interest',
        amountCents: part.cents,
        evidenceKind: 'provider_adjustment',
        evidenceId: adjustment.id,
        matchId,
        allocated: part.allocated,
        effectiveOn: adjustment.paid_on,
      });
    }
    if (part.cents > ZERO_CENTS) {
      counts.interest += 1;
    } else {
      counts.interestTakenBack += 1;
    }
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

/** Step 1, recoupments and interest (credited from each PLB L6 only, docs/adr/0084), for the practice (inside the reconcile step's locked transaction). */
export async function reconcileRemittances(scope: Scope, cipher: PracticeCipher, practiceId: string, recordNoChange: RecordReprocessedNoChange): Promise<RemittanceOutcome> {
  const lines = await caseLines(scope, cipher, practiceId);
  const counts: Counts = { approved: 0, confirmed: 0, noPaymentIncrease: 0, decreased: 0, decreasedNoEntry: 0, noChange: 0, recoupments: 0, interest: 0, interestTakenBack: 0 };
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
