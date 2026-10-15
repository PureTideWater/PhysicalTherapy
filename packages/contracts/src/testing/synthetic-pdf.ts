/**
 * A minimal PDF writer for synthetic contract documents in tests (CLAUDE.md: synthetic data only;
 * PRD 16, Development data boundary). Each page is either lines of text in Helvetica (a text PDF,
 * which pdf.js reads) or `{ scanned: true }`, a page with a drawing and no text layer, which stands
 * for a scanned image and sends evidence resolution to the scan reader. Every byte is generated here;
 * nothing is copied from a real contract.
 */

export type SyntheticPage = readonly string[] | { readonly scanned: true };

function escapeText(text: string): string {
  if (!/^[\x20-\x7e]*$/.test(text)) {
    throw new Error('synthetic PDF text is printable ASCII');
  }
  return text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function contentStream(page: SyntheticPage): string {
  if (!Array.isArray(page)) {
    // A filled rectangle and no text: what a scanned page looks like to a text extractor.
    return '0.5 g 72 72 468 648 re f';
  }
  const lines = (page as readonly string[]).map((line, index) => `${index === 0 ? '' : '0 -14 Td '}(${escapeText(line)}) Tj`);
  return `BT /F1 11 Tf 72 720 Td ${lines.join(' ')} ET`;
}

/** The bytes of a PDF with the given pages, in order. */
export function syntheticPdf(pages: readonly SyntheticPage[]): Uint8Array {
  if (pages.length === 0) {
    throw new Error('a synthetic PDF has at least one page');
  }
  // Objects: 1 catalog, 2 pages, 3 font, then a page object and its content stream per page.
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${String(id)} 0 R`).join(' ')}] /Count ${String(pages.length)} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  pages.forEach((page, index) => {
    const pageId = 4 + index * 2;
    const stream = contentStream(page);
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${String(pageId + 1)} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${String(Buffer.byteLength(stream, 'latin1'))} >>\nstream\n${stream}\nendstream`;
  });
  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(body, 'latin1');
    body += `${String(id)} 0 obj\n${objects[id] ?? ''}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${String(objects.length)}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    body += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${String(objects.length)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, 'latin1'));
}
