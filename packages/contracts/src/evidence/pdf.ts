import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * The text of each page of a text PDF, read with pdf.js (Mozilla's PDF reader, running without a
 * worker, scripts, fonts or a canvas: only the text layer is read). A page with no text layer (a
 * scanned image) comes back as an empty string; evidence resolution then asks the scan reader.
 */

/** The bytes are not a PDF pdf.js can read (damaged, encrypted, or not a PDF at all). */
export class DocumentUnreadableError extends Error {
  override readonly name = 'DocumentUnreadableError';
}

interface TextItem {
  readonly str?: string;
  readonly hasEOL?: boolean;
}

/** Whether the bytes start like a PDF. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-';
}

/** Each page's text, in page order (index 0 is page 1). */
export async function pdfPageTexts(bytes: Uint8Array): Promise<string[]> {
  // pdf.js takes ownership of the buffer it is given, so it reads a copy.
  const task = getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: true,
    verbosity: 0,
  });
  try {
    const document = await task.promise.catch(() => {
      throw new DocumentUnreadableError('the document cannot be read as a PDF');
    });
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push((content.items as readonly TextItem[]).map((item) => `${item.str ?? ''}${item.hasEOL === true ? '\n' : ''}`).join(''));
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
