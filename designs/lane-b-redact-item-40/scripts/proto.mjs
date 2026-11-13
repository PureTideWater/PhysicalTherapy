// proto.mjs <redact.ts>: Queues item 40's MEASURING prototype, written over a scratch copy of the base's reader (lay.sh).
// Never run on the checkout. Each edit must find its text exactly the stated number of times, or it stops.
//  P1 (R1-3, refuse): rule (a) asks for a letter OR a number character that is no decimal digit beside the number.
//  P2 (R1-4, refuse): where the text holds an unseen character (any \p{C} that is not default-ignorable, not white
//     space and not one of the checks' three marks), the check reads it once more with each run of them as U+200B.
//     The prototype starts that reading from the same count; the build charges it in full, as A-6's is.
//  P3 ((A), replace): in the wider reading, the period after a name that ends in a letter standing alone is that
//     initial's period, as it is after a taken initial.
import fs from 'node:fs';
const file = process.argv[2];
let src = fs.readFileSync(file, 'utf8');
const edit = (from, to, times) => {
  const found = src.split(from).length - 1;
  if (found !== times) throw new Error(`expected ${times}, found ${found}: ${from.slice(0, 60)}`);
  src = src.split(from).join(to);
};
edit('(?<=\\\\p{L})(?:${core})|(?:${core})(?=\\\\p{L})', '(?<=[\\\\p{L}\\\\p{Nl}\\\\p{No}])(?:${core})|(?:${core})(?=[\\\\p{L}\\\\p{Nl}\\\\p{No}])', 2);
edit(
  'export function holdsIdentifier(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[], spent = 0): boolean {',
  `const UNSEEN = /[\\p{C}--[\\p{Default_Ignorable_Code_Point}\\s\\u0001-\\u0003]]+/gv;
export function holdsIdentifier(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[], spent = 0): boolean {
  if (holdsIdentifierAsWritten(text, patient, claims, spent)) return true;
  const joined = typeof text === 'string' ? text.replace(UNSEEN, '\\u200B') : text;
  return joined !== text && holdsIdentifierAsWritten(joined, patient, claims, spent);
}
function holdsIdentifierAsWritten(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[], spent = 0): boolean {`,
  1,
);
edit(
  "const gapFrom = preceding === undefined ? 0 : preceding.end + (preceding === before && view.text[preceding.end] === '.' ? 1 : 0);",
  "const loneEnd = (range: Range) => { const last = codePointBefore(view.text, range.end); return !WORD_CHARACTER.test(codePointBefore(view.text, range.end - last.length)); };\n    const gapFrom = preceding === undefined ? 0 : preceding.end + (view.text[preceding.end] === '.' && (preceding === before || (widerReading && !baseReading && preceding === earlier && loneEnd(preceding))) ? 1 : 0);",
  1,
);
fs.writeFileSync(file, src);
