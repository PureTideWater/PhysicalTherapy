// base vs head: letters the base REFUSES and the head SENDS; of those, how many with a letter or digit outside placeholders.
import path from 'node:path'; import { pathToFileURL } from 'node:url'; import fs from 'node:fs';
const [A, B, out, seed0, n0] = process.argv.slice(2);
const HA = await import(pathToFileURL(path.join(A!, 'redact.ts')).href); const HB = await import(pathToFileURL(path.join(B!, 'redact.ts')).href);
let s = Number(seed0) >>> 0; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
const NAMES = ['AAAAAAAA', 'ABABABAB', 'ZEPHYRAZ', 'JANE ZEPHYRA', 'ANNA HANNAH', "AA'AAAAAA", 'JANE+ZEPHYRA', 'NANA NAN'];
const NUMS = ['12121/2121', '12312312', '000&11', '11111111', '11111111/7', '7,7,7,7,7', 'ZZ12345/01', '12 12 12', '76543210', '21318-5', '1001001', 'ZZ12345 01'];
const SEPS = [' ', ' ', '\u0085', '.', '/', '&', '\r\n', '\n', '\n\r', ',', ';', '\t', '-', ':', '\r', '+', '(', '\u0004', ' ', ''];
const LABELS = ['Member ID ', 'Claim No. ', 'Ref ', 'Dear ', 'Fax X', 'Patient: ', ''];
const cut = (v: string) => { const a = Math.floor(rnd() * v.length); const b = a + 1 + Math.floor(rnd() * (v.length - a)); let p = v.slice(a, b); if (rnd() < 0.3) p = p.toLowerCase(); if (rnd() < 0.2) p = [...p].map((c) => (rnd() < 0.5 ? c.toLowerCase() : c)).join(''); if (rnd() < 0.25) p = [...p].join(pick(SEPS)); return p; };
const w = fs.createWriteStream(out!); let refA = 0, refB = 0, both = 0, aOnly = 0, aOnlyClear = 0, bOnly = 0;
const N = Number(n0);
for (let i = 0; i < N; i++) {
  const names = [pick(NAMES)]; const m = [pick(NUMS)]; const c = [pick(NUMS), ...(rnd() < 0.4 ? [pick(NUMS)] : [])].filter((x, j, a) => a.indexOf(x) === j);
  const P = { pseudonym: 'synthetic-patient-r3', names, datesOfBirth: ['1961-03-03'], memberIds: m };
  const C = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-r3', claimNumbers: c }];
  const vals = [...names, ...m, ...c]; let text = ''; const k = 2 + Math.floor(rnd() * 9);
  for (let j = 0; j < k; j++) text += (rnd() < 0.2 ? pick(LABELS) : '') + (rnd() < 0.35 ? pick(vals) : cut(pick(vals))) + pick(SEPS);
  const run = (H: any) => { const r = H.redactLetterForScreen(text, P, C); return { refused: H.holdsIdentifier(r.text, P, C, H.checkWorkOf(r)) as boolean, text: r.text as string }; };
  const a = run(HA), b = run(HB); if (a.refused) refA++; if (b.refused) refB++;
  if (a.refused && b.refused) both++; else if (b.refused) bOnly++; else if (a.refused) { aOnly++; const clear = b.text.replace(/\[[A-Z_0-9]+\]/g, '').replace(/[^\p{L}\p{N}]/gu, '').length; if (clear > 0) aOnlyClear++; w.write(JSON.stringify({ i, clear, names, m, c, text, a: a.text, b: b.text }) + '\n'); }
}
w.end(); console.log(`seed ${seed0} letters ${N} refusedA ${refA} refusedB ${refB} both ${both} A-only(base refuses, head sends) ${aOnly} of which with a letter or digit outside placeholders ${aOnlyClear} B-only ${bOnly}`);
