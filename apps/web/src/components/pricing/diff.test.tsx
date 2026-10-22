import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MonthsWaitingOnLocation } from './location';
import { SPLIT_CHANGE_TEXT, SplitChangeText } from './diff';

/**
 * What a re-run's diff says when the runs pinned different place-of-service splits (docs/adr/0064), and the months
 * waiting on the billing ZIP as a table a keyboard reaches at a phone's width. SYNTHETIC values.
 */

const split = (id: string | null) => ({ placeOfServiceSplitId: id });
const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('the split a re-run’s diff names', () => {
  it('says nothing when both runs pinned the same split, or neither pinned one', () => {
    expect(renderToStaticMarkup(<SplitChangeText before={split('a')} after={split('a')} />)).toBe('');
    expect(renderToStaticMarkup(<SplitChangeText before={split(null)} after={split(null)} />)).toBe('');
  });

  it('never says the runs priced under different approvals when the earlier run had no split at all', () => {
    const added = renderToStaticMarkup(<SplitChangeText before={split(null)} after={split('b')} />);
    expect(text(added)).toBe(SPLIT_CHANGE_TEXT.added);
    expect(added).toContain('data-split-change="added"');
    expect(text(added)).not.toContain('different approvals');
    expect(text(renderToStaticMarkup(<SplitChangeText before={split('a')} after={split(null)} />))).toBe(SPLIT_CHANGE_TEXT.removed);
    expect(text(renderToStaticMarkup(<SplitChangeText before={split('a')} after={split('b')} />))).toBe(SPLIT_CHANGE_TEXT.both);
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
