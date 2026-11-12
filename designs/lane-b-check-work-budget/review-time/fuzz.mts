// Seeded hunt for a family whose time per counted unit is high or grows with length (an uncounted driver).
// tsx fuzz.mts <seed> ; screens random token families at two sizes, then sizes the dearest to the budget and times them.
import fs from 'node:fs';
import { B, calib, claimsOf, fitAndTime, once, rep, who } from './lib.mts';
const seed = Number(process.argv[2] ?? 1);
const out = `/home/user/review-time/out/fuzz-${seed}.txt`;
fs.writeFileSync(out, `node ${process.version} seed ${seed}\n`);
const log = (s: string) => { console.log(s); fs.appendFileSync(out, s + '\n'); };
let s = seed >>> 0;
const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(l: readonly T[]) => l[Math.floor(rnd() * l.length)] as T;
export const TOKENS = ['Zephyra', 'Jane', 'J', 'J.', 'Q', 'Z', 'Zeph∙yra', 'Zeph-\nyra', 'х', 'Ј', 'Zерhуrа', 'ＺＥＰＨＹＲＡ', 'ZEPHYRA', 'zephyra', 'Zephyr', 'Jan', 'ZZ1234567', 'ZZ-1234-567', 'Z Z 1 2 3 4 5 6 7', 'SYN555001', 'SYN 555 001', '555001', '1234567',
  '03/03/1961', 'Mar 3, 1961', '1961-03-03', '3 3 61', '3/3/61', '610303', '1961', 'March', '5', '1', '12', '97110', '$150.00', '150.00', '900-12-3456', '900123456', '(202) 555-0123', '202 555 0123', '٥', '３', '0',
  'Claim', 'Claims', 'Member ID', 'ID', 'DOB', 'Date of birth:', 'SSN', 'Phone', 'ICN', 'Ref', 'Service', 'Paid', 'No.', 'and', 'the', 'a', 'on', 'St.', 'am', '3rd', 'x', 'units', 'Dr.', 'Mr.',
  '[PATIENT_NAME]', '[CLAIM_1]', '[CLAIM_7654321]', '[SSN]', '[PHONE]', '[', ']', '(', ')', 'ﷺ', '⒈', '⑴', '½', '㏾', 'é', '́̂̃', '\u0001', '\u0002', '\u0003'];
export const SEPS = [' ', ' ', ' ', '', '', '\n', '\n', '\r\n', '-', '--', '​', '​​​', '­', '.', '/', ':', '#', '\t', '    ', '\n    ', ' ', '\u0085', ',', ', ', '∙', "'", '_', '|', ';', '-\n', ' - ', '\f'];
const P = who(); const C = claimsOf();
const N1 = 10_000;
const rows: { unit: string; pre: string; n2: number; u1: number; u2: number; ms1: number; ms2: number }[] = [];
once(rep('Zephyra J 5\n х 3/3/61 ')(20_000), P, C);
const started = Date.now();
const limit = Number(process.env.SCREEN_S ?? 170) * 1000;
while (Date.now() - started < limit) {
  let unit = '';
  const k = 1 + Math.floor(rnd() * 5);
  for (let i = 0; i < k; i++) unit += pick(TOKENS) + pick(SEPS);
  const pre = rnd() < 0.4 ? pick(['Zephyra ', 'Zeph∙yra Zephyra ', 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. ', 'Jane Q Zephyra\n']) : '';
  const gen = rep(unit, pre);
  const a = once(gen(N1), P, C);
  if (a.units > B) continue;
  const n2 = Math.floor(N1 * Math.min(5, Math.max(1.5, Math.sqrt((0.9 * B) / a.units))));
  const b = once(gen(n2), P, C);
  rows.push({ unit, pre, n2, u1: a.units, u2: b.units, ms1: a.ms, ms2: b.ms });
}
const cal = await calib();
log(`screened ${rows.length} families; calibration ${cal.toFixed(0)} ms (reference 144)`);
const nsu = (ms: number, u: number) => ((144 / cal) * ms / u) * 1e6;
const show = (r: (typeof rows)[number]) => `${nsu(r.ms2, r.u2).toFixed(2).padStart(6)} ns/u@ref at ${String(r.n2).padStart(6)} ch (${(r.u2 / 1e6).toFixed(0)} Mu, ${r.ms2.toFixed(0)} ms)  ${nsu(r.ms1, r.u1).toFixed(2).padStart(6)} at ${N1} (${(r.u1 / 1e6).toFixed(0)} Mu)  pre=${JSON.stringify(r.pre)} unit=${JSON.stringify(r.unit)}`;
const big = rows.filter((r) => r.ms2 >= 40);
big.sort((x, y) => y.ms2 / y.u2 - x.ms2 / x.u2);
log('--- dearest per unit at the larger size'); for (const r of big.slice(0, 14)) log(show(r));
const grow = rows.filter((r) => r.ms2 >= 40 && r.ms1 >= 8).sort((x, y) => (y.ms2 / y.u2) / (y.ms1 / y.u1) - (x.ms2 / x.u2) / (x.ms1 / x.u1));
log('--- time per unit growing most with length'); for (const r of grow.slice(0, 8)) log(show(r));
log('--- sized to the budget');
const top = [...big.slice(0, 7), ...grow.slice(0, 3)].filter((r, i, l) => l.indexOf(r) === i);
for (const r of top) await fitAndTime(JSON.stringify(r.pre + '|' + r.unit).slice(0, 60), rep(r.unit, r.pre), P, C, log);
log('done');
