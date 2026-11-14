// Windows fuzz. mode "small": head with radius 24 / margin 6 against head with windows off (class discovery, short letters).
// mode "shipped": base against head as shipped, fillers of 200 to 700 characters. No white-space run longer than 2 (P-1 kept out).
// usage: node t3.mts <mode> <seed> <count>
import fs from 'node:fs';
import { B, H, once, esc, who, claims } from './lib.mts';
const mode = process.argv[2] ?? 'small'; let s = Number(process.argv[3] ?? 1) >>> 0; const N = Number(process.argv[4] ?? 1000);
const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const words = 'The claim was reviewed and paid in full by the plan on review of records for services billed under the group policy'.split(' ');
const prose = (n: number) => { let t = ''; while (t.length < n) t += pick(words) + pick([' ', ' ', ' ', '. ', ', ', '\n']); return t; };
const idPieces = ['76543210', '7654', '3210', '76', '54', '32', '10', 'Member ID', 'Member ID:', 'ID#', 'Jane', 'Q', 'Q.', 'Zephyra', 'Zeph', 'yra', 'J.', 'Z.', 'J', 'Z', 'JQZ', 'J.Q.Z.', 'Zephyra, Jane', 'Ms. Zephyra', 'Zеphyra', 'ZEPHYRA', 'jane', '03/14/1980', '03/14', '/1980', '1980', '14', 'March', 'March 14, 1980', '1980-03-14', '03141980', 'DOB', 'born', 'Claim', 'Claim number', 'ZZ99887', 'ZZ', '99887', 'ZZ-99', '887', '150.00', '$', 'paid', 'SSN 123-45-6789', '555-010-0199', 'x', '9', 'A'];
const special = ['\u0085', '\u0085', '\u0000', '', '\u0085\u0085', '½', 'ↀ', '²', 'Ⅻ', '①', '￼', '​', '﻿', ' ', '­', '\u0001', '\u0002'];
const sep = ['', '', '', ' ', ' ', '-', '.', '/', ', ', '\n', '-\n', ': ', ' (', ') ', "'"];
const filler = () => mode === 'small' ? prose(pick([0, 10, 20, 26, 40, 70])) : prose(pick([0, 100, 200, 250, 258, 300, 330, 520, 700]));
const cluster = () => { let t = ''; const k = 1 + Math.floor(rnd() * 6); for (let i = 0; i < k; i++) t += (rnd() < 0.3 ? pick(special) : pick(idPieces)) + pick(sep); return t; };
const out = fs.createWriteStream(`out-t3-${mode}-${process.argv[3] ?? 1}.jsonl`);
const full = (M: any, text: string, wrap: (f: () => any) => any) => wrap(() => once(M, text));
let diffs = 0, worse = 0, fb = 0, win = 0; const outs: Record<string, number> = {};
for (let k = 0; k < N; k++) {
  let text = ''; const c = 1 + Math.floor(rnd() * 4);
  for (let i = 0; i < c; i++) text += filler() + ' ' + cluster() + ' ';
  text += filler(); if (rnd() < 0.5) text = text.replace(/ +/g, ' ');
  let a, b;
  if (mode === 'small') {
    a = H.matchingForTests.withWindows({ off: true }, () => once(H, text)).result;
    const on = H.matchingForTests.withWindows({ radius: 24, margin: 6 }, () => once(H, text)); b = on.result; fb += on.fallbacks; win += on.windows;
  } else { a = once(B, text); const on = H.matchingForTests.withWindows({}, () => once(H, text)); b = on.result; fb += on.fallbacks; win += on.windows; }
  outs[`${a.out}/${b.out}`] = (outs[`${a.out}/${b.out}`] ?? 0) + 1;
  if (a.out !== b.out || a.text !== b.text) { diffs++; const w = b.out === 'sent'; if (w) worse++; out.write(JSON.stringify({ worse: w, text: esc(text), ref: { out: a.out, text: esc(a.text) }, head: { out: b.out, text: esc(b.text) } }) + '\n'); }
}
out.end();
console.log(mode, 'seed', process.argv[3], 'cases', N, 'diffs', diffs, 'head sent', worse, 'windows', win, 'fallbacks', fb, JSON.stringify(outs));
