/**
 * The cited page as the Rate record review screen shows it (PRD 7: "side by side: cited page and the
 * abstracted fields ... each field shows its quote and page"): the page's text, with the quote marked
 * where it appears. Evidence compares text after one normalization (packages/contracts, page-text.ts:
 * NFKC, every run of whitespace as one space), so the quote is found the same way here: in the page's
 * NFKC text, its words in order with any whitespace between them. Plain functions: safe in the browser.
 */

export interface PageSegment {
  readonly text: string;
  readonly quoted: boolean;
}

export interface HighlightedPage {
  readonly segments: readonly PageSegment[];
  /** Whether the quote was found on the page. */
  readonly found: boolean;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The page's text split around every place the quote appears (none when the quote is blank or absent). */
export function highlightQuote(pageText: string, quote: string | null): HighlightedPage {
  const text = pageText.normalize('NFKC');
  const words = (quote ?? '').normalize('NFKC').trim().split(/\s+/u).filter((word) => word !== '');
  if (words.length === 0) {
    return { segments: text === '' ? [] : [{ text, quoted: false }], found: false };
  }
  const pattern = new RegExp(words.map(escapeRegExp).join('\\s+'), 'gu');
  const segments: PageSegment[] = [];
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > at) {
      segments.push({ text: text.slice(at, start), quoted: false });
    }
    segments.push({ text: match[0], quoted: true });
    at = start + match[0].length;
  }
  if (at < text.length) {
    segments.push({ text: text.slice(at), quoted: false });
  }
  return { segments, found: segments.some((segment) => segment.quoted) };
}
