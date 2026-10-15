import { type Cents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { NOT_ACTIONABLE_REASONS, type TriageFacts, judgeLine, windowOpen } from './actionable';

const facts = (overrides: Partial<TriageFacts> = {}): TriageFacts => ({
  varianceCents: 3000n as Cents,
  windowEndsOn: '2026-12-31',
  claimReversed: false,
  claimSuperseded: false,
  mappingKind: 'contract',
  contractVersionStatus: 'signed_off',
  writtenOff: false,
  ...overrides,
});
const FIVE = 500n as Cents;
const AS_OF = '2026-10-15';

describe('from validated to actionable (PRD 12)', () => {
  it('makes a material, open, signed-off line of a standing claim actionable', () => {
    expect(judgeLine(facts(), FIVE, AS_OF)).toEqual({ validated: true, actionable: true, reasons: [] });
  });

  it('never validates an unpriced line, a line paid exactly, or an overpayment (PRC-15)', () => {
    for (const varianceCents of [null, 0n as Cents, -1200n as Cents]) {
      expect(judgeLine(facts({ varianceCents }), FIVE, AS_OF)).toEqual({ validated: false, actionable: false, reasons: [] });
    }
  });

  it('keeps a line below the line materiality validated, not actionable, and actionable at it exactly (CAS-05)', () => {
    expect(judgeLine(facts({ varianceCents: 300n as Cents }), FIVE, AS_OF)).toEqual({ validated: true, actionable: false, reasons: ['BELOW_LINE_MATERIALITY'] });
    expect(judgeLine(facts({ varianceCents: 500n as Cents }), FIVE, AS_OF).actionable).toBe(true);
  });

  it('keeps a line whose window passed on the triage date validated with WINDOW_PASSED (PRC-14); the last day is still open', () => {
    expect(judgeLine(facts({ windowEndsOn: '2026-10-14' }), FIVE, AS_OF)).toMatchObject({ validated: true, actionable: false, reasons: ['WINDOW_PASSED'] });
    expect(judgeLine(facts({ windowEndsOn: AS_OF }), FIVE, AS_OF).actionable).toBe(true);
    expect(judgeLine(facts({ windowEndsOn: null }), FIVE, AS_OF).reasons).toEqual(['NO_WINDOW']);
    expect(windowOpen(null, AS_OF)).toBe(false);
  });

  it('refuses reversed and superseded claims and versions no longer signed off; Medicare Advantage lines need no version', () => {
    expect(judgeLine(facts({ claimReversed: true }), FIVE, AS_OF).reasons).toEqual(['CLAIM_REVERSED']);
    expect(judgeLine(facts({ claimSuperseded: true }), FIVE, AS_OF).reasons).toEqual(['CLAIM_SUPERSEDED']);
    expect(judgeLine(facts({ contractVersionStatus: 'superseded' }), FIVE, AS_OF).reasons).toEqual(['VERSION_NOT_SIGNED_OFF']);
    expect(judgeLine(facts({ mappingKind: 'ma_noncontracted', contractVersionStatus: null }), FIVE, AS_OF).actionable).toBe(true);
    expect(judgeLine(facts({ writtenOff: true }), FIVE, AS_OF).reasons).toEqual(['WRITTEN_OFF']);
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
        (variance, window, reversed, superseded, status, writtenOff) => {
          const judged = judgeLine(facts({ varianceCents: variance as Cents, windowEndsOn: window, claimReversed: reversed, claimSuperseded: superseded, contractVersionStatus: status, writtenOff }), FIVE, AS_OF);
          expect(judged.validated).toBe(true);
          expect(judged.actionable).toBe(judged.reasons.length === 0);
          expect(judged.reasons).toEqual(NOT_ACTIONABLE_REASONS.filter((reason) => judged.reasons.includes(reason)));
          expect(judged.reasons.includes('BELOW_LINE_MATERIALITY')).toBe(variance < 500n);
          expect(judged.actionable && (window === null || window < AS_OF)).toBe(false);
        },
      ),
    );
  });
});
