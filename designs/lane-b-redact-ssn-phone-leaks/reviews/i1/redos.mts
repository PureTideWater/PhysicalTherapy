// node redos.mts: time of redactLetterForScreen + holdsIdentifier on letters with a run of n underscores, tildes or
// box-drawing characters after a noun, then a word, then a number whose naming gluedShape asks (named -> NAMED_BEFORE).
import { load, patient, claims } from './lib.mts';
const [H, P, B] = [await load('head'), await load('before'), await load('base')];
const time = (R: any, text: string) => {
  const t = Date.now();
  let out = '';
  try { const s = R.redactLetterForScreen(text, patient, claims); out = R.holdsIdentifier(s.text, patient, claims) ? 'REFUSED' : s.text === text ? 'same' : 'redacted'; } catch { out = 'THROW'; }
  return [Date.now() - t, out] as const;
};
const forms: [string, (n: number) => string][] = [
  ['underscore blank after a noun, then a word', (n) => `Claim Number: ${'_'.repeat(n)} Date 12345-67-89012`],
  ['box rule under a header row, then "Line 1:"', (n) => `Billed   Paid   Check\n${'─'.repeat(n)}\nLine 1: 20260112345.01`],
  ['tilde run', (n) => `Member ID ${'~'.repeat(n)} see 12345-67-89012`],
  ['underscore blank, the number named by a later noun', (n) => `Member ID: ${'_'.repeat(n)}   Group: 12345-67-89012`],
  ['control: dashes (a rule before this round too)', (n) => `Claim Number: ${'-'.repeat(n)} Date 12345-67-89012`],
];
for (const [name, make] of forms) {
  for (const n of [12, 24, 30, 36, 40, 44, 48, 52]) {
    const text = make(n);
    const [ms, out] = time(H, text);
    const [pms, pout] = time(P, text);
    const [bms, bout] = time(B, text);
    console.log(`${name} n=${n}: head ${ms} ms ${out} | before ${pms} ms ${pout} | base ${bms} ms ${bout}`);
    if (ms > 2500) break;
  }
}
console.log(JSON.stringify(forms[0]![1](12)), JSON.stringify(forms[1]![1](12)));
