// E1 harness: synthetic twins only. node h.mts  (PATH/NODE_OPTIONS as in the brief)
import { pathToFileURL } from 'node:url';

const TREES: Record<string, string> = {
  head: '/home/user/fix/packages/model-gateway/src/redact.ts',
  before: '/home/user/work/p9/beforeF/redact.ts',
  base: '/home/user/tree-ef3/packages/model-gateway/src/redact.ts',
};
const KS = ['head', 'before', 'base'];
const M: Record<string, any> = {};
for (const k of KS) M[k] = await import(pathToFileURL(TREES[k]!).href);

const PAT = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321'] };
const PATMAY = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-05-14'], memberIds: ['ZZ7654321'] };
const CLAIMS = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const ONLY = new Set((process.env.ONLY ?? '').split(',').filter(Boolean));
const want = (g: string) => ONLY.size === 0 || ONLY.has(g);
const T0 = Date.now();
const el = () => ((Date.now() - T0) / 1000).toFixed(1) + 's';
const log = (s: string) => console.log(s);
const J = (s: string) => JSON.stringify(s);
const cache = new Map<string, any>();
function run(k: string, text: string, pat: any = PAT) {
  const key = k + '|' + pat.datesOfBirth[0] + '|' + text;
  let o = cache.get(key);
  if (!o) {
    try {
      const s = M[k].redactLetterForScreen(text, pat, CLAIMS);
      o = { r: M[k].holdsIdentifier(s.text, pat, CLAIMS) === true, t: s.text as string };
    } catch (e) {
      o = { r: true, t: 'ERR:' + String(e).slice(0, 80), err: true };
    }
    cache.set(key, o);
  }
  return o;
}
const PH = /\[[A-Z_0-9]+\]/g;
const norm = (text: string) => text.normalize('NFKC').replace(/[[\]]/g, (b) => (b === '[' ? '(' : ')'));
const SECRETS = ['3456', '0123', '0100', '0101', '1234', 'ZEPHYRA', 'JANE', '7654321', 'SYNCLAIM0001', '1980'];
const clearIn = (t: string) => { const u = t.replace(PH, ' ').toUpperCase(); return SECRETS.filter((s) => u.includes(s)); };
// R refused; S sent as written; x sent, changed, no secret left; c sent, changed, a secret still in clear; E error
const sym = (o: any, text: string) => (o.err ? 'E' : o.r ? 'R' : o.t === norm(text) ? 'S' : clearIn(o.t).length > 0 ? 'c' : 'x');
const show = (o: any, text: string) => (o.err ? o.t : o.r ? 'REFUSED' : o.t === norm(text) ? 'same' : J(o.t));
const toks = (s: string) => { const m = new Map<string, number>(); for (const t of s.replace(PH, ' ').match(/[\p{L}\p{N}]+/gu) ?? []) m.set(t, (m.get(t) ?? 0) + 1); return m; };
const more = (a: string, b: string) => { const A = toks(a); const B = toks(b); const out: string[] = []; for (const [t, n] of A) if (n > (B.get(t) ?? 0)) out.push(t); return out; };
let violations = 0;
function test(text: string, pat: any = PAT, rl = false) {
  const res: any = { head: run('head', text, pat), before: run('before', text, pat), base: run('base', text, pat) };
  const flags: string[] = [];
  if (res.base.r && !res.head.r) flags.push('BASE-REFUSED>HEAD-SENT');
  if (!res.base.r && !res.head.r) { const m = more(res.head.t, res.base.t); if (m.length) flags.push('HEAD-SHOWS>BASE:' + m.join(',')); }
  if (rl) {
    try {
      const rh = M.head.redactLetter(text, pat, CLAIMS).text as string; const rb = M.base.redactLetter(text, pat, CLAIMS).text as string;
      const m = more(rh, rb); if (m.length) flags.push('REDACTLETTER-HEAD-SHOWS>BASE:' + m.join(',') + ' head=' + J(rh) + ' base=' + J(rb));
    } catch (e) { flags.push('RL-ERR ' + String(e).slice(0, 60)); }
  }
  if (flags.length) { violations += 1; log(`!! ${flags.join(' ; ')}\n!!    ${J(text)}\n!!    head: ${show(res.head, text)} | before: ${show(res.before, text)} | base: ${show(res.base, text)}`); }
  res.flags = flags;
  return res;
}
function matrix(name: string, rows: string[], cols: string[], make: (row: string, col: string) => string, pat: any = PAT, rl = false) {
  log(`\n## ${name} [${el()}]\n   cols: ${cols.map(J).join('  ')}`);
  for (const row of rows) {
    const cells: Record<string, string> = { head: '', before: '', base: '' };
    for (const col of cols) { const text = make(row, col); const res = test(text, pat, rl); for (const k of KS) cells[k] += sym(res[k], text); }
    log(`${J(row).padEnd(48)} head ${cells.head}  before ${cells.before}  base ${cells.base}`);
  }
}
function list(name: string, letters: string[], pat: any = PAT, rl = false) {
  log(`\n## ${name} [${el()}]`);
  for (const text of letters) { const res = test(text, pat, rl); log(`${J(text)}\n    head: ${show(res.head, text)} | before: ${show(res.before, text)} | base: ${show(res.base, text)}`); }
}

// ---------- held discovery
const HELDC = ['Dates of service 01/01/2020-01/31/2020.', 'Dates of service 01/01/2020 - 01/31/2020.', 'Period 1/1/2020-1/31/2020.', 'Seen 0.00-01/02/2020.', 'Billed 01/01/2020-150.00.', 'Paid 150.00-120.00.', 'Codes 97110-97112.', 'Service 2020-01-01 to 2020-01-31.', '01/01/2020-01/31/2020 150.00 120.00 30.00', 'Range 100-200.', 'DOS 01/01/20-01/31/20', 'Seen 3/14/2020150.00 - 01/01/2020'];
let HELD = process.env.HELD ?? '';
const s1 = (o: any) => (o.r ? 'R' : 'S');
if (!HELD || want('held')) {
  log('## held discovery: head P / P+"Web ID 802-456-78901" ; base P / P+"PaidXXXXX3456" ; before P / P+"Web ID ..."');
  log(`probes alone: head WebID ${s1(run('head', 'Web ID 802-456-78901'))} base PaidXXXXX3456 ${s1(run('base', 'PaidXXXXX3456'))} head PaidXXXXX3456 ${s1(run('head', 'PaidXXXXX3456'))}`);
  for (const p of HELDC) {
    const a = run('head', p); const b2 = run('head', p + '\nWeb ID 802-456-78901');
    const c = run('base', p); const d = run('base', p + '\nPaidXXXXX3456');
    const e = run('before', p); const f2 = run('before', p + '\nWeb ID 802-456-78901');
    log(`${J(p).padEnd(50)} head ${s1(a)}/${s1(b2)}  base ${s1(c)}/${s1(d)}  before ${s1(e)}/${s1(f2)}`);
    if (!HELD && !a.r && b2.r && !c.r && d.r && !e.r) HELD = p;
  }
  log(`HELD = ${J(HELD)}`);
}

// ---------- G4 masks in a held letter
if (want('g4') && HELD) {
  matrix('G4 masked number glued, in a held letter', ['', 'Paid', 'Paid 150', 'Acct 4', 'Paid 12', '97110', '2020-01-02', '$150', '2020', '150.00', '01/02/2020', '1234567890'],
    ['XXX-XX-3456', '***-**-3456', 'XXXXX3456', '*****3456', 'XXX XX 3456', 'XXXXX-3456', '___-__-3456', '_____3456'], (p, m) => `${HELD}\nNote ${p}${m} thanks.`);
  list('G4b recorded held forms', [`${HELD}\nAccount 0XXXXX1234`, `${HELD}\nLoan 12*****1234`, `${HELD}\nAcct 4XXX-XX-1234`, `${HELD}\nPaid 12XXX-XX-3456`, `${HELD}\nPaid 150XXX-XX-3456`, `${HELD}\nPaid $150***-**-3456`]);
}

// ---------- G1 SSN label, a noun, a glued number
const NUMS = ['900-12-345678', '900-12-3456150.00', '900-12-345601/02/2020', '900123456150.00', '90012345601/02/2020'];
const SSNLBL = ['SSN ', 'Social Security Account Number ', 'SSN Member ID ', 'Member SSN: ', 'Member ID: ',
  'SSN/Member ID: ', 'SSN or Member ID: ', 'SSN (Member ID): ', 'SSN on file: ', 'SSN on record: ', 'SSN - Subscriber: ', 'SSN, Policy No. ', 'SSN for this request: ', 'SSN and Account: ', 'Soc. Sec. Acct. No. ', 'S.S.N. Account No. ', 'SSN# Account ', 'Social Security\nAccount Number ', 'Social Security Account\nNumber ', 'Social Security Account Number\n', 'Social Security Number / Account Number ', 'Social Security No. on file ', 'Patient SSN/Account #: ', 'SS# / Acct #: ', 'SSN:\tMember ', 'SSN: Member ', 'Social Security Number Account ', 'Social Security Number (Account) ', 'SSN / Claim No. ', 'SSN/Case: ', 'SSN-Ref: ', 'SSN (see notice) ', 'SSN per statement ', 'SSN: see letter ', 'Soc Sec # on file ', 'SSN/TIN: ', 'SSN/EIN ', 'SSN or Tax ID: ', 'SS No./Account No. ', 'HICN / Claim No. ', 'SSN:\nMember ID: ', 'Social Security Acct No. ', 'Social Security account # ',
  'DOB ', 'Patient ', 'Insured ID ', 'Medicaid ID ', 'HIC ', 'HICN ', 'Medicare ', 'Medicare No. ', 'Medicare ID: ', 'Medicare beneficiary ', 'Railroad Retirement No. ', 'Beneficiary ID ', 'ID ', 'Tax ID ', 'Subscriber SSN/ID: '];
if (want('g1')) matrix('G1 SSN label / noun / glued number', SSNLBL, NUMS, (l, n) => `Re: your letter.\n${l}${n}\nThank you.`);

// ---------- G9 Avenue A: joiner templates
const JOINERS = ['·', '‧', '∙', '⋅', '•', '・'];
const TPL = ['Patient Jane§Zephyra paid.', 'Patient Zephy§ra paid.', 'Patient J§Zephyra paid.', 'Patient J.§Zephyra paid.', 'Patient Zephyra§J paid.', 'Patient Jane§Q§Zephyra paid.', 'Patient Jane Q§Zephyra paid.', 'Patient Q§Zephyra paid.', 'Patient Q §Zephyra paid.', 'Zephyra,§Jane', '§ Jane Zephyra', '§Zephyra§', 'Jane§ Zephyra', 'Jane §Zephyra', 'Ja§ne Zephyra', 'J§Q§Zephyra', 'Z§e§p§h§y§r§a', 'Zephyra§Vantree', 'Zephyra§s account',
  'Member ID ZZ§7654321.', 'Member ID ZZ7654§321.', 'Member ID§ZZ7654321.', 'ID: §ZZ7654321§', 'Claim SYNCLAIM§0001.', 'Claim SYN§CLAIM0001.', 'Claim§SYNCLAIM0001.', 'Claim SYNCLAIM0001§150.00', 'ZZ7654321§Zephyra', 'Zephyra§ZZ7654321', 'Z§Z7654321', 'ZZ7654321§SYNCLAIM0001',
  'DOB 03§14§1980.', 'DOB 1980§03§14.', 'DOB March§14§1980.', 'DOB 14§March§1980.', 'DOB March 14§1980.', 'DOB§03/14/1980.', 'DOB 03/14/1980§150.00', 'Born 3§14§80.', 'DOB 03/14§1980', 'March 14,§1980',
  'SSN 900§12§3456.', 'Phone 202§555§0123.', 'SSN§900-12-3456.', 'Phone§555-0100.', 'SSN 900-12-3456§Zephyra', 'Zephyra§900-12-3456', 'Zephy§ra§900-12-3456', 'SSN Zephy§ra 900123456', 'Claim Zephy§ra, 900123456', 'Claim Jane§Zephyra, 900123456', 'Phone Jane§Zephyra 555-0100', 'SSN Jane§Zephyra 900 12 3456', 'SSN: J§Zephyra 900 12 3456', 'Member ZZ§7654321 SSN 900 12 3456', 'SSN ZZ7654§321 900123456', 'Phone SYNCLAIM§0001 555-0100', 'Claim 1: Zephy§ra, 900123456', 'Claim Q Zephy§ra 900123456 150.00', 'Q Zephy§ra 150.00 120.00 30.00', 'Zephy§ra 900 12 3456', 'Zephy§ra 933.67 4536', 'Contact Zephy§ra, Springfield, IL 62701-1234', 'Contact Jane§Zephyra, Springfield, IL 62701-1234', 'Contact Jane§Zephyra 150.00 120.00 30.00', 'TTY Jane§Zephyra: 150.00 120.00 30.00', 'Phone Q§Zephyra 933.67 4536', 'Phone Q Zephy§ra 933.67 4536', 'Cell J§Q§Zephyra is 933.67 4536',
  '§ Item one\nSSN 900 12 3456 for Jane Zephyra', '§ Phone 555-0100\n§ Jane Zephyra\n§ ZZ7654321', 'SSN §§§-§§-3456', 'Paid§§§-§§-3456', 'Claim 900123456§Zephyra, 900123457', 'Claim Zephyra§900123456, 900123457', 'Claim J§Zephyra 900123456', 'Claim Zephyra§J 900123456', 'Claim Zephyra J§ 900123456', 'SSN J§ Zephyra 900123456', 'Phone Jane§Q Zephyra 5550100', 'Phone Zephyra §Q 555-0100'];
if (want('g9')) {
  matrix('G9 Avenue A joiners (cols 00B7 2027 2219 22C5 2022 | 30FB)', TPL, JOINERS, (t, j) => t.replaceAll('§', j), PAT, true);
  log('-- asymmetry of the BASE between each joiner and U+30FB (the claim behind asBaseRead)');
  for (const t of TPL) {
    const ref = run('base', t.replaceAll('§', '・')); const refT = (ref.r ? 'R' : ref.t.replaceAll('・', '§'));
    const diff: string[] = [];
    for (const j of JOINERS.slice(0, 5)) { const o = run('base', t.replaceAll('§', j)); const oT = (o.r ? 'R' : o.t.replaceAll(j, '§')); if (oT !== refT) diff.push(`U+${j.codePointAt(0)!.toString(16).toUpperCase()} base=${oT === 'R' ? 'REFUSED' : J(oT)}`); }
    if (diff.length) log(`ASYM ${J(t)}: base(30FB)=${refT === 'R' ? 'REFUSED' : J(refT)} ; ${diff.join(' ; ')}`);
  }
}

// ---------- G10 Avenue A: withheld (pattern match inside a run with a look-alike identifier glued)
const WITHHELD = ['2EPHYRA900-12-3456', 'ZEPHYR4-900-12-3456', 'Paid:2EPHYRA/SSN:900-12-3456', 'ZEPHYR4/202-555-0123', '2EPHYRA(202)555-0123', 'SYNCLAIMOOO1/900-12-3456', '5YNCLAIM0001-202-555-0123', 'ZZ76S4321.900-12-3456', 'ZZ7654321-2EPHYRA-900-12-3456', 'Jane/2EPHYRA/900-12-3456', 'SSN:900-12-3456/2EPHYRA', 'Phone:555-0100/ZEPHYR4', '2EPHYRA 900-12-3456', 'ZEPHYR4,900-12-3456', 'ZEPHYR4·900-12-3456', 'Zephy·r4-900-12-3456', 'J4NE-900-12-3456', 'Z3PHYRA_900-12-3456', 'ZEPHYRA900-12-3456', 'ZEPHYR4SSN900-12-3456', 'SSN#900-12-3456ZEPHYR4', '(202)555-0123ZEPHYR4', '202-555-0123/SYNCLA1M0001', '900-12-3456|2EPHYRA|150.00', 'Seen ZEPHYR4-900-12-3456 and ZZ7654321 today', 'Seen 2EPHYRA/202-555-0123, Jane Zephyra', 'SSN 900-12-3456 2EPHYRA-555-0100', 'Phone 2EPHYRA-555-0100', 'Phone:2EPHYRA:555-0100', 'Phone ZZ7654321/2EPHYRA/555-0100', 'Tel:SYNCLAIM0001:2EPHYRA:555-0100', 'SSN:ZZ7654321:ZEPHYR4:900123456'];
if (want('g10')) list('G10 withheld', WITHHELD, PAT, true);

// ---------- G3 masked number glued (no held range)
const PRE_MASK = ['', 'Paid', 'Fax', '2020', '01/02/2020', '150.00', '01/02/20', 'Jan 2, 2020',
  '4', '12', '150', 'Paid 150', '$150', '$1,250', '1500', '97110', '62701', '1234567890', 'A1234', '2020-01-02', '2020/01/02', '2020.01.02', '20200102', '01022020', '12:30', '150,00', '150.5', '0.5', '01/02', 'Jan 2', '12020', '2020-01', '100%', '(150)', '150-', 'No.', '2020 ', '1,250.00', '-150.00', '150.00)', '150.000', 'ICN 12345', 'CPT 97110'];
if (want('g3')) matrix('G3 masked number glued', PRE_MASK, ['XXX-XX-3456', '***-**-3456', 'XXX XX 3456', '___-__-3456', '•••-••-3456', 'XXX-XX-\n3456'], (p, m) => `Amount ${p}${m} thanks.`);

// ---------- G2 a dated year glued before a shape
const DATES_BEFORE = ['', '2020', '01/02/2020', 'Jan 1, 2020', '1 January 2020', 'PaidJan 1, 2020', '1st of January, 2020', '01/02/20', '2020-01-02',
  'Jan 1,2020', 'January 1,2020', 'Jan. 1,2020', 'Jan 1st,2020', '01-Jan-2020', '1-Jan-2020', '01/Jan/2020', '01.Jan.2020', '01Jan2020', '1Jan2020', '01 Jan,2020', 'Jan-01-2020', 'Jan/01/2020', 'Jan1, 2020', 'Jan 2020', 'January 2020', 'Jan. 2020', 'January, 2020', '01/2020', '1/2020', '01-2020', 'January 1 , 2020', 'January 1,\n2020', 'January\n1, 2020', 'January   1, 2020', 'January 1,   2020', '01 / 02 / 2020', '01/02/ 2020', 'Jan​ 1, 2020', 'Jan 1,​ 2020', 'Jan 1, ​2020', 'Jan 1, ­2020', '01/02/​2020', '01​/02/2020', '01/02­/2020', '2019-2020', 'Jan 1 2020', '1/2/2020', '1.2.2020', 'Thursday, January 2, 2020', 'January 2nd of 2020', '01\\02\\2020', '01 02 2020', '01·02·2020', '01∕02∕2020', '01⁄02⁄2020', '1 Jan., 2020', 'the 1st day of January, 2020', '01/02/2020 10:30', 'FY2020', 'DOS: 1/2/2020', '20200102', '01022020'];
if (want('g2')) matrix('G2 date before a shape', DATES_BEFORE, ['900-12-3456', '202-555-0123'], (d, s) => `Seen ${d}${s} today.`);

// ---------- G5 a date glued after a bare nine or ten
const DATES_AFTER = ['', '01/02/2020', '01-02-2020', '01.02.2020', '2020-01-02', '2020/01/02', '06-22-2027',
  '1/2/2020', '1/02/2020', '1-2-2020', '9/9/2020', '01/02/2020150.00', '01/02/2020 150.00', '01/02/20201', '01-Jan-2020', '01JAN2020', 'Jan 1, 2020', '01/02/20', '01∕02∕2020', '01⁄02⁄2020', '01·02·2020', '01\\02\\2020', '01_02_2020', '01:02:2020', '01 02 2020', '01/ 02/2020', '01​/02/2020', '0​1/02/2020', '​01/02/2020', '01/02/­2020', '­01/02/2020', '01/02/2020-01/31/2020', '01/02/2020–01/31/2020', '01/02/2020 - 01/31/2020', '2020-01-02T10:30', '2020-1-2', '01/02/2020.', '01,02,2020', '01|02|2020', '31/12/2020', '12/31/2020', '32/01/2020', '00/01/2020', '13/13/2020', '01/02/1899', '01/02/2100', '2020-13-01', '20-01-02', '01/02/2020ZZ', '01/02/2020x', '/01/02/2020', '-01-02-2020', '\n01/02/2020', '01/02/2020/3', '01/02/2020-3', '01/02/2020.50', '1 Jan 2020'];
if (want('g5')) matrix('G5 date after a bare nine or ten', DATES_AFTER, ['SSN: 900123456', 'Seen 900123456', 'Phone 2025550123', 'Seen 2025550123'], (d, c) => `${c}${d} ok.`);

// ---------- G7 list number in parentheses
const LISTN = ['Phone (2) 555-0100', 'Phone (2): 555-0100', 'Phone (2)555-0100', 'Phone (2)  555-0100', 'Phone (2)\n555-0100', 'Phone (2)\t555-0100', 'Phone ( 2 ) 555-0100', 'Phone (2 ) 555-0100', 'Phone (02) 555-0100', 'Phone (12) 555-0100', 'Phone (2nd) 555-0100', 'Phone (#2) 555-0100', 'Phone (no. 2) 555-0100', 'Phone (b) 555-0100', 'Phone (ii) 555-0100', 'Phone (2) - 555-0100', 'Phone (2), 555-0100', 'Phone (2). 555-0100', 'Phone (2​) 555-0100', 'Phone (­2) 555-0100', 'Phone (2)​ 555-0100', 'Phone​ (2) 555-0100', 'Phone （2） 555-0100', 'Phone (２) 555-0100', 'Phone [2] 555-0100', 'Phone {2} 555-0100', 'Phone <2> 555-0100', 'Phone 2) 555-0100', 'Phone No. (2) 555-0100', 'Phone number (2) 555-0100', 'Phone numbers (2) 555-0100', 'Phone Nos. (2) 555-0100', 'Phone # (2) 555-0100', 'Phone #(2) 555-0100', 'Home phone (2) 555-0100', 'Phone (home) (2) 555-0100', 'Phone (2) (home) 555-0100', 'Phone (2) home 555-0100', 'Cell (2) 555-0100', 'Fax (2) 555-0100', 'Tel. (2) 555-0100', 'Telephone (2) 555-0100', 'Contact (2) 555-0100', 'Call (2) 555-0100', 'Phone  (2) 555-0100', 'Phone   (2) 555-0100', 'Phone\n(2) 555-0100', 'Phone: (2) 555-0100', 'Phone - (2) 555-0100', 'Phone (2) (3) 555-0100', 'Phone (2) 555-0100 (3) 555-0101',
  'SSN (2) 900 12 3456', 'SSN (2) 900123456', 'SS# (2) 900 12 3456', 'Social Security (2) 900 12 3456', 'Social Security Number (2) 900 12 3456', 'Social Security No. (2) 900.12.3456', 'SSN (2) 900 12 3456 78', 'SSN (2) 900-12 3456', 'SSN (2) 900 123456', 'SSN (2) 90 012 3456', 'SSN (2) 9 0 0 1 2 3 4 5 6', 'SSN (2) 900 12 34 56', 'SSN (2) 900/12/3456',
  'Phone (2) 555-0100 555-0101', 'Phone (2) 555-0100/0101', 'Phone (2) 555-0100, 555-0101', 'Phone (2) 555-0100 0101', 'Phone (2) 555-0100 123', 'Phone (2) 555-0100-0101', 'Phone (2) 202 555-0100', 'Phone (2) 202, 555-0100', 'Phone (2) 202  555-0100', 'Phone (2) 202\n555-0100', 'Phone (2) 202: 555-0100', 'Phone (2) 202 - 555-0100', 'Phone (2) 5550100', 'Phone (2) 555 0100', 'Phone (2) 555.0100', 'Phone (2) 55 50 100', 'Phone (1) 202 555 0123', 'Phone (1) 202-555-0123', 'Phone (2) 1-202-555-0123', 'Phone (2) 202 555 0123 4', 'Phone (2) 555-0100 ext. 12', 'Phone (20) 2555-0100', 'Phone (2) 02-555-0100', 'Phone (20) 2-555-0100', 'Phone (20) 25550100', 'Phone (2) 025550100', 'Phone (20) 2 555 0100', 'Phone (2) 02 555 0100', 'Phone (2) 0 2 5 5 5 0 1 0 0 1', 'Phone (2) 20 25 55 01 00',
  'TTY (2) 711 555-0100', 'Phone (2) 555-0100 900 12 3456', 'Phone (2) 555-0100 933.67 4536', 'Cell (2) 933.67 4536 555-0100', 'Phone (2) 555-0100 150.00 120.00 30.00', 'Phone (2) 150.00 120.00 555-0100'];
if (want('g7')) list('G7 list number in parentheses', LISTN);

// ---------- G6 phone with its area code in parentheses, digits glued after
const PAREN = ['(202) 555-0123150.00', '(202) 555-012301/02/2020', '(202)555-0123150.00', '(202)-555-0123150.00', '(202) - 555-0123150.00', '(202)  555-0123150.00', '(202) 555 0123150.00', '(202) 555 - 0123150.00', '(202)\n555-0123150.00', '(202)\t555-0123150.00', '( 202 ) 555-0123150.00', '(202 ) 555-0123150.00', '( 202) 555-0123150.00', '(202)​555-0123150.00', '(202) ​555-0123150.00', '(202​) 555-0123150.00', '(202) 555‑0123150.00', '(202) 555–0123150.00', '(202) 555·0123150.00', '(202) 555.0123150.00', '(202) 555/0123150.00', '1 (202) 555-0123150.00', '+1 (202) 555-0123150.00', '1(202)555-0123150.00', '(202) 555-0123150.00-120.00', '(202) 555-0123202-555-0124', '(202) 555-01232020-01-02', '(202) 555-012301-Jan-2020', '(202) 555-01231/2/2020', '（202） 555-0123150.00', '(２０２) 555-0123150.00', '[202] 555-0123150.00', '{202} 555-0123150.00', '<202> 555-0123150.00', '/202/ 555-0123150.00', '202) 555-0123150.00', '(202 555-0123150.00', '(202). 555-0123150.00', '(202)_555-0123150.00', '(202) 555-0123150.00', '(202) 555-0123 150.00', '(202) 555-0123', '(202) 555-012345', '(202) 555-0123x45150.00'].map((s) => `Service ${s} on file.`);
if (want('g6')) list('G6 area code in parentheses', PAREN);

// ---------- G8 date of birth in May, in a held letter
if (want('g8') && HELD) {
  const MAYS = ['born May 14th', 'born May 14,', 'on 14 May.', 'the 14th of May', 'born May\n14th', 'born May\n14th.', 'born May \n 14th', 'born May\r\n14th', 'born May,\n14th', 'born May -\n14th', 'born May\n14', 'born May\n14,', 'born May\n14.', 'born May the\n14th', 'born May\n\n14th', 'MAY\n14TH', 'born on May\n14th, as noted', 'on 14 May, at home', 'on the 14th May; then', '(14 May)', '14 May: noted', 'on 14 May\nat home', 'on 14th May\n', 'May\t14th', 'May  14th', 'May 14th', 'May​14th', 'May ​14th', 'May/14', 'born May14th', 'born 14May.', '14.May.'].map((s) => `${HELD}\nMember was ${s}`);
  list('G8 May in a held letter (DOB 1980-05-14)', MAYS, PATMAY);
}

// ---------- G11 cents / nouns
const CENTS = ['900-12-3456150.00-120.00', '900-12-3456150.00-120', '900-12-3456150.00-1,200.00', '900-12-3456150.00-01-02-2020', '900-12-3456150.00-1.2.2020', '900-12-3456150.00–120.00', '900-12-3456150.00‐120.00', '900-12-3456150.00~120.00', '900-12-3456150.00/120.00', '900-12-3456150.00-120.00-90.00', '900-12-3456150.00-0.5', '900123456150.00-120.00', '900123456150.00-120', '900-12-3456150.00-2020-01-02', '900-12-3456150.00-20200102', '900-12-3456150.00-75%', '900-12-3456150.00-.50', '900-12-3456150.00- 120.00', '900-12-3456150.00 -120.00', '900-12-3456150.00-1/2/2020', '900-12-3456150.00-1/2', '900-12-3456150.00-120.000', '900-12-3456150.00-1234567.89', '900-12-3456150.00-12345678901234567890.00',
  'Remittance Advice 900-12-3456150.00', 'Advice: 900-12-3456150.00', 'Please seek advice. 900-12-3456150.00', 'Claim(s) 900-12-3456150.00', 'Member' + ' '.repeat(60) + '900-12-3456150.00', 'NOTICE\n\n\n' + ' '.repeat(50) + '900-12-3456150.00', 'Claim 2020-900123456150.00', 'Member|1|900-12-3456150.00', 'Member' + ' '.repeat(60) + '900123456150.00', 'Member' + ' '.repeat(60) + '90012345601/02/2020', 'Statement of Account' + '.'.repeat(60) + '900-12-345678'];
if (want('g11')) list('G11 cents and nouns', CENTS.map((s) => `Seen ${s} today.`));

// ---------- G12 a label over a run glued before the shape, loose writings
const LABELRUN = ['SSN: 2020900-12-3456', 'SSN 1234900-12-3456', 'Phone 2020202-555-0123', 'SSN 01/02/2020900-12-3456', 'SSN: 150,00900-12-3456', 'SSN 62701900-12-3456', 'Social Security Number 20200102900-12-3456', 'Tel 5550100202-555-0123', 'SSN 150.00900-12-3456', 'SSN $150900-12-3456', 'SSN 12900-12-3456', 'SSN: 1900-12-3456', 'Medicare 2020900-12-3456', 'SSN 900.12 345601/01/2020', 'SSN 900 12.345601/01/2020', 'Phone 202.555 012301/01/2020', 'SSN 900 12 345601/01/2020', 'SSN 900 12 3456150.00', 'Medicare 900 12 3456150.00', 'Medicare 900-12-345678', 'Medicare 900-123-45678'];
if (want('g12')) list('G12 label and run', LABELRUN);

log(`\nviolations of the base rule flagged: ${violations}; elapsed ${el()}`);
