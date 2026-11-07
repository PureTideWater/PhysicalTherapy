// Synthetic only. Names made only of short parts (2-3 letters) in held frames. Hit: A refused or redacted, B sends the
// letters of the form. Class by the no-range twin (B hides it there: NOT-A').
import { readFileSync, writeFileSync } from 'node:fs';
import { A, B, run } from './lib.mts';
const all: string[] = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const frames = all.filter((_, i) => i % 5 === 0);
const norange = (f: string) => f.replace(/(01\/01\/2020|1\/1\/20|2020-01-01|01\.01\.2020|Jan 1, 2020|03\/01\/2020)\s*[-–—−‐]\s*\n?(?:\$?150\.00|\$?120\.00|\$45\.00|01\/02\/2020|1\/2\/20|2020-01-02|01\.02\.2020|Jan 2, 2020|03\/05\/2020)/u, '$1 ').replace(/\$?150\.00-\$?120\.00/u, '150.00 ');
const cases: [string, string[]][] = [
  ['LEE ZEPHYRA', ['Lee', 'LeePaid', 'PaidLee', 'LEEPAID', 'lee', 'LeeZ', 'L.Lee', 'Lee1', 'LEE\nPAID', 'Le\u200be']],
  ['ANN Q VANTREE', ['Ann', 'AnnPaid', 'PaidAnn', 'ANNQ', 'QANN', 'ann', 'An\nn', 'A.N.N.']],
  ['BOB XU', ['Bob', 'BOBXU', 'XuBob', 'XUBOB', 'BobPaid', 'Bo b', 'B o b', 'Xu']],
  ['JO AN LI', ['JoPaid', 'PaidLi', 'LiPaid', 'JOANLI', 'AnLi', 'JoAn']],
];
const alnum = (s: string) => s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
const out: string[] = []; const by: Record<string, number> = {}; let n = 0;
for (const [name, toks] of cases) for (const t of toks) {
  const p = { names: [name] };
  const want = alnum(t);
  const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'u');
  const clear = (x: string) => x !== 'REFUSED' && re.test(x);
  for (const f of frames) {
    const l = f.replace('{T}', t); n++;
    const a = run(A, l, p), b = run(B, l, p);
    if (!(clear(b) && !clear(a))) continue;
    const nr = norange(f).replace('{T}', t);
    const aNR = run(A, nr, p), bNR = run(B, nr, p);
    const cls = nr === l ? 'no-twin' : clear(bNR) ? (clear(aNR) ? 'A-like' : 'NOT-A(A)') : 'NOT-A(B)';
    const k = `${name} ${JSON.stringify(t)} ${cls}`; by[k] = (by[k] ?? 0) + 1;
    out.push(JSON.stringify({ name, t, l, a: a === 'REFUSED' ? a : 'RED', b: b === l ? 'SENT' : b, nr, bNR: bNR === nr ? 'SENT' : bNR, aNR: aNR === nr ? 'SENT' : aNR, cls, want }));
  }
}
writeFileSync(process.argv[3]!, out.join('\n') + '\n');
console.log('frames', frames.length, 'letters', n, 'hits', out.length); for (const [k, v] of Object.entries(by)) console.log(v, k);
