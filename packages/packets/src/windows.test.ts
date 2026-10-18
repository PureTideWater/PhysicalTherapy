import { describe, expect, it } from 'vitest';

import { nextDisputeWindow } from './windows';

describe('nextDisputeWindow', () => {
  it('opens the contract’s appeal level numbered after the denied dispute, from the denial', () => {
    const basis = { kind: 'contract', appealLevels: [{ level: 1, days: 60 }, { level: 2, days: 30 }] } as const;
    expect(nextDisputeWindow(basis, 1, '2026-10-01')).toEqual({ level: 2, endsOn: '2026-11-30' });
    expect(nextDisputeWindow(basis, 2, '2026-10-01')).toEqual({ level: 3, endsOn: '2026-10-31' });
    expect(nextDisputeWindow(basis, 3, '2026-10-01')).toBeNull();
    expect(nextDisputeWindow({ kind: 'contract', appealLevels: [] }, 1, '2026-10-01')).toBeNull();
  });

  it('opens Medicare reconsideration after a level-one denial of a Medicare Advantage non-contracted dispute', () => {
    expect(nextDisputeWindow({ kind: 'regulation', reconsideration: { length: 180, unit: 'days' } }, 1, '2026-10-01')).toEqual({ level: 2, endsOn: '2027-03-30' });
    expect(nextDisputeWindow({ kind: 'regulation', reconsideration: { length: 6, unit: 'months' } }, 1, '2026-08-31')).toEqual({ level: 2, endsOn: '2027-02-28' });
    expect(nextDisputeWindow({ kind: 'regulation', reconsideration: { length: 180, unit: 'days' } }, 2, '2026-10-01')).toBeNull();
    expect(nextDisputeWindow({ kind: 'regulation', reconsideration: null }, 1, '2026-10-01')).toBeNull();
  });
});
