/**
 * A page's text as a person reads it in the document view (Queues item 41; test matrix MOD-27; docs/adr/0054).
 *
 * An extractor that reads a Windows-1252 byte 0x80 to 0x9F as Latin-1 writes the C1 control character of the same
 * number (U+0080 to U+009F), which shows as nothing: a payer's dash, quote, apostrophe or bullet is gone from the page a
 * person reads. This is the view that puts them back, one code unit for one, so a span on the stored text is the same
 * span here:
 *
 *  - U+0085 (NEXT LINE, the line ending of mainframe text) is shown as a line break;
 *  - any other C1 character is shown as the character its Windows-1252 byte stands for;
 *  - the five bytes Windows-1252 leaves undefined (0x81, 0x8D, 0x8F, 0x90, 0x9D) stand for no character and stay.
 *
 * FOR THE SCREEN ONLY, at render time. The stored page text, its hash (pageTextHash) and every citation keep the
 * characters exactly as extracted; what this returns is never stored, hashed, compared with a quote or sent to a model.
 * It lives in the web app, beside the one view that calls it, so that no package that stores or sends can reach it.
 */
const WINDOWS_1252: Readonly<Record<number, number>> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030,
  0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d,
  0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
};

const SHOWN_AS: ReadonlyMap<string, string> = new Map([
  ['\u0085', '\n'],
  ...Object.entries(WINDOWS_1252).map(([byte, codePoint]): [string, string] => [String.fromCharCode(Number(byte)), String.fromCharCode(codePoint)]),
]);

const C1_CHARACTERS = /[\u0080-\u009f]/g;

export function mendExtracted(text: string): string {
  return text.replace(C1_CHARACTERS, (character) => SHOWN_AS.get(character) ?? character);
}
