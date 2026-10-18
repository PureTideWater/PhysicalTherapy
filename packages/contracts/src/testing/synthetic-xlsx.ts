import { crc32, deflateRawSync } from 'node:zlib';

/**
 * A minimal SpreadsheetML workbook (.xlsx) writer for synthetic fee-schedule exhibits in tests
 * (CLAUDE.md: synthetic data only). Text cells go to the shared strings, numbers are written as
 * stored values and booleans as boolean cells; one cell may be written as an inline string. Every
 * byte is generated here; nothing is copied from a real exhibit. Parts are stored, or deflated when
 * asked (a highly compressible part stands for a decompression bomb).
 */

/** Text (a shared string), a whole number, a boolean, a stored value written as text ({ number: '30.5' }), or an inline string. */
export type SyntheticCell = string | number | boolean | { readonly number: string } | { readonly inline: string };

export interface SyntheticSheet {
  readonly name: string;
  readonly rows: readonly (readonly SyntheticCell[])[];
}

function escape(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function column(index: number): string {
  let name = '';
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
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

/** A zip of the parts, each stored or deflated. */
export function zipParts(parts: readonly { readonly name: string; readonly text: string }[], deflate = false): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const part of parts) {
    const name = Buffer.from(part.name, 'utf8');
    const data = Buffer.from(part.text, 'utf8');
    const stored = deflate ? deflateRawSync(data) : data;
    const common = Buffer.concat([u16(20), u16(0), u16(deflate ? 8 : 0), u16(0), u16(((2026 - 1980) << 9) | (1 << 5) | 1), u32(crc32(data)), u32(stored.length), u32(data.length), u16(name.length), u16(0)]);
    const local = Buffer.concat([u32(0x04034b50), common, name, stored]);
    centrals.push(Buffer.concat([u32(0x02014b50), u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    locals.push(local);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(parts.length), u16(parts.length), u32(central.length), u32(offset), u16(0)]);
  return new Uint8Array(Buffer.concat([...locals, central, end]));
}

/** The bytes of a workbook with the given sheets, in order. */
export function syntheticXlsx(sheets: readonly SyntheticSheet[], options: { readonly deflate?: boolean } = {}): Uint8Array {
  const shared: string[] = [];
  const sharedIndex = (text: string): number => {
    const at = shared.indexOf(text);
    if (at !== -1) {
      return at;
    }
    shared.push(text);
    return shared.length - 1;
  };
  const sheetParts = sheets.map((sheet, index) => {
    const rows = sheet.rows.map((cells, rowIndex) => {
      const written = cells.map((cell, cellIndex) => {
        const ref = `${column(cellIndex)}${String(rowIndex + 1)}`;
        if (typeof cell === 'string') {
          return `<c r="${ref}" t="s"><v>${String(sharedIndex(cell))}</v></c>`;
        }
        if (typeof cell === 'number') {
          return `<c r="${ref}"><v>${String(cell)}</v></c>`;
        }
        if (typeof cell === 'boolean') {
          return `<c r="${ref}" t="b"><v>${cell ? '1' : '0'}</v></c>`;
        }
        if ('number' in cell) {
          return `<c r="${ref}"><v>${escape(cell.number)}</v></c>`;
        }
        return `<c r="${ref}" t="inlineStr"><is><t>${escape(cell.inline)}</t></is></c>`;
      });
      return `<row r="${String(rowIndex + 1)}">${written.join('')}</row>`;
    });
    return {
      name: `xl/worksheets/sheet${String(index + 1)}.xml`,
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}</sheetData></worksheet>`,
    };
  });
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
    .map((sheet, index) => `<sheet name="${escape(sheet.name)}" sheetId="${String(index + 1)}" r:id="rId${String(index + 1)}"/>`)
    .join('')}</sheets></workbook>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map((_, index) => `<Relationship Id="rId${String(index + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${String(index + 1)}.xml"/>`)
    .join('')}</Relationships>`;
  const strings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${String(shared.length)}" uniqueCount="${String(shared.length)}">${shared
    .map((text) => `<si><t xml:space="preserve">${escape(text)}</t></si>`)
    .join('')}</sst>`;
  return zipParts(
    [
      { name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
      { name: 'xl/workbook.xml', text: workbook },
      { name: 'xl/_rels/workbook.xml.rels', text: relationships },
      { name: 'xl/sharedStrings.xml', text: strings },
      ...sheetParts,
    ],
    options.deflate ?? false,
  );
}
