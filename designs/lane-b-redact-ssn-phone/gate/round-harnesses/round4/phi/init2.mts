// Synthetic only. Two initials of the patient's name written together, in held frames. Hit: A refused, B sends both letters.
import { readFileSync, writeFileSync } from 'node:fs';
import { A, B, run } from './lib.mts';
const frames: string[] = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const norange = (f: string) => f.replace(/(01\/01\/2020|1\/1\/20|2020-01-01|01\.01\.2020|Jan 1, 2020|03\/01\/2020)\s*[-–—−‐]\s*\n?(?:\$?150\.00|\$?120\.00|\$45\.00|01\/02\/2020|1\/2\/20|2020-01-02|01\.02\.2020|Jan 2, 2020|03\/05\/2020)/u, '$1 ').replace(/\$?150\.00-\$?120\.00/u, '150.00 ');
const cases: [string[], string[]][] = [
  [['JANE ZEPHYRA'], ['JZ', 'ZJ', 'J Z', 'J.Z', 'J.Z.', 'J. Z.', 'Jz', 'jz', 'J-Z', 'J/Z', 'J&Z', 'JZ.']],
  [['JANE Q ZEPHYRA'], ['JQ', 'QZ', 'JZ', 'J.Q.', 'Q.Z.', 'J Q', 'Q Z']],
  [['SIMONE VANTREE'], ['SV', 'S.V.', 'S V', 'VS']],
];
const out: string[] = []; const by: Record<string, number> = {}; let n = 0;
for (const [names, toks] of cases) for (const t of toks) {
  const p = { names };
  const letters = t.replace(/[^A-Za-z]/g, '');
  const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
  for (const f of frames) {
    const l = f.replace('{T}', t); n++;
    const a = run(A, l, p), b = run(B, l, p);
    if (!(b !== 'REFUSED' && re.test(b) && (a === 'REFUSED' || !re.test(a)))) continue;
    const nr = norange(f).replace('{T}', t);
    const aNR = run(A, nr, p), bNR = run(B, nr, p);
    const cls = nr === l ? 'no-twin' : bNR !== 'REFUSED' && re.test(bNR) ? (aNR !== 'REFUSED' && re.test(aNR) ? 'A-like' : 'NOT-A(A)') : 'NOT-A(B)';
    const k = `${names[0]} ${t} ${cls}`; by[k] = (by[k] ?? 0) + 1;
    out.push(JSON.stringify({ names, t, l, a: a === 'REFUSED' ? a : 'RED', b: b === l ? 'SENT' : b, cls, letters }));
  }
}
writeFileSync(process.argv[3]!, out.join('\n') + '\n');
console.log('frames', frames.length, 'letters', n, 'hits', out.length); for (const [k, v] of Object.entries(by)) console.log(v, k);
