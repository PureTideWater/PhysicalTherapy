// mend.ts: Queues item 41 (b), the prototype of mending at extraction (a design measurement, not product code).
// A page's text as the extractor gave it -> the same text with two kinds of wrong decoding undone, one code unit for
// one code unit (so every offset, span and citation into the text stays where it was):
// - U+0085 (NEXT LINE, the line ending of mainframe text) becomes U+000A;
// - any other C1 character U+0080 to U+009F becomes the character its Windows-1252 byte stands for (the byte read as
//   Latin-1 is the code point). The five bytes Windows-1252 leaves undefined (0x81, 0x8D, 0x8F, 0x90, 0x9D) stand
//   for no character: they stay as they are, and item 40's reader refuses them inside an identifier as before.
// Nothing else is touched: NFKC, white space and every other character are the reader's, as before.
const CP1252: Readonly<Record<number, number>> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030,
  0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d,
  0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
};
export const MEND: ReadonlyMap<string, string> = new Map([
  ['\u0085', '\n'],
  ...Object.entries(CP1252).map(([from, to]) => [String.fromCharCode(Number(from)), String.fromCharCode(to)] as [string, string]),
]);
const C1 = /[\u0080-\u009f]/g;
/** (b) as the item writes it: what a person sees, and (variant m) what the reader reads. */
export function mendExtracted(text: string): string {
  return text.replace(C1, (c) => MEND.get(c) ?? c);
}
/** Variant n: what the reader reads; every C1 character, mended or not, a line break (as U+0085 is). */
export function readerTextBreaks(text: string): string {
  return text.replace(C1, '\n');
}
/** Variant d: as n, except that a run of C1 characters with a digit on both sides stays as it is, so a date, phone or
 * number split by one is refused by the reader as before (variant n sent 64 such dates of birth in clear). */
export function readerTextBreaksOutsideNumbers(text: string): string {
  return text.replace(/[\u0080-\u009f]+/g, (run, at: number) =>
    /\p{Nd}/u.test(text[at - 1] ?? '') && /\p{Nd}/u.test(text[at + run.length] ?? '') ? run : '\n'.repeat(run.length));
}
/** Variant e (what the reader reads): every C1 character a LINE SEPARATOR (U+2028), a break to the reader that stays
 * visible in what it sends, so the check can also read the sent text with the breaks taken out (JOINED): a number a
 * C1 split (03/1?4/1980) is whole again there and refused, while two numbers a dash or a line joined (97110?97112,
 * 150.00?30072299) are no identifier once the stored ones are replaced. */
export function readerTextSeparators(text: string): string {
  return text.replace(C1, '\u2028');
}
export const JOINED = (sent: string): string => sent.replace(/\u2028/g, '');
/** Variant j (recommended), what the reader reads: every C1 character a break the reader keeps as written in what it
 * sends (U+000B, LINE TABULATION, which it reads as white space and does not collapse), so that the check can read the
 * sent text a second time with those breaks taken out (JOINED_J). A number a C1 split (03/1?4/1980) is whole again on
 * that reading and refused, as item 40 refuses it; two numbers a dash or a line joined (97110?97112, 150.00?30072299)
 * are sent with the stored ones replaced. In the product this is done inside the reader on offsets, not by a sentinel
 * (a letter's own U+000B would be joined too, which only refuses more). */
export function readerTextJoinChecked(text: string): string {
  return text.replace(C1, '\u000b');
}
export const JOINED_J = (sent: string): string => sent.replace(/\u000b/g, '');
/** Variant k (recommended): the reader reads readerTextBreaks (every C1 a line break), and the text with every C1
 * taken out is read too. If that joined reading replaces more of the patient's stored identifiers (a date of birth, a
 * member ID, a name, a claim: every placeholder but [PHONE] and [SSN], which are found by pattern) than the break
 * reading does, a C1 split one of them (03/1?4/1980) and the letter is read as item 40 reads it, unmended, which
 * refuses it. Pattern-only finds on the joined text (97110?97112 joined is ten digits) do not count. */
export function storedFoundOnlyJoined(breaksSent: string, joinedSent: string): boolean {
  const kinds = (t: string): Map<string, number> => { const m = new Map<string, number>(); for (const [k] of t.matchAll(/\[[A-Z_]+\]/g)) if (k !== '[PHONE]' && k !== '[SSN]') m.set(k, (m.get(k) ?? 0) + 1); return m; };
  const b = kinds(breaksSent);
  for (const [k, n] of kinds(joinedSent)) if (n > (b.get(k) ?? 0)) return true;
  return false;
}
export const withoutC1 = (text: string): string => text.replace(C1, '');
/** Variant s: the same with a space. */
export function readerTextSpaces(text: string): string {
  return text.replace(C1, ' ');
}
/** Counts by code point, for the in-product count (a): what was mended and what was left. IDs and counts only. */
export function c1Counts(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of text.matchAll(C1)) { const k = `U+${m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`; out[k] = (out[k] ?? 0) + 1; }
  return out;
}
