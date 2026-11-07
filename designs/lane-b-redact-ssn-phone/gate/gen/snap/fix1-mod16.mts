// usage (from gate/gen/snap): node fix1-mod16.mts <redact.ts> <base redact.ts> [runs] [seed] [names,...]
// MOD-16's keepsWhatMustStay letters for a patient (default JANE Q ZEPHYRA; NAMES=... for a list, one drawn per letter):
// bad = sent changed or refused where the base sent it unchanged (held = base refused: counted apart).
import fc from 'fast-check';
import { pathToFileURL } from 'node:url';
import { keptSegment, KEPT_JOINS } from './prop-3fcb9359.mts';
const R = await import(pathToFileURL(process.argv[2]!).href);
const Bz = await import(pathToFileURL(process.argv[3]!).href);
const runs = Number(process.argv[4] ?? 20000);
const seed = Number(process.argv[5] ?? 42);
const names = (process.argv[6] ?? 'JANE Q ZEPHYRA').split(',');
const C = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-16', claimNumbers: ['SYNCLAIM0001'] }];
const samples = fc.sample(fc.tuple(fc.array(fc.tuple(keptSegment, fc.constantFrom(...KEPT_JOINS)), { minLength: 1, maxLength: 8 }), fc.nat(names.length - 1)), { numRuns: runs, seed });
let bad = 0, heldRefused = 0, heldSent = 0;
const shown: string[] = [];
const byName: Record<string, number> = {};
for (const [pieces, k] of samples) {
  const name = names[k]!;
  const P = { pseudonym: 'synthetic-patient-16', names: [name], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] };
  const glues = (i: number) => !/\p{L}$/u.test(pieces[i]?.[0].text ?? '') && /^\p{L}/u.test(pieces[i + 1]?.[0].text ?? '');
  const text = pieces.map(([segment, join], i) => `${segment.text}${i === pieces.length - 1 ? '' : join === '' && !glues(i) ? ' ' : join}`).join('');
  const s = R.redactLetterForScreen(text, P, C);
  const refused = R.holdsIdentifier(s.text, P, C);
  const ok = !refused && s.text === text.normalize('NFKC') && s.replaced === 0;
  const sb = Bz.redactLetterForScreen(text, P, C);
  const baseOk = !Bz.holdsIdentifier(sb.text, P, C) && sb.text === text.normalize('NFKC') && sb.replaced === 0;
  if (!baseOk) { if (ok) heldSent += 1; else heldRefused += 1; continue; }
  if (!ok) {
    bad += 1; byName[name] = (byName[name] ?? 0) + 1;
    if (shown.length < 15) shown.push(`${name} ${refused ? 'REFUSED' : 'CHANGED ' + JSON.stringify(s.text)} ${JSON.stringify(text)}`);
  }
}
console.log(`runs ${runs} seed ${seed} bad ${bad} (base-not-sent: candidate sent ${heldSent}, refused ${heldRefused}) ${JSON.stringify(byName)}`);
for (const s of shown) console.log('  ', s);
