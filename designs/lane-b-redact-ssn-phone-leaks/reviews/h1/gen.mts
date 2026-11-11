// node gen.mts <seconds> <seed>: letters aimed at the scan's "by construction" claim (labels read through the call's own
// identifier or a list number, glued labels, long runs before a decimal point, held ranges, the checks' own marks).
// Prints: DEPART lines of the instrumented copy, letters the base refuses or redacts more than the head, and the same against before.
import { load, outcome, show, worse, rng } from './lib.mts';
const seconds = Number(process.argv[2] ?? 60);
const seed = Number(process.argv[3] ?? 1);
const [H, P, B, F] = [await load('head'), await load('before'), await load('base'), await load('fix3')];
const departLines: string[] = [];
const origErr = console.error;
console.error = (...a: unknown[]) => { const s = a.map(String).join(' '); if (s.startsWith('DEPART')) departLines.push(s); else origErr(...a); };
const r = rng(seed);
const pick = (a: readonly string[]): string => a[Math.floor(r() * a.length)]!;
const LAB = ['SSN', 'SSN:', 'S.S.N.', 'SS#', 'SS No', 'Soc Sec', 'Social Security', 'Social Security No.', 'HICN', 'HIC', 'Medicare', 'Medicare ID', 'Phone', 'Phone:', 'Tel', 'Tel.', 'Fax', 'Call', 'call', 'Cell', 'Contact', 'Contact:', 'TTY', 'Toll-free', 'Toll free', 'Telephone number', 'Cell number', 'Telephone call', 'please call', 'Questions? Call', 'PatientSSN', 'PATIENTSSN', 'PatientSocialSecurityNumber', 'MemberSSN No', 'PaidSSN', 'PatientPhone', 'InsuredHICN', 'ClassSSN', 'PatientSS#', 'PatientSoc Sec No', 'xS.S.N.'];
const FRAG = ['S', 'SS', 'SN', 'S N', 'N', 'S.', 'SOC', 'SEC', 'SECURITY', 'TOLL', 'FREE', 'TAX', 'ID', 'NO', '#', 'S.S', 'Soc.', 'Sec.', 'PatientS', 'xSOC'];
const OWN = ['Jane Zephyra', 'ZEPHYRA', 'Jane Q. Zephyra', 'ZZ7654321', 'SYNCLAIM0001', '03/14/1980', 'March 14, 1980', 'Zephyra, Jane', '(Jane Zephyra, home)', 'Zephyra', 'Claim SYNCLAIM0001', 'Member ZZ7654321'];
const LIST = ['1)', '2)', '(1)', '(2)', '1:', '2:', '(2nd)', '1st:', '12)', '(12)', '10:', '1 :', '( 1 )', 'No. 2)', 'number 1)', '(3rd).', '2.', '#2', '(2):', '1) (home):', '2 (cell):'];
const NOUN = ['Claim', 'Claim No.', 'CPT', 'Code', 'ZIP', 'NPI', 'TIN', 'Ref', 'Account', 'Member ID', 'ICN', 'Tax ID', 'Group', 'Check', 'HCPCS', 'Rev', 'Modifier'];
const WORD = ['Paid', 'is', 'at', 'on file', 'home', 'patient', 'Questions?', 'Billing', 'Member Services', 'please', 'us', 'our office', 'the', 'for', 'number', 'no.', 'line', 'Springfield, IL', 'units', 'Service', 'regarding your recent visit to', 'th', 'St.', 'x'];
const NUM = ['900 12 3456', '900.12 3456', '90012-3456', '9001 23456', '9 0 0 1 2 3 4 5 6', '900123456', '900 123456', '90 0123 456', '202 5550123', '2025550123', '20 2555 0123', '555-0123', '555 0123', '202.555.0123', '1 202 555 0123', '(20) 2555 0123', '(9) 00-12-3456', '9001', '23456', '900', '12', '3456', '2', '15', '00', '30', '97110', '97140', '62701-1234', '711', '4536', '98966', '0123', '202', '555', '2555', '7886924.4', '1234567893.1', '900123456.50', '2025550123.00', '900123456150.00', '12.3', '933.67', '9001.23', '34.56', '2.34', '900.12', '555.01', '12345.67', '90012.34', '56'];
const AMT = ['150.00', '120.00', '30.00', '45.00', '1,250.00', '$150.00', '$10', '15 00', '30 00', '12,345', '97110.5'];
const DATE = ['01/01/2020', '2020-01-02', 'January 1, 2020', '1/2/20', '01/15', 'Jan 2020'];
const RANGE = ['01/01/2020-150.00', '$10-900.12', '150.00-01/02/2020', '01/01/2020-01/31/2020', '2020-01-02-45.00Paid', 'Service 01/01/2020-150.00 Paid', '01/01/2020-150.00-', '01/01/2020-150.00PatientSSN', '9.00-01/02/2020'];
const SEP = [' ', ' ', ' ', ' ', ' ', ' ', ' ', '\n', '\n', ', ', ': ', '. ', ' - ', '', '', '/', '-', '\t', '  ', '\n\n', ' (', ') ', '.', ',', '\u0001', '\u0002', '\u0003', '​', '­', '\r\n'];
if (process.env.NOMARKS === "1") { for (let i = SEP.length - 1; i >= 0; i -= 1) { const c = SEP[i]!.charCodeAt(0); if (SEP[i]!.length === 1 && c >= 1 && c <= 3) SEP.splice(i, 1); } }
const PAD = [' '.repeat(8), ' '.repeat(18), ' '.repeat(22), 'of the insured person', 'for the patient named', 'x'.repeat(19), 'regarding the account holder listed above'];
function structured(): string {
  let s = r() < 0.4 ? pick(WORD) + pick(SEP) : r() < 0.15 ? pick(RANGE) + pick(SEP) : '';
  s += pick(r() < 0.85 ? LAB : FRAG);
  const k = Math.floor(r() * 4);
  for (let i = 0; i < k; i += 1) { const x = r(); s += pick(SEP) + pick(x < 0.35 ? OWN : x < 0.55 ? LIST : x < 0.7 ? FRAG : x < 0.8 ? PAD : x < 0.9 ? NOUN : WORD); }
  const m = 1 + Math.floor(r() * 5);
  for (let i = 0; i < m; i += 1) { const x = r(); s += pick(SEP) + pick(x < 0.55 ? NUM : x < 0.75 ? AMT : x < 0.85 ? DATE : x < 0.93 ? RANGE : LIST); }
  if (r() < 0.3) s += pick(SEP) + pick(WORD);
  return s;
}
const CATS = [LAB, LAB, OWN, OWN, LIST, FRAG, NOUN, WORD, NUM, NUM, NUM, AMT, AMT, DATE, RANGE, PAD];
function free(): string { const k = 3 + Math.floor(r() * 7); let s = ''; for (let i = 0; i < k; i += 1) s += (i ? pick(SEP) : '') + pick(CATS[Math.floor(r() * CATS.length)]!); return s; }
const letter = () => { const a = r() < 0.6 ? structured() : free(); return r() < 0.3 ? a + '\n' + (r() < 0.6 ? structured() : free()) : a; };
const kinds: Record<string, number> = {};
const t0 = Date.now();
let n = 0, headSent = 0, baseFlags = 0, beforeFlags = 0, departCount = 0, throws = 0;
const seen = new Set<string>();
const out: string[] = [];
while (Date.now() - t0 < seconds * 1000) {
  const text = letter();
  if (seen.has(text)) continue;
  seen.add(text);
  n += 1;
  const d0 = departLines.length;
  const f = outcome(F, text);
  if (f.text.startsWith('THROW')) throws += 1;
  if (departLines.length > d0) { departCount += 1; if (departCount <= 10) out.push(`DEPART ${JSON.stringify(text)} :: ${departLines[d0]!.slice(0, 200)}`); }
  const h = outcome(H, text);
  if (h.refused) continue;
  headSent += 1;
  const b = outcome(B, text);
  const wb = worse(h, b);
  if (wb) { baseFlags += 1; kinds[wb] = (kinds[wb] ?? 0) + 1; if (process.env.SKIP_RS === "1" ? wb !== "R>S" && kinds[wb]! <= 12 : baseFlags <= 25) out.push(`BASE ${wb} ${JSON.stringify(text)} head=${show(h, text)} base=${show(b, text)}`); }
  const p = outcome(P, text);
  const wp = worse(h, p);
  if (wp) { beforeFlags += 1; if (beforeFlags <= 12) out.push(`BEFORE ${wp} ${JSON.stringify(text)} head=${show(h, text)} before=${show(p, text)} base=${show(b, text)}`); }
}
console.log(`## gen seed ${seed}: ${n} letters in ${Date.now() - t0} ms; head sent ${headSent}; throws ${throws}; DEPART ${departCount}; base flags ${baseFlags} ${JSON.stringify(kinds)}; before flags ${beforeFlags}`);
console.log(out.join('\n'));
