import { type Cents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type CaseLineState, caseTotals, daysBetween, deadlineState, netExpectedValue, pursuitCost, windowsClosed, writeOffSchema } from './cases';

const line = (id: string, variance: bigint, windowEndsOn: string | null, writtenOff = false): CaseLineState => ({ serviceLineId: id, varianceCents: variance as Cents, windowEndsOn, writtenOff });

describe('case totals and deadlines (PRD 12)', () => {
  it('totals the lines not written off and keeps the written-off ones visible beside it (CAS-06)', () => {
    const totals = caseTotals([line('a', 3000n, '2026-12-01'), line('b', 2000n, '2026-11-20', true), line('c', 4000n, '2027-01-10')]);
    expect(totals).toEqual({ actionableCents: 7000n, actionableLines: 2, writtenOffLines: 1, writtenOffCents: 2000n, deadlineOn: '2026-12-01' });
    expect(caseTotals([line('a', 3000n, '2026-12-01', true)])).toMatchObject({ actionableCents: 0n, deadlineOn: null });
  });

  it('finds the lines whose windows closed before the triage date', () => {
    const lines = [line('b', 1n, '2026-10-14'), line('a', 1n, '2026-10-01'), line('c', 1n, '2026-10-15'), line('d', 1n, '2026-09-01', true), line('e', 1n, null)];
    expect(windowsClosed(lines, '2026-10-15')).toEqual(['a', 'b']);
  });

  it('colors a deadline passed, within fourteen days, or later', () => {
    expect(deadlineState(null, '2026-10-15')).toBe('none');
    expect(deadlineState('2026-10-14', '2026-10-15')).toBe('passed');
    expect(deadlineState('2026-10-29', '2026-10-15')).toBe('soon');
    expect(deadlineState('2026-10-30', '2026-10-15')).toBe('later');
    expect(daysBetween('2026-10-15', '2026-11-15')).toBe(31);
  });

  it('always totals the case as the sum of its actionable lines (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.record({ variance: fc.bigInt({ min: 1n, max: 1_000_000n }), off: fc.boolean() })), (items) => {
        const lines = items.map((item, index) => line(String(index), item.variance, '2027-01-01', item.off));
        const totals = caseTotals(lines);
        expect(totals.actionableCents + totals.writtenOffCents).toBe(items.reduce((sum, item) => sum + item.variance, 0n));
        expect(totals.actionableCents).toBe(items.filter((item) => !item.off).reduce((sum, item) => sum + item.variance, 0n));
      }),
    );
  });
});

describe('pursuit cost (PRD 12, Deadlines and pursuit cost)', () => {
  it('estimates one packet and one follow-up at the staff rate, rounded half up to the cent', () => {
    expect(pursuitCost({ staffRateCentsPerHour: 4500n as Cents, minutesPerPacket: 90, minutesPerFollowUp: 20 })).toBe(8250n);
    // 37.37 an hour for 7 minutes: 4.3598...
    expect(pursuitCost({ staffRateCentsPerHour: 3737n as Cents, minutesPerPacket: 5, minutesPerFollowUp: 2 })).toBe(436n);
    expect(pursuitCost(null)).toBeNull();
  });

  it('nets the estimate from the actionable total, or says nothing without one', () => {
    expect(netExpectedValue(28000n as Cents, 8250n as Cents)).toBe(19750n);
    expect(netExpectedValue(28000n as Cents, null)).toBeNull();
  });
});

describe('write-offs (PRD 12, Write-offs and reopening)', () => {
  it('takes a reason from the closed list, with text for "other" and only for it', () => {
    expect(writeOffSchema.parse({ reason: 'duplicate' })).toEqual({ reason: 'duplicate', text: null });
    expect(writeOffSchema.parse({ reason: 'other', text: ' Payer letter on file ' })).toEqual({ reason: 'other', text: 'Payer letter on file' });
    expect(writeOffSchema.safeParse({ reason: 'other' }).success).toBe(false);
    expect(writeOffSchema.safeParse({ reason: 'other', text: '' }).success).toBe(false);
    expect(writeOffSchema.safeParse({ reason: 'duplicate', text: 'why' }).success).toBe(false);
    expect(writeOffSchema.safeParse({ reason: 'forgot' }).success).toBe(false);
  });
});
