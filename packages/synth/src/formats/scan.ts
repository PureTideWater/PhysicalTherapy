/**
 * Synthetic scans for the model gateway's evaluation set (PRD 14: "40 synthetic contracts and exhibits
 * of varied layouts (tables, prose, scanned)"): an exhibit's pages drawn as pictures of text, written
 * as a PDF whose pages hold one image each and no text layer, so a text reader (pdf.js) finds nothing
 * on them; and the text a scan reader (Amazon Textract's text detection) returns for those pages,
 * recorded beside them for the local stand-in that dev, tests and CI read instead of the service.
 *
 * Deterministic: a fixed 5x7 bitmap font, a seeded speckle pattern, zlib at a fixed level and a fixed
 * document ID, so the same pages always give the same bytes. Every page carries the synthetic banner.
 */
import { deflateSync } from 'node:zlib';

import { Random } from '../core/random';

/** The 5x7 glyphs for printable ASCII (0x20 to 0x7e), five columns each, bit 0 the top row. */
const FONT: readonly (readonly number[])[] = [
  [0x00, 0x00, 0x00, 0x00, 0x00], [0x00, 0x00, 0x5f, 0x00, 0x00], [0x00, 0x07, 0x00, 0x07, 0x00], [0x14, 0x7f, 0x14, 0x7f, 0x14],
  [0x24, 0x2a, 0x7f, 0x2a, 0x12], [0x23, 0x13, 0x08, 0x64, 0x62], [0x36, 0x49, 0x55, 0x22, 0x50], [0x00, 0x05, 0x03, 0x00, 0x00],
  [0x00, 0x1c, 0x22, 0x41, 0x00], [0x00, 0x41, 0x22, 0x1c, 0x00], [0x08, 0x2a, 0x1c, 0x2a, 0x08], [0x08, 0x08, 0x3e, 0x08, 0x08],
  [0x00, 0x50, 0x30, 0x00, 0x00], [0x08, 0x08, 0x08, 0x08, 0x08], [0x00, 0x60, 0x60, 0x00, 0x00], [0x20, 0x10, 0x08, 0x04, 0x02],
  [0x3e, 0x51, 0x49, 0x45, 0x3e], [0x00, 0x42, 0x7f, 0x40, 0x00], [0x42, 0x61, 0x51, 0x49, 0x46], [0x21, 0x41, 0x45, 0x4b, 0x31],
  [0x18, 0x14, 0x12, 0x7f, 0x10], [0x27, 0x45, 0x45, 0x45, 0x39], [0x3c, 0x4a, 0x49, 0x49, 0x30], [0x01, 0x71, 0x09, 0x05, 0x03],
  [0x36, 0x49, 0x49, 0x49, 0x36], [0x06, 0x49, 0x49, 0x29, 0x1e], [0x00, 0x36, 0x36, 0x00, 0x00], [0x00, 0x56, 0x36, 0x00, 0x00],
  [0x00, 0x08, 0x14, 0x22, 0x41], [0x14, 0x14, 0x14, 0x14, 0x14], [0x41, 0x22, 0x14, 0x08, 0x00], [0x02, 0x01, 0x51, 0x09, 0x06],
  [0x32, 0x49, 0x79, 0x41, 0x3e], [0x7e, 0x11, 0x11, 0x11, 0x7e], [0x7f, 0x49, 0x49, 0x49, 0x36], [0x3e, 0x41, 0x41, 0x41, 0x22],
  [0x7f, 0x41, 0x41, 0x22, 0x1c], [0x7f, 0x49, 0x49, 0x49, 0x41], [0x7f, 0x09, 0x09, 0x01, 0x01], [0x3e, 0x41, 0x41, 0x51, 0x32],
  [0x7f, 0x08, 0x08, 0x08, 0x7f], [0x00, 0x41, 0x7f, 0x41, 0x00], [0x20, 0x40, 0x41, 0x3f, 0x01], [0x7f, 0x08, 0x14, 0x22, 0x41],
  [0x7f, 0x40, 0x40, 0x40, 0x40], [0x7f, 0x02, 0x04, 0x02, 0x7f], [0x7f, 0x04, 0x08, 0x10, 0x7f], [0x3e, 0x41, 0x41, 0x41, 0x3e],
  [0x7f, 0x09, 0x09, 0x09, 0x06], [0x3e, 0x41, 0x51, 0x21, 0x5e], [0x7f, 0x09, 0x19, 0x29, 0x46], [0x46, 0x49, 0x49, 0x49, 0x31],
  [0x01, 0x01, 0x7f, 0x01, 0x01], [0x3f, 0x40, 0x40, 0x40, 0x3f], [0x1f, 0x20, 0x40, 0x20, 0x1f], [0x7f, 0x20, 0x18, 0x20, 0x7f],
  [0x63, 0x14, 0x08, 0x14, 0x63], [0x03, 0x04, 0x78, 0x04, 0x03], [0x61, 0x51, 0x49, 0x45, 0x43], [0x00, 0x00, 0x7f, 0x41, 0x41],
  [0x02, 0x04, 0x08, 0x10, 0x20], [0x41, 0x41, 0x7f, 0x00, 0x00], [0x04, 0x02, 0x01, 0x02, 0x04], [0x40, 0x40, 0x40, 0x40, 0x40],
  [0x00, 0x01, 0x02, 0x04, 0x00], [0x20, 0x54, 0x54, 0x54, 0x78], [0x7f, 0x48, 0x44, 0x44, 0x38], [0x38, 0x44, 0x44, 0x44, 0x20],
  [0x38, 0x44, 0x44, 0x48, 0x7f], [0x38, 0x54, 0x54, 0x54, 0x18], [0x08, 0x7e, 0x09, 0x01, 0x02], [0x08, 0x14, 0x54, 0x54, 0x3c],
  [0x7f, 0x08, 0x04, 0x04, 0x78], [0x00, 0x44, 0x7d, 0x40, 0x00], [0x20, 0x40, 0x44, 0x3d, 0x00], [0x00, 0x7f, 0x10, 0x28, 0x44],
  [0x00, 0x41, 0x7f, 0x40, 0x00], [0x7c, 0x04, 0x18, 0x04, 0x78], [0x7c, 0x08, 0x04, 0x04, 0x78], [0x38, 0x44, 0x44, 0x44, 0x38],
  [0x7c, 0x14, 0x14, 0x14, 0x08], [0x08, 0x14, 0x14, 0x18, 0x7c], [0x7c, 0x08, 0x04, 0x04, 0x08], [0x48, 0x54, 0x54, 0x54, 0x20],
  [0x04, 0x3f, 0x44, 0x40, 0x20], [0x3c, 0x40, 0x40, 0x20, 0x7c], [0x1c, 0x20, 0x40, 0x20, 0x1c], [0x3c, 0x40, 0x30, 0x40, 0x3c],
  [0x44, 0x28, 0x10, 0x28, 0x44], [0x0c, 0x50, 0x50, 0x50, 0x3c], [0x44, 0x64, 0x54, 0x4c, 0x44], [0x00, 0x08, 0x36, 0x41, 0x00],
  [0x00, 0x00, 0x7f, 0x00, 0x00], [0x00, 0x41, 0x36, 0x08, 0x00], [0x08, 0x08, 0x2a, 0x1c, 0x08],
];

/** A page image: 1224 by 1584 pixels (a letter page at 144 dots per inch), one bit each. */
export const SCAN_WIDTH = 1224;
export const SCAN_HEIGHT = 1584;
const SCALE = 2;
const CELL_WIDTH = 6 * SCALE;
const CELL_HEIGHT = 9 * SCALE;
const LEFT = 48;
const TOP = 60;
/** The longest line and the most lines a page image holds. */
export const SCAN_COLUMNS = Math.floor((SCAN_WIDTH - 2 * LEFT) / CELL_WIDTH);
export const SCAN_ROWS = Math.floor((SCAN_HEIGHT - 2 * TOP) / CELL_HEIGHT);
const ROW_BYTES = Math.ceil(SCAN_WIDTH / 8);

function glyph(character: string): readonly number[] {
  const code = character.charCodeAt(0);
  const found = FONT[code - 0x20];
  if (found === undefined) {
    throw new Error('a scanned exhibit holds printable ASCII only');
  }
  return found;
}

/** The page's pixels, row by row, a set bit white (DeviceGray, one bit per sample: 0 is black). */
function rasterize(lines: readonly string[], seed: string): Uint8Array {
  if (lines.length > SCAN_ROWS || lines.some((line) => line.length > SCAN_COLUMNS)) {
    throw new Error(`a scanned page holds at most ${String(SCAN_ROWS)} lines of ${String(SCAN_COLUMNS)} characters`);
  }
  const bits = new Uint8Array(ROW_BYTES * SCAN_HEIGHT).fill(0xff);
  const ink = (x: number, y: number) => {
    if (x >= 0 && x < SCAN_WIDTH && y >= 0 && y < SCAN_HEIGHT) {
      const index = y * ROW_BYTES + (x >> 3);
      bits[index] = (bits[index] ?? 0) & ~(0x80 >> (x & 7));
    }
  };
  lines.forEach((line, row) => {
    [...line].forEach((character, column) => {
      const columns = glyph(character);
      columns.forEach((columnBits, dx) => {
        for (let dy = 0; dy < 7; dy += 1) {
          if ((columnBits >> dy) & 1) {
            for (let sx = 0; sx < SCALE; sx += 1) {
              for (let sy = 0; sy < SCALE; sy += 1) {
                ink(LEFT + column * CELL_WIDTH + dx * SCALE + sx, TOP + row * CELL_HEIGHT + dy * SCALE + sy);
              }
            }
          }
        }
      });
    });
  });
  // A scanner's dust: a few specks, the same ones every time for the same page.
  const random = new Random(`tp-synth/scan/${seed}`);
  for (let speck = 0; speck < 160; speck += 1) {
    ink(random.int(0, SCAN_WIDTH - 1), random.int(0, SCAN_HEIGHT - 1));
  }
  return bits;
}

/**
 * A PDF with one image per page and no text: each page is the picture of its lines. Its pages hold no
 * text operator at all, so a text reader finds every page empty and a scan reader must read it.
 */
export function scannedPdf(pages: readonly (readonly string[])[], title: string, seed: string): Uint8Array {
  if (pages.length === 0) {
    throw new Error('a PDF has at least one page');
  }
  if (!/^[\x20-\x7e]*$/.test(title)) {
    throw new Error('PDF exhibit titles are printable ASCII');
  }
  const objects: Buffer[] = [];
  const pageIds = pages.map((_, index) => 4 + index * 3);
  objects[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1');
  objects[2] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((id) => `${String(id)} 0 R`).join(' ')}] /Count ${String(pages.length)} >>`, 'latin1');
  objects[3] = Buffer.from('<< /Producer (packages/synth SYNTHETIC scan writer) >>', 'latin1');
  pages.forEach((lines, index) => {
    const pageId = pageIds[index] ?? 0;
    const content = 'q 612 0 0 792 0 0 cm /Im0 Do Q';
    const image = deflateSync(rasterize(lines, `${seed}/${String(index + 1)}`), { level: 9 });
    objects[pageId] = Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 ${String(pageId + 2)} 0 R >> >> /Contents ${String(pageId + 1)} 0 R >>`, 'latin1');
    objects[pageId + 1] = Buffer.from(`<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`, 'latin1');
    objects[pageId + 2] = Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${String(SCAN_WIDTH)} /Height ${String(SCAN_HEIGHT)} /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /FlateDecode /Length ${String(image.length)} >>\nstream\n`,
        'latin1',
      ),
      image,
      Buffer.from('\nendstream', 'latin1'),
    ]);
  });
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let length = parts[0]?.length ?? 0;
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = length;
    const object = Buffer.concat([Buffer.from(`${String(id)} 0 obj\n`, 'latin1'), objects[id] ?? Buffer.alloc(0), Buffer.from('\nendobj\n', 'latin1')]);
    parts.push(object);
    length += object.length;
  }
  const docId = '53594e544845544943205343414e';
  let trailer = `xref\n0 ${String(objects.length)}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    trailer += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  trailer += `trailer\n<< /Size ${String(objects.length)} /Root 1 0 R /Info 3 0 R /ID [<${docId}> <${docId}>] >>\nstartxref\n${String(length)}\n%%EOF\n`;
  parts.push(Buffer.from(trailer, 'latin1'));
  return new Uint8Array(Buffer.concat(parts));
}

// ---------------------------------------------------------------------------------------------------
// The scan reader's answer, recorded

export const TEXTRACT_RECORDING_FORMAT = 'tp-textract-recording/1';

interface BoundingBox {
  readonly Width: number;
  readonly Height: number;
  readonly Left: number;
  readonly Top: number;
}

export interface RecordedBlock {
  readonly BlockType: 'PAGE' | 'LINE';
  readonly Id: string;
  readonly Page: number;
  readonly Text?: string;
  readonly Confidence?: number;
  readonly Geometry: { readonly BoundingBox: BoundingBox };
}

/** What text detection returned for a document (GetDocumentTextDetection's fields), with the recording's own label. */
export interface TextractRecording {
  readonly format: typeof TEXTRACT_RECORDING_FORMAT;
  readonly synthetic: true;
  readonly note: string;
  readonly JobStatus: 'SUCCEEDED';
  readonly DocumentMetadata: { readonly Pages: number };
  readonly Blocks: readonly RecordedBlock[];
}

/** A fraction of the page to four decimals, as text detection reports positions. */
const fraction = (pixels: number, of: number) => Math.round((pixels * 10_000) / of) / 10_000;

/**
 * Text detection's blocks for the pages as scannedPdf() draws them: one PAGE block per page and one
 * LINE block per run of text, in reading order. Where a line holds a wide gap (a table's columns), the
 * reader returns each side as its own line, as text detection does with columns; read back in order and
 * joined by line breaks, the page's text normalizes to the drawn text.
 */
export function textractRecording(pages: readonly (readonly string[])[], document: string): TextractRecording {
  const blocks: RecordedBlock[] = [];
  const random = new Random(`tp-synth/textract/${document}`);
  pages.forEach((lines, pageIndex) => {
    const page = pageIndex + 1;
    blocks.push({ BlockType: 'PAGE', Id: `page-${String(page)}`, Page: page, Geometry: { BoundingBox: { Width: 1, Height: 1, Left: 0, Top: 0 } } });
    lines.forEach((line, row) => {
      const runs = [...line.matchAll(/\S+(?: \S+)*/g)];
      runs.forEach((run, runIndex) => {
        const column = run.index;
        blocks.push({
          BlockType: 'LINE',
          Id: `line-${String(page)}-${String(row + 1)}-${String(runIndex + 1)}`,
          Page: page,
          Text: run[0],
          Confidence: random.int(9_700, 9_990) / 100,
          Geometry: {
            BoundingBox: {
              Width: fraction(run[0].length * CELL_WIDTH, SCAN_WIDTH),
              Height: fraction(7 * SCALE, SCAN_HEIGHT),
              Left: fraction(LEFT + column * CELL_WIDTH, SCAN_WIDTH),
              Top: fraction(TOP + row * CELL_HEIGHT, SCAN_HEIGHT),
            },
          },
        });
      });
    });
  });
  return {
    format: TEXTRACT_RECORDING_FORMAT,
    synthetic: true,
    note: `SYNTHETIC: the text detection a scan reader returns for ${document}, recorded so dev, tests and CI read it without the service.`,
    JobStatus: 'SUCCEEDED',
    DocumentMetadata: { Pages: pages.length },
    Blocks: blocks,
  };
}
