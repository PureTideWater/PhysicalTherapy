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
  /** The claims of that chain its reference reaches; empty when it names none. */
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
   * The claims a paid draw reaches lines through: the claims the PLB L6 names (D4 steps 1, 2 and 4), the chain's
   * claims in the L6's remittance (step 3), or both.
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

  const drawn = draws.map((draw) => draw.cents as bigint);
  const done = written.map((entry) => entry.cents as bigint);
  const left = new Map([1n, -1n].map((sign) => [sign, towards(drawn, sign) - towards(done, sign)]));
  const reached = new Set(written.map((entry) => entry.serviceLineId));
  const parts: InterestPart[] = [];
  for (const draw of draws) {
    const chainLines = lines.get(draw.chain);
    if (chainLines === undefined) {
      continue;
    }
    const sign = draw.cents / size(draw.cents);
    const given = towards(
      written.filter((entry) => entry.chain === draw.chain).map((entry) => entry.cents),
      sign,
    );
    const due = maxCents(ZERO_CENTS, minCents(cents(size(draw.cents) - given), cents(left.get(sign) as bigint)));
    let chosen: readonly { readonly serviceLineId: string; readonly claimId: string }[];
    let weights: Cents[];
    let amount: Cents;
    if (sign === 1n) {
      const forDraw = chainLines.paid.filter((line) => draw.claimIds.includes(line.claimId));
      const approved = forDraw.filter((line) => line.approved);
      const paidLines = (approved.length > 0 ? approved : forDraw).filter((line) => !reached.has(line.serviceLineId));
      chosen = paidLines;
      weights = paidLines.map((line) => line.weightCents);
      amount = due;
    } else {
      const heldLines = chainLines.takenBack.filter((line) => !reached.has(line.serviceLineId));
      chosen = heldLines;
      weights = heldLines.map((line) => maxCents(line.heldCents, ZERO_CENTS));
      amount = minCents(due, cents(total(weights)));
    }
    if (total(weights) === 0n) {
      continue;
    }
    const split = allocateByWeight(amount, weights);
    const allocated = draw.shared || split.filter((share) => share > 0n).length >= 2;
    for (const [index, line] of chosen.entries()) {
      const share = split[index] as Cents;
      if (share === ZERO_CENTS) {
        continue;
      }
      parts.push({ chain: draw.chain, serviceLineId: line.serviceLineId, claimId: line.claimId, cents: signed(share, sign), allocated });
      reached.add(line.serviceLineId);
    }
    left.set(sign, (left.get(sign) as bigint) - total(split));
  }
  return parts;
}

/**
 * What each line holds of each chain's interest (D5), chain by chain: its interest entries from matches naming a claim
 * of the chain (`chainOfMatch`, by match), net of their corrections and of take-backs, floored at zero. A match that
 * names no claim (one written before docs/adr/0084 from the PLB L6 alone) is in no chain. `entries` holds every entry
 * a correction among them corrects.
 */
export function interestHeld(entries: readonly MatchedLedgerEntry[], chainOfMatch: ReadonlyMap<string, string>): InterestHolding[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const held = new Map<string, Map<string, bigint>>();
  for (const entry of entries) {
    const root = correctedEntry(entry, byId) as MatchedLedgerEntry;
    const chain = chainOfMatch.get(root.matchId);
    if (root.stage !== 'interest' || root.serviceLineId === null || chain === undefined) {
      continue;
    }
    const ofChain = held.get(chain) ?? new Map<string, bigint>();
    held.set(chain, ofChain);
    ofChain.set(root.serviceLineId, (ofChain.get(root.serviceLineId) ?? 0n) + entry.amountCents);
  }
  return [...held].flatMap(([chain, ofChain]) => [...ofChain].map(([serviceLineId, amount]) => ({ chain, serviceLineId, heldCents: maxCents(cents(amount), ZERO_CENTS) })));
}
