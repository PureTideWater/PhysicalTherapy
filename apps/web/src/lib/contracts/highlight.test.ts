import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { highlightQuote } from './highlight';

const PAGE = 'Article 2. Compensation\nPayer shall reimburse Covered Services at 110% of the\nMedicare Physician Fee Schedule in effect on the date of service.';

describe('the cited page with its quote marked', () => {
  it('marks the quote across line breaks and runs of spaces, as evidence compares text', () => {
    const page = highlightQuote(PAGE, '110%   of the Medicare Physician Fee Schedule');
    expect(page.found).toBe(true);
    expect(page.segments).toEqual([
      { text: 'Article 2. Compensation\nPayer shall reimburse Covered Services at ', quoted: false },
      { text: '110% of the\nMedicare Physician Fee Schedule', quoted: true },
      { text: ' in effect on the date of service.', quoted: false },
    ]);
  });

  it('marks every place the quote appears, and nothing when it is absent or blank', () => {
    expect(highlightQuote('97110 $32.00; again 97110 $32.00', '97110 $32.00').segments.filter((segment) => segment.quoted)).toHaveLength(2);
    expect(highlightQuote(PAGE, '120% of the Medicare')).toEqual({ segments: [{ text: PAGE, quoted: false }], found: false });
    expect(highlightQuote(PAGE, '   ')).toEqual({ segments: [{ text: PAGE, quoted: false }], found: false });
    expect(highlightQuote(PAGE, null).found).toBe(false);
    expect(highlightQuote('', null)).toEqual({ segments: [], found: false });
  });

  it('treats the quote as text, never as a pattern, and reads the page in NFKC as evidence does', () => {
    expect(highlightQuote('a (b) [c] $1.00 *x*', '(b) [c] $1.00').found).toBe(true);
    expect(highlightQuote('abc', 'a.c').found).toBe(false);
    expect(highlightQuote('ﬁnal schedule', 'final schedule').found).toBe(true);
  });

  it('keeps every character of the page, in order', () => {
    fc.assert(
      fc.property(fc.string(), fc.string({ maxLength: 8 }), (page, quote) => {
        const result = highlightQuote(page, quote);
        expect(result.segments.map((segment) => segment.text).join('')).toBe(page.normalize('NFKC'));
      }),
    );
  });
});
