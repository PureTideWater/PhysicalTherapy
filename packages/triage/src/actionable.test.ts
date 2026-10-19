import { type Cents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { NOT_ACTIONABLE_REASONS, type TriageFacts, judgeLine, shortfallOf, windowOpen } from './actionable';

const facts = (overrides: Partial<TriageFacts> = {}): TriageFacts => ({
  varianceCents: 3000n as Cents,
  windowEndsOn: '2026-12-31',
  deadlineStatus: 'verified',
  claimReversed: false,
  claimSuperseded: false,
  mappingKind: 'contract',
  contractVersionStatus: 'signed_off',
  contractVersionCoversService: true,
  releaseWithdrawn: false,
  writtenOff: false,
  visitVarianceCents: null,
  reviewFlags: [],
  ...overrides,
});
const FIVE = 500n as Cents;
const AS_OF = '2026-10-15';

describe('from validated to actionable (PRD 12)', () => {
  it('makes a material, open, signed-off line of a standing claim actionable', () => {
    expect(judgeLine(facts(), FIVE, AS_OF)).toEqual({ validated: true, actionable: true, reasons: [], validatedCents: 3000n });
  });

  it('never validates an unpriced line, a line paid exactly, or an overpayment (PRC-15)', () => {
    for (const varianceCents of [null, 0n as Cents, -1200n as Cents]) {
      expect(judgeLine(facts({ varianceCents }), FIVE, AS_OF)).toEqual({ validated: false, actionable: false, reasons: [], validatedCents: null });
    }
  });

  it('keeps a line below the line materiality validated, not actionable, and actionable at it exactly (CAS-05)', () => {
    expect(judgeLine(facts({ varianceCents: 300n as Cents }), FIVE, AS_OF)).toEqual({ validated: true, actionable: false, reasons: ['BELOW_LINE_MATERIALITY'], validatedCents: 300n });
    expect(judgeLine(facts({ varianceCents: 500n as Cents }), FIVE, AS_OF).actionable).toBe(true);
  });

  it('keeps a line whose window passed on the triage date validated with WINDOW_PASSED (PRC-14); the last day is still open', () => {
    expect(judgeLine(facts({ windowEndsOn: '2026-10-14' }), FIVE, AS_OF)).toMatchObject({ validated: true, actionable: false, reasons: ['WINDOW_PASSED'] });
    expect(judgeLine(facts({ windowEndsOn: AS_OF }), FIVE, AS_OF).actionable).toBe(true);
    expect(judgeLine(facts({ windowEndsOn: null }), FIVE, AS_OF).reasons).toEqual(['NO_WINDOW']);
    expect(windowOpen(null, AS_OF)).toBe(false);
  });

  it('keeps a line whose deadline is not verified validated with DEADLINE_UNVERIFIED, after the window, and keeps its price (D17 a)', () => {
    expect(judgeLine(facts({ deadlineStatus: 'unverified' }), FIVE, AS_OF)).toEqual({ validated: true, actionable: false, reasons: ['DEADLINE_UNVERIFIED'], validatedCents: 3000n });
    expect(judgeLine(facts({ deadlineStatus: 'unverified', windowEndsOn: '2026-10-14' }), FIVE, AS_OF).reasons).toEqual(['WINDOW_PASSED', 'DEADLINE_UNVERIFIED']);
    // No window: NO_WINDOW says it, and a deadline that does not exist is not applicable rather than unverified.
    expect(judgeLine(facts({ deadlineStatus: 'not_applicable', windowEndsOn: null }), FIVE, AS_OF).reasons).toEqual(['NO_WINDOW']);
    expect(NOT_ACTIONABLE_REASONS.slice(1, 4)).toEqual(['WINDOW_PASSED', 'NO_WINDOW', 'DEADLINE_UNVERIFIED']);
  });

  it('refuses reversed and superseded claims and versions no longer signed off; Medicare Advantage lines need no version', () => {
    expect(judgeLine(facts({ claimReversed: true }), FIVE, AS_OF).reasons).toEqual(['CLAIM_REVERSED']);
    expect(judgeLine(facts({ claimSuperseded: true }), FIVE, AS_OF).reasons).toEqual(['CLAIM_SUPERSEDED']);
    expect(judgeLine(facts({ contractVersionStatus: 'superseded' }), FIVE, AS_OF).reasons).toEqual(['VERSION_NOT_SIGNED_OFF']);
    expect(judgeLine(facts({ mappingKind: 'ma_noncontracted', contractVersionStatus: null }), FIVE, AS_OF).actionable).toBe(true);
    expect(judgeLine(facts({ writtenOff: true }), FIVE, AS_OF).reasons).toEqual(['WRITTEN_OFF']);
  });

  it('takes a line out of the actionable totals once its rule release is withdrawn or an amendment closed its version before its date (audit item #4)', () => {
    expect(judgeLine(facts({ releaseWithdrawn: true }), FIVE, AS_OF)).toEqual({ validated: true, actionable: false, reasons: ['RELEASE_WITHDRAWN'], validatedCents: 3000n });
    expect(judgeLine(facts({ contractVersionCoversService: false }), FIVE, AS_OF)).toEqual({ validated: true, actionable: false, reasons: ['VERSION_NOT_IN_FORCE'], validatedCents: 3000n });
    // A version superseded by its correction may still cover the date: both reasons hold when neither does.
    expect(judgeLine(facts({ contractVersionStatus: 'superseded', contractVersionCoversService: false, releaseWithdrawn: true }), FIVE, AS_OF).reasons).toEqual([
      'VERSION_NOT_SIGNED_OFF',
      'VERSION_NOT_IN_FORCE',
      'RELEASE_WITHDRAWN',
    ]);
    // A Medicare Advantage non-contracted line names no version, so only the withdrawal reaches it.
    expect(judgeLine(facts({ mappingKind: 'ma_noncontracted', contractVersionStatus: null, contractVersionCoversService: true, releaseWithdrawn: true }), FIVE, AS_OF).reasons).toEqual(['RELEASE_WITHDRAWN']);
    expect(NOT_ACTIONABLE_REASONS).toEqual([
      'BELOW_LINE_MATERIALITY',
      'WINDOW_PASSED',
      'NO_WINDOW',
      'DEADLINE_UNVERIFIED',
      'CLAIM_REVERSED',
      'CLAIM_SUPERSEDED',
      'VERSION_NOT_SIGNED_OFF',
      'VERSION_NOT_IN_FORCE',
      'RELEASE_WITHDRAWN',
      'PER_VISIT_REVIEW',
      'NCCI_REVIEW',
      'WRITTEN_OFF',
    ]);
  });

  it('judges a per-visit line with its visit: at most the visit’s net shortfall, none when the visit was paid in full, and held for review (Q44)', () => {
    // The payer spread the visit over its lines: the carrier looks short, the visit as a whole is not.
    expect(judgeLine(facts({ varianceCents: 4566n as Cents, visitVarianceCents: -234n as Cents }), FIVE, AS_OF)).toEqual({ validated: false, actionable: false, reasons: [], validatedCents: null });
    expect(judgeLine(facts({ varianceCents: 4236n as Cents, visitVarianceCents: 0n as Cents }), FIVE, AS_OF).validated).toBe(false);
    // Short as a visit: validated at the visit's shortfall, never more than the carrier's own, and not actionable.
    expect(judgeLine(facts({ varianceCents: 1996n as Cents, visitVarianceCents: 496n as Cents }), FIVE, AS_OF)).toEqual({ validated: true, actionable: false, reasons: ['BELOW_LINE_MATERIALITY', 'PER_VISIT_REVIEW'], validatedCents: 496n });
    expect(judgeLine(facts({ varianceCents: 1996n as Cents, visitVarianceCents: 9000n as Cents }), FIVE, AS_OF)).toMatchObject({ reasons: ['PER_VISIT_REVIEW'], validatedCents: 1996n });
    // A line the visit expects zero of is overpaid when paid anything: never validated.
    expect(judgeLine(facts({ varianceCents: -2500n as Cents, visitVarianceCents: 496n as Cents }), FIVE, AS_OF).validated).toBe(false);
  });

  it('holds a line with an NCCI procedure-to-procedure review flag for a person’s review (Q41)', () => {
    expect(judgeLine(facts({ reviewFlags: ['NCCI_PTP'] }), FIVE, AS_OF)).toEqual({ validated: true, actionable: false, reasons: ['NCCI_REVIEW'], validatedCents: 3000n });
  });

  it('takes the visit’s shortfall only where the visit as a whole was paid short (property)', () => {
    fc.assert(
      fc.property(fc.option(fc.bigInt({ min: -10_000n, max: 10_000n }), { nil: null }), fc.option(fc.bigInt({ min: -10_000n, max: 10_000n }), { nil: null }), (variance, visit) => {
        const shortfall = shortfallOf(variance as Cents | null, visit as Cents | null);
        if (variance === null || variance <= 0n || (visit !== null && visit <= 0n)) {
          expect(shortfall).toBeNull();
        } else {
          expect(shortfall).toBe(visit === null || visit > variance ? variance : visit);
          expect((shortfall as bigint) > 0n && (shortfall as bigint) <= variance).toBe(true);
        }
      }),
    );
  });

  it('is actionable exactly when no reason holds, and lists every reason that does in order (property)', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 100_000n }),
        fc.option(fc.constantFrom('2026-09-30', '2026-10-15', '2027-01-31'), { nil: null }),
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom('signed_off', 'superseded'),
        fc.boolean(),
        fc.constantFrom<TriageFacts['deadlineStatus']>('verified', 'unverified'),
        fc.boolean(),
        fc.boolean(),
        (variance, window, reversed, superseded, status, writtenOff, deadlineStatus, covers, withdrawn) => {
          const judged = judgeLine(
            facts({
              varianceCents: variance as Cents,
              windowEndsOn: window,
              deadlineStatus,
              claimReversed: reversed,
              claimSuperseded: superseded,
              contractVersionStatus: status,
              contractVersionCoversService: covers,
              releaseWithdrawn: withdrawn,
              writtenOff,
            }),
            FIVE,
            AS_OF,
          );
          expect(judged.validated).toBe(true);
          expect(judged.actionable).toBe(judged.reasons.length === 0);
          expect(judged.reasons).toEqual(NOT_ACTIONABLE_REASONS.filter((reason) => judged.reasons.includes(reason)));
          expect(judged.reasons.includes('BELOW_LINE_MATERIALITY')).toBe(variance < 500n);
          expect(judged.actionable && (window === null || window < AS_OF)).toBe(false);
          expect(judged.reasons.includes('DEADLINE_UNVERIFIED')).toBe(deadlineStatus === 'unverified');
          expect(judged.reasons.includes('VERSION_NOT_IN_FORCE')).toBe(!covers);
          expect(judged.reasons.includes('RELEASE_WITHDRAWN')).toBe(withdrawn);
        },
      ),
    );
  });
});
