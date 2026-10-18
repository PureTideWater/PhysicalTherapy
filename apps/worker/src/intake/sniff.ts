/**
 * Content sniffing (PRD 6, Intake and documents; PRD 10, Pipeline step 2): what a document's first
 * bytes say it is, whatever its name or declared type. Nothing here parses a document; it reads at
 * most HEAD_BYTES from its start.
 *
 * - An 835 (any X12 interchange) starts with ISA and a valid 106-character header: the element
 *   separator at position 4 and at the fifteen other fixed positions and nowhere else, the component
 *   separator at 105 and the segment terminator at 106 (1-based), distinct and not letters, digits or
 *   spaces, with the date, time and control number digits where the header puts them. A UTF-8 byte
 *   order mark before it is allowed (test matrix PAR-05). Whether the interchange is an 835 rather
 *   than an 837 or a 277 is the parser's call (EDI_NOT_835, PAR-24).
 * - A zip by its magic bytes; a PDF by its header; a legacy Office (OLE2) workbook by its magic; a
 *   CSV as delimited text.
 * - An executable or a script by its signature, and the EICAR test file: these are quarantined,
 *   never parsed (PAR-28), whatever the malware scan said.
 */

export const HEAD_BYTES = 4096;

export type Signature = 'executable' | 'script' | 'eicar_test_file';

export type Sniffed =
  | { readonly type: 'x12' }
  /** Starts with ISA, but the header is not a valid 106-character ISA segment. */
  | { readonly type: 'x12_malformed' }
  | { readonly type: 'zip' }
  | { readonly type: 'pdf' }
  /** A legacy Office compound file (an .xls workbook). */
  | { readonly type: 'ole2' }
  | { readonly type: 'csv' }
  | { readonly type: 'empty' }
  | { readonly type: 'signature'; readonly signature: Signature }
  | { readonly type: 'unknown' };

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/** The EICAR anti-malware test string, assembled so this file is not itself a test file. */
export const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');

const MACH_O = [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe];

/** An executable, a script or the EICAR test file, by its first bytes. */
export function signatureOf(head: Buffer): Signature | undefined {
  if (head.includes(Buffer.from(EICAR, 'latin1'))) {
    return 'eicar_test_file';
  }
  if (head.length >= 4 && head.readUInt32BE(0) === 0x7f454c46) {
    return 'executable';
  }
  if (head.length >= 4 && MACH_O.includes(head.readUInt32BE(0))) {
    return 'executable';
  }
  // MZ: a DOS or Windows executable; text that happens to start with "MZ" has no NUL in its header.
  if (head.length >= 2 && head[0] === 0x4d && head[1] === 0x5a && head.subarray(0, 64).includes(0)) {
    return 'executable';
  }
  const text = head.subarray(0, 3).equals(BOM) ? head.subarray(3) : head;
  if (text.length >= 2 && text[0] === 0x23 && text[1] === 0x21) {
    return 'script';
  }
  return undefined;
}

/** The 0-based positions of the ISA element separator inside the 106-character header. */
export const ISA_SEPARATOR_POSITIONS = [3, 6, 17, 20, 31, 34, 50, 53, 69, 76, 81, 83, 89, 99, 101, 103] as const;
const ISA_LENGTH = 106;
const DIGIT_FIELDS: readonly (readonly [number, number])[] = [
  [70, 76], // ISA09 date
  [77, 81], // ISA10 time
  [90, 99], // ISA13 control number
];

function isDelimiter(byte: number | undefined): boolean {
  return byte !== undefined && byte !== 0x20 && !/[A-Za-z0-9]/.test(String.fromCharCode(byte));
}

/** Whether `text` begins with a valid ISA header. */
export function validIsaHeader(text: Buffer): boolean {
  if (text.length < ISA_LENGTH || text.subarray(0, 3).toString('latin1') !== 'ISA') {
    return false;
  }
  const element = text[3];
  const component = text[104];
  const terminator = text[105];
  if (!isDelimiter(element) || !isDelimiter(component) || !isDelimiter(terminator) || new Set([element, component, terminator]).size !== 3) {
    return false;
  }
  const positions = new Set<number>(ISA_SEPARATOR_POSITIONS);
  for (let index = 0; index < 104; index += 1) {
    if ((text[index] === element) !== positions.has(index)) {
      return false;
    }
  }
  return DIGIT_FIELDS.every(([from, to]) => /^\d+$/.test(text.subarray(from, to).toString('latin1')));
}

const PRINTABLE_CONTROL = new Set([0x09, 0x0a, 0x0d]);

/** Delimited text: no NUL, almost no control bytes, and a delimiter in its first line. */
function looksLikeCsv(text: Buffer): boolean {
  if (text.includes(0)) {
    return false;
  }
  let controls = 0;
  for (const byte of text) {
    if (byte < 0x20 && !PRINTABLE_CONTROL.has(byte)) {
      controls += 1;
    }
  }
  if (controls > text.length / 100) {
    return false;
  }
  const decoded = text.toString('utf8');
  const firstLine = decoded.split(/\r?\n/, 1)[0] ?? '';
  return /[,;\t|]/.test(firstLine);
}

/** What the first bytes of a document (up to HEAD_BYTES) say it is. */
export function sniff(head: Buffer): Sniffed {
  if (head.length === 0) {
    return { type: 'empty' };
  }
  const signature = signatureOf(head);
  if (signature !== undefined) {
    return { type: 'signature', signature };
  }
  const text = head.subarray(0, 3).equals(BOM) ? head.subarray(3) : head;
  if (text.subarray(0, 3).toString('latin1') === 'ISA') {
    return validIsaHeader(text) ? { type: 'x12' } : { type: 'x12_malformed' };
  }
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && [0x0304, 0x0506, 0x0708].includes(head.readUInt16BE(2))) {
    return { type: 'zip' };
  }
  if (head.subarray(0, 1024).includes(Buffer.from('%PDF-', 'latin1'))) {
    return { type: 'pdf' };
  }
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    return { type: 'ole2' };
  }
  if (looksLikeCsv(text)) {
    return { type: 'csv' };
  }
  return { type: 'unknown' };
}
