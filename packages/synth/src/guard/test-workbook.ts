/**
 * Builds small .xlsx workbooks in memory for the fixture guard's tests (fixture-guard.test.ts,
 * tools/fixture-check): sheets of cell text, written with shared or inline strings, stored or deflated.
 * Never a fixture itself; nothing here is written under fixtures/.
 */
import { crc32, deflateRawSync } from 'node:zlib';

export interface TestWorkbookOptions {
  /** Deflate every part (as Excel does) instead of storing it. */
  readonly deflate?: boolean;
  /** Write text as inline strings instead of through xl/sharedStrings.xml. */
  readonly inline?: boolean;
  /** Leave the cell references out, so a reader places cells by their order. */
  readonly noReferences?: boolean;
}

const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

/** A zip of `entries`, each stored or deflated. */
export function testZip(entries: readonly { readonly name: string; readonly bytes: Uint8Array }[], deflate: boolean): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.bytes);
    const body = deflate ? deflateRawSync(data) : data;
    const common = Buffer.concat([u16(20), u16(0x800), u16(deflate ? 8 : 0), u16(0), u16(0), u32(crc32(data)), u32(body.length), u32(data.length), u16(name.length), u16(0)]);
    const local = Buffer.concat([u32(0x04034b50), common, name, body]);
    centrals.push(Buffer.concat([u32(0x02014b50), u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    locals.push(local);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(central.length), u32(offset), u16(0)]);
  return new Uint8Array(Buffer.concat([...locals, central, end]));
}

/** A workbook with one worksheet per entry of `sheets`, each a list of rows of cell text (an empty cell is left out). */
export function testWorkbook(sheets: readonly (readonly (readonly string[])[])[], options: TestWorkbookOptions = {}): Uint8Array {
  const shared: string[] = [];
  const sharedIndex = (text: string) => {
    const found = shared.indexOf(text);
    return found >= 0 ? found : shared.push(text) - 1;
  };
  const worksheets = sheets.map((rows) => {
    const body = rows
      .map((row, r) => {
        const cells = row
          .map((text, c) => {
            if (text === '') {
              return '';
            }
            const reference = options.noReferences === true ? '' : ` r="${columnName(c)}${String(r + 1)}"`;
            return options.inline === true ? `<c${reference} t="inlineStr"><is><t>${escape(text)}</t></is></c>` : `<c${reference} t="s"><v>${String(sharedIndex(text))}</v></c>`;
          })
          .join('');
        return `<row${options.noReferences === true ? '' : ` r="${String(r + 1)}"`}>${cells}</row>`;
      })
      .join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
  });
  const overrides = [
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ...worksheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${String(index + 1)}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`),
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
  ];
  const parts: [string, string][] = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/>${overrides.join('')}</Types>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets>${worksheets.map((_, index) => `<sheet name="Sheet${String(index + 1)}" sheetId="${String(index + 1)}"/>`).join('')}</sheets></workbook>`],
    ...worksheets.map((xml, index): [string, string] => [`xl/worksheets/sheet${String(index + 1)}.xml`, xml]),
    ['xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${String(shared.length)}">${shared.map((text) => `<si><t>${escape(text)}</t></si>`).join('')}</sst>`],
  ];
  return testZip(
    parts.map(([name, xml]) => ({ name, bytes: new Uint8Array(Buffer.from(xml, 'utf8')) })),
    options.deflate === true,
  );
}
