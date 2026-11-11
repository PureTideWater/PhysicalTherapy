// node glue.mts <seconds> <seed> [nodet]: 1(a) and 2(iv). Letters with a Social Security label glued after a letter, the
// call's own identifier in a form only the head reads (a fresh match), a list number, a number a label names through one of
// them, and a held range. Prints: DEPART lines of the instrumented copy; letters the base refuses or redacts more than the
// head (BASE); texts the base's check refuses that the head's check passes as they stand (CHECK-LESS); letters before
// refused or redacted more (BEFORE), apart where the head sends them exactly as the base does.
import { load, outcome, show, worse, rng, patient, claims } from './lib.mts';
const seconds = Number(process.argv[2] ?? 110), seed = Number(process.argv[3] ?? 11), det = process.argv[4] !== 'nodet';
const [H, P, B, F] = [await load('head'), await load('before'), await load('base'), await load('fix3')];
const departLines: string[] = [];
const origErr = console.error;
console.error = (...a: unknown[]) => { const s = a.map(String).join(' '); if (s.includes('DEPART')) departLines.push(s); else origErr(...a); };
const origWrite = process.stderr.write.bind(process.stderr);
(process.stderr as any).write = (chunk: any, ...rest: any[]) => { const s = String(chunk); if (s.includes('DEPART')) { departLines.push(s); return true; } return (origWrite as any)(chunk, ...rest); };
const r = rng(seed);
const pick = (a: readonly string[]): string => a[Math.floor(r() * a.length)]!;
const GL = ['PatientSSN', 'PATIENTSSN', 'MemberSSN', 'PatientSSN:', 'PatientSSN#', 'PatientS.S.N.', 'PatientSocial Security', 'PatientSocialSecurityNumber', 'PatientSoc Sec No', 'InsuredHICN', 'MemberSSN No', 'MemberSSN Number:', 'NameSSNs', 'Assoc. Sec.', 'DependentSOC. SEC.', 'theSSN', 'xSSN', 'PatientSSN No.', 'SubscriberSocial Security No', 'MemberHICN:', 'PaidSSN', 'ClassSSN'];
const PL = ['SSN', 'SSN:', 'Phone', 'Phone:', 'Tel', 'Call', 'Fax', 'Medicare', 'Contact', 'Cell number', 'Telephone number', 'Social Security No.', 'TTY', 'please call', 'Telephone call', 'Member SSN'];
const OWNF = ['Zephy∙ra', 'Jane∙Zephyra', 'Z3PHYRA', 'Zephуra', 'J4ne Zephyra', 'ZZ76S4321', 'SYNCLAIMOOO1', 'Zephyra', 'Jane Zephyra', 'ZZ7654321', 'SYNCLAIM0001', '(Jane Zephyra, home)', 'Zephyra,', 'Jane Q. Zephyra', 'Zephyra·Jane', 'J•Zephyra', 'ΖEPHYRA', 'ZZ7654321​', '03/14/1980', 'ZEPHYR4', 'Jane‧Q‧Zephyra', 'Member ZZ7654321', 'Claim SYNCLAIM0001'];
const LIST = ['1)', '2)', '(1)', '(2)', '1:', '2:', '(2nd)', '1st:', '12)', '(12)', '1 :', '(3rd).'];
const NUM = ['555-0123', '555-0100', '202-555-0123', '(202) 555-0123', '900-12-3456', '900 12 3456', '900123456', '2025550123', '90012-3456', '9 0 0 1 2 3 4 5 6', '8 1234567893.1', '1234567893.1', '7886924.4', '900.12 3456', '9001 23456', '555.0123', '5550123', '900', '12', '3456', '0123', '202', '8', '97110', '62701-1234', '933.67 4536', '2.34 56', '9001 2.34 56', '900123456.50', '900123456150.00', '12 3456', '20 2555 0123', '00123456', '1 7886924.4', '30.00 60.00', '98966 45.00', '900 123456', '1234567893'];
const AMT = ['150.00', '120.00', '30.00', '45.00', '1,250.00', '$150.00', '15 00'];
const DATE = ['01/01/2020', '2020-01-02', 'January 1, 2020', '1/2/20'];
const RANGE = ['Service 01/01/2020-150.00 Paid', '01/01/2020-150.00', '150.00-01/02/2020', '01/01/2020-150.00PatientSSN', '$10-900.12', '2020-01-02-45.00Paid'];
const WORD = ['Paid', 'is', 'at', 'on file', 'home', 'patient', 'Billing', 'number', 'no.', 'for', 'x', 'th', 'Questions?', 'Member Services'];
const NOUN = ['Claim', 'CPT', 'Code', 'ZIP', 'NPI', 'Ref', 'Account', 'Member ID', 'ICN', 'Group'];
const SEP = [' ', ' ', ' ', ' ', ' ', ' ', '\n', ', ', ': ', '. ', ' - ', '', '/', '-', '\t', '  ', ' (', ') ', '​', '­', '\n\n'];
function letter(): string {
  let s = '';
  if (r() < 0.25) s += pick(RANGE) + pick(SEP);
  if (r() < 0.3) s += pick(WORD) + pick(SEP);
  s += r() < 0.75 ? pick(GL) : pick(PL);
  const k = Math.floor(r() * 3);
  for (let i = 0; i < k; i += 1) { const x = r(); s += pick(SEP) + pick(x < 0.45 ? OWNF : x < 0.65 ? LIST : x < 0.8 ? WORD : x < 0.9 ? NOUN : PL); }
  const m = 1 + Math.floor(r() * 4);
  for (let i = 0; i < m; i += 1) { const x = r(); s += pick(SEP) + pick(x < 0.6 ? NUM : x < 0.75 ? AMT : x < 0.83 ? DATE : x < 0.9 ? OWNF : x < 0.95 ? LIST : GL); }
  if (r() < 0.25) s += pick(SEP) + pick(r() < 0.5 ? GL : PL) + pick(SEP) + pick(NUM);
  if (r() < 0.2) s += pick(SEP) + pick(WORD);
  if (r() < 0.15) s += '\n' + pick(RANGE);
  return s;
}
let n = 0, headSent = 0, departCount = 0, checkLess = 0, baseFlags = 0, asBase = 0, differs = 0;
const kinds: Record<string, number> = {};
const out = { depart: [] as string[], base: [] as string[], checkless: [] as string[], asBase: [] as string[], differs: [] as string[] };
const seen = new Set<string>();
function run(text: string) {
  if (seen.has(text)) return;
  seen.add(text); n += 1;
  const d0 = departLines.length;
  outcome(F, text);
  if (departLines.length > d0) { departCount += 1; if (out.depart.length < 10) out.depart.push(`DEPART ${JSON.stringify(text)} :: ${departLines[d0]!.slice(0, 160)}`); }
  const h = outcome(H, text), b = outcome(B, text);
  if (b.refused && !b.text.startsWith('THROW')) {
    let pass = false;
    try { pass = !H.holdsIdentifier(b.text, patient, claims); } catch { pass = false; }
    if (pass) { checkLess += 1; if (out.checkless.length < 12) out.checkless.push(`CHECK-LESS ${JSON.stringify(text)} base's text ${JSON.stringify(b.text)} head=${show(h, text)}`); }
  }
  if (h.refused) return;
  headSent += 1;
  const wb = worse(h, b);
  if (wb) { baseFlags += 1; kinds[wb] = (kinds[wb] ?? 0) + 1; if (out.base.length < 25) out.base.push(`BASE ${wb} ${JSON.stringify(text)} head=${show(h, text)} base=${show(b, text)}`); }
  const p = outcome(P, text);
  const wp = worse(h, p);
  if (wp) {
    if (!b.refused && b.text === h.text) { asBase += 1; if (out.asBase.length < 8) out.asBase.push(`BEFORE ${wp} (as base) ${JSON.stringify(text)} head=${show(h, text)} before=${show(p, text)}`); }
    else { differs += 1; if (out.differs.length < 30) out.differs.push(`BEFORE ${wp} ${JSON.stringify(text)} head=${show(h, text)} before=${show(p, text)} base=${show(b, text)}`); }
  }
}
const t0 = Date.now();
let dn = 0;
if (det) {
  const GLd = ['PatientSSN', 'MemberSSN:', 'PatientSocial Security No.', 'InsuredHICN', 'Assoc. Sec.'];
  const MID = ['', 'Zephy∙ra', 'Z3PHYRA', '(Jane Zephyra, home):', 'Call Zephyra at 555-0123', 'Phone 1: 555-0100', 'ZZ76S4321', '1)', '(2)', 'Jane∙Zephyra', 'Claim SYNCLAIM0001', 'J4ne Zephyra'];
  const NUMd = ['900123456', '90012-3456', '900 12 3456', '8 1234567893.1', '7886924.4', '555-0123', '9 0 0 1 2 3 4 5 6', '2025550123', '900 123456', '9001 23456', '900123456.50', '1 7886924.4', '30.00 60.00', '933.67 4536', '00123456', '202 555 0123'];
  const EXTRA = ['', ' 150.00', ' Paid 01/01/2020-150.00', '\nService 01/01/2020-150.00 Paid'];
  for (const g of GLd) for (const m of MID) for (const num of NUMd) for (const e of EXTRA) {
    run(`${g} ${m}${m ? ' ' : ''}${num}${e}`);
    if (m) { run(`${m} ${g} ${num}${e}`); run(`${g} ${num} ${m}${e}`); }
  }
  dn = n;
}
while (Date.now() - t0 < seconds * 1000) run(r() < 0.25 ? letter() + '\n' + letter() : letter());
console.log(`## glue seed ${seed}: ${n} letters (${dn} of them the fixed product) in ${Date.now() - t0} ms; head sent ${headSent}; DEPART ${departCount}; CHECK-LESS ${checkLess}; base flags ${baseFlags} ${JSON.stringify(kinds)}; before flags: ${asBase} sent exactly as the base sends, ${differs} other`);
console.log([...out.depart, ...out.base, ...out.checkless, ...out.differs, ...out.asBase].join('\n'));
