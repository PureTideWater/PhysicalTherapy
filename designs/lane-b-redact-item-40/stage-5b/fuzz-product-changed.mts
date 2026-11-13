// fuzz-product-changed.mts <tree A> <tree B> <out.jsonl> [seeds=401,402,403] [letters=20000]: the item's own fuzz.mts
// (the product's fuzzed letters, test-support/fuzz-letters.ts of the checkout, read only; the design note's 60,000),
// with every letter both trees send with a DIFFERENT text, or one refuses and the other sends, written whole to
// <out.jsonl> to be read one by one (synthetic values only). Queues item 40, stage 4 (W75): the note left its 6 unread.
import fs from 'node:fs';
const [aDir, bDir, out, seedsArg = '401,402,403', lettersArg = '20000'] = process.argv.slice(2);
const A = await import(`${aDir}/redact.ts`);
const B = await import(`${bDir}/redact.ts`);
const { fuzzLetters } = await import('/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/fuzz-letters.ts');
const entry = (H: any, letter: any) => {
  const patient = { pseudonym: 'synthetic-patient-r3', names: [...letter.names], datesOfBirth: ['1961-03-03'], memberIds: [...letter.memberIds] };
  const claims = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-r3', claimNumbers: [...letter.claimNumbers] }];
  const r = H.redactLetterForScreen(letter.text, patient, claims);
  return H.holdsIdentifier(r.text, patient, claims, H.checkWorkOf(r)) ? null : (r.text as string);
};
const w = fs.createWriteStream(out!);
const total = { letters: 0, aRefused: 0, bRefused: 0, aRefusedBSent: 0, aSentBRefused: 0, bothSentDifferent: 0 };
for (const seed of seedsArg.split(',').map(Number)) {
  let index = 0;
  for (const letter of fuzzLetters(seed, Number(lettersArg))) {
    const a = entry(A, letter); const b = entry(B, letter);
    total.letters += 1;
    if (a === null) total.aRefused += 1;
    if (b === null) total.bRefused += 1;
    if (a === null && b !== null) total.aRefusedBSent += 1;
    if (a !== null && b === null) total.aSentBRefused += 1;
    if (a !== null && b !== null && a !== b) total.bothSentDifferent += 1;
    if (a !== b) w.write(JSON.stringify({ seed, index, names: letter.names, memberIds: letter.memberIds, claimNumbers: letter.claimNumbers, text: letter.text, a, b }) + '\n');
    index += 1;
  }
}
w.end(); console.log(`all: ${JSON.stringify(total)}`);
