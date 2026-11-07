import { type Cents, ZERO_CENTS, cents, maxCents, minCents, negateCents } from '@tp/money';

import { allocateByWeight } from './allocation';
import { type LedgerEntry, LedgerError, correctedEntry } from './stages';

/**
 * Interest credited once (docs/adr/0084; designs/ledger-interest-once.md, D2 to D6, D10 and D17): the PLB L6 is the
 * interest, and the claims' AMT I say whose it is. An interest entry is written only from a PLB L6, positive for
 * interest paid and negative for interest taken back; a claim's AMT I alone credits nothing.
 *
 * Every amount is integer cents (bigint) and nothing divides but `allocateByWeight`, which splits sizes; a negative
 * amount is split by its size and its sign restored. What stored rows can hold is handled, never refused: a PLB L6 of
 * zero and a chain whose AMT I nets to zero draw nothing, a line holding less than zero of a chain counts as holding
 * zero, and weights that are all zero write nothing. A LedgerError means an input no stored row can produce.
 *
 * "Cash" is a PLB L6's amount negated: positive when the payer pays, negative when it takes back. A chain is a claim
 * with its reversals and corrections, as the loader links them; the reconcile names each by its root.
 */

/** A claim of a remittance whose PLB L6s are attributed: its chain and its signed AMT I (zero when it reports none). */
export interface InterestClaim {
  readonly id: string;
  readonly chain: string;
  readonly interestCents: Cents;
}

/** A remittance read as of one moment of the reconcile (D17), with every claim of it. */
export interface InterestRemittance {
  readonly id: string;
  readonly claims: readonly InterestClaim[];
}

/** A PLB L6 of category interest. */
export interface InterestAdjustment {
  readonly id: string;
  readonly remittanceId: string;
  /** The PLB pair's position in its remittance: the order a remittance's L6s are drawn from. */
  readonly position: number;
  /** Positive when the payer pays interest, negative when it takes interest back. */
  readonly cashCents: Cents;
  /** The chain its reference names among the claims of its own payer (D2), or null when it names none. */
  readonly namedChain: string | null;
  /**
   * The claims of that chain: those its reference reaches and every other claim of the chain the reconcile read (the
   * claims its case lines are matched to among them), so a draw for the chain reaches the lines matched to any claim of
   * it (D5), whichever one the reference carries; empty when it names none.
   */
  readonly namedClaimIds: readonly string[];
}

/** What one PLB L6 gives one chain under the current attribution. */
export interface InterestDraw {
  readonly adjustmentId: string;
  readonly chain: string;
  /** Signed: positive for interest paid, negative for interest taken back. Never zero. */
  readonly cents: Cents;
  /** The chain's amount was its share of a short pool shared by two or more chains (D4 step 3; D10). */
  readonly shared: boolean;
  /**
   * The claims a paid draw reaches lines through: the claims of the chain the PLB L6 names (D4 steps 1, 2 and 4), the
   * chain's claims in the L6's remittance (step 3), or both.
   */
  readonly claimIds: readonly string[];
}

/** What of a PLB L6 is attributed to no chain: counted nowhere (D4 step 5). */
export interface UnattributedInterest {
  readonly adjustmentId: string;
  readonly cents: Cents;
}

export interface InterestAttribution {
  readonly draws: readonly InterestDraw[];
  readonly unattributed: readonly UnattributedInterest[];
}

/** An interest entry already written from the PLB L6, standing or since reversed (gross). */
export interface InterestWritten {
  /** The chain of its match's claim; null for a match written before docs/adr/0084 that names no claim. */
  readonly chain: string | null;
  readonly serviceLineId: string;
  readonly cents: Cents;
}

/** A line a paid draw may reach: a standing claim match of the line to a claim of the chain. */
export interface PaidInterestLine {
  readonly serviceLineId: string;
  /** The claim of the line's standing claim match. */
  readonly claimId: string;
  /** That match's outcome is approved. */
  readonly approved: boolean;
  /** The line's approval remaining (zero or more). */
  readonly weightCents: Cents;
  /**
   * Another PLB L6 still owes a take-back of the chain and can no longer write it here (interestOutOfReach; PR 126
   * review MONEY-R4-1): the line is still one of the draw's lines when the approved ones are chosen and the draw is
   * split, but its share is written nowhere (PR 126 review RV-DB2-1).
   */
  readonly outOfReach: boolean;
}

/** A line a take-back may reach: one holding interest of the chain. */
export interface HeldInterestLine {
  readonly serviceLineId: string;
  /** The claim of the line's latest standing interest match of the chain. */
  readonly claimId: string;
  /** What the line holds of the chain (interestHeld); below zero counts as zero. */
  readonly heldCents: Cents;
}

export interface ChainInterestLines {
  readonly paid: readonly PaidInterestLine[];
  readonly takenBack: readonly HeldInterestLine[];
  /**
   * The chain may yet come to hold interest on a case line: its root is a reversal the moment links to no claim (its
   * claim not uploaded yet), or a claim of it has a standing claim match on a case line. A take-back of such a chain
   * that is not written whole holds back the PLB L6's payments (PR 126 review F1).
   */
  readonly mayYetHold: boolean;
  /**
   * For a take-back of a chain that may yet hold interest: what of the chain's interest other PLB L6s paid and can pay
   * to no line, less what other PLB L6s still owe of take-backs of it (interestUnplaced; zero when nothing is read). A
   * take-back short of whole by no more than this holds nothing back: the rest of what it owes was never credited, so
   * there is nothing more for it to find (PR 126 review R2M2-1).
   */
  readonly unplacedCents: Cents;
}

/** One interest match and entry to write: the PLB L6's, for the claim on the line. */
export interface InterestPart {
  readonly chain: string;
  readonly serviceLineId: string;
  readonly claimId: string;
  /** Signed and never zero. */
  readonly cents: Cents;
  readonly allocated: boolean;
}

/** A ledger entry with the match it belongs to. */
export interface MatchedLedgerEntry extends LedgerEntry {
  readonly matchId: string;
}

/** What one line holds of one chain's interest. */
export interface InterestHolding {
  readonly chain: string;
  readonly serviceLineId: string;
  readonly heldCents: Cents;
}

/** Where a PLB03-2 is split into identifiers (D2): spaces, commas, semicolons, vertical bars and slashes. */
const SEPARATOR = /[ ,;|/]/;

/**
 * The texts a PLB L6's reference may name a claim by (D2): the whole reference, then each identifier in it, in order
 * and without repeats. The worker hashes each as `claim.payer_claim_control_number` is hashed; nothing here sees a
 * hash or a claim.
 */
export function referenceCandidates(reference: string | null): string[] {
  const candidates: string[] = [];
  for (const text of [reference ?? '', ...(reference ?? '').split(SEPARATOR)]) {
    if (text !== '' && !candidates.includes(text)) {
      candidates.push(text);
    }
  }
  return candidates;
}

/** An amount's size. */
const size = (amount: bigint): Cents => maxCents(cents(amount), negateCents(cents(amount)));

/** Of two nonzero amounts of one sign, the one nearer zero. */
const nearer = (a: bigint, b: bigint): bigint => (a / size(a)) * minCents(size(a), size(b));

const total = (amounts: readonly bigint[]): bigint => amounts.reduce((sum, amount) => sum + amount, 0n);

/** `amount` (zero or more) given `sign` (1n or -1n). */
const signed = (amount: bigint, sign: bigint): Cents => (sign === 1n ? cents(amount) : negateCents(cents(amount)));

/** The sizes of the amounts that go `sign`'s way (1n or -1n), summed. */
const towards = (amounts: readonly bigint[], sign: bigint): bigint => total(amounts.map((amount) => maxCents(signed(amount, sign), ZERO_CENTS)));

const ATTRIBUTED_ONCE = 'interest is attributed from each PLB L6, claim and remittance once';

interface Given {
  readonly cents: bigint;
  readonly shared: boolean;
  readonly claimIds: readonly string[];
}

interface Drawing {
  readonly adjustment: InterestAdjustment;
  left: bigint;
  readonly given: Map<string, Given>;
}

/**
 * Whom each PLB L6 is for (D4), one remittance at a time, from the remittances read as of one moment (D17).
 *
 * 1. An L6 naming a chain with no claim in its remittance is that chain's, whole.
 * 2. An L6 naming a chain with claims there covers that chain's AMT I first, toward its sign; the rest joins the pool.
 * 3. The pool (the L6s naming nothing, and what step 2 left) is shared by the chains' remaining AMT I, netted per chain:
 *    exactly when the pool equals them, each drawing from the pool's L6s of its own sign in position order, both
 *    shortfalls from the pool's first L6; otherwise only the net, among the chains reporting interest its way, by
 *    `allocateByWeight`, never past a chain's report.
 * 4. What the pool left of a named L6 returns to the chain it names.
 * 5. The rest is no one's.
 *
 * L6s of zero and chains netting to zero take no part, and an L6 whose remittance is not given gets nothing.
 */
export function attributeInterest({ remittances, adjustments }: { readonly remittances: readonly InterestRemittance[]; readonly adjustments: readonly InterestAdjustment[] }): InterestAttribution {
  const remittanceIds = new Set<string>();
  const claimIds = new Set<string>();
  const adjustmentIds = new Set<string>();
  const once = (seen: Set<string>, id: string): void => {
    if (seen.has(id)) {
      throw new LedgerError(ATTRIBUTED_ONCE);
    }
    seen.add(id);
  };
  for (const remittance of remittances) {
    once(remittanceIds, remittance.id);
    for (const item of remittance.claims) {
      once(claimIds, item.id);
    }
  }
  for (const adjustment of adjustments) {
    once(adjustmentIds, adjustment.id);
  }

  const draws: InterestDraw[] = [];
  const unattributed: UnattributedInterest[] = [];
  for (const remittance of remittances) {
    // An L6 of zero takes part in nothing: it covers no claim, joins no pool and leaves no rest.
    const drawings: Drawing[] = adjustments
      .filter((adjustment) => adjustment.remittanceId === remittance.id)
      .sort((a, b) => a.position - b.position)
      .map((adjustment) => ({ adjustment, left: adjustment.cashCents, given: new Map() }));
    // Each chain's AMT I in the remittance, netted, with its claims there.
    const reported = new Map<string, { owed: bigint; readonly claims: string[] }>();
    for (const item of remittance.claims) {
      const chain = reported.get(item.chain) ?? { owed: 0n, claims: [] };
      chain.owed += item.interestCents;
      chain.claims.push(item.id);
      reported.set(item.chain, chain);
    }
    const give = (drawing: Drawing, chain: string, amount: bigint, shared: boolean, claims: readonly string[]): void => {
      const before = drawing.given.get(chain) ?? { cents: 0n, shared: false, claimIds: [] };
      drawing.given.set(chain, { cents: before.cents + amount, shared: before.shared || shared, claimIds: [...before.claimIds, ...claims.filter((id) => !before.claimIds.includes(id))] });
      drawing.left -= amount;
    };
    /** Draws `need` for the chain from the pool's L6s of its sign, in position order, up to their cash; returns what is left. */
    const drawFrom = (pool: readonly Drawing[], chain: string, claims: readonly string[], need: bigint, shared: boolean): bigint => {
      let still = need;
      for (const drawing of pool) {
        if (drawing.left * still > 0n) {
          const taken = nearer(still, drawing.left);
          give(drawing, chain, taken, shared, claims);
          still -= taken;
        }
      }
      return still;
    };

    // Steps 1 and 2: the named L6s.
    for (const drawing of drawings) {
      const chain = drawing.adjustment.namedChain;
      if (chain === null) {
        continue;
      }
      const named = reported.get(chain);
      if (named === undefined) {
        give(drawing, chain, drawing.left, false, drawing.adjustment.namedClaimIds);
      } else if (named.owed * drawing.left > 0n) {
        const covered = nearer(named.owed, drawing.left);
        named.owed -= covered;
        give(drawing, chain, covered, false, drawing.adjustment.namedClaimIds);
      }
    }

    // Step 3: the pool.
    const pool = drawings.filter((drawing) => drawing.left !== 0n);
    const first = pool[0];
    if (first !== undefined) {
      const cash = total(pool.map((drawing) => drawing.left));
      const open = [...reported].filter(([, { owed }]) => owed !== 0n);
      if (cash === total(open.map(([, { owed }]) => owed))) {
        const short = open.map(([chain, { owed, claims }]) => [chain, claims, drawFrom(pool, chain, claims, owed, false)] as const);
        for (const [chain, claims, still] of short) {
          give(first, chain, still, false, claims);
        }
      } else {
        const sharing = open.filter(([, { owed }]) => owed * cash > 0n);
        if (sharing.length > 0) {
          const sign = cash / size(cash);
          const sizes = sharing.map(([, { owed }]) => size(owed));
          const reports = total(sizes);
          const moved = minCents(size(cash), cents(reports));
          const parts = allocateByWeight(moved, sizes);
          const shared = moved < reports && parts.filter((share) => share > 0n).length >= 2;
          for (const [index, [chain, { claims }]] of sharing.entries()) {
            drawFrom(pool, chain, claims, signed(parts[index] as bigint, sign), shared);
          }
        }
      }
    }

    // Step 4: what the pool left of a named L6 returns to the chain it names; step 5: the rest is no one's.
    for (const drawing of drawings) {
      const chain = drawing.adjustment.namedChain;
      if (chain !== null) {
        give(drawing, chain, drawing.left, false, drawing.adjustment.namedClaimIds);
      }
      for (const [chain2, given] of drawing.given) {
        if (given.cents !== 0n) {
          draws.push({ adjustmentId: drawing.adjustment.id, chain: chain2, cents: cents(given.cents), shared: given.shared, claimIds: given.claimIds });
        }
      }
      if (drawing.left !== 0n) {
        unattributed.push({ adjustmentId: drawing.adjustment.id, cents: cents(drawing.left) });
      }
    }
  }
  return { draws, unattributed };
}

/**
 * What one PLB L6 writes now (D5, D6, D10), given its draws under the current attribution, every interest entry
 * already written from it (in earlier reconciles or earlier in this pass, reversed ones included) and, per chain, the
 * lines its draws may reach.
 *
 * Once: for each sign, the L6 writes at most its draws of that sign less what it has written of that sign, shared in
 * draw order; for each chain, at most the draw less what it has already given that chain of the draw's sign; never to
 * a line it has reached before. A paid draw goes to the lines matched to a claim it is for, the approved ones when
 * there are any, split by their approvals remaining; a take-back goes to the lines holding the chain's interest, cut
 * to what they hold and split by it. A part is allocated when its draw was a share of a short pool or two or more
 * lines took a part. The worker writes exactly the parts returned.
 *
 * Take-backs are written first: an L6 writes one entry on a line, a take-back can reach only the lines holding its
 * chain's interest and a payment any line matched to a claim it is for, so a payment goes to the lines the take-backs
 * left. When two chains' draws of opposite signs meet on a line no other line can take, the payment is the one left
 * unwritten, so the figure errs low and never above the cash (LED-24 two-chains.835).
 *
 * The payments also wait for the take-backs (PR 126 review F1): while a take-back of a chain that may yet hold interest
 * on a case line is not written whole, the L6 writes none of its payments, now or in a later reconcile, unless what it
 * still owes is interest other PLB L6s paid the chain and can pay to no line (`unplacedCents`; PR 126 review R2M2-1),
 * which was never credited and so leaves nothing for it to find. The interest that chain is still to hold arrives with
 * a later upload (a remittance dated earlier, uploaded later): landing on lines the take-back has not reached, it is
 * taken back there before any payment of the L6 is written; landing nowhere, because nothing remains on its lines or
 * they are the take-back's own, it completes the take-back as unplaced. Either way the take-back reaches the lines the
 * remittances uploaded in date order give it, so a later payment of the chain and its netting L6 come out the same in
 * either order while the payment is split by the same weights in both, or can reach no line (LED-24 two-chains.835 and
 * paired.835; netted-elsewhere.835 between partly-paid.835 and rest-paid.835). A take-back that no interest arriving
 * completes (the uploads pay the chain less than it takes back) holds them back for good, so the figure errs low. A
 * take-back of a chain that can come to hold no interest on a case line holds nothing back.
 *
 * A chain can also come to a case line with no upload, after the L6 wrote its payments (PR 126 review MONEY-R4-1): a
 * person matches a claim of it by hand, or a written-off line is reopened. The take-back it still owes then follows that
 * chain's interest only to the lines it has not reached, so the reconcile marks those it has out of reach for every
 * other L6's payment of the chain (interestOutOfReach). Such a line is still one of the payment's lines when the
 * approved ones are chosen and the payment is split, and its share is written nowhere, so a payment is never moved onto
 * a line it would not reach uploaded in order (PR 126 review RV-DB2-1).
 */
export function interestWrites({
  draws,
  written,
  lines,
}: {
  readonly draws: readonly InterestDraw[];
  readonly written: readonly InterestWritten[];
  readonly lines: ReadonlyMap<string, ChainInterestLines>;
}): InterestPart[] {
  if (new Set(draws.map((draw) => draw.adjustmentId)).size > 1 || new Set(draws.map((draw) => draw.chain)).size !== draws.length) {
    throw new LedgerError("interest is written from one PLB L6's draws, each chain once");
  }
  for (const chainLines of lines.values()) {
    for (const list of [chainLines.paid, chainLines.takenBack]) {
      if (new Set(list.map((line) => line.serviceLineId)).size !== list.length) {
        throw new LedgerError("interest reaches a line once in each chain's list");
      }
    }
    if (chainLines.paid.some((line) => line.weightCents < ZERO_CENTS)) {
      throw new LedgerError('interest is split by approvals remaining of zero or more');
    }
  }

  const left = leftOf(draws, written);
  const reached = new Set(written.map((entry) => entry.serviceLineId));
  const parts: InterestPart[] = [];
  // A take-back of a chain that may yet hold interest is not written whole: the payments wait (PR 126 review F1).
  let waiting = false;
  for (const [sign, draw] of [-1n, 1n].flatMap((ofSign) => draws.filter((item) => item.cents / size(item.cents) === ofSign).map((item) => [ofSign, item] as const))) {
    const chainLines = lines.get(draw.chain);
    if (chainLines === undefined) {
      continue;
    }
    const due = owed(draw, sign, written, left.get(sign) as bigint);
    let chosen: readonly { readonly serviceLineId: string; readonly claimId: string; readonly outOfReach: boolean }[];
    let weights: Cents[];
    let amount: Cents;
    if (sign === 1n) {
      if (waiting) {
        continue;
      }
      const paidLines = paidLinesOf(draw, chainLines.paid, reached);
      chosen = paidLines;
      weights = paidLines.map((line) => line.weightCents);
      amount = due;
    } else {
      const heldLines = chainLines.takenBack.filter((line) => !reached.has(line.serviceLineId));
      chosen = heldLines.map((line) => ({ serviceLineId: line.serviceLineId, claimId: line.claimId, outOfReach: false }));
      weights = heldLines.map((line) => maxCents(line.heldCents, ZERO_CENTS));
      amount = minCents(due, cents(total(weights)));
      waiting ||= chainLines.mayYetHold && amount + chainLines.unplacedCents < due;
    }
    if (total(weights) === 0n) {
      continue;
    }
    const split = allocateByWeight(amount, weights);
    const allocated = draw.shared || split.filter((share) => share > 0n).length >= 2;
    for (const [index, line] of chosen.entries()) {
      const share = split[index] as Cents;
      // A line kept off the payment takes its share of nothing (PR 126 review RV-DB2-1).
      if (share === ZERO_CENTS || line.outOfReach) {
        continue;
      }
      parts.push({ chain: draw.chain, serviceLineId: line.serviceLineId, claimId: line.claimId, cents: signed(share, sign), allocated });
      reached.add(line.serviceLineId);
      left.set(sign, (left.get(sign) as bigint) - share);
    }
  }
  return parts;
}

/**
 * The lines a paid draw is split over (D5): those matched to a claim it is for, the approved ones when there are any,
 * less those its PLB L6 has reached. A line kept off the draw (outOfReach) stays among them (PR 126 review RV-DB2-1).
 */
function paidLinesOf(draw: InterestDraw, paid: readonly PaidInterestLine[], reached: ReadonlySet<string>): PaidInterestLine[] {
  const forDraw = paid.filter((line) => draw.claimIds.includes(line.claimId));
  const approved = forDraw.filter((line) => line.approved);
  return (approved.length > 0 ? approved : forDraw).filter((line) => !reached.has(line.serviceLineId));
}

/** What a PLB L6 has left to write of each sign (1n and -1n): its draws of that sign less its entries of that sign, gross (D6). */
function leftOf(draws: readonly InterestDraw[], written: readonly InterestWritten[]): Map<bigint, bigint> {
  const drawn = draws.map((draw) => draw.cents as bigint);
  const done = written.map((entry) => entry.cents as bigint);
  return new Map([1n, -1n].map((sign) => [sign, towards(drawn, sign) - towards(done, sign)]));
}

/** What a PLB L6 still owes its draw of `sign` (D6): the draw less what it has given the draw's chain that way, within `left`, what it has left of that sign. */
function owed(draw: InterestDraw, sign: bigint, written: readonly InterestWritten[], left: bigint): Cents {
  const given = towards(
    written.filter((entry) => entry.chain === draw.chain).map((entry) => entry.cents),
    sign,
  );
  return maxCents(ZERO_CENTS, minCents(cents(size(draw.cents) - given), cents(left)));
}

/**
 * Where a payment of each chain must not go, read from one PLB L6 (PR 126 review MONEY-R4-1): for each chain the L6
 * takes interest back from and still owes (its draw less what it has taken back from that chain, within what is left of
 * its take-backs, as interestWrites reads them), the lines it has written an entry on, in the order it first reached
 * them. It never writes on those lines again, so interest of that chain landing there could never be taken back by it.
 * The reconcile keeps every other PLB L6's payment of the chain off them (PaidInterestLine.outOfReach: a line's share is
 * written nowhere), whatever brought the chain to those lines after the L6 wrote (a person's match by hand, a
 * written-off line reopened, a later upload), so the chain's interest goes only where the take-back can still follow
 * it. A take-back written whole, or owed no more because the L6's take-backs are spent, keeps nothing off.
 */
export function interestOutOfReach({ draws, written }: { readonly draws: readonly InterestDraw[]; readonly written: readonly InterestWritten[] }): Map<string, string[]> {
  const left = leftOf(draws, written).get(-1n) as bigint;
  const reached = [...new Set(written.map((entry) => entry.serviceLineId))];
  return new Map(draws.filter((draw) => draw.cents / size(draw.cents) === -1n && owed(draw, -1n, written, left) > ZERO_CENTS).map((draw) => [draw.chain, reached]));
}

/** A PLB L6 as interestUnplaced reads it: its draws under the moment's attribution and every interest entry it has written. */
export interface InterestOfL6 {
  readonly draws: readonly InterestDraw[];
  readonly written: readonly InterestWritten[];
}

/**
 * What of `chain`'s interest other PLB L6s paid and can pay to no line, read for a take-back of the chain that may yet
 * hold interest (PR 126 review R2M2-1; ChainInterestLines.unplacedCents). For each L6 in `payments` (its draws, its
 * entries, and its draw's lines as the reconcile reads them, each out of reach where another L6's take-back keeps the
 * chain's payments off it): what it still owes its payment of the chain, within what its draws of that sign leave once
 * its other payments are written whole, when no line of the payment has a weight, or else the shares that fall on the
 * lines kept off it (interestWrites writes those nowhere). Less what each L6 in `takeBacks` still owes of its take-back
 * of the chain, which is taken to find that interest first; never below zero. That interest was never credited, so a
 * take-back that owes no more than it has nothing more to find, and every count errs toward the take-back waiting.
 */
export function interestUnplaced({
  chain,
  payments,
  takeBacks,
}: {
  readonly chain: string;
  readonly payments: readonly (InterestOfL6 & { readonly paid: readonly PaidInterestLine[] })[];
  readonly takeBacks: readonly InterestOfL6[];
}): Cents {
  const drawOfChain = (draws: readonly InterestDraw[], sign: bigint) => draws.find((item) => item.chain === chain && item.cents / size(item.cents) === sign);
  let unplaced = 0n;
  for (const { draws, written, paid } of payments) {
    const draw = drawOfChain(draws, 1n);
    if (draw === undefined) {
      continue;
    }
    const left = leftOf(draws, written).get(1n) as bigint;
    // What its other payments could take of that, each written whole.
    const others = total(draws.filter((item) => item !== draw && item.cents / size(item.cents) === 1n).map((item) => owed(item, 1n, written, left)));
    const due = owed(draw, 1n, written, maxCents(ZERO_CENTS, cents(left - others)));
    const lines = paidLinesOf(draw, paid, new Set(written.map((entry) => entry.serviceLineId)));
    const weights = lines.map((line) => line.weightCents);
    if (total(weights) === 0n) {
      unplaced += due;
      continue;
    }
    const split = allocateByWeight(due, weights);
    for (const [index, line] of lines.entries()) {
      if (line.outOfReach) {
        unplaced += split[index] as bigint;
      }
    }
  }
  for (const { draws, written } of takeBacks) {
    const draw = drawOfChain(draws, -1n);
    if (draw !== undefined) {
      unplaced -= owed(draw, -1n, written, leftOf(draws, written).get(-1n) as bigint);
    }
  }
  return maxCents(ZERO_CENTS, cents(unplaced));
}

/**
 * What lines hold of each chain's interest, net and before the floor: by chain, then by line, each in the order the
 * entries first reach it (addInterestHeld). A reconcile pass builds it once from the entries it reads and adds each
 * entry it writes, so a take-back reads its chain's lines without reading every entry again (PR 126 review F-M2-2).
 */
export type InterestHeldSums = Map<string, Map<string, bigint>>;

/**
 * Adds `entries` to `sums` (D5): each interest entry from a match naming a claim of a chain (`chainOfMatch`, by match),
 * and each correction under the entry it corrects, to that chain's line. A match that names no claim (one written
 * before docs/adr/0084 from the PLB L6 alone) is in no chain. `entries` holds every entry a correction among them
 * corrects.
 */
export function addInterestHeld(sums: InterestHeldSums, entries: readonly MatchedLedgerEntry[], chainOfMatch: ReadonlyMap<string, string>): void {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  for (const entry of entries) {
    const root = correctedEntry(entry, byId) as MatchedLedgerEntry;
    const chain = chainOfMatch.get(root.matchId);
    if (root.stage !== 'interest' || root.serviceLineId === null || chain === undefined) {
      continue;
    }
    const ofChain = sums.get(chain) ?? new Map<string, bigint>();
    sums.set(chain, ofChain);
    ofChain.set(root.serviceLineId, (ofChain.get(root.serviceLineId) ?? 0n) + entry.amountCents);
  }
}

/** What each line holds of the chain's interest in `sums`, in their order, floored at zero (D5). */
export function interestHeldOf(sums: ReadonlyMap<string, ReadonlyMap<string, bigint>>, chain: string): InterestHolding[] {
  return [...(sums.get(chain) ?? [])].map(([serviceLineId, amount]) => ({ chain, serviceLineId, heldCents: maxCents(cents(amount), ZERO_CENTS) }));
}

/** What one line holds of the chain's interest in `sums`, floored at zero: zero when it holds none (D5). */
export function interestHeldOn(sums: ReadonlyMap<string, ReadonlyMap<string, bigint>>, chain: string, serviceLineId: string): Cents {
  return maxCents(cents(sums.get(chain)?.get(serviceLineId) ?? 0n), ZERO_CENTS);
}

/**
 * What each line holds of each chain's interest (D5), chain by chain: its interest entries from matches naming a claim
 * of the chain (`chainOfMatch`, by match), net of their corrections and of take-backs, floored at zero. A match that
 * names no claim (one written before docs/adr/0084 from the PLB L6 alone) is in no chain. `entries` holds every entry
 * a correction among them corrects.
 */
export function interestHeld(entries: readonly MatchedLedgerEntry[], chainOfMatch: ReadonlyMap<string, string>): InterestHolding[] {
  const sums: InterestHeldSums = new Map();
  addInterestHeld(sums, entries, chainOfMatch);
  return [...sums.keys()].flatMap((chain) => interestHeldOf(sums, chain));
}
