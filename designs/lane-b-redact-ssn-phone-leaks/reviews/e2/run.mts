// Reviewer E2: node run.mts [seed]. Targeted letters, the joiner letters (A4), the list-number fuzz (A1), the glued-shape fuzz (A2/A3).
import { M, JANE, MAYP, CLAIMS, HELD, out, rl, show, targeted, el, memo } from './lib.mts';
let seed = Number(process.argv[2] ?? 11);
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (xs: readonly any[]): any => xs[Math.floor(rnd() * xs.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const dg = (n: number, nz = true) => {
  let s = '';
  for (let i = 0; i < n; i += 1) s += String(i === 0 && nz ? int(1, 9) : int(0, 9));
  return s;
};
const p2 = (n: number) => String(n).padStart(2, '0');
const amt = () => `${int(1, 999)}.${dg(2, false)}`;
const day2 = () => p2(int(1, 28));
const yr = () => String(int(2019, 2027));
const date = () => `${p2(int(1, 12))}/${day2()}/${yr()}`;

// ---------- targeted ----------
targeted('MASK (logic: digits before a mask)', [
  ['m-yfirst', 'DOS 2020-01-02XXX-XX-3456'],
  ['m-ymd-star', 'DOS 2020-01-02***-**-3456'],
  ['m-mdy(ctl)', 'DOS 01/02/2020XXX-XX-3456'],
  ['m-yy', 'DOS 01/02/20XXX-XX-3456'],
  ['m-cur', 'Paid $150XXX-XX-3456'],
  ['m-cur2', 'Paid $1,500XXX-XX-3456'],
  ['m-cents(ctl)', 'Paid 150.00XXX-XX-3456'],
  ['m-int3', 'Paid 150XXX-XX-3456'],
  ['m-cpt', '97110XXX-XX-3456'],
  ['m-yr.', 'Paid in 2020.XXX-XX-3456'],
  ['m-word.(ctl)', 'Paid.XXX-XX-3456'],
  ['m-4dig', 'Check 1234XXX-XX-3456'],
  ['m-1dig(rec)', 'Acct 4XXX-XX-1234'],
  ['m-pattern', 'SSN XXX-XX-3456'],
  ['m-bare', 'XXX-XX-3456'],
  ['m-1dec', 'Paid 150.5XXX-XX-3456'],
  ['m-ten', 'Ref 2025550100XXX-XX-3456'],
  ['m-held-yfirst', HELD + 'DOS 2020-01-02XXXXX3456'],
  ['m-held-cur', HELD + 'Paid $150XXXXX3456'],
  ['m-held-ctl', HELD + 'DOS 01/02/2020XXXXX3456'],
  ['m-held-int3', HELD + 'Paid 150XXXXX3456'],
]);
targeted('CENTS_GLUED', [
  ['c-ctl', 'Seen 900-12-3456150.00-120.00'],
  ['c-mdy-dash', 'Seen 900-12-3456150.00-01-02-2020'],
  ['c-slash(ctl)', 'Seen 900-12-3456150.00-1/2/2020'],
  ['c-dotdate', 'Seen 900-12-3456150.00-01.02.2020'],
  ['c-endash', 'Seen 900-12-3456150.00–120.00'],
  ['c-int', 'Seen 900-12-3456150.00-120'],
  ['c-slice11', 'Seen 900123456150.00-12345678901234567.123'],
  ['c-slice-shape', 'Seen 900-12-3456150.00-12345678901234567.123'],
  ['c-named', 'Tracking 802-456-78901.50-120.00'],
  ['c-unnamed', 'Web ID 802-456-78901.50-120.00'],
  ['c-zero', 'Total 00000015000.00-00000012000.00'],
  ['c-zero2', 'Billed 00000015000.00-150.00'],
  ['c-thou', 'Seen 900-12-3456150.00-1,250.00'],
  ['c-ymd', 'Seen 900-12-3456150.00-2020-01-02'],
  ['c-dot-ymd', 'Seen 900-12-3456150.00-2020.01.02'],
  ['c-eleven-mdy', 'Seen 20260112345.01-05-2026'],
  ['c-eleven-dotdate', 'Seen 20260112345.01-05.01.2026'],
  ['c-eleven-ver', 'Rule 12345678901.01-02.03'],
]);
targeted('BARE_DATE_AFTER', [
  ['b-ctl-unnamed', 'Seen 96104065401-04-2026'],
  ['b-ctl-named', 'ICN 96104065401-04-2026'],
  ['b-file1', 'See claim_12345678901-04-2026.pdf'],
  ['b-file2', 'See remit_12345678901-04-2026.pdf'],
  ['b-file3', 'Attached: statement-12345678901-04-2026.pdf'],
  ['b-file4', 'eob_1234567892026-01-15.pdf'],
  ['b-quote', 'Claim ‘12345678901-04-2026’'],
  ['b-tab', 'Claim\t12345678901-04-2026'],
  ['b-nl', 'Claim Number\n12345678901-04-2026'],
  ['b-hdr', 'Claim Number / DOS: 12345678901/04/2026'],
  ['b-ending', 'Claim number ending in 12345678901-04-2026'],
  ['b-eob', 'EOB 12345678901-04-2026'],
  ['b-re', 'RE: 12345678901-04-2026'],
  ['b-2yr', 'Seen 12345678901-04-26'],
  ['b-13', 'Seen 1234567892026-01-15'],
  ['b-col', 'Claim Number          12345678901-04-2026'],
  ['b-colon', 'Claim No.: 12345678901.04.2026'],
  ['b-hash', 'Claim#12345678901-04-2026'],
  ['b-pipe', 'Claim|12345678901-04-2026|150.00'],
  ['b-csv', 'Claim,12345678901-04-2026,150.00'],
  ['b-and', 'Claims 12345678901-04-2026 and 12345678902-04-2026'],
  ['b-list', 'ICN 12345678901-04-2026, 12345678902-04-2026'],
  ['b-list-plain(ctl)', 'ICN 12345678901, 12345678902'],
  ['b-row', 'Claim Number  Date\n12345678901  01/04/2026'],
  ['b-row-glued', 'Claim Number/Date\n12345678901/04/2026'],
]);
targeted('PAREN PHONE', [
  ['p-ctl', 'Section (123) 456-78901.50'],
  ['p-named', 'Ref (123) 456-78901.50'],
  ['p-line', 'Line (001) 420-97110 150.00'],
  ['p-held-line', HELD + 'Line (001) 420-97110'],
  ['p-held-sec', HELD + 'Section (123) 456-78901'],
  ['p-held-tight', HELD + 'Section (123)456-78901'],
  ['p-pipe', '(120) 150|12000.00'],
  ['p-slash', 'Deductible (500) 250/10000.00'],
  ['p-ext', 'Call (202) 555-0100 x1234'],
  ['p-date-sp', 'Fax (202) 555-0100 01/02/2020'],
  ['p-two', 'Call (202) 555-0100/(202) 555-0101'],
  ['p-dec', 'Rate (100) 123.45678'],
  ['p-2sp', 'Service (555)  012-345601.01.2020'],
  ['p-1sp(ctl)', 'Service (555) 012-345601.01.2020'],
]);
targeted('LOOSE under label', [
  ['l-ctl', 'SSN 900.12 345601/01/2020'],
  ['l-amt-chk-date', 'Medicare paid 150.00 120001/15/2026'],
  ['l-contact', 'Contact: Billing 250.75 123401/02/2020'],
  ['l-g2', 'Contact: Billing 250 75.123456'],
  ['l-g2b', 'Medicare 150 12.50120.00'],
  ['l-g2c', 'SSN 900 12.34567'],
  ['l-g2d', 'Medicare rate 110 32.74420'],
  ['l-g2e', 'Call 800 55.12345'],
  ['l-g2f', 'TTY 711 24.50000'],
  ['l-ctl2', 'Contact: Billing 250.75 123456'],
]);
targeted('YEAR before', [
  ['y-ctl', 'PaidJan 1, 2020900-12-3456'],
  ['y-ref', 'Received March 3, 2026123-45-67890'],
  ['y-num', 'DOS 12-31-2025123-45-6789'],
  ['y-named', 'Ref 12-31-2025123-45-6789'],
  ['y-nosp', 'Paid Jan 1,2020900-12-3456'],
  ['y-bare(giveback)', 'Paid 2020900-12-3456'],
]);
targeted('LIST NUMBER in parentheses', [
  ['n-ctl', 'Phone (2) 555-0100', null, 'Phone 555-0100'],
  ['n-enum', 'You may (1) call (2) write to PO Box 12345, Springfield, IL 62701-1234 or (3) fax us.', null, 'You may (1) call write to PO Box 12345, Springfield, IL 62701-1234 or (3) fax us.'],
  ['n-foot', 'Customer Service Phone(1) Hours(2)\n97110 2 150.00 120.00 30.00', null, 'Customer Service Phone Hours(2)\n97110 2 150.00 120.00 30.00'],
  ['n-count', 'Outreach: calls (3), letters (2). Claim 900123456 paid 150.00', null, 'Outreach: calls, letters (2). Claim 900123456 paid 150.00'],
  ['n-log', 'Contact (2) 01/09/2026 - left voicemail; balance 150.00 120.00 30.00', null, 'Contact 01/09/2026 - left voicemail; balance 150.00 120.00 30.00'],
  ['n-brk', 'For questions call [2] or see Claim 900123456', null, 'For questions call or see Claim 900123456'],
  ['n-sent', 'Send it by fax. (2) Include claim 900123456.', null, 'Send it by fax. Include claim 900123456.'],
  ['n-ph', 'Buffer pH (7) 150.00 120.00 30.00', null, 'Buffer pH 150.00 120.00 30.00'],
  ['n-cell', 'See cell (3) of the worksheet: 900123456', null, 'See cell of the worksheet: 900123456'],
  ['n-claim', 'Fax (2) Claim 900123456', null, 'Fax Claim 900123456'],
  ['n-zip', 'Contact (2) Springfield, IL 62701-1234', null, 'Contact Springfield, IL 62701-1234'],
  ['n-npi', 'Fax (2) NPI 1234567893', null, 'Fax NPI 1234567893'],
  ['n-days', 'Call (2) business days before your visit. Claim 2025550100', null, 'Call business days before your visit. Claim 2025550100'],
  ['n-row', 'Calls (3) 97110 2 150.00 120.00 30.00', null, 'Calls 97110 2 150.00 120.00 30.00'],
  ['n-units', 'Fax (2) pages 97110 97140', null, 'Fax pages 97110 97140'],
  ['n-tin', 'Contact (2) TIN 12-3456789', null, 'Contact TIN 12-3456789'],
  ['n-policy', 'Call (2) Policy No. 01-23456-78-9012', null, 'Call Policy No. 01-23456-78-9012'],
  ['n-icn', 'Fax (2) ICN 12345678901', null, 'Fax ICN 12345678901'],
  ['n-check', 'Contact (2) Check 00123456 150.00', null, 'Contact Check 00123456 150.00'],
  ['n-enum-row', 'To appeal you may (1) write, (2) fax or (3) call (4) 150.00 120.00 30.00', null, 'To appeal you may (1) write, (2) fax or (3) call 150.00 120.00 30.00'],
]);
targeted('DOB in May, held letter (patient born 1980-05-12)', [
  ['d1', HELD + 'Up to 12 may, at our discretion, be approved', MAYP],
  ['d2', HELD + 'You may\n12. Appeal', MAYP],
  ['d3', HELD + 'the 12th May.', MAYP],
  ['d4', HELD + 'May 12th', MAYP],
  ['d5', HELD + 'Visits over 12 may require review', MAYP],
  ['d6', HELD + 'May - 12,', MAYP],
  ['d7', HELD + 'on 12 May\nwe paid', MAYP],
  ['d8', HELD + 'born 12 May', MAYP],
  ['d9', HELD + 'May the 12th', MAYP],
  ['d10', HELD + 'Up to 12 may. Call us.', MAYP],
  ['d11', HELD + 'born May\n12, as stated', MAYP],
  ['d12', HELD + 'born 12 May, as stated', MAYP],
]);

// ---------- A4 ----------
const JOIN = ['•', '·', '‧', '∙', '⋅'];
const A4 = (J: string) => [
  `${J} Jane Zephyra`,
  `Jane Zephyra ${J} DOB 03/14/1980 ${J} Member ID ZZ7654321`,
  `Patient${J}Jane Q Zephyra${J}Claim SYNCLAIM0001`,
  `Zephyra ${J} Jane`,
  `Zephyra${J}Jane`,
  `Jane${J}Zephyra`,
  `J${J}Zephyra`,
  `J ${J} Zephyra`,
  `Jane ${J} Q ${J} Zephyra`,
  `Plan J ${J} Zephyra`,
  `Tier Q${J}Zephyra, Jane`,
  `Section A ${J} Jane Zephyra ${J} 97110`,
  `Jane Zephyra${J}`,
  `${J}Zephyra`,
  `Dear Jane Zephyra:\n${J} Your claim SYNCLAIM0001 was paid 150.00.\n${J} Call 202-555-0100.`,
  `Services ${J} 97110 ${J} 97140\nPatient: Zephyra, Jane Q.`,
  `J. Q. ${J} Zephyra`,
  `Zephyra ${J} J`,
  `Zephyra${J}J`,
  `Q${J}Z`,
  `JQZ ${J} 97110`,
  `Jane Q${J} Zephyra`,
  `Mr${J}Zephyra`,
  `Jane 900123456 ${J} Zephyra`,
  `Claim Zephy${J}ra, 900123456`,
  `Zephyra ${J} 202-555-0100`,
  `Phone ${J} 202-555-0100 ${J} Zephyra`,
  `${J} J\n${J} Zephyra`,
  `Item J${J} Zephyra Clinic`,
  `${J} Appeal within 180 days\n${J} Claim 900123456\n${J} Paid 150.00 120.00 30.00`,
  `${J} Q codes ${J} J codes ${J} Zephyra`,
  `Plan J${J}Q ${J} Zephyra`,
  `Jane Zephyra ${J} Q ${J} 150.00`,
  `Z${J} Jane`,
  `Dr. J ${J} Zephyra ${J} 900123456`,
  `J${J}Z 900123456`,
  `Zephyra${J}900123456`,
];
console.log(`\n== A4 joiners: letters where head differs from before on the screen path or in redactLetter (${el()})`);
let a4n = 0;
let a4round = 0;
let a4base = 0;
const seen4 = new Set<string>();
for (const J of JOIN) {
  for (const text of A4(J)) {
    a4n += 1;
    const h = out('head', text);
    const bf = out('before', text);
    const b = out('base', text);
    const rh = rl('head', text);
    const rbf = rl('before', text);
    const rb = rl('base', text);
    if (h !== b) a4base += 1;
    if (h === bf && rh === rbf) continue;
    a4round += 1;
    const sig = text.split(J).join('•');
    if (seen4.has(sig)) continue;
    seen4.add(sig);
    console.log(`${JSON.stringify(text)}\n      screen head: ${show(h)} | before: ${show(bf)} | base: ${show(b)}\n      redactLetter head: ${JSON.stringify(rh)} | before: ${JSON.stringify(rbf)} | base: ${JSON.stringify(rb)}`);
  }
}
console.log(`A4: ${a4n} letters, ${a4round} differ head/before, ${a4base} differ head/base on the screen path`);
console.log(`\n== withheld (look-alike glued beside a pattern): screen and redactLetter (${el()})`);
for (const text of [
  'Call 202-555-0123/2Z7654321',
  'Fax 202-555-01002Z7654321',
  'SSN 900-12-34562Z7654321',
  '2Z7654321-900-12-3456',
  'Tel 202-555-0100 5YNCLAIM0001',
  '5YNCLAIM0001202-555-0100',
  'SYNCLA1M0001/202-555-0100',
  'Z27654321 202 555 0100',
  'Phone 202-555-0100ZEPHYRA',
  'Phone 202-555-0100 2EPHYRA',
  '2EPHYRA202-555-0100',
  'Zephyra2025550100 Call 202-555-0101',
]) {
  console.log(`${JSON.stringify(text)}\n      screen head: ${show(out('head', text))} | before: ${show(out('before', text))} | base: ${show(out('base', text))}\n      redactLetter head: ${JSON.stringify(rl('head', text))} | before: ${JSON.stringify(rl('before', text))} | base: ${JSON.stringify(rl('base', text))}`);
}

// ---------- A1 fuzz ----------
const TOK = '\u0000';
const LABELS = ['Call', 'call', 'Contact', 'contact', 'Contacts', 'contacted', 'Calls', 'called', 'Fax', 'fax', 'Faxes', 'Cell', 'cell', 'Mobile', 'Tel', 'TTY', 'TDD', 'Phone', 'phone', 'Phones', 'Telephone', 'Toll-free', 'SSN', 'Soc Sec', 'Social Security', 'HIC', 'Ph', 'Phone No.', 'Fax #', 'Tel:'];
const YS: [string, () => string][] = [
  ['amts3', () => `${amt()} ${amt()} ${amt()}`],
  ['amt1', () => amt()],
  ['cur', () => `$${amt()}`],
  ['date', () => date()],
  ['drange', () => `${date()} - ${date()}`],
  ['date-amt', () => `${date()} ${amt()} ${amt()}`],
  ['claim13', () => `Claim ${dg(13)}`],
  ['claim9', () => `Claim 900${dg(6, false)}`],
  ['claim10', () => `Claim No. 00${dg(8)}`],
  ['icn11', () => `ICN ${dg(11)}`],
  ['ref9', () => `Reference 900${dg(6, false)}`],
  ['zip9', () => `Springfield, IL 62701-${dg(4, false)}`],
  ['pobox', () => `PO Box ${dg(5)}, Springfield, IL 62701`],
  ['cptrow', () => `97110 ${int(1, 4)} ${amt()} ${amt()} ${amt()}`],
  ['cpts', () => '97110 97140 97530'],
  ['npi', () => 'NPI 1234567893'],
  ['tin', () => `TIN ${dg(2)}-${dg(7, false)}`],
  ['pages', () => `page ${int(1, 9)} of ${int(2, 12)}`],
  ['time', () => '8:00 a.m. to 5:00 p.m.'],
  ['days', () => `within ${pick([30, 60, 180])} days`],
  ['pct', () => `${pick([80, 90, 100])}% of ${amt()}`],
  ['policy', () => `Policy No. ${dg(2)}-${dg(5)}-${dg(2)}-${dg(4)}`],
  ['group', () => `Group ${dg(6)}`],
  ['check', () => `Check ${dg(8)} ${amt()}`],
  ['bare9', () => `900${dg(6, false)}`],
  ['bare7', () => `55501${dg(2, false)}`],
  ['bare5', () => dg(5)],
  ['bare4', () => dg(4)],
  ['local', () => `555-01${dg(2, false)}`],
  ['legal', () => '29 CFR 2560.503-1(h)'],
  ['file', () => 'remit_20260115_01_0001.pdf'],
  ['visits', () => `${int(10, 60)} visits per calendar year`],
  ['mod', () => '97110-GP 59'],
  ['addr', () => `${dg(4)} Main St Suite ${dg(3)}`],
  ['ext', () => `ext. ${dg(4)}`],
  ['row2', () => `${date()} 97140 ${int(1, 4)} $${amt()} $${amt()}`],
  ['masked', () => `Acct ****${dg(4, false)}`],
  ['words', () => 'for more information about your appeal rights'],
  ['id-alpha', () => `Member ID SYN${dg(9)}`],
  ['ref-shape', () => `Tracking 802-456-${dg(5)}`],
];
const FILL = ['business days before', 'times on', 'pages to', 'of', 'see', 'and then', 'the plan at', 'us at', 'Member Services', 'for details', 'option', 'attempts', 'Name: Billing Office', 'if needed', 'or write', 'regarding'];
const PRE = ['Please', 'To appeal,', 'Questions?', 'Customer service', 'Provider', 'TTY users', 'You may', 'We tried to', 'Send by', 'By'];
const CTX: [string, (L: string, y: string) => string][] = [
  ['plain', (L, y) => `${L} ${TOK} ${y}`],
  ['glue', (L, y) => `${L}${TOK} ${y}`],
  ['comma', (L, y) => `${L} ${TOK}, ${y}`],
  ['dot', (L, y) => `${L} ${TOK}. ${y}`],
  ['semi', (L, y) => `${L} ${TOK}; ${y}`],
  ['dash', (L, y) => `${L} ${TOK} - ${y}`],
  ['nl', (L, y) => `${L} ${TOK}\n${y}`],
  ['enum', (L, y) => `You may (1) ${L.toLowerCase()} ${TOK} write to us: ${y}`],
  ['sent', (L, y) => `Send it by ${L.toLowerCase()}. ${TOK} Include ${y}`],
  ['words', (L, y) => `${L} ${TOK} ${pick(FILL)} ${y}`],
  ['count', (L, y) => `${pick(['Outreach', 'Attempts', 'Log'])}: ${L} ${TOK} ${pick(['on', 'since', 'through', 'total'])} ${y}`],
  ['pre', (L, y) => `${pick(PRE)} ${L.toLowerCase()} ${TOK} ${y}`],
  ['foot', (L, y) => `Customer Service ${L}${TOK} Hours\n${y}`],
  ['mid', (L, y) => `${amt()} ${L} ${TOK} ${y}`],
  ['held', (L, y) => `${HELD}${L} ${TOK} ${y}`],
  ['held-words', (L, y) => `${HELD}${L} ${TOK} ${pick(FILL)} ${y}`],
  ['tail', (L, y) => `${y} ${L} ${TOK}`],
  ['colon-pre', (L, y) => `${L}: ${TOK} ${y}`],
  ['hash', (L, y) => `${L} #${TOK} ${y}`],
  ['gluedY', (L, y) => `${L} ${TOK}${y}`],
];
console.log(`\n== A1 fuzz: label + (n) + ordinary content, seed ${process.argv[2] ?? 11} (${el()})`);
const a1: Record<string, number> = { n: 0, baseNot: 0, diff: 0, R: 0, C: 0, N: 0, refused: 0, changed: 0 };
const byCtx = new Map<string, number[]>();
const exR: string[] = [];
const exC: string[] = [];
const exN: string[] = [];
const sigC = new Set<string>();
const sigR = new Set<string>();
const dl1 = Date.now() + 50000;
while (Date.now() < dl1 && a1.n < 30000) {
  const [ct, cf] = pick(CTX);
  const [yt, yf] = pick(YS);
  const L = pick(LABELS);
  const n = pick([1, 2, 2, 3, 4, 5, 7, 9, 10, 12, 24]);
  const s: string = cf(L, yf());
  const mark = rnd() < 0.1 ? `[${n}]` : `(${n})`;
  const T = s.split(TOK).join(mark);
  a1.n += 1;
  const tally = byCtx.get(ct) ?? [0, 0, 0, 0, 0];
  byCtx.set(ct, tally);
  tally[0] += 1;
  const b = out('base', T);
  if (b !== 'same') {
    a1.baseNot += 1;
    continue;
  }
  tally[1] += 1;
  const h = out('head', T);
  if (h === 'same') continue;
  a1.diff += 1;
  if (h === 'REFUSED') a1.refused += 1;
  else a1.changed += 1;
  const Ws = [...new Set([s.split(TOK).join(''), s.replace(/ ?\u0000 ?/g, ' '), s.replace(/ ?\u0000/g, ''), s.replace(/\u0000 ?/g, '')])];
  const bw = Ws.map((w) => out('base', w));
  const hw = Ws.map((w) => out('head', w));
  const cls = bw.some((x) => x !== 'same') ? 'R' : hw.some((x) => x !== 'same') ? 'C' : 'N';
  a1[cls] += 1;
  tally[cls === 'R' ? 2 : cls === 'C' ? 3 : 4] += 1;
  const text = `[${cls}] ${ct}/${yt}  ${JSON.stringify(T)}\n      head: ${show(h)} | before: ${show(out('before', T))} | base: same\n      without (n): ${Ws.map((w, i) => `${JSON.stringify(w)} head: ${show(hw[i] ?? '')} base: ${show(bw[i] ?? '')}`).join('\n                   ')}`;
  if (cls === 'N' && exN.length < 25) exN.push(text);
  if (cls === 'C' && exC.length < 25 && !sigC.has(`${ct}/${yt}`)) {
    sigC.add(`${ct}/${yt}`);
    exC.push(text);
  }
  if (cls === 'R' && exR.length < 5 && !sigR.has(ct)) {
    sigR.add(ct);
    exR.push(text);
  }
}
console.log(`A1: ${JSON.stringify(a1)}`);
console.log(`by context [generated, base sends unchanged, R, C, N]: ${[...byCtx].map(([k, v]) => `${k}:${v.join('/')}`).join('  ')}`);
for (const t of [...exN, ...exC, ...exR]) console.log(t);

// ---------- A2/A3 fuzz ----------
const LISTED = ['Claim', 'Claim #', 'Claim Number:', 'ICN', 'DCN:', 'Ref.', 'Reference #:', 'Check/EFT #', 'Trace #', 'Payer Claim Control Number', 'Patient Account Number', 'Document Control Number', 'Authorization #', 'Case ID', 'Invoice', 'Rx #', 'Group #', 'Subscriber ID', 'Member ID', 'Policy #', 'Provider ID', 'Receipt No.', 'Confirmation #', 'Order #', 'Tracking #', 'Encounter #', 'Visit #', 'Batch', 'Statement', 'Voucher', 'Transaction ID', 'Letter ID', 'Notice #', 'Correspondence ID', 'Inquiry #', 'Grievance #', 'Appeal #', 'Remittance Advice #', 'Claim(s)', 'Claims:', 'Account No.', 'Acct #'];
const UNLISTED = ['EOB', 'Doc #', 'ID', 'Barcode', 'Seq', 'Item', 'Submission ID', 'RE:', 'Our number', 'Record locator', 'Serial', 'Txn', 'Pmt', 'Chk #', 'Inv #', 'Conf #', 'Cert #', 'Web ID', 'Seen', 'Patient ID', 'Service ID', 'Episode', 'Line', 'No.', '#', 'Number'];
const CONN = [' ‘', ' >', ' -> ', ' ~ ', ' + ', ': <', ' ending in ', ' for ', ' of ', ' was ', ' # is ', '\t', '\n', ' (see) ', '_', ' {', ' №', ';', ' ?', ' no ', ' Nr. ', ' Num: ', ' = ', ' "', ' ('];
const sepc = () => pick(['-', '/', '.']);
const runLead = (n: number) => dg(n - 2) + day2();
const runYear = (n: number) => dg(n - 4) + yr();
const bd = (n: number) => {
  const s = sepc();
  return n <= 12 ? `${runLead(n)}${s}${day2()}${s}${yr()}` : `${runYear(n)}${s}${p2(int(1, 12))}${s}${day2()}`;
};
const PPW = ['Section', 'Room', 'Deductible', 'Code', 'Units', 'Rev', 'Copay', 'Tier', 'Limit', 'Line', 'Box', 'Table', 'Part'];
const PPA = ['123', '555', '100', '120', '001', '500'];
const PPB = ['456', '012', '250', '420'];
const PL = ['SSN', 'Medicare', 'Call', 'Contact:', 'Fax', 'Phone', 'Tel', 'Medicare paid', 'Contact: Billing', 'Medicare allowed', 'Call center rate'];
const MON = ['Jan', 'January', 'Feb.', 'March', 'May', 'June', 'Sept.', 'December'];
const G: [string, () => string][] = [
  ['bd-listed', () => `${pick(LISTED)} ${bd(pick([11, 12, 13, 14]))}`],
  ['bd-listed-held', () => `${HELD}${pick(LISTED)} ${bd(pick([11, 12, 13, 14]))}`],
  ['bd-conn', () => `${pick(LISTED)}${pick(CONN)}${bd(pick([11, 12]))}`],
  ['bd-unlisted', () => `${pick(UNLISTED)} ${bd(pick([11, 12, 13, 14]))}`],
  ['bd-file', () => `See ${pick(['claim', 'remit', 'eob', 'statement', 'icn', 'invoice'])}${pick(['_', '-', '.'])}${bd(pick([11, 12]))}.pdf`],
  ['bd-list', () => `${pick(LISTED)} ${bd(11)}${pick([', ', ' and ', '; ', ' / '])}${bd(11)}`],
  ['bd-near-2yr', () => `${pick(UNLISTED)} ${runLead(11)}-${day2()}-${dg(2, false)}`],
  ['bd-near-sp', () => `${pick(UNLISTED)} ${dg(11)} ${date()}`],
  ['bd-near-10', () => `${pick(UNLISTED)} 00${dg(6)}${day2()}-${day2()}-${yr()}`],
  ['cr-named', () => `${pick(LISTED)} ${dg(pick([11, 12, 13]))}.${dg(2, false)}-${amt()}`],
  ['cr-zero', () => `${pick(['Total', 'Billed', 'Balance', 'Net'])} ${'0'.repeat(6)}${dg(5)}.${dg(2, false)}-${amt()}`],
  ['cr-shape-named', () => `${pick(LISTED)} 802-${pick(['45', '456'])}-${dg(pick([5, 6]))}.${dg(2, false)}-${amt()}`],
  ['cr-shape-unnamed', () => `${pick(UNLISTED)} 802-${pick(['45', '456'])}-${dg(pick([5, 6]))}.${dg(2, false)}-${amt()}`],
  ['cr-trail', () => `${pick(LISTED)} ${dg(11)}.${dg(2, false)}- ${amt()}`],
  ['cr-short', () => `${pick(UNLISTED)} 00${dg(pick([6, 8]))}.${dg(2, false)}-${amt()}`],
  ['pp-plain', () => `${pick(PPW)} (${pick(PPA)}) ${pick(PPB)}${pick(['-', '/', '.', '|'])}${dg(pick([5, 6]))}${pick(['', '.50', '.00', ' 150.00', ' units'])}`],
  ['pp-held', () => `${HELD}${pick(PPW)} (${pick(PPA)}) ${pick(PPB)}${pick(['-', '/', '.', '|'])}${dg(pick([5, 6]))}${pick(['', '.50', ' 150.00', ' units'])}`],
  ['pp-named', () => `${pick(LISTED)} (${pick(PPA)}) ${pick(PPB)}-${dg(5)}.${dg(2, false)}`],
  ['ll-g1pt-date', () => `${pick(PL)} ${pick(['900', dg(3)])}.${dg(2, false)} ${dg(4)}${date()}`],
  ['ll-g2pt', () => `${pick(PL)} ${pick(['900', dg(3)])} ${dg(2)}.${dg(pick([5, 6]), false)}`],
  ['ll-g2pt-amt', () => `${pick(PL)} ${dg(3)} ${dg(2)}.${dg(2, false)}${amt()}`],
  ['ll-control', () => `${pick(PL)} ${dg(3)}.${dg(2, false)} ${dg(6)}`],
  ['yb-word', () => `${pick(['Received', 'Paid', 'Processed on', 'Dated'])} ${pick(MON)} ${int(1, 28)}, ${yr()}900-${dg(2)}-${dg(pick([4, 5]))}`],
  ['yb-num', () => `${pick(['Received', 'DOS', 'Paid'])} ${p2(int(1, 12))}-${day2()}-${yr()}900-${dg(2)}-${dg(4)}`],
  ['yb-named', () => `${pick(LISTED)} ${p2(int(1, 12))}-${day2()}-${yr()}900-${dg(2)}-${dg(4)}`],
];
console.log(`\n== A2/A3 fuzz near the new rules, seed ${process.argv[2] ?? 11} (${el()})`);
const gs = new Map<string, { n: number; baseRefused: number; fresh: number; old: number; exNew: string[]; exOld: string[] }>();
const dl2 = Date.now() + 45000;
let gn = 0;
while (Date.now() < dl2 && gn < 30000) {
  const [tag, f] = pick(G);
  const T: string = f();
  gn += 1;
  const st = gs.get(tag) ?? { n: 0, baseRefused: 0, fresh: 0, old: 0, exNew: [], exOld: [] };
  gs.set(tag, st);
  st.n += 1;
  const b = out('base', T);
  if (b === 'REFUSED') {
    st.baseRefused += 1;
    continue;
  }
  const h = out('head', T);
  if (h === b) continue;
  const bf = out('before', T);
  const line = `${JSON.stringify(T)}\n      head: ${show(h)} | before: ${show(bf)} | base: ${show(b)}`;
  if (bf === h) {
    st.old += 1;
    if (st.exOld.length < 1) st.exOld.push(line);
  } else {
    st.fresh += 1;
    if (st.exNew.length < 3) st.exNew.push(line);
  }
}
for (const [tag, st] of [...gs].sort()) {
  console.log(`${tag}: generated ${st.n}, base refused ${st.baseRefused}, head differs NEW this round ${st.fresh}, head differs as before ${st.old}`);
  for (const x of st.exNew) console.log(`   NEW ${x}`);
  for (const x of st.exOld) console.log(`   old ${x}`);
}
const throws: Record<string, number> = {};
for (const [k, v] of memo) if (v.startsWith('THROW')) throws[k.split('|')[0] ?? ''] = (throws[k.split('|')[0] ?? ''] ?? 0) + 1;
console.log(`\nletters run: ${memo.size} outcomes; THROW by tree: ${JSON.stringify(throws)}; done ${el()}`);
