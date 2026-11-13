// proto-r3.mjs <redact.ts> [--ii]: Queues item 40, stage 1 (W71): the MEASURING prototype of proto.mjs extended, over a
// scratch copy that proto.mjs has already edited (lay40.sh). Never run on the checkout.
//  P4 (ruling 3 of 2026-11-13, refuse): redactLetterForScreen reads rule (a) once more on the letter AS GIVEN, before
//     NFKC, with every number character that is no decimal digit ([\p{Nl}\p{No}]) written as U+2180 (which NFKC keeps and
//     P1 reads): one right beside a digits-only stored number refuses the letter whether or not NFKC rewrites it
//     ("①76543210", "76543210²"). It only adds the refusing mark to what the first reading wrote: no reading is changed.
//     In the screen entry only (the gate's path); redactLetter, redactionSpans and the drafter's check are not given it.
//  --ii (R1-4's fallback, instead of P2's further reading): the check refuses every letter that holds an unseen character.
import fs from 'node:fs';
const [file, mode] = process.argv.slice(2);
let src = fs.readFileSync(file, 'utf8');
const edit = (from, to, times) => {
  const found = src.split(from).length - 1;
  if (found !== times) throw new Error(`expected ${times}, found ${found}: ${from.slice(0, 60)}`);
  src = src.split(from).join(to);
};
edit(
  '  if (first.spans.length + wider.length > 0 && gluedBeforeRedaction(raw, subject, first.spans)) {',
  `  if (/[\\p{Nl}\\p{No}]/u.test(text) && digitsGluedToLetter(unmarked(unbracketed(text.replace(/[\\p{Nl}\\p{No}]/gu, '\\u2180'))), subject)) {
    return { text: refusedByMarkAfter(first.text), claims: first.claims, replaced: first.replaced, candidates: first.candidates };
  }
  if (first.spans.length + wider.length > 0 && gluedBeforeRedaction(raw, subject, first.spans)) {`,
  1,
);
if (mode === '--ii') {
  edit(
    "  const joined = typeof text === 'string' ? text.replace(UNSEEN, '\\u200B') : text;\n  return joined !== text && holdsIdentifierAsWritten(joined, patient, claims, spent);",
    "  return typeof text === 'string' && text.search(UNSEEN) >= 0;",
    1,
  );
}
fs.writeFileSync(file, src);
