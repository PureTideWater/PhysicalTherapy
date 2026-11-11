// Reviewer E2: node exp2.mts [seed]. The list number's own digits in the chain (E2-1), and the other probes of round two.
import { M, JANE, CLAIMS, HELD, out, rl, show, targeted, el, memo } from './lib.mts';
let seed = Number(process.argv[2] ?? 21);
const quick = process.argv[3] === 'fuzz-only';
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
const date = () => `${p2(int(1, 12))}/${p2(int(1, 28))}/${int(2019, 2027)}`;
const money = (cents: number) => (cents / 100).toFixed(2);
if (!quick) {
  targeted('S1 list number: its digits and the chain', [
    ['found', '611.87 phone (10) 813.91 5.08 246.04', null, '611.87 phone 813.91 5.08 246.04'],
    ['no-pre', 'phone (10) 813.91 5.08 246.04', null, 'phone 813.91 5.08 246.04'],
    ['letter', '611.87 phone (x) 813.91 5.08 246.04'],
    ['colon', '611.87 phone (10): 813.91 5.08 246.04'],
    ['comma', '611.87 phone (10), 813.91 5.08 246.04'],
    ['3dig', '611.87 phone (100) 813.91 5.08 246.04'],
    ['sum9', 'Phone (2) 15.00 30.00', null, 'Phone 15.00 30.00'],
    ['sum8', 'Phone (2) 15.00 3.00', null, 'Phone 15.00 3.00'],
    ['sum9b', 'Phone (12) 15.00 3.00', null, 'Phone 15.00 3.00'],
    ['sum10', 'Phone (12) 15.00 30.00', null, 'Phone 15.00 30.00'],
    ['sum11', 'Phone (12) 150.00 30.00', null, 'Phone 150.00 30.00'],
    ['old-form', 'Fax 2) 15.00 30.00', null, 'Fax 15.00 30.00'],
    ['old-colon', 'Fax 2: 15.00 30.00', null, 'Fax 15.00 30.00'],
    ['paren-colon', 'Fax (2): 15.00 30.00', null, 'Fax 15.00 30.00'],
    ['fax-pages', 'Fax (10) 1.00 10.00', null, 'Fax 1.00 10.00'],
    ['tel-call', 'Telephone call (2) 30.00 60.00', null, 'Telephone call 30.00 60.00'],
    ['calls', 'Calls (3) 25.00 75.00', null, 'Calls 25.00 75.00'],
    ['row', '01/05/2026 Telephone call (2) 30.00 60.00 0.00', null, '01/05/2026 Telephone call 30.00 60.00 0.00'],
    ['records', 'Records fee: fax (10) 1.00 10.00, copies (25) 0.25 6.25', null, 'Records fee: fax 1.00 10.00, copies (25) 0.25 6.25'],
    ['mobile', 'Mobile (1) 49.99 49.99', null, 'Mobile 49.99 49.99'],
    ['cur', 'Telephone call (2) $30.00 $60.00', null, 'Telephone call $30.00 $60.00'],
    ['local', 'Phone (12) 555-0100', null, 'Phone 555-0100'],
    ['codes', 'Call (1) 97110 97140', null, 'Call 97110 97140'],
    ['int', 'Calls (3) 12 45', null, 'Calls 12 45'],
    ['nl', 'Telephone call (2)\n30.00 60.00', null, 'Telephone call\n30.00 60.00'],
    ['in-letter', 'Dear Provider,\nWe processed the following.\nTelephone call (2) 30.00 60.00\nTotal 60.00\nSincerely, Claims', null, 'Dear Provider,\nWe processed the following.\nTelephone call 30.00 60.00\nTotal 60.00\nSincerely, Claims'],
    ['units-row(ctl)', 'Therapeutic exercise (2) 30.00 60.00', null, 'Therapeutic exercise 30.00 60.00'],
    ['brk', 'Telephone call [2] 30.00 60.00', null, 'Telephone call 30.00 60.00'],
    ['visits', 'Phone (2) 20 visits 1500.00', null, 'Phone 20 visits 1500.00'],
    ['zip', 'Fax (2) PO Box 123, Springfield, IL 62701', null, 'Fax PO Box 123, Springfield, IL 62701'],
    ['time', 'Call (2) 8:00-5:00 Mon-Fri', null, 'Call 8:00-5:00 Mon-Fri'],
    ['pct', 'Calls (3) 80% 120.00', null, 'Calls 80% 120.00'],
  ]);
  targeted('S3 twins in the changed hunks (leak direction: what before refused and head sends)', [
    ['tw-shape-yfirst(ctl)', 'DOS 2020-01-02900-12-3456'],
    ['tw-mask-yfirst', 'DOS 2020-01-02XXX-XX-3456'],
    ['tw-shape-cur(ctl)', 'Paid $150900-12-3456'],
    ['tw-mask-cur', 'Paid $150XXX-XX-3456'],
    ['tw-shape-3dig', 'Paid 150900-12-3456'],
    ['tw-mask-5dig', 'Paid 97110XXX-XX-3456'],
    ['tw-mask-2dig(rec)', 'Paid 12XXX-XX-3456'],
    ['tw-mask-mon', 'DOS 01-Jan-2020XXX-XX-3456'],
    ['yr-dmy-mon', 'DOS 01-Jan-2020900-12-3456'],
    ['yr-mon-slash', 'DOS 01/Jan/2020900-12-3456'],
    ['yr-mon-d', 'DOS Jan-01-2020900-12-3456'],
    ['yr-my', 'DOS 01/2020900-12-3456'],
    ['yr-mon-y', 'Paid Jan 2020900-12-3456'],
    ['yr-nosp', 'Paid Jan 1,2020900-12-3456'],
    ['yr-ctl', 'Paid Jan 1, 2020900-12-3456'],
    ['yr-1jan', 'Paid 1Jan2020900-12-3456'],
    ['yr-3sp', 'Paid Jan 1,   2020900-12-3456'],
    ['yr-bare(rec)', 'Paid 2020900-12-3456'],
    ['pa-2sp', 'Service (555)  012-345601.01.2020'],
    ['pa-sp-g2', 'Service (555) 012 345601.01.2020'],
    ['pa-dash', 'Service (555)-012-345601.01.2020'],
    ['pa-nosp(ctl)', 'Service (555)012-345601.01.2020'],
    ['bd-ten-1dig', 'Seen 20255501001/2/2020'],
    ['bd-nine-1dig', 'Seen 9001234561/02/2020'],
  ]);
  targeted('S4 a point between the second and third groups under a label', [
    ['g2-sent', 'Medicare allowed 150 12. 97110 97140'],
    ['g2-4dec(ctl)', 'Medicare rate 110 32.7442'],
    ['g2-5dec', 'Medicare rate 110 32.74420'],
    ['g2-paid', 'Medicare paid 100 80.00000'],
    ['g2-hours', 'Contact hours 120 12.50000'],
    ['g2-yr', 'Medicare 2026 150 33.40090'],
    ['g2-lost', 'Medicare allowed 150 12.50120.00'],
    ['g2-rate', 'Call center rate 250 12.34567'],
    ['g2-partb', 'Medicare Part B 240 20. 97110 was denied'],
    ['g2-claim', 'Medicare 100 80. 20260112345 is the claim'],
    ['g2-fax', 'Fax pages 100 12.50000'],
    ['g2-dash(ctl)', 'Medicare 150 12-50120'],
    ['g2-row', 'Medicare 150 12.50 120.00'],
    ['g2-pct', 'Medicare pays 100 of 150 20.00000%'],
    ['g2-mirror(ctl)', 'Contact: Billing 250.75 123456'],
    ['g2-mirror', 'Contact: Billing 250 75.123456'],
  ]);
  targeted('S6 zero-padded and other controls', [
    ['z1', 'Billed 00000015000.00 150.00'],
    ['z2', 'Billed 00000015000.00'],
    ['z3', 'Billed 00000015000.00-150.00'],
    ['z4', 'Billed 00000015000.00- 150.00'],
    ['held-paren', HELD + 'Line (001) 420-97110'],
    ['held-paren-plain(ctl)', 'Line (001) 420-97110'],
    ['held-paren2', HELD + 'Table (555) 456-23099'],
    ['held-paren-tight', HELD + 'Table (555)456-23099'],
    ['held-C', HELD + 'Calls (10) for details 9.02 853.51 951.45', null, HELD + 'Calls for details 9.02 853.51 951.45'],
    ['held-C2', HELD + 'phone (4) pages to Tracking 802-456-71718', null, HELD + 'phone pages to Tracking 802-456-71718'],
  ]);
  console.log(`\n== S5 withheld: a pattern inside a run that holds a look-alike glued (${el()})`);
  for (const text of ['Ref5YNCLAIM0001-202-555-0100', 'X5YNCLAIM0001/202-555-0100', '202-555-0100/5YNCLAIM0001X', 'Fax:202-555-0100-5YNCLAIM0001Z', 'SSN 900-12-3456/5YNCLAIM0001X', 'Tel 202-555-0100x5YNCLAIM0001', '5YNCLAIM0001X 202-555-0100']) {
    const sp = (tree: string) => {
      try {
        return String(M[tree].redactionSpans(text, JANE, CLAIMS).spans.length);
      } catch (e) {
        return 'n/a';
      }
    };
    console.log(`${JSON.stringify(text)}\n      screen head: ${show(out('head', text))} | before: ${show(out('before', text))} | base: ${show(out('base', text))}\n      redactLetter head: ${JSON.stringify(rl('head', text))} | before: ${JSON.stringify(rl('before', text))} | base: ${JSON.stringify(rl('base', text))}  spans head/before/base: ${sp('head')}/${sp('before')}/${sp('base')}`);
  }
}
// ---------- the fee-line fuzz ----------
const TOK = '\u0000';
const DESC = ['Telephone call', 'Phone call', 'Telephone', 'Phone', 'Fax', 'Calls', 'Call', 'Mobile', 'Cell', 'Contact', 'TTY', 'Faxes', 'Contacts', 'Toll-free', 'Tel', 'Phone calls', 'Follow-up call', 'Outbound calls', 'Patient contact', 'Records by fax'];
const PRES = ['', '', '', '01/05/2026 ', 'Fees: ', 'Line 3 ', 'Service: ', 'Copies (25) 0.25 6.25; '];
const PRICES = [50, 100, 150, 250, 500, 1000, 1500, 2000, 2500, 3000, 4500, 6000, 7500, 12000];
const NUMS: [string, (n: number) => string][] = [
  ['unit-total', (n) => { const p = pick(PRICES); return `${money(p)} ${money(p * n)}`; }],
  ['unit-total-rand', (n) => { const p = int(25, 9999); return `${money(p)} ${money(p * n)}`; }],
  ['charge-allowed-paid', () => { const c = int(2000, 40000); const a = Math.round(c * 0.6); return `${money(c)} ${money(a)} ${money(Math.round(a * 0.8))}`; }],
  ['amts2', () => `${amt()} ${amt()}`],
  ['amts3', () => `${amt()} ${amt()} ${amt()}`],
  ['amts4', () => `${amt()} ${amt()} ${amt()} ${amt()}`],
  ['int-amts', () => `${int(1, 60)} ${amt()} ${amt()}`],
  ['date-amts', () => `${date()} ${amt()} ${amt()}`],
  ['cur2', () => `$${amt()} $${amt()}`],
  ['code-amts', () => `98966 ${amt()} ${amt()}`],
  ['amts-words', () => `${amt()} billed, ${amt()} paid`],
  ['min-amt', () => `${int(5, 45)} min ${amt()}`],
];
console.log(`\n== fee-line fuzz: phone word + (units) + amounts, seed ${process.argv[2] ?? 21} (${el()})`);
const tot: Record<string, number> = { n: 0, baseSame: 0, diff: 0, R: 0, C: 0, N: 0 };
const byKind = new Map<string, number[]>();
const exN: string[] = [];
const sigN = new Set<string>();
const dl = Date.now() + 40000;
while (Date.now() < dl && tot.n < 40000) {
  const [kind, f] = pick(NUMS);
  const n = pick([1, 2, 2, 3, 3, 4, 5, 6, 8, 10, 12]);
  const s = `${pick(PRES)}${pick(DESC)} ${TOK} ${f(n)}`;
  const T = s.split(TOK).join(`(${n})`);
  tot.n += 1;
  const tally = byKind.get(kind) ?? [0, 0, 0, 0, 0];
  byKind.set(kind, tally);
  tally[0] += 1;
  if (out('base', T) !== 'same') continue;
  tot.baseSame += 1;
  tally[1] += 1;
  const h = out('head', T);
  if (h === 'same') continue;
  tot.diff += 1;
  const Ws = [...new Set([s.split(TOK).join(''), s.replace(/ ?\u0000 ?/g, ' ')])];
  const bw = Ws.map((w) => out('base', w));
  const hw = Ws.map((w) => out('head', w));
  const cls = bw.some((x) => x !== 'same') ? 'R' : hw.some((x) => x !== 'same') ? 'C' : 'N';
  tot[cls] += 1;
  tally[cls === 'R' ? 2 : cls === 'C' ? 3 : 4] += 1;
  if (cls === 'N' && exN.length < 14 && !sigN.has(kind + n)) {
    sigN.add(kind + n);
    exN.push(`[N] ${kind}  ${JSON.stringify(T)}\n      head: ${show(h)} | before: ${show(out('before', T))} | base: same;  without (n) ${JSON.stringify(Ws[1] ?? Ws[0])}: head: ${show(hw[1] ?? hw[0] ?? '')} | base: ${show(bw[1] ?? bw[0] ?? '')}`);
  }
}
console.log(`fee lines: ${JSON.stringify(tot)}`);
console.log(`by kind [generated, base sends unchanged, R, C, N]: ${[...byKind].map(([k, v]) => `${k}:${v.join('/')}`).join('  ')}`);
for (const t of exN) console.log(t);
const throws = [...memo.values()].filter((v) => v.startsWith('THROW')).length;
console.log(`outcomes ${memo.size}, THROW ${throws}, done ${el()}`);
