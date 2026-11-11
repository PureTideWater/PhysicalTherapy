// Reviewer E2: node exp3.mts [seed]. Rates for E2-2 (a date before a shape) and E2-3 (structure before a mask); more E2-1 letters.
// Synthetic twins only. Also writes cmp2.jsonl (the letters of the findings) for /home/user/work/cmp.mts.
import fs from 'node:fs';
import { HELD, out, show, targeted, el, memo } from './lib.mts';
let seed = Number(process.argv[2] ?? 31);
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
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOLLAR = '$';
const STARS = '***-**-';
type F = (d: number, m: number, y: number) => string;
const FMT: [string, F][] = [
  ['mm/dd/yyyy (control)', (d, m, y) => p2(m) + '/' + p2(d) + '/' + y],
  ['Mon d, yyyy (control)', (d, m, y) => MONS[m - 1] + ' ' + d + ', ' + y],
  ['d Month yyyy (control)', (d, m, y) => d + ' ' + FULL[m - 1] + ' ' + y],
  ['yyyy alone (recorded give-back)', (_d, _m, y) => String(y)],
  ['dd-Mon-yyyy', (d, m, y) => p2(d) + '-' + MONS[m - 1] + '-' + y],
  ['dd/Mon/yyyy', (d, m, y) => p2(d) + '/' + MONS[m - 1] + '/' + y],
  ['Mon-dd-yyyy', (d, m, y) => MONS[m - 1] + '-' + p2(d) + '-' + y],
  ['Mon d,yyyy (no space)', (d, m, y) => MONS[m - 1] + ' ' + d + ',' + y],
  ['dMonyyyy', (d, m, y) => d + MONS[m - 1] + y],
  ['Mon yyyy', (_d, m, y) => MONS[m - 1] + ' ' + y],
  ['Month yyyy', (_d, m, y) => FULL[m - 1] + ' ' + y],
  ['Month, yyyy', (_d, m, y) => FULL[m - 1] + ', ' + y],
  ['mm/yyyy', (_d, m, y) => p2(m) + '/' + y],
  ['mm-yyyy', (_d, m, y) => p2(m) + '-' + y],
];
const PRE = ['DOS ', 'Paid ', 'Received ', 'Service date ', 'Period '];
console.log('== E2-2 rate: a date up to its four-digit year, glued before a shape; 60 letters a format, seed ' + (process.argv[2] ?? 31) + ' (' + el() + ')');
for (const [name, f] of FMT) {
  const c: Record<string, number> = { head: 0, before: 0, base: 0 };
  let ex = '';
  for (let i = 0; i < 60; i += 1) {
    const shape = rnd() < 0.5 ? '900-' + dg(2) + '-' + dg(4, false) : '202-555-01' + dg(2, false);
    const T = pick(PRE) + f(int(1, 28), int(1, 12), int(2019, 2026)) + shape;
    for (const tree of ['head', 'before', 'base']) if (out(tree, T) === 'REFUSED') c[tree] = (c[tree] ?? 0) + 1;
    if (ex === '' && out('head', T) !== 'REFUSED' && out('before', T) === 'REFUSED') ex = JSON.stringify(T) + ' head: ' + show(out('head', T)) + ' | before: ' + show(out('before', T)) + ' | base: ' + show(out('base', T));
  }
  console.log(name + ': refused of 60: head ' + c.head + ', before ' + c.before + ', base ' + c.base + (ex === '' ? '' : '   e.g. ' + ex));
}
const ST: [string, () => string][] = [
  ['mm/dd/yyyy (control)', () => p2(int(1, 12)) + '/' + p2(int(1, 28)) + '/' + int(2019, 2026)],
  ['ddd.dd (control)', () => int(100, 999) + '.' + dg(2, false)],
  ['currency ddd.dd (control)', () => DOLLAR + int(100, 999) + '.' + dg(2, false)],
  ['yyyy alone (control)', () => String(int(2019, 2026))],
  ['one or two digits (recorded give-back)', () => dg(pick([1, 2]))],
  ['yyyy-mm-dd', () => int(2019, 2026) + '-' + p2(int(1, 12)) + '-' + p2(int(1, 28))],
  ['yyyy/mm/dd', () => int(2019, 2026) + '/' + p2(int(1, 12)) + '/' + p2(int(1, 28))],
  ['currency ddd', () => DOLLAR + int(100, 999)],
  ['currency d,ddd', () => DOLLAR + int(1, 9) + ',' + dg(3, false)],
  ['currency dd', () => DOLLAR + int(21, 99)],
  ['five digits', () => '9' + dg(4)],
  ['ten digits', () => '20255501' + dg(2, false)],
];
console.log('\n== E2-3 rate: structure glued before a masked SSN; 60 letters a form (' + el() + ')');
for (const [name, f] of ST) {
  const c: Record<string, number> = { head: 0, before: 0, base: 0 };
  let ex = '';
  for (let i = 0; i < 60; i += 1) {
    const mask = (rnd() < 0.5 ? 'XXX-XX-' : STARS) + dg(4, false);
    const T = pick(['DOS ', 'Paid ', 'Balance ', 'Line ']) + f() + mask;
    for (const tree of ['head', 'before', 'base']) if (out(tree, T) === 'REFUSED') c[tree] = (c[tree] ?? 0) + 1;
    if (ex === '' && out('head', T) !== 'REFUSED' && out('before', T) === 'REFUSED') ex = JSON.stringify(T) + ' head: ' + show(out('head', T)) + ' | before: ' + show(out('before', T)) + ' | base: ' + show(out('base', T));
  }
  console.log(name + ': refused of 60: head ' + c.head + ', before ' + c.before + ', base ' + c.base + (ex === '' ? '' : '   e.g. ' + ex));
}
targeted('E2-1 more letters', [
  ['ssn', 'SSN (2) 15.00 30.00', null, 'SSN 15.00 30.00'],
  ['word-between', 'Phone (2) at 15.00 30.00', null, 'Phone at 15.00 30.00'],
  ['units-word', 'Telephone call (2) units 30.00 60.00', null, 'Telephone call units 30.00 60.00'],
  ['three', 'Fax (2) 15.00 30.00 45.00', null, 'Fax 15.00 30.00 45.00'],
  ['carc', 'Telephone call (2) 30.00 60.00 CO-45', null, 'Telephone call 30.00 60.00 CO-45'],
  ['tabs', 'Telephone call\t(2)\t30.00\t60.00', null, 'Telephone call\t30.00\t60.00'],
  ['at-eq', 'Telephone calls (2) @ 30.00 = 60.00', null, 'Telephone calls @ 30.00 = 60.00'],
  ['csv', 'Phone (2),15.00,30.00', null, 'Phone,15.00,30.00'],
  ['pipe', 'Phone (2)|15.00|30.00', null, 'Phone|15.00|30.00'],
  ['two-sp', 'Phone (2)  15.00  30.00', null, 'Phone  15.00  30.00'],
  ['x', 'Telephone call (2) x 30.00 60.00', null, 'Telephone call x 30.00 60.00'],
  ['one-amount', 'Fax (12) 1500.00', null, 'Fax 1500.00'],
  ['one-amount9', 'Fax (12) 12500.00', null, 'Fax 12500.00'],
  ['thousand', 'Calls (2) 1,250.00 2,500.00', null, 'Calls 1,250.00 2,500.00'],
  ['held', HELD + 'Telephone call (2) 30.00 60.00', null, HELD + 'Telephone call 30.00 60.00'],
  ['eob-row', '98966 Telephone call (2) 30.00 60.00', null, '98966 Telephone call 30.00 60.00'],
  ['contact-log', 'Contact (2) 15.00 30.00 copay collected', null, 'Contact 15.00 30.00 copay collected'],
]);
const CMP = [
  'Phone (2) 15.00 30.00',
  'Phone 15.00 30.00',
  'Phone (2) 15.00 3.00',
  'Phone (12) 15.00 3.00',
  '611.87 phone (x) 813.91 5.08 246.04',
  'Calls (3) 25.00 75.00',
  'Calls 25.00 75.00',
  'Mobile (1) 49.99 49.99',
  'Records fee: fax (10) 1.00 10.00, copies (25) 0.25 6.25',
  'Records fee: fax 1.00 10.00, copies (25) 0.25 6.25',
  'Dear Provider,\nWe processed the following.\nTelephone call (2) 30.00 60.00\nTotal 60.00\nSincerely, Claims',
  'Dear Provider,\nWe processed the following.\nTelephone call 30.00 60.00\nTotal 60.00\nSincerely, Claims',
  'Telephone call (2)\n30.00 60.00',
  'Therapeutic exercise (2) 30.00 60.00',
  'Fax 2) 15.00 30.00',
  'Fax 15.00 30.00',
  'DOS 01-Jan-2020900-12-3456',
  'DOS 01/2020900-12-3456',
  'Paid Jan 2020900-12-3456',
  'Paid Jan 1,2020900-12-3456',
  'Paid Jan 1, 2020900-12-3456',
  'DOS 01-Jan-2020202-555-0100',
  HELD + 'DOS 2020-01-02XXXXX3456',
  'Paid ' + DOLLAR + '1,500XXX-XX-3456',
  'Paid 150.00XXX-XX-3456',
  'Medicare allowed 150 12. 97110 97140',
  'Medicare paid 100 80.00000',
  'Medicare rate 110 32.7442',
  'Contact: Billing 250.75 123456',
  HELD + 'Table (555) 456-23099',
  'Line (001) 420-97110',
  HELD + 'phone (4) pages to Tracking 802-456-71718',
  HELD + 'phone pages to Tracking 802-456-71718',
];
fs.writeFileSync('/home/user/review-e2/cmp2.jsonl', CMP.map((t) => JSON.stringify(t)).join('\n') + '\n');
console.log('outcomes ' + memo.size + ', THROW ' + [...memo.values()].filter((v) => v.startsWith('THROW')).length + ', done ' + el());
