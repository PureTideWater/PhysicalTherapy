// E1 follow-up: the finding letters (written to findings.txt for cmp.mts), withheld probes, a small generator. Synthetic twins only.
import fs from 'node:fs';
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
const T0 = Date.now();
const el = () => ((Date.now() - T0) / 1000).toFixed(1) + 's';
const log = (s: string) => console.log(s);
const J = (s: string) => JSON.stringify(s);
function run(k: string, text: string, pat: any = PAT) {
  try {
    const s = M[k].redactLetterForScreen(text, pat, CLAIMS);
    return { r: M[k].holdsIdentifier(s.text, pat, CLAIMS) === true, t: s.text as string };
  } catch (e) {
    return { r: true, t: 'ERR:' + String(e).slice(0, 80), err: true };
  }
}
const PH = /\[[A-Z_0-9]+\]/g;
const norm = (text: string) => text.normalize('NFKC').replace(/[[\]]/g, (b) => (b === '[' ? '(' : ')'));
const show = (o: any, text: string) => (o.err ? o.t : o.r ? 'REFUSED' : o.t === norm(text) ? 'same' : J(o.t));
function list(name: string, letters: string[], pat: any = PAT) {
  log(`\n## ${name} [${el()}]`);
  for (const text of letters) log(`${J(text)}\n    head: ${show(run('head', text, pat), text)} | before: ${show(run('before', text, pat), text)} | base: ${show(run('base', text, pat), text)}`);
}
const HELD = 'Billed 01/01/2020-150.00.';
const SP60 = ' '.repeat(60);

// ---------- the finding letters, also written one JSON string per line for cmp.mts
const FIND: Record<string, string[]> = {
  'F1 SSN label, then a noun not right after it': ['SSN/Member ID: 900-12-3456150.00', 'Patient SSN/Account #: 900-12-345601/02/2020', 'SSN on file: 900-12-345678', 'Soc. Sec. Acct. No. 900-12-345678', 'S.S.N. Account No. 900-12-3456150.00', 'Social Security\nAccount Number 900-12-345678', 'Social Security Number Account 900123456150.00', 'Social Security No. on file 900123456150.00', 'SSN or Member ID: 900-12-345678', 'SSN (Member ID): 900-12-3456150.00', 'SSN# Account 900-12-345678',
    'Social Security Account Number 900-12-345678', 'SSN 900-12-3456150.00', 'SSN 900123456150.00', 'Member SSN: 900-12-3456150.00'],
  'F2 masked number after digits': ['Paid $150XXX-XX-3456', 'CPT 97110XXX-XX-3456', 'DOS 2020-01-02XXX-XX-3456', 'NPI 1234567890***-**-3456', 'DOS 20200102XXX-XX-3456', 'Paid 150.00___-__-3456', 'DOS 01/02/2020___-__-3456', `${HELD}\nPaid $150XXX-XX-3456`, `${HELD}\nDOS 2020-01-02XXX-XX-3456`, 'Paid 1,250XXX-XX-3456', 'Units 150 XXX-XX-3456',
    'Paid 150.00XXX-XX-3456', 'DOS 01/02/2020XXX-XX-3456', 'DOS 2020.01.02XXX-XX-3456', 'Paid 150.00 XXX-XX-3456'],
  'F3 a dated year before a shape': ['Seen 01-Jan-2020900-12-3456 today.', 'Seen Jan 1,2020900-12-3456 today.', 'Seen January 2020900-12-3456 today.', 'Seen 01/2020202-555-0123 today.', 'Seen January 1,\n2020900-12-3456 today.', 'Seen 01Jan2020202-555-0123 today.', 'Seen Jan-01-2020900-12-3456 today.', 'DOS 01-JAN-2020900-12-3456 Paid 150.00', 'Seen 1-Jan-2020 900-12-3456 today.',
    'Seen Jan 1, 2020900-12-3456 today.', 'Seen 01/02/2020900-12-3456 today.', 'Seen 2020900-12-3456 today.'],
  'F4 date after a bare nine or ten': ['SSN: 90012345601/02/2020150.00 ok.', 'Seen 90012345601/02/2020150.00 ok.', 'SSN: 9001234562020-01-02150.00 ok.', 'Phone 202555012301/02/2020150.00 ok.', 'SSN: 90012345601/02/202001/31/2020 ok.', 'SSN: 90012345601-Jan-2020 ok.', 'SSN: 90012345601·02·2020 ok.', 'SSN: 90012345601\\02\\2020 ok.', 'SSN: 90012345601_02_2020 ok.', 'Seen 90012345601|02|2020 ok.', 'Seen 90012345601~02~2020 ok.', 'SSN: 90012345601∕02∕2020 ok.', 'Phone 20255501239/9/2020 ok.', 'SSN: 90012345601/02/2020, 150.00 ok.',
    'SSN: 90012345601/02/2020 ok.', 'SSN: 90012345601/02/2020 150.00 ok.', 'Seen 2025550123 01/02/2020 ok.'],
  'F5 area code in parentheses': ['Service (202)  555-0123150.00 on file.', 'Service (202) 555 0123150.00 on file.', 'Service ( 202 ) 555-0123150.00 on file.', 'Service (202)\n555-0123150.00 on file.', 'Service (202) 555-012301-Jan-2020 on file.', 'Service (202) - 555-0123150.00 on file.',
    'Service (202) 555-0123150.00 on file.'],
  'F6 list number in parentheses': ['Phone (2)555-0100', 'Phone (2​) 555-0100', 'Phone ( 2 ) 555-0100', 'Phone numbers (2) 555-0100', 'Phone\n(2) 555-0100', 'Phone (2nd) 555-0100', 'Phone (­2) 555-0100',
    'Phone (2) 555-0100'],
  'F7 nouns': ['Seen Remittance Advice 900-12-3456150.00 today.', 'Seen Please seek advice. 900-12-3456150.00 today.', `Seen NOTICE\n\n\n${' '.repeat(50)}900-12-3456150.00 today.`, `Seen Member${SP60}900-12-3456150.00 today.`, 'Seen Claim(s) 900-12-3456150.00 today.', 'Seen Claim 2020-900123456150.00 today.', 'REMITTANCE ADVICE\n\n900-12-3456150.00 01/02/2020', 'For advice, call us.\n900-12-3456150.00', `Member${SP60}900123456150.00`,
    'Seen Paid 900-12-3456150.00 today.'],
};
const all: string[] = [];
for (const [name, letters] of Object.entries(FIND)) { list(name, letters); all.push(...letters); }
fs.writeFileSync('/home/user/review-e1/findings.txt', all.map((t) => JSON.stringify(t)).join('\n') + '\n');

// ---------- F8 May across a line break, in a held letter (date of birth 1980-05-14): not reproducible with cmp.mts (fixed DOB)
list('F8 May across a line break, held letter, DOB 1980-05-14', [`${HELD}\nMember was MAY\n14TH`, `${HELD}\nBirthday: May\n14th`, `${HELD}\nThe member turns 46 on May\n14th this year.`, `${HELD}\nmay\n14th`, `${HELD}\nBirthday May\r\n14th.`, `${HELD}\nBirthday: May 14th`, `${HELD}\nYou may\n14. Appeal`, `${HELD}\nBirthday: May\n14`], PATMAY);

// ---------- withheld path: a look-alike identifier glued inside the run; head's screen text shown even when refused
log(`\n## withheld probes [${el()}]`);
const WH = ['Z3PHYRA900-12-3456', 'PaidZ3PHYRA:900-12-3456', 'PaidZ3PHYRA/SSN:900-12-3456', '150.00Z3PHYRA-900-12-3456', 'Z3PHYRAx/202-555-0123', 'XSYNCLAIMOOO1/900-12-3456', 'SYNCLAIMOOO1X-202-555-0123', 'ZZ76S4321A.900-12-3456', 'AZZ76S4321.900-12-3456', 'Z3PHYRASSN:900-12-3456', 'SSN:900-12-3456Z3PHYRA', 'Phone:555-0100/Z3PHYRAX', 'Tel:PaidZ3PHYRA:555-0100', '(202)555-0123Z3PHYRA', '900-12-3456|PaidZ3PHYRA|150.00', 'ZZ7654321/PaidZ3PHYRA/900-12-3456', 'Jane.Z3PHYRAX.900-12-3456', 'SYNCLAIM0001-Z3PHYRAX-202-555-0123', 'Jane·Z3PHYRAX·900-12-3456', 'Zephy·ra/PaidZ3PHYRA/900-12-3456', 'Phone:ZZ7654321:Z3PHYRAX:555-0100', 'Tel:Jane:XZ3PHYRA:555-0100', 'SSN:Z3PHYRAX:900123456', 'PaidZ3PHYRA 900-12-3456', 'Seen PaidZ3PHYRA(202)555-0123 and SSN 900-12-3456'];
for (const text of WH) {
  const h = run('head', text); const b = run('base', text); const f = run('before', text);
  const rh = M.head.redactLetter(text, PAT, CLAIMS).text as string; const rb = M.base.redactLetter(text, PAT, CLAIMS).text as string; const rf = M.before.redactLetter(text, PAT, CLAIMS).text as string;
  log(`${J(text)}\n    screen head: ${h.r ? 'REFUSED' : 'SENT'} ${J(h.t)} | before: ${f.r ? 'REFUSED' : 'SENT'} ${J(f.t)} | base: ${b.r ? 'REFUSED' : 'SENT'} ${J(b.t)}\n    redactLetter head: ${J(rh)} | before: ${J(rf)} | base: ${J(rb)}`);
}

// ---------- a small generator aimed at the delta: the base rule only (base refused -> head must refuse; head never shows what base replaced; redactLetter too)
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const FIVE = ['·', '‧', '∙', '⋅', '•'];
const POOLS: string[][] = [
  ['Jane Zephyra', 'Zephyra', 'Jane', 'J. Zephyra', 'Zephyra, Jane Q', 'Q', 'J', 'JANE Q ZEPHYRA', 'Zephy§ra', 'Jane§Zephyra', 'J§Zephyra', 'Z3PHYRA', 'ZEPHYRA', 'Zephyra§J', 'Q§', '§Q'],
  ['ZZ7654321', 'ZZ§7654321', 'ZZ 7654321', 'SYNCLAIM0001', 'SYNCLAIM§0001', 'SYNCLAIMOOO1', 'ZZ76S4321', '03/14/1980', '1980-03-14', 'March 14, 1980', '3/14/80', '03§14§1980'],
  ['SSN', 'SSN:', 'Phone', 'Phone:', 'Phone (2)', 'Phone 1:', 'Cell (2)', 'TTY', 'Contact', 'Fax', 'Claim', 'Claim No.', 'Member ID', 'DOB', 'Born', 'Medicare', 'Account', 'ICN', 'Ref', 'Social Security Account Number', 'Tel.', 'SSN (2)', 'SSN/Member ID:', 'Advice', 'Notice'],
  ['900-12-3456', '900 12 3456', '900123456', '900.12.3456', '202-555-0123', '(202) 555-0123', '2025550123', '555-0100', '555 0100', '5550100', '900-12-345678', '900-12-3456150.00', '90012345601/02/2020', 'XXX-XX-3456', '***-**-3456', 'XXXXX3456', '933.67 4536', '900§12§3456', '202§555§0123'],
  ['150.00', '120.00', '30.00', '$1,250.00', '01/02/2020', '01/01/2020-01/31/2020', '01/01/2020-150.00', '62701-1234', '62701', '97110', '2020', '12', '2', '(2)', '711', '0.00', '1234567890', '20260115', 'Jan 1, 2020'],
  ['Paid', 'Seen', 'for', 'is', 'on file', 'Springfield, IL', 'Questions?', 'users call', 'and', 'or', 'ext.', 'x', 'No.', '#'],
];
const SEPS = [' ', ' ', ' ', ' ', ', ', ': ', '\n', '', '', '§', ' § ', '/', '-', '.', ' - ', '\t', '(', ') ', '; '];
const occ = (s: string, t: string) => s.split(t).length - 1;
function shows(a: string, b: string) { const A = a.replace(PH, ' '); const B = b.replace(PH, ' '); const out: string[] = []; for (const t of new Set(A.match(/[\p{L}\p{N}]{2,}/gu) ?? [])) if (occ(A, t) > occ(B, t)) out.push(t); return out; }
for (const seed of (process.env.SEEDS ?? '9101,9102').split(',').map(Number)) {
  const r = rng(seed); const pick = (a: string[]) => a[Math.floor(r() * a.length)]!;
  const until = Date.now() + Number(process.env.SECS ?? '40') * 1000;
  let n = 0; let bad = 0; const tally: Record<string, number> = {};
  while (Date.now() < until) {
    const j = r() < 0.15 ? '・' : FIVE[Math.floor(r() * 5)]!;
    const parts = 2 + Math.floor(r() * 7); let s = '';
    for (let i = 0; i < parts; i += 1) s += pick(POOLS[Math.floor(r() * POOLS.length)]!) + (i < parts - 1 ? pick(SEPS) : '');
    if (r() < 0.2) s = `${HELD}\n${s}`;
    const text = s.replaceAll('§', j);
    const h = run('head', text); const b = run('base', text); n += 1;
    const key = `${h.r ? 'R' : 'S'}${b.r ? 'R' : 'S'}`; tally[key] = (tally[key] ?? 0) + 1;
    const flags: string[] = [];
    if (b.r && !h.r) flags.push('BASE-REFUSED>HEAD-SENT');
    if (!b.r && !h.r) { const m = shows(h.t, b.t); if (m.length) flags.push('HEAD-SHOWS>BASE:' + m.join(',')); }
    const rh = M.head.redactLetter(text, PAT, CLAIMS).text as string; const rb = M.base.redactLetter(text, PAT, CLAIMS).text as string;
    const m2 = shows(rh, rb); if (m2.length) flags.push('REDACTLETTER-HEAD-SHOWS>BASE:' + m2.join(','));
    if (flags.length) { bad += 1; if (bad <= 12) log(`!! seed ${seed}: ${flags.join(' ; ')}\n!!   ${J(text)}\n!!   head: ${h.r ? 'REFUSED' : J(h.t)} | base: ${b.r ? 'REFUSED' : J(b.t)}\n!!   redactLetter head: ${J(rh)} | base: ${J(rb)}`); }
  }
  log(`\n## generator seed ${seed}: ${n} letters, head/base outcomes ${JSON.stringify(tally)} (first letter head, second base; R refused, S sent), flagged ${bad} [${el()}]`);
}
