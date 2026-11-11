// node time.mts : head/before time on long letters (relative; alternating, best of 3). Synthetic only.
import { H1, N, patient, claimsOf } from './lib.mts';
const P = patient(['ZZ19800314']); const C = claimsOf([['SYNCLAIM0001']]);
const P2 = patient(['ZZ19800314', '0123']); 
const rep = (unit: string, bytes: number) => unit.repeat(Math.ceil(bytes / unit.length));
const cases: [string, string, any, any][] = [
  ['200KB, merged phone under own look-alike each line (4.4k)', rep('Member ID: ZZ1980O314\n555-0123\nPaid in full.\n', 200_000), P, C],
  ['200KB, same with own 0123 inside the phone', rep('Member ID: ZZ1980O314\n555-0123\nPaid in full.\n', 200_000), P2, C],
  ['200KB, dense: only merged runs', rep('ZZ1980O314 555-01', 200_000).replace(/555-01/g, (m, i) => `555-01${String(i % 100).padStart(2, '0')}\n`), P, C],
  ['200KB, plain own + separate phones (ownText equals screenText? no: phones are spans)', rep('Member ID: ZZ19800314 Tel 202-555-0123 Paid in full.\n', 200_000), P, C],
  ['200KB, realistic prose, few matches', rep('Dear provider, the claim was processed on 01/02/2020 and paid at the contracted rate of $150.00 per unit.\n', 199_000) + 'Member ID: ZZ1980O314\n555-0123\n', P, C],
  ['20KB, merged each line', rep('Member ID: ZZ1980O314\n555-0123\nPaid in full.\n', 20_000), P, C],
  ['4KB realistic letter, one merged run', rep('Dear provider, the claim was processed on 01/02/2020 and paid at the contracted rate.\n', 4_000) + 'Member ID: ZZ1980O314\n555-0123\n', P, C],
  ['empty', '', P, C], ['lone surrogate beside a merged run', 'ID ZZ1980O314\uD800 555-0123 \uDC00', P, C], ['one 200KB line, merged runs joined by |', rep('ZZ1980O314 555-0123|', 200_000), P, C],
  ['200KB, three own matches and a number per line, 40 claims', rep('Claim SYN445S667 ID ZZ1980O314\n555-0123 Zephyra 03/14/1980\n', 200_000), P, claimsOf(Array.from({ length: 40 }, (_, i) => [i === 0 ? 'SYN4455667' : `SYNCLAIM${String(1000 + i)}`]))],
];
for (const [name, t, p, c] of cases) {
  const best = { h: Infinity, x: Infinity }; let err = ''; let same = true; let nc = [0, 0];
  for (let i = 0; i < 3; i += 1) {
    try { let a = performance.now(); const h = H1.redactLetterForScreen(t, p, c); best.h = Math.min(best.h, performance.now() - a); a = performance.now(); const x = N.redactLetterForScreen(t, p, c); best.x = Math.min(best.x, performance.now() - a); same &&= h.text === x.text; nc = [h.candidates.length, x.candidates.length]; } catch (e) { err = String(e).slice(0, 200); break; }
    if (best.h > 40_000) break;
  }
  console.log(`${name}: length ${t.length} before ${best.h.toFixed(0)} ms head ${best.x.toFixed(0)} ms ratio ${(best.x / best.h).toFixed(2)} sentSame ${same} candidates ${nc.join('/')} ${err}`);
}
