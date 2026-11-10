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
  type InterestDraw,
  type InterestHeldSums,
  type InterestWritten,
  type PaidInterestLine,
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
  addInterestHeld,
  interestHeldOf,
  interestHeldOn,
  interestOfOthersOn,
  interestOutOfReach,
  interestUnplaced,
  interestWrites,
  takeInOrder,
} from '@tp/ledger';
import { type Cents, ZERO_CENTS, cents, minCents, negateCents, parseCents } from '@tp/money';

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
 *   the lines holding that chain's interest; its payments wait while a take-back of a chain that may yet
 *   hold interest on a case line is not written whole, and a payment of a chain never goes to a line on
 *   which another PLB L6 still owes a take-back of it that it can no longer write there (@tp/ledger
 *   interestOutOfReach). The PLB L6s are walked again, within the reconcile, until a walk writes nothing, so no
 *   reconcile ends with interest a later walk would take back (providerAdjustments). A claim's AMT I alone credits
 *   nothing. An entry is allocated only when it is one of two or more parts of a pro-rata split.
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
  /**
   * The walks of the PLB L6s this pass made (providerAdjustments): none when no PLB L6 draws on a chain, one when the
   * first wrote nothing, and one more for each walk that wrote, up to the first that wrote nothing.
   */
  readonly interestWalks: number;
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

/** What a claim's place in the chain's order is read from, beside its ID: its payment date and when it was loaded. */
interface ChainKeys {
  /** Its remittance's payment date (BPR16) as YYYY-MM-DD, whatever the connection's DateStyle. */
  readonly paidOn: string;
  /** When it was loaded (claim.created_at, in microseconds since the epoch). */
  readonly loadedAt: bigint;
}

/** A new claim found for a case line, with what the chain's claim order sorts it by (CHAIN_ORDER: payment date, load, id). */
interface Candidate extends ClaimCandidate, ChainKeys {
  readonly remittanceId: string;
}

/** An open case line whose new claims the pass looks for, by its place in the pass, with the claims its chain already knows. */
interface Searched {
  readonly ix: number;
  readonly line: CaseLine;
  readonly known: ReadonlySet<string>;
}

/**
 * The claims a claim match of the practice, standing or reversed, ever attached to each open case line, by the line's
 * service line (SUITE-CAP-3 D16): what "never claim-matched to this line" excludes. Read from the pass's chain context
 * before any of its writes, so no search statement reads ledger_match and none of their plans depends on that table's
 * statistics; the pass's own matches are each to another line (a service line is one case line), so they never exclude
 * a claim from a line still to be searched (design section 5.1, step 1a).
 */
type MatchedClaims = ReadonlyMap<string, ReadonlySet<string>>;

const NONE: ReadonlySet<string> = new Set();

/**
 * The order `ORDER BY r.bpr16_date, c.created_at, c.id` gives claims: by payment date (bpr16_date is NOT NULL, and its
 * YYYY-MM-DD text sorts as the date), when loaded (created_at to the microsecond), then ID (a UUID's lower-case text
 * sorts as its bytes, which is how PostgreSQL compares UUIDs), the ID read by `idOf`. The chain's claim order
 * (inChainOrder, of the search's candidates) and the reversals' order (byPayment) are both this one order.
 */
const chainOrder =
  <T extends ChainKeys>(idOf: (item: T) => string) =>
  (a: T, b: T): number => {
    if (a.paidOn !== b.paidOn) {
      return a.paidOn < b.paidOn ? -1 : 1;
    }
    if (a.loadedAt !== b.loadedAt) {
      return a.loadedAt < b.loadedAt ? -1 : 1;
    }
    const [x, y] = [idOf(a), idOf(b)];
    return x < y ? -1 : x > y ? 1 : 0;
  };

/** The chain's claim order of the search's candidates (CHAIN_ORDER: payment date, load, claim ID). */
const inChainOrder = chainOrder<Candidate>((candidate) => candidate.claimId);

interface SearchRow {
  readonly id: string;
  readonly remittance_id: string;
  readonly paid_on: string;
  readonly loaded_at: string;
}

/** Appends `value` to the list `map` holds at `key`, making the list when there is none (no copy per append). */
function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) {
    map.set(key, [value]);
  } else {
    list.push(value);
  }
}

const candidateOf = (row: SearchRow, key: Candidate['key']): Candidate => ({ claimId: row.id, key, remittanceId: row.remittance_id, paidOn: row.paid_on, loadedAt: BigInt(row.loaded_at) });

/**
 * The searched lines as the search statements take them, one parameter array a column (index, service line, remittance,
 * claim, code, service date), and each line's known claims as (index, claim) pairs.
 */
function searchArrays(searched: readonly Searched[]): { readonly lines: readonly unknown[][]; readonly known: readonly unknown[][] } {
  const knownIx: number[] = [];
  const knownIds: string[] = [];
  for (const item of searched) {
    for (const claimId of item.known) {
      knownIx.push(item.ix);
      knownIds.push(claimId);
    }
  }
  return {
    lines: [
      searched.map((item) => item.ix),
      searched.map((item) => item.line.serviceLineId),
      searched.map((item) => item.line.remittanceId),
      searched.map((item) => item.line.claimId),
      searched.map((item) => item.line.procedureCode),
      searched.map((item) => item.line.serviceDate),
    ],
    known: [knownIx, knownIds],
  };
}

/**
 * The searched lines' new claims by payer claim control number, in one statement for every line still searching (one a
 * round): per line, each claim a known claim's correction names (superseded_by_claim_id) or carrying a known claim's
 * control number hash, under exactly the filters each line's own query applied (loaded, not a reversal, not known, not
 * of the line's own remittance, loaded no earlier than the line's claim, no case line's claim), every table it reads
 * held to the practice (D11), in the chain's claim order within each line. A claim ever claim-matched to the line is
 * dropped here, from the pass's matched set (D16); it decrypts nothing.
 */
async function controlCandidates(scope: Scope, practiceId: string, searched: readonly Searched[], matched: MatchedClaims): Promise<Map<number, Candidate[]>> {
  const { lines, known } = searchArrays(searched);
  const { rows } = await scope.client.query<SearchRow & { ix: number }>(
    `WITH l (ix, service_line_id, remittance_id, claim_id) AS (SELECT * FROM unnest($2::int[], $3::uuid[], $4::uuid[], $5::uuid[])),
          k (ix, claim_id) AS (SELECT * FROM unnest($6::int[], $7::uuid[])),
          probe (ix, claim_id) AS (
            SELECT k.ix, q.superseded_by_claim_id FROM k JOIN claim q ON q.practice_id = $1 AND q.id = k.claim_id WHERE q.superseded_by_claim_id IS NOT NULL
             UNION
            SELECT k.ix, c.id FROM k JOIN claim q ON q.practice_id = $1 AND q.id = k.claim_id JOIN claim c ON c.practice_id = $1 AND c.payer_claim_control_number_hash = q.payer_claim_control_number_hash)
     SELECT l.ix, c.id, c.remittance_id, to_char(r.bpr16_date, 'YYYY-MM-DD') AS paid_on, (extract(epoch FROM c.created_at) * 1000000)::bigint::text AS loaded_at
       FROM probe p JOIN l ON l.ix = p.ix JOIN claim c ON c.id = p.claim_id JOIN remittance r ON r.id = c.remittance_id
      WHERE c.practice_id = $1 AND r.practice_id = $1 AND r.status = 'loaded' AND c.claim_status_code <> '22'
        AND NOT EXISTS (SELECT 1 FROM k WHERE k.ix = l.ix AND k.claim_id = c.id) AND c.remittance_id <> l.remittance_id
        AND c.created_at >= (SELECT o.created_at FROM claim o WHERE o.practice_id = $1 AND o.id = l.claim_id)
        AND NOT EXISTS (SELECT 1 FROM case_line x JOIN service_line xl ON xl.id = x.service_line_id WHERE x.practice_id = $1 AND xl.practice_id = $1 AND xl.claim_id = c.id)
      ORDER BY l.ix, r.bpr16_date, c.created_at, c.id`,
    [practiceId, ...lines.slice(0, 4), ...known],
  );
  const lineOf = new Map(searched.map((item) => [item.ix, item.line]));
  const found = new Map<number, Candidate[]>();
  for (const row of rows) {
    if ((matched.get((lineOf.get(row.ix) as CaseLine).serviceLineId) ?? NONE).has(row.id)) {
      continue;
    }
    pushTo(found, row.ix, candidateOf(row, 'payer_claim_control_number'));
  }
  return found;
}

/**
 * The patient search's per-line predicate, word for word in both of its statements: a line of the claim of the case
 * line's code and date (both dates null counts, as IS NOT DISTINCT FROM), not of the line's own remittance, loaded no
 * earlier than the line's claim, not known to the line, and not one the pass's matched set holds for the line and the
 * known claims do not already exclude ($10, $11; D16). Every table it reads is held to the practice (D11).
 */
const PATIENT_LINES = `
     WITH l (ix, service_line_id, remittance_id, claim_id, code, service_date) AS (SELECT * FROM unnest($2::int[], $3::uuid[], $4::uuid[], $5::uuid[], $6::text[], $7::date[])),
          k (ix, claim_id) AS (SELECT * FROM unnest($8::int[], $9::uuid[]))`;
const PATIENT_EXCLUSIONS = `c.remittance_id <> l.remittance_id AND c.created_at >= (SELECT o.created_at FROM claim o WHERE o.practice_id = $1 AND o.id = l.claim_id)
                       AND NOT EXISTS (SELECT 1 FROM k WHERE k.ix = l.ix AND k.claim_id = c.id)
                       AND NOT EXISTS (SELECT 1 FROM unnest($10::uuid[], $11::int[]) AS u (claim_id, ix) WHERE u.claim_id = c.id AND u.ix = l.ix)`;

/**
 * The searched lines' new claims by patient control number, service date and code, once for the pass (D1, D16; design
 * section 4): (a) one statement returning each claim some line's own query would have returned (the per-line predicate
 * in an EXISTS that stops at the first line it holds for), with no column of any service line, each decrypted once
 * however many lines share its code and date, so the decrypts are exactly the union of what each line's query
 * decrypted; then (b) one statement over only the (claim, line) pairs whose patient control numbers are equal, keeping
 * those that pass the line's own predicate, so what it reads and returns grows with the patient matches, never with a
 * code and date's claims. Per line, the claims (b) kept for it, in the chain's claim order.
 */
async function patientCandidates(scope: Scope, cipher: PracticeCipher, practiceId: string, searched: readonly Searched[], matched: MatchedClaims): Promise<Map<number, Candidate[]>> {
  const { lines, known } = searchArrays(searched);
  // D16: the matched pairs no known set already excludes (a reversed match, a person's unmatch among them, or a standing
  // match whose claim has no line paired with the case line), as (claim, index) arrays: identifiers only, never logged.
  const unmatched: [string[], number[]] = [[], []];
  for (const { ix, line, known: knownOfLine } of searched) {
    for (const claimId of matched.get(line.serviceLineId) ?? NONE) {
      if (!knownOfLine.has(claimId)) {
        unmatched[0].push(claimId);
        unmatched[1].push(ix);
      }
    }
  }
  const values = [practiceId, ...lines, ...known, ...unmatched];
  const { rows } = await scope.client.query<SearchRow & { patient_control_number: string }>(
    `${PATIENT_LINES},
          named (ix, claim_id) AS (
            SELECT l.ix, s.claim_id FROM l JOIN service_line s ON s.practice_id = $1 AND s.procedure_code = l.code AND s.service_date = l.service_date
             UNION
            SELECT l.ix, s.claim_id FROM l JOIN service_line s ON s.practice_id = $1 AND s.procedure_code = l.code AND s.service_date IS NULL AND l.service_date IS NULL)
     SELECT c.id, c.remittance_id, to_char(r.bpr16_date, 'YYYY-MM-DD') AS paid_on, (extract(epoch FROM c.created_at) * 1000000)::bigint::text AS loaded_at, c.patient_control_number
       FROM claim c JOIN remittance r ON r.id = c.remittance_id
      WHERE c.practice_id = $1 AND r.practice_id = $1 AND r.status = 'loaded' AND c.claim_status_code <> '22'
        AND NOT EXISTS (SELECT 1 FROM case_line x JOIN service_line xl ON xl.id = x.service_line_id WHERE x.practice_id = $1 AND xl.practice_id = $1 AND xl.claim_id = c.id)
        AND EXISTS (SELECT 1 FROM named n JOIN l ON l.ix = n.ix
                     WHERE n.claim_id = c.id AND ${PATIENT_EXCLUSIONS})
      ORDER BY c.id`,
    values,
  );
  // Each claim decrypted once (never logged), and paired with every searched line of the same patient control number.
  const linesOf = new Map<string, number[]>();
  for (const { ix, line } of searched) {
    pushTo(linesOf, line.patientControlNumber, ix);
  }
  const candidates = new Map<string, Candidate>();
  const pairs: [string[], number[]] = [[], []];
  for (const row of rows) {
    candidates.set(row.id, candidateOf(row, 'patient_control_number'));
    for (const ix of linesOf.get(cipher.decrypt('claim.patient_control_number', row.patient_control_number)) ?? []) {
      pairs[0].push(row.id);
      pairs[1].push(ix);
    }
  }
  const found = new Map<number, Candidate[]>();
  if (pairs[0].length === 0) {
    return found;
  }
  const { rows: kept } = await scope.client.query<{ claim_id: string; ix: number }>(
    `${PATIENT_LINES},
          p (claim_id, ix) AS (SELECT * FROM unnest($12::uuid[], $13::int[]))
     SELECT p.claim_id, p.ix
       FROM p JOIN l ON l.ix = p.ix JOIN claim c ON c.practice_id = $1 AND c.id = p.claim_id
      WHERE EXISTS (SELECT 1 FROM service_line s WHERE s.practice_id = $1 AND s.claim_id = c.id AND s.procedure_code = l.code AND s.service_date IS NOT DISTINCT FROM l.service_date)
        AND ${PATIENT_EXCLUSIONS}
      ORDER BY p.ix, p.claim_id`,
    [...values, ...pairs],
  );
  for (const { claim_id: claimId, ix } of kept) {
    pushTo(found, ix, candidates.get(claimId) as Candidate);
  }
  for (const list of found.values()) {
    list.sort(inChainOrder);
  }
  return found;
}

/**
 * Every open case line's new claims, to a fixpoint, for the whole pass at once (SUITE-CAP-3 D1, D2; docs/adr/0087):
 * what each line's own search found (test-support/per-line.ts, candidateClosure), in the same rounds. In each round a
 * line's candidates are those found by payer claim control number, else those found by patient control number
 * (@tp/ledger preferredCandidates), less the ones it has seen, taken off after the preference as each line's search
 * did; a candidate the line pairs with (@tp/ledger pairLines) joins what the line knows and extends its next round; a
 * line with no candidates stops. The patient search reads once: between rounds its filters change only by the line's
 * known claims, which are taken off here (design section 5.1, step 3). Nothing is written while the search runs, and
 * no line's filters read another line's writes (each names the line itself), so searching every line before any is
 * matched finds what searching each just before it is matched did. Each round's new candidates' lines are read once,
 * for every line, into `lines`, which the matching then reads (D2).
 */
async function passCandidates(
  scope: Scope,
  cipher: PracticeCipher,
  practiceId: string,
  open: readonly { readonly line: CaseLine; readonly chain: LineChain }[],
  matched: MatchedClaims,
  lines: Map<string, readonly ClaimLine[]>,
): Promise<Candidate[][]> {
  const searched = open.map(({ line, chain }, ix) => ({ ix, line, known: new Set(chain.claims.map((claim) => claim.claimId)), seen: new Set<string>(), found: [] as Candidate[] }));
  if (searched.length === 0) {
    return [];
  }
  const byPatient = await patientCandidates(scope, cipher, practiceId, searched, matched);
  let active = searched;
  while (active.length > 0) {
    const byControl = await controlCandidates(scope, practiceId, active, matched);
    const round = active.flatMap((item) => {
      // Both take-offs from the patient list are defensive: a claim the line came to know in an earlier round is in its
      // seen set, which is taken off after the preference, and D16's pairs are already excluded inside the patient
      // statements (their arrays). They state the base's per-round filters where the list is read, at no cost.
      const excluded = matched.get(item.line.serviceLineId) ?? NONE;
      const patient = (byPatient.get(item.ix) ?? []).filter((candidate) => !item.known.has(candidate.claimId) && !excluded.has(candidate.claimId));
      const candidates = preferredCandidates([...(byControl.get(item.ix) ?? []), ...patient]).filter((candidate) => !item.seen.has(candidate.claimId));
      return candidates.length === 0 ? [] : [{ item, candidates }];
    });
    const unread = [...new Set(round.flatMap(({ candidates }) => candidates.map((candidate) => candidate.claimId)))].filter((claimId) => !lines.has(claimId));
    if (unread.length > 0) {
      for (const [claimId, claimLinesOf] of await claimLines(scope, unread)) {
        lines.set(claimId, claimLinesOf);
      }
    }
    for (const { item, candidates } of round) {
      for (const candidate of candidates) {
        item.seen.add(candidate.claimId);
        if (caseLinePair(lines, item.line, candidate.claimId) !== undefined) {
          item.known.add(candidate.claimId);
          item.found.push(candidate);
        }
      }
    }
    active = round.map(({ item }) => item);
  }
  return searched.map((item) => item.found.sort(inChainOrder));
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
    pushTo(rowsOf, row.claim_id, row);
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

/** The practice's claim and recoupment matches in chain order, and when each was made. */
async function chainMatches(scope: Scope, practiceId: string): Promise<Pick<ChainContext, 'matches' | 'matchedAt'>> {
  const { rows: order } = await scope.client.query<{ id: string; matched_at: string }>(CHAIN_ORDER, [practiceId]);
  const position = new Map(order.map((row, index) => [row.id, index]));
  const matches = (await ledgerMatches(scope, practiceId)).filter((match) => position.has(match.id)).sort((a, b) => (position.get(a.id) as number) - (position.get(b.id) as number));
  return { matches, matchedAt: new Map(order.map((row) => [row.id, BigInt(row.matched_at)])) };
}

/** The claims the practice's claim matches name. */
const matchedClaims = (matches: readonly StoredMatch[]): string[] => matches.filter((match) => match.kind === 'claim').map((match) => match.claimId as string);

/** The loaded reversals of the claims named, in the order they were paid (ORDER BY r.bpr16_date, v.created_at, v.id). */
async function claimReversals(scope: Scope, practiceId: string, claims: readonly string[]): Promise<LoadedReversal[]> {
  const { rows } = await scope.client.query<{ id: string; remittance_id: string; reversed_claim_id: string; paid_on: string; loaded_at: string; beside: boolean }>(
    `SELECT v.id, v.remittance_id, v.reversal_of_claim_id AS reversed_claim_id, r.bpr16_date::text AS paid_on, (extract(epoch FROM v.created_at) * 1000000)::bigint::text AS loaded_at,
            EXISTS (SELECT 1 FROM claim n WHERE n.id = x.superseded_by_claim_id AND n.remittance_id = v.remittance_id) AS beside
       FROM claim v JOIN remittance r ON r.id = v.remittance_id JOIN claim x ON x.id = v.reversal_of_claim_id
      WHERE v.practice_id = $1 AND r.status = 'loaded' AND v.claim_status_code = '22' AND v.reversal_of_claim_id = ANY ($2::uuid[])
      ORDER BY r.bpr16_date, v.created_at, v.id`,
    [practiceId, claims],
  );
  return rows.map((row) => ({ id: row.id, remittanceId: row.remittance_id, reversedClaimId: row.reversed_claim_id, paidOn: row.paid_on, loadedAt: BigInt(row.loaded_at), beside: row.beside }));
}

/** Each match's counted recouped entries, summed. */
function recoupedOf(entries: readonly StoredEntry[]): Map<string, Cents> {
  const byId = entriesById(entries);
  const recouped = new Map<string, Cents>();
  for (const entry of entries) {
    if (entry.matchId !== null && entry.serviceLineId !== null && countedStage(entry, byId) === 'recouped') {
      recouped.set(entry.matchId, cents((recouped.get(entry.matchId) ?? ZERO_CENTS) + entry.amountCents));
    }
  }
  return recouped;
}

/** Reads what the chains of the case lines of `claimIds` (their own claims) are walked from. */
export async function chainContext(scope: Scope, practiceId: string, claimIds: readonly string[], entries: readonly StoredEntry[]): Promise<ChainContext> {
  const { matches, matchedAt } = await chainMatches(scope, practiceId);
  const claims = [...new Set([...claimIds, ...matchedClaims(matches)])];
  const reversals = await claimReversals(scope, practiceId, claims);
  const recouped = recoupedOf(entries);
  return { matches, matchedAt, lines: await claimLines(scope, claims), reversals, recouped };
}

/**
 * The part of chainContext that is the practice's whatever lines are asked about, read once for a reader that asks in
 * batches (the audit report's patient balance, SUITE-CAP-1a D18; docs/adr/0083): its matches in chain order, the lines
 * and loaded reversals of every claim a claim match names, and the recouped entries; and which claims those are.
 * chainContextFor adds a batch's own claims to it.
 */
export interface PracticeChains {
  readonly context: ChainContext;
  /** The claims the practice's claim matches name, whose lines and reversals `context` holds. */
  readonly claims: ReadonlySet<string>;
}

export async function practiceChains(scope: Scope, practiceId: string, entries: readonly StoredEntry[]): Promise<PracticeChains> {
  const { matches, matchedAt } = await chainMatches(scope, practiceId);
  const claims = [...new Set(matchedClaims(matches))];
  // A practice with no claim match has no matched claim to read lines or reversals of.
  const reversals = claims.length === 0 ? [] : await claimReversals(scope, practiceId, claims);
  const recouped = recoupedOf(entries);
  const lines = claims.length === 0 ? new Map<string, ClaimLine[]>() : await claimLines(scope, claims);
  return { context: { matches, matchedAt, lines, reversals, recouped }, claims: new Set(claims) };
}

/** The reversals' order as the query gives it (chainOrder: payment date, when loaded, then the reversal's ID). */
const byPayment = chainOrder<LoadedReversal>((reversal) => reversal.id);

/**
 * chainContext for the case lines of `claimIds`, from the practice's part read once (practiceChains) and the lines and
 * loaded reversals of those claims it does not already hold, read here (SUITE-CAP-1a D18; docs/adr/0083). Each line's
 * chain reads its own claim's lines and the matched claims' lines and reversals alone (lineChain, reversalRule), and a
 * reversal belongs to the one claim it reverses, so the two parts are disjoint and together hold, for each of these
 * lines, what one chainContext call over every line would: the claim lines by claim, and the reversals merged into the
 * query's order (payment date, when loaded, ID), each once.
 */
export async function chainContextFor(scope: Scope, practiceId: string, practice: PracticeChains, claimIds: readonly string[]): Promise<ChainContext> {
  const own = [...new Set(claimIds)].filter((claimId) => !practice.claims.has(claimId));
  if (own.length === 0) {
    return practice.context;
  }
  const reversals = await claimReversals(scope, practiceId, own);
  const lines = await claimLines(scope, own);
  const merged = new Map<string, LoadedReversal>();
  for (const reversal of [...practice.context.reversals, ...reversals]) {
    merged.set(reversal.id, merged.get(reversal.id) ?? reversal);
  }
  return {
    ...practice.context,
    lines: new Map([...lines, ...practice.context.lines]),
    reversals: [...merged.values()].sort(byPayment),
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

/** Each context's matches, indexed once: the standing ones by service line, each list in the matches' order (D5). */
const standingIndex = new WeakMap<readonly StoredMatch[], ReadonlyMap<string, readonly StoredMatch[]>>();

/**
 * A context's standing matches by service line, each line's in the context's chain order, built once per matches array
 * and kept while the array lives (SUITE-CAP-3 D5; docs/adr/0087): a line's chain reads its own matches from it instead of
 * filtering every match of the practice, so a pass, the report or a screen asking about every line walks the matches
 * once. ChainContext.matches is readonly and no caller changes it after building the context; two contexts with equal
 * but distinct arrays each get their own index.
 */
function standingByLine(matches: readonly StoredMatch[]): ReadonlyMap<string, readonly StoredMatch[]> {
  const known = standingIndex.get(matches);
  if (known !== undefined) {
    return known;
  }
  const index = new Map<string, StoredMatch[]>();
  for (const match of matches) {
    if (match.standing && match.serviceLineId !== null) {
      pushTo(index, match.serviceLineId, match);
    }
  }
  standingIndex.set(matches, index);
  return index;
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
  const own = standingByLine(context.matches).get(line.serviceLineId) ?? [];
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
  read?: ReadonlyMap<string, readonly ClaimLine[]>,
): Promise<Reprocessed | null> {
  // The claims' lines as the pass already read them (SUITE-CAP-3 D2: claimLines reads stored rows only, which the pass
  // never writes, and a claim's lines depend only on its own correction chain, which the loader never makes a loop, so
  // its map equals a fresh read of the two claims), else read here (a person's match by hand passes none).
  const lines = read !== undefined && read.has(line.claimId) && read.has(claimId) ? read : await claimLines(scope, [line.claimId, claimId]);
  const next = caseLinePair(lines, line, claimId);
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
 * as each candidate is matched. Every open line's candidates are found for the pass at once, before any line is
 * matched, and each claim's lines read once (passCandidates; SUITE-CAP-3 D1, D2, D16; docs/adr/0087); the lines are
 * then matched one after another in the same order as ever, so every write is issued in the same order.
 */
async function matchClaims(pass: ClaimPass, cipher: PracticeCipher, lines: readonly CaseLine[]): Promise<void> {
  const { scope, practiceId } = pass;
  const context = await chainContext(scope, practiceId, lines.map((line) => line.claimId), await ledgerEntries(scope, practiceId));
  const open: { readonly line: CaseLine; readonly chain: LineChain }[] = [];
  for (const line of lines.filter((item) => item.open)) {
    const chain = lineChain(context, line);
    if (chain !== undefined) {
      open.push({ line, chain });
    }
  }
  // D16: the claim matches, standing or reversed, of the open lines only (the search asks for no other line, so the
  // set never grows with the practice's history of matches), read before any write of the pass.
  const searchedLines = new Set(open.map(({ line }) => line.serviceLineId));
  const matched = new Map<string, Set<string>>();
  for (const match of context.matches) {
    if (match.kind === 'claim' && match.serviceLineId !== null && searchedLines.has(match.serviceLineId)) {
      matched.set(match.serviceLineId, (matched.get(match.serviceLineId) ?? new Set<string>()).add(match.claimId as string));
    }
  }
  // D2: the context's claim lines, extended by the search's own reads, which every match of the pass then reads.
  const read = new Map<string, readonly ClaimLine[]>(context.lines);
  const candidates = await passCandidates(scope, cipher, practiceId, open, matched, read);
  for (const [ix, { line, chain }] of open.entries()) {
    const state = { original: paidLine(chain.original), baselines: chain.chain.current };
    for (const candidate of candidates[ix] ?? []) {
      await matchCandidate(pass, line, state, candidate, read);
    }
  }
}

/** Compares one candidate with the line, records it, and carries the line's baselines past it. */
async function matchCandidate(
  pass: ClaimPass,
  line: CaseLine,
  state: { readonly original: PaidLine; baselines: PaymentBaselines },
  candidate: { readonly claimId: string; readonly remittanceId: string; readonly paidOn: string },
  read: ReadonlyMap<string, readonly ClaimLine[]>,
): Promise<void> {
  const { scope, practiceId, ledgers, counts } = pass;
  const ledger = ledgers.get(line.serviceLineId) ?? EMPTY_LINE_LEDGER;
  const reprocessed = await reprocessingOf(scope, line, candidate.claimId, { original: state.original, baselines: state.baselines, ledger }, read);
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
 *
 * Then the PLB L6s alone are walked again, in the same order, until a walk writes nothing (PR 126 review round 4, the
 * per-reconcile bound). One walk can leave interest a later walk takes back: a take-back counted whole by interest another PLB L6
 * keeps off a line (interestUnplaced) is walked before the payment dated after it, which lands on that line once the
 * other take-back is whole; the next walk takes it back. A walk that writes nothing is the state every later reconcile
 * would keep, so each reconcile ends where the reconciles after it would, and none ends above the cash. The WOs are
 * not walked again: their recoupments are written whole in the first walk, and the weights the later walks split by are
 * the ones the next reconcile would read.
 *
 * The walks are bounded by interestWalkLimit.of(room), room + 1, where room is the most interest entries the pass's
 * PLB L6s can still write (interestRoom). Proof that a real ledger ends below it: every walk but the last writes at
 * least one entry; every entry is a PLB L6 on a line it has not reached before (interestWrites never writes a line its
 * L6 reached, and ledger_match_standing holds one standing match per L6 and line) among the lines its draws can reach
 * this pass, which interestRoom counts; so the walks that write number at most room, and walk room + 1, if made,
 * writes nothing. A walk that writes at the limit is a defect: the reconcile is refused with InterestUnsettled, its
 * whole transaction rolls back, nothing is half-written, and the job is retried (pass.ts logs the job, the practice
 * and the walks, never an amount).
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
  const interest = await interestState(scope, practiceId, lines, matches, reading);
  const claimHashes = await hashesOf(scope, matches);
  const l6s = moment.adjustments.filter((adjustment) => adjustment.category === 'interest' && reading.draws.has(adjustment.id));
  const limit = interestWalkLimit.of(interestRoom(interest, reading, l6s));
  let wrote = 0;
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
    wrote += await recordInterest(scope, practiceId, adjustment, reading, { ledgers, counts, interest });
  }
  counts.interestWalks = l6s.length === 0 ? 0 : 1;
  while (wrote > 0) {
    if (counts.interestWalks >= limit) {
      throw new InterestUnsettled(counts.interestWalks);
    }
    counts.interestWalks += 1;
    wrote = 0;
    for (const adjustment of l6s) {
      wrote += await recordInterest(scope, practiceId, adjustment, reading, { ledgers, counts, interest });
    }
  }
}

/**
 * The most walks of the PLB L6s one reconcile makes, given its room (interestRoom): room + 1, which a real ledger never
 * reaches writing (providerAdjustments). An object, so a test can lower it to force the refusal; nothing else changes it.
 */
export const interestWalkLimit = { of: (room: number): number => room + 1 };

/**
 * A reconcile whose PLB L6s still wrote interest on the last walk interestWalkLimit allows (providerAdjustments): a
 * defect, since a real ledger's walks end with one that writes nothing first. Thrown inside the reconcile's
 * transaction, so all of it rolls back and the job is retried; it carries the walks made and names no amount, line or
 * claim.
 */
export class InterestUnsettled extends Error {
  override readonly name = 'InterestUnsettled';
  /** The attempt's error code in the worker's log (worker.ts attemptErrorCode). */
  readonly code = 'RECONCILE_INTEREST_UNSETTLED';

  constructor(readonly walks: number) {
    super('the reconcile was refused: its interest still changed on the last walk allowed, so nothing was written; it is retried');
  }
}

/**
 * The most interest entries the PLB L6s `l6s` can write in this pass, before its first walk (providerAdjustments' bound):
 * for each, the case lines its draws can reach that it has not reached. A paid draw reaches only the lines with a
 * standing claim match to a claim it is for (paidLinesOf). A take-back of a chain reaches only lines holding that
 * chain's interest (interestHeldOf): those holding it as the pass begins, and those a payment of the chain lands on
 * during the pass, each a line a paid draw reaches through a claim of that chain (its entry's match names the line's
 * claim, whose chain the holdings count it under).
 */
function interestRoom(interest: InterestState, reading: InterestReading, l6s: readonly AdjustmentRow[]): number {
  const draws = l6s.flatMap((adjustment) => reading.draws.get(adjustment.id) ?? []);
  const paidReach = (draw: InterestDraw) => [...new Set(draw.claimIds)].flatMap((claimId) => (interest.claimMatches.get(claimId) ?? []).map((item) => ({ claimId, line: item.match.serviceLineId as string })));
  const ofChain = new Map<string, Set<string>>();
  const reach = (chain: string): Set<string> => {
    const lines = ofChain.get(chain) ?? new Set<string>();
    ofChain.set(chain, lines);
    return lines;
  };
  for (const draw of draws.filter((item) => item.cents < ZERO_CENTS)) {
    for (const holding of interestHeldOf(interest.held, draw.chain)) {
      reach(draw.chain).add(holding.serviceLineId);
    }
  }
  for (const draw of draws.filter((item) => item.cents > ZERO_CENTS)) {
    for (const { claimId, line } of paidReach(draw)) {
      const chain = reading.chainOf.get(claimId);
      if (chain !== undefined) {
        reach(chain).add(line);
      }
    }
  }
  let room = 0;
  for (const adjustment of l6s) {
    const lines = new Set<string>();
    for (const draw of reading.draws.get(adjustment.id) ?? []) {
      for (const line of draw.cents > ZERO_CENTS ? paidReach(draw).map((item) => item.line) : reach(draw.chain)) {
        lines.add(line);
      }
    }
    const reached = new Set(writtenOf(interest, adjustment.id).map((entry) => entry.serviceLineId));
    room += [...lines].filter((line) => !reached.has(line)).length;
  }
  return room;
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
 * later PLB L6 of the same pass counts what an earlier one wrote; and the lookups each PLB L6 reads them through, built
 * once a pass and kept current as it writes (review INT-REL-2), so a draw reads only its own claims' lines and an L6's
 * own entries, never every case line against every match:
 * - claimMatches: each claim's standing claim matches on a case line, with their place in the pass's ledger order;
 * - caseLines and lineOrder: each case line by its service line, and its place among the case lines;
 * - entriesOf: each PLB L6's interest entries (its own, not their corrections), in ledger order;
 * - chainOfMatch: each interest match's chain, by its claim (a match naming no claim is in none);
 * - latestOf: each line's latest standing interest match of each chain;
 * - caseLineChains: the chains a claim of which has a standing claim match on a case line;
 * - takeBacksOf and paysOf: each chain's PLB L6s that take interest back from it, and that pay it, under the moment's
 *   attribution; and outOfReach, each such take-back's lines a payment of the chain must not reach (@tp/ledger
 *   interestOutOfReach), read once and dropped when the L6 writes;
 * - held and lineHeld: what each line holds of each chain's interest, and of its interest as a whole (every chain's,
 *   and a match's that names none, together, under LINE_TOTAL), net of corrections and take-backs: @tp/ledger
 *   addInterestHeld's sums, which a take-back reads floored (PR 126 review F-M2-2); and heldByLine, held's sums by
 *   line, through which a payment reads whether another chain holds interest on a line (PR 126 review RVM5-1).
 */
interface InterestState {
  readonly matches: InterestMatch[];
  readonly entries: StoredEntry[];
  readonly claimMatches: ReadonlyMap<string, readonly { readonly at: number; readonly match: StoredMatch }[]>;
  readonly caseLineChains: ReadonlySet<string>;
  readonly takeBacksOf: ReadonlyMap<string, readonly string[]>;
  readonly paysOf: ReadonlyMap<string, readonly string[]>;
  readonly outOfReach: Map<string, ReadonlyMap<string, readonly string[]>>;
  readonly caseLines: ReadonlyMap<string, CaseLine>;
  readonly lineOrder: ReadonlyMap<string, number>;
  readonly entriesOf: Map<string, StoredEntry[]>;
  readonly chainOfMatch: Map<string, string>;
  readonly latestOf: Map<string, InterestMatch>;
  readonly held: InterestHeldSums;
  readonly lineHeld: InterestHeldSums;
  readonly heldByLine: InterestHeldSums;
}

/** The key of a line's holding of a chain in InterestState.latestOf. */
const lineAndChain = (serviceLineId: string, chain: string) => `${serviceLineId}|${chain}`;

/** The key InterestState.lineHeld keeps each line's interest as a whole under: no chain's root is empty. */
const LINE_TOTAL = '';

/** An entry as @tp/ledger addInterestHeld reads it: an entry with no match has the match '', which is in no chain. */
const withMatch = (entry: StoredEntry) => ({ ...entry, matchId: entry.matchId ?? '' });

async function interestState(scope: Scope, practiceId: string, lines: readonly CaseLine[], matches: readonly StoredMatch[], reading: InterestReading): Promise<InterestState> {
  const entries = await ledgerEntries(scope, practiceId);
  const byId = entriesById(entries);
  const state: InterestState = {
    matches: [],
    entries: entries.filter((entry) => correctedEntry(entry, byId).stage === 'interest'),
    claimMatches: new Map(),
    caseLineChains: new Set(),
    takeBacksOf: new Map(),
    paysOf: new Map(),
    outOfReach: new Map(),
    caseLines: new Map(lines.map((line) => [line.serviceLineId, line])),
    lineOrder: new Map(lines.map((line, index) => [line.serviceLineId, index])),
    entriesOf: new Map(),
    chainOfMatch: new Map(),
    latestOf: new Map(),
    held: new Map(),
    lineHeld: new Map(),
    heldByLine: new Map(),
  };
  const claimMatches = state.claimMatches as Map<string, { readonly at: number; readonly match: StoredMatch }[]>;
  for (const [at, match] of matches.entries()) {
    if (match.kind === 'claim' && match.standing && match.serviceLineId !== null && state.lineOrder.has(match.serviceLineId)) {
      claimMatches.set(match.claimId as string, [...(claimMatches.get(match.claimId as string) ?? []), { at, match }]);
    }
  }
  const caseLineChains = state.caseLineChains as Set<string>;
  for (const claimId of claimMatches.keys()) {
    const chain = reading.chainOf.get(claimId);
    if (chain !== undefined) {
      caseLineChains.add(chain);
    }
  }
  for (const draw of [...reading.draws.values()].flat()) {
    const byChain = (draw.cents < ZERO_CENTS ? state.takeBacksOf : state.paysOf) as Map<string, string[]>;
    byChain.set(draw.chain, [...(byChain.get(draw.chain) ?? []), draw.adjustmentId]);
  }
  for (const match of matches) {
    if (match.kind === 'interest') {
      addInterestMatch(state, reading, { id: match.id, claimId: match.claimId, serviceLineId: match.serviceLineId, standing: match.standing });
    }
  }
  for (const entry of state.entries) {
    addInterestEntry(state, entry);
  }
  // What each line holds, of each chain and as a whole: built once a pass here, added to as the pass writes. A
  // correction counts under the entry it corrects (interestHeld); its own match is never read.
  const matched = state.entries.map(withMatch);
  addInterestHeld(state.held, matched, state.chainOfMatch, state.heldByLine);
  addInterestHeld(state.lineHeld, matched, new Map(state.matches.map((match) => [match.id, LINE_TOTAL])));
  return state;
}

/** An interest match read or written: kept in the pass's list and lookups. */
function addInterestMatch(state: InterestState, reading: InterestReading, match: InterestMatch): void {
  state.matches.push(match);
  const chain = match.claimId === null ? undefined : reading.chainOf.get(match.claimId);
  if (chain === undefined) {
    return;
  }
  state.chainOfMatch.set(match.id, chain);
  if (match.standing && match.serviceLineId !== null) {
    state.latestOf.set(lineAndChain(match.serviceLineId, chain), match);
  }
}

/** Every interest entry a PLB L6 has written, as @tp/ledger reads it: the chain of its match's claim, its line and its amount. */
function writtenOf(interest: InterestState, adjustmentId: string): InterestWritten[] {
  return (interest.entriesOf.get(adjustmentId) ?? []).map((entry) => ({
    chain: entry.matchId === null ? null : (interest.chainOfMatch.get(entry.matchId) ?? null),
    serviceLineId: entry.serviceLineId as string,
    cents: entry.amountCents,
  }));
}

/**
 * The lines a payment of `chain` must not reach (PR 126 review MONEY-R4-1): those on which another PLB L6 still owes a
 * take-back of the chain that it can no longer write there, having written an entry on them. An L6 draws once on a
 * chain, so a payment's own L6 is never among those it reads.
 */
function outOfReachOf(interest: InterestState, reading: InterestReading, chain: string): Set<string> {
  const lines = new Set<string>();
  for (const other of interest.takeBacksOf.get(chain) ?? []) {
    const byChain = interest.outOfReach.get(other) ?? interestOutOfReach({ draws: reading.draws.get(other) ?? [], written: writtenOf(interest, other) });
    interest.outOfReach.set(other, byChain);
    for (const line of byChain.get(chain) ?? []) {
      lines.add(line);
    }
  }
  return lines;
}

/**
 * The lines a paid draw may reach (D5): a line with a standing claim match to a claim the draw is for, through the latest
 * such match, an approving one first, in case-line order, weighted by its approvals remaining; each out of reach where
 * another PLB L6 still owes a take-back of the draw's chain that it can no longer write there (outOfReachOf; PR 126
 * review MONEY-R4-1) or the line holds another chain's interest (@tp/ledger interestOfOthersOn; PR 126 review RVM5-1),
 * which @tp/ledger counts among the draw's lines and writes nothing on (PR 126 review RV-DB2-1).
 */
function paidLinesOf(interest: InterestState, reading: InterestReading, ledgers: ReadonlyMap<string, LineLedger>, draw: InterestDraw): PaidInterestLine[] {
  const outOfReach = outOfReachOf(interest, reading, draw.chain);
  // The draw's claims' standing claim matches, by line, in ledger order; the lines in case-line order.
  const byLine = new Map<string, { readonly at: number; readonly match: StoredMatch }[]>();
  for (const claimId of new Set(draw.claimIds)) {
    for (const item of interest.claimMatches.get(claimId) ?? []) {
      const line = item.match.serviceLineId as string;
      byLine.set(line, [...(byLine.get(line) ?? []), item]);
    }
  }
  return [...byLine]
    .sort(([a], [b]) => (interest.lineOrder.get(a) as number) - (interest.lineOrder.get(b) as number))
    .map(([serviceLineId, items]) => {
      const standing = [...items].sort((a, b) => a.at - b.at).map((item) => item.match);
      const match = (standing.filter((item) => item.outcome === 'approved').at(-1) ?? standing.at(-1)) as StoredMatch;
      return {
        serviceLineId,
        claimId: match.claimId as string,
        approved: match.outcome === 'approved',
        weightCents: approvedRemaining(ledgers.get(serviceLineId) ?? EMPTY_LINE_LEDGER),
        outOfReach: outOfReach.has(serviceLineId) || interestOfOthersOn(interest.heldByLine, draw.chain, serviceLineId),
      };
    });
}

/**
 * What of `chain`'s interest PLB L6s other than `adjustmentId` paid and can pay to no line, less what other PLB L6s
 * still owe of take-backs of it (@tp/ledger interestUnplaced; PR 126 review R2M2-1): each paying L6 read with its draw's
 * lines as it would read them now.
 */
function unplacedOf(interest: InterestState, reading: InterestReading, ledgers: ReadonlyMap<string, LineLedger>, adjustmentId: string, chain: string): Cents {
  const others = (byChain: ReadonlyMap<string, readonly string[]>) => (byChain.get(chain) ?? []).filter((other) => other !== adjustmentId);
  const payments = others(interest.paysOf).map((other) => {
    const draws = reading.draws.get(other) ?? [];
    const draw = draws.find((item) => item.chain === chain) as InterestDraw;
    return { draws, written: writtenOf(interest, other), paid: paidLinesOf(interest, reading, ledgers, draw) };
  });
  const takeBacks = others(interest.takeBacksOf).map((other) => ({ draws: reading.draws.get(other) ?? [], written: writtenOf(interest, other) }));
  return interestUnplaced({ chain, payments, takeBacks });
}

/** An entry of the interest the pass holds, read or written: a PLB L6's own interest entry is kept under it too. */
function addInterestEntry(state: InterestState, entry: StoredEntry): void {
  if (entry.stage === 'interest' && entry.serviceLineId !== null) {
    state.entriesOf.set(entry.evidenceId, [...(state.entriesOf.get(entry.evidenceId) ?? []), entry]);
  }
}

/**
 * A PLB L6 (designs/ledger-interest-once.md D5, D6, D10): its draws under the moment's attribution, what it has written
 * already (in earlier reconciles and earlier in this pass, reversed matches included) and, per chain, the lines its draws
 * may reach, handed to @tp/ledger interestWrites, which decides every amount; then each part it returns written as an
 * interest match carrying the PLB L6 and the claim, and its entry. The paid lines are those with a standing claim match
 * to a claim the draw is for (for a PLB L6 that names a chain, the claims its reference reaches and those later in the
 * chain from them; the latest such match, an approving one first), weighted by approvals remaining; the lines a
 * take-back may reach are those holding the chain's interest, each through its latest standing interest match of the
 * chain, holding no more than the line's interest as a whole. A chain may yet hold interest when its root is a reversal
 * the moment links to no claim or a claim of it has a standing claim match on a case line; for a take-back of such a
 * chain, what other PLB L6s paid the chain and can pay to no line is read too (unplacedOf; PR 126 review R2M2-1). A paid
 * draw writes nothing on a line on which another PLB L6 still owes a take-back of its chain that it can no longer write
 * there (@tp/ledger interestOutOfReach; PR 126 review MONEY-R4-1): the line keeps its share of the split, written
 * nowhere (PR 126 review RV-DB2-1), so interest of a chain that comes to a case line after that L6 wrote, through a
 * person's match by hand, say, goes only where the take-back can follow it. Each is read through the pass's lookups
 * (InterestState), the holdings among them.
 */
async function recordInterest(
  scope: Scope,
  practiceId: string,
  adjustment: AdjustmentRow,
  reading: InterestReading,
  pass: { readonly ledgers: ReadonlyMap<string, LineLedger>; readonly counts: Counts; readonly interest: InterestState },
): Promise<number> {
  const draws = reading.draws.get(adjustment.id) ?? [];
  if (draws.length === 0) {
    return 0;
  }
  let wrote = 0;
  const { ledgers, counts, interest } = pass;
  const written = writtenOf(interest, adjustment.id);
  const chainLines = new Map<string, ChainInterestLines>();
  for (const draw of draws) {
    // A payment's lines, each out of reach where a take-back of its chain still owed can no longer follow it (PR 126
    // review MONEY-R4-1, RV-DB2-1).
    const paid = draw.cents > ZERO_CENTS ? paidLinesOf(interest, reading, ledgers, draw) : [];
    // The lines holding the chain's interest, each cut to its interest as a whole (Postgres's line floor; D8), read only
    // for a take-back: a chain can hold more on a line than the line holds when a specialist lowered another chain's entry.
    const takenBack =
      draw.cents < ZERO_CENTS
        ? interestHeldOf(interest.held, draw.chain)
            .filter((holding) => interest.caseLines.has(holding.serviceLineId))
            .flatMap((holding) => {
              const match = interest.latestOf.get(lineAndChain(holding.serviceLineId, draw.chain));
              return match === undefined
                ? []
                : [{ serviceLineId: holding.serviceLineId, claimId: match.claimId as string, heldCents: minCents(holding.heldCents, interestHeldOn(interest.lineHeld, LINE_TOTAL, holding.serviceLineId)) }];
            })
        : [];
    // A take-back of a chain that may yet hold interest on a case line, not written whole, holds the L6's payments
    // back (@tp/ledger interestWrites; PR 126 review F1): its root a reversal of a claim not uploaded yet, or a claim
    // of it matched to a case line; unless the rest is interest other L6s paid the chain and can pay to no line (PR 126
    // review R2M2-1).
    const mayYetHold = reading.unlinkedReversals.has(draw.chain) || interest.caseLineChains.has(draw.chain);
    const unplacedCents = draw.cents < ZERO_CENTS && mayYetHold ? unplacedOf(interest, reading, ledgers, adjustment.id, draw.chain) : ZERO_CENTS;
    chainLines.set(draw.chain, { paid, takenBack, mayYetHold, unplacedCents });
  }
  for (const part of interestWrites({ draws, written, lines: chainLines })) {
    const line = interest.caseLines.get(part.serviceLineId) as CaseLine;
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
    addInterestMatch(interest, reading, { id: matchId, claimId: part.claimId, serviceLineId: part.serviceLineId, standing: true });
    if (entryId !== null) {
      const entry: StoredEntry = {
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
      };
      interest.entries.push(entry);
      addInterestEntry(interest, entry);
      // The holdings kept current: the entry is its own root, on its line, of its match's chain and of the line's whole.
      addInterestHeld(interest.held, [withMatch(entry)], interest.chainOfMatch, interest.heldByLine);
      addInterestHeld(interest.lineHeld, [withMatch(entry)], new Map([[matchId, LINE_TOTAL]]));
      // What the L6 keeps payments off is read again once it has written.
      interest.outOfReach.delete(adjustment.id);
      wrote += 1;
    }
    if (part.cents > ZERO_CENTS) {
      counts.interest += 1;
    } else {
      counts.interestTakenBack += 1;
    }
  }
  return wrote;
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
