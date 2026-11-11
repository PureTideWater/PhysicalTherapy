// TREES=head,before,base,v0,v1,v2 node a.mts [seed] [N] [family prefix]: avenue A.1 (the second reading, appliedMatches) and a token soup.
// A letter counts where the base sends it. v0 is head with a counter in survivorIn, v1 head with no second reading, v2 head with a long run no amount in the loose reading too.
import { out, rng, pick, int, digits } from './lib2.mts';
const seed = Number(process.argv[2] ?? 1);
const N = Number(process.argv[3] ?? 2000);
const only = process.argv[4] ?? '';
type R = () => number;
type L = { text: string; without?: string[] };
type G = (r: R) => string;
const two = (n: number) => String(n).padStart(2, '0');
const CPT = ['97110', '97112', '97116', '97140', '97530', '97535', '97161', '97164', '97014', '97035', '98941', '97750'];
const amt = (r: R) => `${String(10 + int(r, 490))}.${two(int(r, 100))}`;
const date = (r: R) => `${two(1 + int(r, 12))}/${two(1 + int(r, 28))}/2026`;
const ORD: G[] = [
  (r) => `${date(r)} ${pick(r, CPT)} ${1 + int(r, 8)} ${amt(r)} ${amt(r)} ${amt(r)}`,
  (r) => `${date(r)}-${date(r)} ${pick(r, CPT)} GP ${1 + int(r, 4)} $${amt(r)}`,
  (r) => `PO Box ${10000 + int(r, 89999)}, Salt Lake City, UT 84130-${two(int(r, 100))}${two(int(r, 100))}`,
  (r) => `Springfield, IL 62701-${1000 + int(r, 8999)}`,
  (r) => `${amt(r)} billed, ${amt(r)} allowed, ${amt(r)} owed`,
  (r) => `${amt(r)} ${amt(r)} ${amt(r)}`,
  (r) => `${pick(r, CPT)} ${pick(r, CPT)} ${pick(r, CPT)}`,
  (r) => `Visits ${1 + int(r, 30)} of ${30 + int(r, 30)} used, ${int(r, 30)} left`,
  (r) => `Appeal within ${pick(r, [30, 60, 90, 180])} days of ${date(r)}`,
  (r) => `NPI 1234567893 TIN 56-${digits(r, 7)}`,
  (r) => `Claim ${digits(r, 11)} ICN ${digits(r, 13)} Check ${digits(r, 9)}`,
  (r) => `Group ${digits(r, 6)} Policy ${digits(r, 3)}-${digits(r, 5)}-${digits(r, 2)}`,
  () => '29 CFR 2560.503-1 and 45 CFR 147.136',
  (r) => `Rev 0420 ${pick(r, CPT)} GP ${1 + int(r, 4)} ${amt(r)}`,
  (r) => `Line ${1 + int(r, 9)}: ${pick(r, CPT)} denied CO-${pick(r, [45, 97, 16, 50, 197])}`,
  () => 'Hours 8:00 a.m. to 5:00 p.m. Central, Monday through Friday',
  (r) => `Total ${amt(r)} Paid ${amt(r)} Patient responsibility ${amt(r)}`,
  (r) => `Deductible $${amt(r)} of $1,500.00 met; out-of-pocket $${amt(r)} of $6,000.00`,
  (r) => `Units billed ${1 + int(r, 8)}, allowed ${1 + int(r, 4)}, ${pick(r, CPT)}`,
  () => 'ICD-10 M54.5 M25.511 Z47.1',
  (r) => `Check ${digits(r, 9)} dated ${date(r)} for $${amt(r)}`,
  (r) => `Auth ${digits(r, 10)} valid ${date(r)}-${date(r)} for ${1 + int(r, 24)} visits`,
  (r) => `EFT trace ${digits(r, 15)} ${date(r)} ${amt(r)}`,
  (r) => `Page ${1 + int(r, 5)} of ${5 + int(r, 5)}`,
  (r) => `Ref ${digits(r, 3)}-${digits(r, 2)}-${digits(r, 6)} ${date(r)}`,
  (r) => `${1 + int(r, 4)} units ${pick(r, CPT)}, ${1 + int(r, 4)} unit ${pick(r, CPT)}`,
  (r) => `the claim form and ${2 + int(r, 30)} pages of records`,
  (r) => `Member Services ${pick(r, CPT)} ${pick(r, CPT)}`,
  (r) => `Benefit limit ${10 + int(r, 50)} visits per year, ${int(r, 30)} used as of ${date(r)}`,
  (r) => `Allowed ${amt(r)} at ${50 + int(r, 50)}% = ${amt(r)}; copay ${amt(r)}`,
];
const ord = (r: R) => pick(r, ORD)(r);
const LONG: G[] = [
  (r) => `ICN ${digits(r, 14)}.01`,
  (r) => `Claim Number: 2026${digits(r, 7)}.0${1 + int(r, 9)}`,
  (r) => `Claim ${digits(r, 12)}.${1 + int(r, 9)}`,
  (r) => `DCN ${digits(r, 13)}.01`,
  (r) => `Reference ${digits(r, 11)}.02`,
  (r) => `ICN ${digits(r, 9)}.01`,
  (r) => `Claim ${digits(r, 10)}.01`,
  (r) => `Invoice ${digits(r, 12)},50`,
  (r) => `Control Number ${digits(r, 17)}.1`,
  (r) => `Check ${digits(r, 9)}.00`,
];
const PW: G[] = [
  (r) => `Call us about CPT ${pick(r, CPT)} ${pick(r, CPT)}`,
  (r) => `Contact: Billing ${amt(r)} ${digits(r, 6)}`,
  () => 'TTY: 711',
  (r) => `Fax cover sheet: ${1 + int(r, 9)} pages, ${date(r)}`,
  (r) => `Questions? Call Member Services, ${ord(r)}`,
  (r) => `Telephone appeals are accepted within ${pick(r, [30, 60, 180])} days of ${date(r)}.`,
  (r) => `Phone hours ${1 + int(r, 9)}-${1 + int(r, 9)} weekdays; claims ${pick(r, CPT)} ${amt(r)}`,
  (r) => `Contact us regarding account ${digits(r, 3)}-${digits(r, 5)}`,
  (r) => `Fax confirmation number ${digits(r, 3)}-${digits(r, 3)}-${digits(r, 5)}`,
  (r) => `If you call, have claim ${digits(r, 11)}.0${1 + int(r, 9)} ready`,
  (r) => `Call reference ${digits(r, 12)}.${1 + int(r, 9)}`,
  (r) => `Telephone inquiry ${digits(r, 12)}.01 ${date(r)}`,
  (r) => `Contacted ${date(r)} ${amt(r)} ${amt(r)}`,
  (r) => `Mobile app version ${1 + int(r, 9)}.${int(r, 10)}.${int(r, 10)}`,
  (r) => `Fax ${1 + int(r, 9)} of ${10 + int(r, 9)}: ${ord(r)}`,
  (r) => `Call ${pick(r, CPT)} units ${1 + int(r, 8)} amount ${amt(r)}`,
];
const WORDS = ['Phone', 'Fax', 'Call', 'Contact', 'TTY', 'Cell', 'Tel', 'Telephone', 'Mobile', 'Toll-free', 'Contacts', 'Called', 'Telephone call', 'Phone number', 'Fax No.', 'SSN', 'Social Security'];
const MARKS = ['1: ', '1) ', '2) ', '(1) ', '(2) ', '1st: ', '(2nd) ', '2: ', '(3): '];
const NAMES = ['Jane Zephyra', 'JANE Q ZEPHYRA', 'Ms. Zephyra', 'Zephyra, Jane', 'Jane Q. Zephyra'];
const IDS = [...NAMES, ...NAMES, 'claim SYNCLAIM0001', 'member ZZ7654321', 'SYNCLAIM0001'];
const HELDL: G[] = [(r) => `Service ${date(r)}-${amt(r)} Paid`, (r) => `${date(r)}-$${amt(r)}`, (r) => `$${amt(r)}-${amt(r)}`];
const GLUED: G[] = [
  (r) => `${date(r)}-${digits(r, 14)}.01`,
  (r) => `ICN ${digits(r, 14)}.01-${date(r)}`,
  (r) => `$${amt(r)}-${digits(r, 12)}.34`,
  (r) => `Claim ${digits(r, 11)}.01-${digits(r, 11)}.04`,
  (r) => `Claim 2026${digits(r, 7)}.01-$${amt(r)}`,
  (r) => `${date(r)} - ${digits(r, 13)}.01`,
  (r) => `ICN ${digits(r, 13)}.01–${date(r)}`,
];
const OWN: G[] = [
  (r) => `Patient: ${pick(r, NAMES)}`,
  () => 'DOB: 03/14/1980',
  () => 'Appeal by March 14, 2026',
  () => 'Reply before Mar 14 or call',
  (r) => `Claim SYNCLAIM0001 ${pick(r, CPT)} ${amt(r)}`,
  () => 'Member ID ZZ7654321',
  (r) => `Dear ${pick(r, NAMES)},`,
  (r) => `Visit 3/14 ${pick(r, CPT)} ${amt(r)}`,
  () => 'Room 314, Suite 1980',
  () => 'Batch 0314 item 80',
];
const FRESH: G[] = [
  (r) => `Call ${pick(r, NAMES)} at 555-01${two(int(r, 100))}`,
  (r) => `Phone 1: 555-01${two(int(r, 100))}`,
  (r) => `Fax (2) 202-555-01${two(int(r, 100))}`,
  (r) => `Contact ${pick(r, NAMES)}, 202.555.01${two(int(r, 100))}`,
  (r) => `Phone ${pick(r, NAMES)}\n555-01${two(int(r, 100))}`,
];
const compose = (r: R, variants: string[][]): string[] => {
  const n = (variants[0] as string[]).length;
  const perm = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i -= 1) { const j = int(r, i + 1); const t = perm[i] as number; perm[i] = perm[j] as number; perm[j] = t; }
  const join = pick(r, ['\n', '\n', '\n', '\r\n', '\n\n', ' ', '  ']);
  return variants.map((parts) => perm.map((k) => parts[k] as string).join(join));
};
const some = (r: R, pool: G[], lo: number, hi: number) => Array.from({ length: lo + int(r, hi - lo + 1) }, () => pick(r, pool)(r));
const one = (r: R, parts: string[]): L => ({ text: compose(r, [parts])[0] as string });
const SW = ['Claim', 'ICN', 'Account', 'Policy', 'Statement', 'Remittance Advice', 'File', 'Phone', 'Fax', 'Call', 'Contact', 'Medicare', 'Number', 'No.', 'ID', 'Jan', 'May', 'March', 'Paid', 'Service', 'Line', 'Table', 'Ref', 'Total', 'rate', 'units', 'Jane Zephyra', 'SYNCLAIM0001', 'Check', 'Group', 'Member', 'Web ID', 'Seen', 'Sec.', 'Items', 'Visit', 'Auth', 'Page', 'Date', 'DOS', 'Billed', 'ERA'];
const SG = ['', ' ', ' ', ' ', '-', '-', '/', '.', '.', ', ', '\n', '\n\n', ': ', ' (', ') ', '|', '_', '#', ' - ', '  ', ' $', '~'];
const SL = [1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 7, 8, 9, 10, 11, 11, 12, 13, 14];
const MOTIF: G[] = [
  (r) => { const j = pick(r, ['/', '/', '-', '.', '|', '_']); return `${1 + int(r, 12)}${j}${1 + int(r, 28)}${j}${pick(r, ['2026', '2020', '1999', '26'])}`; },
  (r) => { const j = pick(r, ['/', '-', '.']); return `${two(1 + int(r, 12))}${j}${two(1 + int(r, 28))}${j}${pick(r, ['2026', '2020'])}`; },
  (r) => { const j = pick(r, ['-', '/']); return `${pick(r, ['2026', '2020'])}${j}${1 + int(r, 12)}${j}${1 + int(r, 28)}`; },
  (r) => pick(r, ['2026', '2020', '1999']),
  (r) => `.${two(int(r, 100))}`,
  (r) => pick(r, ['-Jan-', ' Jan ', 'Jan', ' May ', '-MAR-', ' Sep ', 'Sept. ']),
  (r) => `(${digits(r, 3)}) `,
  (r) => pick(r, [' on file ', ' on-file: ', ' on\nfile ']),
  (r) => amt(r),
  (r) => `$${amt(r)}`,
  (r) => pick(r, ['Phone 1: ', 'Fax 2) ', 'Call (1) ', 'Contact 1: ']),
  (r) => pick(r, ['\n-----\n', '\n=====\n', '\n\n', ':\n\n', '\n_____\n']),
];
const soup = (r: R): L => {
  let s = '';
  const k = 4 + int(r, 8);
  for (let i = 0; i < k; i += 1) {
    const t = r();
    if (t < 0.28) s += `${s !== '' && !/\s$/u.test(s) && r() < 0.8 ? ' ' : ''}${pick(r, SW)}${pick(r, [' ', ' ', ': ', '\n', ' #', ''])}`;
    else if (t < 0.5) s += pick(r, MOTIF)(r);
    else s += `${digits(r, pick(r, SL), r() < 0.8)}${pick(r, SG)}`;
  }
  return { text: s.trim() };
};
const FAM: [string, (r: R) => L][] = [
  ['A1a long-run decimal reference + ordinary lines', (r) => one(r, [pick(r, LONG)(r), ...some(r, ORD, 1, 3)])],
  ['A1b long-run decimal reference + phone-word ordinary lines', (r) => one(r, [pick(r, LONG)(r), ...some(r, PW, 1, 2), ...some(r, ORD, 0, 2)])],
  ['A1c label + list number + ordinary content', (r) => {
    const word = pick(r, WORDS); const mark = pick(r, MARKS); const content = ord(r);
    const rest = [...some(r, ORD, 0, 2), ...(r() < 0.4 ? [pick(r, LONG)(r)] : [])];
    const t = compose(r, [[`${word} ${mark}${content}`, ...rest], [`${word} ${content}`, ...rest], [`${word} ${mark.replace(/[0-9]+(?:st|nd|rd|th)?/u, '')}${content}`, ...rest]]);
    return { text: t[0] as string, without: [t[1] as string, t[2] as string] };
  }],
  ['A1d label + own identifier + ordinary content', (r) => {
    const word = pick(r, WORDS); const id = pick(r, IDS); const sep = pick(r, [', ', ' ', ': ', ' at ', ' re ', '\n', ' - ', ' (home) ']); const content = ord(r);
    const rest = [...some(r, ORD, 0, 2), ...(r() < 0.4 ? [pick(r, LONG)(r)] : [])];
    const t = compose(r, [[`${word} ${id}${sep}${content}`, ...rest], [`${word}${sep}${content}`, ...rest], [`${word} ${content}`, ...rest]]);
    return { text: t[0] as string, without: [t[1] as string, t[2] as string] };
  }],
  ['A1e held range + a trigger + ordinary lines', (r) => {
    const trig = [pick(r, LONG)(r), `${pick(r, WORDS)} ${pick(r, MARKS)}${ord(r)}`, `${pick(r, WORDS)} ${pick(r, IDS)}, ${ord(r)}`][int(r, 3)] as string;
    return one(r, [pick(r, HELDL)(r), trig, ...some(r, ORD, 0, 2)]);
  }],
  ['A1f long-run decimal glued in a range + own-identifier lines', (r) => one(r, [pick(r, GLUED)(r), ...some(r, OWN, 1, 2), ...some(r, ORD, 0, 2)])],
  ['A1g label + own name + a range of two kinds + own-identifier lines', (r) => one(r, [`${pick(r, WORDS)} ${pick(r, NAMES)} ${date(r)}-${amt(r)}`, ...some(r, OWN, 1, 2), ...some(r, ORD, 0, 2)])],
  ['A1h a number only the new label reading takes + long-run decimal + ordinary lines', (r) => one(r, [pick(r, FRESH)(r), pick(r, LONG)(r), ...some(r, ORD, 0, 2), ...some(r, PW, 0, 1)])],
  ['S token soup', soup],
];
for (const [name, gen] of FAM) {
  if (only !== '' && !name.startsWith(only)) continue;
  let h0 = 0;
  for (const ch of name) h0 = (Math.imul(h0, 31) + ch.charCodeAt(0)) >>> 0;
  const r = rng((seed * 1000003 + h0) >>> 0);
  const n = name.startsWith('S ') ? N * 2 : N;
  const c = { baseSends: 0, second: 0, changed: 0, refused: 0, altered: 0, f1: 0, fresh: 0, older: 0, thrown: 0 };
  const pairs: Record<string, number> = {};
  const exF1: string[] = []; const exNew: string[] = [];
  const t0 = Date.now();
  for (let i = 0; i < n; i += 1) {
    const l = gen(r);
    const b = out('base', l.text);
    if (b === 'REFUSED') continue;
    c.baseSends += 1;
    const g = { second: 0, diff: [] as string[] };
    (globalThis as any).__h2 = g;
    const h = out('v0', l.text);
    if (g.second > 0) c.second += 1;
    if (g.diff.length > 0) { c.changed += 1; for (const d of g.diff) pairs[d] = (pairs[d] ?? 0) + 1; }
    if (h.startsWith('THROW') || b.startsWith('THROW')) c.thrown += 1;
    if (h === b) continue;
    const real = out('head', l.text);
    if (real !== h) console.log(`!! the instrumented copy differs from head on ${JSON.stringify(l.text)}`);
    const bf = out('before', l.text); const v1 = out('v1', l.text); const v2 = out('v2', l.text);
    if (h === 'REFUSED') c.refused += 1; else c.altered += 1;
    const isF1 = h === 'REFUSED' && v1 !== 'REFUSED';
    const isNew = !isF1 && bf === b;
    if (!isF1 && !isNew) { c.older += 1; continue; }
    const without = (l.without ?? []).map((w) => out('base', w));
    const line = `${JSON.stringify(l.text)}\n        head: ${h} | before: ${bf} | base: ${b} | head, no 2nd reading: ${v1} | head, long runs no amount when loose: ${v2}${without.length > 0 ? ` | base without the list number or identifier: ${without.join(' / ')}` : ''}${g.diff.length > 0 ? ` | 2nd reading: ${g.diff.join(',')}` : ''}`.slice(0, 900);
    if (isF1) { c.f1 += 1; if (exF1.length < 3) exF1.push(line); } else { c.fresh += 1; if (exNew.length < (name.startsWith('S ') ? 8 : 2)) exNew.push(line); }
  }
  const pct = (k: number) => `${k} (${((100 * k) / Math.max(1, c.baseSends)).toFixed(2)}%)`;
  console.log(`\n## ${name}: ${n} letters, base sends ${c.baseSends}; 2nd reading ran on ${pct(c.second)}, changed the scan's answer on ${c.changed} ${JSON.stringify(pairs)}; head refuses ${pct(c.refused)}, sends other text ${c.altered}; refused ONLY by the 2nd reading ${pct(c.f1)}; other differences new this round ${pct(c.fresh)}, older ${c.older}; throws ${c.thrown}  [${Date.now() - t0}ms]`);
  for (const e of exF1) console.log('  2ND ' + e);
  for (const e of exNew) console.log('  NEW ' + e);
}
