import { createHash } from 'node:crypto';

/**
 * A page's text as evidence compares it (PRD 9: evidence is "the quoted text, the hash of the page
 * image or text"). Extraction differs in whitespace from one tool to the next (line breaks, runs of
 * spaces, a ligature or a non-breaking space), so both the quote check and the hash read the page
 * after one normalization: Unicode NFKC, every run of whitespace as one space, trimmed. Letters,
 * digits, punctuation and case are kept exactly, so "$32.00" never matches "$3200".
 */
export function normalizePageText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

/** The SHA-256 (hex) of a page's normalized text: the `hash` a citation stores. */
export function pageTextHash(text: string): string {
  return createHash('sha256').update(normalizePageText(text), 'utf8').digest('hex');
}

/** Whether the quote, normalized, appears in the page's normalized text. An empty quote never does. */
export function quoteOnPage(quote: string, pageText: string): boolean {
  const wanted = normalizePageText(quote);
  return wanted !== '' && normalizePageText(pageText).includes(wanted);
}
