import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
// pdf.js runs its worker in this thread from the module that registers itself (as the page reader does,
// packages/contracts/src/evidence/page-thread.ts).
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';

/**
 * For the tests: where a printed PDF set each run of text, and at what size, in points on the page (pdf.js's
 * text layer). A document Chromium shrank to fit prints every run smaller than its stylesheet says and nearer
 * the top left corner, so the cover's headline and the inside pages' running header give the print's scale.
 */
export interface PrintedText {
  /** 1-based. */
  readonly page: number;
  readonly text: string;
  /** Points from the page's left edge. */
  readonly x: number;
  /** The text's size in points, as printed. */
  readonly size: number;
}

export async function printedText(pdf: Uint8Array): Promise<PrintedText[]> {
  const task = getDocument({ data: new Uint8Array(pdf), disableFontFace: true, useSystemFonts: false, stopAtErrors: true, verbosity: 0 });
  try {
    const document = await task.promise;
    const runs: PrintedText[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if ('str' in item && item.str.trim() !== '') {
          const [a = 0, b = 0, , , x = 0] = item.transform as number[];
          runs.push({ page: number, text: item.str, x, size: Math.hypot(a, b) });
        }
      }
      page.cleanup();
    }
    return runs;
  } finally {
    await task.destroy();
  }
}
