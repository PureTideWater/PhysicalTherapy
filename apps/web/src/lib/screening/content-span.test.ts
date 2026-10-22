import { describe, expect, it } from 'vitest';

import { quarterRowsLayBefore } from './content-span';

/**
 * Where a screening's Medicare rows left out for their quarter lay, as its result says it (the founder's answer of
 * 2026-10-21 to PR 6b's Q6 (a); the "before {Q}" wording L3 inferred, for the founder and counsel): pinned at fixed
 * dates, never recomputed from the clock. SYNTHETIC content runs.
 */

const content2026 = [{ from: '2026-Q1', to: '2026-Q4' }];

describe('where the rows left out for their quarter lay', () => {
  it('lay before the content’s first quarter when the content is one run reaching the screening’s own quarter', () => {
    expect(quarterRowsLayBefore(content2026, new Date('2026-11-15T12:00:00Z'))).toBe('2026-Q1');
    expect(quarterRowsLayBefore([{ from: '2026-Q1', to: '2026-Q3' }], new Date('2026-08-01T00:00:00Z'))).toBe('2026-Q1');
  });

  it('cannot be said when the content ends before the screening’s quarter, has a gap, or is not loaded', () => {
    // Content as of 2027-Q2 still ends 2026-Q4: a row may lie after it.
    expect(quarterRowsLayBefore(content2026, new Date('2027-05-15T12:00:00Z'))).toBeNull();
    expect(
      quarterRowsLayBefore(
        [
          { from: '2025-Q1', to: '2025-Q4' },
          { from: '2026-Q2', to: '2026-Q4' },
        ],
        new Date('2026-11-15T12:00:00Z'),
      ),
    ).toBeNull();
    expect(quarterRowsLayBefore([], new Date('2026-11-15T12:00:00Z'))).toBeNull();
  });
});
