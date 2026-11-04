import { randomUUID } from 'node:crypto';

import { MONITOR_MONTHS_LIMIT } from '@tp/worker/pricing';
import { describe, expect, it } from 'vitest';

import { type MonthAwaitingMappings, type MonthHeld, monthsToQueue, monthsWaitingForMappings } from './mapped-plan';

/**
 * The pure rules over the months no run covers (design 4.1; D2b, D20; PR #95 review F3, F7, UX-2), on hand-built
 * months: no database. Plan IDs are random; dates are first days of months.
 */

const [A, B, B2, C, D] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];

function month(periodFrom: string, planIds: readonly string[], unmappedPlanIds: readonly string[], held: MonthHeld = null): MonthAwaitingMappings {
  return {
    periodFrom,
    periodTo: periodFrom.replace(/-01$/, '-28'),
    planIds: [...planIds].sort(),
    unmappedPlanIds: [...unmappedPlanIds].sort(),
    unmappedPlans: unmappedPlanIds.length,
    mappedPlans: planIds.length - unmappedPlanIds.length,
    mappedLines: 0,
    linesToPrice: 0,
    unmappedLines: 0,
    chargeCents: '0',
    held,
  };
}

describe('monthsToQueue (D2b, D20)', () => {
  // F3: a complete month that does not hold the plan just mapped queues nothing when that mapping completes no month.
  it('F3: names nothing when the mapping completes no month holding its plan, even with another month complete', () => {
    const months = [month('2026-01-01', [A, B], []), month('2026-02-01', [A, C, B2], [B2])];
    expect(monthsToQueue(months, C)).toEqual([]);
  });

  it('names every complete month, oldest first, whichever plans it holds, once a mapping completes one holding its plan (D20)', () => {
    const months = [month('2026-01-01', [A, B], []), month('2026-02-01', [A, B2], [B2]), month('2026-03-01', [A, C], [])];
    expect(monthsToQueue(months, C)).toEqual(['2026-01-01', '2026-03-01']);
  });

  it('names at most MONITOR_MONTHS_LIMIT months, the oldest', () => {
    const months = Array.from({ length: MONITOR_MONTHS_LIMIT + 3 }, (_, index) => month(`${String(2000 + Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, '0')}-01`, [A], []));
    const named = monthsToQueue(months, A);
    expect(named).toHaveLength(MONITOR_MONTHS_LIMIT);
    expect(named[0]).toBe('2000-01-01');
  });

  it('never names a held month, complete or not', () => {
    expect(monthsToQueue([month('2026-01-01', [A], [], 'location'), month('2026-02-01', [A], [], 'content')], A)).toEqual([]);
  });
});

describe('monthsWaitingForMappings', () => {
  // F7: a month on a location or content hold that holds mapped and unmapped plans waits on the hold, not on mappings.
  it('F7: leaves out a mixed month held on the location or on Medicare content', () => {
    const months = [month('2026-01-01', [A, B], [B], 'location'), month('2026-02-01', [A, B], [B], 'content')];
    expect(monthsWaitingForMappings(months, null)).toEqual({ months: [], plans: 0, self: false });
    expect(monthsWaitingForMappings(months, B)).toEqual({ months: [], plans: 0, self: false });
  });

  // UX-2: the unmapped plan's own page counts the other plans apart from itself, and says it waits for its own mapping.
  it('UX-2: on an unmapped plan’s page, self is true and the other plans are counted apart (0, 1 and 2 others)', () => {
    const alone = [month('2026-01-01', [A, B], [B])];
    expect(monthsWaitingForMappings(alone, B)).toMatchObject({ plans: 0, self: true });
    const oneOther = [month('2026-01-01', [A, B, C], [B, C])];
    expect(monthsWaitingForMappings(oneOther, B)).toMatchObject({ plans: 1, self: true });
    const twoOthers = [month('2026-01-01', [A, B, C], [B, C]), month('2026-02-01', [A, B, D], [B, D])];
    expect(monthsWaitingForMappings(twoOthers, B)).toMatchObject({ plans: 2, self: true });
  });

  it('UX-2: on a mapped plan’s page, self is false and the plans it waits for are the others; for the practice, self is false', () => {
    const months = [month('2026-01-01', [A, B, C], [B, C])];
    expect(monthsWaitingForMappings(months, A)).toMatchObject({ plans: 2, self: false });
    expect(monthsWaitingForMappings(months, null)).toMatchObject({ plans: 2, self: false });
    // A plan of none of the months: nothing waits for it.
    expect(monthsWaitingForMappings(months, D)).toEqual({ months: [], plans: 0, self: false });
  });
});
