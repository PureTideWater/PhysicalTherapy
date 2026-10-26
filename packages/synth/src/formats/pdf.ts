/**
 * A minimal, deterministic PDF writer for the synthetic contract exhibits: one page per exhibit page,
 * Helvetica text, no timestamps and a fixed document ID, so the same exhibit always gives the same
 * bytes. The text of every page can be found in the file as written (uncompressed content streams).
 *
 * writePdf writes plain lines and is what every committed v1 exhibit was written with; it never
 * changes, so their bytes never do. writeRichPdf (the contract set v2, docs/adr/0070 Part 1) writes the
 * same page model with what a person sees differently from what a text reader reads: a figure struck
 * through, or a line in invisible (render mode 3) or white text.
 */

/** The Producer of every exhibit PDF this writer makes; the fixture guard refuses a PDF that names no synthetic writer. */
export const EXHIBIT_PRODUCER = 'packages/synth SYNTHETIC exhibit writer';

/** A line's text as a PDF string's contents: printable ASCII, its backslashes and parentheses escaped. */
export function escapeText(line: string): string {
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

/** A character range of a line, [start, end), as it is drawn. */
export interface LineSpan {
  readonly start: number;
  readonly end: number;
}

/**
 * A line of a rich page. `struck` ranges are drawn with a line through them (a person reads them as
 * withdrawn; a text reader reads them as ordinary text). `render` 'invisible' draws the text in render
 * mode 3 (no paint at all) and 'white' in white fill on the white page: a person sees nothing, a text
 * reader reads the line.
 */
export interface RichLine {
  readonly text: string;
  readonly struck?: readonly LineSpan[];
  readonly render?: 'visible' | 'invisible' | 'white';
}

/** A rich page: plain lines as text, or lines with how they are drawn. */
export type RichPage = readonly (string | RichLine)[];

/**
 * Helvetica's advance widths (thousandths of the font size) for printable ASCII, 0x20 to 0x7e, from
 * the font's standard metrics: where a struck figure starts and ends on its line.
 */
const HELVETICA_WIDTHS: readonly number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** The width of Helvetica text at `size` points. */
export function helveticaWidth(text: string, size: number): number {
  let width = 0;
  for (const character of text) {
    const advance = HELVETICA_WIDTHS[character.charCodeAt(0) - 0x20];
    if (advance === undefined) {
      throw new Error('PDF exhibit text is printable ASCII');
    }
    width += advance;
  }
  return (width * size) / 1000;
}

const FONT_SIZE = 10;
const LEADING = 14;
const LEFT = 54;
const FIRST_BASELINE = 738;
/** How far above the baseline a strike runs (about half the height of a figure at 10 points), and how thick. */
const STRIKE_RISE = 3;
const STRIKE_WIDTH = '0.8';

/** Two decimals at most, no trailing zeros: positions in a content stream, the same text every time. */
const coordinate = (value: number) => String(Math.round(value * 100) / 100);

/**
 * Each page is a list of lines, laid out exactly as writePdf lays them out (Helvetica 10 points, 14
 * points apart, from 54 738), so a page of plain lines is read the same from either writer. Each line
 * is one text-showing operator, whatever is struck through on it, so a text reader reads it as one run;
 * the strikes are drawn after the text, as 0.8-point lines 3 points above the baseline across the
 * struck characters' Helvetica widths. Invisible lines switch to render mode 3 and white lines to a
 * white fill for that line only.
 */
export function writeRichPdf(pages: readonly RichPage[], title: string): Uint8Array {
  if (pages.length === 0) {
    throw new Error('a PDF has at least one page');
  }
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${String(id)} 0 R`).join(' ')}] /Count ${String(pages.length)} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  pages.forEach((page, index) => {
    const pageId = pageIds[index] ?? 0;
    const text: string[] = ['BT', `/F1 ${String(FONT_SIZE)} Tf`, `${String(LEADING)} TL`, `${String(LEFT)} ${String(FIRST_BASELINE)} Td`];
    const strikes: string[] = [];
    page.forEach((entry, row) => {
      const line: RichLine = typeof entry === 'string' ? { text: entry } : entry;
      const shown = `(${escapeText(line.text)}) Tj T*`;
      if (line.render === 'invisible') {
        text.push('3 Tr', shown, '0 Tr');
      } else if (line.render === 'white') {
        text.push('1 g', shown, '0 g');
      } else {
        text.push(shown);
      }
      for (const span of line.struck ?? []) {
        if (span.start < 0 || span.end > line.text.length || span.start >= span.end) {
          throw new Error('a struck range lies inside its line');
        }
        const x = LEFT + helveticaWidth(line.text.slice(0, span.start), FONT_SIZE);
        const y = FIRST_BASELINE - row * LEADING + STRIKE_RISE;
        strikes.push(`${coordinate(x)} ${coordinate(y)} m ${coordinate(x + helveticaWidth(line.text.slice(span.start, span.end), FONT_SIZE))} ${coordinate(y)} l S`);
      }
    });
    text.push('ET');
    const content = [...text, ...(strikes.length === 0 ? [] : ['q', `${STRIKE_WIDTH} w`, ...strikes, 'Q'])].join('\n');
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
