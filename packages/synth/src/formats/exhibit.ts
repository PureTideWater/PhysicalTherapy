/**
 * Synthetic contract exhibits for the contract repository and the model gateway (test matrix CON and
 * MOD cases): invented parties, terms and rates, written as text (pages separated by form feeds) and
 * as a simple PDF with the same pages. Every page says SYNTHETIC; none is a real agreement.
 */
import { writePdf } from './pdf';

export interface ExhibitPage {
  readonly heading: string;
  readonly lines: readonly string[];
}

export interface Exhibit {
  readonly title: string;
  readonly pages: readonly ExhibitPage[];
}

export const EXHIBIT_BANNER = 'SYNTHETIC CONTRACT EXHIBIT - INVENTED TERMS - NOT A REAL AGREEMENT';

/** The lines of each page as both renderings carry them. */
export function exhibitPageLines(exhibit: Exhibit): string[][] {
  return exhibit.pages.map((page, index) => [
    EXHIBIT_BANNER,
    exhibit.title,
    `Page ${String(index + 1)} of ${String(exhibit.pages.length)}`,
    '',
    page.heading,
    '',
    ...page.lines,
  ]);
}

/** Text, one page per form feed. */
export function exhibitText(exhibit: Exhibit): string {
  return `${exhibitPageLines(exhibit)
    .map((lines) => lines.join('\n'))
    .join('\n\f\n')}\n`;
}

export function exhibitPdf(exhibit: Exhibit): Uint8Array {
  return writePdf(exhibitPageLines(exhibit), exhibit.title);
}
