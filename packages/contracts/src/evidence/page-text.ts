import { createHash } from 'node:crypto';

import { z } from 'zod';

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

/** How intake stores a document's page texts, sealed beside the original (docs/adr/0033). */
export const STORED_PAGE_TEXT_FORMAT = 'tp-page-text/1';

const storedPageText = z.strictObject({ format: z.literal(STORED_PAGE_TEXT_FORMAT), pages: z.array(z.string()) });

/** A document's page texts as intake stores them. */
export function serializePageText(pages: readonly string[]): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify({ format: STORED_PAGE_TEXT_FORMAT, pages })}\n`);
}

/** The page texts intake stored; throws a ZodError (or a SyntaxError) for anything else. */
export function parsePageText(bytes: Uint8Array): string[] {
  return storedPageText.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))).pages;
}
