// fuzz.mts <base src> <head src> [seeds=401,402,403] [letters=20000]: the product's own fuzzed letters (test-support/
// fuzz-letters.ts of the checkout, read only), each through the whole entry on both trees. Prints, per seed and in
// all: refused on each, base-refused and head-sent (must be 0), base-sent and head-refused, and both sent with a
// different text. Places only; no letter's text is printed.
const [baseDir, headDir, seedsArg = '401,402,403', lettersArg = '20000'] = process.argv.slice(2);
const A = await import(`${baseDir}/redact.ts`);
const B = await import(`${headDir}/redact.ts`);
const { fuzzLetters } = await import('/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/fuzz-letters.ts');
const entry = (H: any, letter: any) => {
  const patient = { pseudonym: 'synthetic-patient-r3', names: [...letter.names], datesOfBirth: ['1961-03-03'], memberIds: [...letter.memberIds] };
  const claims = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-r3', claimNumbers: [...letter.claimNumbers] }];
  const r = H.redactLetterForScreen(letter.text, patient, claims);
  return H.holdsIdentifier(r.text, patient, claims, H.checkWorkOf(r)) ? null : (r.text as string);
};
const total = { letters: 0, baseRefused: 0, headRefused: 0, baseRefusedHeadSent: 0, baseSentHeadRefused: 0, bothSentDifferent: 0 };
for (const seed of seedsArg.split(',').map(Number)) {
  const t = { letters: 0, baseRefused: 0, headRefused: 0, baseRefusedHeadSent: 0, baseSentHeadRefused: 0, bothSentDifferent: 0 };
  for (const letter of fuzzLetters(seed, Number(lettersArg))) {
    const a = entry(A, letter); const b = entry(B, letter);
    t.letters += 1;
    if (a === null) t.baseRefused += 1;
    if (b === null) t.headRefused += 1;
    if (a === null && b !== null) t.baseRefusedHeadSent += 1;
    if (a !== null && b === null) t.baseSentHeadRefused += 1;
    if (a !== null && b !== null && a !== b) t.bothSentDifferent += 1;
  }
  console.log(`seed ${seed}: ${JSON.stringify(t)}`);
  for (const key of Object.keys(total) as (keyof typeof total)[]) total[key] += t[key];
}
console.log(`all: ${JSON.stringify(total)}`);
