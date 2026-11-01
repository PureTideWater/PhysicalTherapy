import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { UtcTime, WholeDates } from './dates';
import { utc } from './format';

/**
 * Dates kept whole in a table cell or beside other words (docs/adr/0078 Decision 1; the UX review of PR #79,
 * UX-PR79-02): a moment breaks only between its date and its time, a date in words never at its hyphen, and the text
 * is the same as before.
 */

const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('dates kept whole', () => {
  it('render a moment as its date and its time, each whole, with utc’s words', () => {
    const html = renderToStaticMarkup(<UtcTime at="2026-10-27T19:14:05Z" />);
    expect(html).toBe('<span class="whitespace-nowrap">2026-10-27</span> <span class="whitespace-nowrap">19:14 UTC</span>');
    expect(text(html)).toBe(utc('2026-10-27T19:14:05Z'));
  });

  it('render no moment as utc’s dash, with nothing to keep whole', () => {
    expect(renderToStaticMarkup(<UtcTime at={null} />)).toBe('—');
  });

  it('keep every date in words whole and the words as they were', () => {
    const words = '2026-01-01 through 2026-12-31';
    const html = renderToStaticMarkup(<WholeDates text={words} />);
    expect(html).toBe('<span class="whitespace-nowrap">2026-01-01</span> through <span class="whitespace-nowrap">2026-12-31</span>');
    expect(text(html)).toBe(words);
    expect(renderToStaticMarkup(<WholeDates text="Nothing due" />)).toBe('Nothing due');
  });
});
