/**
 * A minimal, deterministic PDF writer for the synthetic contract exhibits: one page per exhibit page,
 * Helvetica text, no timestamps and a fixed document ID, so the same exhibit always gives the same
 * bytes. The text of every page can be found in the file as written (uncompressed content streams).
 */

/** The Producer of every exhibit PDF this writer makes; the fixture guard refuses a PDF that names no synthetic writer. */
export const EXHIBIT_PRODUCER = 'packages/synth SYNTHETIC exhibit writer';

function escapeText(line: string): string {
  if (!/^[\x20-\x7e]*$/.test(line)) {
    throw new Error('PDF exhibit text is printable ASCII');
  }
  return line.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

/** Each page is a list of lines. */
export function writePdf(pages: readonly (readonly string[])[], title: string): Uint8Array {
  if (pages.length === 0) {
    throw new Error('a PDF has at least one page');
  }
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${String(id)} 0 R`).join(' ')}] /Count ${String(pages.length)} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  pages.forEach((lines, index) => {
    const pageId = pageIds[index] ?? 0;
    const content = ['BT', '/F1 10 Tf', '14 TL', '54 738 Td', ...lines.map((line) => `(${escapeText(line)}) Tj T*`), 'ET'].join('\n');
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${String(pageId + 1)} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${String(Buffer.byteLength(content, 'latin1'))} >>\nstream\n${content}\nendstream`;
  });
  const infoId = objects.length;
  objects[infoId] = `<< /Title (${escapeText(title)}) /Producer (${EXHIBIT_PRODUCER}) >>`;
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(body, 'latin1');
    body += `${String(id)} 0 obj\n${objects[id] ?? ''}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${String(objects.length)}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    body += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  const docId = '53594e5448455449432045584849424954';
  body += `trailer\n<< /Size ${String(objects.length)} /Root 1 0 R /Info ${String(infoId)} 0 R /ID [<${docId}> <${docId}>] >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, 'latin1'));
}
