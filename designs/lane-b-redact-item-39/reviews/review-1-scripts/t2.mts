// Differential fuzz of the matcher (automaton places, lazy sources, dense rule) on short letters: base vs head.
// usage: node t2.mts <seed> <count> ; mismatches to out-t2-<seed>.jsonl
import fs from 'node:fs';
import { B, H, once, letterPath, esc } from './lib.mts';
let s = Number(process.argv[2] ?? 1) >>> 0; const N = Number(process.argv[3] ?? 2000);
const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const names = ['JANE Q ZEPHYRA', "ZOË O'BRIEN-ŞAHIN", 'ĲSBRAND ǅONKA', 'GRETA STRAßE-WEISS', 'İPEK KIRIKIŞIK', 'OʼNEIL ZEPHYRA', 'ΣΟΦΙΑ ΖΕΦΥΡΑΣ', '\u{1D409}\u{1D41A}\u{1D427}\u{1D41E} ZEPHYRA', '\u{10414}\u{1042F}\u{10445} \u{1041E}\u{1042F}\u{10449}\u{10432}', 'ANNA-MARIA Q. ZEPHYRA JR', 'NGUYỄN THỊ ZÉPHYRA', 'Zephyra, Jane/Quill', 'AL ZE'];
const ids = ['76543210', 'ZZ1234567', 'SYN556001', 'A/B-12345', '12]34[567\\8', '7654ↀ3210', '7654½3210', 'ZZ 123456', 'ZZ\n7654321', '00012', '1212121212', 'AB12AB12AB', '٣٤٥٦٧٨٩٠', 'ZZ(123)4567', 'ZZ#12.34:56', 'ǅ1234567', 'ß7654321', '７６５４３２１０', 'ZZ\u{1D7CE}123456', '11111111', 'KK1234567', 'ZZ-99887', '1980', 'X^1$2*3+4?5'];
const dobs = ['1980-03-14', '1961-03-03', '2001-12-31'];
const joiners = ['', '', '', '', ' ', '-', '.', '/', ':', '#', '(', ')', "'", 'ʼ', 'ʹ', 'ˊ', '́', '‍', '­', '￼', ' ', '-\n', '\n', '\r\n', '_', '|', '\\', '’', ',', '½', 'ↀ', '²', '\u0085', '\u0000', '​', ' ', '﻿', '　', '・', '\uD800', '٠', 'x', '9', 'ʰ', 'ͅ', '\u{1F600}', '\u{E0001}', 'Ⅶ', 'Ⅻ'];
const edges = ['', ' ', ' ', 'x', '9', 'é', 'ʼ', '́', '½', 'ↀ', '\u0085', '.', '(', '#', 'Member ID ', 'Claim ', 'DOB ', 'ICN: ', 'ID#', '\u{1D400}', '٣', 'ʰ', '\n'];
const cases = [(x: string) => x, (x: string) => x.toLowerCase(), (x: string) => x.toUpperCase(), (x: string) => x.normalize('NFD'), (x: string) => x.normalize('NFKD').toLowerCase(), (x: string) => [...x].map((c) => rnd() < 0.5 ? c.toLowerCase() : c.toUpperCase()).join('')];
const variant = (x: string) => { let v = pick(cases)(x); const dense = rnd(); return [...v].map((c, i, a) => c + (i < a.length - 1 && rnd() < (dense < 0.3 ? 0 : dense < 0.7 ? 0.2 : 0.7) ? pick(joiners) : '')).join(''); };
const dobForms = (iso: string) => { const [y, m, d] = iso.split('-'); return [`${m}/${d}/${y}`, `${m}-${d}-${y}`, `${iso}`, `${m}/${d}/${y!.slice(2)}`, `${m}${d}${y}`, `March ${Number(d)}, ${y}`]; };
const out = fs.createWriteStream(`out-t2-${process.argv[2] ?? 1}.jsonl`);
let diffs = 0, worse = 0, pathDiffs = 0; const outs: Record<string, number> = {};
for (let k = 0; k < N; k++) {
  const p = { pseudonym: 'p1', names: [pick(names), ...(rnd() < 0.3 ? [pick(names)] : [])], memberIds: [pick(ids), ...(rnd() < 0.3 ? [pick(ids)] : [])], datesOfBirth: [pick(dobs)] };
  const cn = [pick(ids), ...(rnd() < 0.5 ? [pick(ids)] : [])];
  const c = [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: cn }];
  const pool = [...p.names, ...p.names.flatMap((n) => n.split(/[\s,/]+/)), ...p.memberIds, ...cn, ...dobForms(p.datesOfBirth[0]!), ...p.names.map((n) => n.split(/\s+/).map((w) => [...w][0] + '.').join(' '))];
  const reps = pick([1, 1, 2, 3, 5, 15, 16, 17, 18, 19, 33]);
  let text = pick(['', 'Our letter. ', 'Re: ']);
  const one = pick(pool);
  for (let r = 0; r < reps; r++) text += pick(edges) + variant(rnd() < 0.7 ? one : pick(pool)) + pick(edges) + pick([' ', ' and ', '. ', '\n', '', ' paid 150.00 on ']);
  const b = once(B, text, p, c), h = once(H, text, p, c);
  outs[`${b.out}/${h.out}`] = (outs[`${b.out}/${h.out}`] ?? 0) + 1;
  if (b.out !== h.out || b.text !== h.text) { diffs++; const w = h.out === 'sent'; if (w) worse++; out.write(JSON.stringify({ kind: 'screen', worse: w, p, cn, text: esc(text), b: { out: b.out, text: esc(b.text) }, h: { out: h.out, text: esc(h.text) } }) + '\n'); }
  if (k % 4 === 0) { const lb = letterPath(B, text, p, c), lh = letterPath(H, text, p, c); if (lb.out !== lh.out || lb.text !== lh.text) { pathDiffs++; out.write(JSON.stringify({ kind: 'redactLetter', p, cn, text: esc(text), b: { out: lb.out, text: esc(lb.text) }, h: { out: lh.out, text: esc(lh.text) } }) + '\n'); } }
}
out.end();
console.log('seed', process.argv[2], 'cases', N, 'screen diffs', diffs, 'of which head sent', worse, 'redactLetter diffs', pathDiffs, JSON.stringify(outs));
