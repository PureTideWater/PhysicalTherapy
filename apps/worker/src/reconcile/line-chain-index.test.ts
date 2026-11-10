import { LEDGER_MATCH_OUTCOMES } from '@tp/db';
import { type Cents, cents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { StoredMatch } from './ledger';
import { type ChainContext, type ChainLine, type ClaimLine, lineChain } from './remittances';
import { lineChain as filterForm } from './test-support/per-line';

/**
 * CAS-49.5 (SUITE-CAP-3 D5; design section 7; docs/adr/0087): lineChain reads a line's standing matches from an index
 * built once per context's matches array, where it filtered every match of the practice for each line. For generated
 * contexts (matches in any order, standing and reversed, claim and recoupment kinds, recoupments with a line, with none,
 * or of a loaded reversal, lines no match names, a line whose claim is not loaded), the indexed lineChain gives every
 * line asked what the per-line reference's filter form gives (test-support/per-line.ts), and several contexts asked in
 * turn, among them two with equal but distinct matches arrays, each get the answers of their own matches, never another
 * context's index. CAS-41 runs the new lineChain on both of its sides, so it never compared D5; CAS-49.1's worlds hold no
 * reversed claim match on a line the pass then writes for, so this test is where the index is held exactly. Synthetic
 * ids only, built here.
 */

const CODES = ['97110', '97112', '97140'] as const;
const id = (kind: number, n: number) => `00000000-0000-4000-8${kind.toString(16)}00-${n.toString(16).padStart(12, '0')}`;

interface Drawn {
  readonly caseLines: readonly { readonly code: number; readonly second: number | null; readonly paid: bigint }[];
  readonly claims: readonly { readonly code: number; readonly paid: bigint; readonly allowed: bigint }[];
  readonly matches: readonly {
    readonly kind: 'claim' | 'recoupment';
    readonly line: number | null;
    readonly claim: number;
    readonly reversal: boolean;
    readonly standing: boolean;
    readonly outcome: number | null;
    readonly recouped: bigint | null;
  }[];
}

const money = (max: bigint) => fc.bigInt(0n, max);
const drawn: fc.Arbitrary<Drawn> = fc.record({
  caseLines: fc.array(fc.record({ code: fc.nat(CODES.length - 1), second: fc.option(fc.nat(CODES.length - 1)), paid: money(20_000n) }), { minLength: 1, maxLength: 6 }),
  claims: fc.array(fc.record({ code: fc.nat(CODES.length - 1), paid: money(20_000n), allowed: money(20_000n) }), { minLength: 1, maxLength: 8 }),
  matches: fc.array(
    fc.record({
      kind: fc.constantFrom('claim' as const, 'recoupment' as const),
      line: fc.option(fc.nat(7), { freq: 6 }),
      claim: fc.nat(7),
      reversal: fc.boolean(),
      standing: fc.boolean(),
      outcome: fc.option(fc.nat(LEDGER_MATCH_OUTCOMES.length - 1)),
      recouped: fc.option(fc.bigInt(-5_000n, 0n)),
    }),
    { maxLength: 24 },
  ),
});

const claimLine = (claimId: string, serviceLineId: string, lineNo: number, code: string, paid: bigint, allowed: bigint): ClaimLine => ({
  serviceLineId,
  claimId,
  lineNo,
  procedureCode: code,
  modifiers: [],
  units: '1',
  serviceDate: '2026-03-02',
  observedAllowedCents: cents(allowed),
  paidCents: cents(paid),
  servicePaidCents: cents(paid),
  claimAdjustment: null,
  split: { chargeCents: cents(allowed), lineReductionCents: cents(0n), carriesAdjustments: false },
});

/** A context from the draw and the case lines to ask about; two draws share ids, so only its own matches answer for each. */
function contextOf(draw: Drawn): { readonly context: ChainContext; readonly asked: readonly ChainLine[] } {
  const lines = new Map<string, ClaimLine[]>();
  const asked: ChainLine[] = [];
  for (const [n, item] of draw.caseLines.entries()) {
    const claimId = id(1, n);
    const serviceLineId = id(2, 2 * n);
    const own = [claimLine(claimId, serviceLineId, 1, CODES[item.code] as string, item.paid, item.paid)];
    if (item.second !== null) {
      own.push(claimLine(claimId, id(2, 2 * n + 1), 2, CODES[item.second] as string, item.paid, item.paid));
    }
    lines.set(claimId, own);
    asked.push(...own.map((line) => ({ serviceLineId: line.serviceLineId, claimId })));
  }
  // A case line whose claim is not loaded: undefined either way.
  asked.push({ serviceLineId: id(2, 999), claimId: id(1, 999) });
  const claimIds = draw.claims.map((_claim, n) => id(3, n));
  for (const [n, item] of draw.claims.entries()) {
    lines.set(claimIds[n] as string, [claimLine(claimIds[n] as string, id(4, n), 1, CODES[item.code] as string, item.paid, item.allowed)]);
  }
  const reversals: ChainContext['reversals'][number][] = [];
  const matchedAt = new Map<string, bigint>();
  const recouped = new Map<string, Cents>();
  const matches = draw.matches.map((item, n): StoredMatch => {
    const matchId = id(5, n);
    let claimId: string | null = claimIds[item.claim % claimIds.length] as string;
    if (item.kind === 'recoupment') {
      if (item.reversal) {
        // A loaded reversal of the claim drawn, loaded at the n-th microsecond.
        const reversalId = id(6, n);
        reversals.push({ id: reversalId, remittanceId: id(7, n), reversedClaimId: claimId, paidOn: '2026-04-01', loadedAt: BigInt(n), beside: false });
        claimId = reversalId;
      } else {
        claimId = null;
      }
    }
    const serviceLine = item.line === null ? null : (asked[item.line % asked.length] as ChainLine).serviceLineId;
    matchedAt.set(matchId, BigInt(n));
    if (item.recouped !== null) {
      recouped.set(matchId, cents(item.recouped));
    }
    return {
      id: matchId,
      kind: item.kind,
      claimId,
      postingRowId: null,
      eftRowId: null,
      providerAdjustmentId: null,
      remittanceId: id(7, n),
      serviceLineId: item.kind === 'claim' && serviceLine === null ? (asked[0] as ChainLine).serviceLineId : serviceLine,
      outcome: item.kind === 'claim' && item.outcome !== null ? (LEDGER_MATCH_OUTCOMES[item.outcome] ?? null) : null,
      level: null,
      allocated: false,
      matchedBy: null,
      standing: item.standing,
    };
  });
  return { context: { matches, matchedAt, lines, reversals, recouped }, asked };
}

/** A chain, or the error walking it raised: the two forms must agree on both. */
const walk = (chainOf: typeof lineChain, context: ChainContext, line: ChainLine) => {
  try {
    return { chain: chainOf(context, line) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

describe("lineChain's standing-match index (CAS-49.5, SUITE-CAP-3 D5)", () => {
  it('gives every line what the filter form gives, for any context', () => {
    fc.assert(
      fc.property(drawn, (draw) => {
        const { context, asked } = contextOf(draw);
        for (const line of asked) {
          expect(walk(lineChain, context, line)).toEqual(walk(filterForm, context, line));
        }
      }),
      { numRuns: 1_500, seed: 0x0ca5495 },
    );
  });

  it("answers each of several contexts asked in turn from its own matches, equal but distinct arrays included", () => {
    fc.assert(
      fc.property(drawn, drawn, (first, second) => {
        const a = contextOf(first);
        const b = contextOf(second);
        // Equal to a, in a distinct array whose standing matches are a's reversed ones and the other way round.
        const flipped: ChainContext = { ...a.context, matches: a.context.matches.map((match) => ({ ...match, standing: !match.standing })) };
        const twin: ChainContext = { ...a.context, matches: [...a.context.matches] };
        for (let round = 0; round < 2; round += 1) {
          for (const [context, asked] of [
            [a.context, a.asked],
            [b.context, b.asked],
            [flipped, a.asked],
            [twin, a.asked],
          ] as const) {
            for (const line of asked) {
              expect(walk(lineChain, context, line)).toEqual(walk(filterForm, context, line));
            }
          }
        }
      }),
      { numRuns: 500, seed: 0x0ca5496 },
    );
  });
});
