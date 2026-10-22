import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MonthsWaitingOnLocation } from './location';
import { splitChangeText, SplitChangeText } from './diff';

/**
 * What a re-run's diff says when the runs pinned different place-of-service splits (docs/adr/0064), and the months
 * waiting on the billing ZIP as a table a keyboard reaches at a phone's width. SYNTHETIC values.
 */

/** A run's pinned split: its ID, and when it was approved (null with no split). */
const split = (id: string | null, approvedAt: string | null = id === null ? null : '2026-10-01T09:30:00Z') => ({
  placeOfServiceSplitId: id,
  placeOfServiceSplitApprovedAt: approvedAt === null ? null : new Date(approvedAt),
});
const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('the split a re-run’s diff names', () => {
  it('says nothing when both runs pinned the same split, or neither pinned one', () => {
    expect(renderToStaticMarkup(<SplitChangeText before={split('a')} after={split('a')} />)).toBe('');
    expect(renderToStaticMarkup(<SplitChangeText before={split(null)} after={split(null)} />)).toBe('');
  });

  it('never says the runs priced under different approvals when the earlier run had no split at all', () => {
    const added = renderToStaticMarkup(<SplitChangeText before={split(null)} after={split('b', '2026-10-20T14:05:00Z')} />);
    expect(text(added)).toBe(splitChangeText('added', null, new Date('2026-10-20T14:05:00Z')));
    expect(added).toContain('data-split-change="added"');
    expect(text(added)).not.toContain('different approvals');
    expect(text(renderToStaticMarkup(<SplitChangeText before={split('a')} after={split(null)} />))).toBe(splitChangeText('removed', new Date('2026-10-01T09:30:00Z'), null));
    expect(text(renderToStaticMarkup(<SplitChangeText before={split('a')} after={split('b', '2026-10-20T14:05:00Z')} />))).toBe(
      splitChangeText('both', new Date('2026-10-01T09:30:00Z'), new Date('2026-10-20T14:05:00Z')),
    );
  });

  it('names when each split was approved (review of PR 6b-2, finding 16)', () => {
    const before = new Date('2026-10-01T09:30:00Z');
    const after = new Date('2026-10-20T14:05:00Z');
    expect(splitChangeText('both', before, after)).toBe(
      'Places of service set from the approved split: the earlier run priced under the split approved 2026-10-01 09:30 UTC and this run under the one approved 2026-10-20 14:05 UTC, so a place the practice has not set may price at the other rate.',
    );
    expect(splitChangeText('added', null, after)).toBe(
      'The earlier run priced with no approved split; this run takes the split approved 2026-10-20 14:05 UTC for every place the practice has not set, so such a place may now price, or price at the other rate.',
    );
    expect(splitChangeText('removed', before, null)).toBe(
      'The earlier run took the split approved 2026-10-01 09:30 UTC for every place the practice had not set; this run priced with no approved split, so such a place may no longer price, or price at the other rate.',
    );
  });
});

describe('the months waiting on the billing ZIP', () => {
  it('scroll sideways inside a named region the keyboard reaches (scrollable-region-focusable)', () => {
    const html = renderToStaticMarkup(
      <MonthsWaitingOnLocation
        label="Months waiting on the billing ZIP"
        months={[
          {
            periodFrom: '2026-03-01',
            periodTo: '2026-03-31',
            kind: 'location_not_ready',
            status: 'zip_plus_four_needed',
            text: 'Medicare splits ZIP 00012 between payment localities. Add its ZIP+4.',
            totals: { lines: 3, claims: 1, chargeCents: '45000', paidCents: '16800' },
          },
        ]}
      />,
    );
    expect(html).toMatch(/^<div role="region" aria-label="Months waiting on the billing ZIP, scrolls sideways" tabindex="0"/);
    expect(html).toContain('<table class="w-full min-w-[36rem] text-left text-sm" aria-label="Months waiting on the billing ZIP">');
  });
});
