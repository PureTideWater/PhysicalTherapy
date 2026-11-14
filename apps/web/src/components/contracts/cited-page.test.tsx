import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { mendExtracted } from '../../lib/contracts/mend';
import type { CitedPage } from '../../lib/contracts/review';
import { CitedPageView } from './display';

/**
 * Queues item 41 (test matrix MOD-27): the document view shows a page's stored text through the Windows-1252 view
 * (mendExtracted) at render time. The stored text, its hash and every citation keep the characters as extracted.
 * SYNTHETIC text only. A C1 character is written as an escape, never as the character.
 */

describe('mendExtracted: a C1 character as the Windows-1252 character its byte stands for, one code unit for one', () => {
  it('reads the dashes, quotes, apostrophe, bullet and euro sign a payer’s letter writes', () => {
    expect(mendExtracted('Codes 97110\u009697112 \u0093as billed\u0094 \u0097 the plan\u0092s rate \u0095 \u008030')).toBe('Codes 97110–97112 “as billed” — the plan’s rate • €30');
  });

  it('reads U+0085, the line ending of mainframe text, as a line break', () => {
    expect(mendExtracted('Paid 150.00\u008501/05/2026')).toBe('Paid 150.00\n01/05/2026');
  });

  it('maps every byte Windows-1252 defines from 0x80 to 0x9F (0x85 as a line break), and leaves its five undefined bytes as they are', () => {
    const c1 = Array.from({ length: 32 }, (_unused, index) => String.fromCharCode(0x80 + index)).join('');
    const mended = mendExtracted(c1);
    expect(mended).toBe('€\u0081‚ƒ„\n†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ');
    expect(mended).toHaveLength(32);
  });

  it('keeps every other character, and the length of any text', () => {
    const text = 'Allowed $32.00 per unit; “quoted” – as written.\n\tNext line é ñ 日';
    expect(mendExtracted(text)).toBe(text);
    expect(mendExtracted(`a\u0096b\u0085c\u0081d`)).toHaveLength(7);
  });
});

describe('CitedPageView: the page’s text is shown through the Windows-1252 view', () => {
  const cited: CitedPage = {
    documentId: '00000000-0000-4000-8000-000000000041',
    page: 1,
    pageCount: 1,
    segments: [
      { text: 'Codes 97110\u009697112 are paid at ', quoted: false },
      { text: 'the plan\u0092s rate', quoted: true },
    ],
    recordId: 'synthetic-record-41',
    quoteFound: true,
    problem: null,
  };

  it('shows the dash and the apostrophe in plain and quoted text, and no C1 character', () => {
    const markup = renderToStaticMarkup(<CitedPageView cited={cited} pageHref={(page) => `/synthetic/${String(page)}`} />);
    expect(markup).toContain('Codes 97110–97112 are paid at ');
    expect(markup).toMatch(/<mark[^>]*>the plan’s rate<\/mark>/u);
    expect(markup).not.toMatch(/[\u0080-\u009f]/u);
  });

  it('changes nothing of the segments it is given', () => {
    renderToStaticMarkup(<CitedPageView cited={cited} pageHref={(page) => `/synthetic/${String(page)}`} />);
    expect(cited.segments[0]?.text).toBe('Codes 97110\u009697112 are paid at ');
  });
});
