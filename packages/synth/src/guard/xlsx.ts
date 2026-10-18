/**
 * The fixture guard's workbook reader: every worksheet of an .xlsx, each as rows of cell text with the
 * cells at the columns their references name, so the marker rule (tabular.ts) reads a sheet as it reads
 * a CSV. Shared strings, inline strings and plain values are read; formulas are not evaluated (a cell's
 * cached value is its text). It is the guard's own reader: packages/contracts' sheetText keeps no
 * column positions and is the contract evidence's, and intake refuses a spreadsheet posting or bank
 * export (docs/adr/0059). A part it cannot read throws WorkbookReadError, and the guard refuses the file.
 */
import path from 'node:path';

import { type Archive } from './archive';

export class WorkbookReadError extends Error {
  override readonly name = 'WorkbookReadError';
}

export interface Sheet {
  /** The part's name in the archive (xl/worksheets/sheet1.xml). */
  readonly part: string;
  /** The sheet's rows in row order, each cell at its column; rows with no cells are left out. */
  readonly rows: string[][];
}

const CONTENT_TYPES = '[Content_Types].xml';
const WORKSHEET_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';
const SHARED_STRINGS_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml';
/** The workbook part's content types: a workbook, a template, and their macro-enabled kinds. */
const WORKBOOK_TYPES = /application\/vnd\.(?:openxmlformats-officedocument\.spreadsheetml\.(?:sheet|template)\.main|ms-excel\.(?:sheet|template)\.macroEnabled\.main)\+xml/;
const OPEN_DOCUMENT_SPREADSHEET = 'application/vnd.oasis.opendocument.spreadsheet';
/** Excel's own bounds: 1,048,576 rows of 16,384 columns. */
const MAX_ROW = 1_048_576;
const MAX_COLUMN = 16_384;

const decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * The parts a generated workbook holds, by name: the package's content types and relationships, its
 * properties, the workbook, its relationships, styles and theme, shared strings and worksheets. Any other
 * part (an embedded file, a drawing, a part under another name) is refused unread: a workbook fixture is
 * generated, never saved from a spreadsheet program (docs/adr/0059).
 */
const WORKBOOK_PARTS = [
  /^\[Content_Types\]\.xml$/,
  /^_rels\/\.rels$/,
  /^docProps\/(?:app|core)\.xml$/,
  /^xl\/workbook\.xml$/,
  /^xl\/_rels\/workbook\.xml\.rels$/,
  /^xl\/styles\.xml$/,
  /^xl\/theme\/theme\d+\.xml$/,
  /^xl\/sharedStrings\.xml$/,
  /^xl\/worksheets\/sheet\d+\.xml$/,
];
const WORKBOOK_RELATIONSHIPS = 'xl/_rels/workbook.xml.rels';
const WORKSHEET_RELATIONSHIP = /\/relationships\/worksheet$/;

/** A part's XML with its comments taken out; CDATA, a document type or an unclosed comment is refused. */
function xmlOf(value: string): string {
  const uncommented = value.replace(/<!--[\s\S]*?-->/g, '');
  if (/<!\[CDATA\[|<!DOCTYPE|<!ENTITY|<!--/i.test(uncommented)) {
    throw new WorkbookReadError('a workbook part holds CDATA, a document type or an unclosed comment');
  }
  return uncommented;
}

function text(archive: Archive, part: string): string | undefined {
  const bytes = archive.read(part);
  if (bytes === undefined) {
    return undefined;
  }
  let decoded: string;
  try {
    decoded = decoder.decode(bytes);
  } catch {
    throw new WorkbookReadError('a workbook part is not UTF-8');
  }
  return xmlOf(decoded);
}

/** The workbook's parts that a generated workbook does not hold, in the archive's order. */
export function foreignParts(archive: Archive): string[] {
  return archive.names().filter((name) => !WORKBOOK_PARTS.some((pattern) => pattern.test(name)));
}

/** True for an Office Open XML workbook (.xlsx, .xlsm, .xltx, .xltm): it has a workbook part. */
export function isWorkbook(archive: Archive): boolean {
  const names = archive.names();
  if (names.includes('xl/workbook.xml')) {
    return true;
  }
  return names.includes(CONTENT_TYPES) && WORKBOOK_TYPES.test(text(archive, CONTENT_TYPES) ?? '');
}

/** True for an OpenDocument spreadsheet (.ods), which names its type in its first entry. */
export function isOpenDocumentSpreadsheet(archive: Archive): boolean {
  return archive.names().includes('mimetype') && (text(archive, 'mimetype') ?? '').startsWith(OPEN_DOCUMENT_SPREADSHEET);
}

function decodeEntities(value: string): string {
  return value.replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|(lt|gt|amp|quot|apos));/g, (_match, hex: string | undefined, decimal: string | undefined, name: string | undefined) => {
    if (name !== undefined) {
      return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[name as 'lt' | 'gt' | 'amp' | 'quot' | 'apos'];
    }
    const code = hex === undefined ? Number.parseInt(decimal ?? '', 10) : Number.parseInt(hex, 16);
    if (code > 0x10ffff) {
      throw new WorkbookReadError('a workbook part has a character reference out of range');
    }
    return String.fromCodePoint(code);
  });
}

/** An element name with any namespace prefix (x:row as row). */
const tag = (name: string) => String.raw`(?:[A-Za-z_][\w.-]*:)?${name}`;

function attribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(String.raw`(?:^|\s)${name}\s*=\s*(?:"([^"]*)"|'([^']*)')`).exec(attributes);
  return match === null ? undefined : decodeEntities(match[1] ?? match[2] ?? '');
}

/** The text of a string item (a shared string or an inline string): its runs' text, phonetic runs left out. */
function stringItem(xml: string): string {
  const withoutPhonetic = xml.replace(new RegExp(String.raw`<${tag('rPh')}\b[\s\S]*?</${tag('rPh')}>`, 'g'), '');
  const runs = withoutPhonetic.matchAll(new RegExp(String.raw`<${tag('t')}\b[^>]*?(?:/>|>([\s\S]*?)</${tag('t')}>)`, 'g'));
  return [...runs].map((run) => decodeEntities(run[1] ?? '')).join('');
}

function sharedStrings(xml: string | undefined): string[] {
  if (xml === undefined) {
    return [];
  }
  const items = xml.matchAll(new RegExp(String.raw`<${tag('si')}\b[^>]*?(?:/>|>([\s\S]*?)</${tag('si')}>)`, 'g'));
  return [...items].map((item) => stringItem(item[1] ?? ''));
}

/** A cell reference's column (B12 is 1), or undefined when it names none. */
function columnOf(reference: string | undefined): number | undefined {
  const match = /^\$?([A-Za-z]{1,3})\$?\d*$/.exec(reference ?? '');
  if (match === null) {
    return undefined;
  }
  let column = 0;
  for (const letter of (match[1] as string).toUpperCase()) {
    column = column * 26 + (letter.charCodeAt(0) - 64);
  }
  return column - 1;
}

function sheetRows(xml: string, shared: readonly string[], referenced: Set<number>): string[][] {
  const rows: string[][] = [];
  let rowNumber = 0;
  const rowPattern = new RegExp(String.raw`<${tag('row')}\b([^>]*?)(?:/>|>([\s\S]*?)</${tag('row')}>)`, 'g');
  const cellPattern = new RegExp(String.raw`<${tag('c')}\b([^>]*?)(?:/>|>([\s\S]*?)</${tag('c')}>)`, 'g');
  const valuePattern = new RegExp(String.raw`<${tag('v')}\b[^>]*?(?:/>|>([\s\S]*?)</${tag('v')}>)`);
  const inlinePattern = new RegExp(String.raw`<${tag('is')}\b[^>]*?(?:/>|>([\s\S]*?)</${tag('is')}>)`);
  for (const row of xml.matchAll(rowPattern)) {
    const stated = attribute(row[1] ?? '', 'r');
    const number = stated === undefined ? rowNumber + 1 : Number.parseInt(stated, 10);
    if (!Number.isInteger(number) || number <= rowNumber || number > MAX_ROW) {
      throw new WorkbookReadError('a worksheet’s rows are out of order or out of range');
    }
    rowNumber = number;
    const cells: string[] = [];
    let column = -1;
    for (const cell of (row[2] ?? '').matchAll(cellPattern)) {
      const attributes = cell[1] ?? '';
      const reference = attribute(attributes, 'r');
      const at = reference === undefined ? column + 1 : columnOf(reference);
      if (at === undefined || at <= column || at >= MAX_COLUMN) {
        throw new WorkbookReadError('a worksheet’s cells are out of order or out of range');
      }
      column = at;
      const body = cell[2] ?? '';
      const type = attribute(attributes, 't');
      let value: string;
      if (type === 'inlineStr') {
        value = stringItem(inlinePattern.exec(body)?.[1] ?? '');
      } else {
        const raw = decodeEntities(valuePattern.exec(body)?.[1] ?? '');
        if (type === 's') {
          const index = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : -1;
          const found = shared[index];
          if (found === undefined) {
            throw new WorkbookReadError('a cell names a shared string the workbook does not have');
          }
          referenced.add(index);
          value = found;
        } else {
          value = raw;
        }
      }
      while (cells.length < at) {
        cells.push('');
      }
      cells.push(value);
    }
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  return rows;
}

/** The parts [Content_Types].xml declares with `type`, by archive name. */
function declaredParts(contentTypes: string | undefined, type: string): string[] {
  const parts: string[] = [];
  for (const override of (contentTypes ?? '').matchAll(new RegExp(String.raw`<${tag('Override')}\b([^>]*?)/?>`, 'g'))) {
    const attributes = override[1] ?? '';
    const name = attribute(attributes, 'PartName');
    if (attribute(attributes, 'ContentType') === type && name !== undefined) {
      parts.push(name.replace(/^\//, ''));
    }
  }
  // A worksheet, shared strings or a workbook typed by extension makes every part of that extension one, read or
  // not; a generated workbook names each such part on its own.
  for (const fallback of (contentTypes ?? '').matchAll(new RegExp(String.raw`<${tag('Default')}\b([^>]*?)/?>`, 'g'))) {
    const declared = attribute(fallback[1] ?? '', 'ContentType') ?? '';
    if (declared === WORKSHEET_TYPE || declared === SHARED_STRINGS_TYPE || WORKBOOK_TYPES.test(declared)) {
      throw new WorkbookReadError('the workbook types a worksheet, its shared strings or itself by extension');
    }
  }
  return parts;
}

/** The worksheets xl/_rels/workbook.xml.rels names, by archive name; a link outside the workbook is refused. */
function relatedWorksheets(archive: Archive): string[] {
  const parts: string[] = [];
  for (const relationship of (text(archive, WORKBOOK_RELATIONSHIPS) ?? '').matchAll(new RegExp(String.raw`<${tag('Relationship')}\b([^>]*?)/?>`, 'g'))) {
    const attributes = relationship[1] ?? '';
    const mode = attribute(attributes, 'TargetMode');
    if (mode !== undefined && mode !== 'Internal') {
      throw new WorkbookReadError('the workbook links to a target outside itself');
    }
    const target = attribute(attributes, 'Target');
    if (WORKSHEET_RELATIONSHIP.test(attribute(attributes, 'Type') ?? '') && target !== undefined) {
      parts.push(target.startsWith('/') ? target.slice(1) : path.posix.normalize(`xl/${target}`));
    }
  }
  return parts;
}

/**
 * Every worksheet of the workbook: the parts [Content_Types].xml declares as worksheets, the parts its
 * relationships name as worksheets, and every part under xl/worksheets/, hidden sheets included. A shared
 * string no cell shows is refused: it is text the marker rule would never read.
 */
export function workbookSheets(archive: Archive): Sheet[] {
  const names = archive.names();
  const contentTypes = text(archive, CONTENT_TYPES);
  const sharedPart = declaredParts(contentTypes, SHARED_STRINGS_TYPE)[0] ?? 'xl/sharedStrings.xml';
  const shared = sharedStrings(text(archive, sharedPart));
  const parts = new Set([...declaredParts(contentTypes, WORKSHEET_TYPE), ...relatedWorksheets(archive), ...names.filter((name) => /^xl\/worksheets\/[^/]+\.xml$/i.test(name))]);
  const referenced = new Set<number>();
  const sheets: Sheet[] = [];
  for (const part of [...parts].sort()) {
    const xml = text(archive, part);
    if (xml === undefined) {
      throw new WorkbookReadError('the workbook declares a worksheet it does not hold');
    }
    sheets.push({ part, rows: sheetRows(xml, shared, referenced) });
  }
  if (referenced.size < shared.length) {
    throw new WorkbookReadError('the workbook holds a shared string no cell shows');
  }
  return sheets;
}
