// Records, for seeds of the fuzz shapes, which letters a tree REFUSES (the whole entry), and checks a second tree against it.
import path from 'node:path'; import { pathToFileURL } from 'node:url'; import fs from 'node:fs';
import { fuzzLetters, sumOf } from './shapes.ts';
const [A, B, out, n0, ...seeds] = process.argv.slice(2);
const HA = await import(pathToFileURL(path.join(A!, 'redact.ts')).href); const HB = await import(pathToFileURL(path.join(B!, 'redact.ts')).href);
const verdict = (H: any, l: any) => { const P = { pseudonym: 'synthetic-patient-r3', names: l.names, datesOfBirth: ['1961-03-03'], memberIds: l.memberIds }; const C = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-r3', claimNumbers: l.claimNumbers }]; const r = H.redactLetterForScreen(l.text, P, C); return { refused: H.holdsIdentifier(r.text, P, C, H.checkWorkOf(r)) as boolean, text: r.text as string }; };
const rec: any = {}; let bad = 0, total = 0, textDiffOnBaseRefused = 0;
for (const seed of seeds.map(Number)) { const letters = fuzzLetters(seed, Number(n0)); const refused: number[] = []; let refB = 0;
  letters.forEach((l, i) => { const a = verdict(HA, l); const b = verdict(HB, l); total++; if (b.refused) refB++; if (a.refused) { refused.push(i); if (!b.refused) { bad++; console.log(`seed ${seed} i ${i} BASE REFUSED, HEAD SENT`); } else if (a.text !== b.text) textDiffOnBaseRefused++; } });
  rec[seed] = { letters: letters.length, sum: sumOf(letters), refused }; console.log(`seed ${seed} letters ${letters.length} sum ${rec[seed].sum} base refused ${refused.length} head refused ${refB}`); }
fs.writeFileSync(out!, JSON.stringify(rec)); console.log(`base-refused, head-sent ${bad} of ${total}; base-refused with another text on the head ${textDiffOnBaseRefused}`);
