import { cents, negateCents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  type ChainInterestLines,
  type InterestAdjustment,
  type InterestClaim,
  type InterestDraw,
  type InterestHeldSums,
  type InterestPart,
  type InterestWritten,
  type MatchedLedgerEntry,
  addInterestHeld,
  attributeInterest,
  interestHeld,
  interestHeldOf,
  interestHeldOn,
  interestOutOfReach,
  interestUnplaced,
  interestWrites,
  referenceCandidates,
} from './interest';
import { LedgerError } from './stages';

/**
 * Interest credited once (docs/adr/0084; designs/ledger-interest-once.md section 4.1; LED-23 and LED-24): the PLB L6
 * is the interest and the claims' AMT I say whose it is. C is the correction on LED-16's two case lines (weights 24.00
 * and 30.00 by their approvals remaining); K is another patient's claim on no case line; V a reversal. Cash is the
 * L6's amount negated: positive when the payer pays, negative when it takes back.
 */

const claim = (id: string, chain: string, interest: bigint): InterestClaim => ({ id, chain, interestCents: cents(interest) });

const l6 = (id: string, cash: bigint, named: { chain: string; claims: string[] } | null = null, position = 1, remittanceId = 'R'): InterestAdjustment => ({
  id,
  remittanceId,
  position,
  cashCents: cents(cash),
  namedChain: named?.chain ?? null,
  namedClaimIds: named?.claims ?? [],
});

const NAMES_C = { chain: 'c', claims: ['C'] };

const attribute = (claims: InterestClaim[], adjustments: InterestAdjustment[]) => attributeInterest({ remittances: [{ id: 'R', claims }], adjustments });

const drawOf = (adjustmentId: string, chain: string, amount: bigint, claimIds: string[], shared = false): InterestDraw => ({ adjustmentId, chain, cents: cents(amount), shared, claimIds });

const paid = (claimId = 'C', weights: readonly [bigint, bigint] = [2400n, 3000n], approved = true, on: readonly [string, string] = ['L1', 'L2']): ChainInterestLines => ({
  paid: [
    { serviceLineId: on[0], claimId, approved, weightCents: cents(weights[0]), outOfReach: false },
    { serviceLineId: on[1], claimId, approved, weightCents: cents(weights[1]), outOfReach: false },
  ],
  takenBack: [],
  mayYetHold: true,
  unplacedCents: cents(0n),
});

/** A chain holding interest on L1 and L2; it may yet hold more, as a chain matched to a case line may. */
const holding = (held1: bigint, held2: bigint, claimId = 'C'): ChainInterestLines => ({
  paid: [],
  takenBack: [
    { serviceLineId: 'L1', claimId, heldCents: cents(held1) },
    { serviceLineId: 'L2', claimId, heldCents: cents(held2) },
  ],
  mayYetHold: true,
  unplacedCents: cents(0n),
});

const part = (chain: string, serviceLineId: string, claimId: string, amount: bigint, allocated: boolean): InterestPart => ({ chain, serviceLineId, claimId, cents: cents(amount), allocated });

const wrote = (chain: string | null, serviceLineId: string, amount: bigint): InterestWritten => ({ chain, serviceLineId, cents: cents(amount) });

const refuses = (refused: () => unknown, message: string): void => {
  expect(refused).toThrow(LedgerError);
  expect(refused).toThrow(message);
};

describe('whom a PLB L6 names (D2)', () => {
  it('tries the whole reference, then each identifier in it, in order and without repeats', () => {
    expect(referenceCandidates('SYNCCNLED160004')).toEqual(['SYNCCNLED160004']);
    // X12's recommended "CLP01 CLP07 TRN02": hyphens and dots are kept, since control numbers carry them.
    expect(referenceCandidates('PCN-1 SYNCCN.LED-16 TRN0001')).toEqual(['PCN-1 SYNCCN.LED-16 TRN0001', 'PCN-1', 'SYNCCN.LED-16', 'TRN0001']);
    expect(referenceCandidates('A,B;C|D/E')).toEqual(['A,B;C|D/E', 'A', 'B', 'C', 'D', 'E']);
    expect(referenceCandidates('A B A')).toEqual(['A B A', 'A', 'B']);
    expect(referenceCandidates(' A  ,A ')).toEqual([' A  ,A ', 'A']);
    expect(referenceCandidates('A-B')).toEqual(['A-B']);
  });

  it('has nothing to try for a PLB L6 that carries no reference', () => {
    expect(referenceCandidates(null)).toEqual([]);
    expect(referenceCandidates('')).toEqual([]);
    expect(referenceCandidates(' ,')).toEqual([' ,']);
  });
});

describe('the worked cases (designs/ledger-interest-once.md section 4.1)', () => {
  it('A, the guide’s pair: AMT I 5.40 on C and a PLB L6 of 5.40 naming C credit 2.40 + 3.00 from the L6 once', () => {
    const { draws, unattributed } = attribute([claim('C', 'c', 540n)], [l6('A', 540n, NAMES_C)]);
    expect(draws).toEqual([drawOf('A', 'c', 540n, ['C'])]);
    expect(unattributed).toEqual([]);
    expect(interestWrites({ draws, written: [], lines: new Map([['c', paid()]]) })).toEqual([part('c', 'L1', 'C', 240n, true), part('c', 'L2', 'C', 300n, true)]);
  });

  it('B, a PLB L6 naming nothing: its remittance’s AMT I says it is C’s', () => {
    const { draws, unattributed } = attribute([claim('C', 'c', 540n)], [l6('A', 540n)]);
    expect(draws).toEqual([drawOf('A', 'c', 540n, ['C'])]);
    expect(unattributed).toEqual([]);
    expect(interestWrites({ draws, written: [], lines: new Map([['c', paid()]]) })).toEqual([part('c', 'L1', 'C', 240n, true), part('c', 'L2', 'C', 300n, true)]);
  });

  it('C, a PLB L6 alone: it is the claim’s it names, in its own remittance or a later one', () => {
    expect(attribute([claim('C', 'c', 0n)], [l6('A', 540n, NAMES_C)])).toEqual({ draws: [drawOf('A', 'c', 540n, ['C'])], unattributed: [] });
    expect(attribute([claim('K', 'k', 0n)], [l6('A', 540n, NAMES_C)])).toEqual({ draws: [drawOf('A', 'c', 540n, ['C'])], unattributed: [] });
  });

  it('D, AMT I alone: no PLB L6, no interest', () => {
    expect(attribute([claim('C', 'c', 540n)], [])).toEqual({ draws: [], unattributed: [] });
    expect(attribute([claim('C', 'c', 540n)], [l6('A', 540n, NAMES_C, 1, 'another')])).toEqual({ draws: [], unattributed: [] });
  });

  it('E, AMT I and then a later remittance’s PLB L6 naming C: the later L6 credits it, once', () => {
    const { draws } = attributeInterest({ remittances: [{ id: 'R2', claims: [] }], adjustments: [l6('A', 540n, NAMES_C, 1, 'R2')] });
    expect(draws).toEqual([drawOf('A', 'c', 540n, ['C'])]);
  });

  it('D, then an unnamed PLB L6 later whose check reports no AMT I: counted nowhere', () => {
    expect(attribute([claim('K', 'k', 0n)], [l6('A', 540n)])).toEqual({ draws: [], unattributed: [{ adjustmentId: 'A', cents: 540n }] });
  });

  it('a PLB L6 of zero beside A moves nothing and is never refused', () => {
    expect(attribute([claim('C', 'c', 540n)], [l6('A', 540n, NAMES_C), l6('Z', 0n, NAMES_C, 2)])).toEqual({ draws: [drawOf('A', 'c', 540n, ['C'])], unattributed: [] });
    expect(attribute([claim('C', 'c', 540n)], [l6('Z', 0n)])).toEqual({ draws: [], unattributed: [] });
  });

  it('F, the PLB L6 above AMT I: what the claim’s AMT I leaves returns to the claim the payer named', () => {
    const { draws, unattributed } = attribute([claim('C', 'c', 540n)], [l6('A', 600n, NAMES_C)]);
    expect(draws).toEqual([drawOf('A', 'c', 600n, ['C'])]);
    expect(unattributed).toEqual([]);
    expect(interestWrites({ draws, written: [], lines: new Map([['c', paid()]]) })).toEqual([part('c', 'L1', 'C', 267n, true), part('c', 'L2', 'C', 333n, true)]);
  });

  it('F′, the same naming nothing: only the net moves, never past AMT I, and the rest is no one’s', () => {
    expect(attribute([claim('C', 'c', 540n)], [l6('A', 600n)])).toEqual({ draws: [drawOf('A', 'c', 540n, ['C'])], unattributed: [{ adjustmentId: 'A', cents: 60n }] });
  });

  it('two claims, one pool that equals their AMT I: each draws exactly its own', () => {
    expect(attribute([claim('C', 'c', 540n), claim('K', 'k', 200n)], [l6('A', 740n)])).toEqual({ draws: [drawOf('A', 'c', 540n, ['C']), drawOf('A', 'k', 200n, ['K'])], unattributed: [] });
  });

  it('a short pool is shared by AMT I, largest remainder, and flagged allocated', () => {
    const { draws, unattributed } = attribute([claim('C', 'c', 540n), claim('K', 'k', 200n)], [l6('A', 500n)]);
    expect(draws).toEqual([drawOf('A', 'c', 365n, ['C'], true), drawOf('A', 'k', 135n, ['K'], true)]);
    expect(unattributed).toEqual([]);
    expect(interestWrites({ draws, written: [], lines: new Map([['c', paid()]]) })).toEqual([part('c', 'L1', 'C', 162n, true), part('c', 'L2', 'C', 203n, true)]);
  });

  it('a named net PLB L6 covers its claim’s AMT I first, and the rest is the other claims’', () => {
    expect(attribute([claim('C', 'c', 540n), claim('K', 'k', 200n)], [l6('A', 740n, NAMES_C)])).toEqual({ draws: [drawOf('A', 'c', 540n, ['C']), drawOf('A', 'k', 200n, ['K'])], unattributed: [] });
  });

  it('R, approvals at different times: 5.40 on the line with a weight, not allocated, and nothing more, ever', () => {
    const { draws } = attribute([claim('C', 'c', 540n)], [l6('A', 540n, NAMES_C)]);
    const first = interestWrites({ draws, written: [], lines: new Map([['c', paid('C', [2400n, 0n])]]) });
    expect(first).toEqual([part('c', 'L1', 'C', 540n, false)]);
    expect(interestWrites({ draws, written: [wrote('c', 'L1', 540n)], lines: new Map([['c', paid('C', [2400n, 3000n])]]) })).toEqual([]);
  });

  it('R′, a later linked correction approving the second line: nothing more for the L6 or its chain', () => {
    const later: ChainInterestLines = {
      paid: [
        { serviceLineId: 'L1', claimId: 'C', approved: true, weightCents: cents(0n), outOfReach: false },
        { serviceLineId: 'L2', claimId: 'C3', approved: true, weightCents: cents(3000n), outOfReach: false },
      ],
      takenBack: [],
      mayYetHold: true,
      unplacedCents: cents(0n),
    };
    expect(interestWrites({ draws: [drawOf('A', 'c', 540n, ['C', 'C3'])], written: [wrote('c', 'L1', 540n)], lines: new Map([['c', later]]) })).toEqual([]);
  });

  it('net zero (RFI 1324): a reversal and its correction with no PLB L6 move nothing', () => {
    expect(attribute([claim('V', 'c', -540n), claim('C2', 'c', 540n)], [])).toEqual({ draws: [], unattributed: [] });
    expect(attribute([claim('V', 'c', -540n), claim('C2', 'c', 540n)], [l6('Z', 0n)])).toEqual({ draws: [], unattributed: [] });
  });

  it('net zero beside another claim: the chain reports nothing, so the other claim’s 2.00 is its own', () => {
    expect(attribute([claim('V', 'c', -540n), claim('C2', 'c', 540n), claim('K', 'k', 200n)], [l6('A', 200n)])).toEqual({ draws: [drawOf('A', 'k', 200n, ['K'])], unattributed: [] });
  });

  it('taken back: a reversal alone with a PLB L6 taking 5.40 back writes -2.40 and -3.00 against the lines holding it', () => {
    const { draws, unattributed } = attribute([claim('V', 'c', -540n)], [l6('A', -540n)]);
    expect(draws).toEqual([drawOf('A', 'c', -540n, ['V'])]);
    expect(unattributed).toEqual([]);
    expect(interestWrites({ draws, written: [], lines: new Map([['c', holding(240n, 300n)]]) })).toEqual([part('c', 'L1', 'C', -240n, true), part('c', 'L2', 'C', -300n, true)]);
  });

  it('restated, then taken back: the chain’s interest held through C is what is taken back', () => {
    const { draws } = attribute([claim('V2', 'c', -540n)], [l6('A', -540n)]);
    expect(interestWrites({ draws, written: [], lines: new Map([['c', holding(240n, 300n, 'C')]]) })).toEqual([part('c', 'L1', 'C', -240n, true), part('c', 'L2', 'C', -300n, true)]);
  });

  it('one net PLB L6 both ways: the take-back and the other claim’s interest, exactly, from one L6', () => {
    expect(attribute([claim('V', 'c', -540n), claim('K', 'k', 200n)], [l6('A', -340n)])).toEqual({ draws: [drawOf('A', 'c', -540n, ['V']), drawOf('A', 'k', 200n, ['K'])], unattributed: [] });
  });

  it('a take-back past what the lines hold takes only what they hold', () => {
    const { draws } = attributeInterest({ remittances: [{ id: 'R2', claims: [] }], adjustments: [l6('A', -600n, NAMES_C, 1, 'R2')] });
    expect(draws).toEqual([drawOf('A', 'c', -600n, ['C'])]);
    expect(interestWrites({ draws, written: [], lines: new Map([['c', holding(240n, 300n)]]) })).toEqual([part('c', 'L1', 'C', -240n, true), part('c', 'L2', 'C', -300n, true)]);
  });

  it('pooled first, named later: the PLB L6 has given its 5.40 already, so the claim named later gets nothing', () => {
    const before = attribute([claim("K'", 'k', 540n)], [l6('A', 540n)]);
    expect(before.draws).toEqual([drawOf('A', 'k', 540n, ["K'"])]);
    const first = interestWrites({ draws: before.draws, written: [], lines: new Map([['k', paid("K'")]]) });
    expect(first).toEqual([part('k', 'L1', "K'", 240n, true), part('k', 'L2', "K'", 300n, true)]);
    const after = attribute([claim("K'", 'k', 540n)], [l6('A', 540n, { chain: 'z', claims: ['Z'] })]);
    expect(after.draws).toEqual([drawOf('A', 'z', 540n, ['Z'])]);
    const caseTwo: ChainInterestLines = { paid: [{ serviceLineId: 'L9', claimId: 'Z', approved: true, weightCents: cents(5000n), outOfReach: false }], takenBack: [], mayYetHold: true, unplacedCents: cents(0n) };
    expect(interestWrites({ draws: after.draws, written: first.map((item) => wrote(item.chain, item.serviceLineId, item.cents)), lines: new Map([['z', caseTwo]]) })).toEqual([]);
  });

  it('a torn read: a PLB L6 is never attributed without its own remittance’s claims (D17)', () => {
    expect(attributeInterest({ remittances: [], adjustments: [l6('A', 740n, NAMES_C)] })).toEqual({ draws: [], unattributed: [] });
    expect(attributeInterest({ remittances: [{ id: 'R', claims: [claim('C2', 'c', 540n), claim('K', 'k', 200n)] }], adjustments: [l6('A', 740n, NAMES_C)] })).toEqual({
      draws: [drawOf('A', 'c', 540n, ['C']), drawOf('A', 'k', 200n, ['K'])],
      unattributed: [],
    });
  });

  it('a renumbered reversal: the unlinked reversal is a chain of its own, so the correction draws its 5.40 again, and the reversal’s take-back, finding no line, holds it back', () => {
    const { draws } = attribute([claim("V'", 'v', -540n), claim('C2', 'c', 540n), claim('K', 'k', 200n)], [l6('A', 200n)]);
    expect(draws).toEqual([drawOf('A', 'c', 540n, ['C2']), drawOf('A', 'v', -540n, ["V'"]), drawOf('A', 'k', 200n, ['K'])]);
    // v's root is a reversal linked to no claim, so its interest may yet arrive: nothing is written (LED-23
    // renumbered-reversal.835).
    const lines = new Map<string, ChainInterestLines>([
      ['v', { paid: [], takenBack: [], mayYetHold: true, unplacedCents: cents(0n) }],
      ['c', paid('C2')],
    ]);
    expect(interestWrites({ draws, written: [], lines })).toEqual([]);
  });
});

describe('attributeInterest (D4)', () => {
  it('nets a chain’s AMT I within its remittance, and shares by chain, the chain’s claims in the remittance named', () => {
    expect(attribute([claim('C', 'c', 300n), claim('C2', 'c', 240n), claim('K', 'k', 200n)], [l6('A', 740n)])).toEqual({
      draws: [drawOf('A', 'c', 540n, ['C', 'C2']), drawOf('A', 'k', 200n, ['K'])],
      unattributed: [],
    });
  });

  it('draws a chain’s share from the pool’s PLB L6s of its own sign, in position order, up to their cash', () => {
    expect(attribute([claim('C', 'c', 540n), claim('K', 'k', 200n)], [l6('B', 300n, null, 2), l6('A', 440n, null, 1)])).toEqual({
      draws: [drawOf('A', 'c', 440n, ['C']), drawOf('B', 'c', 100n, ['C']), drawOf('B', 'k', 200n, ['K'])],
      unattributed: [],
    });
  });

  it('in the exact case draws both shortfalls from the pool’s first PLB L6 by position, which nets them', () => {
    expect(attribute([claim('K', 'k', 300n), claim('V', 'v', -300n)], [l6('B', -200n, null, 2), l6('A', 200n, null, 1)])).toEqual({
      draws: [drawOf('A', 'k', 300n, ['K']), drawOf('A', 'v', -100n, ['V']), drawOf('B', 'v', -200n, ['V'])],
      unattributed: [],
    });
  });

  it('takes both shortfalls from the first PLB L6 left in the pool, never from one a named claim used up', () => {
    // A covers C whole; B alone is the pool, and K's and V's shortfalls are drawn from it.
    expect(attribute([claim('C', 'c', 540n), claim('V', 'v', -300n), claim('K', 'k', 400n)], [l6('A', 540n, NAMES_C, 1), l6('B', 100n, null, 2)])).toEqual({
      draws: [drawOf('A', 'c', 540n, ['C']), drawOf('B', 'k', 400n, ['K']), drawOf('B', 'v', -300n, ['V'])],
      unattributed: [],
    });
    // With nothing left in the pool, chains netting to zero between them draw nothing.
    expect(attribute([claim('C', 'c', 540n), claim('K', 'k', 200n), claim('V', 'v', -200n)], [l6('A', 540n, NAMES_C)])).toEqual({ draws: [drawOf('A', 'c', 540n, ['C'])], unattributed: [] });
  });

  it('leaves a net of zero over chains that report nothing as no one’s', () => {
    expect(attribute([claim('K', 'k', 0n)], [l6('A', 200n), l6('B', -200n, null, 2)])).toEqual({
      draws: [],
      unattributed: [
        { adjustmentId: 'A', cents: 200n },
        { adjustmentId: 'B', cents: -200n },
      ],
    });
  });

  it('moves nothing when the pool nets to zero against chains that do not', () => {
    expect(attribute([claim('K', 'k', 300n)], [l6('A', 200n), l6('B', -200n, null, 2)])).toEqual({
      draws: [],
      unattributed: [
        { adjustmentId: 'A', cents: 200n },
        { adjustmentId: 'B', cents: -200n },
      ],
    });
  });

  it('shares a net take-back only among the chains reporting interest taken back', () => {
    expect(attribute([claim('V', 'v', -300n), claim('W', 'w', -100n), claim('K', 'k', 100n)], [l6('A', -200n)])).toEqual({
      draws: [drawOf('A', 'v', -150n, ['V'], true), drawOf('A', 'w', -50n, ['W'], true)],
      unattributed: [],
    });
  });

  it('gives a net above every report each its whole report, not shared, and the rest to no one', () => {
    expect(attribute([claim('C', 'c', 300n), claim('K', 'k', 200n), claim('V', 'v', -50n)], [l6('A', 600n)])).toEqual({
      draws: [drawOf('A', 'c', 300n, ['C']), drawOf('A', 'k', 200n, ['K'])],
      unattributed: [{ adjustmentId: 'A', cents: 100n }],
    });
  });

  it('flags a short pool shared only when two or more chains take a part of it', () => {
    expect(attribute([claim('C', 'c', 1000n), claim('K', 'k', 1n)], [l6('A', 1n)])).toEqual({ draws: [drawOf('A', 'c', 1n, ['C'])], unattributed: [] });
  });

  it('lets a named PLB L6 cover its claim only toward the claim’s own sign, and returns the rest to it', () => {
    // C reports 5.40 paid; the L6 naming C takes 1.00 back, so it covers nothing and joins the pool; another L6 pays
    // 6.00 naming no one. The pool nets 5.00, short of 5.40: C draws 5.00 of the paying L6, and the take-back the pool
    // left returns to C, the claim it names.
    expect(attribute([claim('C', 'c', 540n)], [l6('A', -100n, NAMES_C, 1), l6('B', 600n, null, 2)])).toEqual({
      draws: [drawOf('A', 'c', -100n, ['C']), drawOf('B', 'c', 500n, ['C'])],
      unattributed: [{ adjustmentId: 'B', cents: 100n }],
    });
  });

  it('returns a named PLB L6 the pool left to the chain it names, after the others’ shares', () => {
    expect(attribute([claim('C', 'c', 0n), claim('K', 'k', 200n)], [l6('A', 540n, NAMES_C)])).toEqual({
      draws: [drawOf('A', 'k', 200n, ['K']), drawOf('A', 'c', 340n, ['C'])],
      unattributed: [],
    });
  });

  it('lets several named PLB L6s cover one claim in position order, each only up to what it still reports', () => {
    expect(attribute([claim('C', 'c', 540n)], [l6('B', 400n, NAMES_C, 2), l6('A', 300n, NAMES_C, 1)])).toEqual({
      draws: [drawOf('A', 'c', 300n, ['C']), drawOf('B', 'c', 400n, ['C'])],
      unattributed: [],
    });
  });

  it('nets the draws of one PLB L6 to one chain into one, and leaves none of nothing', () => {
    // The named chain reports nothing and the pool goes whole to the other claim: nothing returns to the named chain.
    expect(attribute([claim('C', 'c', 0n), claim('K', 'k', 540n)], [l6('A', 540n, NAMES_C)])).toEqual({ draws: [drawOf('A', 'k', 540n, ['K'])], unattributed: [] });
    // The L6 naming C takes 3.00 back from a chain that reports 3.00 taken back, then pays nothing more.
    expect(attribute([claim('V', 'c', -300n)], [l6('A', -300n, NAMES_C)])).toEqual({ draws: [drawOf('A', 'c', -300n, ['C'])], unattributed: [] });
    // Exact: the named L6 joins the pool against its own claim's sign, draws a share back and the rest returns to it.
    expect(attribute([claim('C', 'c', 200n), claim('V', 'v', -400n)], [l6('A', -200n, NAMES_C)])).toEqual({
      draws: [drawOf('A', 'v', -400n, ['V']), drawOf('A', 'c', 200n, ['C'])],
      unattributed: [],
    });
  });

  it('attributes each remittance by its own claims, and gives a PLB L6 of a remittance not given nothing', () => {
    expect(
      attributeInterest({
        remittances: [
          { id: 'R1', claims: [claim('C', 'c', 540n)] },
          { id: 'R2', claims: [claim('K', 'k', 200n)] },
        ],
        adjustments: [l6('B', 200n, null, 1, 'R2'), l6('A', 540n, null, 1, 'R1'), l6('X', 100n, null, 1, 'R3')],
      }),
    ).toEqual({ draws: [drawOf('A', 'c', 540n, ['C']), drawOf('B', 'k', 200n, ['K'])], unattributed: [] });
  });

  it('refuses a PLB L6, a claim or a remittance given twice, which no stored row can produce', () => {
    const message = 'interest is attributed from each PLB L6, claim and remittance once';
    refuses(() => attribute([claim('C', 'c', 1n), claim('C', 'k', 1n)], []), message);
    refuses(() => attribute([], [l6('A', 1n), l6('A', 2n, null, 2)]), message);
    refuses(
      () =>
        attributeInterest({
          remittances: [
            { id: 'R', claims: [] },
            { id: 'R', claims: [] },
          ],
          adjustments: [],
        }),
      message,
    );
    refuses(
      () =>
        attributeInterest({
          remittances: [
            { id: 'R1', claims: [claim('C', 'c', 1n)] },
            { id: 'R2', claims: [claim('C', 'c', 1n)] },
          ],
          adjustments: [],
        }),
      message,
    );
    // A claim, an L6 and a remittance may share an identifier: each is checked among its own kind.
    expect(attributeInterest({ remittances: [{ id: 'X', claims: [claim('X', 'c', 540n)] }], adjustments: [l6('X', 540n, null, 1, 'X')] }).draws).toEqual([drawOf('X', 'c', 540n, ['X'])]);
  });
});

describe('interestWrites (D5, D6, D10)', () => {
  it('writes nothing without draws, or for a chain with no lines', () => {
    expect(interestWrites({ draws: [], written: [], lines: new Map([['c', paid()]]) })).toEqual([]);
    expect(interestWrites({ draws: [drawOf('A', 'c', 540n, ['C'])], written: [], lines: new Map([['k', paid('C')]]) })).toEqual([]);
    expect(interestWrites({ draws: [drawOf('A', 'c', -540n, ['C'])], written: [], lines: new Map([['c', paid()]]) })).toEqual([]);
    expect(interestWrites({ draws: [drawOf('A', 'c', 540n, ['C'])], written: [], lines: new Map([['c', holding(240n, 300n)]]) })).toEqual([]);
  });

  it('pays only lines matched to a claim the draw is for, the approved ones when there are any', () => {
    const mixed: ChainInterestLines = {
      paid: [
        { serviceLineId: 'L1', claimId: 'C', approved: false, weightCents: cents(2400n), outOfReach: false },
        { serviceLineId: 'L2', claimId: 'C', approved: true, weightCents: cents(3000n), outOfReach: false },
        { serviceLineId: 'L3', claimId: 'K', approved: true, weightCents: cents(9000n), outOfReach: false },
      ],
      takenBack: [],
      mayYetHold: true,
      unplacedCents: cents(0n),
    };
    expect(interestWrites({ draws: [drawOf('A', 'c', 540n, ['C'])], written: [], lines: new Map([['c', mixed]]) })).toEqual([part('c', 'L2', 'C', 540n, false)]);
    // A restatement matched "no change" on both lines: every such line.
    expect(interestWrites({ draws: [drawOf('A', 'c', 540n, ['C'])], written: [], lines: new Map([['c', paid('C', [2400n, 3000n], false)]]) })).toEqual([
      part('c', 'L1', 'C', 240n, true),
      part('c', 'L2', 'C', 300n, true),
    ]);
    expect(interestWrites({ draws: [drawOf('A', 'c', 540n, ['K'])], written: [], lines: new Map([['c', paid()]]) })).toEqual([]);
  });

  it('chooses the approved lines before leaving out those the PLB L6 already reached', () => {
    const mixed: ChainInterestLines = {
      paid: [
        { serviceLineId: 'L1', claimId: 'C', approved: true, weightCents: cents(2400n), outOfReach: false },
        { serviceLineId: 'L2', claimId: 'C', approved: false, weightCents: cents(3000n), outOfReach: false },
      ],
      takenBack: [],
      mayYetHold: true,
      unplacedCents: cents(0n),
    };
    expect(interestWrites({ draws: [drawOf('A', 'c', 540n, ['C'])], written: [wrote('c', 'L1', 100n)], lines: new Map([['c', mixed]]) })).toEqual([]);
  });

  it('splits what is left over the lines not yet matched to the PLB L6', () => {
    expect(interestWrites({ draws: [drawOf('A', 'c', 540n, ['C'])], written: [wrote('c', 'L1', 240n)], lines: new Map([['c', paid()]]) })).toEqual([part('c', 'L2', 'C', 300n, false)]);
  });

  it('writes nothing while every line’s weight is zero', () => {
    expect(interestWrites({ draws: [drawOf('A', 'c', 540n, ['C'])], written: [], lines: new Map([['c', paid('C', [0n, 0n])]]) })).toEqual([]);
    expect(interestWrites({ draws: [drawOf('A', 'c', -540n, ['C'])], written: [], lines: new Map([['c', holding(0n, -30n)]]) })).toEqual([]);
  });

  it('caps each sign by what the PLB L6’s draws of that sign leave, gross, shared in draw order', () => {
    // The attribution moved from chain x, which was given 5.40: 7.40 of draws leave 2.00.
    expect(interestWrites({ draws: [drawOf('A', 'c', 540n, ['C']), drawOf('A', 'k', 200n, ['K'])], written: [wrote('x', 'L9', 540n)], lines: new Map([['c', paid()], ['k', paid('K', [2400n, 3000n], true, ['L3', 'L4'])]]) })).toEqual([
      part('c', 'L1', 'C', 89n, true),
      part('c', 'L2', 'C', 111n, true),
    ]);
    // An entry of an old match that names no claim counts toward its sign.
    expect(interestWrites({ draws: [drawOf('A', 'c', 540n, ['C'])], written: [wrote(null, 'L9', 300n)], lines: new Map([['c', paid()]]) })).toEqual([part('c', 'L1', 'C', 107n, true), part('c', 'L2', 'C', 133n, true)]);
    // A reversed entry still counts: a person's reversal is final.
    expect(interestWrites({ draws: [drawOf('A', 'c', -540n, ['C'])], written: [wrote('c', 'L1', -240n), wrote('c', 'L9', -300n)], lines: new Map([['c', holding(240n, 300n)]]) })).toEqual([]);
  });

  it('caps each chain by what the PLB L6 already gave that chain of the draw’s sign', () => {
    expect(interestWrites({ draws: [drawOf('A', 'c', 540n, ['C'])], written: [wrote('c', 'L1', -100n)], lines: new Map([['c', paid()]]) })).toEqual([part('c', 'L2', 'C', 540n, false)]);
    // 10.40 drawn and 4.40 written leave 6.00 paid; c has been given 1.40 of its 5.40 (its take-back of 1.00 apart), k 3.00 of its 5.00.
    expect(
      interestWrites({
        draws: [drawOf('A', 'c', 540n, ['C']), drawOf('A', 'k', 500n, ['K'])],
        written: [wrote('c', 'L5', 140n), wrote('k', 'L6', 300n), wrote('c', 'L7', -100n)],
        lines: new Map([['c', paid()], ['k', paid('K', [2400n, 3000n], true, ['L3', 'L4'])]]),
      }),
    ).toEqual([part('c', 'L1', 'C', 178n, true), part('c', 'L2', 'C', 222n, true), part('k', 'L3', 'K', 89n, true), part('k', 'L4', 'K', 111n, true)]);
  });

  it('takes back at most what the lines hold of the chain, a holding below zero counting as zero', () => {
    expect(interestWrites({ draws: [drawOf('A', 'c', -540n, ['C'])], written: [], lines: new Map([['c', holding(-50n, 300n)]]) })).toEqual([part('c', 'L2', 'C', -300n, false)]);
    expect(interestWrites({ draws: [drawOf('A', 'c', -100n, ['C'])], written: [], lines: new Map([['c', holding(240n, 300n)]]) })).toEqual([part('c', 'L1', 'C', -44n, true), part('c', 'L2', 'C', -56n, true)]);
    expect(interestWrites({ draws: [drawOf('A', 'c', -540n, ['C'])], written: [wrote('c', 'L1', -240n)], lines: new Map([['c', holding(0n, 300n)]]) })).toEqual([part('c', 'L2', 'C', -300n, false)]);
  });

  it('reaches a line once per PLB L6, even when two chains’ lists hold it', () => {
    const lines = new Map<string, ChainInterestLines>([
      ['c', { paid: [{ serviceLineId: 'L1', claimId: 'C', approved: true, weightCents: cents(2400n), outOfReach: false }], takenBack: [], mayYetHold: true, unplacedCents: cents(0n) }],
      [
        'k',
        {
          paid: [
            { serviceLineId: 'L1', claimId: 'K', approved: true, weightCents: cents(2400n), outOfReach: false },
            { serviceLineId: 'L2', claimId: 'K', approved: true, weightCents: cents(0n), outOfReach: false },
          ],
          takenBack: [],
          mayYetHold: true,
          unplacedCents: cents(0n),
        },
      ],
    ]);
    expect(interestWrites({ draws: [drawOf('A', 'c', 300n, ['C']), drawOf('A', 'k', 200n, ['K'])], written: [], lines })).toEqual([part('c', 'L1', 'C', 300n, false)]);
  });

  it('writes a PLB L6’s take-backs before its payments, so a payment reaches the lines they left and two chains meeting on a line err low (LED-24 two-chains.835)', () => {
    // b's payment could reach both lines; a's take-back only the lines holding a's interest.
    const lines = (held: ChainInterestLines['takenBack']) =>
      new Map<string, ChainInterestLines>([
        ['a', { paid: [], takenBack: held, mayYetHold: true, unplacedCents: cents(0n) }],
        ['b', paid('B', [2400n, 3000n], false)],
      ]);
    for (const draws of [
      [drawOf('A', 'b', 600n, ['B']), drawOf('A', 'a', -540n, ['V'])],
      [drawOf('A', 'a', -540n, ['V']), drawOf('A', 'b', 600n, ['B'])],
    ]) {
      // Both lines hold a's interest: its take-back is written there, and b's payment, which only they could take, is not.
      expect(interestWrites({ draws, written: [], lines: lines(holding(240n, 300n).takenBack) })).toEqual([part('a', 'L1', 'C', -240n, true), part('a', 'L2', 'C', -300n, true)]);
      // Only line 1 holds it: b's whole payment goes to line 2.
      expect(interestWrites({ draws, written: [], lines: lines(holding(540n, 0n).takenBack.slice(0, 1)) })).toEqual([part('a', 'L1', 'C', -540n, false), part('b', 'L2', 'B', 600n, false)]);
    }
    // Two take-backs, then two payments, each sign in draw order.
    const four = new Map<string, ChainInterestLines>([
      ['a', { paid: [], takenBack: holding(100n, 0n).takenBack.slice(0, 1), mayYetHold: true, unplacedCents: cents(0n) }],
      ['c', { paid: [], takenBack: [{ serviceLineId: 'L3', claimId: 'K', heldCents: cents(50n) }], mayYetHold: true, unplacedCents: cents(0n) }],
      ['b', { paid: [{ serviceLineId: 'L4', claimId: 'B', approved: true, weightCents: cents(1n), outOfReach: false }], takenBack: [], mayYetHold: true, unplacedCents: cents(0n) }],
      ['k', { paid: [{ serviceLineId: 'L5', claimId: 'K', approved: true, weightCents: cents(1n), outOfReach: false }], takenBack: [], mayYetHold: true, unplacedCents: cents(0n) }],
    ]);
    expect(interestWrites({ draws: [drawOf('A', 'b', 70n, ['B']), drawOf('A', 'a', -100n, ['V']), drawOf('A', 'k', 30n, ['K']), drawOf('A', 'c', -50n, ['K'])], written: [], lines: four })).toEqual([
      part('a', 'L1', 'C', -100n, false),
      part('c', 'L3', 'K', -50n, false),
      part('b', 'L4', 'B', 70n, false),
      part('k', 'L5', 'K', 30n, false),
    ]);
  });

  it('writes each draw under its own sign only: a paying chain whose lines hold its interest is never taken back from by another chain’s take-back', () => {
    // c is paid 5.40 and its line L7 holds 2.00 of c's interest; a takes back 1.00 from L3. Only a's take-back is a take-back.
    const lines = new Map<string, ChainInterestLines>([
      ['c', { paid: paid().paid, takenBack: [{ serviceLineId: 'L7', claimId: 'C', heldCents: cents(200n) }], mayYetHold: true, unplacedCents: cents(0n) }],
      ['a', { paid: [], takenBack: [{ serviceLineId: 'L3', claimId: 'K', heldCents: cents(100n) }], mayYetHold: true, unplacedCents: cents(0n) }],
    ]);
    for (const draws of [
      [drawOf('A', 'c', 540n, ['C']), drawOf('A', 'a', -100n, ['V'])],
      [drawOf('A', 'a', -100n, ['V']), drawOf('A', 'c', 540n, ['C'])],
    ]) {
      expect(interestWrites({ draws, written: [], lines })).toEqual([part('a', 'L3', 'K', -100n, false), part('c', 'L1', 'C', 240n, true), part('c', 'L2', 'C', 300n, true)]);
    }
  });

  describe('holds a PLB L6’s payments while a take-back of a chain that may yet hold interest is not written whole (PR 126 review F1)', () => {
    // LED-24 two-chains.835 uploaded before paired.835: b is paid 6.00 and a, C's reversal, takes 5.40 back.
    const draws = [drawOf('A', 'b', 600n, ['B']), drawOf('A', 'a', -540n, ['V'])];
    const lines = (held: ChainInterestLines['takenBack'], mayYetHold = true) =>
      new Map<string, ChainInterestLines>([
        ['a', { paid: [], takenBack: held, mayYetHold, unplacedCents: cents(0n) }],
        ['b', paid('B', [2400n, 3000n], false)],
      ]);
    const asWritten = (parts: readonly InterestPart[]) => parts.map((item) => wrote(item.chain, item.serviceLineId, item.cents));

    it('writes nothing while the take-back finds no line, then takes back the interest that arrives, so the order of uploads changes nothing', () => {
      // Reconcile 1: a's reversal reverses a claim not yet uploaded, so a holds nothing; b's payment waits.
      expect(interestWrites({ draws, written: [], lines: lines([]) })).toEqual([]);
      // Reconcile 2: paired.835's 5.40 of a's interest is on both lines: taken back, and b's payment, which only they
      // could take, is not written, exactly as when paired.835 is uploaded first.
      const second = interestWrites({ draws, written: [], lines: lines(holding(240n, 300n).takenBack) });
      expect(second).toEqual([part('a', 'L1', 'C', -240n, true), part('a', 'L2', 'C', -300n, true)]);
      // Reconcile 3: the take-back is whole and b's lines are reached: nothing more.
      expect(interestWrites({ draws, written: asWritten(second), lines: lines(holding(0n, 0n).takenBack) })).toEqual([]);
    });

    it('holds them while the take-back is cut to what the lines hold, until the rest is taken back', () => {
      // a holds 1.00 on line 1 only: 1.00 is taken back there and 4.40 is still owed, so b's payment waits.
      const first = interestWrites({ draws, written: [], lines: lines(holding(100n, 0n).takenBack) });
      expect(first).toEqual([part('a', 'L1', 'C', -100n, false)]);
      // a's other 4.40 arrives on line 2: taken back there, and b's payment finds no line the L6 has not reached.
      const second = interestWrites({ draws, written: asWritten(first), lines: lines(holding(0n, 440n).takenBack) });
      expect(second).toEqual([part('a', 'L2', 'C', -440n, false)]);
      expect(interestWrites({ draws, written: asWritten([...first, ...second]), lines: lines(holding(0n, 0n).takenBack) })).toEqual([]);
    });

    it('holds nothing back for a take-back written whole, owed no more, or of a chain that can come to hold no interest on a case line', () => {
      // Written whole on line 1: b's payment goes to line 2.
      expect(interestWrites({ draws, written: [], lines: lines(holding(540n, 0n).takenBack.slice(0, 1)) })).toEqual([part('a', 'L1', 'C', -540n, false), part('b', 'L2', 'B', 600n, false)]);
      // The L6's draws of that sign already spent on another chain: nothing of the take-back is owed.
      expect(interestWrites({ draws, written: [wrote('x', 'L9', -540n)], lines: lines([]) })).toEqual([part('b', 'L1', 'B', 267n, true), part('b', 'L2', 'B', 333n, true)]);
      // A chain on no case line (both-ways.835's mirror): b's payment is written beside the take-back, missing or cut.
      expect(interestWrites({ draws, written: [], lines: lines([], false) })).toEqual([part('b', 'L1', 'B', 267n, true), part('b', 'L2', 'B', 333n, true)]);
      expect(interestWrites({ draws, written: [], lines: lines(holding(100n, 0n).takenBack, false) })).toEqual([part('a', 'L1', 'C', -100n, false), part('b', 'L2', 'B', 600n, false)]);
    });

    it('counts the take-back whole once the rest of what it owes is interest other PLB L6s paid the chain that can reach no line, so the outcome is the one uploaded in order (PR 126 review R2M2-1)', () => {
      // LED-24 netted-elsewhere.835 between partly-paid.835 and rest-paid.835: Z paid a 1.00 on lines 1 and 2, Y pays
      // it 4.40 later, and X takes 5.40 back and pays b, another patient's claim on line 3.
      const elsewhere = (held: ChainInterestLines['takenBack'], unplaced: bigint) =>
        new Map<string, ChainInterestLines>([
          ['a', { paid: [], takenBack: held, mayYetHold: true, unplacedCents: cents(unplaced) }],
          ['b', { paid: [{ serviceLineId: 'L3', claimId: 'B', approved: true, weightCents: cents(2400n), outOfReach: false }], takenBack: [], mayYetHold: true, unplacedCents: cents(0n) }],
        ]);
      // Reconcile 1, Y not uploaded: Z's 1.00 is taken back and 4.40 is still owed, so b's payment waits.
      const first = interestWrites({ draws, written: [], lines: elsewhere(holding(44n, 56n).takenBack, 0n) });
      expect(first).toEqual([part('a', 'L1', 'C', -44n, true), part('a', 'L2', 'C', -56n, true)]);
      // Reconcile 2: Y's 4.40 can go to neither line (X has reached both, and nothing remains on them). The rest of the
      // take-back is interest credited nowhere, so b's payment is written, as when Y is uploaded before X.
      expect(interestWrites({ draws, written: asWritten(first), lines: elsewhere([], 440n) })).toEqual([part('b', 'L3', 'B', 600n, false)]);
      // Short of it by a cent, the take-back still waits.
      expect(interestWrites({ draws, written: asWritten(first), lines: elsewhere([], 439n) })).toEqual([]);
      // X and Y in one reconcile: the 1.00 held is taken back and b's payment is written beside it.
      expect(interestWrites({ draws, written: [], lines: elsewhere(holding(44n, 56n).takenBack, 440n) })).toEqual([
        part('a', 'L1', 'C', -44n, true),
        part('a', 'L2', 'C', -56n, true),
        part('b', 'L3', 'B', 600n, false),
      ]);
      // What can reach no line never adds to a take-back: only the 1.00 held is taken back.
      expect(interestWrites({ draws, written: [], lines: elsewhere(holding(44n, 56n).takenBack, 9000n) }).filter((item) => item.chain === 'a')).toEqual(first);
    });
  });

  it('splits a payment over every line it is for, a line kept off it among them, and writes only the shares of the lines in its reach (PR 126 review RV-DB2-1)', () => {
    const line = (serviceLineId: string, approved: boolean, weight: bigint, outOfReach: boolean) => ({ serviceLineId, claimId: 'C', approved, weightCents: cents(weight), outOfReach });
    const write = (paidLines: ChainInterestLines['paid']) =>
      interestWrites({ draws: [drawOf('Y', 'c', 440n, ['C'])], written: [], lines: new Map([['c', { paid: paidLines, takenBack: [], mayYetHold: true, unplacedCents: cents(0n) }]]) });
    // Line 1, approved, kept off: the payment never moves to line 2, which its claim left as it was and where it would
    // not have gone uploaded in order.
    expect(write([line('L1', true, 2400n, true), line('L2', false, 3000n, false)])).toEqual([]);
    // Both approved, line 1 kept off: line 2 takes its own share, 2.44, a part of a split; line 1's 1.96 goes nowhere.
    expect(write([line('L1', true, 2400n, true), line('L2', true, 3000n, false)])).toEqual([part('c', 'L2', 'C', 244n, true)]);
    // Every line kept off: nothing.
    expect(write([line('L1', true, 2400n, true), line('L2', true, 3000n, true)])).toEqual([]);
    // The share of a line kept off is not spent: a later payment of the same PLB L6 can still take it.
    expect(
      interestWrites({
        draws: [drawOf('Y', 'c', 440n, ['C']), drawOf('Y', 'k', 100n, ['K'])],
        written: [wrote('x', 'L9', 440n)],
        lines: new Map<string, ChainInterestLines>([
          ['c', { paid: [line('L1', true, 2400n, true), line('L2', true, 3000n, false)], takenBack: [], mayYetHold: true, unplacedCents: cents(0n) }],
          ['k', { paid: [{ serviceLineId: 'L3', claimId: 'K', approved: true, weightCents: cents(1n), outOfReach: false }], takenBack: [], mayYetHold: true, unplacedCents: cents(0n) }],
        ]),
      }),
    ).toEqual([part('c', 'L2', 'C', 56n, true), part('k', 'L3', 'K', 44n, false)]);
  });

  it('flags a part allocated when its draw was a share of a short pool or two or more lines took a part', () => {
    expect(interestWrites({ draws: [drawOf('A', 'c', 365n, ['C'], true)], written: [], lines: new Map([['c', paid('C', [2400n, 0n])]]) })).toEqual([part('c', 'L1', 'C', 365n, true)]);
    expect(interestWrites({ draws: [drawOf('A', 'c', 1n, ['C'])], written: [], lines: new Map([['c', paid()]]) })).toEqual([part('c', 'L2', 'C', 1n, false)]);
  });

  it('refuses inputs no stored row can produce', () => {
    refuses(() => interestWrites({ draws: [drawOf('A', 'c', 1n, ['C']), drawOf('B', 'k', 1n, ['K'])], written: [], lines: new Map() }), "interest is written from one PLB L6's draws, each chain once");
    refuses(() => interestWrites({ draws: [drawOf('A', 'c', 1n, ['C']), drawOf('A', 'c', -1n, ['C'])], written: [], lines: new Map() }), "interest is written from one PLB L6's draws, each chain once");
    const twice = (lines: ChainInterestLines) => () => interestWrites({ draws: [drawOf('A', 'c', 1n, ['C'])], written: [], lines: new Map([['k', lines]]) });
    refuses(twice({ paid: [...paid().paid, ...paid().paid.slice(1)], takenBack: [], mayYetHold: true, unplacedCents: cents(0n) }), "interest reaches a line once in each chain's list");
    refuses(twice({ paid: [], takenBack: [...holding(1n, 1n).takenBack, ...holding(1n, 1n).takenBack.slice(0, 1)], mayYetHold: true, unplacedCents: cents(0n) }), "interest reaches a line once in each chain's list");
    refuses(twice(paid('C', [2400n, -1n])), 'interest is split by approvals remaining of zero or more');
    // The same line in a chain's paid and take-back lists, or in two chains' lists, is not a repeat.
    expect(interestWrites({ draws: [drawOf('A', 'c', 540n, ['C'])], written: [], lines: new Map([['c', { paid: paid().paid, takenBack: holding(1n, 1n).takenBack, mayYetHold: true, unplacedCents: cents(0n) }], ['k', paid()]]) })).toHaveLength(2);
  });
});

describe('interestOutOfReach: where a payment of a chain must not go (PR 126 review MONEY-R4-1)', () => {
  // LED-24 unplaced-two-chains.835: X pays b 6.00 and takes 5.40 back from a, whose claim C is on no case line yet.
  const draws = [drawOf('X', 'b', 600n, ['B']), drawOf('X', 'a', -540n, ['V'])];
  const asWritten = (parts: readonly InterestPart[]) => parts.map((item) => wrote(item.chain, item.serviceLineId, item.cents));

  it('names, for each chain the PLB L6 still owes a take-back of, every line it has an entry on, in the order it first reached them', () => {
    // b's 6.00 written on both lines while a held nothing: all of a's 5.40 is owed, and X never writes on those lines again.
    expect(interestOutOfReach({ draws, written: [wrote('b', 'L2', 333n), wrote('b', 'L1', 267n)] })).toEqual(new Map([['a', ['L2', 'L1']]]));
    // 1.00 of a taken back on line 3 and an entry of a match naming no claim on line 1: 4.40 is still owed.
    expect(interestOutOfReach({ draws, written: [wrote('a', 'L3', -100n), wrote(null, 'L1', 50n), wrote('a', 'L3', -100n)] })).toEqual(new Map([['a', ['L3', 'L1']]]));
    // Interest X once paid a, under an earlier attribution, takes nothing back.
    expect(interestOutOfReach({ draws, written: [wrote('a', 'L4', 540n)] })).toEqual(new Map([['a', ['L4']]]));
    // X has written nothing: no line is out of its reach.
    expect(interestOutOfReach({ draws, written: [] })).toEqual(new Map([['a', []]]));
  });

  it('names none for a take-back written whole, one owed no more because the L6’s take-backs are spent, or a payment', () => {
    expect(interestOutOfReach({ draws, written: [wrote('a', 'L1', -240n), wrote('a', 'L2', -300n)] })).toEqual(new Map());
    expect(interestOutOfReach({ draws, written: [wrote('x', 'L9', -540n)] })).toEqual(new Map());
    expect(interestOutOfReach({ draws: [drawOf('X', 'b', 600n, ['B'])], written: [wrote('b', 'L1', 267n), wrote('b', 'L2', 333n)] })).toEqual(new Map());
  });

  it('keeps a later payment of the chain off those lines, so a person’s match by hand after the netting PLB L6 moves nothing: the figure stays the cash', () => {
    // X wrote b's 6.00 on both lines while a was on no case line, so a could come to hold no interest there and nothing waited.
    const x = interestWrites({ draws, written: [], lines: new Map([['a', { paid: [], takenBack: [], mayYetHold: false, unplacedCents: cents(0n) }], ['b', paid('B', [2400n, 3000n])]]) });
    expect(x).toEqual([part('b', 'L1', 'B', 267n, true), part('b', 'L2', 'B', 333n, true)]);
    // A person matches C to both lines: Y's 5.40 for a would land where X can no longer take it back, so it goes nowhere.
    const y = [drawOf('Y', 'a', 540n, ['C'])];
    const out = interestOutOfReach({ draws, written: asWritten(x) }).get('a') ?? [];
    const kept = (lines: ChainInterestLines): ChainInterestLines => ({ ...lines, paid: lines.paid.map((line) => ({ ...line, outOfReach: out.includes(line.serviceLineId) })) });
    expect(interestWrites({ draws: y, written: [], lines: new Map([['a', kept(paid('C'))]]) })).toEqual([]);
    // Matched to a line X has not reached as well, Y pays that line its share of the 5.40 (PR 126 review RV-DB2-1), and
    // X takes it back there.
    const third = { serviceLineId: 'L3', claimId: 'C', approved: true, weightCents: cents(1000n), outOfReach: false };
    const withThird = kept({ ...paid('C'), paid: [...paid('C').paid, third] });
    const paidThere = interestWrites({ draws: y, written: [], lines: new Map([['a', withThird]]) });
    expect(paidThere).toEqual([part('a', 'L3', 'C', 84n, true)]);
    const back = interestWrites({ draws, written: asWritten(x), lines: new Map([['a', { paid: [], takenBack: [{ serviceLineId: 'L3', claimId: 'C', heldCents: cents(84n) }], mayYetHold: true, unplacedCents: cents(0n) }], ['b', paid('B')]]) });
    expect(back).toEqual([part('a', 'L3', 'C', -84n, false)]);
    // The shares of the lines X reached, 4.56, go nowhere, so X still keeps a's payments off its lines; they are interest
    // credited nowhere, and what X still owes of the take-back is no more (PR 126 review R2M2-1). The figure is the cash.
    expect(interestOutOfReach({ draws, written: [...asWritten(x), ...asWritten(back)] })).toEqual(new Map([['a', ['L1', 'L2', 'L3']]]));
    expect(interestUnplaced({ chain: 'a', payments: [{ draws: y, written: asWritten(paidThere), paid: withThird.paid }], takeBacks: [] })).toBe(456n);
    expect([...x, ...paidThere, ...back].reduce((sum, item) => sum + item.cents, 0n)).toBe(600n);
  });
});

describe('interestUnplaced: what of a chain’s interest other PLB L6s pay and can pay to no line (PR 126 review R2M2-1)', () => {
  // LED-24 rest-paid.835: Y pays chain a 4.40 on the lines its claim C is matched to, weights 24.00 and 30.00.
  const y = [drawOf('Y', 'a', 440n, ['C'])];
  const line = (serviceLineId: string, weight: bigint, outOfReach: boolean, approved = true) => ({ serviceLineId, claimId: 'C', approved, weightCents: cents(weight), outOfReach });
  const unplaced = (paidLines: ChainInterestLines['paid'], written: InterestWritten[] = [], draws: InterestDraw[] = y, takeBacks: Parameters<typeof interestUnplaced>[0]['takeBacks'] = []) =>
    interestUnplaced({ chain: 'a', payments: [{ draws, written, paid: paidLines }], takeBacks });

  it('counts what a PLB L6 still owes its payment of the chain when no line of it has a weight, or the share each line kept off it would take', () => {
    // Both lines kept off by the netting PLB L6, or nothing remaining on them once its reversal recouped them, or none.
    expect(unplaced([line('L1', 2400n, true), line('L2', 3000n, true)])).toBe(440n);
    expect(unplaced([line('L1', 0n, false), line('L2', 0n, false)])).toBe(440n);
    expect(unplaced([])).toBe(440n);
    // Line 1 kept off: its share, 1.96; line 2's 2.44 can be written there, so it is not counted.
    expect(unplaced([line('L1', 2400n, true), line('L2', 3000n, false)])).toBe(196n);
    // The approved line kept off and the other left as it was: the payment never moves there, so all of it.
    expect(unplaced([line('L1', 2400n, true), line('L2', 3000n, false, false)])).toBe(440n);
    // Every line in its reach: the payment can be written, so nothing.
    expect(unplaced([line('L1', 2400n, false), line('L2', 3000n, false)])).toBe(0n);
    // Lines matched only to another claim of the chain than the one the PLB L6 is for are not its lines.
    expect(unplaced([{ ...line('L1', 2400n, false), claimId: 'C0' }])).toBe(440n);
  });

  it('counts only what the PLB L6 still owes the chain: nothing of a payment written, and within what its draws of that sign leave once its other payments are written', () => {
    expect(unplaced([line('L1', 2400n, true), line('L2', 3000n, true)], [wrote('a', 'L1', 196n), wrote('a', 'L2', 244n)])).toBe(0n);
    // Written on line 2 already: the rest, line 1's share, is still owed and can go nowhere.
    expect(unplaced([line('L1', 2400n, true), line('L2', 3000n, false)], [wrote('a', 'L2', 244n)])).toBe(196n);
    // The attribution moved: Y gave chain x 4.40, and its draws (a 4.40, k 1.00) leave 1.00, which its payment to k may take.
    const moved = [drawOf('Y', 'a', 440n, ['C']), drawOf('Y', 'k', 100n, ['K'])];
    expect(unplaced([line('L1', 2400n, true)], [wrote('x', 'L9', 440n)], moved)).toBe(0n);
    expect(unplaced([line('L1', 2400n, true)], [wrote('x', 'L9', 400n)], moved)).toBe(40n);
    expect(unplaced([line('L1', 2400n, true)], [wrote('x', 'L9', 340n), wrote('k', 'L3', 100n)], moved)).toBe(100n);
    // Its take-back of another chain leaves its payment whole.
    expect(unplaced([line('L1', 2400n, true)], [], [drawOf('Y', 'a', 440n, ['C']), drawOf('Y', 'k', -100n, ['K'])])).toBe(440n);
    // A PLB L6 that pays the chain nothing, or takes interest back from it, adds nothing.
    expect(unplaced([line('L1', 2400n, true)], [], [drawOf('Y', 'k', 440n, ['K'])])).toBe(0n);
    expect(unplaced([line('L1', 2400n, true)], [], [drawOf('Y', 'a', -440n, ['C'])])).toBe(0n);
  });

  it('adds every other PLB L6’s payment of the chain and takes away what other PLB L6s still owe of take-backs of it, never below zero', () => {
    const offBoth = [line('L1', 2400n, true), line('L2', 3000n, true)];
    const z = { draws: [drawOf('Z', 'a', 100n, ['C'])], written: [], paid: offBoth };
    expect(interestUnplaced({ chain: 'a', payments: [{ draws: y, written: [], paid: offBoth }, z], takeBacks: [] })).toBe(540n);
    // Another take-back of the chain still owes 2.00 of its 3.00 (1.00 written): 5.40 less 2.00.
    const other = { draws: [drawOf('W', 'k', 50n, ['K']), drawOf('W', 'a', -300n, ['V'])], written: [wrote('a', 'L4', -100n)] };
    expect(interestUnplaced({ chain: 'a', payments: [{ draws: y, written: [], paid: offBoth }, z], takeBacks: [other] })).toBe(340n);
    // Written whole, it owes nothing; owing past what is unplaced, nothing is left.
    expect(interestUnplaced({ chain: 'a', payments: [z], takeBacks: [{ ...other, written: [wrote('a', 'L4', -300n)] }] })).toBe(100n);
    expect(interestUnplaced({ chain: 'a', payments: [z], takeBacks: [other] })).toBe(0n);
    // A PLB L6 that takes nothing back from the chain takes nothing away, even one that pays it while it takes back from
    // another chain.
    expect(interestUnplaced({ chain: 'a', payments: [z], takeBacks: [{ draws: [drawOf('W', 'k', -300n, ['K'])], written: [] }] })).toBe(100n);
    expect(interestUnplaced({ chain: 'a', payments: [z], takeBacks: [{ draws: [drawOf('W', 'a', 300n, ['C']), drawOf('W', 'k', -300n, ['K'])], written: [] }] })).toBe(100n);
    expect(interestUnplaced({ chain: 'a', payments: [], takeBacks: [] })).toBe(0n);
  });
});

describe('interestHeld (D5)', () => {
  const entry = (id: string, matchId: string, serviceLineId: string | null, stage: MatchedLedgerEntry['stage'], amount: bigint, evidenceId = 'L6'): MatchedLedgerEntry => ({
    id,
    caseId: 'case-1',
    serviceLineId,
    stage,
    amountCents: cents(amount),
    evidenceKind: stage === 'interest' ? 'provider_adjustment' : stage === 'approved' ? 'claim' : 'ledger_entry',
    evidenceId,
    allocated: false,
    effectiveOn: '2026-06-08',
    matchId,
  });

  it('nets what each line holds of each chain, chain by chain, through its corrections and take-backs, floored at zero', () => {
    const entries = [
      entry('e1', 'm1', 'L1', 'interest', 240n),
      entry('e2', 'm2', 'L2', 'interest', 300n),
      entry('e3', 'm3', 'L1', 'interest', -240n),
      entry('e4', 'm2', 'L2', 'adjusted', -100n, 'e2'),
      entry('e5', 'm4', 'L1', 'interest', 50n),
      entry('e6', 'm5', 'L1', 'approved', 2400n, 'C'),
      entry('e7', 'm6', 'L1', 'interest', 70n),
      entry('e8', 'm7', 'L3', 'interest', 100n),
      entry('e9', 'm8', 'L3', 'interest', -100n),
      entry('e10', 'm7', 'L3', 'adjusted', -50n, 'e8'),
      entry('e11', 'm7', 'L3', 'reversed', 50n, 'e10'),
      entry('e12', 'm7', 'L3', 'adjusted', -30n, 'e8'),
      entry('e13', 'm9', null, 'interest', 90n),
    ];
    const chains = new Map([
      ['m1', 'c'],
      ['m2', 'c'],
      ['m3', 'c'],
      ['m4', 'k'],
      ['m5', 'c'],
      ['m7', 'c'],
      ['m8', 'c'],
      ['m9', 'c'],
    ]);
    expect(interestHeld(entries, chains)).toEqual([
      { chain: 'c', serviceLineId: 'L1', heldCents: 0n },
      { chain: 'c', serviceLineId: 'L2', heldCents: 200n },
      { chain: 'c', serviceLineId: 'L3', heldCents: 0n },
      { chain: 'k', serviceLineId: 'L1', heldCents: 50n },
    ]);
  });

  /** The sums as arrays, so their order is compared too. */
  const ordered = (sums: InterestHeldSums) => [...sums].map(([chain, ofChain]) => [chain, [...ofChain]] as const);

  it('keeps the sums before the floor, each chain and line in the order the entries first reach it, and adds entries in parts as in one (PR 126 review F-M2-2)', () => {
    const entries = [
      entry('e1', 'm1', 'L1', 'interest', 240n),
      entry('e2', 'm2', 'L2', 'interest', 300n),
      entry('e3', 'm4', 'L1', 'interest', 50n),
      entry('e4', 'm2', 'L2', 'adjusted', -100n, 'e2'),
      entry('e5', 'm3', 'L3', 'interest', 100n),
      entry('e6', 'm3', 'L3', 'adjusted', -130n, 'e5'),
      entry('e7', 'm5', 'L1', 'interest', 70n),
    ];
    const chains = new Map([
      ['m1', 'c'],
      ['m2', 'c'],
      ['m3', 'c'],
      ['m4', 'k'],
    ]);
    const whole: InterestHeldSums = new Map();
    addInterestHeld(whole, entries, chains);
    const sums = [
      ['c', [['L1', 240n], ['L2', 200n], ['L3', -30n]]],
      ['k', [['L1', 50n]]],
    ];
    expect(ordered(whole)).toEqual(sums);
    // In parts, each correction with the entry it corrects: the same sums in the same order.
    const parts: InterestHeldSums = new Map();
    for (const part of [entries.slice(0, 1), entries.slice(1, 4), entries.slice(4)]) {
      addInterestHeld(parts, part, chains);
    }
    expect(ordered(parts)).toEqual(sums);
    // Read floored, chain by chain or line by line; a chain or line holding nothing holds zero.
    expect(interestHeldOf(whole, 'c')).toEqual([
      { chain: 'c', serviceLineId: 'L1', heldCents: 240n },
      { chain: 'c', serviceLineId: 'L2', heldCents: 200n },
      { chain: 'c', serviceLineId: 'L3', heldCents: 0n },
    ]);
    expect(interestHeldOf(whole, 'x')).toEqual([]);
    expect([interestHeldOn(whole, 'c', 'L2'), interestHeldOn(whole, 'c', 'L3'), interestHeldOn(whole, 'k', 'L1'), interestHeldOn(whole, 'k', 'L2'), interestHeldOn(whole, 'x', 'L1')]).toEqual([200n, 0n, 50n, 0n, 0n]);
    expect(interestHeld(entries, chains)).toEqual([...interestHeldOf(whole, 'c'), ...interestHeldOf(whole, 'k')]);
  });

  it('gives the same sums, in the same order, whether a pass adds the entries it writes one at a time or reads them all at once (PR 126 review F-M2-2)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ line: fc.constantFrom('L1', 'L2', 'L3'), match: fc.constantFrom('m1', 'm2', 'm3', 'm4'), amount: fc.bigInt({ min: -500n, max: 500n }) }), { maxLength: 12 }),
        (written) => {
          const chains = new Map([
            ['m1', 'c'],
            ['m2', 'k'],
            ['m3', 'c'],
          ]);
          const entries = written.map((item, index) => entry(`e${String(index)}`, item.match, item.line, 'interest', item.amount));
          const once: InterestHeldSums = new Map();
          addInterestHeld(once, entries, chains);
          const oneByOne: InterestHeldSums = new Map();
          for (const item of entries) {
            addInterestHeld(oneByOne, [item], chains);
          }
          expect(ordered(oneByOne)).toEqual(ordered(once));
          expect([...once.keys()].flatMap((chain) => interestHeldOf(once, chain))).toEqual(interestHeld(entries, chains));
        },
      ),
    );
  });

  it('counts a correction toward the chain of the entry it corrects, whatever match it carries', () => {
    const entries = [entry('e1', 'm1', 'L1', 'interest', 240n), entry('e2', 'm2', 'L1', 'adjusted', -40n, 'e1')];
    expect(interestHeld(entries, new Map([['m1', 'c']]))).toEqual([{ chain: 'c', serviceLineId: 'L1', heldCents: 200n }]);
    expect(interestHeld([entry('e1', 'm1', 'L1', 'interest', 240n), entry('e2', 'm1', 'L1', 'adjusted', -300n, 'e1')], new Map([['m1', 'c']]))).toEqual([{ chain: 'c', serviceLineId: 'L1', heldCents: 0n }]);
  });
});

// ---- Properties ---------------------------------------------------------------------------------------------------

const CHAINS = ['c1', 'c2', 'c3', 'c4', 'c5'] as const;
const OUTSIDE = ['x1', 'x2'] as const;

interface Shape {
  readonly claims: readonly { readonly chain: string; readonly interest: bigint }[];
  readonly l6s: readonly { readonly cash: bigint; readonly named: string | null; readonly position: number }[];
}

const shapes = fc.record({
  claims: fc.array(fc.record({ chain: fc.constantFrom<string>(...CHAINS), interest: fc.bigInt({ min: -1000n, max: 1000n }) }), { minLength: 1, maxLength: 8 }),
  l6s: fc.array(
    fc.record({
      cash: fc.oneof(fc.bigInt({ min: -2000n, max: 2000n }), fc.constant(0n)),
      named: fc.constantFrom<string | null>(null, null, ...CHAINS, ...OUTSIDE),
      position: fc.integer({ min: 1, max: 6 }),
    }),
    { minLength: 1, maxLength: 4 },
  ),
});

const claimsOf = (shape: Shape): InterestClaim[] => shape.claims.map((item, index) => claim(`k${index}`, item.chain, item.interest));

const namedClaims = (shape: Shape, chain: string): string[] => {
  const inRemittance = shape.claims.flatMap((item, index) => (item.chain === chain ? [`k${index}`] : []));
  return inRemittance.length > 0 ? inRemittance : [`${chain}-claim`];
};

const adjustmentsOf = (shape: Shape): InterestAdjustment[] =>
  shape.l6s.map((item, index) => l6(`a${index}`, item.cash, item.named === null ? null : { chain: item.named, claims: namedClaims(shape, item.named) }, item.position));

/** What Postgres allows each PLB L6 of each sign: its cash that way plus what its remittance's claims report the other way. */
const bound = (claims: readonly InterestClaim[], cash: bigint) => {
  const reportedPaid = claims.reduce((sum, item) => sum + (item.interestCents > 0n ? item.interestCents : 0n), 0n);
  const reportedTaken = claims.reduce((sum, item) => sum + (item.interestCents < 0n ? negateCents(item.interestCents) : 0n), 0n);
  return { paid: (cash > 0n ? cash : 0n) + reportedTaken, taken: (cash < 0n ? -cash : 0n) + reportedPaid };
};

const bySign = (amounts: readonly bigint[]) => ({
  paid: amounts.reduce((sum, amount) => sum + (amount > 0n ? amount : 0n), 0n),
  taken: amounts.reduce((sum, amount) => sum + (amount < 0n ? -amount : 0n), 0n),
});

describe('attributeInterest, for any remittance (properties)', () => {
  it('gives each PLB L6 draws and a rest that add up to its cash, within the Postgres bound, each draw naming one L6 and one chain once', () => {
    fc.assert(
      fc.property(shapes, (shape) => {
        const claims = claimsOf(shape);
        const adjustments = adjustmentsOf(shape);
        const { draws, unattributed } = attribute(claims, adjustments);
        const keys = draws.map((item) => `${item.adjustmentId}/${item.chain}`);
        expect(new Set(keys).size).toBe(keys.length);
        for (const item of draws) {
          expect(item.cents).not.toBe(0n);
        }
        for (const adjustment of adjustments) {
          const own = draws.filter((item) => item.adjustmentId === adjustment.id).map((item) => item.cents as bigint);
          const rest = unattributed.filter((item) => item.adjustmentId === adjustment.id);
          expect(rest.length).toBeLessThanOrEqual(1);
          for (const item of rest) {
            expect(item.cents).not.toBe(0n);
          }
          expect(own.reduce((sum, amount) => sum + amount, 0n) + rest.reduce((sum, item) => sum + item.cents, 0n)).toBe(adjustment.cashCents);
          const limit = bound(claims, adjustment.cashCents);
          const signs = bySign(own);
          expect(signs.paid).toBeLessThanOrEqual(limit.paid);
          expect(signs.taken).toBeLessThanOrEqual(limit.taken);
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('when no PLB L6 names a claim: each chain draws exactly its AMT I when the L6s equal it, otherwise only the net, never past a report', () => {
    fc.assert(
      fc.property(shapes, (shape) => {
        const claims = claimsOf(shape);
        const adjustments = adjustmentsOf({ ...shape, l6s: shape.l6s.map((item) => ({ ...item, named: null })) });
        const { draws } = attribute(claims, adjustments);
        const reported = new Map<string, bigint>();
        for (const item of claims) {
          reported.set(item.chain, (reported.get(item.chain) ?? 0n) + item.interestCents);
        }
        const pool = adjustments.reduce((sum, item) => sum + item.cashCents, 0n);
        const total = [...reported.values()].reduce((sum, amount) => sum + amount, 0n);
        const anyCash = adjustments.some((item) => item.cashCents !== 0n);
        for (const [chain, amount] of reported) {
          const drawn = draws.filter((item) => item.chain === chain).reduce((sum, item) => sum + item.cents, 0n);
          if (anyCash && pool === total) {
            expect(drawn).toBe(amount);
          } else {
            expect(drawn * pool).toBeGreaterThanOrEqual(0n);
            expect(drawn * amount).toBeGreaterThanOrEqual(0n);
            expect(drawn < 0n ? -drawn : drawn).toBeLessThanOrEqual(amount < 0n ? -amount : amount);
          }
        }
        for (const item of draws) {
          expect(item.shared).toBe(draws.filter((other) => other.shared).length >= 2 && item.shared);
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('is unchanged by PLB L6s of zero and chains whose AMT I nets to zero, and gives an L6 of a remittance not given nothing', () => {
    fc.assert(
      fc.property(shapes, fc.bigInt({ min: 1n, max: 900n }), fc.constantFrom<string | null>(null, ...CHAINS, 'z9'), (shape, net, named) => {
        const claims = claimsOf(shape);
        const adjustments = adjustmentsOf(shape);
        const expected = attribute(claims, adjustments);
        const padded = attribute(
          [...claims, claim('z9-1', 'z9', net), claim('z9-2', 'z9', -net)],
          [...adjustments, l6('zero', 0n, named === null ? null : { chain: named, claims: ['z9-1'] }, 2), l6('elsewhere', 540n, named === null ? null : { chain: named, claims: ['z9-1'] }, 1, 'later')],
        );
        expect(padded).toEqual(expected);
      }),
      { numRuns: 1000 },
    );
  });

  it('gives a remittance with no PLB L6 nothing, whatever its AMT I', () => {
    fc.assert(
      fc.property(shapes, (shape) => {
        expect(attribute(claimsOf(shape), [])).toEqual({ draws: [], unattributed: [] });
      }),
    );
  });
});

describe('interestWrites, over any sequence of reconciles (properties)', () => {
  const LINES = ['L1', 'L2', 'L3', 'L4'] as const;
  const lineSpecs = fc.array(
    fc.record({
      chain: fc.constantFrom<string>(...CHAINS, ...OUTSIDE),
      line: fc.constantFrom<string>(...LINES),
      weight: fc.bigInt({ min: 0n, max: 3000n }),
      held: fc.bigInt({ min: -300n, max: 3000n }),
      approved: fc.boolean(),
      pick: fc.nat(),
      mayYetHold: fc.boolean(),
      outOfReach: fc.boolean(),
      unplaced: fc.bigInt({ min: 0n, max: 600n }),
    }),
    { maxLength: 12 },
  );
  const reconcile = fc.record({ chains: fc.array(fc.constantFrom<string>(...CHAINS), { minLength: 8, maxLength: 8 }), named: fc.constantFrom<string | null>(null, ...CHAINS, ...OUTSIDE), lines: lineSpecs });

  it('never writes a PLB L6 past the largest of its attributions’ draws of each sign nor the Postgres bound; a line once; a take-back within what a line holds; allocated exactly on a split; a repeat writes nothing', () => {
    fc.assert(
      fc.property(shapes, fc.array(reconcile, { minLength: 1, maxLength: 4 }), (shape, reconciles) => {
        const target = shape.l6s[0] as Shape['l6s'][number];
        let written: InterestWritten[] = [];
        let largest = { paid: 0n, taken: 0n };
        for (const step of reconciles) {
          // A later upload can link claims into other chains and change whom the reference names; amounts never change.
          const relinked: Shape = { claims: shape.claims.map((item, index) => ({ ...item, chain: step.chains[index] as string })), l6s: [{ ...target, named: step.named }, ...shape.l6s.slice(1)] };
          const claims = claimsOf(relinked);
          const { draws } = attribute(claims, adjustmentsOf(relinked));
          const own = draws.filter((item) => item.adjustmentId === 'a0');
          const drawn = bySign(own.map((item) => item.cents));
          largest = { paid: drawn.paid > largest.paid ? drawn.paid : largest.paid, taken: drawn.taken > largest.taken ? drawn.taken : largest.taken };
          const lines = new Map<string, { paid: ChainInterestLines['paid'][number][]; takenBack: ChainInterestLines['takenBack'][number][]; mayYetHold: boolean; unplacedCents: ChainInterestLines['unplacedCents'] }>();
          for (const spec of step.lines) {
            const entry = lines.get(spec.chain) ?? { paid: [], takenBack: [], mayYetHold: spec.mayYetHold, unplacedCents: cents(spec.unplaced) };
            lines.set(spec.chain, entry);
            const candidates = [...namedClaims(relinked, spec.chain), 'other'];
            const claimId = candidates[spec.pick % candidates.length] as string;
            if (!entry.paid.some((item) => item.serviceLineId === spec.line)) {
              entry.paid.push({ serviceLineId: spec.line, claimId, approved: spec.approved, weightCents: cents(spec.weight), outOfReach: spec.outOfReach });
            }
            if (!entry.takenBack.some((item) => item.serviceLineId === spec.line)) {
              entry.takenBack.push({ serviceLineId: spec.line, claimId, heldCents: cents(spec.held) });
            }
          }
          const parts = interestWrites({ draws: own, written, lines });
          const reached = new Set(written.map((item) => item.serviceLineId));
          for (const item of parts) {
            expect(item.cents).not.toBe(0n);
            expect(reached.has(item.serviceLineId)).toBe(false);
            reached.add(item.serviceLineId);
            if (item.cents < 0n) {
              const held = lines.get(item.chain)?.takenBack.find((line) => line.serviceLineId === item.serviceLineId)?.heldCents ?? 0n;
              expect(negateCents(item.cents)).toBeLessThanOrEqual(held);
            } else {
              // A line kept off the chain's payments takes none (PR 126 review RV-DB2-1).
              expect(lines.get(item.chain)?.paid.find((line) => line.serviceLineId === item.serviceLineId)?.outOfReach).toBe(false);
            }
            const ofDraw = parts.filter((other) => other.chain === item.chain);
            const source = own.find((other) => other.chain === item.chain);
            if (item.cents < 0n || lines.get(item.chain)?.paid.every((line) => !line.outOfReach) === true) {
              expect(item.allocated).toBe(source?.shared === true || ofDraw.length >= 2);
            } else {
              // A share of a split is allocated even when the other shares fell on lines kept off the payment.
              expect(item.allocated || ofDraw.length < 2).toBe(true);
            }
          }
          written = [...written, ...parts.map((item) => wrote(item.chain, item.serviceLineId, item.cents))];
          const total = bySign(written.map((item) => item.cents));
          // A payment is written only once every take-back of a chain that may yet hold interest is whole: the chain has
          // been given all of its draw, or the L6's draws of that sign are spent (PR 126 review F1), but for interest
          // other PLB L6s paid the chain that can reach no line (PR 126 review R2M2-1).
          if (parts.some((item) => item.cents > 0n)) {
            for (const draw of own.filter((item) => item.cents < 0n && lines.get(item.chain)?.mayYetHold === true)) {
              const given = bySign(written.filter((item) => item.chain === draw.chain).map((item) => item.cents)).taken;
              const unplaced = lines.get(draw.chain)?.unplacedCents ?? 0n;
              expect(given + unplaced >= negateCents(draw.cents) || drawn.taken - total.taken <= unplaced).toBe(true);
            }
          }
          const limit = bound(claims, target.cash);
          expect(total.paid).toBeLessThanOrEqual(largest.paid);
          expect(total.taken).toBeLessThanOrEqual(largest.taken);
          expect(total.paid).toBeLessThanOrEqual(limit.paid);
          expect(total.taken).toBeLessThanOrEqual(limit.taken);
          expect(interestWrites({ draws: own, written, lines })).toEqual([]);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('writes the same whichever is uploaded first: a PLB L6 netting two chains, or the earlier PLB L6 paying the chain it takes back from (PR 126 review F1)', () => {
    const someLines = fc.uniqueArray(fc.record({ line: fc.constantFrom<string>(...LINES), weight: fc.bigInt({ min: 0n, max: 3000n }) }), { selector: (item) => item.line, maxLength: 4 });
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 1000n }), fc.bigInt({ min: 1n, max: 1000n }), someLines, someLines, (taken, payment, aLines, bLines) => {
        // Y pays chain a's interest on the lines a's claim is matched to; X takes it back and pays chain b's, whose claim
        // may be matched to the same lines.
        const paidOn = (claimId: string, specs: typeof aLines) => specs.map((spec) => ({ serviceLineId: spec.line, claimId, approved: true, weightCents: cents(spec.weight), outOfReach: false }));
        const y = interestWrites({ draws: [drawOf('Y', 'a', taken, ['A'])], written: [], lines: new Map([['a', { paid: paidOn('A', aLines), takenBack: [], mayYetHold: true, unplacedCents: cents(0n) }]]) });
        const x = [drawOf('X', 'b', payment, ['B']), drawOf('X', 'a', -taken, ['V'])];
        const linesOfX = (held: readonly InterestPart[]) =>
          new Map<string, ChainInterestLines>([
            ['a', { paid: [], takenBack: held.map((item) => ({ serviceLineId: item.serviceLineId, claimId: 'A', heldCents: item.cents })), mayYetHold: true, unplacedCents: cents(0n) }],
            ['b', { paid: paidOn('B', bLines), takenBack: [], mayYetHold: true, unplacedCents: cents(0n) }],
          ]);
        const inOrder = interestWrites({ draws: x, written: [], lines: linesOfX(y) });
        // X first: a holds nothing yet, so X writes nothing until Y's interest is on the lines.
        const before = interestWrites({ draws: x, written: [], lines: linesOfX([]) });
        const after = interestWrites({ draws: x, written: before.map((item) => wrote(item.chain, item.serviceLineId, item.cents)), lines: linesOfX(y) });
        expect([...before, ...after]).toEqual(inOrder);
      }),
      { numRuns: 1000 },
    );
  });

  it('writes the same whichever is uploaded first when two PLB L6s pay the chain a third takes back from, the third uploaded between them or with the second, and never above the cash (PR 126 review R2M2-1, RV-DB2-1)', () => {
    const lineSpecs = fc.uniqueArray(
      fc.record({ line: fc.constantFrom<string>(...LINES), ofA: fc.boolean(), approvedA: fc.boolean(), ofB: fc.boolean(), approvedB: fc.boolean(), weight: fc.bigInt({ min: 0n, max: 3000n }) }),
      { selector: (item) => item.line, maxLength: 4 },
    );
    type Who = 'Z' | 'Y' | 'X';
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1000n }),
        fc.bigInt({ min: 1n, max: 1000n }),
        fc.bigInt({ min: 0n, max: 500n }),
        fc.bigInt({ min: 1n, max: 1000n }),
        lineSpecs,
        fc.boolean(),
        (early, late, short, payment, specs, recouped) => {
          // Z (dated first; nothing when `early` is zero) and Y (dated second) pay chain a's interest on the lines a's claim
          // is matched to; X (dated last) takes back what they paid and `short` more, and pays chain b's, whose claim may
          // be matched to the same lines. When `recouped`, X's reversal leaves a's lines nothing remaining once X is
          // uploaded; otherwise every weight stays. Each reconcile walks the uploaded PLB L6s by date, as the reconcile
          // does, reading each one's lines as recordInterest builds them.
          const draws: Record<Who, InterestDraw[]> = {
            Z: early > 0n ? [drawOf('Z', 'a', early, ['A'])] : [],
            Y: [drawOf('Y', 'a', late, ['A'])],
            X: [drawOf('X', 'b', payment, ['B']), drawOf('X', 'a', -(early + late + short), ['V'])],
          };
          const run = (steps: readonly (readonly Who[])[]) => {
            const written: Record<Who, InterestWritten[]> = { Z: [], Y: [], X: [] };
            const uploaded = new Set<Who>();
            const weightOf = (spec: (typeof specs)[number]) => cents(recouped && spec.ofA && uploaded.has('X') ? 0n : spec.weight);
            const linesOfA = (): ChainInterestLines['paid'] => {
              const out = uploaded.has('X') ? (interestOutOfReach({ draws: draws.X, written: written.X }).get('a') ?? []) : [];
              return specs.filter((spec) => spec.ofA).map((spec) => ({ serviceLineId: spec.line, claimId: 'A', approved: spec.approvedA, weightCents: weightOf(spec), outOfReach: out.includes(spec.line) }));
            };
            const held = () => {
              const sums = new Map<string, bigint>();
              for (const item of [...written.Z, ...written.Y, ...written.X].filter((entry) => entry.chain === 'a')) {
                sums.set(item.serviceLineId, (sums.get(item.serviceLineId) ?? 0n) + item.cents);
              }
              return [...sums].map(([serviceLineId, sum]) => ({ serviceLineId, claimId: 'A', heldCents: cents(sum > 0n ? sum : 0n) }));
            };
            const linesOf = (who: Who) =>
              who === 'X'
                ? new Map<string, ChainInterestLines>([
                    [
                      'a',
                      {
                        paid: [],
                        takenBack: held(),
                        mayYetHold: true,
                        unplacedCents: interestUnplaced({ chain: 'a', payments: (['Z', 'Y'] as const).filter((other) => uploaded.has(other)).map((other) => ({ draws: draws[other], written: written[other], paid: linesOfA() })), takeBacks: [] }),
                      },
                    ],
                    [
                      'b',
                      {
                        paid: specs.filter((spec) => spec.ofB).map((spec) => ({ serviceLineId: spec.line, claimId: 'B', approved: spec.approvedB, weightCents: weightOf(spec), outOfReach: false })),
                        takenBack: [],
                        mayYetHold: true,
                        unplacedCents: cents(0n),
                      },
                    ],
                  ])
                : new Map<string, ChainInterestLines>([['a', { paid: linesOfA(), takenBack: [], mayYetHold: true, unplacedCents: cents(0n) }]]);
            const reconcile = () => {
              for (const who of (['Z', 'Y', 'X'] as const).filter((item) => uploaded.has(item))) {
                written[who].push(...interestWrites({ draws: draws[who], written: written[who], lines: linesOf(who) }).map((item) => wrote(item.chain, item.serviceLineId, item.cents)));
              }
            };
            for (const step of steps) {
              step.forEach((who) => uploaded.add(who));
              reconcile();
            }
            reconcile();
            reconcile();
            const all = [...written.Z, ...written.Y, ...written.X];
            const byLine = [...new Set(all.map((item) => item.serviceLineId))].sort().map((serviceLineId) => [serviceLineId, all.filter((item) => item.serviceLineId === serviceLineId).reduce((sum, item) => sum + item.cents, 0n)]);
            return { total: all.reduce((sum, item) => sum + item.cents, 0n), byLine: byLine.filter(([, sum]) => sum !== 0n) };
          };
          const inOrder = run([['Z'], ['Y'], ['X']]);
          // X between Z and Y: X takes back what Z paid, and Y's interest, landing where X can follow it or nowhere,
          // completes the take-back either way. X with Y in one reconcile: Y is walked first, as dated.
          expect(run([['Z'], ['X'], ['Y']])).toEqual(inOrder);
          expect(run([['Z'], ['X', 'Y']])).toEqual(inOrder);
          const cash = early + late + payment - (early + late + short);
          expect(inOrder.total).toBeLessThanOrEqual(cash > 0n ? cash : 0n);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('never writes interest above the cash when the chain a PLB L6 takes back from comes to a case line only after the L6 wrote its payments, a person matching it by hand (mayYetHold false, then true; PR 126 review MONEY-R4-1)', () => {
    const someLines = fc.uniqueArray(fc.record({ line: fc.constantFrom<string>(...LINES), weight: fc.bigInt({ min: 0n, max: 3000n }) }), { selector: (item) => item.line, maxLength: 4 });
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 1000n }),
        fc.bigInt({ min: 0n, max: 1000n }),
        fc.bigInt({ min: 1n, max: 1000n }),
        someLines,
        someLines,
        fc.boolean(),
        fc.integer({ min: 1, max: 3 }),
        (taken, more, payment, aLines, bLines, yFirst, matchedFrom) => {
          // Y pays chain a's interest, at least what X takes back; X pays chain b's and takes a's back. a's claim is matched
          // to aLines from reconcile `matchedFrom` on (1: from the start; later: by hand, after X wrote b's payment on
          // bLines). The reconcile keeps Y's payment off the lines X has reached while it still owes a's take-back.
          // The cash: Y's, and X's net.
          const cash = taken + more + (payment - taken);
          const y = [drawOf('Y', 'a', taken + more, ['A'])];
          const x = [drawOf('X', 'b', payment, ['B']), drawOf('X', 'a', -taken, ['V'])];
          const ofY: InterestWritten[] = [];
          const ofX: InterestWritten[] = [];
          const paidOn = (claimId: string, specs: typeof aLines) => specs.map((spec) => ({ serviceLineId: spec.line, claimId, approved: true, weightCents: cents(spec.weight), outOfReach: false }));
          const write = (into: InterestWritten[], parts: readonly InterestPart[]) => into.push(...parts.map((item) => wrote(item.chain, item.serviceLineId, item.cents)));
          // What each line holds of a: Y's payments and X's take-backs there.
          const held = () => {
            const sums = new Map<string, bigint>();
            for (const item of [...ofY, ...ofX].filter((entry) => entry.chain === 'a')) {
              sums.set(item.serviceLineId, (sums.get(item.serviceLineId) ?? 0n) + item.cents);
            }
            return [...sums].map(([serviceLineId, sum]) => ({ serviceLineId, claimId: 'A', heldCents: cents(sum > 0n ? sum : 0n) }));
          };
          const total = () => [...ofY, ...ofX].reduce((sum, item) => sum + item.cents, 0n);
          for (let reconcile = 1; reconcile <= 4; reconcile += 1) {
            const matched = reconcile >= matchedFrom;
            // Y's lines, each kept off while X still owes a's take-back and has an entry there, as the reconcile reads them.
            const linesOfY = () => {
              const out = interestOutOfReach({ draws: x, written: ofX }).get('a') ?? [];
              return matched ? paidOn('A', aLines).map((line) => ({ ...line, outOfReach: out.includes(line.serviceLineId) })) : [];
            };
            const payY = () => write(ofY, interestWrites({ draws: y, written: ofY, lines: new Map([['a', { paid: linesOfY(), takenBack: [], mayYetHold: matched, unplacedCents: cents(0n) }]]) }));
            const unplaced = () => (matched ? interestUnplaced({ chain: 'a', payments: [{ draws: y, written: ofY, paid: linesOfY() }], takeBacks: [] }) : cents(0n));
            const netX = () =>
              write(
                ofX,
                interestWrites({
                  draws: x,
                  written: ofX,
                  lines: new Map<string, ChainInterestLines>([
                    ['a', { paid: [], takenBack: held(), mayYetHold: matched, unplacedCents: unplaced() }],
                    ['b', { paid: paidOn('B', bLines), takenBack: [], mayYetHold: true, unplacedCents: cents(0n) }],
                  ]),
                }),
              );
            if (yFirst) {
              payY();
              netX();
              // In payment order (Y's check, then X's), every reconcile ends within the cash.
              expect(total()).toBeLessThanOrEqual(cash);
            } else {
              netX();
              payY();
            }
          }
          // In either order, once the take-back has followed: never above the cash.
          expect(total()).toBeLessThanOrEqual(cash);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
