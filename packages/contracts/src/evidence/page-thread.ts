import { isMainThread, parentPort } from 'node:worker_threads';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
// pdf.js runs its worker in this thread from the module that registers itself here
// (globalThis.pdfjsWorker), so a bundle never loads pdf.worker.mjs from a path.
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import yauzl from 'yauzl';

/**
 * The page reader's own thread (docs/adr/0033): the text of each page of one untrusted document, read
 * in a worker thread that the caller bounds (pages.ts: a memory cap on the thread's heap and the
 * buffers it holds, a deadline, and the caps below). Nothing else in the process decompresses or
 * parses a contract, an exhibit or a payer letter.
 *
 * - A text PDF: pdf.js (Mozilla's reader) with no worker, scripts, fonts or canvas; only the text layer
 *   is read, page by page. A page with no text layer comes back empty (the caller may scan it).
 * - A spreadsheet (xlsx): one page per sheet, in workbook order; each row a line, its cells' text
 *   (shared strings, inline strings, booleans and values as stored) joined by tabs.
 * - A CSV: one page per block of CSV_ROWS_PER_PAGE rows; each row a line, its fields joined by tabs.
 *
 * The module imports nothing of the repository, so Node runs it as it is, TypeScript included
 * (type stripping: erasable syntax only, no parameter properties or enums), and the worker's bundle
 * builds it as its own file. Importing it elsewhere starts nothing; the functions are exported for
 * the tests.
 */

export const DOCUMENT_FORMATS = ['pdf', 'xlsx', 'csv'] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

/** What the thread is asked to read, with the caps it applies itself. */
export interface ThreadRequest {
  readonly format: DocumentFormat;
  readonly bytes: Uint8Array;
  /** At most this many pages (sheets, row blocks); more is refused. */
  readonly maxPages: number;
  /** At most this many characters of page text in all; more is refused. */
  readonly maxTextCharacters: number;
  /** For a spreadsheet: at most this many bytes inflated from its parts; more is refused. */
  readonly maxInflatedBytes: number;
}

/** A document the reader will not or cannot read: too large or of no supported kind, or damaged. */
export type ReadRefusal = 'unsupported_document' | 'document_unreadable';

export type ThreadReply = { readonly kind: 'pages'; readonly pages: string[] } | { readonly kind: 'refused'; readonly problem: ReadRefusal };

/** CSV rows per page: a fixed block, so a quote's page never moves. */
export const CSV_ROWS_PER_PAGE = 50;

/** Past a cap: the document is refused as unsupported, never read in part. */
class OverCap extends Error {
  override readonly name = 'OverCap';
}

class Unreadable extends Error {
  override readonly name = 'Unreadable';
}

const refused = (problem: ReadRefusal): ThreadReply => ({ kind: 'refused', problem });

/** Text gathered page by page, refused once it passes its cap. */
class PageText {
  readonly pages: string[] = [];
  private characters = 0;
  private readonly request: ThreadRequest;

  constructor(request: ThreadRequest) {
    this.request = request;
  }

  add(text: string): void {
    this.characters += text.length;
    if (this.pages.length >= this.request.maxPages || this.characters > this.request.maxTextCharacters) {
      throw new OverCap('past the page or text cap');
    }
    this.pages.push(text);
  }
}

// ---------------------------------------------------------------------------------------------------
// PDF

interface TextItem {
  readonly str?: string;
  readonly hasEOL?: boolean;
}

async function pdfPages(request: ThreadRequest, out: PageText): Promise<void> {
  const task = getDocument({ data: request.bytes, disableFontFace: true, useSystemFonts: false, stopAtErrors: true, verbosity: 0 });
  try {
    const document = await task.promise.catch(() => {
      throw new Unreadable('not a PDF pdf.js can read');
    });
    if (document.numPages > request.maxPages) {
      throw new OverCap('too many pages');
    }
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      out.add((content.items as readonly TextItem[]).map((item) => `${item.str ?? ''}${item.hasEOL === true ? '\n' : ''}`).join(''));
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
}

// ---------------------------------------------------------------------------------------------------
// XML of a workbook (SpreadsheetML): read by pattern, never by a general XML parser, so no entity,
// DTD or external reference is ever resolved. Element names may carry a namespace prefix.

const ENTITIES: Readonly<Record<string, string>> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** The five predefined entities and character references; anything else is left as written. */
export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|lt|gt|amp|quot|apos);/g, (whole, name: string) => {
    if (name.startsWith('#')) {
      const code = name.startsWith('#x') ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name] ?? whole;
  });
}

function elements(xml: string, name: string): string[] {
  const pattern = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${name}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:[A-Za-z_][\\w.-]*:)?${name}>)`, 'g');
  return [...xml.matchAll(pattern)].map((match) => `${match[1] ?? ''}\u0000${match[2] ?? ''}`);
}

function attribute(attributes: string, name: string): string | null {
  const found = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attributes);
  return found === null ? null : decodeXml(found[1] ?? '');
}

function split(element: string): { readonly attributes: string; readonly body: string } {
  const at = element.indexOf('\u0000');
  return { attributes: element.slice(0, at), body: element.slice(at + 1) };
}

/** The text of an element's <t> runs, phonetic runs (<rPh>) left out. */
function runText(body: string): string {
  const withoutPhonetic = body.replace(/<(?:[A-Za-z_][\w.-]*:)?rPh\b[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?rPh>/g, '');
  return elements(withoutPhonetic, 't')
    .map((element) => decodeXml(split(element).body))
    .join('');
}

/** The shared strings of a workbook (xl/sharedStrings.xml), in order. */
export function sharedStrings(xml: string): string[] {
  return elements(xml, 'si').map((element) => runText(split(element).body));
}

/** A worksheet's text: each row a line, its cells' text joined by tabs; empty cells and rows left out. */
export function sheetText(xml: string, shared: readonly string[]): string {
  const rows = elements(xml, 'row').map((row) => {
    const cells = elements(split(row).body, 'c').map((cell) => {
      const { attributes, body } = split(cell);
      const type = attribute(attributes, 't');
      if (type === 'inlineStr') {
        return elements(body, 'is').map((inline) => runText(split(inline).body)).join('');
      }
      const value = elements(body, 'v')[0];
      const text = value === undefined ? '' : decodeXml(split(value).body);
      if (type === 's') {
        return shared[Number.parseInt(text, 10)] ?? '';
      }
      if (type === 'b') {
        return text === '1' ? 'TRUE' : text === '0' ? 'FALSE' : text;
      }
      return text;
    });
    return cells.filter((text) => text.trim() !== '').join('\t');
  });
  return rows.filter((row) => row !== '').join('\n');
}

/** The workbook's sheets in order, each with the part that holds it. */
export function workbookSheets(workbook: string, relationships: string): string[] {
  const targets = new Map(
    elements(relationships, 'Relationship').map((element) => {
      const { attributes } = split(element);
      return [attribute(attributes, 'Id') ?? '', attribute(attributes, 'Target') ?? ''] as const;
    }),
  );
  return elements(workbook, 'sheet').flatMap((element) => {
    const id = /(?:^|\s)[A-Za-z_][\w.-]*:id="([^"]*)"/.exec(split(element).attributes)?.[1];
    const target = id === undefined ? undefined : targets.get(decodeXml(id));
    if (target === undefined || target === '') {
      return [];
    }
    const absolute = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    return [absolute.replace(/(^|\/)\.\//g, '$1')];
  });
}

// ---------------------------------------------------------------------------------------------------
// The workbook's zip: its directory read first, each part inflated against the cap.

function openZip(bytes: Uint8Array): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), { lazyEntries: true, validateEntrySizes: true, strictFileNames: false }, (error, zip) => {
      if (error !== null) {
        reject(new Unreadable('not a zip'));
        return;
      }
      resolve(zip);
    });
  });
}

function directory(zip: yauzl.ZipFile, maxEntries: number): Promise<Map<string, yauzl.Entry>> {
  return new Promise((resolve, reject) => {
    const entries = new Map<string, yauzl.Entry>();
    zip.on('entry', (entry: yauzl.Entry) => {
      if (entries.size >= maxEntries) {
        zip.close();
        reject(new OverCap('too many parts'));
        return;
      }
      entries.set(entry.fileName, entry);
      zip.readEntry();
    });
    zip.on('end', () => {
      resolve(entries);
    });
    zip.on('error', () => {
      reject(new Unreadable('a damaged zip directory'));
    });
    zip.readEntry();
  });
}

class Inflation {
  private total = 0;
  private readonly cap: number;

  constructor(cap: number) {
    this.cap = cap;
  }

  async read(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<string> {
    if (entry.uncompressedSize > this.cap - this.total) {
      throw new OverCap('a part past the inflation cap');
    }
    const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
      zip.openReadStream(entry, (error, opened) => {
        if (error !== null) {
          reject(new Unreadable('a part that cannot be opened'));
          return;
        }
        resolve(opened);
      });
    });
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        this.total += chunk.length;
        if (this.total > this.cap) {
          throw new OverCap('past the inflation cap');
        }
        chunks.push(chunk);
      }
    } catch (error) {
      throw error instanceof OverCap ? error : new Unreadable('a part that does not inflate as its directory says');
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}

async function xlsxPages(request: ThreadRequest, out: PageText): Promise<void> {
  const zip = await openZip(request.bytes);
  try {
    const entries = await directory(zip, 10_000);
    const inflation = new Inflation(request.maxInflatedBytes);
    const part = (name: string) => entries.get(name);
    const workbookEntry = part('xl/workbook.xml');
    const relationshipsEntry = part('xl/_rels/workbook.xml.rels');
    if (workbookEntry === undefined || relationshipsEntry === undefined) {
      // A zip that is not a workbook.
      throw new Unreadable('no workbook part');
    }
    const sheets = workbookSheets(await inflation.read(zip, workbookEntry), await inflation.read(zip, relationshipsEntry));
    if (sheets.length > request.maxPages) {
      throw new OverCap('too many sheets');
    }
    const sharedEntry = part('xl/sharedStrings.xml');
    const shared = sharedEntry === undefined ? [] : sharedStrings(await inflation.read(zip, sharedEntry));
    for (const name of sheets) {
      const entry = part(name);
      out.add(entry === undefined ? '' : sheetText(await inflation.read(zip, entry), shared));
    }
  } finally {
    zip.close();
  }
}

// ---------------------------------------------------------------------------------------------------
// CSV

/** The text of a CSV: UTF-8 (a byte-order mark dropped), else Latin-1. */
export function csvText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');
  }
}

/** RFC 4180 rows: quoted fields may hold commas, line breaks and doubled quotes. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] as string;
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field === '') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvPages(request: ThreadRequest, out: PageText): void {
  const lines = csvRows(csvText(request.bytes)).map((fields) => fields.filter((text) => text.trim() !== '').join('\t'));
  for (let start = 0; start < lines.length; start += CSV_ROWS_PER_PAGE) {
    out.add(
      lines
        .slice(start, start + CSV_ROWS_PER_PAGE)
        .filter((line) => line !== '')
        .join('\n'),
    );
  }
}

// ---------------------------------------------------------------------------------------------------

/** Reads the request's pages here, in this thread, under its caps. */
export async function readPagesHere(request: ThreadRequest): Promise<ThreadReply> {
  const out = new PageText(request);
  try {
    if (request.format === 'pdf') {
      await pdfPages(request, out);
    } else if (request.format === 'xlsx') {
      await xlsxPages(request, out);
    } else {
      csvPages(request, out);
    }
    return { kind: 'pages', pages: out.pages };
  } catch (error) {
    return refused(error instanceof OverCap ? 'unsupported_document' : 'document_unreadable');
  }
}

if (!isMainThread && parentPort !== null) {
  const port = parentPort;
  port.once('message', (request: ThreadRequest) => {
    void readPagesHere(request).then((reply) => {
      port.postMessage(reply);
    });
  });
}
