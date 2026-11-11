// node enum.mts <seconds>: label x (the call's own identifier | a list number) x a fragment x a number x a tail, enumerated
// and shuffled; the instrumented copy's DEPART lines, and letters the head sends that base or before refused or redacted more.
import { load, outcome, show, worse, rng } from './lib.mts';
const seconds = Number(process.argv[2] ?? 120);
const [H, P, B, F] = [await load('head'), await load('before'), await load('base'), await load('fix3')];
const departLines: string[] = [];
const origErr = console.error;
console.error = (...a: unknown[]) => { const s = a.map(String).join(' '); if (s.startsWith('DEPART')) departLines.push(s); else origErr(...a); };
const labels = ['SSN', 'SS No', 'Soc Sec', 'Phone', 'Call', 'Tel.', 'Medicare', 'PatientSSN', 'S', 'SS', 'TOLL', 'Contact:'];
const mid1 = ['', ' Jane Zephyra', ' ZZ7654321', ' SYNCLAIM0001', ' 1)', ' (2)', ' 2:', ' (12)', ' 03/14/1980', ' (Jane Zephyra, home):'];
const mid2 = ['', ' SN', ' N', ' FREE', ' ID', ' Claim', ' ' + ' '.repeat(18), ' at'];
const numbers = ['900 12 3456', '900.12 3456', '9001 23456', '555 0123', '20 2555 0123', '7886924.4', '1234567893.1', '900123456.50', '15 00 30 00', '150.00 120.00 30.00', '01/01/2020-900.12 3456', '97110 1 150.00', '2 5550123', '30.00 60.00'];
const tails = ['', ' Paid', '\n01/01/2020-150.00'];
const all: string[] = [];
for (const a of labels) for (const b of mid1) for (const c of mid2) for (const d of numbers) for (const e of tails) all.push(`${a}${b}${c} ${d}${e}`);
const r = rng(5);
for (let k = all.length - 1; k > 0; k -= 1) { const j = Math.floor(r() * (k + 1)); [all[k], all[j]] = [all[j]!, all[k]!]; }
const t0 = Date.now();
let n = 0, headSent = 0, baseFlags = 0, beforeFlags = 0, departCount = 0;
const out: string[] = [];
for (const text of all) {
  if (Date.now() - t0 > seconds * 1000) break;
  n += 1;
  const d0 = departLines.length;
  outcome(F, text);
  if (departLines.length > d0) { departCount += 1; if (departCount <= 10) out.push(`DEPART ${JSON.stringify(text)} :: ${departLines[d0]!.slice(0, 200)}`); }
  const h = outcome(H, text);
  if (h.refused) continue;
  headSent += 1;
  const b = outcome(B, text);
  const wb = worse(h, b);
  if (wb) { baseFlags += 1; if (baseFlags <= 20) out.push(`BASE ${wb} ${JSON.stringify(text)} head=${show(h, text)} base=${show(b, text)}`); }
  const p = outcome(P, text);
  const wp = worse(h, p);
  if (wp) { beforeFlags += 1; if (beforeFlags <= 10) out.push(`BEFORE ${wp} ${JSON.stringify(text)} head=${show(h, text)} before=${show(p, text)} base=${show(b, text)}`); }
}
console.log(`## enum: ${n}/${all.length} letters in ${Date.now() - t0} ms; head sent ${headSent}; DEPART ${departCount}; base flags ${baseFlags}; before flags ${beforeFlags}`);
console.log(out.join('\n'));
