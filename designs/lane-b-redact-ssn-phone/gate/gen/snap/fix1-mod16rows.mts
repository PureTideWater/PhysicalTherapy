// MOD-16 letters (fixed seed) for payer-word patients: rows where the payer word is glued to a digit; prints JSON rows
// {name, letter, base, cand} with base/cand = SENT | REFUSED | CHANGED.
import fc from 'fast-check';
import { pathToFileURL } from 'node:url';
import { keptSegment, KEPT_JOINS } from './prop-3fcb9359.mts';
const R = await import(pathToFileURL(process.argv[2]!).href);
const Bz = await import(pathToFileURL(process.argv[3]!).href);
const words: Record<string, RegExp> = { 'BILL Q ZEPHYRA': /\dBilled/u, 'VERA Q ZEPHYRA': /\dCoverage/u, 'ANGE Q ZEPHYRA': /\dRange/u, 'OVID Q ZEPHYRA': /\dProvider/u, 'PAGE Q ZEPHYRA': /\dPage/u, 'TOTAL Q ZEPHYRA': /\dTotal/u, 'NOTED Q ZEPHYRA': /\dNoted/u, 'RANGE Q ZEPHYRA': /\dRange/u };
const C = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-16', claimNumbers: ['SYNCLAIM0001'] }];
const samples = fc.sample(fc.array(fc.tuple(keptSegment, fc.constantFrom(...KEPT_JOINS)), { minLength: 1, maxLength: 3 }), { numRuns: 200000, seed: 1616 });
const out: Record<string, any[]> = {};
const st = (M: any, text: string, P: any) => { const s = M.redactLetterForScreen(text, P, C); return M.holdsIdentifier(s.text, P, C) ? 'REFUSED' : s.text === text.normalize('NFKC') && s.replaced === 0 ? 'SENT' : 'CHANGED'; };
for (const pieces of samples) {
  const glues = (i: number) => !/\p{L}$/u.test(pieces[i]?.[0].text ?? '') && /^\p{L}/u.test(pieces[i + 1]?.[0].text ?? '');
  const text = pieces.map(([segment, join], i) => `${segment.text}${i === pieces.length - 1 ? '' : join === '' && !glues(i) ? ' ' : join}`).join('');
  if (text.length > 110) continue;
  for (const [name, re] of Object.entries(words)) {
    if (!re.test(text)) continue;
    const P = { pseudonym: 'synthetic-patient-16', names: [name], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] };
    const base = st(Bz, text, P), cand = st(R, text, P);
    const key = `${name} ${base}->${cand}`;
    (out[key] ??= []).length < 6 && out[key]!.push(text);
    if ((out[key]!.length) >= 6) continue;
  }
}
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v));
