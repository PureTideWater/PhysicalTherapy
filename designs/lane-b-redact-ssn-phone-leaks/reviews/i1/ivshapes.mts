// node ivshapes.mts: 2(iv) and 1(a) on usual and split writings of an SSN or phone under a Social Security label glued
// after a letter, with a list number, the call's own identifier (plain and in forms only the head reads), an amount or a
// date between, and an amount, cents or a date after. Any letter the head sends that before or the base refused or redacted more.
// Then family (ii) once more, counting the letters before refused and the head sends by the number's writing.
import { load, outcome, show, worse } from './lib.mts';
const [H, P, B] = [await load('head'), await load('before'), await load('base')];
const GL = ['PatientSSN', 'MemberSSN:', 'PatientSocial Security No.', 'InsuredHICN', 'Assoc. Sec.', 'PATIENTSSN#', 'theSSN', 'PatientSS#', 'NameSSNs', 'MemberSSN Number:'];
const BETWEEN = ['', '1) ', '(2) ', '1: ', 'Zephy∙ra ', 'Z3PHYRA ', '(Jane Zephyra, patient): ', 'is ', 'on file: ', 'Jane Zephyra ', 'ZZ76S4321 ', '\n', '150.00 ', '01/01/2020 ', 'Claim SYNCLAIM0001 '];
const NUMS = ['900-12-3456', '900 12 3456', '900123456', '900.12.3456', '90012-3456', '900 123456', '9001 23456', '900-123456', '900 12-3456', '9 0 0 1 2 3 4 5 6', '900/12/3456', '900 - 12 - 3456', '900.12 3456', '900 12.3456', '202-555-0123', '(202) 555-0123', '2025550123', '202.555.0123', '202 555 0123', '555-0123', '1-202-555-0123', '20 2555 0123', '90 0123 456'];
const TAILS = ['', '.50', '150.00', ' 150.00', '01/02/2020', ' Paid', '1', ' 150.00 120.00', ' 97110 1 45.00'];
let n = 0, sent = 0, bf = 0, pf = 0;
const out: string[] = [];
const t0 = Date.now();
for (const g of GL) for (const m of BETWEEN) for (const num of NUMS) for (const tail of TAILS) {
  const text = `${g} ${m}${num}${tail}`;
  n += 1;
  const h = outcome(H, text);
  if (h.refused) continue;
  sent += 1;
  const b = outcome(B, text), p = outcome(P, text);
  const wb = worse(h, b), wp = worse(h, p);
  if (wb) { bf += 1; if (out.length < 30) out.push(`BASE ${wb} ${JSON.stringify(text)} head=${show(h, text)} base=${show(b, text)} before=${show(p, text)}`); }
  if (wp) { pf += 1; if (out.length < 60) out.push(`BEFORE ${wp} ${JSON.stringify(text)} head=${show(h, text)} before=${show(p, text)} base=${show(b, text)}`); }
}
console.log(`## ivshapes: ${n} letters in ${Date.now() - t0} ms; head sent ${sent}; base flags ${bf}; before flags ${pf}`);
console.log(out.join('\n'));
const byNum = new Map<string, number>(), byPre = new Map<string, number>();
let n2 = 0;
for (const pre of ['SSN/Medicare ID', 'SSN Medicare', 'Medicare/SSN', 'Medicare SSN', 'SSN', 'Medicare', 'Social Security Act. Medicare rate', 'SSN: Medicare rate', 'SSN (Medicare) No.', 'HICN Medicare', 'SSN Phone', 'Phone SSN', 'SSN Claim', 'SSN Medicare Claim', 'Medicare ID', 'PatientSSN Medicare', 'PatientSSN', 'Medicare number or SSN', 'Medicare PatientSSN'])
  for (const join of [' ', ': ', ' No. ', ' # ', '\n']) for (const num of ['900 12.3456', '900 12 3456', '900.12 3456', '900 12-3456', '900-12 3456', '900  12.3456', '110 32.7442', '900 12.34567', '900 12·3456', '900 12. 3456', '900 12 .3456'])
    for (const tail of ['150.00', '', '01/02/2020', '0', ' 150.00', '.50']) {
      const text = `${pre}${join}${num}${tail}`;
      n2 += 1;
      const h = outcome(H, text);
      if (h.refused || !worse(h, outcome(P, text))) continue;
      byNum.set(num, (byNum.get(num) ?? 0) + 1);
      byPre.set(pre, (byPre.get(pre) ?? 0) + 1);
    }
console.log(`## family (ii) again: ${n2} letters; before refused and the head sends, by the number's writing: ${JSON.stringify([...byNum])}; by the label: ${JSON.stringify([...byPre])}`);
